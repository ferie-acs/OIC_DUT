// Lot d1 : partenaires habilités — gestion par l'administrateur OIC et fiche tenue par le partenaire.
import { AUDIT_ACTIONS, ORG_STATUS, ROLES } from '../core/constants.js';
import { nowIso, uuid } from '../core/utils.js';
import { partnersStore, antennasStore, auditStore, usersStore } from '../repositories/actors.repository.js';
import { createPendingAccount } from './account.service.js';
import { sendMessage } from './messaging.service.js';
import { actorWith, trace, text, email as cleanEmail, phone as cleanPhone, rccm as cleanRccm } from './d1-common.service.js';
import { statusOf, transition, assertUnique, requestChanges, cancelChangeRequest, decideChange, orgUsers, pushHistory } from './org-lifecycle.js';

export const PARTNER_CFG = {
  entity: 'PARTNER', label: 'Partenaire', store: partnersStore, userKey: 'partnerId', nameKey: 'partnerName',
  roles: [ROLES.PARTNER_ADMIN, ROLES.PARTNER_EDITOR],
  sensitive: { name: 'Raison sociale', email: 'Adresse e-mail', rccm: 'RCCM' },
  editable: { phone: 'Téléphone', address: 'Adresse', city: 'Ville', contactName: 'Responsable' },
};

function clean(values) {
  return {
    name: text(values.name, 'raison sociale', { required: true, max: 120 }).toUpperCase(),
    rccm: cleanRccm(values.rccm),
    email: cleanEmail(values.email, 'adresse e-mail de l’entreprise'),
    phone: cleanPhone(values.phone, { required: true }),
    address: text(values.address, 'adresse', { max: 160 }),
    city: text(values.city, 'ville', { required: true, max: 60 }),
    contactName: text(values.contactName, 'nom du responsable', { required: true, max: 100 }),
  };
}
const unique = (candidate, excludeId) => assertUnique(partnersStore.getAll(), candidate, { excludeId, label: 'partenaire' });

