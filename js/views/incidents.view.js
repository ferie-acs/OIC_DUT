// Lot d4 : incidents de la plateforme — liste, déclaration, fiche de suivi, suivi des lenteurs.
import { icon } from '../core/icons.js';
import { getCurrentUser } from '../core/auth.js';
import { can } from '../core/permissions.js';
import { navigate } from '../core/router.js';
import { openModal, promptAction } from '../core/ui.js';
import { formatDate, formatDateTime, formatNumber } from '../core/utils.js';
import * as S from '../services/incidents.service.js';
import { esc, badge, kpis, pageHeader, options, tableCard, wireTable, cell2, identity, timeline, card, field, selectCtl, inputCtl, textareaCtl, attempt, hoursLabel, secondsLabel, notFound } from './support-ui.js';

const STATUS_BADGE = { DECLARE: 'badge-info', QUALIFIE: 'badge-navy', ATTRIBUE: 'badge-navy', EN_TRAITEMENT: 'badge-warning', RESOLU: 'badge-accent', CLOS: 'badge-success' };
const SEVERITY_BADGE = { CRITIQUE: 'badge-error', MAJEURE: 'badge-warning', MINEURE: 'badge-neutral' };
const statusBadge = (i) => badge(STATUS_BADGE[i.status], S.INCIDENT_STATUS[i.status]);
const severityBadge = (i) => badge(SEVERITY_BADGE[i.severity], S.INCIDENT_SEVERITIES[i.severity].label, false);
const ACTIVE = ['DECLARE', 'QUALIFIE', 'ATTRIBUE', 'EN_TRAITEMENT', 'RESOLU'];

function deadlineCell(i) {
  if (i.status === 'CLOS') return S.resolvedLate(i) ? badge('badge-neutral', 'Résolu hors délai', false) : badge('badge-success', 'Dans le délai', false);
  if (i.status === 'RESOLU') return badge('badge-accent', 'À vérifier', false);
  const left = S.hoursLeft(i);
  return left < 0 ? badge('badge-error', `Dépassé de ${hoursLabel(left)}`) : `<span>${esc(`Encore ${hoursLabel(left)}`)}</span><small>Échéance ${formatDateTime(S.dueAt(i))}</small>`;
}

export function render(container, params = {}) {
  if (params.id) return renderDetail(container, params.id);
  return renderList(container);
}

