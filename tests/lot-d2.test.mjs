// Lot d2 : antennes, sites, plages de numéros, rapprochement et caisse — services, règles et refus.
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

const data = new Map();
globalThis.window = { crypto: webcrypto };
globalThis.localStorage = { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k), key: () => null, length: 0 };

const { writeObject, readObject } = await import('../js/core/storage.js');
const { STORAGE_KEYS, ROLES, ROLE_LABELS } = await import('../js/core/constants.js');
const { can } = await import('../js/core/permissions.js');
const A = await import('../js/services/antennas-admin.service.js');
const R = await import('../js/services/ranges.service.js');
const P = await import('../js/services/payments.service.js');
const ops = await import('../js/services/operations.service.js');
const Sites = await import('../js/services/sites.service.js');
const Rec = await import('../js/services/reconciliation.service.js');
const { savePricing, pricing, amountsFor } = await import('../js/services/range-pricing.service.js');
const { consumeNextNumber, getAllOperations } = await import('../js/repositories/operations.repository.js');
const { listAntennas } = await import('../js/services/directory.service.js');
const { mergeAntennaDirectory, withLeadership } = await import('../js/data/antennas.js');
const { getAllDuts } = await import('../js/repositories/dut.repository.js');

const year = new Date().getFullYear();
const antA = { id: 'a1', name: 'ANTENNE A', city: 'Abidjan', lat: 5.3, lng: -4.0, phone: '01', address: 'x', hours: 'h', chef: { name: 'Libre' } };
const antB = { id: 'a2', name: 'ANTENNE B', city: 'Bouaké', lat: 7.69, lng: -5.03, phone: '02', address: 'y', hours: 'h', chef: { name: 'Libre B' } };
const partners = [{ id: 'p1', name: 'PARTENAIRE UN', antennaId: 'a1', antennaName: 'ANTENNE A' }, { id: 'p2', name: 'PARTENAIRE DEUX', antennaId: 'a2', antennaName: 'ANTENNE B' }];
const U = {
  oic: { id: 'oic', name: 'Admin OIC', email: 'oic@t.ci', role: 'OIC_ADMIN' },
  oic2: { id: 'oic2', name: 'Admin OIC 2', email: 'oic2@t.ci', role: 'OIC_ADMIN' },
  agent: { id: 'ag1', name: 'Agent A', email: 'ag1@t.ci', role: 'ANTENNA_AGENT', antennaId: 'a1', antennaName: 'ANTENNE A' },
  agent2: { id: 'ag2', name: 'Agent A2', email: 'ag2@t.ci', role: 'ANTENNA_AGENT', antennaId: 'a1', antennaName: 'ANTENNE A' },
  agentB: { id: 'agb', name: 'Agent B', email: 'agb@t.ci', role: 'ANTENNA_AGENT', antennaId: 'a2', antennaName: 'ANTENNE B' },
  cashier: { id: 'cash', name: 'Caisse', email: 'caisse@t.ci', role: 'CASHIER' },
  p1: { id: 'pa1', name: 'Partenaire 1', email: 'p1@t.ci', role: 'PARTNER_ADMIN', partnerId: 'p1', partnerName: 'PARTENAIRE UN' },
  p1e: { id: 'pe1', name: 'Éditeur 1', email: 'pe1@t.ci', role: 'PARTNER_EDITOR', partnerId: 'p1', partnerName: 'PARTENAIRE UN' },
  p2: { id: 'pa2', name: 'Partenaire 2', email: 'p2@t.ci', role: 'PARTNER_ADMIN', partnerId: 'p2', partnerName: 'PARTENAIRE DEUX' },
};
writeObject(STORAGE_KEYS.USERS, Object.values(U));
writeObject(STORAGE_KEYS.ANTENNAS, [antA, antB]);
writeObject(STORAGE_KEYS.PARTNERS, partners);
writeObject(STORAGE_KEYS.TRANSPORTERS, [{ id: 't1', name: 'TRANSPORTEUR UN' }, { id: 't2', name: 'TRANSPORTEUR DEUX' }, { id: 't3', name: 'TRANSPORTEUR RETIRÉ', etat: 'RETIRE' }]);
// Une plage historique et un DUT déjà numéroté : la numérotation des stocks doit les éviter.
writeObject(STORAGE_KEYS.OPERATIONS, [{ id: 'op0', code: 'OP-0', partnerId: 'p1', partnerName: 'PARTENAIRE UN', year, rangeStart: 1, rangeEnd: 100, quantity: 100, used: 2, tarifUnitaire: 2500, status: 'VALIDATED', requestedAt: new Date().toISOString(), validatedAt: new Date().toISOString() }]);
writeObject(STORAGE_KEYS.DUT_LIST, [
  { id: 'd1', partnerId: 'p1', antennaId: 'a1', status: 'VALIDE', dutNumber: `DUT-CI-${year}-000001`, validatedAt: new Date().toISOString(), createdAt: new Date().toISOString(), general: {} },
  { id: 'd2', partnerId: 'p1', antennaId: 'a1', status: 'VALIDE', dutNumber: `DUT-CI-${year}-000150`, validatedAt: new Date().toISOString(), createdAt: new Date().toISOString(), general: {} },
]);
const as = (u) => writeObject(STORAGE_KEYS.CURRENT_USER, u);

