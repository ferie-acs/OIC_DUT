// Lot d3 : contrôle sur route — recherche d'un DUT par conducteur et historique des contrôles de l'agent.
import { icon } from '../core/icons.js';
import { escapeHtml, formatDate, formatDateTime } from '../core/utils.js';
import { navigate } from '../core/router.js';
import { getCurrentUser } from '../core/auth.js';
import { can } from '../core/permissions.js';
import { DUT_STATUS_LABELS } from '../core/constants.js';
import { DRIVER_CRITERIA, searchByDriver, myControls } from '../services/road-control.service.js';

const TABS = [
  { path: '/control', label: 'Scanner un QR', icon: 'scan', permission: 'control.scan' },
  { path: '/control/conducteur', label: 'Recherche par conducteur', icon: 'userSearch', permission: 'control.driver_search' },
  { path: '/control/historique', label: 'Mes contrôles', icon: 'history', permission: 'control.history' },
];

/** Onglets de l'espace de contrôle, partagés avec l'écran de scan. */
export function controlTabsHtml(active) {
  const user = getCurrentUser();
  return `<nav class="tabs lc-control-tabs" aria-label="Espace de contrôle">${TABS.filter((t) => can(user, t.permission)).map((t) => `
    <button type="button" class="tab-btn ${t.path === active ? 'active' : ''}" data-control-tab="${t.path}"${t.path === active ? ' aria-current="page"' : ''}>${icon(t.icon, { size: 15 })} ${t.label}</button>`).join('')}</nav>`;
}

export function bindControlTabs(root) {
  root.querySelectorAll('[data-control-tab]').forEach((b) => b.addEventListener('click', () => navigate(b.dataset.controlTab)));
}

const VERDICT_BADGE = { VERT: ['Valide', 'badge-success'], ORANGE: ['À vérifier', 'badge-warning'], ROUGE: ['Refusé', 'badge-error'], INCONNU: ['Inconnu', 'badge-neutral'] };
const STATUS_BADGE = { VALIDE: 'badge-success', SUSPENDU: 'badge-warning', RETIRE: 'badge-error' };

let lastSearch = { critere: 'NOM', valeur: '' };

export function renderSearch(container) {
  container.innerHTML = `
    <div class="control-intro">
      <h1>Recherche par conducteur</h1>
      <p>QR illisible ou absent : retrouvez le DUT à partir du conducteur. Chaque recherche est enregistrée à votre nom.</p>
    </div>
    ${controlTabsHtml('/control/conducteur')}
    <form class="card" id="driver-form" novalidate>
      <div class="field">
        <label for="d-critere">Rechercher par</label>
        <div class="select-wrap"><select class="select" id="d-critere">${Object.entries(DRIVER_CRITERIA).map(([k, v]) => `<option value="${k}" ${k === lastSearch.critere ? 'selected' : ''}>${escapeHtml(v)}</option>`).join('')}</select>${icon('chevronDown', { size: 14 })}</div>
      </div>
      <div class="field">
        <label for="d-valeur">Valeur recherchée</label>
        <input class="input" id="d-valeur" maxlength="80" autocomplete="off" value="${escapeHtml(lastSearch.valeur)}" placeholder="Ex. : KOUASSI, CI-PL-004521">
        <div class="hint">Nom : au moins 3 lettres. Pièce d’identité et permis : numéro complet.</div>
      </div>
      <p class="ta-error" role="alert" id="d-error"></p>
      <button type="submit" class="btn btn-primary btn-block btn-lg">${icon('search', { size: 16 })} Rechercher</button>
    </form>
    <div id="driver-results"></div>
  `;
  bindControlTabs(container);
  container.querySelector('#driver-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const critere = container.querySelector('#d-critere').value;
    const valeur = container.querySelector('#d-valeur').value;
    const error = container.querySelector('#d-error');
    error.textContent = '';
    try {
      const { results, total } = searchByDriver(critere, valeur);
      lastSearch = { critere, valeur };
      renderResults(container.querySelector('#driver-results'), results, total);
    } catch (err) { error.textContent = err.message; }
  });
}

