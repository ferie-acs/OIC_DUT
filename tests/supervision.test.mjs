import assert from 'node:assert/strict';
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear(), key: (i) => [...store.keys()][i], get length() { return store.size; } };
globalThis.window = { matchMedia: () => ({ matches: false }), crypto: globalThis.crypto };
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true });
globalThis.document ??= { createElement: () => ({ style: {} }) };

const { antennaLeadership } = await import('../js/data/antennas.js');
const { seedDemoData, ensureSignedDemoData } = await import('../js/seed.js');
const { getAllAntennas } = await import('../js/repositories/antennas.repository.js');
const { getAllDuts } = await import('../js/repositories/dut.repository.js');
const S = await import('../js/services/supervision.service.js');

// Chef d'antenne de démonstration : déterministe, distinct par antenne.
const a0 = antennaLeadership(0, 'ABIDJAN SIEGE'), a1 = antennaLeadership(1, 'ABIDJAN YOPOUGON');
assert.ok(a0.chef.name && a0.chef.phone && a0.chef.email.endsWith('@oic.ci'));
assert.notEqual(a0.chef.name, a1.chef.name);
assert.deepEqual(antennaLeadership(0, 'ABIDJAN SIEGE'), a0, 'même entrée, même sortie');
assert.ok(a0.effectif >= 2);

seedDemoData();
await ensureSignedDemoData();
const antennas = getAllAntennas();
assert.ok(antennas.every((a) => a.chef?.name), 'chaque antenne a un chef après ensemencement');

// Vue d'ensemble des antennes : une ligne par antenne, volumes cohérents avec les DUT.
const rows = S.antennasOverview();
assert.equal(rows.length, antennas.length);
assert.equal(rows.reduce((n, r) => n + r.duts, 0), getAllDuts().filter((d) => d.antennaId && !d.canary).length);
const top = [...rows].sort((a, b) => b.duts - a.duts)[0];
assert.ok(top.duts > 0);
assert.ok(['rang', 'controles', 'refus', 'aRelire', 'delaiRelectureH', 'partenaires'].every((k) => k in top));
assert.equal(top.rang, 1);

// Fiche antenne : identité, chiffres, listes, journal.
const p = S.antennaProfile(top.id);
assert.equal(p.antenna.id, top.id);
assert.equal(p.stats.duts.total, top.duts);
assert.ok(p.stats.duts.parStatut.VALIDE >= 1);
assert.ok(p.partenaires.length >= 1);
assert.ok(Array.isArray(p.derniersDuts) && p.derniersDuts.length <= 10);
assert.ok(Array.isArray(p.derniersControles));
assert.ok(Array.isArray(p.journal) && p.journal.every((e) => e.date && e.label));
assert.equal(S.antennaProfile('inconnue'), null);

// Partenaires, agents de contrôle, transporteurs : même contrat liste → fiche.
const partners = S.partnersOverview();
assert.ok(partners.length >= 2 && partners.every((r) => 'duts' in r && 'numerosConsommes' in r && 'tauxRejet' in r));
const pp = S.partnerProfile(partners[0].id);
assert.ok(pp.partner && pp.stats.duts.total === partners[0].duts && Array.isArray(pp.plages) && Array.isArray(pp.journal));
const ctrls = S.controllersOverview();
assert.ok(ctrls.length >= 1 && ctrls.every((r) => 'scans' in r && 'verdicts' in r && 'derogations' in r));
const cp = S.controllerProfile(ctrls[0].id);
assert.ok(cp.user && cp.stats.scans === ctrls[0].scans && Array.isArray(cp.derniersControles));
const tr = S.transportersOverview();
assert.ok(tr.length >= 1 && tr.every((r) => 'duts' in r && 'controles' in r && 'vehicules' in r));
const tp = S.transporterProfile(tr[0].id);
assert.ok(tp.transporter && Array.isArray(tp.derniersDuts) && Array.isArray(tp.vehicules));

// Export CSV : séparateur point-virgule, guillemets échappés, une ligne d'en-tête.
assert.equal(S.toCsv([{ a: 1, b: 'x;y' }, { a: 2, b: 'dit "ok"' }]), 'a;b\n1;"x;y"\n2;"dit ""ok"""');
console.log('Supervision : chefs d’antenne, vues d’ensemble et fiches des quatre acteurs, export CSV.');
