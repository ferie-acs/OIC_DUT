// Lot d1 : activation de compte, mot de passe oublié, changement de mot de passe et profil.
// Règles : le code part toujours à l'adresse enregistrée sur le compte ; une demande de
// réinitialisation ne bloque jamais le compte ; codes à usage unique, hachés, à durée courte.
import { hashPassword, verifyPassword } from '../core/password.js';
import { usersStore } from '../repositories/actors.repository.js';
import { setCurrentUser } from '../repositories/users.repository.js';
import { AUDIT_ACTIONS, DEMO_PASSWORD } from '../core/constants.js';
import { uuid, nowIso } from '../core/utils.js';
import { accessBlockReason } from '../core/access-guard.js';
import { sendMessage } from './messaging.service.js';
import { saveUser as adminSaveUser } from './admin.service.js';
import { actorWith, trace, text, email as cleanEmail, phone as cleanPhone, maskEmail } from './d1-common.service.js';

export const ACTIVATION_HOURS = 72;
export const RESET_MINUTES = 15;
export const MAX_ATTEMPTS = 5;
const RESEND_DELAY_MS = 60 * 1000;
const cryptoApi = () => globalThis.crypto || window.crypto;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode(length) {
  const bytes = cryptoApi().getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}
export function newActivationCode() { const c = randomCode(10); return `ACT-${c.slice(0, 5)}-${c.slice(5)}`; }
function newResetCode() { const n = cryptoApi().getRandomValues(new Uint32Array(1))[0] % 1000000; return String(n).padStart(6, '0'); }
const normalizeCode = (c) => String(c || '').trim().toUpperCase().replace(/\s+/g, '');

/** Règle de mot de passe : 8 caractères au moins, avec au moins une lettre et un chiffre. */
export function checkPassword(password, confirm) {
  const p = String(password || '');
  if (p.length < 8 || p.length > 128 || !/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) throw new Error('Le mot de passe doit compter au moins 8 caractères, dont une lettre et un chiffre.');
  if (confirm !== undefined && p !== String(confirm)) throw new Error('Les deux mots de passe ne sont pas identiques.');
  if (p === DEMO_PASSWORD) throw new Error('Choisissez un mot de passe différent du mot de passe de démonstration.');
  return p;
}

const findByEmail = (address) => usersStore.getAll().find((u) => u.email.toLowerCase() === String(address || '').trim().toLowerCase()) || null;
const persist = (user) => usersStore.replace(user);

/**
 * Prépare le premier accès d'un compte : aucun mot de passe tant que le titulaire n'a pas choisi le sien.
 * Le lien et le code partent à l'adresse enregistrée sur le compte. Aucun code n'est renvoyé à l'appelant.
 */
export async function issueActivation(userId, { actor = null, reasonLabel = 'Votre compte DUT a été créé.' } = {}) {
  const code = newActivationCode();
  const hashed = await hashPassword(code);
  const user = usersStore.findById(userId);
  if (!user) throw new Error('Compte introuvable.');
  delete user.credential;
  user.activationPending = true;
  user.activation = { ...hashed, expiresAt: new Date(Date.now() + ACTIVATION_HOURS * 3600e3).toISOString(), attempts: 0 };
  user.accessVersion = (user.accessVersion || 0) + 1;
  persist(user);
  sendMessage({
    channel: 'EMAIL', to: user.email, toUserId: user.id, kind: 'ACTIVATION', secret: code, link: `#/activation/${code}`,
    subject: 'Activez votre compte DUT',
    body: `Bonjour ${user.name},\n${reasonLabel}\nPour choisir votre mot de passe, ouvrez le lien d’activation ou saisissez ce code sur la page « Activer mon compte » : {{code}}\nCe code est valable ${ACTIVATION_HOURS} heures et ne sert qu’une fois.`,
  });
  trace(AUDIT_ACTIONS.ACCOUNT_ACTIVATION_SENT, { actor, entityId: user.id, entityLabel: user.email, note: `Envoyé à ${maskEmail(user.email)}` });
  return { sentTo: maskEmail(user.email) };
}

async function checkCode(record, code) {
  if (!record || Date.parse(record.expiresAt) < Date.now() || (record.attempts || 0) >= MAX_ATTEMPTS) return false;
  return (await hashPassword(normalizeCode(code), record.salt)).hash === record.hash;
}

