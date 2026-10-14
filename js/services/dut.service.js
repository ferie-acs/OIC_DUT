import { uuid, nowIso } from '../core/utils.js';
import { DUT_STATUS, AUDIT_ACTIONS, CONTROL_POLICY } from '../core/constants.js';
import { getCurrentUser } from '../core/auth.js';
import {
  getAllDuts, findDutById, addDut, updateDut,
} from '../repositories/dut.repository.js';
import { findActiveOperationForPartner, consumeNextNumber, peekNextNumber, findOperationById, recordRetiredReference } from '../repositories/operations.repository.js';
import { generateToken } from './qr.service.js';
import { loadKey, signPayload } from './signing.service.js';
import * as auditService from './audit.service.js';
import { can, requirePermission } from '../core/permissions.js';
import { billingErrors } from './dut-billing.service.js';
import { aviser } from './notifications.service.js'; // Intégration : messagerie unique du lot d1
import { transporters as transportersRef, vehicles as vehiclesRef, drivers as driversRef, isSelectable, lockedTransporterId, ownerForDut } from './referentials.service.js';

export function blankDut(user) {
  return {
    id: uuid(),
    status: DUT_STATUS.EN_EDITION,
    version: 1,
    dutNumber: null,
    qrToken: null,
    partnerId: user.partnerId,
    partnerName: user.partnerName,
    antennaId: user.antennaId,
    antennaName: user.antennaName,
    operationId: null,
    createdBy: user.id,
    createdByName: user.name,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    submittedAt: null,
    validatedAt: null,
    validatedBy: null,
    rejectedAt: null,
    rejectedBy: null,
    rejectionReason: null,
    suspendedAt: null,
    withdrawnAt: null,
    general: {
      dateEmission: new Date().toISOString().slice(0, 10),
      lieuEdition: '', compte: 'PROPRE', transportType: 'NATIONAL',
      transporterId: '', transporterName: '', vehicleId: '', immatriculation: '',
      driverId: '', driverNom: '', driverPrenoms: '', driverPermis: '', driverPiece: '',
    },
    expediteur: { type: 'ENTREPRISE', raisonSociale: '', registre: '', adresse: '', contact: '', reference: '' },
    destinataire: { type: 'ENTREPRISE', raisonSociale: '', registre: '', adresse: '', contact: '', reference: '' },
    dangereuse: false,
    temperatureControlee: false,
    marchandises: [],
    facturation: {
      expediteur: { prixTransport: 0, accessoires: 0, complementaires: 0, autres: 0, tva: 18, timbre: 100 },
      destinataire: { prixTransport: 0, accessoires: 0, complementaires: 0, autres: 0, tva: 18, timbre: 0 },
    },
    trajet: {
      chargement: { lieu: '', adresse: '', ville: '', reference: '', datePrevue: '' },
      dechargement: { lieu: '', adresse: '', ville: '', reference: '', datePrevue: '' },
      dateDepart: '', heureDepart: '', dateArrivee: '', heureArrivee: '',
    },
    annexes: {
      accessoires: '', complementaires: '', emballages: '', instructions: '',
      reservePriseEnCharge: '', reserveLivraison: '', pieces: [],
    },
    pdfVersions: [],
  };
}

export function createDraft(user) {
  if (!can(user, 'dut.create')) throw new Error('Votre rôle ne permet pas de créer un DUT.');
  const dut = blankDut(user);
  // Transporteur : il édite le DUT de son propre transport ; son nom est imposé et son stock de références paie le DUT.
  if (user.role === 'TRANSPORTEUR') {
    Object.assign(dut, { partnerId: null, partnerName: user.transporterName, antennaId: null, antennaName: null });
    dut.editeur = { type: 'TRANSPORTEUR', transporterId: user.transporterId, name: user.transporterName };
    Object.assign(dut.general, { transporterId: user.transporterId, transporterName: user.transporterName });
  } else if (!user.partnerId) {
    throw new Error('Le DUT doit être rattaché à un partenaire ou à un transporteur : utilisez la saisie au guichet.');
  }
  addDut(dut);
  auditService.log(AUDIT_ACTIONS.DUT_CREATED, { dutId: dut.id, dutNumber: null });
  return dut;
}

