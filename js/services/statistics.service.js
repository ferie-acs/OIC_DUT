// Statistiques de la plateforme : tout est calculé à partir des dépôts existants, rien n'est inventé.
// `computeStatistics(filters)` rend huit domaines ; `filterOptions()` alimente la barre de filtres.
import { DUT_STATUS, CONTROL_POLICY, AUDIT_ACTIONS } from '../core/constants.js';
import { readObject, readCollection } from '../core/storage.js';
import { getAllDuts } from '../repositories/dut.repository.js';
import { getAllControlLogs, getAllDerogations } from '../repositories/controls.repository.js';
import { getAllAuditLogs } from '../repositories/audit.repository.js';
import { getAllOperations } from '../repositories/operations.repository.js';
import { getAllPartners } from '../repositories/partners.repository.js';
import { getAllAntennas } from '../repositories/antennas.repository.js';
import { getAllUsers } from '../repositories/users.repository.js';
import { transportersRepo, vehiclesRepo, driversRepo } from '../repositories/referentials.repository.js';
import { findCity } from '../data/cities.js';
import { haversineKm } from './verification.service.js';
import { LOCAL_KEY as WORKSPACE_KEY } from './workspace.service.js';
import { PRINT_KEY } from './dut-print.service.js';

const LEGACY_VERDICT = { VALID: 'VERT', SUSPENDED: 'ROUGE', WITHDRAWN: 'ROUGE', UNKNOWN: 'ROUGE' };
/** Verdict normalisé : les contrôles ensemencés avant le lot 1 portent encore VALID / SUSPENDED… */
export const verdictOf = (c) => c.verdictLevel || LEGACY_VERDICT[c.result] || c.result || 'INCONNU';
const DAY = 86400000;
const H = 36e5;
const DAYS_OF_WEEK = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
const t = (iso) => (iso ? Date.parse(iso) : NaN);
const monthKey = (iso) => (iso || '').slice(0, 7);
const dayKey = (iso) => (iso || '').slice(0, 10);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (num, den) => (den ? Math.round((num / den) * 1000) / 10 : 0);
const round = (x, d = 1) => (x == null || Number.isNaN(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const countBy = (list, keyFn) => { const m = new Map(); list.forEach((x) => { const k = keyFn(x) || '—'; m.set(k, (m.get(k) || 0) + 1); }); return m; };
const sumBy = (list, keyFn, valFn) => { const m = new Map(); list.forEach((x) => { const k = keyFn(x) || '—'; m.set(k, (m.get(k) || 0) + (valFn(x) || 0)); }); return m; };
const top = (map, n = 8) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([label, value]) => ({ label, value: round(value, 1) }));
const tonnageOf = (d) => (d.marchandises || []).reduce((s, m) => s + (Number(m.poidsTonnes) || 0), 0);
const corridorOf = (d) => `${d.trajet?.chargement?.ville || '?'} → ${d.trajet?.dechargement?.ville || '?'}`;
const inRange = (iso, from, to) => { if (!iso) return false; const d = dayKey(iso); return (!from || d >= from) && (!to || d <= to); };
const monthsBetween = (from, to) => { const out = []; const d = new Date(`${from.slice(0, 7)}-01T00:00:00Z`); const end = to.slice(0, 7); while (d.toISOString().slice(0, 7) <= end && out.length < 36) { out.push(d.toISOString().slice(0, 7)); d.setUTCMonth(d.getUTCMonth() + 1); } return out; };

export function filterOptions() {
  return {
    antennes: getAllAntennas().map((a) => ({ id: a.id, name: a.name })),
    partenaires: getAllPartners().map((p) => ({ id: p.id, name: p.name })),
    transporteurs: transportersRepo.getAll().map((x) => ({ id: x.id, name: x.name })),
    typesTransport: ['NATIONAL', 'VERS_INTERNATIONAL', 'VERS_NATIONAL'],
  };
}

function applyFilters(duts, f) {
  return duts.filter((d) => (!f.antennaId || d.antennaId === f.antennaId) && (!f.partnerId || d.partnerId === f.partnerId)
    && (!f.transporterId || d.general?.transporterId === f.transporterId) && (!f.transportType || d.general?.transportType === f.transportType)
    && ((!f.from && !f.to) || inRange(d.createdAt, f.from, f.to)));
}

export function computeStatistics(filters = {}) {
  const f = { from: filters.from || '', to: filters.to || '', antennaId: filters.antennaId || '', partnerId: filters.partnerId || '', transporterId: filters.transporterId || '', transportType: filters.transportType || '', agentId: filters.agentId || '' };
  const today = new Date().toISOString().slice(0, 10);
  const now = Date.now();
  const allDuts = getAllDuts().filter((d) => !d.canary);
  const duts = applyFilters(allDuts, f);
  const dutIds = new Set(duts.map((d) => d.id));
  const dutById = new Map(duts.map((d) => [d.id, d]));
  const controlsAll = getAllControlLogs();
  const controls = controlsAll.filter((c) => (!f.from && !f.to ? true : inRange(c.date, f.from, f.to)) && (!f.agentId || c.agentId === f.agentId) && (!(f.antennaId || f.partnerId || f.transporterId || f.transportType) || (c.dutId && dutIds.has(c.dutId))));
  const controlIds = new Set(controls.map((c) => c.id));
  const derogations = getAllDerogations().filter((x) => controlIds.has(x.controlId));
  const audit = getAllAuditLogs().filter((e) => (!f.from && !f.to ? true : inRange(e.date, f.from, f.to)));
  const operations = getAllOperations().filter((o) => !f.partnerId || o.partnerId === f.partnerId);
  const workspace = readObject(WORKSPACE_KEY, {});
  const prints = readCollection(PRINT_KEY).filter((p) => dutIds.has(p.dutId));
  const vehicles = vehiclesRepo.getAll();
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
  const vehicleByPlate = new Map(vehicles.map((v) => [String(v.immatriculation || '').toUpperCase(), v]));
  const vehicleOf = (d) => vehicleById.get(d.general?.vehicleId) || vehicleByPlate.get(String(d.general?.immatriculation || '').toUpperCase());
  const partners = getAllPartners();
  const period = { from: f.from || (duts.length ? duts.map((d) => dayKey(d.createdAt)).sort()[0] : today), to: f.to || today };

  // ---------------------------------------------------------------- 1. Documentaire
  const parStatut = Object.fromEntries(Object.values(DUT_STATUS).map((s) => [s, 0]));
  duts.forEach((d) => { parStatut[d.status] = (parStatut[d.status] || 0) + 1; });
  const soumis = duts.filter((d) => d.submittedAt);
  const valides = duts.filter((d) => d.status === DUT_STATUS.VALIDE);
  const rejetes = duts.filter((d) => d.status === DUT_STATUS.REJETE);
  const dSoum = duts.filter((d) => d.createdAt && d.submittedAt).map((d) => (t(d.submittedAt) - t(d.createdAt)) / H).filter((x) => x >= 0);
  const dVal = duts.filter((d) => d.submittedAt && d.validatedAt).map((d) => (t(d.validatedAt) - t(d.submittedAt)) / H).filter((x) => x >= 0);
  const byMonth = countBy(duts, (d) => monthKey(d.createdAt));
  const months = monthsBetween(period.from, period.to);
  const parMois = months.map((m) => ({ mois: m, crees: byMonth.get(m) || 0, valides: duts.filter((d) => monthKey(d.validatedAt) === m).length, rejetes: duts.filter((d) => monthKey(d.rejectedAt) === m).length }));
  const expirant = valides.filter((d) => { const exp = t(d.validatedAt) + CONTROL_POLICY.validityDays * DAY; return exp >= now && exp <= now + 7 * DAY; }).length;
  const controlledIds = new Set(controlsAll.filter((c) => c.dutId).map((c) => c.dutId));
  const expiresJamaisControles = valides.filter((d) => t(d.validatedAt) + CONTROL_POLICY.validityDays * DAY < now && !controlledIds.has(d.id)).length;
  const documentaire = {
    parStatut,
    entonnoir: { crees: duts.length, soumis: soumis.length, valides: valides.length, rejetes: rejetes.length, tauxSoumission: pct(soumis.length, duts.length), tauxValidation: pct(valides.length, soumis.length), premierPassage: pct(valides.filter((d) => !d.rejectedAt).length, valides.length) },
    brouillonsAbandonnes: duts.filter((d) => d.status === DUT_STATUS.EN_EDITION && now - t(d.updatedAt || d.createdAt) > 30 * DAY).length,
    delais: {
      creationSoumissionH: { moyenne: round(mean(dSoum)), mediane: round(median(dSoum)), sous10min: pct(dSoum.filter((x) => x <= 1 / 6).length, dSoum.length) },
      soumissionValidationH: { moyenne: round(mean(dVal)), mediane: round(median(dVal)), max: round(Math.max(0, ...dVal)), sous24h: pct(dVal.filter((x) => x <= 24).length, dVal.length), sous48h: pct(dVal.filter((x) => x <= 48).length, dVal.length) },
    },
    motifsRejet: top(countBy(rejetes.concat(duts.filter((d) => d.rejectedAt && d.status !== DUT_STATUS.REJETE)), (d) => d.rejectionReason || 'Non précisé')),
    resoumissionReussie: pct(duts.filter((d) => d.rejectedAt && d.status === DUT_STATUS.VALIDE).length, duts.filter((d) => d.rejectedAt).length),
    parMois,
    expirantSous7j: expirant, expiresJamaisControles,
    parTypeTransport: Object.fromEntries(['NATIONAL', 'VERS_INTERNATIONAL', 'VERS_NATIONAL'].map((k) => [k, duts.filter((d) => d.general?.transportType === k).length])),
    parCompte: Object.fromEntries(['PROPRE', 'AUTRUI', 'SOUS_TRAITANCE'].map((k) => [k, duts.filter((d) => d.general?.compte === k).length])),
    dangereuses: duts.filter((d) => d.dangereuse).length, temperatureControlee: duts.filter((d) => d.temperatureControlee).length,
    parAntenne: top(countBy(duts, (d) => d.antennaName), 10), parPartenaire: top(countBy(duts, (d) => d.partnerName), 10),
    parHeureCreation: Array.from({ length: 24 }, (_, h) => duts.filter((d) => new Date(d.createdAt).getHours() === h).length),
    parJourSemaine: DAYS_OF_WEEK.map((label, i) => ({ label, value: duts.filter((d) => d.trajet?.dateDepart && new Date(d.trajet.dateDepart).getDay() === i).length })),
  };

  // ---------------------------------------------------------------- 2. Logistique
  const tonnageTotal = duts.reduce((s, d) => s + tonnageOf(d), 0);
  const fills = duts.map((d) => { const v = vehicleOf(d); const cap = Number(v?.capaciteTonnes); const tn = tonnageOf(d); return cap > 0 && tn > 0 ? tn / cap : null; }).filter((x) => x != null);
  const records = duts.map((d) => ({ d, r: workspace[d.id] })).filter((x) => x.r);
  const incidents = records.flatMap(({ d, r }) => (r.incidents || []).map((i) => ({ ...i, dut: d })));
  const resolved = incidents.filter((i) => i.resolvedAt || i.status === 'RESOLVED' || i.resolution);
  const resDelays = resolved.map((i) => (t(i.resolvedAt) - t(i.at || i.createdAt)) / H).filter((x) => x >= 0);
  const enRouteSansNouvelles = records.filter(({ r }) => r.stage === 'DEPARTED' && now - t(r.updatedAt) > 48 * H).length;
  const livraisonsRetard = records.filter(({ d, r }) => r.stage === 'DELIVERED' && d.trajet?.dateArrivee && t(r.updatedAt) > t(d.trajet.dateArrivee) + DAY).length;
  const transits = duts.filter((d) => d.trajet?.dateDepart && d.trajet?.dateArrivee).map((d) => (t(d.trajet.dateArrivee) - t(d.trajet.dateDepart)) / H).filter((x) => x >= 0);
  const logistique = {
    tonnageTotal: round(tonnageTotal), tonnageMoyen: round(tonnageTotal / (duts.length || 1)),
    parMarchandise: top(sumBy(duts.flatMap((d) => d.marchandises || []), (m) => m.nature, (m) => Number(m.poidsTonnes) || 0)),
    parEmballage: top(countBy(duts.flatMap((d) => d.marchandises || []), (m) => m.emballage)),
    villesDepart: top(countBy(duts, (d) => d.trajet?.chargement?.ville)), villesArrivee: top(countBy(duts, (d) => d.trajet?.dechargement?.ville)),
    remplissage: { moyen: round(mean(fills), 2), sousCharges: fills.filter((x) => x < 0.5).length, surcharges: fills.filter((x) => x > 1).length, mesures: fills.length },
    transit: { moyenH: round(mean(transits)), medianH: round(median(transits)) },
    suivi: { avecSuivi: records.length, parEtape: Object.fromEntries(['PLANNED', 'LOADED', 'DEPARTED', 'ARRIVED', 'DELIVERED'].map((s) => [s, records.filter(({ r }) => r.stage === s).length])), enRouteSansNouvelles, livraisonsRetard },
    incidents: { total: incidents.length, parType: top(countBy(incidents, (i) => i.type)), urgents: incidents.filter((i) => i.severity === 'URGENT').length, resolus: resolved.length, tauxResolu: pct(resolved.length, incidents.length), delaiResolutionH: round(mean(resDelays)), pour1000Dut: round((incidents.filter((i) => ['Marchandise endommagée', 'Écart de quantité'].includes(i.type)).length / (duts.length || 1)) * 1000) },
    rotation: { dutParVehicule: round(duts.length / (new Set(duts.map((d) => d.general?.vehicleId).filter(Boolean)).size || 1)), vehiculesDormants90j: vehicles.filter((v) => !allDuts.some((d) => d.general?.vehicleId === v.id && now - t(d.createdAt) < 90 * DAY)).length },
    semaineAVenir: duts.filter((d) => d.trajet?.dateDepart && t(d.trajet.dateDepart) >= now && t(d.trajet.dateDepart) <= now + 7 * DAY).length,
  };

  // ---------------------------------------------------------------- 3. Corridors
  const groups = new Map();
  duts.forEach((d) => { const k = corridorOf(d); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(d); });
  const controlsByDut = new Map(); controls.forEach((c) => { if (c.dutId) { if (!controlsByDut.has(c.dutId)) controlsByDut.set(c.dutId, []); controlsByDut.get(c.dutId).push(c); } });
  const liste = [...groups.entries()].map(([corridor, list]) => {
    const from = findCity(list[0].trajet?.chargement?.ville), to = findCity(list[0].trajet?.dechargement?.ville);
    const distanceKm = from && to ? Math.round(haversineKm(from, to)) : 0;
    const tn = list.reduce((s, d) => s + tonnageOf(d), 0);
    const ctrl = list.flatMap((d) => controlsByDut.get(d.id) || []);
    const tr = list.filter((d) => d.trajet?.dateDepart && d.trajet?.dateArrivee).map((d) => (t(d.trajet.dateArrivee) - t(d.trajet.dateDepart)) / H).filter((x) => x >= 0);
    const inc = list.reduce((s, d) => s + ((workspace[d.id]?.incidents || []).length), 0);
    return { corridor, duts: list.length, tonnage: round(tn), distanceKm, tkm: Math.round(tn * distanceKm), transitH: round(mean(tr)), controles: ctrl.length, tauxControle: pct(list.filter((d) => controlsByDut.has(d.id)).length, list.length), refus: ctrl.filter((c) => verdictOf(c) === 'ROUGE').length, incidents: inc, international: list.some((d) => d.general?.transportType !== 'NATIONAL') };
  }).sort((a, b) => b.duts - a.duts);
  const corridors = { liste, aveugles: liste.filter((c) => c.controles === 0).length, tkmTotal: liste.reduce((s, c) => s + c.tkm, 0), partInternationale: pct(duts.filter((d) => d.general?.transportType && d.general.transportType !== 'NATIONAL').length, duts.length), nouveaux30j: liste.filter((c) => groups.get(c.corridor).every((d) => now - t(d.createdAt) < 30 * DAY)).length };

  // ---------------------------------------------------------------- 4. Contrôle & sécurité
  const parVerdict = { VERT: 0, ORANGE: 0, ROUGE: 0, INCONNU: 0 };
  controls.forEach((c) => { const k = verdictOf(c); if (k in parVerdict) parVerdict[k] += 1; });
  const blocks = controls.flatMap((c) => (c.findings || []).filter((x) => x.severity === 'block').map((x) => x.code));
  const rouges = controls.filter((c) => verdictOf(c) === 'ROUGE');
  const validesControles = valides.filter((d) => controlledIds.has(d.id)).length;
  const last7 = controls.filter((c) => now - t(c.date) < 7 * DAY);
  const recid = (keyFn) => [...countBy(controlsAll.filter((c) => verdictOf(c) === 'ROUGE' && now - t(c.date) < 90 * DAY && c.dutId), keyFn).entries()].filter(([, n]) => n >= 2).map(([label, value]) => ({ label, value }));
  const controle = {
    total: controls.length, parVerdict, tauxRefus: pct(rouges.length, controls.length), tauxRefus7j: pct(last7.filter((c) => verdictOf(c) === 'ROUGE').length, last7.length),
    parJour: [...countBy(controls, (c) => dayKey(c.date)).entries()].sort().slice(-30).map(([label, value]) => ({ label, value })),
    parPoste: top(countBy(controls, (c) => c.postName), 10), parAgent: top(countBy(controls, (c) => c.agentLabel), 10),
    parHeure: Array.from({ length: 24 }, (_, h) => controls.filter((c) => new Date(c.date).getHours() === h).length),
    motifsRefus: top(countBy(blocks, (x) => x)),
    fraude: { faux: blocks.filter((x) => x === 'SIGNATURE_INVALIDE').length, pieges: blocks.filter((x) => x === 'CANARI').length, voyagesImpossibles: blocks.filter((x) => x === 'VOYAGE_IMPOSSIBLE').length, inconnus: blocks.filter((x) => x === 'INCONNU_DU_SYSTEME').length, retiresPresentes: controls.filter((c) => (c.findings || []).some((x) => x.code === 'STATUT_RETIRE' || x.code === 'STATUT_SUSPENDU' || (x.severity === 'block' && /statut/i.test(x.id || '')))).length },
    couverture: { tauxValidesControles: pct(validesControles, valides.length), controlesParDut: round(controls.filter((c) => c.dutId).length / (new Set(controls.map((c) => c.dutId).filter(Boolean)).size || 1), 2), jamaisControles: valides.length - validesControles, postesInactifs: getAllAntennas().filter((a) => !controlsAll.some((c) => c.postId === a.id)).length },
    horsLigne: { part: pct(controls.filter((c) => c.mode === 'HORS_LIGNE').length, controls.length), nonOpposables: parVerdict.INCONNU },
    derogations: { total: derogations.length, parMotif: top(countBy(derogations, (x) => x.reason)), parAgent: top(countBy(derogations, (x) => x.agentLabel)), ratioRefus: pct(derogations.length, rouges.length) },
    recidive: { partenaires: recid((c) => dutById.get(c.dutId)?.partnerName || allDuts.find((d) => d.id === c.dutId)?.partnerName), vehicules: recid((c) => dutById.get(c.dutId)?.general?.immatriculation || allDuts.find((d) => d.id === c.dutId)?.general?.immatriculation) },
    points: controls.filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng)).map((c) => ({ lat: c.lat, lng: c.lng, verdict: verdictOf(c) })),
  };

  // ---------------------------------------------------------------- 5. Économie
  const validated = operations.filter((o) => o.status === 'VALIDATED');
  const consommes = validated.reduce((s, o) => s + (o.used || 0), 0);
  const quantite = validated.reduce((s, o) => s + (o.quantity || 0), 0);
  const recetteTheorique = validated.reduce((s, o) => s + (o.used || 0) * (Number(o.tarifUnitaire) || 0), 0);
  const consumption30 = (pid) => allDuts.filter((d) => d.partnerId === pid && d.validatedAt && now - t(d.validatedAt) < 30 * DAY).length;
  const facture = duts.reduce((acc, d) => { ['expediteur', 'destinataire'].forEach((side) => { const x = d.facturation?.[side] || {}; const base = (Number(x.prixTransport) || 0) + (Number(x.accessoires) || 0) + (Number(x.complementaires) || 0) + (Number(x.autres) || 0); acc.base += base; acc.tva += base * ((Number(x.tva) || 0) / 100); acc.timbre += Number(x.timbre) || 0; }); return acc; }, { base: 0, tva: 0, timbre: 0 });
  const economie = {
    recetteTheorique, recetteParMois: months.map((m) => ({ mois: m, value: validated.filter((o) => monthKey(o.validatedAt) === m).reduce((s, o) => s + (o.used || 0) * (Number(o.tarifUnitaire) || 0), 0) })),
    recetteParPartenaire: top(sumBy(validated, (o) => o.partnerName, (o) => (o.used || 0) * (Number(o.tarifUnitaire) || 0))),
    plages: { demandees: operations.length, validees: validated.length, enAttente: operations.filter((o) => o.status === 'PENDING').length, epuisees: validated.filter((o) => (o.used || 0) >= (o.quantity || 0)).length, tauxUtilisation: pct(consommes, quantite), numerosRestants: quantite - consommes, delaiInstructionH: round(mean(operations.filter((o) => o.requestedAt && o.validatedAt).map((o) => (t(o.validatedAt) - t(o.requestedAt)) / H))) },
    projection: partners.filter((p) => !f.partnerId || p.id === f.partnerId).map((p) => { const rest = validated.filter((o) => o.partnerId === p.id).reduce((s, o) => s + ((o.quantity || 0) - (o.used || 0)), 0); const rythme = consumption30(p.id) / 30; return { label: p.name, restants: rest, rythmeJour: round(rythme, 2), joursAvantEpuisement: rythme > 0 ? Math.round(rest / rythme) : null }; }),
    facture: { total: Math.round(facture.base + facture.tva + facture.timbre), base: Math.round(facture.base), tva: Math.round(facture.tva), timbre: Math.round(facture.timbre), moyenParDut: Math.round((facture.base + facture.tva + facture.timbre) / (duts.length || 1)), parTonne: tonnageTotal ? Math.round(facture.base / tonnageTotal) : 0, parTkm: corridors.tkmTotal ? round(facture.base / corridors.tkmTotal, 2) : 0 },
    anomalies: partners.map((p) => { const mine = allDuts.filter((d) => d.partnerId === p.id && d.validatedAt); const months = new Set(mine.map((d) => monthKey(d.validatedAt))).size || 1; const moyenneMensuelle = mine.length / months; const c30 = consumption30(p.id); return { label: p.name, consommation30j: c30, moyenneMensuelle: round(moyenneMensuelle), ecart: moyenneMensuelle ? pct(c30 - moyenneMensuelle, moyenneMensuelle) : 0 }; }).filter((x) => Math.abs(x.ecart) >= 50),
  };

  // ---------------------------------------------------------------- 6. Acteurs
  const activePartners = partners.filter((p) => duts.some((d) => d.partnerId === p.id && now - t(d.createdAt) < 30 * DAY));
  const partCounts = [...countBy(duts, (d) => d.partnerName).values()].sort((a, b) => b - a);
  const transporters = transportersRepo.getAll();
  const drivers = driversRepo?.getAll ? driversRepo.getAll() : [];
  const acteurs = {
    partenaires: { total: partners.length, actifs: activePartners.length, inactifs: partners.length - activePartners.length, concentrationTop3: pct(partCounts.slice(0, 3).reduce((a, b) => a + b, 0), duts.length), nouveaux: partners.filter((p) => { const first = allDuts.filter((d) => d.partnerId === p.id).map((d) => d.createdAt).sort()[0]; return first && now - t(first) < 30 * DAY; }).length, tauxRejet: top(new Map(partners.map((p) => { const m = duts.filter((d) => d.partnerId === p.id); return [p.name, pct(m.filter((d) => d.rejectedAt).length, m.length)]; }))) },
    transporteurs: { total: transporters.length, actifs: transporters.filter((x) => duts.some((d) => d.general?.transporterId === x.id)).length, top: top(countBy(duts, (d) => d.general?.transporterName)) },
    vehicules: { total: vehicles.length, actifs: new Set(duts.map((d) => d.general?.vehicleId).filter(Boolean)).size, dormants90j: logistique.rotation.vehiculesDormants90j, controlesRouges: new Set(rouges.map((c) => dutById.get(c.dutId)?.general?.immatriculation).filter(Boolean)).size, sansCapacite: vehicles.filter((v) => !(Number(v.capaciteTonnes) > 0)).length },
    chauffeurs: { total: drivers.length, top: top(countBy(duts, (d) => [d.general?.driverNom, d.general?.driverPrenoms].filter(Boolean).join(' '))), permisManquants: duts.filter((d) => d.general?.driverNom && !d.general?.driverPermis).length },
    tiers: { expediteurs: top(countBy(duts, (d) => d.expediteur?.raisonSociale)), destinataires: top(countBy(duts, (d) => d.destinataire?.raisonSociale)) },
    antennes: top(countBy(duts, (d) => d.antennaName), 10),
  };

  // ---------------------------------------------------------------- 7. Usage & audit
  const users = getAllUsers();
  const logins = audit.filter((e) => e.action === AUDIT_ACTIONS.USER_LOGIN);
  const allLogins = getAllAuditLogs().filter((e) => e.action === AUDIT_ACTIONS.USER_LOGIN);
  const sensitive = new Set([AUDIT_ACTIONS.DUT_SUSPENDED, AUDIT_ACTIONS.DUT_WITHDRAWN, AUDIT_ACTIONS.DUT_DEROGATION, AUDIT_ACTIONS.DUT_REJECTED, AUDIT_ACTIONS.CANARY_TRIGGERED]);
  const reprints = prints.filter((p) => p.rank > 1);
  const usage = {
    connexionsParJour: [...countBy(logins, (e) => dayKey(e.date)).entries()].sort().slice(-30).map(([label, value]) => ({ label, value })),
    connexionsParRole: top(countBy(logins, (e) => e.role)),
    utilisateurs: { total: users.length, actifs7j: new Set(allLogins.filter((e) => now - t(e.date) < 7 * DAY).map((e) => e.userId)).size, actifs30j: new Set(allLogins.filter((e) => now - t(e.date) < 30 * DAY).map((e) => e.userId)).size, jamaisConnectes: users.filter((u) => !allLogins.some((e) => e.userId === u.id)).length },
    actionsParUtilisateur: top(countBy(audit, (e) => e.userLabel), 10), actionsParType: top(countBy(audit, (e) => e.label), 12),
    parHeure: Array.from({ length: 24 }, (_, h) => audit.filter((e) => new Date(e.date).getHours() === h).length),
    sensibles: audit.filter((e) => sensitive.has(e.action)).sort((a, b) => t(b.date) - t(a.date)).slice(0, 15),
    impressions: { total: prints.length, reimpressions: reprints.length, motifs: top(countBy(reprints, (p) => p.reason || 'Non précisé')), dutPlus3: [...countBy(prints, (p) => p.dutId).entries()].filter(([, n]) => n > 3).length },
  };

  // ---------------------------------------------------------------- 8. Qualité des données
  const checks = [
    ['DUT sans transporteur', duts.filter((d) => !d.general?.transporterName).length, duts.length],
    ['DUT sans véhicule', duts.filter((d) => !d.general?.immatriculation).length, duts.length],
    ['DUT sans tonnage', duts.filter((d) => tonnageOf(d) <= 0).length, duts.length],
    ['DUT sans villes de trajet', duts.filter((d) => !d.trajet?.chargement?.ville || !d.trajet?.dechargement?.ville).length, duts.length],
    ['DUT sans chauffeur', duts.filter((d) => !d.general?.driverNom).length, duts.length],
    ['Véhicules sans capacité', acteurs.vehicules.sansCapacite, vehicles.length],
    ['Antennes sans chef', getAllAntennas().filter((a) => !a.chef?.name).length, getAllAntennas().length],
  ].map(([label, value, total]) => ({ label, value, total, taux: pct(value, total) }));
  const qualite = { controles: checks, score: Math.max(0, Math.round(100 - mean(checks.map((c) => c.taux)))), reserves: duts.filter((d) => d.annexes?.reservePriseEnCharge || d.annexes?.reserveLivraison).length, avecPieces: pct(duts.filter((d) => (d.annexes?.pieces || []).length).length, duts.length) };

  // ---------------------------------------------------------------- Alertes
  const alertes = [];
  if (last7.length >= 5 && controle.tauxRefus7j > 10) alertes.push({ niveau: 'error', texte: `Taux de refus à ${controle.tauxRefus7j} % sur 7 jours` });
  economie.projection.filter((p) => p.restants > 0 && p.restants < 10).forEach((p) => alertes.push({ niveau: 'warning', texte: `${p.label} : ${p.restants} numéro(s) restant(s)` }));
  if (logistique.suivi.enRouteSansNouvelles) alertes.push({ niveau: 'warning', texte: `${logistique.suivi.enRouteSansNouvelles} transport(s) en route sans nouvelles depuis 48 h` });
  if (controle.fraude.pieges) alertes.push({ niveau: 'error', texte: `${controle.fraude.pieges} DUT piège scanné(s) sur la période` });
  if (rouges.length >= 5 && controle.derogations.ratioRefus > 20) alertes.push({ niveau: 'warning', texte: `Dérogations : ${controle.derogations.ratioRefus} % des refus` });
  if (economie.anomalies.length) alertes.push({ niveau: 'info', texte: `${economie.anomalies.length} partenaire(s) avec une consommation anormale` });
  if (documentaire.expiresJamaisControles) alertes.push({ niveau: 'info', texte: `${documentaire.expiresJamaisControles} DUT expiré(s) jamais contrôlé(s)` });

  return { filters: f, period, documentaire, logistique, corridors, controle, economie, acteurs, usage, qualite, alertes };
}
