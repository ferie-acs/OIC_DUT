// Lot d5 : contrats d'objectifs, indicateurs, résultats, écarts, taux d'atteinte et actions correctives.
// Cycle d'un contrat : BROUILLON → SOUMIS → VALIDE → CLOTURE (un renvoi ramène SOUMIS en BROUILLON, avec motif).
// La validation est faite par une autre personne que celle qui a préparé ou soumis le contrat.
import { AUDIT_ACTIONS } from '../core/constants.js';
import { getAllAntennas, findAntennaById } from '../repositories/antennas.repository.js';
import { indicatorsRepo, objectiveContractsRepo, correctiveActionsRepo, agentProfilesRepo } from '../repositories/pilotage.repository.js';
import { compare, indicator as catalogIndicator } from './comparison.service.js';
import { actor, canDo, who, journal, today, isIsoDate, text, nextReference, uuid, nowIso } from './pilotage-core.service.js';
import { aviser } from './notifications.service.js'; // Intégration : messagerie unique du lot d1

export const CONTRACT_STATUS = { BROUILLON: 'BROUILLON', SOUMIS: 'SOUMIS', VALIDE: 'VALIDE', CLOTURE: 'CLOTURE' };
export const CONTRACT_STATUS_LABELS = { BROUILLON: 'En préparation', SOUMIS: 'À valider', VALIDE: 'En vigueur', CLOTURE: 'Clôturé' };
export const ATTAINMENT_LABELS = { ATTEINT: 'Atteint', PROCHE: 'Proche de la cible', NON_ATTEINT: 'Non atteint', SANS_RESULTAT: 'Pas encore de résultat' };
export const ACTION_STATUS = { A_LANCER: 'A_LANCER', EN_COURS: 'EN_COURS', REALISEE: 'REALISEE', ABANDONNEE: 'ABANDONNEE' };
export const ACTION_STATUS_LABELS = { A_LANCER: 'À lancer', EN_COURS: 'En cours', REALISEE: 'Réalisée', ABANDONNEE: 'Abandonnée' };
const CLOSED_ACTIONS = new Set([ACTION_STATUS.REALISEE, ACTION_STATUS.ABANDONNEE]);
/** Indicateurs mesurables automatiquement à partir des DUT, repris du catalogue du comparateur. */
export const MEASURABLE_KEYS = ['dutCrees', 'dutSoumis', 'dutValides', 'dutRejetes', 'tauxRejet', 'tauxValidation', 'delaiValidationH', 'validesSous24h', 'scans', 'tonnage'];
const ATTAINMENT_CAP = 200;
const round1 = (x) => Math.round(x * 10) / 10;

// ---------------------------------------------------------------- Calculs (purs, testés)

/**
 * Taux d'atteinte et écart d'un résultat par rapport à sa cible.
 * - plus haut = mieux : taux = réalisé / cible ; plus bas = mieux (délai, taux de rejet) : taux = cible / réalisé.
 * - le taux est plafonné à 200 % pour qu'un dépassement exceptionnel ne masque pas le reste.
 * - écart = réalisé − cible (signé) ; `favorable` indique s'il va dans le bon sens.
 */
export function attainment(target, actual, better = 'high') {
  if (actual == null || actual === '' || Number.isNaN(Number(actual))) return { taux: null, ecart: null, favorable: null, statut: 'SANS_RESULTAT' };
  const t = Number(target), a = Number(actual);
  let taux;
  if (better === 'low') taux = a <= 0 ? 100 : (t / a) * 100;
  else taux = t <= 0 ? 100 : (a / t) * 100;
  taux = round1(Math.min(ATTAINMENT_CAP, Math.max(0, taux)));
  const ecart = round1(a - t);
  const favorable = better === 'low' ? ecart <= 0 : ecart >= 0;
  const statut = taux >= 100 ? 'ATTEINT' : taux >= 80 ? 'PROCHE' : 'NON_ATTEINT';
  return { taux, ecart, favorable, statut };
}

