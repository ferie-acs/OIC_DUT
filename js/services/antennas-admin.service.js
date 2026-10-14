// Lot d2 : gestion des antennes par l'administration OIC — création, mise à jour complète
// (nom, ville, position comprises), ouverture des comptes, affectation de l'encadrement à partir
// des comptes utilisateurs, désactivation et fermeture contrôlées.
import { getCurrentUser } from '../core/auth.js';
import { can } from '../core/permissions.js';
import { AUDIT_ACTIONS, ROLES } from '../core/constants.js';
import { uuid, nowIso } from '../core/utils.js';
import { getAllAntennas, saveAntennas, findAntennaById } from '../repositories/antennas.repository.js';
import { getAllUsers, saveUsers } from '../repositories/users.repository.js';
import { getAllPartners, savePartners } from '../repositories/partners.repository.js';
import { getAllDuts } from '../repositories/dut.repository.js';
import { getAllOperations } from '../repositories/operations.repository.js';
import { getAllAllocations } from '../repositories/range-stock.repository.js';
import { getAllSites } from '../repositories/sites.repository.js';
import { zoneOf } from '../data/antennas.js';
import { saveUser } from './admin.service.js';
import { allocationIntervals, antennaStatus } from './ranges.service.js';
import * as auditService from './audit.service.js';

export const ZONES = ['Sud', 'Centre', 'Nord', 'Ouest', 'Est'];
export const ANTENNA_STATUS_LABELS = { ACTIVE: 'Ouverte', INACTIVE: 'Désactivée', CLOSED: 'Fermée' };
/** Emprise indicative de la Côte d'Ivoire pour contrôler une position saisie. */
export const CI_BOUNDS = { latMin: 4.1, latMax: 10.8, lngMin: -8.7, lngMax: -2.4 };

const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
const txt = (v, max) => String(v ?? '').trim().slice(0, max);

function admin() {
  const user = getCurrentUser();
  if (!user) throw new Error('Session expirée : reconnectez-vous.');
  if (!can(user, 'antennas.manage')) throw new Error('La gestion des antennes est réservée à l’administration OIC.');
  return user;
}

const agentsOf = (antennaId, users = getAllUsers()) => users.filter((u) => u.role === ROLES.ANTENNA_AGENT && u.antennaId === antennaId && u.active !== false);

export function suggestCode(list = getAllAntennas()) {
  const used = new Set(list.map((a) => a.code).filter(Boolean));
  for (let i = list.length + 1; i < 1000; i += 1) { const c = `OIC-${String(i).padStart(3, '0')}`; if (!used.has(c)) return c; }
  return `OIC-${Date.now().toString().slice(-4)}`;
}

function availableStock(antennaId) {
  const ops = getAllOperations();
  return getAllAllocations().filter((a) => a.antennaId === antennaId && a.status === 'ACTIVE').reduce((n, a) => n + allocationIntervals(a, ops).reduce((m, [s, e]) => m + e - s + 1, 0), 0);
}

// ------------------------------------------------------------- Consultation

export function listAntennasAdmin() {
  admin();
  const users = getAllUsers(); const sites = getAllSites(); const partners = getAllPartners();
  return getAllAntennas().map((a) => ({
    id: a.id, code: a.code || '', name: a.name, city: a.city, zone: a.zone || zoneOf(a), status: antennaStatus(a),
    chef: a.chef?.name || '', adjoint: a.adjoint?.name || '', agents: agentsOf(a.id, users).length,
    sites: sites.filter((s) => s.antennaId === a.id && s.status !== 'INACTIVE').length,
    partenaires: partners.filter((p) => p.antennaId === a.id).length, stock: availableStock(a.id),
  }));
}

export function antennaDetail(id) {
  admin();
  const a = findAntennaById(id);
  if (!a) return null;
  return { antenna: { ...a, zone: a.zone || zoneOf(a), status: antennaStatus(a) }, agents: agentsOf(id), allAgents: getAllUsers().filter((u) => u.role === ROLES.ANTENNA_AGENT && u.active !== false), checks: closureChecks(id) };
}

// ------------------------------------------------------------- Création / mise à jour

