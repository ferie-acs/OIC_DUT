// Lot d4 : incidents de la plateforme (applicatif, réseau, matériel, performance, procédure).
// Distincts des incidents de transport, qui restent rattachés au dossier d'un DUT (workspace.service).
// Cycle : Déclaré → Qualifié → Attribué → En traitement → Résolu (à vérifier) → Clos.
import { AUDIT_ACTIONS, AUDIT_LABELS } from '../core/constants.js';
import { appendAuditLog } from '../repositories/audit.repository.js';
import * as repo from '../repositories/incidents.repository.js';
import { actor, canDo, text, oneOf, nextReference, antennaLabel, antennas, users, person, historyEntry, audit, nowIso, uuid } from './support-common.service.js';
import { aviser, destinataires, notifier } from './notifications.service.js'; // Intégration : messagerie unique du lot d1
import { formatDateTime } from '../core/utils.js';

export const INCIDENT_CATEGORIES = {
  APPLICATIF: 'Applicatif',
  RESEAU: 'Réseau et connexion',
  MATERIEL: 'Matériel',
  PERFORMANCE: 'Performance (lenteur)',
  PROCEDURE: 'Procédure',
};

/** Délais cibles de résolution par gravité (repères de démonstration, à fixer par l'OIC). */
export const INCIDENT_SEVERITIES = {
  CRITIQUE: { label: 'Critique', hours: 4, hint: 'Service bloqué pour une antenne ou plus' },
  MAJEURE: { label: 'Majeure', hours: 24, hint: 'Fonction importante dégradée' },
  MINEURE: { label: 'Mineure', hours: 72, hint: 'Gêne limitée, contournement possible' },
};

export const INCIDENT_IMPACTS = {
  UTILISATEUR: 'Un utilisateur',
  ANTENNE: 'Une antenne',
  PLUSIEURS: 'Plusieurs antennes',
  RESEAU: 'Tout le réseau',
};

export const INCIDENT_STATUS = {
  DECLARE: 'Déclaré',
  QUALIFIE: 'Qualifié',
  ATTRIBUE: 'Attribué',
  EN_TRAITEMENT: 'En traitement',
  RESOLU: 'Résolu, à vérifier',
  CLOS: 'Clos',
};

export const RESOLUTION_TEAMS = {
  SUPPORT: 'Support applicatif (DSI)',
  RESEAU: 'Réseaux et télécoms (DSI)',
  MATERIEL: 'Maintenance du matériel (DSI)',
  ANTENNE: 'Antenne concernée',
  OPERATIONS: 'Direction des opérations',
};

export const PERFORMANCE_SCREENS = {
  CONNEXION: 'Connexion',
  CREATION: 'Création ou modification d’un DUT',
  SOUMISSION: 'Soumission d’un DUT',
  VALIDATION: 'Validation par l’antenne',
  IMPRESSION: 'Édition et impression du DUT',
  CONTROLE: 'Contrôle routier',
  TABLEAU: 'Tableaux de bord et statistiques',
  AUTRE: 'Autre écran',
};

const OPEN = ['DECLARE', 'QUALIFIE', 'ATTRIBUE', 'EN_TRAITEMENT'];
const ACTIVE = [...OPEN, 'RESOLU'];
const HOUR = 3600 * 1000;

export function dueAt(incident) {
  const sla = INCIDENT_SEVERITIES[incident.severity] || INCIDENT_SEVERITIES.MINEURE;
  return new Date(new Date(incident.declaredAt).getTime() + sla.hours * HOUR).toISOString();
}

/** Le délai court jusqu'à la résolution proposée ; un incident résolu ou clos n'est plus « en retard ». */
export function isOverdue(incident, now = Date.now()) {
  return OPEN.includes(incident.status) && now > new Date(dueAt(incident)).getTime();
}

/** Heures restantes (positives) ou de dépassement (négatives) avant l'échéance. */
export function hoursLeft(incident, now = Date.now()) {
  return (new Date(dueAt(incident)).getTime() - now) / HOUR;
}

