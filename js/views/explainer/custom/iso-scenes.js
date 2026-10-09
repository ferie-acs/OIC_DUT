import {
  box, slab, panel, ribbon, path, pin, project, defs, groundPlane,
  ISO_ORIGIN, ISO_SCALE,
} from '../iso/iso.js';
import {
  partnerYard, oicBranch, oicHq, controlPost, truck, depthOf,
} from '../iso/buildings.js';
import { icon as lucide } from '../../../core/icons.js';

/**
 * Constructeurs de scènes isométriques pilotés par la donnée.
 *
 * Plutôt qu'un module bricolé par scène, six familles couvrent le storyboard.
 * Chaque scène du storyboard déclare `custom: '<famille>'` et un objet
 * `customParams` qui dit quoi poser sur le sol. Les titres, puces et captures
 * restent des panneaux plats par-dessus — le décor est le monde, le texte est
 * la couche d'information.
 */

const S = ISO_SCALE;

const ACTEURS = {
  partenaire: partnerYard,
  antenne: oicBranch,
  siege: oicHq,
  controle: controlPost,
};

/** Enveloppe SVG commune. */
function wrap(markup, doc, origin = ISO_ORIGIN) {
  const el = doc.createElement('div');
  el.className = 'sc-custom sc-iso';
  el.innerHTML = '<svg class="sc-iso-svg" viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg">'
    + `<g transform="translate(${origin.x} ${origin.y})">${markup}</g>`
    + '</svg>';
  return el;
}

/** Libellé posé sous un objet du sol. */
function labelAt({ x, y, text, size = 28 }) {
  const [cx, cy] = project(x, y, 0, S);
  return `<text class="iso-label" x="${cx.toFixed(1)}" y="${(cy + 44).toFixed(1)}" text-anchor="middle" `
    + `font-family="Instrument Sans, system-ui, sans-serif" font-size="${size}" font-weight="700" `
    + `fill="#0B3D6F">${text}</text>`;
}

/** Icône Lucide posée à plat au-dessus d'un objet. */
function glyphAt({ x, y, z, name, size = 54, color = '#0E56A4' }) {
  const [cx, cy] = project(x, y, z, S);
  return `<g class="iso-glyph" transform="translate(${(cx - size / 2).toFixed(1)} ${(cy - size / 2).toFixed(1)})" color="${color}">`
    + lucide(name, { size })
    + '</g>';
}

/** Document DUT posé à plat : carte, liseré, lignes, numéro, QR. */
function docSlab({ x, y, z = 0, tone = 'white', dashed = false, qr = false, numero = null }) {
  const lines = [];
  for (let i = 0; i < 3; i += 1) {
    const [ax, ay] = project(x + 0.3, y + 0.55 + i * 0.3, z + 0.17, S);
    const [bx, by] = project(x + 1.7, y + 0.55 + i * 0.3, z + 0.17, S);
    lines.push(`<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" `
      + `stroke="${dashed ? '#C9D4E3' : '#AEBCD1'}" stroke-width="2.6" stroke-linecap="round"/>`);
  }
  const corps = box({ x, y, z, w: 2.0, d: 1.5, h: 0.16, tone, shadow: z === 0 }, S);
  const liseré = box({ x, y, z: z + 0.16, w: 2.0, d: 0.2, h: 0.03, tone: dashed ? 'white' : 'accent', shadow: false }, S);
  const code = qr
    ? box({ x: x + 1.42, y: y + 0.95, z: z + 0.17, w: 0.45, d: 0.45, h: 0.03, tone: 'slate', shadow: false }, S)
    : '';
  const texte = numero
    ? (() => {
      const [nx, ny] = project(x + 0.3, y + 0.3, z + 0.18, S);
      return `<text x="${nx.toFixed(1)}" y="${(ny + 4).toFixed(1)}" font-family="ui-monospace, Menlo, monospace" `
        + `font-size="17" font-weight="700" fill="#0B3D6F">${numero}</text>`;
    })()
    : '';
  return corps + liseré + lines.join('') + code + texte;
}

// --------------------------------------------------------------------------
// Famille 1 — socles : N piliers portant une icône et un libellé.
// --------------------------------------------------------------------------

