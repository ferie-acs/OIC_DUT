// Lot d5 : réunions de pilotage — planification, convocation (simulée), compte rendu, décisions suivies.
import * as M from '../services/meetings.service.js';
import {
  esc, icon, num, formatDate, formatDateTime, kpi, kpis, pageHeader, badge, identity, journalHtml,
  tableCard, plainTable, bindRowLinks, options, field, formModal, run, allowed, notFound,
} from './direction-ui.js';

const TONE = { PLANIFIEE: 'info', TENUE: 'success', ANNULEE: 'neutral' };
const DTONE = { A_FAIRE: 'neutral', EN_COURS: 'info', CLOTUREE: 'success' };
const decisionBadge = (d) => `${badge(M.DECISION_STATUS_LABELS[d.status], DTONE[d.status])}${d.late ? ` ${badge('En retard', 'error')}` : ''}`;
const when = (dt) => `${formatDate(dt)} à ${dt.slice(11, 16).replace(':', ' h ')}`;

export function render(container, params = {}) {
  if (params.id) return renderMeeting(container, params.id);
  return renderList(container);
}

function meetingForm(m, done) {
  formModal({
    title: m ? 'Modifier la réunion' : 'Planifier une réunion', icon: 'calendar', large: true,
    body: `${field('Objet', `<input class="input" name="title" maxlength="160" value="${esc(m?.title || '')}">`, { required: true })}
      <div class="field-row">${field('Date et heure', `<input class="input" type="datetime-local" name="date" value="${esc(m?.date || '')}">`, { required: true })}${field('Lieu', `<input class="input" name="place" maxlength="120" value="${esc(m?.place || '')}">`, { required: true })}</div>
      ${field('Participants', `<textarea class="textarea" name="participants" rows="3" placeholder="Un participant par ligne">${esc((m?.participants || []).join('\n'))}</textarea>`, { required: true })}
      ${field('Ordre du jour', `<textarea class="textarea" name="agenda" rows="4">${esc(m?.agenda || '')}</textarea>`, { required: true })}`,
    submit: (v) => { const saved = M.saveMeeting(v, m?.id || null); done(saved); run(() => {}, 'Réunion enregistrée'); },
  });
}

function renderList(container) {
  const list = M.listMeetings();
  const decisions = list.flatMap((m) => m.decisions);
  container.innerHTML = `${pageHeader({ overline: 'Direction générale · Gouvernance', title: 'Réunions et décisions', subtitle: 'Planifier et convoquer les réunions de pilotage, rédiger le compte rendu, puis suivre chaque décision jusqu’à sa clôture.',
      actions: allowed('meetings.manage') ? `<button type="button" class="btn btn-primary" id="mt-new">${icon('plus', { size: 15 })} Planifier une réunion</button>` : '' })}
    ${kpis([
      kpi('Réunions à venir', num(list.filter((m) => m.upcoming).length), '', 'blue'),
      kpi('Réunions tenues', num(list.filter((m) => m.status === 'TENUE').length), 'avec compte rendu', 'green'),
      kpi('Décisions ouvertes', num(decisions.filter((d) => d.status !== 'CLOTUREE').length), `${num(decisions.length)} au total`, 'navy'),
      kpi('Décisions en retard', num(decisions.filter((d) => d.late).length), 'échéance dépassée', 'rose'),
    ])}
    ${tableCard({ title: 'Réunions', intro: 'Cliquez sur une réunion pour la convoquer, rédiger le compte rendu ou suivre ses décisions.', rows: list, empty: 'Aucune réunion.', link: (m) => `/direction/reunions/${m.id}`,
      columns: [
        ['title', 'Réunion', (m) => `<strong>${esc(m.title)}</strong><small>${esc(m.reference)} · ${esc(m.place)}</small>`],
        ['date', 'Date', (m) => when(m.date)], ['participants', 'Participants', (m) => num(m.participants.length), 'num'],
        ['decisions', 'Décisions ouvertes', (m) => num(m.openDecisions), 'num'], ['status', 'État', (m) => badge(M.MEETING_STATUS_LABELS[m.status], TONE[m.status])],
      ] })}`;
  bindRowLinks(container);
  container.querySelector('#mt-new')?.addEventListener('click', () => meetingForm(null, (m) => { window.location.hash = `/direction/reunions/${m.id}`; }));
}

