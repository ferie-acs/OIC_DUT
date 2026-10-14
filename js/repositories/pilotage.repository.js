// Lot d5 : seul accès au stockage local pour le pilotage de la Direction générale
// (indicateurs, contrats d'objectifs, actions correctives, agents, documents, réunions, contrats juridiques).
import { STORAGE_KEYS } from '../core/constants.js';
import { readCollection, writeCollection, readObject, writeObject } from '../core/storage.js';

function collection(key) {
  return {
    all: () => readCollection(key),
    find: (id) => readCollection(key).find((x) => x.id === id) || null,
    save: (list) => writeCollection(key, list),
    /** Insère ou remplace un élément (par identifiant) et le renvoie. */
    upsert(item) {
      const list = readCollection(key);
      const i = list.findIndex((x) => x.id === item.id);
      if (i === -1) list.push(item); else list[i] = item;
      writeCollection(key, list);
      return item;
    },
  };
}

export const indicatorsRepo = collection(STORAGE_KEYS.PILOT_INDICATORS);
export const objectiveContractsRepo = collection(STORAGE_KEYS.PILOT_CONTRACTS);
export const correctiveActionsRepo = collection(STORAGE_KEYS.PILOT_ACTIONS);
export const agentProfilesRepo = collection(STORAGE_KEYS.AGENT_PROFILES);
export const agentEvaluationsRepo = collection(STORAGE_KEYS.AGENT_EVALUATIONS);
export const directionDocumentsRepo = collection(STORAGE_KEYS.DIRECTION_DOCUMENTS);
export const meetingsRepo = collection(STORAGE_KEYS.MEETINGS);
export const legalContractsRepo = collection(STORAGE_KEYS.LEGAL_CONTRACTS);

export function readLotSeedMarker() { return readObject(STORAGE_KEYS.LOT_D5_SEED, null); }
export function writeLotSeedMarker(value) { writeObject(STORAGE_KEYS.LOT_D5_SEED, value); }
