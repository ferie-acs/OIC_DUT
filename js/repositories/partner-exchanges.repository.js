// Lot d4 : Échanges entre l'OIC et les partenaires habilités. Seul accès au stockage pour cette collection.
import { STORAGE_KEYS } from '../core/constants.js';
import { readCollection, writeCollection } from '../core/storage.js';

export function getAll() {
  return readCollection(STORAGE_KEYS.PARTNER_THREADS);
}

export function saveAll(items) {
  writeCollection(STORAGE_KEYS.PARTNER_THREADS, items);
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