// Lot d3 : un brouillon n'est modifiable que par son éditeur, dans les seules rubriques de saisie.
// Le statut, le numéro, le QR, le partenaire ou l'antenne ne passent jamais par cette mise à jour.
export const DRAFT_KEYS = ['general', 'expediteur', 'destinataire', 'dangereuse', 'temperatureControlee', 'marchandises', 'facturation', 'trajet', 'annexes'];
export const LOCKED_STATUSES = [DUT_STATUS.VALIDE, DUT_STATUS.SUSPENDU, DUT_STATUS.RETIRE];

/** L'utilisateur est-il l'éditeur de ce dossier (partenaire, transporteur ou agent du guichet) ? */
export function canEditDraft(user, dut) {
  if (!user || !dut || !can(user, 'dut.edit_draft')) return false;
  if (dut.editeur?.type === 'TRANSPORTEUR') return user.role === 'TRANSPORTEUR' && dut.editeur.transporterId === user.transporterId;
  if (dut.guichet) return user.role === 'ANTENNA_AGENT' && dut.antennaId === user.antennaId;
  return ['PARTNER_ADMIN', 'PARTNER_EDITOR'].includes(user.role) && !!dut.partnerId && dut.partnerId === user.partnerId;
}

export function saveDraft(id, patch, { silent = false } = {}) {
  const dut = findDutById(id);
  if (!dut) throw new Error('DUT introuvable.');
  if (LOCKED_STATUSES.includes(dut.status)) {
    throw new Error('Ce DUT est validé : il ne peut plus être modifié. Il peut seulement être annulé, suspendu ou transbordé.');
  }
  if (dut.status !== DUT_STATUS.EN_EDITION) throw new Error('Seul un DUT en édition peut être modifié.');
  if (!canEditDraft(getCurrentUser(), dut)) throw new Error('Vous n’êtes pas l’éditeur de ce DUT.');
  const safe = {};
  for (const key of DRAFT_KEYS) if (patch && Object.prototype.hasOwnProperty.call(patch, key)) safe[key] = patch[key];
  if (safe.general) {
    safe.general = { ...dut.general, ...safe.general };
    const locked = lockedTransporterId(dut);
    if (locked) Object.assign(safe.general, { transporterId: locked, transporterName: dut.general.transporterName });
  }
  const updated = updateDut(id, safe);
  if (!silent) auditService.log(AUDIT_ACTIONS.DUT_UPDATED, { dutId: id, dutNumber: dut.dutNumber });
  return updated;
}

/** Les fiches choisies (transporteur, véhicule, conducteur) doivent encore être actives à la soumission. */
export function referentialErrors(dut) {
  const errors = [];
  const owner = ownerForDut(dut);
  if (!owner) return errors;
  const g = dut.general || {};
  const transporter = g.transporterId ? transportersRef.findVisible(g.transporterId, owner) : null;
  if (transporter && !isSelectable(transporter)) errors.push('Le transporteur choisi est désactivé ou retiré de votre référentiel.');
  const vehicle = vehiclesRef.list({ owner, includeRemoved: true }).find((v) => v.immatriculation === g.immatriculation);
  if (vehicle && !isSelectable(vehicle)) errors.push('Le véhicule choisi est désactivé ou retiré de votre référentiel.');
  const driver = driversRef.list({ owner, includeRemoved: true }).find((d) => g.driverPermis && d.permis === g.driverPermis);
  if (driver && !isSelectable(driver)) errors.push('Le conducteur choisi est désactivé ou retiré de votre référentiel.');
  return errors;
}