export function resolvedLate(incident) {
  const end = incident.resolvedAt || incident.closedAt;
  return Boolean(end) && new Date(end).getTime() > new Date(dueAt(incident)).getTime();
}

/** Intégration : la lecture nationale (Direction) ne donne aucun droit de déclarer ni de traiter. */
function reader() {
  const user = actor(null);
  if (!canDo(user, 'incidents.declare') && !canDo(user, 'incidents.read')) throw new Error('Votre rôle ne permet pas cette action.');
  return user;
}

function visibleTo(user, incident) {
  if (canDo(user, 'incidents.manage') || canDo(user, 'incidents.read')) return true;
  if (incident.declaredBy?.id === user.id || incident.assignee?.id === user.id) return true;
  if (user.role === 'ANTENNA_AGENT') return Boolean(user.antennaId) && incident.antennaId === user.antennaId;
  if (user.role === 'PARTNER_ADMIN' || user.role === 'PARTNER_EDITOR') return Boolean(user.partnerId) && incident.declaredBy?.partnerId === user.partnerId;
  return false;
}

function load(user, id) {
  const incident = repo.findById(id);
  if (!incident || !visibleTo(user, incident)) throw new Error('Incident introuvable ou hors de votre périmètre.');
  return incident;
}

function record(incident, user, label, note, action) {
  incident.history.push(historyEntry(user, label, note));
  incident.updatedAt = nowIso();
  repo.upsert(incident);
  audit(action, incident.reference, note || incident.title);
  return incident;
}

// ------------------------------------------------------------------ Lecture

/** Surveillance des délais : une alerte unique par incident en retard (journal + historique). */
export function scanDeadlines(now = Date.now()) {
  const list = repo.getAll();
  const alerted = [];
  for (const incident of list) {
    if (!isOverdue(incident, now) || incident.deadlineAlertAt) continue;
    incident.deadlineAlertAt = new Date(now).toISOString();
    const late = Math.abs(hoursLeft(incident, now));
    const note = `Délai cible de ${INCIDENT_SEVERITIES[incident.severity].hours} h dépassé de ${late < 1 ? 'moins d’une heure' : `${Math.floor(late)} h`}.`;
    incident.history.push({ ...historyEntry(null, 'Alerte : délai cible dépassé', note), by: 'Surveillance des délais' });
    appendAuditLog({ id: uuid(), action: AUDIT_ACTIONS.INCIDENT_DEADLINE_EXCEEDED, label: AUDIT_LABELS.INCIDENT_DEADLINE_EXCEEDED, dutId: null, dutNumber: null, userId: 'SYSTEM', userLabel: 'Surveillance des délais', role: 'SYSTEM', oldValue: null, newValue: incident.assignee?.name || null, note: `${incident.reference} — ${note}`, date: incident.deadlineAlertAt });
    // Messagerie unique (lot d1) : le responsable attribué et les administrateurs OIC sont prévenus.
    notifier([...destinataires({ ids: [incident.assignee?.id], exclureAuteur: false }), ...destinataires({ permission: 'incidents.manage', exclureAuteur: false })], {
      objet: `Incident ${incident.reference} : délai dépassé`,
      corps: `L’incident ${incident.reference} « ${incident.title} » (${incident.antennaName}) a dépassé son délai cible. ${note}`,
      origine: 'Incidents', lien: `#/incidents/${incident.id}`, entite: incident.id,
    });
    alerted.push(incident);
  }
  if (alerted.length) repo.saveAll(list);
  return alerted;
}

export function listIncidents() {
  const user = reader();
  scanDeadlines();
  return repo.getAll().filter((i) => visibleTo(user, i)).sort((a, b) => new Date(b.declaredAt) - new Date(a.declaredAt));
}

export function getIncident(id) {
  const user = reader();
  scanDeadlines();
  return load(user, id);
}

/** Alertes de délai visibles par l'utilisateur connecté (bandeau, cloche après fusion). */
export function incidentAlerts() {
  return listIncidents().filter((i) => isOverdue(i));
}

