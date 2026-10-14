// Graphiques du tableau de bord de la Direction générale : chaque indicateur de la synthèse nationale
// reçoit sa série (évolution mensuelle, répartition ou comparaison par antenne). La période choisie à l'écran
// pilote tout : les comparaisons et répartitions portent sur la période, les évolutions couvrent la période
// et au moins les six derniers mois. La vue n'effectue aucun calcul : elle affiche ce qui est assemblé ici.
import { getCurrentUser } from '../core/auth.js';
import { can } from '../core/permissions.js';
import { getAllDuts } from '../repositories/dut.repository.js';
import * as incidentsRepo from '../repositories/incidents.repository.js';
import * as equipmentRepo from '../repositories/equipment.repository.js';
import { computeStatistics } from './statistics.service.js';
import { indicator } from './comparison.service.js';
import { directionSynthesis } from './synthesis.service.js';
import { listActions, ACTION_STATUS_LABELS } from './objectives.service.js';
import { salesReport } from './payments.service.js';
import { stockByState } from './ranges.service.js';
import { INCIDENT_SEVERITIES, INCIDENT_STATUS } from './incidents.service.js';
import { EQUIPMENT_STATUS } from './equipment.service.js';

export const TREND_MIN_MONTHS = 6;
const round1 = (x) => Math.round(x * 10) / 10;
const dayOf = (iso) => String(iso || '').slice(0, 10);

/**
 * Mois couverts par les courbes d'évolution : du mois de début de la période (ou plus tôt, pour avoir au moins
 * `min` mois) jusqu'au mois de fin. Le dernier mois s'arrête à la fin de la période. Fonction pure.
 */
export function trendMonths(p, min = TREND_MIN_MONTHS) {
  const end = new Date(`${p.to.slice(0, 7)}-01T00:00:00Z`);
  const fromPeriod = new Date(`${p.from.slice(0, 7)}-01T00:00:00Z`);
  const fromMin = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - (min - 1), 1));
  const d = fromPeriod < fromMin ? fromPeriod : fromMin;
  const out = [];
  while (d <= end && out.length < 36) {
    const y = d.getUTCFullYear(), m = d.getUTCMonth();
    const last = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
    out.push({
      key: d.toISOString().slice(0, 7),
      label: d.toLocaleDateString('fr-FR', { month: 'short', timeZone: 'UTC' }),
      title: d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      from: d.toISOString().slice(0, 10),
      to: last < p.to ? last : p.to,
    });
    d.setUTCMonth(m + 1);
  }
  return out;
}

/** Période en toutes lettres, à placer après « sur » : « les 30 derniers jours », « l’année 2026 »… Fonction pure. */
export function periodPhrase(p) {
  if (p.kind === '30j' || p.kind === '90j') return `les ${p.label}`;
  if (p.kind === 'trimestre') return `le trimestre ${p.label}`;
  if (p.kind === 'annee') return `l’année ${p.label.replace(/^Année\s*/, '')}`;
  return p.label;
}

/** Premier mois à tracer : le premier mois actif, en gardant au moins `min` mois. Fonction pure. */
export function firstActiveMonth(activity, min = TREND_MIN_MONTHS) {
  const i = activity.findIndex((x) => x > 0);
  return Math.max(0, Math.min(i < 0 ? 0 : i, activity.length - min));
}

const trimLeading = (series, first) => Object.fromEntries(Object.entries(series).map(([k, v]) => [k, v ? v.slice(first) : v]));

/** Somme mensuelle (1 par élément par défaut) des éléments datés, sur les mois fournis. Fonction pure. */
export function countByMonth(items, dateOf, months, valueOf = () => 1) {
  return months.map((m) => items.reduce((n, x) => { const d = dayOf(dateOf(x)); return d && d >= m.from && d <= m.to ? n + (Number(valueOf(x)) || 0) : n; }, 0));
}

/** Nombre d'antennes distinctes ayant édité au moins un DUT dans chaque mois. Fonction pure. */
export function activeAntennasByMonth(duts, months) {
  return months.map((m) => new Set(duts.filter((d) => !d.canary && d.antennaId && dayOf(d.createdAt) >= m.from && dayOf(d.createdAt) <= m.to).map((d) => d.antennaId)).size);
}

/** Répartition : parts avec leur pourcentage du total (arrondi au dixième). Fonction pure. */
export function composition(parts) {
  const total = parts.reduce((n, x) => n + (Number(x.value) || 0), 0);
  return { total, parts: parts.map((x) => ({ ...x, value: Number(x.value) || 0, share: total ? round1(((Number(x.value) || 0) / total) * 100) : 0 })) };
}

