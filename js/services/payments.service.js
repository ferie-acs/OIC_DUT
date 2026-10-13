// Lot d2 : caisse et comptabilité OIC — créances, encaissements (guichet ou paiement simulé),
// validation par une autre personne que la saisie, et rapport des ventes de références.
import { getCurrentUser } from '../core/auth.js';
import { can } from '../core/permissions.js';
import { AUDIT_ACTIONS } from '../core/constants.js';
import { uuid, nowIso } from '../core/utils.js';
import { getAllPayments, savePayments } from '../repositories/payments.repository.js';
import { getAllOperations } from '../repositories/operations.repository.js';
import { findPartnerById, getAllPartners } from '../repositories/partners.repository.js';
import { getAllDuts } from '../repositories/dut.repository.js';
import { getAllAntennas } from '../repositories/antennas.repository.js';
import { transportersRepo } from '../repositories/referentials.repository.js';
import { amountsFor, pricing } from './range-pricing.service.js';
import * as auditService from './audit.service.js';

export const PAYMENT_STATUS_LABELS = { A_ENCAISSER: 'À encaisser', ENCAISSE: 'Encaissé, à valider', VALIDE: 'Validé', ANNULE: 'Annulé' };
export const PAYMENT_METHODS = { GUICHET: 'Guichet (reçu papier)', MOBILE_MONEY: 'Mobile money (paiement simulé)', CARTE: 'Carte bancaire (paiement simulé)' };
export const PAYMENT_KINDS = { PLAGE: 'Achat de plage', FRAIS_DUT: 'Frais DUT à l’unité' };
export const DIRECT_SALE_LABEL = 'Attribution directe (siège OIC)';
const SIMULATED = ['MOBILE_MONEY', 'CARTE'];

const who = (u) => ({ id: u.id, name: u.name, role: u.role });
/** Client d'un paiement : partenaire habilité ou transporteur (identifiants distincts, un seul filtre suffit). */
export const clientIdOf = (p) => p.partnerId || p.transporterId || '';
export const CLIENT_TYPE_LABELS = { PARTENAIRE: 'Partenaire', TRANSPORTEUR: 'Transporteur' };
const ref = (prefix) => `${prefix}-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 90000) + 10000)}`;
const inPeriod = (iso, from, to) => {
  if (!iso) return false;
  const day = String(iso).slice(0, 10);
  return (!from || day >= from) && (!to || day <= to);
};

function current() {
  const user = getCurrentUser();
  if (!user) throw new Error('Session expirée : reconnectez-vous.');
  return user;
}

/** Périmètre de lecture : la caisse et l'OIC voient tout ; l'antenne ses ventes ; le partenaire ses dettes. */
function visibleTo(user, p) {
  if (can(user, 'payments.view')) return true;
  if (user.role === 'ANTENNA_AGENT') return p.antennaId === user.antennaId;
  if (user.role === 'PARTNER_ADMIN') return p.partnerId === user.partnerId;
  return false;
}

function mutate(id, fn) {
  const list = getAllPayments();
  const p = list.find((x) => x.id === id);
  if (!p) throw new Error('Paiement introuvable.');
  fn(p);
  savePayments(list);
  return p;
}

// ------------------------------------------------------------- Créances (appelées par les services de plages)