function renderResults(target, results, total) {
  if (!results.length) {
    target.innerHTML = `<div class="card empty-state" style="margin-top:var(--s3)">${icon('inbox', { size: 36 })}<h3>Aucun DUT trouvé</h3><p>Aucun DUT édité ne mentionne ce conducteur. La recherche est enregistrée.</p></div>`;
    return;
  }
  target.innerHTML = `
    <p class="text-muted lc-result-count">${total} DUT trouvé(s)${total > results.length ? ` · ${results.length} affichés` : ''} · le statut affiché est celui du système</p>
    <div class="stack gap-3">${results.map(({ dut, matchedOn, rang, conducteur }) => `
      <div class="card">
        <div class="row-between" style="gap:var(--s2);flex-wrap:wrap">
          <strong>${escapeHtml(dut.dutNumber)}</strong>
          <span class="badge ${STATUS_BADGE[dut.status] || 'badge-neutral'}"><span class="badge-dot"></span>${DUT_STATUS_LABELS[dut.status]}</span>
        </div>
        ${matchedOn === 'transbordement' ? `<p class="lc-note">${icon('arrowLeftRight', { size: 14 })} ${escapeHtml(conducteur)} était le conducteur avant le transbordement n° ${rang} : il n’est plus en charge de ce transport.</p>` : ''}
        <div class="recap-grid" style="margin-top:var(--s3)">
          <div class="recap-item"><span>Conducteur en charge</span><strong>${escapeHtml([dut.general.driverNom, dut.general.driverPrenoms].filter(Boolean).join(' ') || '—')}</strong></div>
          <div class="recap-item"><span>Permis · pièce</span><strong>${escapeHtml(dut.general.driverPermis || '—')} · ${escapeHtml(dut.general.driverPiece || '—')}</strong></div>
          <div class="recap-item"><span>Véhicule</span><strong>${escapeHtml(dut.general.immatriculation || '—')}</strong></div>
          <div class="recap-item"><span>Transporteur</span><strong>${escapeHtml(dut.general.transporterName || '—')}</strong></div>
          <div class="recap-item"><span>Trajet</span><strong>${escapeHtml(dut.trajet?.chargement?.ville || '—')} → ${escapeHtml(dut.trajet?.dechargement?.ville || '—')}</strong></div>
          <div class="recap-item"><span>Validé le</span><strong>${formatDate(dut.validatedAt)}</strong></div>
        </div>
      </div>`).join('')}</div>
    <p class="text-muted lc-result-count">Comparez la plaque et le document présentés. Pour vérifier l’authenticité du papier, scannez son QR.</p>`;
}

const historyState = { from: '', to: '' };

export function renderHistory(container) {
  const user = getCurrentUser();
  const rows = myControls(user, historyState);
  const count = (v) => rows.filter((r) => r.verdict === v).length;
  container.innerHTML = `
    <div class="control-intro">
      <h1>Mes contrôles</h1>
      <p>Vos vérifications enregistrées : scans de QR et recherches par conducteur.</p>
    </div>
    ${controlTabsHtml('/control/historique')}
    <div class="card">
      <div class="lc-filters lc-filters-flat">
        <div class="field"><label for="h-from">Du</label><input class="input" type="date" id="h-from" value="${historyState.from}"></div>
        <div class="field"><label for="h-to">Au</label><input class="input" type="date" id="h-to" value="${historyState.to}"></div>
      </div>
      <div class="recap-grid" style="margin-top:var(--s3)">
        <div class="recap-item"><span>Vérifications</span><strong>${rows.length}</strong></div>
        <div class="recap-item"><span>Valides</span><strong>${count('VERT')}</strong></div>
        <div class="recap-item"><span>À vérifier</span><strong>${count('ORANGE')}</strong></div>
        <div class="recap-item"><span>Refusés ou inconnus</span><strong>${count('ROUGE') + count('INCONNU')}</strong></div>
      </div>
    </div>
    <div class="stack gap-2" style="margin-top:var(--s3)">
      ${rows.length ? rows.map((r) => {
        const [label, cls] = VERDICT_BADGE[r.verdict] || VERDICT_BADGE.INCONNU;
        return `<div class="card lc-history-row">
          <span class="dd-modal-icon" aria-hidden="true">${icon(r.type === 'SCAN' ? 'scan' : 'userSearch', { size: 16 })}</span>
          <div class="lc-history-body">
            <div class="row-between" style="gap:var(--s2);flex-wrap:wrap"><strong>${escapeHtml(r.dutNumber || 'Aucun DUT identifié')}</strong><span class="badge ${cls}">${label}</span></div>
            <small>${escapeHtml(r.detail)}${r.postName ? ` · poste ${escapeHtml(r.postName)}` : ''}</small>
            <small>${formatDateTime(r.date)}</small>
          </div>
        </div>`;
      }).join('') : `<div class="card empty-state">${icon('history', { size: 36 })}<h3>Aucun contrôle sur cette période</h3></div>`}
    </div>
  `;
  bindControlTabs(container);
  container.querySelector('#h-from').addEventListener('change', (e) => { historyState.from = e.target.value; renderHistory(container); });
  container.querySelector('#h-to').addEventListener('change', (e) => { historyState.to = e.target.value; renderHistory(container); });
}
