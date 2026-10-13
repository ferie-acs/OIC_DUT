import { ROLES, STORAGE_KEYS } from './constants.js';
import { readObject } from './storage.js';

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

// Lot d2 : antennes, sites, plages de numéros, rapprochement et caisse
PERMISSIONS[ROLES.OIC_ADMIN].push('antennas.manage', 'sites.view', 'sites.manage', 'ranges.stock', 'ranges.allocate', 'ranges.transfer', 'ranges.validate', 'ranges.revoke', 'ranges.settings', 'reconciliation.view', 'payments.view', 'payments.validate', 'payments.desk', 'sales.report');
PERMISSIONS[ROLES.ANTENNA_AGENT].push('sites.view', 'ranges.stock', 'ranges.transfer', 'payments.record', 'payments.desk');
PERMISSIONS[ROLES.PARTNER_ADMIN].push('reconciliation.view', 'payments.pay');
PERMISSIONS[ROLES.CASHIER] = ['payments.view', 'payments.record', 'payments.validate', 'payments.desk', 'sales.report', 'reconciliation.view'];
// Fin lot d2

export function can(user, permission) {
  if (!user) return false;
  return permissionsFor(user.role).includes(permission);
}

export function requirePermission(user, permission) {
  if (!can(user, permission)) {
    throw new Error(`Permission refusée : ${permission} pour le rôle ${user?.role || 'anonyme'}`);
  }
}

export function permissionsFor(role) {
  return effectivePermissions(role);
}

// Lot d1 : comptes et acteurs — droits ajoutés et habilitations paramétrables dans une limite sûre.
const LOT_D1_PERMISSIONS = {
  [ROLES.PARTNER_ADMIN]: ['company.profile', 'company.users', 'company.activity'],
  [ROLES.TRANSPORTEUR]: ['company.profile', 'company.users', 'fleet.declare'],
  [ROLES.OIC_ADMIN]: ['partners.manage', 'transporters.manage', 'actors.validate', 'messages.journal', 'habilitations.manage'],
};
for (const [role, list] of Object.entries(LOT_D1_PERMISSIONS)) PERMISSIONS[role].push(...list.filter((p) => !PERMISSIONS[role].includes(p)));

/** Rôles externes à l'OIC : ne reçoivent jamais un droit de validation, de contrôle ou d'administration. */
export const EXTERNAL_ROLES = [ROLES.PARTNER_ADMIN, ROLES.PARTNER_EDITOR, ROLES.TRANSPORTEUR];
export const PERMISSION_CLASSES = {
  validation: ['dut.validate', 'dut.reject', 'dut.suspend', 'dut.unsuspend', 'dut.withdraw', 'actors.validate'],
  controle: ['control.scan', 'control.verify', 'control.log'],
  administration: ['admin.manage', 'habilitations.manage', 'partners.manage', 'transporters.manage', 'messages.journal'],
  saisie: ['dut.create', 'dut.edit_draft', 'dut.submit'],
};
/** Droits que l'on ne peut jamais retirer à l'administrateur OIC (sinon plus personne ne peut administrer). */
export const LOCKED_ADMIN_PERMISSIONS = ['admin.manage', 'habilitations.manage'];

export function basePermissions(role) { return [...(PERMISSIONS[role] || [])]; }

/** Motif de refus d'un ajout de droit à un rôle, ou null si l'ajout est sûr. */
export function grantRefusal(role, permission, current = basePermissions(role)) {
  const { validation, controle, administration, saisie } = PERMISSION_CLASSES;
  if (administration.includes(permission) && role !== ROLES.OIC_ADMIN) return 'Droit d’administration réservé à l’administrateur OIC.';
  if (EXTERNAL_ROLES.includes(role) && (validation.includes(permission) || controle.includes(permission))) return 'Un droit de validation ou de contrôle ne peut pas être donné à un rôle externe à l’OIC.';
  if (validation.includes(permission) && current.some((p) => saisie.includes(p))) return 'Séparation des tâches : ce rôle saisit déjà des DUT, il ne peut pas aussi les valider.';
  if (saisie.includes(permission) && current.some((p) => validation.includes(p))) return 'Séparation des tâches : ce rôle valide déjà des DUT, il ne peut pas aussi les saisir.';
  return null;
}
export function removalRefusal(role, permission) {
  if (role === ROLES.OIC_ADMIN && LOCKED_ADMIN_PERMISSIONS.includes(permission)) return 'Ce droit ne peut pas être retiré : l’administration deviendrait impossible.';
  return null;
}

/** Droits effectifs = droits de base + ajouts sûrs − retraits autorisés. Un ajout non sûr est ignoré même s'il est présent en stockage. */
export function effectivePermissions(role) {
  const base = basePermissions(role);
  const override = (readObject(STORAGE_KEYS.HABILITATIONS, {}) || {})[role] || {};
  let list = base.filter((p) => !(override.remove || []).includes(p) || removalRefusal(role, p));
  for (const p of override.add || []) if (!list.includes(p) && !grantRefusal(role, p, list)) list.push(p);
  return list;
}
