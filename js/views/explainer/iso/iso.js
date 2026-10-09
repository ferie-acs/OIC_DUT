/**
 * Moteur isométrique en SVG.
 *
 * Projection isométrique classique : l'axe X part vers la droite en
 * descendant, l'axe Y vers la gauche en descendant, l'axe Z monte. Un volume
 * se résume à trois faces visibles — dessus, flanc droit, flanc gauche.
 *
 * Ce qui donne le relief, au-delà des trois faces :
 *  - un DÉGRADÉ sur chaque face plutôt qu'un aplat ;
 *  - une OMBRE DE CONTACT floue au sol, décalée dans une direction unique ;
 *  - une ARÊTE plus claire sur le dessus, qui détache le volume du fond ;
 *  - du DÉTAIL : nervures des conteneurs, fenêtres, roues.
 *
 * Rendu en SVG et non en transformations CSS 3D : la capture image par image
 * de l'export y est plus fiable, et les faces restent nettes en 1920x1080.
 */

const COS30 = Math.cos(Math.PI / 6);
const SIN30 = 0.5;

/** Origine commune du repère isométrique dans le cadre 1920x1080. */
export const ISO_ORIGIN = { x: 930, y: 560 };

/** Échelle commune à toutes les scènes, pour que les volumes se comparent. */
export const ISO_SCALE = 30;

/** Projette un point du repère isométrique vers le plan de l'écran. */
export function project(x, y, z, scale = ISO_SCALE) {
  return [
    (x - y) * COS30 * scale,
    ((x + y) * SIN30 - z) * scale,
  ];
}

function pts(list, scale) {
  return list.map(([x, y, z]) => project(x, y, z, scale).map((n) => n.toFixed(2)).join(',')).join(' ');
}

/**
 * Teintes. Chaque volume reçoit trois valeurs d'une même couleur ; les
 * dégradés sont déclinés depuis elles dans `defs()`.
 */
export const TONES = {
  white: { top: '#FFFFFF', topEnd: '#EEF3F9', right: '#DCE4EF', rightEnd: '#C9D4E3', left: '#C2CEDF', leftEnd: '#AEBCD1' },
  blue: { top: '#3C7BD9', topEnd: '#2F6FD0', right: '#265EB4', rightEnd: '#1E5099', left: '#1B4A8C', leftEnd: '#163C73' },
  navy: { top: '#125FB0', topEnd: '#0E56A4', right: '#0C4379', rightEnd: '#0A3763', left: '#08304F', leftEnd: '#06263F' },
  accent: { top: '#FBA450', topEnd: '#F59433', right: '#E8780B', rightEnd: '#CC6A09', left: '#B65E08', leftEnd: '#9C5007' },
  slate: { top: '#4A5A6B', topEnd: '#3E4D5C', right: '#32404D', rightEnd: '#28343F', left: '#222C36', leftEnd: '#1A232B' },
};

const FACE_KEYS = [['top', 'topEnd'], ['right', 'rightEnd'], ['left', 'leftEnd']];

/** Dégradés et filtres partagés. À poser une fois par scène. */
export function defs() {
  const gradients = Object.entries(TONES).flatMap(([name, tone]) => FACE_KEYS.map(([a, b], i) => {
    const vertical = i === 0 ? '' : ' x1="0" y1="0" x2="0" y2="1"';
    return `<linearGradient id="g-${name}-${a}"${vertical ? vertical : ' x1="0" y1="0" x2="1" y2="1"'}>`
      + `<stop offset="0" stop-color="${tone[a]}"/><stop offset="1" stop-color="${tone[b]}"/>`
      + '</linearGradient>';
  })).join('');

  return '<defs>'
    + gradients
    + '<filter id="iso-shadow" x="-60%" y="-60%" width="220%" height="220%">'
    + '<feGaussianBlur stdDeviation="9"/></filter>'
    + '<filter id="iso-shadow-soft" x="-80%" y="-80%" width="260%" height="260%">'
    + '<feGaussianBlur stdDeviation="20"/></filter>'
    + '</defs>';
}

