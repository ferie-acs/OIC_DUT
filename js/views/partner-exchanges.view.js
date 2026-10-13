// Lot d4 : échanges OIC ↔ partenaires habilités — liste des fils, nouveau fil, conversation.
import { icon } from '../core/icons.js';
import { getCurrentUser } from '../core/auth.js';
import { can } from '../core/permissions.js';
import { navigate } from '../core/router.js';
import { openModal } from '../core/ui.js';
import { formatDateTime } from '../core/utils.js';
import * as S from '../services/partner-exchanges.service.js';
import { esc, badge, kpis, pageHeader, options, tableCard, wireTable, cell2, identity, timeline, card, field, selectCtl, inputCtl, textareaCtl, attempt, notFound } from './support-ui.js';

const statusBadge = (t) => badge(t.status === 'OUVERT' ? 'badge-info' : 'badge-neutral', S.THREAD_STATUS[t.status]);
const directionLabel = (t) => (t.direction === 'OIC_VERS_PARTENAIRE' ? 'De l’OIC' : 'Du partenaire');
const SIMULATED = 'Message simulé : aucun courriel n’est envoyé dans cette démonstration. Le message est visible dans l’espace de l’autre partie.';

export function render(container, params = {}) {
  if (params.id) return renderThread(container, params.id);
  return renderList(container);
}

function renderList(container) {
  const user = getCurrentUser();
  const oic = can(user, 'exchanges.manage');
  const rows = S.listThreads();
  container.innerHTML = `
    ${pageHeader({
      overline: oic ? 'OIC · Partenaires' : `Partenaire · ${user.partnerName || ''}`,
      title: oic ? 'Échanges avec les partenaires' : 'Échanges avec l’OIC',
      subtitle: oic
        ? 'Informez les partenaires des évolutions et décisions relatives au DUT, et répondez à leurs remontées. Chaque échange est rattaché au dossier d’un partenaire.'
        : 'Les informations de l’OIC sur le DUT, et vos difficultés ou propositions transmises à l’OIC.',
      actions: `<button type="button" class="btn btn-primary" id="btn-new">${icon('plus', { size: 15 })} ${oic ? 'Nouvelle communication' : 'Écrire à l’OIC'}</button>`,
    })}
    ${kpis([['Échanges ouverts', rows.filter((t) => t.status === 'OUVERT').length, 'messageSquare', 'navy'], ['Non lus', rows.filter((t) => t.unread).length, 'bell', 'rose'], [oic ? 'Remontées des partenaires' : 'Mes remontées', rows.filter((t) => t.direction === 'PARTENAIRE_VERS_OIC').length, 'megaphone', 'amber'], [oic ? 'Communications de l’OIC' : 'Informations reçues', rows.filter((t) => t.direction === 'OIC_VERS_PARTENAIRE').length, 'info', 'blue']])}
    ${tableCard({
      title: 'Fils d’échange',
      hint: 'Le plus récent en premier. « Nouveau » signale un message de l’autre partie non encore lu.',
      searchPlaceholder: 'Référence, objet, partenaire…',
      filters: `<select class="select" id="f-nature" aria-label="Filtrer par nature">${options(Object.entries(S.ALL_NATURES), '', 'Toutes les natures')}</select><select class="select" id="f-status" aria-label="Filtrer par état">${options(Object.entries(S.THREAD_STATUS), '', 'Tous les états')}</select>${oic ? `<select class="select" id="f-partner" aria-label="Filtrer par partenaire">${options(S.partners().map((p) => [p.id, p.name]), '', 'Tous les partenaires')}</select>` : ''}`,
      head: ['Objet', 'Nature', 'Sens', ...(oic ? ['Partenaire'] : []), 'Dernier message', 'État'],
    })}`;
  wireTable(container, {
    rows,
    columns: [
      (t) => `${cell2(t.subject, `${t.reference} · ${t.messages.length} message(s)`)}${t.unread ? ` ${badge('badge-accent', 'Nouveau', false)}` : ''}`,
      (t) => esc(S.ALL_NATURES[t.nature]),
      (t) => esc(directionLabel(t)),
      ...(oic ? [(t) => esc(t.partnerName)] : []),
      (t) => `${formatDateTime(t.lastAt)}<small>${esc(t.messages[t.messages.length - 1]?.by || '')}</small>`,
      statusBadge,
    ],
    filters: { '#f-nature': (t, v) => t.nature === v, '#f-status': (t, v) => t.status === v, '#f-partner': (t, v) => t.partnerId === v },
    haystack: (t) => [t.reference, t.subject, t.partnerName, ...t.messages.map((m) => m.text)].join(' '),
    open: (id) => navigate(`/echanges/${id}`),
    empty: 'Aucun échange ne correspond à cette vue.',
  });
  container.querySelector('#btn-new').addEventListener('click', () => openModal({
    icon: 'messageSquare', title: oic ? 'Nouvelle communication' : 'Écrire à l’OIC', large: true, confirmLabel: 'Envoyer',
    text: oic ? 'Choisissez un partenaire, ou « tous les partenaires » pour une diffusion : chacun reçoit son propre fil.' : `Votre message est rattaché au dossier de ${user.partnerName || 'votre entreprise'}.`,
    bodyHtml: `<div class="field-row d4-row">${oic ? field('t-partner', 'Destinataire', selectCtl('t-partner', [['ALL', 'Tous les partenaires'], ...S.partners().map((p) => [p.id, p.name])], '', 'Choisir…'), { required: true }) : ''}${field('t-nature', 'Nature', selectCtl('t-nature', Object.entries(oic ? S.OIC_NATURES : S.PARTNER_NATURES), oic ? 'INFORMATION' : 'DIFFICULTE'), { required: true })}</div>${field('t-subject', 'Objet', inputCtl('t-subject', 'maxlength="120"'), { required: true })}${field('t-text', 'Message', textareaCtl('t-text', '', 5), { required: true })}<p class="text-muted" style="font-size:12px">${esc(SIMULATED)}</p>`,
    onConfirm: ({ close, root }) => attempt(() => S.startThread({ partnerId: root.querySelector('#t-partner')?.value, nature: root.querySelector('#t-nature').value, subject: root.querySelector('#t-subject').value, text: root.querySelector('#t-text').value }), 'Message envoyé', (threads) => { close(); if (threads.length === 1) navigate(`/echanges/${threads[0].id}`); else renderList(container); }),
  }));
}

