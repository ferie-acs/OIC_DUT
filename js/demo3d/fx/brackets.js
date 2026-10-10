/** Crochets de sélection aux 8 coins d'une boîte englobante qui suit la cible. */
import * as THREE from 'three';
import { PALETTE } from '../palette.js';

const PAD = 0.5;
const T = 0.12;

export function createBrackets({ w, h, d }) {
  const object = new THREE.Group();
  const inner = new THREE.Group();
  object.add(inner);
  const mat = new THREE.MeshBasicMaterial({ color: PALETTE.royal });
  const W = w + PAD * 2;
  const H = h + PAD;
  const D = d + PAD * 2;
  const L = Math.min(W, H, D) * 0.28;
  for (const sx of [-1, 1]) for (const sy of [0, 1]) for (const sz of [-1, 1]) {
    const cx = (sx * W) / 2;
    const cy = sy * H;
    const cz = (sz * D) / 2;
    const arms = [
      [L, T, T, cx - (sx * L) / 2, cy, cz],
      [T, L, T, cx, cy + (sy ? -L / 2 : L / 2), cz],
      [T, T, L, cx, cy, cz - (sz * L) / 2],
    ];
    for (const [aw, ah, ad, x, y, z] of arms) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(aw, ah, ad), mat);
      m.position.set(x, y, z);
      inner.add(m);
    }
  }
  return {
    object,
    update(target, ms) {
      object.visible = target !== null;
      if (!target) return;
      object.position.set(target.x, 0, target.z);
      object.rotation.y = target.heading;
      inner.scale.setScalar(1 + 0.025 * Math.sin((ms / 1000) * Math.PI * 2));
    },
  };
}
