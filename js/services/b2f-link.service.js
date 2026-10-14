// Passerelle Bourse de fret (B2F) → DUT, lot A.
// Reçoit les missions validées et les événements de transport émis par B2F, les valide strictement,
// les conserve à ajout seul et les applique au suivi du DUT relié. Conception :
// docs/superpowers/specs/2026-10-10-passerelle-b2f-dut-design.md
import { readObject, writeObject } from '../core/storage.js';
import { nowIso, uuid } from '../core/utils.js';
import { createDraft } from './dut.service.js';
import { findDutById, getAllDuts, updateDut } from '../repositories/dut.repository.js';
import { LOCAL_KEY as WORKSPACE_KEY } from './workspace.service.js';

/** Seules ces origines peuvent alimenter la passerelle. Jamais de joker. */
export const B2F_ORIGINS = Object.freeze(['http://localhost:8081']);
export const B2F_APP_URL = 'http://localhost:8081/';

const MISSIONS_KEY = 'dut_b2f_missions';
const EVENTS_KEY = 'dut_b2f_events';
const MAX_EVENTS = 2000;

const STAGE_ORDER = ['PLANNED', 'LOADED', 'DEPARTED', 'ARRIVED', 'DELIVERED'];
const STAGE_LABELS = { PLANNED: 'À préparer', LOADED: 'Chargé', DEPARTED: 'En route', ARRIVED: 'Arrivé', DELIVERED: 'Livré' };
/** Étape B2F → [étape DUT atteinte, libellé d'historique]. */
const B2F_STAGES = {
  valide: ['PLANNED', 'Mission validée (Bourse de fret)'],
  a_quai: ['PLANNED', 'À quai (Bourse de fret)'],
  charge: ['LOADED', 'Chargé'],
  en_route: ['DEPARTED', 'En route'],
  livre: ['DELIVERED', 'Livré'],
  cloture: ['DELIVERED', 'Clôturé (Bourse de fret)'],
};
export const B2F_INCIDENTS = { panne: 'Panne', retard: 'Retard', barrage: 'Barrage', litige_chargement: 'Litige au chargement' };

const MISSION_FIELDS = {
  corridor: 160, departPrevu: 40, arriveePrevue: 40, marchandise: 200, poidsTotalT: 12,
  transporteurRaisonSociale: 160, affreteurRaisonSociale: 160, immatriculation: 20, chauffeurNom: 120,
};

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const shortText = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const isIsoDate = (v) => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));
const isId = (v) => typeof v === 'string' && /^[A-Za-z0-9_:.-]{1,80}$/.test(v);

/** Valide un message B2F ; renvoie la valeur nettoyée ou la raison du refus. */
export function validateMessage(message) {
  if (!isPlainObject(message) || message.v !== 1) return { error: 'format' };
  if (message.type === 'b2f.mission') {
    const { appariementId, reference, donnees } = message;
    if (!isId(appariementId) || !shortText(reference, 40) || !isPlainObject(donnees)) return { error: 'mission' };
    const clean = {};
    for (const [key, max] of Object.entries(MISSION_FIELDS)) {
      const value = donnees[key];
      if (value == null) continue;
      if (key === 'poidsTotalT') { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1000) return { error: `champ ${key}` }; clean[key] = value; continue; }
      if (!shortText(String(value), max)) return { error: `champ ${key}` };
      clean[key] = String(value).trim();
    }
    return { value: { type: 'b2f.mission', appariementId, reference: reference.trim(), donnees: clean } };
  }
  if (message.type === 'b2f.event') {
    const { id, appariementId, categorie, valeur, observation, horodatage } = message;
    if (!isId(id) || !isId(appariementId) || !isIsoDate(horodatage)) return { error: 'événement' };
    if (categorie === 'etape' && !Object.hasOwn(B2F_STAGES, valeur)) return { error: 'étape inconnue' };
    if (categorie === 'incident' && !Object.hasOwn(B2F_INCIDENTS, valeur)) return { error: 'incident inconnu' };
    if (!['etape', 'incident'].includes(categorie)) return { error: 'catégorie' };
    if (observation != null && (typeof observation !== 'string' || observation.length > 2000)) return { error: 'observation' };
    return { value: { type: 'b2f.event', id, appariementId, kind: categorie, valeur, observation: observation?.trim() || '', horodatage } };
  }
  if (message.type === 'b2f.statut?') {
    if (!isId(message.appariementId)) return { error: 'demande de statut' };
    return { value: { type: 'b2f.statut?', appariementId: message.appariementId } };
  }
  return { error: 'type inconnu' };
}

