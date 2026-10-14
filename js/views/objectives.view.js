// Lot d5 : contrats d'objectifs (préparer, attribuer, valider), saisie des résultats, écarts et taux d'atteinte,
// actions correctives et catalogue d'indicateurs. Même écran pour l'antenne, limité à ses objectifs.
import { getCurrentUser } from '../core/auth.js';
import { filterOptions } from '../services/statistics.service.js';
import { listAgents } from '../services/agents.service.js';
import * as O from '../services/objectives.service.js';
import { journalOf } from '../services/pilotage-core.service.js';
import {
  esc, icon, num, pct, withUnit, dateOr, formatDate, formatDateTime, kpi, kpis, pageHeader, tabs, badge, identity, journalHtml,
  tableCard, plainTable, bindRowLinks, options, field, formModal, run, allowed, notFound,
} from './direction-ui.js';

const STATUS_TONE = { BROUILLON: 'neutral', SOUMIS: 'warning', VALIDE: 'success', CLOTURE: 'navy' };
const ATT_TONE = { ATTEINT: 'success', PROCHE: 'warning', NON_ATTEINT: 'error', SANS_RESULTAT: 'neutral' };
const ACTION_TONE = { A_LANCER: 'neutral', EN_COURS: 'info', REALISEE: 'success', ABANDONNEE: 'navy' };
const statusBadge = (s) => badge(O.CONTRACT_STATUS_LABELS[s] || s, STATUS_TONE[s]);
const attBadge = (s) => badge(O.ATTAINMENT_LABELS[s] || s, ATT_TONE[s]);
const actionBadge = (a) => `${badge(O.ACTION_STATUS_LABELS[a.status], ACTION_TONE[a.status])}${a.late ? ` ${badge('En retard', 'error')}` : ''}`;
const base = () => (getCurrentUser()?.role === 'ANTENNA_AGENT' ? '/antenna' : '/direction');
const isAntenna = () => base() === '/antenna';

function header(active, actions = '') {
  const b = base();
  const items = isAntenna()
    ? [[`${b}/objectifs`, 'Mes objectifs', 'target'], [`${b}/actions`, 'Actions correctives', 'clipboardList']]
    : [[`${b}/objectifs`, 'Contrats d’objectifs', 'target'], [`${b}/actions`, 'Actions correctives', 'clipboardList'], [`${b}/indicateurs`, 'Indicateurs', 'barChart']];
  return `${pageHeader({ overline: isAntenna() ? `Antenne · ${getCurrentUser().antennaName || ''}` : 'Direction générale · Objectifs', title: isAntenna() ? 'Objectifs de l’antenne' : 'Contrats d’objectifs',
    subtitle: isAntenna() ? 'Les objectifs fixés à votre antenne : saisissez les résultats et suivez les actions correctives qui vous sont confiées.' : 'Définir les objectifs et leurs cibles, les attribuer aux antennes ou aux agents, les faire valider, puis suivre les résultats, les écarts et les actions correctives.', actions })}${tabs(items, active)}`;
}

export function render(container, params = {}) {
  if (params.section === 'actions') return renderActions(container);
  if (params.section === 'indicators') return renderIndicators(container);
  if (params.id) return renderContract(container, params.id);
  return renderContracts(container);
}