// ---------------------------------------------------------------- Rôle Caisse
assert.equal(ROLES.CASHIER, 'CASHIER');
assert.equal(ROLE_LABELS.CASHIER, 'Caisse et comptabilité OIC');
assert.ok(can(U.cashier, 'payments.validate') && can(U.cashier, 'sales.report') && !can(U.cashier, 'dut.view') && !can(U.cashier, 'admin.manage'));

// ---------------------------------------------------------------- Antennes
as(U.agent);
assert.throws(() => A.createAntenna({ name: 'X', code: 'X1', city: 'Man', lat: 7.4, lng: -7.5 }), /administration OIC/);
as(U.oic);
const created = A.createAntenna({ name: 'Antenne de Test', code: 'TST-01', city: 'Man', zone: '', lat: '7,41', lng: '-7.55', address: 'Quartier commerce', hours: '', phone: '07' });
assert.equal(created.name, 'ANTENNE DE TEST'); assert.equal(created.zone, 'Ouest'); assert.equal(created.lat, 7.41); assert.equal(created.status, 'ACTIVE');
assert.throws(() => A.createAntenna({ name: 'antenne de test', code: 'TST-02', city: 'Man', lat: 7.4, lng: -7.5 }), /porte déjà ce nom/);
assert.throws(() => A.createAntenna({ name: 'Autre', code: 'TST-01', city: 'Man', lat: 7.4, lng: -7.5 }), /code est déjà/);
assert.throws(() => A.createAntenna({ name: 'Autre', code: 'TST-03', city: 'Paris', lat: 48.8, lng: 2.3 }), /Côte d’Ivoire/);
assert.throws(() => A.createAntenna({ name: 'Autre', code: 'TST-03', city: 'Man', lat: '', lng: '' }), /position/);
// Mise à jour complète : nom, ville et position, propagée aux comptes et partenaires rattachés.
const updated = A.updateAntenna('a1', { name: 'Antenne A Plateau', code: 'OIC-A', city: 'Abidjan Plateau', zone: 'Sud', lat: 5.32, lng: -4.02, address: 'Plateau', hours: 'Lun.–Ven.', phone: '01', email: 'a@oic.ci' });
assert.equal(updated.name, 'ANTENNE A PLATEAU'); assert.equal(updated.city, 'Abidjan Plateau'); assert.equal(updated.lng, -4.02);
assert.equal(readObject(STORAGE_KEYS.USERS).find((u) => u.id === 'ag1').antennaName, 'ANTENNE A PLATEAU');
assert.equal(readObject(STORAGE_KEYS.PARTNERS).find((p) => p.id === 'p1').antennaName, 'ANTENNE A PLATEAU');
// Encadrement pris dans les comptes : un compte d'une autre antenne est refusé.
assert.throws(() => A.assignStaff('a1', { chefUserId: 'agb' }), /compte actif d’agent rattaché/);
assert.throws(() => A.assignStaff('a1', { chefUserId: 'ag1', adjointUserId: 'ag1' }), /deux personnes/);
const staffed = A.assignStaff('a1', { chefUserId: 'ag1', adjointUserId: 'ag2' });
assert.equal(staffed.chef.userId, 'ag1'); assert.equal(staffed.chef.name, 'Agent A'); assert.equal(staffed.adjoint.name, 'Agent A2');
// Une antenne gérée sans chef ne reçoit pas d'encadrement fictif ; une antenne officielle renommée n'est pas dupliquée.
assert.equal(withLeadership({ ...created }, 3).chef.name, '');
const official = mergeAntennaDirectory([]);
const renamed = official.map((x) => (x.name === 'BOUAKE' ? { ...x, name: 'BOUAKE CENTRE', directoryName: 'BOUAKE' } : x));
const again = mergeAntennaDirectory(renamed);
assert.equal(again.length, 23); assert.ok(again.some((x) => x.name === 'BOUAKE CENTRE')); assert.ok(!again.some((x) => x.name === 'BOUAKE'));
console.log('Antennes : création, contrôles (rôle, doublons, position), mise à jour complète, encadrement depuis les comptes validés.');

