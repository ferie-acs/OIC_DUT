import { STORAGE_KEYS } from '../core/constants.js';
import { readCollection, writeCollection } from '../core/storage.js';

// Lot d3 : journal des recherches de DUT par conducteur faites par les agents de contrôle. Ajout seulement.
export function getAllControlSearches() {
  return readCollection(STORAGE_KEYS.CONTROL_SEARCHES);
}

export function appendControlSearch(entry) {
  const list = getAllControlSearches();
  list.push(entry);
  writeCollection(STORAGE_KEYS.CONTROL_SEARCHES, list);
  return entry;
}
