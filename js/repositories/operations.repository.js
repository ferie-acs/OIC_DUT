import { STORAGE_KEYS } from '../core/constants.js';
import { readCollection, writeCollection } from '../core/storage.js';

export function getAllOperations() {
  return readCollection(STORAGE_KEYS.OPERATIONS);
}

export function saveOperations(list) {
  writeCollection(STORAGE_KEYS.OPERATIONS, list);
}

export function findOperationById(id) {
  return getAllOperations().find((o) => o.id === id) || null;
}

export function findActiveOperationForPartner(partnerId) {
  return getAllOperations().find((o) => o.partnerId === partnerId && o.status === 'VALIDATED' && o.used < o.quantity) || null;
}

export function addOperation(op) {
  const list = getAllOperations();
  list.push(op);
  saveOperations(list);
  return op;
}

/** Décrémente le solde de la plage et retourne le numéro DUT officiel attribué. */
/** Le prochain numéro, sans le consommer (sert à signer la charge avant d'engager le numéro). */
export function peekNextNumber(operationId) {
  const op = findOperationById(operationId);
  if (!op) throw new Error('Opération introuvable.');
  // Lot d2 : une plage reprise, refusée ou en attente de validation ne fournit aucun numéro.
  if (op.status && op.status !== 'VALIDATED') throw new Error('Impossible de valider : la plage rattachée n’est pas active (reprise ou en attente). Resoumettez le dossier.');
  if (op.used >= op.quantity) throw new Error('Impossible de valider : aucun numéro DUT disponible.');
  return `DUT-CI-${op.year}-${String(op.rangeStart + op.used).padStart(6, '0')}`;
}

export function consumeNextNumber(operationId) {
  const list = getAllOperations();
  const idx = list.findIndex((o) => o.id === operationId);
  if (idx === -1) throw new Error('Opération introuvable.');
  const op = list[idx];
  // Lot d2 : une plage reprise, refusée ou en attente de validation ne fournit aucun numéro.
  if (op.status && op.status !== 'VALIDATED') throw new Error('Impossible de valider : la plage rattachée n’est pas active (reprise ou en attente). Resoumettez le dossier.');
  if (op.used >= op.quantity) throw new Error('Impossible de valider : aucun numéro DUT disponible.');
  const numericValue = op.rangeStart + op.used;
  const dutNumber = `DUT-CI-${op.year}-${String(numericValue).padStart(6, '0')}`;
  op.used += 1;
  list[idx] = op;
  saveOperations(list);
  return dutNumber;
}

// Lot d3 : cycle de vie du DUT et contrôle
/** Stocks de références d'un transporteur (opérations portant son identifiant). */
export function listOperationsForTransporter(transporterId) {
  return getAllOperations().filter((o) => transporterId && o.transporterId === transporterId);
}

export function findActiveOperationForTransporter(transporterId) {
  return listOperationsForTransporter(transporterId).find((o) => o.status === 'VALIDATED' && o.used < o.quantity) || null;
}

/** Numéro retiré définitivement après annulation d'un DUT : jamais réattribué, tracé sur l'opération. */
export function recordRetiredReference(operationId, entry) {
  const list = getAllOperations();
  const idx = list.findIndex((o) => o.id === operationId);
  if (idx === -1) return null;
  const op = list[idx];
  if ((op.retiredReferences || []).some((r) => r.reference === entry.reference)) return op;
  op.retiredReferences = [...(op.retiredReferences || []), entry];
  list[idx] = op;
  saveOperations(list);
  return op;
}