// ------------------------------------------------------------------ Administrateur OIC
export function listPartners({ status = '', query = '' } = {}) {
  actorWith('partners.manage');
  const q = query.trim().toLowerCase();
  const users = usersStore.getAll();
  return partnersStore.getAll().map((p) => ({
    ...p, status: statusOf(p), comptes: users.filter((u) => u.partnerId === p.id).length,
    demandeEnAttente: p.changeRequest?.status === 'EN_ATTENTE',
  })).filter((p) => (!status || p.status === status) && (!q || `${p.name} ${p.rccm || ''} ${p.email || ''} ${p.city || ''}`.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

export function partnerDetail(id) {
  actorWith('partners.manage');
  const p = partnersStore.findById(id);
  if (!p) return null;
  return {
    partner: { ...p, status: statusOf(p) },
    comptes: orgUsers(PARTNER_CFG, id).map(({ credential, activation, reset, ...u }) => u),
    journal: auditStore.getAll().filter((e) => e.entity === 'PARTNER' && e.entityId === id).sort((a, b) => Date.parse(b.date) - Date.parse(a.date)),
  };
}

export function antennaChoices() { return antennasStore.getAll().map((a) => ({ id: a.id, name: a.name })); }

/** Création par l'OIC : en attente ; la validation est faite par un autre administrateur. */
export function createPartner(values) {
  const actor = actorWith('partners.manage');
  const v = clean(values);
  const antenna = antennasStore.getAll().find((a) => a.id === values.antennaId);
  if (!antenna) throw new Error('Choisissez l’antenne OIC de rattachement.');
  unique(v);
  const partner = { id: uuid(), ...v, antennaId: antenna.id, antennaName: antenna.name, status: ORG_STATUS.EN_ATTENTE, createdAt: nowIso(), createdById: actor.id, createdByName: actor.name, updatedAt: nowIso() };
  pushHistory(partner, { from: null, to: ORG_STATUS.EN_ATTENTE, by: actor.name, byId: actor.id, motif: 'Création de la fiche' });
  partnersStore.add(partner);
  trace(AUDIT_ACTIONS.ORG_CREATED, { actor, entity: 'PARTNER', entityId: partner.id, entityLabel: partner.name, newValue: ORG_STATUS.EN_ATTENTE });
  return partner;
}

/**
 * Validation : l'état passe réellement à « actif », le compte administrateur du partenaire est créé
 * une seule fois (lien d'activation à l'adresse de la fiche), anti-doublon vérifié à nouveau.
 */
export async function validatePartner(id) {
  const actor = actorWith('actors.validate');
  const p = partnersStore.findById(id);
  if (!p) throw new Error('Partenaire introuvable.');
  if (statusOf(p) !== ORG_STATUS.EN_ATTENTE) throw new Error('Seul un partenaire en attente peut être validé.');
  if (p.createdById === actor.id) throw new Error('Un autre administrateur OIC que l’auteur de la fiche doit la valider (séparation des tâches).');
  unique(p, id);
  const existing = p.adminUserId && usersStore.findById(p.adminUserId);
  if (!existing && usersStore.getAll().some((u) => u.email.toLowerCase() === p.email)) throw new Error(`L’adresse ${p.email} est déjà utilisée par un compte : corrigez l’adresse de la fiche avant de valider.`);
  if (!existing) {
    const admin = await createPendingAccount({ name: p.contactName || p.name, email: p.email, phone: p.phone, role: ROLES.PARTNER_ADMIN, partnerId: p.id, partnerName: p.name, antennaId: p.antennaId, antennaName: p.antennaName }, { actor, reasonLabel: `Votre entreprise « ${p.name} » est validée comme partenaire habilité DUT. Vous en êtes l’administrateur.` });
    p.adminUserId = admin.id;
  }
  const fresh = { ...partnersStore.findById(id), adminUserId: p.adminUserId, status: ORG_STATUS.ACTIF, validatedAt: nowIso(), validatedBy: actor.name, hasDut: true, updatedAt: nowIso() };
  pushHistory(fresh, { from: ORG_STATUS.EN_ATTENTE, to: ORG_STATUS.ACTIF, by: actor.name, byId: actor.id, motif: 'Validation' });
  partnersStore.replace(fresh);
  trace(AUDIT_ACTIONS.ORG_VALIDATED, { actor, entity: 'PARTNER', entityId: id, entityLabel: fresh.name, oldValue: ORG_STATUS.EN_ATTENTE, newValue: ORG_STATUS.ACTIF });
  if (fresh.phone) sendMessage({ channel: 'SMS', to: fresh.phone, kind: 'ORG_DECISION', entityId: id, subject: 'Partenaire validé', body: `DUT-OIC : ${fresh.name} est validé comme partenaire habilité. Le lien d’activation du compte administrateur a été envoyé par courriel.` });
  return fresh;
}

/** Modification de la fiche par l'OIC : jamais de changement d'état par ce chemin. */
export function updatePartner(id, values) {
  const actor = actorWith('partners.manage');
  const p = partnersStore.findById(id);
  if (!p) throw new Error('Partenaire introuvable.');
  if (statusOf(p) === ORG_STATUS.RESILIE) throw new Error('Un partenaire résilié ne peut plus être modifié.');
  if ('status' in values) throw new Error('L’état se change par les actions dédiées (valider, suspendre, réactiver, résilier).');
  const v = clean(values);
  unique(v, id);
  const antenna = antennasStore.getAll().find((a) => a.id === (values.antennaId || p.antennaId));
  const sensitive = Object.keys(PARTNER_CFG.sensitive).filter((k) => v[k] !== (p[k] || ''));
  const before = { ...p };
  Object.assign(p, v, { antennaId: antenna?.id || p.antennaId, antennaName: antenna?.name || p.antennaName, updatedAt: nowIso() });
  partnersStore.replace(p);
  if (v.name !== before.name) { const all = usersStore.getAll(); all.filter((u) => u.partnerId === id).forEach((u) => { u.partnerName = v.name; }); usersStore.saveAll(all); }
  trace(AUDIT_ACTIONS.ORG_UPDATED, { actor, entity: 'PARTNER', entityId: id, entityLabel: p.name, note: sensitive.length ? `Données sensibles modifiées : ${sensitive.map((k) => PARTNER_CFG.sensitive[k]).join(', ')}` : 'Coordonnées mises à jour' });
  if (sensitive.length) new Set([before.email, p.email].filter(Boolean)).forEach((to) => sendMessage({ channel: 'EMAIL', to, kind: 'ORG_CHANGE', entityId: id, subject: 'Informations de votre entreprise modifiées par l’OIC', body: `Bonjour,\nL’OIC a modifié les informations suivantes de « ${p.name} » : ${sensitive.map((k) => PARTNER_CFG.sensitive[k]).join(', ')}.` }));
  return p;
}

export const suspendPartner = (id, motif) => transition(PARTNER_CFG, id, 'suspend', motif, actorWith('actors.validate'));
export const reactivatePartner = (id, motif) => transition(PARTNER_CFG, id, 'reactivate', motif, actorWith('actors.validate'));
export const terminatePartner = (id, motif) => transition(PARTNER_CFG, id, 'terminate', motif, actorWith('actors.validate'));
export const refusePartner = (id, motif) => transition(PARTNER_CFG, id, 'refuse', motif, actorWith('actors.validate'));
export const decidePartnerChange = (id, approve, motif) => decideChange(PARTNER_CFG, id, approve, motif, actorWith('actors.validate'), { uniqueCheck: unique });

// ------------------------------------------------------------------ Partenaire (administrateur)
function ownPartner() {
  const actor = actorWith('company.profile');
  if (!actor.partnerId) throw new Error('Votre compte n’est rattaché à aucun partenaire.');
  const p = partnersStore.findById(actor.partnerId);
  if (!p) throw new Error('Fiche partenaire introuvable.');
  return { actor, p };
}
export function myPartner() {
  const { p } = ownPartner();
  return { ...p, status: statusOf(p) };
}
/** Coordonnées appliquées tout de suite ; raison sociale, e-mail et RCCM repassent par l'OIC. */
export function updateMyPartner(values) {
  const { actor, p } = ownPartner();
  const v = {
    phone: cleanPhone(values.phone, { required: true }), address: text(values.address, 'adresse', { max: 160 }), city: text(values.city, 'ville', { required: true, max: 60 }),
    contactName: text(values.contactName, 'nom du responsable', { required: true, max: 100 }),
    name: text(values.name, 'raison sociale', { required: true, max: 120 }).toUpperCase(), email: cleanEmail(values.email, 'adresse e-mail de l’entreprise'), rccm: cleanRccm(values.rccm),
  };
  unique(v, p.id);
  return requestChanges(PARTNER_CFG, p, v, actor);
}
export function cancelMyPartnerChange() { const { actor, p } = ownPartner(); return cancelChangeRequest(PARTNER_CFG, p, actor); }