function renderThread(container, id) {
  let thread;
  try { thread = S.openThread(id); } catch { return notFound(container, '/echanges', 'Retour aux échanges'); }
  const user = getCurrentUser();
  const oic = can(user, 'exchanges.manage');
  const allowed = S.allowedActions(thread);
  container.innerHTML = `
    ${pageHeader({
      back: ['/echanges', 'Échanges'],
      title: thread.subject,
      subtitle: `${esc(thread.reference)} · ${esc(S.ALL_NATURES[thread.nature])} · ${esc(directionLabel(thread).toLowerCase())} · ${esc(thread.partnerName)}`,
      badges: `${statusBadge(thread)}${thread.broadcast ? badge('badge-neutral', 'Diffusion à tous les partenaires', false) : ''}`,
      actions: allowed.close ? `<button type="button" class="btn btn-secondary" data-act="close">${icon('check', { size: 15 })} Clore l’échange</button>` : '',
    })}
    <div class="sup-grid">
      <div class="sup-main">
        ${card('Conversation', `${timeline(thread.messages.map((m) => ({ title: `${m.side === 'OIC' ? 'OIC' : thread.partnerName} · ${m.by}`, at: m.at, note: m.text, done: m.side === 'OIC' })))}${allowed.reply ? `<form id="reply-form" class="d4-reply">${field('reply-text', 'Votre réponse', textareaCtl('reply-text', '', 3))}<p class="text-muted" style="font-size:12px">${esc(SIMULATED)}</p><div class="row gap-2"><button type="submit" class="btn btn-primary">${icon('send', { size: 15 })} Envoyer</button></div></form>` : `<p class="text-muted" style="margin-top:12px">Cet échange est clos${thread.closingNote ? ` : ${esc(thread.closingNote)}` : ''}.</p>`}`, `<span class="text-muted">${thread.messages.length} message(s)</span>`)}
      </div>
      <div class="sup-side">
        ${card('Dossier du partenaire', `${identity([['Partenaire', `<strong>${esc(thread.partnerName)}</strong>`], ['Ouvert le', `${formatDateTime(thread.createdAt)}<br><small class="text-muted">par ${esc(thread.createdBy?.name || '')}</small>`], ['État', statusBadge(thread)], ['Clos le', thread.closedAt ? `${formatDateTime(thread.closedAt)}<br><small class="text-muted">par ${esc(thread.closedBy?.name || '')}</small>` : '']])}${oic ? `<p style="margin-top:12px"><a href="#/oic/supervision/partenaires/${esc(thread.partnerId)}">${icon('layers', { size: 14 })} Ouvrir la fiche du partenaire</a></p>` : ''}`)}
      </div>
    </div>`;
  const rerender = () => renderThread(container, id);
  container.querySelector('#reply-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    attempt(() => S.replyToThread(id, container.querySelector('#reply-text').value), 'Message envoyé', rerender);
  });
  container.querySelector('[data-act="close"]')?.addEventListener('click', () => openModal({
    icon: 'check', title: 'Clore l’échange', confirmLabel: 'Clore',
    text: 'Plus aucun message ne pourra être ajouté à ce fil.',
    bodyHtml: field('c-note', 'Conclusion (facultatif)', textareaCtl('c-note', 'Ex. : question traitée', 2)),
    onConfirm: ({ close, root }) => attempt(() => S.closeThread(id, root.querySelector('#c-note').value), 'Échange clos', () => { close(); rerender(); }),
  }));
}