export function computeMarchandiseTotals(marchandises = []) {
  return marchandises.reduce((acc, m) => ({
    quantite: acc.quantite + (Number(m.quantite) || 0),
    poidsTonnes: acc.poidsTonnes + (Number(m.poidsTonnes) || 0),
    volumeM3: acc.volumeM3 + (Number(m.volumeM3) || 0),
    valeur: acc.valeur + (Number(m.valeur) || 0),
  }), { quantite: 0, poidsTonnes: 0, volumeM3: 0, valeur: 0 });
}

function sumPoste(p) {
  return (Number(p.prixTransport) || 0) + (Number(p.accessoires) || 0)
    + (Number(p.complementaires) || 0) + (Number(p.autres) || 0);
}

/**
 * Formule réelle OIC : chaque côté (expéditeur/destinataire) a sa propre TVA
 * et son propre timbre fiscal — pas une TVA unique à 18% sur le total.
 * TotalHT(côté) → SousTotal(côté) = HT × (1 + TVA%) → Total(côté) = SousTotal + Timbre.
 */
function sidePoste(p = {}) {
  const totalHT = sumPoste(p);
  const tvaRate = Number(p.tva) || 0;
  const tvaMontant = totalHT * (tvaRate / 100);
  const sousTotal = totalHT + tvaMontant;
  const timbre = Number(p.timbre) || 0;
  const total = sousTotal + timbre;
  return { totalHT, tvaRate, tvaMontant, sousTotal, timbre, total };
}

export function computeFacturationTotals(facturation = {}) {
  const exp = sidePoste(facturation.expediteur);
  const dest = sidePoste(facturation.destinataire);
  const totalExpediteur = exp.totalHT;
  const totalDestinataire = dest.totalHT;
  const totalHT = exp.totalHT + dest.totalHT;
  const tva = exp.tvaMontant + dest.tvaMontant;
  const timbreTotal = exp.timbre + dest.timbre;
  const sousTotal = exp.sousTotal + dest.sousTotal;
  const totalAPercevoir = exp.total + dest.total;
  return {
    expediteur: exp, destinataire: dest,
    totalExpediteur, totalDestinataire, totalHT, tva, timbreTotal, sousTotal, totalAPercevoir,
  };
}

export function validateForSubmit(dut) {
  const errors = [];
  if (!dut.general.transporterName) errors.push('Le transporteur est obligatoire.');
  if (!dut.general.immatriculation) errors.push('Le véhicule (immatriculation) est obligatoire.');
  if (!dut.general.driverPermis) errors.push('Le numéro de permis est obligatoire.');
  if (!dut.expediteur.raisonSociale) errors.push('L’expéditeur est obligatoire.');
  if (!dut.destinataire.raisonSociale) errors.push('Le destinataire est obligatoire.');
  if (!dut.marchandises || dut.marchandises.length === 0) errors.push('Veuillez ajouter au moins une marchandise.');
  const timbreTotal = (Number(dut.facturation?.expediteur?.timbre) || 0) + (Number(dut.facturation?.destinataire?.timbre) || 0);
  if (timbreTotal < 100) errors.push('Facture sans timbre ou montant en dessous de 100 FCFA.');
  if (dut.trajet.dateDepart && dut.trajet.dateArrivee) {
    const dep = new Date(`${dut.trajet.dateDepart}T${dut.trajet.heureDepart || '00:00'}`);
    const arr = new Date(`${dut.trajet.dateArrivee}T${dut.trajet.heureArrivee || '00:00'}`);
    if (arr < dep) errors.push('La date d’arrivée ne peut pas précéder la date de départ.');
  }
  // Lot d3 : facture établie par côté et mention du compte.
  for (const e of billingErrors(dut.facturation, dut.general)) if (!errors.includes(e)) errors.push(e);
  return errors;
}