// ---------------------------------------------------------------- Liste des contrats
function renderContracts(container) {
  const list = O.listContracts();
  const inForce = list.filter((c) => c.status === 'VALIDE');
  const lines = inForce.flatMap((c) => c.lines);
  container.innerHTML = `${header(`${base()}/objectifs`, allowed('objectives.manage') ? `<button type="button" class="btn btn-primary" id="co-new">${icon('plus', { size: 15 })} Nouveau contrat</button>` : '')}
    ${kpis([
      kpi('Contrats en vigueur', num(inForce.length), `${num(lines.length)} objectif(s) attribué(s)`, 'green'),
      kpi('Taux d’atteinte moyen', pct(O.globalAttainment(lines.map((l) => l.taux))), 'contrats en vigueur', 'navy'),
      kpi('Objectifs non atteints', num(lines.filter((l) => l.statut === 'NON_ATTEINT').length), `${num(lines.filter((l) => l.statut === 'PROCHE').length)} proche(s) de la cible`, 'rose'),
      isAntenna() ? kpi('Sans résultat', num(lines.filter((l) => l.statut === 'SANS_RESULTAT').length), 'résultat à saisir', 'amber') : kpi('À valider', num(list.filter((c) => c.status === 'SOUMIS').length), 'soumis par le pilotage', 'amber'),
    ])}
    ${tableCard({ title: 'Contrats', intro: 'Cliquez sur un contrat pour voir les objectifs, saisir les résultats et suivre les écarts.', rows: list, empty: 'Aucun contrat d’objectifs.', link: (c) => `${base()}/objectifs/${c.id}`,
      columns: [
        ['reference', 'Contrat', (c) => `<strong>${esc(c.title)}</strong><small>${esc(c.reference)}</small>`],
        ['period', 'Période', (c) => `${esc(c.periodLabel)}<small>${formatDate(c.from)} → ${formatDate(c.to)}</small>`],
        ['lines', 'Objectifs', (c) => num(c.lines.length), 'num'],
        ['global', 'Taux d’atteinte', (c) => (c.global == null ? '—' : `<b>${pct(c.global)}</b>`), 'num'],
        ['nonAtteints', 'Non atteints', (c) => (c.nonAtteints ? `<span class="sup-neg">${c.nonAtteints}</span>` : '0'), 'num'],
        ['status', 'État', (c) => statusBadge(c.status)],
      ] })}`;
  bindRowLinks(container);
  container.querySelector('#co-new')?.addEventListener('click', () => contractForm(null, (c) => { window.location.hash = `${base()}/objectifs/${c.id}`; }));
}

