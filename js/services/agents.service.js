// Lot d5 : fiches agents (affectation, fonction, responsabilités, compte rattaché) et évaluations périodiques.
// Un agent ne peut pas s'évaluer lui-même ; une seule évaluation par agent et par période ; évaluations non modifiables.
import { AUDIT_ACTIONS, ROLE_LABELS } from '../core/constants.js';
import { findAntennaById } from '../repositories/antennas.repository.js';
import { getAllUsers } from '../repositories/users.repository.js';
import { getAllAuditLogs } from '../repositories/audit.repository.js';
import { agentProfilesRepo, agentEvaluationsRepo } from '../repositories/pilotage.repository.js';
import { listContracts, CONTRACT_STATUS } from './objectives.service.js';
import { actor, who, journal, journalOf, isIsoDate, text, uuid, nowIso } from './pilotage-core.service.js';

export const EVALUATION_CRITERIA = [
  ['volume', 'Volume de dossiers traités'],
  ['objectifs', 'Atteinte des objectifs'],
  ['qualite', 'Qualité des dossiers'],
  ['delais', 'Respect des délais'],
  ['procedures', 'Respect des procédures'],
  ['integrite', 'Incidents et intégrité'],
];
export const SCORE_LABELS = { 1: 'Insuffisant', 2: 'À améliorer', 3: 'Satisfaisant', 4: 'Très satisfaisant', 5: 'Excellent' };

/** Note globale (moyenne des critères, 1 décimale) et appréciation correspondante. */
export function overallScore(scores) {
  const values = EVALUATION_CRITERIA.map(([k]) => Number(scores?.[k]));
  if (values.some((v) => !Number.isInteger(v) || v < 1 || v > 5)) throw new Error('Notez chaque critère de 1 à 5.');
  const note = Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10;
  const appreciation = note >= 4.5 ? 'Excellent' : note >= 3.5 ? 'Très satisfaisant' : note >= 2.5 ? 'Satisfaisant' : note >= 1.5 ? 'À améliorer' : 'Insuffisant';
  return { note, appreciation };
}

export function linkableUsers(profileId = null) {
  actor('agents.manage');
  const linked = new Set(agentProfilesRepo.all().filter((p) => p.id !== profileId && p.userId).map((p) => p.userId));
  return getAllUsers().filter((u) => !linked.has(u.id) && ['ANTENNA_AGENT', 'CONTROLLER', 'OIC_ADMIN', 'DIRECTION'].includes(u.role))
    .map((u) => ({ id: u.id, name: u.name, email: u.email, role: ROLE_LABELS[u.role] || u.role }));
}