export function submit(id) {
  const dut = findDutById(id);
  if (!dut) throw new Error('DUT introuvable.');
  if (dut.status !== DUT_STATUS.EN_EDITION) throw new Error('Le DUT doit être en édition pour être soumis.');
  if (!canEditDraft(getCurrentUser(), dut)) throw new Error('Vous n’êtes pas l’éditeur de ce DUT.');
  const errors = [...validateForSubmit(dut), ...referentialErrors(dut)];
  if (errors.length) throw new Error(errors[0]);
  if (lockedTransporterId(dut) && !dut.payment) throw new Error('Réglez d’abord ce DUT avec une référence du stock du transporteur.');

  const isResubmit = !!dut.rejectedAt;
  const operation = dut.payment ? findOperationById(dut.payment.operationId) : findActiveOperationForPartner(dut.partnerId);
  updateDut(id, {
    status: DUT_STATUS.TERMINE,
    submittedAt: nowIso(),
    operationId: operation ? operation.id : dut.operationId,
  });
  auditService.log(isResubmit ? AUDIT_ACTIONS.DUT_RESUBMITTED : AUDIT_ACTIONS.DUT_SUBMITTED, { dutId: id });
  return findDutById(id);
}

export function reject(id, reason) {
  if (!reason || !reason.trim()) throw new Error('Le motif du rejet est obligatoire.');
  const dut = findDutById(id);
  if (!dut) throw new Error('DUT introuvable.');
  if (dut.status !== DUT_STATUS.TERMINE) throw new Error('Seul un DUT terminé peut être rejeté.');
  const user = requireLifecycleRight(dut, 'dut.reject'); // Intégration : droit vérifié par le service (rôle Direction exclu)
  updateDut(id, {
    status: DUT_STATUS.REJETE,
    rejectedAt: nowIso(),
    rejectedBy: user?.name || null,
    rejectionReason: reason.trim(),
  });
  auditService.log(AUDIT_ACTIONS.DUT_REJECTED, { dutId: id, note: reason.trim() });
  return findDutById(id);
}

export function reopenForCorrection(id) {
  const dut = findDutById(id);
  if (!dut) throw new Error('DUT introuvable.');
  if (dut.status !== DUT_STATUS.REJETE) throw new Error('Seul un DUT rejeté peut être corrigé.');
  if (!canEditDraft(getCurrentUser(), dut)) throw new Error('Seul l’éditeur du DUT peut le corriger.');
  updateDut(id, { status: DUT_STATUS.EN_EDITION });
  return findDutById(id);
}

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** La charge du QR : identité minimale du DUT, jamais de donnée commerciale. */
export function buildQrPayload(dut, key, { nbf }) {
  return {
    v: 2,
    kid: key.kid,
    uid: dut.qrToken,
    num: dut.dutNumber,
    plq: dut.general?.immatriculation || '',
    nbf,
    exp: addDays(nbf, CONTROL_POLICY.validityDays),
  };
}

/** Validation : attribue le numéro ET signe la charge du QR, au même instant. */
export async function validate(id) {
  const dut = findDutById(id);
  if (!dut) throw new Error('DUT introuvable.');
  if (dut.status !== DUT_STATUS.TERMINE) throw new Error('Le DUT doit être terminé avant validation.');
  // Intégration : droit de validation et ressort de l'antenne vérifiés par le service, pas seulement par l'écran.
  const validator = requireLifecycleRight(dut, 'dut.validate');
  // Lot d3 : la personne qui a saisi le DUT (au guichet notamment) ne le valide pas elle-même.
  if (validator && validator.id === dut.createdBy) throw new Error('Vous avez saisi ce DUT : sa validation revient à un autre agent.');
  // Lot d3 : un DUT déjà réglé par une référence du stock porte ce numéro ; aucun autre numéro n'est consommé.
  const paid = dut.payment?.reference || null;
  const operation = paid ? findOperationById(dut.payment.operationId) : dut.operationId ? findOperationById(dut.operationId) : findActiveOperationForPartner(dut.partnerId);
  if (!operation) throw new Error('Impossible de valider : aucune plage de numéros active pour ce partenaire.');
  if (!paid && operation.used >= operation.quantity) throw new Error('Impossible de valider : aucun numéro DUT disponible.');
  const key = loadKey();
  if (!key) throw new Error('Clé de signature absente : rechargez la démonstration.');

  // On signe AVANT de consommer le numéro : si la signature échoue, rien n'est engagé.
  const dutNumber = paid || peekNextNumber(operation.id);
  const qrToken = generateToken();
  const validatedAt = nowIso();
  let qrSigned;
  try {
    qrSigned = await signPayload(buildQrPayload({ ...dut, qrToken, dutNumber }, key, { nbf: validatedAt.slice(0, 10) }), key);
  } catch (err) {
    throw new Error(`Signature impossible sur cet appareil : ${err.message}`);
  }
  if (!paid) {
    const consumed = consumeNextNumber(operation.id);
    if (consumed !== dutNumber) throw new Error('Numéro de DUT modifié pendant la validation : réessayez.');
  }
  const user = getCurrentUser();
  updateDut(id, {
    status: DUT_STATUS.VALIDE,
    dutNumber,
    qrToken,
    qrSigned,
    operationId: operation.id,
    validatedAt,
    validatedBy: user?.name || null,
  });
  auditService.log(AUDIT_ACTIONS.DUT_VALIDATED, { dutId: id, dutNumber, newValue: dutNumber });
  auditService.log(AUDIT_ACTIONS.DUT_SIGNED, { dutId: id, dutNumber, note: `Clé ${key.kid}` });
  return findDutById(id);
}