// ---------------------------------------------------------------- Fiche d'un contrat
function renderContract(container, id) {
  let c;
  try { c = O.getContract(id); } catch { return notFound(container, `${base()}/objectifs`); }
  const me = getCurrentUser();
  const refresh = () => renderContract(container, id);
  const btn = (key, label, ic, cls = 'btn-secondary') => `<button type="button" class="btn ${cls}" data-do="${key}">${icon(ic, { size: 15 })} ${esc(label)}</button>`;
  const acts = [];
  if (c.status === 'BROUILLON' && allowed('objectives.manage')) acts.push(btn('edit', 'Modifier', 'edit'), btn('submit', 'Soumettre à validation', 'upload', 'btn-primary'));
  if (c.status === 'SOUMIS' && allowed('objectives.validate')) acts.push(btn('reject', 'Renvoyer', 'xCircle'), btn('validate', 'Valider et attribuer', 'checkCircle', 'btn-primary'));
  if (c.status === 'VALIDE' && allowed('objectives.manage')) acts.push(btn('close', 'Clôturer', 'archive'));
  const selfBlocked = c.status === 'SOUMIS' && allowed('objectives.validate') && (c.createdBy?.id === me.id || c.submittedBy?.id === me.id);
  const actions = O.listActions().filter((a) => a.contractId === id);
  const canResult = c.status === 'VALIDE' && allowed('objectives.results');
  container.innerHTML = `${pageHeader({ back: { href: `${base()}/objectifs`, label: isAntenna() ? 'Objectifs de l’antenne' : 'Contrats d’objectifs' }, title: c.title,
      subtitle: `${esc(c.reference)} · ${esc(c.periodLabel)} · du ${formatDate(c.from)} au ${formatDate(c.to)}`, badges: `${statusBadge(c.status)}${c.global != null ? badge(`Atteinte ${pct(c.global)}`, 'navy') : ''}`, actions: acts.join('') })}
    ${c.status === 'BROUILLON' && c.rejection ? `<div class="st-alerts"><span class="st-alert is-warning">${icon('alertCircle', { size: 14 })} Renvoyé par ${esc(c.rejection.by)} le ${formatDate(c.rejection.at)} : ${esc(c.rejection.reason)}</span></div>` : ''}
    ${selfBlocked ? `<div class="st-alerts"><span class="st-alert is-info">${icon('info', { size: 14 })} Vous avez préparé ou soumis ce contrat : sa validation revient à une autre personne habilitée.</span></div>` : ''}
    ${kpis([
      kpi('Objectifs', num(c.lines.length), `${num(new Set(c.lines.map((l) => l.assignee.id)).size)} bénéficiaire(s)`),
      kpi('Atteints', num(c.lines.filter((l) => l.statut === 'ATTEINT').length), '', 'green'),
      kpi('Proches de la cible', num(c.lines.filter((l) => l.statut === 'PROCHE').length), 'entre 80 et 100 %', 'amber'),
      kpi('Non atteints', num(c.nonAtteints), 'moins de 80 %', 'rose'),
      kpi('Taux d’atteinte global', pct(c.global), 'moyenne plafonnée à 100 %', 'navy'),
    ])}
    <div class="card d5-block"><div class="card-header"><h3>Objectifs attribués</h3><span class="text-muted">Écart = réalisé − cible</span></div>
          ${plainTable([
            ['assignee', 'Bénéficiaire', (l) => `<strong>${esc(l.assignee.name)}</strong><small>${l.assignee.type === 'AGENT' ? 'Agent' : 'Antenne'}</small>`],
            ['indicator', 'Indicateur', (l) => `${esc(l.indicator.label)}<small>${l.indicator.better === 'low' ? 'Plus bas = mieux' : 'Plus haut = mieux'}</small>`],
            ['target', 'Cible', (l) => withUnit(l.target, l.indicator.unit), 'num'],
            ['actual', 'Réalisé', (l) => (l.last ? `${withUnit(l.last.value, l.indicator.unit)}<small>au ${formatDate(l.last.date)}</small>` : '—'), 'num'],
            ['ecart', 'Écart', (l) => (l.ecart == null ? '—' : `<span class="${l.favorable ? '' : 'sup-neg'}">${l.ecart > 0 ? '+' : ''}${withUnit(l.ecart, l.indicator.unit)}</span>`), 'num'],
            ['taux', 'Atteinte', (l) => (l.taux == null ? '—' : `<b>${pct(l.taux)}</b>`), 'num'],
            ['statut', 'Statut', (l) => attBadge(l.statut)],
            ['do', '', (l) => `<div class="admin-actions">${canResult && (!isAntenna() || l.assignee.antennaId === me.antennaId) ? `<button type="button" class="btn btn-secondary btn-sm" data-result="${esc(l.id)}">Saisir un résultat</button>` : ''}${(l.results || []).length ? `<button type="button" class="btn btn-ghost btn-sm" data-history="${esc(l.id)}">Historique</button>` : ''}${['NON_ATTEINT', 'PROCHE'].includes(l.statut) && allowed('actions.manage') && c.status !== 'BROUILLON' ? `<button type="button" class="btn btn-ghost btn-sm" data-action-new="${esc(l.id)}">Action corrective</button>` : ''}</div>`],
          ], c.lines)}
    </div>
    <div class="sup-grid">
      <div class="sup-main">
        <div class="card"><div class="card-header"><h3>Actions correctives</h3><a href="#${base()}/actions">Toutes les actions</a></div>${actionsTable(actions)}</div>
      </div>
      <aside class="sup-side">
        <div class="card"><div class="card-header"><h3>Contrat</h3></div>${identity([
          ['Référence', esc(c.reference)], ['Période', `${esc(c.periodLabel)} · ${formatDate(c.from)} → ${formatDate(c.to)}`], ['Description', esc(c.description || '')],
          ['Préparé par', `${esc(c.createdBy?.name || '—')} · ${formatDate(c.createdAt)}`], ['Soumis par', c.submittedBy ? `${esc(c.submittedBy.name)} · ${formatDate(c.submittedAt)}` : ''],
          ['Validé par', c.validatedBy ? `<strong>${esc(c.validatedBy.name)}</strong> · ${formatDate(c.validatedAt)}` : ''], ['Clôturé par', c.closedBy ? `${esc(c.closedBy.name)} · ${formatDate(c.closedAt)}` : ''],
        ])}</div>
        <div class="card"><div class="card-header"><h3>Historique</h3></div>${journalHtml(isAntenna() ? (c.history || []).slice().reverse().map((h) => ({ at: h.at, label: h.label, by: h.by, note: h.note })) : journalOf(id).slice(0, 30))}</div>
      </aside>
    </div>`;

  container.querySelectorAll('[data-do]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.do;
    if (k === 'edit') contractForm(c, refresh);
    if (k === 'submit' && run(() => O.submitContract(id), 'Contrat soumis à validation')) refresh();
    if (k === 'validate') formModal({ title: 'Valider ce contrat ?', icon: 'checkCircle', text: 'Les objectifs seront attribués aux bénéficiaires, qui pourront saisir leurs résultats. Le contrat ne sera plus modifiable.', body: '', confirmLabel: 'Valider et attribuer', submit: () => { O.validateContract(id); refresh(); } });
    if (k === 'reject') formModal({ title: 'Renvoyer en préparation', icon: 'xCircle', danger: true, confirmLabel: 'Renvoyer', body: field('Motif du renvoi', '<textarea class="textarea" name="reason" rows="3"></textarea>', { required: true }), submit: (v) => { O.rejectContract(id, v.reason); refresh(); } });
    if (k === 'close') formModal({ title: 'Clôturer le contrat', icon: 'archive', confirmLabel: 'Clôturer', body: field('Bilan de clôture', '<textarea class="textarea" name="note" rows="3" placeholder="Résultats obtenus, enseignements"></textarea>', { required: true }), submit: (v) => { O.closeContract(id, v.note); refresh(); } });
  }));
  container.querySelectorAll('[data-result]').forEach((b) => b.addEventListener('click', () => resultForm(c, c.lines.find((l) => l.id === b.dataset.result), refresh)));
  container.querySelectorAll('[data-history]').forEach((b) => b.addEventListener('click', () => historyModal(c.lines.find((l) => l.id === b.dataset.history))));
  container.querySelectorAll('[data-action-new]').forEach((b) => b.addEventListener('click', () => actionForm(c, c.lines.find((l) => l.id === b.dataset.actionNew), refresh)));
  bindActionRows(container, refresh);
}

