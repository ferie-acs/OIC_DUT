// Lot d1 : cycle de vie commun des groupements (partenaires habilités, transporteurs).
// Chaque changement d'état passe par une transition dédiée (jamais par une modification de fiche),
// avec motif, trace dans la fiche, journal d'audit et message simulé au groupement.
import { AUDIT_ACTIONS, ORG_STATUS, ORG_STATUS_LABELS } from '../core/constants.js';
import { nowIso, uuid } from '../core/utils.js';
import { usersStore } from '../repositories/actors.repository.js';
import { sendMessage } from './messaging.service.js';
import { trace, reason as cleanReason, rccmKey } from './d1-common.service.js';

export const statusOf = (org) => org?.status || ORG_STATUS.ACTIF;

const TRANSITIONS = {
  suspend: { from: [ORG_STATUS.ACTIF], to: ORG_STATUS.SUSPENDU, audit: AUDIT_ACTIONS.ORG_SUSPENDED, verb: 'suspendu' },
  reactivate: { from: [ORG_STATUS.SUSPENDU], to: ORG_STATUS.ACTIF, audit: AUDIT_ACTIONS.ORG_REACTIVATED, verb: 'réactivé' },
  terminate: { from: [ORG_STATUS.ACTIF, ORG_STATUS.SUSPENDU], to: ORG_STATUS.RESILIE, audit: AUDIT_ACTIONS.ORG_TERMINATED, verb: 'résilié' },
  refuse: { from: [ORG_STATUS.EN_ATTENTE], to: ORG_STATUS.REFUSE, audit: AUDIT_ACTIONS.ORG_REFUSED, verb: 'refusé' },
};

export function pushHistory(org, entry) {
  org.stateHistory = [...(org.stateHistory || []), { id: uuid(), at: nowIso(), ...entry }];
}

/** Comptes rattachés au groupement. */
export function orgUsers(cfg, orgId) {
  return usersStore.getAll().filter((u) => u[cfg.userKey] === orgId && (!cfg.roles || cfg.roles.includes(u.role)));
}

/** Effets d'un changement d'état sur les comptes : sessions fermées ; résiliation = comptes désactivés. */
function applyToAccounts(cfg, orgId, to) {
  const all = usersStore.getAll();
  let changed = false;
  for (const u of all) {
    if (u[cfg.userKey] !== orgId || (cfg.roles && !cfg.roles.includes(u.role))) continue;
    u.accessVersion = (u.accessVersion || 0) + 1;
    if (to === ORG_STATUS.RESILIE) u.active = false;
    changed = true;
  }
  if (changed) usersStore.saveAll(all);
}

export function transition(cfg, id, action, motif, actor) {
  const t = TRANSITIONS[action];
  if (!t) throw new Error('Action inconnue.');
  const why = cleanReason(motif);
  const org = cfg.store.findById(id);
  if (!org) throw new Error(`${cfg.label} introuvable.`);
  const from = statusOf(org);
  if (!t.from.includes(from)) throw new Error(`Action impossible : ${cfg.label.toLowerCase()} « ${org.name} » est ${ORG_STATUS_LABELS[from].toLowerCase()}.`);
  org.status = t.to;
  org.updatedAt = nowIso();
  pushHistory(org, { from, to: t.to, by: actor.name, byId: actor.id, motif: why });
  cfg.store.replace(org);
  applyToAccounts(cfg, id, t.to);
  trace(t.audit, { actor, entity: cfg.entity, entityId: id, entityLabel: org.name, oldValue: from, newValue: t.to, note: why });
  if (org.email) sendMessage({ channel: 'EMAIL', to: org.email, kind: 'ORG_DECISION', entityId: id, subject: `${cfg.label} ${t.verb}`, body: `Bonjour,\nL’OIC a ${t.verb === 'réactivé' ? 'réactivé' : t.verb} « ${org.name} » sur la plateforme DUT.\nMotif : ${why}` });
  if (org.phone) sendMessage({ channel: 'SMS', to: org.phone, kind: 'ORG_DECISION', entityId: id, subject: 'Décision OIC', body: `DUT-OIC : ${org.name} a été ${t.verb} par l’OIC. Détails envoyés par courriel.` });
  return org;
}

/** Contrôle anti-doublon : refuse si UN AUTRE groupement porte déjà la même adresse ou le même RCCM. */
export function assertUnique(records, candidate, { excludeId = null, allowRccmOf = null, label = 'groupement' } = {}) {
  const others = records.filter((r) => r.id !== excludeId && statusOf(r) !== ORG_STATUS.REFUSE);
  if (candidate.email && others.some((r) => String(r.email || '').toLowerCase() === candidate.email)) throw new Error(`Un autre ${label} utilise déjà l’adresse ${candidate.email}.`);
  const key = rccmKey(candidate.rccm);
  if (key && others.some((r) => rccmKey(r.rccm || r.registre) === key && !(allowRccmOf && (r.id === allowRccmOf || r.parentId === allowRccmOf)))) throw new Error(`Un autre ${label} est déjà enregistré avec le RCCM ${candidate.rccm}.`);
}

/**
 * Demande de modification de données sensibles par le groupement lui-même : en attente de validation OIC.
 * Les autres champs sont appliqués immédiatement.
 */
