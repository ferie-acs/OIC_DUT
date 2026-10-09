// Supervision : statistiques et fiches de chaque acteur (antennes, partenaires, agents de contrôle,
// transporteurs), calculées à partir des dépôts existants. Aucune donnée inventée ici.
import { DUT_STATUS } from '../core/constants.js';
import { getAllAntennas, findAntennaById, saveAntennas } from '../repositories/antennas.repository.js';
import { getAllDuts } from '../repositories/dut.repository.js';
import { getAllControlLogs, getAllDerogations } from '../repositories/controls.repository.js';
import { getAllAuditLogs } from '../repositories/audit.repository.js';
import { getAllOperations } from '../repositories/operations.repository.js';
import { getAllPartners, findPartnerById } from '../repositories/partners.repository.js';
import { getAllUsers } from '../repositories/users.repository.js';
import { transportersRepo, vehiclesRepo } from '../repositories/referentials.repository.js';
import { zoneOf } from '../data/antennas.js';
import * as auditService from './audit.service.js';
import { AUDIT_ACTIONS } from '../core/constants.js';

const DAY = 86400000;
const realDuts = () => getAllDuts().filter((d) => !d.canary);
const since = (iso, days) => iso && Date.parse(iso) >= Date.now() - days * DAY;
const byDateDesc = (key) => (a, b) => Date.parse(b[key] || 0) - Date.parse(a[key] || 0);
const avg = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);

function statusBreakdown(duts) {
  const out = Object.fromEntries(Object.values(DUT_STATUS).map((s) => [s, 0]));
  duts.forEach((d) => { out[d.status] = (out[d.status] || 0) + 1; });
  return out;
}
function dutStats(duts) {
  return {
    total: duts.length,
    mois: duts.filter((d) => since(d.createdAt, 30)).length,
    sixMois: duts.filter((d) => since(d.createdAt, 183)).length,
    parStatut: statusBreakdown(duts),
    tonnage: duts.reduce((t, d) => t + (d.marchandises || []).reduce((m, x) => m + (Number(x.poidsTonnes || x.poids || 0) || 0), 0), 0),
  };
}
function reviewStats(duts) {
  const delays = duts.filter((d) => d.submittedAt && d.validatedAt).map((d) => (Date.parse(d.validatedAt) - Date.parse(d.submittedAt)) / 36e5).filter((h) => h >= 0);
  return { aRelire: duts.filter((d) => d.status === DUT_STATUS.TERMINE).length, rejetes: duts.filter((d) => d.status === DUT_STATUS.REJETE).length, delaiMoyenH: avg(delays) };
}
function verdictBreakdown(controls) {
  const out = { VERT: 0, ORANGE: 0, ROUGE: 0, INCONNU: 0 };
  controls.forEach((c) => { const k = c.verdictLevel || c.result; if (k in out) out[k] += 1; });
  return out;
}
function controlStats(controls, derogations) {
  return {
    total: controls.length,
    parVerdict: verdictBreakdown(controls),
    horsLigne: controls.filter((c) => c.mode === 'HORS_LIGNE').length,
    pieges: controls.filter((c) => (c.findings || []).some((f) => f.code === 'CANARI')).length,
    voyagesImpossibles: controls.filter((c) => (c.findings || []).some((f) => f.code === 'VOYAGE_IMPOSSIBLE')).length,
    derogations: derogations.length,
  };
}
function journalFor({ dutIds = new Set(), userIds = new Set() }, limit = 40) {
  return getAllAuditLogs()
    .filter((e) => (e.dutId && dutIds.has(e.dutId)) || (e.userId && userIds.has(e.userId)))
    .sort(byDateDesc('date')).slice(0, limit);
}

// ---------------------------------------------------------------- Antennes
export function antennasOverview() {
  const duts = realDuts(); const controls = getAllControlLogs(); const derogs = getAllDerogations();
  const controlById = new Map(controls.map((c) => [c.id, c]));
  const rows = getAllAntennas().map((a) => {
    const mine = duts.filter((d) => d.antennaId === a.id);
    const ctrl = controls.filter((c) => c.postId === a.id);
    const rv = reviewStats(mine);
    return {
      id: a.id, name: a.name, city: a.city, zone: zoneOf(a), chef: a.chef?.name || '',
      duts: mine.length, dutsMois: mine.filter((d) => since(d.createdAt, 30)).length,
      partenaires: new Set(mine.map((d) => d.partnerId).filter(Boolean)).size,
      aRelire: rv.aRelire, rejetes: rv.rejetes, delaiRelectureH: rv.delaiMoyenH,
      controles: ctrl.length, refus: ctrl.filter((c) => (c.verdictLevel || c.result) === 'ROUGE').length,
      derogations: derogs.filter((x) => controlById.get(x.controlId)?.postId === a.id).length,
    };
  });
  const ranked = [...rows].sort((a, b) => b.duts - a.duts || b.controles - a.controles);
  ranked.forEach((r, i) => { r.rang = i + 1; });
  return rows;
}

