// Lot d4 : remontées du terrain (antenne → pilotage) — liste, nouvelle remontée, fiche d'échange.
import { icon } from '../core/icons.js';
import { getCurrentUser } from '../core/auth.js';
import { can } from '../core/permissions.js';
import { navigate } from '../core/router.js';
import { openModal } from '../core/ui.js';
import { formatDate, formatDateTime } from '../core/utils.js';
import * as S from '../services/field-reports.service.js';
import { antennaLabel } from '../services/support-common.service.js';
import { esc, badge, kpis, pageHeader, options, tableCard, wireTable, cell2, identity, timeline, card, field, selectCtl, inputCtl, textareaCtl, attempt, notFound } from './support-ui.js';

const STATUS_BADGE = { TRANSMISE: 'badge-info', EN_EXAMEN: 'badge-warning', DECIDEE: 'badge-navy', CLOSE: 'badge-success' };
const PRIORITY_BADGE = { HAUTE: 'badge-error', NORMALE: 'badge-neutral', BASSE: 'badge-neutral' };
const statusBadge = (r) => badge(STATUS_BADGE[r.status], S.REPORT_STATUS[r.status]);
const priorityBadge = (r) => badge(PRIORITY_BADGE[r.priority], S.REPORT_PRIORITIES[r.priority], false);

export function render(container, params = {}) {
  if (params.id) return renderDetail(container, params.id);
  return renderList(container);
}

function renderList(container) {
  const user = getCurrentUser();
  const manage = can(user, 'fieldreports.manage');
  const rows = S.listReports();
  const open = rows.filter((r) => r.status !== 'CLOSE');
  const antennaNames = [...new Set(rows.map((r) => r.antennaName))].sort((a, b) => a.localeCompare(b, 'fr'));
  container.innerHTML = `
    ${pageHeader({
      overline: manage ? 'OIC · Pilotage' : `Antenne · ${antennaLabel(user.antennaId)}`,
      title: 'Remontées du terrain',
      subtitle: manage
        ? 'Besoins et difficultés signalés par les antennes. Répondez, rendez une décision, puis clôturez.'
        : 'Signalez au pilotage un besoin ou une difficulté de votre antenne, et suivez la réponse.',
      actions: can(user, 'fieldreports.submit') ? `<button type="button" class="btn btn-primary" id="btn-new">${icon('plus', { size: 15 })} Nouvelle remontée</button>` : '',
    })}
    ${kpis([['Remontées ouvertes', open.length, 'megaphone', 'navy'], ['En attente de réponse', rows.filter((r) => r.status === 'TRANSMISE').length, 'clock', 'amber'], ['Priorité haute ouvertes', open.filter((r) => r.priority === 'HAUTE').length, 'alertTriangle', 'rose'], ['Clôturées', rows.filter((r) => r.status === 'CLOSE').length, 'checkCircle', 'green']])}
    ${tableCard({
      title: manage ? 'Toutes les remontées' : 'Remontées de mon antenne',
      hint: 'La plus récemment mise à jour en premier.',
      searchPlaceholder: 'Référence, objet, antenne…',
      filters: `<select class="select" id="f-status" aria-label="Filtrer par état">${options(Object.entries(S.REPORT_STATUS), '', 'Tous les états')}</select><select class="select" id="f-category" aria-label="Filtrer par catégorie">${options(Object.entries(S.REPORT_CATEGORIES), '', 'Toutes les catégories')}</select>${manage ? `<select class="select" id="f-antenna" aria-label="Filtrer par antenne">${options(antennaNames.map((n) => [n, n]), '', 'Toutes les antennes')}</select>` : ''}`,
      head: ['Remontée', 'Catégorie', 'Priorité', 'Antenne', 'État', 'Dernière mise à jour'],
    })}`;
  wireTable(container, {
    rows,
    columns: [
      (r) => cell2(r.title, `${r.reference} · ${r.createdBy?.name || ''}`),
      (r) => esc(S.REPORT_CATEGORIES[r.category]),
      priorityBadge,
      (r) => esc(r.antennaName),
      statusBadge,
      (r) => `${formatDate(r.updatedAt || r.createdAt)}<small>${r.messages.length} message(s)</small>`,
    ],
    filters: { '#f-status': (r, v) => r.status === v, '#f-category': (r, v) => r.category === v, '#f-antenna': (r, v) => r.antennaName === v },
    haystack: (r) => [r.reference, r.title, r.description, r.antennaName, r.createdBy?.name].join(' '),
    open: (id) => navigate(`/remontees/${id}`),
    empty: 'Aucune remontée ne correspond à cette vue.',
  });
  container.querySelector('#btn-new')?.addEventListener('click', () => openModal({
    icon: 'megaphone', title: 'Nouvelle remontée', large: true, confirmLabel: 'Transmettre au pilotage',
    text: `Antenne : ${antennaLabel(user.antennaId)}. Le pilotage vous répondra dans cette fiche.`,
    bodyHtml: `<div class="field-row d4-row">${field('r-category', 'Catégorie', selectCtl('r-category', Object.entries(S.REPORT_CATEGORIES), 'EQUIPEMENT'), { required: true })}${field('r-priority', 'Priorité', selectCtl('r-priority', Object.entries(S.REPORT_PRIORITIES), 'NORMALE'), { required: true })}</div>${field('r-title', 'Objet', inputCtl('r-title', 'maxlength="120" placeholder="Ex. : besoin d’un second lecteur de QR code"'), { required: true })}${field('r-description', 'Description', textareaCtl('r-description', 'Le besoin ou la difficulté, ses conséquences, ce que vous proposez', 5), { required: true })}`,
    onConfirm: ({ close, root }) => attempt(() => S.submitReport({ category: root.querySelector('#r-category').value, priority: root.querySelector('#r-priority').value, title: root.querySelector('#r-title').value, description: root.querySelector('#r-description').value }), 'Remontée transmise', (report) => { close(); navigate(`/remontees/${report.id}`); }),
  }));
}

