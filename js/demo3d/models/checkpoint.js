/**
 * Poste de contrôle : abri à toit de tôle, demi-barrière rayée orange et blanc,
 * agent avec scanner. Placé au sud de la route ; la barrière ne couvre que la
 * voie du camion suivi (la circulation d'ambiance roule sur l'autre voie).
 */
import * as THREE from 'three';
import { PALETTE } from '../palette.js';
import { rbox, cyl, at, canvasTexture, decal, flat, contactShadow } from './kit.js';

export const BARRIER_OPEN_ANGLE = 1.35;

function stripes() {
  return canvasTexture(512, 32, (g, w, h) => {
    for (let i = 0; i < 8; i += 1) { g.fillStyle = i % 2 ? '#FFFFFF' : PALETTE.orange; g.fillRect((i * w) / 8, 0, w / 8 + 1, h); }
  });
}

function signTexture() {
  return canvasTexture(768, 160, (g, w, h) => {
    g.fillStyle = PALETTE.marine;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#FFFFFF';
    g.font = '700 80px "Instrument Sans", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('CONTRÔLE DUT', w / 2, h / 2 + 6);
  });
}

export function createCheckpoint() {
  const g = new THREE.Group();
  // Abri
  g.add(contactShadow(4.5, 4.5, 0.25));
  g.add(at(rbox(3.2, 2.8, 3.2, 0.25, PALETTE.mur), 0, 1.4, 0));
  g.add(at(rbox(2.6, 0.9, 0.08, 0.04, PALETTE.vitre), 0, 1.9, 1.62));
  const roof = rbox(4.0, 0.22, 4.0, 0.05, PALETTE.tole);
  roof.rotation.x = -0.08;
  g.add(at(roof, 0, 2.95, 0));
  g.add(at(decal(3.0, 0.62, signTexture()), 0, 3.45, 1.7));

  // Demi-barrière : poteau au bord sud de la chaussée, bras vers +z sur la seule voie du camion.
  const postZ = 4.2;
  g.add(at(rbox(0.6, 1.3, 0.6, 0.12, PALETTE.marine), -2.0, 0.65, postZ));
  const arm = new THREE.Group();
  arm.position.set(-2.0, 1.25, postZ);
  const bar = rbox(0.24, 0.24, 4.6, 0.08, '#FFFFFF');
  bar.material = new THREE.MeshStandardMaterial({ map: stripes(), roughness: 0.6 });
  arm.add(at(bar, 0, 0, 2.3));
  g.add(arm);
  // Ligne d'arrêt
  g.add(at(flat(0.4, 4.4, PALETTE.marquage, 0.035), -4.0, 0.035, postZ + 2.3));

  // Agent avec scanner, près du camion arrêté
  const agent = new THREE.Group();
  agent.add(at(cyl(0.22, 0.24, 0.9, PALETTE.marine, 12), 0, 0.45, 0));
  agent.add(at(cyl(0.3, 0.3, 0.75, PALETTE.gilet, 12), 0, 1.25, 0));
  agent.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshStandardMaterial({ color: PALETTE.peau })), 0, 1.85, 0));
  agent.add(at(cyl(0.24, 0.24, 0.1, PALETTE.marine, 12), 0, 2.05, 0));
  agent.add(at(rbox(0.18, 0.3, 0.1, 0.03, PALETTE.pneu), 0.32, 1.35, 0.2));
  g.add(at(agent, -4.5, 0, 3.0));

  g.userData = { arm, scannerLocal: [-4.18, 1.35, 3.2] };
  return g;
}
