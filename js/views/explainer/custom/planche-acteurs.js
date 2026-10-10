import { defs, slab, project, ISO_ORIGIN, ISO_SCALE } from '../iso/iso.js';
import {
  partnerYard, oicHq, controlPost, truck, depthOf,
} from '../iso/buildings.js';

/**
 * Planche de vocabulaire : les acteurs du DUT côte à côte, en isométrie.
 *
 * Sert de référence visuelle — c'est ici qu'on vérifie qu'un spectateur
 * distingue un partenaire d'une antenne et d'un poste de contrôle sans lire
 * un seul mot.
 */
export const id = 'planche-acteurs';

/**
 * Planche de référence, pas une scène du film : elle n'est volontairement
 * référencée par aucun chapitre. On la branche à la main sur une scène pour
 * en sortir une image quand le vocabulaire visuel évolue.
 */
export const preview = true;

const S = ISO_SCALE;

function label({ x, y, text }) {
  const [cx, cy] = project(x, y, 0, S);
  return `<text class="iso-label" x="${cx.toFixed(1)}" y="${(cy + 46).toFixed(1)}" text-anchor="middle" `
    + 'font-family="Instrument Sans, system-ui, sans-serif" font-size="30" font-weight="700" '
    + `fill="#0B3D6F">${text}</text>`;
}

function compose() {
  const layers = [];
  const push = (depth, markup) => layers.push({ depth, markup });

  push(-999, slab({ x: -14, y: -9, w: 28, d: 18, fill: '#F4F8FC' }, S));

  const partenaire = { x: -11.0, y: -8.0, w: 6.6, d: 4.4 };
  const siege = { x: 1.0, y: -8.6, w: 6.0, d: 5.0 };
  const controle = { x: -11.5, y: 0.4, w: 4.6, d: 2.6 };
  const camionPos = { x: 1.6, y: 1.0, w: 4.5, d: 1.2 };

  push(depthOf(partenaire), partnerYard({ x: partenaire.x, y: partenaire.y }));
  push(depthOf(siege), oicHq({ x: siege.x, y: siege.y }));
  push(depthOf(controle), controlPost({ x: controle.x, y: controle.y }));
  push(depthOf(camionPos), truck({ x: camionPos.x, y: camionPos.y }));

  const labels = label({ x: -7.7, y: -3.4, text: 'Partenaire' })
    + label({ x: 4.0, y: -3.4, text: 'Siège OIC' })
    + label({ x: -9.2, y: 3.4, text: 'Contrôle terrain' })
    + label({ x: 3.8, y: 2.6, text: 'Transporteur' });

  layers.sort((a, b) => a.depth - b.depth);
  return defs() + layers.map((l) => l.markup).join('') + labels;
}

export function build(scene, doc) {
  const el = doc.createElement('div');
  el.className = 'sc-custom sc-iso';
  el.innerHTML = '<svg class="sc-iso-svg" viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg">'
    + `<g transform="translate(${ISO_ORIGIN.x} ${ISO_ORIGIN.y - 10})">${compose()}</g>`
    + '</svg>';
  return el;
}

export function animate(tl, el, scene, offsetMs) {
  // Les libellés sont animés eux aussi : la règle `.sc-iso-svg > g > *` met à
  // zéro l'opacité de TOUS les enfants directs du SVG, et ce que la timeline
  // ne révèle pas reste invisible. C'est la troisième fois que cet oubli coûte
  // une scène — tout enfant direct du SVG doit être animé.
  const nodes = typeof el.querySelectorAll === 'function'
    ? [...el.querySelectorAll('.iso-batiment, .iso-camion, .iso-label')] : [];
  nodes.forEach((node, i) => {
    tl.add(node, { opacity: [0, 1], translateY: [-28, 0], duration: 560 }, offsetMs + 200 + i * 180);
  });
}