function contractForm(contract, done) {
  const indicators = O.listIndicators().map((i) => [i.id, `${i.code} · ${i.label}${i.unit ? ` (${i.unit})` : ''}`]);
  const antennas = filterOptions().antennes.map((a) => [a.id, a.name]);
  const agents = listAgents({ includeInactive: false }).map((a) => [a.id, `${a.name} · ${a.antennaName}`]);
  const lineRow = (l = {}) => `<div class="d5-line field-row">
      <div class="field"><label>Attribué à</label><select class="select" name="assigneeType">${options([['ANTENNE', 'Une antenne'], ['AGENT', 'Un agent']], l.assigneeType || 'ANTENNE')}</select></div>
      <div class="field"><label>Bénéficiaire <span class="req">*</span></label><select class="select" name="assignee" data-selected="${esc(l.assigneeType === 'AGENT' ? l.agentId : l.antennaId || '')}"></select></div>
      <div class="field"><label>Indicateur <span class="req">*</span></label><select class="select" name="indicatorId">${options(indicators, l.indicatorId || '', 'Choisir…')}</select></div>
      <div class="field"><label>Cible <span class="req">*</span></label><div class="input-group"><input class="input" name="target" type="number" min="0" step="any" value="${esc(l.target ?? '')}"><button type="button" class="btn btn-ghost btn-sm" data-remove aria-label="Retirer cet objectif">${icon('trash', { size: 14 })}</button></div></div>
    </div>`;
  formModal({
    title: contract ? 'Modifier le contrat d’objectifs' : 'Nouveau contrat d’objectifs', icon: 'target', large: true, confirmLabel: 'Enregistrer en préparation',
    text: 'Le contrat reste modifiable tant qu’il n’est pas soumis. Sa validation revient à une autre personne habilitée.',
    body: `${field('Intitulé', `<input class="input" name="title" maxlength="140" value="${esc(contract?.title || '')}">`, { required: true })}
      <div class="field-row">${field('Période (libellé)', `<input class="input" name="periodLabel" maxlength="40" placeholder="Ex. T1 2027" value="${esc(contract?.periodLabel || '')}">`, { required: true })}${field('Début', `<input class="input" type="date" name="from" value="${esc(contract?.from || '')}">`, { required: true })}${field('Fin', `<input class="input" type="date" name="to" value="${esc(contract?.to || '')}">`, { required: true })}</div>
      ${field('Description', `<textarea class="textarea" name="description" rows="2">${esc(contract?.description || '')}</textarea>`)}
      <div class="card-header"><h3>Objectifs et cibles</h3><button type="button" class="btn btn-secondary btn-sm" id="co-add-line">${icon('plus', { size: 14 })} Ajouter un objectif</button></div>
      <div id="co-lines" class="stack gap-2">${(contract?.lines?.length ? contract.lines : [{}]).map(lineRow).join('')}</div>`,
    build: (form) => {
      const fill = (row) => {
        const type = row.querySelector('[name=assigneeType]').value;
        const sel = row.querySelector('[name=assignee]');
        const keep = sel.value || sel.dataset.selected || '';
        sel.innerHTML = options(type === 'AGENT' ? agents : antennas, keep, 'Choisir…');
      };
      const wire = (row) => { fill(row); row.querySelector('[name=assigneeType]').addEventListener('change', () => { row.querySelector('[name=assignee]').dataset.selected = ''; row.querySelector('[name=assignee]').value = ''; fill(row); }); row.querySelector('[data-remove]').addEventListener('click', () => { if (form.querySelectorAll('.d5-line').length > 1) row.remove(); }); };
      form.querySelectorAll('.d5-line').forEach(wire);
      form.querySelector('#co-add-line').addEventListener('click', () => { const holder = document.createElement('div'); holder.innerHTML = lineRow(); const row = holder.firstElementChild; form.querySelector('#co-lines').appendChild(row); wire(row); });
    },
    submit: (v, form) => {
      const lines = [...form.querySelectorAll('.d5-line')].map((row, i) => {
        const type = row.querySelector('[name=assigneeType]').value, who = row.querySelector('[name=assignee]').value;
        return { id: contract?.lines?.[i]?.id, assigneeType: type, antennaId: type === 'ANTENNE' ? who : null, agentId: type === 'AGENT' ? who : null, indicatorId: row.querySelector('[name=indicatorId]').value, target: row.querySelector('[name=target]').value };
      });
      const saved = O.saveContract({ title: v.title, periodLabel: v.periodLabel, from: v.from, to: v.to, description: v.description, lines }, contract?.id || null);
      done(saved);
    },
  });
}

