// Lot d4 : outils partagés par les services incidents, remontées, équipements et échanges.
import { getCurrentUser } from '../core/auth.js';
import { can } from '../core/permissions.js';
import { nowIso, uuid } from '../core/utils.js';
import { getAllAntennas, findAntennaById } from '../repositories/antennas.repository.js';
import { getAllUsers } from '../repositories/users.repository.js';
import * as auditService from './audit.service.js';

/** Utilisateur connecté, avec contrôle du droit demandé (moteur de permissions existant). */
export function actor(permission) {
  const user = getCurrentUser();
  if (!user) throw new Error('Connectez-vous pour effectuer cette action.');
  if (permission && !can(user, permission)) throw new Error('Votre rôle ne permet pas cette action.');
  return user;
}

export function canDo(user, permission) {
  return can(user, permission);
}

/** Texte saisi : obligatoire ou non, nettoyé et borné. */
export function text(value, { label = 'Ce champ', required = true, max = 2000, min = 0 } = {}) {
  const clean = String(value ?? '').trim().slice(0, max);
  if (required && !clean) throw new Error(`${label} est obligatoire.`);
  if (clean && clean.length < min) throw new Error(`${label} doit comporter au moins ${min} caractères.`);
  return clean;
}

export function oneOf(value, allowed, label) {
  if (!Object.prototype.hasOwnProperty.call(allowed, value)) throw new Error(`${label} invalide.`);
  return value;
}

/** Référence lisible et croissante : INC-2026-0007. */
export function nextReference(list, prefix) {
  const year = new Date().getFullYear();
  const pattern = new RegExp(`^${prefix}-${year}-(\\d+)$`);
  const max = Math.max(0, ...list.map((x) => Number(String(x.reference || '').match(pattern)?.[1] || 0)));
  return `${prefix}-${year}-${String(max + 1).padStart(4, '0')}`;
}

export function antennaLabel(antennaId) {
  if (!antennaId) return 'Niveau national';
  return findAntennaById(antennaId)?.name || 'Antenne inconnue';
}

export function antennas() {
  return getAllAntennas().map((a) => ({ id: a.id, name: a.name, chef: a.chef?.name || '' })).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

export function users() {
  return getAllUsers().filter((u) => u.active !== false).map(({ credential, ...u }) => u);
}

export function person(user) {
  return { id: user.id, name: user.name, role: user.role };
}

/** Entrée d'historique propre à l'objet (en plus du journal d'audit national). */
export function historyEntry(user, label, note = '') {
  return { id: uuid(), at: nowIso(), byId: user?.id || 'SYSTEM', by: user?.name || 'Système', role: user?.role || 'SYSTEM', label, note: note || '' };
}

/** Journal d'audit existant (append-only) : qui, quoi, quand, motif. */
export function audit(action, reference, note = '', newValue = null) {
  return auditService.log(action, { note: [reference, note].filter(Boolean).join(' — '), newValue });
}

export { nowIso, uuid };
