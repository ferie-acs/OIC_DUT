// Lot d5 : fiches agents (affectation, fonction, responsabilités, compte rattaché), suivi et évaluations périodiques.
import { filterOptions } from '../services/statistics.service.js';
import * as A from '../services/agents.service.js';
import { ATTAINMENT_LABELS } from '../services/objectives.service.js';
import {
  esc, icon, num, pct, withUnit, formatDate, formatDateTime, kpi, kpis, pageHeader, badge, identity, journalHtml,
  tableCard, plainTable, bindRowLinks, options, field, formModal, run, allowed, notFound,
} from './direction-ui.js';

const scoreTone = (n) => (n >= 4 ? 'success' : n >= 3 ? 'info' : n >= 2 ? 'warning' : 'error');
const ATT_TONE = { ATTEINT: 'success', PROCHE: 'warning', NON_ATTEINT: 'error', SANS_RESULTAT: 'neutral' };

export function render(container, params = {}) {
  if (params.id) return renderAgent(container, params.id);
  return renderList(container);
}

function renderList(container) {
  const state = { antennaId: '', query: '' };
  const antennas = filterOptions().antennes;
  const draw = () => {
    const all = A.listAgents();
    const list = A.listAgents({ antennaId: state.antennaId, query: state.query });
    const notes = all.filter((a) => a.lastEvaluation).map((a) => a.lastEvaluation.note);
    container.innerHTML = `${pageHeader({ overline: 'Direction générale · Ressources humaines', title: 'Agents', subtitle: 'Fiche de chaque agent : affectation, fonction, responsabilités et compte de la plateforme ; suivi de l’activité et évaluations périodiques.',
        actions: allowed('agents.manage') ? `<button type="button" class="btn btn-primary" id="ag-new">${icon('plus', { size: 15 })} Nouvelle fiche agent</button>` : '' })}
      ${kpis([
        kpi('Agents', num(all.length), `${num(all.filter((a) => a.active !== false).length)} en poste`),
        kpi('Antennes couvertes', num(new Set(all.filter((a) => a.active !== false).map((a) => a.antennaId)).size), `sur ${num(antennas.length)}`, 'blue'),
        kpi('Comptes rattachés', num(all.filter((a) => a.userId).length), 'activité mesurée sur la plateforme', 'teal'),
        kpi('Note moyenne', notes.length ? `${num(notes.reduce((s, x) => s + x, 0) / notes.length, 1)} / 5` : '—', `${num(notes.length)} agent(s) évalué(s)`, 'green'),
      ])}
      ${tableCard({ title: 'Annuaire des agents', intro: 'Cliquez sur un agent pour ouvrir sa fiche.', rows: list, empty: 'Aucun agent ne correspond.', link: (a) => `/direction/agents/${a.id}`,
        tools: `<label class="search-input ant-search">${icon('search', { size: 16 })}<input type="search" id="ag-query" placeholder="Nom, matricule, fonction…" autocomplete="off" value="${esc(state.query)}"></label><label class="plan-pill ${state.antennaId ? 'is-set' : ''}"><span>Antenne</span><select class="plan-pill-select" id="ag-antenna">${options(antennas.map((a) => [a.id, a.name]), state.antennaId, 'Toutes')}</select></label>`,
        columns: [
          ['name', 'Agent', (a) => `<strong>${esc(a.name)}</strong><small>${esc(a.matricule)}</small>`], ['fonction', 'Fonction'],
          ['antennaName', 'Affectation', (a) => `${esc(a.antennaName)}<small>depuis le ${formatDate(a.assignedAt)}</small>`],
          ['userId', 'Compte plateforme', (a) => (a.userId ? badge('Rattaché', 'info') : '<small>Aucun</small>')],
          ['eval', 'Dernière évaluation', (a) => (a.lastEvaluation ? `${badge(`${num(a.lastEvaluation.note, 1)} / 5`, scoreTone(a.lastEvaluation.note))}<small>${esc(a.lastEvaluation.period)}</small>` : '<small>Jamais évalué</small>')],
          ['active', 'Statut', (a) => (a.active === false ? badge('Fin d’affectation', 'neutral') : badge('En poste', 'success'))],
        ] })}`;
    const q = container.querySelector('#ag-query');
    q.addEventListener('input', (e) => { state.query = e.target.value; const pos = e.target.selectionStart; draw(); const i = container.querySelector('#ag-query'); i.focus(); i.setSelectionRange(pos, pos); });
    container.querySelector('#ag-antenna').addEventListener('change', (e) => { state.antennaId = e.target.value; draw(); });
    container.querySelector('#ag-new')?.addEventListener('click', () => profileForm(null, (p) => { window.location.hash = `/direction/agents/${p.id}`; }));
    bindRowLinks(container);
  };
  draw();
}

