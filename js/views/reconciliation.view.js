// Lot d2 : rapprochement des numéros achetés, des DUT édités, des préimprimés et des paiements.
import { icon } from '../core/icons.js';
import { escapeHtml as esc, formatDate, formatDateTime } from '../core/utils.js';
import { getCurrentUser } from '../core/auth.js';
import { promptAction, toast } from '../core/ui.js';
import { reconcile, justify, partnerOptions } from '../services/reconciliation.service.js';
import { PAYMENT_KINDS } from '../services/payments.service.js';
import { toCsv } from '../services/supervision.service.js';
import { header, kpi, n, fcfa, table, pillSelect, pillDate, downloadCsv, isoDay, badge } from './lot-d2-ui.js';
import { payBadge } from './ranges.view.js';

const state = { partnerId: '', from: '', to: '' };

export function render(container) {
  const user = getCurrentUser();
  const partners = partnerOptions();
  if (!state.from && !state.to) { state.from = isoDay(-90); state.to = isoDay(0); }
  if (!partners.some((p) => p.id === state.partnerId)) state.partnerId = partners[0]?.id || '';
  const isPartner = user.role === 'PARTNER_ADMIN';
  container.innerHTML = `
    ${header(isPartner ? `Partenaire · ${user.partnerName || ''}` : user.role === 'CASHIER' ? 'Caisse et comptabilité OIC' : 'OIC · Contrôle', 'Rapprochement', 'Numéros achetés, DUT édités, préimprimés consommés et paiements, mis en regard sur une période. Les écarts sont signalés et peuvent être justifiés.', `<button type="button" class="btn btn-secondary" id="rc-export">${icon('download', { size: 15 })} Exporter les écarts (CSV)</button>`)}
    <div class="st-filters">
      ${isPartner ? '' : pillSelect('rc-partner', 'Partenaire', partners, state.partnerId, null)}
      ${pillDate('rc-from', 'Du', state.from)}${pillDate('rc-to', 'Au', state.to)}
      <div class="plan-nav st-presets"><button type="button" class="plan-nav-btn" data-days="30">30 j</button><button type="button" class="plan-nav-btn" data-days="90">90 j</button><button type="button" class="plan-nav-btn" data-days="365">12 mois</button></div>
    </div>
    <div id="rc-body"></div>`;
  let data = null;
  const draw = () => {
    data = reconcile(state);
    const t = data.totals;
    const open = data.ecarts.filter((e) => !e.justification);
    container.querySelector('#rc-body').innerHTML = `
      <p class="st-period">${esc(data.partner.name)} · du <strong>${formatDate(state.from)}</strong> au <strong>${formatDate(state.to)}</strong></p>
      <div class="kpi-grid sup-kpis">
        ${kpi('Numéros achetés', n(t.achetes), `${n(t.plages)} plage(s) sur la période`, 'navy', 'layers')}
        ${kpi('DUT édités', n(t.dutEdites), 'numérotés sur la période', 'blue', 'file')}
        ${kpi('Préimprimés consommés', n(t.preimprimes), `${n(t.dutImprimes)} DUT imprimé(s)`, 'violet', 'receipt')}
        ${kpi('Montant dû', fcfa(t.du), 'achats de la période (TTC)', 'amber', 'coins')}
        ${kpi('Paiements validés', fcfa(t.valide), `${fcfa(t.encaisse)} encaissés`, t.valide >= t.du ? 'green' : 'rose', 'checkCircle')}
      </div>
      <div class="card st-card"><div class="card-header"><h3>Écarts</h3>${open.length ? badge('error', `${open.length} à traiter`) : badge('success', 'Aucun écart ouvert')}</div>
        ${data.ecarts.length ? `<ul class="d2-gaps">${data.ecarts.map((e) => `<li class="d2-gap-item">
          <span class="st-alert is-${e.justification ? 'ok' : e.niveau}">${icon(e.justification ? 'checkCircle' : e.niveau === 'error' ? 'alertTriangle' : 'alertCircle', { size: 14 })} ${e.justification ? 'Justifié' : e.niveau === 'error' ? 'À corriger' : 'À vérifier'}</span>
          <div class="d2-gap-body"><strong>${esc(e.label)}</strong><small>${esc(e.detail)}</small>${e.justification ? `<small class="d2-just">${icon('edit', { size: 12 })} ${esc(e.justification.text)} — ${esc(e.justification.by)}, ${formatDateTime(e.justification.at)}</small>` : ''}</div>
          <button type="button" class="btn btn-ghost btn-sm" data-justify="${esc(e.key)}">${e.justification ? 'Modifier la justification' : 'Justifier'}</button></li>`).join('')}</ul>` : `<p class="sup-empty">${icon('checkCircle', { size: 14 })} Achats, documents, préimprimés et paiements concordent sur la période.</p>`}
      </div>
      <div class="card st-card"><div class="card-header"><h3>Plages du partenaire</h3><span class="text-muted">toutes périodes</span></div>
        ${table([['Plage', (r) => `<strong class="d2-nowrap">${esc(r.code)}</strong><small class="d2-sub">${esc(r.antenne)} · ${formatDate(r.acquiredAt)}</small>`], ['Numéros', (r) => `<span class="d2-mono">${esc(r.plage)}</span>`], ['Achetés', (r) => n(r.achetes), 'num'], ['Consommés', (r) => n(r.utilises), 'num'], ['DUT retrouvés', (r) => (r.utilises !== r.dutRetrouves && r.status !== 'TRANSFER_PENDING' ? `<span class="sup-neg">${n(r.dutRetrouves)}</span>` : n(r.dutRetrouves)), 'num'], ['Préimprimés', (r) => n(r.impressions), 'num'], ['Dû TTC', (r) => fcfa(r.du), 'num'], ['Paiement', (r) => (r.paiement === 'SANS_CREANCE' ? badge('error', 'Sans créance') : payBadge(r.paiement))]], data.plages, 'Aucune plage.')}
      </div>
      <div class="st-two d2-two">
        <div class="card"><div class="card-header"><h3>Paiements de la période</h3></div>
          ${table([['Référence', (p) => `<strong>${esc(p.ref)}</strong><small class="d2-sub">${esc(PAYMENT_KINDS[p.kind])}</small>`], ['TTC', (p) => fcfa(p.ttc), 'num'], ['Statut', (p) => payBadge(p.status)]], data.paiements, 'Aucun paiement sur la période.')}
        </div>
        <div class="card"><div class="card-header"><h3>DUT édités sur la période</h3></div>
          ${table([['N° DUT', (d) => `<span class="d2-mono">${esc(d.dutNumber)}</span><small class="d2-sub">${formatDate(d.validatedAt)}</small>`], ['Plage', (d) => (d.plage ? esc(d.plage) : '<span class="sup-neg">Hors plage</span>')], ['Impr.', (d) => n(d.impressions), 'num'], ['Réglé', (d) => (d.couvert ? badge('success', 'Oui') : badge('warning', 'Non'))]], data.duts, 'Aucun DUT sur la période.')}
        </div>
      </div>
      <p class="ops-footnote">Préimprimés : dans cette démonstration, chaque impression enregistrée d’un DUT consomme un préimprimé ; le stock physique des préimprimés n’est pas géré.</p>`;
  };
  draw();
  const bind = (id, key) => container.querySelector(id)?.addEventListener('change', (e) => { state[key] = e.target.value; draw(); });
  bind('#rc-partner', 'partnerId'); bind('#rc-from', 'from'); bind('#rc-to', 'to');
  container.querySelectorAll('[data-days]').forEach((b) => b.addEventListener('click', () => { state.from = isoDay(-Number(b.dataset.days)); state.to = isoDay(0); container.querySelector('#rc-from').value = state.from; container.querySelector('#rc-to').value = state.to; draw(); }));
  container.querySelector('#rc-body').addEventListener('click', (e) => {
    const b = e.target.closest('[data-justify]'); if (!b) return;
    const ecart = data.ecarts.find((x) => x.key === b.dataset.justify);
    promptAction({ title: 'Justifier l’écart', text: ecart.label, label: 'Justification', confirmLabel: 'Enregistrer', onConfirm: (text) => { try { justify(data.partner.id, ecart.key, text); toast({ type: 'success', title: 'Justification enregistrée' }); draw(); } catch (ex) { toast({ type: 'error', title: 'Justification refusée', desc: ex.message }); } } });
  });
  container.querySelector('#rc-export').addEventListener('click', () => downloadCsv(`rapprochement-${data.partner.name.replace(/\W+/g, '-').toLowerCase()}-${state.from}-${state.to}.csv`, toCsv(data.ecarts.map((e) => ({ partenaire: data.partner.name, du: state.from, au: state.to, type: e.code, niveau: e.niveau === 'error' ? 'À corriger' : 'À vérifier', ecart: e.label, detail: e.detail, justification: e.justification?.text || '', justifie_par: e.justification?.by || '' })))));
}