function clean(values, currentId = null) {
  const list = getAllAntennas();
  const v = {
    name: txt(values.name, 60).toUpperCase(), code: txt(values.code, 12).toUpperCase(), city: txt(values.city, 60), zone: txt(values.zone, 10),
    address: txt(values.address, 160), hours: txt(values.hours, 80), phone: txt(values.phone, 60), email: txt(values.email, 120).toLowerCase(),
    lat: Number(String(values.lat ?? '').replace(',', '.')), lng: Number(String(values.lng ?? '').replace(',', '.')),
  };
  if (v.name.length < 2) throw new Error('Le nom de l’antenne est obligatoire (2 caractères minimum).');
  if (list.some((a) => a.id !== currentId && norm(a.name) === norm(v.name))) throw new Error('Une antenne porte déjà ce nom.');
  if (!/^[A-Z0-9-]{2,12}$/.test(v.code)) throw new Error('Le code doit comporter 2 à 12 lettres, chiffres ou tirets.');
  if (list.some((a) => a.id !== currentId && a.code === v.code)) throw new Error('Ce code est déjà attribué à une autre antenne.');
  if (v.city.length < 2) throw new Error('La ville est obligatoire.');
  if (!String(values.lat ?? '').trim() || !String(values.lng ?? '').trim() || !Number.isFinite(v.lat) || !Number.isFinite(v.lng)) throw new Error('Choisissez la position sur la carte ou saisissez la latitude et la longitude.');
  if (v.lat < CI_BOUNDS.latMin || v.lat > CI_BOUNDS.latMax || v.lng < CI_BOUNDS.lngMin || v.lng > CI_BOUNDS.lngMax) throw new Error('La position doit se situer en Côte d’Ivoire (latitude 4,1 à 10,8 ; longitude −8,7 à −2,4).');
  v.lat = Math.round(v.lat * 1e5) / 1e5; v.lng = Math.round(v.lng * 1e5) / 1e5;
  if (!ZONES.includes(v.zone)) v.zone = zoneOf(v);
  if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) throw new Error('Adresse e-mail de l’antenne invalide.');
  return v;
}

export function createAntenna(values) {
  const user = admin();
  const v = clean(values);
  const antenna = {
    id: uuid(), ...v, address: v.address || 'Adresse à compléter', hours: v.hours || 'Non renseignés', phone: v.phone || '',
    chef: { name: '' }, adjoint: { name: '' }, effectif: 0, status: 'ACTIVE', managed: true,
    createdAt: nowIso(), createdBy: user.name, statusHistory: [{ status: 'ACTIVE', at: nowIso(), by: user.name, reason: 'Création' }],
  };
  saveAntennas([...getAllAntennas(), antenna]);
  auditService.log(AUDIT_ACTIONS.ANTENNA_CREATED, { newValue: antenna.code, note: `${antenna.name} (${antenna.code}) · ${antenna.city} · ${antenna.lat}, ${antenna.lng}` });
  return antenna;
}

export function updateAntenna(id, values) {
  admin();
  const list = getAllAntennas();
  const idx = list.findIndex((a) => a.id === id);
  if (idx === -1) throw new Error('Antenne introuvable.');
  const old = list[idx];
  if (antennaStatus(old) === 'CLOSED') throw new Error('Une antenne fermée ne peut plus être modifiée.');
  const v = clean(values, id);
  const next = { ...old, ...v, address: v.address || old.address, hours: v.hours || old.hours, managed: true, updatedAt: nowIso() };
  // Une antenne de la liste officielle garde son nom d'origine pour la synchronisation de l'annuaire.
  if (old.source && !old.directoryName && norm(old.name) !== norm(v.name)) next.directoryName = old.name;
  if (values.chefPhone !== undefined) next.chef = { ...(old.chef || {}), phone: txt(values.chefPhone, 60) };
  if (values.effectif !== undefined && String(values.effectif).trim() !== '') {
    const eff = Number(values.effectif);
    if (!Number.isInteger(eff) || eff < 0 || eff > 500) throw new Error('L’effectif doit être un nombre entier entre 0 et 500.');
    next.effectif = eff;
  }
  list[idx] = next;
  saveAntennas(list);
  if (old.name !== next.name) {
    saveUsers(getAllUsers().map((u) => (u.antennaId === id ? { ...u, antennaName: next.name } : u)));
    savePartners(getAllPartners().map((p) => (p.antennaId === id ? { ...p, antennaName: next.name } : p)));
  }
  const changed = ['name', 'code', 'city', 'zone', 'address', 'lat', 'lng', 'hours', 'phone', 'email'].filter((k) => String(old[k] ?? '') !== String(next[k] ?? ''));
  auditService.log(AUDIT_ACTIONS.ANTENNA_UPDATED, { oldValue: old.name, newValue: next.name, note: `${next.name} · ${changed.length ? `champs modifiés : ${changed.join(', ')}` : 'aucun changement d’identité'}` });
  return next;
}