function profileForm(p, done) {
  const antennas = filterOptions().antennes.map((a) => [a.id, a.name]);
  const users = A.linkableUsers(p?.id || null).map((u) => [u.id, `${u.name} · ${u.role}`]);
  formModal({
    title: p ? 'Modifier la fiche agent' : 'Nouvelle fiche agent', icon: 'users', large: true,
    body: `<div class="field-row">${field('Nom et prénoms', `<input class="input" name="name" maxlength="100" value="${esc(p?.name || '')}">`, { required: true })}${field('Matricule', `<input class="input" name="matricule" maxlength="20" value="${esc(p?.matricule || '')}">`, { required: true })}</div>
      <div class="field-row">${field('Fonction', `<input class="input" name="fonction" maxlength="100" value="${esc(p?.fonction || '')}" placeholder="Ex. Agent de validation des DUT">`, { required: true })}${field('Téléphone', `<input class="input" name="phone" maxlength="30" value="${esc(p?.phone || '')}">`)}</div>
      <div class="field-row">${field('Antenne d’affectation', `<select class="select" name="antennaId">${options(antennas, p?.antennaId || '', 'Choisir…')}</select>`, { required: true })}${field('Date d’affectation', `<input class="input" type="date" name="assignedAt" value="${esc(p?.assignedAt || '')}">`, { required: true })}</div>
      ${field('Responsabilités', `<textarea class="textarea" name="responsibilities" rows="3">${esc(p?.responsibilities || '')}</textarea>`, { required: true })}
      ${field('Compte utilisateur rattaché', `<select class="select" name="userId">${options(users, p?.userId || '', 'Aucun compte')}</select>`, { hint: 'Le rattachement permet de suivre l’activité de l’agent sur la plateforme. Un compte ne peut être rattaché qu’à une fiche.' })}`,
    submit: (v) => { const saved = A.saveAgentProfile(v, p?.id || null); done(saved); run(() => {}, 'Fiche agent enregistrée'); },
  });
}