function resultForm(c, line, done) {
  let measured = null;
  try { measured = O.measuredValue(c.id, line.id); } catch { measured = null; }
  const today = new Date().toISOString().slice(0, 10);
  formModal({
    title: 'Saisir un résultat', icon: 'edit', confirmLabel: 'Enregistrer le résultat',
    text: `${line.assignee.name} · ${line.indicator.label} · cible ${withUnit(line.target, line.indicator.unit)}`,
    body: `${measured != null ? `<div class="st-alerts"><span class="st-alert is-info">${icon('barChart', { size: 14 })} Valeur mesurée sur la plateforme depuis le ${formatDate(c.from)} : ${withUnit(measured, line.indicator.unit)}</span><button type="button" class="btn btn-ghost btn-sm" id="use-measure">Reprendre cette valeur</button></div>` : ''}
      <div class="field-row">${field(`Résultat${line.indicator.unit ? ` (${line.indicator.unit})` : ''}`, '<input class="input" name="value" type="number" min="0" step="any">', { required: true })}${field('Date du résultat', `<input class="input" name="date" type="date" value="${today}" max="${today}" min="${esc(c.from)}">`, { required: true })}</div>
      ${field('Commentaire', '<textarea class="textarea" name="comment" rows="2" placeholder="Source, contexte, difficultés rencontrées"></textarea>')}
      <input type="hidden" name="source" value="SAISIE">
      <p class="hint">Le taux d’atteinte et l’écart sont recalculés automatiquement. Les résultats précédents restent dans l’historique.</p>`,
    build: (form) => form.querySelector('#use-measure')?.addEventListener('click', () => { form.elements.value.value = measured; form.elements.source.value = 'MESURE'; }),
    submit: (v) => { const r = O.recordResult(c.id, line.id, v); done(); run(() => {}, `Résultat enregistré : atteinte ${pct(r.taux)}`); },
  });
}

