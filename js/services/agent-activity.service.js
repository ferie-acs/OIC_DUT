// Lot d1 : suivi de l'activité des agents d'un partenaire habilité (volume de DUT par agent et par
// période, anomalies simples). Données du seul partenaire de l'utilisateur connecté.
import { AUDIT_ACTIONS, DUT_STATUS, ROLES } from '../core/constants.js';
import { usersStore, dutsStore, auditStore } from '../repositories/actors.repository.js';
import { actorWith } from './d1-common.service.js';

export const PERIODS = { 7: '7 derniers jours', 30: '30 derniers jours', 90: '90 derniers jours', 365: '12 derniers mois' };
const DAY = 86400000;
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** Découpage de la période en colonnes : jours (7 j), semaines (30 j), mois (90 j et 12 mois). */
function buckets(days, now = new Date()) {
  const end = now.getTime();
  if (days === 7) return Array.from({ length: 7 }, (_, i) => { const s = new Date(end - (6 - i) * DAY); s.setHours(0, 0, 0, 0); return { label: `${String(s.getDate()).padStart(2, '0')}/${String(s.getMonth() + 1).padStart(2, '0')}`, from: s.getTime(), to: s.getTime() + DAY }; });
  if (days === 30) return Array.from({ length: 5 }, (_, i) => { const from = end - (30 - i * 6) * DAY; return { label: `Sem. ${i + 1}`, from, to: i === 4 ? end + 1 : from + 6 * DAY }; });
  const count = days === 90 ? 3 : 12;
  return Array.from({ length: count }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1); const next = new Date(d.getFullYear(), d.getMonth() + 1, 1); return { label: `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, from: d.getTime(), to: next.getTime() }; });
}

export function agentActivity({ days = 30 } = {}) {
  const actor = actorWith('company.activity');
  if (!actor.partnerId) throw new Error('Votre compte n’est rattaché à aucun partenaire.');
  const span = PERIODS[days] ? Number(days) : 30;
  const since = Date.now() - span * DAY;
  const agents = usersStore.getAll().filter((u) => u.partnerId === actor.partnerId && [ROLES.PARTNER_ADMIN, ROLES.PARTNER_EDITOR].includes(u.role));
  const duts = dutsStore.getAll().filter((d) => d.partnerId === actor.partnerId && !d.canary);
  const ids = new Set(duts.map((d) => d.id));
  const audit = auditStore.getAll().filter((e) => e.dutId && ids.has(e.dutId));
  // Auteur d'un DUT : le compte créateur ; pour l'historique de démonstration, l'entrée de journal de création.
  const creation = new Map(audit.filter((e) => e.action === AUDIT_ACTIONS.DUT_CREATED).map((e) => [e.dutId, e]));
  const authorOf = (d) => {
    const byId = agents.find((a) => a.id === d.createdBy);
    if (byId) return byId.id;
    const log = creation.get(d.id);
    const byLog = log && agents.find((a) => a.id === log.userId || (log.userId === 'SEED' && a.name === log.userLabel));
    return byLog ? byLog.id : 'AUTRE';
  };
  const actorOf = (e) => { const a = agents.find((x) => x.id === e.userId || (e.userId === 'SEED' && x.name === e.userLabel)); return a ? a.id : 'AUTRE'; };
  const cols = buckets(span);
  const inPeriod = duts.filter((d) => Date.parse(d.createdAt) >= since);
  const rows = [...agents.map((a) => ({ id: a.id, name: a.name, email: a.email, role: a.role, active: a.active !== false })), { id: 'AUTRE', name: 'Non attribué', email: 'Historique sans auteur identifié', role: null, active: true }]
    .map((agent) => {
      const mine = inPeriod.filter((d) => authorOf(d) === agent.id);
      const submissions = audit.filter((e) => [AUDIT_ACTIONS.DUT_SUBMITTED, AUDIT_ACTIONS.DUT_RESUBMITTED].includes(e.action) && Date.parse(e.date) >= since && actorOf(e) === agent.id).length;
      const rejected = mine.filter((d) => d.status === DUT_STATUS.REJETE || d.rejectedAt).length;
      const validated = mine.filter((d) => [DUT_STATUS.VALIDE, DUT_STATUS.SUSPENDU, DUT_STATUS.RETIRE].includes(d.status)).length;
      const sanctioned = mine.filter((d) => [DUT_STATUS.SUSPENDU, DUT_STATUS.RETIRE].includes(d.status)).length;
      const offHours = mine.filter((d) => { const h = new Date(d.createdAt).getHours(); return h < 6 || h >= 20; }).length;
      const perDay = new Map(); mine.forEach((d) => { const k = d.createdAt.slice(0, 10); perDay.set(k, (perDay.get(k) || 0) + 1); });
      const peak = Math.max(0, ...perDay.values());
      const staleDrafts = mine.filter((d) => d.status === DUT_STATUS.EN_EDITION && Date.now() - Date.parse(d.createdAt) > 7 * DAY).length;
      const anomalies = [];
      if (mine.length >= 3 && rejected / mine.length >= 0.3) anomalies.push(`Taux de rejet élevé (${Math.round((rejected / mine.length) * 100)} %)`);
      if (sanctioned) anomalies.push(`${sanctioned} DUT suspendu(s) ou retiré(s) par l’OIC`);
      if (offHours) anomalies.push(`${offHours} DUT créé(s) entre 20 h et 6 h`);
      if (peak > 8) anomalies.push(`Pic de ${peak} DUT le même jour`);
      if (staleDrafts >= 3) anomalies.push(`${staleDrafts} brouillons abandonnés depuis plus de 7 jours`);
      if (!agent.active && mine.length) anomalies.push('Activité enregistrée sur un compte aujourd’hui désactivé');
      return {
        ...agent, created: mine.length, submissions, rejected, validated,
        rejectionRate: mine.length ? Math.round((rejected / mine.length) * 100) : 0,
        series: cols.map((c) => mine.filter((d) => { const t = Date.parse(d.createdAt); return t >= c.from && t < c.to; }).length),
        lastActivity: [...mine].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0]?.createdAt || null,
        anomalies,
      };
    }).filter((r) => r.id !== 'AUTRE' || r.created > 0);
  return {
    period: span, periodLabel: PERIODS[span], columns: cols.map((c) => c.label), rows,
    totals: { created: rows.reduce((n, r) => n + r.created, 0), rejected: rows.reduce((n, r) => n + r.rejected, 0), validated: rows.reduce((n, r) => n + r.validated, 0), anomalies: rows.reduce((n, r) => n + r.anomalies.length, 0), agents: agents.length },
  };
}
