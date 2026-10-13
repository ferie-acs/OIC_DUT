import { uuid, nowIso } from '../core/utils.js';
import { getCurrentUser } from '../core/auth.js';
import { can } from '../core/permissions.js';
import { AUDIT_ACTIONS } from '../core/constants.js';
import * as auditService from './audit.service.js';
import {
  transportersRepo, vehiclesRepo, driversRepo, thirdPartiesRepo, merchandiseTypesRepo, packagingTypesRepo,
  localitiesRepo,
} from '../repositories/referentials.repository.js';

/*
 * Référentiels de saisie du DUT.
 * - Transporteurs, véhicules, conducteurs : cloisonnés. Un partenaire ne voit et ne modifie que les fiches
 *   qu'il a enregistrées ; un transporteur ne voit que sa propre fiche, ses véhicules et ses conducteurs.
 *   Ces fiches se désactivent (réversible) ou se retirent (définitif) : l'historique est conservé et une
 *   fiche inactive ou retirée n'est plus proposée à la saisie.
 * - Tiers, marchandises, emballages, localités : référentiels partagés, désactivables et réactivables.
 * Chaque changement d'état est journalisé.
 */

export const REF_STATES = { ACTIF: 'ACTIF', INACTIF: 'INACTIF', RETIRE: 'RETIRE' };
export const REF_STATE_LABELS = { ACTIF: 'Actif', INACTIF: 'Désactivé', RETIRE: 'Retiré' };

export function stateOf(item) {
  return item?.etat || REF_STATES.ACTIF;
}

// Intégration lots d1 / d3 : un groupement suspendu, résilié ou non validé (lot d1, champ `status`) et un
// véhicule retiré de la flotte déclarée (lot d1) ne sont plus proposés à la saisie, comme une fiche désactivée.
const BLOCKED_STATUSES = ['EN_ATTENTE', 'SUSPENDU', 'RESILIE', 'REFUSE', 'RETIRE'];

export function isSelectable(item) {
  return !!item && stateOf(item) === REF_STATES.ACTIF && !BLOCKED_STATUSES.includes(item.status);
}

/** Périmètre de référentiel d'un utilisateur : partenaire, transporteur, tout (OIC) ou rien. */
export function ownerForUser(user) {
  if (!user) return null;
  if (['PARTNER_ADMIN', 'PARTNER_EDITOR'].includes(user.role) && user.partnerId) return { partnerId: user.partnerId };
  if (user.role === 'TRANSPORTEUR' && user.transporterId) return { transporterId: user.transporterId };
  if (user.role === 'OIC_ADMIN') return { all: true };
  return null;
}

/** Transporteur imposé par le dossier (DUT édité par un transporteur, ou saisi au guichet pour lui). */
export function lockedTransporterId(dut) {
  if (dut?.editeur?.type === 'TRANSPORTEUR') return dut.editeur.transporterId || null;
  if (dut?.guichet?.usagerType === 'TRANSPORTEUR') return dut.guichet.usagerId || null;
  return null;
}

/** Périmètre de référentiel d'un dossier : celui de son éditeur (partenaire ou transporteur). */
export function ownerForDut(dut) {
  const transporterId = lockedTransporterId(dut);
  if (transporterId) return { transporterId };
  if (dut?.partnerId) return { partnerId: dut.partnerId };
  return null;
}

function inScope(kind, item, owner) {
  if (!owner) return false;
  if (owner.all) return true;
  if (owner.partnerId) return item.ownerPartnerId === owner.partnerId;
  if (owner.transporterId) return kind === 'transporters' ? item.id === owner.transporterId : item.transporterId === owner.transporterId;
  return false;
}

const LABELS = {
  transporters: 'Transporteur', vehicles: 'Véhicule', drivers: 'Conducteur', thirdParties: 'Tiers',
  merchandiseTypes: 'Marchandise', packagingTypes: 'Emballage', localities: 'Localité',
};

function nameOf(kind, item) {
  if (kind === 'vehicles') return item.immatriculation;
  if (kind === 'drivers') return [item.nom, item.prenoms].filter(Boolean).join(' ');
  if (kind === 'thirdParties') return item.raisonSociale;
  return item.name || item.nom || '';
}

