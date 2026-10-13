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
  // Lot d4 : incidents, remontées du terrain, équipements, échanges partenaires
  PLATFORM_INCIDENTS: 'dut_platform_incidents_v1',
  FIELD_REPORTS: 'dut_field_reports_v1',
  EQUIPMENT: 'dut_equipment_v1',
  PARTNER_THREADS: 'dut_partner_threads_v1',
  LOT_D4_SEEDED: 'dut_lot_d4_seeded_v1',
};

export const ROLES = {
  PARTNER_ADMIN: 'PARTNER_ADMIN',
  PARTNER_EDITOR: 'PARTNER_EDITOR',
  ANTENNA_AGENT: 'ANTENNA_AGENT',
  OIC_ADMIN: 'OIC_ADMIN',
  CONTROLLER: 'CONTROLLER',
  TRANSPORTEUR: 'TRANSPORTEUR',
};

export const ROLE_LABELS = {
  PARTNER_ADMIN: 'Partenaire — Admin',
  PARTNER_EDITOR: 'Partenaire — Éditeur',
  ANTENNA_AGENT: 'Agent Antenne',
  OIC_ADMIN: 'Admin OIC',
  CONTROLLER: 'Agent Contrôle',
  TRANSPORTEUR: 'Transporteur',
};

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
  // Lot d4 : incidents, remontées du terrain, équipements, échanges partenaires
  INCIDENT_DECLARED: 'INCIDENT_DECLARED',
  INCIDENT_QUALIFIED: 'INCIDENT_QUALIFIED',
  INCIDENT_ASSIGNED: 'INCIDENT_ASSIGNED',
  INCIDENT_FOLLOWED: 'INCIDENT_FOLLOWED',
  INCIDENT_RESOLVED: 'INCIDENT_RESOLVED',
  INCIDENT_CLOSED: 'INCIDENT_CLOSED',
  INCIDENT_REOPENED: 'INCIDENT_REOPENED',
  INCIDENT_DEADLINE_EXCEEDED: 'INCIDENT_DEADLINE_EXCEEDED',
  FIELD_REPORT_SUBMITTED: 'FIELD_REPORT_SUBMITTED',
  FIELD_REPORT_ANSWERED: 'FIELD_REPORT_ANSWERED',
  FIELD_REPORT_DECIDED: 'FIELD_REPORT_DECIDED',
  FIELD_REPORT_CLOSED: 'FIELD_REPORT_CLOSED',
  EQUIPMENT_REGISTERED: 'EQUIPMENT_REGISTERED',
  EQUIPMENT_ASSIGNED: 'EQUIPMENT_ASSIGNED',
  EQUIPMENT_FAILURE: 'EQUIPMENT_FAILURE',
  EQUIPMENT_INTERVENTION: 'EQUIPMENT_INTERVENTION',
  EQUIPMENT_REPAIRED: 'EQUIPMENT_REPAIRED',
  EQUIPMENT_RETIRED: 'EQUIPMENT_RETIRED',
  PARTNER_MESSAGE_SENT: 'PARTNER_MESSAGE_SENT',
  PARTNER_THREAD_CLOSED: 'PARTNER_THREAD_CLOSED',
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
  // Lot d4 : incidents, remontées du terrain, équipements, échanges partenaires
  INCIDENT_DECLARED: 'Incident déclaré',
  INCIDENT_QUALIFIED: 'Incident qualifié',
  INCIDENT_ASSIGNED: 'Incident attribué',
  INCIDENT_FOLLOWED: 'Suivi d’incident ajouté',
  INCIDENT_RESOLVED: 'Incident résolu',
  INCIDENT_CLOSED: 'Incident clos',
  INCIDENT_REOPENED: 'Incident rouvert',
  INCIDENT_DEADLINE_EXCEEDED: 'Délai d’incident dépassé',
  FIELD_REPORT_SUBMITTED: 'Remontée transmise',
  FIELD_REPORT_ANSWERED: 'Réponse à une remontée',
  FIELD_REPORT_DECIDED: 'Décision sur une remontée',
  FIELD_REPORT_CLOSED: 'Remontée clôturée',
  EQUIPMENT_REGISTERED: 'Équipement recensé',
  EQUIPMENT_ASSIGNED: 'Affectation d’équipement',
  EQUIPMENT_FAILURE: 'Panne d’équipement déclarée',
  EQUIPMENT_INTERVENTION: 'Intervention sur équipement',
  EQUIPMENT_REPAIRED: 'Dépannage clôturé',
  EQUIPMENT_RETIRED: 'Équipement réformé',
  PARTNER_MESSAGE_SENT: 'Message partenaire',
  PARTNER_THREAD_CLOSED: 'Échange partenaire clos',
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
