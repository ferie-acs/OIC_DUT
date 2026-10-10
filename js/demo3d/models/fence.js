/** Clôture grillagée légère entre deux points du sol. */
import * as THREE from 'three';
import { rbox, at, mat } from './kit.js';

export function createFence([x1, z1], [x2, z2]) {
  const g = new THREE.Group();
  const len = Math.hypot(x2 - x1, z2 - z1);
  const n = Math.max(1, Math.round(len / 3));
  for (let i = 0; i <= n; i += 1) {
    const k = i / n;
    g.add(at(rbox(0.12, 1.6, 0.12, 0.04, '#AEB7C2'), x1 + (x2 - x1) * k, 0.8, z1 + (z2 - z1) * k));
  }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.08), mat('#AEB7C2'));
  rail.position.set((x1 + x2) / 2, 1.55, (z1 + z2) / 2);
  rail.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
  g.add(rail);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(len, 1.4),
    new THREE.MeshStandardMaterial({ color: '#C9D6E2', transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
  );
  mesh.position.set((x1 + x2) / 2, 0.8, (z1 + z2) / 2);
  mesh.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
  g.add(mesh);
  return g;
}
