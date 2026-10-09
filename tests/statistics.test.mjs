import assert from 'node:assert/strict';
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear(), key: (i) => [...store.keys()][i], get length() { return store.size; } };
globalThis.window = { matchMedia: () => ({ matches: false }), crypto: globalThis.crypto };
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true });
globalThis.document ??= { createElement: () => ({ style: {} }) };
const { seedDemoData, ensureSignedDemoData } = await import('../js/seed.js');
const { getAllDuts } = await import('../js/repositories/dut.repository.js');
const St = await import('../js/services/statistics.service.js');
seedDemoData(); await ensureSignedDemoData();

const all = St.computeStatistics({});
const duts = getAllDuts().filter((d) => !d.canary);
// Documentaire : entonnoir cohérent, délais mesurables, répartitions complètes.
assert.equal(all.documentaire.entonnoir.crees, duts.length);
assert.equal(all.documentaire.entonnoir.valides, duts.filter((d) => d.status === 'VALIDE').length);
assert.ok(all.documentaire.delais.soumissionValidationH.moyenne > 0);
assert.ok(all.documentaire.parMois.length >= 1 && all.documentaire.parMois.every((m) => /^\d{4}-\d{2}$/.test(m.mois)));
assert.equal(Object.values(all.documentaire.parStatut).reduce((a, b) => a + b, 0), duts.length);
assert.ok('NATIONAL' in all.documentaire.parTypeTransport);
// Logistique : tonnage, corridors, remplissage.
assert.ok(all.logistique.tonnageTotal > 0);
assert.ok(all.corridors.liste.length >= 1 && all.corridors.liste[0].duts >= all.corridors.liste[all.corridors.liste.length - 1].duts);
assert.ok(all.corridors.liste.every((c) => c.tkm >= 0 && typeof c.distanceKm === 'number'));
assert.ok(all.logistique.remplissage.moyen > 0 && all.logistique.remplissage.moyen < 5);
// Contrôle : couverture entre 0 et 100, verdicts sommés.
assert.ok(all.controle.couverture.tauxValidesControles >= 0 && all.controle.couverture.tauxValidesControles <= 100);
assert.equal(all.controle.total, Object.values(all.controle.parVerdict).reduce((a, b) => a + b, 0));
// Économie : recette théorique = numéros consommés × tarif ; facturation des DUT.
assert.equal(all.economie.recetteTheorique, 63 * 2500 + 21 * 2500);
assert.ok(all.economie.facture.total > 0 && all.economie.facture.tva >= 0);
assert.ok(all.economie.plages.tauxUtilisation > 0 && all.economie.plages.tauxUtilisation <= 100);
// Acteurs, usage, qualité.
assert.ok(all.acteurs.partenaires.actifs >= 1 && all.acteurs.partenaires.concentrationTop3 <= 100);
assert.ok(Array.isArray(all.usage.connexionsParJour));
assert.ok(all.qualite.score >= 0 && all.qualite.score <= 100);
assert.ok(Array.isArray(all.alertes));
// Filtres : une période vide ne renvoie rien, un partenaire restreint le périmètre.
const vide = St.computeStatistics({ from: '2000-01-01', to: '2000-01-02' });
assert.equal(vide.documentaire.entonnoir.crees, 0);
const partnerId = duts[0].partnerId;
const part = St.computeStatistics({ partnerId });
assert.equal(part.documentaire.entonnoir.crees, duts.filter((d) => d.partnerId === partnerId).length);
assert.ok(part.documentaire.entonnoir.crees < all.documentaire.entonnoir.crees);
// Options de filtre disponibles.
const opts = St.filterOptions();
assert.ok(opts.antennes.length >= 1 && opts.partenaires.length >= 2 && opts.transporteurs.length >= 1);
console.log('Statistiques : huit domaines calculés depuis la base, filtres par période et acteur, alertes.');
