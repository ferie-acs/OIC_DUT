/** Point d'arrivée : anneau qui pulse au sol + repère en goutte qui flotte. */
import * as THREE from 'three';
import { PALETTE } from '../palette.js';

export function createPulse() {
  const object = new THREE.Group();
  const ringMat = new THREE.MeshBasicMaterial({ color: PALETTE.royal, transparent: true, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.25, 48), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.08;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.8, 32), new THREE.MeshBasicMaterial({ color: PALETTE.royal, transparent: true, opacity: 0.35, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.075;
  const pin = new THREE.Group();
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.7, 24, 16), new THREE.MeshStandardMaterial({ color: PALETTE.royal, roughness: 0.5 }));
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 24), head.material);
  tip.rotation.x = Math.PI;
  tip.position.y = -0.75;
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), new THREE.MeshBasicMaterial({ color: '#FFFFFF' }));
  dot.position.set(0, 0.1, 0.5);
  pin.add(head, tip, dot);
  object.add(ring, disc, pin);
  return {
    object,
    update(pulse) {
      object.visible = pulse !== null;
      if (!pulse) return;
      object.position.set(pulse.at[0], 0, pulse.at[1]);
      ring.scale.setScalar(1 + pulse.phase * 2.2);
      ringMat.opacity = (1 - pulse.phase) * 0.8;
      pin.position.y = 3.2 + 0.35 * Math.sin(pulse.phase * Math.PI * 2);
    },
  };
}
