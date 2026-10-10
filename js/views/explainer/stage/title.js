/**
 * Primitive « titre » : kicker optionnel et titre de scène.
 * spec : { kicker, title, variant, at }
 */
export const kind = 'title';

export function build(spec, doc) {
  const el = doc.createElement('div');
  el.className = `sc-title${spec.variant === 'card' ? ' is-card' : ''}`;

  if (spec.kicker) {
    const kicker = doc.createElement('span');
    kicker.className = 'sc-kicker';
    kicker.textContent = spec.kicker;
    el.appendChild(kicker);
  }

  const text = doc.createElement('span');
  text.className = 'sc-title-text';
  text.textContent = spec.title || '';
  el.appendChild(text);

  return el;
}

export function animate(tl, el, spec, offsetMs) {
  tl.add(el, {
    opacity: [0, 1],
    translateY: [18, 0],
    duration: 700,
    ease: 'out(3)',
  }, offsetMs + (spec.at || 0));
}
