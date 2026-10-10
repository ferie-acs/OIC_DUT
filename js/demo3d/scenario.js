/**
 * Scénario de la démo 3D — DONNÉE uniquement, aucun calcul.
 * Temps en millisecondes ; positions au sol en [x, z] (mètres de scène).
 * Toutes les séries KEYS commencent à 0 et finissent à TOTAL_MS.
 */
export const TOTAL_MS = 75000;

export const DUT_STATUSES = Object.freeze(['aucun', 'brouillon', 'valide', 'imprime', 'authentique', 'livre']);

/** Numéro fictif de démonstration. */
export const DUT_NUMBER = 'OIC-2026-004812';

export const SHOTS = Object.freeze([
  { id: 'port', at: 0, duration: 6000, subtitle: 'Chaque transport de marchandises a besoin d’un document fiable.' },
  { id: 'creation', at: 6000, duration: 10000, subtitle: 'Le partenaire crée le DUT.' },
  { id: 'validation', at: 16000, duration: 12000, subtitle: 'L’antenne OIC le vérifie et lui attribue un numéro officiel.' },
  { id: 'impression', at: 28000, duration: 10000, subtitle: 'Le DUT est imprimé avec son QR code.' },
  { id: 'route', at: 38000, duration: 14000, subtitle: 'Le transporteur prend la route.' },
  { id: 'controle', at: 52000, duration: 12000, subtitle: 'Au contrôle, le QR est vérifié auprès du système, jamais sur le papier.' },
  { id: 'livraison', at: 64000, duration: 8000, subtitle: 'Livraison confirmée.' },
  { id: 'audit', at: 72000, duration: 3000, subtitle: 'Chaque étape est tracée.' },
].map(Object.freeze));

/** Lieux clés. Le camion (10 m) a son centre au point indiqué. */
export const PLACES = Object.freeze({
  partnerDock: [-30, -10],
  warehouseDoor: [-30, -16.5],
  antenneDock: [-2, -17.5],
  palletStack: [-38, -14],
  checkpointStop: [22, -2],
  checkpointBooth: [31, -9],
  destinationDock: [78, -9],
});

export const ROUTES = Object.freeze({
  truck: [[-30, -10], [-30, -5], [-26, -2], [24, -2], [70, -2], [76, -4], [78, -9]],
  document: [[-30, -16.5], [-24, -15], [-10, -15], [-2, -17.5], [-10, -15], [-24, -15], [-30, -16.5]],
  forklift: [[-38, -14], [-35, -16.5], [-32.6, -16.2]],
});

export const KEYS = Object.freeze({
  dutStatus: [[0, 'aucun'], [8000, 'brouillon'], [24000, 'valide'], [33500, 'imprime'], [60000, 'authentique'], [70500, 'livre'], [75000, 'livre']],
  truckRoute: [[0, 'start'], [38500, 'start'], [51500, 'checkpoint'], [59800, 'checkpoint'], [70500, 'end'], [75000, 'end']],
  documentRoute: [[0, 0], [16500, 0], [21000, 0.5], [24500, 0.5], [27500, 1], [75000, 1]],
  forkliftRoute: [[0, 0], [28500, 0], [32500, 1], [34000, 1], [36500, 0], [75000, 0]],
  forkHeight: [[0, 0.25], [28500, 0.25], [29200, 0.9], [32500, 0.9], [33200, 1.4], [34000, 0.25], [75000, 0.25]],
  barrier: [[0, 0], [59000, 0], [59800, 1], [64000, 1], [65000, 0], [75000, 0]],
  cameraXZ: [[0, [-22, -10]], [5000, [-22, -10]], [8000, [-30, -13]], [15500, [-30, -13]], [18000, [-16, -16]], [27000, [-16, -16]], [29500, [-32, -13]], [37500, [-32, -13]], [71000, [70, -7]], [72000, [70, -7]], [74800, [22, -10]], [75000, [22, -10]]],
  cameraZoom: [[0, 0.7], [5000, 0.78], [8000, 1.9], [15500, 1.9], [18000, 1.35], [27000, 1.35], [29500, 2.2], [37500, 2.2], [40500, 1.6], [51000, 1.6], [53000, 2.2], [63000, 2.2], [64500, 1.6], [71500, 1.7], [74800, 0.62], [75000, 0.62]],
  cameraFollow: [[0, 0], [37500, 0], [40000, 1], [71000, 1], [73500, 0], [75000, 0]],
});

/** Fenêtres [début, fin[ des effets. */
export const SPANS = Object.freeze({
  documentToken: [16500, 27500],
  documentTrail: [16000, 28000],
  routeTrail: [38000, 72000],
  pulseAntenne: [16000, 24500],
  pulseDestination: [38000, 71000],
  bracketsForklift: [28000, 32500],
  bracketsTruck: [32500, 72000],
  palletOnForks: [29200, 33200],
  glowAntenne: [20000, 26000],
  glowDestination: [66000, 72000],
  scan: [55000, 60000],
  qr: [33500, 75000],
  audit: [72000, 75000],
});

export const AUDIT = Object.freeze([
  { time: '09:12', text: 'Création du DUT · Partenaire' },
  { time: '09:20', text: 'Soumission · Antenne OIC d’Abidjan' },
  { time: '09:41', text: `Validation · N° ${DUT_NUMBER}` },
  { time: '09:44', text: 'Impression · QR code émis' },
  { time: '11:05', text: 'Contrôle routier · Authentique' },
  { time: '13:30', text: 'Livraison · Confirmée' },
].map(Object.freeze));

export const AUDIT_STEP_MS = 380;