export const socles = {
  id: 'iso-socles',
  build(scene, doc) {
    const items = (scene.customParams && scene.customParams.items) || [];
    const layers = [{ depth: -999, markup: groundPlane() }];
    const xs = items.length === 1 ? [0] : items.length === 2 ? [-4.5, 4.5] : [-7.4, 0, 7.4];
    const tones = ['navy', 'accent', 'blue'];

    items.forEach((item, i) => {
      const x = xs[i] - 1.7;
      const y = -1.7;
      layers.push({
        depth: depthOf({ x, y, w: 3.4, d: 3.4 }),
        markup: `<g class="iso-socle" id="iso-socle-${i}">`
          + slab({ x: x - 0.4, y: y - 0.4, w: 4.2, d: 4.2, fill: '#E6EDF6' }, S)
          + box({ x, y, w: 3.4, d: 3.4, h: 0.55, tone: 'white' }, S)
          + box({ x: x + 1.0, y: y + 1.0, z: 0.55, w: 1.4, d: 1.4, h: 1.5, tone: tones[i % 3], shadow: false }, S)
          + glyphAt({ x: x + 1.7, y: y + 1.7, z: 2.05, name: item.icon, size: 56, color: '#FFFFFF' })
          + labelAt({ x: xs[i], y: y + 3.6, text: item.label })
          + '</g>',
      });
    });

    layers.sort((a, b) => a.depth - b.depth);
    return wrap(defs() + layers.map((l) => l.markup).join(''), doc);
  },
  animate(tl, el, scene, offsetMs) {
    const nodes = typeof el.querySelectorAll === 'function' ? [...el.querySelectorAll('.iso-socle')] : [];
    const ground = typeof el.querySelector === 'function' ? el.querySelector('#iso-ground') : null;
    if (ground) tl.add(ground, { opacity: [0, 1], duration: 600 }, offsetMs);
    const inner = typeof el.querySelector === 'function' ? el.querySelector('#iso-ground-inner') : null;
    if (inner) tl.add(inner, { opacity: [0, 1], duration: 600 }, offsetMs + 100);
    nodes.forEach((node, i) => {
      tl.add(node, { opacity: [0, 1], translateY: [-34, 0], duration: 620 }, offsetMs + 500 + i * 420);
    });
  },
};

// --------------------------------------------------------------------------
// Famille 2 — documents : un ou plusieurs DUT posés côte à côte.
// --------------------------------------------------------------------------

export const documents = {
  id: 'iso-documents',
  build(scene, doc) {
    const docs = (scene.customParams && scene.customParams.docs) || [{}];
    const layers = [{ depth: -999, markup: groundPlane() }];
    const xs = docs.length === 1 ? [-1] : docs.length === 2 ? [-4.5, 1.5] : [-7.2, -1.0, 5.2];

    docs.forEach((d, i) => {
      const x = xs[i];
      const y = -0.75;
      layers.push({
        depth: depthOf({ x, y, w: 2, d: 1.5 }),
        markup: `<g class="iso-doc-slab" id="iso-doc-${i}">`
          + docSlab({ x, y, tone: d.tone || 'white', dashed: !!d.dashed, qr: !!d.qr, numero: d.numero || null })
          + (d.label ? labelAt({ x: x + 1.0, y: y + 2.1, text: d.label, size: 26 }) : '')
          + '</g>',
      });
    });

    layers.sort((a, b) => a.depth - b.depth);
    return wrap(defs() + layers.map((l) => l.markup).join(''), doc);
  },
  animate(tl, el, scene, offsetMs) {
    const q = (s) => (typeof el.querySelector === 'function' ? el.querySelector(s) : null);
    const nodes = typeof el.querySelectorAll === 'function' ? [...el.querySelectorAll('.iso-doc-slab')] : [];
    const g = q('#iso-ground'); if (g) tl.add(g, { opacity: [0, 1], duration: 600 }, offsetMs);
    const gi = q('#iso-ground-inner'); if (gi) tl.add(gi, { opacity: [0, 1], duration: 600 }, offsetMs + 100);
    nodes.forEach((node, i) => {
      tl.add(node, { opacity: [0, 1], translateY: [-30, 0], duration: 560 }, offsetMs + 500 + i * 520);
    });
  },
};