export function antennaProfile(id) {
  const antenna = findAntennaById(id);
  if (!antenna) return null;
  const duts = realDuts().filter((d) => d.antennaId === id);
  const controls = getAllControlLogs().filter((c) => c.postId === id);
  const controlIds = new Set(controls.map((c) => c.id));
  const derogations = getAllDerogations().filter((x) => controlIds.has(x.controlId));
  const users = getAllUsers().filter((u) => u.antennaId === id && u.role === 'ANTENNA_AGENT');
  const partners = getAllPartners().map((p) => ({ id: p.id, name: p.name, duts: duts.filter((d) => d.partnerId === p.id).length })).filter((p) => p.duts > 0).sort((a, b) => b.duts - a.duts);
  const overview = antennasOverview();
  const me = overview.find((r) => r.id === id);
  return {
    antenna: { ...antenna, zone: zoneOf(antenna) },
    equipe: users,
    stats: { duts: dutStats(duts), relecture: reviewStats(duts), controles: controlStats(controls, derogations), rang: me?.rang || null, reseau: overview.length },
    partenaires: partners,
    derniersDuts: [...duts].sort(byDateDesc('createdAt')).slice(0, 10),
    derniersControles: [...controls].sort(byDateDesc('date')).slice(0, 10),
    derogations: [...derogations].sort(byDateDesc('date')).slice(0, 10),
    journal: journalFor({ dutIds: new Set(duts.map((d) => d.id)), userIds: new Set(users.map((u) => u.id)) }),
  };
}

/** Mise à jour de l'encadrement d'une antenne (admin OIC) ; auditée. */
export function updateAntennaLeadership(id, patch) {
  const list = getAllAntennas();
  const idx = list.findIndex((a) => a.id === id);
  if (idx === -1) throw new Error('Antenne introuvable.');
  const chefName = String(patch.chefName || '').trim();
  if (!chefName) throw new Error('Le nom du chef d’antenne est obligatoire.');
  const next = {
    ...list[idx],
    chef: { name: chefName, phone: String(patch.chefPhone || '').trim(), email: String(patch.chefEmail || '').trim() },
    adjoint: { name: String(patch.adjointName || '').trim() },
    effectif: Math.max(0, Number(patch.effectif) || 0),
    hours: String(patch.hours || '').trim() || list[idx].hours,
    address: String(patch.address || '').trim() || list[idx].address,
  };
  list[idx] = next;
  saveAntennas(list);
  auditService.log(AUDIT_ACTIONS.DUT_UPDATED, { note: `Fiche antenne ${next.name} mise à jour (chef : ${chefName})` });
  return next;
}

// ---------------------------------------------------------------- Partenaires
export function partnersOverview() {
  const duts = realDuts(); const ops = getAllOperations();
  return getAllPartners().map((p) => {
    const mine = duts.filter((d) => d.partnerId === p.id);
    const myOps = ops.filter((o) => o.partnerId === p.id);
    const st = statusBreakdown(mine);
    const last = [...mine].sort(byDateDesc('createdAt'))[0];
    return {
      id: p.id, name: p.name, antenne: p.antennaName || '', duts: mine.length, dutsMois: mine.filter((d) => since(d.createdAt, 30)).length,
      valides: st.VALIDE, rejetes: st.REJETE, suspendus: st.SUSPENDU + st.RETIRE,
      tauxRejet: mine.length ? Math.round((st.REJETE / mine.length) * 100) : 0,
      numerosConsommes: myOps.reduce((n, o) => n + (o.used || 0), 0),
      numerosDisponibles: myOps.filter((o) => o.status === 'VALIDATED').reduce((n, o) => n + ((o.quantity || 0) - (o.used || 0)), 0),
      plagesEnAttente: myOps.filter((o) => o.status === 'PENDING').length,
      dernierDut: last?.createdAt || null,
    };
  });
}
export function partnerProfile(id) {
  const partner = findPartnerById(id);
  if (!partner) return null;
  const duts = realDuts().filter((d) => d.partnerId === id);
  const users = getAllUsers().filter((u) => u.partnerId === id);
  const dutIds = new Set(duts.map((d) => d.id));
  const controls = getAllControlLogs().filter((c) => c.dutId && dutIds.has(c.dutId));
  const row = partnersOverview().find((r) => r.id === id);
  return {
    partner, equipe: users,
    stats: { duts: dutStats(duts), relecture: reviewStats(duts), controles: controlStats(controls, []), tauxRejet: row?.tauxRejet || 0, numeros: { consommes: row?.numerosConsommes || 0, disponibles: row?.numerosDisponibles || 0 } },
    plages: getAllOperations().filter((o) => o.partnerId === id).sort(byDateDesc('requestedAt')),
    derniersDuts: [...duts].sort(byDateDesc('createdAt')).slice(0, 10),
    derniersControles: [...controls].sort(byDateDesc('date')).slice(0, 10),
    journal: journalFor({ dutIds, userIds: new Set(users.map((u) => u.id)) }),
  };
}

