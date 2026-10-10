/** Entrepôt à toit nervuré en bâtière, quais numérotés sur la face +z. */
import * as THREE from 'three';
import { PALETTE } from '../palette.js';
import { rbox, flat, at, mat, shade, canvasTexture, decal } from './kit.js';

const PITCH = 0.2;

function plateTexture(text, bg = PALETTE.marine) {
  return canvasTexture(256, 128, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#FFFFFF';
    g.font = '700 64px "Instrument Sans", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 4);
  });
}

function signTexture(text) {
  return canvasTexture(1024, 160, (g, w, h) => {
    g.fillStyle = '#FFFFFF';
    g.fillRect(0, 0, w, h);
    g.fillStyle = PALETTE.marine;
    g.font = '700 84px "Instrument Sans", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 6);
  });
}

function dock(x, z, number) {
  const g = new THREE.Group();
  g.add(at(rbox(2.8, 3.2, 0.25, 0.1, PALETTE.marine), x, 1.6, z + 0.05));
  g.add(at(rbox(2.2, 2.7, 0.2, 0.05, PALETTE.quai), x, 1.4, z + 0.12));
  g.add(at(rbox(1.6, 1.2, 0.7, 0.08, PALETTE.carton), x, 0.62, z - 0.05));
  g.add(at(rbox(1.7, 0.16, 0.8, 0.03, PALETTE.bois), x, 0.08, z - 0.05));
  const plate = decal(0.7, 0.35, plateTexture(String(number).padStart(2, '0')));
  g.add(at(plate, x, 3.45, z + 0.2));
  for (const side of [-1, 1]) {
    g.add(at(rbox(0.25, 0.5, 0.3, 0.06, PALETTE.pneu), x + side * 1.2, 0.35, z + 0.25));
    g.add(at(flat(0.15, 9, PALETTE.marquageJaune, 0.035), x + side * 1.7, 0.035, z + 4.6));
  }
  return g;
}

export function createWarehouse({ w, d, h, wall, roof, doors, facade, logo = null }) {
  const g = new THREE.Group();
  g.add(at(rbox(w, h, d, 0.25, wall), 0, h / 2, 0));

  // Pignons triangulaires
  const slabD = d / 2 + 0.7;
  const rise = Math.sin(PITCH) * slabD;
  const tri = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, rise)]);
  const prism = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: w, bevelEnabled: false }), mat(wall));
  prism.rotation.y = Math.PI / 2;
  prism.position.set(-w / 2, h, 0);
  prism.castShadow = true;
  g.add(prism);

  // Pans de toit nervurés
  const ribColor = shade(roof, 0.86);
  for (const side of [-1, 1]) {
    const slab = rbox(w + 0.8, 0.45, slabD, 0.15, roof);
    slab.position.set(0, h + 0.2 + rise / 2, side * (slabD / 2) * Math.cos(PITCH));
    slab.rotation.x = side * PITCH;
    for (let x = -w / 2 + 0.7; x < w / 2; x += 1.2) slab.add(at(rbox(0.14, 0.1, slabD - 0.3, 0.04, ribColor), x, 0.27, 0));
    if (logo && side === 1) {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(Math.min(2.6, slabD * 0.38), 48), new THREE.MeshStandardMaterial({ map: logo, roughness: 0.8 }));
      disc.rotation.x = -Math.PI / 2;
      slab.add(at(disc, -w / 4, 0.24, 0));
    }
    g.add(slab);
  }

  // Quais sur la face +z
  for (let i = 0; i < doors; i += 1) {
    const x = -w / 2 + (i + 0.5) * (w / doors);
    g.add(dock(x, d / 2, i + 1));
  }

  // Enseigne de façade
  if (facade) g.add(at(decal(Math.min(w * 0.6, 12), 1.0, signTexture(facade)), 0, h - 0.7, d / 2 + 0.16));
  g.userData.dockFront = d / 2;
  return g;
}