// --------------------------------------------------------------------------
// Famille 3 — acteur : un bâtiment seul, décalé pour laisser la place au
// panneau de capture d'écran posé à droite du cadre.
// --------------------------------------------------------------------------

export const acteur = {
  id: 'iso-acteur',
  build(scene, doc) {
    const p = scene.customParams || {};
    const builder = ACTEURS[p.acteur] || oicBranch;
    const layers = [{ depth: -999, markup: groundPlane() }];
    const pos = { x: -7.0, y: -2.0, w: 6.0, d: 4.4 };

    layers.push({ depth: depthOf(pos), markup: builder({ x: pos.x, y: pos.y, id: 'iso-acteur-principal' }) });

    if (p.camion) {
      const t = { x: -3.0, y: 3.2, w: 5.4, d: 1.25 };
      layers.push({ depth: -2, markup: slab({ x: -10, y: 2.9, w: 16, d: 1.9, fill: '#DCE4EF', id: 'iso-voie' }, S) });
      layers.push({ depth: depthOf(t), markup: truck({ x: t.x, y: t.y, id: 'iso-camion' }) });
    }

    layers.sort((a, b) => a.depth - b.depth);
    return wrap(defs() + layers.map((l) => l.markup).join(''), doc, { x: ISO_ORIGIN.x - 190, y: ISO_ORIGIN.y + 40 });
  },
  animate(tl, el, scene, offsetMs) {
    const q = (s) => (typeof el.querySelector === 'function' ? el.querySelector(s) : null);
    const g = q('#iso-ground'); if (g) tl.add(g, { opacity: [0, 1], duration: 600 }, offsetMs);
    const gi = q('#iso-ground-inner'); if (gi) tl.add(gi, { opacity: [0, 1], duration: 600 }, offsetMs + 100);
    const a = q('#iso-acteur-principal');
    if (a) tl.add(a, { opacity: [0, 1], translateY: [-32, 0], duration: 650 }, offsetMs + 400);
    const v = q('#iso-voie'); if (v) tl.add(v, { opacity: [0, 1], duration: 500 }, offsetMs + 800);
    const c = q('#iso-camion');
    if (c) {
      const [dx, dy] = project(9, 0, 0, S);
      tl.add(c, { opacity: [0, 1], duration: 400 }, offsetMs + 1000);
      tl.add(c, { translateX: [0, dx], translateY: [0, dy], duration: 4200, ease: 'inOut(2)' }, offsetMs + 1400);
    }
  },
};

// --------------------------------------------------------------------------
// Famille 4 — journal : des écritures qui s'empilent, sans retrait possible.
// --------------------------------------------------------------------------

export const journal = {
  id: 'iso-journal',
  build(scene, doc) {
    const entrees = (scene.customParams && scene.customParams.entrees) || [];
    const layers = [{ depth: -999, markup: groundPlane() }];
    layers.push({ depth: -5, markup: slab({ x: -3.6, y: -3.0, w: 7.4, d: 6.0, fill: '#E6EDF6' }, S) });

    // Espacement vertical franc : à 0,42 tuile les libellés se chevauchaient
    // tous au même point à l'écran. Et le texte est posé À GAUCHE de la pile,
    // aligné à droite, pour former une colonne lisible plutôt qu'un tas.
    entrees.forEach((texte, i) => {
      const z = i * 1.05;
      const dernier = i === entrees.length - 1;
      layers.push({
        depth: i,
        markup: `<g class="iso-ecriture" id="iso-ecriture-${i}">`
          + box({
            x: -2.8, y: -2.2, z, w: 5.6, d: 4.4, h: 0.34,
            tone: dernier ? 'accent' : 'white', shadow: i === 0,
          }, S)
          + (() => {
            const [tx, ty] = project(-3.1, 2.2, z + 0.34, S);
            return `<text x="${(tx - 18).toFixed(1)}" y="${(ty + 8).toFixed(1)}" text-anchor="end" `
              + 'font-family="Instrument Sans, system-ui, sans-serif" font-size="26" font-weight="700" '
              + `fill="${dernier ? '#C96508' : '#0B3D6F'}">${texte}</text>`;
          })()
          + '</g>',
      });
    });

    layers.sort((a, b) => a.depth - b.depth);
    return wrap(defs() + layers.map((l) => l.markup).join(''), doc, { x: ISO_ORIGIN.x + 230, y: ISO_ORIGIN.y + 110 });
  },
  animate(tl, el, scene, offsetMs) {
    const nodes = typeof el.querySelectorAll === 'function' ? [...el.querySelectorAll('.iso-ecriture')] : [];
    const q = (s) => (typeof el.querySelector === 'function' ? el.querySelector(s) : null);
    const g = q('#iso-ground'); if (g) tl.add(g, { opacity: [0, 1], duration: 600 }, offsetMs);
    const gi = q('#iso-ground-inner'); if (gi) tl.add(gi, { opacity: [0, 1], duration: 600 }, offsetMs + 100);
    nodes.forEach((node, i) => {
      tl.add(node, { opacity: [0, 1], translateY: [-40, 0], duration: 480 }, offsetMs + 600 + i * 480);
    });
  },
};