/** Taux d'atteinte global : moyenne des taux plafonnés à 100 % (un dépassement ne compense pas un échec ailleurs). */
export function globalAttainment(taux) {
  const list = taux.filter((x) => x != null);
  if (!list.length) return null;
  return round1(list.reduce((s, x) => s + Math.min(100, x), 0) / list.length);
}

// ---------------------------------------------------------------- Indicateurs

export function listIndicators() {
  actor('pilotage.view', 'objectives.results');
  return indicatorsRepo.all().sort((a, b) => a.code.localeCompare(b.code, 'fr'));
}

export function measurableOptions() {
  return MEASURABLE_KEYS.map((k) => catalogIndicator(k)).filter(Boolean).map((i) => ({ key: i.key, label: i.label, unit: i.unit, better: i.better }));
}

export function saveIndicator(input, id = null) {
  const user = actor('objectives.manage');
  const list = indicatorsRepo.all();
  const old = id ? list.find((x) => x.id === id) : null;
  if (id && !old) throw new Error('Indicateur introuvable.');
  if (old && objectiveContractsRepo.all().some((c) => c.status !== CONTRACT_STATUS.BROUILLON && c.lines.some((l) => l.indicatorId === id))) {
    throw new Error('Cet indicateur est déjà utilisé dans un contrat soumis ou validé : créez un nouvel indicateur plutôt que de le modifier.');
  }
  const source = input.source && input.source !== 'MANUEL' ? input.source : 'MANUEL';
  const auto = source === 'MANUEL' ? null : catalogIndicator(source);
  if (source !== 'MANUEL' && (!auto || !MEASURABLE_KEYS.includes(source))) throw new Error('Mesure automatique inconnue.');
  const value = {
    id: old?.id || uuid(),
    code: text(input.code, 'Code', { max: 20 }).toUpperCase(),
    label: text(input.label, 'Libellé', { max: 120 }),
    unit: auto ? auto.unit : text(input.unit, 'Unité', { required: false, max: 20 }),
    better: auto ? auto.better : (input.better === 'low' ? 'low' : 'high'),
    source,
    description: text(input.description, 'Description', { required: false, max: 400 }),
    createdAt: old?.createdAt || nowIso(), updatedAt: nowIso(), createdBy: old?.createdBy || who(user),
  };
  if (list.some((x) => x.id !== value.id && x.code === value.code)) throw new Error('Ce code d’indicateur est déjà utilisé.');
  indicatorsRepo.upsert(value);
  journal(AUDIT_ACTIONS.PILOT_INDICATOR_SAVED, { entity: 'INDICATEUR', entityId: value.id, reference: value.code, newValue: value.label });
  return value;
}

// ---------------------------------------------------------------- Contrats d'objectifs

function assigneeOf(line) {
  if (line.assigneeType === 'AGENT') {
    const agent = agentProfilesRepo.find(line.agentId);
    return { type: 'AGENT', id: line.agentId, name: agent?.name || line.assigneeName || 'Agent', antennaId: agent?.antennaId || line.antennaId || null };
  }
  const antenna = findAntennaById(line.antennaId);
  return { type: 'ANTENNE', id: line.antennaId, name: antenna?.name || line.assigneeName || 'Antenne', antennaId: line.antennaId };
}

