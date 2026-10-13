// Lot d4 : Incidents de la plateforme (distincts des incidents de transport d'un dossier DUT). Seul accès au stockage pour cette collection.
import { STORAGE_KEYS } from '../core/constants.js';
import { readCollection, writeCollection } from '../core/storage.js';

export function getAll() {
  return readCollection(STORAGE_KEYS.PLATFORM_INCIDENTS);
}

export function saveAll(items) {
  writeCollection(STORAGE_KEYS.PLATFORM_INCIDENTS, items);
}

export function findById(id) {
  return getAll().find((item) => item.id === id) || null;
}

/** Remplace (ou ajoute) un élément, puis enregistre la collection. */
export function upsert(item) {
  const list = getAll();
  const index = list.findIndex((x) => x.id === item.id);
  if (index >= 0) list[index] = item; else list.push(item);
  saveAll(list);
  return item;
}
