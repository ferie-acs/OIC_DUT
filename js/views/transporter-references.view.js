// Lot d3 : stock de références du transporteur (lecture) et références consommées par ses DUT.
import { icon } from '../core/icons.js';
import { escapeHtml, formatDate, formatDateTime, formatMoney, formatNumber, segmentedProgressHtml } from '../core/utils.js';
import { navigate } from '../core/router.js';
import { getCurrentUser } from '../core/auth.js';
import { DUT_STATUS_LABELS } from '../core/constants.js';
import { referenceStock } from '../services/dut-lifecycle.service.js';
import { createDraft } from '../services/dut.service.js';

export function render(container) {
  const user = getCurrentUser();
  const stock = referenceStock(user.transporterId);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <span class="overline">Transporteur · ${escapeHtml(user.transporterName || '')}</span>
        <h1>Mes références</h1>
        <div class="subtitle">Chaque DUT que vous éditez est réglé avec une référence de votre stock, puis validé par une antenne OIC.</div>
      </div>
      <button type="button" class="btn btn-primary" id="btn-new-dut">${icon('plus', { size: 16 })} Nouveau DUT</button>
    </div>
    <div class="page-header-rule"></div>

    <div class="kpi-grid">
      ${kpi('Références disponibles', stock.available, 'layers', 'blue')}
      ${kpi('Références utilisées', stock.consumed.length, 'checkCircle', 'green')}
      ${kpi('Références retirées', stock.retired.length, 'ban', stock.retired.length ? 'rose' : 'navy')}
      ${kpi('Prochaine référence', stock.next || 'Stock épuisé', 'wallet', 'violet')}
    </div>

    <div class="stack gap-3" style="margin-top:var(--s4)">
      ${stock.operations.length ? stock.operations.map((op) => `
        <div class="range-progress-card">
          <div class="row-between" style="margin-bottom:8px">
            <div>
              <div class="range-code">${escapeHtml(op.code)}</div>
              <div class="text-muted" style="font-size:.78rem">Stock validé le ${formatDate(op.validatedAt)} · ${formatMoney(op.tarifUnitaire)} la référence</div>
            </div>
            <span class="badge badge-success"><span class="badge-dot"></span>Validé</span>
          </div>
          <div style="margin:12px 0 10px">${segmentedProgressHtml(op.quantity, op.used)}</div>
          <div class="range-meta" style="margin-top:0">
            <span>DUT-CI-${op.year}-${String(op.rangeStart).padStart(6, '0')} à DUT-CI-${op.year}-${String(op.rangeEnd).padStart(6, '0')}</span>
            <span class="mono-num fw-bold">${op.quantity - op.used} / ${op.quantity} disponibles</span>
          </div>
        </div>`).join('') : `<div class="card empty-state">${icon('layers', { size: 40 })}<h3>Aucun stock de références</h3><p>L’achat de références se fait auprès de l’OIC.</p></div>`}
    </div>

    <div class="card" style="margin-top:var(--s4);padding:0">
      <div class="card-header" style="padding:22px 22px 0">
        <div><h3>Références utilisées</h3><div class="subtitle">Débit simulé du stock : aucune somme n’est prélevée dans cette démonstration</div></div>
      </div>
      <div class="table-wrap"><table class="data-table" id="ref-consumed"></table></div>
    </div>
    ${stock.retired.length ? `
    <div class="card" style="margin-top:var(--s4)">
      <h3 style="margin-bottom:var(--s2)">Références retirées</h3>
      <p class="text-muted" style="font-size:.85rem;margin-bottom:var(--s3)">Le numéro d’un DUT annulé est retiré définitivement : il ne revient pas dans le stock et ne sera jamais réattribué.</p>
      <ul class="dd-modal-list">${stock.retired.map((r) => `<li><span class="dd-modal-icon" aria-hidden="true">${icon('ban', { size: 16 })}</span><div><strong>${escapeHtml(r.reference)}</strong><small>${formatDateTime(r.at)} · ${escapeHtml(r.by)} · ${escapeHtml(r.motif)}</small></div></li>`).join('')}</ul>
    </div>` : ''}
  `;

  container.querySelector('#btn-new-dut').addEventListener('click', () => {
    const dut = createDraft(user);
    sessionStorage.setItem('dut_wizard_draft_id', dut.id);
    navigate('/dut/new/1');
  });

  const table = container.querySelector('#ref-consumed');
  if (!stock.consumed.length) {
    table.innerHTML = `<tr><td class="table-empty">${icon('inbox', { size: 32 })}<div>Aucune référence utilisée pour le moment</div></td></tr>`;
    return;
  }
  table.innerHTML = `
    <thead><tr><th scope="col">Référence</th><th scope="col">Réglé le</th><th scope="col">Par</th><th scope="col">Valeur</th><th scope="col">État du DUT</th></tr></thead>
    <tbody>${stock.consumed.map((c) => `
      <tr data-id="${escapeHtml(c.dutId)}">
        <td class="fw-medium ta-nowrap">${escapeHtml(c.reference)}</td>
        <td>${formatDateTime(c.paidAt)}</td>
        <td>${escapeHtml(c.paidBy || '')}</td>
        <td class="ta-nowrap">${formatMoney(c.montant)}</td>
        <td><span class="badge status-${c.status}"><span class="badge-dot"></span>${DUT_STATUS_LABELS[c.status]}</span></td>
      </tr>`).join('')}</tbody>`;
  table.querySelector('tbody').addEventListener('click', (e) => {
    const tr = e.target.closest('tr');
    if (tr) navigate(`/dut/${tr.dataset.id}`);
  });
}

function kpi(label, value, iconName, tone) {
  const isNumber = typeof value === 'number';
  return `
    <div class="kpi-card">
      <div class="kpi-label">${label}<span class="kpi-icon" style="background:var(--sq-${tone}-bg);color:var(--sq-${tone}-fg)">${icon(iconName, { size: 13 })}</span></div>
      <div class="kpi-value${isNumber ? '' : ' lc-kpi-text'}" style="color:var(--sq-${tone}-fg)">${isNumber ? formatNumber(value) : escapeHtml(value)}</div>
    </div>
  `;
}