function cleanLines(lines) {
  if (!Array.isArray(lines) || !lines.length) throw new Error('Ajoutez au moins un objectif (indicateur, bénéficiaire, cible).');
  const indicators = indicatorsRepo.all();
  const seen = new Set();
  return lines.map((l) => {
    const ind = indicators.find((i) => i.id === l.indicatorId);
    if (!ind) throw new Error('Choisissez un indicateur pour chaque objectif.');
    const type = l.assigneeType === 'AGENT' ? 'AGENT' : 'ANTENNE';
    let antennaId = null, agentId = null, assigneeName = '';
    if (type === 'AGENT') {
      const agent = agentProfilesRepo.find(l.agentId);
      if (!agent || agent.active === false) throw new Error('Choisissez un agent actif pour chaque objectif attribué à un agent.');
      agentId = agent.id; antennaId = agent.antennaId; assigneeName = agent.name;
    } else {
      const antenna = findAntennaById(l.antennaId);
      if (!antenna) throw new Error('Choisissez l’antenne à laquelle chaque objectif est attribué.');
      antennaId = antenna.id; assigneeName = antenna.name;
    }
    const target = Number(l.target);
    if (l.target === '' || l.target == null || !Number.isFinite(target) || target < 0) throw new Error(`Cible invalide pour « ${ind.label} » : saisissez un nombre positif.`);
    const key = `${type}:${agentId || antennaId}:${ind.id}`;
    if (seen.has(key)) throw new Error(`L’objectif « ${ind.label} » est attribué deux fois au même bénéficiaire.`);
    seen.add(key);
    return { id: l.id || uuid(), indicatorId: ind.id, assigneeType: type, antennaId, agentId, assigneeName, target, results: Array.isArray(l.results) ? l.results : [] };
  });
}

export function saveContract(input, id = null) {
  const user = actor('objectives.manage');
  const list = objectiveContractsRepo.all();
  const old = id ? list.find((c) => c.id === id) : null;
  if (id && !old) throw new Error('Contrat introuvable.');
  if (old && old.status !== CONTRACT_STATUS.BROUILLON) throw new Error('Seul un contrat en préparation peut être modifié.');
  const from = String(input.from || ''), to = String(input.to || '');
  if (!isIsoDate(from) || !isIsoDate(to)) throw new Error('Indiquez les dates de début et de fin de la période.');
  if (from > to) throw new Error('La date de fin doit suivre la date de début.');
  const value = {
    ...(old || {}),
    id: old?.id || uuid(),
    reference: old?.reference || nextReference('CO', list),
    title: text(input.title, 'Intitulé', { max: 140 }),
    periodLabel: text(input.periodLabel, 'Période', { max: 40 }),
    from, to,
    description: text(input.description, 'Description', { required: false, max: 600 }),
    lines: cleanLines(input.lines),
    status: CONTRACT_STATUS.BROUILLON,
    createdBy: old?.createdBy || who(user), createdAt: old?.createdAt || nowIso(), updatedAt: nowIso(),
    history: [...(old?.history || []), { at: nowIso(), by: user.name, label: old ? 'Contrat modifié' : 'Contrat créé' }],
  };
  objectiveContractsRepo.upsert(value);
  journal(AUDIT_ACTIONS.PILOT_CONTRACT_SAVED, { entity: 'CONTRAT_OBJECTIFS', entityId: value.id, reference: value.reference, newValue: value.title });
  return value;
}

function mustGetContract(id) {
  const c = objectiveContractsRepo.find(id);
  if (!c) throw new Error('Contrat introuvable.');
  return c;
}

function transition(contract, user, status, label, extra = {}) {
  const next = { ...contract, ...extra, status, updatedAt: nowIso(), history: [...(contract.history || []), { at: nowIso(), by: user.name, label, note: extra.lastNote || null }] };
  delete next.lastNote;
  return objectiveContractsRepo.upsert(next);
}

export function submitContract(id) {
  const user = actor('objectives.manage');
  const c = mustGetContract(id);
  if (c.status !== CONTRACT_STATUS.BROUILLON) throw new Error('Seul un contrat en préparation peut être soumis.');
  const saved = transition(c, user, CONTRACT_STATUS.SOUMIS, 'Soumis à validation', { submittedBy: who(user), submittedAt: nowIso() });
  journal(AUDIT_ACTIONS.PILOT_CONTRACT_SUBMITTED, { entity: 'CONTRAT_OBJECTIFS', entityId: id, reference: c.reference });
  // Messagerie unique (lot d1) : la Direction générale (droit de validation) est invitée à valider.
  aviser({ permission: 'objectives.validate' }, { objet: `Contrat d’objectifs ${c.reference} à valider`, corps: `${user.name} a soumis le contrat d’objectifs ${c.reference} « ${c.title} » (${c.periodLabel}). Il attend votre validation.`, origine: 'Contrats d’objectifs', lien: `#/direction/objectifs/${id}`, entite: id });
  return saved;
}

