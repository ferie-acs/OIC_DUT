// Lot d1 : accès au stockage des comptes et acteurs (messages, partenaires, demandes d'inscription,
// déclarations de véhicules, habilitations). Seul point d'accès LocalStorage pour ces collections.
import { STORAGE_KEYS } from '../core/constants.js';
import { readCollection, writeCollection, readObject, writeObject } from '../core/storage.js';

function collection(key) {
  return {
    getAll: () => readCollection(key),
    saveAll: (items) => writeCollection(key, items),
    findById: (id) => readCollection(key).find((x) => x.id === id) || null,
    add: (item) => { const items = readCollection(key); items.push(item); writeCollection(key, items); return item; },
    replace: (item) => {
      const items = readCollection(key);
      const idx = items.findIndex((x) => x.id === item.id);
      if (idx === -1) throw new Error('Enregistrement introuvable.');
      items[idx] = item; writeCollection(key, items); return item;
    },
  };
}

export const messagesRepo = collection(STORAGE_KEYS.MESSAGES);
export const partnersStore = collection(STORAGE_KEYS.PARTNERS);
export const applicationsRepo = collection(STORAGE_KEYS.TRANSPORTER_APPLICATIONS);
export const declarationsRepo = collection(STORAGE_KEYS.VEHICLE_DECLARATIONS);
export const transportersStore = collection(STORAGE_KEYS.TRANSPORTERS);
export const vehiclesStore = collection(STORAGE_KEYS.VEHICLES);
export const usersStore = collection(STORAGE_KEYS.USERS);
export const antennasStore = { getAll: () => readCollection(STORAGE_KEYS.ANTENNAS) };
export const auditStore = { getAll: () => readCollection(STORAGE_KEYS.AUDIT_LOGS) };
export const dutsStore = { getAll: () => readCollection(STORAGE_KEYS.DUT_LIST) };

export function readHabilitations() { return readObject(STORAGE_KEYS.HABILITATIONS, {}) || {}; }
export function writeHabilitations(value) { writeObject(STORAGE_KEYS.HABILITATIONS, value); }
export function readSeedMarker() { return readObject(STORAGE_KEYS.LOT_D1_SEED, 0); }
export function writeSeedMarker(v) { writeObject(STORAGE_KEYS.LOT_D1_SEED, v); }
