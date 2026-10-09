import { uuid, nowIso } from '../core/utils.js';
import { DUT_STATUS, AUDIT_ACTIONS, CONTROL_POLICY } from '../core/constants.js';
import { getCurrentUser } from '../core/auth.js';
import {
  getAllDuts, findDutById, addDut, updateDut,
} from '../repositories/dut.repository.js';
import { findActiveOperationForPartner, consumeNextNumber, findOperationById } from '../repositories/operations.repository.js';
import { generateToken } from './qr.service.js';
import { loadKey, signPayload } from './signing.service.js';
import * as auditService from './audit.service.js';

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
  const dut = blankDut(user);
  addDut(dut);
  auditService.log(AUDIT_ACTIONS.DUT_CREATED, { dutId: dut.id, dutNumber: null });
  return dut;
}

export function saveDraft(id, patch, { silent = false } = {}) {
  const dut = findDutById(id);
  if (!dut) throw new Error('DUT introuvable.');
  if (dut.status === DUT_STATUS.VALIDE || dut.status === DUT_STATUS.SUSPENDU || dut.status === DUT_STATUS.RETIRE) {
    throw new Error('Ce DUT est validé : il ne peut plus être modifié.');
  }
  const updated = updateDut(id, patch);
  if (!silent) auditService.log(AUDIT_ACTIONS.DUT_UPDATED, { dutId: id, dutNumber: dut.dutNumber });
  return updated;
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
  return errors;
}

export function submit(id) {
  const dut = findDutById(id);
  if (!dut) throw new Error('DUT introuvable.');
  if (dut.status !== DUT_STATUS.EN_EDITION) throw new Error('Le DUT doit être en édition pour être soumis.');
  const errors = validateForSubmit(dut);
  if (errors.length) throw new Error(errors[0]);

  const isResubmit = !!dut.rejectedAt;
  const operation = findActiveOperationForPartner(dut.partnerId);
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
  const user = getCurrentUser();
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
  const operation = dut.operationId ? findOperationById(dut.operationId) : findActiveOperationForPartner(dut.partnerId);
  if (!operation) throw new Error('Impossible de valider : aucune plage de numéros active pour ce partenaire.');
  if (operation.used >= operation.quantity) throw new Error('Impossible de valider : aucun numéro DUT disponible.');
  const key = loadKey();
  if (!key) throw new Error('Clé de signature absente : rechargez la démonstration.');

  const dutNumber = consumeNextNumber(operation.id);
  const qrToken = generateToken();
  const validatedAt = nowIso();
  const qrSigned = await signPayload(
    buildQrPayload({ ...dut, qrToken, dutNumber }, key, { nbf: validatedAt.slice(0, 10) }),
    key,
  );
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

export function suspend(id, note) {
  const dut = findDutById(id);
  if (!dut) throw new Error('DUT introuvable.');
  if (dut.status !== DUT_STATUS.VALIDE) throw new Error('Seul un DUT validé peut être suspendu.');
  updateDut(id, { status: DUT_STATUS.SUSPENDU, suspendedAt: nowIso() });
  auditService.log(AUDIT_ACTIONS.DUT_SUSPENDED, { dutId: id, dutNumber: dut.dutNumber, note });
  return findDutById(id);
}

export function unsuspend(id) {
  const dut = findDutById(id);
  if (!dut) throw new Error('DUT introuvable.');
  if (dut.status !== DUT_STATUS.SUSPENDU) throw new Error('Seul un DUT suspendu peut voir sa suspension levée.');
  updateDut(id, { status: DUT_STATUS.VALIDE, suspendedAt: null });
  auditService.log(AUDIT_ACTIONS.DUT_UNSUSPENDED, { dutId: id, dutNumber: dut.dutNumber });
  return findDutById(id);
}

export function withdraw(id, note) {
  const dut = findDutById(id);
  if (!dut) throw new Error('DUT introuvable.');
  if (![DUT_STATUS.VALIDE, DUT_STATUS.SUSPENDU].includes(dut.status)) {
    throw new Error('Seul un DUT validé ou suspendu peut être retiré.');
  }
  updateDut(id, { status: DUT_STATUS.RETIRE, withdrawnAt: nowIso() });
  auditService.log(AUDIT_ACTIONS.DUT_WITHDRAWN, { dutId: id, dutNumber: dut.dutNumber, note });
  return findDutById(id);
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
  return getAllDuts().filter((d) => d.partnerId === partnerId);
}

export function listForAntenna(antennaId) {
  return getAllDuts().filter((d) => d.antennaId === antennaId);
}

export function listPendingForAntenna(antennaId) {
  return listForAntenna(antennaId).filter((d) => d.status === DUT_STATUS.TERMINE);
}

export function listForTransporter(transporterId) {
  return getAllDuts().filter((d) => d.general.transporterId === transporterId);
}
