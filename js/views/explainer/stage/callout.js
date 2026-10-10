/**
 * Primitive « annotation » : une étiquette ancrée sur un autre élément de scène.
 * spec : { text, at, anchor, tone }
 */
export const kind = 'callout';

export function build(spec, doc) {
  const el = doc.createElement('div');
  el.className = 'sc-callout';
  el.dataset.anchor = spec.anchor || '';
  el.dataset.tone = spec.tone || 'neutral';
  el.textContent = spec.text || '';
  return el;
}

export function animate(tl, el, spec, offsetMs) {
  tl.add(el, {
    opacity: [0, 1],
    translateY: [10, 0],
    duration: 450,
    ease: 'out(3)',
  }, offsetMs + (spec.at || 0));
}
