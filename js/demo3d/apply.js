/** Applique un état (stateAt) à la scène. Aucun calcul de temps ici. */
import { BARRIER_OPEN_ANGLE } from './models/checkpoint.js';

export function place(obj, { x, z, heading }) {
  obj.position.set(x, 0, z);
  obj.rotation.y = heading;
}

export function applyState(world, stage, s) {
  stage.frame(s.camera);
  place(world.truck, s.truck);

  place(world.forklift, s.forklift);
  world.forklift.userData.carriage.position.y = s.forklift.forkHeight;
  world.forklift.userData.pallet.visible = s.forklift.carrying;

  // Bras vers +z : une rotation négative autour de x le lève.
  world.checkpoint.userData.arm.rotation.x = -BARRIER_OPEN_ANGLE * s.fx.barrier;

  for (const t of s.traffic) place(world.traffic.get(t.id), t);
}
