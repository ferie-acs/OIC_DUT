// Intégration des lots d0 à d5 (plateforme DUT) : amorçage complet dans l'ordre de js/app.js, messagerie unique,
// transporteurs suspendus, stock du transporteur de bout en bout (vente au guichet → règlement d'un DUT),
// droits du rôle Direction, agrégations des tableaux de bord de synthèse.
import assert from 'node:assert/strict';
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear(), key: (i) => [...store.keys()][i], get length() { return store.size; } };
globalThis.window = { matchMedia: () => ({ matches: false }), crypto: globalThis.crypto, addEventListener: () => {} };
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true });
globalThis.document ??= { createElement: () => ({ style: {} }) };

// ---------------------------------------------------------------- Amorçage dans l'ordre de l'application
const { seedDemoData, ensureSignedDemoData } = await import('../js/seed.js');
seedDemoData();
(await import('../js/seed-lot-d3.js')).seedLotD3();
await ensureSignedDemoData();
(await import('../js/services/antenna-directory.service.js')).syncAntennaDirectory();
(await import('../js/seed-lot-d2.js')).seedLotD2();
(await import('../js/seed-lot-d4.js')).seedLotD4();
(await import('../js/seed-lot-d5.js')).installLotD5Seed();
await (await import('../js/seed-lot-d1.js')).seedLotD1();

const { readCollection, writeObject } = await import('../js/core/storage.js');
const { STORAGE_KEYS, ROLES } = await import('../js/core/constants.js');
const { can, permissionsFor } = await import('../js/core/permissions.js');
const users = () => readCollection(STORAGE_KEYS.USERS);
const as = (email) => { const u = users().find((x) => x.email === email); assert.ok(u, email); const { credential, ...s } = u; writeObject(STORAGE_KEYS.CURRENT_USER, s); return u; };
const inbox = (email) => readCollection(STORAGE_KEYS.MESSAGES).filter((m) => m.to === email);

const R = await import('../js/services/ranges.service.js');
const Ref = await import('../js/services/referentials.service.js');
const L = await import('../js/services/dut-lifecycle.service.js');
const dutService = await import('../js/services/dut.service.js');
const I = await import('../js/services/incidents.service.js');
const E = await import('../js/services/equipment.service.js');
const Rec = await import('../js/services/reconciliation.service.js');
const Pay = await import('../js/services/payments.service.js');
const O = await import('../js/services/objectives.service.js');
const S = await import('../js/services/synthesis.service.js');
const { getAllOperations, saveOperations } = await import('../js/repositories/operations.repository.js');
const { findDutById } = await import('../js/repositories/dut.repository.js');

// Tous les comptes de démonstration se connectent et ont un rôle connu.
const { DEMO_ACCOUNTS } = await import('../js/seed.js');
for (const a of DEMO_ACCOUNTS) assert.ok(users().some((u) => u.email === a.email && ROLES[u.role]), `compte de démonstration ${a.email}`);

const T = Object.fromEntries(readCollection(STORAGE_KEYS.TRANSPORTERS).map((t) => [t.name, t]));
const abc = T['ABC TRANSPORT CI'];
const transporteur = users().find((u) => u.email === 'transporteur@demo.oic.ci');
assert.equal(transporteur.transporterId, abc.id, 'le compte transporteur de démonstration est ABC TRANSPORT CI');
const agent = users().find((u) => u.email === 'antenne.agent@demo.oic.ci');

