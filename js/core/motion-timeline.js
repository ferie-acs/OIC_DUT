import { STAGE_PRIMITIVES } from '../views/explainer/stage/index.js';
import { prefersReducedMotion } from './motion.js';

/**
 * Construit le DOM des scènes d'un chapitre et, quand c'est possible, l'unique
 * timeline anime.js qui les pilote.
 *
 * Deux chemins, un seul résultat visible :
 *  - timeline disponible  : chaque élément est révélé par un tween, `seek(ms)`
 *    délègue à `timeline.seek(ms)` ;
 *  - timeline indisponible (anime.js absent, ou mouvement refusé par
 *    l'utilisateur) : rendu par paliers, `seek(ms)` révèle d'un coup la scène
 *    dont la fenêtre contient `ms`.
 */

function reducedMotion() {
  try { return prefersReducedMotion(); } catch { return false; }
}

function canAnimate() {
  return !!(globalThis.window && globalThis.window.anime) && !reducedMotion();
}

/** Durée effective d'une scène : mesurée si disponible, cible du storyboard sinon. */
function effectiveDuration(scene, timings) {
  const measured = Number(timings && timings[scene.id]);
  return Number.isFinite(measured) && measured > 0 ? measured : scene.duration;
}

export function buildChapter(chapter, { doc, root, timings = {} }) {
  const timeline = canAnimate()
    ? globalThis.window.anime.createTimeline({ autoplay: false, defaults: { ease: 'out(3)' } })
    : null;

  const windows = [];
  let offset = 0;

  for (const scene of chapter.scenes) {
    const duration = effectiveDuration(scene, timings);
    const container = doc.createElement('div');
    container.className = 'sc-scene';
    container.dataset.sceneId = scene.id;
    root.appendChild(container);
    windows.push({ sceneId: scene.id, container, start: offset, end: offset + duration });

    for (const spec of scene.stage || []) {
      const primitive = STAGE_PRIMITIVES[spec.kind];
      if (!primitive) continue;
      const el = primitive.build(spec, doc);
      container.appendChild(el);
      if (timeline) primitive.animate(timeline, el, spec, offset);
    }

    if (timeline) {
      timeline.add(container, { opacity: [0, 1], duration: 300 }, offset);
      timeline.add(container, { opacity: [1, 0], duration: 300 }, offset + duration - 300);
    }
    offset += duration;
  }

  function applyStepped(ms) {
    if (!windows.length) return;
    const clamped = Math.min(Math.max(ms, 0), Math.max(offset - 1, 0));
    const current = windows.find((w) => clamped >= w.start && clamped < w.end) || windows[windows.length - 1];
    for (const w of windows) {
      w.container.className = w === current ? 'sc-scene is-active' : 'sc-scene';
    }
  }

  function seek(ms) {
    const value = Number.isFinite(ms) ? ms : 0;
    if (timeline) { timeline.seek(Math.min(Math.max(value, 0), offset)); return; }
    applyStepped(value);
  }

  if (!timeline) applyStepped(0);

  return { timeline, seek, stepped: !timeline, duration: offset };
}
