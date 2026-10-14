// Lot d2 : rapprochement, pour un partenaire et une période, des numéros achetés, des DUT édités,
// des préimprimés consommés (impressions enregistrées) et des paiements ; écarts mis en évidence et justifiables.
import { getCurrentUser } from '../core/auth.js';
import { can } from '../core/permissions.js';
import { AUDIT_ACTIONS } from '../core/constants.js';
import { uuid, nowIso } from '../core/utils.js';
import { getAllOperations } from '../repositories/operations.repository.js';
import { getAllDuts } from '../repositories/dut.repository.js';
import { findPartnerById, getAllPartners } from '../repositories/partners.repository.js';
import { getAllPayments, getReconciliationNotes, saveReconciliationNotes, getPrintJournal } from '../repositories/payments.repository.js';
import { numberLabel, OPERATION_STATUS_LABELS } from './ranges.service.js';
import { amountsFor, pricing } from './range-pricing.service.js';
import * as auditService from './audit.service.js';

const day = (iso) => String(iso || '').slice(0, 10);
const inPeriod = (iso, from, to) => !!iso && (!from || day(iso) >= from) && (!to || day(iso) <= to);
const parseNumber = (n) => { const m = String(n || '').match(/^DUT-CI-(\d{4})-(\d+)$/); return m ? { year: Number(m[1]), n: Number(m[2]) } : null; };
const hash = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return (h >>> 0).toString(36); };

function scope(partnerId) {
  const user = getCurrentUser();
  if (!user) throw new Error('Session expirée : reconnectez-vous.');
  if (!can(user, 'reconciliation.view')) throw new Error('Rapprochement non autorisé pour votre rôle.');
  if (user.role === 'PARTNER_ADMIN' && partnerId && partnerId !== user.partnerId) throw new Error('Ce partenaire ne fait pas partie de votre périmètre.');
  return { user, partnerId: user.role === 'PARTNER_ADMIN' ? user.partnerId : partnerId };
}

export function partnerOptions() {
  const user = getCurrentUser();
  if (!can(user, 'reconciliation.view')) return [];
  return getAllPartners().filter((p) => user.role !== 'PARTNER_ADMIN' || p.id === user.partnerId).map((p) => ({ id: p.id, name: p.name }));
}

