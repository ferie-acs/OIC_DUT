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
  // Lot d5 : pilotage de la Direction générale
  PILOT_INDICATORS: 'dut_pilot_indicators_v1',
  PILOT_CONTRACTS: 'dut_pilot_contracts_v1',
  PILOT_ACTIONS: 'dut_pilot_actions_v1',
  AGENT_PROFILES: 'dut_agent_profiles_v1',
  AGENT_EVALUATIONS: 'dut_agent_evaluations_v1',
  DIRECTION_DOCUMENTS: 'dut_direction_documents_v1',
  MEETINGS: 'dut_meetings_v1',
  LEGAL_CONTRACTS: 'dut_legal_contracts_v1',
  LOT_D5_SEED: 'dut_lot_d5_seed_v1',
  // Fin lot d5
};

export const ROLES = {
  PARTNER_ADMIN: 'PARTNER_ADMIN',
  PARTNER_EDITOR: 'PARTNER_EDITOR',
  ANTENNA_AGENT: 'ANTENNA_AGENT',
  OIC_ADMIN: 'OIC_ADMIN',
  CONTROLLER: 'CONTROLLER',
  TRANSPORTEUR: 'TRANSPORTEUR',
  // Lot d5 : pilotage de la Direction générale
  DIRECTION: 'DIRECTION',
};

export const ROLE_LABELS = {
  PARTNER_ADMIN: 'Partenaire — Admin',
  PARTNER_EDITOR: 'Partenaire — Éditeur',
  ANTENNA_AGENT: 'Agent Antenne',
  OIC_ADMIN: 'Admin OIC',
  CONTROLLER: 'Agent Contrôle',
  TRANSPORTEUR: 'Transporteur',
  // Lot d5 : pilotage de la Direction générale
  DIRECTION: 'Direction générale et pilotage',
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
  // Lot d5 : pilotage de la Direction générale
  PILOT_INDICATOR_SAVED: 'PILOT_INDICATOR_SAVED',
  PILOT_CONTRACT_SAVED: 'PILOT_CONTRACT_SAVED',
  PILOT_CONTRACT_SUBMITTED: 'PILOT_CONTRACT_SUBMITTED',
  PILOT_CONTRACT_VALIDATED: 'PILOT_CONTRACT_VALIDATED',
  PILOT_CONTRACT_REJECTED: 'PILOT_CONTRACT_REJECTED',
  PILOT_CONTRACT_CLOSED: 'PILOT_CONTRACT_CLOSED',
  PILOT_RESULT_RECORDED: 'PILOT_RESULT_RECORDED',
  PILOT_ACTION_SAVED: 'PILOT_ACTION_SAVED',
  PILOT_ACTION_UPDATED: 'PILOT_ACTION_UPDATED',
  AGENT_PROFILE_SAVED: 'AGENT_PROFILE_SAVED',
  AGENT_EVALUATED: 'AGENT_EVALUATED',
  DOCUMENT_DEPOSITED: 'DOCUMENT_DEPOSITED',
  DOCUMENT_VERSIONED: 'DOCUMENT_VERSIONED',
  DOCUMENT_CLASSIFIED: 'DOCUMENT_CLASSIFIED',
  DOCUMENT_VALIDATED: 'DOCUMENT_VALIDATED',
  DOCUMENT_REJECTED: 'DOCUMENT_REJECTED',
  DOCUMENT_ARCHIVED: 'DOCUMENT_ARCHIVED',
  MEETING_SAVED: 'MEETING_SAVED',
  MEETING_CONVENED: 'MEETING_CONVENED',
  MEETING_HELD: 'MEETING_HELD',
  DECISION_SAVED: 'DECISION_SAVED',
  LEGAL_CONTRACT_SAVED: 'LEGAL_CONTRACT_SAVED',
  LEGAL_CONTRACT_STEP: 'LEGAL_CONTRACT_STEP',
  LEGAL_CONTRACT_REJECTED: 'LEGAL_CONTRACT_REJECTED',
  PARTNER_EVALUATED: 'PARTNER_EVALUATED',
  PILOT_REPORT_EXPORTED: 'PILOT_REPORT_EXPORTED',
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
  // Lot d5 : pilotage de la Direction générale
  PILOT_INDICATOR_SAVED: 'Indicateur enregistré',
  PILOT_CONTRACT_SAVED: 'Contrat d’objectifs enregistré',
  PILOT_CONTRACT_SUBMITTED: 'Contrat d’objectifs soumis à validation',
  PILOT_CONTRACT_VALIDATED: 'Contrat d’objectifs validé',
  PILOT_CONTRACT_REJECTED: 'Contrat d’objectifs renvoyé',
  PILOT_CONTRACT_CLOSED: 'Contrat d’objectifs clôturé',
  PILOT_RESULT_RECORDED: 'Résultat saisi',
  PILOT_ACTION_SAVED: 'Action corrective enregistrée',
  PILOT_ACTION_UPDATED: 'Suivi d’action corrective',
  AGENT_PROFILE_SAVED: 'Fiche agent enregistrée',
  AGENT_EVALUATED: 'Agent évalué',
  DOCUMENT_DEPOSITED: 'Document déposé',
  DOCUMENT_VERSIONED: 'Nouvelle version de document',
  DOCUMENT_CLASSIFIED: 'Document reclassé',
  DOCUMENT_VALIDATED: 'Document validé',
  DOCUMENT_REJECTED: 'Document refusé',
  DOCUMENT_ARCHIVED: 'Document archivé',
  MEETING_SAVED: 'Réunion enregistrée',
  MEETING_CONVENED: 'Convocation envoyée (simulée)',
  MEETING_HELD: 'Compte rendu de réunion enregistré',
  DECISION_SAVED: 'Décision enregistrée',
  LEGAL_CONTRACT_SAVED: 'Contrat enregistré au registre',
  LEGAL_CONTRACT_STEP: 'Étape du circuit de validation',
  LEGAL_CONTRACT_REJECTED: 'Contrat renvoyé',
  PARTNER_EVALUATED: 'Partenaire évalué',
  PILOT_REPORT_EXPORTED: 'Rapport périodique exporté',
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
