// Lot d1 : service unique des messages sortants (courriels et SMS) de toute l'application DUT.
// Simulation : aucun envoi réel. Chaque message est conservé dans un journal consultable par
// l'administrateur OIC (codes masqués) et par son destinataire.
import { messagesRepo, usersStore } from '../repositories/actors.repository.js';
import { uuid, nowIso } from '../core/utils.js';
import { getCurrentUser } from '../core/auth.js';
import { actorWith } from './d1-common.service.js';

export const CHANNELS = { EMAIL: 'Courriel', SMS: 'SMS' };
export const MESSAGE_KINDS = {
  ACTIVATION: 'Activation de compte', RESET: 'Mot de passe oublié', SECURITY: 'Sécurité du compte',
  ORG_DECISION: 'Décision sur un groupement', ORG_CHANGE: 'Modification de fiche', VEHICLE: 'Véhicule', INFO: 'Information',
};
/** Module émetteur par défaut selon la nature (pour les messages émis par ce lot). */
const ORIGIN_BY_KIND = { ACTIVATION: 'Comptes', RESET: 'Comptes', SECURITY: 'Comptes', ORG_DECISION: 'Acteurs', ORG_CHANGE: 'Acteurs', VEHICLE: 'Véhicules' };
const SECRET_TOKEN = '{{code}}';
const MASK = '••••••';

/**
 * Envoie (simule) un message. `body` peut contenir {{code}} : remplacé par `secret` pour le
 * destinataire, masqué partout ailleurs. Le message part à l'adresse fournie par l'appelant, qui
 * doit toujours être celle enregistrée sur le compte ou la fiche.
 */
export function sendMessage({ channel = 'EMAIL', to, toUserId = null, subject = '', body, kind = 'INFO', secret = null, link = null, entityId = null, origin = '' }) {
  if (!to) return null;
  if (!CHANNELS[channel]) throw new Error('Canal de message inconnu.');
  const sender = getCurrentUser();
  return messagesRepo.add({
    id: uuid(), channel, to: String(to).trim().toLowerCase(), toUserId, subject, body, kind, secret, link, entityId, origin: String(origin || '').slice(0, 60) || ORIGIN_BY_KIND[kind] || 'Plateforme DUT',
    createdAt: nowIso(), sentBy: sender?.name || 'Plateforme DUT', status: 'SIMULE',
  });
}

/**
 * Point d'entrée simple pour les autres modules DUT (incidents, signalements, échanges, DUT…) :
 *   envoyer({ canal: 'EMAIL' | 'SMS', destinataire, objet, corps, origine })
 * - `destinataire` : identifiant d'un compte, objet compte ({ id }) ou adresse / numéro brut. Pour un
 *   compte, le message part TOUJOURS à l'adresse (ou au téléphone) enregistrée sur ce compte.
 * - `origine` : libellé court du module émetteur (« Incidents », « Échanges partenaires »…), affiché
 *   dans le journal de l'administrateur OIC.
 * - Options : `code` (secret remplaçant {{code}} dans le corps, masqué dans le journal), `lien`
 *   (lien interne « #/… » visible du seul destinataire), `nature` (clé de MESSAGE_KINDS), `entite`.
 * Renvoie le message enregistré, ou null si aucun destinataire n'est joignable par ce canal.
 * Simulation : rien ne sort du navigateur.
 */
export function envoyer({ canal = 'EMAIL', destinataire, objet = '', corps = '', origine = '', code = null, lien = null, nature = 'INFO', entite = null } = {}) {
  const channel = String(canal).toUpperCase() === 'COURRIEL' ? 'EMAIL' : String(canal).toUpperCase();
  if (!CHANNELS[channel]) throw new Error('Canal de message inconnu.');
  if (!String(corps).trim()) throw new Error('Le message est vide.');
  const id = typeof destinataire === 'object' && destinataire ? destinataire.id : destinataire;
  const account = id ? usersStore.findById(id) : null;
  const to = account ? (channel === 'SMS' ? account.phone : account.email) : destinataire;
  if (!to || typeof to !== 'string') return null;
  return sendMessage({ channel, to, toUserId: account?.id || null, subject: objet, body: corps, kind: MESSAGE_KINDS[nature] ? nature : 'INFO', secret: code, link: lien, entityId: entite, origin: origine });
}

/** Rendu d'un message : le code n'apparaît qu'au destinataire. */
export function present(message, reveal) {
  const code = reveal && message.secret ? message.secret : MASK;
  return {
    ...message,
    secret: undefined,
    body: String(message.body || '').split(SECRET_TOKEN).join(code),
    link: reveal ? message.link : null,
    channelLabel: CHANNELS[message.channel] || message.channel,
    origin: message.origin || ORIGIN_BY_KIND[message.kind] || 'Plateforme DUT',
    kindLabel: MESSAGE_KINDS[message.kind] || message.kind,
  };
}

const newestFirst = (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt);

/** Messages adressés à l'utilisateur connecté (par compte ou par son adresse / téléphone). */
export function myMessages() {
  const user = actorWith(null);
  const addresses = [user.email, user.phone].filter(Boolean).map((x) => String(x).toLowerCase());
  return messagesRepo.getAll().filter((m) => m.toUserId === user.id || addresses.includes(m.to)).sort(newestFirst).map((m) => present(m, true));
}

/** Journal complet des messages sortants pour l'administrateur OIC : codes et liens masqués. */
export function messageJournal({ channel = '', kind = '', query = '' } = {}) {
  actorWith('messages.journal');
  const q = query.trim().toLowerCase();
  return messagesRepo.getAll()
    .filter((m) => (!channel || m.channel === channel) && (!kind || m.kind === kind))
    .map((m) => present(m, false))
    .filter((m) => !q || `${m.to} ${m.subject} ${m.body} ${m.origin}`.toLowerCase().includes(q))
    .sort(newestFirst);
}

/**
 * Boîte de réception simulée d'une adresse (démonstration uniquement) : elle remplace la messagerie
 * personnelle du titulaire, qui n'existe pas dans le POC.
 */
export function simulatedInbox(address) {
  const a = String(address || '').trim().toLowerCase();
  if (!a) return [];
  return messagesRepo.getAll().filter((m) => m.to === a).sort(newestFirst).map((m) => present(m, true));
}