export function validateContract(id) {
  const user = actor('objectives.validate');
  const c = mustGetContract(id);
  if (c.status !== CONTRACT_STATUS.SOUMIS) throw new Error('Seul un contrat soumis peut être validé.');
  if (c.createdBy?.id === user.id || c.submittedBy?.id === user.id) throw new Error('La validation doit être faite par une autre personne que celle qui a préparé ou soumis le contrat.');
  const saved = transition(c, user, CONTRACT_STATUS.VALIDE, 'Validé et attribué', { validatedBy: who(user), validatedAt: nowIso() });
  journal(AUDIT_ACTIONS.PILOT_CONTRACT_VALIDATED, { entity: 'CONTRAT_OBJECTIFS', entityId: id, reference: c.reference });
  aviser({ ids: [c.createdBy?.id, c.submittedBy?.id] }, { objet: `Contrat d’objectifs ${c.reference} validé`, corps: `Le contrat d’objectifs ${c.reference} « ${c.title} » a été validé par ${user.name} : il est en vigueur.`, origine: 'Contrats d’objectifs', lien: `#/direction/objectifs/${id}`, entite: id });
  const antennaIds = [...new Set((c.lines || []).map((l) => assigneeOf(l).antennaId).filter(Boolean))];
  antennaIds.forEach((antennaId) => aviser({ permission: 'objectives.results', antennaId, roles: ['ANTENNA_AGENT'] }, { objet: `Nouveaux objectifs pour votre antenne`, corps: `Le contrat d’objectifs ${c.reference} « ${c.title} » est en vigueur. Vous pouvez saisir les résultats de votre antenne.`, origine: 'Contrats d’objectifs', lien: `#/antenna/objectifs/${id}`, entite: id }));
  return saved;
}

export function rejectContract(id, reason) {
  const user = actor('objectives.validate');
  const c = mustGetContract(id);
  if (c.status !== CONTRACT_STATUS.SOUMIS) throw new Error('Seul un contrat soumis peut être renvoyé.');
  const motif = text(reason, 'Motif du renvoi', { max: 500 });
  const saved = transition(c, user, CONTRACT_STATUS.BROUILLON, 'Renvoyé en préparation', { rejection: { by: user.name, at: nowIso(), reason: motif }, lastNote: motif });
  journal(AUDIT_ACTIONS.PILOT_CONTRACT_REJECTED, { entity: 'CONTRAT_OBJECTIFS', entityId: id, reference: c.reference, note: motif });
  aviser({ ids: [c.createdBy?.id, c.submittedBy?.id] }, { objet: `Contrat d’objectifs ${c.reference} renvoyé`, corps: `Le contrat d’objectifs ${c.reference} « ${c.title} » est renvoyé en préparation par ${user.name}. Motif : ${motif}.`, origine: 'Contrats d’objectifs', lien: `#/direction/objectifs/${id}`, entite: id });
  return saved;
}

export function closeContract(id, note = '') {
  const user = actor('objectives.manage');
  const c = mustGetContract(id);
  if (c.status !== CONTRACT_STATUS.VALIDE) throw new Error('Seul un contrat en vigueur peut être clôturé.');
  const motif = text(note, 'Bilan de clôture', { max: 500 });
  const saved = transition(c, user, CONTRACT_STATUS.CLOTURE, 'Clôturé', { closedBy: who(user), closedAt: nowIso(), lastNote: motif });
  journal(AUDIT_ACTIONS.PILOT_CONTRACT_CLOSED, { entity: 'CONTRAT_OBJECTIFS', entityId: id, reference: c.reference, note: motif });
  return saved;
}

