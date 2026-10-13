import { STORAGE_KEYS } from '../core/constants.js';
import { readCollection, writeCollection } from '../core/storage.js';

// Lot d3 : archivage des DUT édités par les antennes. Ajout seulement : une fiche d'archive ne se modifie pas.
export function getAllArchives() {
  return readCollection(STORAGE_KEYS.ARCHIVES);
}

export function findArchiveByDutId(dutId) {
  return getAllArchives().find((a) => a.dutId === dutId) || null;
}

export function appendArchive(entry) {
  const list = getAllArchives();
  list.push(entry);
  writeCollection(STORAGE_KEYS.ARCHIVES, list);
  return entry;
}
