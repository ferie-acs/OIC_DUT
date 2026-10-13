import { getCurrentUser } from '../core/auth.js';
import { uuid, nowIso } from '../core/utils.js';
import { AUDIT_ACTIONS } from '../core/constants.js';
import { getAllOperations, addOperation, saveOperations } from '../repositories/operations.repository.js';
import * as auditService from './audit.service.js';
// Lot d2 : numérotation sans chevauchement avec les stocks d'antenne, créance de caisse, tarifs
import { can } from '../core/permissions.js';
import { nextFreeStart } from './ranges.service.js';
import { createForOperation } from './payments.service.js';
import { amountsFor, pricing } from './range-pricing.service.js';
import { aviser } from './notifications.service.js'; // Intégration : messagerie unique du lot d1
// Fin lot d2

export function listForPartner(partnerId) {
  return getAllOperations().filter((o) => o.partnerId === partnerId);
}

export function listAll() {
  return getAllOperations();
}

export function requestNewRange(user, { quantite, tarifUnitaire, commentaire }) {
  if (getCurrentUser()?.id !== user.id || !can(user, 'operations.request')) throw new Error('Demande non autorisée.');
  if (!Number.isFinite(Number(tarifUnitaire)) || Number(tarifUnitaire) < 0) throw new Error('Tarif invalide.');
  // Lot d2 : le tarif est fixé par l'OIC (paramètres), jamais par le demandeur.
  tarifUnitaire = pricing().unitHT;
  const qty = Number(quantite);
  if (!Number.isSafeInteger(qty) || qty <= 0 || qty > 10000) throw new Error('La quantité doit être un entier entre 1 et 10 000.');
  const operation = {
    id: uuid(),
    code: `OP-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 90000) + 10000)}`,
    partnerId: user.partnerId,
    partnerName: user.partnerName,
    year: new Date().getFullYear(),
    rangeStart: null,
    rangeEnd: null,
    quantity: qty,
    used: 0,
    tarifUnitaire: Number(tarifUnitaire) || 0,
    montantTotal: qty * (Number(tarifUnitaire) || 0),
    commentaire: commentaire || '',
    status: 'PENDING',
    requestedAt: nowIso(),
    validatedAt: null,
  };
  addOperation(operation);
  auditService.log(AUDIT_ACTIONS.OPERATION_REQUESTED, { note: `${operation.code} — ${qty} numéros demandés` });
  return operation;
}

export function decideRange(id, accepted, reason = '') {
  const user = getCurrentUser();
  if (user?.role !== 'OIC_ADMIN') throw new Error('Cette action est réservée à l’OIC.');
  const list = getAllOperations();
  const op = list.find(item => item.id === id);
  if (!op || op.status !== 'PENDING') throw new Error('Cette demande a déjà été traitée ou est introuvable.');
  if (!accepted && !reason.trim()) throw new Error('Le motif du refus est obligatoire.');
  if (accepted) {
    if (!Number.isSafeInteger(op.quantity) || op.quantity < 1 || op.quantity > 10000) throw new Error('Quantité de la demande invalide.');
    const year = new Date().getFullYear();
    // Lot d2 : le maximum tient compte de toutes les plages, des stocks d'antenne et des DUT numérotés.
    const maximum = nextFreeStart(year) - 1;
    if (maximum + op.quantity > 999999) throw new Error('Capacité de numérotation annuelle atteinte.');
    Object.assign(op, { status: 'VALIDATED', year, rangeStart: maximum + 1, rangeEnd: maximum + op.quantity, used: 0, validatedAt: nowIso() });
  } else Object.assign(op, { status: 'REJECTED', rejectionReason: reason.trim(), rejectedAt: nowIso() });
  op.decidedBy = user.name;
  // Lot d2 : montants figés à l'attribution, créance transmise à la caisse, décision journalisée.
  if (accepted) op.amounts = amountsFor(op.quantity, { ...pricing(), unitHT: Number(op.tarifUnitaire) || 0 });
  saveOperations(list);
  if (accepted) createForOperation(op, { by: user });
  auditService.log(AUDIT_ACTIONS.RANGE_DECIDED, { newValue: op.code, note: accepted ? `${op.code} · ${op.partnerName} · plage ${op.rangeStart} à ${op.rangeEnd} attribuée` : `${op.code} · refusée : ${reason.trim()}` });
  // Messagerie unique (lot d1) : les administrateurs du partenaire sont informés de la décision.
  if (op.partnerId) aviser({ roles: ['PARTNER_ADMIN'], partnerId: op.partnerId }, { objet: `Demande de plage ${op.code} ${accepted ? 'acceptée' : 'refusée'}`, corps: accepted ? `Votre demande de ${op.quantity} numéro(s) est acceptée : plage ${op.rangeStart} à ${op.rangeEnd}. La créance est transmise à la caisse.` : `Votre demande de ${op.quantity} numéro(s) est refusée : ${reason.trim()}.`, origine: 'Plages de numéros', lien: '#/partner/operations', entite: op.id });
  return op;
}

// Lot d2 : le partenaire modifie ou annule une demande encore en attente
function ownPendingRequest(user, id, list) {
  if (getCurrentUser()?.id !== user.id || !can(user, 'operations.request')) throw new Error('Action non autorisée.');
  const op = list.find((item) => item.id === id);
  if (!op || op.partnerId !== user.partnerId) throw new Error('Cette demande ne fait pas partie de votre périmètre.');
  if (op.status !== 'PENDING') throw new Error('Seule une demande encore en attente peut être modifiée ou annulée.');
  return op;
}

export function updatePendingRequest(user, id, { quantite, commentaire = '' }) {
  const list = getAllOperations();
  const op = ownPendingRequest(user, id, list);
  const qty = Number(quantite);
  if (!Number.isSafeInteger(qty) || qty <= 0 || qty > 10000) throw new Error('La quantité doit être un entier entre 1 et 10 000.');
  const before = `${op.quantity} numéros`;
  Object.assign(op, { quantity: qty, montantTotal: qty * (Number(op.tarifUnitaire) || 0), commentaire: String(commentaire || '').trim(), updatedAt: nowIso() });
  saveOperations(list);
  auditService.log(AUDIT_ACTIONS.RANGE_REQUEST_UPDATED, { oldValue: before, newValue: `${qty} numéros`, note: `${op.code} · ${before} → ${qty} numéros` });
  return op;
}

export function cancelPendingRequest(user, id, reason) {
  const motive = String(reason || '').trim();
  if (!motive) throw new Error('Le motif de l’annulation est obligatoire.');
  const list = getAllOperations();
  const op = ownPendingRequest(user, id, list);
  Object.assign(op, { status: 'CANCELLED', cancelledAt: nowIso(), cancelReason: motive, cancelledBy: user.name });
  saveOperations(list);
  auditService.log(AUDIT_ACTIONS.RANGE_REQUEST_CANCELLED, { newValue: op.code, note: `${op.code} · ${motive}` });
  return op;
}
// Fin lot d2
