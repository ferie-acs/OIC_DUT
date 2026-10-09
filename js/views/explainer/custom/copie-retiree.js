import {
  box, slab, project, defs, groundPlane, ISO_ORIGIN, ISO_SCALE,
} from '../iso/iso.js';
import { depthOf } from '../iso/buildings.js';

/**
 * Scène 3.4 — la copie et le verdict du système.
 *
 * Scène pivot : c'est elle qui démontre, sans un mot de technique, qu'une
 * reproduction parfaite du papier ne sert à rien. Elle est aussi la seconde
 * moitié du teaser, d'où le soin particulier.
 */
export const id = 'copie-retiree';

const S = ISO_SCALE;

function feuille({ x, y, dashed, qr = true }) {
  const lines = [];
  for (let i = 0; i < 3; i += 1) {
    const [ax, ay] = project(x + 0.3, y + 0.6 + i * 0.32, 0.17, S);
    const [bx, by] = project(x + 1.8, y + 0.6 + i * 0.32, 0.17, S);
    lines.push(`<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" `
      + `stroke="${dashed ? '#C9D4E3' : '#AEBCD1'}" stroke-width="2.8" stroke-linecap="round"/>`);
  }
  return box({ x, y, w: 2.2, d: 1.7, h: 0.16, tone: 'white' }, S)
    + box({ x, y, z: 0.16, w: 2.2, d: 0.22, h: 0.03, tone: dashed ? 'white' : 'accent', shadow: false }, S)
    + lines.join('')
    + (qr ? box({ x: x + 1.56, y: y + 1.1, z: 0.17, w: 0.5, d: 0.5, h: 0.03, tone: 'slate', shadow: false }, S) : '');
}

function compose() {
  const layers = [{ depth: -999, markup: groundPlane() }];

  const original = { x: -6.6, y: -1.0, w: 2.2, d: 1.7 };
  const copie = { x: -1.4, y: -1.0, w: 2.2, d: 1.7 };

  layers.push({
    depth: depthOf(original),
    markup: `<g id="iso-original">${feuille({ ...original, dashed: false })}</g>`,
  });
  layers.push({
    depth: depthOf(copie),
    markup: `<g id="iso-copie">${feuille({ ...copie, dashed: true })}</g>`,
  });

  // Faisceau de lecture au-dessus de la copie.
  const [bx, by] = project(copie.x + 1.8, copie.y + 1.35, 0.2, S);
  const [tx, ty] = project(copie.x + 1.8, copie.y + 1.35, 4.2, S);
  layers.push({
    depth: 100,
    markup: `<g id="iso-faisceau">`
      + `<polygon points="${tx.toFixed(1)},${ty.toFixed(1)} ${(bx - 26).toFixed(1)},${by.toFixed(1)} ${(bx + 26).toFixed(1)},${by.toFixed(1)}" fill="#F17D0C" opacity=".22"/>`
      + `<line x1="${tx.toFixed(1)}" y1="${ty.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="#F17D0C" stroke-width="3"/>`
      + '</g>',
  });

  // Verdict du système, posé à droite.
  const [vx, vy] = project(4.6, 0.2, 1.1, S);
  layers.push({
    depth: 200,
    markup: '<g id="iso-verdict">'
      + `<rect x="${(vx - 150).toFixed(1)}" y="${(vy - 54).toFixed(1)}" width="300" height="108" rx="16" fill="#E11D2E"/>`
      + `<text x="${vx.toFixed(1)}" y="${(vy + 20).toFixed(1)}" text-anchor="middle" `
      + 'font-family="Instrument Sans, system-ui, sans-serif" font-size="58" font-weight="700" '
      + 'letter-spacing="3" fill="#FFFFFF">RETIRÉ</text>'
      + '</g>',
  });

  layers.sort((a, b) => a.depth - b.depth);
  return defs() + layers.map((l) => l.markup).join('');
}

export function build(scene, doc) {
  const el = doc.createElement('div');
  el.className = 'sc-custom sc-iso';
  el.innerHTML = '<svg class="sc-iso-svg" viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg">'
    + `<g transform="translate(${ISO_ORIGIN.x - 60} ${ISO_ORIGIN.y - 30})">${compose()}</g>`
    + '</svg>';
  return el;
}

export function animate(tl, el, scene, offsetMs) {
  const q = (s) => (typeof el.querySelector === 'function' ? el.querySelector(s) : null);
  const add = (t, props, at) => { if (t) tl.add(t, props, at); };

  add(q('#iso-ground'), { opacity: [0, 1], duration: 600 }, offsetMs);
  add(q('#iso-ground-inner'), { opacity: [0, 1], duration: 600 }, offsetMs + 100);
  add(q('#iso-original'), { opacity: [0, 1], translateY: [-24, 0], duration: 520 }, offsetMs + 400);
  add(q('#iso-copie'), { opacity: [0, 1], translateY: [-24, 0], duration: 520 }, offsetMs + 2200);
  add(q('#iso-faisceau'), { opacity: [0, 1, 1, 0], duration: 2200 }, offsetMs + 4600);
  add(q('#iso-verdict'), { opacity: [0, 1], scale: [1.3, 1], duration: 620 }, offsetMs + 6600);
}
