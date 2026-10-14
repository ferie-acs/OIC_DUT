// Lot d5 : suivi et comparaison des antennes (Direction générale) — indicateurs par période, classement,
// points d'attention, comparateur existant et rapport périodique (CSV, PDF).
import { antennaPerformance, periodicReport, reportCsv, logReportExport, periodPreset, attentionPoints, RANKABLE } from '../services/pilotage.service.js';
import { attainmentByAntenna } from '../services/objectives.service.js';
import { indicator } from '../services/comparison.service.js';
import { buildReportPdf } from '../services/direction-report.service.js';
import { mountComparator } from './comparator.component.js';
import { esc, icon, num, pct, kpi, kpis, pageHeader, options, allowed, downloadText, toast, formatDate } from './direction-ui.js';

const PRESETS = [['mois', 'Ce mois'], ['mois-precedent', 'Mois précédent'], ['trimestre', 'Ce trimestre'], ['annee', 'Cette année'], ['30j', '30 j'], ['90j', '90 j']];
const STATE_KEY = 'dut_direction_antennas';
const hours = (h) => (h == null || h === 0 ? '—' : h < 48 ? `${num(h, 1)} h` : `${num(h / 24, 1)} j`);
const evolution = (v, better = 'high') => { if (!v) return '<small title="Par rapport à la période précédente">stable</small>'; const good = better === 'low' ? v < 0 : v > 0; return `<small class="${good ? '' : 'sup-neg'}" title="Par rapport à la période précédente">${v > 0 ? '+' : ''}${num(v)} vs préc.</small>`; };