// ---------------------------------------------------------------- Liste
function renderList(container) {
  const user = getCurrentUser();
  const manage = can(user, 'incidents.manage') || can(user, 'incidents.read'); // Intégration : vue nationale, aussi en lecture seule (Direction)
  // Incidents non clos d'abord, puis les plus récents.
  const rows = S.listIncidents().sort((a, b) => (a.status === 'CLOS') - (b.status === 'CLOS'));
  const overdue = rows.filter((i) => S.isOverdue(i));
  const open = rows.filter((i) => ACTIVE.includes(i.status));
  const month = Date.now() - 30 * 86400000;
  const metrics = manage
    ? [['Incidents ouverts', open.length, 'alertCircle', 'navy'], ['Délai dépassé', overdue.length, 'clock', 'rose'], ['Critiques ouverts', open.filter((i) => i.severity === 'CRITIQUE').length, 'alertTriangle', 'amber'], ['Clos sur 30 jours', rows.filter((i) => i.closedAt && new Date(i.closedAt) > month).length, 'checkCircle', 'green']]
    : [['Incidents suivis', rows.length, 'list', 'navy'], ['En cours', open.filter((i) => i.status !== 'RESOLU').length, 'clock', 'amber'], ['Résolus, à vérifier', rows.filter((i) => i.status === 'RESOLU').length, 'alertCircle', 'blue'], ['Clos', rows.filter((i) => i.status === 'CLOS').length, 'checkCircle', 'green']];
  const antennaFilter = manage ? `<select class="select" id="f-antenna" aria-label="Filtrer par antenne">${options([['national', 'Niveau national'], ...S.antennaOptions().map((a) => [a.id, a.name])], '', 'Toutes les antennes')}</select>` : '';
  container.innerHTML = `
    ${pageHeader({
      overline: manage ? (can(user, 'incidents.manage') ? 'OIC · Exploitation' : 'Direction générale · Consultation') : 'Assistance',
      title: 'Incidents de la plateforme',
      subtitle: manage && !can(user, 'incidents.manage')
        ? 'Vue nationale en lecture seule : état, gravité, responsable et délai de chaque incident. Le traitement reste confié à l’OIC et aux antennes.'
        : manage
        ? 'Qualifiez, attribuez et suivez chaque incident jusqu’à sa clôture. Les incidents de transport restent suivis dans le dossier de chaque DUT.'
        : 'Signalez un problème rencontré sur la plateforme et suivez son traitement. Un incident survenu pendant un transport se déclare dans le dossier du DUT.',
      actions: `${manage ? `<a class="btn btn-secondary" href="#/lenteurs">${icon('gauge', { size: 15 })} Suivi des lenteurs</a>` : ''}${can(user, 'incidents.declare') ? `<button type="button" class="btn btn-primary" id="btn-declare">${icon('plus', { size: 15 })} Déclarer un incident</button>` : ''}`,
    })}
    ${overdue.length ? `<div class="alert-banner error" role="alert">${icon('alertTriangle')}<div class="alert-text"><strong>${overdue.length} incident(s) ont dépassé leur délai cible de résolution</strong>${overdue.slice(0, 4).map((i) => `<a href="#/incidents/${esc(i.id)}">${esc(i.reference)}</a> · ${esc(i.title)}`).join('<br>')}</div></div>` : ''}
    ${kpis(metrics)}
    ${tableCard({
      title: manage ? 'Tous les incidents' : user.role.startsWith('PARTNER_') ? 'Incidents de votre entreprise' : user.role === 'ANTENNA_AGENT' ? 'Incidents de votre antenne' : 'Mes incidents',
      hint: `Délais cibles : critique ${S.INCIDENT_SEVERITIES.CRITIQUE.hours} h, majeure ${S.INCIDENT_SEVERITIES.MAJEURE.hours} h, mineure ${S.INCIDENT_SEVERITIES.MINEURE.hours} h après la déclaration.`,
      searchPlaceholder: 'Référence, objet, déclarant…',
      filters: `<select class="select" id="f-status" aria-label="Filtrer par état">${options([['ACTIVE', 'Non clos'], ...Object.entries(S.INCIDENT_STATUS)], '', 'Tous les états')}</select><select class="select" id="f-category" aria-label="Filtrer par catégorie">${options(Object.entries(S.INCIDENT_CATEGORIES), '', 'Toutes les catégories')}</select><select class="select" id="f-severity" aria-label="Filtrer par gravité">${options(Object.entries(S.INCIDENT_SEVERITIES).map(([k, v]) => [k, v.label]), '', 'Toutes les gravités')}</select>${antennaFilter}`,
      head: ['Incident', 'Catégorie', 'Gravité', 'Antenne', 'État', 'Responsable', 'Délai'],
    })}`;
  wireTable(container, {
    rows,
    columns: [
      (i) => cell2(i.title, `${i.reference} · ${formatDate(i.declaredAt)} · ${i.declaredBy?.name || ''}`),
      (i) => esc(S.INCIDENT_CATEGORIES[i.category]),
      severityBadge,
      (i) => esc(i.antennaName),
      statusBadge,
      (i) => (i.assignee ? cell2(i.assignee.name, S.RESOLUTION_TEAMS[i.team] || '') : '<span class="text-muted">À attribuer</span>'),
      deadlineCell,
    ],
    filters: {
      '#f-status': (i, v) => (v === 'ACTIVE' ? ACTIVE.includes(i.status) : i.status === v),
      '#f-category': (i, v) => i.category === v,
      '#f-severity': (i, v) => i.severity === v,
      '#f-antenna': (i, v) => (v === 'national' ? !i.antennaId : i.antennaId === v),
    },
    haystack: (i) => [i.reference, i.title, i.description, i.declaredBy?.name, i.declaredBy?.partnerName, i.assignee?.name, i.antennaName].join(' '),
    open: (id) => navigate(`/incidents/${id}`),
    empty: 'Aucun incident ne correspond à cette vue.',
  });
  container.querySelector('#btn-declare')?.addEventListener('click', () => openDeclareModal(user));
}

