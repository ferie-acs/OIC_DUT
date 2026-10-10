/** Scan du QR : faisceau qui monte du scanner « vers le système », anneau qui le parcourt. */
import * as THREE from 'three';
import { PALETTE } from '../palette.js';

const HEIGHT = 30;

export function createScan([x, y, z]) {
  const object = new THREE.Group();
  object.position.set(x, y, z);
  const beamMat = new THREE.MeshBasicMaterial({ color: PALETTE.ciel, transparent: true, depthWrite: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1, 12), beamMat);
  const ringMat = new THREE.MeshBasicMaterial({ color: PALETTE.royal, transparent: true, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.08, 8, 32), ringMat);
  ring.rotation.x = Math.PI / 2;
  object.add(beam, ring);
  return {
    object,
    update(p) {
      object.visible = p !== null;
      if (p === null) return;
      const grow = Math.min(1, p * 2.5);
      beam.scale.y = HEIGHT * grow;
      beam.position.y = (HEIGHT * grow) / 2;
      beamMat.opacity = 0.75 * (1 - Math.max(0, p - 0.8) / 0.2);
      ring.position.y = HEIGHT * ((p * 3) % 1);
      ringMat.opacity = 0.9 * (1 - p * 0.3);
    },
  };
}