/** Ce que l'utilisateur connecté peut faire sur cet incident (pilote l'affichage des boutons). */
export function allowedActions(incident) {
  const user = reader();
  const manage = canDo(user, 'incidents.manage');
  const assignee = incident.assignee?.id === user.id && canDo(user, 'incidents.treat');
  const declarant = incident.declaredBy?.id === user.id;
  return {
    qualify: manage && OPEN.includes(incident.status),
    assign: manage && ['QUALIFIE', 'ATTRIBUE', 'EN_TRAITEMENT'].includes(incident.status),
    follow: (manage || assignee) && ['ATTRIBUE', 'EN_TRAITEMENT'].includes(incident.status),
    resolve: (manage || assignee) && ['ATTRIBUE', 'EN_TRAITEMENT'].includes(incident.status),
    close: manage && incident.status === 'RESOLU',
    reopen: (manage || declarant) && incident.status === 'RESOLU',
    complement: declarant && ACTIVE.includes(incident.status),
  };
}

/** Responsables possibles : administrateurs OIC, et agents de l'antenne de l'incident. */
export function assignableUsers(incident) {
  return users().filter((u) => u.role === 'OIC_ADMIN' || (u.role === 'ANTENNA_AGENT' && incident.antennaId && u.antennaId === incident.antennaId));
}

export function antennaOptions() {
  return antennas();
}

// ------------------------------------------------------------------ Cycle de vie

export function declareIncident(input = {}) {
  const user = actor('incidents.declare');
  const category = oneOf(input.category, INCIDENT_CATEGORIES, 'Catégorie');
  const severity = oneOf(input.severity || 'MINEURE', INCIDENT_SEVERITIES, 'Gravité');
  // Cloisonnement : un agent d'antenne déclare pour sa propre antenne.
  let antennaId = input.antennaId || null;
  if (user.role === 'ANTENNA_AGENT') antennaId = user.antennaId;
  if (antennaId && !antennas().some((a) => a.id === antennaId)) throw new Error('Antenne inconnue.');
  const incident = {
    id: uuid(),
    reference: nextReference(repo.getAll(), 'INC'),
    category, severity, declaredSeverity: severity, impact: null,
    status: 'DECLARE',
    title: text(input.title, { label: 'L’objet', max: 120, min: 5 }),
    description: text(input.description, { label: 'La description', max: 2000, min: 10 }),
    antennaId, antennaName: antennaLabel(antennaId),
    attachments: (Array.isArray(input.attachments) ? input.attachments : []).slice(0, 5).map((f) => ({ name: String(f.name || 'pièce').slice(0, 120), size: Math.max(0, Number(f.size) || 0), type: String(f.type || '').slice(0, 80) })),
    performance: null,
    equipmentId: input.equipmentId || null,
    declaredBy: { ...person(user), partnerId: user.partnerId || null, partnerName: user.partnerName || null, antennaId: user.antennaId || null },
    declaredAt: nowIso(),
    assignee: null, team: null,
    cause: '', solution: '',
    history: [],
  };
  if (category === 'PERFORMANCE') {
    const seconds = Number(input.durationSec);
    if (!Number.isFinite(seconds) || seconds < 1 || seconds > 3600) throw new Error('Indiquez la durée constatée, entre 1 seconde et 1 heure.');
    const observedAt = input.observedAt ? new Date(input.observedAt) : null;
    if (!observedAt || Number.isNaN(observedAt.getTime())) throw new Error('Indiquez la date et l’heure de la lenteur.');
    if (observedAt.getTime() > Date.now() + 5 * 60 * 1000) throw new Error('La lenteur ne peut pas être datée dans le futur.');
    incident.performance = { screen: oneOf(input.screen, PERFORMANCE_SCREENS, 'Écran concerné'), durationSec: Math.round(seconds), observedAt: observedAt.toISOString() };
  }
  incident.history.push(historyEntry(user, 'Incident déclaré', `${INCIDENT_CATEGORIES[category]} · gravité ${INCIDENT_SEVERITIES[severity].label.toLowerCase()}`));
  incident.updatedAt = incident.declaredAt;
  repo.upsert(incident);
  audit(AUDIT_ACTIONS.INCIDENT_DECLARED, incident.reference, incident.title);
  return incident;
}