function historyModal(line) {
  formModal({
    title: 'Historique des résultats', icon: 'clock', confirmLabel: 'Fermer', large: true,
    text: `${line.assignee.name} · ${line.indicator.label} · cible ${withUnit(line.target, line.indicator.unit)}`,
    body: plainTable([
      ['date', 'Date', (r) => formatDate(r.date)], ['value', 'Résultat', (r) => withUnit(r.value, line.indicator.unit), 'num'],
      ['taux', 'Atteinte', (r) => pct(O.attainment(line.target, r.value, line.indicator.better).taux), 'num'],
      ['source', 'Origine', (r) => (r.source === 'MESURE' ? 'Mesure plateforme' : 'Saisie')], ['by', 'Saisi par', (r) => `${esc(r.by)}<small>${formatDateTime(r.at)}</small>`], ['comment', 'Commentaire', (r) => esc(r.comment || '—')],
    ], [...line.results].sort((a, b) => String(b.date).localeCompare(String(a.date)))),
    submit: () => {},
  });
}

function actionForm(c, line, done) {
  formModal({
    title: 'Nouvelle action corrective', icon: 'clipboardList', confirmLabel: 'Décider l’action',
    text: `Écart constaté : ${line.assignee.name} · ${line.indicator.label} · atteinte ${pct(line.taux)} (écart ${line.ecart > 0 ? '+' : ''}${withUnit(line.ecart, line.indicator.unit)})`,
    body: `${field('Action', '<input class="input" name="title" maxlength="160" placeholder="Ex. Renforcer la permanence de validation">', { required: true })}
      ${field('Description', '<textarea class="textarea" name="description" rows="2"></textarea>')}
      <div class="field-row">${field('Responsable', `<input class="input" name="responsible" maxlength="100" value="${esc(line.assignee.type === 'ANTENNE' ? `Chef d’antenne ${line.assignee.name}` : line.assignee.name)}">`, { required: true })}${field('Échéance', `<input class="input" type="date" name="dueDate" min="${new Date().toISOString().slice(0, 10)}">`, { required: true })}</div>`,
    submit: (v) => { O.createAction(c.id, line.id, v); done(); run(() => {}, 'Action corrective enregistrée'); },
  });
}

