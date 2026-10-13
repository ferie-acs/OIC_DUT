// Lot d3 : contrôle et archivage des DUT édités par l'antenne ; consultation des archives par période.
import { icon } from '../core/icons.js';
import { escapeHtml, formatDate, formatDateTime, formatNumber } from '../core/utils.js';
import { navigate } from '../core/router.js';
import { getCurrentUser } from '../core/auth.js';
import { DUT_STATUS_LABELS } from '../core/constants.js';
import * as lifecycle from '../services/dut-lifecycle.service.js';
import { listAntennasForSubmission } from '../services/dut-lifecycle.service.js';
import { openArchiveModal } from './dut-lifecycle.view.js';
import { getDut } from '../services/dut.service.js';

const iso = (d) => d.toISOString().slice(0, 10);
function monthBounds(offset = 0) {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 0));
  return { from: iso(start), to: iso(end) };
}

const state = { from: monthBounds().from, to: monthBounds().to, antennaId: '' };

export function render(container) {
  const user = getCurrentUser();
  const isAntenna = user.role === 'ANTENNA_AGENT';
  const pending = isAntenna ? lifecycle.toArchive(user) : [];
  const archives = lifecycle.listArchives(user, state);
  const reserves = archives.filter((a) => a.resultat === 'RESERVES').length;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <span class="overline">${isAntenna ? `Antenne · ${escapeHtml(user.antennaName || '')}` : 'OIC · Antennes'}</span>
        <h1>${isAntenna ? 'Contrôle et archives' : 'Archives des antennes'}</h1>
        <div class="subtitle">Chaque DUT édité est contrôlé puis classé sous une cote d’archive.</div>
      </div>
    </div>
    <div class="page-header-rule"></div>

    <div class="kpi-grid">
      ${isAntenna ? kpi('DUT à contrôler et archiver', pending.length, 'clock', 'amber') : ''}
      ${kpi('Archivés sur la période', archives.length, 'archive', 'blue')}
      ${kpi('Conformes', archives.length - reserves, 'checkCircle', 'green')}
      ${kpi('Avec réserves', reserves, 'alertTriangle', reserves ? 'rose' : 'navy')}
    </div>

    ${isAntenna ? `
    <div class="card" style="margin-top:var(--s4);padding:0">
      <div class="card-header" style="padding:22px 22px 0">
        <div><h3>DUT édités à contrôler</h3><div class="subtitle">Les plus anciens d’abord · le contrôle porte sur le document et ses pièces</div></div>
      </div>
      <div class="table-wrap"><table class="data-table" id="pending-archive"></table></div>
    </div>` : ''}

    <div class="card" style="margin-top:var(--s4);padding:0">
      <div class="card-header" style="padding:22px 22px 0">
        <div><h3>Archives</h3><div class="subtitle">Recherche par date d’archivage, bornes incluses</div></div>
      </div>
      <div class="lc-filters">
        <div class="field"><label for="a-from">Du</label><input class="input" type="date" id="a-from" value="${state.from}"></div>
        <div class="field"><label for="a-to">Au</label><input class="input" type="date" id="a-to" value="${state.to}"></div>
        ${isAntenna ? '' : `<div class="field"><label for="a-antenna">Antenne</label><div class="select-wrap"><select class="select" id="a-antenna"><option value="">Toutes les antennes</option>${listAntennasForSubmission().map((a) => `<option value="${escapeHtml(a.id)}" ${a.id === state.antennaId ? 'selected' : ''}>${escapeHtml(a.name)}</option>`).join('')}</select>${icon('chevronDown', { size: 14 })}</div></div>`}
        <div class="lc-filter-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-period="month">Ce mois</button>
          <button type="button" class="btn btn-secondary btn-sm" data-period="previous">Mois précédent</button>
          <button type="button" class="btn btn-secondary btn-sm" data-period="year">Cette année</button>
        </div>
      </div>
      <div class="table-wrap"><table class="data-table" id="archive-table"></table></div>
    </div>
  `;

  const refresh = () => render(container);
  container.querySelector('#a-from').addEventListener('change', (e) => { state.from = e.target.value; refresh(); });
  container.querySelector('#a-to').addEventListener('change', (e) => { state.to = e.target.value; refresh(); });
  container.querySelector('#a-antenna')?.addEventListener('change', (e) => { state.antennaId = e.target.value; refresh(); });
  container.querySelectorAll('[data-period]').forEach((b) => b.addEventListener('click', () => {
    const p = b.dataset.period;
    const bounds = p === 'previous' ? monthBounds(-1) : p === 'year' ? { from: `${new Date().getFullYear()}-01-01`, to: `${new Date().getFullYear()}-12-31` } : monthBounds();
    Object.assign(state, bounds);
    refresh();
  }));

  if (isAntenna) {
    const table = container.querySelector('#pending-archive');
    table.innerHTML = pending.length ? `
      <thead><tr><th scope="col">Numéro</th><th scope="col">Validé le</th><th scope="col">Éditeur</th><th scope="col">Véhicule</th><th scope="col">État</th><th scope="col" class="text-right">Actions</th></tr></thead>
      <tbody>${pending.map((d) => `
        <tr data-id="${escapeHtml(d.id)}">
          <td class="fw-medium ta-nowrap">${escapeHtml(d.dutNumber)}</td>
          <td>${formatDate(d.validatedAt)}</td>
          <td>${escapeHtml(d.partnerName || '—')}</td>
          <td class="ta-nowrap">${escapeHtml(d.general?.immatriculation || '—')}</td>
          <td><span class="badge status-${d.status}"><span class="badge-dot"></span>${DUT_STATUS_LABELS[d.status]}</span></td>
          <td class="text-right"><button type="button" class="btn btn-secondary btn-sm" data-archive>${icon('archive', { size: 14 })} Contrôler et archiver</button></td>
        </tr>`).join('')}</tbody>`
      : `<tr><td class="table-empty">${icon('inbox', { size: 32 })}<div>Tous les DUT édités sont archivés</div></td></tr>`;
    table.querySelector('tbody')?.addEventListener('click', (e) => {
      const tr = e.target.closest('tr');
      if (!tr) return;
      if (e.target.closest('[data-archive]')) openArchiveModal(getDut(tr.dataset.id), refresh);
      else navigate(`/antenna/dut/${tr.dataset.id}`);
    });
  }

  const table = container.querySelector('#archive-table');
  if (!archives.length) {
    table.innerHTML = `<tr><td class="table-empty">${icon('archive', { size: 32 })}<div>Aucune archive sur cette période</div></td></tr>`;
    return;
  }
  table.innerHTML = `
    <thead><tr><th scope="col">Cote</th><th scope="col">Numéro</th>${isAntenna ? '' : '<th scope="col">Antenne</th>'}<th scope="col">Trajet</th><th scope="col">Contrôle</th><th scope="col">Classement</th><th scope="col">Archivé le</th></tr></thead>
    <tbody>${archives.map((a) => `
      <tr data-id="${escapeHtml(a.dutId)}">
        <td class="fw-medium ta-nowrap">${escapeHtml(a.cote)}</td>
        <td class="ta-nowrap">${escapeHtml(a.dutNumber)}</td>
        ${isAntenna ? '' : `<td>${escapeHtml(a.antennaName || '')}</td>`}
        <td>${escapeHtml(a.snapshot?.origine || '—')} → ${escapeHtml(a.snapshot?.destination || '—')}</td>
        <td><span class="badge ${a.resultat === 'RESERVES' ? 'badge-warning' : 'badge-success'}">${escapeHtml(lifecycle.ARCHIVE_RESULTS[a.resultat] || a.resultat)}</span></td>
        <td>${escapeHtml(a.classeur)}</td>
        <td>${formatDateTime(a.archivedAt)}<div class="text-muted" style="font-size:.75rem">${escapeHtml(a.archivedBy)}</div></td>
      </tr>`).join('')}</tbody>`;
  table.querySelector('tbody').addEventListener('click', (e) => {
    const tr = e.target.closest('tr');
    if (tr) navigate(isAntenna ? `/antenna/dut/${tr.dataset.id}` : `/dut/${tr.dataset.id}`);
  });
}

function kpi(label, value, iconName, tone) {
  return `
    <div class="kpi-card">
      <div class="kpi-label">${label}<span class="kpi-icon" style="background:var(--sq-${tone}-bg);color:var(--sq-${tone}-fg)">${icon(iconName, { size: 13 })}</span></div>
      <div class="kpi-value" style="color:var(--sq-${tone}-fg)">${formatNumber(value)}</div>
    </div>
  `;
}
