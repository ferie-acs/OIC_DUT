import { STAGE_PRIMITIVES } from '../views/explainer/stage/index.js';
import { CUSTOM_SCENES } from '../views/explainer/custom/index.js';
import { groundPlane, ISO_ORIGIN } from '../views/explainer/iso/iso.js';
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
    // `has-screen` bascule la mise en page : les pictos deviennent les puces de
    // la colonne de gauche quand un ecran occupe la droite du cadre.
    const hasScreen = (scene.stage || []).some((item) => item.kind === 'screen');
    const isCover = scene.kindOfScene === 'title-card';

    const container = doc.createElement('div');
    container.className = `sc-scene${hasScreen ? ' has-screen' : ''}`;
    container.dataset.sceneId = scene.id;
    root.appendChild(container);
    windows.push({
      sceneId: scene.id, container, start: offset, end: offset + duration, isCover,
    });

    if (scene.custom) {
      const custom = CUSTOM_SCENES[scene.custom];
      if (custom) {
        const el = custom.build(scene, doc);
        container.appendChild(el);
        if (timeline) custom.animate(timeline, el, scene, offset);
      }
    }

    // Les objets du monde (acteur, document, flux) sont des volumes
    // isometriques dessines dans un calque SVG commun ; les textes et les
    // captures restent des panneaux plats par-dessus, comme dans la reference.
    const needsIso = (scene.stage || []).some((item) => STAGE_PRIMITIVES[item.kind]?.isometric);
    let isoLayer = null;
    if (needsIso) {
      isoLayer = doc.createElementNS
        ? doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
        : doc.createElement('svg');
      isoLayer.setAttribute('class', 'sc-iso-svg');
      isoLayer.setAttribute('viewBox', '0 0 1920 1080');
      isoLayer.innerHTML = `<g transform="translate(${ISO_ORIGIN.x} ${ISO_ORIGIN.y})">${groundPlane()}</g>`;
      container.appendChild(isoLayer);
    }
    const isoRoot = isoLayer && isoLayer.querySelector ? isoLayer.querySelector('g') : null;

    for (const spec of scene.stage || []) {
      const primitive = STAGE_PRIMITIVES[spec.kind];
      if (!primitive) continue;
      const el = primitive.build(spec, doc, isoRoot);
      if (el && !primitive.isometric) container.appendChild(el);
      if (timeline && el) primitive.animate(timeline, el, spec, offset);
    }

    if (timeline) {
      // Fondu CROISÉ : l'entrée commence 300 ms avant la fin de la scène
      // précédente. Sans ce recouvrement, le fondu sortant et le fondu
      // entrant se succédaient sans se toucher et laissaient un creux vide
      // à chaque transition — vingt-six fois sur le film.
      timeline.add(container, { opacity: [0, 1], duration: 300 }, Math.max(0, offset - 300));
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

  /** Fenetre de scene contenant `ms`, pour que la vue sache ce qui est a l'ecran. */
  function sceneAt(ms) {
    if (!windows.length) return null;
    const clamped = Math.min(Math.max(ms, 0), Math.max(offset - 1, 0));
    return windows.find((w) => clamped >= w.start && clamped < w.end) || windows[windows.length - 1];
  }

  return { timeline, seek, sceneAt, stepped: !timeline, duration: offset };
}
