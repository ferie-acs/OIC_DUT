import { STORAGE_KEYS } from '../core/constants.js';
import { readObject, writeObject } from '../core/storage.js';

const DEFAULTS = { offlineSimulated: false, clockOffsetHours: 0, postId: null };

export function getControlSettings() {
  const raw = readObject(STORAGE_KEYS.CONTROL_SETTINGS, null);
  return { ...DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) };
}

export function saveControlSettings(patch) {
  const next = { ...getControlSettings(), ...patch };
  writeObject(STORAGE_KEYS.CONTROL_SETTINGS, next);
  return next;
}
