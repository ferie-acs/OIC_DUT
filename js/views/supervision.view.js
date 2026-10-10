// Supervision (admin OIC) : liste classée par acteur, puis fiche détaillée avec statistiques et journal.
import { icon } from '../core/icons.js';
import { escapeHtml as esc, formatDate, formatDateTime, formatNumber } from '../core/utils.js';
import { navigate } from '../core/router.js';
import { openModal, toast } from '../core/ui.js';
import { DUT_STATUS_LABELS } from '../core/constants.js';
import * as S from '../services/supervision.service.js';
import { verdictOf } from '../services/supervision.service.js';
import { mountComparator } from './comparator.component.js';

const ACTOR_INTRO = { antennes: ['map', 'Chaque antenne : dossiers de son périmètre, relecture, contrôles à son poste.'], partenaires: ['layers', 'Les émetteurs de DUT : volumes, numéros consommés, taux de rejet, anomalies.'], controleurs: ['shield', 'Les agents de terrain : scans, verdicts, dérogations, poste habituel.'], transporteurs: ['truck', 'Les transporteurs et leurs véhicules : DUT transportés, contrôles subis, incidents.'] };
const MAIN_METRIC = { antennes: 'duts', partenaires: 'duts', controleurs: 'scans', transporteurs: 'duts' };
const VERDICT_BADGE = { VERT: 'badge-success', ORANGE: 'badge-warning', ROUGE: 'badge-error', INCONNU: 'badge-neutral' };
const num = (v, d = 0) => (v == null || Number.isNaN(v) ? '—' : formatNumber(v, d));
const hours = (h) => (h == null ? '—' : h < 48 ? `${num(h, 1)} h` : `${num(h / 24, 1)} j`);
const dateOr = (iso) => (iso ? formatDate(iso) : '—');
const statusBadge = (s) => `<span class="badge status-${esc(s)}"><span class="badge-dot"></span>${esc(DUT_STATUS_LABELS[s] || s)}</span>`;
const verdictBadge = (v) => `<span class="badge ${VERDICT_BADGE[v] || 'badge-neutral'}"><span class="badge-dot"></span>${esc(v || '—')}</span>`;

