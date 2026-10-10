/** Applique un état (stateAt) à la scène. Aucun calcul de temps ici. */
import { BARRIER_OPEN_ANGLE } from './models/checkpoint.js';
import { PLACES } from './scenario.js';

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

  for (const t of s.traffic) {
    const obj = world.traffic.get(t.id);
    obj.visible = t.visible;
    place(obj, t);
  }

  const { fx } = world;
  fx.truckTrail.update(s.fx.truckTrail);
  fx.documentTrail.update(s.fx.documentTrail);
  fx.pulse.update(s.fx.pulse);
  fx.bracketsTruck.update(s.fx.brackets === 'truck' ? s.truck : null, s.ms);
  fx.bracketsForklift.update(s.fx.brackets === 'forklift' ? s.forklift : null, s.ms);
  const glowAt = s.fx.glow?.at === 'antenne' ? PLACES.antenneDock : PLACES.destinationDock;
  fx.glow.update(s.fx.glow ? s.fx.glow.k : null, glowAt);
  fx.scan.update(s.fx.scan);
  fx.docToken.update(s.doc, s.ms);
}