export function qualifyIncident(id, input = {}) {
  const user = actor('incidents.manage');
  const incident = load(user, id);
  if (!OPEN.includes(incident.status)) throw new Error('Cet incident ne peut plus être qualifié.');
  const severity = oneOf(input.severity, INCIDENT_SEVERITIES, 'Gravité');
  const impact = oneOf(input.impact, INCIDENT_IMPACTS, 'Impact');
  const category = oneOf(input.category || incident.category, INCIDENT_CATEGORIES, 'Catégorie');
  if (category === 'PERFORMANCE' && !incident.performance) throw new Error('Un incident de performance doit être déclaré avec l’écran et la durée constatée.');
  const before = INCIDENT_SEVERITIES[incident.severity].label;
  Object.assign(incident, { severity, impact, category, qualifiedAt: nowIso(), qualifiedBy: person(user) });
  if (incident.status === 'DECLARE') incident.status = 'QUALIFIE';
  // Une gravité revue peut faire repasser l'incident dans les délais : l'alerte sera relancée si besoin.
  if (!isOverdue(incident)) incident.deadlineAlertAt = null;
  const note = [`Gravité : ${INCIDENT_SEVERITIES[severity].label}${before !== INCIDENT_SEVERITIES[severity].label ? ` (déclarée : ${before})` : ''}`, `impact : ${INCIDENT_IMPACTS[impact].toLowerCase()}`, text(input.note, { required: false, max: 500 })].filter(Boolean).join(' · ');
  return record(incident, user, 'Incident qualifié', note, AUDIT_ACTIONS.INCIDENT_QUALIFIED);
}

export function assignIncident(id, input = {}) {
  const user = actor('incidents.manage');
  const incident = load(user, id);
  if (incident.status === 'DECLARE') throw new Error('Qualifiez l’incident avant de l’attribuer.');
  if (!['QUALIFIE', 'ATTRIBUE', 'EN_TRAITEMENT'].includes(incident.status)) throw new Error('Cet incident ne peut plus être attribué.');
  const team = oneOf(input.team, RESOLUTION_TEAMS, 'Équipe');
  const target = assignableUsers(incident).find((u) => u.id === input.assigneeId);
  if (!target) throw new Error('Choisissez un responsable habilité (administrateur OIC ou agent de l’antenne concernée).');
  const previous = incident.assignee?.name;
  Object.assign(incident, { assignee: person(target), team, assignedAt: nowIso() });
  if (incident.status === 'QUALIFIE') incident.status = 'ATTRIBUE';
  const note = [`${target.name} · ${RESOLUTION_TEAMS[team]}`, previous && previous !== target.name ? `auparavant : ${previous}` : '', text(input.note, { required: false, max: 500 })].filter(Boolean).join(' · ');
  // Messagerie unique (lot d1) : le responsable attribué est prévenu.
  aviser({ ids: [target.id] }, {
    objet: `Incident ${incident.reference} attribué`,
    corps: `L’incident ${incident.reference} « ${incident.title} » vous est attribué (équipe ${RESOLUTION_TEAMS[team]}, gravité ${INCIDENT_SEVERITIES[incident.severity].label.toLowerCase()}). Échéance : ${formatDateTime(dueAt(incident))}.`,
    origine: 'Incidents', lien: `#/incidents/${incident.id}`, entite: incident.id,
  });
  return record(incident, user, previous ? 'Incident réattribué' : 'Incident attribué', note, AUDIT_ACTIONS.INCIDENT_ASSIGNED);
}

function requireTreater(user, incident) {
  if (canDo(user, 'incidents.manage')) return;
  if (canDo(user, 'incidents.treat') && incident.assignee?.id === user.id) return;
  throw new Error('Seul le responsable attribué ou un administrateur OIC peut traiter cet incident.');
}

