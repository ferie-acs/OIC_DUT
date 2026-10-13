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
  // Lot d3 : cycle de vie du DUT et contrôle
  LOCALITIES: 'dut_localities_v1',
  ARCHIVES: 'dut_archives_v1',
  CONTROL_SEARCHES: 'dut_control_searches_v1',
  LOT_D3_SEED: 'dut_seed_lot_d3',
  // Lot d4 : incidents, remontées du terrain, équipements, échanges partenaires
  PLATFORM_INCIDENTS: 'dut_platform_incidents_v1',
  FIELD_REPORTS: 'dut_field_reports_v1',
  EQUIPMENT: 'dut_equipment_v1',
  PARTNER_THREADS: 'dut_partner_threads_v1',
  LOT_D4_SEEDED: 'dut_lot_d4_seeded_v1',
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
  // Lot d5 : pilotage de la Direction générale
  DIRECTION: 'Direction générale et pilotage',
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
  // Lot d3 : cycle de vie du DUT et contrôle
  DUT_REFERENCE_PAID: 'DUT_REFERENCE_PAID',
  DUT_TRANSSHIPPED: 'DUT_TRANSSHIPPED',
  DUT_ARCHIVED: 'DUT_ARCHIVED',
  DUT_COUNTER_CREATED: 'DUT_COUNTER_CREATED',
  REFERENCE_RETIRED: 'REFERENCE_RETIRED',
  REF_ADDED: 'REF_ADDED',
  REF_UPDATED: 'REF_UPDATED',
  REF_DEACTIVATED: 'REF_DEACTIVATED',
  REF_REACTIVATED: 'REF_REACTIVATED',
  REF_REMOVED: 'REF_REMOVED',
  CONTROL_DRIVER_SEARCH: 'CONTROL_DRIVER_SEARCH',
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
  // Lot d3 : cycle de vie du DUT et contrôle
  DUT_REFERENCE_PAID: 'DUT payé par référence',
  DUT_TRANSSHIPPED: 'DUT transbordé',
  DUT_ARCHIVED: 'DUT contrôlé et archivé',
  DUT_COUNTER_CREATED: 'DUT saisi au guichet',
  REFERENCE_RETIRED: 'Numéro de référence retiré',
  REF_ADDED: 'Fiche de référentiel ajoutée',
  REF_UPDATED: 'Fiche de référentiel modifiée',
  REF_DEACTIVATED: 'Fiche de référentiel désactivée',
  REF_REACTIVATED: 'Fiche de référentiel réactivée',
  REF_REMOVED: 'Fiche de référentiel retirée',
  CONTROL_DRIVER_SEARCH: 'Recherche par conducteur',
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

// Lot d1 : comptes et acteurs
Object.assign(STORAGE_KEYS, {
  MESSAGES: 'dut_messages_v1',
  TRANSPORTER_APPLICATIONS: 'dut_transporter_applications_v1',
  VEHICLE_DECLARATIONS: 'dut_vehicle_declarations_v1',
  HABILITATIONS: 'dut_habilitations_v1',
  LOT_D1_SEED: 'dut_lot_d1_seed_v1',
});
/** États d'un groupement (partenaire habilité, transporteur). Absent = ACTIF (données antérieures). */
export const ORG_STATUS = { EN_ATTENTE: 'EN_ATTENTE', ACTIF: 'ACTIF', SUSPENDU: 'SUSPENDU', RESILIE: 'RESILIE', REFUSE: 'REFUSE' };
export const ORG_STATUS_LABELS = { EN_ATTENTE: 'En attente de validation', ACTIF: 'Actif', SUSPENDU: 'Suspendu', RESILIE: 'Résilié', REFUSE: 'Refusé' };
Object.assign(AUDIT_ACTIONS, {
  ACCOUNT_ACTIVATION_SENT: 'ACCOUNT_ACTIVATION_SENT', ACCOUNT_ACTIVATED: 'ACCOUNT_ACTIVATED',
  PASSWORD_RESET_REQUESTED: 'PASSWORD_RESET_REQUESTED', PASSWORD_RESET_DONE: 'PASSWORD_RESET_DONE', PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  PROFILE_UPDATED: 'PROFILE_UPDATED', COMPANY_USER_CREATED: 'COMPANY_USER_CREATED', COMPANY_USER_UPDATED: 'COMPANY_USER_UPDATED',
  COMPANY_USER_STATUS: 'COMPANY_USER_STATUS', ORG_CREATED: 'ORG_CREATED', ORG_UPDATED: 'ORG_UPDATED', ORG_VALIDATED: 'ORG_VALIDATED',
  ORG_REFUSED: 'ORG_REFUSED', ORG_SUSPENDED: 'ORG_SUSPENDED', ORG_REACTIVATED: 'ORG_REACTIVATED', ORG_TERMINATED: 'ORG_TERMINATED',
  ORG_CHANGE_REQUESTED: 'ORG_CHANGE_REQUESTED', ORG_CHANGE_APPROVED: 'ORG_CHANGE_APPROVED', ORG_CHANGE_REJECTED: 'ORG_CHANGE_REJECTED',
  ORG_DOCUMENT_ADDED: 'ORG_DOCUMENT_ADDED', ORG_DOCUMENT_REVIEWED: 'ORG_DOCUMENT_REVIEWED', TRANSPORTERS_IMPORTED: 'TRANSPORTERS_IMPORTED',
  VEHICLE_DECLARED: 'VEHICLE_DECLARED', VEHICLE_VALIDATED: 'VEHICLE_VALIDATED', VEHICLE_REFUSED: 'VEHICLE_REFUSED',
  HABILITATIONS_UPDATED: 'HABILITATIONS_UPDATED',
});
Object.assign(AUDIT_LABELS, {
  ACCOUNT_ACTIVATION_SENT: 'Lien d’activation envoyé', ACCOUNT_ACTIVATED: 'Compte activé',
  PASSWORD_RESET_REQUESTED: 'Réinitialisation demandée', PASSWORD_RESET_DONE: 'Mot de passe réinitialisé', PASSWORD_CHANGED: 'Mot de passe modifié',
  PROFILE_UPDATED: 'Profil modifié', COMPANY_USER_CREATED: 'Utilisateur d’entreprise créé', COMPANY_USER_UPDATED: 'Utilisateur d’entreprise modifié',
  COMPANY_USER_STATUS: 'Accès d’un utilisateur modifié', ORG_CREATED: 'Groupement créé', ORG_UPDATED: 'Fiche de groupement modifiée',
  ORG_VALIDATED: 'Groupement validé', ORG_REFUSED: 'Demande refusée', ORG_SUSPENDED: 'Groupement suspendu', ORG_REACTIVATED: 'Groupement réactivé',
  ORG_TERMINATED: 'Groupement résilié', ORG_CHANGE_REQUESTED: 'Modification demandée', ORG_CHANGE_APPROVED: 'Modification approuvée',
  ORG_CHANGE_REJECTED: 'Modification refusée', ORG_DOCUMENT_ADDED: 'Pièce déposée', ORG_DOCUMENT_REVIEWED: 'Pièce examinée',
  TRANSPORTERS_IMPORTED: 'Import de transporteurs', VEHICLE_DECLARED: 'Véhicule déclaré', VEHICLE_VALIDATED: 'Déclaration de véhicule validée',
  VEHICLE_REFUSED: 'Déclaration de véhicule refusée', HABILITATIONS_UPDATED: 'Habilitations modifiées',
});
