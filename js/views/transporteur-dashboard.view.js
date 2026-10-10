import { icon } from '../core/icons.js';
import { escapeHtml, formatDate, formatNumber } from '../core/utils.js';
import { navigate } from '../core/router.js';
import { getCurrentUser } from '../core/auth.js';
import { DUT_STATUS, DUT_STATUS_LABELS } from '../core/constants.js';
import * as dutService from '../services/dut.service.js';
import { vehicles } from '../services/referentials.service.js';
import { animateCountUps, staggerIn } from '../core/motion.js?v=oic-blue';
import * as workspace from '../services/workspace.service.js';
import { transportActionsHtml, bindTransportActions, currentStage, stageLabel } from './transport-actions.js';

export function render(container) {
  const user = getCurrentUser();
  const duts = dutService.listForTransporter(user.transporterId);
  const tonnage = duts.reduce((sum, d) => sum + (d.marchandises || []).reduce((s, m) => s + (Number(m.poidsTonnes) || 0), 0), 0);
  const myVehicles = vehicles.list().filter((v) => v.transporterId === user.transporterId);
  const stages = Object.fromEntries(duts.map((d) => [d.id, currentStage(d.id)]));
  const openIncidents = duts.reduce((sum, d) => sum + safeIncidents(d.id).filter((i) => i.status === 'OPEN').length, 0);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <span class="overline">Transporteur · ${escapeHtml(user.transporterName)}</span>
        <h1>Tableau de bord</h1>
        <div class="subtitle">Vos transports : déclarez chaque étape jusqu’à la livraison et signalez les incidents.</div>
      </div>
    </div>
    <div class="page-header-rule"></div>

    <div class="kpi-grid">
      ${kpi('DUT transportés', duts.length, 'truck', 'blue')}
      ${kpi('Validés', duts.filter((d) => d.status === DUT_STATUS.VALIDE).length, 'checkCircle', 'green')}
      ${kpi('En route', duts.filter((d) => stages[d.id] === 'DEPARTED').length, 'truck', 'amber')}
      ${kpi('Livrés', duts.filter((d) => stages[d.id] === 'DELIVERED').length, 'checkCircle', 'teal')}
      ${kpi('Incidents ouverts', openIncidents, 'alertTriangle', openIncidents ? 'rose' : 'navy')}
      ${kpi('Tonnage déclaré (tous DUT)', `${formatNumber(tonnage, 1)} t`, 'package', 'violet')}
    </div>

    <div class="ta-dashboard" style="margin-top:var(--s4)">
      <div class="card" style="padding:0">
        <div class="card-header" style="padding:22px 22px 0">
          <div><h3>Mes transports</h3><div class="subtitle">Déclarez l’étape suivante ou un incident ; cliquez sur une ligne pour ouvrir le dossier</div></div>
        </div>
        <div class="table-wrap"><table class="data-table" id="transporteur-duts"></table></div>
      </div>
      <div class="card">
        <h3 style="margin-bottom:var(--s3)">Mon parc</h3>
        <div class="stack gap-2">
          ${myVehicles.map((v) => `
            <div class="card-flat" style="padding:12px 14px">
              <div class="row-between"><strong>${escapeHtml(v.immatriculation)}</strong><span class="text-muted" style="font-size:.75rem">${escapeHtml(v.type || '')}</span></div>
              <div class="text-muted" style="font-size:.72rem;margin-top:2px">PTAC ${v.ptac || '—'} t · Carte transport ${escapeHtml(v.carteTransport || '—')}</div>
            </div>
          `).join('') || '<p class="text-muted" style="font-size:.85rem">Aucun véhicule rattaché.</p>'}
        </div>
      </div>
    </div>
  `;

  const table = container.querySelector('#transporteur-duts');
  if (duts.length === 0) {
    table.innerHTML = `<tr><td class="table-empty">${icon('inbox', { size: 32 })}<div>Aucun DUT pour ce transporteur</div></td></tr>`;
  } else {
    table.innerHTML = `
      <thead><tr><th scope="col">Date</th><th scope="col">Code</th><th scope="col">Véhicule</th><th scope="col">Origine → Destination</th><th scope="col">État</th><th scope="col">Suivi</th><th scope="col">Actions</th></tr></thead>
      <tbody>
        ${duts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map((d) => `
          <tr data-id="${d.id}">
            <td>${formatDate(d.createdAt)}</td>
            <td class="fw-medium ta-nowrap">${escapeHtml(d.dutNumber || '—')}</td>
            <td class="ta-nowrap">${escapeHtml(d.general.immatriculation || '—')}</td>
            <td>${escapeHtml(d.trajet.chargement.ville || '—')} → ${escapeHtml(d.trajet.dechargement.ville || '—')}</td>
            <td><span class="badge status-${d.status}"><span class="badge-dot"></span>${DUT_STATUS_LABELS[d.status]}</span></td>
            <td><span class="badge stage-${stages[d.id]}">${escapeHtml(stageLabel(d.id))}</span></td>
            <td><div class="ta-row-actions">${transportActionsHtml(d, { compact: true })}</div></td>
          </tr>
        `).join('')}
      </tbody>
    `;
    table.querySelector('tbody').addEventListener('click', (e) => {
      if (e.target.closest('button, a')) return;
      const tr = e.target.closest('tr');
      if (tr) navigate(`/dut/${tr.dataset.id}`);
    });
    bindTransportActions(table, (id) => dutService.getDut(id), () => render(container));
  }

  animateCountUps(container);
  staggerIn(container.querySelectorAll('.kpi-card'));
}

function kpi(label, value, iconName, tone) {
  return `
    <div class="kpi-card">
      <div class="kpi-label">${label}<span class="kpi-icon" style="background:var(--sq-${tone}-bg);color:var(--sq-${tone}-fg)">${icon(iconName, { size: 13 })}</span></div>
      <div class="kpi-value" style="color:var(--sq-${tone}-fg)"${typeof value === 'number' ? ` data-countup="${value}"` : ''}>${typeof value === 'number' ? formatNumber(value) : value}</div>
    </div>
  `;
}

function safeIncidents(id) {
  try { return workspace.dossier(id).incidents; } catch { return []; }
}