// ------------------------------------------------------------- Encadrement et comptes

export function assignStaff(id, { chefUserId = '', adjointUserId = '' } = {}) {
  admin();
  const list = getAllAntennas();
  const a = list.find((x) => x.id === id);
  if (!a) throw new Error('Antenne introuvable.');
  if (antennaStatus(a) === 'CLOSED') throw new Error('Une antenne fermée ne peut plus être modifiée.');
  const agents = agentsOf(id);
  const pick = (uid) => (uid ? agents.find((u) => u.id === uid) : null);
  const chef = pick(chefUserId); const adjoint = pick(adjointUserId);
  if (chefUserId && !chef) throw new Error('Le chef doit être un compte actif d’agent rattaché à cette antenne.');
  if (adjointUserId && !adjoint) throw new Error('L’adjoint doit être un compte actif d’agent rattaché à cette antenne.');
  if (chef && adjoint && chef.id === adjoint.id) throw new Error('Le chef et l’adjoint doivent être deux personnes différentes.');
  a.chef = chef ? { userId: chef.id, name: chef.name, email: chef.email, phone: a.chef?.userId === chef.id ? (a.chef?.phone || '') : '' } : { name: '' };
  a.adjoint = adjoint ? { userId: adjoint.id, name: adjoint.name, email: adjoint.email } : { name: '' };
  a.managed = true;
  a.effectif = Math.max(Number(a.effectif) || 0, agents.length);
  saveAntennas(list);
  auditService.log(AUDIT_ACTIONS.ANTENNA_STAFF_ASSIGNED, { newValue: a.chef.name || '—', note: `${a.name} · chef : ${a.chef.name || 'aucun'} · adjoint : ${a.adjoint.name || 'aucun'}` });
  return a;
}

function clearStaffRole(antennaId, userId) {
  const list = getAllAntennas();
  const a = list.find((x) => x.id === antennaId);
  if (!a) return;
  if (a.chef?.userId === userId) a.chef = { name: '' };
  if (a.adjoint?.userId === userId) a.adjoint = { name: '' };
  a.managed = true;
  saveAntennas(list);
}

/** Rattache un compte d'agent existant à cette antenne (le compte change de rattachement). */
export async function attachAgent(antennaId, userId) {
  admin();
  const target = findAntennaById(antennaId);
  if (!target || antennaStatus(target) !== 'ACTIVE') throw new Error('Choisissez une antenne ouverte.');
  const u = getAllUsers().find((x) => x.id === userId && x.role === ROLES.ANTENNA_AGENT && x.active !== false);
  if (!u) throw new Error('Choisissez un compte actif d’agent d’antenne.');
  if (u.antennaId === antennaId) throw new Error('Ce compte est déjà rattaché à cette antenne.');
  const from = u.antennaId;
  await saveUser(u.id, { name: u.name, email: u.email, role: ROLES.ANTENNA_AGENT, scope: antennaId });
  if (from) clearStaffRole(from, u.id);
  auditService.log(AUDIT_ACTIONS.ANTENNA_STAFF_ASSIGNED, { newValue: target.name, note: `${u.name} rattaché à ${target.name}${from ? ` (venant de ${findAntennaById(from)?.name || 'une autre antenne'})` : ''}` });
}

/** Réaffecte tous les agents d'une antenne vers une autre (préalable à la fermeture). */
export async function reassignAgents(fromId, toId) {
  admin();
  if (fromId === toId) throw new Error('Choisissez une autre antenne.');
  const agents = agentsOf(fromId);
  for (const u of agents) await attachAgent(toId, u.id);
  return agents.length;
}

