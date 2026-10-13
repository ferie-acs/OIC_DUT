// Lot d2 : rapport des ventes de références (HT, TVA, droit de timbre, TTC) par période,
// client (partenaire ou transporteur) et antenne, avec export CSV.
import { icon } from '../core/icons.js';
import { escapeHtml as esc, formatDate } from '../core/utils.js';
import { salesReport, filterOptions, PAYMENT_STATUS_LABELS, CLIENT_TYPE_LABELS } from '../services/payments.service.js';
import { toCsv } from '../services/supervision.service.js';
import { getCurrentUser } from '../core/auth.js';
import { header, kpi, n, fcfa, table, pillSelect, pillDate, downloadCsv, isoDay } from './lot-d2-ui.js';
import { payBadge } from './ranges.view.js';

const GROUPS = [{ id: 'client', name: 'Client' }, { id: 'antenne', name: 'Antenne' }, { id: 'jour', name: 'Jour' }];
const state = { from: '', to: '', clientId: '', antennaId: '', groupBy: 'client' };

export function render(container) {
  if (!state.from && !state.to) { state.from = isoDay(-90); state.to = isoDay(0); }
  const opts = filterOptions();
  const user = getCurrentUser();
  container.innerHTML = `
    ${header(user.role === 'CASHIER' ? 'Caisse et comptabilité OIC' : 'OIC · Caisse', 'Rapport des ventes de références', 'Plages attribuées aux partenaires ou vendues aux transporteurs sur la période, aux montants figés lors de la vente.', `<button type="button" class="btn btn-secondary" id="sr-export">${icon('download', { size: 15 })} Exporter (CSV)</button>`)}
    <div class="st-filters">
      ${pillDate('sr-from', 'Du', state.from)}${pillDate('sr-to', 'Au', state.to)}
      <div class="plan-nav st-presets"><button type="button" class="plan-nav-btn" data-days="30">30 j</button><button type="button" class="plan-nav-btn" data-days="90">90 j</button><button type="button" class="plan-nav-btn" data-days="365">12 mois</button><button type="button" class="plan-nav-btn" data-days="0">Tout</button></div>
      ${pillSelect('sr-client', 'Client', opts.clients, state.clientId, 'Tous')}
      ${pillSelect('sr-antenna', 'Antenne', opts.antennas, state.antennaId, 'Toutes')}
      ${pillSelect('sr-group', 'Regrouper par', GROUPS, state.groupBy, null)}
    </div>
    <div id="sr-body"></div>`;
  let report = null;
  const draw = () => {
    report = salesReport(state);
    const t = report.total;
    const label = GROUPS.find((g) => g.id === report.groupBy)?.name || '';
    container.querySelector('#sr-body').innerHTML = `
      <p class="st-period">Période : <strong>${state.from ? formatDate(state.from) : 'origine'}</strong> → <strong>${state.to ? formatDate(state.to) : 'aujourd’hui'}</strong> · ${n(t.ventes)} vente(s)</p>
      <div class="kpi-grid sup-kpis">
        ${kpi('Références vendues', n(t.quantite), `${n(t.ventes)} vente(s)`, 'navy', 'layers')}
        ${kpi('Montant HT', fcfa(t.ht), '', 'blue', 'coins')}
        ${kpi('TVA', fcfa(t.tva), '', 'amber', 'receipt')}
        ${kpi('Droit de timbre', fcfa(t.timbre), '', 'violet', 'receipt')}
        ${kpi('Total TTC', fcfa(t.ttc), `${fcfa(t.encaisseValide)} encaissés et validés`, 'green', 'banknote')}
      </div>
      <div class="card st-card"><div class="card-header"><h3>Synthèse par ${esc(label.toLowerCase())}</h3></div>
        ${table([[label, (g) => `<strong>${esc(report.groupBy === 'jour' ? formatDate(g.key) : g.label)}</strong>`], ['Ventes', (g) => n(g.ventes), 'num'], ['Références', (g) => n(g.quantite), 'num'], ['HT', (g) => fcfa(g.ht), 'num'], ['TVA', (g) => fcfa(g.tva), 'num'], ['Timbre', (g) => fcfa(g.timbre), 'num'], ['TTC', (g) => `<strong>${fcfa(g.ttc)}</strong>`, 'num'], ['Encaissé validé', (g) => fcfa(g.encaisseValide), 'num']], report.grouped, 'Aucune vente sur la période.')}
      </div>
      <div class="card st-card"><div class="card-header"><h3>Détail des ventes</h3></div>
        ${table([['Date', (r) => formatDate(r.date)], ['Plage', (r) => `<strong class="d2-nowrap">${esc(r.code)}</strong>${r.repris ? `<small class="d2-sub">${n(r.repris)} numéro(s) repris</small>` : ''}`], ['Client', (r) => `${esc(r.partnerName)}<small class="d2-sub">${esc(CLIENT_TYPE_LABELS[r.clientType] || '')}</small>`], ['Antenne', (r) => esc(r.antennaName)], ['Qté', (r) => n(r.quantite), 'num'], ['Prix HT', (r) => fcfa(r.prixHT), 'num'], ['HT', (r) => fcfa(r.ht), 'num'], ['TVA', (r) => fcfa(r.tva), 'num'], ['Timbre', (r) => fcfa(r.timbre), 'num'], ['TTC', (r) => fcfa(r.ttc), 'num'], ['Paiement', (r) => (r.statutPaiement === 'SANS_CREANCE' ? '<span class="text-muted">Sans créance</span>' : payBadge(r.statutPaiement))]], report.rows, 'Aucune vente sur la période.')}
      </div>`;
  };
  draw();
  const bind = (id, key) => container.querySelector(id).addEventListener('change', (e) => { state[key] = e.target.value; e.target.closest('.plan-pill')?.classList.toggle('is-set', !!e.target.value); draw(); });
  bind('#sr-from', 'from'); bind('#sr-to', 'to'); bind('#sr-client', 'clientId'); bind('#sr-antenna', 'antennaId'); bind('#sr-group', 'groupBy');
  container.querySelectorAll('[data-days]').forEach((b) => b.addEventListener('click', () => {
    const d = Number(b.dataset.days); state.from = d ? isoDay(-d) : ''; state.to = d ? isoDay(0) : '';
    container.querySelector('#sr-from').value = state.from; container.querySelector('#sr-to').value = state.to; draw();
  }));
  container.querySelector('#sr-export').addEventListener('click', () => downloadCsv(`ventes-references-${state.from || 'origine'}-${state.to || 'jour'}.csv`, toCsv(report.rows.map((r) => ({
    date: r.date.slice(0, 10), plage: r.code, client: r.partnerName, type_client: CLIENT_TYPE_LABELS[r.clientType] || '', antenne: r.antennaName, quantite: r.quantite, prix_unitaire_ht: r.prixHT,
    montant_ht: r.ht, taux_tva: r.tauxTva, tva: r.tva, droit_de_timbre: r.timbre, montant_ttc: r.ttc, numeros_repris: r.repris,
    paiement: r.statutPaiement === 'SANS_CREANCE' ? 'Sans créance' : PAYMENT_STATUS_LABELS[r.statutPaiement], encaisse_valide: r.encaisseValide,
  })))));
}
