/** Sol, route (axe X, z = 0), accotements en latérite, marquages, dalles, lagune. */
import * as THREE from 'three';
import { PALETTE } from '../palette.js';
import { flat, at } from '../models/kit.js';
import { ROAD } from './layout.js';

export function buildGround(scene) {
  const g = new THREE.Group();
  const length = ROAD.toX - ROAD.fromX;
  const midX = (ROAD.fromX + ROAD.toX) / 2;

  g.add(at(flat(420, 320, PALETTE.sol, 0), 10, 0, -10));
  // Dalles : site partenaire + antenne, port, destination
  g.add(at(flat(46, 26, PALETTE.dalle, 0.01), -24, 0.01, -23));
  g.add(at(flat(30, 70, PALETTE.dalle, 0.01), -57, 0.01, -10));
  g.add(at(flat(28, 22, PALETTE.dalle, 0.01), 78, 0.01, -20));
  // Accès des sites à la route
  g.add(at(flat(8, 8, PALETTE.route, 0.015), -28, 0.015, -7));
  g.add(at(flat(8, 6, PALETTE.route, 0.015), 77, 0.015, -6));

  // Accotements en latérite, chaussée, rives et axe pointillé
  for (const side of [-1, 1]) g.add(at(flat(length, 2.2, PALETTE.laterite, 0.012), midX, 0.012, side * (ROAD.width / 2 + 1.1)));
  g.add(at(flat(length, ROAD.width, PALETTE.route, 0.02), midX, 0.02, 0));
  for (const side of [-1, 1]) g.add(at(flat(length, 0.18, PALETTE.marquage, 0.03), midX, 0.03, side * (ROAD.width / 2 - 0.4)));
  for (let x = ROAD.fromX + 2; x < ROAD.toX; x += 6) g.add(at(flat(3, 0.22, PALETTE.marquage, 0.03), x, 0.03, 0));

  // Lagune Ébrié à l'ouest du quai
  g.add(at(flat(140, 320, PALETTE.lagune, -0.5), -142, -0.5, -10));
  scene.add(g);
  return g;
}
