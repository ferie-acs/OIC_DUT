/** Applique un état (stateAt) à la scène. Aucun calcul de temps ici. */
export function place(obj, { x, z, heading }) {
  obj.position.set(x, 0, z);
  obj.rotation.y = heading;
}

export function applyState(world, stage, s) {
  stage.frame(s.camera);
  place(world.truck, s.truck);
}