function renderDetail(container, id) {
  let report;
  try { report = S.getReport(id); } catch { return notFound(container, '/remontees', 'Retour aux remontées'); }
  const allowed = S.allowedActions(report);
  const user = getCurrentUser();
  const manage = can(user, 'fieldreports.manage');
  container.innerHTML = `
    ${pageHeader({
      back: ['/remontees', 'Remontées du terrain'],
      title: report.title,
      subtitle: `${esc(report.reference)} · ${esc(report.antennaName)} · transmise le ${formatDateTime(report.createdAt)} par ${esc(report.createdBy?.name || '—')}`,
      badges: `${statusBadge(report)}${priorityBadge(report)}`,
      actions: [
        allowed.decide && `<button type="button" class="btn btn-primary" data-act="decide">${icon('checkCircle', { size: 15 })} Rendre une décision</button>`,
        allowed.close && `<button type="button" class="btn btn-primary" data-act="close">${icon('check', { size: 15 })} Clôturer</button>`,
      ].filter(Boolean).join(''),
    })}
    <div class="sup-grid">
      <div class="sup-main">
        ${card('Besoin ou difficulté', `<p class="preserve-lines">${esc(report.description)}</p>`)}
        ${report.decision ? card('Décision du pilotage', identity([['Décision', `<strong>${esc(S.REPORT_DECISIONS[report.decision.code])}</strong>`], ['Motif', `<span class="preserve-lines">${esc(report.decision.text)}</span>`], ['Rendue par', `${esc(report.decision.by?.name || '')} · ${formatDateTime(report.decision.at)}`]])) : ''}
        ${card('Échanges', `${timeline(report.messages.map((m) => ({ title: m.side === 'PILOTAGE' ? `Pilotage · ${m.by}` : `${report.antennaName} · ${m.by}`, at: m.at, note: m.text, done: m.side === 'PILOTAGE' })), 'Aucun message pour le moment.')}${allowed.reply ? `<form id="reply-form" class="d4-reply">${field('reply-text', manage ? 'Répondre à l’antenne' : 'Ajouter une précision', textareaCtl('reply-text', manage ? 'Votre réponse ou une question à l’antenne' : 'Une précision pour le pilotage'))}<div class="row gap-2"><button type="submit" class="btn btn-primary">${icon('send', { size: 15 })} Envoyer</button></div></form>` : ''}`, `<span class="text-muted">${report.messages.length} message(s)</span>`)}
      </div>
      <div class="sup-side">
        ${card('Suivi', identity([['État', statusBadge(report)], ['Catégorie', esc(S.REPORT_CATEGORIES[report.category])], ['Priorité', priorityBadge(report)], ['Antenne', esc(report.antennaName)], ['Transmise par', esc(report.createdBy?.name || '—')], ['Clôture', report.closedAt ? formatDateTime(report.closedAt) : '']]))}
        ${card('Historique', timeline([...report.history].reverse().map((h) => ({ title: h.label, at: h.at, by: h.by, note: h.note }))))}
      </div>
    </div>`;
  const rerender = () => renderDetail(container, id);
  container.querySelector('#reply-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    attempt(() => S.replyToReport(id, container.querySelector('#reply-text').value), 'Message envoyé', rerender);
  });
  container.querySelector('[data-act="decide"]')?.addEventListener('click', () => openModal({
    icon: 'checkCircle', title: 'Rendre une décision', confirmLabel: 'Enregistrer la décision',
    text: 'La décision et son motif sont visibles par l’antenne.',
    bodyHtml: `${field('d-code', 'Décision', selectCtl('d-code', Object.entries(S.REPORT_DECISIONS), 'ACCEPTEE'), { required: true })}${field('d-text', 'Motif et suite donnée', textareaCtl('d-text', 'Ex. : achat validé, livraison prévue sous quinze jours', 4), { required: true })}`,
    onConfirm: ({ close, root }) => attempt(() => S.decideReport(id, { code: root.querySelector('#d-code').value, text: root.querySelector('#d-text').value }), 'Décision enregistrée', () => { close(); rerender(); }),
  }));
  container.querySelector('[data-act="close"]')?.addEventListener('click', () => openModal({
    icon: 'check', title: 'Clôturer la remontée', confirmLabel: 'Clôturer',
    text: 'La remontée est archivée ; l’antenne ne peut plus y répondre.',
    bodyHtml: field('c-note', 'Observation (facultatif)', textareaCtl('c-note', 'Ex. : matériel livré et installé')),
    onConfirm: ({ close, root }) => attempt(() => S.closeReport(id, root.querySelector('#c-note').value), 'Remontée clôturée', () => { close(); rerender(); }),
  }));
}