// ---------------------------------------------------------------- Transporteurs suspendus (lot d1) hors des saisies (lots d2, d3)
{
  const ivoire = T['IVOIRE LOGISTIQUE SA'];
  const TS = await import('../js/services/transporters.service.js');
  const PS = await import('../js/services/partners.service.js');
  as('oic.admin@demo.oic.ci');
  assert.ok(R.listTransporterClients().some((t) => t.id === ivoire.id));
  assert.ok(Ref.transporters.selectable({ all: true }).some((t) => t.id === ivoire.id));
  TS.suspendTransporter(ivoire.id, 'Contrôle de conformité en cours');
  const suspended = readCollection(STORAGE_KEYS.TRANSPORTERS).find((t) => t.id === ivoire.id);
  assert.equal(suspended.status, 'SUSPENDU');
  assert.equal(Ref.isSelectable(suspended), false, 'un transporteur suspendu n’est plus sélectionnable');
  assert.ok(!R.listTransporterClients().some((t) => t.id === ivoire.id), 'plus proposé à la vente de plages');
  assert.ok(!Ref.transporters.selectable({ all: true }).some((t) => t.id === ivoire.id), 'plus proposé dans les référentiels de saisie des DUT');
  as('antenne.agent@demo.oic.ci');
  assert.ok(!L.counterUsagers().transporteurs.some((t) => t.id === ivoire.id), 'plus proposé au guichet');
  const stock = R.antennaStock(agent.antennaId);
  assert.throws(() => R.transferRange({ antennaId: agent.antennaId, transporterId: ivoire.id, start: stock.firstAvailable, quantity: 1, receiptNo: 'RC-SUSP' }), /suspendu/);
  as('oic.admin@demo.oic.ci');
  TS.reactivateTransporter(ivoire.id, 'Conformité vérifiée');
  assert.ok(R.listTransporterClients().some((t) => t.id === ivoire.id), 'réactivé, il est de nouveau proposé');
  // Un partenaire suspendu n'est plus proposé au guichet.
  const transcargo = readCollection(STORAGE_KEYS.PARTNERS).find((p) => p.name === 'TRANSCARGO SARL');
  PS.suspendPartner(transcargo.id, 'Contrôle de conformité en cours');
  as('antenne.agent@demo.oic.ci');
  assert.ok(!L.counterUsagers().partenaires.some((p) => p.id === transcargo.id));
  as('oic.admin@demo.oic.ci');
  PS.reactivatePartner(transcargo.id, 'Conformité vérifiée');
}

// ---------------------------------------------------------------- Stock du transporteur : vente au guichet (d2) → « Mes références » (d3)
{
  as('transporteur@demo.oic.ci');
  // On épuise le stock d'essai pour que la référence réglée provienne bien de la plage vendue au guichet.
  saveOperations(getAllOperations().map((o) => (o.transporterId === abc.id && o.status === 'VALIDATED' ? { ...o, used: o.quantity } : o)));
  assert.equal(L.referenceStock(abc.id).available, 0);

  as('antenne.agent@demo.oic.ci');
  const stock = R.antennaStock(agent.antennaId);
  const sale = R.transferRange({ antennaId: agent.antennaId, transporterId: abc.id, start: stock.firstAvailable, quantity: 10, receiptNo: 'RC-INTEG-01' });
  assert.equal(sale.status, 'TRANSFER_PENDING');
  as('transporteur@demo.oic.ci');
  assert.equal(L.referenceStock(abc.id).available, 0, 'une vente à valider ne fournit aucune référence');
  assert.ok(inbox('oic.admin@demo.oic.ci').some((m) => m.subject.includes(sale.code)), 'l’OIC est prévenu de la vente à valider');

  as('antenne.agent@demo.oic.ci');
  assert.throws(() => R.decideTransfer(sale.id, true), /autre personne|réservée/);
  as('oic.admin@demo.oic.ci');
  R.decideTransfer(sale.id, true);
  assert.ok(inbox('antenne.agent@demo.oic.ci').some((m) => m.subject.includes(`${sale.code} validée`)), 'l’agent est informé de la validation');
  assert.ok(inbox('transporteur@demo.oic.ci').some((m) => m.subject.includes('référence(s) DUT disponibles')), 'le transporteur est informé');

  as('transporteur@demo.oic.ci');
  const stockT = L.referenceStock(abc.id);
  assert.equal(stockT.available, 10, 'les 10 références vendues alimentent le stock du transporteur');
  assert.ok(stockT.operations.some((o) => o.id === sale.id));
  const expected = `DUT-CI-${sale.year}-${String(sale.rangeStart).padStart(6, '0')}`;
  assert.equal(stockT.next, expected, 'la prochaine référence est la première du bloc vendu');

  // Le transporteur crée, règle et soumet un DUT avec cette référence ; un agent de l'antenne le valide.
  const draft = L.createOwnDraft();
  // Saisie identique à celle des tests du lot d3 (rubriques de saisie seulement).
  dutService.saveDraft(draft.id, {
    general: { ...draft.general, immatriculation: 'AB-1234-CD', driverNom: 'KOUASSI', driverPrenoms: 'Jean', driverPermis: 'CI-PL-004521', driverPiece: '00219845102' },
    expediteur: { ...draft.expediteur, raisonSociale: 'SOCIETE AFRICAINE DE NEGOCE' },
    destinataire: { ...draft.destinataire, raisonSociale: 'INDUSTRIES DU NORD' },
    marchandises: [{ id: 'm1', nature: 'Cacao', emballage: 'Sacs', quantite: 100, poidsTonnes: 20, volumeM3: 30, valeur: 1000000, devise: 'FCFA' }],
    facturation: { expediteur: { prixTransport: 350000, accessoires: 0, complementaires: 0, autres: 0, tva: 18, timbre: 100 }, destinataire: { prixTransport: 0, accessoires: 0, complementaires: 0, autres: 0, tva: 18, timbre: 0 } },
    trajet: { ...draft.trajet, chargement: { ...draft.trajet.chargement, ville: 'Abidjan' }, dechargement: { ...draft.trajet.dechargement, ville: 'Bouaké' } },
  });
  const paid = L.payAndSubmit(draft.id, { reference: expected, antennaId: agent.antennaId });
  assert.equal(paid.status, 'TERMINE');
  assert.equal(paid.payment.reference, expected);
  assert.equal(paid.payment.operationId, sale.id, 'la référence est débitée de la plage vendue au guichet');
  assert.equal(L.referenceStock(abc.id).available, 9);

  as('antenne.agent@demo.oic.ci');
  const validated = await dutService.validate(paid.id);
  assert.equal(validated.dutNumber, expected, 'le numéro du DUT validé est la référence achetée au guichet');

  // Annulation : l'éditeur (transporteur) est prévenu par la messagerie unique.
  dutService.withdraw(paid.id, 'Transport annulé par le chargeur');
  assert.equal(findDutById(paid.id).status, 'RETIRE');
  assert.ok(inbox('transporteur@demo.oic.ci').some((m) => m.subject.includes('annulé')), 'le transporteur est informé de l’annulation');
}

