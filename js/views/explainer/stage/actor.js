/**
 * Primitive « acteur » : un intervenant de la chaîne DUT.
 * spec : { id, label, at, live, liveAt }
 */
export const kind = 'actor';

export function build(spec, doc) {
  const el = doc.createElement('div');
  el.className = `sc-actor${spec.live ? ' is-live' : ''}`;
  el.dataset.stageId = spec.id || '';

  const dot = doc.createElement('span');
  dot.className = 'sc-actor-dot';
  el.appendChild(dot);

  const label = doc.createElement('span');
  label.className = 'sc-actor-label';
  label.textContent = spec.label || '';
  el.appendChild(label);

  return el;
}

export function animate(tl, el, spec, offsetMs) {
  const start = offsetMs + (spec.at || 0);
  tl.add(el, { opacity: [0, 1], scale: [0.9, 1], duration: 520, ease: 'out(3)' }, start);
  if (spec.live) {
    tl.add(el, { scale: [1, 1.06, 1], duration: 500, ease: 'inOut(2)' }, offsetMs + (spec.liveAt || spec.at || 0));
  }
}
