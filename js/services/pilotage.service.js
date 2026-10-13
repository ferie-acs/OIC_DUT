// Lot d5 : suivi et comparaison des antennes par période, classement et rapport périodique.
// Tout est calculé par le comparateur existant (comparison.service → statistics.service) : rien n'est dupliqué.
import { AUDIT_ACTIONS } from '../core/constants.js';
import { getAllAntennas } from '../repositories/antennas.repository.js';
import { compare, indicator } from './comparison.service.js';
import { computeStatistics } from './statistics.service.js';
import { toCsv } from './supervision.service.js';
import { attainmentByAntenna, overdueActions, contractsToValidate } from './objectives.service.js';
import { documentsToValidate } from './direction-documents.service.js';
import { overdueDecisions } from './meetings.service.js';
import { expiringLegalContracts, legalContractsAwaiting } from './legal-contracts.service.js';
import { actor, journal, today, isIsoDate, DAY_MS, nowIso } from './pilotage-core.service.js';

/** Indicateurs suivis par antenne (clés du catalogue du comparateur). */
export const TRACKED = ['dutCrees', 'dutValides', 'dutRejetes', 'tauxRejet', 'delaiValidationH', 'validesSous24h', 'scans'];
export const RANKABLE = ['dutValides', 'dutCrees', 'tauxRejet', 'delaiValidationH', 'validesSous24h'];

const iso = (d) => d.toISOString().slice(0, 10);

/** Périodes prédéfinies (mois, trimestre, année civils ; 30 et 90 jours glissants). */
export function periodPreset(kind, ref = new Date()) {
  const y = ref.getUTCFullYear(), m = ref.getUTCMonth();
  const end = iso(ref);
  if (kind === 'mois') return { from: iso(new Date(Date.UTC(y, m, 1))), to: end, label: ref.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }) };
  if (kind === 'mois-precedent') { const s = new Date(Date.UTC(y, m - 1, 1)); return { from: iso(s), to: iso(new Date(Date.UTC(y, m, 0))), label: s.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }) }; }
  if (kind === 'trimestre') { const q = Math.floor(m / 3); return { from: iso(new Date(Date.UTC(y, q * 3, 1))), to: end, label: `T${q + 1} ${y}` }; }
  if (kind === 'annee') return { from: `${y}-01-01`, to: end, label: `Année ${y}` };
  const days = kind === '90j' ? 90 : 30;
  return { from: iso(new Date(ref.getTime() - (days - 1) * DAY_MS)), to: end, label: `${days} derniers jours` };
}

/** Période précédente de même durée, juste avant `period`. */
export function previousPeriod({ from, to }) {
  const len = Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1;
  const prevTo = new Date(Date.parse(from) - DAY_MS);
  return { from: iso(new Date(prevTo.getTime() - (len - 1) * DAY_MS)), to: iso(prevTo) };
}

function checkPeriod(period) {
  if (!isIsoDate(period?.from) || !isIsoDate(period?.to)) throw new Error('Choisissez une période complète (début et fin).');
  if (period.from > period.to) throw new Error('La date de fin doit suivre la date de début.');
}

/**
 * Indicateurs par antenne sur la période, comparés à la période précédente, avec classement.
 * Les antennes sans aucune activité sur la période sont classées après les antennes actives.
 */