/** Un agent d'antenne n'agit que sur les objectifs de son antenne ; la Direction et l'Admin OIC sur tous. */
function lineInScope(user, line) {
  if (user.role !== 'ANTENNA_AGENT') return true;
  return assigneeOf(line).antennaId === user.antennaId;
}

/** Contrats visibles : tous pour le pilotage national ; pour une antenne, ses objectifs en vigueur ou clôturés. */
export function listContracts() {
  const user = actor('pilotage.view', 'objectives.results');
  const all = objectiveContractsRepo.all().sort((a, b) => String(b.from).localeCompare(String(a.from)));
  if (canDo('pilotage.view')) return all.map(withStatus);
  return all.filter((c) => [CONTRACT_STATUS.VALIDE, CONTRACT_STATUS.CLOTURE].includes(c.status))
    .map((c) => ({ ...c, lines: c.lines.filter((l) => lineInScope(user, l)) }))
    .filter((c) => c.lines.length).map(withStatus);
}

export function getContract(id) {
  const c = listContracts().find((x) => x.id === id);
  if (!c) throw new Error('Contrat introuvable ou hors de votre périmètre.');
  return c;
}

/** Dernier résultat saisi d'un objectif (par date de résultat, puis date de saisie). */
export function latestResult(line) {
  return [...(line.results || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.at).localeCompare(String(a.at)))[0] || null;
}

function lineStatus(line, indicators) {
  const ind = indicators.find((i) => i.id === line.indicatorId) || { label: 'Indicateur supprimé', unit: '', better: 'high', source: 'MANUEL' };
  const last = latestResult(line);
  return { ...line, indicator: ind, assignee: assigneeOf(line), last, ...attainment(line.target, last ? last.value : null, ind.better) };
}

function withStatus(contract) {
  const indicators = indicatorsRepo.all();
  const lines = contract.lines.map((l) => lineStatus(l, indicators));
  return { ...contract, lines, global: globalAttainment(lines.map((l) => l.taux)), nonAtteints: lines.filter((l) => l.statut === 'NON_ATTEINT').length, sansResultat: lines.filter((l) => l.statut === 'SANS_RESULTAT').length };
}

/** Valeur mesurée sur les DUT pour un objectif d'antenne relié à une mesure automatique (sinon null). */
export function measuredValue(contractId, lineId) {
  const user = actor('objectives.results');
  const c = mustGetContract(contractId);
  const line = c.lines.find((l) => l.id === lineId);
  if (!line || !lineInScope(user, line)) throw new Error('Objectif introuvable ou hors de votre périmètre.');
  const ind = indicatorsRepo.find(line.indicatorId);
  if (!ind || ind.source === 'MANUEL' || line.assigneeType !== 'ANTENNE') return null;
  const res = compare('antennes', [line.antennaId], [ind.source], { from: c.from, to: c.to < today() ? c.to : today() });
  return res.rows[0] ? res.rows[0].values[ind.source] : null;
}