// ---------------------------------------------------------------- Stock, transferts, reprises
as(U.agent);
assert.throws(() => R.allocateToAntenna('a1', 100), /OIC approvisionne/);
as(U.oic);
const alloc = R.allocateToAntenna('a1', 300);
assert.equal(alloc.rangeStart, 151, 'au-delà de la plage historique et du DUT n° 150');
assert.equal(R.nextFreeStart(year), 451);
assert.throws(() => R.allocateToAntenna('zz', 10), /introuvable/);
// Vente au guichet par l'agent : reçu obligatoire, stock de sa seule antenne, bloc continu disponible.
as(U.agent);
assert.equal(R.antennaStock('a1').firstAvailable, 151);
assert.throws(() => R.antennaStock('a2'), /périmètre/);
assert.throws(() => R.transferRange({ antennaId: 'a1', transporterId: 't1', start: 151, quantity: 50 }), /reçu/);
assert.throws(() => R.transferRange({ antennaId: 'a2', transporterId: 't1', start: 151, quantity: 50, receiptNo: 'RC-1' }), /votre antenne/);
assert.throws(() => R.transferRange({ antennaId: 'a1', transporterId: 't1', start: 430, quantity: 50, receiptNo: 'RC-1' }), /pas tous disponibles/);
assert.throws(() => R.transferRange({ antennaId: 'a1', transporterId: 'p1', start: 151, quantity: 50, receiptNo: 'RC-1' }), /transporteur bénéficiaire/, 'un partenaire n’achète pas au guichet');
assert.throws(() => R.transferRange({ antennaId: 'a1', transporterId: 't3', start: 151, quantity: 50, receiptNo: 'RC-1' }), /désactivé ou retiré/);
const sale = R.transferRange({ antennaId: 'a1', transporterId: 't1', start: 151, quantity: 50, receiptNo: 'RC-0001' });
assert.equal(sale.status, 'TRANSFER_PENDING'); assert.equal(sale.rangeEnd, 200);
// Forme commune avec le stock de références du lot d3 : transporterId, sans partnerId.
assert.equal(sale.transporterId, 't1'); assert.equal(sale.partnerId, undefined); assert.equal(sale.ownerType, 'TRANSPORTEUR');
assert.deepEqual(sale.retiredReferences, []); assert.equal(sale.used, 0); assert.equal(sale.tarifUnitaire, pricing().unitHT);
assert.throws(() => R.transferRange({ antennaId: 'a1', transporterId: 't2', start: 180, quantity: 10, receiptNo: 'RC-2' }), /pas tous disponibles/, 'pas de chevauchement de ventes');
assert.equal(R.antennaStock('a1').firstAvailable, 201);
assert.deepEqual(R.stockByState({ antennaId: 'a1' }), { attente: 50, disponible: 250, utilise: 0, retire: 0, total: 300 });
const salePay = P.listPayments({}).find((p) => p.operationId === sale.id);
assert.equal(salePay.transporterId, 't1'); assert.equal(salePay.partnerId, null); assert.equal(salePay.clientType, 'TRANSPORTEUR');
assert.equal(salePay.status, 'ENCAISSE'); assert.equal(salePay.receiptNo, 'RC-0001'); assert.equal(salePay.ttc, amountsFor(50).ttc);
// Une plage en attente de validation ne fournit aucun numéro.
assert.throws(() => consumeNextNumber(sale.id), /pas active/);
// Validation du transfert par l'OIC (refus pour l'agent).
assert.throws(() => R.decideTransfer(sale.id, true), /réservée à l’OIC/);
as(U.oic);
assert.throws(() => R.decideTransfer(sale.id, false, ''), /motif/);
R.decideTransfer(sale.id, true);
assert.throws(() => R.decideTransfer(sale.id, true), /déjà été traité/);
// Comme au lot d3 : la plus petite plage validée du transporteur fournit sa prochaine référence.
const tStock = getAllOperations().filter((o) => o.transporterId === 't1' && o.status === 'VALIDATED' && o.used < o.quantity);
assert.deepEqual(tStock.map((o) => o.id), [sale.id]);
assert.equal(consumeNextNumber(sale.id), `DUT-CI-${year}-000151`);
assert.deepEqual(R.stockByState({ transporterId: 't1' }), { attente: 0, disponible: 49, utilise: 1, retire: 0, total: 50 });
// Transfert émis par l'OIC : validé d'office, créance à encaisser.
const direct = R.transferRange({ antennaId: 'a1', transporterId: 't2', start: 201, quantity: 20 });
assert.equal(direct.status, 'VALIDATED');
assert.equal(P.listPayments({}).find((p) => p.operationId === direct.id).status, 'A_ENCAISSER');
// Refus d'une vente : numéros rendus, encaissement non validé annulé.
as(U.agent);
const refused = R.transferRange({ antennaId: 'a1', transporterId: 't2', start: 221, quantity: 10, receiptNo: 'RC-0002' });
as(U.oic);
R.decideTransfer(refused.id, false, 'Reçu illisible');
assert.equal(P.listPayments({}).find((p) => p.operationId === refused.id).status, 'ANNULE');
assert.equal(R.antennaStock('a1').firstAvailable, 221);
// Reprise d'une plage partiellement utilisée : les numéros non utilisés reviennent au stock de l'antenne.
// Dossier d'un partenaire en attente, rattaché par erreur à la plage reprise, et DUT déjà réglé par le transporteur.
writeObject(STORAGE_KEYS.DUT_LIST, [...getAllDuts(),
  { id: 'd3', partnerId: 'p1', antennaId: 'a1', status: 'TERMINE', dutNumber: null, operationId: sale.id, createdAt: new Date().toISOString(), general: {} },
  { id: 'd4', partnerId: null, antennaId: 'a2', status: 'TERMINE', dutNumber: null, operationId: sale.id, payment: { reference: `DUT-CI-${year}-000151`, operationId: sale.id }, createdAt: new Date().toISOString(), general: { transporterId: 't1' } },
]);
assert.throws(() => R.revokeRange(sale.id, ''), /motif/);
as(U.agent);
assert.throws(() => R.revokeRange(sale.id, 'Fraude'), /réservée à l’OIC/);
as(U.oic);
const before = R.antennaStock('a1').disponible;
const revoked = R.revokeRange(sale.id, 'Partenaire suspendu');
assert.equal(revoked.status, 'REVOKED'); assert.equal(revoked.returnedQuantity, 49); assert.equal(revoked.returnedTo, 'ANTENNA');
assert.equal(R.antennaStock('a1').disponible, before + 49);
assert.equal(getAllDuts().find((d) => d.id === 'd3').operationId, sale.id, 'plage de transporteur : aucun dossier détaché');
assert.equal(getAllDuts().find((d) => d.id === 'd4').operationId, sale.id, 'le DUT réglé garde sa référence consommée');
assert.deepEqual(R.stockByState({ transporterId: 't1' }), { attente: 0, disponible: 0, utilise: 1, retire: 0, total: 1 });
assert.throws(() => consumeNextNumber(sale.id), /pas active/);
assert.throws(() => R.revokeRange(sale.id, 'Encore'), /plage validée/);
// Reprise d'une plage attribuée directement par l'OIC : numéros retirés.
const st0 = R.stockByState({ partnerId: 'p1' });
writeObject(STORAGE_KEYS.DUT_LIST, [...getAllDuts(), { id: 'd5', partnerId: 'p1', antennaId: 'a2', status: 'TERMINE', dutNumber: null, operationId: 'op0', createdAt: new Date().toISOString(), general: {} }]);
R.revokeRange('op0', 'Fin de campagne');
assert.equal(getAllDuts().find((d) => d.id === 'd5').operationId, null, 'dossier du partenaire détaché de la plage reprise (aucune autre plage active)');
assert.equal(R.stockByState({ partnerId: 'p1' }).retire, st0.retire + 98);
console.log('Plages : approvisionnement sans chevauchement, vente au guichet, validation OIC, refus, reprise vers l’antenne ou retrait validés.');

