import { DUT_STATUS, CONTROL_RESULTS } from '../core/constants.js';
import { getAllDuts } from '../repositories/dut.repository.js';
import { getAllOperations, findActiveOperationForPartner } from '../repositories/operations.repository.js';
import { getAllControlLogs } from '../repositories/controls.repository.js';
import { getAllAntennas } from '../repositories/antennas.repository.js';
import { getAllUsers } from '../repositories/users.repository.js';
import { transportersRepo, vehiclesRepo } from '../repositories/referentials.repository.js';
import * as auditService from './audit.service.js';

function countBy(list, keyFn) {
  const map = {};
  list.forEach((item) => {
    const key = keyFn(item);
    map[key] = (map[key] || 0) + 1;
  });
  return map;
}

export function partnerStats(partnerId) {
  const duts = getAllDuts().filter((d) => d.partnerId === partnerId && !d.canary);
  const operation = findActiveOperationForPartner(partnerId) || getAllOperations().find((o) => o.partnerId === partnerId);
  const thisMonth = new Date().toISOString().slice(0, 7);
  return {
    enEdition: duts.filter((d) => d.status === DUT_STATUS.EN_EDITION).length,
    enAttente: duts.filter((d) => d.status === DUT_STATUS.TERMINE).length,
    valides: duts.filter((d) => d.status === DUT_STATUS.VALIDE).length,
    rejetes: duts.filter((d) => d.status === DUT_STATUS.REJETE).length,
    retires: duts.filter((d) => d.status === DUT_STATUS.RETIRE).length,
    creesMois: duts.filter((d) => (d.createdAt || '').slice(0, 7) === thisMonth).length,
    operation,
    disponibles: operation ? operation.quantity - operation.used : 0,
    recentActivity: auditService.forDut(null).length ? [] : [],
    duts,
  };
}

export function antennaStats(antennaId) {
  const duts = getAllDuts().filter((d) => d.antennaId === antennaId);
  const today = new Date().toISOString().slice(0, 10);
  const partnerIds = new Set(duts.map((d) => d.partnerId));
  return {
    aValider: duts.filter((d) => d.status === DUT_STATUS.TERMINE).length,
    valideesAujourdhui: duts.filter((d) => d.status === DUT_STATUS.VALIDE && (d.validatedAt || '').slice(0, 10) === today).length,
    rejetes: duts.filter((d) => d.status === DUT_STATUS.REJETE).length,
    partenairesActifs: partnerIds.size,
    operationsEnAttente: getAllOperations().filter((o) => o.status === 'PENDING').length,
    pending: duts.filter((d) => d.status === DUT_STATUS.TERMINE),
  };
}

export function oicStats() {
  const duts = getAllDuts();
  const controls = getAllControlLogs();
  const totals = computeMarchandiseTonnageTotal(duts);
  return {
    emis: duts.length,
    valides: duts.filter((d) => d.status === DUT_STATUS.VALIDE).length,
    suspendus: duts.filter((d) => d.status === DUT_STATUS.SUSPENDU).length,
    retires: duts.filter((d) => d.status === DUT_STATUS.RETIRE).length,
    tonnage: totals,
    transporteursActifs: transportersRepo.getAll().length,
    vehiculesActifs: vehiclesRepo.getAll().length,
    antennesActives: getAllAntennas().length,
    controlesEffectues: controls.length,
    anomalies: controls.filter((c) => c.result !== CONTROL_RESULTS.VALID).length,
    byMonth: dutsByMonth(duts),
    byAntenna: countBy(duts, (d) => d.antennaName || 'N/A'),
    byPartner: countBy(duts, (d) => d.partnerName || 'N/A'),
    byMerchandise: merchandiseBreakdown(duts),
    topDestinations: countBy(duts, (d) => d.trajet?.dechargement?.ville || 'N/A'),
    tonnageByDestination: tonnageByDestination(duts),
    security: securityStats(controls),
  };
}

function computeMarchandiseTonnageTotal(duts) {
  return duts.reduce((sum, d) => sum + (d.marchandises || []).reduce((s, m) => s + (Number(m.poidsTonnes) || 0), 0), 0);
}

function dutsByMonth(duts) {
  const map = {};
  duts.forEach((d) => {
    const month = (d.createdAt || '').slice(0, 7);
    if (!month) return;
    map[month] = (map[month] || 0) + 1;
  });
  return map;
}

function merchandiseBreakdown(duts) {
  const map = {};
  duts.forEach((d) => (d.marchandises || []).forEach((m) => {
    const key = m.nature || 'Autre';
    map[key] = (map[key] || 0) + (Number(m.poidsTonnes) || 0);
  }));
  return map;
}

function tonnageByDestination(duts) {
  const map = {};
  duts.forEach((d) => {
    const dest = d.trajet?.dechargement?.ville || 'N/A';
    const tonnage = (d.marchandises || []).reduce((s, m) => s + (Number(m.poidsTonnes) || 0), 0);
    map[dest] = (map[dest] || 0) + tonnage;
  });
  return map;
}

function securityStats(controls) {
  const today = new Date().toISOString().slice(0, 10);
  const controlsToday = controls.filter((c) => (c.date || '').slice(0, 10) === today);
  return {
    controlesAujourdhui: controlsToday.length,
    validesControles: controls.filter((c) => c.result === CONTROL_RESULTS.VALID).length,
    qrNonReconnus: controls.filter((c) => c.result === CONTROL_RESULTS.UNKNOWN).length,
    suspendusPresentes: controls.filter((c) => c.result === CONTROL_RESULTS.SUSPENDED).length,
    retiresPresentes: controls.filter((c) => c.result === CONTROL_RESULTS.WITHDRAWN).length,
    derniers: controls.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6),
  };
}

export function usersCount() {
  return getAllUsers().length;
}