// ---------------------------------------------------------------- Actions correctives
function actionsTable(list) {
  return plainTable([
    ['title', 'Action', (a) => `<strong>${esc(a.title)}</strong><small>${a.line ? `${esc(a.line.assignee)} · ${esc(a.line.label)}` : ''}</small>`],
    ['responsible', 'Responsable', (a) => esc(a.responsible)],
    ['dueDate', 'Échéance', (a) => `<span class="${a.late ? 'sup-neg' : ''}">${formatDate(a.dueDate)}</span>`],
    ['status', 'État', (a) => actionBadge(a)],
    ['last', 'Dernier point', (a) => { const u = a.updates[a.updates.length - 1]; return u ? `${esc(u.comment)}<small>${esc(u.by)} · ${formatDate(u.at)}</small>` : '—'; }],
    ['do', '', (a) => `<button type="button" class="btn btn-secondary btn-sm" data-follow="${esc(a.id)}">${a.closed ? 'Consulter' : 'Suivre'}</button>`],
  ], list, 'Aucune action corrective.');
}

function bindActionRows(container, refresh) {
  container.querySelectorAll('[data-follow]').forEach((b) => b.addEventListener('click', () => {
    const a = O.listActions().find((x) => x.id === b.dataset.follow);
    const manage = allowed('actions.manage');
    const states = Object.entries(O.ACTION_STATUS_LABELS).filter(([k]) => manage || k !== 'ABANDONNEE');
    formModal({
      title: a.title, icon: 'clipboardList', large: true, confirmLabel: a.closed ? 'Fermer' : 'Enregistrer le point',
      text: `${a.contract ? `${a.contract.reference} · ` : ''}${a.line ? `${a.line.assignee} · ${a.line.label}` : ''} · responsable : ${a.responsible} · échéance ${formatDate(a.dueDate)}`,
      body: `${a.description ? `<p>${esc(a.description)}</p>` : ''}
        <div class="timeline">${a.updates.slice().reverse().map((u) => `<div class="timeline-item"><span class="timeline-dot ${['REALISEE'].includes(u.status) ? 'done' : ''}"></span><div class="timeline-content"><strong>${esc(O.ACTION_STATUS_LABELS[u.status] || u.status)}${u.dueDate ? ` · échéance reportée au ${formatDate(u.dueDate)}` : ''}</strong><div class="meta">${esc(u.by)} · ${formatDateTime(u.at)}</div><div class="note">${esc(u.comment)}</div></div></div>`).join('')}</div>
        ${a.closed ? '' : `<div class="field-row">${field('Nouvel état', `<select class="select" name="status">${options(states, a.status)}</select>`, { required: true })}${manage ? field('Échéance', `<input class="input" type="date" name="dueDate" value="${esc(a.dueDate)}">`) : ''}</div>
        ${field('Point d’avancement', '<textarea class="textarea" name="comment" rows="2"></textarea>', { required: true })}`}`,
      submit: (v) => { if (a.closed) return; O.updateAction(a.id, v); refresh(); run(() => {}, 'Suivi enregistré'); },
    });
  }));
}

