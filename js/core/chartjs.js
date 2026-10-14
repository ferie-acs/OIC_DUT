// Graphiques Chart.js de la charte : barres classées en dégradé bleu logo (la plus forte en orange),
// courbes, anneaux. Rend null si Chart.js n'est pas chargé. Chaque fonction rend l'instance à détruire.
import { formatNumber } from './utils.js';

const FONT = { family: "'Instrument Sans', sans-serif", size: 11.5, weight: '500' };
const TOOLTIP = { backgroundColor: '#0B3D6F', titleColor: '#BBD3EC', bodyColor: '#fff', padding: 10, cornerRadius: 8, displayColors: false, titleFont: { family: FONT.family, size: 11, weight: '600' }, bodyFont: { family: FONT.family, size: 12.5, weight: '600' } };
export const PALETTE = ['#0E56A4', '#F17D0C', '#0C8B41', '#3B7FC4', '#F59E0B', '#E11D2E', '#6FA0CE', '#0B3D6F'];
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const anim = () => (reduced() ? false : { duration: 700, easing: 'easeOutQuart' });
const fmt = (v, unit) => `${formatNumber(v, Number.isInteger(v) ? 0 : 1)}${unit ? ` ${unit}` : ''}`;
// Graduations au format français (espace des milliers) ; au-delà du million, valeur abrégée (« 1,5 M F »).
const tick = (v, unit) => (Math.abs(v) >= 1e6 ? `${formatNumber(v / 1e6, 1)} M${unit ? ` ${unit}` : ''}` : fmt(Number(v), unit));

/** Couleur d'une variable de la charte (ex. « --success ») : les graphiques n'utilisent que les couleurs déclarées. */
export function cssColor(name) {
  try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || PALETTE[0]; } catch { return PALETTE[0]; }
}

// Repère vertical (barres horizontales) ou horizontal (colonnes) : la cible d'un indicateur.
const targetLine = (target, horizontal) => ({
  id: 'oicTarget',
  afterDatasetsDraw(chart) {
    const scale = chart.scales[horizontal ? 'x' : 'y']; const area = chart.chartArea; if (!scale || !area) return;
    const pos = scale.getPixelForValue(target.value); const c = chart.ctx;
    c.save(); c.strokeStyle = PALETTE[7]; c.lineWidth = 2; c.beginPath();
    if (horizontal) { c.moveTo(pos, area.top - 4); c.lineTo(pos, area.bottom); } else { c.moveTo(area.left, pos); c.lineTo(area.right, pos); }
    c.stroke();
    if (target.label) { c.fillStyle = PALETTE[7]; c.font = `600 11px ${FONT.family}`; c.textAlign = horizontal ? 'right' : 'left'; c.textBaseline = 'bottom'; c.fillText(target.label, horizontal ? pos - 4 : area.left + 4, horizontal ? area.top - 2 : pos - 4); }
    c.restore();
  },
});

// Valeur écrite au bout de chaque barre (série unique) : lisible sans survol, notamment sur mobile.
const valueLabels = (unit, horizontal) => ({
  id: 'oicValues',
  afterDatasetsDraw(chart) {
    const c = chart.ctx; c.save(); c.fillStyle = '#52657C'; c.font = `600 11.5px ${FONT.family}`;
    chart.data.datasets.forEach((ds, di) => chart.getDatasetMeta(di).data.forEach((bar, i) => {
      const v = Number(ds.data[i]); if (!Number.isFinite(v)) return;
      const text = fmt(v, unit);
      if (horizontal) { c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(text, bar.x + 6, bar.y); } else { c.textAlign = 'center'; c.textBaseline = 'bottom'; c.fillText(text, bar.x, bar.y - 4); }
    }));
    c.restore();
  },
});

function gradient(horizontal, maxIndex, highlight) {
  return (c) => {
    const { chart, dataIndex } = c; const area = chart.chartArea; if (!area) return '#0E56A4';
    if (highlight && dataIndex === maxIndex) return '#F17D0C';
    const g = horizontal ? chart.ctx.createLinearGradient(area.left, 0, area.right, 0) : chart.ctx.createLinearGradient(0, area.bottom, 0, area.top);
    g.addColorStop(0, '#0E56A4'); g.addColorStop(1, '#5B95D6'); return g;
  };
}

