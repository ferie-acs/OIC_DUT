import { box, slab, project, ISO_SCALE } from './iso.js';

/**
 * Vocabulaire bâti des acteurs du DUT, en isométrie.
 *
 * Chaque acteur a une silhouette reconnaissable au premier coup d'œil, pour
 * qu'on le retrouve de scène en scène sans avoir à relire son libellé :
 *  - partenaire : entrepôt long avec quai de chargement ;
 *  - antenne OIC : bâtiment administratif blanc, toit bleu, porche à colonnes
 *    et mât portant les couleurs ivoiriennes ;
 *  - siège OIC : même langage, mais volume étagé plus haut ;
 *  - contrôle terrain : guérite au bord de la route avec barrière rayée ;
 *  - transporteur : l'ensemble routier.
 */

const S = ISO_SCALE;

/** Mât et drapeau ivoirien : orange, blanc, vert. */
function flag({ x, y, z = 0 }) {
  const [mx, my] = project(x, y, z, S);
  const [tx, ty] = project(x, y, z + 3.1, S);
  const bands = ['#F17D0C', '#FFFFFF', '#0C8B41'];
  const cloth = bands.map((c, i) => {
    const [ax, ay] = project(x, y, z + 3.05 - i * 0.22, S);
    return `<rect x="${(ax + 2).toFixed(1)}" y="${(ay - 7).toFixed(1)}" width="34" height="7" fill="${c}" `
      + `${c === '#FFFFFF' ? 'stroke="#DCE4EF" stroke-width=".6"' : ''}/>`;
  }).join('');
  return `<line x1="${mx.toFixed(1)}" y1="${my.toFixed(1)}" x2="${tx.toFixed(1)}" y2="${ty.toFixed(1)}" `
    + 'stroke="#AEBCD1" stroke-width="2.4" stroke-linecap="round"/>' + cloth;
}

/** Porche d'entrée : deux colonnes et un auvent. */
function portico({ x, y, z = 0 }) {
  return box({ x, y, z, w: 0.26, d: 0.26, h: 1.25, tone: 'white', shadow: false }, S)
    + box({ x, y: y + 1.5, z, w: 0.26, d: 0.26, h: 1.25, tone: 'white', shadow: false }, S)
    + box({ x: x - 0.12, y: y - 0.12, z: 1.25, w: 0.52, d: 2.0, h: 0.2, tone: 'blue', shadow: false }, S);
}

/** Antenne OIC : bâtiment administratif, porche et couleurs nationales. */
export function oicBranch({ x = 0, y = 0, id = '' }) {
  return `<g${id ? ` id="${id}"` : ''} class="iso-batiment iso-antenne">`
    + slab({ x: x - 0.5, y: y - 0.5, w: 5.4, d: 4.2, fill: '#E3EAF4' }, S)
    + box({ x, y, w: 4.0, d: 3.0, h: 1.85, tone: 'white', detail: 'windows' }, S)
    + box({ x, y, z: 1.85, w: 4.0, d: 3.0, h: 0.3, tone: 'blue', shadow: false }, S)
    + box({ x: x + 0.35, y: y + 0.35, z: 2.15, w: 1.1, d: 1.1, h: 0.45, tone: 'white', shadow: false }, S)
    + portico({ x: x + 4.0, y: y + 0.5 })
    + flag({ x: x + 4.9, y: y + 2.9 })
    + '</g>';
}

/**
 * Siège OIC : volume étagé, dans le BLEU DU LOGO — c'est lui qui identifie
 * l'institution. Les bandeaux et le porche restent blancs pour détacher les
 * étages, et les fenêtres sont claires sur fond bleu.
 */
export function oicHq({ x = 0, y = 0, id = '' }) {
  return `<g${id ? ` id="${id}"` : ''} class="iso-batiment iso-siege">`
    + slab({ x: x - 0.5, y: y - 0.5, w: 6.0, d: 5.0, fill: '#DCE6F3' }, S)
    + box({ x, y, w: 4.6, d: 4.0, h: 2.4, tone: 'navy', detail: 'windows-light' }, S)
    + box({ x, y, z: 2.4, w: 4.6, d: 4.0, h: 0.22, tone: 'white', shadow: false }, S)
    + box({ x: x + 0.6, y: y + 0.6, z: 2.62, w: 3.4, d: 2.8, h: 1.7, tone: 'navy', detail: 'windows-light', shadow: false }, S)
    + box({ x: x + 0.6, y: y + 0.6, z: 4.32, w: 3.4, d: 2.8, h: 0.22, tone: 'white', shadow: false }, S)
    + box({ x: x + 1.7, y: y + 1.6, z: 4.54, w: 1.0, d: 0.9, h: 0.5, tone: 'white', shadow: false }, S)
    + portico({ x: x + 4.6, y: y + 1.2 })
    + flag({ x: x + 5.5, y: y + 4.2 })
    + '</g>';
}

