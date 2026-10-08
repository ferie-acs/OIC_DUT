/**
 * Primitive « flux » : le trait qui relie deux acteurs et porte le document.
 * spec : { id, from, to, at, reverse }
 */
export const kind = 'flow';

export function build(spec, doc) {
  const el = doc.createElement('div');
  el.className = `sc-flow${spec.reverse ? ' is-reverse' : ''}`;
  el.dataset.stageId = spec.id || '';
  el.dataset.from = spec.from || '';
  el.dataset.to = spec.to || '';

  const line = doc.createElement('span');
  line.className = 'sc-flow-line';
  el.appendChild(line);

  return el;
}

export function animate(tl, el, spec, offsetMs) {
  tl.add(el, {
    opacity: [0, 1],
    width: ['0%', '100%'],
    duration: 900,
    ease: 'inOut(2)',
  }, offsetMs + (spec.at || 0));
}
