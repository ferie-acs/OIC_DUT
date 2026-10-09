// Comparateur : n'importe quel indicateur du catalogue, pour n'importe quelles entités d'un même type,
// sur une période. S'appuie sur statistics.service (un calcul filtré par entité).
import { computeStatistics } from './statistics.service.js';
import { getAllAntennas } from '../repositories/antennas.repository.js';
import { getAllPartners } from '../repositories/partners.repository.js';
import { getAllUsers } from '../repositories/users.repository.js';
import { transportersRepo } from '../repositories/referentials.repository.js';

const G = { DOC: 'Documents', DELAI: 'Délais', CTRL: 'Contrôle', FLUX: 'Flux', ECO: 'Économie', USAGE: 'Usage' };
const pathOr = (obj, path, dflt = 0) => { const v = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj); return typeof v === 'number' && !Number.isNaN(v) ? v : dflt; };

/** Catalogue : key, libellé, groupe, unité, sens (↑ plus c'est haut mieux c'est, ↓ inverse), extraction, série mensuelle éventuelle. */
export const INDICATORS = [
  { key: 'dutCrees', label: 'DUT créés', group: G.DOC, unit: '', better: 'high', get: (s) => s.documentaire.entonnoir.crees, monthly: (s) => s.documentaire.parMois.map((m) => m.crees) },
  { key: 'dutSoumis', label: 'DUT soumis', group: G.DOC, unit: '', better: 'high', get: (s) => s.documentaire.entonnoir.soumis },
  { key: 'dutValides', label: 'DUT validés', group: G.DOC, unit: '', better: 'high', get: (s) => s.documentaire.entonnoir.valides, monthly: (s) => s.documentaire.parMois.map((m) => m.valides) },
  { key: 'dutRejetes', label: 'DUT rejetés', group: G.DOC, unit: '', better: 'low', get: (s) => s.documentaire.entonnoir.rejetes, monthly: (s) => s.documentaire.parMois.map((m) => m.rejetes) },
  { key: 'tauxValidation', label: 'Taux de validation', group: G.DOC, unit: '%', better: 'high', get: (s) => s.documentaire.entonnoir.tauxValidation },
  { key: 'tauxRejet', label: 'Taux de rejet', group: G.DOC, unit: '%', better: 'low', get: (s) => { const e = s.documentaire.entonnoir; return e.soumis ? Math.round((e.rejetes / e.soumis) * 1000) / 10 : 0; } },
  { key: 'premierPassage', label: 'Premier passage réussi', group: G.DOC, unit: '%', better: 'high', get: (s) => s.documentaire.entonnoir.premierPassage },
  { key: 'suspendusRetires', label: 'Suspendus + retirés', group: G.DOC, unit: '', better: 'low', get: (s) => s.documentaire.parStatut.SUSPENDU + s.documentaire.parStatut.RETIRE },
  { key: 'brouillonsAbandonnes', label: 'Brouillons abandonnés', group: G.DOC, unit: '', better: 'low', get: (s) => s.documentaire.brouillonsAbandonnes },
  { key: 'delaiPreparationH', label: 'Création → soumission (médiane)', group: G.DELAI, unit: 'h', better: 'low', get: (s) => pathOr(s, 'documentaire.delais.creationSoumissionH.mediane') },
  { key: 'delaiValidationH', label: 'Soumission → validation (médiane)', group: G.DELAI, unit: 'h', better: 'low', get: (s) => pathOr(s, 'documentaire.delais.soumissionValidationH.mediane') },
  { key: 'validesSous24h', label: 'Validés sous 24 h', group: G.DELAI, unit: '%', better: 'high', get: (s) => pathOr(s, 'documentaire.delais.soumissionValidationH.sous24h') },
  { key: 'tonnage', label: 'Tonnage déclaré', group: G.FLUX, unit: 't', better: 'high', get: (s) => s.logistique.tonnageTotal },
  { key: 'tonnageMoyen', label: 'Tonnage moyen par DUT', group: G.FLUX, unit: 't', better: 'high', get: (s) => s.logistique.tonnageMoyen },
  { key: 'remplissage', label: 'Taux de remplissage', group: G.FLUX, unit: '%', better: 'high', get: (s) => (s.logistique.remplissage.moyen == null ? 0 : Math.round(s.logistique.remplissage.moyen * 1000) / 10) },
  { key: 'tkm', label: 'Tonnes-kilomètres', group: G.FLUX, unit: 't·km', better: 'high', get: (s) => s.corridors.tkmTotal },
  { key: 'corridors', label: 'Corridors desservis', group: G.FLUX, unit: '', better: 'high', get: (s) => s.corridors.liste.length },
  { key: 'incidents', label: 'Incidents déclarés', group: G.FLUX, unit: '', better: 'low', get: (s) => s.logistique.incidents.total },
  { key: 'scans', label: 'Contrôles (scans)', group: G.CTRL, unit: '', better: 'high', get: (s) => s.controle.total, monthly: (s) => s.controle.parJour.map((d) => d.value), ctrl: true },
  { key: 'refus', label: 'Refus', group: G.CTRL, unit: '', better: 'low', get: (s) => s.controle.parVerdict.ROUGE, ctrl: true },
  { key: 'tauxRefus', label: 'Taux de refus', group: G.CTRL, unit: '%', better: 'low', get: (s) => s.controle.tauxRefus, ctrl: true },
  { key: 'couverture', label: 'Couverture des DUT valides', group: G.CTRL, unit: '%', better: 'high', get: (s) => s.controle.couverture.tauxValidesControles },
  { key: 'faux', label: 'Faux documents détectés', group: G.CTRL, unit: '', better: 'high', get: (s) => s.controle.fraude.faux, ctrl: true },
  { key: 'pieges', label: 'DUT pièges scannés', group: G.CTRL, unit: '', better: 'low', get: (s) => s.controle.fraude.pieges, ctrl: true },
  { key: 'voyagesImpossibles', label: 'Voyages impossibles', group: G.CTRL, unit: '', better: 'low', get: (s) => s.controle.fraude.voyagesImpossibles, ctrl: true },
  { key: 'horsLigne', label: 'Part des scans hors ligne', group: G.CTRL, unit: '%', better: 'low', get: (s) => s.controle.horsLigne.part, ctrl: true },
  { key: 'derogations', label: 'Dérogations', group: G.CTRL, unit: '', better: 'low', get: (s) => s.controle.derogations.total, ctrl: true },
  { key: 'ratioDerogations', label: 'Dérogations / refus', group: G.CTRL, unit: '%', better: 'low', get: (s) => s.controle.derogations.ratioRefus, ctrl: true },
  { key: 'recetteTheorique', label: 'Recette théorique', group: G.ECO, unit: 'F', better: 'high', get: (s) => s.economie.recetteTheorique, monthly: (s) => s.economie.recetteParMois.map((m) => m.value) },
  { key: 'facture', label: 'Montants facturés', group: G.ECO, unit: 'F', better: 'high', get: (s) => s.economie.facture.total },
  { key: 'numerosRestants', label: 'Numéros restants', group: G.ECO, unit: '', better: 'high', get: (s) => s.economie.plages.numerosRestants },
  { key: 'tauxUtilisationPlages', label: 'Utilisation des plages', group: G.ECO, unit: '%', better: 'high', get: (s) => s.economie.plages.tauxUtilisation },
  { key: 'impressions', label: 'Impressions', group: G.USAGE, unit: '', better: 'high', get: (s) => s.usage.impressions.total },
  { key: 'reimpressions', label: 'Réimpressions', group: G.USAGE, unit: '', better: 'low', get: (s) => s.usage.impressions.reimpressions },
  { key: 'qualite', label: 'Score de qualité des données', group: G.QUALITE || 'Qualité', unit: '/100', better: 'high', get: (s) => s.qualite.score },
];

