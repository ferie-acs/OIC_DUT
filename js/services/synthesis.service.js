// Intégration des lots d1 à d5 : agrégations des deux tableaux de bord de synthèse.
// - Tableau de bord d'antenne (agent d'antenne) : performance des agents, objectifs, stock, incidents,
//   équipements et remontées de SON antenne.
// - Tableau de bord de la Direction générale (rôle DIRECTION) : indicateurs nationaux, comparaison des
//   antennes, objectifs, incidents, équipements, ventes et rapprochement, partenaires, validations en attente.
// Les vues n'effectuent aucun calcul : tout est assemblé ici à partir des fonctions de service des lots.
import { getCurrentUser } from '../core/auth.js';
import { can } from '../core/permissions.js';
import { AUDIT_ACTIONS } from '../core/constants.js';
import { getAllDuts } from '../repositories/dut.repository.js';
import { getAllAuditLogs } from '../repositories/audit.repository.js';
import { getAllUsers } from '../repositories/users.repository.js';
import { findAntennaById } from '../repositories/antennas.repository.js';
import { partnersStore, transportersStore, applicationsRepo } from '../repositories/actors.repository.js';
import { statusOf } from './org-lifecycle.js';
import { periodPreset, antennaPerformance, attentionPoints } from './pilotage.service.js';
import { listContracts, listActions, attainmentByAntenna, overdueActions, contractsToValidate } from './objectives.service.js';
import { documentsToValidate } from './direction-documents.service.js';
import { legalContractsAwaiting, expiringLegalContracts } from './legal-contracts.service.js';
import { antennaStockSummary, stockByState } from './ranges.service.js';
import { antennaSalesSummary, salesReport } from './payments.service.js';
import { reconcile, partnerOptions } from './reconciliation.service.js';
import { openIncidents, overdueIncidents, incidentsByAntenna, INCIDENT_SEVERITIES, isOverdue } from './incidents.service.js';
import { brokenEquipment, equipmentByAntenna } from './equipment.service.js';
import { openReports } from './field-reports.service.js';

const HOUR = 3600000;
export const SYNTHESIS_PERIODS = { '30j': '30 derniers jours', '90j': '90 derniers jours', mois: 'Ce mois', trimestre: 'Ce trimestre', annee: 'Cette année' };

function actor(permission) {
  const user = getCurrentUser();
  if (!user) throw new Error('Connectez-vous pour consulter ce tableau de bord.');
  if (!can(user, permission)) throw new Error('Votre rôle ne permet pas de consulter ce tableau de bord.');
  return user;
}

export function period(kind = '30j') {
  return { ...periodPreset(SYNTHESIS_PERIODS[kind] ? kind : '30j'), kind: SYNTHESIS_PERIODS[kind] ? kind : '30j' };
}

const inPeriod = (iso, { from, to }) => !!iso && iso.slice(0, 10) >= from && iso.slice(0, 10) <= to;
const round1 = (x) => Math.round(x * 10) / 10;

