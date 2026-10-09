import { box, slab, path, pin, project } from '../iso/iso.js';

/**
 * Scène 1.2 — le port d'Abidjan et le départ vers l'intérieur, en isométrie.
 *
 * Remplace l'abstraction précédente. Toujours aucun contour national dessiné :
 * on montre un port, une route et une destination, pas une frontière que l'on
 * ne pourrait pas vérifier.
 */
export const id = 'port-abidjan';

const S = 33;
const ORIGIN_X = 950;
const ORIGIN_Y = 400;

/** Déplacement à l'écran d'un objet avançant de `t` tuiles le long de l'axe X. */
function alongX(t) {
  const [dx, dy] = project(t, 0, 0, S);
  return { dx, dy };
}

function compose() {
  const parts = [];

  // Sol et plan d'eau.
  parts.push(slab({ x: -12, y: -10, w: 24, d: 20, fill: '#EDF2F9', id: 'iso-sol' }, S));
  parts.push(slab({ x: -12, y: 3.4, w: 24, d: 6.6, fill: '#B5D2EF', id: 'iso-eau' }, S));

  // Quai.
  parts.push(`<g id="iso-quai">${box({ x: -12, y: 2.0, w: 24, d: 1.4, h: 0.4, tone: 'white' }, S)}</g>`);

  // Navire et sa cargaison.
  const navire = [box({ x: -6.5, y: 5.2, w: 9, d: 2.6, h: 1.1, tone: 'navy' }, S)];
  const teintes = ['blue', 'white', 'accent', 'blue', 'white'];
  for (let i = 0; i < 5; i += 1) {
    navire.push(box({
      x: -5.8 + i * 1.6, y: 5.6, w: 1.4, d: 1.8, h: 0.85, tone: teintes[i],
    }, S));
  }
  parts.push(`<g id="iso-navire">${navire.join('')}</g>`);

  // Portique de déchargement.
  parts.push(`<g id="iso-portique">${
    box({ x: -3.2, y: 2.0, w: 0.35, d: 0.35, h: 4.2, tone: 'white' }, S)
    + box({ x: 0.4, y: 2.0, w: 0.35, d: 0.35, h: 4.2, tone: 'white' }, S)
    + box({ x: -3.2, y: 2.0, w: 3.95, d: 0.35, h: 0.4, z: 4.2, tone: 'blue' }, S)
  }</g>`);

  // Piles de conteneurs sur le terre-plein.
  const piles = [];
  const grille = [
    [-11.5, -0.6, 'blue'], [-9.6, -0.6, 'white'], [-7.7, -0.6, 'blue'],
    [-11.5, -2.6, 'white'], [-9.6, -2.6, 'blue'],
  ];
  grille.forEach(([x, y, tone], i) => {
    piles.push(`<g class="iso-pile" id="iso-pile-${i}">`
      + box({ x, y, w: 1.6, d: 1.6, h: 0.8, tone }, S)
      + (i % 2 === 0 ? box({ x, y, w: 1.6, d: 1.6, h: 0.8, z: 0.8, tone: 'white' }, S) : '')
      + '</g>');
  });
  parts.push(piles.join(''));

  // Entrepôt.
  parts.push(`<g id="iso-entrepot">${
    box({ x: 4.2, y: -3.6, w: 5.0, d: 3.4, h: 1.9, tone: 'white' }, S)
    + box({ x: 4.2, y: -3.6, w: 5.0, d: 3.4, h: 0.3, z: 1.9, tone: 'blue' }, S)
  }</g>`);

  // Route vers l'intérieur et marquage central.
  parts.push(slab({ x: -12, y: -7.2, w: 24, d: 2.2, fill: '#DFE7F1', id: 'iso-route' }, S));
  parts.push(path({
    pts: [[-12, -6.1], [12, -6.1]], stroke: '#FFFFFF', width: 3, dash: '16 14', id: 'iso-marquage',
  }, S));

  // Itinéraire en pointillés du quai vers la destination.
  parts.push(path({
    pts: [[-6, 1.4], [-6, -2.5], [-2, -5.2], [3, -6.1], [11, -6.1]],
    stroke: '#0E56A4', width: 4, dash: '12 14', id: 'iso-itineraire',
  }, S));

  parts.push(pin({ x: -6, y: 1.4, r: 10, fill: '#F17D0C', id: 'iso-pin-port' }, S));
  parts.push(pin({ x: 11, y: -6.1, r: 10, fill: '#0C8B41', id: 'iso-pin-dest' }, S));

  // Ensemble routier : cabine plus semi-remorque.
  parts.push(`<g id="iso-camion">${
    box({ x: -3.0, y: -6.7, w: 1.3, d: 1.3, h: 1.15, tone: 'blue' }, S)
    + box({ x: -1.6, y: -6.7, w: 3.0, d: 1.3, h: 1.45, tone: 'white' }, S)
  }</g>`);

  return parts.join('');
}

