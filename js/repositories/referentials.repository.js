import { STORAGE_KEYS } from '../core/constants.js';
import { readCollection, writeCollection } from '../core/storage.js';

function makeCrud(key) {
  return {
    getAll: () => readCollection(key),
    save: (items) => writeCollection(key, items),
    add: (item) => {
      const items = readCollection(key);
      items.push(item);
      writeCollection(key, items);
      return item;
    },
    update: (id, patch) => {
      const items = readCollection(key);
      const idx = items.findIndex((i) => i.id === id);
      if (idx === -1) return null;
      items[idx] = { ...items[idx], ...patch };
      writeCollection(key, items);
      return items[idx];
    },
    findById: (id) => readCollection(key).find((i) => i.id === id) || null,
  };
}

export const transportersRepo = makeCrud(STORAGE_KEYS.TRANSPORTERS);
export const vehiclesRepo = makeCrud(STORAGE_KEYS.VEHICLES);
export const driversRepo = makeCrud(STORAGE_KEYS.DRIVERS);
export const thirdPartiesRepo = makeCrud(STORAGE_KEYS.THIRD_PARTIES);
export const merchandiseTypesRepo = makeCrud(STORAGE_KEYS.MERCHANDISE_TYPES);
export const packagingTypesRepo = makeCrud(STORAGE_KEYS.PACKAGING_TYPES);

// Lot d3 : cycle de vie du DUT et contrôle
export const localitiesRepo = makeCrud(STORAGE_KEYS.LOCALITIES);
