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

// Lot d4 : incidents, remontées du terrain, équipements, échanges partenaires
const LOT_D4_PERMISSIONS = {
  [ROLES.PARTNER_ADMIN]: ['incidents.declare', 'exchanges.view', 'exchanges.partner'],
  [ROLES.PARTNER_EDITOR]: ['incidents.declare'],
  [ROLES.ANTENNA_AGENT]: ['incidents.declare', 'incidents.treat', 'fieldreports.view', 'fieldreports.submit', 'equipment.view', 'equipment.manage'],
  [ROLES.OIC_ADMIN]: ['incidents.declare', 'incidents.treat', 'incidents.manage', 'fieldreports.view', 'fieldreports.manage', 'equipment.view', 'equipment.manage', 'equipment.retire', 'exchanges.view', 'exchanges.manage'],
  [ROLES.TRANSPORTEUR]: ['incidents.declare'],
};
for (const [role, list] of Object.entries(LOT_D4_PERMISSIONS)) PERMISSIONS[role].push(...list);

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