/** Incidents déclarés sur la période, croisés par état (abscisses) et par gravité (séries). Fonction pure. */
export function incidentsByStateAndSeverity(incidents, p) {
  const list = incidents.filter((i) => dayOf(i.declaredAt) >= p.from && dayOf(i.declaredAt) <= p.to);
  const states = Object.keys(INCIDENT_STATUS);
  return {
    total: list.length,
    etats: states.map((k) => INCIDENT_STATUS[k]),
    etatsCourts: states.map((k) => (k === 'RESOLU' ? 'À vérifier' : INCIDENT_STATUS[k])),
    series: Object.entries(INCIDENT_SEVERITIES).map(([key, s]) => ({ key, label: s.label, values: states.map((st) => list.filter((i) => i.status === st && i.severity === key).length) })),
  };
}

/** Actions correctives par état, en distinguant celles dont l'échéance est dépassée. Fonction pure. */
export function actionsByState(actions) {
  return Object.keys(ACTION_STATUS_LABELS).map((key) => {
    const mine = actions.filter((a) => a.status === key);
    const late = mine.filter((a) => a.late).length;
    return { key, label: ACTION_STATUS_LABELS[key], enRetard: late, dansLesDelais: mine.length - late, total: mine.length };
  });
}

/** Parc d'équipements par état (situation du jour). Fonction pure. */
export function equipmentByState(items) {
  return Object.entries(EQUIPMENT_STATUS).map(([key, label]) => ({ key, label, value: items.filter((e) => e.status === key).length }));
}