function renderAgent(container, id) {
  let d;
  try { d = A.agentDetail(id); } catch { return notFound(container, '/direction/agents'); }
  const p = d.profile, refresh = () => renderAgent(container, id);
  const acts = [];
  if (allowed('agents.manage')) acts.push(`<button type="button" class="btn btn-secondary" id="ag-edit">${icon('edit', { size: 15 })} Modifier la fiche</button>`, `<button type="button" class="btn btn-ghost" id="ag-toggle">${p.active === false ? 'Réactiver' : 'Fin d’affectation'}</button>`);
  if (allowed('agents.evaluate') && p.active !== false) acts.push(`<button type="button" class="btn btn-primary" id="ag-eval">${icon('checkCircle', { size: 15 })} Évaluer</button>`);
  const last = d.evaluations[0];
  container.innerHTML = `${pageHeader({ back: { href: '/direction/agents', label: 'Agents' }, title: p.name, subtitle: `${esc(p.matricule)} · ${esc(p.fonction)} · ${esc(p.antennaName)}`,
      badges: `${p.active === false ? badge('Fin d’affectation', 'neutral') : badge('En poste', 'success')}${d.user ? badge(`Compte : ${d.user.roleLabel}`, 'info') : ''}`, actions: acts.join('') })}
    ${kpis([
      kpi('Dernière note', last ? `${num(last.note, 1)} / 5` : '—', last ? `${esc(last.appreciation)} · ${esc(last.period)}` : 'jamais évalué', 'green'),
      kpi('Évaluations', num(d.evaluations.length), 'historique conservé', 'navy'),
      kpi('DUT validés', d.activity ? num(d.activity.valides) : '—', d.activity ? `${num(d.activity.rejetes)} rejeté(s)` : 'aucun compte rattaché', 'blue'),
      kpi('Objectifs personnels', num(d.objectives.length), d.objectives.length ? `${num(d.objectives.filter((o) => o.statut === 'ATTEINT').length)} atteint(s)` : '', 'amber'),
    ])}
    <div class="sup-grid">
      <div class="sup-main">
        <div class="card"><div class="card-header"><h3>Évaluations périodiques</h3><span class="text-muted">Notes de 1 (insuffisant) à 5 (excellent)</span></div>
          ${plainTable([
            ['period', 'Période', (e) => `<strong>${esc(e.period)}</strong><small>${formatDate(e.at)}</small>`],
            ...A.EVALUATION_CRITERIA.map(([k, l]) => [k, l, (e) => num(e.scores[k]), 'num']),
            ['note', 'Note', (e) => badge(`${num(e.note, 1)} / 5`, scoreTone(e.note)), 'num'],
            ['comment', 'Observations', (e) => `${esc(e.comment)}<small>${esc(e.evaluator?.name || '')}</small>`],
          ], d.evaluations, 'Aucune évaluation pour le moment.')}</div>
        <div class="card"><div class="card-header"><h3>Objectifs attribués à l’agent</h3></div>
          ${plainTable([
            ['contract', 'Contrat', (o) => `<a href="#/direction/objectifs/${esc(o.contract.id)}">${esc(o.contract.reference)}</a><small>${esc(o.contract.periodLabel)}</small>`],
            ['indicator', 'Indicateur', (o) => esc(o.indicator.label)], ['target', 'Cible', (o) => withUnit(o.target, o.indicator.unit), 'num'],
            ['actual', 'Réalisé', (o) => (o.last ? withUnit(o.last.value, o.indicator.unit) : '—'), 'num'], ['taux', 'Atteinte', (o) => pct(o.taux), 'num'],
            ['statut', 'Statut', (o) => badge(ATTAINMENT_LABELS[o.statut], ATT_TONE[o.statut])],
          ], d.objectives, 'Aucun objectif personnel en vigueur.')}</div>
        <div class="card"><div class="card-header"><h3>Journal de la fiche</h3></div>${journalHtml(d.journal)}</div>
      </div>
      <aside class="sup-side">
        <div class="card"><div class="card-header"><h3>Fiche agent</h3></div>${identity([
          ['Matricule', esc(p.matricule)], ['Fonction', `<strong>${esc(p.fonction)}</strong>`], ['Affectation', `${esc(p.antennaName)} · depuis le ${formatDate(p.assignedAt)}`],
          ['Responsabilités', esc(p.responsibilities)], ['Téléphone', esc(p.phone || '')],
          ['Compte plateforme', d.user ? `${esc(d.user.name)}<br><small>${esc(d.user.email)} · ${esc(d.user.roleLabel)}</small>` : 'Aucun compte rattaché'],
          ['Dernière activité', d.activity?.derniere ? formatDateTime(d.activity.derniere) : ''],
        ])}</div>
        <div class="card"><div class="card-header"><h3>Parcours</h3></div><ul class="sup-list">${(p.history || []).slice().reverse().map((h) => `<li><span>${esc(h.label)}<small>${esc(h.by)} · ${formatDate(h.at)}</small></span></li>`).join('') || '<li><span>Aucun mouvement.</span></li>'}</ul></div>
      </aside>
    </div>`;
  container.querySelector('#ag-edit')?.addEventListener('click', () => profileForm(p, refresh));
  container.querySelector('#ag-toggle')?.addEventListener('click', () => formModal({
    title: p.active === false ? 'Réactiver la fiche' : 'Fin d’affectation', icon: 'users', danger: p.active !== false, confirmLabel: 'Confirmer',
    body: field('Motif', '<textarea class="textarea" name="reason" rows="2"></textarea>', { required: true }),
    submit: (v) => { A.setAgentActive(id, p.active === false, v.reason); refresh(); },
  }));
  container.querySelector('#ag-eval')?.addEventListener('click', () => formModal({
    title: `Évaluer ${p.name}`, icon: 'checkCircle', large: true, confirmLabel: 'Enregistrer l’évaluation',
    text: 'L’évaluation est définitive et ajoutée à l’historique de l’agent. Une seule évaluation par période.',
    body: `${field('Période évaluée', '<input class="input" name="period" maxlength="40" placeholder="Ex. T4 2026">', { required: true })}
      <div class="field-row">${A.EVALUATION_CRITERIA.map(([k, l]) => field(l, `<select class="select" name="score_${k}">${options(Object.entries(A.SCORE_LABELS).map(([n, t]) => [n, `${n} — ${t}`]), '3')}</select>`, { required: true })).join('')}</div>
      ${field('Observations', '<textarea class="textarea" name="comment" rows="3" placeholder="Points forts, points à améliorer, incidents éventuels"></textarea>', { required: true, hint: '10 caractères au minimum.' })}`,
    submit: (v) => { const e = A.evaluateAgent(id, { period: v.period, comment: v.comment, scores: Object.fromEntries(A.EVALUATION_CRITERIA.map(([k]) => [k, Number(v[`score_${k}`])])) }); refresh(); run(() => {}, `Évaluation enregistrée : ${num(e.note, 1)} / 5`); },
  }));
}
