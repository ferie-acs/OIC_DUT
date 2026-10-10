/** Camion porte-conteneur 20 pieds, avant vers +z, origine au sol au centre. */
import * as THREE from 'three';
import { PALETTE } from '../palette.js';
import { rbox, cyl, at, canvasTexture, decal, contactShadow, mat } from './kit.js';

export const TRUCK_SIZE = Object.freeze({ w: 2.6, h: 4.0, d: 10.2 });

function drawWave(g, x, y, w, h) {
  [PALETTE.orange, '#FFFFFF', PALETTE.vert].forEach((color, i) => {
    g.strokeStyle = color;
    g.lineWidth = h * 0.16;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x, y + h * (0.55 + i * 0.18));
    g.bezierCurveTo(x + w * 0.35, y + h * (0.15 + i * 0.18), x + w * 0.65, y + h * (0.75 + i * 0.18), x + w, y + h * (0.35 + i * 0.18));
    g.stroke();
  });
}

function sideTexture({ stripe, brand, wave }) {
  return canvasTexture(1024, 384, (g, w, h) => {
    g.fillStyle = '#FFFFFF';
    g.fillRect(0, 0, w, h);
    g.fillStyle = stripe;
    g.fillRect(0, h * 0.8, w, h * 0.2);
    if (wave) drawWave(g, w * 0.05, h * 0.16, w * 0.24, h * 0.42);
    g.fillStyle = PALETTE.marine;
    g.font = '700 60px "Instrument Sans", sans-serif';
    g.textBaseline = 'middle';
    g.fillText(brand, w * (wave ? 0.34 : 0.08), h * 0.42);
  });
}

export function createTruck({ cab, stripe, brand, wave = false }) {
  const g = new THREE.Group();
  g.add(contactShadow(3.6, 11.4));

  // Châssis
  g.add(at(rbox(2.3, 0.4, 9.8, 0.1, PALETTE.quai), 0, 1.05, 0));

  // Conteneur 20 pieds + livrée sur les deux flancs
  g.add(at(rbox(2.45, 2.6, 6.1, 0.1, '#FFFFFF'), 0, 2.55, -1.85));
  const tex = sideTexture({ stripe, brand, wave });
  for (const side of [-1, 1]) {
    const d = decal(6.0, 2.25, tex);
    d.rotation.y = side * Math.PI / 2;
    at(d, side * 1.235, 2.55, -1.85);
    g.add(d);
  }
  // Portes arrière
  g.add(at(rbox(2.3, 2.4, 0.08, 0.04, '#E6EAF0'), 0, 2.55, -4.92));

  // Cabine (avant vers +z)
  g.add(at(rbox(2.5, 2.3, 2.6, 0.38, cab), 0, 2.4, 3.3));
  g.add(at(rbox(2.0, 0.9, 0.08, 0.04, PALETTE.vitre), 0, 2.95, 4.62));
  for (const side of [-1, 1]) {
    g.add(at(rbox(0.06, 0.75, 1.0, 0.03, PALETTE.vitre), side * 1.26, 2.9, 3.55));
    g.add(at(rbox(0.12, 0.5, 0.3, 0.05, PALETTE.quai), side * 1.4, 2.75, 4.3));
    const light = rbox(0.42, 0.22, 0.06, 0.04, '#FFF6D8', { emissive: '#FFF0C0', emissiveIntensity: 0.6 });
    g.add(at(light, side * 0.85, 1.55, 4.63));
  }
  g.add(at(rbox(1.3, 0.5, 0.06, 0.04, '#4A5260'), 0, 1.75, 4.62));
  g.add(at(rbox(2.5, 0.35, 0.3, 0.08, '#B9C1CC'), 0, 0.95, 4.55));

  // Roues : 3 essieux
  for (const z of [3.6, -2.4, -3.7]) {
    for (const side of [-1, 1]) {
      const tire = cyl(0.55, 0.55, 0.42, PALETTE.pneu, 24);
      tire.rotation.z = Math.PI / 2;
      g.add(at(tire, side * 1.08, 0.55, z));
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.44, 16), mat(PALETTE.jante));
      hub.rotation.z = Math.PI / 2;
      g.add(at(hub, side * 1.09, 0.55, z));
    }
  }
  g.userData.size = TRUCK_SIZE;
  return g;
}