// --------------------------------------------------------------------------
// Famille 5 — réseau : la grappe des antennes sur le territoire.
// --------------------------------------------------------------------------

export const reseau = {
  id: 'iso-reseau',
  build(scene, doc) {
    const layers = [{ depth: -999, markup: groundPlane() }];
    const sites = [
      [-7.5, -4.5], [-1.5, -5.5], [4.5, -4.0],
      [-6.0, 1.0], [0.5, 0.0], [6.0, 1.5],
      [-2.5, 4.5], [3.5, 4.5],
    ];
    // Liens entre antennes et site central.
    const centre = sites[4];
    sites.forEach((s, i) => {
      if (i === 4) return;
      layers.push({
        depth: -900,
        markup: path({
          pts: [[s[0] + 0.5, s[1] + 0.5], [centre[0] + 0.5, centre[1] + 0.5]],
          stroke: '#8FB4DA', width: 2.6, dash: '9 10', id: `iso-lien-${i}`,
        }, S),
      });
    });
    sites.forEach(([x, y], i) => {
      const est = i === 4;
      layers.push({
        depth: depthOf({ x, y, w: est ? 2.4 : 1.6, d: est ? 2.0 : 1.4 }),
        markup: `<g class="iso-site" id="iso-site-${i}">`
          + box({ x, y, w: est ? 2.4 : 1.6, d: est ? 2.0 : 1.4, h: est ? 1.5 : 0.95, tone: est ? 'navy' : 'white', detail: est ? 'windows-light' : 'windows' }, S)
          + box({ x, y, z: est ? 1.5 : 0.95, w: est ? 2.4 : 1.6, d: est ? 2.0 : 1.4, h: 0.18, tone: est ? 'white' : 'blue', shadow: false }, S)
          + '</g>',
      });
    });

    layers.sort((a, b) => a.depth - b.depth);
    return wrap(defs() + layers.map((l) => l.markup).join(''), doc, { x: ISO_ORIGIN.x - 170, y: ISO_ORIGIN.y - 20 });
  },
  animate(tl, el, scene, offsetMs) {
    const q = (s) => (typeof el.querySelector === 'function' ? el.querySelector(s) : null);
    const qa = (s) => (typeof el.querySelectorAll === 'function' ? [...el.querySelectorAll(s)] : []);
    const g = q('#iso-ground'); if (g) tl.add(g, { opacity: [0, 1], duration: 600 }, offsetMs);
    const gi = q('#iso-ground-inner'); if (gi) tl.add(gi, { opacity: [0, 1], duration: 600 }, offsetMs + 100);
    qa('.iso-site').forEach((node, i) => {
      tl.add(node, { opacity: [0, 1], translateY: [-26, 0], duration: 440 }, offsetMs + 400 + i * 160);
    });
    qa('[id^="iso-lien-"]').forEach((node, i) => {
      tl.add(node, { opacity: [0, 1], duration: 420 }, offsetMs + 1700 + i * 90);
    });
  },
};

export const SCENE_FAMILIES = [socles, documents, acteur, journal, reseau];