// ---------------------------------------------------------------- Demandes des partenaires
as(U.p1e);
assert.throws(() => ops.requestNewRange(U.p1e, { quantite: 10, tarifUnitaire: 2500 }), /non autorisée/);
as(U.p1);
const req = ops.requestNewRange(U.p1, { quantite: 10, tarifUnitaire: 1 });
assert.equal(req.tarifUnitaire, pricing().unitHT, 'le tarif vient des paramètres OIC');
ops.updatePendingRequest(U.p1, req.id, { quantite: 40, commentaire: 'Revu' });
assert.equal(getAllOperations().find((o) => o.id === req.id).quantity, 40);
as(U.p2);
assert.throws(() => ops.updatePendingRequest(U.p2, req.id, { quantite: 5 }), /périmètre/);
assert.throws(() => ops.cancelPendingRequest(U.p2, req.id, 'x'), /périmètre/);
as(U.p1);
assert.throws(() => ops.cancelPendingRequest(U.p1, req.id, ''), /motif/);
const req2 = ops.requestNewRange(U.p1, { quantite: 5, tarifUnitaire: 2500 });
ops.cancelPendingRequest(U.p1, req2.id, 'Doublon');
assert.equal(getAllOperations().find((o) => o.id === req2.id).status, 'CANCELLED');
as(U.oic);
const granted = ops.decideRange(req.id, true);
assert.ok(granted.rangeStart > alloc.rangeEnd, 'attribution OIC au-delà du stock des antennes');
as(U.p1);
assert.throws(() => ops.updatePendingRequest(U.p1, req.id, { quantite: 5 }), /en attente/);
console.log('Demandes de plage : modification et annulation d’une demande en attente, cloisonnement et droits validés.');

