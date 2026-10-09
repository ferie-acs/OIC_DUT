import { mergeAntennaDirectory } from './data/antennas.js';
import { STORAGE_KEYS, ROLES, DUT_STATUS, AUDIT_ACTIONS, AUDIT_LABELS, DEMO_PASSWORD, DEMO_SEED_VERSION } from './core/constants.js';
import { uuid, nowIso } from './core/utils.js';
import { writeCollection, writeObject, readObject, readCollection } from './core/storage.js';
import { blankDut, buildQrPayload } from './services/dut.service.js';
import { ensureDemoKey, signPayload } from './services/signing.service.js';

function daysAgoIso(days, hour = 9) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, Math.floor(Math.random() * 59), 0, 0);
  return d.toISOString();
}

/** Ensemencé ET à la version courante : une version antérieure est régénérée. */
export function isSeeded() {
  return readObject(STORAGE_KEYS.DEMO_SEED_VERSION, 0) >= DEMO_SEED_VERSION;
}

export function seedDemoData() {
  // ===== Antennes OIC (coordonnées de démonstration, non officielles) =====
  const antennaAbidjan = {
    id: uuid(), name: 'ABIDJAN', city: 'Abidjan',
    address: 'Boulevard de Marseille, Zone Portuaire, Abidjan',
    phone: '+225 27 21 25 10 10', hours: 'Lun–Ven 7h30–16h30',
    lat: 5.2893, lng: -4.0072, demoLocation: true,
  };
  const antennaBouake = {
    id: uuid(), name: 'BOUAKÉ', city: 'Bouaké',
    address: 'Avenue de la République, Bouaké',
    phone: '+225 31 63 20 44', hours: 'Lun–Ven 7h30–16h30',
    lat: 7.6906, lng: -5.0300, demoLocation: true,
  };
  const antennaSanPedro = {
    id: uuid(), name: 'SAN-PÉDRO', city: 'San-Pédro',
    address: 'Route du Port Autonome, San-Pédro',
    phone: '+225 34 71 22 15', hours: 'Lun–Ven 7h30–16h30',
    lat: 4.7485, lng: -6.6363, demoLocation: true,
  };
  const antennaYamoussoukro = {
    id: uuid(), name: 'YAMOUSSOUKRO', city: 'Yamoussoukro',
    address: 'Quartier Habitat, Yamoussoukro',
    phone: '+225 30 64 12 08', hours: 'Lun–Ven 7h30–16h30',
    lat: 6.8276, lng: -5.2893, demoLocation: true,
  };
  const antennas = [antennaAbidjan, antennaBouake, antennaSanPedro, antennaYamoussoukro];

  // ===== Partenaires =====
  const partnerStfa = { id: uuid(), name: 'STFA DEMO', antennaId: antennaAbidjan.id, antennaName: antennaAbidjan.name };
  const partnerTranscargo = { id: uuid(), name: 'TRANSCARGO SARL', antennaId: antennaBouake.id, antennaName: antennaBouake.name };
  const partners = [partnerStfa, partnerTranscargo];

  // ===== Utilisateurs de démonstration =====
  const users = [
    {
      id: uuid(), email: 'partner.admin@demo.oic.ci', name: 'Aïcha Koné', role: ROLES.PARTNER_ADMIN,
      partnerId: partnerStfa.id, partnerName: partnerStfa.name, antennaId: antennaAbidjan.id, antennaName: antennaAbidjan.name,
    },
    {
      id: uuid(), email: 'partner.editor@demo.oic.ci', name: 'Yao Bertin', role: ROLES.PARTNER_EDITOR,
      partnerId: partnerStfa.id, partnerName: partnerStfa.name, antennaId: antennaAbidjan.id, antennaName: antennaAbidjan.name,
    },
    {
      id: uuid(), email: 'antenne.agent@demo.oic.ci', name: 'Fatou Diabaté', role: ROLES.ANTENNA_AGENT,
      antennaId: antennaAbidjan.id, antennaName: antennaAbidjan.name,
    },
    {
      id: uuid(), email: 'oic.admin@demo.oic.ci', name: 'Kouadio Serge', role: ROLES.OIC_ADMIN,
    },
    {
      id: uuid(), email: 'controle.agent@demo.oic.ci', name: 'Traoré Aminata', role: ROLES.CONTROLLER,
    },
  ];

  // ===== Référentiels =====
  const transporterAbc = { id: uuid(), name: 'ABC TRANSPORT CI', registre: 'CI-ABJ-2015-B-4521', contact: '+225 07 08 09 10 11', adresse: 'Yopougon, Abidjan' };
  const transporters = [
    transporterAbc,
    { id: uuid(), name: 'IVOIRE LOGISTIQUE SA', registre: 'CI-ABJ-2011-B-1187', contact: '+225 05 06 07 08 09', adresse: 'Marcory, Abidjan' },
    { id: uuid(), name: 'SAHEL TRANS EXPRESS', registre: 'CI-BKE-2018-B-0932', contact: '+225 01 02 03 04 05', adresse: 'Bouaké' },
  ];

  users.push({
    id: uuid(), email: 'transporteur@demo.oic.ci', name: 'Koffi Roger', role: ROLES.TRANSPORTEUR,
    transporterId: transporterAbc.id, transporterName: transporterAbc.name,
  });

  const vehicleAb1234 = {
    id: uuid(), immatriculation: 'AB-1234-CD', transporterId: transporterAbc.id, type: 'Semi-remorque', capaciteTonnes: 40,
    cartegrise: 'CG-2019-004521', ptac: 44, dateMiseEnCirculation: '2019-03-12', carteTransport: 'CT-ABJ-2025-1187',
  };
  const vehicles = [
    vehicleAb1234,
    {
      id: uuid(), immatriculation: 'CI-5567-YZ', transporterId: transporterAbc.id, type: 'Camion plateau', capaciteTonnes: 25,
      cartegrise: 'CG-2020-009981', ptac: 28, dateMiseEnCirculation: '2020-07-02', carteTransport: 'CT-ABJ-2025-0842',
    },
    {
      id: uuid(), immatriculation: 'BK-9081-EF', transporterId: transporters[2].id, type: 'Citerne', capaciteTonnes: 30,
      cartegrise: 'CG-2018-005512', ptac: 32, dateMiseEnCirculation: '2018-11-20', carteTransport: 'CT-BKE-2025-0331',
    },
  ];

  const driverKouassi = {
    id: uuid(), nom: 'KOUASSI', prenoms: 'Jean', permis: 'CI-PL-004521', dateDelivrancePermis: '2015-04-10',
    typePiece: 'CNI', piece: '00219845102', dateDelivrancePiece: '2021-01-15', nationalite: 'Ivoirienne',
  };
  const drivers = [
    driverKouassi,
    {
      id: uuid(), nom: 'OUATTARA', prenoms: 'Moussa', permis: 'CI-PL-007743', dateDelivrancePermis: '2017-09-05',
      typePiece: 'CNI', piece: '00187744201', dateDelivrancePiece: '2020-06-02', nationalite: 'Ivoirienne',
    },
    {
      id: uuid(), nom: 'BAMBA', prenoms: 'Salif', permis: 'CI-PL-002298', dateDelivrancePermis: '2013-02-18',
      typePiece: 'PASSEPORT', piece: '00298871122', dateDelivrancePiece: '2019-08-11', nationalite: 'Burkinabè',
    },
  ];

  // ===== Référentiels marchandises / emballages (remplace le texte libre) =====
  const merchandiseTypes = ['Cacao', 'Café', 'Anacarde', 'Coton', 'Ciment', 'Produits pétroliers', 'Riz'].map((nom, i) => ({
    id: uuid(), nom, code: `MRC-${String(i + 1).padStart(3, '0')}`,
  }));
  const packagingTypes = ['Sacs', 'Vrac', 'Fûts', 'Conteneur', 'Palettes', 'Big-bags'].map((nom, i) => ({
    id: uuid(), nom, code: `EMB-${String(i + 1).padStart(3, '0')}`,
  }));

  const thirdSanNegoce = { id: uuid(), raisonSociale: 'SOCIETE AFRICAINE DE NEGOCE', registre: 'CI-ABJ-2009-B-887', adresse: 'Plateau, Abidjan', contact: '+225 27 20 21 22 23', type: 'EXPEDITEUR' };
  const thirdIndustriesNord = { id: uuid(), raisonSociale: 'INDUSTRIES DU NORD', registre: 'CI-BKE-2013-B-410', adresse: 'Zone Industrielle, Bouaké', contact: '+225 31 60 61 62 63', type: 'DESTINATAIRE' };
  const thirdParties = [
    thirdSanNegoce, thirdIndustriesNord,
    { id: uuid(), raisonSociale: 'AGRO CI DISTRIBUTION', registre: 'CI-ABJ-2016-B-2290', adresse: 'Treichville, Abidjan', contact: '+225 27 24 25 26 27', type: 'EXPEDITEUR' },
    { id: uuid(), raisonSociale: 'COMPTOIR DU NORD SA', registre: 'CI-KRO-2012-B-155', adresse: 'Korhogo', contact: '+225 36 86 10 11', type: 'DESTINATAIRE' },
  ];

  // ===== Opérations (plages de numéros DUT) =====
  const operationStfa = {
    id: uuid(), code: 'OP-2026-00021', partnerId: partnerStfa.id, partnerName: partnerStfa.name,
    year: 2026, rangeStart: 1000, rangeEnd: 1099, quantity: 100, used: 63,
    tarifUnitaire: 2500, status: 'VALIDATED', requestedAt: daysAgoIso(40), validatedAt: daysAgoIso(38),
  };
  const operationTranscargo = {
    id: uuid(), code: 'OP-2026-00014', partnerId: partnerTranscargo.id, partnerName: partnerTranscargo.name,
    year: 2026, rangeStart: 2000, rangeEnd: 2049, quantity: 50, used: 21,
    tarifUnitaire: 2500, status: 'VALIDATED', requestedAt: daysAgoIso(55), validatedAt: daysAgoIso(53),
  };
  const operations = [operationStfa, operationTranscargo];

  // ===== Historique de DUT (pour dashboards / graphiques) =====
  const natures = merchandiseTypes.map((m) => m.nom);
  const villesOrigine = ['Abidjan', 'San-Pédro', 'Bouaké'];
  const villesDestination = ['Bouaké', 'Korhogo', 'Yamoussoukro', 'Man', 'Abidjan'];
  // Du plus ancien au plus récent : les derniers dossiers sont des DUT validés récemment
  // (encore valables au contrôle) et des dossiers terminés en attente.
  const statutsHisto = [
    ...Array(8).fill(DUT_STATUS.VALIDE),
    ...Array(2).fill(DUT_STATUS.SUSPENDU),
    ...Array(1).fill(DUT_STATUS.RETIRE),
    ...Array(3).fill(DUT_STATUS.REJETE),
    ...Array(2).fill(DUT_STATUS.VALIDE),
    ...Array(2).fill(DUT_STATUS.TERMINE),
    ...Array(2).fill(DUT_STATUS.VALIDE),
  ];

  const duts = [];
  const auditLogs = [];
  const controlLogs = [];

  statutsHisto.forEach((status, i) => {
    const partner = i % 3 === 0 ? partnerTranscargo : partnerStfa;
    const antenna = partner.id === partnerStfa.id ? antennaAbidjan : antennaBouake;
    const fakeUser = { id: 'SEED', name: 'Démo', partnerId: partner.id, partnerName: partner.name, antennaId: antenna.id, antennaName: antenna.name };
    const dut = blankDut(fakeUser);
    // Du plus ancien au plus récent, tous les 3 jours ; le dernier dossier date de 2 jours,
    // donc les derniers DUT validés sont encore dans leur période de validité (scénario VERT).
    const createdDaysAgo = (statutsHisto.length - 1 - i) * 3 + 2;
    dut.createdAt = daysAgoIso(createdDaysAgo);
    dut.updatedAt = dut.createdAt;
    dut.general.transporterId = transporters[i % transporters.length].id;
    dut.general.transporterName = transporters[i % transporters.length].name;
    dut.general.immatriculation = vehicles[i % vehicles.length].immatriculation;
    dut.general.driverNom = drivers[i % drivers.length].nom;
    dut.general.driverPrenoms = drivers[i % drivers.length].prenoms;
    dut.general.driverPermis = drivers[i % drivers.length].permis;
    dut.expediteur.raisonSociale = thirdSanNegoce.raisonSociale;
    dut.destinataire.raisonSociale = i % 2 === 0 ? thirdIndustriesNord.raisonSociale : thirdParties[3].raisonSociale;
    const nature = natures[i % natures.length];
    const poids = 10 + (i % 8) * 4;
    dut.marchandises = [{ id: uuid(), nature, emballage: 'Sacs', quantite: 100 + i * 5, poidsTonnes: poids, volumeM3: poids * 1.3, valeur: poids * 480000, devise: 'FCFA' }];
    dut.trajet.chargement = { lieu: 'Entrepôt', adresse: 'Zone portuaire', ville: villesOrigine[i % villesOrigine.length], reference: `REF-${1000 + i}`, datePrevue: dut.createdAt.slice(0, 10) };
    dut.trajet.dechargement = { lieu: 'Dépôt client', adresse: 'Zone industrielle', ville: villesDestination[i % villesDestination.length], reference: `REF-D-${1000 + i}`, datePrevue: dut.createdAt.slice(0, 10) };
    dut.trajet.dateDepart = dut.createdAt.slice(0, 10);
    dut.trajet.dateArrivee = dut.createdAt.slice(0, 10);

    dut.status = status;
    dut.operationId = operationIdFor(partner);

    if (status !== DUT_STATUS.EN_EDITION) {
      dut.submittedAt = daysAgoIso(createdDaysAgo - 1);
    }
    if ([DUT_STATUS.VALIDE, DUT_STATUS.SUSPENDU, DUT_STATUS.RETIRE].includes(status)) {
      dut.dutNumber = `DUT-CI-2026-${String(400 + i).padStart(6, '0')}`;
      dut.qrToken = uuid();
      dut.validatedAt = daysAgoIso(createdDaysAgo - 2);
      dut.validatedBy = 'Fatou Diabaté';
    }
    if (status === DUT_STATUS.REJETE) {
      dut.rejectedAt = daysAgoIso(createdDaysAgo - 1);
      dut.rejectedBy = 'Fatou Diabaté';
      dut.rejectionReason = 'Carte de transport expirée.';
    }
    if (status === DUT_STATUS.SUSPENDU) dut.suspendedAt = daysAgoIso(5);
    if (status === DUT_STATUS.RETIRE) dut.withdrawnAt = daysAgoIso(3);

    duts.push(dut);

    auditLogs.push(mkAudit(AUDIT_ACTIONS.DUT_CREATED, dut, 'Yao Bertin', ROLES.PARTNER_EDITOR, dut.createdAt));
    if (dut.submittedAt) auditLogs.push(mkAudit(AUDIT_ACTIONS.DUT_SUBMITTED, dut, 'Yao Bertin', ROLES.PARTNER_EDITOR, dut.submittedAt));
    if (dut.validatedAt) auditLogs.push(mkAudit(AUDIT_ACTIONS.DUT_VALIDATED, dut, 'Fatou Diabaté', ROLES.ANTENNA_AGENT, dut.validatedAt, dut.dutNumber));
    if (dut.rejectedAt) auditLogs.push(mkAudit(AUDIT_ACTIONS.DUT_REJECTED, dut, 'Fatou Diabaté', ROLES.ANTENNA_AGENT, dut.rejectedAt, null, dut.rejectionReason));
    if (dut.suspendedAt) auditLogs.push(mkAudit(AUDIT_ACTIONS.DUT_SUSPENDED, dut, 'Kouadio Serge', ROLES.OIC_ADMIN, dut.suspendedAt));
    if (dut.withdrawnAt) auditLogs.push(mkAudit(AUDIT_ACTIONS.DUT_WITHDRAWN, dut, 'Kouadio Serge', ROLES.OIC_ADMIN, dut.withdrawnAt));

    if (dut.status === DUT_STATUS.VALIDE && i % 2 === 0) {
      controlLogs.push({
        id: uuid(), token: dut.qrToken, dutId: dut.id, dutNumber: dut.dutNumber,
        agentId: 'SEED', agentLabel: 'Traoré Aminata', result: 'VALID', date: daysAgoIso(2), lat: null, lng: null,
      });
    }
  });

  function operationIdFor(partner) {
    return partner.id === partnerStfa.id ? operationStfa.id : operationTranscargo.id;
  }

  // Contrôles supplémentaires : QR inconnu + DUT suspendu présenté
  controlLogs.push({ id: uuid(), token: uuid(), dutId: null, dutNumber: null, agentId: 'SEED', agentLabel: 'Traoré Aminata', result: 'UNKNOWN', date: daysAgoIso(1), lat: null, lng: null });
  const suspendedDut = duts.find((d) => d.status === DUT_STATUS.SUSPENDU);
  if (suspendedDut) {
    controlLogs.push({ id: uuid(), token: suspendedDut.qrToken, dutId: suspendedDut.id, dutNumber: suspendedDut.dutNumber, agentId: 'SEED', agentLabel: 'Traoré Aminata', result: 'SUSPENDED', date: daysAgoIso(1), lat: null, lng: null });
  }

  // ===== Écriture LocalStorage =====
  writeCollection(STORAGE_KEYS.ANTENNAS, mergeAntennaDirectory(antennas));
  writeCollection(STORAGE_KEYS.PARTNERS, partners);
  writeCollection(STORAGE_KEYS.USERS, users);
  writeCollection(STORAGE_KEYS.TRANSPORTERS, transporters);
  writeCollection(STORAGE_KEYS.VEHICLES, vehicles);
  writeCollection(STORAGE_KEYS.DRIVERS, drivers);
  writeCollection(STORAGE_KEYS.THIRD_PARTIES, thirdParties);
  writeCollection(STORAGE_KEYS.MERCHANDISE_TYPES, merchandiseTypes);
  writeCollection(STORAGE_KEYS.PACKAGING_TYPES, packagingTypes);
  writeCollection(STORAGE_KEYS.OPERATIONS, operations);
  // DUT piège : vrai en apparence, ne doit jamais circuler. Le scanner alerte le siège.
  const canary = blankDut({ id: 'SEED', name: 'Siège OIC', partnerId: partnerStfa.id, partnerName: partnerStfa.name, antennaId: antennaAbidjan.id, antennaName: antennaAbidjan.name });
  canary.status = DUT_STATUS.VALIDE;
  canary.canary = true;
  canary.dutNumber = 'DUT-CI-2026-000777';
  canary.qrToken = uuid();
  canary.validatedAt = daysAgoIso(4);
  canary.validatedBy = 'Siège OIC';
  canary.general.immatriculation = 'CI-0777-CN';
  canary.general.transporterName = 'TRANSPORT ÉCHANTILLON';
  canary.trajet.chargement.ville = 'Abidjan';
  canary.trajet.dechargement.ville = 'Korhogo';
  duts.push(canary);

  writeCollection(STORAGE_KEYS.DUT_LIST, duts);
  writeCollection(STORAGE_KEYS.AUDIT_LOGS, auditLogs);
  writeCollection(STORAGE_KEYS.CONTROL_LOGS, controlLogs);
  writeCollection(STORAGE_KEYS.DOCUMENTS, []);
  writeObject(STORAGE_KEYS.DEMO_INITIALIZED, true);
  writeObject(STORAGE_KEYS.DEMO_SEED_VERSION, DEMO_SEED_VERSION);
}