/** Ombre de contact : l'empreinte au sol, décalée, floutée, très transparente. */
function contactShadow({ x, y, w, d }, scale, soft = false) {
  const spread = soft ? 0.5 : 0.25;
  const quad = pts([
    [x - spread + 0.45, y - spread + 0.45, 0],
    [x + w + spread + 0.45, y - spread + 0.45, 0],
    [x + w + spread + 0.45, y + d + spread + 0.45, 0],
    [x - spread + 0.45, y + d + spread + 0.45, 0],
  ], scale);
  return `<polygon points="${quad}" fill="#0B2A4A" opacity="${soft ? 0.1 : 0.16}" `
    + `filter="url(#${soft ? 'iso-shadow-soft' : 'iso-shadow'})"/>`;
}

/**
 * Un pavé droit posé en (x, y, z), de dimensions (w, d, h).
 * `detail` ajoute les nervures d'un conteneur, `windows` une trame de fenêtres.
 */
export function box(opts, scale = ISO_SCALE) {
  const {
    x = 0, y = 0, z = 0, w = 1, d = 1, h = 1,
    tone = 'white', id = '', shadow = true, detail = null, cls = '',
  } = opts;

  const top = pts([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]], scale);
  const right = pts([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]], scale);
  const left = pts([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]], scale);

  const faces = `<polygon points="${left}" fill="url(#g-${tone}-left)"/>`
    + `<polygon points="${right}" fill="url(#g-${tone}-right)"/>`
    + `<polygon points="${top}" fill="url(#g-${tone}-top)"/>`
    // Arête supérieure : un filet clair qui détache le volume du fond.
    + `<polygon points="${top}" fill="none" stroke="#FFFFFF" stroke-opacity=".45" stroke-width="1.2"/>`;

  return `<g class="iso-box${cls ? ` ${cls}` : ''}"${id ? ` id="${id}"` : ''}>`
    + (shadow && z === 0 ? contactShadow({ x, y, w, d }, scale) : '')
    + faces
    + (detail === 'container' ? corrugation(opts, scale) : '')
    + (detail === 'windows' ? windows(opts, scale, false) : '')
    + (detail === 'windows-light' ? windows(opts, scale, true) : '')
    + '</g>';
}

/** Nervures verticales d'un conteneur, sur les deux flancs visibles. */
function corrugation({ x, y, z = 0, w, d, h }, scale) {
  const lines = [];
  for (let i = 1; i < Math.round(w * 4); i += 1) {
    const px = x + (i / (w * 4)) * w;
    const [x1, y1] = project(px, y + d, z + 0.06, scale);
    const [x2, y2] = project(px, y + d, z + h - 0.06, scale);
    lines.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#000" stroke-opacity=".09" stroke-width="1.1"/>`);
  }
  for (let i = 1; i < Math.round(d * 4); i += 1) {
    const py = y + (i / (d * 4)) * d;
    const [x1, y1] = project(x + w, py, z + 0.06, scale);
    const [x2, y2] = project(x + w, py, z + h - 0.06, scale);
    lines.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#000" stroke-opacity=".07" stroke-width="1.1"/>`);
  }
  return lines.join('');
}

/** Trame de fenêtres sur les deux flancs visibles d'un bâtiment. */
function windows({ x, y, z = 0, w, d, h }, scale, light = false) {
  const cells = [];
  const rows = Math.max(1, Math.floor(h / 0.75));
  const colsLeft = Math.max(1, Math.floor(w / 0.8));
  const colsRight = Math.max(1, Math.floor(d / 0.8));

  for (let r = 0; r < rows; r += 1) {
    const zb = z + 0.28 + r * 0.75;
    const zt = zb + 0.38;
    for (let c = 0; c < colsLeft; c += 1) {
      const a = x + 0.26 + c * 0.8;
      const b = a + 0.44;
      cells.push(`<polygon points="${pts([[a, y + d, zb], [b, y + d, zb], [b, y + d, zt], [a, y + d, zt]], scale)}" fill="${light ? '#CFE1F6' : '#1B4A8C'}" opacity="${light ? 0.82 : 0.5}"/>`);
    }
    for (let c = 0; c < colsRight; c += 1) {
      const a = y + 0.26 + c * 0.8;
      const b = a + 0.44;
      cells.push(`<polygon points="${pts([[x + w, a, zb], [x + w, b, zb], [x + w, b, zt], [x + w, a, zt]], scale)}" fill="${light ? '#E2EDF9' : '#265EB4'}" opacity="${light ? 0.78 : 0.45}"/>`);
    }
  }
  return cells.join('');
}

