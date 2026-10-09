// Graphiques Chart.js de la charte : barres classées en dégradé bleu logo (la plus forte en orange),
// courbes, anneaux. Rend null si Chart.js n'est pas chargé. Chaque fonction rend l'instance à détruire.
import { formatNumber } from './utils.js';

const FONT = { family: 'Instrument Sans', size: 11.5, weight: '500' };
const TOOLTIP = { backgroundColor: '#0B3D6F', titleColor: '#BBD3EC', bodyColor: '#fff', padding: 10, cornerRadius: 8, displayColors: false, titleFont: { family: 'Instrument Sans', size: 11, weight: '600' }, bodyFont: { family: 'Instrument Sans', size: 12.5, weight: '600' } };
export const PALETTE = ['#0E56A4', '#F17D0C', '#0C8B41', '#3B7FC4', '#F59E0B', '#E11D2E', '#6FA0CE', '#0B3D6F'];
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const anim = () => (reduced() ? false : { duration: 700, easing: 'easeOutQuart' });
const fmt = (v, unit) => `${formatNumber(v, Number.isInteger(v) ? 0 : 1)}${unit ? ` ${unit}` : ''}`;

function gradient(horizontal, maxIndex, highlight) {
  return (c) => {
    const { chart, dataIndex } = c; const area = chart.chartArea; if (!area) return '#0E56A4';
    if (highlight && dataIndex === maxIndex) return '#F17D0C';
    const g = horizontal ? chart.ctx.createLinearGradient(area.left, 0, area.right, 0) : chart.ctx.createLinearGradient(0, area.bottom, 0, area.top);
    g.addColorStop(0, '#0E56A4'); g.addColorStop(1, '#5B95D6'); return g;
  };
}

export function barChart(canvas, labels, values, { horizontal = false, unit = '', top = 0, highlight = true, stacked = null } = {}) {
  const ctx = typeof canvas === 'string' ? document.getElementById(canvas) : canvas;
  if (!ctx || !window.Chart) return null;
  let pairs = labels.map((l, i) => [l, Number(values[i]) || 0]);
  if (top) pairs = pairs.sort((a, b) => b[1] - a[1]).slice(0, top);
  const data = pairs.map((p) => p[1]); const names = pairs.map((p) => String(p[0]));
  const maxIndex = data.indexOf(Math.max(...data));
  const crowded = !horizontal && names.length > 4;
  const valueAxis = { beginAtZero: true, grid: { color: '#EEF1F6', drawTicks: false }, border: { display: false, dash: [4, 4] }, ticks: { font: FONT, color: '#7A8AA0', precision: 0, maxTicksLimit: 5, padding: 6, callback: (v) => (unit ? `${v} ${unit}` : v) } };
  const labelAxis = { grid: { display: false }, border: { display: false }, ticks: { font: FONT, color: '#52657C', autoSkip: false, maxRotation: crowded ? 38 : 0, minRotation: crowded ? 38 : 0, callback(v) { const l = this.getLabelForValue(v); return l.length > 14 ? `${l.slice(0, 13)}…` : l; } } };
  const datasets = stacked
    ? stacked.map((s, i) => ({ label: s.label, data: names.map((n) => Number(s.values[labels.indexOf(n)]) || 0), backgroundColor: s.color || PALETTE[i], borderRadius: 6, borderSkipped: false, maxBarThickness: 30 }))
    : [{ data, backgroundColor: gradient(horizontal, maxIndex, highlight), hoverBackgroundColor: '#0B3D6F', borderRadius: horizontal ? { topRight: 8, bottomRight: 8 } : { topLeft: 8, topRight: 8 }, borderSkipped: false, barPercentage: 0.62, categoryPercentage: 0.7, maxBarThickness: 34 }];
  return new window.Chart(ctx, {
    type: 'bar', data: { labels: names, datasets },
    options: { indexAxis: horizontal ? 'y' : 'x', maintainAspectRatio: false, responsive: true, animation: anim(), layout: { padding: { top: 6, right: horizontal ? 18 : 6 } },
      plugins: { legend: { display: !!stacked, position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle', font: FONT, color: '#52657C' } }, tooltip: { ...TOOLTIP, callbacks: { label: (c) => `${stacked ? `${c.dataset.label} : ` : ''}${fmt(c.parsed[horizontal ? 'x' : 'y'], unit)}` } } },
      scales: horizontal ? { x: { ...valueAxis, stacked: !!stacked }, y: { ...labelAxis, stacked: !!stacked } } : { x: { ...labelAxis, stacked: !!stacked }, y: { ...valueAxis, stacked: !!stacked } } },
  });
}

export function lineChart(canvas, labels, series, { unit = '' } = {}) {
  const ctx = typeof canvas === 'string' ? document.getElementById(canvas) : canvas;
  if (!ctx || !window.Chart) return null;
  const list = Array.isArray(series[0]?.values) ? series : [{ label: '', values: series }];
  return new window.Chart(ctx, {
    type: 'line',
    data: { labels, datasets: list.map((s, i) => ({ label: s.label, data: s.values, borderColor: s.color || PALETTE[i], backgroundColor: `${s.color || PALETTE[i]}1A`, fill: list.length === 1, tension: 0.35, borderWidth: 2.2, pointRadius: 3, pointHoverRadius: 6, pointBackgroundColor: '#fff', pointBorderColor: s.color || PALETTE[i] })) },
    options: { maintainAspectRatio: false, responsive: true, animation: anim(), plugins: { legend: { display: list.length > 1, position: 'bottom', labels: { boxWidth: 10, usePointStyle: true, pointStyle: 'circle', font: FONT, color: '#52657C' } }, tooltip: { ...TOOLTIP, callbacks: { label: (c) => `${c.dataset.label ? `${c.dataset.label} : ` : ''}${fmt(c.parsed.y, unit)}` } } },
      scales: { x: { grid: { display: false }, border: { display: false }, ticks: { font: FONT, color: '#52657C', maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } }, y: { beginAtZero: true, grid: { color: '#EEF1F6', drawTicks: false }, border: { display: false, dash: [4, 4] }, ticks: { font: FONT, color: '#7A8AA0', precision: 0, maxTicksLimit: 5 } } } },
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
