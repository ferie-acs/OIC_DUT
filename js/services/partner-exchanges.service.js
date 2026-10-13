// Lot d4 : échanges entre l'OIC et les partenaires habilités. Chaque fil est rattaché au dossier
// d'un seul partenaire (cloisonnement) ; une diffusion de l'OIC crée un fil par partenaire.
import { AUDIT_ACTIONS } from '../core/constants.js';
import * as repo from '../repositories/partner-exchanges.repository.js';
import { getAllPartners } from '../repositories/partners.repository.js';
import { actor, canDo, text, oneOf, nextReference, person, audit, nowIso, uuid } from './support-common.service.js';

export const OIC_NATURES = { EVOLUTION: 'Évolution du DUT', DECISION: 'Décision de l’OIC', INFORMATION: 'Information' };
export const PARTNER_NATURES = { DIFFICULTE: 'Difficulté rencontrée', PROPOSITION: 'Proposition', QUESTION: 'Question' };
export const ALL_NATURES = { ...OIC_NATURES, ...PARTNER_NATURES };
export const THREAD_STATUS = { OUVERT: 'Ouvert', CLOS: 'Clos' };

const sideOf = (user) => (canDo(user, 'exchanges.manage') ? 'OIC' : 'PARTENAIRE');

function visibleTo(user, thread) {
  if (canDo(user, 'exchanges.manage')) return true;
  return canDo(user, 'exchanges.partner') && Boolean(user.partnerId) && thread.partnerId === user.partnerId;
}

function load(user, id) {
  const thread = repo.findById(id);
  if (!thread || !visibleTo(user, thread)) throw new Error('Échange introuvable ou hors de votre périmètre.');
  return thread;
}

/** Message non lu : le dernier message vient de l'autre partie et date d'après la dernière lecture. */
export function isUnread(thread, side) {
  const last = thread.messages[thread.messages.length - 1];
  if (!last || last.side === side) return false;
  return !thread.readAt?.[side] || new Date(thread.readAt[side]) < new Date(last.at);
}

export function partners() {
  return getAllPartners().map((p) => ({ id: p.id, name: p.name })).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

export function listThreads() {
  const user = actor('exchanges.view');
  const side = sideOf(user);
  return repo.getAll().filter((t) => visibleTo(user, t)).map((t) => ({ ...t, unread: isUnread(t, side), lastAt: t.messages[t.messages.length - 1]?.at || t.createdAt })).sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
}

export function unreadCount() {
  return listThreads().filter((t) => t.unread).length;
}

/** Ouvre le fil et le marque comme lu pour la partie de l'utilisateur. */
export function openThread(id) {
  const user = actor('exchanges.view');
  const thread = load(user, id);
  thread.readAt = { ...(thread.readAt || {}), [sideOf(user)]: nowIso() };
  repo.upsert(thread);
  return thread;
}

export function allowedActions(thread) {
  const user = actor('exchanges.view');
  return { reply: thread.status === 'OUVERT' && (canDo(user, 'exchanges.manage') || canDo(user, 'exchanges.partner')), close: thread.status === 'OUVERT' && canDo(user, 'exchanges.manage') };
}

/**
 * Nouveau fil. L'OIC choisit un partenaire, ou « ALL » pour une diffusion (un fil par partenaire) ;
 * un partenaire écrit toujours pour sa propre entreprise.
 */
export function startThread(input = {}) {
  const user = actor('exchanges.view');
  const side = sideOf(user);
  if (side === 'PARTENAIRE' && !canDo(user, 'exchanges.partner')) throw new Error('Votre rôle ne permet pas d’écrire à l’OIC.');
  const nature = oneOf(input.nature, side === 'OIC' ? OIC_NATURES : PARTNER_NATURES, 'Nature');
  const subject = text(input.subject, { label: 'L’objet', max: 120, min: 5 });
  const body = text(input.text, { label: 'Le message', max: 2000, min: 5 });
  let targets;
  if (side === 'PARTENAIRE') {
    if (!user.partnerId) throw new Error('Votre compte n’est rattaché à aucun partenaire.');
    targets = [{ id: user.partnerId, name: user.partnerName }];
  } else if (input.partnerId === 'ALL') targets = partners();
  else targets = partners().filter((p) => p.id === input.partnerId);
  if (!targets.length) throw new Error('Choisissez le partenaire destinataire.');
  const created = [];
  const all = repo.getAll();
  for (const partner of targets) {
    const at = nowIso();
    const thread = {
      id: uuid(),
      reference: nextReference([...all, ...created], 'ECH'),
      partnerId: partner.id, partnerName: partner.name,
      nature, direction: side === 'OIC' ? 'OIC_VERS_PARTENAIRE' : 'PARTENAIRE_VERS_OIC',
      subject, status: 'OUVERT', broadcast: targets.length > 1,
      createdAt: at, createdBy: { ...person(user), side },
      messages: [{ id: uuid(), at, side, byId: user.id, by: user.name, text: body }],
      readAt: { [side]: at },
    };
    created.push(thread);
    // Après fusion avec le lot d1 : avertir l'autre partie par courriel simulé.
    audit(AUDIT_ACTIONS.PARTNER_MESSAGE_SENT, thread.reference, `${partner.name} · ${subject}`);
  }
  repo.saveAll([...all, ...created]);
  return created;
}

export function replyToThread(id, message) {
  const user = actor('exchanges.view');
  const thread = load(user, id);
  if (!allowedActions(thread).reply) throw new Error('Cet échange est clos.');
  const side = sideOf(user);
  const at = nowIso();
  thread.messages.push({ id: uuid(), at, side, byId: user.id, by: user.name, text: text(message, { label: 'Le message', max: 2000, min: 2 }) });
  thread.readAt = { ...(thread.readAt || {}), [side]: at };
  repo.upsert(thread);
  // Après fusion avec le lot d1 : avertir l'autre partie par courriel simulé.
  audit(AUDIT_ACTIONS.PARTNER_MESSAGE_SENT, thread.reference, `Réponse ${side === 'OIC' ? 'de l’OIC' : 'du partenaire'} · ${thread.partnerName}`);
  return thread;
}

export function closeThread(id, note = '') {
  const user = actor('exchanges.manage');
  const thread = load(user, id);
  if (thread.status !== 'OUVERT') throw new Error('Cet échange est déjà clos.');
  Object.assign(thread, { status: 'CLOS', closedAt: nowIso(), closedBy: person(user), closingNote: text(note, { required: false, max: 300 }) });
  repo.upsert(thread);
  audit(AUDIT_ACTIONS.PARTNER_THREAD_CLOSED, thread.reference, thread.closingNote || thread.subject);
  return thread;
}
