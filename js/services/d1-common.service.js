// Lot d1 : outils communs aux services de comptes et d'acteurs (session, droits, journal, contrôles de saisie).
import { getCurrentUser } from '../core/auth.js';
import { can } from '../core/permissions.js';
import { appendAuditLog } from '../repositories/audit.repository.js';
import { AUDIT_LABELS } from '../core/constants.js';
import { uuid, nowIso } from '../core/utils.js';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Utilisateur connecté et habilité, sinon erreur explicite. */
export function actorWith(permission) {
  const user = getCurrentUser();
  if (!user) throw new Error('Session expirée. Reconnectez-vous.');
  if (permission && !can(user, permission)) throw new Error('Action non autorisée pour votre profil.');
  return user;
}

/** Entrée du journal d'audit (append-only) pour une action sur un compte ou un groupement. */
export function trace(action, { actor = null, entity = 'ACCOUNT', entityId = null, entityLabel = '', note = null, oldValue = null, newValue = null } = {}) {
  return appendAuditLog({
    id: uuid(), action, label: AUDIT_LABELS[action] || action, dutId: null, dutNumber: null,
    entity, entityId, entityLabel,
    userId: actor?.id || 'PUBLIC', userLabel: actor?.name || 'Demandeur (espace public)', role: actor?.role || 'PUBLIC',
    oldValue, newValue, note, date: nowIso(),
  });
}

export function text(value, label, { required = false, max = 120 } = {}) {
  const v = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (required && !v) throw new Error(`Renseignez : ${label}.`);
  if (v.length > max) throw new Error(`${label} : ${max} caractères au maximum.`);
  return v;
}
export function email(value, label = 'adresse e-mail', { required = true } = {}) {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v && !required) return '';
  if (!EMAIL_RE.test(v) || v.length > 160) throw new Error(`Saisissez une ${label} valide.`);
  return v;
}
export function phone(value, { required = false } = {}) {
  const v = String(value ?? '').trim();
  if (!v && !required) return '';
  if (!/^\+?[0-9 ().-]{8,20}$/.test(v)) throw new Error('Saisissez un numéro de téléphone valide (8 à 20 chiffres).');
  return v;
}
/** RCCM normalisé pour la comparaison anti-doublon (casse, espaces et tirets ignorés). */
export function rccmKey(value) { return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
export function rccm(value, { required = true } = {}) {
  const v = String(value ?? '').trim().toUpperCase();
  if (!v && !required) return '';
  if (!/^[A-Z0-9][A-Z0-9 /-]{5,39}$/.test(v)) throw new Error('Saisissez un numéro RCCM valide (ex. CI-ABJ-2015-B-4521).');
  return v;
}
export function reason(value) {
  const v = String(value ?? '').trim();
  if (v.length < 5) throw new Error('Indiquez un motif (5 caractères au moins).');
  if (v.length > 300) throw new Error('Motif : 300 caractères au maximum.');
  return v;
}
/** Masque une adresse : k•••@demo.oic.ci */
export function maskEmail(address) {
  const [local, domain] = String(address || '').split('@');
  if (!domain) return '•••';
  return `${local.slice(0, 1)}•••@${domain}`;
}