/** Statut du DUT relié à une mission (lot B) : code de statut et numéro officiel, ou null si aucun DUT. */
export function statusFor(appariementId) {
  const mission = missionFor(appariementId);
  const dut = (mission?.dutId && findDutById(mission.dutId))
    || getAllDuts().find((d) => d.source?.plateforme === 'B2F' && d.source.appariementId === appariementId);
  return dut ? { statut: dut.status, numero: dut.dutNumber || null } : null;
}

export const missions = () => readObject(MISSIONS_KEY, []);
const events = () => readObject(EVENTS_KEY, []);
export const missionFor = (appariementId) => missions().find((m) => m.appariementId === appariementId) || null;
/** Mission B2F reliée à un dossier DUT, ou null pour un transport hors Bourse de fret. */
export const linkedMission = (dut) => (dut?.source?.plateforme === 'B2F' ? missionFor(dut.source.appariementId) || { appariementId: dut.source.appariementId, reference: dut.source.reference } : null);

/**
 * Point d'entrée du relais : origine, format, idempotence, puis enregistrement et application.
 * @returns {{statut: 'appliqué'|'en attente'|'doublon'|'refusé'|'répondu', raison?: string, reponse?: object}}
 */
export function receive(origin, message) {
  if (!B2F_ORIGINS.includes(origin)) return { statut: 'refusé', raison: 'origine non autorisée' };
  const { value, error } = validateMessage(message);
  if (error) return { statut: 'refusé', raison: error };

  if (value.type === 'b2f.statut?') {
    return { statut: 'répondu', reponse: { v: 1, type: 'dut.statut', appariementId: value.appariementId, dut: statusFor(value.appariementId) } };
  }

  if (value.type === 'b2f.mission') {
    const list = missions();
    if (list.some((m) => m.appariementId === value.appariementId)) return { statut: 'doublon' };
    list.push({ appariementId: value.appariementId, reference: value.reference, donnees: value.donnees, recueLe: nowIso(), dutId: null });
    writeObject(MISSIONS_KEY, list);
    return { statut: 'en attente' };
  }

  const list = events();
  if (list.some((e) => e.id === value.id)) return { statut: 'doublon' };
  list.push({ id: value.id, appariementId: value.appariementId, kind: value.kind, valeur: value.valeur, observation: value.observation, horodatage: value.horodatage, recuLe: nowIso(), applique: false });
  writeObject(EVENTS_KEY, list.slice(-MAX_EVENTS));
  return applyPending(value.appariementId) ? { statut: 'appliqué' } : { statut: 'en attente' };
}