// ---------------------------------------------------------------- Messagerie unique : incidents (d4) et contrats d'objectifs (d5)
{
  as('oic.admin@demo.oic.ci');
  const inc = I.listIncidents().find((i) => i.status === 'QUALIFIE') || I.listIncidents().find((i) => ['QUALIFIE', 'ATTRIBUE', 'EN_TRAITEMENT'].includes(i.status));
  assert.ok(inc, 'un incident attribuable');
  const target = I.assignableUsers(inc).find((u) => u.email === 'antenne.agent@demo.oic.ci') || I.assignableUsers(inc).find((u) => u.role === 'OIC_ADMIN' && u.email !== 'oic.admin@demo.oic.ci');
  I.assignIncident(inc.id, { team: Object.keys(I.RESOLUTION_TEAMS)[0], assigneeId: target.id });
  assert.ok(inbox(target.email).some((m) => m.subject.includes(`${inc.reference} attribué`) && m.origin === 'Incidents'), 'le responsable attribué est prévenu');
  const overdueAlerts = readCollection(STORAGE_KEYS.MESSAGES).filter((m) => m.origin === 'Incidents' && m.subject.includes('délai dépassé'));
  assert.ok(overdueAlerts.length > 0, 'les incidents en retard ont donné lieu à une alerte');
  const count = overdueAlerts.length;
  I.scanDeadlines();
  assert.equal(readCollection(STORAGE_KEYS.MESSAGES).filter((m) => m.origin === 'Incidents' && m.subject.includes('délai dépassé')).length, count, 'une seule alerte par incident');

  const contract = O.saveContract({ title: 'Contrat d’intégration', periodLabel: 'T4', from: new Date().toISOString().slice(0, 10), to: `${new Date().getFullYear()}-12-31`, lines: [{ assigneeType: 'ANTENNE', antennaId: agent.antennaId, indicatorId: O.listIndicators()[0].id, target: 10 }] });
  O.submitContract(contract.id);
  assert.ok(inbox('direction@demo.oic.ci').some((m) => m.subject.includes(`${contract.reference} à valider`)), 'la Direction est invitée à valider');
  as('direction@demo.oic.ci');
  O.validateContract(contract.id);
  assert.ok(inbox('oic.admin@demo.oic.ci').some((m) => m.subject.includes(`${contract.reference} validé`)), 'le préparateur est informé');
  assert.ok(inbox('antenne.agent@demo.oic.ci').some((m) => m.subject === 'Nouveaux objectifs pour votre antenne'), 'l’antenne est informée');
  // Les messages sont simulés et affichés comme tels.
  assert.ok(readCollection(STORAGE_KEYS.MESSAGES).every((m) => m.status === 'SIMULE'));
}