export function recordResult(contractId, lineId, input) {
  const user = actor('objectives.results');
  const c = mustGetContract(contractId);
  if (c.status !== CONTRACT_STATUS.VALIDE) throw new Error('Les résultats se saisissent uniquement sur un contrat en vigueur.');
  const line = c.lines.find((l) => l.id === lineId);
  if (!line) throw new Error('Objectif introuvable.');
  if (!lineInScope(user, line)) throw new Error('Vous ne pouvez saisir que les résultats de votre antenne.');
  const value = Number(input.value);
  if (input.value === '' || input.value == null || !Number.isFinite(value) || value < 0) throw new Error('Saisissez un résultat chiffré positif ou nul.');
  const date = String(input.date || today());
  if (!isIsoDate(date)) throw new Error('Date du résultat invalide.');
  if (date < c.from) throw new Error('La date du résultat précède le début de la période du contrat.');
  if (date > today()) throw new Error('La date du résultat ne peut pas être dans le futur.');
  const entry = { id: uuid(), value, date, comment: text(input.comment, 'Commentaire', { required: false, max: 400 }), source: input.source === 'MESURE' ? 'MESURE' : 'SAISIE', by: user.name, byId: user.id, at: nowIso() };
  const previous = latestResult(line);
  const next = { ...c, lines: c.lines.map((l) => (l.id === lineId ? { ...l, results: [...(l.results || []), entry] } : l)), updatedAt: nowIso() };
  objectiveContractsRepo.upsert(next);
  journal(AUDIT_ACTIONS.PILOT_RESULT_RECORDED, { entity: 'CONTRAT_OBJECTIFS', entityId: c.id, reference: c.reference, oldValue: previous ? String(previous.value) : null, newValue: String(value), note: `${line.assigneeName} · ${indicatorsRepo.find(line.indicatorId)?.label || ''}` });
  return withStatus(next).lines.find((l) => l.id === lineId);
}

// ---------------------------------------------------------------- Actions correctives

function actionView(a, contracts) {
  const c = contracts.find((x) => x.id === a.contractId);
  const line = c?.lines.find((l) => l.id === a.lineId);
  const late = !CLOSED_ACTIONS.has(a.status) && a.dueDate < today();
  return { ...a, contract: c ? { id: c.id, reference: c.reference, title: c.title } : null, line: line ? { id: line.id, label: line.indicator?.label, assignee: line.assignee?.name, taux: line.taux, ecart: line.ecart, unit: line.indicator?.unit } : null, late, closed: CLOSED_ACTIONS.has(a.status) };
}

export function listActions({ status = '', lateOnly = false } = {}) {
  const user = actor('pilotage.view', 'actions.follow');
  const contracts = listContracts();
  let list = correctiveActionsRepo.all();
  if (!canDo('pilotage.view')) list = list.filter((a) => a.antennaId === user.antennaId);
  return list.map((a) => actionView(a, contracts))
    .filter((a) => (!status || a.status === status) && (!lateOnly || a.late))
    .sort((a, b) => Number(b.late) - Number(a.late) || String(a.dueDate).localeCompare(String(b.dueDate)));
}

export function createAction(contractId, lineId, input) {
  const user = actor('actions.manage');
  const c = mustGetContract(contractId);
  if (![CONTRACT_STATUS.VALIDE, CONTRACT_STATUS.CLOTURE].includes(c.status)) throw new Error('Une action corrective se rattache à un contrat en vigueur.');
  const line = withStatus(c).lines.find((l) => l.id === lineId);
  if (!line) throw new Error('Objectif introuvable.');
  if (line.statut === 'SANS_RESULTAT') throw new Error('Saisissez d’abord un résultat : une action corrective répond à un écart constaté.');
  if (line.statut === 'ATTEINT') throw new Error('Cet objectif est atteint : aucune action corrective n’est nécessaire.');
  const dueDate = String(input.dueDate || '');
  if (!isIsoDate(dueDate)) throw new Error('Indiquez l’échéance de l’action.');
  if (dueDate < today()) throw new Error('L’échéance ne peut pas être déjà passée.');
  const action = {
    id: uuid(), contractId, lineId, antennaId: line.assignee.antennaId,
    title: text(input.title, 'Action', { max: 160 }),
    description: text(input.description, 'Description', { required: false, max: 600 }),
    responsible: text(input.responsible, 'Responsable', { max: 100 }),
    dueDate, status: ACTION_STATUS.A_LANCER,
    gapAtCreation: { taux: line.taux, ecart: line.ecart },
    createdBy: who(user), createdAt: nowIso(),
    updates: [{ at: nowIso(), by: user.name, status: ACTION_STATUS.A_LANCER, comment: 'Action décidée.' }],
  };
  correctiveActionsRepo.upsert(action);
  journal(AUDIT_ACTIONS.PILOT_ACTION_SAVED, { entity: 'ACTION_CORRECTIVE', entityId: action.id, reference: c.reference, newValue: action.title, note: `Responsable : ${action.responsible} · échéance ${dueDate}` });
  // Messagerie unique (lot d1) : les agents de l'antenne concernée suivent l'action.
  if (action.antennaId) aviser({ permission: 'actions.follow', antennaId: action.antennaId }, { objet: `Action corrective à suivre`, corps: `Une action corrective est décidée pour votre antenne : « ${action.title} ». Responsable : ${action.responsible}. Échéance : ${dueDate}.`, origine: 'Actions correctives', lien: '#/antenna/actions', entite: action.id });
  return action;
}

