// Lot d1 : gestion des utilisateurs d'une entreprise par son administrateur (partenaire habilité ou
// transporteur), strictement dans son entreprise. Création avec lien d'activation, rôle,
// désactivation, réinitialisation d'accès (code envoyé à l'adresse enregistrée du compte).
import { AUDIT_ACTIONS, ROLES, ROLE_LABELS } from '../core/constants.js';
import { nowIso } from '../core/utils.js';
import { usersStore, partnersStore, transportersStore } from '../repositories/actors.repository.js';
import { createPendingAccount, requestPasswordReset, issueActivation } from './account.service.js';
import { actorWith, trace, text, phone as cleanPhone } from './d1-common.service.js';

/** Périmètre de l'administrateur connecté : quelle entreprise, quels rôles il peut attribuer. */
function scope() {
  const actor = actorWith('company.users');
  if (actor.role === ROLES.PARTNER_ADMIN && actor.partnerId) {
    return { actor, key: 'partnerId', orgId: actor.partnerId, roles: [ROLES.PARTNER_EDITOR, ROLES.PARTNER_ADMIN], isAdmin: (u) => u.role === ROLES.PARTNER_ADMIN };
  }
  if (actor.role === ROLES.TRANSPORTEUR && actor.transporterId) {
    if (!actor.companyAdmin) throw new Error('Seul l’administrateur du compte transporteur gère les utilisateurs.');
    return { actor, key: 'transporterId', orgId: actor.transporterId, roles: [ROLES.TRANSPORTEUR], isAdmin: (u) => u.companyAdmin === true };
  }
  throw new Error('Action non autorisée pour votre profil.');
}
const strip = ({ credential, activation, reset, ...u }) => ({ ...u, statut: u.active === false ? 'INACTIF' : u.activationPending ? 'A_ACTIVER' : 'ACTIF' });

export function companyRoles() {
  const s = scope();
  return s.roles.map((r) => ({ id: r, label: ROLE_LABELS[r] }));
}

export function listCompanyUsers() {
  const s = scope();
  return usersStore.getAll().filter((u) => u[s.key] === s.orgId && s.roles.includes(u.role)).map(strip).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

function ownUser(s, id) {
  const u = usersStore.findById(id);
  if (!u || u[s.key] !== s.orgId || !s.roles.includes(u.role)) throw new Error('Cet utilisateur n’appartient pas à votre entreprise.');
  return u;
}
function activeAdmins(s, list) { return list.filter((u) => u[s.key] === s.orgId && u.active !== false && s.isAdmin(u)); }

export async function createCompanyUser(values) {
  const s = scope();
  const role = s.key === 'partnerId' ? values.role : ROLES.TRANSPORTEUR;
  if (!s.roles.includes(role)) throw new Error('Rôle non autorisé pour votre entreprise.');
  const org = s.key === 'partnerId' ? partnersStore.findById(s.orgId) : transportersStore.findById(s.orgId);
  const fields = { name: values.name, email: values.email, phone: values.phone, role };
  if (s.key === 'partnerId') Object.assign(fields, { partnerId: org.id, partnerName: org.name, antennaId: org.antennaId, antennaName: org.antennaName });
  else Object.assign(fields, { transporterId: org.id, transporterName: org.name, companyAdmin: values.companyAdmin === true || values.companyAdmin === 'on' });
  const user = await createPendingAccount(fields, { actor: s.actor, reasonLabel: `${s.actor.name} vous a créé un compte pour « ${org.name} » sur la plateforme DUT.` });
  trace(AUDIT_ACTIONS.COMPANY_USER_CREATED, { actor: s.actor, entityId: user.id, entityLabel: user.email, note: `${ROLE_LABELS[role]} — ${org.name}` });
  return strip(user);
}

/** Modification du nom, du téléphone et du rôle ; on ne change pas son propre rôle. */
export function updateCompanyUser(id, values) {
  const s = scope();
  const list = usersStore.getAll();
  const u = list.find((x) => x.id === id);
  ownUser(s, id);
  const before = { name: u.name, role: u.role, companyAdmin: !!u.companyAdmin };
  u.name = text(values.name, 'nom complet', { required: true, max: 100 });
  u.phone = cleanPhone(values.phone);
  if (s.key === 'partnerId') {
    if (!s.roles.includes(values.role)) throw new Error('Rôle non autorisé pour votre entreprise.');
    if (id === s.actor.id && values.role !== u.role) throw new Error('Vous ne pouvez pas modifier votre propre rôle.');
    u.role = values.role;
  } else {
    const flag = values.companyAdmin === true || values.companyAdmin === 'on';
    if (id === s.actor.id && !flag) throw new Error('Vous ne pouvez pas retirer vos propres droits d’administrateur.');
    u.companyAdmin = flag;
  }
  if (!activeAdmins(s, list).length) throw new Error('Votre entreprise doit garder au moins un administrateur actif.');
  if (before.role !== u.role || before.companyAdmin !== !!u.companyAdmin) u.accessVersion = (u.accessVersion || 0) + 1;
  u.updatedAt = nowIso();
  usersStore.saveAll(list);
  trace(AUDIT_ACTIONS.COMPANY_USER_UPDATED, { actor: s.actor, entityId: u.id, entityLabel: u.email, oldValue: JSON.stringify(before), newValue: JSON.stringify({ name: u.name, role: u.role, companyAdmin: !!u.companyAdmin }) });
  return strip(u);
}

export function setCompanyUserActive(id, active) {
  const s = scope();
  if (id === s.actor.id) throw new Error('Vous ne pouvez pas désactiver votre propre compte.');
  const list = usersStore.getAll();
  const u = list.find((x) => x.id === id);
  ownUser(s, id);
  u.active = Boolean(active);
  u.accessVersion = (u.accessVersion || 0) + 1;
  if (!activeAdmins(s, list).length) throw new Error('Votre entreprise doit garder au moins un administrateur actif.');
  usersStore.saveAll(list);
  trace(AUDIT_ACTIONS.COMPANY_USER_STATUS, { actor: s.actor, entityId: u.id, entityLabel: u.email, newValue: active ? 'ACTIF' : 'INACTIF' });
  return strip(u);
}

/** Réinitialisation d'accès : lien d'activation si le compte n'est pas encore activé, sinon code envoyé à l'adresse du compte. */
export async function resetCompanyUserAccess(id) {
  const s = scope();
  if (id === s.actor.id) throw new Error('Pour votre propre compte, utilisez « Mon profil » ou « Mot de passe oublié ».');
  const u = ownUser(s, id);
  if (u.active === false) throw new Error('Réactivez d’abord ce compte.');
  if (u.activationPending) return issueActivation(u.id, { actor: s.actor, reasonLabel: `${s.actor.name} vous renvoie votre lien d’activation.` });
  await requestPasswordReset(u.email, { actor: s.actor });
  return { sentTo: u.email };
}