export function listAgents({ antennaId = '', query = '', includeInactive = true } = {}) {
  actor('pilotage.view');
  const evals = agentEvaluationsRepo.all();
  const q = String(query).trim().toLowerCase();
  return agentProfilesRepo.all()
    .filter((p) => (!antennaId || p.antennaId === antennaId) && (includeInactive || p.active !== false) && (!q || `${p.name} ${p.matricule} ${p.fonction} ${p.antennaName}`.toLowerCase().includes(q)))
    .map((p) => { const mine = evals.filter((e) => e.agentId === p.id).sort((a, b) => String(b.at).localeCompare(String(a.at))); return { ...p, evaluations: mine.length, lastEvaluation: mine[0] || null }; })
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

export function saveAgentProfile(input, id = null) {
  const user = actor('agents.manage');
  const list = agentProfilesRepo.all();
  const old = id ? list.find((p) => p.id === id) : null;
  if (id && !old) throw new Error('Fiche introuvable.');
  const antenna = findAntennaById(input.antennaId);
  if (!antenna) throw new Error('Choisissez l’antenne d’affectation.');
  const assignedAt = String(input.assignedAt || '');
  if (!isIsoDate(assignedAt)) throw new Error('Indiquez la date d’affectation.');
  const userId = input.userId || null;
  if (userId) {
    if (!getAllUsers().some((u) => u.id === userId)) throw new Error('Compte utilisateur introuvable.');
    if (list.some((p) => p.id !== id && p.userId === userId)) throw new Error('Ce compte est déjà rattaché à une autre fiche agent.');
  }
  const value = {
    ...(old || {}),
    id: old?.id || uuid(),
    matricule: text(input.matricule, 'Matricule', { max: 20 }).toUpperCase(),
    name: text(input.name, 'Nom et prénoms', { max: 100 }),
    fonction: text(input.fonction, 'Fonction', { max: 100 }),
    antennaId: antenna.id, antennaName: antenna.name, assignedAt,
    responsibilities: text(input.responsibilities, 'Responsabilités', { max: 800 }),
    phone: text(input.phone, 'Téléphone', { required: false, max: 30 }),
    userId,
    active: old ? old.active !== false : true,
    createdAt: old?.createdAt || nowIso(), updatedAt: nowIso(),
  };
  if (list.some((p) => p.id !== value.id && p.matricule === value.matricule)) throw new Error('Ce matricule est déjà utilisé.');
  const changes = [];
  if (!old) changes.push(`Fiche créée · affectation ${antenna.name}`);
  else {
    if (old.antennaId !== value.antennaId) changes.push(`Réaffectation : ${old.antennaName} → ${value.antennaName}`);
    if (old.fonction !== value.fonction) changes.push(`Fonction : ${old.fonction} → ${value.fonction}`);
    if (old.userId !== value.userId) changes.push(value.userId ? 'Compte utilisateur rattaché' : 'Compte utilisateur détaché');
    if (old.responsibilities !== value.responsibilities) changes.push('Responsabilités mises à jour');
    if (!changes.length) changes.push('Fiche mise à jour');
  }
  value.history = [...(old?.history || []), ...changes.map((label) => ({ at: nowIso(), by: user.name, label }))];
  agentProfilesRepo.upsert(value);
  journal(AUDIT_ACTIONS.AGENT_PROFILE_SAVED, { entity: 'AGENT', entityId: value.id, reference: value.matricule, newValue: value.name, note: changes.join(' ; ') });
  return value;
}

export function setAgentActive(id, active, reason) {
  const user = actor('agents.manage');
  const p = agentProfilesRepo.find(id);
  if (!p) throw new Error('Fiche introuvable.');
  const motif = text(reason, 'Motif', { max: 300 });
  const next = { ...p, active: Boolean(active), updatedAt: nowIso(), history: [...(p.history || []), { at: nowIso(), by: user.name, label: active ? `Fiche réactivée : ${motif}` : `Fin d’affectation : ${motif}` }] };
  agentProfilesRepo.upsert(next);
  journal(AUDIT_ACTIONS.AGENT_PROFILE_SAVED, { entity: 'AGENT', entityId: id, reference: p.matricule, oldValue: String(p.active !== false), newValue: String(Boolean(active)), note: motif });
  return next;
}

export function evaluateAgent(agentId, input) {
  const user = actor('agents.evaluate');
  const p = agentProfilesRepo.find(agentId);
  if (!p) throw new Error('Fiche introuvable.');
  if (p.active === false) throw new Error('Cet agent n’est plus affecté : il ne peut pas être évalué.');
  if (p.userId && p.userId === user.id) throw new Error('Un agent ne peut pas s’évaluer lui-même.');
  const period = text(input.period, 'Période évaluée', { max: 40 });
  if (agentEvaluationsRepo.all().some((e) => e.agentId === agentId && e.period.toLowerCase() === period.toLowerCase())) throw new Error('Cet agent a déjà été évalué pour cette période.');
  const scores = Object.fromEntries(EVALUATION_CRITERIA.map(([k]) => [k, Number(input.scores?.[k])]));
  const { note, appreciation } = overallScore(scores);
  const evaluation = { id: uuid(), agentId, period, scores, note, appreciation, comment: text(input.comment, 'Observations', { min: 10, max: 1000 }), evaluator: who(user), at: nowIso() };
  agentEvaluationsRepo.upsert(evaluation);
  journal(AUDIT_ACTIONS.AGENT_EVALUATED, { entity: 'AGENT', entityId: agentId, reference: p.matricule, newValue: `${note} / 5`, note: period });
  return evaluation;
}

/** Fiche complète : évaluations, activité mesurée sur la plateforme (compte rattaché), objectifs attribués, journal. */
export function agentDetail(id) {
  actor('pilotage.view');
  const p = agentProfilesRepo.find(id);
  if (!p) throw new Error('Fiche introuvable.');
  const linkedUser = p.userId ? getAllUsers().find((u) => u.id === p.userId) : null;
  const mine = linkedUser ? getAllAuditLogs().filter((e) => e.userId === linkedUser.id || e.userLabel === linkedUser.name) : [];
  const count = (action) => mine.filter((e) => e.action === action).length;
  const activity = linkedUser ? { valides: count('DUT_VALIDATED'), rejetes: count('DUT_REJECTED'), controles: count('DUT_CONTROLLED'), connexions: count('USER_LOGIN'), derniere: mine.map((e) => e.date).sort().pop() || null } : null;
  const objectives = listContracts().filter((c) => [CONTRACT_STATUS.VALIDE, CONTRACT_STATUS.CLOTURE].includes(c.status))
    .flatMap((c) => c.lines.filter((l) => l.assigneeType === 'AGENT' && l.agentId === id).map((l) => ({ ...l, contract: { id: c.id, reference: c.reference, title: c.title, periodLabel: c.periodLabel } })));
  const evaluations = agentEvaluationsRepo.all().filter((e) => e.agentId === id).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const { credential, ...safeUser } = linkedUser || {};
  return { profile: p, user: linkedUser ? { ...safeUser, roleLabel: ROLE_LABELS[linkedUser.role] || linkedUser.role } : null, activity, objectives, evaluations, journal: journalOf(id) };
}