/** Lot d3 : action sensible réservée au rôle habilité, dans son périmètre (antenne pour l'agent d'antenne). */
function requireLifecycleRight(dut, permission) {
  const user = getCurrentUser();
  requirePermission(user, permission);
  if (user.role === 'ANTENNA_AGENT' && dut.antennaId !== user.antennaId) throw new Error('Ce DUT ne relève pas de votre antenne.');
  return user;
}

export function suspend(id, note) {
  const dut = findDutById(id);
  if (!dut) throw new Error('DUT introuvable.');
  requireLifecycleRight(dut, 'dut.suspend');
  if (!note || !String(note).trim()) throw new Error('Le motif de la suspension est obligatoire.');
  if (dut.status !== DUT_STATUS.VALIDE) throw new Error('Seul un DUT validé peut être suspendu.');
  updateDut(id, { status: DUT_STATUS.SUSPENDU, suspendedAt: nowIso() });
  auditService.log(AUDIT_ACTIONS.DUT_SUSPENDED, { dutId: id, dutNumber: dut.dutNumber, note });
  notifyEditor(dut, `DUT ${dut.dutNumber || ''} suspendu`, `Le DUT ${dut.dutNumber || ''} a été suspendu par l’OIC. Motif : ${String(note).trim()}. Il ne peut plus circuler tant que la suspension n’est pas levée.`);
  return findDutById(id);
}

export function unsuspend(id) {
  const dut = findDutById(id);
  if (!dut) throw new Error('DUT introuvable.');
  requireLifecycleRight(dut, 'dut.unsuspend');
  if (dut.status !== DUT_STATUS.SUSPENDU) throw new Error('Seul un DUT suspendu peut voir sa suspension levée.');
  updateDut(id, { status: DUT_STATUS.VALIDE, suspendedAt: null });
  auditService.log(AUDIT_ACTIONS.DUT_UNSUSPENDED, { dutId: id, dutNumber: dut.dutNumber });
  return findDutById(id);
}

/**
 * Annulation d'un DUT (retrait de la circulation). Lot d3 : motif obligatoire, auteur et date conservés,
 * journalisée. Règle du numéro : il est RETIRÉ définitivement, jamais rendu au stock ni réattribué, car il
 * figure déjà sur un document imprimé et dans un QR signé (le rendre permettrait de faire circuler deux
 * documents sous le même numéro).
 */