/** Une dalle plate : un sol, une route, un plan d'eau. */
export function slab({ x = 0, y = 0, z = 0, w = 1, d = 1, fill = '#F2F6FB', id = '', opacity = 1, stroke = null }, scale = ISO_SCALE) {
  const quad = pts([[x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z]], scale);
  return `<polygon class="iso-slab"${id ? ` id="${id}"` : ''} points="${quad}" fill="${fill}" opacity="${opacity}"`
    + (stroke ? ` stroke="${stroke}" stroke-width="1.5"` : '') + '/>';
}

/** Une polyligne au sol, pour un itinéraire. */
export function path({ pts: list, stroke = '#0E56A4', width = 4, dash = '12 14', id = '', cap = 'round' }, scale = ISO_SCALE) {
  const d = list
    .map(([x, y, z = 0.02], i) => `${i === 0 ? 'M' : 'L'}${project(x, y, z, scale).map((n) => n.toFixed(1)).join(' ')}`)
    .join(' ');
  return `<path${id ? ` id="${id}"` : ''} d="${d}" fill="none" stroke="${stroke}" `
    + `stroke-width="${width}" ${dash ? `stroke-dasharray="${dash}" ` : ''}stroke-linecap="${cap}" stroke-linejoin="round"/>`;
}

/** Un ruban épais au sol, comme les connecteurs orange de la référence. */
export function ribbon({ pts: list, color = '#F17D0C', width = 13, id = '' }, scale = ISO_SCALE) {
  const d = list
    .map(([x, y, z = 0.03], i) => `${i === 0 ? 'M' : 'L'}${project(x, y, z, scale).map((n) => n.toFixed(1)).join(' ')}`)
    .join(' ');
  return `<g${id ? ` id="${id}"` : ''}>`
    + `<path d="${d}" fill="none" stroke="#0B2A4A" stroke-opacity=".14" stroke-width="${width + 5}" stroke-linecap="round" stroke-linejoin="round" filter="url(#iso-shadow)"/>`
    + `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`
    + `<path d="${d}" fill="none" stroke="#FFFFFF" stroke-opacity=".25" stroke-width="${width * 0.3}" stroke-linecap="round" stroke-linejoin="round"/>`
    + '</g>';
}

/** Un repère posé à plat, comme les points d'étape d'une carte. */
export function pin({ x, y, z = 0.02, r = 9, fill = '#F17D0C', id = '' }, scale = ISO_SCALE) {
  const [cx, cy] = project(x, y, z, scale);
  return `<g${id ? ` id="${id}"` : ''}>`
    + `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${r * 1.9}" ry="${r * 1.1}" fill="${fill}" opacity=".18"/>`
    + `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${r}" ry="${r * 0.58}" fill="${fill}"/>`
    + `<ellipse cx="${cx.toFixed(1)}" cy="${(cy - r * 0.18).toFixed(1)}" rx="${r * 0.45}" ry="${r * 0.26}" fill="#FFFFFF" opacity=".55"/>`
    + '</g>';
}

/** Sol partagé : dalle claire et liseré, pour que les volumes se posent. */
export function groundPlane() {
  return slab({ x: -10.5, y: -7.5, w: 21, d: 15, fill: '#E6EDF6', id: 'iso-ground' })
    + slab({ x: -10.1, y: -7.1, w: 20.2, d: 14.2, fill: '#F4F8FC', id: 'iso-ground-inner' });
}

/** Crée un nœud SVG à partir d'un fragment de balisage. */
export function svgNode(markup, doc) {
  if (!doc.createElementNS) {
    const fake = doc.createElement('g');
    fake.innerHTML = markup;
    return fake;
  }
  const holder = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
  holder.innerHTML = markup;
  return holder;
}