/** Médiane d'une liste de nombres (null si vide). */
export function median(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/** Délai soumission → validation d'un DUT, en heures (null si dates absentes ou incohérentes). */
export function validationDelayH(dut) {
  const s = Date.parse(dut?.submittedAt || ''), v = Date.parse(dut?.validatedAt || '');
  if (!Number.isFinite(s) || !Number.isFinite(v) || v < s) return null;
  return round1((v - s) / HOUR);
}

/**
 * Performance des agents d'une antenne sur la période : DUT saisis (au guichet), validés, rejetés,
 * délai médian de validation et part validée sous 24 h. Fonction pure sur les listes fournies (testée).
 */
export function agentPerformance({ agents, duts, logs, antennaId, period: p }) {
  const mine = duts.filter((d) => d.antennaId === antennaId && !d.canary);
  return agents.map((a) => {
    const saisis = mine.filter((d) => (d.guichet?.agentId === a.id) && inPeriod(d.guichet?.at || d.createdAt, p)).length;
    const validated = mine.filter((d) => d.validatedAt && inPeriod(d.validatedAt, p)
      && (d.validatedById === a.id || d.validatedBy === a.name || logs.some((l) => l.action === AUDIT_ACTIONS.DUT_VALIDATED && l.dutId === d.id && l.userId === a.id)));
    const rejetes = logs.filter((l) => l.action === AUDIT_ACTIONS.DUT_REJECTED && l.userId === a.id && inPeriod(l.date, p)).length
      || mine.filter((d) => d.rejectedBy === a.name && inPeriod(d.rejectedAt, p)).length;
    const delays = validated.map(validationDelayH).filter((x) => x != null);
    return {
      id: a.id, name: a.name, email: a.email, saisis, valides: validated.length, rejetes,
      delaiMedianH: delays.length ? round1(median(delays)) : null,
      sous24h: delays.length ? Math.round((delays.filter((x) => x <= 24).length / delays.length) * 100) : null,
    };
  }).sort((x, y) => (y.valides + y.saisis) - (x.valides + x.saisis) || x.name.localeCompare(y.name, 'fr'));
}

/** Taux global et répartition des objectifs (lignes de contrats d'objectifs en vigueur). */
export function objectiveSummary(lines) {
  const withRate = lines.filter((l) => l.taux != null);
  const capped = withRate.map((l) => Math.min(100, l.taux));
  return {
    objectifs: lines.length,
    atteints: lines.filter((l) => l.statut === 'ATTEINT').length,
    proches: lines.filter((l) => l.statut === 'PROCHE').length,
    nonAtteints: lines.filter((l) => l.statut === 'NON_ATTEINT').length,
    sansResultat: lines.filter((l) => l.statut === 'SANS_RESULTAT').length,
    taux: capped.length ? round1(capped.reduce((a, b) => a + b, 0) / capped.length) : null,
  };
}

const incidentRow = (i) => ({ id: i.id, reference: i.reference, title: i.title, severity: INCIDENT_SEVERITIES[i.severity]?.label || '', status: i.status, overdue: isOverdue(i), antennaName: i.antennaName, declaredAt: i.declaredAt });

// ------------------------------------------------------------------ Tableau de bord d'antenne

export function antennaSynthesis({ periodKind = '30j' } = {}) {
  const user = actor('dashboard.antenna');
  if (!user.antennaId) throw new Error('Votre compte n’est rattaché à aucune antenne.');
  const p = period(periodKind);
  const antenna = findAntennaById(user.antennaId);
  const agents = getAllUsers().filter((u) => u.role === 'ANTENNA_AGENT' && u.antennaId === user.antennaId && u.active !== false);
  const agentsPerf = agentPerformance({ agents, duts: getAllDuts(), logs: getAllAuditLogs(), antennaId: user.antennaId, period: p });
  const delays = getAllDuts().filter((d) => d.antennaId === user.antennaId && d.validatedAt && inPeriod(d.validatedAt, p)).map(validationDelayH).filter((x) => x != null);

  const contracts = can(user, 'objectives.results') ? listContracts().filter((c) => c.status === 'VALIDE') : [];
  const lines = contracts.flatMap((c) => c.lines.map((l) => ({ ...l, contractId: c.id, contractRef: c.reference })));
  const actions = can(user, 'actions.follow') ? listActions() : [];

  const incidents = openIncidents({ antennaId: user.antennaId });
  const reports = openReports({ antennaId: user.antennaId });
  const broken = brokenEquipment({ antennaId: user.antennaId });

  return {
    antenna: { id: user.antennaId, name: antenna?.name || user.antennaName || '' },
    period: p,
    agents: agentsPerf,
    totals: {
      agents: agents.length,
      saisis: agentsPerf.reduce((n, a) => n + a.saisis, 0),
      valides: agentsPerf.reduce((n, a) => n + a.valides, 0),
      rejetes: agentsPerf.reduce((n, a) => n + a.rejetes, 0),
      delaiMedianH: delays.length ? round1(median(delays)) : null,
    },
    objectifs: {
      ...objectiveSummary(lines),
      lignes: lines.map((l) => ({ id: l.id, contractId: l.contractId, contractRef: l.contractRef, label: l.indicator?.label || '', unit: l.indicator?.unit || '', beneficiaire: l.assignee?.name || l.assigneeName || '', target: l.target, actual: l.last ? l.last.value : null, taux: l.taux, statut: l.statut })),
      actionsOuvertes: actions.filter((a) => !['REALISEE', 'ABANDONNEE'].includes(a.status)).length,
      actionsEnRetard: actions.filter((a) => a.late).length,
    },
    stock: can(user, 'ranges.stock') ? { ...antennaStockSummary(user.antennaId), ventes: antennaSalesSummary(user.antennaId, { from: p.from, to: p.to }) } : null,
    incidents: { ouverts: incidents.length, enRetard: incidents.filter((i) => isOverdue(i)).length, liste: incidents.map(incidentRow).sort((a, b) => Number(b.overdue) - Number(a.overdue)).slice(0, 5) },
    equipements: { enPanne: broken.length, liste: broken.slice(0, 5).map((e) => ({ id: e.id, reference: e.reference, label: e.label || e.designation || e.type, status: e.status })) },
    remontees: { enCours: reports.length, liste: reports.slice(0, 5).map((r) => ({ id: r.id, reference: r.reference, title: r.title, status: r.status })) },
  };
}

// ------------------------------------------------------------------ Tableau de bord de la Direction générale

/** Groupements (partenaires habilités, transporteurs) par état, avec les demandes d'inscription en attente. */
export function groupementsSummary() {
  const count = (list) => {
    const out = { actifs: 0, suspendus: 0, enAttente: 0, resilies: 0, total: list.length };
    list.forEach((o) => { const s = statusOf(o); if (s === 'ACTIF') out.actifs += 1; else if (s === 'SUSPENDU') out.suspendus += 1; else if (s === 'EN_ATTENTE') out.enAttente += 1; else if (s === 'RESILIE') out.resilies += 1; });
    return out;
  };
  return {
    partenaires: count(partnersStore.getAll()),
    transporteurs: { ...count(transportersStore.getAll()), inscriptions: applicationsRepo.getAll().filter((a) => a.status === 'EN_ATTENTE').length },
    suspendus: [...partnersStore.getAll().map((o) => ({ ...o, type: 'Partenaire' })), ...transportersStore.getAll().map((o) => ({ ...o, type: 'Transporteur' }))]
      .filter((o) => statusOf(o) === 'SUSPENDU').map((o) => ({ id: o.id, name: o.name, type: o.type })),
  };
}

/** Rapprochement national : écarts non justifiés et sommes dues / validées par partenaire sur la période. */
export function reconciliationSummary(p) {
  const rows = partnerOptions().map((opt) => {
    const r = reconcile({ partnerId: opt.id, from: p.from, to: p.to });
    const open = r.ecarts.filter((e) => !e.justification);
    return { id: opt.id, name: opt.name, du: r.totals.du, valide: r.totals.valide, ecarts: r.ecarts.length, ecartsOuverts: open.length, bloquants: open.filter((e) => e.niveau === 'error').length };
  });
  return {
    rows: rows.sort((a, b) => b.ecartsOuverts - a.ecartsOuverts || a.name.localeCompare(b.name, 'fr')),
    ecartsOuverts: rows.reduce((n, r) => n + r.ecartsOuverts, 0),
    partenairesConcernes: rows.filter((r) => r.ecartsOuverts).length,
    du: rows.reduce((n, r) => n + r.du, 0),
    valide: rows.reduce((n, r) => n + r.valide, 0),
  };
}

export function directionSynthesis({ periodKind = '30j' } = {}) {
  const user = actor('pilotage.view');
  const p = period(periodKind);
  const perf = antennaPerformance({ from: p.from, to: p.to }, { rankBy: 'dutValides' });
  const attainment = attainmentByAntenna();
  const attainmentById = new Map(attainment.map((a) => [a.antennaId, a]));
  const incidentsAnt = incidentsByAntenna();
  const incidentsById = new Map(incidentsAnt.map((r) => [r.antennaId, r]));
  const equipAnt = equipmentByAntenna();
  const equipById = new Map(equipAnt.map((r) => [r.antennaId, r]));
  const allOpen = openIncidents();
  const sales = can(user, 'sales.report') ? salesReport({ from: p.from, to: p.to }) : null;

  const antennes = perf.rows.filter((r) => r.actif || attainmentById.has(r.id) || incidentsById.has(r.id) || (equipById.get(r.id)?.broken || 0) > 0)
    .map((r) => ({
      id: r.id, name: r.name, rang: r.rang,
      dutValides: r.values.dutValides || 0, dutCrees: r.values.dutCrees || 0, tauxRejet: r.values.tauxRejet || 0,
      delaiValidationH: r.values.delaiValidationH || null, evolutionValides: r.evolution.dutValides || 0,
      objectifs: attainmentById.get(r.id)?.taux ?? null,
      incidentsOuverts: incidentsById.get(r.id)?.open || 0, incidentsEnRetard: incidentsById.get(r.id)?.overdue || 0,
      equipementsEnPanne: equipById.get(r.id)?.broken || 0,
    }));
  const lateActions = overdueActions();
  const toValidate = contractsToValidate();

  return {
    period: p,
    national: perf.national,
    antennesActives: perf.actives,
    antennesTotal: perf.rows.length,
    antennes,
    objectifs: {
      parAntenne: attainment,
      tauxNational: attainment.length ? round1(attainment.filter((a) => a.taux != null).reduce((n, a) => n + Math.min(100, a.taux), 0) / Math.max(1, attainment.filter((a) => a.taux != null).length)) : null,
      actionsEnRetard: lateActions.length,
      actionsListe: lateActions.slice(0, 5).map((a) => ({ id: a.id, title: a.title, responsible: a.responsible, dueDate: a.dueDate, antennaName: findAntennaById(a.antennaId)?.name || 'Niveau national' })),
      contratsAValider: toValidate.length,
    },
    incidents: {
      ouverts: allOpen.length, enRetard: overdueIncidents().length, critiques: allOpen.filter((i) => i.severity === 'CRITIQUE').length,
      liste: allOpen.map(incidentRow).sort((a, b) => Number(b.overdue) - Number(a.overdue) || String(b.declaredAt).localeCompare(String(a.declaredAt))).slice(0, 5),
    },
    equipements: equipAnt.reduce((t, r) => ({ total: t.total + r.total, enService: t.enService + r.inService, enPanne: t.enPanne + r.broken, reformes: t.reformes + r.retired }), { total: 0, enService: 0, enPanne: 0, reformes: 0 }),
    ventes: sales ? { ...sales.total, stock: stockByState() } : null,
    rapprochement: can(user, 'reconciliation.view') ? reconciliationSummary(p) : null,
    groupements: groupementsSummary(),
    validations: {
      contratsObjectifs: toValidate.length,
      documents: documentsToValidate().length,
      contratsJuridiques: legalContractsAwaiting().filter((c) => c.status === 'VALIDATION_DG').length,
      contratsEnCircuit: legalContractsAwaiting().length,
      contratsEcheance: expiringLegalContracts().length,
      decisionsEnRetard: attentionPoints().decisionsEnRetard,
    },
  };
}