export function render(container) {
  const state = { preset: '90j', from: '', to: '', rankBy: 'dutValides', showInactive: false, query: '' };
  try { Object.assign(state, JSON.parse(sessionStorage.getItem(STATE_KEY) || '{}')); } catch { /* valeurs par défaut */ }
  if (!state.from || !state.to) Object.assign(state, periodPreset(state.preset));
  const canReport = allowed('pilotage.report');

  container.innerHTML = `
    ${pageHeader({ overline: 'Direction générale · Pilotage', title: 'Suivi des antennes', subtitle: 'Indicateurs de chaque antenne sur la période choisie, comparés à la période précédente, et classement du réseau. Les chiffres sont calculés à partir des DUT enregistrés.',
      actions: canReport ? `<button type="button" class="btn btn-secondary" id="da-csv">${icon('download', { size: 15 })} Rapport (CSV)</button><button type="button" class="btn btn-primary" id="da-pdf">${icon('file', { size: 15 })} Rapport périodique (PDF)</button>` : '' })}
    <div class="st-filters">
      <label class="plan-pill is-set"><span>${icon('calendar', { size: 13 })} Du</span><input class="plan-pill-select" type="date" id="da-from" value="${esc(state.from)}"></label>
      <label class="plan-pill is-set"><span>${icon('calendar', { size: 13 })} Au</span><input class="plan-pill-select" type="date" id="da-to" value="${esc(state.to)}"></label>
      <div class="plan-nav st-presets">${PRESETS.map(([k, l]) => `<button type="button" class="plan-nav-btn" data-preset="${k}" aria-pressed="${state.preset === k}">${esc(l)}</button>`).join('')}</div>
      <label class="plan-pill is-set"><span>Classer par</span><select class="plan-pill-select" id="da-rank">${options(RANKABLE.map((k) => [k, indicator(k).label]), state.rankBy)}</select></label>
    </div>
    <div class="st-alerts" id="da-attention"></div>
    <p class="st-period" id="da-period"></p>
    <div id="da-kpis"></div>
    <div id="da-table"></div>
    <section class="sup-compare" id="da-compare"></section>`;

  let perf = null;
  const save = () => { try { sessionStorage.setItem(STATE_KEY, JSON.stringify({ ...state, query: '' })); } catch { /* indisponible */ } };

  const drawTable = () => {
    const att = new Map(attainmentByAntenna().map((a) => [a.antennaId, a]));
    const q = state.query.trim().toLowerCase();
    const rows = perf.rows.filter((r) => (state.showInactive || r.actif) && (!q || `${r.name} ${r.sub}`.toLowerCase().includes(q)));
    const max = Object.fromEntries(['dutCrees', 'dutValides', 'scans'].map((k) => [k, Math.max(1, ...perf.rows.map((r) => r.values[k]))]));
    const bar = (r, k) => `<div class="sup-cell"><b>${num(r.values[k])}</b><i style="width:${Math.round((r.values[k] / max[k]) * 100)}%"></i></div>`;
    const inactive = perf.rows.length - perf.actives;
    container.querySelector('#da-table').innerHTML = `<section class="card sup-table-card">
      <div class="sup-table-head"><div><h2>Classement des antennes</h2><p>Trié par « ${esc(indicator(perf.rankBy).label)} » (${indicator(perf.rankBy).better === 'low' ? 'le plus bas en tête' : 'le plus haut en tête'}) · ${perf.actives} antenne(s) active(s) sur ${perf.rows.length}.</p></div>
        <div class="sup-table-tools"><label class="search-input ant-search">${icon('search', { size: 16 })}<input type="search" id="da-query" placeholder="Rechercher une antenne…" autocomplete="off" value="${esc(state.query)}"></label>
        ${inactive ? `<button type="button" class="btn btn-ghost btn-sm" id="da-inactive">${state.showInactive ? 'Masquer' : 'Afficher'} les ${inactive} sans activité</button>` : ''}</div></div>
      <div class="table-wrap"><table class="data-table sup-table"><thead><tr><th class="num">#</th><th>Antenne</th><th class="num">DUT édités</th><th class="num">Validés</th><th class="num">Rejetés</th><th class="num">Taux de rejet</th><th class="num">Délai de validation</th><th class="num">Contrôles</th><th class="num">Objectifs</th></tr></thead>
      <tbody>${rows.length ? rows.map((r) => { const a = att.get(r.id); return `<tr>
        <td class="num"><span class="sup-rank ${r.rang <= 3 && r.actif ? 'is-top' : ''}">${r.rang}</span></td>
        <td><strong>${esc(r.name)}</strong><small>${esc(r.sub || '')}${r.actif ? '' : ' · aucune activité'}</small></td>
        <td class="num">${bar(r, 'dutCrees')}</td>
        <td class="num">${bar(r, 'dutValides')}${r.actif || r.evolution.dutValides ? evolution(r.evolution.dutValides) : ''}</td>
        <td class="num">${r.values.dutRejetes ? `<span class="sup-neg">${num(r.values.dutRejetes)}</span>` : '0'}</td>
        <td class="num">${r.actif ? pct(r.values.tauxRejet) : '—'}</td>
        <td class="num">${hours(r.values.delaiValidationH)}${r.actif && r.values.delaiValidationH ? `<small>${pct(r.values.validesSous24h)} sous 24 h</small>` : ''}</td>
        <td class="num">${bar(r, 'scans')}</td>
        <td class="num">${a ? `<b>${pct(a.taux)}</b><small>${a.atteints} / ${a.objectifs} atteint(s)</small>` : '<small>—</small>'}</td></tr>`; }).join('') : '<tr><td class="table-empty" colspan="9">Aucune antenne ne correspond.</td></tr>'}</tbody></table></div></section>`;
    container.querySelector('#da-query').addEventListener('input', (e) => { state.query = e.target.value; const pos = e.target.selectionStart; drawTable(); const input = container.querySelector('#da-query'); input.focus(); input.setSelectionRange(pos, pos); });
    container.querySelector('#da-inactive')?.addEventListener('click', () => { state.showInactive = !state.showInactive; save(); drawTable(); });
  };

  const draw = () => {
    try { perf = antennaPerformance({ from: state.from, to: state.to }, { rankBy: state.rankBy }); }
    catch (err) { toast({ type: 'error', title: err.message }); return; }
    save();
    container.querySelectorAll('[data-preset]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === state.preset)));
    const n = perf.national, prev = perf.rows.reduce((acc, r) => { Object.entries(r.previous).forEach(([k, v]) => { acc[k] = (acc[k] || 0) + (v || 0); }); return acc; }, {});
    container.querySelector('#da-period').innerHTML = `Période : <strong>${formatDate(perf.period.from)}</strong> → <strong>${formatDate(perf.period.to)}</strong> · comparée au <strong>${formatDate(perf.previousPeriod.from)}</strong> → <strong>${formatDate(perf.previousPeriod.to)}</strong>`;
    container.querySelector('#da-kpis').innerHTML = kpis([
      kpi('DUT édités', num(n.dutCrees), evolutionText(n.dutCrees - (prev.dutCrees || 0))),
      kpi('DUT validés', num(n.dutValides), evolutionText(n.dutValides - (prev.dutValides || 0)), 'green'),
      kpi('DUT rejetés', num(n.dutRejetes), `taux de rejet ${pct(n.tauxRejet)}`, 'rose'),
      kpi('Délai de validation', hours(n.delaiValidationH), `médiane · ${pct(n.validesSous24h)} sous 24 h`, 'amber'),
      kpi('Contrôles', num(n.scans), 'DUT du réseau contrôlés', 'teal'),
      kpi('Antennes actives', `${num(perf.actives)} / ${num(perf.rows.length)}`, 'au moins un DUT sur la période', 'blue'),
    ]);
    const p = attentionPoints();
    const chip = (count, label, href, level) => (count ? `<a class="st-alert is-${level}" href="#${href}">${icon(level === 'error' ? 'alertTriangle' : level === 'warning' ? 'alertCircle' : 'info', { size: 14 })} ${count} ${esc(label)}</a>` : '');
    const chips = [chip(p.contratsAValider, 'contrat(s) d’objectifs à valider', '/direction/objectifs', 'info'), chip(p.actionsEnRetard, 'action(s) corrective(s) en retard', '/direction/actions', 'error'),
      chip(p.documentsAValider, 'document(s) à valider', '/direction/documents', 'info'), chip(p.decisionsEnRetard, 'décision(s) de réunion en retard', '/direction/reunions', 'warning'),
      chip(p.contratsEcheance, 'contrat(s) à échéance', '/direction/contrats', 'warning'), chip(p.contratsEnCircuit, 'contrat(s) en circuit de validation', '/direction/contrats', 'info')].join('');
    container.querySelector('#da-attention').innerHTML = chips || `<span class="st-alert is-ok">${icon('checkCircle', { size: 14 })} Aucun point d’attention</span>`;
    drawTable();
  };
  const evolutionText = (d) => (d ? `${d > 0 ? '+' : ''}${num(d)} vs période précédente` : 'stable vs période précédente');

  container.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
    Object.assign(state, periodPreset(b.dataset.preset), { preset: b.dataset.preset });
    container.querySelector('#da-from').value = state.from; container.querySelector('#da-to').value = state.to; draw();
  }));
  const bindDate = (id, key) => container.querySelector(id).addEventListener('change', (e) => { if (!e.target.value) return; state[key] = e.target.value; state.preset = ''; draw(); });
  bindDate('#da-from', 'from'); bindDate('#da-to', 'to');
  container.querySelector('#da-rank').addEventListener('change', (e) => { state.rankBy = e.target.value; draw(); });

  const report = () => periodicReport({ from: state.from, to: state.to }, { rankBy: state.rankBy, label: state.preset ? periodPreset(state.preset).label : `du ${formatDate(state.from)} au ${formatDate(state.to)}` });
  container.querySelector('#da-csv')?.addEventListener('click', () => {
    try { const r = report(); downloadText(`rapport-antennes-${r.period.from}-${r.period.to}.csv`, reportCsv(r)); logReportExport(r, 'CSV'); toast({ type: 'success', title: 'Rapport exporté (CSV)' }); }
    catch (err) { toast({ type: 'error', title: err.message }); }
  });
  container.querySelector('#da-pdf')?.addEventListener('click', () => {
    try {
      if (!window.jspdf?.jsPDF) throw new Error('Le module PDF n’est pas chargé. Rechargez la page.');
      const r = report(); buildReportPdf(window.jspdf.jsPDF, r).save(`rapport-antennes-${r.period.from}-${r.period.to}.pdf`); logReportExport(r, 'PDF');
      toast({ type: 'success', title: 'Rapport périodique généré (PDF)' });
    } catch (err) { toast({ type: 'error', title: err.message }); }
  });

  draw();
  const top = perf ? perf.rows.filter((r) => r.actif).slice(0, 5).map((r) => r.id) : [];
  mountComparator(container.querySelector('#da-compare'), 'antennes', { ids: top });
}