export function followIncident(id, note) {
  const user = actor('incidents.declare');
  const incident = load(user, id);
  requireTreater(user, incident);
  if (!['ATTRIBUE', 'EN_TRAITEMENT'].includes(incident.status)) throw new Error('L’incident doit être attribué pour enregistrer un suivi.');
  const clean = text(note, { label: 'Le compte rendu', max: 1000, min: 5 });
  if (incident.status === 'ATTRIBUE') { incident.status = 'EN_TRAITEMENT'; incident.startedAt = nowIso(); }
  return record(incident, user, 'Suivi du traitement', clean, AUDIT_ACTIONS.INCIDENT_FOLLOWED);
}

export function resolveIncident(id, input = {}) {
  const user = actor('incidents.declare');
  const incident = load(user, id);
  requireTreater(user, incident);
  if (!['ATTRIBUE', 'EN_TRAITEMENT'].includes(incident.status)) throw new Error('Seul un incident attribué ou en traitement peut être résolu.');
  incident.cause = text(input.cause, { label: 'La cause', max: 1000, min: 5 });
  incident.solution = text(input.solution, { label: 'La solution', max: 1000, min: 5 });
  Object.assign(incident, { status: 'RESOLU', resolvedAt: nowIso(), resolvedBy: person(user) });
  return record(incident, user, 'Résolution proposée', `Cause : ${incident.cause} · Solution : ${incident.solution}`, AUDIT_ACTIONS.INCIDENT_RESOLVED);
}

export function closeIncident(id, note = '') {
  const user = actor('incidents.manage');
  const incident = load(user, id);
  if (incident.status !== 'RESOLU') throw new Error('Seul un incident résolu peut être clos, après vérification de la solution.');
  if (!incident.cause || !incident.solution) throw new Error('La cause et la solution doivent être renseignées avant la clôture.');
  Object.assign(incident, { status: 'CLOS', closedAt: nowIso(), closedBy: person(user) });
  const clean = text(note, { required: false, max: 500 });
  return record(incident, user, 'Solution vérifiée, incident clos', [resolvedLate(incident) ? 'Résolu hors délai cible' : 'Résolu dans le délai cible', clean].filter(Boolean).join(' · '), AUDIT_ACTIONS.INCIDENT_CLOSED);
}

export function reopenIncident(id, reason) {
  const user = actor('incidents.declare');
  const incident = load(user, id);
  if (!canDo(user, 'incidents.manage') && incident.declaredBy?.id !== user.id) throw new Error('Seul le déclarant ou un administrateur OIC peut contester la solution.');
  if (incident.status !== 'RESOLU') throw new Error('Seule une résolution en attente de vérification peut être contestée.');
  const clean = text(reason, { label: 'Le motif', max: 500, min: 5 });
  Object.assign(incident, { status: 'EN_TRAITEMENT', resolvedAt: null, resolvedBy: null });
  return record(incident, user, 'Solution contestée, traitement repris', clean, AUDIT_ACTIONS.INCIDENT_REOPENED);
}

/** Complément d'information du déclarant (sans changement d'état). */
export function addComplement(id, note) {
  const user = actor('incidents.declare');
  const incident = load(user, id);
  if (incident.declaredBy?.id !== user.id) throw new Error('Seul le déclarant peut compléter sa déclaration.');
  if (!ACTIVE.includes(incident.status)) throw new Error('Cet incident est clos.');
  return record(incident, user, 'Complément du déclarant', text(note, { label: 'Le complément', max: 1000, min: 5 }), AUDIT_ACTIONS.INCIDENT_FOLLOWED);
}

/** Note ajoutée par un autre module (ex. dépannage d'équipement terminé). Sans contrôle de rôle : appelée par un service déjà autorisé. */
export function appendLinkedNote(id, user, label, note) {
  const incident = repo.findById(id);
  if (!incident) return null;
  incident.history.push(historyEntry(user, label, note));
  incident.updatedAt = nowIso();
  repo.upsert(incident);
  return incident;
}

