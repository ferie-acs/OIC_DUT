/** Jeton « dossier DUT » qui voyage de l'entrepôt à l'antenne et revient. */
import * as THREE from 'three';
import { PALETTE } from '../palette.js';
import { rbox, at } from '../models/kit.js';

export function createDocumentToken() {
  const object = new THREE.Group();
  const card = new THREE.Group();
  card.add(rbox(1.2, 0.08, 1.6, 0.04, '#FFFFFF'));
  card.add(at(rbox(1.2, 0.1, 0.35, 0.03, PALETTE.royal), 0, 0.02, -0.62));
  for (const z of [-0.15, 0.1, 0.35]) card.add(at(rbox(0.8, 0.1, 0.08, 0.02, '#C9D3DE'), 0, 0.02, z));
  card.rotation.x = -0.5;
  object.add(card);
  return {
    object,
    update(doc, ms) {
      object.visible = doc.visible;
      if (!doc.visible) return;
      object.position.set(doc.x, 1.8 + 0.2 * Math.sin((ms / 1000) * Math.PI * 1.6), doc.z);
      object.rotation.y = doc.heading;
    },
  };
}