function mkAudit(action, dut, userLabel, role, date, newValue = null, note = null) {
  return {
    id: uuid(), action, label: AUDIT_LABELS[action] || action, dutId: dut.id, dutNumber: dut.dutNumber,
    userId: 'SEED', userLabel, role, oldValue: null, newValue, note, date,
  };
}

export function resetDemo() {
  Object.keys(localStorage).filter(key => key.startsWith('dut_')).forEach(key => localStorage.removeItem(key));
  seedDemoData();
}

export const DEMO_ACCOUNTS = [
  { email: 'partner.admin@demo.oic.ci', label: 'Partenaire — Admin', password: DEMO_PASSWORD },
  { email: 'partner.editor@demo.oic.ci', label: 'Partenaire — Éditeur', password: DEMO_PASSWORD },
  { email: 'antenne.agent@demo.oic.ci', label: 'Agent Antenne', password: DEMO_PASSWORD },
  { email: 'oic.admin@demo.oic.ci', label: 'Admin OIC', password: DEMO_PASSWORD },
  { email: 'controle.agent@demo.oic.ci', label: 'Agent Contrôle', password: DEMO_PASSWORD },
  { email: 'transporteur@demo.oic.ci', label: 'Transporteur', password: DEMO_PASSWORD },
];

/**
 * Signe tout DUT numéroté qui ne l'est pas encore, avec la clé de démonstration
 * (créée si absente). Idempotent : sans effet si tout est déjà signé.
 */
export async function ensureSignedDemoData() {
  const key = await ensureDemoKey();
  const duts = readCollection(STORAGE_KEYS.DUT_LIST);
  let changed = false;
  for (const dut of duts) {
    if (!dut.dutNumber || !dut.qrToken || dut.qrSigned) continue;
    const nbf = (dut.validatedAt || nowIso()).slice(0, 10);
    dut.qrSigned = await signPayload(buildQrPayload(dut, key, { nbf }), key);
    changed = true;
  }
  if (changed) writeCollection(STORAGE_KEYS.DUT_LIST, duts);
}