/** Premier accès : adresse + code d'activation + mot de passe choisi. */
export async function activateAccount({ email, code, password, confirm }) {
  const pwd = checkPassword(password, confirm);
  const target = findByEmail(email);
  const generic = 'Code d’activation invalide ou expiré. Demandez un nouveau lien à votre administrateur.';
  if (!target || target.active === false || !target.activationPending) throw new Error(generic);
  const ok = await checkCode(target.activation, code);
  const credential = ok ? await hashPassword(pwd) : null;
  const user = usersStore.findById(target.id);
  if (!ok) {
    if (user.activation) { user.activation.attempts = (user.activation.attempts || 0) + 1; persist(user); }
    throw new Error(generic);
  }
  user.credential = credential;
  delete user.activation; delete user.activationPending;
  user.activatedAt = nowIso();
  user.accessVersion = (user.accessVersion || 0) + 1;
  persist(user);
  trace(AUDIT_ACTIONS.ACCOUNT_ACTIVATED, { actor: user, entityId: user.id, entityLabel: user.email });
  sendMessage({ channel: 'EMAIL', to: user.email, toUserId: user.id, kind: 'SECURITY', subject: 'Votre compte DUT est activé', body: `Bonjour ${user.name},\nVotre compte est activé. Vous pouvez vous connecter avec votre adresse et le mot de passe que vous avez choisi.` });
  return { email: user.email };
}

/**
 * Mot de passe oublié. Réponse toujours identique (on ne révèle pas si un compte existe).
 * Le code part à l'adresse enregistrée sur le compte, jamais à une adresse fournie dans la demande.
 * Le compte et son mot de passe actuel restent utilisables tant que le nouveau n'est pas défini.
 */
export async function requestPasswordReset(identifier, { actor = null } = {}) {
  const target = findByEmail(identifier);
  if (!target || target.active === false || target.activationPending || accessBlockReason(target)) return { accepted: true };
  if (target.reset && Date.now() - Date.parse(target.reset.requestedAt) < RESEND_DELAY_MS) return { accepted: true };
  const code = newResetCode();
  const hashed = await hashPassword(code);
  const user = usersStore.findById(target.id);
  user.reset = { ...hashed, requestedAt: nowIso(), expiresAt: new Date(Date.now() + RESET_MINUTES * 60e3).toISOString(), attempts: 0 };
  persist(user);
  const registered = user.email; // adresse du compte, pas celle de la demande
  sendMessage({
    channel: 'EMAIL', to: registered, toUserId: user.id, kind: 'RESET', secret: code, link: '#/mot-de-passe-oublie',
    subject: 'Code de réinitialisation de votre mot de passe',
    body: `Bonjour ${user.name},\nUne réinitialisation de votre mot de passe a été demandée${actor ? ` par ${actor.name}` : ''}.\nCode à usage unique, valable ${RESET_MINUTES} minutes : {{code}}\nVotre mot de passe actuel reste valable tant que vous n’en avez pas choisi un nouveau. Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.`,
  });
  if (user.phone) sendMessage({ channel: 'SMS', to: user.phone, toUserId: user.id, kind: 'SECURITY', subject: 'Alerte sécurité', body: 'DUT-OIC : une réinitialisation de votre mot de passe a été demandée. Le code a été envoyé à votre adresse e-mail enregistrée.' });
  trace(AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED, { actor, entityId: user.id, entityLabel: user.email, note: `Code envoyé à ${maskEmail(registered)}` });
  return { accepted: true };
}

export async function completePasswordReset({ email, code, password, confirm }) {
  const pwd = checkPassword(password, confirm);
  const target = findByEmail(email);
  const generic = 'Code invalide ou expiré. Refaites une demande de réinitialisation.';
  if (!target || target.active === false || !target.reset) throw new Error(generic);
  const ok = await checkCode(target.reset, code);
  const credential = ok ? await hashPassword(pwd) : null;
  const user = usersStore.findById(target.id);
  if (!ok) {
    if (user.reset) { user.reset.attempts = (user.reset.attempts || 0) + 1; persist(user); }
    throw new Error(generic);
  }
  user.credential = credential;
  delete user.reset;
  user.passwordChangedAt = nowIso();
  user.accessVersion = (user.accessVersion || 0) + 1; // les sessions ouvertes ailleurs sont fermées
  persist(user);
  trace(AUDIT_ACTIONS.PASSWORD_RESET_DONE, { actor: user, entityId: user.id, entityLabel: user.email });
  sendMessage({ channel: 'EMAIL', to: user.email, toUserId: user.id, kind: 'SECURITY', subject: 'Votre mot de passe a été modifié', body: `Bonjour ${user.name},\nVotre mot de passe vient d’être réinitialisé. Si vous n’êtes pas à l’origine de ce changement, contactez immédiatement l’OIC.` });
  return { email: user.email };
}

