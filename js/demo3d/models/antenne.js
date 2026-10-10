/** Antenne OIC : bâtiment administratif, logo sur le toit, drapeau ivoirien, un quai. */
import * as THREE from 'three';
import { PALETTE } from '../palette.js';
import { rbox, cyl, at, canvasTexture, decal } from './kit.js';

function flagTexture() {
  return canvasTexture(300, 200, (g, w, h) => {
    [PALETTE.orange, '#FFFFFF', PALETTE.vert].forEach((c, i) => { g.fillStyle = c; g.fillRect((i * w) / 3, 0, w / 3 + 1, h); });
  });
}

function signTexture() {
  return canvasTexture(1024, 180, (g, w, h) => {
    g.fillStyle = PALETTE.royal;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#FFFFFF';
    g.font = '700 88px "Instrument Sans", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('ANTENNE OIC', w / 2, h / 2 + 6);
  });
}

export function createAntenne({ logo }) {
  const g = new THREE.Group();
  const W = 14;
  const D = 9;
  const H = 4.6;
  g.add(at(rbox(W, H, D, 0.3, PALETTE.mur), 0, H / 2, 0));
  g.add(at(rbox(W + 0.8, 0.5, D + 0.8, 0.18, PALETTE.royal), 0, H + 0.25, 0));
  // Bandeau vitré
  g.add(at(rbox(W - 2, 1.1, 0.1, 0.05, PALETTE.vitre), 0, 3.0, D / 2 + 0.02));
  // Logo sur le toit
  const disc = new THREE.Mesh(new THREE.CircleGeometry(2.4, 48), new THREE.MeshStandardMaterial({ map: logo, roughness: 0.8 }));
  disc.rotation.x = -Math.PI / 2;
  g.add(at(disc, -2.5, H + 0.52, 0));
  // Enseigne
  g.add(at(decal(7, 1.2, signTexture()), 0, 1.6, D / 2 + 0.05));
  // Quai (porte) à droite
  g.add(at(rbox(2.6, 3.0, 0.2, 0.1, PALETTE.marine), 4.6, 1.5, D / 2 + 0.06));
  g.add(at(rbox(2.0, 2.5, 0.2, 0.05, PALETTE.quai), 4.6, 1.3, D / 2 + 0.1));
  // Mât et drapeau
  g.add(at(cyl(0.08, 0.1, 8, '#D7DCE2', 12), -W / 2 - 1.5, 4, D / 2 + 1));
  const flag = decal(2.1, 1.4, flagTexture());
  flag.material.side = THREE.DoubleSide;
  g.add(at(flag, -W / 2 - 0.4, 7.2, D / 2 + 1));
  g.userData.dockFront = D / 2;
  return g;
}
