import { verifyPassword } from './password.js';
import { getAllUsers } from '../repositories/users.repository.js';
import { DEMO_PASSWORD, AUDIT_ACTIONS } from './constants.js';
import { uuid, nowIso } from './utils.js';
import { findUserByEmail, getCurrentUser as getStoredUser, setCurrentUser, clearCurrentUser } from '../repositories/users.repository.js';
import { appendAuditLog } from '../repositories/audit.repository.js';
import { accessBlockReason } from './access-guard.js'; // Lot d1 : activation et état du groupement

export async function login(email, password) {
  const user = findUserByEmail(email);
  if (user && user.active !== false && user.activationPending) throw new Error(accessBlockReason(user)); // Lot d1 : jamais de mot de passe de démonstration sur un compte à activer
  if (!user || user.active===false || !(user.credential ? await verifyPassword(password,user.credential) : password === DEMO_PASSWORD)) {
    throw new Error('Identifiants invalides. Vérifiez l’e-mail et le mot de passe.');
  }
  const latest=getAllUsers().find(u=>u.id===user.id);
  if(!latest || latest.active===false || (latest.accessVersion||0)!==(user.accessVersion||0))throw new Error('Accès modifié. Reconnectez-vous.');
  const blocked=accessBlockReason(latest);if(blocked)throw new Error(blocked); // Lot d1 : groupement suspendu ou non validé
  const {credential,...session}=latest;setCurrentUser(session);
  appendAuditLog({
    id: uuid(),
    action: AUDIT_ACTIONS.USER_LOGIN,
    entity: 'USER',
    dutId: null,
    userId: user.id,
    userLabel: user.name,
    role: user.role,
    date: nowIso(),
  });
  return session;
}

export function logout() {
  const user = getCurrentUser();
  if (user) {
    appendAuditLog({
      id: uuid(),
      action: AUDIT_ACTIONS.USER_LOGOUT,
      entity: 'USER',
      dutId: null,
      userId: user.id,
      userLabel: user.name,
      role: user.role,
      date: nowIso(),
    });
  }
  clearCurrentUser();
}

export function getCurrentUser() {
 const session=getStoredUser();if(!session)return null;
 const user=getAllUsers().find(u=>u.id===session.id);
 if(!user||user.active===false||(user.accessVersion||0)!==(session.accessVersion||0)||accessBlockReason(user))return null;
 const {credential,...safe}=user;return safe;
}

export function isAuthenticated() {
  return !!getCurrentUser();
}