export const ENTITY_TYPES = {
  antennes: { label: 'Antennes', filterKey: 'antennaId', list: () => getAllAntennas().map((a) => ({ id: a.id, name: a.name, sub: a.city })) },
  partenaires: { label: 'Partenaires', filterKey: 'partnerId', list: () => getAllPartners().map((p) => ({ id: p.id, name: p.name, sub: p.antennaName || '' })) },
  transporteurs: { label: 'Transporteurs', filterKey: 'transporterId', list: () => transportersRepo.getAll().map((t) => ({ id: t.id, name: t.name, sub: t.registre || '' })) },
  controleurs: { label: 'Agents de contrôle', filterKey: 'agentId', onlyControl: true, list: () => getAllUsers().filter((u) => u.role === 'CONTROLLER').map((u) => ({ id: u.id, name: u.name, sub: u.email })) },
};

export function entitiesOf(type) { return ENTITY_TYPES[type] ? ENTITY_TYPES[type].list() : []; }
export function indicatorsFor(type) { return ENTITY_TYPES[type]?.onlyControl ? INDICATORS.filter((i) => i.ctrl) : INDICATORS.filter((i) => !i.agentOnly); }
export function indicator(key) { return INDICATORS.find((i) => i.key === key) || null; }

function statsFor(type, id, period) {
  const t = ENTITY_TYPES[type];
  return computeStatistics({ from: period.from || '', to: period.to || '', [t.filterKey]: id });
}

