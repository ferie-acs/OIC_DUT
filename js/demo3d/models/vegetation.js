/** Arbres ronds et palmiers, formes douces « pâte à modeler ». Déterministe. */
import * as THREE from 'three';
import { PALETTE } from '../palette.js';
import { cyl, at, mat, contactShadow } from './kit.js';

function blob(radius, hex) {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 3), mat(hex, { roughness: 0.9 }));
  m.castShadow = true;
  return m;
}

export function createTree(scale = 1) {
  const g = new THREE.Group();
  g.add(contactShadow(3.2, 3.2, 0.25));
  g.add(at(cyl(0.18, 0.25, 2.2, PALETTE.tronc, 10), 0, 1.1, 0));
  g.add(at(blob(1.5, PALETTE.feuillage), 0, 3.2, 0));
  g.add(at(blob(0.9, PALETTE.feuillageFonce), 0.7, 2.7, 0.5));
  g.scale.setScalar(scale);
  return g;
}

export function createPalm(scale = 1, lean = 0.1) {
  const g = new THREE.Group();
  g.add(contactShadow(3, 3, 0.2));
  const segments = 6;
  let x = 0;
  for (let i = 0; i < segments; i += 1) {
    x += lean * 0.6 * (i / segments);
    g.add(at(cyl(0.16, 0.2, 1.05, PALETTE.tronc, 10), x, 0.5 + i * 1.0, 0));
  }
  const top = new THREE.Group();
  top.position.set(x, segments * 1.0 + 0.2, 0);
  for (let i = 0; i < 7; i += 1) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), mat(PALETTE.palme, { roughness: 0.85 }));
    leaf.scale.set(0.32, 0.07, 1.9);
    leaf.castShadow = true;
    const pivot = new THREE.Group();
    pivot.rotation.y = (i / 7) * Math.PI * 2;
    leaf.position.z = 1.5;
    leaf.rotation.x = 0.45;
    pivot.add(leaf);
    top.add(pivot);
  }
  top.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), mat(PALETTE.tronc)), 0, -0.1, 0));
  g.add(top);
  g.scale.setScalar(scale);
  return g;
}
