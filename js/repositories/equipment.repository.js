// Lot d4 : Équipements et moyens de mobilité des antennes. Seul accès au stockage pour cette collection.
import { STORAGE_KEYS } from '../core/constants.js';
import { readCollection, writeCollection } from '../core/storage.js';

export function getAll() {
  return readCollection(STORAGE_KEYS.EQUIPMENT);
}

export function saveAll(items) {
  writeCollection(STORAGE_KEYS.EQUIPMENT, items);
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
