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

// Lot d3 : cycle de vie du DUT et contrôle
PERMISSIONS[ROLES.PARTNER_ADMIN].push('dut.transship');
PERMISSIONS[ROLES.PARTNER_EDITOR].push('dut.transship');
PERMISSIONS[ROLES.TRANSPORTEUR].push('dut.create', 'dut.edit_draft', 'dut.pay_reference', 'dut.transship', 'references.view', 'dut.print');
PERMISSIONS[ROLES.ANTENNA_AGENT].push('dut.create', 'dut.edit_draft', 'dut.counter', 'dut.pay_reference', 'dut.withdraw', 'dut.archive', 'archives.view', 'dut.print');
PERMISSIONS[ROLES.OIC_ADMIN].push('archives.view');
PERMISSIONS[ROLES.CONTROLLER].push('control.driver_search', 'control.history');

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
