import { STORAGE_KEYS } from '../core/constants.js';
import { readObject, writeObject } from '../core/storage.js';

const DEFAULT_STATE = { lastChapterId: null, lastPositionMs: 0, dismissed: false };

export function getExplainerState() {
  const raw = readObject(STORAGE_KEYS.EXPLAINER_STATE, null);
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_STATE };
  return {
    lastChapterId: typeof raw.lastChapterId === 'string' ? raw.lastChapterId : null,
    lastPositionMs: Number.isFinite(raw.lastPositionMs) ? raw.lastPositionMs : 0,
    dismissed: raw.dismissed === true,
  };
}

export function saveExplainerProgress(chapterId, positionMs) {
  const state = getExplainerState();
  state.lastChapterId = chapterId;
  state.lastPositionMs = Number.isFinite(positionMs) ? positionMs : 0;
  writeObject(STORAGE_KEYS.EXPLAINER_STATE, state);
  return state;
}

export function setExplainerDismissed(flag) {
  const state = getExplainerState();
  state.dismissed = flag === true;
  writeObject(STORAGE_KEYS.EXPLAINER_STATE, state);
  return state;
}