function renderMeeting(container, id) {
  let m;
  try { m = M.getMeeting(id); } catch { return notFound(container, '/direction/reunions'); }
  const refresh = () => renderMeeting(container, id), manage = allowed('meetings.manage');
  const past = m.date <= new Date().toISOString().slice(0, 16);
  const acts = [];
  if (manage && m.status === 'PLANIFIEE') {
    acts.push(`<button type="button" class="btn btn-secondary" data-do="edit">${icon('edit', { size: 15 })} Modifier</button>`, `<button type="button" class="btn btn-secondary" data-do="convene">${icon('bell', { size: 15 })} Convoquer (simulé)</button>`);
    acts.push(past ? `<button type="button" class="btn btn-primary" data-do="minutes">${icon('file', { size: 15 })} Rédiger le compte rendu</button>` : `<button type="button" class="btn btn-ghost" data-do="cancel">Annuler la réunion</button>`);
  }
  if (manage && m.status === 'TENUE') acts.push(`<button type="button" class="btn btn-primary" data-do="decision">${icon('plus', { size: 15 })} Ajouter une décision</button>`);
  container.innerHTML = `${pageHeader({ back: { href: '/direction/reunions', label: 'Réunions et décisions' }, title: m.title, subtitle: `${esc(m.reference)} · ${when(m.date)} · ${esc(m.place)}`, badges: badge(M.MEETING_STATUS_LABELS[m.status], TONE[m.status]), actions: acts.join('') })}
    ${(m.convocations || []).length ? `<div class="st-alerts"><span class="st-alert is-info">${icon('bell', { size: 14 })} Convocation simulée envoyée le ${formatDateTime(m.convocations[m.convocations.length - 1].at)} à ${m.convocations[m.convocations.length - 1].count} participant(s) — aucun message réel n’est envoyé dans la démonstration.</span></div>` : ''}
    ${m.status === 'ANNULEE' ? `<div class="st-alerts"><span class="st-alert is-warning">${icon('alertCircle', { size: 14 })} Annulée par ${esc(m.cancelledBy)} : ${esc(m.cancelReason)}</span></div>` : ''}
    <div class="sup-grid">
      <div class="sup-main">
        <div class="card"><div class="card-header"><h3>${m.status === 'TENUE' ? 'Compte rendu' : 'Ordre du jour'}</h3>${m.status === 'TENUE' ? `<span class="text-muted">Rédigé par ${esc(m.heldBy)} · ${formatDate(m.heldAt)}</span>` : ''}</div><p class="d5-text">${esc(m.status === 'TENUE' ? m.minutes : m.agenda)}</p></div>
        <div class="card"><div class="card-header"><h3>Décisions</h3><span class="text-muted">Responsable, échéance et suivi jusqu’à la clôture</span></div>
          ${plainTable([
            ['text', 'Décision', (d) => `<strong>${esc(d.text)}</strong>${d.updates.length ? `<small>${esc(d.updates[d.updates.length - 1].comment)}</small>` : ''}`],
            ['responsible', 'Responsable', (d) => esc(d.responsible)], ['dueDate', 'Échéance', (d) => `<span class="${d.late ? 'sup-neg' : ''}">${formatDate(d.dueDate)}</span>`],
            ['status', 'État', (d) => decisionBadge(d)],
            ['do', '', (d) => (manage && d.status !== 'CLOTUREE' ? `<button type="button" class="btn btn-secondary btn-sm" data-decision="${esc(d.id)}">Mettre à jour</button>` : '')],
          ], m.decisions, m.status === 'TENUE' ? 'Aucune décision enregistrée.' : 'Les décisions s’enregistrent après la tenue de la réunion.')}</div>
        <div class="card"><div class="card-header"><h3>Journal</h3></div>${journalHtml(m.journal)}</div>
      </div>
      <aside class="sup-side">
        <div class="card"><div class="card-header"><h3>Réunion</h3></div>${identity([['Date', when(m.date)], ['Lieu', esc(m.place)], ['Organisée par', esc(m.createdBy?.name || '—')], ...(m.status === 'TENUE' ? [['Ordre du jour', `<span class="d5-text">${esc(m.agenda)}</span>`]] : [])])}</div>
        <div class="card"><div class="card-header"><h3>Participants</h3></div><ul class="sup-list">${m.participants.map((p) => `<li><span>${esc(p)}</span>${m.status === 'TENUE' ? `<b>${(m.attendees || []).includes(p) ? 'Présent' : 'Absent'}</b>` : ''}</li>`).join('')}</ul></div>
      </aside>
    </div>`;
  container.querySelectorAll('[data-do]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.do;
    if (k === 'edit') meetingForm(m, refresh);
    if (k === 'convene' && run(() => M.convene(id), 'Convocation simulée enregistrée')) refresh();
    if (k === 'cancel') formModal({ title: 'Annuler la réunion', icon: 'xCircle', danger: true, confirmLabel: 'Annuler la réunion', body: field('Motif', '<textarea class="textarea" name="reason" rows="2"></textarea>', { required: true }), submit: (v) => { M.cancelMeeting(id, v.reason); refresh(); } });
    if (k === 'minutes') formModal({ title: 'Compte rendu', icon: 'file', large: true, confirmLabel: 'Enregistrer le compte rendu',
      body: `${field('Compte rendu', '<textarea class="textarea" name="minutes" rows="6" placeholder="Constats, échanges, orientations retenues"></textarea>', { required: true, hint: '20 caractères au minimum.' })}${field('Participants présents', `<textarea class="textarea" name="attendees" rows="3">${esc(m.participants.join('\n'))}</textarea>`, { hint: 'Un participant par ligne.' })}`,
      submit: (v) => { M.recordMinutes(id, v); refresh(); } });
    if (k === 'decision') formModal({ title: 'Ajouter une décision', icon: 'plus', confirmLabel: 'Enregistrer la décision',
      body: `${field('Décision', '<input class="input" name="text" maxlength="300">', { required: true })}<div class="field-row">${field('Responsable', '<input class="input" name="responsible" maxlength="100">', { required: true })}${field('Échéance', '<input class="input" type="date" name="dueDate">', { required: true })}</div>`,
      submit: (v) => { M.addDecision(id, v); refresh(); } });
  }));
  container.querySelectorAll('[data-decision]').forEach((b) => b.addEventListener('click', () => {
    const d = m.decisions.find((x) => x.id === b.dataset.decision);
    formModal({ title: 'Suivi de la décision', icon: 'clipboardList', text: `${d.text} · ${d.responsible} · échéance ${formatDate(d.dueDate)}`,
      body: `${field('État', `<select class="select" name="status">${options(Object.entries(M.DECISION_STATUS_LABELS), d.status)}</select>`, { required: true })}${field('Point d’avancement', '<textarea class="textarea" name="comment" rows="2"></textarea>', { required: true })}`,
      submit: (v) => { M.updateDecision(id, d.id, v); refresh(); } });
  }));
}
