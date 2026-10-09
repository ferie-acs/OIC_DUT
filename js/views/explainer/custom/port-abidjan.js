import {
  box, slab, path, ribbon, pin, project, defs, ISO_ORIGIN, ISO_SCALE,
} from '../iso/iso.js';

/**
 * Scène 1.2 — le port d'Abidjan et le départ vers l'intérieur, en isométrie.
 *
 * Aucun contour national n'est dessiné : on montre un port, une route et une
 * destination, pas une frontière que l'on ne pourrait pas vérifier.
 */
export const id = 'port-abidjan';

const S = ISO_SCALE;

/** Déplacement à l'écran d'un objet avançant de `t` tuiles le long de l'axe X. */
function alongX(t) {
  const [dx, dy] = project(t, 0, 0, S);
  return { dx, dy };
}

/** Un conteneur maritime : volume nervuré, teinte au choix. */
function container({ x, y, z = 0, tone = 'blue' }) {
  return box({ x, y, z, w: 1.9, d: 0.95, h: 0.85, tone, detail: 'container', shadow: z === 0 }, S);
}

/** Ensemble routier : tracteur, remorque, roues. */
function truck({ x, y }) {
  const wheels = [];
  for (const [wx, wy] of [[x + 0.55, y + 0.12], [x + 0.55, y + 1.05], [x + 3.1, y + 0.12], [x + 3.1, y + 1.05], [x + 3.7, y + 0.12], [x + 3.7, y + 1.05]]) {
    const [cx, cy] = project(wx, wy, 0.16, S);
    wheels.push(`<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="7" ry="4.4" fill="#222C36"/>`);
  }
  return box({ x, y, w: 1.25, d: 1.2, h: 1.15, tone: 'blue', shadow: true }, S)
    + box({ x: x + 1.35, y, w: 3.1, d: 1.2, h: 1.5, tone: 'white', detail: 'container', shadow: true }, S)
    + wheels.join('');
}

/** Navire : coque sombre, proue biseautée, pont chargé. */
function ship({ x, y }) {
  const hull = box({ x, y, w: 9.4, d: 2.8, h: 1.0, tone: 'navy', shadow: false }, S);
  const bow = `<polygon points="${[
    project(x + 9.4, y, 0, S), project(x + 10.5, y + 1.4, 0, S),
    project(x + 10.5, y + 1.4, 1.0, S), project(x + 9.4, y, 1.0, S),
  ].map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ')}" fill="url(#g-navy-right)"/>`
    + `<polygon points="${[
      project(x + 9.4, y + 2.8, 0, S), project(x + 10.5, y + 1.4, 0, S),
      project(x + 10.5, y + 1.4, 1.0, S), project(x + 9.4, y + 2.8, 1.0, S),
    ].map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ')}" fill="url(#g-navy-left)"/>`;

  const deck = [];
  const teintes = ['blue', 'white', 'accent', 'blue', 'white', 'blue'];
  for (let i = 0; i < 6; i += 1) {
    deck.push(container({ x: x + 0.6 + i * 1.4, y: y + 0.45, z: 1.0, tone: teintes[i] }));
    if (i % 2 === 0) deck.push(container({ x: x + 0.6 + i * 1.4, y: y + 0.45, z: 1.85, tone: 'white' }));
  }
  // Château arrière.
  deck.push(box({ x: x + 0.3, y: y + 0.5, z: 1.0, w: 0.9, d: 1.8, h: 1.6, tone: 'white' }, S));
  return `${hull}${bow}${deck.join('')}`;
}

/**
 * Tri par profondeur (algorithme du peintre). En isométrie, les deux axes du
 * sol avancent vers l'observateur : la profondeur d'un objet est donc x + y,
 * et il faut dessiner du plus lointain au plus proche. Sans ce tri, les piles
 * de conteneurs du terre-plein passaient devant le navire à quai.
 */