function openDeclareModal(user) {
  const antennaList = S.antennaOptions();
  const isAgent = user.role === 'ANTENNA_AGENT';
  const defaultAntenna = user.antennaId || '';
  const localNow = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const modal = openModal({
    icon: 'alertTriangle', title: 'Déclarer un incident', large: true, confirmLabel: 'Déclarer l’incident',
    text: 'Décrivez le problème rencontré sur la plateforme. L’OIC le qualifie puis l’attribue à un responsable.',
    bodyHtml: `
      <div class="field-row d4-row">
        ${field('inc-category', 'Catégorie', selectCtl('inc-category', Object.entries(S.INCIDENT_CATEGORIES), 'APPLICATIF'), { required: true })}
        ${field('inc-severity', 'Gravité estimée', selectCtl('inc-severity', Object.entries(S.INCIDENT_SEVERITIES).map(([k, v]) => [k, `${v.label} — ${v.hint.toLowerCase()}`]), 'MINEURE'), { required: true })}
      </div>
      ${field('inc-antenna', 'Antenne concernée', isAgent ? `<input class="input" id="inc-antenna" readonly value="${esc(antennaList.find((a) => a.id === user.antennaId)?.name || '')}">` : selectCtl('inc-antenna', antennaList.map((a) => [a.id, a.name]), defaultAntenna, 'Niveau national (toutes antennes)'))}
      ${field('inc-title', 'Objet', inputCtl('inc-title', 'maxlength="120" placeholder="Ex. : le bouton Valider ne répond plus"'), { required: true })}
      ${field('inc-description', 'Description', textareaCtl('inc-description', 'Ce que vous faisiez, ce qui s’est passé, le message affiché…', 4), { required: true })}
      <div id="inc-perf" class="field-row d4-row" hidden>
        ${field('inc-screen', 'Écran concerné', selectCtl('inc-screen', Object.entries(S.PERFORMANCE_SCREENS), 'VALIDATION'), { required: true })}
        ${field('inc-duration', 'Durée constatée (secondes)', inputCtl('inc-duration', 'type="number" min="1" max="3600" placeholder="Ex. : 45"'), { required: true })}
        ${field('inc-observed', 'Date et heure', inputCtl('inc-observed', `type="datetime-local" value="${localNow}" max="${localNow}"`), { required: true })}
      </div>
      ${field('inc-files', 'Pièces jointes (facultatif)', '<input class="input" id="inc-files" type="file" multiple>', { hint: 'Démonstration : seuls le nom, le type et la taille des fichiers sont enregistrés, pas leur contenu.' })}`,
    onConfirm: ({ close, root }) => {
      const value = (id) => root.querySelector(`#${id}`)?.value;
      const files = [...(root.querySelector('#inc-files').files || [])].map((f) => ({ name: f.name, size: f.size, type: f.type }));
      const observed = value('inc-observed');
      attempt(() => S.declareIncident({
        category: value('inc-category'), severity: value('inc-severity'), antennaId: isAgent ? user.antennaId : value('inc-antenna'),
        title: value('inc-title'), description: value('inc-description'), attachments: files,
        screen: value('inc-screen'), durationSec: value('inc-duration'), observedAt: observed ? new Date(observed).toISOString() : '',
      }), 'Incident déclaré', (incident) => { close(); navigate(`/incidents/${incident.id}`); });
    },
  });
  const overlay = modal.root;
  const sync = () => { overlay.querySelector('#inc-perf').hidden = overlay.querySelector('#inc-category').value !== 'PERFORMANCE'; };
  overlay.querySelector('#inc-category').addEventListener('change', sync);
  sync();
}