function renderActions(container) {
  const state = { status: '', late: false };
  const draw = () => {
    const all = O.listActions();
    const list = all.filter((a) => (!state.status || a.status === state.status) && (!state.late || a.late));
    container.innerHTML = `${header(`${base()}/actions`)}
      ${kpis([
        kpi('Actions ouvertes', num(all.filter((a) => !a.closed).length), 'à lancer ou en cours', 'navy'),
        kpi('En retard', num(all.filter((a) => a.late).length), 'échéance dépassée', 'rose'),
        kpi('En cours', num(all.filter((a) => a.status === 'EN_COURS').length), 'avancement suivi', 'blue'),
        kpi('Réalisées', num(all.filter((a) => a.status === 'REALISEE').length), 'clôturées avec un bilan', 'green'),
      ])}
      <section class="card sup-table-card"><div class="sup-table-head"><div><h2>Actions correctives</h2><p>Chaque action répond à un écart constaté sur un objectif. Les actions en retard apparaissent en premier.</p></div>
        <div class="sup-table-tools"><label class="plan-pill ${state.status ? 'is-set' : ''}"><span>État</span><select class="plan-pill-select" id="ac-status">${options(Object.entries(O.ACTION_STATUS_LABELS), state.status, 'Tous')}</select></label>
        <label class="checkbox-row"><input type="checkbox" id="ac-late" ${state.late ? 'checked' : ''}><span>En retard seulement</span></label></div></div>
        ${actionsTable(list)}</section>`;
    container.querySelector('#ac-status').addEventListener('change', (e) => { state.status = e.target.value; draw(); });
    container.querySelector('#ac-late').addEventListener('change', (e) => { state.late = e.target.checked; draw(); });
    bindActionRows(container, draw);
  };
  draw();
}

// ---------------------------------------------------------------- Indicateurs
function renderIndicators(container) {
  const list = O.listIndicators();
  container.innerHTML = `${header(`${base()}/indicateurs`, allowed('objectives.manage') ? `<button type="button" class="btn btn-primary" id="ind-new">${icon('plus', { size: 15 })} Nouvel indicateur</button>` : '')}
    ${tableCard({ title: 'Catalogue des indicateurs', intro: 'Un indicateur « mesurable » est calculé à partir des DUT de l’antenne ; les autres sont saisis par les responsables.', rows: list, empty: 'Aucun indicateur.',
      columns: [
        ['code', 'Code', (i) => `<strong>${esc(i.code)}</strong>`], ['label', 'Indicateur', (i) => `${esc(i.label)}${i.description ? `<small>${esc(i.description)}</small>` : ''}`],
        ['source', 'Origine', (i) => (i.source === 'MANUEL' ? badge('Saisi', 'neutral') : badge('Mesurable', 'info'))], ['unit', 'Unité', (i) => esc(i.unit || '—')],
        ['better', 'Sens', (i) => (i.better === 'low' ? 'Plus bas = mieux' : 'Plus haut = mieux')],
        ['do', '', (i) => (allowed('objectives.manage') ? `<button type="button" class="btn btn-ghost btn-sm" data-edit="${esc(i.id)}">Modifier</button>` : '')],
      ] })}`;
  const open = (ind) => formModal({
    title: ind ? 'Modifier l’indicateur' : 'Nouvel indicateur', icon: 'barChart',
    body: `<div class="field-row">${field('Code', `<input class="input" name="code" maxlength="20" value="${esc(ind?.code || '')}">`, { required: true })}${field('Origine de la valeur', `<select class="select" name="source">${options([['MANUEL', 'Saisie par les responsables'], ...O.measurableOptions().map((m) => [m.key, `Mesure : ${m.label}`])], ind?.source || 'MANUEL')}</select>`)}</div>
      ${field('Libellé', `<input class="input" name="label" maxlength="120" value="${esc(ind?.label || '')}">`, { required: true })}
      <div class="field-row">${field('Unité', `<input class="input" name="unit" maxlength="20" value="${esc(ind?.unit || '')}" placeholder="Ex. séances, %, h">`)}${field('Sens', `<select class="select" name="better">${options([['high', 'Plus haut = mieux'], ['low', 'Plus bas = mieux']], ind?.better || 'high')}</select>`, { hint: 'Repris automatiquement pour une mesure.' })}</div>
      ${field('Description', `<textarea class="textarea" name="description" rows="2">${esc(ind?.description || '')}</textarea>`)}`,
    submit: (v) => { O.saveIndicator(v, ind?.id || null); renderIndicators(container); run(() => {}, 'Indicateur enregistré'); },
  });
  container.querySelector('#ind-new')?.addEventListener('click', () => open(null));
  container.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => open(list.find((i) => i.id === b.dataset.edit))));
}
