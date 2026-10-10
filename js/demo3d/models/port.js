/** Port : portiques, conteneurs empilés, navire, quai. Couleurs choisies par indice (déterministe). */
import * as THREE from 'three';
import { PALETTE } from '../palette.js';
import { rbox, cyl, at, canvasTexture, mat } from './kit.js';

let corrugation = null;
function corrugationTexture() {
  corrugation ??= canvasTexture(256, 128, (g, w, h) => {
    g.fillStyle = '#FFFFFF';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0, 0, 0, 0.10)';
    for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 6, h);
  });
  return corrugation;
}

export function createContainer(color) {
  const m = rbox(2.45, 2.6, 6.1, 0.08, color);
  m.material = new THREE.MeshStandardMaterial({ color, map: corrugationTexture(), roughness: 0.75 });
  return m;
}

export function createStack({ cols, rows, levels, seed = 0 }) {
  const g = new THREE.Group();
  const colors = PALETTE.conteneurs;
  for (let c = 0; c < cols; c += 1) {
    for (let r = 0; r < rows; r += 1) {
      const height = 1 + ((c * 3 + r * 5 + seed) % levels);
      for (let l = 0; l < height; l += 1) {
        const color = colors[(c * 7 + r * 3 + l * 5 + seed) % colors.length];
        g.add(at(createContainer(color), c * 2.7, 1.3 + l * 2.62, r * 6.5));
      }
    }
  }
  return g;
}

/** Portique : bras vers -x (au-dessus de l'eau). */
export function createCrane() {
  const g = new THREE.Group();
  const blue = PALETTE.royal;
  for (const x of [-3, 3]) for (const z of [-4, 4]) g.add(at(rbox(0.7, 15, 0.7, 0.1, blue), x, 7.5, z));
  for (const z of [-4, 4]) g.add(at(rbox(7, 0.8, 0.8, 0.1, blue), 0, 14.6, z));
  g.add(at(rbox(30, 1.0, 1.4, 0.12, blue), -9, 15.6, 0));
  g.add(at(rbox(2.2, 1.6, 2.0, 0.2, '#FFFFFF'), -4, 14.0, 0));
  g.add(at(cyl(0.05, 0.05, 6, PALETTE.quai, 8), -14, 12.4, 0));
  g.add(at(rbox(2.6, 0.5, 6.2, 0.08, PALETTE.marine), -14, 9.2, 0));
  return g;
}

export function createShip() {
  const g = new THREE.Group();
  g.add(at(rbox(13, 4.5, 48, 1.2, PALETTE.coque), 0, 0.6, 0));
  g.add(at(rbox(13.2, 0.6, 48.2, 0.3, '#B9474A'), 0, -1.2, 0));
  g.add(at(rbox(8, 6, 6, 0.4, '#FFFFFF'), 0, 5.6, -19));
  const deck = createStack({ cols: 4, rows: 5, levels: 3, seed: 2 });
  deck.position.set(-4, 2.85, -12);
  g.add(deck);
  return g;
}

export function createQuay(length) {
  const g = new THREE.Group();
  g.add(at(rbox(3, 1.6, length, 0.15, '#C9CED6'), 0, -0.2, 0));
  for (let z = -length / 2 + 4; z < length / 2; z += 8) g.add(at(cyl(0.3, 0.35, 0.7, PALETTE.quai, 12), -1.0, 0.95, z));
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, length), mat(PALETTE.marquageJaune)), 1.3, 0.62, 0));
  return g;
}

/**
 * Hangar du terminal, ouvert côté +x (vers la route) : la circulation d'ambiance y entre et
 * disparaît à l'abri du toit. gate = PORT_GATE (layout.js).
 */
export function createGateShed({ x0, x1, zCenter, width, height }) {
  const g = new THREE.Group();
  const len = x1 - x0;
  const cx = (x0 + x1) / 2;
  const wall = 0.4;
  g.add(at(rbox(wall, height, width, 0.1, PALETTE.mur), x0 + wall / 2, height / 2, zCenter));
  for (const side of [-1, 1]) g.add(at(rbox(len, height, wall, 0.1, PALETTE.mur), cx, height / 2, zCenter + side * (width / 2 - wall / 2)));
  g.add(at(rbox(len + 0.8, 0.5, width + 0.8, 0.15, PALETTE.royal), cx, height + 0.25, zCenter));
  g.add(at(rbox(0.5, 1.0, width, 0.1, PALETTE.marine), x1 - 0.25, height - 0.5, zCenter));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(len - wall, width - 2 * wall), mat(PALETTE.quai, { roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0.03, zCenter);
  g.add(floor);
  const sign = canvasTexture(1024, 160, (c, w, h) => {
    c.fillStyle = PALETTE.marine;
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#FFFFFF';
    c.font = '700 76px "Instrument Sans", sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('TERMINAL · PORT D’ABIDJAN', w / 2, h / 2 + 6);
  });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(width - 1, 0.8), new THREE.MeshStandardMaterial({ map: sign, roughness: 0.8 }));
  plate.rotation.y = Math.PI / 2;
  g.add(at(plate, x1 + 0.02, height - 0.5, zCenter));
  return g;
}