// ---------------------------------------------------------------- Fiche
function renderDetail(container, id) {
  let incident;
  try { incident = S.getIncident(id); } catch { return notFound(container, '/incidents', 'Retour aux incidents'); }
  const allowed = S.allowedActions(incident);
  const overdue = S.isOverdue(incident);
  const left = S.hoursLeft(incident);
  const buttons = [
    allowed.qualify && `<button type="button" class="btn btn-secondary" data-act="qualify">${icon('filter', { size: 15 })} Qualifier</button>`,
    allowed.assign && `<button type="button" class="btn btn-secondary" data-act="assign">${icon('users', { size: 15 })} ${incident.assignee ? 'Réattribuer' : 'Attribuer'}</button>`,
    allowed.follow && `<button type="button" class="btn btn-secondary" data-act="follow">${icon('edit', { size: 15 })} Ajouter un suivi</button>`,
    allowed.resolve && `<button type="button" class="btn btn-primary" data-act="resolve">${icon('check', { size: 15 })} Proposer une résolution</button>`,
    allowed.reopen && `<button type="button" class="btn btn-secondary" data-act="reopen">${icon('refresh', { size: 15 })} Contester la solution</button>`,
    allowed.close && `<button type="button" class="btn btn-primary" data-act="close">${icon('checkCircle', { size: 15 })} Vérifier et clore</button>`,
    allowed.complement && `<button type="button" class="btn btn-ghost" data-act="complement">${icon('plus', { size: 15 })} Compléter</button>`,
  ].filter(Boolean).join('');
  const perf = incident.performance;
  const deadlineText = incident.status === 'CLOS' ? (S.resolvedLate(incident) ? 'Résolu hors délai cible' : 'Résolu dans le délai cible')
    : incident.status === 'RESOLU' ? 'Délai arrêté : résolution à vérifier'
      : overdue ? `Dépassé de ${hoursLabel(left)}` : `Encore ${hoursLabel(left)}`;
  container.innerHTML = `
    ${pageHeader({
      back: ['/incidents', 'Incidents'],
      title: incident.title,
      subtitle: `${esc(incident.reference)} · ${esc(S.INCIDENT_CATEGORIES[incident.category])} · déclaré le ${formatDateTime(incident.declaredAt)} par ${esc(incident.declaredBy?.name || '—')}${incident.declaredBy?.partnerName ? ` (${esc(incident.declaredBy.partnerName)})` : ''}`,
      badges: `${statusBadge(incident)}${severityBadge(incident)}${overdue ? badge('badge-error', 'Délai cible dépassé') : ''}`,
      actions: buttons,
    })}
    ${overdue ? `<div class="alert-banner error" role="alert">${icon('clock')}<div class="alert-text"><strong>Délai cible dépassé</strong>L’échéance était le ${formatDateTime(S.dueAt(incident))} (gravité ${esc(S.INCIDENT_SEVERITIES[incident.severity].label.toLowerCase())}, ${S.INCIDENT_SEVERITIES[incident.severity].hours} h). Une alerte a été inscrite au journal.</div></div>` : ''}
    ${incident.status === 'RESOLU' ? `<div class="alert-banner info">${icon('info')}<div class="alert-text"><strong>Résolution à vérifier</strong>${allowed.close ? 'Vérifiez la solution avec le déclarant, puis clôturez l’incident.' : 'L’OIC vérifie la solution avant de clore l’incident. Si le problème persiste, contestez la solution.'}</div></div>` : ''}
    <div class="sup-grid">
      <div class="sup-main">
        ${card('Description', `<p class="preserve-lines">${esc(incident.description)}</p>${perf ? `<hr class="d4-divider">${identity([['Écran concerné', esc(S.PERFORMANCE_SCREENS[perf.screen])], ['Durée constatée', esc(secondsLabel(perf.durationSec))], ['Constatée le', formatDateTime(perf.observedAt)]])}` : ''}${incident.attachments?.length ? `<hr class="d4-divider"><dl class="sup-identity"><div><dt>Pièces jointes (métadonnées)</dt><dd>${incident.attachments.map((f) => `${icon('paperclip', { size: 13 })} ${esc(f.name)} · ${formatNumber(Math.max(1, Math.round(f.size / 1024)))} Ko`).join('<br>')}</dd></div></dl>` : ''}${incident.equipmentId ? `<p style="margin-top:12px"><a href="#/equipements/${esc(incident.equipmentId)}">${icon('monitor', { size: 14 })} Voir l’équipement concerné</a></p>` : ''}`)}
        ${incident.cause || incident.solution ? card('Résolution', identity([['Cause', `<span class="preserve-lines">${esc(incident.cause)}</span>`], ['Solution', `<span class="preserve-lines">${esc(incident.solution)}</span>`], ['Proposée par', incident.resolvedBy ? `${esc(incident.resolvedBy.name)} · ${formatDateTime(incident.resolvedAt)}` : ''], ['Clôture', incident.closedAt ? `${esc(incident.closedBy?.name || '')} · ${formatDateTime(incident.closedAt)}` : '']])) : ''}
        ${card('Historique', timeline([...incident.history].reverse().map((h) => ({ title: h.label, at: h.at, by: h.by, note: h.note })), 'Aucune action enregistrée.'), `<span class="text-muted">${incident.history.length} étape(s)</span>`)}
      </div>
      <div class="sup-side">
        ${card('Suivi', identity([
          ['État', statusBadge(incident)],
          ['Gravité', `${severityBadge(incident)}${incident.declaredSeverity && incident.declaredSeverity !== incident.severity ? ` <small class="text-muted">déclarée ${esc(S.INCIDENT_SEVERITIES[incident.declaredSeverity].label.toLowerCase())}</small>` : ''}`],
          ['Impact', incident.impact ? esc(S.INCIDENT_IMPACTS[incident.impact]) : '<span class="text-muted">À qualifier</span>'],
          ['Échéance', `${formatDateTime(S.dueAt(incident))}<br><small class="text-muted">${esc(deadlineText)}</small>`],
          ['Responsable', incident.assignee ? `${esc(incident.assignee.name)}<br><small class="text-muted">${esc(S.RESOLUTION_TEAMS[incident.team] || '')}</small>` : '<span class="text-muted">À attribuer</span>'],
          ['Antenne', esc(incident.antennaName)],
          ['Déclarant', `${esc(incident.declaredBy?.name || '—')}${incident.declaredBy?.partnerName ? `<br><small class="text-muted">${esc(incident.declaredBy.partnerName)}</small>` : ''}`],
        ]))}
        ${card('Délais cibles', `<dl class="sup-identity">${Object.values(S.INCIDENT_SEVERITIES).map((s) => `<div><dt>${esc(s.label)}</dt><dd>${s.hours} h · ${esc(s.hint)}</dd></div>`).join('')}</dl>`)}
      </div>
    </div>`;
  const rerender = () => renderDetail(container, id);
  const on = (act, fn) => container.querySelector(`[data-act="${act}"]`)?.addEventListener('click', fn);
  on('qualify', () => openModal({
    icon: 'filter', title: 'Qualifier l’incident', confirmLabel: 'Enregistrer la qualification',
    text: 'Évaluez la gravité et l’impact. La gravité fixe le délai cible de résolution.',
    bodyHtml: `<div class="field-row d4-row">${field('q-severity', 'Gravité', selectCtl('q-severity', Object.entries(S.INCIDENT_SEVERITIES).map(([k, v]) => [k, `${v.label} (${v.hours} h)`]), incident.severity), { required: true })}${field('q-impact', 'Impact', selectCtl('q-impact', Object.entries(S.INCIDENT_IMPACTS), incident.impact || 'UTILISATEUR'), { required: true })}</div>${field('q-category', 'Catégorie', selectCtl('q-category', Object.entries(S.INCIDENT_CATEGORIES), incident.category))}${field('q-note', 'Observation (facultatif)', textareaCtl('q-note', 'Ex. : bloquant pour les validations du matin'))}`,
    onConfirm: ({ close, root }) => attempt(() => S.qualifyIncident(id, { severity: root.querySelector('#q-severity').value, impact: root.querySelector('#q-impact').value, category: root.querySelector('#q-category').value, note: root.querySelector('#q-note').value }), 'Incident qualifié', () => { close(); rerender(); }),
  }));
  on('assign', () => {
    const people = S.assignableUsers(incident);
    openModal({
      icon: 'users', title: incident.assignee ? 'Réattribuer l’incident' : 'Attribuer l’incident', confirmLabel: 'Attribuer',
      text: 'Le responsable peut être un administrateur OIC ou un agent de l’antenne concernée.',
      bodyHtml: `${field('a-team', 'Équipe chargée du traitement', selectCtl('a-team', Object.entries(S.RESOLUTION_TEAMS), incident.team || (incident.category === 'RESEAU' ? 'RESEAU' : incident.category === 'MATERIEL' ? 'MATERIEL' : incident.category === 'PROCEDURE' ? 'OPERATIONS' : 'SUPPORT')), { required: true })}${field('a-user', 'Responsable', selectCtl('a-user', people.map((u) => [u.id, `${u.name} — ${u.role === 'OIC_ADMIN' ? 'administrateur OIC' : 'agent d’antenne'}`]), incident.assignee?.id || '', 'Choisir…'), { required: true })}${field('a-note', 'Consigne (facultatif)', textareaCtl('a-note', 'Ex. : vérifier en priorité le poste du guichet 2'))}<p class="text-muted" style="font-size:12px">Message simulé : après mise en service de la messagerie, le responsable sera prévenu par courriel.</p>`,
      onConfirm: ({ close, root }) => attempt(() => S.assignIncident(id, { team: root.querySelector('#a-team').value, assigneeId: root.querySelector('#a-user').value, note: root.querySelector('#a-note').value }), 'Incident attribué', () => { close(); rerender(); }),
    });
  });
  on('follow', () => promptAction({ title: 'Ajouter un suivi', text: 'Décrivez l’action menée ou l’avancement. L’incident passe en traitement.', label: 'Compte rendu', confirmLabel: 'Enregistrer', onConfirm: (note) => attempt(() => S.followIncident(id, note), 'Suivi enregistré', rerender) }));
  on('resolve', () => openModal({
    icon: 'check', title: 'Proposer une résolution', confirmLabel: 'Proposer la résolution',
    text: 'L’OIC vérifiera la solution avant de clore l’incident.',
    bodyHtml: `${field('r-cause', 'Cause identifiée', textareaCtl('r-cause', 'Ce qui a provoqué l’incident'), { required: true })}${field('r-solution', 'Solution apportée', textareaCtl('r-solution', 'Ce qui a été fait pour le résoudre'), { required: true })}`,
    onConfirm: ({ close, root }) => attempt(() => S.resolveIncident(id, { cause: root.querySelector('#r-cause').value, solution: root.querySelector('#r-solution').value }), 'Résolution proposée', () => { close(); rerender(); }),
  }));
  on('close', () => openModal({
    icon: 'checkCircle', title: 'Vérifier et clore l’incident', confirmLabel: 'Clore l’incident',
    text: 'Confirmez que la solution a été vérifiée. L’incident sera archivé avec sa cause et sa solution.',
    bodyHtml: field('c-note', 'Vérification effectuée (facultatif)', textareaCtl('c-note', 'Ex. : vérifié avec le déclarant le jour même')),
    onConfirm: ({ close, root }) => attempt(() => S.closeIncident(id, root.querySelector('#c-note').value), 'Incident clos', () => { close(); rerender(); }),
  }));
  on('reopen', () => promptAction({ title: 'Contester la solution', text: 'L’incident repasse en traitement chez le responsable.', label: 'Motif', danger: true, confirmLabel: 'Reprendre le traitement', onConfirm: (reason) => attempt(() => S.reopenIncident(id, reason), 'Traitement repris', rerender) }));
  on('complement', () => promptAction({ title: 'Compléter la déclaration', label: 'Complément d’information', confirmLabel: 'Ajouter', onConfirm: (note) => attempt(() => S.addComplement(id, note), 'Complément ajouté', rerender) }));
}

