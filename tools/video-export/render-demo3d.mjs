/**
 * Rendu de la démo 3D (demo-3d.html?render=1) — outil de développement.
 * Pilote le temps virtuel : seek(ms) puis capture de #stage (canvas + calque).
 *
 * Usage (un serveur doit servir le dépôt) :
 *   node render-demo3d.mjs --still 0,45000 --port 8080
 */
import { mkdirSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { chromium } from 'playwright';

const WIDTH = 1920;
const HEIGHT = 1080;
const REPO_ROOT = resolvePath(import.meta.dirname, '..', '..');
const OUT_DIR = resolvePath(REPO_ROOT, 'output/demo3d');

function parseArgs(argv) {
  const args = { port: 8080, stills: [], all: false, gl: null };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--port') args.port = Number(argv[++i]);
    else if (a === '--still') args.stills = argv[++i].split(',').map(Number);
    else if (a === '--all') args.all = true;
    else if (a === '--gl') args.gl = argv[++i];
    else throw new Error(`Argument inconnu : ${a}`);
  }
  if (!Number.isInteger(args.port)) throw new Error('--port invalide');
  if (args.stills.some((ms) => !Number.isFinite(ms))) throw new Error('--still : liste de millisecondes attendue');
  return args;
}

export async function openDemo({ port, gl }) {
  const launchArgs = gl ? [`--use-angle=${gl}`] : [];
  const browser = await chromium.launch({ args: launchArgs });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/demo-3d.html?render=1`);
  await page.waitForFunction(() => window.__demo3d?.ready === true, null, { timeout: 30000 }).catch(() => {
    throw new Error(`La démo n'est pas prête. Erreurs : ${errors.join(' | ') || 'aucune'}`);
  });
  const glInfo = await page.evaluate(() => {
    const ctx = document.getElementById('d3-canvas').getContext('webgl2');
    const ext = ctx?.getExtension('WEBGL_debug_renderer_info');
    return ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'inconnu';
  });
  console.log(`WebGL : ${glInfo}`);
  return { browser, page, errors };
}

export async function captureAt(page, ms, path) {
  await page.evaluate((t) => window.__demo3d.seek(t), ms);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.locator('#stage').screenshot({ path });
}

async function main() {
  const args = parseArgs(process.argv);
  mkdirSync(OUT_DIR, { recursive: true });
  const { browser, page, errors } = await openDemo(args);
  try {
    for (const ms of args.stills) {
      const path = resolvePath(OUT_DIR, `still-${String(ms).padStart(5, '0')}.png`);
      await captureAt(page, ms, path);
      console.log(`Image fixe : ${path}`);
    }
    if (errors.length) throw new Error(`Erreurs dans la page : ${errors.join(' | ')}`);
  } finally {
    await browser.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}