// ---------------------------------------------------------------- Caisse
const due = P.listPayments({}).find((p) => p.operationId === granted.id);
assert.equal(due.status, 'A_ENCAISSER');
assert.throws(() => P.recordPayment(due.id, { method: 'GUICHET', receiptNo: 'RC-9' }), /mobile money et la carte/);
as(U.p2);
assert.throws(() => P.recordPayment(due.id, { method: 'MOBILE_MONEY' }), /périmètre/);
as(U.p1);
const paid = P.recordPayment(due.id, { method: 'MOBILE_MONEY' });
assert.equal(paid.status, 'ENCAISSE'); assert.match(paid.transactionRef, /^SIM-/);
assert.throws(() => P.validatePayment(due.id), /Validation réservée/);
as(U.cashier);
assert.throws(() => P.rejectPayment(due.id, ''), /motif/);
P.rejectPayment(due.id, 'Transaction introuvable');
assert.equal(P.listPayments({}).find((p) => p.id === due.id).status, 'A_ENCAISSER');
P.recordPayment(due.id, { method: 'GUICHET', receiptNo: 'RC-CAISSE-1' });
assert.throws(() => P.validatePayment(due.id), /autre personne/);
as(U.oic);
assert.equal(P.validatePayment(due.id).status, 'VALIDE');
assert.throws(() => P.validatePayment(due.id), /Seul un encaissement saisi/);
as(U.cashier);
assert.equal(P.validatePayment(salePay.id).status, 'VALIDE', 'vente au guichet saisie par l’agent, validée par la caisse');
// Frais DUT à l'unité.
assert.throws(() => P.recordDutFees({ partnerId: 'p1', dutIds: ['d1'], method: 'GUICHET' }), /reçu/);
assert.throws(() => P.recordDutFees({ partnerId: 'p2', dutIds: ['d1'], method: 'GUICHET', receiptNo: 'RC-F1' }), /n’appartient pas/);
const fees = P.recordDutFees({ partnerId: 'p1', dutIds: ['d1'], method: 'GUICHET', receiptNo: 'RC-F1' });
assert.equal(fees.kind, 'FRAIS_DUT'); assert.equal(fees.ttc, amountsFor(1).ttc);
assert.throws(() => P.recordDutFees({ partnerId: 'p1', dutIds: ['d1'], method: 'GUICHET', receiptNo: 'RC-F2' }), /déjà été réglé/);
as(U.agentB);
assert.ok(P.listPayments({}).every((p) => p.antennaId === 'a2'), 'l’antenne ne voit que ses encaissements');
console.log('Caisse : créances, paiement simulé du partenaire, encaissement au guichet, rejet motivé, validation par une autre personne, frais DUT validés.');

