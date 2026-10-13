// Lot d5 : réunions de pilotage, comptes rendus et décisions suivies (responsable, échéance, état).
// Les convocations sont simulées : aucun courriel n'est envoyé dans le POC.
import { AUDIT_ACTIONS } from '../core/constants.js';
import { meetingsRepo } from '../repositories/pilotage.repository.js';
import { actor, who, journal, journalOf, today, isIsoDate, text, nextReference, uuid, nowIso } from './pilotage-core.service.js';

export const MEETING_STATUS_LABELS = { PLANIFIEE: 'Planifiée', TENUE: 'Tenue', ANNULEE: 'Annulée' };
export const DECISION_STATUS_LABELS = { A_FAIRE: 'À faire', EN_COURS: 'En cours', CLOTUREE: 'Clôturée' };

const participantsOf = (raw) => (Array.isArray(raw) ? raw : String(raw || '').split(/\n|;/)).map((x) => String(x).trim()).filter(Boolean).slice(0, 40);

function decorate(m) {
  const decisions = (m.decisions || []).map((d) => ({ ...d, late: d.status !== 'CLOTUREE' && d.dueDate < today() }));
  return { ...m, decisions, upcoming: m.status === 'PLANIFIEE' && m.date >= nowIso().slice(0, 16), openDecisions: decisions.filter((d) => d.status !== 'CLOTUREE').length };
}

function mustGet(id) { const m = meetingsRepo.find(id); if (!m) throw new Error('Réunion introuvable.'); return m; }

export function listMeetings() {
  actor('pilotage.view');
  return meetingsRepo.all().map(decorate).sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export function getMeeting(id) {
  actor('pilotage.view');
  return { ...decorate(mustGet(id)), journal: journalOf(id) };
}

export function saveMeeting(input, id = null) {
  const user = actor('meetings.manage');
  const old = id ? mustGet(id) : null;
  if (old && old.status !== 'PLANIFIEE') throw new Error('Seule une réunion planifiée peut être modifiée.');
  const date = String(input.date || '');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(date)) throw new Error('Indiquez la date et l’heure de la réunion.');
  const participants = participantsOf(input.participants);
  if (!participants.length) throw new Error('Indiquez au moins un participant.');
  const value = {
    ...(old || {}), id: old?.id || uuid(), reference: old?.reference || nextReference('RE', meetingsRepo.all()),
    title: text(input.title, 'Objet', { max: 160 }), date: date.slice(0, 16), place: text(input.place, 'Lieu', { max: 120 }),
    participants, agenda: text(input.agenda, 'Ordre du jour', { max: 1500 }),
    status: 'PLANIFIEE', decisions: old?.decisions || [], createdBy: old?.createdBy || who(user), createdAt: old?.createdAt || nowIso(), updatedAt: nowIso(),
  };
  meetingsRepo.upsert(value);
  journal(AUDIT_ACTIONS.MEETING_SAVED, { entity: 'REUNION', entityId: value.id, reference: value.reference, newValue: value.title });
  return decorate(value);
}

/** Convocation simulée : enregistrée et tracée, sans envoi réel. */
export function convene(id) {
  const user = actor('meetings.manage');
  const m = mustGet(id);
  if (m.status !== 'PLANIFIEE') throw new Error('Seule une réunion planifiée peut être convoquée.');
  const next = { ...m, convocations: [...(m.convocations || []), { at: nowIso(), by: user.name, count: m.participants.length }] };
  meetingsRepo.upsert(next);
  journal(AUDIT_ACTIONS.MEETING_CONVENED, { entity: 'REUNION', entityId: id, reference: m.reference, note: `${m.participants.length} participant(s) — message simulé, aucun envoi réel` });
  return decorate(next);
}

export function recordMinutes(id, input) {
  const user = actor('meetings.manage');
  const m = mustGet(id);
  if (m.status !== 'PLANIFIEE') throw new Error('Le compte rendu de cette réunion est déjà enregistré.');
  if (m.date > nowIso().slice(0, 16)) throw new Error('Le compte rendu se rédige après la tenue de la réunion.');
  const next = { ...m, status: 'TENUE', minutes: text(input.minutes, 'Compte rendu', { min: 20, max: 4000 }), attendees: participantsOf(input.attendees).length ? participantsOf(input.attendees) : m.participants, heldBy: user.name, heldAt: nowIso() };
  meetingsRepo.upsert(next);
  journal(AUDIT_ACTIONS.MEETING_HELD, { entity: 'REUNION', entityId: id, reference: m.reference });
  return decorate(next);
}

export function cancelMeeting(id, reason) {
  const user = actor('meetings.manage');
  const m = mustGet(id);
  if (m.status !== 'PLANIFIEE') throw new Error('Seule une réunion planifiée peut être annulée.');
  const motif = text(reason, 'Motif', { max: 300 });
  meetingsRepo.upsert({ ...m, status: 'ANNULEE', cancelledBy: user.name, cancelledAt: nowIso(), cancelReason: motif });
  journal(AUDIT_ACTIONS.MEETING_SAVED, { entity: 'REUNION', entityId: id, reference: m.reference, newValue: 'Annulée', note: motif });
}

export function addDecision(meetingId, input) {
  const user = actor('meetings.manage');
  const m = mustGet(meetingId);
  if (m.status !== 'TENUE') throw new Error('Les décisions s’enregistrent avec le compte rendu d’une réunion tenue.');
  const dueDate = String(input.dueDate || '');
  if (!isIsoDate(dueDate)) throw new Error('Indiquez l’échéance de la décision.');
  const decision = { id: uuid(), text: text(input.text, 'Décision', { max: 300 }), responsible: text(input.responsible, 'Responsable', { max: 100 }), dueDate, status: 'A_FAIRE', createdBy: user.name, createdAt: nowIso(), updates: [] };
  meetingsRepo.upsert({ ...m, decisions: [...(m.decisions || []), decision] });
  journal(AUDIT_ACTIONS.DECISION_SAVED, { entity: 'REUNION', entityId: meetingId, reference: m.reference, newValue: decision.text, note: `Responsable : ${decision.responsible} · échéance ${dueDate}` });
  return decision;
}

export function updateDecision(meetingId, decisionId, input) {
  const user = actor('meetings.manage');
  const m = mustGet(meetingId);
  const d = (m.decisions || []).find((x) => x.id === decisionId);
  if (!d) throw new Error('Décision introuvable.');
  if (d.status === 'CLOTUREE') throw new Error('Cette décision est clôturée.');
  if (!DECISION_STATUS_LABELS[input.status]) throw new Error('État inconnu.');
  const comment = text(input.comment, 'Point d’avancement', { max: 400 });
  const next = { ...d, status: input.status, updates: [...d.updates, { at: nowIso(), by: user.name, status: input.status, comment }] };
  meetingsRepo.upsert({ ...m, decisions: m.decisions.map((x) => (x.id === decisionId ? next : x)) });
  journal(AUDIT_ACTIONS.DECISION_SAVED, { entity: 'REUNION', entityId: meetingId, reference: m.reference, oldValue: d.status, newValue: input.status, note: comment });
  return next;
}

/** Décisions non clôturées dont l'échéance est dépassée (exposé au tableau de bord de la Direction). */
export function overdueDecisions() {
  return listMeetings().flatMap((m) => m.decisions.filter((d) => d.late).map((d) => ({ ...d, meeting: { id: m.id, reference: m.reference, title: m.title } })));
}
