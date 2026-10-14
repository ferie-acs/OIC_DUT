// Lot d2 : référentiel des sites (ports, frontières, gares, zones industrielles, parcs…)
// rattachés à une antenne et consultables sur la carte.
import { getCurrentUser } from '../core/auth.js';
import { can } from '../core/permissions.js';
import { AUDIT_ACTIONS } from '../core/constants.js';
import { uuid, nowIso } from '../core/utils.js';
import { getAllSites, saveSites } from '../repositories/sites.repository.js';
import { findAntennaById } from '../repositories/antennas.repository.js';
import { CI_BOUNDS } from './antennas-admin.service.js';
import { antennaStatus } from './ranges.service.js';
import * as auditService from './audit.service.js';

export const SITE_TYPES = {
  PORT: { label: 'Port', icon: 'anchor' },
  FRONTIERE: { label: 'Poste frontière', icon: 'flag' },
  GARE: { label: 'Gare', icon: 'trainFront' },
  ZONE_INDUSTRIELLE: { label: 'Zone industrielle', icon: 'factory' },
  PARC: { label: 'Parc à camions', icon: 'warehouse' },
  AUTRE: { label: 'Autre site', icon: 'mapPin' },
};

const txt = (v, max) => String(v ?? '').trim().slice(0, max);

/** Sites visibles : l'OIC voit tout, l'agent d'antenne les sites de son antenne. Pour la carte, `publicMap` donne les sites actifs. */
export function listSites({ antennaId = '', type = '', includeInactive = false, publicMap = false } = {}) {
  const user = getCurrentUser();
  if (!user) throw new Error('Session expirée : reconnectez-vous.');
  if (!publicMap && !can(user, 'sites.view')) throw new Error('Consultation des sites non autorisée.');
  const own = !publicMap && user.role === 'ANTENNA_AGENT' ? user.antennaId : '';
  return getAllSites()
    .filter((s) => (includeInactive && !publicMap) || s.status !== 'INACTIVE')
    .filter((s) => (!own || s.antennaId === own) && (!antennaId || s.antennaId === antennaId) && (!type || s.type === type))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

export function saveSite(id, values) {
  const user = getCurrentUser();
  if (!can(user, 'sites.manage')) throw new Error('Le référentiel des sites est géré par l’administration OIC.');
  const list = getAllSites();
  const old = id ? list.find((s) => s.id === id) : null;
  if (id && !old) throw new Error('Site introuvable.');
  const v = {
    name: txt(values.name, 80), code: txt(values.code, 16).toUpperCase(), type: values.type, antennaId: values.antennaId,
    city: txt(values.city, 60), description: txt(values.description, 300),
    lat: Number(String(values.lat ?? '').replace(',', '.')), lng: Number(String(values.lng ?? '').replace(',', '.')),
  };
  if (v.name.length < 2) throw new Error('Le nom du site est obligatoire.');
  if (!SITE_TYPES[v.type]) throw new Error('Choisissez le type de site.');
  if (!/^[A-Z0-9-]{2,16}$/.test(v.code)) throw new Error('Le code doit comporter 2 à 16 lettres, chiffres ou tirets.');
  if (list.some((s) => s.id !== id && s.code === v.code)) throw new Error('Ce code de site est déjà utilisé.');
  const antenna = findAntennaById(v.antennaId);
  if (!antenna) throw new Error('Choisissez l’antenne de rattachement.');
  if (antennaStatus(antenna) === 'CLOSED') throw new Error('Un site ne peut pas être rattaché à une antenne fermée.');
  if (!String(values.lat ?? '').trim() || !String(values.lng ?? '').trim() || !Number.isFinite(v.lat) || !Number.isFinite(v.lng)) throw new Error('Choisissez la position sur la carte ou saisissez la latitude et la longitude.');
  if (v.lat < CI_BOUNDS.latMin || v.lat > CI_BOUNDS.latMax || v.lng < CI_BOUNDS.lngMin || v.lng > CI_BOUNDS.lngMax) throw new Error('La position doit se situer en Côte d’Ivoire.');
  v.lat = Math.round(v.lat * 1e5) / 1e5; v.lng = Math.round(v.lng * 1e5) / 1e5;
  const site = { ...(old || { id: uuid(), status: 'ACTIVE', createdAt: nowIso(), createdBy: user.name }), ...v, antennaName: antenna.name, updatedAt: nowIso() };
  saveSites(old ? list.map((s) => (s.id === id ? site : s)) : [...list, site]);
  auditService.log(AUDIT_ACTIONS.SITE_SAVED, { newValue: site.code, note: `${old ? 'Site modifié' : 'Site créé'} · ${site.name} (${SITE_TYPES[site.type].label}) · antenne ${antenna.name}` });
  return site;
}

export function setSiteActive(id, active, reason = '') {
  const user = getCurrentUser();
  if (!can(user, 'sites.manage')) throw new Error('Le référentiel des sites est géré par l’administration OIC.');
  const motive = txt(reason, 300);
  if (!active && !motive) throw new Error('Le motif de la désactivation est obligatoire.');
  const list = getAllSites();
  const site = list.find((s) => s.id === id);
  if (!site) throw new Error('Site introuvable.');
  if (active && antennaStatus(findAntennaById(site.antennaId)) === 'CLOSED') throw new Error('Rattachez d’abord ce site à une antenne ouverte.');
  site.status = active ? 'ACTIVE' : 'INACTIVE';
  site.statusReason = motive; site.updatedAt = nowIso();
  saveSites(list);
  auditService.log(AUDIT_ACTIONS.SITE_STATUS, { newValue: site.status, note: `${site.name} · ${active ? 'réactivé' : `désactivé : ${motive}`}` });
  return site;
}
