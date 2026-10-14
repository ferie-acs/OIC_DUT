// Lot d2 : paiements (achats de plages, frais DUT) et justifications d'écarts de rapprochement.
import { STORAGE_KEYS } from '../core/constants.js';
import { readCollection, writeCollection } from '../core/storage.js';

export function getAllPayments() { return readCollection(STORAGE_KEYS.PAYMENTS); }
export function savePayments(list) { writeCollection(STORAGE_KEYS.PAYMENTS, list); }
export function findPaymentById(id) { return getAllPayments().find((p) => p.id === id) || null; }

export function getReconciliationNotes() { return readCollection(STORAGE_KEYS.RECONCILIATION_NOTES); }
export function saveReconciliationNotes(list) { writeCollection(STORAGE_KEYS.RECONCILIATION_NOTES, list); }

/** Journal des impressions de DUT (lecture seule) : chaque impression consomme un préimprimé. */
export function getPrintJournal() { return readCollection('dut_prints_v2'); }
