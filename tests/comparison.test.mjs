import assert from 'node:assert/strict';
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear(), key: (i) => [...store.keys()][i], get length() { return store.size; } };
globalThis.window = { matchMedia: () => ({ matches: false }), crypto: globalThis.crypto };
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true });
globalThis.document ??= { createElement: () => ({ style: {} }) };
const { seedDemoData, ensureSignedDemoData } = await import('../js/seed.js');
const C = await import('../js/services/comparison.service.js');
seedDemoData(); await ensureSignedDemoData();

// Catalogue : chaque indicateur a une clé, un libellé, un groupe, une unité ; les types d'entités listent leurs membres.
assert.ok(C.INDICATORS.length >= 20 && C.INDICATORS.every((i) => i.key && i.label && i.group));
assert.ok(C.indicatorsFor('partenaires').length > C.indicatorsFor('controleurs').length, 'les agents n’ont que les indicateurs de contrôle');
const partners = C.entitiesOf('partenaires');
assert.ok(partners.length >= 2 && partners.every((e) => e.id && e.name));
assert.ok(C.entitiesOf('controleurs').length >= 1 && C.entitiesOf('antennes').length >= 20 && C.entitiesOf('transporteurs').length >= 1);

// Comparaison : une ligne par entité, une valeur par indicateur, le meilleur signalé.
const res = C.compare('partenaires', partners.map((p) => p.id), ['dutCrees', 'dutValides', 'tauxRejet', 'tonnage'], {});
assert.equal(res.rows.length, partners.length);
assert.ok(res.rows.every((r) => ['dutCrees', 'dutValides', 'tauxRejet', 'tonnage'].every((k) => typeof r.values[k] === 'number')));
assert.equal(res.rows.reduce((n, r) => n + r.values.dutCrees, 0), C.compare('partenaires', partners.map((p) => p.id), ['dutCrees'], {}).rows.reduce((n, r) => n + r.values.dutCrees, 0));
assert.ok(res.best.dutCrees && res.rows.some((r) => r.id === res.best.dutCrees));
assert.ok(res.best.tauxRejet, 'pour un taux de rejet, le meilleur est le plus bas');
assert.equal(res.rows.find((r) => r.id === res.best.tauxRejet).values.tauxRejet, Math.min(...res.rows.map((r) => r.values.tauxRejet)));

// Séries mensuelles : une série par entité, mêmes mois pour toutes.
const series = C.monthlySeries('partenaires', partners.map((p) => p.id), 'dutCrees', {});
assert.equal(series.series.length, partners.length);
assert.ok(series.months.length >= 1 && series.series.every((s) => s.values.length === series.months.length));

// Agents de contrôle : comparaison sur les indicateurs de contrôle.
const agents = C.entitiesOf('controleurs');
const ra = C.compare('controleurs', agents.map((a) => a.id), ['scans', 'tauxRefus'], {});
assert.equal(ra.rows.length, agents.length);
console.log('Comparateur : catalogue d’indicateurs, entités par type, comparaison et séries mensuelles.');
