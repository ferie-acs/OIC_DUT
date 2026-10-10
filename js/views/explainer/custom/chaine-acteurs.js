import {
  slab, ribbon, box, project, defs, groundPlane, ISO_ORIGIN, ISO_SCALE,
} from '../iso/iso.js';
import { partnerYard, oicBranch, depthOf } from '../iso/buildings.js';

/**
 * Scène 2.3 — la soumission du dossier : du partenaire vers l'antenne OIC.
 *
 * Sert aussi de planche de vocabulaire : c'est ici qu'on voit à quoi
 * ressemblent les deux premiers acteurs de la chaîne.
 */
export const id = 'chaine-acteurs';

const S = ISO_SCALE;

/** Dossier DUT : une carte posée à plat, avec son liseré et ses lignes. */
function dossier({ x, y, z = 0.12 }) {
  const lines = [];
  for (let i = 0; i < 3; i += 1) {
    const [ax, ay] = project(x + 0.25, y + 0.42 + i * 0.26, z + 0.01, S);
    const [bx, by] = project(x + 1.15, y + 0.42 + i * 0.26, z + 0.01, S);
    lines.push(`<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="#AEBCD1" stroke-width="2.2" stroke-linecap="round"/>`);
  }
  return box({ x, y, z, w: 1.4, d: 1.1, h: 0.08, tone: 'white' }, S)
    + box({ x, y, z: z + 0.08, w: 1.4, d: 0.16, h: 0.02, tone: 'accent', shadow: false }, S)
    + lines.join('');
}

function compose() {
  const layers = [];
  const push = (depth, markup) => layers.push({ depth, markup });

  push(-999, groundPlane());

  const partenaire = { x: -9.4, y: -2.0, w: 6.6, d: 4.4 };
  const antenne = { x: 3.0, y: -2.0, w: 5.4, d: 4.2 };

  push(depthOf(partenaire), partnerYard({ x: partenaire.x, y: partenaire.y, id: 'iso-partenaire' }));
  push(depthOf(antenne), oicBranch({ x: antenne.x, y: antenne.y, id: 'iso-antenne' }));

  // Voie de liaison, devant les deux bâtiments.
  push(2.4, slab({ x: -10.0, y: 2.9, w: 19.4, d: 1.9, fill: '#DCE4EF', id: 'iso-voie' }, S));
  push(2.5, ribbon({
    pts: [[-7.0, 3.85], [5.4, 3.85]], color: '#F17D0C', width: 13, id: 'iso-ruban',
  }, S));

  push(3.2, `<g id="iso-dossier">${dossier({ x: -7.5, y: 3.3 })}</g>`);

  layers.sort((a, b) => a.depth - b.depth);
  return defs() + layers.map((l) => l.markup).join('');
}

export function build(scene, doc) {
  const el = doc.createElement('div');
  el.className = 'sc-custom sc-iso';
  el.innerHTML = '<svg class="sc-iso-svg" viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg">'
    + `<g transform="translate(${ISO_ORIGIN.x} ${ISO_ORIGIN.y})">${compose()}</g>`
    + '</svg>';
  return el;
}

export function animate(tl, el, scene, offsetMs) {
  const q = (sel) => (typeof el.querySelector === 'function' ? el.querySelector(sel) : null);
  const add = (target, props, at) => { if (target) tl.add(target, props, at); };

  add(q('#iso-ground'), { opacity: [0, 1], duration: 600 }, offsetMs);
  add(q('#iso-ground-inner'), { opacity: [0, 1], duration: 600 }, offsetMs + 100);
  add(q('#iso-partenaire'), { opacity: [0, 1], translateY: [-30, 0], duration: 650 }, offsetMs + 300);
  add(q('#iso-antenne'), { opacity: [0, 1], translateY: [-30, 0], duration: 650 }, offsetMs + 650);
  add(q('#iso-voie'), { opacity: [0, 1], duration: 500 }, offsetMs + 1000);
  add(q('#iso-ruban'), { opacity: [0, 1], duration: 700 }, offsetMs + 1200);

  // Le dossier quitte le partenaire et rejoint l'antenne.
  const [dx, dy] = project(12.4, 0, 0, S);
  add(q('#iso-dossier'), { opacity: [0, 1], scale: [0.7, 1], duration: 450 }, offsetMs + 1600);
  add(q('#iso-dossier'), {
    translateX: [0, dx], translateY: [0, dy], duration: 3600, ease: 'inOut(2)',
  }, offsetMs + 2100);
}
