/** Assemble le monde et retourne les références animées. */
import { PALETTE } from '../palette.js';
import { buildGround } from './ground.js';
import { createTruck } from '../models/truck.js';

export async function buildWorld(scene) {
  buildGround(scene);
  const truck = createTruck({ cab: PALETTE.orange, stripe: PALETTE.vert, brand: 'TRANSPORTS ÉBRIÉ', wave: true });
  scene.add(truck);
  return { truck };
}
