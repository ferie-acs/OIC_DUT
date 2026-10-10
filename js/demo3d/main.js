/** Démarrage de la démo : scène, monde, calque, puis lecture ou mode rendu (?render=1). */
import { stateAt } from './timeline.js';
import { TOTAL_MS } from './scenario.js';
import { createStage } from './stage.js';
import { buildWorld } from './world/build.js';
import { createOverlay } from './overlay/overlay.js';
import { applyState } from './apply.js';
import { startPlayer } from './player.js';

const RENDER_MODE = new URLSearchParams(window.location.search).has('render');

function showFallback() {
  document.getElementById('d3-fallback').hidden = false;
  document.getElementById('d3-controls').hidden = true;
}

async function boot() {
  // Les textures de texte (livrées, enseignes) exigent la police chargée.
  await Promise.all([
    document.fonts.load('700 74px "Instrument Sans"'),
    document.fonts.load('600 16px "Instrument Sans"'),
  ]);
  const stageEl = document.getElementById('stage');
  const stage = createStage(document.getElementById('d3-canvas'), { preserveDrawingBuffer: RENDER_MODE });
  if (!stage) { showFallback(); return; }
  const world = await buildWorld(stage.scene);
  const overlay = createOverlay(stageEl);
  const renderAt = (ms) => {
    const s = stateAt(ms);
    applyState(world, stage, s);
    stage.render();
    overlay.update(s, world, stage);
  };
  renderAt(0);
  if (RENDER_MODE) {
    document.documentElement.classList.add('d3-render');
    window.__demo3d = Object.freeze({ seek: renderAt, duration: TOTAL_MS, ready: true });
  } else {
    startPlayer({ renderAt, duration: TOTAL_MS, button: document.getElementById('d3-play') });
  }
}

boot().catch((err) => {
  console.error('[demo3d]', err);
  showFallback();
});
