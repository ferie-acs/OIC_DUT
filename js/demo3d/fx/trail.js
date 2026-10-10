/** Trajet au sol : ruban plein derrière l'avancement u, points devant. */
import * as THREE from 'three';
import { sampleAt, dotAhead } from '../path.js';

const Y = 0.07;

/** stops : avancements des demi-tours (ex. [0.5] pour un aller-retour). */
export function createTrail(path, { solid, dashed, width = 0.9, step = 0.5, dashEvery = 1.6, stops = [] }) {
  const object = new THREE.Group();
  const n = Math.max(2, Math.ceil(path.length / step) + 1);
  const pts = Array.from({ length: n }, (_, i) => sampleAt(path, i / (n - 1)));
  const pos = new Float32Array((n - 1) * 6 * 3);
  let o = 0;
  const edge = (p, side) => [p.x + Math.cos(p.heading) * side * (width / 2), Y, p.z - Math.sin(p.heading) * side * (width / 2)];
  for (let i = 0; i < n - 1; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    const quad = [edge(a, 1), edge(a, -1), edge(b, 1), edge(a, -1), edge(b, -1), edge(b, 1)];
    for (const v of quad) { pos.set(v, o); o += 3; }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const ribbon = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: solid, side: THREE.DoubleSide }));
  ribbon.renderOrder = 2;
  object.add(ribbon);

  const dots = [];
  const dotGeo = new THREE.CircleGeometry(0.28, 16);
  const dotMat = new THREE.MeshBasicMaterial({ color: dashed });
  const count = Math.floor(path.length / dashEvery);
  for (let i = 1; i <= count; i += 1) {
    const u = (i * dashEvery) / path.length;
    const p = sampleAt(path, u);
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.rotation.x = -Math.PI / 2;
    dot.position.set(p.x, Y, p.z);
    dot.renderOrder = 2;
    object.add(dot);
    dots.push({ dot, u });
  }

  return {
    object,
    update(u) {
      object.visible = u !== null;
      if (u === null) return;
      geo.setDrawRange(0, Math.floor(u * (n - 1)) * 6);
      for (const { dot, u: du } of dots) dot.visible = dotAhead(du, u, stops);
    },
  };
}