/** Crée la créance d'une plage vendue ou attribuée. `collected` : encaissement immédiat au guichet. */
export function createForOperation(op, { collected = null, by = null } = {}) {
  const partner = op.partnerId ? findPartnerById(op.partnerId) : null;
  const transporter = op.transporterId ? transportersRepo.findById(op.transporterId) : null;
  const amounts = op.amounts || amountsFor(op.quantity, { ...pricing(), unitHT: Number(op.tarifUnitaire) || pricing().unitHT });
  const payment = {
    id: uuid(), ref: ref('PAY'), kind: 'PLAGE', operationId: op.id, operationCode: op.code,
    clientType: op.transporterId ? 'TRANSPORTEUR' : 'PARTENAIRE', partnerId: op.partnerId || null, transporterId: op.transporterId || null,
    // partnerName porte le nom du client (partenaire ou transporteur), comme sur les opérations de plage.
    partnerName: op.transporterName || op.partnerName || transporter?.name || partner?.name || '',
    antennaId: op.antennaId || null, antennaName: op.antennaName || DIRECT_SALE_LABEL,
    ...amounts, status: 'A_ENCAISSER', createdAt: nowIso(), history: [{ at: nowIso(), by: by?.name || 'Système', text: 'Créance créée' }],
  };
  if (collected && by) {
    Object.assign(payment, { status: 'ENCAISSE', method: collected.method, receiptNo: collected.receiptNo || '', recordedAt: nowIso(), recordedBy: who(by) });
    payment.history.push({ at: nowIso(), by: by.name, text: `Encaissé (${PAYMENT_METHODS[collected.method]})${collected.receiptNo ? ` · reçu ${collected.receiptNo}` : ''}` });
  }
  savePayments([...getAllPayments(), payment]);
  return payment;
}

/** Vente refusée : la créance non validée est annulée. */
export function cancelForOperation(operationId, reason) {
  const list = getAllPayments();
  list.filter((p) => p.operationId === operationId && ['A_ENCAISSER', 'ENCAISSE'].includes(p.status)).forEach((p) => {
    p.status = 'ANNULE'; p.cancelledAt = nowIso(); p.cancelReason = reason;
    p.history = [...(p.history || []), { at: nowIso(), by: getCurrentUser()?.name || 'Système', text: `Annulé : ${reason}` }];
  });
  savePayments(list);
}

/** Plage reprise : une créance encore à encaisser est ramenée aux seuls numéros utilisés. */
export function adjustForRevocation(op) {
  const list = getAllPayments();
  list.filter((p) => p.operationId === op.id && p.status === 'A_ENCAISSER').forEach((p) => {
    if (!op.used) { p.status = 'ANNULE'; p.cancelledAt = nowIso(); p.cancelReason = 'Plage reprise sans numéro utilisé'; }
    else Object.assign(p, amountsFor(op.used, { unitHT: p.unitHT, tvaRate: p.tvaRate, stamp: p.stamp }));
    p.history = [...(p.history || []), { at: nowIso(), by: getCurrentUser()?.name || 'Système', text: op.used ? `Montant ramené à ${op.used} numéro(s) utilisé(s) après reprise` : 'Annulé : plage reprise sans numéro utilisé' }];
  });
  savePayments(list);
}

// ------------------------------------------------------------- Consultation

