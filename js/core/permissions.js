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

// Lot d2 : antennes, sites, plages de numéros, rapprochement et caisse
PERMISSIONS[ROLES.OIC_ADMIN].push('antennas.manage', 'sites.view', 'sites.manage', 'ranges.stock', 'ranges.allocate', 'ranges.transfer', 'ranges.validate', 'ranges.revoke', 'ranges.settings', 'reconciliation.view', 'payments.view', 'payments.validate', 'payments.desk', 'sales.report');
PERMISSIONS[ROLES.ANTENNA_AGENT].push('sites.view', 'ranges.stock', 'ranges.transfer', 'payments.record', 'payments.desk');
PERMISSIONS[ROLES.PARTNER_ADMIN].push('reconciliation.view', 'payments.pay');
PERMISSIONS[ROLES.CASHIER] = ['payments.view', 'payments.record', 'payments.validate', 'payments.desk', 'sales.report', 'reconciliation.view'];
// Fin lot d2

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