// ---------------------------------------------------------------- Rapport des ventes
as(U.p1);
assert.throws(() => P.salesReport({}), /réservé/);
as(U.cashier);
const report = P.salesReport({ groupBy: 'antenne' });
const sum = report.rows.reduce((t, r) => t + r.ttc, 0);
assert.equal(report.total.ttc, sum);
assert.equal(report.total.ttc, report.total.ht + report.total.tva + report.total.timbre);
assert.ok(report.grouped.some((g) => g.label === 'ANTENNE A PLATEAU'));
assert.ok(P.salesReport({ clientId: 't2' }).rows.length && P.salesReport({ clientId: 't2' }).rows.every((r) => r.transporterId === 't2' && r.clientType === 'TRANSPORTEUR'));
assert.ok(P.salesReport({ clientId: 'p1' }).rows.every((r) => r.partnerId === 'p1'));
assert.ok(P.salesReport({ groupBy: 'client' }).grouped.some((g) => g.label === 'TRANSPORTEUR UN'));
assert.ok(P.listPayments({ clientId: 't1' }).every((p) => p.transporterId === 't1'));
console.log('Rapport des ventes : HT, TVA, timbre et TTC cohérents, filtres et regroupements validés.');

// ---------------------------------------------------------------- Rapprochement
as(U.p1);
assert.throws(() => Rec.reconcile({ partnerId: 'p2' }), /périmètre/);
const rec = Rec.reconcile({ from: '', to: '' });
assert.equal(rec.partner.id, 'p1');
assert.ok(rec.totals.dutEdites >= 2);
assert.ok(rec.ecarts.some((e) => e.code === 'COMPTEUR'), 'compteur de la plage ≠ DUT retrouvés');
const gap = rec.ecarts[0];
assert.throws(() => Rec.justify('p1', gap.key, 'ok'), /5 caractères/);
Rec.justify('p1', gap.key, 'Numéros consommés avant la reprise des données.');
assert.ok(Rec.reconcile({}).ecarts.find((e) => e.key === gap.key).justification);
as(U.agent);
assert.throws(() => Rec.reconcile({ partnerId: 'p1' }), /non autorisé/);
as(U.cashier);
assert.ok(Rec.reconcile({ partnerId: 'p1' }).ecarts.some((e) => e.code === 'IMPAYE' && e.label.includes('OP-0')), 'plage sans créance réglée signalée');
console.log('Rapprochement : périmètre, numéros achetés, DUT, préimprimés, paiements, écarts et justification validés.');

// ---------------------------------------------------------------- Sites
as(U.agent);
assert.throws(() => Sites.saveSite(null, { name: 'Port', code: 'P-1', type: 'PORT', antennaId: 'a1', lat: 5.25, lng: -4.0 }), /administration OIC/);
as(U.oic);
assert.throws(() => Sites.saveSite(null, { name: 'Port', code: 'P-1', type: 'AEROPORT', antennaId: 'a1', lat: 5.25, lng: -4.0 }), /type/);
const site = Sites.saveSite(null, { name: 'Port test', code: 'P-1', type: 'PORT', antennaId: 'a1', lat: 5.25, lng: -4.0 });
Sites.saveSite(null, { name: 'Gare B', code: 'G-B', type: 'GARE', antennaId: 'a2', lat: 7.69, lng: -5.03 });
as(U.agent);
assert.deepEqual(Sites.listSites().map((s) => s.code), ['P-1'], 'l’agent voit les sites de son antenne');
as(U.oic);
assert.throws(() => Sites.setSiteActive(site.id, false, ''), /motif/);
console.log('Sites : référentiel par antenne, droits et périmètre validés.');

