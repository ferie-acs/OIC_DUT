import { icon } from '../core/icons.js';
import { escapeHtml, formatDate } from '../core/utils.js';
import { navigate } from '../core/router.js';
import { getCurrentUser } from '../core/auth.js';
import { can } from '../core/permissions.js';
import { DUT_STATUS, DUT_STATUS_LABELS } from '../core/constants.js';
import * as dutService from '../services/dut.service.js';
import { staggerIn } from '../core/motion.js?v=oic-blue';

const FILTERS = [
  { key: 'ALL', label: 'Tous' },
  { key: DUT_STATUS.EN_EDITION, label: 'En édition' },
  { key: DUT_STATUS.TERMINE, label: 'Terminé' },
  { key: DUT_STATUS.REJETE, label: 'Rejeté' },
  { key: DUT_STATUS.VALIDE, label: 'Validé' },
  { key: DUT_STATUS.SUSPENDU, label: 'Suspendu' },
  { key: DUT_STATUS.RETIRE, label: 'Retiré' },
];

let activeFilter = 'ALL';
let searchTerm = '';

export function render(container) {
  const user = getCurrentUser();

  const allDuts = dutService.listForPartner(user.partnerId);
  const countFor = (key) => (key === 'ALL' ? allDuts.length : allDuts.filter((d) => d.status === key).length);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <span class="overline">Partenaire · Documents</span>
        <h1>Mes DUT</h1>
        <div class="subtitle">${escapeHtml(user.partnerName || '')}</div>
      </div>
      ${can(user, 'dut.create') ? `<button type="button" class="btn btn-primary" id="btn-new-dut">${icon('plus', { size: 16 })} Nouveau DUT</button>` : ''}
    </div>
    <div class="page-header-rule"></div>
    <div class="table-toolbar">
      <div class="tabs-underline" id="dut-filters">
        ${FILTERS.map((f) => `<button type="button" class="tab-count-btn ${f.key === activeFilter ? 'active' : ''}" data-filter="${f.key}">${f.label} <span class="count">${countFor(f.key)}</span></button>`).join('')}
      </div>
      <div class="search-input">${icon('search', { size: 15 })}<input type="text" id="dut-search" placeholder="Rechercher un DUT..."></div>
    </div>
    <div class="card" style="padding:22px 6px 6px"><div class="table-wrap"><table class="data-table" id="dut-table"></table></div></div>
  `;

  container.querySelector('#dut-filters').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    activeFilter = btn.dataset.filter;
    render(container);
  });
  container.querySelector('#dut-search').addEventListener('input', (e) => { searchTerm = e.target.value.toLowerCase(); renderTable(container, user); });
  container.querySelector('#btn-new-dut')?.addEventListener('click', () => {
    const dut = dutService.createDraft(user);
    sessionStorage.setItem('dut_wizard_draft_id', dut.id);
    navigate('/dut/new/1');
  });

  renderTable(container, user);
}

function renderTable(container, user) {
  let duts = dutService.listForPartner(user.partnerId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (activeFilter !== 'ALL') duts = duts.filter((d) => d.status === activeFilter);
  if (searchTerm) {
    duts = duts.filter((d) => [d.dutNumber, d.general.transporterName, d.expediteur.raisonSociale, d.destinataire.raisonSociale, d.general.immatriculation]
      .filter(Boolean).some((v) => v.toLowerCase().includes(searchTerm)));
  }

  const table = container.querySelector('#dut-table');
  if (duts.length === 0) {
    table.innerHTML = `<tr><td class="table-empty">${icon('inbox', { size: 36 })}<h3 style="margin:8px 0 4px">Aucun DUT</h3><p>Aucun résultat pour ces filtres.</p></td></tr>`;
    return;
  }

  table.innerHTML = `
    <thead><tr>
      <th scope="col">Date</th><th scope="col">Code</th><th scope="col">Transporteur</th>
      <th scope="col">Expéditeur</th><th scope="col">Destinataire</th><th scope="col">Véhicule</th>
      <th scope="col">État</th><th scope="col" class="text-right">Actions</th>
    </tr></thead>
    <tbody>
      ${duts.map((d) => `
        <tr data-id="${d.id}">
          <td>${formatDate(d.createdAt)}</td>
          <td class="fw-medium">${escapeHtml(d.dutNumber || '—')}</td>
          <td>${escapeHtml(d.general.transporterName || '—')}</td>
          <td>${escapeHtml(d.expediteur.raisonSociale || '—')}</td>
          <td>${escapeHtml(d.destinataire.raisonSociale || '—')}</td>
          <td>${escapeHtml(d.general.immatriculation || '—')}</td>
          <td><span class="badge status-${d.status}"><span class="badge-dot"></span>${DUT_STATUS_LABELS[d.status]}</span>${d.canary ? ' <span class="badge badge-warning">Piège</span>' : ''}</td>
          <td class="text-right"><span class="link-action">Ouvrir</span></td>
        </tr>
      `).join('')}
    </tbody>
  `;

  table.querySelector('tbody').addEventListener('click', (e) => {
    const tr = e.target.closest('tr');
    if (tr) navigate(`/dut/${tr.dataset.id}`);
  });
  staggerIn(table.querySelectorAll('tbody tr'));
}
