/**
 * Export MP4 déterministe de la vue #/decouvrir.
 *
 * Les fichiers produits sont AUTONOMES : un .mp4 ordinaire, lisible dans
 * n'importe quel lecteur, envoyable par mail, projetable. Il ne dépend ni du
 * POC, ni d'un serveur, ni d'un navigateur.
 *
 * Le rendu n'enregistre pas la page en temps réel — ce qui perdrait des images
 * sur les scènes chargées. Il pilote le temps virtuel image par image :
 * seek(frame / fps * 1000), capture de `.scene-stage` seul, assemblage ffmpeg.
 *
 * Usage (un serveur doit servir le dépôt) :
 *   node render.mjs --chapter ch3 --port 8080
 *   node render.mjs --all --port 8080 [--no-subtitles]
 */
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { chromium } from 'playwright';

const FPS = 25;
const WIDTH = 1920;
const HEIGHT = 1080;
const REPO_ROOT = resolvePath(import.meta.dirname, '..', '..');
const OUT_DIR = resolvePath(REPO_ROOT, 'output/video');
const TEASER_PIVOT = { chapterId: 'ch3', sceneId: '3.4' };

function parseArgs(argv) {
  const args = { chapter: null, all: false, port: 8080, subtitles: true };
  for (let i = 2; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--all') args.all = true;
    else if (flag === '--no-subtitles') args.subtitles = false;
    else if (flag === '--chapter') { args.chapter = argv[i + 1]; i += 1; }
    else if (flag === '--port') { args.port = Number(argv[i + 1]); i += 1; }
  }
  return args;
}

function requireFfmpeg() {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'pipe' });
  } catch {
    console.error([
      'ffmpeg est introuvable.',
      'Installation : brew install ffmpeg',
      'Aucune image n’a été rendue.',
    ].join('\n'));
    process.exit(1);
  }
}

async function requireServer(port) {
  try {
    const response = await fetch(`http://localhost:${port}/index.html`);
    if (!response.ok) throw new Error(String(response.status));
  } catch {
    console.error([
      `Aucun serveur ne répond sur le port ${port}.`,
      'Lancer depuis la racine du dépôt : python3 -m http.server 8080',
      'Aucune image n’a été rendue.',
    ].join('\n'));
    process.exit(1);
  }
}

/**
 * Ouvre une page authentifiée sur un chapitre, en mode export.
 *
 * L'application exige une session. On charge donc d'abord la racine — ce qui
 * ensemence les données de démonstration — puis on écrit la session du premier
 * utilisateur ensemencé. Valeurs de démonstration du projet, hôte local
 * uniquement.
 */
async function openChapter(browser, chapterId, port, subtitles) {
  // Fenetre un peu plus haute que la scene pour qu'elle tienne entierement
  // dans le viewport, echelle 1, sans que rien ne la rogne.
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT + 160 } });
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
  await page.waitForFunction("localStorage.getItem('dut_users') !== null", { timeout: 30000 });
  await page.evaluate(() => {
    const users = JSON.parse(localStorage.getItem('dut_users') || '[]');
    const user = users.find((u) => u.active !== false) || users[0];
    localStorage.setItem('dut_current_user', JSON.stringify({
      id: user.id, accessVersion: user.accessVersion || 0,
    }));
  });

  if (!subtitles) {
    await page.addStyleTag({ content: '.sc-subtitle { display: none !important; }' });
  }

  await page.goto(`http://localhost:${port}/?render=1&chapitre=${chapterId}#/decouvrir`, { waitUntil: 'load' });
  if (!subtitles) {
    await page.addStyleTag({ content: '.sc-subtitle { display: none !important; }' });
  }
  await page.waitForFunction('window.__explainer && window.__explainer.ready === true', { timeout: 60000 });
  return page;
}

/**
 * Assemble la piste audio d'un chapitre depuis les pistes par scène.
 *
 * Il n'existe pas de piste par chapitre : chaque scène narrée a la sienne, et
 * la politique de plancher laisse du silence après chacune. On décale donc
 * chaque piste à son instant de début (`adelay`), on les mélange (`amix`) et on
 * complète jusqu'à la durée exacte du chapitre (`apad` + `-t`).
 */
function buildChapterAudio(cues, durationMs, target) {
  const present = cues.filter((cue) => existsSync(resolvePath(REPO_ROOT, `audio/explainer/${cue.sceneId}.m4a`)));
  const seconds = (durationMs / 1000).toFixed(3);

  if (!present.length) {
    execFileSync('ffmpeg', [
      '-y', '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
      '-t', seconds, '-c:a', 'aac', '-b:a', '160k', target,
    ], { stdio: 'pipe' });
    return { target, voiceCount: 0 };
  }

  const inputs = present.flatMap((cue) => ['-i', resolvePath(REPO_ROOT, `audio/explainer/${cue.sceneId}.m4a`)]);
  const delays = present
    .map((cue, index) => `[${index}:a]adelay=${Math.round(cue.start)}|${Math.round(cue.start)}[d${index}]`)
    .join(';');
  const mixInputs = present.map((_, index) => `[d${index}]`).join('');
  const filter = `${delays};${mixInputs}amix=inputs=${present.length}:normalize=0:dropout_transition=0[mixed];[mixed]apad[out]`;

  execFileSync('ffmpeg', [
    '-y', ...inputs,
    '-filter_complex', filter, '-map', '[out]',
    '-t', seconds, '-c:a', 'aac', '-b:a', '160k', target,
  ], { stdio: 'pipe' });

  return { target, voiceCount: present.length };
}