export function updateAction(id, input) {
  const user = actor('actions.manage', 'actions.follow');
  const a = correctiveActionsRepo.find(id);
  if (!a) throw new Error('Action introuvable.');
  if (!canDo('actions.manage') && a.antennaId !== user.antennaId) throw new Error('Vous ne pouvez suivre que les actions de votre antenne.');
  if (CLOSED_ACTIONS.has(a.status)) throw new Error('Cette action est close : elle ne peut plus être modifiée.');
  const status = input.status || a.status;
  if (!ACTION_STATUS[status]) throw new Error('État inconnu.');
  if (status === ACTION_STATUS.ABANDONNEE && !canDo('actions.manage')) throw new Error('Seul le pilotage peut abandonner une action.');
  const comment = text(input.comment, 'Point d’avancement', { max: 500 });
  let dueDate = a.dueDate;
  if (input.dueDate && input.dueDate !== a.dueDate) {
    if (!canDo('actions.manage')) throw new Error('Seul le pilotage peut reporter une échéance.');
    if (!isIsoDate(input.dueDate) || input.dueDate < today()) throw new Error('Nouvelle échéance invalide.');
    dueDate = input.dueDate;
  }
  const next = { ...a, status, dueDate, updatedAt: nowIso(), closedAt: CLOSED_ACTIONS.has(status) ? nowIso() : null, updates: [...a.updates, { at: nowIso(), by: user.name, status, comment, dueDate: dueDate !== a.dueDate ? dueDate : undefined }] };
  correctiveActionsRepo.upsert(next);
  journal(AUDIT_ACTIONS.PILOT_ACTION_UPDATED, { entity: 'ACTION_CORRECTIVE', entityId: id, oldValue: a.status, newValue: status, note: comment });
  return next;
}

// ---------------------------------------------------------------- Fonctions exposées au tableau de bord de la Direction

/** Taux d'atteinte par antenne sur les contrats en vigueur (objectifs d'antenne et de ses agents). */
export function attainmentByAntenna() {
  actor('pilotage.view');
  const lines = listContracts().filter((c) => c.status === CONTRACT_STATUS.VALIDE).flatMap((c) => c.lines);
  const names = new Map(getAllAntennas().map((a) => [a.id, a.name]));
  const groups = new Map();
  lines.forEach((l) => { const k = l.assignee.antennaId; if (!k) return; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(l); });
  return [...groups.entries()].map(([antennaId, ls]) => ({
    antennaId, antennaName: names.get(antennaId) || '—', objectifs: ls.length,
    atteints: ls.filter((l) => l.statut === 'ATTEINT').length, nonAtteints: ls.filter((l) => l.statut === 'NON_ATTEINT').length,
    sansResultat: ls.filter((l) => l.statut === 'SANS_RESULTAT').length, taux: globalAttainment(ls.map((l) => l.taux)),
  })).sort((a, b) => (b.taux ?? -1) - (a.taux ?? -1));
}

/** Actions correctives non closes dont l'échéance est dépassée. */
export function overdueActions() {
  return listActions({ lateOnly: true });
}

/** Contrats d'objectifs soumis, en attente de validation. */
export function contractsToValidate() {
  actor('pilotage.view');
  return listContracts().filter((c) => c.status === CONTRACT_STATUS.SOUMIS);
}