function compose() {
  const layers = [];
  const push = (depth, markup) => layers.push({ depth, markup });

  // Plans de base, toujours dessous.
  push(-999, slab({ x: -10, y: 2.6, w: 18, d: 4.6, fill: '#AECCEC', id: 'iso-eau' }, S));
  push(-998, slab({ x: -10, y: -8.2, w: 22, d: 10.8, fill: '#EFF4FA', id: 'iso-sol' }, S));
  push(-997, slab({ x: -10, y: -7.1, w: 22, d: 2.1, fill: '#DCE4EF', id: 'iso-route' }, S));
  push(-996, path({
    pts: [[-10, -6.05], [12, -6.05]], stroke: '#FFFFFF', width: 3.4, dash: '18 15', id: 'iso-marquage',
  }, S));
  push(-995, ribbon({
    pts: [[-5.6, 1.4], [-5.6, -2.4], [-1.6, -4.8], [1.6, -6.05], [10.6, -6.05]],
    color: '#F17D0C', width: 12, id: 'iso-itineraire',
  }, S));

  // Objets du monde, chacun avec sa profondeur.
  push(-7.4, `<g id="iso-camion">${truck({ x: -4.6, y: -6.65 })}</g>`);
  push(3.95, pin({ x: 10.6, y: -6.05, r: 12, fill: '#0C8B41', id: 'iso-pin-dest' }, S));

  const grille = [
    [-9.6, -0.6, 'blue'], [-7.4, -0.6, 'white'], [-5.2, -0.6, 'blue'],
    [-9.6, -2.1, 'white'], [-7.4, -2.1, 'accent'],
  ];
  grille.forEach(([x, y, tone], i) => {
    push(x + 0.95 + y + 0.48, `<g class="iso-pile" id="iso-pile-${i}">`
      + container({ x, y, tone })
      + (i % 2 === 0 ? container({ x, y, z: 0.85, tone: 'white' }) : '')
      + '</g>');
  });

  push(5.0 - 1.8, `<g id="iso-entrepot">${
    box({ x: 2.6, y: -3.4, w: 4.8, d: 3.2, h: 2.1, tone: 'white', detail: 'windows' }, S)
    + box({ x: 2.6, y: -3.4, w: 4.8, d: 3.2, h: 0.28, z: 2.1, tone: 'blue', shadow: false }, S)
  }</g>`);

  push(-4.2, pin({ x: -5.6, y: 1.4, r: 10, fill: '#F17D0C', id: 'iso-pin-port' }, S));
  push(0.3, `<g id="iso-quai">${box({ x: -10, y: 1.9, w: 19, d: 0.8, h: 0.42, tone: 'white' }, S)}</g>`);

  push(-1.0, `<g id="iso-portique">${
    box({ x: -3.6, y: 1.0, w: 0.3, d: 0.3, h: 4.6, tone: 'white' }, S)
    + box({ x: -3.6, y: 3.6, w: 0.3, d: 0.3, h: 4.6, tone: 'white', shadow: false }, S)
    + box({ x: -3.75, y: 0.85, w: 0.6, d: 3.2, h: 0.42, z: 4.6, tone: 'blue', shadow: false }, S)
    + box({ x: -3.7, y: 2.3, w: 0.5, d: 0.5, h: 0.3, z: 4.25, tone: 'accent', shadow: false }, S)
  }</g>`);

  push(1.4, `<g id="iso-navire">${ship({ x: -7.4, y: 3.2 })}</g>`);

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
  const qa = (sel) => (typeof el.querySelectorAll === 'function' ? [...el.querySelectorAll(sel)] : []);
  const add = (target, props, at) => { if (target) tl.add(target, props, at); };

  add(q('#iso-sol'), { opacity: [0, 1], duration: 700 }, offsetMs);
  add(q('#iso-eau'), { opacity: [0, 1], duration: 700 }, offsetMs + 150);
  add(q('#iso-quai'), { opacity: [0, 1], translateY: [-16, 0], duration: 600 }, offsetMs + 450);

  const entree = alongX(-6);
  add(q('#iso-navire'), {
    opacity: [0, 1], translateX: [entree.dx, 0], translateY: [entree.dy, 0],
    duration: 1800, ease: 'out(3)',
  }, offsetMs + 650);

  add(q('#iso-portique'), { opacity: [0, 1], translateY: [-30, 0], duration: 600 }, offsetMs + 1500);

  qa('.iso-pile').forEach((node, i) => {
    add(node, { opacity: [0, 1], translateY: [-26, 0], duration: 460 }, offsetMs + 1900 + i * 130);
  });

  add(q('#iso-entrepot'), { opacity: [0, 1], translateY: [-24, 0], duration: 540 }, offsetMs + 2600);
  add(q('#iso-route'), { opacity: [0, 1], duration: 600 }, offsetMs + 2900);
  add(q('#iso-marquage'), { opacity: [0, 1], duration: 600 }, offsetMs + 3100);
  add(q('#iso-pin-port'), { opacity: [0, 1], scale: [0.4, 1], duration: 450 }, offsetMs + 3400);
  add(q('#iso-itineraire'), { opacity: [0, 1], duration: 900 }, offsetMs + 3700);
  add(q('#iso-pin-dest'), { opacity: [0, 1], scale: [0.4, 1], duration: 450 }, offsetMs + 4600);

  const trajet = alongX(13);
  add(q('#iso-camion'), { opacity: [0, 1], duration: 400 }, offsetMs + 4300);
  add(q('#iso-camion'), {
    translateX: [0, trajet.dx], translateY: [0, trajet.dy],
    duration: 5400, ease: 'inOut(2)',
  }, offsetMs + 4700);
}