/** Changement de mot de passe depuis « Mon profil » : l'ancien mot de passe est exigé. */
export async function changePassword({ current, password, confirm }) {
  const me = actorWith(null);
  const pwd = checkPassword(password, confirm);
  const stored = usersStore.findById(me.id);
  const valid = stored.credential ? await verifyPassword(String(current || ''), stored.credential) : current === DEMO_PASSWORD;
  if (!valid) throw new Error('Mot de passe actuel incorrect.');
  const credential = await hashPassword(pwd);
  const user = usersStore.findById(me.id);
  user.credential = credential;
  delete user.reset;
  user.passwordChangedAt = nowIso();
  user.accessVersion = (user.accessVersion || 0) + 1;
  persist(user);
  const { credential: _c, activation: _a, reset: _r, ...session } = user;
  setCurrentUser(session); // la session courante reste ouverte, les autres sont fermées
  trace(AUDIT_ACTIONS.PASSWORD_CHANGED, { actor: user, entityId: user.id, entityLabel: user.email });
  sendMessage({ channel: 'EMAIL', to: user.email, toUserId: user.id, kind: 'SECURITY', subject: 'Votre mot de passe a été modifié', body: `Bonjour ${user.name},\nVotre mot de passe a été modifié depuis votre profil. Si vous n’êtes pas à l’origine de ce changement, contactez immédiatement l’OIC.` });
  return true;
}

/** Profil : nom et téléphone modifiables par le titulaire ; l'adresse e-mail reste gérée par l'administrateur. */
export function myProfile() {
  const me = actorWith(null);
  const { credential, activation, reset, ...safe } = usersStore.findById(me.id) || me;
  return safe;
}
export function updateMyProfile(values) {
  const me = actorWith(null);
  const user = usersStore.findById(me.id);
  const before = { name: user.name, phone: user.phone || '' };
  user.name = text(values.name, 'nom complet', { required: true, max: 100 });
  user.phone = cleanPhone(values.phone);
  user.updatedAt = nowIso();
  persist(user);
  const { credential, activation, reset, ...session } = user;
  setCurrentUser(session);
  trace(AUDIT_ACTIONS.PROFILE_UPDATED, { actor: user, entityId: user.id, entityLabel: user.email, oldValue: JSON.stringify(before), newValue: JSON.stringify({ name: user.name, phone: user.phone }) });
  return session;
}

/**
 * Crée un compte en attente d'activation (aucun mot de passe) puis envoie le lien d'activation.
 * Contrôle d'unicité de l'adresse sur toute la plateforme.
 */
export async function createPendingAccount(fields, { actor = null, reasonLabel } = {}) {
  const address = cleanEmail(fields.email);
  if (findByEmail(address)) throw new Error('Cette adresse e-mail est déjà utilisée par un compte.');
  const user = {
    id: uuid(), name: text(fields.name, 'nom complet', { required: true, max: 100 }), email: address, phone: cleanPhone(fields.phone),
    role: fields.role, active: true, activationPending: true, createdAt: nowIso(), updatedAt: nowIso(), accessVersion: 0,
    createdBy: actor?.name || 'Plateforme DUT',
  };
  for (const k of ['partnerId', 'partnerName', 'antennaId', 'antennaName', 'transporterId', 'transporterName', 'companyAdmin']) if (fields[k] !== undefined) user[k] = fields[k];
  usersStore.add(user);
  await issueActivation(user.id, { actor, reasonLabel });
  return usersStore.findById(user.id);
}

/** Administrateur OIC : renvoie un lien d'activation (compte en attente) ou convertit un compte créé avec mot de passe. */
export async function resendActivation(userId) {
  const actor = actorWith('admin.manage');
  const user = usersStore.findById(userId);
  if (!user) throw new Error('Compte introuvable.');
  if (user.id === actor.id) throw new Error('Vous ne pouvez pas réinitialiser votre propre accès.');
  if (!user.activationPending) throw new Error('Ce compte est déjà activé : utilisez « Réinitialiser l’accès ».');
  return issueActivation(user.id, { actor, reasonLabel: 'Un nouveau lien d’activation vous est adressé par l’OIC.' });
}

/** Administration OIC : création d'un compte avec lien d'activation (aucun mot de passe affiché à l'administrateur). */
export async function createUserWithActivation(values) {
  const actor = actorWith('admin.manage');
  const { user } = await adminSaveUser(null, values); // mêmes contrôles que la création classique
  await issueActivation(user.id, { actor });
  return usersStore.findById(user.id);
}