function clean(data = {}) {
  const out = {};
  for (const [key, value] of Object.entries(data)) {
    if (['id', 'etat', 'historique', 'ownerPartnerId'].includes(key)) continue;
    out[key] = typeof value === 'string' ? value.trim().slice(0, 200) : value;
  }
  return out;
}

function requireManager() {
  const user = getCurrentUser();
  if (!can(user, 'referentials.manage')) throw new Error('Vous n’êtes pas habilité à gérer les référentiels.');
  return user;
}

function trace(item, action, user, motif = '') {
  return [...(item.historique || []), { action, at: nowIso(), by: user?.name || 'SYSTEM', motif }];
}

function audit(action, kind, item, motif = '') {
  auditService.log(action, { note: `${LABELS[kind]} « ${nameOf(kind, item)} »${motif ? ` — ${motif}` : ''}` });
}

function changeState(kind, repo, item, user, target, action, motif) {
  const updated = repo.update(item.id, {
    etat: target,
    ...(target === REF_STATES.ACTIF ? { reactivatedAt: nowIso() } : {}),
    ...(target === REF_STATES.INACTIF ? { deactivatedAt: nowIso(), deactivatedBy: user.name, deactivationReason: motif } : {}),
    ...(target === REF_STATES.RETIRE ? { removedAt: nowIso(), removedBy: user.name, removalReason: motif } : {}),
    historique: trace(item, action, user, motif),
  });
  audit({ ACTIF: AUDIT_ACTIONS.REF_REACTIVATED, INACTIF: AUDIT_ACTIONS.REF_DEACTIVATED, RETIRE: AUDIT_ACTIONS.REF_REMOVED }[target], kind, item, motif);
  return updated;
}

/** Fiches cloisonnées : transporteurs, véhicules, conducteurs. */
function ownedRef(kind, repo) {
  const api = {
    kind,
    owned: true,
    /** Fiches du périmètre (retirées exclues par défaut). */
    list: ({ includeRemoved = false, owner = ownerForUser(getCurrentUser()) } = {}) => repo.getAll()
      .filter((item) => inScope(kind, item, owner))
      .filter((item) => includeRemoved || stateOf(item) !== REF_STATES.RETIRE),
    /** Fiches proposées à la saisie : actives et dans le périmètre. */
    selectable: (owner = ownerForUser(getCurrentUser())) => api.list({ owner }).filter(isSelectable),
    findVisible: (id, owner = ownerForUser(getCurrentUser())) => {
      const item = repo.findById(id);
      return item && inScope(kind, item, owner) ? item : null;
    },
    add: (data) => {
      const user = requireManager();
      const record = { id: uuid(), ...clean(data), ownerPartnerId: user.partnerId, etat: REF_STATES.ACTIF, historique: [] };
      if (kind !== 'transporters' && record.transporterId) {
        const transporter = transporters.findVisible(record.transporterId, { partnerId: user.partnerId });
        if (!transporter) throw new Error('Choisissez un transporteur de votre référentiel.');
        if (!isSelectable(transporter)) throw new Error('Ce transporteur est désactivé ou retiré.');
      }
      if (kind === 'vehicles' && !record.transporterId) throw new Error('Le transporteur propriétaire du véhicule est obligatoire.');
      record.historique = trace(record, 'CREATION', user);
      repo.add(record);
      audit(AUDIT_ACTIONS.REF_ADDED, kind, record);
      return record;
    },
    update: (id, data) => {
      const user = requireManager();
      const item = api.findVisible(id, { partnerId: user.partnerId });
      if (!item) throw new Error('Cette fiche ne fait pas partie de votre référentiel.');
      if (stateOf(item) === REF_STATES.RETIRE) throw new Error('Une fiche retirée ne peut plus être modifiée.');
      const patch = clean(data);
      if (kind !== 'transporters' && patch.transporterId && patch.transporterId !== item.transporterId
        && !isSelectable(transporters.findVisible(patch.transporterId, { partnerId: user.partnerId }))) {
        throw new Error('Choisissez un transporteur actif de votre référentiel.');
      }
      const updated = repo.update(id, { ...patch, historique: trace(item, 'MODIFICATION', user) });
      audit(AUDIT_ACTIONS.REF_UPDATED, kind, updated);
      return updated;
    },
    deactivate: (id, motif = '') => {
      const user = requireManager();
      const item = api.findVisible(id, { partnerId: user.partnerId });
      if (!item) throw new Error('Cette fiche ne fait pas partie de votre référentiel.');
      if (stateOf(item) !== REF_STATES.ACTIF) throw new Error('Seule une fiche active peut être désactivée.');
      return changeState(kind, repo, item, user, REF_STATES.INACTIF, 'DESACTIVATION', String(motif).trim());
    },
    reactivate: (id) => {
      const user = requireManager();
      const item = api.findVisible(id, { partnerId: user.partnerId });
      if (!item) throw new Error('Cette fiche ne fait pas partie de votre référentiel.');
      if (stateOf(item) !== REF_STATES.INACTIF) throw new Error('Seule une fiche désactivée peut être réactivée.');
      return changeState(kind, repo, item, user, REF_STATES.ACTIF, 'REACTIVATION', '');
    },
    remove: (id, motif) => {
      const user = requireManager();
      if (!String(motif || '').trim()) throw new Error('Le motif du retrait est obligatoire.');
      const item = api.findVisible(id, { partnerId: user.partnerId });
      if (!item) throw new Error('Cette fiche ne fait pas partie de votre référentiel.');
      if (stateOf(item) === REF_STATES.RETIRE) throw new Error('Cette fiche est déjà retirée.');
      return changeState(kind, repo, item, user, REF_STATES.RETIRE, 'RETRAIT', String(motif).trim());
    },
  };
  return api;
}

