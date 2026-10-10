/**
 * Génère la voix off (une piste par scène parlée) et MESURE la durée réelle de
 * chaque fichier, qu'il écrit dans js/data/storyboard.timing.json.
 *
 * Les durées ne sont jamais devinées. C'est ce qui rend la voix substituable :
 * pour passer à une voix humaine, déposer les fichiers enregistrés sous
 * audio/explainer/<sceneId>.m4a et relancer avec --measure-only. Le script
 * mesure les fichiers existants sans les regénérer, réécrit les timecodes, et
 * l'animation se recale seule.
 *
 * Lancements :
 *   node --experimental-default-type=module scripts/tts.mjs
 *   node --experimental-default-type=module scripts/tts.mjs --measure-only
 *   EXPLAINER_VOICE=Amelie node --experimental-default-type=module scripts/tts.mjs
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { storyboard } from '../js/data/storyboard.js';

const VOICE = process.env.EXPLAINER_VOICE || 'Jacques';
const OUT_DIR = 'audio/explainer';
const TIMING_FILE = 'js/data/storyboard.timing.json';
const DRIFT_WARN_PERCENT = 20;

/** Un segment de voix par scène parlée ; les cartons de titre restent muets. */
export function planTtsSegments(board) {
  const segments = [];
  for (const chapter of board.chapters) {
    for (const scene of chapter.scenes) {
      if (!scene.narration) continue;
      segments.push({
        chapterId: chapter.id,
        sceneId: scene.id,
        text: scene.narration,
        target: scene.duration,
        out: `${OUT_DIR}/${scene.id}.m4a`,
      });
    }
  }
  return segments;
}

/** Extrait la durée en millisecondes de la sortie d'`afinfo`. */
export function parseAfinfoDuration(output) {
  const match = /estimated duration:\s*([\d.]+)\s*sec/i.exec(String(output ?? ''));
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) ? Math.round(seconds * 1000) : null;
}

function requireTool(binary, hint) {
  try {
    execFileSync('which', [binary], { stdio: 'pipe' });
  } catch {
    console.error(`Outil manquant : ${binary}\n${hint}`);
    process.exit(1);
  }
}

function main() {
  const measureOnly = process.argv.includes('--measure-only');

  requireTool('afinfo', 'Commande macOS « afinfo » introuvable — ce script nécessite macOS.');
  if (!measureOnly) {
    requireTool('say', 'Commande macOS « say » introuvable — ce script nécessite macOS.');
  }

  mkdirSync(OUT_DIR, { recursive: true });

  const timings = {};
  const drifting = [];

  for (const segment of planTtsSegments(storyboard)) {
    if (measureOnly && !existsSync(segment.out)) {
      console.error(`${segment.out} absent alors que --measure-only est demandé — déposer le fichier ou relancer sans l'option.`);
      process.exit(1);
    }
    if (!measureOnly) {
      execFileSync('say', ['-v', VOICE, '--data-format=aac', '-o', segment.out, segment.text]);
    }

    const duration = parseAfinfoDuration(execFileSync('afinfo', [segment.out], { encoding: 'utf8' }));
    if (duration === null) {
      console.error(`Durée illisible pour ${segment.out} — abandon plutôt que d'écrire un timing faux.`);
      process.exit(1);
    }

    timings[segment.sceneId] = duration;
    const drift = Math.round(((duration - segment.target) / segment.target) * 100);
    if (Math.abs(drift) > DRIFT_WARN_PERCENT) drifting.push({ ...segment, duration, drift });
    console.log(`${segment.sceneId.padEnd(5)} ${String(duration).padStart(6)} ms  (cible ${segment.target} ms, écart ${drift > 0 ? '+' : ''}${drift} %)`);
  }

  writeFileSync(TIMING_FILE, `${JSON.stringify(timings, null, 2)}\n`, 'utf8');
  console.log(`\n${Object.keys(timings).length} segments. ${TIMING_FILE} écrit.`);

  if (drifting.length) {
    console.log(`\n${drifting.length} scène(s) à plus de ${DRIFT_WARN_PERCENT} % de leur cible — c'est le TEXTE qu'il faut réécrire, pas le minutage :`);
    for (const item of drifting) {
      console.log(`  ${item.sceneId} : ${item.duration} ms contre ${item.target} ms visés (${item.drift > 0 ? '+' : ''}${item.drift} %)`);
    }
  }
}

if (process.argv[1] && process.argv[1].endsWith('tts.mjs')) main();
