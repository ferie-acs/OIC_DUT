/**
 * Petit moteur isométrique en SVG.
 *
 * Projection isométrique classique : l'axe X part vers la droite en
 * descendant, l'axe Y vers la gauche en descendant, l'axe Z monte. Un volume
 * se résume à trois faces visibles — dessus, flanc droit, flanc gauche — ce
 * qui suffit à lire le relief avec trois tons d'une même couleur.
 *
 * Rendu en SVG et non en transformations CSS 3D : la capture image par image
 * de l'export y est plus fiable, et les faces restent nettes à 1920x1080.
 */

const COS30 = Math.cos(Math.PI / 6);
const SIN30 = 0.5;

/** Projette un point du repère isométrique vers le plan de l'écran. */
export function project(x, y, z, scale = 1) {
  return [
    (x - y) * COS30 * scale,
    ((x + y) * SIN30 - z) * scale,
  ];
}

function points(list, scale) {
  return list.map(([x, y, z]) => project(x, y, z, scale).join(',')).join(' ');
}

/**
 * Trois tons d'une même teinte : dessus éclairé, flanc droit intermédiaire,
 * flanc gauche dans l'ombre. C'est ce dégradé qui donne le volume.
 */
export const TONES = {
  white: { top: '#FFFFFF', right: '#E4EBF4', left: '#CFDAE8' },
  blue: { top: '#2F6FD0', right: '#2259AC', left: '#174A96' },
  navy: { top: '#0E56A4', right: '#0B3D6F', left: '#082C50' },
  accent: { top: '#F9A14A', right: '#F17D0C', left: '#C96508' },
  ground: { top: '#F2F6FB', right: '#E2E9F2', left: '#D3DCE8' },
  water: { top: '#BFD8F2', right: '#A9C8E9', left: '#95B8E0' },
};

/** Un pavé droit posé en (x, y, z), de dimensions (w, d, h). */
export function box({ x = 0, y = 0, z = 0, w = 1, d = 1, h = 1, tone = 'white', id = '' }, scale = 1) {
  const t = TONES[tone] || TONES.white;
  const top = points([
    [x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h],
  ], scale);
  const right = points([
    [x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h],
  ], scale);
  const left = points([
    [x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h],
  ], scale);

  return `<g class="iso-box"${id ? ` id="${id}"` : ''}>`
    + `<polygon points="${left}" fill="${t.left}"/>`
    + `<polygon points="${right}" fill="${t.right}"/>`
    + `<polygon points="${top}" fill="${t.top}"/>`
    + '</g>';
}

/** Une dalle plate : un sol, une route, un plan d'eau. */
export function slab({ x = 0, y = 0, z = 0, w = 1, d = 1, fill = '#F2F6FB', id = '', opacity = 1 }, scale = 1) {
  const quad = points([
    [x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z],
  ], scale);
  return `<polygon class="iso-slab"${id ? ` id="${id}"` : ''} points="${quad}" fill="${fill}" opacity="${opacity}"/>`;
}

/** Une polyligne au sol, pour un itinéraire. */
export function path({ pts, stroke = '#0E56A4', width = 3, dash = '10 12', id = '' }, scale = 1) {
  const d = pts
    .map(([x, y, z = 0], i) => `${i === 0 ? 'M' : 'L'}${project(x, y, z, scale).join(' ')}`)
    .join(' ');
  return `<path${id ? ` id="${id}"` : ''} d="${d}" fill="none" stroke="${stroke}" `
    + `stroke-width="${width}" stroke-dasharray="${dash}" stroke-linecap="round"/>`;
}

/** Un repère circulaire posé à plat, comme les points d'étape d'une carte. */
export function pin({ x, y, z = 0, r = 7, fill = '#F17D0C', id = '' }, scale = 1) {
  const [cx, cy] = project(x, y, z, scale);
  return `<g${id ? ` id="${id}"` : ''}>`
    + `<ellipse cx="${cx}" cy="${cy}" rx="${r * 1.7}" ry="${r}" fill="${fill}" opacity=".22"/>`
    + `<ellipse cx="${cx}" cy="${cy}" rx="${r * 0.85}" ry="${r * 0.5}" fill="${fill}"/>`
    + '</g>';
}