// ---------------------------------------------------------------- Désactivation et fermeture
const checks = A.closureChecks('a1');
assert.ok(['AGENTS', 'STOCK', 'SITES'].every((c) => checks.blocking.some((b) => b.code === c)));
assert.throws(() => A.setAntennaStatus('a1', { status: 'CLOSED', reason: 'Regroupement', date: '2026-10-31' }), /Fermeture impossible/);
assert.throws(() => A.setAntennaStatus('a1', { status: 'INACTIVE', reason: '', date: '2026-10-31' }), /motif/);
A.setAntennaStatus('a1', { status: 'INACTIVE', reason: 'Travaux', date: '2026-10-20' });
as(U.agent);
assert.throws(() => R.transferRange({ antennaId: 'a1', transporterId: 't1', start: 230, quantity: 5, receiptNo: 'RC-5' }), /désactivée ou fermée/);
as(U.oic);
assert.throws(() => R.allocateToAntenna('a1', 10), /désactivée ou fermée/);
A.setAntennaStatus('a1', { status: 'ACTIVE', reason: 'Fin des travaux', date: '2026-10-25' });
await A.reassignAgents('a1', 'a2');
assert.ok(readObject(STORAGE_KEYS.USERS).filter((u) => ['ag1', 'ag2'].includes(u.id)).every((u) => u.antennaId === 'a2'));
assert.equal(listAntennas().find((x) => x.id === 'a1').chef.name, '', 'encadrement libéré après réaffectation');
R.revokeAntennaStock('a1', 'Fermeture');
Sites.setSiteActive(site.id, false, 'Site transféré');
assert.deepEqual(A.closureChecks('a1').blocking.map((b) => b.code), ['DUT'], 'reste un dossier en attente de validation');
writeObject(STORAGE_KEYS.DUT_LIST, getAllDuts().map((d) => (d.id === 'd3' ? { ...d, status: 'REJETE' } : d)));
assert.ok(A.closureChecks('a1').canClose);
A.setAntennaStatus('a1', { status: 'CLOSED', reason: 'Regroupement avec B', date: '2026-10-31' });
assert.ok(!listAntennas().some((x) => x.id === 'a1'), 'antenne fermée retirée de la carte');
assert.throws(() => A.updateAntenna('a1', { name: 'Réouverture', code: 'OIC-A', city: 'x', lat: 5.3, lng: -4 }), /fermée/);
assert.throws(() => A.setAntennaStatus('a1', { status: 'ACTIVE', reason: 'Non', date: '2026-11-01' }), /déjà fermée/);
// Ouverture d'un compte d'antenne : mot de passe initial et désignation du chef.
const opened = await A.openAntennaAccount('a2', { name: 'Chef B', email: 'chef.b@t.ci', asChef: true });
assert.match(opened.code, /^OIC-/);
assert.equal(listAntennas().find((x) => x.id === 'a2').chef.userId, opened.user.id);
console.log('Antennes : désactivation, réactivation, réaffectation des agents, reprise du stock, fermeture contrôlée et ouverture de compte validées.');

// ---------------------------------------------------------------- Tarifs
as(U.cashier);
assert.throws(() => savePricing({ unitHT: 3000, quantity: 100, tvaRate: 18, stamp: 100, antennaQuantity: 500 }), /administrateur OIC/);
as(U.oic);
assert.throws(() => savePricing({ unitHT: 3000, quantity: 100, tvaRate: 180, stamp: 100, antennaQuantity: 500 }), /TVA/);
savePricing({ unitHT: 3000, quantity: 120, tvaRate: 18, stamp: 200, antennaQuantity: 400 });
assert.deepEqual(amountsFor(10), { quantity: 10, unitHT: 3000, tvaRate: 18, ht: 30000, tva: 5400, stamp: 200, ttc: 35600 });
assert.equal(P.salesReport({}).rows.find((r) => r.id === direct.id).ttc, direct.amounts.ttc, 'ventes passées figées');
console.log('Tarifs : droits, contrôles et montants figés validés.');
