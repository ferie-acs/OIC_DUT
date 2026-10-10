/** Chariot élévateur jaune, fourche vers +z, palette amovible. */
import * as THREE from 'three';
import { PALETTE } from '../palette.js';
import { rbox, cyl, at, contactShadow } from './kit.js';

export const FORKLIFT_SIZE = Object.freeze({ w: 1.6, h: 2.6, d: 3.0 });

export function createForklift() {
  const g = new THREE.Group();
  g.add(contactShadow(2.4, 3.6, 0.3));
  g.add(at(rbox(1.4, 0.9, 2.0, 0.22, PALETTE.chariot), 0, 0.85, -0.1));
  g.add(at(rbox(1.3, 0.7, 0.6, 0.2, PALETTE.chariot), 0, 1.0, -1.05));
  // Protège-conducteur
  for (const x of [-0.6, 0.6]) for (const z of [-0.7, 0.6]) g.add(at(rbox(0.08, 1.3, 0.08, 0.03, PALETTE.pneu), x, 1.95, z));
  g.add(at(rbox(1.35, 0.08, 1.45, 0.03, PALETTE.pneu), 0, 2.6, -0.05));
  // Conducteur
  g.add(at(cyl(0.28, 0.3, 0.7, PALETTE.gilet, 12), 0, 1.65, -0.3));
  g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), new THREE.MeshStandardMaterial({ color: PALETTE.peau })), 0, 2.15, -0.3));
  // Mât
  for (const x of [-0.45, 0.45]) g.add(at(rbox(0.12, 2.6, 0.12, 0.03, PALETTE.pneu), x, 1.4, 1.0));
  // Tablier + fourches (montent ensemble)
  const carriage = new THREE.Group();
  carriage.add(at(rbox(1.1, 0.5, 0.1, 0.03, PALETTE.pneu), 0, 0.25, 1.1));
  for (const x of [-0.3, 0.3]) carriage.add(at(rbox(0.12, 0.07, 1.2, 0.02, PALETTE.acier), x, 0.04, 1.7));
  const pallet = new THREE.Group();
  pallet.add(at(rbox(1.1, 0.15, 1.1, 0.03, PALETTE.bois), 0, 0.15, 1.75));
  pallet.add(at(rbox(1.0, 0.8, 1.0, 0.08, PALETTE.carton), 0, 0.65, 1.75));
  carriage.add(pallet);
  g.add(carriage);
  // Roues
  for (const z of [-0.8, 0.6]) for (const side of [-1, 1]) {
    const wheel = cyl(0.3, 0.3, 0.25, PALETTE.pneu, 16);
    wheel.rotation.z = Math.PI / 2;
    g.add(at(wheel, side * 0.72, 0.3, z));
  }
  g.userData = { carriage, pallet, size: FORKLIFT_SIZE };
  return g;
}