export function requestChanges(cfg, org, values, actor) {
  const applied = [], requested = {};
  for (const [key, label] of Object.entries(cfg.editable)) {
    if (!(key in values) || values[key] === (org[key] || '')) continue;
    org[key] = values[key]; applied.push(label);
  }
  for (const [key] of Object.entries(cfg.sensitive)) {
    if (key in values && values[key] !== (org[key] || '')) requested[key] = values[key];
  }
  if (Object.keys(requested).length) {
    if (org.changeRequest?.status === 'EN_ATTENTE') throw new Error('Une demande de modification est déjà en attente de l’OIC. Attendez sa décision ou annulez-la.');
    org.changeRequest = { id: uuid(), status: 'EN_ATTENTE', fields: requested, previous: Object.fromEntries(Object.keys(requested).map((k) => [k, org[k] || ''])), requestedAt: nowIso(), requestedBy: actor.name, requestedById: actor.id };
  }
  if (!applied.length && !Object.keys(requested).length) throw new Error('Aucune modification à enregistrer.');
  org.updatedAt = nowIso();
  cfg.store.replace(org);
  if (applied.length) trace(AUDIT_ACTIONS.ORG_UPDATED, { actor, entity: cfg.entity, entityId: org.id, entityLabel: org.name, note: `Champs mis à jour : ${applied.join(', ')}` });
  if (Object.keys(requested).length) {
    const labels = Object.keys(requested).map((k) => cfg.sensitive[k]).join(', ');
    trace(AUDIT_ACTIONS.ORG_CHANGE_REQUESTED, { actor, entity: cfg.entity, entityId: org.id, entityLabel: org.name, note: labels, newValue: JSON.stringify(requested) });
    if (org.email) sendMessage({ channel: 'EMAIL', to: org.email, kind: 'ORG_CHANGE', entityId: org.id, subject: 'Demande de modification transmise à l’OIC', body: `Bonjour,\nLa modification des informations suivantes a été demandée par ${actor.name} : ${labels}.\nElle s’appliquera après validation par l’OIC.` });
  }
  return { applied, requested: Object.keys(requested).map((k) => cfg.sensitive[k]) };
}

export function cancelChangeRequest(cfg, org, actor) {
  if (org.changeRequest?.status !== 'EN_ATTENTE') throw new Error('Aucune demande en attente.');
  org.changeRequest = { ...org.changeRequest, status: 'ANNULEE', decidedAt: nowIso(), decidedBy: actor.name };
  cfg.store.replace(org);
  trace(AUDIT_ACTIONS.ORG_CHANGE_REJECTED, { actor, entity: cfg.entity, entityId: org.id, entityLabel: org.name, note: 'Demande annulée par le demandeur' });
  return org;
}

/** Décision OIC sur une demande de modification : la personne qui décide n'est jamais celle qui a demandé. */
export function decideChange(cfg, id, approve, motif, actor, { uniqueCheck } = {}) {
  const org = cfg.store.findById(id);
  if (!org || org.changeRequest?.status !== 'EN_ATTENTE') throw new Error('Aucune demande de modification en attente.');
  if (org.changeRequest.requestedById === actor.id) throw new Error('La personne qui a demandé la modification ne peut pas la valider.');
  const req = org.changeRequest;
  const why = approve ? String(motif || '').trim() : cleanReason(motif);
  const oldEmail = org.email;
  if (approve) {
    if (uniqueCheck) uniqueCheck({ ...org, ...req.fields }, id);
    Object.assign(org, req.fields);
    if (req.fields.rccm && cfg.entity === 'TRANSPORTER') org.registre = req.fields.rccm;
    if (req.fields.name) {
      const all = usersStore.getAll();
      all.filter((u) => u[cfg.userKey] === id).forEach((u) => { u[cfg.nameKey] = req.fields.name; });
      usersStore.saveAll(all);
    }
  }
  org.changeRequest = { ...req, status: approve ? 'APPROUVEE' : 'REFUSEE', decidedAt: nowIso(), decidedBy: actor.name, decidedById: actor.id, motif: why };
  org.changeHistory = [...(org.changeHistory || []), org.changeRequest];
  org.updatedAt = nowIso();
  cfg.store.replace(org);
  const labels = Object.keys(req.fields).map((k) => cfg.sensitive[k]).join(', ');
  trace(approve ? AUDIT_ACTIONS.ORG_CHANGE_APPROVED : AUDIT_ACTIONS.ORG_CHANGE_REJECTED, { actor, entity: cfg.entity, entityId: id, entityLabel: org.name, note: `${labels}${why ? ` — ${why}` : ''}`, oldValue: JSON.stringify(req.previous), newValue: JSON.stringify(req.fields) });
  const recipients = new Set([oldEmail, org.email].filter(Boolean)); // un changement d'adresse est signalé aux deux adresses
  recipients.forEach((to) => sendMessage({ channel: 'EMAIL', to, kind: 'ORG_CHANGE', entityId: id, subject: approve ? 'Modification de votre fiche approuvée' : 'Modification de votre fiche refusée', body: `Bonjour,\nVotre demande de modification (${labels}) a été ${approve ? 'approuvée' : 'refusée'} par l’OIC.${why ? `\nMotif : ${why}` : ''}` }));
  return org;
}
