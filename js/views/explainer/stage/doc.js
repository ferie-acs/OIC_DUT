/**
 * Primitive « document » : une feuille DUT, éventuellement numérotée et porteuse d'un QR.
 * spec : { id, label, at, x, dimmed, number, qr, from }
 */
export const kind = 'doc';

export function build(spec, doc) {
  const el = doc.createElement('div');
  el.className = `sc-doc${spec.dimmed ? ' is-dimmed' : ''}`;
  el.dataset.stageId = spec.id || '';
  if (Number.isFinite(spec.x)) el.dataset.x = String(spec.x);

  const label = doc.createElement('span');
  label.className = 'sc-doc-label';
  label.textContent = spec.label || 'DUT';
  el.appendChild(label);

  if (spec.number) {
    const number = doc.createElement('span');
    number.className = 'sc-doc-number';
    number.textContent = spec.number;
    el.appendChild(number);
  }
  if (spec.qr) {
    const qr = doc.createElement('span');
    qr.className = 'sc-doc-qr';
    el.appendChild(qr);
  }
  return el;
}

export function animate(tl, el, spec, offsetMs) {
  const x = Number.isFinite(spec.x) ? spec.x : 0;
  const fromY = spec.from === 'bottom' ? 60 : 0;
  tl.add(el, {
    opacity: [0, 1],
    translateX: [x, x],
    translateY: [fromY, 0],
    duration: 600,
    ease: 'out(3)',
  }, offsetMs + (spec.at || 0));
}