const ACTORS = {
  antennes: {
    label: 'Antennes', icon: 'map', overview: S.antennasOverview, profile: S.antennaProfile, intro: 'Chaque antenne : dossiers de son périmètre, relecture, contrôles à son poste.',
    kpis: (rows) => [['Antennes', rows.length], ['DUT émis', rows.reduce((n, r) => n + r.duts, 0)], ['À relire', rows.reduce((n, r) => n + r.aRelire, 0)], ['Contrôles', rows.reduce((n, r) => n + r.controles, 0)]],
    columns: [['rang', '#'], ['name', 'Antenne', (r) => `<strong>${esc(r.name)}</strong><small>${esc(r.city)} · ${esc(r.zone)}</small>`], ['chef', 'Chef d’antenne'], ['duts', 'DUT', null, 'num'], ['dutsMois', '30 j', null, 'num'], ['partenaires', 'Partenaires', null, 'num'], ['aRelire', 'À relire', null, 'num'], ['delaiRelectureH', 'Délai relecture', (r) => hours(r.delaiRelectureH), 'num'], ['controles', 'Contrôles', null, 'num'], ['refus', 'Refus', (r) => (r.refus ? `<span class="sup-neg">${r.refus}</span>` : '0'), 'num']],
    defaultSort: 'rang',
  },
  partenaires: {
    label: 'Partenaires', icon: 'layers', overview: S.partnersOverview, profile: S.partnerProfile, intro: 'Les émetteurs de DUT : volumes, numéros consommés, taux de rejet, anomalies.',
    kpis: (rows) => [['Partenaires', rows.length], ['DUT émis', rows.reduce((n, r) => n + r.duts, 0)], ['Numéros consommés', rows.reduce((n, r) => n + r.numerosConsommes, 0)], ['Plages en attente', rows.reduce((n, r) => n + r.plagesEnAttente, 0)]],
    columns: [['name', 'Partenaire', (r) => `<strong>${esc(r.name)}</strong><small>${esc(r.antenne)}</small>`], ['duts', 'DUT', null, 'num'], ['dutsMois', '30 j', null, 'num'], ['valides', 'Validés', null, 'num'], ['rejetes', 'Rejetés', null, 'num'], ['tauxRejet', 'Taux de rejet', (r) => `<span class="${r.tauxRejet >= 20 ? 'sup-neg' : ''}">${r.tauxRejet} %</span>`, 'num'], ['suspendus', 'Susp. / retirés', null, 'num'], ['numerosConsommes', 'Numéros utilisés', null, 'num'], ['numerosDisponibles', 'Disponibles', null, 'num'], ['dernierDut', 'Dernier DUT', (r) => dateOr(r.dernierDut)]],
    defaultSort: 'duts',
  },
  controleurs: {
    label: 'Agents de contrôle', icon: 'shield', overview: S.controllersOverview, profile: S.controllerProfile, intro: 'Les agents de terrain : scans, verdicts, dérogations, poste habituel.',
    kpis: (rows) => [['Agents', rows.length], ['Scans', rows.reduce((n, r) => n + r.scans, 0)], ['Refus', rows.reduce((n, r) => n + r.verdicts.ROUGE, 0)], ['Dérogations', rows.reduce((n, r) => n + r.derogations, 0)]],
    columns: [['name', 'Agent', (r) => `<strong>${esc(r.name)}</strong><small>${esc(r.email)}</small>`], ['posteHabituel', 'Poste habituel', (r) => esc(r.posteHabituel || '—')], ['scans', 'Scans', null, 'num'], ['scansSemaine', '7 j', null, 'num'], ['verdicts', 'Vert / Orange / Rouge', (r) => `<span class="sup-verdicts"><b class="v">${r.verdicts.VERT}</b><b class="o">${r.verdicts.ORANGE}</b><b class="r">${r.verdicts.ROUGE}</b></span>`], ['horsLigne', 'Hors ligne', null, 'num'], ['derogations', 'Dérogations', null, 'num'], ['dernierScan', 'Dernier scan', (r) => (r.dernierScan ? formatDateTime(r.dernierScan) : '—')]],
    defaultSort: 'scans',
  },
  transporteurs: {
    label: 'Transporteurs', icon: 'truck', overview: S.transportersOverview, profile: S.transporterProfile, intro: 'Les transporteurs et leurs véhicules : DUT transportés, contrôles subis, incidents.',
    kpis: (rows) => [['Transporteurs', rows.length], ['DUT transportés', rows.reduce((n, r) => n + r.duts, 0)], ['Véhicules', rows.reduce((n, r) => n + r.vehicules, 0)], ['Voyages impossibles', rows.reduce((n, r) => n + r.voyagesImpossibles, 0)]],
    columns: [['name', 'Transporteur', (r) => `<strong>${esc(r.name)}</strong><small>${esc(r.registre)}</small>`], ['vehicules', 'Véhicules', null, 'num'], ['duts', 'DUT', null, 'num'], ['valides', 'Validés', null, 'num'], ['controles', 'Contrôles', null, 'num'], ['refus', 'Refus', (r) => (r.refus ? `<span class="sup-neg">${r.refus}</span>` : '0'), 'num'], ['voyagesImpossibles', 'Voyages impossibles', (r) => (r.voyagesImpossibles ? `<span class="sup-neg">${r.voyagesImpossibles}</span>` : '0'), 'num'], ['dernierDut', 'Dernier DUT', (r) => dateOr(r.dernierDut)]],
    defaultSort: 'duts',
  },
};

