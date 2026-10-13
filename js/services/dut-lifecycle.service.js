/*
 * Lot d3 : cycle de vie du DUT après sa saisie.
 * - Saisie au guichet d'une antenne pour un usager (partenaire habilité ou transporteur).
 * - Règlement d'un DUT par une référence du stock du transporteur (débit simulé), puis soumission à l'antenne.
 * - Transbordement d'un DUT validé : nouveau transporteur, véhicule ou conducteur, nouveau document signé,
 *   l'ancien QR refusé au contrôle, l'historique conservé sur le DUT d'origine.
 * - Contrôle et archivage des DUT édités par l'antenne, consultation des archives par période.
 * Toute action est journalisée dans le journal d'audit.
 */
import { uuid, nowIso } from '../core/utils.js';
import { getCurrentUser } from '../core/auth.js';
import { can, requirePermission } from '../core/permissions.js';
import { AUDIT_ACTIONS, DUT_STATUS } from '../core/constants.js';
import { findDutById, updateDut, getAllDuts } from '../repositories/dut.repository.js';
import {
  findOperationById, listOperationsForTransporter, findActiveOperationForTransporter, consumeNextNumber, peekNextNumber,
} from '../repositories/operations.repository.js';
import { getAllArchives, appendArchive, findArchiveByDutId } from '../repositories/archives.repository.js';
import { transportersRepo } from '../repositories/referentials.repository.js';
import { getAllPartners, findPartnerById } from '../repositories/partners.repository.js';
import { getAllAntennas, findAntennaById } from '../repositories/antennas.repository.js';
import { blankDut, validateForSubmit, referentialErrors, canEditDraft, buildQrPayload, createDraft } from './dut.service.js';
import { visibleDuts } from './insights.service.js';
import { transporters, vehicles, drivers, isSelectable, ownerForUser, lockedTransporterId } from './referentials.service.js';
import { generateToken } from './qr.service.js';
import { loadKey, signPayload } from './signing.service.js';
import * as auditService from './audit.service.js';
import { addDut } from '../repositories/dut.repository.js';

const text = (value, max = 200) => String(value ?? '').trim().slice(0, max);

/* ------------------------------------------------------------------ Création selon le rôle */

/** Nouveau brouillon pour le partenaire ou le transporteur connecté (le guichet a son propre parcours). */
export function createOwnDraft(user = getCurrentUser()) {
  return createDraft(user);
}

/* ------------------------------------------------------------------ Guichet de l'antenne */

/** Usagers pour lesquels l'antenne peut saisir un DUT : partenaires habilités, transporteurs disposant d'un stock. */
export function counterUsagers() {
  const stocked = new Set(getAllTransporterStocks().map((o) => o.transporterId));
  return {
    // Intégration lot d1 : un partenaire suspendu, résilié ou en attente de validation n'est pas proposé au guichet.
    partenaires: getAllPartners().filter((p) => (p.status || 'ACTIF') === 'ACTIF').map((p) => ({ id: p.id, name: p.name })),
    transporteurs: transportersRepo.getAll().filter((t) => stocked.has(t.id) && isSelectable(t)).map((t) => ({ id: t.id, name: t.name })),
  };
}

function getAllTransporterStocks() {
  return transportersRepo.getAll().flatMap((t) => listOperationsForTransporter(t.id));
}

