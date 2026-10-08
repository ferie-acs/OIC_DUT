/**
 * Scène 1.2 : un transport quitte le port d'Abidjan.
 *
 * Représentation volontairement ABSTRAITE : un arc de littoral, le point
 * d'Abidjan, un tracé de route vers l'intérieur. Aucun contour national n'est
 * dessiné — inventer de mémoire la frontière de la Côte d'Ivoire dans une
 * vidéo institutionnelle OIC serait une faute. Pour une vraie carte, partir
 * d'une source géographique vérifiée (Natural Earth, GeoJSON officiel) avant
 * diffusion.
 */
export const id = 'carte-depart';

export function build(scene, doc) {
  const el = doc.createElement('div');
  el.className = 'sc-custom sc-carte-depart';

  const littoral = doc.createElement('div');
  littoral.className = 'sc-carte-littoral';
  el.appendChild(littoral);

  const port = doc.createElement('div');
  port.className = 'sc-carte-port';
  port.textContent = 'Port d’Abidjan';
  el.appendChild(port);

  const route = doc.createElement('div');
  route.className = 'sc-carte-route';
  el.appendChild(route);

  const camion = doc.createElement('div');
  camion.className = 'sc-carte-camion';
  el.appendChild(camion);

  const destination = doc.createElement('div');
  destination.className = 'sc-carte-destination';
  destination.textContent = 'Intérieur du pays · frontières';
  el.appendChild(destination);

  return el;
}

export function animate(tl, el, scene, offsetMs) {
  const q = (selector) => (typeof el.querySelector === 'function' ? el.querySelector(selector) : null);
  const add = (selector, props, at) => { const node = q(selector); if (node) tl.add(node, props, at); };

  add('.sc-carte-littoral', { opacity: [0, 1], duration: 900 }, offsetMs);
  add('.sc-carte-port', { opacity: [0, 1], scale: [0.85, 1], duration: 600 }, offsetMs + 900);
  add('.sc-carte-route', { opacity: [0, 1], width: ['0%', '100%'], duration: 2600, ease: 'inOut(2)' }, offsetMs + 2000);
  add('.sc-carte-camion', { opacity: [0, 1], translateX: [0, 980], duration: 2600, ease: 'inOut(2)' }, offsetMs + 2000);
  add('.sc-carte-destination', { opacity: [0, 1], duration: 700 }, offsetMs + 4800);
}
