export const STORAGE_KEYS = {
  USERS: 'dut_users',
  CURRENT_USER: 'dut_current_user',
  PARTNERS: 'dut_partners',
  ANTENNAS: 'dut_antennas',
  TRANSPORTERS: 'dut_transporters',
  VEHICLES: 'dut_vehicles',
  DRIVERS: 'dut_drivers',
  THIRD_PARTIES: 'dut_third_parties',
  MERCHANDISE_TYPES: 'dut_merchandise_types',
  PACKAGING_TYPES: 'dut_packaging_types',
  OPERATIONS: 'dut_operations',
  DUT_LIST: 'dut_list',
  AUDIT_LOGS: 'dut_audit_logs',
  CONTROL_LOGS: 'dut_control_logs',
  DOCUMENTS: 'dut_documents',
  DEMO_INITIALIZED: 'dut_demo_initialized',
  EXPLAINER_STATE: 'dut_explainer_v1',
  SIGNING_KEY: 'dut_signing_key_v1',
  CRL: 'dut_crl_v1',
  CONTROL_SETTINGS: 'dut_control_settings_v1',
  DEROGATIONS: 'dut_derogations_v1',
  DEMO_SEED_VERSION: 'dut_demo_seed_version',
  // Lot d2 : antennes, sites, plages et caisse
  SITES: 'dut_sites_v1',
  RANGE_STOCK: 'dut_range_stock_v1',
  RANGE_PRICING: 'dut_range_pricing_v1',
  PAYMENTS: 'dut_payments_v1',
  RECONCILIATION_NOTES: 'dut_reconciliation_notes_v1',
  // Fin lot d2
};

export const ROLES = {
  PARTNER_ADMIN: 'PARTNER_ADMIN',
  PARTNER_EDITOR: 'PARTNER_EDITOR',
  ANTENNA_AGENT: 'ANTENNA_AGENT',
  OIC_ADMIN: 'OIC_ADMIN',
  CONTROLLER: 'CONTROLLER',
  TRANSPORTEUR: 'TRANSPORTEUR',
};
// Lot d2 : rôle Caisse et comptabilité OIC
ROLES.CASHIER = 'CASHIER';
// Fin lot d2

export const ROLE_LABELS = {
  PARTNER_ADMIN: 'Partenaire — Admin',
  PARTNER_EDITOR: 'Partenaire — Éditeur',
  ANTENNA_AGENT: 'Agent Antenne',
  OIC_ADMIN: 'Admin OIC',
  CONTROLLER: 'Agent Contrôle',
  TRANSPORTEUR: 'Transporteur',
};
// Lot d2 : rôle Caisse et comptabilité OIC
ROLE_LABELS.CASHIER = 'Caisse et comptabilité OIC';
// Fin lot d2

export const DUT_STATUS = {
  EN_EDITION: 'EN_EDITION',
  TERMINE: 'TERMINE',
  REJETE: 'REJETE',
  VALIDE: 'VALIDE',
  SUSPENDU: 'SUSPENDU',
  RETIRE: 'RETIRE',
};

export const DUT_STATUS_LABELS = {
  EN_EDITION: 'En édition',
  TERMINE: 'Terminé',
  REJETE: 'Rejeté',
  VALIDE: 'Validé',
  SUSPENDU: 'Suspendu',
  RETIRE: 'Retiré',
};

export const AUDIT_ACTIONS = {
  DUT_CREATED: 'DUT_CREATED',
  DUT_UPDATED: 'DUT_UPDATED',
  DUT_SUBMITTED: 'DUT_SUBMITTED',
  DUT_REJECTED: 'DUT_REJECTED',
  DUT_RESUBMITTED: 'DUT_RESUBMITTED',
  DUT_VALIDATED: 'DUT_VALIDATED',
  DUT_SUSPENDED: 'DUT_SUSPENDED',
  DUT_UNSUSPENDED: 'DUT_UNSUSPENDED',
  DUT_WITHDRAWN: 'DUT_WITHDRAWN',
  DUT_PDF_GENERATED: 'DUT_PDF_GENERATED',
  DUT_REPRINTED: 'DUT_REPRINTED',
  DUT_CONTROLLED: 'DUT_CONTROLLED',
  USER_LOGIN: 'USER_LOGIN',
  USER_LOGOUT: 'USER_LOGOUT',
  OPERATION_REQUESTED: 'OPERATION_REQUESTED',
  DUT_SIGNED: 'DUT_SIGNED',
  CRL_SYNCED: 'CRL_SYNCED',
  CANARY_TRIGGERED: 'CANARY_TRIGGERED',
  DUT_DEROGATION: 'DUT_DEROGATION',
  // Lot d2 : antennes, sites, plages et caisse
  ANTENNA_CREATED: 'ANTENNA_CREATED',
  ANTENNA_UPDATED: 'ANTENNA_UPDATED',
  ANTENNA_STAFF_ASSIGNED: 'ANTENNA_STAFF_ASSIGNED',
  ANTENNA_ACCOUNT_OPENED: 'ANTENNA_ACCOUNT_OPENED',
  ANTENNA_DEACTIVATED: 'ANTENNA_DEACTIVATED',
  ANTENNA_REACTIVATED: 'ANTENNA_REACTIVATED',
  ANTENNA_CLOSED: 'ANTENNA_CLOSED',
  SITE_SAVED: 'SITE_SAVED',
  SITE_STATUS: 'SITE_STATUS',
  RANGE_DECIDED: 'RANGE_DECIDED',
  RANGE_REQUEST_UPDATED: 'RANGE_REQUEST_UPDATED',
  RANGE_REQUEST_CANCELLED: 'RANGE_REQUEST_CANCELLED',
  RANGE_ALLOCATED: 'RANGE_ALLOCATED',
  RANGE_TRANSFERRED: 'RANGE_TRANSFERRED',
  RANGE_TRANSFER_DECIDED: 'RANGE_TRANSFER_DECIDED',
  RANGE_REVOKED: 'RANGE_REVOKED',
  RANGE_SETTINGS_UPDATED: 'RANGE_SETTINGS_UPDATED',
  PAYMENT_RECORDED: 'PAYMENT_RECORDED',
  PAYMENT_VALIDATED: 'PAYMENT_VALIDATED',
  PAYMENT_REJECTED: 'PAYMENT_REJECTED',
  RECONCILIATION_JUSTIFIED: 'RECONCILIATION_JUSTIFIED',
  // Fin lot d2
};

