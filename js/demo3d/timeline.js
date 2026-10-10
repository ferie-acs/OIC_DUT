/**
 * stateAt(ms) : état complet de la scène à l'instant ms. Fonction PURE :
 * même entrée, même sortie, aucune horloge, aucun hasard. C'est l'unique
 * horloge de la démo — la lecture et l'export MP4 l'appellent tous deux.
 */
import { SHOTS, TOTAL_MS, KEYS, SPANS, ROUTES, PLACES, AUDIT, AUDIT_STEP_MS, DUT_NUMBER, DUT_STATUSES } from './scenario.js';
import { keyed, stepped, within, spanProgress, plateau, clamp, ease } from './keyframes.js';
import { smooth, makePath, sampleAt, nearestU } from './path.js';
import { ROAD, PORT_GATE } from './world/layout.js';

export const BASE_VIEW_HEIGHT = 70;
export const FOLLOW_LAG_MS = 450;
export const PULSE_PERIOD_MS = 1200;
const SUB_FADE_IN_MS = 400;
const SUB_FADE_OUT_MS = 300;

export const PATHS = Object.freeze({
  truck: makePath(smooth(ROUTES.truck)),
  document: makePath(smooth(ROUTES.document)),
  forklift: makePath(smooth(ROUTES.forklift)),
});

const NAMED_U = Object.freeze({ start: 0, checkpoint: nearestU(PATHS.truck, PLACES.checkpointStop).u, end: 1 });
const TRUCK_KEYS = KEYS.truckRoute.map(([t, stop]) => [t, NAMED_U[stop]]);
const RANK = Object.fromEntries(DUT_STATUSES.map((s, i) => [s, i]));

/**
 * Circulation d'ambiance : un seul passage par camion, sur la voie opposée (vers -x), de l'est
 * hors champ jusqu'au hangar du terminal où il disparaît à l'abri. Les deux passages sont finis
 * avant que le camion suivi n'entre sur la route (un sens inverse le croiserait forcément).
 */
const TRAFFIC = Object.freeze([
  { id: 'trafic-1', lane: PORT_GATE.zCenter, speed: 7, start: -14000 },
  { id: 'trafic-2', lane: PORT_GATE.zCenter, speed: 7, start: 5000 },
]);

export function frustum(aspect, zoom) {
  const halfH = BASE_VIEW_HEIGHT / (2 * zoom);
  return { halfH, halfW: halfH * aspect };
}

export function shotAt(ms) {
  let current = SHOTS[0];
  for (const shot of SHOTS) if (ms >= shot.at) current = shot;
  return current;
}

function subtitleOpacity(ms, shot, isLast) {
  const local = ms - shot.at;
  const fadeIn = clamp(local / SUB_FADE_IN_MS, 0, 1);
  const fadeOut = isLast ? 1 : clamp((shot.duration - local) / SUB_FADE_OUT_MS, 0, 1);
  return Math.min(fadeIn, fadeOut);
}

const truckAt = (ms) => sampleAt(PATHS.truck, keyed(TRUCK_KEYS, ms));

export function stateAt(rawMs) {
  const ms = clamp(Number.isFinite(rawMs) ? rawMs : 0, 0, TOTAL_MS);
  const shot = shotAt(ms);

  const truck = truckAt(ms);
  const lagged = truckAt(Math.max(0, ms - FOLLOW_LAG_MS));
  const [kx, kz] = keyed(KEYS.cameraXZ, ms);
  const follow = keyed(KEYS.cameraFollow, ms);
  const camera = { x: kx + (lagged.x - kx) * follow, z: kz + (lagged.z - kz) * follow, zoom: keyed(KEYS.cameraZoom, ms) };

  const docU = keyed(KEYS.documentRoute, ms);
  const doc = { visible: within(SPANS.documentToken, ms), ...sampleAt(PATHS.document, docU), u: docU };

  const forklift = {
    ...sampleAt(PATHS.forklift, keyed(KEYS.forkliftRoute, ms)),
    forkHeight: keyed(KEYS.forkHeight, ms),
    carrying: within(SPANS.palletOnForks, ms),
  };

  const status = stepped(KEYS.dutStatus, ms);
  const dut = {
    status,
    number: RANK[status] >= RANK.valide ? DUT_NUMBER : null,
    qr: within(SPANS.qr, ms),
    anchor: doc.visible ? 'document' : 'truck',
  };

  const phase = (ms % PULSE_PERIOD_MS) / PULSE_PERIOD_MS;
  let pulse = null;
  if (within(SPANS.pulseAntenne, ms)) pulse = { at: PLACES.antenneDock, phase };
  else if (within(SPANS.pulseDestination, ms)) pulse = { at: PLACES.destinationDock, phase };
  let glow = null;
  if (within(SPANS.glowAntenne, ms)) glow = { at: 'antenne', k: plateau(spanProgress(SPANS.glowAntenne, ms)) };
  else if (within(SPANS.glowDestination, ms)) glow = { at: 'destination', k: plateau(spanProgress(SPANS.glowDestination, ms)) };
  let brackets = null;
  if (within(SPANS.bracketsForklift, ms)) brackets = 'forklift';
  else if (within(SPANS.bracketsTruck, ms)) brackets = 'truck';

  const fx = {
    truckTrail: within(SPANS.routeTrail, ms) ? keyed(TRUCK_KEYS, ms) : null,
    documentTrail: within(SPANS.documentTrail, ms) ? docU : null,
    pulse,
    brackets,
    glow,
    scan: within(SPANS.scan, ms) ? spanProgress(SPANS.scan, ms) : null,
    barrier: keyed(KEYS.barrier, ms, ease.out),
  };

  const auditStart = SPANS.audit[0];
  const audit = {
    visible: ms >= auditStart,
    lit: ms >= auditStart ? clamp(Math.floor((ms - auditStart) / AUDIT_STEP_MS) + 1, 0, AUDIT.length) : 0,
  };

  const traffic = TRAFFIC.map(({ id, lane, speed, start }) => {
    const x = ROAD.toX - (speed * (ms - start)) / 1000;
    return {
      id,
      x: clamp(x, PORT_GATE.hideX, ROAD.toX),
      z: lane,
      heading: -Math.PI / 2,
      visible: x <= ROAD.toX && x >= PORT_GATE.hideX,
    };
  });

  const isLast = shot === SHOTS[SHOTS.length - 1];
  return {
    ms,
    shot: shot.id,
    camera,
    truck,
    forklift,
    doc,
    dut,
    fx,
    audit,
    traffic,
    subtitle: { text: shot.subtitle, opacity: subtitleOpacity(ms, shot, isLast) },
  };
}
