import { STORAGE_KEYS } from '../core/constants.js';
import { readObject, writeObject } from '../core/storage.js';

export function getCrl() {
  return readObject(STORAGE_KEYS.CRL, null);
}

export function saveCrl(crl) {
  writeObject(STORAGE_KEYS.CRL, crl);
  return crl;
}