export function build(scene, doc) {
  const el = doc.createElement('div');
  el.className = 'sc-custom sc-iso';
  el.innerHTML = `<svg class="sc-iso-svg" viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg">`
    + `<g transform="translate(${ORIGIN_X} ${ORIGIN_Y})">${compose()}</g>`
    + '</svg>';
  return el;
}

export function animate(tl, el, scene, offsetMs) {
  const q = (sel) => (typeof el.querySelector === 'function' ? el.querySelector(sel) : null);
  const qa = (sel) => (typeof el.querySelectorAll === 'function' ? [...el.querySelectorAll(sel)] : []);
  const add = (target, props, at) => { if (target) tl.add(target, props, at); };

  add(q('#iso-sol'), { opacity: [0, 1], duration: 700 }, offsetMs);
  add(q('#iso-eau'), { opacity: [0, 1], duration: 700 }, offsetMs + 200);
  add(q('#iso-quai'), { opacity: [0, 1], translateY: [-18, 0], duration: 600 }, offsetMs + 500);

  // Le navire entre par la gauche, le long de l'axe du quai.
  const entree = alongX(-5);
  add(q('#iso-navire'), {
    opacity: [0, 1],
    translateX: [entree.dx, 0],
    translateY: [entree.dy, 0],
    duration: 1600,
    ease: 'out(3)',
  }, offsetMs + 700);

  add(q('#iso-portique'), { opacity: [0, 1], duration: 500 }, offsetMs + 1400);

  qa('.iso-pile').forEach((node, i) => {
    add(node, { opacity: [0, 1], translateY: [-24, 0], duration: 460 }, offsetMs + 1800 + i * 130);
  });

  add(q('#iso-entrepot'), { opacity: [0, 1], translateY: [-22, 0], duration: 520 }, offsetMs + 2500);
  add(q('#iso-route'), { opacity: [0, 1], duration: 600 }, offsetMs + 2800);
  add(q('#iso-marquage'), { opacity: [0, 1], duration: 600 }, offsetMs + 3000);

  add(q('#iso-pin-port'), { opacity: [0, 1], scale: [0.4, 1], duration: 450 }, offsetMs + 3300);
  add(q('#iso-itineraire'), { opacity: [0, 1], duration: 900 }, offsetMs + 3600);
  add(q('#iso-pin-dest'), { opacity: [0, 1], scale: [0.4, 1], duration: 450 }, offsetMs + 4500);

  // Le camion part du port et file vers la destination.
  const trajet = alongX(12);
  add(q('#iso-camion'), { opacity: [0, 1], duration: 400 }, offsetMs + 4200);
  add(q('#iso-camion'), {
    translateX: [0, trajet.dx],
    translateY: [0, trajet.dy],
    duration: 5200,
    ease: 'inOut(2)',
  }, offsetMs + 4600);
}