/** Tableau comparatif : une ligne par entité, une valeur par indicateur ; `best[key]` = id de la meilleure entité. */
export function compare(type, ids, keys, period = {}) {
  const t = ENTITY_TYPES[type]; if (!t) return { rows: [], best: {}, indicators: [] };
  const list = t.list(); const inds = keys.map(indicator).filter(Boolean);
  const rows = ids.map((id) => { const e = list.find((x) => x.id === id); if (!e) return null; const s = statsFor(type, id, period); return { id, name: e.name, sub: e.sub, actif: s.documentaire.entonnoir.crees + s.controle.total > 0, values: Object.fromEntries(inds.map((i) => [i.key, Number(i.get(s)) || 0])) }; }).filter(Boolean);
  const best = {};
  inds.forEach((i) => {
    // Une entité sans aucune activité n'est jamais « la meilleure » sur un taux à minimiser (0 % par absence).
    const pool = i.better === 'low' ? rows.filter((r) => r.actif) : rows;
    const vals = pool.map((r) => r.values[i.key]); if (!vals.length || vals.every((v) => v === vals[0])) return;
    const target = i.better === 'low' ? Math.min(...vals) : Math.max(...vals); best[i.key] = pool.find((r) => r.values[i.key] === target)?.id;
  });
  return { rows, best, indicators: inds };
}

/** Séries mensuelles d'un indicateur (ou journalières pour les scans) pour chaque entité, sur les mêmes abscisses. */
export function monthlySeries(type, ids, key, period = {}) {
  const t = ENTITY_TYPES[type]; const ind = indicator(key);
  if (!t || !ind) return { months: [], series: [] };
  const list = t.list();
  const stats = ids.map((id) => ({ id, s: statsFor(type, id, period) }));
  const months = stats[0] ? (ind.monthly && key === 'scans' ? stats[0].s.controle.parJour.map((d) => d.label) : stats[0].s.documentaire.parMois.map((m) => m.mois)) : [];
  const series = stats.map(({ id, s }) => {
    const e = list.find((x) => x.id === id);
    let values;
    if (ind.monthly && key !== 'scans') values = ind.monthly(s);
    else if (key === 'scans') { const map = new Map(s.controle.parJour.map((d) => [d.label, d.value])); values = months.map((m) => map.get(m) || 0); }
    else values = months.map(() => Number(ind.get(s)) || 0);
    return { id, name: e?.name || id, values: months.map((_, i) => values[i] ?? 0) };
  });
  return { months, series, indicator: ind };
}
