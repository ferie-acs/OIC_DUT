import { STORAGE_KEYS } from '../core/constants.js';
import { readObject, writeObject } from '../core/storage.js';

export function getSigningKey() {
  return readObject(STORAGE_KEYS.SIGNING_KEY, null);
}

export function saveSigningKey(key) {
  writeObject(STORAGE_KEYS.SIGNING_KEY, key);
  return key;
}