export const AUDIT_LABELS = {
  DUT_CREATED: 'DUT créé',
  DUT_UPDATED: 'DUT modifié',
  DUT_SUBMITTED: 'DUT soumis',
  DUT_REJECTED: 'DUT rejeté',
  DUT_RESUBMITTED: 'DUT resoumis',
  DUT_VALIDATED: 'DUT validé',
  DUT_SUSPENDED: 'DUT suspendu',
  DUT_UNSUSPENDED: 'Suspension levée',
  DUT_WITHDRAWN: 'DUT retiré',
  DUT_PDF_GENERATED: 'PDF généré',
  DUT_REPRINTED: 'DUT réimprimé',
  DUT_CONTROLLED: 'DUT contrôlé',
  USER_LOGIN: 'Connexion',
  USER_LOGOUT: 'Déconnexion',
  OPERATION_REQUESTED: 'Plage demandée',
  DUT_SIGNED: 'QR signé',
  CRL_SYNCED: 'Liste de révocation synchronisée',
  CANARY_TRIGGERED: 'DUT piège scanné',
  DUT_DEROGATION: 'Dérogation accordée',
  // Lot d2 : antennes, sites, plages et caisse
  ANTENNA_CREATED: 'Antenne créée',
  ANTENNA_UPDATED: 'Antenne modifiée',
  ANTENNA_STAFF_ASSIGNED: 'Encadrement d’antenne affecté',
  ANTENNA_ACCOUNT_OPENED: 'Compte d’antenne ouvert',
  ANTENNA_DEACTIVATED: 'Antenne désactivée',
  ANTENNA_REACTIVATED: 'Antenne réactivée',
  ANTENNA_CLOSED: 'Antenne fermée',
  SITE_SAVED: 'Site enregistré',
  SITE_STATUS: 'Statut de site modifié',
  RANGE_DECIDED: 'Demande de plage instruite',
  RANGE_REQUEST_UPDATED: 'Demande de plage modifiée',
  RANGE_REQUEST_CANCELLED: 'Demande de plage annulée',
  RANGE_ALLOCATED: 'Stock d’antenne approvisionné',
  RANGE_TRANSFERRED: 'Plage transférée',
  RANGE_TRANSFER_DECIDED: 'Transfert de plage instruit',
  RANGE_REVOKED: 'Plage reprise',
  RANGE_SETTINGS_UPDATED: 'Tarifs des plages modifiés',
  PAYMENT_RECORDED: 'Encaissement saisi',
  PAYMENT_VALIDATED: 'Paiement validé',
  PAYMENT_REJECTED: 'Encaissement rejeté',
  RECONCILIATION_JUSTIFIED: 'Écart justifié',
  // Fin lot d2
};

export const CONTROL_RESULTS = {
  VALID: 'VALID',
  SUSPENDED: 'SUSPENDED',
  WITHDRAWN: 'WITHDRAWN',
  UNKNOWN: 'UNKNOWN',
};

export const ACCOUNT_TYPES = { PROPRE: 'PROPRE', AUTRUI: 'AUTRUI', SOUS_TRAITANCE: 'SOUS_TRAITANCE' };

export const TRANSPORT_TYPES = {
  NATIONAL: 'NATIONAL',
  VERS_INTERNATIONAL: 'VERS_INTERNATIONAL',
  VERS_NATIONAL: 'VERS_NATIONAL',
};

export const TVA_RATE = 0.18;

/** Un seul schéma : charge signée. L'ancien `oicdut://verify/` est abandonné. */
export const QR_SCHEME = 'oicdut://v2/';
export const DEMO_KID = 'demo-2026-10';
export const DEMO_SEED_VERSION = 3;

export const VERDICT_LEVELS = { VERT: 'VERT', ORANGE: 'ORANGE', ROUGE: 'ROUGE', INCONNU: 'INCONNU' };

export const DEROGATION_REASONS = {
  PANNE_VEHICULE: 'Panne du véhicule',
  CHANGEMENT_TRACTEUR: 'Changement de tracteur',
  RETARD_LEGITIME: 'Retard légitime',
  QR_ILLISIBLE: 'QR illisible',
  AUTRE: 'Autre (préciser)',
};

/** Politique de contrôle. Constantes pour ce lot ; un paramétrage admin viendra avec le lot 2. */
export const CONTROL_POLICY = {
  validityDays: 7,
  crlWarnHours: 24,
  crlMaxHours: 72,
  maxSpeedKmh: 90,
};

export const DEMO_PASSWORD = 'demo123';

export const APP_NAME = 'DUT-OIC';
