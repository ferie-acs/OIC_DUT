import { STORAGE_KEYS } from '../core/constants.js';
import { readCollection, writeCollection } from '../core/storage.js';

export function getAllControlLogs() {
  return readCollection(STORAGE_KEYS.CONTROL_LOGS);
}

export function findControlLogById(id) {
  return getAllControlLogs().find((c) => c.id === id) || null;
}

export function appendControlLog(entry) {
  const list = readCollection(STORAGE_KEYS.CONTROL_LOGS);
  list.push(entry);
  writeCollection(STORAGE_KEYS.CONTROL_LOGS, list);
  return entry;
}

export function getAllDerogations() {
  return readCollection(STORAGE_KEYS.DEROGATIONS);
}

export function appendDerogation(derogation) {
  const list = readCollection(STORAGE_KEYS.DEROGATIONS);
  list.push(derogation);
  writeCollection(STORAGE_KEYS.DEROGATIONS, list);
  return derogation;
}
