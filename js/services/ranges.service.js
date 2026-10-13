// Lot d2 : stock de numéros (références DUT) des antennes, transferts vers les partenaires habilités
// (vente au guichet), validation des transferts, reprise de plage et stock par état.
//
// Modèle : l'OIC approvisionne une antenne (plage « AF », collection propre) ; l'antenne vend un bloc
// continu de son stock à un transporteur (opération « TR » dans la collection des opérations de plage,
// portant `transporterId` sans `partnerId`, forme commune avec le stock de références du lot d3) ;
// émise par une antenne, la vente reste en attente de validation OIC ; émise par l'OIC, elle est validée
// d'office. Les partenaires habilités obtiennent leurs plages par demande à l'OIC (operations.service).
// Une plage reprise rend ses numéros non utilisés à l'antenne d'origine, ou les retire.
import { getCurrentUser } from '../core/auth.js';
import { can } from '../core/permissions.js';
import { AUDIT_ACTIONS } from '../core/constants.js';
import { uuid, nowIso } from '../core/utils.js';
import { getAllOperations, saveOperations, addOperation } from '../repositories/operations.repository.js';
import { getAllAllocations, saveAllocations } from '../repositories/range-stock.repository.js';
import { findAntennaById, getAllAntennas } from '../repositories/antennas.repository.js';
import { getAllPartners } from '../repositories/partners.repository.js';
import { transportersRepo } from '../repositories/referentials.repository.js';
import { getAllDuts, saveDuts } from '../repositories/dut.repository.js';
import { amountsFor, pricing } from './range-pricing.service.js';
import * as payments from './payments.service.js';
import * as auditService from './audit.service.js';

export const OPERATION_STATUS_LABELS = {
  PENDING: 'En attente', VALIDATED: 'Validée', REJECTED: 'Rejetée', CANCELLED: 'Annulée',
  TRANSFER_PENDING: 'Transfert à valider', REVOKED: 'Reprise',
};
export const STATE_LABELS = { attente: 'En attente', disponible: 'Disponibles', utilise: 'Utilisés', retire: 'Retirés' };

export const numberLabel = (year, n) => `DUT-CI-${year}-${String(n).padStart(6, '0')}`;
export const antennaStatus = (a) => a?.status || 'ACTIVE';
const code = (prefix) => `${prefix}-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 90000) + 10000)}`;
const count = (intervals) => intervals.reduce((n, [s, e]) => n + (e - s + 1), 0);

