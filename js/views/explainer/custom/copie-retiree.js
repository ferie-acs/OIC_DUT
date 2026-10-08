/**
 * Scène pivot du chapitre 3 : un DUT, sa photocopie, le scan, et la réponse du
 * système. Sur mesure parce que la séquence enchaîne quatre états liés sur un
 * même objet — ce qu'aucune primitive ne sait faire.
 */
export const id = 'copie-retiree';

export function build(scene, doc) {
  const el = doc.createElement('div');
  el.className = 'sc-custom sc-copie-retiree';

  const original = doc.createElement('div');
  original.className = 'sc-doc sc-copie-original';
  original.dataset.stageId = 'original';
  el.appendChild(original);

  const copy = doc.createElement('div');
  copy.className = 'sc-doc sc-copie-copie';
  copy.dataset.stageId = 'copie';
  el.appendChild(copy);

  const beam = doc.createElement('div');
  beam.className = 'sc-copie-beam';
  el.appendChild(beam);

  const verdict = doc.createElement('div');
  verdict.className = 'sc-copie-verdict';
  verdict.textContent = 'RETIRÉ';
  el.appendChild(verdict);

  return el;
}

export function animate(tl, el, scene, offsetMs) {
  const q = (selector) => (typeof el.querySelector === 'function' ? el.querySelector(selector) : null);
  const add = (selector, props, at) => { const node = q(selector); if (node) tl.add(node, props, at); };

  add('.sc-copie-original', { opacity: [0, 1], duration: 500 }, offsetMs);
  add('.sc-copie-copie', { opacity: [0, 1], translateX: [0, 240], duration: 700 }, offsetMs + 2000);
  add('.sc-copie-beam', { opacity: [0, 1, 0], scaleY: [0, 1, 1], duration: 1200 }, offsetMs + 4500);
  add('.sc-copie-verdict', { opacity: [0, 1], scale: [1.35, 1], duration: 600 }, offsetMs + 6500);
}