export function antennaPerformance(period, { rankBy = 'dutValides' } = {}) {
  actor('pilotage.view');
  checkPeriod(period);
  const ind = indicator(RANKABLE.includes(rankBy) ? rankBy : 'dutValides');
  const ids = getAllAntennas().map((a) => a.id);
  const cur = compare('antennes', ids, TRACKED, period);
  const prevPeriod = previousPeriod(period);
  const prev = compare('antennes', ids, TRACKED, prevPeriod);
  const prevById = new Map(prev.rows.map((r) => [r.id, r.values]));
  const rows = cur.rows.map((r) => ({ ...r, actif: r.values.dutCrees > 0, previous: prevById.get(r.id) || {}, evolution: Object.fromEntries(TRACKED.map((k) => [k, Math.round(((r.values[k] || 0) - ((prevById.get(r.id) || {})[k] || 0)) * 10) / 10])) }));
  const dir = ind.better === 'low' ? 1 : -1;
  rows.sort((a, b) => Number(b.actif) - Number(a.actif) || (a.values[ind.key] - b.values[ind.key]) * dir || a.name.localeCompare(b.name, 'fr'));
  rows.forEach((r, i) => { r.rang = i + 1; });
  const stat = computeStatistics({ from: period.from, to: period.to });
  const national = Object.fromEntries(TRACKED.map((k) => [k, Number(indicator(k).get(stat)) || 0]));
  return { period, previousPeriod: prevPeriod, rankBy: ind.key, indicators: TRACKED.map(indicator), rows, best: cur.best, national, actives: rows.filter((r) => r.actif).length };
}

/** Rapport périodique : indicateurs par antenne, objectifs, actions en retard, points d'attention. */
export function periodicReport(period, { rankBy = 'dutValides', label = '' } = {}) {
  const user = actor('pilotage.report');
  const perf = antennaPerformance(period, { rankBy });
  return {
    title: 'Rapport périodique de suivi des antennes',
    label: label || `${period.from} au ${period.to}`,
    generatedAt: nowIso(), generatedBy: user.name,
    ...perf,
    objectifs: attainmentByAntenna(),
    actionsEnRetard: overdueActions(),
    pointsAttention: attentionPoints(),
  };
}

/** Lignes CSV du rapport (une par antenne), prêtes pour `toCsv`. */
export function reportRows(report) {
  const att = new Map(report.objectifs.map((o) => [o.antennaId, o]));
  return report.rows.map((r) => ({
    rang: r.rang, antenne: r.name, ville: r.sub || '',
    ...Object.fromEntries(report.indicators.map((i) => [`${i.label}${i.unit ? ` (${i.unit})` : ''}`, r.values[i.key]])),
    'Évolution DUT validés': r.evolution.dutValides,
    'Taux d’atteinte des objectifs (%)': att.get(r.id)?.taux ?? '',
  }));
}

export function reportCsv(report) {
  const rows = reportRows(report);
  const national = Object.fromEntries(Object.keys(rows[0] || { rang: '', antenne: '', ville: '' }).map((k) => [k, '']));
  Object.assign(national, { rang: 'National', antenne: 'Ensemble du réseau' }, Object.fromEntries(report.indicators.map((i) => [`${i.label}${i.unit ? ` (${i.unit})` : ''}`, report.national[i.key]])));
  const meta = [report.title, `Période : ${report.label} (du ${report.period.from} au ${report.period.to})`, `Édité le ${report.generatedAt.slice(0, 10)} par ${report.generatedBy}`]
    .map((line) => (/[;"\n]/.test(line) ? `"${line.replace(/"/g, '""')}"` : line));
  return `${meta.join('\n')}\n\n${toCsv([national, ...rows])}`;
}

/** Trace l'export d'un rapport (CSV ou PDF) dans le journal d'audit. */
export function logReportExport(report, format) {
  actor('pilotage.report');
  journal(AUDIT_ACTIONS.PILOT_REPORT_EXPORTED, { entity: 'RAPPORT', entityId: `rapport-${report.period.from}-${report.period.to}`, reference: report.label, newValue: format });
}

/** Points d'attention de la Direction, réutilisables par le futur tableau de bord. */
export function attentionPoints() {
  actor('pilotage.view');
  return {
    contratsAValider: contractsToValidate().length,
    actionsEnRetard: overdueActions().length,
    documentsAValider: documentsToValidate().length,
    decisionsEnRetard: overdueDecisions().length,
    contratsEcheance: expiringLegalContracts().length,
    contratsEnCircuit: legalContractsAwaiting().length,
    date: today(),
  };
}