/** Ouvre un compte d'agent pour l'antenne ; le mot de passe initial est affiché une seule fois. */
export async function openAntennaAccount(antennaId, { name, email, asChef = false } = {}) {
  admin();
  const a = findAntennaById(antennaId);
  if (!a || antennaStatus(a) !== 'ACTIVE') throw new Error('Les comptes ne s’ouvrent que pour une antenne ouverte.');
  const result = await saveUser(null, { name, email, role: ROLES.ANTENNA_AGENT, scope: antennaId });
  if (asChef) assignStaff(antennaId, { chefUserId: result.user.id, adjointUserId: a.adjoint?.userId || '' });
  auditService.log(AUDIT_ACTIONS.ANTENNA_ACCOUNT_OPENED, { newValue: result.user.email, note: `${a.name} · compte ouvert pour ${result.user.name}${asChef ? ' (chef d’antenne)' : ''}` });
  return result;
}

// ------------------------------------------------------------- Désactivation, fermeture

/** Ce qui empêche la fermeture : agents, stock non repris, transferts en attente, dossiers, sites. */
export function closureChecks(id) {
  const duts = getAllDuts();
  const blocking = [];
  const agents = agentsOf(id);
  if (agents.length) blocking.push({ code: 'AGENTS', label: `${agents.length} compte(s) d’agent encore rattaché(s)`, action: 'Réaffectez les agents vers une autre antenne.' });
  const stock = availableStock(id);
  if (stock) blocking.push({ code: 'STOCK', label: `${stock} numéro(s) encore en stock`, action: 'Reprenez le stock de l’antenne.' });
  const pending = getAllOperations().filter((o) => o.antennaId === id && o.status === 'TRANSFER_PENDING').length;
  if (pending) blocking.push({ code: 'TRANSFERTS', label: `${pending} vente(s) de plage en attente de validation`, action: 'Validez ou refusez ces transferts.' });
  const dossiers = duts.filter((d) => d.antennaId === id && d.status === 'TERMINE').length;
  if (dossiers) blocking.push({ code: 'DUT', label: `${dossiers} DUT en attente de validation`, action: 'Traitez ces dossiers avant la fermeture.' });
  const sites = getAllSites().filter((s) => s.antennaId === id && s.status !== 'INACTIVE').length;
  if (sites) blocking.push({ code: 'SITES', label: `${sites} site(s) actif(s) rattaché(s)`, action: 'Rattachez ces sites à une autre antenne ou désactivez-les.' });
  const partners = getAllPartners().filter((p) => p.antennaId === id).length;
  const warnings = partners ? [{ code: 'PARTENAIRES', label: `${partners} partenaire(s) rattaché(s) à cette antenne`, action: 'Leur rattachement se modifie dans la gestion des partenaires.' }] : [];
  return { blocking, warnings, canClose: blocking.length === 0 };
}

export function setAntennaStatus(id, { status, reason, date }) {
  const user = admin();
  const motive = txt(reason, 300);
  if (!motive) throw new Error('Le motif est obligatoire.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) throw new Error('La date d’effet est obligatoire.');
  const list = getAllAntennas();
  const a = list.find((x) => x.id === id);
  if (!a) throw new Error('Antenne introuvable.');
  const current = antennaStatus(a);
  if (current === 'CLOSED') throw new Error('Cette antenne est déjà fermée.');
  if (status === 'INACTIVE' && current !== 'ACTIVE') throw new Error('Seule une antenne ouverte peut être désactivée.');
  if (status === 'ACTIVE' && current !== 'INACTIVE') throw new Error('Seule une antenne désactivée peut être réactivée.');
  if (!['ACTIVE', 'INACTIVE', 'CLOSED'].includes(status)) throw new Error('Statut inconnu.');
  if (status === 'CLOSED') {
    const checks = closureChecks(id);
    if (!checks.canClose) throw new Error(`Fermeture impossible : ${checks.blocking.map((b) => b.label).join(' ; ')}.`);
  }
  a.status = status;
  a.statusReason = motive; a.statusDate = date;
  a.statusHistory = [...(a.statusHistory || []), { status, reason: motive, date, at: nowIso(), by: user.name }];
  if (status === 'CLOSED') Object.assign(a, { closedAt: nowIso(), closedBy: user.name });
  saveAntennas(list);
  const action = { ACTIVE: AUDIT_ACTIONS.ANTENNA_REACTIVATED, INACTIVE: AUDIT_ACTIONS.ANTENNA_DEACTIVATED, CLOSED: AUDIT_ACTIONS.ANTENNA_CLOSED }[status];
  auditService.log(action, { oldValue: current, newValue: status, note: `${a.name} · effet au ${date} · ${motive}` });
  return a;
}
