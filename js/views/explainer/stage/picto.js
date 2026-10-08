/**
 * Primitive « picto » : une icône Lucide et son libellé.
 * spec : { id, icon, label, slot, at }
 *
 * `slot` (1, 2 ou 3) porte la POSITION, qui est de la mise en page et non du
 * mouvement. Elle vient de la donnee et jamais du rang dans le DOM : la scene
 * 3.5 n'a pas de titre, donc un selecteur nth-of-type en superposait deux.
 */
import { icon as lucide } from '../../../core/icons.js';

export const kind = 'picto';

export function build(spec, doc) {
  const el = doc.createElement('div');
  el.className = 'sc-picto';
  el.dataset.stageId = spec.id || '';
  el.dataset.slot = String(spec.slot || 1);

  const iconBox = doc.createElement('span');
  iconBox.className = 'sc-picto-icon';
  iconBox.dataset.icon = spec.icon || '';
  // Icone Lucide vendorisee du projet : un carre vide ne dit rien, le glyphe si.
  iconBox.innerHTML = lucide(spec.icon, { size: 64, cls: 'sc-picto-glyph' });
  el.appendChild(iconBox);

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
