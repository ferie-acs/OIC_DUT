// Comparateur (admin OIC) : choisir un type d'entité, les entités, les indicateurs et la période ;
// obtenir graphiques comparatifs, évolution, radar et tableau exportable.
import { icon } from '../core/icons.js';
import { escapeHtml as esc, formatNumber } from '../core/utils.js';
import { barChart, lineChart, radarChart, PALETTE } from '../core/chartjs.js';
import { ENTITY_TYPES, entitiesOf, indicatorsFor, indicator, compare, monthlySeries } from '../services/comparison.service.js';
import { toCsv } from '../services/supervision.service.js';

const MAX = 8;
const fmt = (v, unit) => (v == null ? '—' : `${formatNumber(v, Number.isInteger(v) ? 0 : 1)}${unit ? ` ${unit}` : ''}`);
let charts = [];
const destroyCharts = () => { charts.forEach((c) => c?.destroy()); charts = []; };

export function render(container) {
  destroyCharts();
  const state = { type: 'antennes', ids: [], keys: ['dutCrees', 'dutValides', 'tauxRejet', 'scans'], from: '', to: '', view: 'barres', evo: 'dutCrees', query: '' };
  try { Object.assign(state, JSON.parse(sessionStorage.getItem('dut_compare_state') || '{}')); } catch { /* état par défaut */ }
  if (!ENTITY_TYPES[state.type]) state.type = 'antennes';

  container.innerHTML = `
    <div class="page-header">
      <div><span class="overline">OIC · Supervision</span><h1>Comparateur</h1><div class="subtitle">Comparez des antennes, partenaires, agents ou transporteurs sur n’importe quel indicateur, sur la période de votre choix.</div></div>
      <button type="button" class="btn btn-secondary" id="cmp-export">${icon('download', { size: 15 })} Exporter (CSV)</button>
    </div>
    <div class="page-header-rule"></div>
    <div class="cmp-layout">
      <aside class="card cmp-form">
        <div class="cmp-step"><span class="overline">1 · Type d’entité</span><div class="plan-seg cmp-types">${Object.entries(ENTITY_TYPES).map(([k, t]) => `<button type="button" class="plan-seg-btn" data-type="${k}" aria-pressed="${k === state.type}">${esc(t.label)}</button>`).join('')}</div></div>
        <div class="cmp-step"><span class="overline">2 · Entités à comparer <small id="cmp-count"></small></span>
          <div class="cmp-tools"><label class="ant-search"><input type="search" id="cmp-query" placeholder="Filtrer la liste…" autocomplete="off"></label><button type="button" class="btn btn-ghost btn-sm" id="cmp-top">Top 5</button><button type="button" class="btn btn-ghost btn-sm" id="cmp-clear">Vider</button></div>
          <div class="cmp-entities" id="cmp-entities"></div></div>
        <div class="cmp-step"><span class="overline">3 · Indicateurs</span><div class="cmp-indicators" id="cmp-indicators"></div></div>
        <div class="cmp-step"><span class="overline">4 · Période</span>
          <div class="plan-nav cmp-presets"><button type="button" class="plan-nav-btn" data-days="30">30 j</button><button type="button" class="plan-nav-btn" data-days="90">90 j</button><button type="button" class="plan-nav-btn" data-days="365">12 mois</button><button type="button" class="plan-nav-btn" data-days="0">Tout</button></div>
          <div class="cmp-dates"><label class="plan-pill"><span>Du</span><input class="plan-pill-select" type="date" id="cmp-from" value="${esc(state.from)}"></label><label class="plan-pill"><span>Au</span><input class="plan-pill-select" type="date" id="cmp-to" value="${esc(state.to)}"></label></div></div>
        <button type="button" class="btn btn-primary btn-block" id="cmp-run">${icon('barChart', { size: 15 })} Comparer</button>
      </aside>
      <section class="cmp-results" id="cmp-results"><div class="card cmp-empty">${icon('barChart', { size: 36 })}<h3>Choisissez des entités et des indicateurs</h3><p>Puis cliquez sur « Comparer ». Le tableau, les graphiques par indicateur, l’évolution dans le temps et le radar apparaîtront ici.</p></div></section>
    </div>`;

  const save = () => { try { sessionStorage.setItem('dut_compare_state', JSON.stringify(state)); } catch { /* indisponible */ } };
  const entitiesEl = container.querySelector('#cmp-entities'), indEl = container.querySelector('#cmp-indicators');

  function renderEntities() {
    const list = entitiesOf(state.type); const q = state.query.trim().toLowerCase();
    state.ids = state.ids.filter((id) => list.some((e) => e.id === id));
    container.querySelector('#cmp-count').textContent = `${state.ids.length} / ${MAX}`;
    entitiesEl.innerHTML = list.filter((e) => !q || `${e.name} ${e.sub}`.toLowerCase().includes(q)).map((e) => { const on = state.ids.includes(e.id); return `<label class="cmp-entity ${on ? 'is-on' : ''}"><input type="checkbox" value="${esc(e.id)}" ${on ? 'checked' : ''} ${!on && state.ids.length >= MAX ? 'disabled' : ''}><span><strong>${esc(e.name)}</strong>${e.sub ? `<small>${esc(e.sub)}</small>` : ''}</span></label>`; }).join('') || '<p class="sup-empty">Aucune entité.</p>';
  }
  function renderIndicators() {
    const inds = indicatorsFor(state.type); const allowed = new Set(inds.map((i) => i.key));
    state.keys = state.keys.filter((k) => allowed.has(k)); if (!state.keys.length) state.keys = inds.slice(0, 3).map((i) => i.key);
    const groups = [...new Set(inds.map((i) => i.group))];
    indEl.innerHTML = groups.map((g) => `<div class="cmp-group"><span class="cmp-group-label">${esc(g)}</span>${inds.filter((i) => i.group === g).map((i) => `<label class="cmp-ind ${state.keys.includes(i.key) ? 'is-on' : ''}"><input type="checkbox" value="${esc(i.key)}" ${state.keys.includes(i.key) ? 'checked' : ''}>${esc(i.label)}${i.unit ? ` <small>(${esc(i.unit)})</small>` : ''}</label>`).join('')}</div>`).join('');
  }
  renderEntities(); renderIndicators();

  container.querySelector('.cmp-types').addEventListener('click', (e) => { const b = e.target.closest('[data-type]'); if (!b) return; state.type = b.dataset.type; state.ids = []; container.querySelectorAll('[data-type]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); renderEntities(); renderIndicators(); save(); });
  entitiesEl.addEventListener('change', (e) => { const id = e.target.value; if (e.target.checked) { if (state.ids.length < MAX) state.ids.push(id); } else state.ids = state.ids.filter((x) => x !== id); renderEntities(); save(); });
  indEl.addEventListener('change', (e) => { const k = e.target.value; if (e.target.checked) state.keys.push(k); else state.keys = state.keys.filter((x) => x !== k); renderIndicators(); save(); });
  container.querySelector('#cmp-query').addEventListener('input', (e) => { state.query = e.target.value; renderEntities(); });
  container.querySelector('#cmp-clear').addEventListener('click', () => { state.ids = []; renderEntities(); save(); });
  container.querySelector('#cmp-top').addEventListener('click', () => { const key = ENTITY_TYPES[state.type].onlyControl ? 'scans' : 'dutCrees'; const all = entitiesOf(state.type); const res = compare(state.type, all.map((e) => e.id), [key], { from: state.from, to: state.to }); state.ids = [...res.rows].sort((a, b) => b.values[key] - a.values[key]).slice(0, 5).map((r) => r.id); renderEntities(); save(); run(); });
  container.querySelectorAll('[data-days]').forEach((b) => b.addEventListener('click', () => { const d = Number(b.dataset.days); state.to = d ? new Date().toISOString().slice(0, 10) : ''; state.from = d ? new Date(Date.now() - d * 86400000).toISOString().slice(0, 10) : ''; container.querySelector('#cmp-from').value = state.from; container.querySelector('#cmp-to').value = state.to; save(); }));
  container.querySelector('#cmp-from').addEventListener('change', (e) => { state.from = e.target.value; save(); });
  container.querySelector('#cmp-to').addEventListener('change', (e) => { state.to = e.target.value; save(); });
  container.querySelector('#cmp-run').addEventListener('click', run);
  let last = null;
  container.querySelector('#cmp-export').addEventListener('click', () => { if (!last) return; const rows = last.rows.map((r) => ({ entite: r.name, ...Object.fromEntries(last.indicators.map((i) => [i.label, r.values[i.key]])) })); const blob = new Blob([`﻿${toCsv(rows)}`], { type: 'text/csv;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `comparaison-${state.type}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); });

  function run() {
    destroyCharts();
    const results = container.querySelector('#cmp-results');
    if (!state.ids.length || !state.keys.length) { results.innerHTML = `<div class="card cmp-empty">${icon('alertCircle', { size: 32 })}<h3>Il manque des entités ou des indicateurs</h3><p>Cochez au moins une entité et un indicateur.</p></div>`; return; }
    const period = { from: state.from, to: state.to };
    const res = compare(state.type, state.ids, state.keys, period); last = res;
    const evoKey = state.keys.includes(state.evo) ? state.evo : state.keys[0]; state.evo = evoKey;
    const evo = monthlySeries(state.type, state.ids, evoKey, period);
    const norm = (ind, v, vals) => { const max = Math.max(...vals), min = Math.min(...vals); if (max === min) return 100; return ind.better === 'low' ? Math.round(((max - v) / (max - min)) * 100) : Math.round(((v - min) / (max - min)) * 100); };
    results.innerHTML = `
      <div class="card cmp-table-card"><div class="card-header"><h3>Tableau comparatif</h3><span class="text-muted">${res.rows.length} entités · ${res.indicators.length} indicateurs · meilleure valeur en vert</span></div>
        <div class="table-wrap"><table class="data-table cmp-table"><thead><tr><th>Entité</th>${res.indicators.map((i) => `<th class="num">${esc(i.label)}${i.unit ? ` <small>(${esc(i.unit)})</small>` : ''}</th>`).join('')}</tr></thead>
        <tbody>${res.rows.map((r, idx) => `<tr><td><span class="cmp-swatch" style="background:${PALETTE[idx % PALETTE.length]}"></span><strong>${esc(r.name)}</strong>${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</td>${res.indicators.map((i) => `<td class="num ${res.best[i.key] === r.id ? 'is-best' : ''}">${fmt(r.values[i.key], i.unit)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>
      <div class="cmp-views"><div class="plan-seg"><button type="button" class="plan-seg-btn" data-view="barres" aria-pressed="${state.view === 'barres'}">Barres par indicateur</button><button type="button" class="plan-seg-btn" data-view="evolution" aria-pressed="${state.view === 'evolution'}">Évolution</button><button type="button" class="plan-seg-btn" data-view="radar" aria-pressed="${state.view === 'radar'}">Radar</button></div>
        <label class="plan-pill cmp-evo ${state.view === 'evolution' ? '' : 'is-hidden'}"><span>Indicateur à suivre</span><select class="plan-pill-select" id="cmp-evo">${res.indicators.map((i) => `<option value="${esc(i.key)}" ${i.key === evoKey ? 'selected' : ''}>${esc(i.label)}</option>`).join('')}</select></label></div>
      <div class="cmp-charts ${state.view === 'barres' ? '' : 'is-hidden'}"><div class="dash-grid charts-grid">${res.indicators.map((i) => `<div class="chart-card"><div class="chart-head"><div><h3>${esc(i.label)}</h3><p>${i.better === 'low' ? 'Plus bas = mieux' : 'Plus haut = mieux'}${i.unit ? ` · ${esc(i.unit)}` : ''}</p></div></div><div class="chart-box"><canvas id="cmp-c-${esc(i.key)}"></canvas></div></div>`).join('')}</div></div>
      <div class="cmp-charts ${state.view === 'evolution' ? '' : 'is-hidden'}"><div class="chart-card cmp-wide"><div class="chart-head"><div><h3>Évolution · ${esc(indicator(evoKey)?.label || '')}</h3><p>${evoKey === 'scans' ? 'Par jour, 30 derniers jours' : 'Par mois sur la période'}</p></div></div><div class="chart-box cmp-box-tall"><canvas id="cmp-evo-chart"></canvas></div></div></div>
      <div class="cmp-charts ${state.view === 'radar' ? '' : 'is-hidden'}"><div class="chart-card cmp-wide"><div class="chart-head"><div><h3>Profil comparé</h3><p>Chaque axe ramené sur 0–100 : 100 = meilleure entité sur l’indicateur, 0 = la moins bonne</p></div></div><div class="chart-box cmp-box-tall"><canvas id="cmp-radar"></canvas></div></div></div>`;
    res.indicators.forEach((i) => charts.push(barChart(`cmp-c-${i.key}`, res.rows.map((r) => r.name), res.rows.map((r) => r.values[i.key]), { unit: i.unit, highlight: false })));
    charts.push(lineChart('cmp-evo-chart', evo.months.map((m) => (m.length === 10 ? m.slice(5) : m)), evo.series.map((s) => ({ label: s.name, values: s.values })), { unit: indicator(evoKey)?.unit || '' }));
    charts.push(radarChart('cmp-radar', res.indicators.map((i) => i.label), res.rows.map((r) => ({ label: r.name, values: res.indicators.map((i) => norm(i, r.values[i.key], res.rows.map((x) => x.values[i.key]))) }))));
    results.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { state.view = b.dataset.view; results.querySelectorAll('[data-view]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); results.querySelectorAll('.cmp-charts').forEach((c, idx) => c.classList.toggle('is-hidden', ['barres', 'evolution', 'radar'][idx] !== state.view)); results.querySelector('.cmp-evo').classList.toggle('is-hidden', state.view !== 'evolution'); charts.forEach((c) => c?.resize?.()); save(); }));
    results.querySelector('#cmp-evo').addEventListener('change', (e) => { state.evo = e.target.value; save(); run(); });
    save();
  }
  if (state.ids.length) run();
}