// ---------------------------------------------------------------- Rôle Direction : lecture seule hors pilotage, aucun droit DUT
{
  const direction = as('direction@demo.oic.ci');
  const perms = permissionsFor(ROLES.DIRECTION);
  assert.ok(!perms.some((p) => p.startsWith('dut.')), 'aucun droit sur les DUT');
  for (const p of ['incidents.read', 'equipment.view', 'equipment.read', 'fieldreports.view', 'reconciliation.view', 'sales.report']) assert.ok(can(direction, p), p);
  for (const p of ['incidents.declare', 'incidents.manage', 'incidents.treat', 'equipment.manage', 'equipment.retire', 'reconciliation.justify', 'payments.validate', 'payments.record', 'ranges.validate', 'ranges.transfer', 'dashboard.oic']) assert.ok(!can(direction, p), `pas de ${p}`);
  assert.ok(I.listIncidents().length > 0, 'la Direction lit tous les incidents');
  const one = I.listIncidents()[0];
  assert.ok(Object.values(I.allowedActions(one)).every((v) => !v), 'aucune action sur un incident');
  assert.throws(() => I.declareIncident({ category: 'APPLICATIF', title: 'Essai Direction', description: 'Déclaration refusée au rôle Direction.' }), /rôle/);
  assert.ok(I.performanceStats({ days: 30 }), 'le suivi des lenteurs est consultable');
  const eq = E.listEquipment();
  assert.ok(eq.length > 0, 'la Direction lit le parc national');
  assert.ok(eq.every((x) => Object.values(E.allowedActions(x)).every((v) => !v)), 'aucune action sur les équipements');
  assert.ok(Pay.salesReport({}).total.ventes >= 1, 'rapport des ventes consultable');
  const partner = Rec.partnerOptions()[0];
  const rec = Rec.reconcile({ partnerId: partner.id });
  assert.ok(Array.isArray(rec.ecarts));
  if (rec.ecarts[0]) assert.throws(() => Rec.justify(partner.id, rec.ecarts[0].key, 'Justification par la Direction'), /consulter/);
  await assert.rejects(async () => dutService.validate(readCollection(STORAGE_KEYS.DUT_LIST).find((d) => d.status === 'TERMINE').id), /Permission|rôle|autoris/i);
  assert.throws(() => dutService.withdraw(readCollection(STORAGE_KEYS.DUT_LIST).find((d) => d.status === 'VALIDE').id, 'essai'), /Permission/);
  // Les autres rôles gardent la justification des écarts.
  for (const role of ['OIC_ADMIN', 'CASHIER', 'PARTNER_ADMIN']) assert.ok(permissionsFor(role).includes('reconciliation.justify'), role);
}