function download(filename, text) {
  const blob = new Blob([`﻿${text}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function render(container, params = {}) {
  const actor = ACTORS[params.actor] ? params.actor : 'antennes';
  if (params.id) renderProfile(container, actor, params.id);
  else renderOverview(container, actor);
}

function tabsHtml(actor) {
  return `<div class="tabs-underline sup-tabs">${Object.entries(ACTORS).map(([k, a]) => `<a class="tab-count-btn ${k === actor ? 'active' : ''}" href="#/oic/supervision/${k}">${icon(a.icon, { size: 15 })} ${a.label}</a>`).join('')}</div>`;
}

function renderOverview(container, actor) {
  const cfg = ACTORS[actor];
  const rows = cfg.overview();
  const main = MAIN_METRIC[actor];
  const maxOf = Object.fromEntries(cfg.columns.map(([k]) => [k, Math.max(0, ...rows.map((r) => (typeof r[k] === 'number' ? r[k] : 0)))]));
  let sortKey = cfg.defaultSort, sortDir = sortKey === 'rang' ? 1 : -1, query = '';
  const initials = (name) => String(name || '?').split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
  container.innerHTML = `
    <div class="page-header">
      <div><span class="overline">OIC · Supervision</span><h1>${esc(cfg.label)}</h1><div class="subtitle">${esc(ACTOR_INTRO[actor][1])} Cliquez sur une ligne pour ouvrir la fiche.</div></div>
      <button type="button" class="btn btn-secondary" id="sup-export">${icon('download', { size: 15 })} Exporter (CSV)</button>
    </div>
    <div class="page-header-rule"></div>
    <div class="kpi-grid sup-kpis">${cfg.kpis(rows).map(([l, v], i) => `<div class="kpi-card sup-kpi-card"><div class="kpi-label">${esc(l)}<span class="kpi-icon" style="background:var(--sq-${['navy', 'blue', 'amber', 'green'][i % 4]}-bg);color:var(--sq-${['navy', 'blue', 'amber', 'green'][i % 4]}-fg)">${icon(ACTOR_INTRO[actor][0], { size: 13 })}</span></div><div class="kpi-value">${num(v)}</div></div>`).join('')}</div>
    <section class="card sup-table-card">
      <div class="sup-table-head"><div><h2>Classement</h2><p>Trié par ${esc(cfg.columns.find(([k]) => k === cfg.defaultSort)?.[1] || '')} · cliquez sur un en-tête pour changer le tri.</p></div><div class="sup-table-tools"><label class="search-input ant-search">${icon('search', { size: 16 })}<input type="search" id="sup-query" placeholder="Rechercher…" autocomplete="off"></label><span class="sup-count" id="sup-count"></span></div></div>
      <div class="table-wrap"><table class="data-table sup-table"><thead><tr>${cfg.columns.map(([k, l, , cls]) => `<th scope="col" class="${cls || ''}" data-sort="${k}"><button type="button" class="sup-sort">${esc(l)} <span class="sup-arrow"></span></button></th>`).join('')}<th></th></tr></thead><tbody id="sup-rows"></tbody></table></div>
    </section>
    <section class="sup-compare" id="sup-compare"></section>`;
  const tbody = container.querySelector('#sup-rows');
  const cell = (k, fmt, cls, r, idx) => {
    if (k === 'name') return `<td><div class="sup-who"><span class="sup-avatar" style="--i:${idx % 8}">${esc(initials(r.name))}</span><div>${fmt ? fmt(r) : `<strong>${esc(r.name)}</strong>`}</div></div></td>`;
    if (k === 'rang') return `<td class="num"><span class="sup-rank ${r.rang <= 3 ? 'is-top' : ''}">${r.rang}</span></td>`;
    if (cls === 'num' && typeof r[k] === 'number' && maxOf[k] > 0 && !fmt) return `<td class="num"><div class="sup-cell"><b>${num(r[k])}</b><i style="width:${Math.round((r[k] / maxOf[k]) * 100)}%"></i></div></td>`;
    return `<td class="${cls || ''}">${fmt ? fmt(r) : esc(r[k] ?? '—')}</td>`;
  };
  const draw = () => {
    const q = query.trim().toLowerCase();
    let shown = rows.filter((r) => !q || Object.values(r).join(' ').toLowerCase().includes(q));
    shown = [...shown].sort((a, b) => { const x = a[sortKey], y = b[sortKey]; const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'fr'); return cmp * sortDir; });
    container.querySelector('#sup-count').textContent = `${shown.length} / ${rows.length}`;
    container.querySelectorAll('th[data-sort]').forEach((th) => th.classList.toggle('is-sorted', th.dataset.sort === sortKey));
    container.querySelectorAll('th[data-sort] .sup-arrow').forEach((a) => { a.textContent = a.closest('th').dataset.sort === sortKey ? (sortDir > 0 ? '↑' : '↓') : ''; });
    tbody.innerHTML = shown.length ? shown.map((r, idx) => `<tr data-id="${esc(r.id)}" tabindex="0">${cfg.columns.map(([k, , fmt, cls]) => cell(k, fmt, cls, r, rows.indexOf(r))).join('')}<td class="text-right"><span class="sup-open">${icon('chevronRight', { size: 15 })}</span></td></tr>`).join('') : `<tr><td class="table-empty" colspan="${cfg.columns.length + 1}">Aucun résultat</td></tr>`;
  };
  draw();
  container.querySelector('#sup-query').addEventListener('input', (e) => { query = e.target.value; draw(); });
  container.querySelectorAll('th[data-sort]').forEach((th) => th.addEventListener('click', () => { const k = th.dataset.sort; if (sortKey === k) sortDir *= -1; else { sortKey = k; sortDir = k === 'rang' || k === 'name' ? 1 : -1; } draw(); }));
  const open = (tr) => navigate(`/oic/supervision/${actor}/${tr.dataset.id}`);
  tbody.addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) open(tr); });
  tbody.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const tr = e.target.closest('tr[data-id]'); if (tr) open(tr); } });
  container.querySelector('#sup-export').addEventListener('click', () => download(`supervision-${actor}-${new Date().toISOString().slice(0, 10)}.csv`, S.toCsv(rows.map((r) => ({ ...r, verdicts: r.verdicts ? `${r.verdicts.VERT}/${r.verdicts.ORANGE}/${r.verdicts.ROUGE}` : undefined })))));
  // Comparateur intégré : pré-rempli avec les cinq premiers de l'indicateur principal.
  const top5 = [...rows].sort((a, b) => (b[main] || 0) - (a[main] || 0)).slice(0, 5).map((r) => r.id);
  mountComparator(container.querySelector('#sup-compare'), actor, { ids: top5 });
}

// ---------------------------------------------------------------- Fiches
const kpiCard = (label, value, tone = 'navy', hint = '') => `<div class="kpi-card"><div class="kpi-label">${esc(label)}</div><div class="kpi-value" style="color:var(--sq-${tone}-fg)">${value}</div>${hint ? `<div class="kpi-hint">${hint}</div>` : ''}</div>`;
const dutRows = (duts) => duts.length ? `<table class="data-table"><thead><tr><th>Date</th><th>N° DUT</th><th>Transporteur</th><th>Trajet</th><th>Statut</th></tr></thead><tbody>${duts.map((d) => `<tr><td>${dateOr(d.createdAt)}</td><td><a href="#/dut/${esc(d.id)}">${esc(d.dutNumber || 'Brouillon')}</a></td><td>${esc(d.general?.transporterName || '—')}</td><td>${esc(d.trajet?.chargement?.ville || '—')} → ${esc(d.trajet?.dechargement?.ville || '—')}</td><td>${statusBadge(d.status)}</td></tr>`).join('')}</tbody></table>` : '<p class="sup-empty">Aucun DUT.</p>';
const controlRows = (controls, withAgent = true) => controls.length ? `<table class="data-table"><thead><tr><th>Date</th><th>DUT</th>${withAgent ? '<th>Agent</th>' : ''}<th>Poste</th><th>Mode</th><th>Verdict</th></tr></thead><tbody>${controls.map((c) => `<tr><td>${formatDateTime(c.date)}</td><td>${esc(c.dutNumber || 'QR inconnu')}</td>${withAgent ? `<td>${esc(c.agentLabel || '—')}</td>` : ''}<td>${esc(c.postName || '—')}</td><td>${c.mode === 'HORS_LIGNE' ? 'Hors ligne' : 'En ligne'}</td><td>${verdictBadge(verdictOf(c))}</td></tr>`).join('')}</tbody></table>` : '<p class="sup-empty">Aucun contrôle.</p>';
const journalHtml = (journal) => journal.length ? `<ul class="sup-journal">${journal.map((e) => `<li><span class="sup-journal-date">${formatDateTime(e.date)}</span><div><strong>${esc(e.label || e.action)}</strong>${e.dutNumber ? ` · ${esc(e.dutNumber)}` : ''}<small>${esc(e.userLabel || '—')}${e.note ? ` — ${esc(e.note)}` : ''}</small></div></li>`).join('')}</ul>` : '<p class="sup-empty">Aucune action enregistrée.</p>';
const verdictStrip = (v) => `<div class="sup-verdict-strip"><span class="v">${v.VERT} vert</span><span class="o">${v.ORANGE} orange</span><span class="r">${v.ROUGE} rouge</span><span class="g">${v.INCONNU} non opposable</span></div>`;
const identity = (pairs) => `<dl class="sup-identity">${pairs.filter(([, v]) => v != null && v !== '').map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`;

function shell(container, actor, title, subtitle, badges, body, actions = '') {
  container.innerHTML = `
    <div class="page-header">
      <div><a class="sup-back" href="#/oic/supervision/${actor}">${icon('chevronLeft', { size: 14 })} ${esc(ACTORS[actor].label)}</a><h1>${esc(title)}</h1><div class="subtitle">${subtitle}</div><div class="sup-badges">${badges}</div></div>
      <div class="row gap-2">${actions}</div>
    </div>
    <div class="page-header-rule"></div>
    ${body}`;
}

function renderProfile(container, actor, id) {
  const p = ACTORS[actor].profile(id);
  if (!p) { container.innerHTML = `<div class="empty-state">${icon('alertCircle', { size: 40 })}<h3>Fiche introuvable</h3><a class="btn btn-secondary" href="#/oic/supervision/${actor}">Retour</a></div>`; return; }
  const exportBtn = `<button type="button" class="btn btn-secondary" id="sup-export-journal">${icon('download', { size: 15 })} Journal (CSV)</button>`;
  if (actor === 'antennes') {
    const a = p.antenna, st = p.stats;
    shell(container, actor, a.name, `${esc(a.city)} · zone ${esc(a.zone)} · rang <strong>${st.rang} / ${st.reseau}</strong> sur le réseau`,
      `<span class="badge badge-navy">${esc(a.zone)}</span>${/SIEGE/i.test(a.name) ? '<span class="badge badge-accent">Siège</span>' : ''}`,
      `<div class="kpi-grid sup-kpis">
        ${kpiCard('DUT du périmètre', num(st.duts.total), 'navy', `${num(st.duts.mois)} sur 30 j`)}
        ${kpiCard('Validés', num(st.duts.parStatut.VALIDE), 'green', `${num(st.duts.parStatut.REJETE)} rejetés`)}
        ${kpiCard('À relire', num(st.relecture.aRelire), 'amber', `délai moyen ${hours(st.relecture.delaiMoyenH)}`)}
        ${kpiCard('Contrôles au poste', num(st.controles.total), 'blue', `${num(st.controles.horsLigne)} hors ligne`)}
        ${kpiCard('Refus', num(st.controles.parVerdict.ROUGE), 'rose', `${num(st.controles.pieges)} piège(s)`)}
        ${kpiCard('Dérogations', num(st.controles.derogations), 'violet', `${num(st.controles.voyagesImpossibles)} voyage(s) impossible(s)`)}
      </div>
      <div class="sup-grid">
        <div class="sup-main">
          <div class="card"><div class="card-header"><h3>Derniers DUT du périmètre</h3><a href="#/partner/dut">Tous les DUT</a></div>${dutRows(p.derniersDuts)}</div>
          <div class="card"><div class="card-header"><h3>Derniers contrôles à ce poste</h3></div>${verdictStrip(st.controles.parVerdict)}${controlRows(p.derniersControles)}</div>
          <div class="card"><div class="card-header"><h3>Journal d’audit</h3><span class="text-muted">${p.journal.length} dernières actions</span></div>${journalHtml(p.journal)}</div>
        </div>
        <aside class="sup-side">
          <div class="card sup-card-id"><div class="card-header"><h3>Fiche de l’antenne</h3><button type="button" class="btn btn-ghost btn-sm" id="sup-edit">${icon('edit', { size: 13 })} Modifier</button></div>
            ${identity([['Chef d’antenne', `<strong>${esc(a.chef?.name || '—')}</strong>`], ['Téléphone du chef', esc(a.chef?.phone || '')], ['E-mail', esc(a.chef?.email || '')], ['Adjoint', esc(a.adjoint?.name || '')], ['Effectif', Number(a.effectif) > 0 ? `${num(Number(a.effectif))} agents` : ''], ['Comptes plateforme', p.equipe.length ? p.equipe.map((u) => esc(u.name)).join(', ') : 'Aucun compte rattaché'], ['Standard', esc(a.phone)], ['Horaires', esc(a.hours || '')], ['Adresse', esc(a.address || '')]])}
          </div>
          <div class="card"><div class="card-header"><h3>Partenaires rattachés</h3></div>${p.partenaires.length ? `<ul class="sup-list">${p.partenaires.map((x) => `<li><a href="#/oic/supervision/partenaires/${esc(x.id)}">${esc(x.name)}</a><b>${x.duts} DUT</b></li>`).join('')}</ul>` : '<p class="sup-empty">Aucun partenaire.</p>'}</div>
          <div class="card"><div class="card-header"><h3>Dérogations accordées</h3></div>${p.derogations.length ? `<ul class="sup-list">${p.derogations.map((d) => `<li><span>${formatDateTime(d.date)} · ${esc(d.dutNumber || '')}</span><b>${esc(d.reason)}</b></li>`).join('')}</ul>` : '<p class="sup-empty">Aucune.</p>'}</div>
        </aside>
      </div>`, exportBtn);
    container.querySelector('#sup-edit').addEventListener('click', () => editAntenna(a, () => renderProfile(container, actor, id)));
  } else if (actor === 'partenaires') {
    const x = p.partner, st = p.stats;
    shell(container, actor, x.name, `Antenne de rattachement : ${esc(x.antennaName || '—')}`, `<span class="badge badge-navy">${num(st.duts.total)} DUT</span>${st.tauxRejet >= 20 ? '<span class="badge badge-error">Taux de rejet élevé</span>' : ''}`,
      `<div class="kpi-grid sup-kpis">
        ${kpiCard('DUT émis', num(st.duts.total), 'navy', `${num(st.duts.mois)} sur 30 j`)}
        ${kpiCard('Validés', num(st.duts.parStatut.VALIDE), 'green', `${num(st.duts.parStatut.TERMINE)} en attente`)}
        ${kpiCard('Taux de rejet', `${st.tauxRejet} %`, st.tauxRejet >= 20 ? 'rose' : 'amber', `${num(st.duts.parStatut.REJETE)} rejetés`)}
        ${kpiCard('Suspendus / retirés', num(st.duts.parStatut.SUSPENDU + st.duts.parStatut.RETIRE), 'rose')}
        ${kpiCard('Numéros utilisés', num(st.numeros.consommes), 'blue', `${num(st.numeros.disponibles)} disponibles`)}
        ${kpiCard('Contrôles subis', num(st.controles.total), 'teal', `${num(st.controles.parVerdict.ROUGE)} refus`)}
      </div>
      <div class="sup-grid">
        <div class="sup-main">
          <div class="card"><div class="card-header"><h3>Derniers DUT</h3></div>${dutRows(p.derniersDuts)}</div>
          <div class="card"><div class="card-header"><h3>Contrôles de ses DUT</h3></div>${verdictStrip(st.controles.parVerdict)}${controlRows(p.derniersControles)}</div>
          <div class="card"><div class="card-header"><h3>Journal d’audit</h3><span class="text-muted">${p.journal.length} dernières actions</span></div>${journalHtml(p.journal)}</div>
        </div>
        <aside class="sup-side">
          <div class="card"><div class="card-header"><h3>Plages de numéros</h3><a href="#/oic/operations">Gérer</a></div>${p.plages.length ? `<ul class="sup-list">${p.plages.map((o) => `<li><span>${esc(o.code || o.id)}<small>${esc(o.status)} · ${dateOr(o.requestedAt)}</small></span><b>${num(o.used)} / ${num(o.quantity)}</b></li>`).join('')}</ul>` : '<p class="sup-empty">Aucune plage.</p>'}</div>
          <div class="card"><div class="card-header"><h3>Comptes</h3></div>${p.equipe.length ? `<ul class="sup-list">${p.equipe.map((u) => `<li><span>${esc(u.name)}<small>${esc(u.email)}</small></span><b>${esc(u.role)}</b></li>`).join('')}</ul>` : '<p class="sup-empty">Aucun compte.</p>'}</div>
        </aside>
      </div>`, exportBtn);
  } else if (actor === 'controleurs') {
    const u = p.user, st = p.stats;
    shell(container, actor, u.name, `${esc(u.email)} · poste habituel : ${esc(st.posteHabituel || '—')}`, `<span class="badge badge-navy">${num(st.scans)} scans</span>`,
      `<div class="kpi-grid sup-kpis">
        ${kpiCard('Scans', num(st.scans), 'navy', `${num(st.scansSemaine)} sur 7 j`)}
        ${kpiCard('Verts', num(st.controles.parVerdict.VERT), 'green')}
        ${kpiCard('Refus', num(st.controles.parVerdict.ROUGE), 'rose', `${num(st.controles.pieges)} piège(s)`)}
        ${kpiCard('Hors ligne', num(st.controles.horsLigne), 'amber', `${num(st.controles.parVerdict.INCONNU)} non opposable(s)`)}
        ${kpiCard('Dérogations', num(st.controles.derogations), 'violet')}
        ${kpiCard('Voyages impossibles', num(st.controles.voyagesImpossibles), 'blue')}
      </div>
      <div class="sup-grid">
        <div class="sup-main">
          <div class="card"><div class="card-header"><h3>Derniers contrôles</h3></div>${verdictStrip(st.controles.parVerdict)}${controlRows(p.derniersControles, false)}</div>
          <div class="card"><div class="card-header"><h3>Journal d’audit</h3></div>${journalHtml(p.journal)}</div>
        </div>
        <aside class="sup-side">
          <div class="card"><div class="card-header"><h3>Dérogations</h3></div>${p.derogations.length ? `<ul class="sup-list">${p.derogations.map((d) => `<li><span>${formatDateTime(d.date)} · ${esc(d.dutNumber || '')}</span><b>${esc(d.reason)}</b></li>`).join('')}</ul>` : '<p class="sup-empty">Aucune.</p>'}</div>
        </aside>
      </div>`, exportBtn);
  } else {
    const t = p.transporter, st = p.stats;
    shell(container, actor, t.name, `${esc(t.registre || '')}${t.contact ? ` · ${esc(t.contact)}` : ''}${t.adresse ? ` · ${esc(t.adresse)}` : ''}`, `<span class="badge badge-navy">${num(st.duts.total)} DUT</span>`,
      `<div class="kpi-grid sup-kpis">
        ${kpiCard('DUT transportés', num(st.duts.total), 'navy', `${num(st.duts.mois)} sur 30 j`)}
        ${kpiCard('Validés', num(st.duts.parStatut.VALIDE), 'green')}
        ${kpiCard('Véhicules', num(p.vehicules.length), 'blue')}
        ${kpiCard('Contrôles subis', num(st.controles.total), 'teal', `${num(st.controles.horsLigne)} hors ligne`)}
        ${kpiCard('Refus', num(st.controles.parVerdict.ROUGE), 'rose')}
        ${kpiCard('Voyages impossibles', num(st.controles.voyagesImpossibles), 'amber')}
      </div>
      <div class="sup-grid">
        <div class="sup-main">
          <div class="card"><div class="card-header"><h3>Derniers DUT</h3></div>${dutRows(p.derniersDuts)}</div>
          <div class="card"><div class="card-header"><h3>Contrôles subis</h3></div>${verdictStrip(st.controles.parVerdict)}${controlRows(p.derniersControles)}</div>
          <div class="card"><div class="card-header"><h3>Journal d’audit</h3></div>${journalHtml(p.journal)}</div>
        </div>
        <aside class="sup-side">
          <div class="card"><div class="card-header"><h3>Véhicules</h3></div>${p.vehicules.length ? `<ul class="sup-list">${p.vehicules.map((v) => `<li><span>${esc(v.immatriculation)}<small>${esc(v.type || '')}${Number(v.capaciteTonnes) > 0 ? ` · ${num(Number(v.capaciteTonnes), 1)} t` : ''}</small></span></li>`).join('')}</ul>` : '<p class="sup-empty">Aucun véhicule.</p>'}</div>
        </aside>
      </div>`, exportBtn);
  }
  container.querySelector('#sup-export-journal')?.addEventListener('click', () => download(`journal-${actor}-${id.slice(0, 8)}.csv`, S.toCsv(p.journal.map((e) => ({ date: e.date, action: e.label || e.action, dut: e.dutNumber || '', par: e.userLabel || '', role: e.role || '', note: e.note || '' })))));
}

function editAntenna(a, onSaved) {
  openModal({
    title: 'Fiche de l’antenne', text: a.name, confirmLabel: 'Enregistrer', icon: 'edit',
    bodyHtml: `<form id="antenna-form" class="workspace-form">
      <div class="field"><label>Chef d’antenne <span class="req">*</span></label><input class="input" name="chefName" required value="${esc(a.chef?.name || '')}"></div>
      <div class="field-row"><div class="field"><label>Téléphone du chef</label><input class="input" name="chefPhone" value="${esc(a.chef?.phone || '')}"></div><div class="field"><label>E-mail</label><input class="input" name="chefEmail" type="email" value="${esc(a.chef?.email || '')}"></div></div>
      <div class="field-row"><div class="field"><label>Adjoint</label><input class="input" name="adjointName" value="${esc(a.adjoint?.name || '')}"></div><div class="field"><label>Effectif</label><input class="input" name="effectif" type="number" min="0" value="${Number(a.effectif) > 0 ? Number(a.effectif) : ''}"></div></div>
      <div class="field"><label>Horaires</label><input class="input" name="hours" value="${esc(a.hours || '')}"></div>
      <div class="field"><label>Adresse</label><input class="input" name="address" value="${esc(a.address || '')}"></div>
      <p role="alert" id="antenna-error" class="error-msg"></p></form>`,
    onConfirm: ({ root, close }) => {
      const form = root.querySelector('#antenna-form'); if (!form.reportValidity()) return;
      try { S.updateAntennaLeadership(a.id, Object.fromEntries(new FormData(form))); close(); toast({ type: 'success', title: 'Fiche mise à jour' }); onSaved(); }
      catch (e) { root.querySelector('#antenna-error').textContent = e.message; }
    },
  });
}