export function withdraw(id, note) {
  const dut = findDutById(id);
  if (!dut) throw new Error('DUT introuvable.');
  const user = requireLifecycleRight(dut, 'dut.withdraw');
  const motif = String(note || '').trim();
  if (!motif) throw new Error('Le motif de l’annulation est obligatoire.');
  if (![DUT_STATUS.VALIDE, DUT_STATUS.SUSPENDU].includes(dut.status)) {
    throw new Error('Seul un DUT validé ou suspendu peut être annulé.');
  }
  const withdrawnAt = nowIso();
  updateDut(id, {
    status: DUT_STATUS.RETIRE, withdrawnAt, withdrawnBy: user.name, withdrawnByRole: user.role,
    withdrawalReason: motif, referenceRule: 'RETIREE',
  });
  auditService.log(AUDIT_ACTIONS.DUT_WITHDRAWN, { dutId: id, dutNumber: dut.dutNumber, oldValue: dut.status, newValue: DUT_STATUS.RETIRE, note: motif });
  if (dut.dutNumber && dut.operationId) {
    recordRetiredReference(dut.operationId, { reference: dut.dutNumber, dutId: id, at: withdrawnAt, by: user.name, motif });
    auditService.log(AUDIT_ACTIONS.REFERENCE_RETIRED, { dutId: id, dutNumber: dut.dutNumber, note: 'Numéro retiré définitivement : il ne sera jamais réattribué.' });
  }
  notifyEditor(dut, `DUT ${dut.dutNumber || ''} annulé`, `Le DUT ${dut.dutNumber || ''} a été annulé par ${user.name}. Motif : ${motif}. Son numéro est retiré définitivement et le document ne peut plus circuler.`);
  return findDutById(id);
}

/** Intégration (messagerie unique du lot d1) : l'éditeur du dossier — partenaire ou transporteur — est prévenu. */
function notifyEditor(dut, objet, corps) {
  const transporterId = lockedTransporterId(dut);
  const criteres = transporterId ? { roles: ['TRANSPORTEUR'], transporterId } : dut.partnerId ? { roles: ['PARTNER_ADMIN', 'PARTNER_EDITOR'], partnerId: dut.partnerId } : null;
  if (criteres) aviser(criteres, { objet, corps, origine: 'Cycle du DUT', lien: `#/dut/${dut.id}`, entite: dut.id });
}

export function reprint(id, motif) {
  if (!motif || !motif.trim()) throw new Error('Le motif de réimpression est obligatoire.');
  const dut = findDutById(id);
  if (!dut) throw new Error('DUT introuvable.');
  const nextVersion = (dut.pdfVersions?.length || 0) + 2; // v1 = génération initiale
  const versions = [...(dut.pdfVersions || []), { version: nextVersion, generatedAt: nowIso(), motif: motif.trim() }];
  updateDut(id, { pdfVersions: versions });
  auditService.log(AUDIT_ACTIONS.DUT_REPRINTED, { dutId: id, dutNumber: dut.dutNumber, note: motif.trim(), newValue: `v${nextVersion}` });
  return findDutById(id);
}

export function recordPdfGenerated(id, version = 1) {
  const dut = findDutById(id);
  if (!dut) return;
  auditService.log(AUDIT_ACTIONS.DUT_PDF_GENERATED, { dutId: id, dutNumber: dut.dutNumber, note: `Version ${version}` });
}

export function getDut(id) {
  return findDutById(id);
}

export function listAll() {
  return getAllDuts();
}

export function listForPartner(partnerId) {
  return getAllDuts().filter((d) => d.partnerId === partnerId && !d.canary);
}

export function listForAntenna(antennaId) {
  return getAllDuts().filter((d) => d.antennaId === antennaId);
}

export function listPendingForAntenna(antennaId) {
  return listForAntenna(antennaId).filter((d) => d.status === DUT_STATUS.TERMINE);
}

export function listForTransporter(transporterId) {
  // Lot d3 : le transporteur d'origine garde l'accès à un DUT transbordé vers un autre transporteur.
  return getAllDuts().filter((d) => (d.general.transporterId === transporterId
    || (d.transbordements || []).some((t) => t.avant?.transporterId === transporterId)) && !d.canary);
}