/** Toutes les données du tableau de bord : la synthèse nationale et les séries de ses graphiques. */
export function directionCharts({ periodKind = '30j' } = {}) {
  const s = directionSynthesis({ periodKind }); // contrôle le droit « pilotage.view »
  const user = getCurrentUser();
  const p = s.period;
  const mois = trendMonths(p);
  const stats = mois.map((m) => computeStatistics({ from: m.from, to: m.to }));
  const ind = (key) => stats.map((st) => Number(indicator(key).get(st)) || 0);
  const delays = stats.map((st) => st.documentaire.delais.soumissionValidationH.mediane);
  const incidents = incidentsRepo.getAll();
  const equipment = equipmentRepo.getAll();
  const failures = equipment.flatMap((e) => e.failures || []);
  const sales = can(user, 'sales.report') ? mois.map((m) => salesReport({ from: m.from, to: m.to }).total) : null;
  const actions = listActions();
  const open = (a) => !['REALISEE', 'ABANDONNEE'].includes(a.status);
  const att = s.objectifs.parAntenne;
  const objCounts = att.reduce((t, a) => ({ objectifs: t.objectifs + a.objectifs, atteints: t.atteints + a.atteints, nonAtteints: t.nonAtteints + a.nonAtteints, sansResultat: t.sansResultat + a.sansResultat }), { objectifs: 0, atteints: 0, nonAtteints: 0, sansResultat: 0 });
  const rec = s.rapprochement;
  const g = s.groupements;
  const v = s.validations;
  // Les mois antérieurs à toute activité enregistrée (plateforme pas encore en service) ne sont pas tracés.
  const activity = mois.map((_, i) => stats[i].documentaire.entonnoir.crees + stats[i].controle.total + (sales ? sales[i].ventes : 0));
  const first = firstActiveMonth(activity);
  const byValue = (key, dir = -1) => (a, b) => ((a[key] ?? -Infinity) - (b[key] ?? -Infinity)) * dir || a.name.localeCompare(b.name, 'fr');

  return {
    synthese: s,
    periode: periodPhrase(p),
    mois: mois.map(({ key, label, title }) => ({ key, label, title })).slice(first),
    tendances: trimLeading({
      dutCrees: ind('dutCrees'),
      dutValides: ind('dutValides'),
      dutRejetes: ind('dutRejetes'),
      tauxRejet: ind('tauxRejet'),
      delaiValidationH: delays.map((x) => (x == null ? null : round1(x))),
      scans: ind('scans'),
      antennesActives: activeAntennasByMonth(getAllDuts(), mois),
      incidentsDeclares: countByMonth(incidents, (i) => i.declaredAt, mois),
      incidentsClos: countByMonth(incidents, (i) => i.closedAt, mois),
      pannes: countByMonth(failures, (f) => f.declaredAt, mois),
      ventesTTC: sales ? sales.map((t) => t.ttc) : null,
      encaisseValide: sales ? sales.map((t) => t.encaisseValide) : null,
    }, first),
    antennes: {
      dutValides: [...s.antennes].filter((a) => a.dutCrees > 0 || a.dutValides > 0).sort(byValue('dutValides')).map((a) => ({ name: a.name, value: a.dutValides })),
      tauxRejet: [...s.antennes].filter((a) => a.dutCrees > 0).sort(byValue('tauxRejet')).map((a) => ({ name: a.name, value: a.tauxRejet })),
      delaiValidationH: [...s.antennes].filter((a) => a.delaiValidationH != null).sort(byValue('delaiValidationH')).map((a) => ({ name: a.name, value: a.delaiValidationH })),
      objectifs: att.filter((a) => a.taux != null).map((a) => ({ name: a.antennaName, value: Math.min(100, a.taux) })).sort(byValue('value')),
      cibleObjectifs: 100,
    },
    objectifs: composition([
      { key: 'ATTEINT', label: 'Atteints', value: objCounts.atteints, tone: 'success' },
      { key: 'PROCHE', label: 'Proches de la cible', value: Math.max(0, objCounts.objectifs - objCounts.atteints - objCounts.nonAtteints - objCounts.sansResultat), tone: 'warning' },
      { key: 'NON_ATTEINT', label: 'Non atteints', value: objCounts.nonAtteints, tone: 'error' },
      { key: 'SANS_RESULTAT', label: 'Sans résultat', value: objCounts.sansResultat, tone: 'muted' },
    ]),
    actions: {
      parEtat: actionsByState(actions),
      repartition: composition([
        { key: 'RETARD', label: 'En retard', value: actions.filter((a) => open(a) && a.late).length, tone: 'error' },
        { key: 'EN_COURS', label: 'En cours', value: actions.filter((a) => a.status === 'EN_COURS' && !a.late).length, tone: 'blue' },
        { key: 'A_LANCER', label: 'À lancer', value: actions.filter((a) => a.status === 'A_LANCER' && !a.late).length, tone: 'light' },
        { key: 'REALISEE', label: 'Réalisées', value: actions.filter((a) => a.status === 'REALISEE').length, tone: 'success' },
      ]),
    },
    incidents: incidentsByStateAndSeverity(incidents, p),
    equipements: equipmentByState(equipment),
    rapprochement: rec ? {
      partenaires: rec.rows.filter((r) => r.ecarts > 0).map((r) => ({ name: r.name, bloquants: r.bloquants, aExaminer: r.ecartsOuverts - r.bloquants, justifies: r.ecarts - r.ecartsOuverts })),
      repartition: composition([
        { key: 'BLOQUANT', label: 'Bloquants', value: rec.rows.reduce((n, r) => n + r.bloquants, 0), tone: 'error' },
        { key: 'A_EXAMINER', label: 'À examiner', value: rec.rows.reduce((n, r) => n + r.ecartsOuverts - r.bloquants, 0), tone: 'warning' },
        { key: 'JUSTIFIE', label: 'Justifiés', value: rec.rows.reduce((n, r) => n + r.ecarts - r.ecartsOuverts, 0), tone: 'success' },
      ]),
    } : null,
    groupements: {
      categories: ['Partenaires habilités', 'Transporteurs'],
      categoriesCourtes: ['Partenaires', 'Transporteurs'],
      series: [
        { key: 'ACTIF', label: 'Actifs', values: [g.partenaires.actifs, g.transporteurs.actifs], tone: 'success' },
        { key: 'EN_ATTENTE', label: 'En attente', values: [g.partenaires.enAttente, g.transporteurs.enAttente], tone: 'warning' },
        { key: 'SUSPENDU', label: 'Suspendus', values: [g.partenaires.suspendus, g.transporteurs.suspendus], tone: 'error' },
        { key: 'RESILIE', label: 'Résiliés', values: [g.partenaires.resilies, g.transporteurs.resilies], tone: 'muted' },
      ],
    },
    stock: s.ventes ? [
      { key: 'DISPONIBLE', label: 'Disponibles', value: s.ventes.stock.disponible, tone: 'blue' },
      { key: 'ATTENTE', label: 'En attente de validation', short: 'En attente', value: s.ventes.stock.attente, tone: 'warning' },
      { key: 'UTILISE', label: 'Utilisés', value: s.ventes.stock.utilise, tone: 'success' },
      { key: 'RETIRE', label: 'Retirés', value: s.ventes.stock.retire, tone: 'muted' },
    ] : null,
    // `short` : libellé court pour l'axe ; le libellé complet figure dans l'info-bulle.
    validations: [
      { label: 'Contrats d’objectifs à valider', short: 'Objectifs', value: v.contratsObjectifs, href: '/direction/objectifs' },
      { label: 'Documents à valider', short: 'Documents', value: v.documents, href: '/direction/documents' },
      { label: 'Contrats et conventions à valider', short: 'Contrats', value: v.contratsJuridiques, href: '/direction/contrats' },
      { label: 'Contrats en circuit de validation', short: 'En circuit', value: v.contratsEnCircuit, href: '/direction/contrats' },
      { label: 'Contrats à échéance sous 60 jours', short: 'Échéances', value: v.contratsEcheance, href: '/direction/contrats' },
      { label: 'Décisions de réunion en retard', short: 'Décisions', value: v.decisionsEnRetard, href: '/direction/reunions' },
      { label: 'Inscriptions de transporteurs à examiner', short: 'Inscriptions', value: g.transporteurs.inscriptions, href: null },
    ],
  };
}