/**
 * Barres. Options ajoutées pour la Direction générale (sans effet sur les écrans existants) : `colors` (une couleur
 * par barre), `grouped` (séries côte à côte au lieu d'empilées), `target` ({ value, label } : repère de cible),
 * `max` (borne de l'axe des valeurs), `values` (valeur écrite au bout des barres), `titles` (titres des info-bulles),
 * `rotate` (forcer ou non l'inclinaison des libellés de l'axe), `labelMax` (longueur des libellés avant coupure).
 */
export function barChart(canvas, labels, values, { horizontal = false, unit = '', top = 0, highlight = true, stacked = null, colors = null, grouped = false, target = null, max = null, values: showValues = false, titles = null, rotate = null, labelMax = 14 } = {}) {
  const ctx = typeof canvas === 'string' ? document.getElementById(canvas) : canvas;
  if (!ctx || !window.Chart) return null;
  let pairs = labels.map((l, i) => [l, Number(values[i]) || 0]);
  if (top) pairs = pairs.sort((a, b) => b[1] - a[1]).slice(0, top);
  const data = pairs.map((p) => p[1]); const names = pairs.map((p) => String(p[0]));
  const maxIndex = data.indexOf(Math.max(...data));
  const crowded = rotate ?? (!horizontal && names.length > 4);
  const valueAxis = { beginAtZero: true, ...(max != null ? { max } : {}), grid: { color: '#EEF1F6', drawTicks: false }, border: { display: false, dash: [4, 4] }, ticks: { font: FONT, color: '#7A8AA0', precision: 0, maxTicksLimit: 5, padding: 6, callback: (v) => tick(v, unit) } };
  const stack = !!stacked && !grouped;
  const labelAxis = { grid: { display: false }, border: { display: false }, ticks: { font: FONT, color: '#52657C', autoSkip: false, maxRotation: crowded ? 38 : 0, minRotation: crowded ? 38 : 0, callback(v) { const l = this.getLabelForValue(v); return l.length > labelMax ? `${l.slice(0, labelMax - 1)}…` : l; } } };
  const datasets = stacked
    ? stacked.map((s, i) => ({ label: s.label, data: names.map((n) => Number(s.values[labels.indexOf(n)]) || 0), backgroundColor: s.color || PALETTE[i], borderRadius: grouped ? (horizontal ? { topRight: 4, bottomRight: 4 } : { topLeft: 4, topRight: 4 }) : 6, borderSkipped: false, maxBarThickness: grouped ? 22 : 30, ...(grouped ? { barPercentage: 0.9, categoryPercentage: 0.7 } : {}) }))
    : [{ data, backgroundColor: colors ? names.map((n) => colors[labels.indexOf(n)] || PALETTE[0]) : gradient(horizontal, maxIndex, highlight), hoverBackgroundColor: colors ? undefined : '#0B3D6F', borderRadius: horizontal ? { topRight: 8, bottomRight: 8 } : { topLeft: 8, topRight: 8 }, borderSkipped: false, barPercentage: 0.62, categoryPercentage: 0.7, maxBarThickness: 34 }];
  const plugins = [...(target ? [targetLine(target, horizontal)] : []), ...(showValues && !stacked ? [valueLabels(unit, horizontal)] : [])];
  const pad = showValues && !stacked ? (horizontal ? 52 : 6) : (horizontal ? 18 : 6);
  return new window.Chart(ctx, {
    type: 'bar', data: { labels: names, datasets }, plugins,
    options: { indexAxis: horizontal ? 'y' : 'x', maintainAspectRatio: false, responsive: true, animation: anim(), layout: { padding: { top: target && horizontal ? 18 : showValues && !horizontal ? 20 : 6, right: pad } },
      plugins: { legend: { display: !!stacked, position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle', font: FONT, color: '#52657C' } }, tooltip: { ...TOOLTIP, callbacks: { ...(titles ? { title: (items) => titles[labels.indexOf(names[items[0].dataIndex])] ?? names[items[0].dataIndex] } : {}), label: (c) => `${stacked ? `${c.dataset.label} : ` : ''}${fmt(c.parsed[horizontal ? 'x' : 'y'], unit)}` } } },
      scales: horizontal ? { x: { ...valueAxis, stacked: stack }, y: { ...labelAxis, stacked: stack } } : { x: { ...labelAxis, stacked: stack }, y: { ...valueAxis, stacked: stack } } },
  });
}

/** Courbes ; `titles` : titres des info-bulles (ex. « mai 2026 » quand l'axe affiche « mai »). Les valeurs nulles ne sont pas tracées. */
export function lineChart(canvas, labels, series, { unit = '', titles = null } = {}) {
  const ctx = typeof canvas === 'string' ? document.getElementById(canvas) : canvas;
  if (!ctx || !window.Chart) return null;
  const list = Array.isArray(series[0]?.values) ? series : [{ label: '', values: series }];
  return new window.Chart(ctx, {
    type: 'line',
    data: { labels, datasets: list.map((s, i) => ({ label: s.label, data: s.values, borderColor: s.color || PALETTE[i], backgroundColor: `${s.color || PALETTE[i]}1A`, fill: list.length === 1, tension: 0.35, borderWidth: 2.2, pointRadius: 3, pointHoverRadius: 6, pointBackgroundColor: '#fff', pointBorderColor: s.color || PALETTE[i], pointStyle: s.pointStyle || 'circle', spanGaps: false })) },
    options: { maintainAspectRatio: false, responsive: true, animation: anim(), plugins: { legend: { display: list.length > 1, position: 'bottom', labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, font: FONT, color: '#52657C' } }, tooltip: { ...TOOLTIP, ...(list.length > 1 ? { mode: 'index', intersect: false } : {}), callbacks: { ...(titles ? { title: (items) => titles[items[0].dataIndex] ?? labels[items[0].dataIndex] } : {}), label: (c) => `${c.dataset.label ? `${c.dataset.label} : ` : ''}${fmt(c.parsed.y, unit)}` } } },
      scales: { x: { grid: { display: false }, border: { display: false }, ticks: { font: FONT, color: '#52657C', maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } }, y: { beginAtZero: true, grid: { color: '#EEF1F6', drawTicks: false }, border: { display: false, dash: [4, 4] }, ticks: { font: FONT, color: '#7A8AA0', precision: 0, maxTicksLimit: 5, callback: (v) => tick(v, unit) } } } },
  });
}

export function doughnutChart(canvas, labels, values, { unit = '' } = {}) {
  const ctx = typeof canvas === 'string' ? document.getElementById(canvas) : canvas;
  if (!ctx || !window.Chart) return null;
  const total = values.reduce((a, b) => a + (Number(b) || 0), 0) || 1;
  return new window.Chart(ctx, {
    type: 'doughnut', data: { labels, datasets: [{ data: values, backgroundColor: labels.map((_, i) => PALETTE[i % PALETTE.length]), borderColor: '#fff', borderWidth: 3, hoverOffset: 6 }] },
    options: { maintainAspectRatio: false, responsive: true, cutout: '68%', animation: anim(), layout: { padding: 4 }, plugins: { legend: { position: 'right', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle', padding: 10, font: FONT, color: '#52657C' } }, tooltip: { ...TOOLTIP, callbacks: { label: (c) => `${fmt(c.parsed, unit)} · ${Math.round((c.parsed / total) * 100)} %` } } } },
  });
}

/** Radar : chaque axe est un indicateur ramené sur 0–100 (100 = meilleure entité), une surface par entité. */
export function radarChart(canvas, axes, series) {
  const ctx = typeof canvas === 'string' ? document.getElementById(canvas) : canvas;
  if (!ctx || !window.Chart) return null;
  return new window.Chart(ctx, {
    type: 'radar',
    data: { labels: axes, datasets: series.map((s, i) => ({ label: s.label, data: s.values, borderColor: PALETTE[i % PALETTE.length], backgroundColor: `${PALETTE[i % PALETTE.length]}26`, borderWidth: 2, pointRadius: 3, pointBackgroundColor: PALETTE[i % PALETTE.length] })) },
    options: { maintainAspectRatio: false, responsive: true, animation: anim(), plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, usePointStyle: true, pointStyle: 'circle', font: FONT, color: '#52657C' } }, tooltip: { ...TOOLTIP, callbacks: { label: (c) => `${c.dataset.label} : ${Math.round(c.parsed.r)} / 100` } } }, scales: { r: { min: 0, max: 100, ticks: { display: false, stepSize: 25 }, grid: { color: '#E6EAF1' }, angleLines: { color: '#E6EAF1' }, pointLabels: { font: FONT, color: '#52657C' } } } },
  });
}
