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
  if (op.used >= op.quantity) throw new Error('Impossible de valider : aucun numéro DUT disponible.');
  return `DUT-CI-${op.year}-${String(op.rangeStart + op.used).padStart(6, '0')}`;
}

export function consumeNextNumber(operationId) {
  const list = getAllOperations();
  const idx = list.findIndex((o) => o.id === operationId);
  if (idx === -1) throw new Error('Opération introuvable.');
  const op = list[idx];
  if (op.used >= op.quantity) throw new Error('Impossible de valider : aucun numéro DUT disponible.');
  const numericValue = op.rangeStart + op.used;
  const dutNumber = `DUT-CI-${op.year}-${String(numericValue).padStart(6, '0')}`;
  op.used += 1;
  list[idx] = op;
  saveOperations(list);
  return dutNumber;
}