export function createCounterDraft(user, { usagerType, usagerId, deposantNom, deposantPiece, deposantTelephone = '' } = {}) {
  requirePermission(user, 'dut.counter');
  if (user.id !== getCurrentUser()?.id) throw new Error('Session invalide.');
  if (!['PARTENAIRE', 'TRANSPORTEUR'].includes(usagerType)) throw new Error('Choisissez le type d’usager.');
  if (!text(deposantNom) || !text(deposantPiece)) throw new Error('Le nom et la pièce d’identité de la personne qui dépose la demande sont obligatoires.');
  const dut = blankDut(user);
  Object.assign(dut, { antennaId: user.antennaId, antennaName: user.antennaName });
  if (usagerType === 'PARTENAIRE') {
    const partner = findPartnerById(usagerId);
    if (!partner) throw new Error('Partenaire introuvable.');
    if ((partner.status || 'ACTIF') !== 'ACTIF') throw new Error('Ce partenaire n’est pas actif (suspendu, résilié ou en attente de validation).');
    Object.assign(dut, { partnerId: partner.id, partnerName: partner.name });
    dut.guichet = { usagerType, usagerId: partner.id, usagerName: partner.name };
  } else {
    const transporter = transportersRepo.findById(usagerId);
    if (!transporter || !isSelectable(transporter)) throw new Error('Transporteur introuvable ou désactivé.');
    if (!listOperationsForTransporter(transporter.id).length) throw new Error('Ce transporteur ne dispose d’aucun stock de références.');
    Object.assign(dut, { partnerId: null, partnerName: transporter.name });
    dut.guichet = { usagerType, usagerId: transporter.id, usagerName: transporter.name };
    Object.assign(dut.general, { transporterId: transporter.id, transporterName: transporter.name });
  }
  Object.assign(dut.guichet, {
    agentId: user.id, agentName: user.name, at: nowIso(),
    deposant: { nom: text(deposantNom, 120), piece: text(deposantPiece, 60), telephone: text(deposantTelephone, 40) },
  });
  dut.general.lieuEdition = user.antennaName || '';
  addDut(dut);
  auditService.log(AUDIT_ACTIONS.DUT_CREATED, { dutId: dut.id });
  auditService.log(AUDIT_ACTIONS.DUT_COUNTER_CREATED, { dutId: dut.id, note: `Antenne ${user.antennaName || ''} — usager : ${dut.guichet.usagerName}, déposant : ${dut.guichet.deposant.nom}` });
  return dut;
}