/** Référentiels partagés : tiers, marchandises, emballages, localités. */
function sharedRef(kind, repo) {
  const api = {
    kind,
    owned: false,
    list: () => repo.getAll(),
    selectable: () => repo.getAll().filter(isSelectable),
    add: (data) => {
      const user = requireManager();
      const record = { id: uuid(), ...clean(data), etat: REF_STATES.ACTIF, historique: [] };
      record.historique = trace(record, 'CREATION', user);
      repo.add(record);
      audit(AUDIT_ACTIONS.REF_ADDED, kind, record);
      return record;
    },
    update: (id, data) => {
      const user = requireManager();
      const item = repo.findById(id);
      if (!item) throw new Error('Fiche introuvable.');
      const updated = repo.update(id, { ...clean(data), historique: trace(item, 'MODIFICATION', user) });
      audit(AUDIT_ACTIONS.REF_UPDATED, kind, updated);
      return updated;
    },
    deactivate: (id, motif = '') => {
      const user = requireManager();
      const item = repo.findById(id);
      if (!item) throw new Error('Fiche introuvable.');
      if (stateOf(item) !== REF_STATES.ACTIF) throw new Error('Seule une fiche active peut être désactivée.');
      return changeState(kind, repo, item, user, REF_STATES.INACTIF, 'DESACTIVATION', String(motif).trim());
    },
    reactivate: (id) => {
      const user = requireManager();
      const item = repo.findById(id);
      if (!item) throw new Error('Fiche introuvable.');
      if (stateOf(item) !== REF_STATES.INACTIF) throw new Error('Seule une fiche désactivée peut être réactivée.');
      return changeState(kind, repo, item, user, REF_STATES.ACTIF, 'REACTIVATION', '');
    },
  };
  return api;
}

export const transporters = ownedRef('transporters', transportersRepo);

export const vehicles = {
  ...ownedRef('vehicles', vehiclesRepo),
  listByTransporter: (transporterId) => vehicles.list().filter((v) => v.transporterId === transporterId),
};

export const drivers = ownedRef('drivers', driversRepo);
export const thirdParties = sharedRef('thirdParties', thirdPartiesRepo);
export const merchandiseTypes = sharedRef('merchandiseTypes', merchandiseTypesRepo);
export const packagingTypes = sharedRef('packagingTypes', packagingTypesRepo);
export const localities = sharedRef('localities', localitiesRepo);
