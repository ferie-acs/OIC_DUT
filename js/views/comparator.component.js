// Composant comparateur, monté sur chaque page d'acteur : entités, indicateurs, période, puis
// cartes de score, graphiques comparatifs (barres, évolution, radar) et tableau exportable.
import { icon } from '../core/icons.js';
import { escapeHtml as esc, formatNumber } from '../core/utils.js';
import { barChart, lineChart, radarChart, PALETTE } from '../core/chartjs.js';
import { ENTITY_TYPES, entitiesOf, indicatorsFor, indicator, compare, monthlySeries } from '../services/comparison.service.js';
import { toCsv } from '../services/supervision.service.js';

const MAX = 8;
const fmt = (v, unit) => (v == null ? '—' : `${formatNumber(v, Number.isInteger(v) ? 0 : 1)}${unit ? ` ${unit}` : ''}`);
const PRESETS = [[30, '30 jours'], [90, '90 jours'], [365, '12 mois'], [0, 'Tout']];
let charts = [];
const destroyCharts = () => { charts.forEach((c) => c?.destroy()); charts = []; };

export function mountComparator(container, type, { ids = [] } = {}) {
  destroyCharts();
  const t = ENTITY_TYPES[type]; if (!t) return;
  const state = { type, ids: [...ids], keys: t.onlyControl ? ['scans', 'tauxRefus', 'derogations', 'horsLigne'] : ['dutCrees', 'dutValides', 'tauxRejet', 'scans'], from: '', to: '', view: 'barres', evo: 'dutCrees', open: null };
  try { const saved = JSON.parse(sessionStorage.getItem(`dut_compare_${type}`) || '{}'); Object.assign(state, saved, { type }); if (ids.length && !saved.ids?.length) state.ids = [...ids]; } catch { /* état par défaut */ }
  state.open = null;
  const save = () => { try { sessionStorage.setItem(`dut_compare_${type}`, JSON.stringify({ ...state, open: null })); } catch { /* indisponible */ } };
  let last = null;

  container.innerHTML = `
    <div class="cmp-head"><div><span class="overline">Comparer</span><h2>Comparer des ${esc(t.label.toLowerCase())}</h2><p>Choisissez jusqu’à ${MAX} ${esc(t.label.toLowerCase())}, les indicateurs et la période ; les graphiques et le tableau se mettent à jour.</p></div><button type="button" class="btn btn-secondary btn-sm" id="cmp-export">${icon('download', { size: 14 })} Exporter (CSV)</button></div>
    <div class="card cmp-builder">
      <div class="cmp-builder-row">
        <button type="button" class="cmp-block cmp-picker" data-open="entities"><span class="cmp-block-label">${icon('target', { size: 13 })} Entités <b id="cmp-ids-count"></b></span><span class="cmp-chips" id="cmp-ids-chips"></span></button>
        <button type="button" class="cmp-block cmp-picker" data-open="indicators"><span class="cmp-block-label">${icon('barChart', { size: 13 })} Indicateurs <b id="cmp-keys-count"></b></span><span class="cmp-chips" id="cmp-keys-chips"></span></button>
        <button type="button" class="cmp-block cmp-picker" data-open="period"><span class="cmp-block-label">${icon('calendar', { size: 13 })} Période</span><span class="cmp-chips" id="cmp-period-chip"></span></button>
        <button type="button" class="btn btn-primary cmp-run" id="cmp-run">${icon('barChart', { size: 15 })} Comparer</button>
      </div>
      <div class="cmp-panel" id="cmp-panel" hidden></div>
    </div>
    <section class="cmp-results" id="cmp-results"></section>`;

  const panel = container.querySelector('#cmp-panel');
  const refreshSummary = () => {
    const list = entitiesOf(state.type); state.ids = state.ids.filter((id) => list.some((e) => e.id === id));
    const inds = indicatorsFor(state.type); state.keys = state.keys.filter((k) => inds.some((i) => i.key === k));
    container.querySelector('#cmp-ids-count').textContent = `${state.ids.length}/${MAX}`;
    container.querySelector('#cmp-keys-count').textContent = String(state.keys.length);
    container.querySelector('#cmp-ids-chips').innerHTML = state.ids.length ? state.ids.map((id, i) => `<i class="cmp-chip" style="--c:${PALETTE[i % PALETTE.length]}">${esc(list.find((e) => e.id === id)?.name || '')}</i>`).join('') : '<em>Choisir…</em>';
    container.querySelector('#cmp-keys-chips').innerHTML = state.keys.length ? state.keys.map((k) => `<i class="cmp-chip">${esc(indicator(k)?.label || k)}</i>`).join('') : '<em>Choisir…</em>';
    const p = PRESETS.find(([d]) => d && state.from === new Date(Date.now() - d * 86400000).toISOString().slice(0, 10) && state.to === new Date().toISOString().slice(0, 10));
    container.querySelector('#cmp-period-chip').innerHTML = `<i class="cmp-chip">${p ? esc(p[1]) : state.from || state.to ? `${esc(state.from || '…')} → ${esc(state.to || '…')}` : 'Toute la période'}</i>`;
    container.querySelectorAll('.cmp-picker').forEach((b) => b.classList.toggle('is-open', b.dataset.open === state.open));
  };
  const renderPanel = () => {
    panel.hidden = !state.open;
    if (!state.open) { panel.innerHTML = ''; return; }
    if (state.open === 'entities') {
      const list = entitiesOf(state.type);
      panel.innerHTML = `<div class="cmp-panel-head"><label class="ant-search"><input type="search" id="cmp-query" placeholder="Filtrer la liste…" autocomplete="off"></label><button type="button" class="btn btn-secondary btn-sm" id="cmp-top">${icon('target', { size: 13 })} Top 5 automatique</button><button type="button" class="btn btn-ghost btn-sm" id="cmp-clear">Vider</button><span class="text-muted">${state.ids.length} / ${MAX} sélectionnées</span></div>
        <div class="cmp-entities" id="cmp-entities">${list.map((e) => { const on = state.ids.includes(e.id); return `<label class="cmp-entity ${on ? 'is-on' : ''}" data-name="${esc(`${e.name} ${e.sub}`.toLowerCase())}"><input type="checkbox" value="${esc(e.id)}" ${on ? 'checked' : ''} ${!on && state.ids.length >= MAX ? 'disabled' : ''}><span><strong>${esc(e.name)}</strong>${e.sub ? `<small>${esc(e.sub)}</small>` : ''}</span></label>`; }).join('')}</div>`;
      panel.querySelector('#cmp-query').addEventListener('input', (e) => { const q = e.target.value.trim().toLowerCase(); panel.querySelectorAll('.cmp-entity').forEach((el) => { el.hidden = !!q && !el.dataset.name.includes(q); }); });
      panel.querySelector('#cmp-entities').addEventListener('change', (e) => { const id = e.target.value; if (e.target.checked) { if (state.ids.length < MAX) state.ids.push(id); } else state.ids = state.ids.filter((x) => x !== id); save(); refreshSummary(); renderPanel(); });
      panel.querySelector('#cmp-clear').addEventListener('click', () => { state.ids = []; save(); refreshSummary(); renderPanel(); });
      panel.querySelector('#cmp-top').addEventListener('click', () => { const key = ENTITY_TYPES[state.type].onlyControl ? 'scans' : 'dutCrees'; const res = compare(state.type, list.map((e) => e.id), [key], { from: state.from, to: state.to }); state.ids = [...res.rows].sort((a, b) => b.values[key] - a.values[key]).slice(0, 5).map((r) => r.id); state.open = null; save(); refreshSummary(); renderPanel(); run(); });
    } else if (state.open === 'indicators') {
      const inds = indicatorsFor(state.type); const groups = [...new Set(inds.map((i) => i.group))];
      panel.innerHTML = `<div class="cmp-panel-head"><span class="text-muted">Cochez les indicateurs à comparer. Le sens (plus haut ou plus bas = mieux) est indiqué.</span><button type="button" class="btn btn-ghost btn-sm" id="cmp-keys-clear">Tout décocher</button></div>
        <div class="cmp-ind-groups">${groups.map((g) => `<div class="cmp-group"><span class="cmp-group-label">${esc(g)}</span><div class="cmp-group-items">${inds.filter((i) => i.group === g).map((i) => `<label class="cmp-ind ${state.keys.includes(i.key) ? 'is-on' : ''}"><input type="checkbox" value="${esc(i.key)}" ${state.keys.includes(i.key) ? 'checked' : ''}><span>${esc(i.label)}</span><small>${i.unit ? esc(i.unit) + ' · ' : ''}${i.better === 'low' ? '↓ mieux' : '↑ mieux'}</small></label>`).join('')}</div></div>`).join('')}</div>`;
      panel.querySelector('.cmp-ind-groups').addEventListener('change', (e) => { const k = e.target.value; if (e.target.checked) state.keys.push(k); else state.keys = state.keys.filter((x) => x !== k); e.target.closest('.cmp-ind').classList.toggle('is-on', e.target.checked); save(); refreshSummary(); });
      panel.querySelector('#cmp-keys-clear').addEventListener('click', () => { state.keys = []; save(); refreshSummary(); renderPanel(); });
    } else {
      panel.innerHTML = `<div class="cmp-panel-head"><div class="plan-seg">${PRESETS.map(([d, l]) => `<button type="button" class="plan-seg-btn" data-days="${d}">${esc(l)}</button>`).join('')}</div><label class="plan-pill"><span>Du</span><input class="plan-pill-select" type="date" id="cmp-from" value="${esc(state.from)}"></label><label class="plan-pill"><span>Au</span><input class="plan-pill-select" type="date" id="cmp-to" value="${esc(state.to)}"></label></div>`;
      panel.querySelectorAll('[data-days]').forEach((b) => b.addEventListener('click', () => { const d = Number(b.dataset.days); state.to = d ? new Date().toISOString().slice(0, 10) : ''; state.from = d ? new Date(Date.now() - d * 86400000).toISOString().slice(0, 10) : ''; state.open = null; save(); refreshSummary(); renderPanel(); }));
      panel.querySelector('#cmp-from').addEventListener('change', (e) => { state.from = e.target.value; save(); refreshSummary(); });
      panel.querySelector('#cmp-to').addEventListener('change', (e) => { state.to = e.target.value; save(); refreshSummary(); });
    }
  };
  refreshSummary();
  container.querySelectorAll('.cmp-picker').forEach((b) => b.addEventListener('click', () => { state.open = state.open === b.dataset.open ? null : b.dataset.open; refreshSummary(); renderPanel(); }));
  container.querySelector('#cmp-run').addEventListener('click', () => { state.open = null; refreshSummary(); renderPanel(); run(); });
  container.querySelector('#cmp-export').addEventListener('click', () => { if (!last) return; const rows = last.rows.map((r) => ({ entite: r.name, ...Object.fromEntries(last.indicators.map((i) => [i.label, r.values[i.key]])) })); const blob = new Blob([`﻿${toCsv(rows)}`], { type: 'text/csv;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `comparaison-${state.type}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); });

  function run() {
    destroyCharts();
    const results = container.querySelector('#cmp-results');
    if (!state.ids.length || !state.keys.length) { results.innerHTML = `<div class="card cmp-empty">${icon('barChart', { size: 36 })}<h3>${state.ids.length ? 'Choisissez au moins un indicateur' : 'Choisissez les entités à comparer'}</h3><p>Utilisez la barre ci-dessus : type, entités (jusqu’à ${MAX}), indicateurs, période — puis « Comparer ».</p></div>`; return; }
    const period = { from: state.from, to: state.to };
    const res = compare(state.type, state.ids, state.keys, period); last = res;
    const evoKey = state.keys.includes(state.evo) ? state.evo : state.keys[0]; state.evo = evoKey;
    const evo = monthlySeries(state.type, state.ids, evoKey, period);
    const norm = (ind, v, vals) => { const max = Math.max(...vals), min = Math.min(...vals); if (max === min) return 100; return ind.better === 'low' ? Math.round(((max - v) / (max - min)) * 100) : Math.round(((v - min) / (max - min)) * 100); };
    const wins = Object.fromEntries(res.rows.map((r) => [r.id, res.indicators.filter((i) => res.best[i.key] === r.id)]));
    const leader = [...res.rows].sort((a, b) => wins[b.id].length - wins[a.id].length)[0];
    results.innerHTML = `
      <div class="cmp-scores">${res.rows.map((r, idx) => `<div class="card cmp-score ${leader && wins[leader.id].length && leader.id === r.id ? 'is-leader' : ''}" style="--c:${PALETTE[idx % PALETTE.length]}"><div class="cmp-score-head"><i></i><div><strong>${esc(r.name)}</strong>${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</div>${leader && wins[leader.id].length && leader.id === r.id ? `<span class="badge badge-accent">En tête</span>` : ''}</div><div class="cmp-score-body">${res.indicators.slice(0, 4).map((i) => `<div class="${res.best[i.key] === r.id ? 'is-best' : ''}"><span>${esc(i.label)}</span><b>${fmt(r.values[i.key], i.unit)}</b></div>`).join('')}</div><div class="cmp-score-foot">${wins[r.id].length ? `Meilleur sur ${wins[r.id].length} indicateur${wins[r.id].length > 1 ? 's' : ''}` : 'Aucun indicateur en tête'}</div></div>`).join('')}</div>
      <div class="cmp-views"><div class="plan-seg"><button type="button" class="plan-seg-btn" data-view="barres" aria-pressed="${state.view === 'barres'}">${icon('barChart', { size: 14 })} Barres par indicateur</button><button type="button" class="plan-seg-btn" data-view="evolution" aria-pressed="${state.view === 'evolution'}">${icon('clock', { size: 14 })} Évolution</button><button type="button" class="plan-seg-btn" data-view="radar" aria-pressed="${state.view === 'radar'}">${icon('target', { size: 14 })} Radar</button></div>
        <label class="plan-pill cmp-evo ${state.view === 'evolution' ? '' : 'is-hidden'}"><span>Indicateur suivi</span><select class="plan-pill-select" id="cmp-evo">${res.indicators.map((i) => `<option value="${esc(i.key)}" ${i.key === evoKey ? 'selected' : ''}>${esc(i.label)}</option>`).join('')}</select></label></div>
      <div class="cmp-charts ${state.view === 'barres' ? '' : 'is-hidden'}"><div class="cmp-bars">${res.indicators.map((i) => `<div class="chart-card"><div class="chart-head"><div><h3>${esc(i.label)}</h3><p>${i.better === 'low' ? 'Plus bas = mieux' : 'Plus haut = mieux'}${i.unit ? ` · ${esc(i.unit)}` : ''}</p></div>${res.best[i.key] ? `<span class="chart-total"><strong>${esc(res.rows.find((r) => r.id === res.best[i.key])?.name || '')}</strong></span>` : ''}</div><div class="chart-box cmp-box"><canvas id="cmp-c-${esc(i.key)}"></canvas></div></div>`).join('')}</div></div>
      <div class="cmp-charts ${state.view === 'evolution' ? '' : 'is-hidden'}"><div class="chart-card"><div class="chart-head"><div><h3>Évolution · ${esc(indicator(evoKey)?.label || '')}</h3><p>${evoKey === 'scans' ? 'Par jour, 30 derniers jours' : 'Par mois sur la période'} · une courbe par entité</p></div></div><div class="chart-box cmp-box-tall"><canvas id="cmp-evo-chart"></canvas></div></div></div>
      <div class="cmp-charts ${state.view === 'radar' ? '' : 'is-hidden'}"><div class="chart-card"><div class="chart-head"><div><h3>Profil comparé</h3><p>Chaque axe ramené sur 0–100 : 100 = meilleure entité sur l’indicateur, 0 = la moins bonne</p></div></div><div class="chart-box cmp-box-tall"><canvas id="cmp-radar"></canvas></div></div></div>
      <div class="card cmp-table-card"><div class="card-header"><h3>Tableau comparatif</h3><span class="text-muted">${res.rows.length} entités · ${res.indicators.length} indicateurs · meilleure valeur en vert</span></div>
        <div class="table-wrap"><table class="data-table cmp-table"><thead><tr><th>Entité</th>${res.indicators.map((i) => `<th class="num">${esc(i.label)}${i.unit ? ` <small>(${esc(i.unit)})</small>` : ''}</th>`).join('')}<th class="num">Indicateurs en tête</th></tr></thead>
        <tbody>${res.rows.map((r, idx) => `<tr><td><span class="cmp-swatch" style="background:${PALETTE[idx % PALETTE.length]}"></span><strong>${esc(r.name)}</strong>${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</td>${res.indicators.map((i) => `<td class="num ${res.best[i.key] === r.id ? 'is-best' : ''}">${fmt(r.values[i.key], i.unit)}</td>`).join('')}<td class="num"><b>${wins[r.id].length}</b></td></tr>`).join('')}</tbody></table></div></div>`;
    res.indicators.forEach((i) => charts.push(barChart(`cmp-c-${i.key}`, res.rows.map((r) => r.name), res.rows.map((r) => r.values[i.key]), { unit: i.unit, highlight: false, horizontal: true })));
    charts.push(lineChart('cmp-evo-chart', evo.months.map((m) => (m.length === 10 ? m.slice(5) : m)), evo.series.map((s) => ({ label: s.name, values: s.values })), { unit: indicator(evoKey)?.unit || '' }));
    charts.push(radarChart('cmp-radar', res.indicators.map((i) => i.label), res.rows.map((r) => ({ label: r.name, values: res.indicators.map((i) => norm(i, r.values[i.key], res.rows.map((x) => x.values[i.key]))) }))));
    results.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { state.view = b.dataset.view; results.querySelectorAll('[data-view]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); results.querySelectorAll('.cmp-charts').forEach((c, idx) => c.classList.toggle('is-hidden', ['barres', 'evolution', 'radar'][idx] !== state.view)); results.querySelector('.cmp-evo').classList.toggle('is-hidden', state.view !== 'evolution'); charts.forEach((c) => c?.resize?.()); save(); }));
    results.querySelector('#cmp-evo').addEventListener('change', (e) => { state.evo = e.target.value; save(); run(); });
    save();
  }
  run();
}
