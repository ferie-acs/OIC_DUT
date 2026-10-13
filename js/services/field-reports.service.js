// Lot d4 : remontées du terrain. L'antenne remonte un besoin ou une difficulté au pilotage,
// qui répond, rend une décision puis clôt. Cycle : Transmise → En examen → Décision rendue → Clôturée.
import { AUDIT_ACTIONS } from '../core/constants.js';
import * as repo from '../repositories/field-reports.repository.js';
import { actor, canDo, text, oneOf, nextReference, antennaLabel, person, historyEntry, audit, nowIso, uuid } from './support-common.service.js';

export const REPORT_CATEGORIES = {
  EQUIPEMENT: 'Matériel et équipements',
  EFFECTIFS: 'Effectifs et organisation',
  FORMATION: 'Formation des agents',
  PROCEDURE: 'Procédures et réglementation',
  PARTENAIRES: 'Relations avec les partenaires',
  LOCAUX: 'Locaux et connexion',
  AUTRE: 'Autre',
};

export const REPORT_PRIORITIES = { HAUTE: 'Haute', NORMALE: 'Normale', BASSE: 'Basse' };

export const REPORT_STATUS = { TRANSMISE: 'Transmise', EN_EXAMEN: 'En examen', DECIDEE: 'Décision rendue', CLOSE: 'Clôturée' };

export const REPORT_DECISIONS = {
  ACCEPTEE: 'Acceptée, mise en œuvre',
  PLANIFIEE: 'Planifiée',
  ORIENTEE: 'Orientée vers le service compétent',
  NON_RETENUE: 'Non retenue',
};

const OPEN = ['TRANSMISE', 'EN_EXAMEN', 'DECIDEE'];

function visibleTo(user, report) {
  if (canDo(user, 'fieldreports.manage')) return true;
  return canDo(user, 'fieldreports.submit') && Boolean(user.antennaId) && report.antennaId === user.antennaId;
}

function load(user, id) {
  const report = repo.findById(id);
  if (!report || !visibleTo(user, report)) throw new Error('Remontée introuvable ou hors de votre périmètre.');
  return report;
}

function save(report, user, label, note, action) {
  report.history.push(historyEntry(user, label, note));
  report.updatedAt = nowIso();
  repo.upsert(report);
  audit(action, report.reference, note || report.title);
  return report;
}

export function listReports() {
  const user = actor('fieldreports.view');
  return repo.getAll().filter((r) => visibleTo(user, r)).sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
}

export function getReport(id) {
  return load(actor('fieldreports.view'), id);
}

export function allowedActions(report) {
  const user = actor('fieldreports.view');
  const manage = canDo(user, 'fieldreports.manage');
  const own = canDo(user, 'fieldreports.submit') && report.antennaId === user.antennaId;
  return {
    reply: (manage || own) && OPEN.includes(report.status),
    decide: manage && ['TRANSMISE', 'EN_EXAMEN'].includes(report.status),
    close: manage && report.status === 'DECIDEE',
  };
}

export function submitReport(input = {}) {
  const user = actor('fieldreports.submit');
  if (!user.antennaId) throw new Error('Votre compte n’est rattaché à aucune antenne.');
  const report = {
    id: uuid(),
    reference: nextReference(repo.getAll(), 'REM'),
    antennaId: user.antennaId,
    antennaName: antennaLabel(user.antennaId),
    category: oneOf(input.category, REPORT_CATEGORIES, 'Catégorie'),
    priority: oneOf(input.priority || 'NORMALE', REPORT_PRIORITIES, 'Priorité'),
    title: text(input.title, { label: 'L’objet', max: 120, min: 5 }),
    description: text(input.description, { label: 'La description', max: 2000, min: 10 }),
    status: 'TRANSMISE',
    createdBy: person(user),
    createdAt: nowIso(),
    messages: [],
    decision: null,
    history: [],
  };
  report.history.push(historyEntry(user, 'Remontée transmise au pilotage', `${REPORT_CATEGORIES[report.category]} · priorité ${REPORT_PRIORITIES[report.priority].toLowerCase()}`));
  report.updatedAt = report.createdAt;
  repo.upsert(report);
  audit(AUDIT_ACTIONS.FIELD_REPORT_SUBMITTED, report.reference, report.title);
  return report;
}

export function replyToReport(id, message) {
  const user = actor('fieldreports.view');
  const report = load(user, id);
  if (!allowedActions(report).reply) throw new Error('Cette remontée n’accepte plus de message.');
  const side = canDo(user, 'fieldreports.manage') ? 'PILOTAGE' : 'ANTENNE';
  const clean = text(message, { label: 'Le message', max: 1500, min: 2 });
  report.messages.push({ id: uuid(), at: nowIso(), side, byId: user.id, by: user.name, text: clean });
  if (side === 'PILOTAGE' && report.status === 'TRANSMISE') report.status = 'EN_EXAMEN';
  // Après fusion avec le lot d1 : avertir l'autre partie par courriel simulé.
  return save(report, user, side === 'PILOTAGE' ? 'Réponse du pilotage' : 'Message de l’antenne', '', AUDIT_ACTIONS.FIELD_REPORT_ANSWERED);
}

export function decideReport(id, input = {}) {
  const user = actor('fieldreports.manage');
  const report = load(user, id);
  if (!['TRANSMISE', 'EN_EXAMEN'].includes(report.status)) throw new Error('Une décision a déjà été rendue sur cette remontée.');
  const code = oneOf(input.code, REPORT_DECISIONS, 'Décision');
  const detail = text(input.text, { label: 'Le motif de la décision', max: 1000, min: 5 });
  report.decision = { code, text: detail, at: nowIso(), by: person(user) };
  report.status = 'DECIDEE';
  return save(report, user, `Décision : ${REPORT_DECISIONS[code]}`, detail, AUDIT_ACTIONS.FIELD_REPORT_DECIDED);
}

export function closeReport(id, note = '') {
  const user = actor('fieldreports.manage');
  const report = load(user, id);
  if (report.status !== 'DECIDEE') throw new Error('Rendez une décision avant de clôturer la remontée.');
  Object.assign(report, { status: 'CLOSE', closedAt: nowIso(), closedBy: person(user) });
  return save(report, user, 'Remontée clôturée', text(note, { required: false, max: 500 }), AUDIT_ACTIONS.FIELD_REPORT_CLOSED);
}

// Pour les tableaux de bord (après fusion) : le tableau appelant contrôle le droit d'accès.
export function openReports({ antennaId = null } = {}) {
  return repo.getAll().filter((r) => OPEN.includes(r.status) && (!antennaId || r.antennaId === antennaId));
}
