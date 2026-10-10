/** Assemble le monde et retourne les références animées. */
import { PALETTE } from '../palette.js';
import { PLACES } from '../scenario.js';
import { buildGround } from './ground.js';
import { at } from '../models/kit.js';
import { createTruck } from '../models/truck.js';
import { createWarehouse } from '../models/warehouse.js';
import { createAntenne } from '../models/antenne.js';
import { createCrane, createStack, createShip, createQuay } from '../models/port.js';
import { loadLogoTexture } from '../models/logo.js';
import { createForklift } from '../models/forklift.js';
import { createCheckpoint } from '../models/checkpoint.js';
import { createTree, createPalm } from '../models/vegetation.js';
import { createFence } from '../models/fence.js';
import { LAYOUT } from './layout.js';
import { PATHS } from '../timeline.js';
import { TRUCK_SIZE } from '../models/truck.js';
import { FORKLIFT_SIZE } from '../models/forklift.js';
import { createTrail } from '../fx/trail.js';
import { createPulse } from '../fx/pulse.js';
import { createBrackets } from '../fx/brackets.js';
import { createGlow } from '../fx/glow.js';
import { createScan } from '../fx/scan.js';
import { createDocumentToken } from '../fx/document.js';

function buildPort(scene) {
  scene.add(at(createQuay(140), -73.5, 0, -10));
  scene.add(at(createShip(), -84, 0, -8));
  scene.add(at(createCrane(), -66, 0, -24));
  scene.add(at(createCrane(), -66, 0, 2));
  scene.add(at(createStack({ cols: 4, rows: 4, levels: 3, seed: 0 }), -60, 0, -38));
  scene.add(at(createStack({ cols: 3, rows: 3, levels: 2, seed: 4 }), -52, 0, 8));
}

export async function buildWorld(scene) {
  buildGround(scene);
  const logo = await loadLogoTexture();
  buildPort(scene);

  // La face +z (quais) de chaque bâtiment est tournée vers la route.
  const partner = createWarehouse({ w: 20, d: 12, h: 6, wall: PALETTE.mur, roof: PALETTE.royal, doors: 4, facade: 'IVOIRE NÉGOCE' });
  // Quai n° 2 (x local = -2,5) face au camion.
  scene.add(at(partner, PLACES.warehouseDoor[0] + 2.5, 0, PLACES.warehouseDoor[1] - partner.userData.dockFront));
  const antenne = createAntenne({ logo });
  scene.add(at(antenne, PLACES.antenneDock[0] - 4.6, 0, PLACES.antenneDock[1] - antenne.userData.dockFront - 0.4));
  const destination = createWarehouse({ w: 22, d: 12, h: 6, wall: PALETTE.murOcre, roof: PALETTE.royal, doors: 4, facade: 'ENTREPÔT CLIENT · BOUAKÉ', logo });
  // Quai n° 2 (x local = -2,75) face au camion ; l'avant du camion (5 m) s'arrête à 0,5 m du quai.
  scene.add(at(destination, PLACES.destinationDock[0] + 2.75, 0, PLACES.destinationDock[1] - 5 - destination.userData.dockFront - 0.5));

  for (const t of LAYOUT.trees) scene.add(at(createTree(t.scale), t.at[0], 0, t.at[1]));
  for (const p of LAYOUT.palms) scene.add(at(createPalm(p.scale, p.lean), p.at[0], 0, p.at[1]));
  for (const f of LAYOUT.fences) scene.add(createFence(f.from, f.to));

  const checkpoint = createCheckpoint();
  scene.add(at(checkpoint, PLACES.checkpointBooth[0], 0, PLACES.checkpointBooth[1]));

  const forklift = createForklift();
  scene.add(forklift);

  const traffic = new Map([
    ['trafic-1', createTruck({ cab: PALETTE.royal, stripe: PALETTE.royal, brand: 'LOGI-LAGUNE' })],
    ['trafic-2', createTruck({ cab: '#FFFFFF', stripe: PALETTE.ciel, brand: 'SAN PEDRO FRET' })],
  ]);
  for (const t of traffic.values()) scene.add(t);

  const truck = createTruck({ cab: PALETTE.orange, stripe: PALETTE.vert, brand: 'TRANSPORTS ÉBRIÉ', wave: true });
  scene.add(truck);
  const [sx, sy, sz] = checkpoint.userData.scannerLocal;
  const fx = {
    truckTrail: createTrail(PATHS.truck, { solid: PALETTE.royal, dashed: PALETTE.ciel }),
    documentTrail: createTrail(PATHS.document, { solid: PALETTE.royal, dashed: PALETTE.ciel, width: 0.6 }),
    pulse: createPulse(),
    bracketsTruck: createBrackets(TRUCK_SIZE),
    bracketsForklift: createBrackets(FORKLIFT_SIZE),
    glow: createGlow(),
    scan: createScan([PLACES.checkpointBooth[0] + sx, sy, PLACES.checkpointBooth[1] + sz]),
    docToken: createDocumentToken(),
  };
  for (const effect of Object.values(fx)) scene.add(effect.object);
  return { truck, forklift, checkpoint, traffic, fx, buildings: { partner, antenne, destination } };
}