/** Partenaire : entrepôt long, quai de chargement, auvent. */
export function partnerYard({ x = 0, y = 0, id = '' }) {
  return `<g${id ? ` id="${id}"` : ''} class="iso-batiment iso-partenaire">`
    + slab({ x: x - 0.5, y: y - 0.5, w: 6.6, d: 4.4, fill: '#E3EAF4' }, S)
    + box({ x, y, w: 5.2, d: 3.2, h: 1.7, tone: 'white', detail: 'windows' }, S)
    + box({ x, y, z: 1.7, w: 5.2, d: 3.2, h: 0.26, tone: 'navy', shadow: false }, S)
    // Quai de chargement et portes.
    + box({ x: x + 0.4, y: y + 3.2, w: 4.4, d: 0.7, h: 0.45, tone: 'white' }, S)
    + box({ x: x + 0.8, y: y + 3.2, w: 0.9, d: 0.08, h: 0.95, tone: 'blue', shadow: false }, S)
    + box({ x: x + 2.4, y: y + 3.2, w: 0.9, d: 0.08, h: 0.95, tone: 'blue', shadow: false }, S)
    + '</g>';
}

/** Contrôle terrain : guérite, barrière rayée, borne de scan. */
export function controlPost({ x = 0, y = 0, id = '' }) {
  const stripes = [];
  for (let i = 0; i < 6; i += 1) {
    stripes.push(box({
      x: x + 1.3 + i * 0.42, y: y + 0.45, z: 0.95,
      w: 0.42, d: 0.14, h: 0.14,
      tone: i % 2 === 0 ? 'accent' : 'white', shadow: false,
    }, S));
  }
  return `<g${id ? ` id="${id}"` : ''} class="iso-batiment iso-controle">`
    + slab({ x: x - 0.4, y: y - 0.4, w: 4.6, d: 2.6, fill: '#E3EAF4' }, S)
    + box({ x, y, w: 1.2, d: 1.3, h: 1.5, tone: 'white', detail: 'windows' }, S)
    + box({ x, y, z: 1.5, w: 1.2, d: 1.3, h: 0.24, tone: 'accent', shadow: false }, S)
    + box({ x: x + 1.25, y: y + 0.45, w: 0.16, d: 0.16, h: 1.0, tone: 'slate' }, S)
    + stripes.join('')
    // Borne de lecture du QR.
    + box({ x: x + 3.5, y: y + 0.5, w: 0.3, d: 0.3, h: 1.2, tone: 'slate' }, S)
    + box({ x: x + 3.42, y: y + 0.42, z: 1.2, w: 0.46, d: 0.46, h: 0.3, tone: 'blue', shadow: false }, S)
    + '</g>';
}

/** Ensemble routier : tracteur, remorque, roues. */
export function truck({ x = 0, y = 0, tone = 'blue', id = '' }) {
  const wheels = [];
  for (const [wx, wy] of [
    [x + 0.55, y + 0.12], [x + 0.55, y + 1.05],
    [x + 3.1, y + 0.12], [x + 3.1, y + 1.05],
    [x + 3.7, y + 0.12], [x + 3.7, y + 1.05],
  ]) {
    const [cx, cy] = project(wx, wy, 0.16, S);
    wheels.push(`<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="7" ry="4.4" fill="#222C36"/>`);
  }
  return `<g${id ? ` id="${id}"` : ''} class="iso-camion">`
    + box({ x, y, w: 1.25, d: 1.2, h: 1.15, tone }, S)
    + box({ x: x + 1.35, y, w: 3.1, d: 1.2, h: 1.5, tone: 'white', detail: 'container' }, S)
    + wheels.join('')
    + '</g>';
}

/** Profondeur d'un objet : en isométrie, x + y croît vers l'observateur. */
export function depthOf({ x, y, w = 0, d = 0 }) {
  return (x + w / 2) + (y + d / 2);
}
