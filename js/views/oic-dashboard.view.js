import { icon } from '../core/icons.js';
import { escapeHtml, formatDateTime, formatNumber } from '../core/utils.js';
import * as dashboardService from '../services/dashboard.service.js';
import { animateCountUps, staggerIn } from '../core/motion.js?v=oic-blue';

const PALETTE = ['#0E56A4', '#F17D0C', '#0C8B41', '#3B7FC4', '#F59E0B', '#E11D2E', '#6FA0CE', '#0B3D6F'];
const charts = [];

function paletteShades(count) {
  const shades = [];
  for (let i = 0; i < count; i += 1) shades.push(PALETTE[i % PALETTE.length]);
  return shades;
}

export function render(container) {
  charts.forEach((c) => c.destroy());
  charts.length = 0;

  const s = dashboardService.oicStats();

  container.innerHTML = `
    <div class="page-header">
      <div>
        <span class="overline">OIC · Dashboard national</span>
        <h1>Vision nationale</h1>
        <div class="subtitle">Vision consolidée du transport routier de marchandises en Côte d’Ivoire.</div>
      </div>
    </div>
    <div class="page-header-rule"></div>

    <div class="kpi-grid">
      ${kpi('Dossiers DUT', s.emis, 'file', 'blue')}
      ${kpi('DUT validés', s.valides, 'checkCircle', 'green')}
      ${kpi('DUT suspendus', s.suspendus, 'alertTriangle', 'amber')}
      ${kpi('DUT retirés', s.retires, 'trash', 'rose')}
    </div>

    <div class="kpi-grid" style="margin-top:var(--s3)">
      ${kpi('Tonnage déclaré (tous DUT)', `${formatNumber(s.tonnage, 1)} t`, 'package', 'navy')}
      ${kpi('Transporteurs actifs', s.transporteursActifs, 'truck', 'teal')}
      ${kpi('Véhicules actifs', s.vehiculesActifs, 'truck', 'blue')}
      ${kpi('Antennes actives', s.antennesActives, 'map', 'violet')}
      ${kpi('Contrôles effectués', s.controlesEffectues, 'scan', 'green')}
      ${kpi('Anomalies détectées', s.anomalies, 'alertCircle', 'rose')}
    </div>

    <div class="dash-grid charts-grid">
      ${chartCard('chart-month', 'DUT par mois', 'Dossiers créés, six derniers mois', sum(s.byMonth), 'DUT')}
      ${chartCard('chart-antenna', 'DUT par antenne', 'Répartition du périmètre', Object.keys(s.byAntenna).length, 'antennes')}
      ${chartCard('chart-partner', 'DUT par partenaire', 'Émetteurs les plus actifs', Object.keys(s.byPartner).length, 'partenaires')}
      ${chartCard('chart-merch', 'Marchandises transportées', 'Part du tonnage déclaré', `${formatNumber(sum(s.byMerchandise), 0)} t`, '')}
      ${chartCard('chart-dest', 'Top destinations', 'Nombre de DUT par ville d’arrivée', Object.keys(s.topDestinations).length, 'villes')}
      ${chartCard('chart-tonnage-dest', 'Tonnage par destination', 'Tonnes déclarées à l’arrivée', `${formatNumber(sum(s.tonnageByDestination), 0)} t`, '')}
    </div>

    <div class="card-header" style="margin-top:var(--s5)">
      <div><h2>Sécurité &amp; contrôles</h2><div class="subtitle">Anti-falsification et contrôles terrain</div></div>
    </div>
    <div class="kpi-grid">
      ${kpi('Contrôles aujourd’hui', s.security.controlesAujourdhui, 'scan', 'blue')}
      ${kpi('DUT valides contrôlés', s.security.validesControles, 'checkCircle', 'green')}
      ${kpi('QR non reconnus', s.security.qrNonReconnus, 'alertCircle', 'rose')}
      ${kpi('Suspendus présentés', s.security.suspendusPresentes, 'alertTriangle', 'amber')}
      ${kpi('Retirés présentés', s.security.retiresPresentes, 'xCircle', 'rose')}
    </div>
    <div class="card" style="padding:22px 6px 6px;margin-top:var(--s3)">
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th scope="col">Date</th><th scope="col">DUT</th><th scope="col">Agent</th><th scope="col">Résultat</th></tr></thead>
        <tbody>
          ${s.security.derniers.length === 0 ? `<tr><td class="table-empty" colspan="4">${icon('inbox', { size: 28 })}<div>Aucun contrôle enregistré</div></td></tr>` : s.security.derniers.map((c) => `
            <tr>
              <td>${formatDateTime(c.date)}</td>
              <td>${escapeHtml(c.dutNumber || 'QR inconnu')}</td>
              <td>${escapeHtml(c.agentLabel)}</td>
              <td>${resultBadge(c.result)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table></div>
    </div>
  `;

  animateCountUps(container);
  staggerIn(container.querySelectorAll('.kpi-card'));

  if (!window.Chart) return;

  charts.push(barChart('chart-month', sortedMonthLabels(s.byMonth), Object.values(sortMonthObj(s.byMonth)), { unit: 'DUT' }));
  charts.push(barChart('chart-antenna', Object.keys(s.byAntenna), Object.values(s.byAntenna), { horizontal: true, unit: 'DUT', top: 6 }));
  charts.push(barChart('chart-partner', Object.keys(s.byPartner), Object.values(s.byPartner), { horizontal: true, unit: 'DUT', top: 6 }));
  charts.push(doughnutChart('chart-merch', Object.keys(s.byMerchandise), Object.values(s.byMerchandise)));
  charts.push(barChart('chart-dest', Object.keys(s.topDestinations), Object.values(s.topDestinations), { unit: 'DUT', top: 6 }));
  charts.push(barChart('chart-tonnage-dest', Object.keys(s.tonnageByDestination), Object.values(s.tonnageByDestination), { horizontal: true, unit: 't', top: 6 }));
}

function sum(obj) { return Object.values(obj).reduce((a, b) => a + (Number(b) || 0), 0); }

function chartCard(id, title, subtitle, total, unit) {
  return `
    <div class="chart-card">
      <div class="chart-head">
        <div><h3>${title}</h3><p>${subtitle}</p></div>
        <span class="chart-total"><strong>${typeof total === 'number' ? formatNumber(total) : total}</strong>${unit ? ` ${unit}` : ''}</span>
      </div>
      <div class="chart-box"><canvas id="${id}" aria-label="${title}" role="img"></canvas></div>
    </div>`;
}

const FONT = { family: 'Instrument Sans', size: 11.5, weight: '500' };
const TOOLTIP = {
  backgroundColor: '#0B3D6F', titleColor: '#BBD3EC', bodyColor: '#fff', padding: 10, cornerRadius: 8, displayColors: false,
  titleFont: { family: 'Instrument Sans', size: 11, weight: '600' }, bodyFont: { family: 'Instrument Sans', size: 12.5, weight: '600' },
};

/** Dégradé vertical ou horizontal bleu logo pour les barres ; la plus haute en orange. */
function barColors(ctx, count, maxIndex, horizontal) {
  return (c) => {
    const { chart, dataIndex } = c; const area = chart.chartArea; if (!area) return '#0E56A4';
    if (dataIndex === maxIndex) return '#F17D0C';
    const g = horizontal ? chart.ctx.createLinearGradient(area.left, 0, area.right, 0) : chart.ctx.createLinearGradient(0, area.bottom, 0, area.top);
    g.addColorStop(0, '#0E56A4'); g.addColorStop(1, '#5B95D6');
    return g;
  };
}

function barChart(canvasId, labels, values, { horizontal = false, unit = '', top = 0 } = {}) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;
  let pairs = labels.map((l, i) => [l, Number(values[i]) || 0]);
  if (top) pairs = pairs.sort((a, b) => b[1] - a[1]).slice(0, top);
  const data = pairs.map((p) => p[1]); const names = pairs.map((p) => p[0]);
  const maxIndex = data.indexOf(Math.max(...data));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const valueAxis = { beginAtZero: true, grid: { color: '#EEF1F6', drawTicks: false }, border: { display: false, dash: [4, 4] }, ticks: { font: FONT, color: '#7A8AA0', precision: 0, maxTicksLimit: 5, padding: 6, callback: (v) => unit === 't' ? `${v} t` : v } };
  // Étiquettes : tronquées à 14 caractères ; en vertical, inclinées dès qu'elles risquent de se chevaucher.
  const crowded = !horizontal && names.length > 4;
  const labelAxis = { grid: { display: false }, border: { display: false }, ticks: { font: FONT, color: '#52657C', autoSkip: false, maxRotation: crowded ? 38 : 0, minRotation: crowded ? 38 : 0, callback(v) { const l = this.getLabelForValue(v); return l.length > 14 ? `${l.slice(0, 13)}…` : l; } } };
  return new window.Chart(ctx, {
    type: 'bar',
    data: { labels: names, datasets: [{ data, backgroundColor: barColors(ctx, data.length, maxIndex, horizontal), hoverBackgroundColor: '#0B3D6F', borderRadius: horizontal ? { topRight: 8, bottomRight: 8 } : { topLeft: 8, topRight: 8 }, borderSkipped: false, barPercentage: 0.62, categoryPercentage: 0.7, maxBarThickness: 34 }] },
    options: {
      indexAxis: horizontal ? 'y' : 'x', maintainAspectRatio: false, responsive: true,
      animation: reduced ? false : { duration: 700, easing: 'easeOutQuart' },
      layout: { padding: { top: 6, right: horizontal ? 18 : 6 } },
      plugins: { legend: { display: false }, tooltip: { ...TOOLTIP, callbacks: { label: (c) => `${formatNumber(c.parsed[horizontal ? 'x' : 'y'], unit === 't' ? 1 : 0)} ${unit}`.trim() } } },
      scales: horizontal ? { x: valueAxis, y: labelAxis } : { x: labelAxis, y: valueAxis },
    },
  });
}

function sortMonthObj(byMonth) {
  return Object.fromEntries(Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)));
}
function sortedMonthLabels(byMonth) {
  return Object.keys(sortMonthObj(byMonth)).map((m) => {
    const [y, mo] = m.split('-');
    return new Date(Number(y), Number(mo) - 1).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
  });
}

function doughnutChart(canvasId, labels, data) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const total = data.reduce((a, b) => a + (Number(b) || 0), 0) || 1;
  return new window.Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: paletteShades(labels.length), borderColor: '#fff', borderWidth: 3, hoverOffset: 6 }] },
    options: {
      maintainAspectRatio: false, responsive: true, cutout: '68%',
      animation: reduced ? false : { duration: 700, easing: 'easeOutQuart' },
      layout: { padding: 4 },
      plugins: {
        legend: { position: 'right', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle', padding: 10, font: FONT, color: '#52657C' } },
        tooltip: { ...TOOLTIP, callbacks: { label: (c) => `${formatNumber(c.parsed, 1)} t · ${Math.round((c.parsed / total) * 100)} %` } },
      },
    },
  });
}

function resultBadge(result) {
  const map = {
    VALID: '<span class="badge badge-success"><span class="badge-dot"></span>Valide</span>',
    SUSPENDED: '<span class="badge badge-warning"><span class="badge-dot"></span>Suspendu</span>',
    WITHDRAWN: '<span class="badge badge-error"><span class="badge-dot"></span>Retiré</span>',
    UNKNOWN: '<span class="badge badge-error"><span class="badge-dot"></span>Inconnu</span>',
  };
  return map[result] || `<span class="badge badge-neutral"><span class="badge-dot"></span>${result}</span>`;
}

function kpi(label, value, iconName, tone) {
  return `
    <div class="kpi-card">
      <div class="kpi-label">${label}<span class="kpi-icon" style="background:var(--sq-${tone}-bg);color:var(--sq-${tone}-fg)">${icon(iconName, { size: 13 })}</span></div>
      <div class="kpi-value" style="color:var(--sq-${tone}-fg)"${typeof value === 'number' ? ` data-countup="${value}"` : ''}>${typeof value === 'number' ? formatNumber(value) : value}</div>
    </div>
  `;
}