export function listPayments({ status = '', kind = '', clientId = '', partnerId = '', antennaId = '', from = '', to = '' } = {}) {
  const client = clientId || partnerId;
  const user = current();
  if (!['payments.view', 'payments.record', 'payments.pay'].some((p) => can(user, p))) throw new Error('Consultation des paiements non autorisée.');
  return getAllPayments()
    .filter((p) => visibleTo(user, p))
    .filter((p) => (!status || p.status === status) && (!kind || p.kind === kind) && (!client || clientIdOf(p) === client) && (!antennaId || p.antennaId === antennaId))
    .filter((p) => (!from && !to) || inPeriod(p.createdAt, from, to))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function paymentForOperation(operationId) {
  const user = current();
  return getAllPayments().filter((p) => p.operationId === operationId && p.status !== 'ANNULE' && visibleTo(user, p))[0] || null;
}

export function summarize(list) {
  const sum = (st, k = 'ttc') => list.filter((p) => !st || st.includes(p.status)).reduce((n, p) => n + (Number(p[k]) || 0), 0);
  return {
    aEncaisser: { count: list.filter((p) => p.status === 'A_ENCAISSER').length, amount: sum(['A_ENCAISSER']) },
    aValider: { count: list.filter((p) => p.status === 'ENCAISSE').length, amount: sum(['ENCAISSE']) },
    valides: { count: list.filter((p) => p.status === 'VALIDE').length, amount: sum(['VALIDE']) },
  };
}

// ------------------------------------------------------------- Encaissement et validation

export function recordPayment(id, { method, receiptNo = '' } = {}) {
  const user = current();
  if (!can(user, 'payments.record') && !can(user, 'payments.pay')) throw new Error('Encaissement non autorisé pour votre rôle.');
  if (!PAYMENT_METHODS[method]) throw new Error('Choisissez un mode de paiement.');
  const receipt = String(receiptNo || '').trim();
  return mutate(id, (p) => {
    if (!visibleTo(user, p)) throw new Error('Ce paiement ne fait pas partie de votre périmètre.');
    if (p.status !== 'A_ENCAISSER') throw new Error('Ce paiement n’est plus à encaisser.');
    if (user.role === 'PARTNER_ADMIN' && !SIMULATED.includes(method)) throw new Error('En ligne, seuls le mobile money et la carte (simulés) sont proposés.');
    if (method === 'GUICHET' && (receipt.length < 3 || receipt.length > 40)) throw new Error('Le numéro du reçu de caisse est obligatoire (3 à 40 caractères).');
    Object.assign(p, {
      status: 'ENCAISSE', method, receiptNo: receipt, recordedAt: nowIso(), recordedBy: who(user),
      transactionRef: SIMULATED.includes(method) ? `SIM-${uuid().slice(0, 8).toUpperCase()}` : null,
    });
    p.history = [...(p.history || []), { at: nowIso(), by: user.name, text: `Encaissé (${PAYMENT_METHODS[method]})${receipt ? ` · reçu ${receipt}` : ''}` }];
    auditService.log(AUDIT_ACTIONS.PAYMENT_RECORDED, { newValue: p.ref, note: `${p.ref} · ${p.partnerName} · ${p.ttc} F · ${PAYMENT_METHODS[method]}` });
  });
}

export function validatePayment(id) {
  const user = current();
  if (!can(user, 'payments.validate')) throw new Error('Validation réservée à la caisse ou à l’administration OIC.');
  return mutate(id, (p) => {
    if (p.status !== 'ENCAISSE') throw new Error('Seul un encaissement saisi peut être validé.');
    if (p.recordedBy?.id === user.id) throw new Error('La validation doit être faite par une autre personne que celle qui a saisi l’encaissement.');
    Object.assign(p, { status: 'VALIDE', validatedAt: nowIso(), validatedBy: who(user) });
    p.history = [...(p.history || []), { at: nowIso(), by: user.name, text: 'Paiement validé' }];
    auditService.log(AUDIT_ACTIONS.PAYMENT_VALIDATED, { newValue: p.ref, note: `${p.ref} · ${p.partnerName} · ${p.ttc} F (saisi par ${p.recordedBy?.name || '—'})` });
  });
}

export function rejectPayment(id, reason) {
  const user = current();
  if (!can(user, 'payments.validate')) throw new Error('Rejet réservé à la caisse ou à l’administration OIC.');
  const motive = String(reason || '').trim();
  if (!motive) throw new Error('Le motif du rejet est obligatoire.');
  return mutate(id, (p) => {
    if (p.status !== 'ENCAISSE') throw new Error('Seul un encaissement saisi peut être rejeté.');
    if (p.recordedBy?.id === user.id) throw new Error('Le contrôle doit être fait par une autre personne que celle qui a saisi l’encaissement.');
    p.history = [...(p.history || []), { at: nowIso(), by: user.name, text: `Encaissement rejeté : ${motive} (saisi par ${p.recordedBy?.name || '—'})` }];
    p.rejections = [...(p.rejections || []), { at: nowIso(), by: user.name, reason: motive, receiptNo: p.receiptNo, method: p.method }];
    Object.assign(p, { status: 'A_ENCAISSER', method: null, receiptNo: '', transactionRef: null, recordedAt: null, recordedBy: null });
    auditService.log(AUDIT_ACTIONS.PAYMENT_REJECTED, { newValue: p.ref, note: `${p.ref} · ${motive}` });
  });
}

/** DUT numérotés d'un partenaire dont les frais n'ont pas encore été encaissés à l'unité. */
export function dutsForFees(partnerId) {
  const user = current();
  if (!can(user, 'payments.record')) throw new Error('Encaissement non autorisé pour votre rôle.');
  const covered = new Set(getAllPayments().filter((p) => p.kind === 'FRAIS_DUT' && p.status !== 'ANNULE').flatMap((p) => p.dutIds || []));
  return getAllDuts().filter((d) => d.partnerId === partnerId && d.dutNumber && !d.canary && !covered.has(d.id))
    .filter((d) => user.role !== 'ANTENNA_AGENT' || d.antennaId === user.antennaId)
    .sort((a, b) => String(b.validatedAt).localeCompare(String(a.validatedAt)));
}

/** Frais DUT payés à l'unité au guichet, pour des DUT déjà numérotés. */
export function recordDutFees({ partnerId, dutIds = [], method = 'GUICHET', receiptNo = '' } = {}) {
  const user = current();
  if (!can(user, 'payments.record')) throw new Error('Encaissement non autorisé pour votre rôle.');
  const partner = findPartnerById(partnerId);
  if (!partner) throw new Error('Choisissez le partenaire.');
  if (!PAYMENT_METHODS[method]) throw new Error('Choisissez un mode de paiement.');
  const ids = [...new Set(dutIds)];
  if (!ids.length) throw new Error('Sélectionnez au moins un DUT.');
  const allowed = new Set(dutsForFees(partnerId).map((d) => d.id));
  if (ids.some((id) => !allowed.has(id))) throw new Error('Un des DUT n’appartient pas à ce partenaire, n’est pas numéroté ou a déjà été réglé.');
  const receipt = String(receiptNo || '').trim();
  if (method === 'GUICHET' && (receipt.length < 3 || receipt.length > 40)) throw new Error('Le numéro du reçu de caisse est obligatoire (3 à 40 caractères).');
  const duts = getAllDuts().filter((d) => ids.includes(d.id));
  const antenna = user.role === 'ANTENNA_AGENT' ? getAllAntennas().find((a) => a.id === user.antennaId) : null;
  const payment = {
    id: uuid(), ref: ref('PAY'), kind: 'FRAIS_DUT', dutIds: ids, dutNumbers: duts.map((d) => d.dutNumber),
    clientType: 'PARTENAIRE', partnerId, transporterId: null, partnerName: partner.name, antennaId: antenna?.id || partner.antennaId || null, antennaName: antenna?.name || partner.antennaName || '',
    ...amountsFor(ids.length), status: 'ENCAISSE', method, receiptNo: receipt,
    transactionRef: SIMULATED.includes(method) ? `SIM-${uuid().slice(0, 8).toUpperCase()}` : null,
    createdAt: nowIso(), recordedAt: nowIso(), recordedBy: who(user),
    history: [{ at: nowIso(), by: user.name, text: `Frais de ${ids.length} DUT encaissés (${PAYMENT_METHODS[method]})` }],
  };
  savePayments([...getAllPayments(), payment]);
  auditService.log(AUDIT_ACTIONS.PAYMENT_RECORDED, { newValue: payment.ref, note: `${payment.ref} · frais de ${ids.length} DUT · ${partner.name} · ${payment.ttc} F` });
  return payment;
}

// ------------------------------------------------------------- Rapport des ventes de références

/** Ventes de références : plages attribuées (partenaires) ou vendues (transporteurs), validées, montants figés à la vente. */
function salesRows({ from = '', to = '', clientId = '', partnerId = '', antennaId = '' } = {}) {
  const payments = getAllPayments().filter((p) => p.kind === 'PLAGE' && p.status !== 'ANNULE');
  const client = clientId || partnerId;
  return getAllOperations()
    .filter((o) => (o.partnerId || o.transporterId) && ['VALIDATED', 'REVOKED'].includes(o.status) && o.validatedAt)
    .filter((o) => inPeriod(o.validatedAt, from, to) && (!client || clientIdOf(o) === client) && (!antennaId || o.antennaId === antennaId))
    .map((o) => {
      const a = o.amounts || amountsFor(o.quantity, { ...pricing(), unitHT: Number(o.tarifUnitaire) || 0 });
      const pay = payments.find((p) => p.operationId === o.id);
      return {
        id: o.id, code: o.code, date: o.validatedAt, clientId: clientIdOf(o), clientType: o.transporterId ? 'TRANSPORTEUR' : 'PARTENAIRE',
        partnerId: o.partnerId || null, transporterId: o.transporterId || null, partnerName: o.transporterName || o.partnerName || '',
        antennaId: o.antennaId || '', antennaName: o.antennaName || DIRECT_SALE_LABEL,
        quantite: a.quantity, prixHT: a.unitHT, ht: a.ht, tauxTva: a.tvaRate, tva: a.tva, timbre: a.stamp, ttc: a.ttc,
        repris: o.status === 'REVOKED' ? (o.returnedQuantity || 0) : 0,
        statutPaiement: pay ? pay.status : 'SANS_CREANCE', encaisseValide: pay?.status === 'VALIDE' ? pay.ttc : 0,
      };
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export function salesReport(filter = {}) {
  const user = current();
  if (!can(user, 'sales.report')) throw new Error('Rapport des ventes réservé à la caisse et à l’OIC.');
  return buildSalesReport(filter);
}

function buildSalesReport({ groupBy = 'client', ...filter } = {}) {
  const rows = salesRows(filter);
  const byClient = (r) => [r.clientId, r.partnerName];
  const keyOf = { client: byClient, antenne: (r) => [r.antennaId || 'DIRECT', r.antennaName], jour: (r) => [r.date.slice(0, 10), r.date.slice(0, 10)] }[groupBy] || byClient;
  const groups = new Map();
  rows.forEach((r) => {
    const [k, label] = keyOf(r);
    const g = groups.get(k) || { key: k, label, ventes: 0, quantite: 0, ht: 0, tva: 0, timbre: 0, ttc: 0, encaisseValide: 0 };
    g.ventes += 1; g.quantite += r.quantite; g.ht += r.ht; g.tva += r.tva; g.timbre += r.timbre; g.ttc += r.ttc; g.encaisseValide += r.encaisseValide;
    groups.set(k, g);
  });
  const total = rows.reduce((t, r) => ({ ventes: t.ventes + 1, quantite: t.quantite + r.quantite, ht: t.ht + r.ht, tva: t.tva + r.tva, timbre: t.timbre + r.timbre, ttc: t.ttc + r.ttc, encaisseValide: t.encaisseValide + r.encaisseValide }), { ventes: 0, quantite: 0, ht: 0, tva: 0, timbre: 0, ttc: 0, encaisseValide: 0 });
  const grouped = [...groups.values()].sort((a, b) => (groupBy === 'jour' ? String(b.key).localeCompare(String(a.key)) : b.ttc - a.ttc));
  return { rows, grouped, total, groupBy };
}

/** Pour les tableaux de bord d'antenne : ventes de l'antenne sur la période. */
export function antennaSalesSummary(antennaId, { from = '', to = '' } = {}) {
  const user = current();
  if (!(can(user, 'sales.report') || (user.role === 'ANTENNA_AGENT' && user.antennaId === antennaId))) throw new Error('Ventes de cette antenne non consultables.');
  const report = buildSalesReport({ from, to, antennaId, groupBy: 'jour' });
  const pays = getAllPayments().filter((p) => p.antennaId === antennaId && p.status !== 'ANNULE');
  return { ...report.total, aValider: pays.filter((p) => p.status === 'ENCAISSE').length, aEncaisser: pays.filter((p) => p.status === 'A_ENCAISSER').length, parJour: report.grouped };
}

export function filterOptions() {
  const partners = getAllPartners().map((p) => ({ id: p.id, name: p.name }));
  const transporters = transportersRepo.getAll().map((t) => ({ id: t.id, name: `${t.name} (transporteur)` }));
  return {
    partners,
    clients: [...partners, ...transporters].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    antennas: getAllAntennas().map((a) => ({ id: a.id, name: a.name })),
  };
}