// ---------------------------------------------------------------- Agrégations des tableaux de bord
{
  // Fonctions pures.
  assert.equal(S.median([5, 1, 3]), 3);
  assert.equal(S.median([4, 1, 3, 2]), 2.5);
  assert.equal(S.median([]), null);
  assert.equal(S.validationDelayH({ submittedAt: '2026-10-01T08:00:00Z', validatedAt: '2026-10-02T14:00:00Z' }), 30);
  assert.equal(S.validationDelayH({ submittedAt: '2026-10-02T08:00:00Z', validatedAt: '2026-10-01T08:00:00Z' }), null, 'dates incohérentes ignorées');
  const p = { from: '2026-10-01', to: '2026-10-31' };
  const agents = [{ id: 'a1', name: 'Agent Un' }, { id: 'a2', name: 'Agent Deux' }];
  const duts = [
    { id: 'd1', antennaId: 'X', guichet: { agentId: 'a1', at: '2026-10-03T09:00:00Z' }, createdAt: '2026-10-03T09:00:00Z', submittedAt: '2026-10-03T10:00:00Z', validatedAt: '2026-10-03T20:00:00Z', validatedBy: 'Agent Deux' },
    { id: 'd2', antennaId: 'X', createdAt: '2026-10-04T09:00:00Z', submittedAt: '2026-10-04T10:00:00Z', validatedAt: '2026-10-06T10:00:00Z', validatedBy: 'Agent Deux' },
    { id: 'd3', antennaId: 'X', createdAt: '2026-09-04T09:00:00Z', submittedAt: '2026-09-04T10:00:00Z', validatedAt: '2026-09-05T10:00:00Z', validatedBy: 'Agent Deux' },
    { id: 'd4', antennaId: 'Y', createdAt: '2026-10-04T09:00:00Z', submittedAt: '2026-10-04T10:00:00Z', validatedAt: '2026-10-04T12:00:00Z', validatedBy: 'Agent Un' },
    { id: 'd5', antennaId: 'X', canary: true, submittedAt: '2026-10-04T10:00:00Z', validatedAt: '2026-10-04T12:00:00Z', validatedBy: 'Agent Un' },
  ];
  const logs = [{ action: 'DUT_REJECTED', userId: 'a1', date: '2026-10-05T10:00:00Z' }, { action: 'DUT_REJECTED', userId: 'a1', date: '2026-08-05T10:00:00Z' }];
  const perf = S.agentPerformance({ agents, duts, logs, antennaId: 'X', period: p });
  const a1 = perf.find((x) => x.id === 'a1'), a2 = perf.find((x) => x.id === 'a2');
  assert.deepEqual([a1.saisis, a1.valides, a1.rejetes], [1, 0, 1], 'saisie au guichet et rejet dans la période ; autre antenne et DUT piège exclus');
  assert.deepEqual([a2.saisis, a2.valides, a2.delaiMedianH, a2.sous24h], [0, 2, 29, 50], 'délai médian de 10 h et 48 h, moitié sous 24 h ; validation hors période exclue');
  assert.equal(perf[0].id, 'a2', 'classement par activité');
  const obj = S.objectiveSummary([{ statut: 'ATTEINT', taux: 150 }, { statut: 'NON_ATTEINT', taux: 50 }, { statut: 'SANS_RESULTAT', taux: null }, { statut: 'PROCHE', taux: 90 }]);
  assert.deepEqual(obj, { objectifs: 4, atteints: 1, proches: 1, nonAtteints: 1, sansResultat: 1, taux: 80 }, 'taux global plafonné à 100 % par objectif');

  // Tableau de bord d'antenne sur les données de démonstration.
  as('antenne.agent@demo.oic.ci');
  const ant = S.antennaSynthesis({ periodKind: '90j' });
  assert.equal(ant.antenna.id, agent.antennaId);
  assert.ok(ant.agents.length >= 2 && ant.agents.every((x) => Number.isInteger(x.valides)), 'performance de chaque agent de l’antenne');
  assert.equal(ant.totals.valides, ant.agents.reduce((n, x) => n + x.valides, 0));
  assert.ok(ant.stock && Number.isInteger(ant.stock.disponible), 'stock de numéros');
  assert.equal(ant.incidents.ouverts, I.openIncidents({ antennaId: agent.antennaId }).length);
  assert.equal(ant.equipements.enPanne, E.brokenEquipment({ antennaId: agent.antennaId }).length);
  assert.ok(ant.objectifs.objectifs >= 1, 'objectifs de l’antenne en vigueur');
  as('direction@demo.oic.ci');
  assert.throws(() => S.antennaSynthesis(), /rôle/, 'tableau d’antenne réservé à l’agent d’antenne');

  // Tableau de bord de la Direction générale.
  const dg = S.directionSynthesis({ periodKind: '90j' });
  assert.ok(dg.antennes.length >= 1 && dg.antennesTotal >= 23);
  assert.equal(dg.incidents.ouverts, I.openIncidents().length);
  assert.equal(dg.equipements.enPanne, E.equipmentByAntenna().reduce((n, r) => n + r.broken, 0));
  assert.equal(dg.objectifs.actionsEnRetard, O.overdueActions().length);
  assert.ok(dg.ventes && dg.ventes.ttc === dg.ventes.ht + dg.ventes.tva + dg.ventes.timbre, 'ventes cohérentes (TTC = HT + TVA + timbre)');
  assert.equal(dg.rapprochement.ecartsOuverts, dg.rapprochement.rows.reduce((n, r) => n + r.ecartsOuverts, 0));
  const g = dg.groupements;
  assert.ok(g.partenaires.actifs >= 1 && g.partenaires.enAttente >= 1, 'partenaires actifs et en attente (amorçage du lot d1)');
  assert.equal(g.partenaires.total, readCollection(STORAGE_KEYS.PARTNERS).length);
  assert.ok(Number.isInteger(dg.validations.documents) && Number.isInteger(dg.validations.contratsObjectifs));
  as('oic.admin@demo.oic.ci');
  assert.ok(S.directionSynthesis(), 'l’administrateur OIC lit aussi la synthèse (droit de pilotage)');
  as('antenne.agent@demo.oic.ci');
  assert.throws(() => S.directionSynthesis(), /rôle/);
}

console.log('Intégration DUT : amorçage complet, messagerie unique, transporteurs suspendus, stock du transporteur de bout en bout, rôle Direction et tableaux de bord de synthèse validés.');