// ------------------------------------------------------------------ Suivi des lenteurs

const HOUR_SLOTS = [['Avant 8 h', 0, 8], ['8 h – 10 h', 8, 10], ['10 h – 12 h', 10, 12], ['12 h – 14 h', 12, 14], ['14 h – 16 h', 14, 16], ['Après 16 h', 16, 24]];

export function performanceStats({ days = 30, now = Date.now() } = {}) {
  const user = reader();
  if (!canDo(user, 'incidents.manage') && !canDo(user, 'incidents.read')) throw new Error('Votre rôle ne permet pas cette action.');
  const since = now - days * 24 * HOUR;
  const items = repo.getAll().filter((i) => i.performance && new Date(i.performance.observedAt).getTime() >= since);
  const durations = items.map((i) => i.performance.durationSec);
  const group = (keyOf, labelOf) => {
    const map = new Map();
    for (const i of items) {
      const key = keyOf(i);
      const row = map.get(key) || { key, label: labelOf(i), count: 0, total: 0, max: 0, open: 0, antennas: new Set() };
      row.count += 1; row.total += i.performance.durationSec; row.max = Math.max(row.max, i.performance.durationSec);
      if (ACTIVE.includes(i.status)) row.open += 1;
      row.antennas.add(i.antennaId || 'national');
      map.set(key, row);
    }
    return [...map.values()].map(({ antennas: set, total, ...r }) => ({ ...r, average: Math.round(total / r.count), antennasCount: set.size })).sort((a, b) => b.count - a.count || b.average - a.average);
  };
  const hourOf = (i) => new Date(i.performance.observedAt).getHours();
  return {
    days,
    count: items.length,
    open: items.filter((i) => ACTIVE.includes(i.status)).length,
    averageSec: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
    maxSec: durations.length ? Math.max(...durations) : 0,
    antennasTouched: new Set(items.map((i) => i.antennaId || 'national')).size,
    byScreen: group((i) => i.performance.screen, (i) => PERFORMANCE_SCREENS[i.performance.screen]),
    byAntenna: group((i) => i.antennaId || 'national', (i) => i.antennaName),
    bySlot: HOUR_SLOTS.map(([label, from, to]) => {
      const inSlot = items.filter((i) => hourOf(i) >= from && hourOf(i) < to);
      return { label, count: inSlot.length, average: inSlot.length ? Math.round(inSlot.reduce((n, i) => n + i.performance.durationSec, 0) / inSlot.length) : 0 };
    }),
    recent: [...items].sort((a, b) => new Date(b.performance.observedAt) - new Date(a.performance.observedAt)).slice(0, 10),
  };
}

// ------------------------------------------------------------------ Fonctions pour les tableaux de bord (après fusion)
// Sans contrôle de session : le tableau de bord appelant vérifie lui-même le droit d'accès et le périmètre.

/** Incidents non clos (y compris résolus à vérifier), éventuellement pour une antenne. */
export function openIncidents({ antennaId = null } = {}) {
  scanDeadlines();
  return repo.getAll().filter((i) => ACTIVE.includes(i.status) && (!antennaId || i.antennaId === antennaId));
}

/** Incidents ouverts dont le délai cible est dépassé, éventuellement pour une antenne. */
export function overdueIncidents({ antennaId = null } = {}) {
  return openIncidents({ antennaId }).filter((i) => isOverdue(i));
}

/** Synthèse par antenne : ouverts, en retard, critiques ouverts. */
export function incidentsByAntenna() {
  const rows = new Map();
  for (const i of openIncidents()) {
    const key = i.antennaId || 'national';
    const row = rows.get(key) || { antennaId: i.antennaId, antennaName: i.antennaName, open: 0, overdue: 0, critical: 0 };
    row.open += 1;
    if (isOverdue(i)) row.overdue += 1;
    if (i.severity === 'CRITIQUE') row.critical += 1;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => b.overdue - a.overdue || b.open - a.open);
}
