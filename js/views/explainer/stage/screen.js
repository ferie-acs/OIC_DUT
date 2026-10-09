/**
 * Primitive « écran » : une capture réelle du POC, cadrée serré et annotable.
 * spec : { src, alt, at, highlight, highlightAt }
 *
 * Si l'image ne charge pas, le conteneur reçoit `is-missing` et le cadre de
 * remplacement — qui nomme le fichier attendu — devient visible. Jamais
 * d'image brisée, jamais de trou silencieux dans la scène.
 */
export const kind = 'screen';

export function build(spec, doc) {
  const el = doc.createElement('div');
  el.className = 'sc-screen';
  el.dataset.ratio = '16:9';

  const img = doc.createElement('img');
  img.className = 'sc-screen-img';
  img.setAttribute('src', `assets/explainer/${spec.src}`);
  img.setAttribute('alt', spec.alt || '');
  img.addEventListener('error', () => {
    el.className = 'sc-screen is-missing';
  });
  el.appendChild(img);

  const fallback = doc.createElement('span');
  fallback.className = 'sc-screen-fallback';
  fallback.textContent = `Capture manquante : ${spec.src}`;
  el.appendChild(fallback);

  if (spec.highlight) {
    const ring = doc.createElement('span');
    ring.className = 'sc-screen-ring';
    el.appendChild(ring);
  }
  return el;
}

export function animate(tl, el, spec, offsetMs) {
  const start = offsetMs + (spec.at || 0);
  tl.add(el, { opacity: [0, 1], scale: [1.04, 1], duration: 800, ease: 'out(3)' }, start);

  const ring = typeof el.querySelector === 'function' ? el.querySelector('.sc-screen-ring') : null;
  if (ring) {
    tl.add(ring, {
      opacity: [0, 1],
      scale: [1.12, 1],
      duration: 600,
      ease: 'out(3)',
    }, offsetMs + (spec.highlightAt || spec.at || 0));
  }
}