// ---------------------------------------------------------------- Suivi des lenteurs
export function renderPerformance(container, days = 30) {
  const st = S.performanceStats({ days });
  const maxCount = Math.max(1, ...st.byScreen.map((r) => r.count), ...st.byAntenna.map((r) => r.count), ...st.bySlot.map((r) => r.count));
  const bar = (n) => `<div class="sup-cell"><b>${formatNumber(n)}</b><i style="width:${Math.round((n / maxCount) * 100)}%"></i></div>`;
  const table = (head, rows, empty) => rows.length ? `<div class="table-wrap"><table class="data-table sup-table"><thead><tr>${head.map(([h, cls]) => `<th scope="col" class="${cls || ''}">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>` : `<p class="text-muted">${esc(empty)}</p>`;
  container.innerHTML = `
    ${pageHeader({
      back: ['/incidents', 'Incidents'],
      title: 'Suivi des lenteurs',
      subtitle: 'Incidents de performance signalés : écrans concernés, fréquence, durée constatée et antennes touchées. Pour repérer les opérations à l’origine des ralentissements.',
      actions: `<select class="select" id="perf-days" aria-label="Période">${options([['7', '7 derniers jours'], ['30', '30 derniers jours'], ['90', '90 derniers jours']], String(days))}</select>`,
    })}
    ${kpis([['Lenteurs signalées', st.count, 'gauge', 'navy'], ['Encore ouvertes', st.open, 'clock', 'amber'], ['Durée moyenne', secondsLabel(st.averageSec), 'clock', 'blue'], ['Durée la plus longue', secondsLabel(st.maxSec), 'alertTriangle', 'rose'], ['Antennes touchées', st.antennasTouched, 'map', 'green']])}
    <div class="d4-stack">
      ${card('Par écran', table([['Écran'], ['Signalements', 'num'], ['Durée moyenne', 'num'], ['Durée max.', 'num'], ['Antennes', 'num'], ['Ouverts', 'num']], st.byScreen.map((r) => `<tr><td><strong>${esc(r.label)}</strong></td><td class="num">${bar(r.count)}</td><td class="num d4-nowrap">${esc(secondsLabel(r.average))}</td><td class="num d4-nowrap">${esc(secondsLabel(r.max))}</td><td class="num">${r.antennasCount}</td><td class="num">${r.open}</td></tr>`), 'Aucune lenteur signalée sur la période.'), '<span class="text-muted">Le plus fréquent en premier</span>')}
      <div class="d4-two">
        ${card('Par antenne', table([['Antenne'], ['Signalements', 'num'], ['Durée moyenne', 'num']], st.byAntenna.map((r) => `<tr><td><strong>${esc(r.label)}</strong></td><td class="num">${bar(r.count)}</td><td class="num d4-nowrap">${esc(secondsLabel(r.average))}</td></tr>`), 'Aucune antenne touchée.'))}
        ${card('Par tranche horaire', table([['Heure de la lenteur'], ['Signalements', 'num'], ['Durée moyenne', 'num']], st.bySlot.map((r) => `<tr><td class="d4-nowrap">${esc(r.label)}</td><td class="num">${bar(r.count)}</td><td class="num d4-nowrap">${esc(secondsLabel(r.average))}</td></tr>`), ''))}
      </div>
      ${card('Derniers signalements', table([['Constatée le'], ['Écran'], ['Antenne'], ['Durée', 'num'], ['État']], st.recent.map((i) => `<tr data-href="#/incidents/${esc(i.id)}" style="cursor:pointer"><td class="d4-nowrap">${formatDateTime(i.performance.observedAt)}<small>${esc(i.reference)}</small></td><td>${esc(S.PERFORMANCE_SCREENS[i.performance.screen])}</td><td>${esc(i.antennaName)}</td><td class="num d4-nowrap">${esc(secondsLabel(i.performance.durationSec))}</td><td>${statusBadge(i)}</td></tr>`), 'Aucune lenteur signalée sur la période.'))}
    </div>`;
  container.querySelector('#perf-days').addEventListener('change', (e) => renderPerformance(container, Number(e.target.value)));
  container.querySelectorAll('tr[data-href]').forEach((tr) => tr.addEventListener('click', () => navigate(tr.dataset.href.slice(1))));
}
