/**
 * Primitive « picto » : une icône Lucide et son libellé.
 * spec : { id, icon, label, slot, at }
 *
 * `slot` (1, 2 ou 3) porte la POSITION, qui est de la mise en page et non du
 * mouvement. Elle vient de la donnee et jamais du rang dans le DOM : la scene
 * 3.5 n'a pas de titre, donc un selecteur nth-of-type en superposait deux.
 */
export const kind = 'picto';

export function build(spec, doc) {
  const el = doc.createElement('div');
  el.className = 'sc-picto';
  el.dataset.stageId = spec.id || '';
  el.dataset.slot = String(spec.slot || 1);

  const icon = doc.createElement('span');
  icon.className = 'sc-picto-icon';
  icon.dataset.icon = spec.icon || '';
  el.appendChild(icon);

  const label = doc.createElement('span');
  label.className = 'sc-picto-label';
  label.textContent = spec.label || '';
  el.appendChild(label);

  return el;
}

export function animate(tl, el, spec, offsetMs) {
  tl.add(el, {
    opacity: [0, 1],
    translateY: [14, 0],
    duration: 520,
    ease: 'out(3)',
  }, offsetMs + (spec.at || 0));
}