// ---------------------------------------------------------------- Agents de contrôle
function mostFrequent(values) {
  const counts = new Map(); values.filter(Boolean).forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}
export function controllersOverview() {
  const controls = getAllControlLogs(); const derogs = getAllDerogations();
  return getAllUsers().filter((u) => u.role === 'CONTROLLER').map((u) => {
    const mine = controls.filter((c) => c.agentId === u.id);
    const last = [...mine].sort(byDateDesc('date'))[0];
    return {
      id: u.id, name: u.name, email: u.email, scans: mine.length, scansSemaine: mine.filter((c) => since(c.date, 7)).length,
      verdicts: verdictBreakdown(mine), horsLigne: mine.filter((c) => c.mode === 'HORS_LIGNE').length,
      derogations: derogs.filter((x) => x.agentId === u.id).length,
      posteHabituel: mostFrequent(mine.map((c) => c.postName)), dernierScan: last?.date || null,
    };
  });
}
export function controllerProfile(id) {
  const user = getAllUsers().find((u) => u.id === id && u.role === 'CONTROLLER');
  if (!user) return null;
  const controls = getAllControlLogs().filter((c) => c.agentId === id);
  const derogations = getAllDerogations().filter((x) => x.agentId === id);
  const row = controllersOverview().find((r) => r.id === id);
  return {
    user, stats: { scans: controls.length, scansSemaine: row?.scansSemaine || 0, controles: controlStats(controls, derogations), posteHabituel: row?.posteHabituel || null },
    derniersControles: [...controls].sort(byDateDesc('date')).slice(0, 15),
    derogations: [...derogations].sort(byDateDesc('date')).slice(0, 10),
    journal: journalFor({ userIds: new Set([id]) }),
  };
}

// ---------------------------------------------------------------- Transporteurs
export function transportersOverview() {
  const duts = realDuts(); const controls = getAllControlLogs(); const vehicles = vehiclesRepo.getAll();
  return transportersRepo.getAll().map((t) => {
    const mine = duts.filter((d) => d.general?.transporterId === t.id);
    const ids = new Set(mine.map((d) => d.id));
    const ctrl = controls.filter((c) => c.dutId && ids.has(c.dutId));
    return {
      id: t.id, name: t.name, registre: t.registre || '', contact: t.contact || '', duts: mine.length, valides: mine.filter((d) => d.status === DUT_STATUS.VALIDE).length,
      vehicules: vehicles.filter((v) => v.transporterId === t.id).length, controles: ctrl.length,
      refus: ctrl.filter((c) => (c.verdictLevel || c.result) === 'ROUGE').length,
      voyagesImpossibles: ctrl.filter((c) => (c.findings || []).some((f) => f.code === 'VOYAGE_IMPOSSIBLE')).length,
      dernierDut: [...mine].sort(byDateDesc('createdAt'))[0]?.createdAt || null,
    };
  });
}
export function transporterProfile(id) {
  const transporter = transportersRepo.getAll().find((t) => t.id === id);
  if (!transporter) return null;
  const duts = realDuts().filter((d) => d.general?.transporterId === id);
  const dutIds = new Set(duts.map((d) => d.id));
  const controls = getAllControlLogs().filter((c) => c.dutId && dutIds.has(c.dutId));
  return {
    transporter,
    stats: { duts: dutStats(duts), controles: controlStats(controls, []) },
    vehicules: vehiclesRepo.getAll().filter((v) => v.transporterId === id),
    derniersDuts: [...duts].sort(byDateDesc('createdAt')).slice(0, 10),
    derniersControles: [...controls].sort(byDateDesc('date')).slice(0, 10),
    journal: journalFor({ dutIds }),
  };
}

// ---------------------------------------------------------------- Export
export function toCsv(rows) {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  const cell = (v) => { const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [keys.join(';'), ...rows.map((r) => keys.map((k) => cell(r[k])).join(';'))].join('\n');
}