async function renderChapter(browser, chapterId, port, subtitles) {
  const page = await openChapter(browser, chapterId, port, subtitles);
  const duration = await page.evaluate('window.__explainer.duration');
  const cues = await page.evaluate('window.__explainer.cues');
  const frames = Math.ceil((duration / 1000) * FPS);
  const stage = page.locator('.scene-stage');

  mkdirSync(OUT_DIR, { recursive: true });
  const audioPath = resolvePath(OUT_DIR, `${chapterId}.audio.m4a`);
  const { voiceCount } = buildChapterAudio(cues, duration, audioPath);
  const videoPath = resolvePath(OUT_DIR, `${chapterId}.mp4`);

  console.log(`${chapterId} : ${frames} images, ${(duration / 1000).toFixed(1)} s, ${voiceCount} piste(s) de voix`);

  const ffmpeg = spawn('ffmpeg', [
    '-y',
    '-f', 'image2pipe', '-framerate', String(FPS), '-i', 'pipe:0',
    '-i', audioPath,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium',
    '-c:a', 'aac', '-shortest', '-movflags', '+faststart',
    videoPath,
  ], { stdio: ['pipe', 'ignore', 'pipe'] });

  let ffmpegError = '';
  ffmpeg.stderr.on('data', (chunk) => { ffmpegError += chunk.toString(); });

  for (let frame = 0; frame < frames; frame += 1) {
    await page.evaluate((ms) => window.__explainer.seek(ms), (frame / FPS) * 1000);
    const shot = await stage.screenshot({ type: 'png' });
    if (!ffmpeg.stdin.write(shot)) {
      await new Promise((done) => ffmpeg.stdin.once('drain', done));
    }
    if (frame % 250 === 0) console.log(`  ${chapterId} ${frame}/${frames}`);
  }

  ffmpeg.stdin.end();
  const code = await new Promise((done) => ffmpeg.on('close', done));
  await page.close();

  if (code !== 0) {
    console.error(`ffmpeg a échoué sur ${chapterId} (code ${code}) :\n${ffmpegError.split('\n').slice(-6).join('\n')}`);
    process.exit(1);
  }
  rmSync(audioPath, { force: true });
  console.log(`  → ${videoPath}`);
  return videoPath;
}

function concatenate(parts, target, label) {
  const listPath = resolvePath(OUT_DIR, `${label}.txt`);
  writeFileSync(listPath, parts.map((p) => `file '${p}'`).join('\n'), 'utf8');
  execFileSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', target], { stdio: 'pipe' });
  rmSync(listPath, { force: true });
  console.log(`  → ${target}`);
}

/** Teaser : chapitre 1 entier, puis la seule scène pivot du chapitre 3. */
async function renderTeaser(browser, port, subtitles) {
  const page = await openChapter(browser, TEASER_PIVOT.chapterId, port, subtitles);
  const cues = await page.evaluate('window.__explainer.cues');
  await page.close();

  const pivot = cues.find((cue) => cue.sceneId === TEASER_PIVOT.sceneId);
  if (!pivot) {
    console.error(`Scène pivot ${TEASER_PIVOT.sceneId} introuvable : teaser non produit.`);
    return;
  }
  const pivotPath = resolvePath(OUT_DIR, 'teaser-pivot.mp4');
  execFileSync('ffmpeg', [
    '-y', '-ss', (pivot.start / 1000).toFixed(3), '-to', (pivot.end / 1000).toFixed(3),
    '-i', resolvePath(OUT_DIR, `${TEASER_PIVOT.chapterId}.mp4`),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-c:a', 'aac', pivotPath,
  ], { stdio: 'pipe' });

  concatenate([resolvePath(OUT_DIR, 'ch1.mp4'), pivotPath], resolvePath(OUT_DIR, 'teaser.mp4'), 'teaser');
  rmSync(pivotPath, { force: true });
}

async function main() {
  const args = parseArgs(process.argv);
  requireFfmpeg();
  await requireServer(args.port);

  if (!args.all && !args.chapter) {
    console.error('Préciser --chapter <id> ou --all.');
    process.exit(1);
  }

  const browser = await chromium.launch();
  try {
    if (args.chapter) {
      await renderChapter(browser, args.chapter, args.port, args.subtitles);
    } else {
      const ids = ['ch1', 'ch2', 'ch3', 'ch4', 'ch5'];
      const parts = [];
      for (const id of ids) parts.push(await renderChapter(browser, id, args.port, args.subtitles));
      concatenate(parts, resolvePath(OUT_DIR, 'principal.mp4'), 'principal');
      await renderTeaser(browser, args.port, args.subtitles);
    }
  } finally {
    await browser.close();
  }
  console.log('\nTerminé. Les .mp4 de output/video/ sont autonomes : aucun besoin du POC pour les lire.');
}

main();
