// Graphiques du tableau de bord de la Direction générale : séries calculées par le service, historique de
// démonstration (idempotent, sans écart de rapprochement), droits et pilotage par la période.
import assert from 'node:assert/strict';
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear(), key: (i) => [...store.keys()][i], get length() { return store.size; } };
globalThis.window = { matchMedia: () => ({ matches: false }), crypto: globalThis.crypto, addEventListener: () => {} };
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true });
globalThis.document ??= { createElement: () => ({ style: {} }) };

// ---------------------------------------------------------------- Fonctions pures
const C = await import('../js/services/direction-charts.service.js');

const m6 = C.trendMonths({ from: '2026-09-15', to: '2026-10-14' });
assert.deepEqual(m6.map((m) => m.key), ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'], 'au moins six mois, jusqu’au mois de fin');
assert.equal(m6[0].from, '2026-05-01');
assert.equal(m6.at(-1).to, '2026-10-14', 'le dernier mois s’arrête à la fin de la période');
assert.equal(m6[1].to, '2026-06-30');
assert.equal(m6[0].title, 'mai 2026');
const m10 = C.trendMonths({ from: '2026-01-01', to: '2026-10-14' });
assert.equal(m10.length, 10, 'une période plus longue que six mois est entièrement couverte');
assert.deepEqual(C.trendMonths({ from: '2026-12-20', to: '2027-01-10' }).map((m) => m.key), ['2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01'], 'changement d’année');

assert.deepEqual(C.countByMonth([{ at: '2026-05-03T10:00:00Z' }, { at: '2026-05-31T23:00:00Z' }, { at: '2026-10-15T08:00:00Z' }, { at: null }], (x) => x.at, m6), [2, 0, 0, 0, 0, 0], 'hors période et dates absentes ignorées');
assert.deepEqual(C.countByMonth([{ at: '2026-06-02', v: 1000 }, { at: '2026-06-20', v: 500 }], (x) => x.at, m6, (x) => x.v), [0, 1500, 0, 0, 0, 0]);
assert.deepEqual(C.activeAntennasByMonth([{ antennaId: 'a', createdAt: '2026-05-02' }, { antennaId: 'a', createdAt: '2026-05-09' }, { antennaId: 'b', createdAt: '2026-05-10' }, { antennaId: 'c', createdAt: '2026-05-11', canary: true }], m6), [2, 0, 0, 0, 0, 0], 'antennes distinctes, DUT pièges exclus');
assert.equal(C.firstActiveMonth([0, 0, 0, 0, 3, 5, 2, 1, 4, 2]), 4, 'mois antérieurs à toute activité omis');
assert.equal(C.firstActiveMonth([0, 0, 0, 0, 0, 0, 0, 0, 1, 2]), 4, 'mais au moins six mois tracés');
assert.equal(C.firstActiveMonth([0, 0, 0]), 0);

const comp = C.composition([{ key: 'A', value: 1 }, { key: 'B', value: 2 }, { key: 'C', value: 0 }]);
assert.equal(comp.total, 3);
assert.deepEqual(comp.parts.map((p) => p.share), [33.3, 66.7, 0]);
assert.equal(C.composition([{ key: 'A', value: 0 }]).parts[0].share, 0, 'total nul : pas de division par zéro');

const inc = C.incidentsByStateAndSeverity([
  { status: 'CLOS', severity: 'MINEURE', declaredAt: '2026-10-01T08:00:00Z' },
  { status: 'CLOS', severity: 'CRITIQUE', declaredAt: '2026-10-02T08:00:00Z' },
  { status: 'DECLARE', severity: 'CRITIQUE', declaredAt: '2026-10-03T08:00:00Z' },
  { status: 'CLOS', severity: 'MAJEURE', declaredAt: '2026-08-01T08:00:00Z' },
], { from: '2026-09-15', to: '2026-10-14' });
assert.equal(inc.total, 3, 'seuls les incidents déclarés sur la période');
assert.equal(inc.etats.length, inc.series[0].values.length);
const sev = Object.fromEntries(inc.series.map((s) => [s.key, s.values]));
assert.equal(sev.CRITIQUE[inc.etats.indexOf('Clos')], 1);
assert.equal(sev.CRITIQUE[inc.etats.indexOf('Déclaré')], 1);
assert.equal(sev.MAJEURE.reduce((a, b) => a + b, 0), 0);
assert.equal(inc.etatsCourts[inc.etats.indexOf('Résolu, à vérifier')], 'À vérifier');

const acts = C.actionsByState([{ status: 'EN_COURS', late: true }, { status: 'EN_COURS', late: false }, { status: 'REALISEE', late: false }]);
assert.deepEqual(acts.find((a) => a.key === 'EN_COURS'), { key: 'EN_COURS', label: 'En cours', enRetard: 1, dansLesDelais: 1, total: 2 });
assert.equal(acts.find((a) => a.key === 'A_LANCER').total, 0, 'tous les états figurent, même vides');
assert.deepEqual(C.equipmentByState([{ status: 'EN_SERVICE' }, { status: 'EN_PANNE' }, { status: 'EN_SERVICE' }]).map((x) => x.value), [2, 1, 0, 0]);
assert.equal(C.periodPhrase({ kind: '30j', label: '30 derniers jours' }), 'les 30 derniers jours');
assert.equal(C.periodPhrase({ kind: 'annee', label: 'Année 2026' }), 'l’année 2026');

// ---------------------------------------------------------------- Amorçage complet, dans l'ordre de js/app.js
const { seedDemoData, ensureSignedDemoData } = await import('../js/seed.js');
seedDemoData();
(await import('../js/seed-lot-d3.js')).seedLotD3();
await ensureSignedDemoData();
(await import('../js/services/antenna-directory.service.js')).syncAntennaDirectory();
(await import('../js/seed-lot-d2.js')).seedLotD2();
(await import('../js/seed-lot-d4.js')).seedLotD4();
(await import('../js/seed-lot-d5.js')).installLotD5Seed();

const { readCollection, writeObject } = await import('../js/core/storage.js');
const { STORAGE_KEYS } = await import('../js/core/constants.js');
const as = (email) => { const u = readCollection(STORAGE_KEYS.USERS).find((x) => x.email === email); assert.ok(u, email); const { credential, ...s } = u; writeObject(STORAGE_KEYS.CURRENT_USER, s); return u; };
const S = await import('../js/services/synthesis.service.js');

as('direction@demo.oic.ci');
const recBefore = S.directionSynthesis({ periodKind: 'annee' }).rapprochement;
const sizes = () => [STORAGE_KEYS.DUT_LIST, STORAGE_KEYS.OPERATIONS, STORAGE_KEYS.PAYMENTS, STORAGE_KEYS.CONTROL_LOGS, STORAGE_KEYS.PLATFORM_INCIDENTS, STORAGE_KEYS.PILOT_ACTIONS].map((k) => readCollection(k).length);
const before = sizes();

const { seedGraphiquesDirection, GRAPHIQUES_DG_SEED_KEY } = await import('../js/seed-graphiques-direction.js');
assert.equal(await seedGraphiquesDirection(), true);
const after = sizes();
assert.ok(after.every((n, i) => n > before[i]), 'historique ajouté : DUT, plages, paiements, contrôles, incidents, actions');
assert.equal(await seedGraphiquesDirection(), false, 'marqueur posé');
store.delete(GRAPHIQUES_DG_SEED_KEY);
const snapshot = new Map(store);
await seedGraphiquesDirection();
for (const [k, v] of store) if (k !== GRAPHIQUES_DG_SEED_KEY) assert.equal(v, snapshot.get(k), `amorçage idempotent (${k})`);

// Cohérence : numéros dans les plages, plages entièrement consommées, aucun nouvel écart de rapprochement.
const duts = readCollection(STORAGE_KEYS.DUT_LIST).filter((d) => d.id.startsWith('dg-'));
const ops = readCollection(STORAGE_KEYS.OPERATIONS).filter((o) => o.id.startsWith('dg-'));
assert.ok(duts.length >= 60 && ops.length >= 8);
assert.equal(new Set(readCollection(STORAGE_KEYS.DUT_LIST).filter((d) => d.dutNumber).map((d) => d.dutNumber)).size, readCollection(STORAGE_KEYS.DUT_LIST).filter((d) => d.dutNumber).length, 'numéros uniques');
ops.forEach((o) => { const mine = duts.filter((d) => d.operationId === o.id); assert.equal(mine.length, o.used); assert.equal(o.used, o.quantity); mine.forEach((d) => { const n = Number(d.dutNumber.slice(-6)); assert.ok(n >= o.rangeStart && n <= o.rangeEnd, d.dutNumber); }); });
assert.ok(duts.filter((d) => d.status === 'VALIDE').every((d) => d.qrSigned), 'charges signées');
assert.ok(duts.every((d) => Date.parse(d.createdAt) < Date.now() && ['VALIDE', 'REJETE'].includes(d.status)), 'historique passé, sans dossier en attente');
const recAfter = S.directionSynthesis({ periodKind: 'annee' }).rapprochement;
assert.equal(recAfter.ecartsOuverts, recBefore.ecartsOuverts, 'l’historique ne crée aucun écart de rapprochement');

// ---------------------------------------------------------------- Séries du tableau de bord
const d30 = C.directionCharts({ periodKind: '30j' });
assert.equal(d30.mois.length, 6);
const lengths = Object.entries(d30.tendances).filter(([, v]) => v).map(([k, v]) => [k, v.length]);
assert.ok(lengths.every(([, n]) => n === 6), `séries alignées sur les mois : ${JSON.stringify(lengths)}`);
assert.ok(d30.tendances.dutCrees.filter((x) => x > 0).length >= 5, 'courbe des DUT sur au moins cinq mois');
assert.ok(d30.tendances.scans.filter((x) => x > 0).length >= 5);
assert.ok(d30.tendances.incidentsDeclares.filter((x) => x > 0).length >= 5);
assert.ok(d30.tendances.ventesTTC.filter((x) => x > 0).length >= 5);
assert.ok(d30.tendances.pannes.filter((x) => x > 0).length >= 4);
d30.tendances.ventesTTC.forEach((v, i) => assert.ok(d30.tendances.encaisseValide[i] <= v, 'encaissé validé ≤ vendu'));
// Le mois en cours de la courbe recoupe la tuile : DUT édités du mois = statistiques du mois.
const { computeStatistics } = await import('../js/services/statistics.service.js');
const last = C.trendMonths(d30.synthese.period).at(-1);
assert.equal(d30.tendances.dutCrees.at(-1), computeStatistics({ from: last.from, to: last.to }).documentaire.entonnoir.crees);
assert.equal(d30.antennes.dutValides.reduce((n, a) => n + a.value, 0), d30.synthese.antennes.reduce((n, a) => n + a.dutValides, 0), 'barres par antenne = synthèse');
assert.ok(d30.antennes.dutValides.every((a, i, l) => i === 0 || l[i - 1].value >= a.value), 'barres triées');
assert.equal(d30.antennes.cibleObjectifs, 100);
assert.ok(d30.antennes.objectifs.every((a) => a.value <= 100));
assert.equal(d30.objectifs.total, d30.synthese.objectifs.parAntenne.reduce((n, a) => n + a.objectifs, 0));
assert.equal(d30.actions.repartition.parts.find((p) => p.key === 'RETARD').value, d30.synthese.objectifs.actionsEnRetard);
assert.equal(d30.equipements.reduce((n, x) => n + x.value, 0), d30.synthese.equipements.total);
assert.equal(d30.rapprochement.repartition.parts.filter((p) => p.key !== 'JUSTIFIE').reduce((n, p) => n + p.value, 0), d30.synthese.rapprochement.ecartsOuverts);
assert.equal(d30.groupements.series.find((x) => x.key === 'ACTIF').values[0], d30.synthese.groupements.partenaires.actifs);
assert.equal(d30.validations.find((x) => x.short === 'Documents').value, d30.synthese.validations.documents);
assert.equal(d30.stock.reduce((n, x) => n + x.value, 0), d30.synthese.ventes.stock.total);

// La période pilote les graphiques.
const dAn = C.directionCharts({ periodKind: 'annee' });
assert.ok(dAn.incidents.total > d30.incidents.total, 'incidents de l’année > incidents des 30 jours');
assert.ok(dAn.antennes.dutValides[0].value > d30.antennes.dutValides[0].value, 'barres par antenne recalculées pour la période');
assert.ok(dAn.mois.length >= 6 && dAn.tendances.dutCrees[0] > 0, 'l’année commence au premier mois d’activité');
assert.equal(dAn.periode, `l’année ${new Date().getUTCFullYear()}`);

// ---------------------------------------------------------------- Droits
as('oic.admin@demo.oic.ci');
assert.ok(C.directionCharts().mois.length >= 6, 'l’administrateur OIC a le droit de pilotage');
for (const email of ['partner.admin@demo.oic.ci', 'antenne.agent@demo.oic.ci', 'controle.agent@demo.oic.ci']) {
  as(email);
  assert.throws(() => C.directionCharts(), /rôle/, `refus pour ${email}`);
}
writeObject(STORAGE_KEYS.CURRENT_USER, null);
assert.throws(() => C.directionCharts(), /Connectez-vous/);

console.log('direction-graphiques : OK');