/** Crée le brouillon DUT d'une mission reçue et le relie ; applique les événements déjà reçus. */
export function createDutFromMission(user, appariementId) {
  const mission = missionFor(appariementId);
  if (!mission) throw new Error('Mission introuvable.');
  if (mission.dutId && findDutById(mission.dutId)) throw new Error('Un DUT est déjà relié à cette mission.');
  const d = mission.donnees;
  const [from = '', to = ''] = (d.corridor || '').split('→').map((s) => s.trim());
  const draft = createDraft(user);
  updateDut(draft.id, {
    source: { plateforme: 'B2F', appariementId, reference: mission.reference },
    general: { ...draft.general, transporterName: d.transporteurRaisonSociale || '', immatriculation: d.immatriculation || '', driverNom: d.chauffeurNom || '' },
    expediteur: { ...draft.expediteur, raisonSociale: d.affreteurRaisonSociale || '' },
    trajet: {
      ...draft.trajet,
      chargement: { ...draft.trajet.chargement, ville: from === 'Non renseignée' ? '' : from },
      dechargement: { ...draft.trajet.dechargement, ville: to === 'Non renseignée' ? '' : to },
      dateDepart: d.departPrevu ? d.departPrevu.slice(0, 10) : '',
      dateArrivee: d.arriveePrevue ? d.arriveePrevue.slice(0, 10) : '',
    },
    marchandises: d.marchandise || d.poidsTotalT ? [{ id: uuid(), nature: d.marchandise || '', emballage: '', quantite: 0, poidsTonnes: d.poidsTotalT || 0, volumeM3: 0, valeur: 0, devise: 'FCFA' }] : [],
  });
  writeObject(MISSIONS_KEY, missions().map((m) => (m.appariementId === appariementId ? { ...m, dutId: draft.id, relieeLe: nowIso() } : m)));
  applyPending(appariementId);
  return findDutById(draft.id);
}

/** Applique au suivi DUT les événements non appliqués d'une mission reliée. Renvoie true si quelque chose a été appliqué. */
export function applyPending(appariementId) {
  const mission = missionFor(appariementId);
  const dut = mission?.dutId ? findDutById(mission.dutId) : null;
  if (!dut) return false;
  const all = events();
  const pending = all.filter((e) => e.appariementId === appariementId && !e.applique).sort((a, b) => Date.parse(a.horodatage) - Date.parse(b.horodatage));
  if (!pending.length) return false;

  const store = readObject(WORKSPACE_KEY, {});
  const record = store[dut.id] || { stage: 'PLANNED', events: [], incidents: [], files: [], checks: {} };
  const author = `${mission.donnees.transporteurRaisonSociale || 'Transporteur'} · Bourse de fret`;
  for (const e of pending) {
    if (e.kind === 'etape') {
      const [target, label] = B2F_STAGES[e.valeur];
      const from = STAGE_ORDER.indexOf(record.stage);
      const to = STAGE_ORDER.indexOf(target);
      if (to > from) {
        // « Livré » côté B2F couvre aussi l'arrivée : chaque étape franchie est horodatée.
        for (let i = from + 1; i < to; i += 1) record.events.unshift({ id: uuid(), label: STAGE_LABELS[STAGE_ORDER[i]], note: 'Déduite de la Bourse de fret', at: e.horodatage, author });
        record.stage = target;
      }
      record.events.unshift({ id: uuid(), label, note: e.observation, at: e.horodatage, author, b2fEventId: e.id });
      // On garde la première étape franchie sans DUT valide : c'est elle qui engage la responsabilité.
      if (dut.status !== 'VALIDE' && to > 0 && !record.b2fAnomalie) record.b2fAnomalie = { at: e.horodatage, etape: label, statutDut: dut.status };
    } else {
      record.incidents.unshift({ id: uuid(), type: B2F_INCIDENTS[e.valeur], severity: 'NORMAL', description: e.observation || 'Signalé dans la Bourse de fret.', assignee: 'Transporteur (Bourse de fret)', status: 'OPEN', createdAt: e.horodatage, author, b2fEventId: e.id });
      record.events.unshift({ id: uuid(), label: 'Incident signalé', note: B2F_INCIDENTS[e.valeur], at: e.horodatage, author });
    }
    e.applique = true;
  }
  record.updatedAt = nowIso();
  store[dut.id] = record;
  writeObject(WORKSPACE_KEY, store);
  writeObject(EVENTS_KEY, all);
  return true;
}

/** Missions reçues et pas encore reliées à un DUT existant. */
export function pendingMissions() {
  const ids = new Set(getAllDuts().map((d) => d.id));
  return missions().filter((m) => !m.dutId || !ids.has(m.dutId));
}
