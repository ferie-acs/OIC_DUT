import { ROLES } from './constants.js';

const PERMISSIONS = {
  [ROLES.PARTNER_ADMIN]: [
    'dashboard.partner', 'dut.create', 'dut.edit_draft', 'dut.submit', 'dut.view',
    'operations.view', 'operations.request', 'referentials.manage', 'antennas.view', 'dut.print',
  ],
  [ROLES.PARTNER_EDITOR]: [
    'dashboard.partner', 'dut.create', 'dut.edit_draft', 'dut.submit', 'dut.view',
    'operations.view', 'referentials.manage', 'antennas.view', 'dut.print',
  ],
  [ROLES.ANTENNA_AGENT]: [
    'dashboard.antenna', 'dut.view', 'dut.validate', 'dut.reject', 'partners.view', 'operations.view',
  ],
  [ROLES.OIC_ADMIN]: [
    'admin.manage', 'dashboard.oic', 'dut.view', 'dut.suspend', 'dut.unsuspend', 'dut.withdraw',
    'reporting.view', 'stats.view', 'anomalies.view', 'operations.view', 'partners.view',
  ],
  [ROLES.CONTROLLER]: ['control.scan', 'control.verify', 'control.log'],
  [ROLES.TRANSPORTEUR]: ['dashboard.transporteur', 'dut.view'],
};

// Lot d5 : pilotage de la Direction générale
// La Direction lit tout au niveau national et valide (objectifs, documents, contrats) ; elle n'édite aucun DUT.
// L'Admin OIC prépare (contrats d'objectifs, documents, visa juridique) ; l'agent d'antenne saisit les résultats
// et suit les actions correctives de sa seule antenne.
PERMISSIONS[ROLES.DIRECTION] = [
  'pilotage.view', 'pilotage.report', 'objectives.manage', 'objectives.validate', 'objectives.results', 'actions.manage',
  'agents.manage', 'agents.evaluate', 'documents.view', 'documents.manage', 'documents.validate',
  'meetings.manage', 'legal.view', 'legal.validate_final', 'partners.evaluate',
  // Droits proposés par le lot d4 (remontées terrain), déclarés ici pour le rôle Direction
  'fieldreports.view', 'fieldreports.manage',
];
PERMISSIONS[ROLES.OIC_ADMIN].push(
  'pilotage.view', 'pilotage.report', 'objectives.manage', 'objectives.results', 'actions.manage',
  'agents.manage', 'agents.evaluate', 'documents.view', 'documents.manage', 'documents.validate',
  'meetings.manage', 'legal.view', 'legal.manage', 'legal.visa', 'partners.evaluate',
);
PERMISSIONS[ROLES.ANTENNA_AGENT].push('objectives.results', 'actions.follow');
// Fin lot d5

export function can(user, permission) {
  if (!user) return false;
  const list = PERMISSIONS[user.role] || [];
  return list.includes(permission);
}

export function requirePermission(user, permission) {
  if (!can(user, permission)) {
    throw new Error(`Permission refusée : ${permission} pour le rôle ${user?.role || 'anonyme'}`);
  }
}

export function permissionsFor(role) {
  return PERMISSIONS[role] || [];
}
