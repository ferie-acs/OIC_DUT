/** Lueur bleue au sol devant un quai. */
import * as THREE from 'three';
import { PALETTE } from '../palette.js';
import { canvasTexture } from '../models/kit.js';

export function createGlow() {
  const tex = canvasTexture(256, 256, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, 'rgba(91, 168, 222, 0.95)');
    grad.addColorStop(0.6, 'rgba(26, 91, 166, 0.35)');
    grad.addColorStop(1, 'rgba(26, 91, 166, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
  const mat = new THREE.MeshBasicMaterial({ map: tex, color: PALETTE.blanc, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const object = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), mat);
  object.rotation.x = -Math.PI / 2;
  object.position.y = 0.09;
  object.renderOrder = 3;
  return {
    object,
    update(k, at) {
      object.visible = k !== null && k > 0;
      if (!object.visible) return;
      object.position.set(at[0], 0.09, at[1]);
      mat.opacity = k;
    },
  };
}