/** Saisies au guichet de l'antenne de l'agent, les plus récentes d'abord. */
export function counterDrafts(user = getCurrentUser()) {
  if (!user || user.role !== 'ANTENNA_AGENT') return [];
  return getAllDuts().filter((d) => d.guichet && d.antennaId === user.antennaId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/* ------------------------------------------------------------------ Stock de références du transporteur */

/** Stock d'un transporteur : opérations, références disponibles, prochaine référence, références retirées. */
export function referenceStock(transporterId) {
  const operations = listOperationsForTransporter(transporterId);
  const valid = operations.filter((o) => o.status === 'VALIDATED');
  const active = findActiveOperationForTransporter(transporterId);
  const consumed = getAllDuts().filter((d) => d.payment && valid.some((o) => o.id === d.payment.operationId))
    .map((d) => ({ dutId: d.id, reference: d.payment.reference, paidAt: d.payment.paidAt, paidBy: d.payment.paidBy, status: d.status, montant: d.payment.montant }))
    .sort((a, b) => Date.parse(b.paidAt) - Date.parse(a.paidAt));
  return {
    operations,
    total: valid.reduce((n, o) => n + o.quantity, 0),
    available: valid.reduce((n, o) => n + Math.max(0, o.quantity - o.used), 0),
    next: active ? peekNextNumber(active.id) : null,
    tarifUnitaire: active?.tarifUnitaire ?? null,
    consumed,
    retired: valid.flatMap((o) => o.retiredReferences || []),
  };
}

/** Transporteur qui paie ce DUT : celui qui l'édite, ou l'usager transporteur du guichet. */
export function payerTransporterId(dut) {
  return lockedTransporterId(dut);
}

/** Peut-on régler ce DUT avec une référence ? (éditeur du dossier, dossier lié à un transporteur). */
export function canPayWithReference(user, dut) {
  return !!dut && can(user, 'dut.pay_reference') && !!payerTransporterId(dut) && canEditDraft(user, dut);
}

/**
 * Règle le DUT avec la plus petite référence disponible du stock du transporteur (débit simulé du stock),
 * puis le soumet à l'antenne choisie pour validation. Le numéro réglé devient le numéro du DUT validé.
 */
export function payAndSubmit(id, { reference, antennaId } = {}) {
  const user = getCurrentUser();
  const dut = findDutById(id);
  if (!dut) throw new Error('DUT introuvable.');
  if (!canPayWithReference(user, dut)) throw new Error('Vous ne pouvez pas régler ce DUT.');
  if (dut.status !== DUT_STATUS.EN_EDITION) throw new Error('Seul un DUT en édition peut être réglé puis soumis.');
  if (dut.payment) throw new Error('Ce DUT est déjà réglé.');
  const errors = [...validateForSubmit(dut), ...referentialErrors(dut)];
  if (errors.length) throw new Error(errors[0]);

  const antenna = findAntennaById(dut.guichet ? dut.antennaId : antennaId);
  if (!antenna) throw new Error('Choisissez l’antenne OIC qui validera le DUT.');
  const transporterId = payerTransporterId(dut);
  const operation = findActiveOperationForTransporter(transporterId);
  if (!operation) throw new Error('Aucune référence disponible dans le stock de ce transporteur.');
  const expected = peekNextNumber(operation.id);
  const given = text(reference, 40).toUpperCase();
  if (!given) throw new Error('Saisissez le numéro de référence à utiliser.');
  if (given !== expected) {
    const known = listOperationsForTransporter(transporterId).some((o) => given.startsWith(`DUT-CI-${o.year}-`)
      && Number(given.slice(-6)) >= o.rangeStart && Number(given.slice(-6)) <= o.rangeEnd);
    throw new Error(known
      ? `Cette référence est déjà utilisée ou n’est pas la prochaine disponible. Utilisez ${expected}.`
      : 'Cette référence n’appartient pas au stock de ce transporteur.');
  }
  const consumed = consumeNextNumber(operation.id);
  if (consumed !== expected) throw new Error('Le stock a changé pendant le règlement : réessayez.');
  const paidAt = nowIso();
  const payment = {
    reference: consumed, operationId: operation.id, operationCode: operation.code, montant: operation.tarifUnitaire || 0,
    mode: 'STOCK_REFERENCES', simule: true, paidAt, paidBy: user.name, paidByRole: user.role,
  };
  updateDut(id, {
    payment, operationId: operation.id, antennaId: antenna.id, antennaName: antenna.name,
    status: DUT_STATUS.TERMINE, submittedAt: paidAt,
  });
  auditService.log(AUDIT_ACTIONS.DUT_REFERENCE_PAID, { dutId: id, newValue: consumed, note: `Référence ${consumed} débitée du stock ${operation.code} (débit simulé)` });
  auditService.log(dut.rejectedAt ? AUDIT_ACTIONS.DUT_RESUBMITTED : AUDIT_ACTIONS.DUT_SUBMITTED, { dutId: id, note: `Soumis à l’antenne ${antenna.name}` });
  return findDutById(id);
}

export function listAntennasForSubmission() {
  return getAllAntennas().map((a) => ({ id: a.id, name: a.name }));
}

/* ------------------------------------------------------------------ Transbordement */

export const TRANSSHIP_REASONS = {
  PANNE: 'Panne du véhicule',
  RUPTURE_CHARGE: 'Rupture de charge',
  CHANGEMENT_CONDUCTEUR: 'Changement de conducteur',
  CHANGEMENT_TRANSPORTEUR: 'Changement de transporteur',
  AUTRE: 'Autre motif',
};

/** Peut-on transborder ce DUT ? Partenaire éditeur ou transporteur en charge, DUT validé. */
export function canTransship(user, dut) {
  if (!dut || !can(user, 'dut.transship') || dut.status !== DUT_STATUS.VALIDE || dut.canary) return false;
  if (user.role === 'TRANSPORTEUR') return dut.general?.transporterId === user.transporterId;
  return !!dut.partnerId && dut.partnerId === user.partnerId;
}

/** Fiches proposées pour le transbordement : actives, dans le référentiel de l'utilisateur. */
export function transshipOptions(user = getCurrentUser()) {
  const owner = ownerForUser(user);
  return {
    transporteurs: transporters.selectable(owner),
    vehicules: vehicles.selectable(owner),
    conducteurs: drivers.selectable(owner),
  };
}

const GENERAL_CARRIER_KEYS = ['transporterId', 'transporterName', 'vehicleId', 'immatriculation', 'driverId', 'driverNom', 'driverPrenoms', 'driverPermis', 'driverPiece'];
const carrierOf = (general = {}) => Object.fromEntries(GENERAL_CARRIER_KEYS.map((k) => [k, general[k] || '']));

export async function transship(id, input = {}) {
  const user = getCurrentUser();
  const dut = findDutById(id);
  if (!dut) throw new Error('DUT introuvable.');
  if (!canTransship(user, dut)) throw new Error('Seul l’éditeur ou le transporteur en charge peut transborder un DUT validé.');
  const owner = ownerForUser(user);
  const transporter = transporters.findVisible(input.transporterId, owner);
  if (!transporter || !isSelectable(transporter)) throw new Error('Choisissez un transporteur actif.');
  const vehicle = vehicles.findVisible(input.vehicleId, owner);
  if (!vehicle || !isSelectable(vehicle)) throw new Error('Choisissez un véhicule actif.');
  if (vehicle.transporterId !== transporter.id) throw new Error('Ce véhicule n’appartient pas au transporteur choisi.');
  const driver = drivers.findVisible(input.driverId, owner);
  if (!driver || !isSelectable(driver)) throw new Error('Choisissez un conducteur actif.');
  if (!driver.piece || !driver.permis) throw new Error('La pièce d’identité et le permis du conducteur sont obligatoires : complétez sa fiche.');
  const lieu = text(input.lieu, 120);
  if (!lieu) throw new Error('Le lieu de prise en charge est obligatoire.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date || '') || (input.heure && !/^\d{2}:\d{2}$/.test(input.heure))) throw new Error('La date de prise en charge est obligatoire.');
  const priseAt = Date.parse(`${input.date}T${input.heure || '00:00'}:00`);
  if (!Number.isFinite(priseAt)) throw new Error('Date de prise en charge invalide.');
  if (dut.validatedAt && input.date < dut.validatedAt.slice(0, 10)) throw new Error('La prise en charge ne peut pas précéder la validation du DUT.');
  if (priseAt > Date.now() + 24 * 3600e3) throw new Error('La prise en charge ne peut pas être déclarée plus de 24 heures à l’avance.');
  if (!TRANSSHIP_REASONS[input.motif]) throw new Error('Choisissez le motif du transbordement.');
  if (input.motif === 'AUTRE' && !text(input.precision)) throw new Error('Précisez le motif du transbordement.');

  const avant = carrierOf(dut.general);
  const apres = {
    transporterId: transporter.id, transporterName: transporter.name, vehicleId: vehicle.id, immatriculation: vehicle.immatriculation,
    driverId: driver.id, driverNom: driver.nom, driverPrenoms: driver.prenoms || '', driverPermis: driver.permis, driverPiece: driver.piece,
  };
  if (avant.transporterId === apres.transporterId && avant.immatriculation === apres.immatriculation && avant.driverPermis === apres.driverPermis) {
    throw new Error('Aucun changement : choisissez un autre transporteur, véhicule ou conducteur.');
  }

  // Nouveau document : nouveau jeton et charge signée avec la nouvelle plaque. On signe avant d'engager quoi que ce soit.
  const key = loadKey();
  if (!key) throw new Error('Clé de signature absente : rechargez la démonstration.');
  const qrToken = generateToken();
  const at = nowIso();
  let qrSigned;
  try {
    qrSigned = await signPayload(buildQrPayload({ ...dut, qrToken, general: { ...dut.general, ...apres } }, key, { nbf: at.slice(0, 10) }), key);
  } catch (err) {
    throw new Error(`Signature impossible sur cet appareil : ${err.message}`);
  }
  const rang = (dut.transbordements || []).length + 1;
  const entry = {
    id: uuid(), rang, at, auteur: { id: user.id, name: user.name, role: user.role },
    priseEnCharge: { lieu, pays: text(input.pays, 60) || 'Côte d’Ivoire', date: input.date, heure: input.heure || '' },
    motif: input.motif, motifLabel: TRANSSHIP_REASONS[input.motif], precision: text(input.precision, 300),
    avant: { ...avant, qrToken: dut.qrToken }, apres: { ...apres, qrToken },
  };
  updateDut(id, {
    general: { ...dut.general, ...apres },
    qrToken, qrSigned,
    replacedTokens: [...(dut.replacedTokens || []), { token: dut.qrToken, at, reason: 'TRANSBORDEMENT', rang }],
    transbordements: [...(dut.transbordements || []), entry],
  });
  const who = (c) => `${c.transporterName} · ${c.immatriculation} · ${[c.driverNom, c.driverPrenoms].filter(Boolean).join(' ')}`;
  auditService.log(AUDIT_ACTIONS.DUT_TRANSSHIPPED, {
    dutId: id, dutNumber: dut.dutNumber, oldValue: who(avant), newValue: who(apres),
    note: `Transbordement n° ${rang} à ${lieu} le ${input.date}${input.heure ? ` à ${input.heure}` : ''} (${entry.motifLabel}) : ${who(avant)} → ${who(apres)}. Nouveau document émis, ancien QR refusé au contrôle.`,
  });
  return findDutById(id);
}

/* ------------------------------------------------------------------ Contrôle et archivage par l'antenne */

export const ARCHIVE_CHECKS = {
  donnees: 'Les mentions du document correspondent au dossier enregistré',
  facture: 'La facture (prix, TVA, timbre) et la mention du compte sont établies',
  pieces: 'Les pièces justificatives sont présentes et lisibles',
  exemplaire: 'L’exemplaire papier porte le numéro et le QR du dossier',
};
export const ARCHIVE_RESULTS = { CONFORME: 'Conforme', RESERVES: 'Conforme avec réserves' };
const ARCHIVABLE = [DUT_STATUS.VALIDE, DUT_STATUS.SUSPENDU, DUT_STATUS.RETIRE];

export function archiveFor(dutId) {
  return findArchiveByDutId(dutId);
}

export function canArchive(user, dut) {
  return !!dut && can(user, 'dut.archive') && dut.antennaId === user.antennaId && !!dut.dutNumber
    && ARCHIVABLE.includes(dut.status) && !dut.canary && !findArchiveByDutId(dut.id);
}

/** DUT édités (numérotés) de l'antenne, pas encore archivés. */
export function toArchive(user = getCurrentUser()) {
  if (!can(user, 'dut.archive')) return [];
  const archived = new Set(getAllArchives().map((a) => a.dutId));
  return visibleDuts(user).filter((d) => d.dutNumber && ARCHIVABLE.includes(d.status) && !d.canary && !archived.has(d.id))
    .sort((a, b) => Date.parse(a.validatedAt || a.createdAt) - Date.parse(b.validatedAt || b.createdAt));
}

function antennaCode(name = '') {
  return (name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3)) || 'ANT';
}

export function archiveDut(id, { resultat, observation = '', classeur = '', verifications = {} } = {}) {
  const user = getCurrentUser();
  const dut = findDutById(id);
  if (!dut) throw new Error('DUT introuvable.');
  requirePermission(user, 'dut.archive');
  if (dut.antennaId !== user.antennaId) throw new Error('Ce DUT ne relève pas de votre antenne.');
  if (!dut.dutNumber || !ARCHIVABLE.includes(dut.status)) throw new Error('Seul un DUT édité (numéroté) peut être archivé.');
  if (findArchiveByDutId(id)) throw new Error('Ce DUT est déjà archivé.');
  const missing = Object.keys(ARCHIVE_CHECKS).filter((k) => verifications[k] !== true);
  if (missing.length) throw new Error('Effectuez tous les points de contrôle avant d’archiver.');
  if (!ARCHIVE_RESULTS[resultat]) throw new Error('Indiquez le résultat du contrôle.');
  if (resultat === 'RESERVES' && !text(observation)) throw new Error('Décrivez les réserves constatées.');
  const year = new Date().getFullYear();
  const code = antennaCode(dut.antennaName);
  const seq = getAllArchives().filter((a) => a.antennaId === dut.antennaId && a.cote?.includes(`-${year}-`)).length + 1;
  const entry = {
    id: uuid(), dutId: id, dutNumber: dut.dutNumber, antennaId: dut.antennaId, antennaName: dut.antennaName,
    cote: `ARC-${code}-${year}-${String(seq).padStart(4, '0')}`,
    classeur: text(classeur, 80) || `Classeur ${new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`,
    resultat, observation: text(observation, 1000), verifications: { ...verifications },
    archivedAt: nowIso(), archivedBy: user.name, archivedById: user.id,
    snapshot: {
      status: dut.status, editeur: dut.partnerName, transporteur: dut.general?.transporterName || '',
      immatriculation: dut.general?.immatriculation || '', origine: dut.trajet?.chargement?.ville || '',
      destination: dut.trajet?.dechargement?.ville || '', validatedAt: dut.validatedAt,
    },
  };
  appendArchive(entry);
  auditService.log(AUDIT_ACTIONS.DUT_ARCHIVED, { dutId: id, dutNumber: dut.dutNumber, newValue: entry.cote, note: `${ARCHIVE_RESULTS[resultat]} — ${entry.classeur}${entry.observation ? ` — ${entry.observation}` : ''}` });
  return entry;
}

/** Archives consultables par période (date d'archivage, bornes incluses). Antenne : les siennes ; OIC : toutes. */
export function listArchives(user = getCurrentUser(), { from = '', to = '', antennaId = '' } = {}) {
  if (!can(user, 'archives.view')) return [];
  return getAllArchives()
    .filter((a) => (user.role === 'ANTENNA_AGENT' ? a.antennaId === user.antennaId : !antennaId || a.antennaId === antennaId))
    .filter((a) => (!from || a.archivedAt.slice(0, 10) >= from) && (!to || a.archivedAt.slice(0, 10) <= to))
    .sort((a, b) => Date.parse(b.archivedAt) - Date.parse(a.archivedAt));
}

export function operationLabel(operationId) {
  return findOperationById(operationId)?.code || '';
}
