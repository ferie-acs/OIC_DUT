// Lot d2 : stock de numéros des antennes (approvisionnements) et tarifs des références.
import { STORAGE_KEYS } from '../core/constants.js';
import { readCollection, writeCollection, readObject, writeObject } from '../core/storage.js';

export function getAllAllocations() { return readCollection(STORAGE_KEYS.RANGE_STOCK); }
export function saveAllocations(list) { writeCollection(STORAGE_KEYS.RANGE_STOCK, list); }
export function findAllocationById(id) { return getAllAllocations().find((a) => a.id === id) || null; }

export function readPricing() { return readObject(STORAGE_KEYS.RANGE_PRICING, {}) || {}; }
export function writePricing(value) { writeObject(STORAGE_KEYS.RANGE_PRICING, value); }
