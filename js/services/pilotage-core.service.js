// Lot d5 : outils communs du pilotage de la Direction générale.
// Chaque action passe par `actor(permission)` (moteur de droits existant) et laisse une trace dans le
// journal d'audit existant (qui, quoi, quand, motif) via `journal(...)`.
import { AUDIT_LABELS } from '../core/constants.js';
import { can } from '../core/permissions.js';
import { getCurrentUser } from '../core/auth.js';
import { uuid, nowIso } from '../core/utils.js';
import { appendAuditLog, getAllAuditLogs } from '../repositories/audit.repository.js';

export const DAY_MS = 86400000;

/** Utilisateur connecté, s'il dispose d'au moins une des permissions demandées ; sinon refus explicite. */
export function actor(...permissions) {
  const user = getCurrentUser();
  if (!user) throw new Error('Votre session a expiré. Reconnectez-vous.');
  if (permissions.length && !permissions.some((p) => can(user, p))) throw new Error('Votre rôle ne permet pas cette action.');
  return user;
}

export function canDo(permission) {
  return can(getCurrentUser(), permission);
}

export const who = (user) => ({ id: user.id, name: user.name, role: user.role });

/** Trace d'audit d'une action de pilotage (journal append-only existant). */
export function journal(action, { entity, entityId, reference = null, note = null, oldValue = null, newValue = null } = {}) {
  const user = getCurrentUser();
  return appendAuditLog({
    id: uuid(), action, label: AUDIT_LABELS[action] || action,
    dutId: null, dutNumber: null, entity, entityId, reference,
    userId: user?.id || 'SYSTEM', userLabel: user?.name || 'SYSTEM', role: user?.role || 'SYSTEM',
    oldValue, newValue, note, date: nowIso(),
  });
}

/** Journal d'un objet de pilotage, du plus récent au plus ancien. */
export function journalOf(entityId) {
  return getAllAuditLogs().filter((e) => e.entityId === entityId).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

export const today = () => new Date().toISOString().slice(0, 10);
export const isIsoDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !Number.isNaN(Date.parse(v));
export const daysBetween = (fromIso, toIso) => Math.round((Date.parse(toIso.slice(0, 10)) - Date.parse(fromIso.slice(0, 10))) / DAY_MS);

export function text(value, label, { required = true, max = 200, min = 0 } = {}) {
  const v = String(value ?? '').trim();
  if (required && !v) throw new Error(`${label} : ce champ est obligatoire.`);
  if (v.length > max) throw new Error(`${label} : ${max} caractères au maximum.`);
  if (v && v.length < min) throw new Error(`${label} : ${min} caractères au minimum.`);
  return v;
}

/** Référence lisible et unique dans une liste : PREFIXE-AAAA-NNN. */
export function nextReference(prefix, list) {
  const year = new Date().getFullYear();
  const used = list.map((x) => x.reference).filter((r) => r && r.startsWith(`${prefix}-${year}-`)).map((r) => Number(r.split('-').pop()) || 0);
  return `${prefix}-${year}-${String((used.length ? Math.max(...used) : 0) + 1).padStart(3, '0')}`;
}

export { uuid, nowIso };
