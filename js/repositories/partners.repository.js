import { STORAGE_KEYS } from '../core/constants.js';
import { readCollection, writeCollection } from '../core/storage.js';

export function getAllPartners() {
  return readCollection(STORAGE_KEYS.PARTNERS);
}

export function findPartnerById(id) {
  return getAllPartners().find((p) => p.id === id) || null;
}

// Lot d2 : propagation du nom d'antenne sur les partenaires rattachés
export function savePartners(list) {
  writeCollection(STORAGE_KEYS.PARTNERS, list);
}
// Fin lot d2