/** Détenteur d'une plage : partenaire habilité (plage demandée) ou transporteur (plage vendue au guichet). */
export function holderOf(op) {
  if (op?.transporterId) return { type: 'TRANSPORTEUR', id: op.transporterId, name: op.transporterName || op.partnerName || '' };
  if (op?.partnerId) return { type: 'PARTENAIRE', id: op.partnerId, name: op.partnerName || '' };
  return null;
}
export const HOLDER_LABELS = { PARTENAIRE: 'Partenaire', TRANSPORTEUR: 'Transporteur' };
const isHeld = (op) => !!holderOf(op);
/** Transporteurs pouvant acheter une plage (fiche active). */
export function listTransporterClients() {
  return transportersRepo.getAll().filter((t) => (t.etat || 'ACTIF') === 'ACTIF').map((t) => ({ id: t.id, name: t.name })).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

function actor(permission, message = 'Action non autorisée pour votre rôle.') {
  const user = getCurrentUser();
  if (!user) throw new Error('Session expirée : reconnectez-vous.');
  if (!can(user, permission)) throw new Error(message);
  return user;
}

function canSeeAntenna(user, antennaId) {
  return user && (user.role === 'OIC_ADMIN' || (user.role === 'ANTENNA_AGENT' && user.antennaId === antennaId));
}

// ------------------------------------------------------------- Intervalles

/** Retire les intervalles `cuts` des intervalles `base` (bornes incluses). */
export function subtractIntervals(base, cuts) {
  let out = base.map(([s, e]) => [s, e]);
  cuts.forEach(([cs, ce]) => {
    out = out.flatMap(([s, e]) => {
      if (ce < s || cs > e) return [[s, e]];
      const parts = [];
      if (cs > s) parts.push([s, cs - 1]);
      if (ce < e) parts.push([ce + 1, e]);
      return parts;
    });
  });
  return out.sort((a, b) => a[0] - b[0]);
}

/** Numéros encore détenus par une plage de partenaire (une plage reprise ne garde que ses numéros utilisés). */
export function heldInterval(op) {
  if (op.rangeStart == null || op.rangeEnd == null) return null;
  if (['TRANSFER_PENDING', 'VALIDATED'].includes(op.status)) return [op.rangeStart, op.rangeEnd];
  if (op.status === 'REVOKED' && op.used > 0) return [op.rangeStart, op.rangeStart + op.used - 1];
  return null;
}

/** Intervalles disponibles d'un approvisionnement d'antenne. */
export function allocationIntervals(alloc, ops = getAllOperations()) {
  if (alloc.status !== 'ACTIVE') return [];
  const cuts = ops.filter((o) => o.stockId === alloc.id).map(heldInterval).filter(Boolean);
  return subtractIntervals([[alloc.rangeStart, alloc.rangeEnd]], cuts);
}

/** Premier numéro libre de l'année : aucune plage, aucun stock d'antenne ni aucun DUT ne le porte. */
export function nextFreeStart(year = new Date().getFullYear()) {
  const ops = getAllOperations().filter((o) => Number(o.year) === Number(year) && o.rangeEnd != null).map((o) => Number(o.rangeEnd) || 0);
  const stock = getAllAllocations().filter((a) => Number(a.year) === Number(year)).map((a) => Number(a.rangeEnd) || 0);
  const duts = getAllDuts().map((d) => d.dutNumber?.match(/^DUT-CI-(\d{4})-(\d+)$/)).filter((m) => m && Number(m[1]) === Number(year)).map((m) => Number(m[2]));
  return Math.max(0, ...ops, ...stock, ...duts) + 1;
}

// ------------------------------------------------------------- Stock par état

function emptyStates() { return { attente: 0, disponible: 0, utilise: 0, retire: 0 }; }

/** Stock par état (en attente, disponible, utilisé, retiré), national ou filtré par antenne / détenteur (partenaire ou transporteur). */
export function stockByState({ antennaId = '', partnerId = '', transporterId = '' } = {}) {
  const ops = getAllOperations();
  const allocs = getAllAllocations();
  const st = emptyStates();
  const holderId = partnerId || transporterId;
  if (!holderId) {
    allocs.filter((a) => !antennaId || a.antennaId === antennaId).forEach((a) => {
      if (a.status === 'ACTIVE') st.disponible += count(allocationIntervals(a, ops));
      else st.retire += count(subtractIntervals([[a.rangeStart, a.rangeEnd]], ops.filter((o) => o.stockId === a.id).map(heldInterval).filter(Boolean)));
    });
  }
  ops.filter((o) => isHeld(o) && (!holderId || holderOf(o).id === holderId) && (!antennaId || o.antennaId === antennaId)).forEach((o) => {
    if (o.status === 'TRANSFER_PENDING') st.attente += o.quantity;
    if (o.status === 'VALIDATED') { st.disponible += Math.max(0, o.quantity - (o.used || 0)); st.utilise += o.used || 0; }
    if (o.status === 'REVOKED') { st.utilise += o.used || 0; if (!o.stockId) st.retire += Math.max(0, o.quantity - (o.used || 0)); }
  });
  st.total = st.attente + st.disponible + st.utilise + st.retire;
  return st;
}

function describeAllocation(a, ops) {
  const intervals = allocationIntervals(a, ops);
  const outs = ops.filter((o) => o.stockId === a.id);
  return {
    ...a, intervals, disponible: count(intervals), first: intervals[0]?.[0] ?? null,
    enAttente: outs.filter((o) => o.status === 'TRANSFER_PENDING').reduce((n, o) => n + o.quantity, 0),
    vendus: outs.filter((o) => ['VALIDATED', 'REVOKED'].includes(o.status)).reduce((n, o) => n + o.quantity, 0),
    label: `${numberLabel(a.year, a.rangeStart)} à ${numberLabel(a.year, a.rangeEnd)}`,
  };
}

/** Stock d'une antenne : approvisionnements, disponibles, transferts. Fonction de service pour les tableaux de bord. */
export function antennaStock(antennaId) {
  const user = actor('ranges.stock', 'Consultation du stock non autorisée.');
  if (!canSeeAntenna(user, antennaId)) throw new Error('Ce stock ne fait pas partie de votre périmètre.');
  const antenna = findAntennaById(antennaId);
  if (!antenna) throw new Error('Antenne introuvable.');
  const ops = getAllOperations();
  const allocations = getAllAllocations().filter((a) => a.antennaId === antennaId).map((a) => describeAllocation(a, ops)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const transfers = ops.filter((o) => o.kind === 'TRANSFER' && o.antennaId === antennaId).sort((a, b) => String(b.requestedAt).localeCompare(String(a.requestedAt)));
  const active = allocations.filter((a) => a.status === 'ACTIVE' && a.disponible > 0);
  return {
    antenna, status: antennaStatus(antenna), allocations, transfers,
    disponible: active.reduce((n, a) => n + a.disponible, 0),
    enAttente: transfers.filter((o) => o.status === 'TRANSFER_PENDING').reduce((n, o) => n + o.quantity, 0),
    vendus: transfers.filter((o) => ['VALIDATED', 'REVOKED'].includes(o.status)).reduce((n, o) => n + o.quantity, 0),
    firstAvailable: active.length ? Math.min(...active.map((a) => a.first)) : null,
    year: active[0]?.year || new Date().getFullYear(),
    states: stockByState({ antennaId }),
  };
}

/** Résumé compact du stock d'une antenne (tableaux de bord d'antenne). */
export function antennaStockSummary(antennaId) {
  const s = antennaStock(antennaId);
  return { disponible: s.disponible, enAttente: s.enAttente, vendus: s.vendus, firstAvailable: s.firstAvailable, year: s.year, states: s.states };
}

/** Vue nationale (OIC) : stock par état, par antenne et par partenaire. */
export function nationalStock() {
  actor('ranges.validate', 'Vue nationale réservée à l’administration OIC.');
  const ops = getAllOperations();
  const allocs = getAllAllocations();
  const antennas = getAllAntennas().map((a) => {
    const mine = allocs.filter((x) => x.antennaId === a.id).map((x) => describeAllocation(x, ops));
    return {
      id: a.id, name: a.name, city: a.city, status: antennaStatus(a), allocations: mine,
      disponible: mine.reduce((n, x) => n + x.disponible, 0), enAttente: mine.reduce((n, x) => n + x.enAttente, 0), vendus: mine.reduce((n, x) => n + x.vendus, 0),
    };
  });
  const partners = getAllPartners().map((p) => {
    const mine = ops.filter((o) => o.partnerId === p.id);
    return {
      id: p.id, name: p.name, antennaName: p.antennaName || '',
      plages: mine.filter((o) => ['VALIDATED', 'REVOKED', 'TRANSFER_PENDING'].includes(o.status)).sort((a, b) => String(b.validatedAt || b.requestedAt).localeCompare(String(a.validatedAt || a.requestedAt))),
      demandes: mine.filter((o) => o.status === 'PENDING').length, states: stockByState({ partnerId: p.id }),
    };
  });
  const transporters = transportersRepo.getAll().map((t) => {
    const mine = ops.filter((o) => o.transporterId === t.id);
    return {
      id: t.id, name: t.name,
      plages: mine.filter((o) => ['VALIDATED', 'REVOKED', 'TRANSFER_PENDING'].includes(o.status)).sort((a, b) => String(b.validatedAt || b.requestedAt).localeCompare(String(a.validatedAt || a.requestedAt))),
      states: stockByState({ transporterId: t.id }),
    };
  }).filter((t) => t.plages.length);
  return { states: stockByState(), antennas, partners, transporters, pendingTransfers: ops.filter((o) => o.status === 'TRANSFER_PENDING'), requests: ops.filter((o) => o.status === 'PENDING') };
}

/** Plages transférées (historique), filtrables. */
export function listTransfers({ status = '' } = {}) {
  const user = actor('ranges.stock', 'Consultation non autorisée.');
  return getAllOperations().filter((o) => o.kind === 'TRANSFER' && (!status || o.status === status) && (user.role === 'OIC_ADMIN' || o.antennaId === user.antennaId))
    .sort((a, b) => String(b.requestedAt).localeCompare(String(a.requestedAt)));
}

// ------------------------------------------------------------- Approvisionner une antenne

export function allocateToAntenna(antennaId, quantity) {
  const user = actor('ranges.allocate', 'Seul l’OIC approvisionne les antennes.');
  const antenna = findAntennaById(antennaId);
  if (!antenna) throw new Error('Antenne introuvable.');
  if (antennaStatus(antenna) !== 'ACTIVE') throw new Error('Une antenne désactivée ou fermée ne peut pas recevoir de stock.');
  const qty = Number(quantity);
  if (!Number.isSafeInteger(qty) || qty < 1 || qty > 50000) throw new Error('La quantité doit être un entier entre 1 et 50 000.');
  const year = new Date().getFullYear();
  const start = nextFreeStart(year);
  if (start + qty - 1 > 999999) throw new Error('Capacité de numérotation annuelle atteinte.');
  const alloc = { id: uuid(), code: code('AF'), antennaId, antennaName: antenna.name, year, rangeStart: start, rangeEnd: start + qty - 1, quantity: qty, status: 'ACTIVE', createdAt: nowIso(), createdBy: user.name };
  saveAllocations([...getAllAllocations(), alloc]);
  auditService.log(AUDIT_ACTIONS.RANGE_ALLOCATED, { newValue: alloc.code, note: `${alloc.code} · ${antenna.name} · ${numberLabel(year, alloc.rangeStart)} à ${numberLabel(year, alloc.rangeEnd)} (${qty})` });
  return alloc;
}

// ------------------------------------------------------------- Transférer (vendre) une plage à un transporteur

/**
 * Vente d'un bloc continu du stock d'une antenne à un transporteur. L'opération créée a la même forme
 * que le stock de références lu par le lot d3 (`transporterId`, `transporterName`, `ownerType`,
 * `year`, `rangeStart`, `rangeEnd`, `quantity`, `used`, `tarifUnitaire`, `status`, `retiredReferences`),
 * sans `partnerId` : dès sa validation, le transporteur règle ses DUT avec ces références.
 */
export function transferRange({ antennaId, transporterId, start, quantity, receiptNo = '', commentaire = '' } = {}) {
  const user = actor('ranges.transfer', 'Transfert de plage non autorisé pour votre rôle.');
  if (user.role === 'ANTENNA_AGENT' && user.antennaId !== antennaId) throw new Error('Vous ne pouvez vendre que le stock de votre antenne.');
  const antenna = findAntennaById(antennaId);
  if (!antenna) throw new Error('Antenne introuvable.');
  if (antennaStatus(antenna) !== 'ACTIVE') throw new Error('Antenne désactivée ou fermée : aucune vente possible.');
  const transporter = transportersRepo.findById(transporterId);
  if (!transporter) throw new Error('Choisissez le transporteur bénéficiaire.');
  if ((transporter.etat || 'ACTIF') !== 'ACTIF') throw new Error('Ce transporteur est désactivé ou retiré : aucune vente possible.');
  const qty = Number(quantity); const first = Number(start);
  if (!Number.isSafeInteger(qty) || qty < 1 || qty > 10000) throw new Error('La quantité doit être un entier entre 1 et 10 000.');
  if (!Number.isSafeInteger(first) || first < 1) throw new Error('Le premier numéro est invalide.');
  const last = first + qty - 1;
  const ops = getAllOperations();
  const alloc = getAllAllocations().filter((a) => a.antennaId === antennaId && a.status === 'ACTIVE')
    .find((a) => allocationIntervals(a, ops).some(([s, e]) => s <= first && last <= e));
  if (!alloc) throw new Error('Ces numéros ne sont pas tous disponibles dans le stock de l’antenne (bloc continu requis).');
  const receipt = String(receiptNo || '').trim();
  const isAgent = user.role === 'ANTENNA_AGENT';
  if (isAgent && (receipt.length < 3 || receipt.length > 40)) throw new Error('Le numéro du reçu de caisse est obligatoire (3 à 40 caractères).');
  const pr = pricing();
  const amounts = amountsFor(qty, pr);
  const op = {
    id: uuid(), code: code('TR'), kind: 'TRANSFER', ownerType: 'TRANSPORTEUR', transporterId: transporter.id, transporterName: transporter.name, partnerName: transporter.name,
    antennaId, antennaName: antenna.name, stockId: alloc.id,
    year: alloc.year, rangeStart: first, rangeEnd: last, quantity: qty, used: 0, tarifUnitaire: pr.unitHT, montantTotal: amounts.ht, amounts, retiredReferences: [],
    receiptNo: receipt, commentaire: String(commentaire || '').trim(), status: isAgent ? 'TRANSFER_PENDING' : 'VALIDATED',
    requestedAt: nowIso(), requestedBy: user.name, requestedById: user.id,
    validatedAt: isAgent ? null : nowIso(), decidedBy: isAgent ? undefined : user.name,
  };
  addOperation(op);
  payments.createForOperation(op, { collected: isAgent ? { method: 'GUICHET', receiptNo: receipt } : null, by: user });
  auditService.log(AUDIT_ACTIONS.RANGE_TRANSFERRED, { newValue: op.code, note: `${op.code} · ${antenna.name} → ${transporter.name} (transporteur) · ${numberLabel(op.year, first)} à ${numberLabel(op.year, last)} (${qty})${isAgent ? ' · en attente de validation OIC' : ' · validé d’office'}` });
  return op;
}

export function decideTransfer(id, accepted, reason = '') {
  const user = actor('ranges.validate', 'La validation d’un transfert est réservée à l’OIC.');
  const list = getAllOperations();
  const op = list.find((o) => o.id === id);
  if (!op || op.status !== 'TRANSFER_PENDING') throw new Error('Ce transfert a déjà été traité ou est introuvable.');
  if (op.requestedById === user.id) throw new Error('Le transfert doit être validé par une autre personne que celle qui l’a saisi.');
  const motive = String(reason || '').trim();
  if (!accepted && !motive) throw new Error('Le motif du refus est obligatoire.');
  if (accepted) Object.assign(op, { status: 'VALIDATED', validatedAt: nowIso(), decidedBy: user.name, decidedById: user.id });
  else Object.assign(op, { status: 'REJECTED', rejectionReason: motive, rejectedAt: nowIso(), decidedBy: user.name, decidedById: user.id });
  saveOperations(list);
  if (!accepted) payments.cancelForOperation(op.id, `Transfert refusé : ${motive}`);
  auditService.log(AUDIT_ACTIONS.RANGE_TRANSFER_DECIDED, { newValue: op.code, note: `${op.code} · ${accepted ? 'validé' : `refusé : ${motive}`}` });
  return op;
}

// ------------------------------------------------------------- Reprendre

/** Reprise d'une plage (partenaire ou transporteur) : les numéros non utilisés retournent au stock d'origine (ou sont retirés). */
export function revokeRange(id, reason) {
  const user = actor('ranges.revoke', 'La reprise d’une plage est réservée à l’OIC.');
  const motive = String(reason || '').trim();
  if (!motive) throw new Error('Le motif de la reprise est obligatoire.');
  const list = getAllOperations();
  const op = list.find((o) => o.id === id);
  if (!op || op.status !== 'VALIDATED' || !isHeld(op)) throw new Error('Seule une plage validée d’un partenaire ou d’un transporteur peut être reprise.');
  const remaining = op.quantity - (op.used || 0);
  if (remaining <= 0) throw new Error('Plage épuisée : aucun numéro à reprendre.');
  const alloc = op.stockId ? getAllAllocations().find((a) => a.id === op.stockId) : null;
  const backToAntenna = alloc?.status === 'ACTIVE';
  Object.assign(op, { status: 'REVOKED', revokedAt: nowIso(), revokedBy: user.name, revokeReason: motive, returnedQuantity: remaining, returnedFrom: op.rangeStart + (op.used || 0), returnedTo: backToAntenna ? 'ANTENNA' : 'RETIRE' });
  saveOperations(list);
  // Plage de partenaire : les dossiers en attente rattachés à cette plage prendront un numéro sur une autre
  // plage active. Plage de transporteur : un dossier déjà réglé garde sa référence (consommée, donc non reprise).
  const duts = getAllDuts();
  const nextActive = op.partnerId ? list.find((o) => o.partnerId === op.partnerId && o.status === 'VALIDATED' && o.used < o.quantity) : null;
  let detached = 0;
  if (op.partnerId) duts.forEach((d) => { if (d.operationId === op.id && !d.dutNumber && !d.payment) { d.operationId = nextActive?.id || null; detached += 1; } });
  if (detached) saveDuts(duts);
  payments.adjustForRevocation(op);
  auditService.log(AUDIT_ACTIONS.RANGE_REVOKED, { newValue: op.code, note: `${op.code} · ${holderOf(op).name} · ${remaining} numéro(s) ${backToAntenna ? `rendus au stock de ${alloc.antennaName}` : 'retirés'} · ${motive}${detached ? ` · ${detached} dossier(s) en attente rattaché(s) à une autre plage` : ''}` });
  return op;
}

/** Reprise du stock d'une antenne : les numéros non vendus sont retirés. */
export function revokeAllocation(id, reason) {
  const user = actor('ranges.revoke', 'La reprise d’un stock est réservée à l’OIC.');
  const motive = String(reason || '').trim();
  if (!motive) throw new Error('Le motif de la reprise est obligatoire.');
  const list = getAllAllocations();
  const alloc = list.find((a) => a.id === id);
  if (!alloc || alloc.status !== 'ACTIVE') throw new Error('Ce stock a déjà été repris ou est introuvable.');
  const ops = getAllOperations();
  if (ops.some((o) => o.stockId === id && o.status === 'TRANSFER_PENDING')) throw new Error('Des transferts de ce stock attendent une validation : traitez-les d’abord.');
  const retired = count(allocationIntervals(alloc, ops));
  Object.assign(alloc, { status: 'REVOKED', revokedAt: nowIso(), revokedBy: user.name, revokeReason: motive, retiredQuantity: retired });
  saveAllocations(list);
  auditService.log(AUDIT_ACTIONS.RANGE_REVOKED, { newValue: alloc.code, note: `${alloc.code} · stock de ${alloc.antennaName} repris · ${retired} numéro(s) retirés · ${motive}` });
  return alloc;
}

/** Reprend tous les stocks actifs d'une antenne (préalable à sa fermeture). */
export function revokeAntennaStock(antennaId, reason) {
  return getAllAllocations().filter((a) => a.antennaId === antennaId && a.status === 'ACTIVE').map((a) => revokeAllocation(a.id, reason));
}
