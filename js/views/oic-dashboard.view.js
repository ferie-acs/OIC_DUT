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

    <div class="dash-grid">
      <div class="chart-card"><h3 style="margin-bottom:var(--s3)">DUT par mois</h3><canvas id="chart-month" height="140"></canvas></div>
      <div class="chart-card"><h3 style="margin-bottom:var(--s3)">DUT par antenne</h3><canvas id="chart-antenna" height="140"></canvas></div>
      <div class="chart-card"><h3 style="margin-bottom:var(--s3)">DUT par partenaire</h3><canvas id="chart-partner" height="140"></canvas></div>
      <div class="chart-card"><h3 style="margin-bottom:var(--s3)">Marchandises transportées (tonnage)</h3><canvas id="chart-merch" height="140"></canvas></div>
      <div class="chart-card"><h3 style="margin-bottom:var(--s3)">Top destinations (nb DUT)</h3><canvas id="chart-dest" height="140"></canvas></div>
      <div class="chart-card"><h3 style="margin-bottom:var(--s3)">Tonnage par destination</h3><canvas id="chart-tonnage-dest" height="140"></canvas></div>
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

  charts.push(lineChart('chart-month', sortedMonthLabels(s.byMonth), Object.values(sortMonthObj(s.byMonth)), PALETTE[0]));
  charts.push(lineChart('chart-antenna', Object.keys(s.byAntenna), Object.values(s.byAntenna), PALETTE[1]));
  charts.push(lineChart('chart-partner', Object.keys(s.byPartner), Object.values(s.byPartner), PALETTE[2]));
  charts.push(doughnutChart('chart-merch', Object.keys(s.byMerchandise), Object.values(s.byMerchandise)));
  charts.push(lineChart('chart-dest', Object.keys(s.topDestinations), Object.values(s.topDestinations), PALETTE[3]));
  charts.push(lineChart('chart-tonnage-dest', Object.keys(s.tonnageByDestination), Object.values(s.tonnageByDestination), PALETTE[4]));
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

function lineChart(canvasId, labels, data, color) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;
  return new window.Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ data, borderColor: color, backgroundColor: color + '12', fill: true, tension: 0.4, cubicInterpolationMode: 'monotone', borderWidth: 2.5, pointRadius: 3, pointHoverRadius: 6 }] },
    options: {
      animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : {duration: 850, easing: 'easeOutQuart'},
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { family: 'Instrument Sans', size: 12, weight: '500' } } },
        y: { grid: { color: '#E6EAF1' }, beginAtZero: true, ticks: { font: { family: 'Instrument Sans', size: 12, weight: '500' } } },
      },
    },
  });
}

function doughnutChart(canvasId, labels, data) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;
  return new window.Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: paletteShades(labels.length) }] },
    options: { plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { family: 'Instrument Sans', size: 12, weight: '500' } } } }, cutout: '65%' },
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