export function reconcile({ partnerId = '', from = '', to = '' } = {}) {
  const ctx = scope(partnerId);
  const partner = findPartnerById(ctx.partnerId);
  if (!partner) throw new Error('Choisissez un partenaire.');
  const ops = getAllOperations().filter((o) => o.partnerId === partner.id && ['VALIDATED', 'REVOKED', 'TRANSFER_PENDING'].includes(o.status) && o.rangeStart != null);
  const duts = getAllDuts().filter((d) => d.partnerId === partner.id && d.dutNumber && !d.canary);
  const payments = getAllPayments().filter((p) => p.partnerId === partner.id && p.status !== 'ANNULE');
  const prints = getPrintJournal().filter((p) => duts.some((d) => d.id === p.dutId));
  const notes = getReconciliationNotes().filter((n) => n.partnerId === partner.id);
  const opOf = (d) => { const x = parseNumber(d.dutNumber); return x ? ops.find((o) => Number(o.year) === x.year && o.rangeStart <= x.n && x.n <= o.rangeEnd) : null; };
  const acquiredAt = (o) => o.validatedAt || o.requestedAt;

  // Lignes par plage (toutes les plages détenues, quelle que soit la période).
  const plages = ops.map((o) => {
    const mine = duts.filter((d) => opOf(d)?.id === o.id);
    const pay = payments.find((p) => p.operationId === o.id) || null;
    const amounts = pay ? { ttc: pay.ttc } : (o.amounts || amountsFor(o.quantity, { ...pricing(), unitHT: Number(o.tarifUnitaire) || 0 }));
    return {
      id: o.id, code: o.code, statut: OPERATION_STATUS_LABELS[o.status] || o.status, status: o.status, acquiredAt: acquiredAt(o),
      plage: `${numberLabel(o.year, o.rangeStart)} à ${numberLabel(o.year, o.rangeEnd)}`, antenne: o.antennaName || 'Siège OIC',
      achetes: o.quantity, utilises: o.used || 0, dutRetrouves: mine.length, impressions: prints.filter((p) => mine.some((d) => d.id === p.dutId)).length,
      du: amounts.ttc, paiement: pay?.status || 'SANS_CREANCE', regle: pay?.status === 'VALIDE' ? pay.ttc : 0,
    };
  }).sort((a, b) => String(b.acquiredAt).localeCompare(String(a.acquiredAt)));

  // Totaux de la période.
  const periodOps = ops.filter((o) => inPeriod(acquiredAt(o), from, to));
  const periodDuts = duts.filter((d) => inPeriod(d.validatedAt || d.createdAt, from, to));
  const periodPrints = prints.filter((p) => inPeriod(p.at, from, to));
  const periodPays = payments.filter((p) => inPeriod(p.createdAt, from, to) || inPeriod(p.validatedAt, from, to));
  const plageRow = (o) => plages.find((r) => r.id === o.id);
  const totals = {
    achetes: periodOps.reduce((n, o) => n + o.quantity, 0), plages: periodOps.length,
    dutEdites: periodDuts.length, preimprimes: periodPrints.length, dutImprimes: new Set(periodPrints.map((p) => p.dutId)).size,
    du: periodOps.reduce((n, o) => n + (plageRow(o)?.du || 0), 0),
    encaisse: periodPays.filter((p) => ['ENCAISSE', 'VALIDE'].includes(p.status)).reduce((n, p) => n + p.ttc, 0),
    valide: periodPays.filter((p) => p.status === 'VALIDE').reduce((n, p) => n + p.ttc, 0),
  };

  // Écarts.
  const ecarts = [];
  const add = (code, niveau, label, detail, ids) => {
    const key = `${partner.id}:${code}:${hash(ids.join(','))}`;
    const note = notes.find((n) => n.key === key);
    ecarts.push({ key, code, niveau, label, detail, justification: note || null });
  };
  periodOps.forEach((o) => {
    const r = plageRow(o);
    if (r.paiement === 'A_ENCAISSER' || r.paiement === 'SANS_CREANCE') add('IMPAYE', 'error', `Plage ${o.code} non réglée`, `${r.du.toLocaleString('fr-FR')} F TTC attendus pour ${o.quantity} numéro(s).`, [o.id]);
    if (r.paiement === 'ENCAISSE') add('A_VALIDER', 'warning', `Paiement de la plage ${o.code} à valider`, 'Encaissement saisi, en attente de validation par la caisse.', [o.id]);
  });
  plages.filter((r) => r.utilises !== r.dutRetrouves && r.status !== 'TRANSFER_PENDING').forEach((r) => {
    add('COMPTEUR', 'warning', `Plage ${r.code} : ${r.utilises} numéro(s) consommé(s), ${r.dutRetrouves} DUT retrouvé(s)`, r.utilises > r.dutRetrouves ? 'Des numéros ont été consommés sans DUT enregistré dans cette plage (historique antérieur, saisie hors plateforme…).' : 'Plus de DUT que de numéros comptés sur cette plage.', [r.id, r.utilises, r.dutRetrouves]);
  });
  const outside = periodDuts.filter((d) => !opOf(d));
  if (outside.length) add('HORS_PLAGE', 'error', `${outside.length} DUT édité(s) avec un numéro hors des plages du partenaire`, outside.slice(0, 8).map((d) => d.dutNumber).join(', ') + (outside.length > 8 ? '…' : ''), outside.map((d) => d.id));
  const feesCovered = new Set(payments.filter((p) => p.kind === 'FRAIS_DUT' && p.status === 'VALIDE').flatMap((p) => p.dutIds || []));
  const uncovered = periodDuts.filter((d) => { const o = opOf(d); const pay = o && payments.find((p) => p.operationId === o.id); return o && pay?.status !== 'VALIDE' && !feesCovered.has(d.id); });
  if (uncovered.length) add('NON_COUVERT', 'warning', `${uncovered.length} DUT édité(s) sur des numéros non encore réglés`, 'Ni la plage ni des frais DUT à l’unité n’ont été validés en caisse pour ces documents.', uncovered.map((d) => d.id));
  const reprints = periodPrints.length - totals.dutImprimes;
  if (reprints > 0) add('REIMPRESSION', 'warning', `${reprints} préimprimé(s) consommé(s) par des réimpressions`, `${periodPrints.length} impressions pour ${totals.dutImprimes} DUT imprimé(s) sur la période.`, periodPrints.map((p) => p.id));
  payments.filter((p) => p.kind === 'PLAGE' && p.status === 'VALIDE' && !ops.some((o) => o.id === p.operationId)).forEach((p) => add('PAIEMENT_ORPHELIN', 'error', `Paiement ${p.ref} sans plage active`, `${p.ttc.toLocaleString('fr-FR')} F validés pour une plage refusée ou annulée.`, [p.id]));

  return {
    partner: { id: partner.id, name: partner.name }, period: { from, to }, totals, plages, ecarts,
    paiements: periodPays.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
    duts: periodDuts.map((d) => ({ id: d.id, dutNumber: d.dutNumber, validatedAt: d.validatedAt, status: d.status, plage: opOf(d)?.code || '', impressions: prints.filter((p) => p.dutId === d.id).length, couvert: !!opOf(d) && (payments.find((p) => p.operationId === opOf(d).id)?.status === 'VALIDE' || feesCovered.has(d.id)) }))
      .sort((a, b) => String(b.validatedAt).localeCompare(String(a.validatedAt))),
  };
}

/** Justification d'un écart (motif conservé et journalisé). */
export function justify(partnerId, key, text) {
  const { user, partnerId: pid } = scope(partnerId);
  if (!can(user, 'reconciliation.justify')) throw new Error('Votre rôle permet de consulter le rapprochement, pas de justifier un écart.');
  const motive = String(text || '').trim().slice(0, 500);
  if (motive.length < 5) throw new Error('Expliquez l’écart en quelques mots (5 caractères minimum).');
  if (!String(key).startsWith(`${pid}:`)) throw new Error('Cet écart ne concerne pas ce partenaire.');
  const notes = getReconciliationNotes().filter((n) => n.key !== key);
  const note = { id: uuid(), key, partnerId: pid, text: motive, by: user.name, role: user.role, at: nowIso() };
  saveReconciliationNotes([...notes, note]);
  auditService.log(AUDIT_ACTIONS.RECONCILIATION_JUSTIFIED, { newValue: key.split(':')[1], note: `${findPartnerById(pid)?.name || ''} · ${motive}` });
  return note;
}
