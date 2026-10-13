// Lot d2 : référentiel des sites (ports, frontières, gares, zones industrielles, parcs…).
import { STORAGE_KEYS } from '../core/constants.js';
import { readCollection, writeCollection } from '../core/storage.js';

export function getAllSites() { return readCollection(STORAGE_KEYS.SITES); }
export function saveSites(list) { writeCollection(STORAGE_KEYS.SITES, list); }
export function findSiteById(id) { return getAllSites().find((s) => s.id === id) || null; }
