// Lot d2 : plages de numéros — vue nationale OIC (stock par état, approvisionnement, transferts,
// validation, reprise, tarifs) et vue antenne (stock, vente au guichet vers un transporteur).
import { icon } from '../core/icons.js';
import { escapeHtml as esc, formatDate, formatDateTime, segmentedProgressHtml } from '../core/utils.js';
import { getCurrentUser } from '../core/auth.js';
import { openModal, toast, promptAction, confirmAction } from '../core/ui.js';
import { listAntennas } from '../services/directory.service.js';
import * as R from '../services/ranges.service.js';
import { pricing, amountsFor, savePricing } from '../services/range-pricing.service.js';
import { listPayments, PAYMENT_STATUS_LABELS, antennaSalesSummary } from '../services/payments.service.js';
import { header, kpi, badge, n, fcfa, table, formValues } from './lot-d2-ui.js';

const TABS = [['stock', 'Stock par état', 'layers'], ['transferts', 'Transferts', 'arrowLeftRight'], ['parametres', 'Tarifs et quantités', 'coins']];
const OP_TONE = { VALIDATED: 'success', TRANSFER_PENDING: 'warning', REJECTED: 'error', REVOKED: 'neutral', PENDING: 'warning', CANCELLED: 'neutral' };
const PAY_TONE = { A_ENCAISSER: 'error', ENCAISSE: 'warning', VALIDE: 'success', ANNULE: 'neutral' };
export const opBadge = (s) => badge(OP_TONE[s] || 'neutral', R.OPERATION_STATUS_LABELS[s] || s);
export const payBadge = (s) => (s ? badge(PAY_TONE[s] || 'neutral', PAYMENT_STATUS_LABELS[s] || s) : '<span class="text-muted">—</span>');
const rangeLabel = (o) => `${R.numberLabel(o.year, o.rangeStart)} à ${R.numberLabel(o.year, o.rangeEnd)}`;
/** Plage sur deux segments insécables : la cellule passe à la ligne entre les deux bornes plutôt que de déborder. */
const rangeHtml = (o) => `<span class="d2-mono d2-range"><span>${esc(R.numberLabel(o.year, o.rangeStart))}</span> <span>à ${esc(R.numberLabel(o.year, o.rangeEnd))}</span></span>`;
const amountsHtml = (a) => `<dl class="d2-amounts"><div><dt>Montant HT</dt><dd>${fcfa(a.ht)}</dd></div><div><dt>TVA (${n(a.tvaRate, 1)} %)</dt><dd>${fcfa(a.tva)}</dd></div><div><dt>Droit de timbre</dt><dd>${fcfa(a.stamp)}</dd></div><div class="is-total"><dt>Total TTC</dt><dd>${fcfa(a.ttc)}</dd></div></dl>`;

export function render(container, params = {}) {
  const user = getCurrentUser();
  if (user.role === 'ANTENNA_AGENT') return renderAntenna(container, user);
  return renderNational(container, TABS.some(([k]) => k === params.tab) ? params.tab : 'stock');
}

function paymentsByOperation() {
  const map = new Map();
  listPayments({}).filter((p) => p.operationId && p.status !== 'ANNULE').forEach((p) => map.set(p.operationId, p));
  return map;
}

// ------------------------------------------------------------- Vue antenne
function renderAntenna(container, user) {
  const s = R.antennaStock(user.antennaId);
  const sales = antennaSalesSummary(user.antennaId, {});
  const pays = paymentsByOperation();
  const canSell = s.status === 'ACTIVE' && s.disponible > 0;
  container.innerHTML = `
    ${header(`Antenne · ${s.antenna.name}`, 'Stock de numéros', 'Les plages confiées à votre antenne et leurs ventes au guichet aux transporteurs.', `<button type="button" class="btn btn-primary" id="rg-sell" ${canSell ? '' : 'disabled'}>${icon('arrowLeftRight', { size: 15 })} Vendre une plage</button>`)}
    ${s.status !== 'ACTIVE' ? `<div class="admin-note">Antenne ${s.status === 'CLOSED' ? 'fermée' : 'désactivée'} : aucune vente n’est possible.</div>` : ''}
    <div class="kpi-grid sup-kpis">
      ${kpi('Numéros disponibles', n(s.disponible), s.firstAvailable ? `prochain : ${R.numberLabel(s.year, s.firstAvailable)}` : 'stock épuisé', 'green', 'layers')}
      ${kpi('En attente de validation', n(s.enAttente), 'ventes soumises à l’OIC', 'amber', 'clock')}
      ${kpi('Numéros vendus', n(s.vendus), `${n(sales.ventes)} vente(s) validée(s)`, 'navy', 'arrowLeftRight')}
      ${kpi('Encaissements à valider', n(sales.aValider), 'par la caisse OIC', 'blue', 'wallet')}
    </div>
    <div class="sup-grid d2-top">
      <div class="sup-main">
        <div class="card"><div class="card-header"><h3>Ventes de l’antenne</h3><span class="text-muted">${n(s.transfers.length)}</span></div>
          ${table([
            ['Date', (o) => formatDate(o.requestedAt)], ['Vente', (o) => `<strong class="d2-nowrap">${esc(o.code)}</strong><small class="d2-sub">${esc(R.holderOf(o)?.name || '')}${o.receiptNo ? ` · reçu ${esc(o.receiptNo)}` : ''}</small>`],
            ['Numéros', (o) => `${rangeHtml(o)}`], ['Qté', (o) => n(o.quantity), 'num'], ['TTC', (o) => fcfa(o.amounts?.ttc), 'num'],
            ['Statut', (o) => `${opBadge(o.status)}<span class="d2-line">${payBadge(pays.get(o.id)?.status)}</span>`],
          ], s.transfers, 'Aucune vente pour le moment.')}
        </div>
      </div>
      <aside class="sup-side">
        <div class="card"><div class="card-header"><h3>Plages en stock</h3></div>
          ${s.allocations.length ? s.allocations.map((a) => `<div class="d2-alloc"><div class="row-between"><strong>${esc(a.code)}</strong>${a.status === 'ACTIVE' ? badge('success', 'Active') : badge('neutral', 'Reprise')}</div>
            <small class="d2-sub d2-mono">${esc(a.label)}</small>${segmentedProgressHtml(40, Math.round(((a.quantity - a.disponible) / a.quantity) * 40))}
            <div class="range-meta"><span>${n(a.vendus)} vendus · ${n(a.enAttente)} en attente</span><span class="fw-bold">${n(a.disponible)} / ${n(a.quantity)} disponibles</span></div></div>`).join('') : '<p class="sup-empty">Aucune plage confiée à l’antenne. L’OIC approvisionne les antennes.</p>'}
        </div>
        <div class="card"><div class="card-header"><h3>Règles de vente</h3></div><ul class="settings-help-list">
          <li>${icon('receipt', { size: 14 })}<span>Le numéro du reçu de caisse est obligatoire ; l’encaissement est validé par la caisse OIC.</span></li>
          <li>${icon('shield', { size: 14 })}<span>Le transporteur ne peut régler ses DUT avec ces numéros qu’après validation par l’OIC.</span></li>
          <li>${icon('layers', { size: 14 })}<span>Un bloc continu est prélevé à partir du premier numéro disponible.</span></li></ul></div>
      </aside>
    </div>`;
  container.querySelector('#rg-sell')?.addEventListener('click', () => openTransferModal({ antennaId: user.antennaId, fixed: true, onDone: () => renderAntenna(container, user) }));
}

// ------------------------------------------------------------- Vue nationale (OIC)
function renderNational(container, tab) {
  const data = R.nationalStock();
  container.innerHTML = `
    ${header('OIC · Ressources', 'Stock et transferts de plages', 'Stock de numéros par état, approvisionnement des antennes, ventes à valider et reprises.', `<button type="button" class="btn btn-secondary" id="rg-transfer">${icon('arrowLeftRight', { size: 15 })} Transférer une plage</button><button type="button" class="btn btn-primary" id="rg-allocate">${icon('plus', { size: 15 })} Approvisionner une antenne</button>`)}
    <div class="kpi-grid sup-kpis">
      ${kpi('En attente', n(data.states.attente), 'ventes d’antenne à valider', 'amber', 'clock')}
      ${kpi('Disponibles', n(data.states.disponible), 'antennes, partenaires et transporteurs', 'green', 'layers')}
      ${kpi('Utilisés', n(data.states.utilise), 'par des DUT validés', 'navy', 'file')}
      ${kpi('Retirés', n(data.states.retire), 'repris, non réutilisables', 'rose', 'undo2')}
      ${kpi('Demandes à instruire', n(data.requests.length), `<a href="#/oic/operations">Demandes des partenaires</a>`, 'blue', 'inbox')}
    </div>
    <div class="tabs-underline sup-tabs">${TABS.map(([k, l, i]) => `<a class="tab-count-btn ${k === tab ? 'active' : ''}" href="#/oic/plages/${k}">${icon(i, { size: 15 })} ${l}${k === 'transferts' && data.pendingTransfers.length ? ` <span class="count">${data.pendingTransfers.length}</span>` : ''}</a>`).join('')}</div>
    <div id="rg-body"></div>`;
  const body = container.querySelector('#rg-body');
  const rerender = () => renderNational(container, tab);
  if (tab === 'stock') stockTab(body, data, rerender);
  else if (tab === 'transferts') transfersTab(body, data, rerender);
  else settingsTab(body, rerender);
  container.querySelector('#rg-allocate').addEventListener('click', () => openAllocateModal(rerender));
  container.querySelector('#rg-transfer').addEventListener('click', () => openTransferModal({ onDone: rerender }));
}

function stockTab(body, data, rerender) {
  const pays = paymentsByOperation();
  const stocked = data.antennas.filter((a) => a.allocations.length);
  const partnerRanges = [...data.partners.flatMap((p) => p.plages), ...data.transporters.flatMap((t) => t.plages)]
    .map((o) => ({ ...o, holder: R.holderOf(o) }))
    .sort((a, b) => String(b.validatedAt || b.requestedAt).localeCompare(String(a.validatedAt || a.requestedAt)));
  body.innerHTML = `
    <div class="card st-card"><div class="card-header"><h3>Stock des antennes</h3><span class="text-muted">${n(stocked.length)} antenne(s) approvisionnée(s)</span></div>
      ${table([
        ['Antenne', (a) => `<strong>${esc(a.name)}</strong><small class="d2-sub">${esc(a.city)}</small>`],
        ['Plages', (a) => a.allocations.map((x) => `<span class="d2-line"><span class="d2-mono">${esc(x.code)}</span> ${x.status === 'ACTIVE' ? '' : badge('neutral', 'Reprise')}<small class="d2-sub d2-mono">${esc(x.label)}</small></span>`).join('')],
        ['Disponibles', (a) => n(a.disponible), 'num'], ['En attente', (a) => n(a.enAttente), 'num'], ['Vendus', (a) => n(a.vendus), 'num'],
        ['Statut', (a) => badge(a.status === 'ACTIVE' ? 'success' : a.status === 'INACTIVE' ? 'warning' : 'neutral', a.status === 'ACTIVE' ? 'Ouverte' : a.status === 'INACTIVE' ? 'Désactivée' : 'Fermée')],
        ['', (a) => `<div class="d2-row-actions">${a.disponible && a.status === 'ACTIVE' ? `<button type="button" class="btn btn-secondary btn-sm" data-sell="${esc(a.id)}">${icon('arrowLeftRight', { size: 13 })} Transférer</button>` : ''}${a.allocations.filter((x) => x.status === 'ACTIVE').map((x) => `<button type="button" class="btn btn-ghost btn-sm" data-revoke-alloc="${esc(x.id)}" title="Reprendre ${esc(x.code)}">${icon('undo2', { size: 13 })} Reprendre</button>`).join('')}</div>`, 'text-right'],
      ], stocked, 'Aucune antenne approvisionnée : utilisez « Approvisionner une antenne ».')}
    </div>
    <div class="card st-card"><div class="card-header"><h3>Plages des partenaires et des transporteurs</h3><span class="text-muted">${n(partnerRanges.length)}</span></div>
      ${table([
        ['Plage', (o) => `<strong class="d2-nowrap">${esc(o.code)}</strong><small class="d2-sub">${esc(o.holder.name)} · ${esc(R.HOLDER_LABELS[o.holder.type])}</small>`],
        ['Origine', (o) => esc(o.antennaName || 'Siège OIC')], ['Numéros', (o) => `${rangeHtml(o)}`],
        ['Utilisés', (o) => `${n(o.used || 0)} / ${n(o.quantity)}`, 'num'], ['Statut', (o) => opBadge(o.status)], ['Paiement', (o) => payBadge(pays.get(o.id)?.status)],
        ['', (o) => (o.status === 'VALIDATED' && o.used < o.quantity ? `<button type="button" class="btn btn-ghost btn-sm" data-revoke="${esc(o.id)}">${icon('undo2', { size: 13 })} Reprendre</button>` : ''), 'text-right'],
      ], partnerRanges, 'Aucune plage attribuée.')}
    </div>`;
  body.querySelectorAll('[data-sell]').forEach((b) => b.addEventListener('click', () => openTransferModal({ antennaId: b.dataset.sell, onDone: rerender })));
  body.querySelectorAll('[data-revoke]').forEach((b) => b.addEventListener('click', () => {
    const o = partnerRanges.find((x) => x.id === b.dataset.revoke);
    promptAction({ title: `Reprendre la plage ${o.code}`, text: `${n(o.quantity - o.used)} numéro(s) non utilisé(s) ${o.stockId ? 'retourneront au stock de l’antenne d’origine' : 'seront retirés'}. Les numéros déjà utilisés restent attachés aux DUT.`, label: 'Motif de la reprise', confirmLabel: 'Reprendre', danger: true,
      onConfirm: (reason) => { try { R.revokeRange(o.id, reason); toast({ type: 'success', title: 'Plage reprise' }); rerender(); } catch (ex) { toast({ type: 'error', title: 'Reprise impossible', desc: ex.message }); } } });
  }));
  body.querySelectorAll('[data-revoke-alloc]').forEach((b) => b.addEventListener('click', () => promptAction({
    title: 'Reprendre le stock de l’antenne', text: 'Les numéros non vendus seront retirés. Les plages déjà vendues restent à leurs transporteurs.', label: 'Motif de la reprise', confirmLabel: 'Reprendre', danger: true,
    onConfirm: (reason) => { try { R.revokeAllocation(b.dataset.revokeAlloc, reason); toast({ type: 'success', title: 'Stock repris' }); rerender(); } catch (ex) { toast({ type: 'error', title: 'Reprise impossible', desc: ex.message }); } },
  })));
}

function transfersTab(body, data, rerender) {
  const pays = paymentsByOperation();
  const history = R.listTransfers({}).filter((o) => o.status !== 'TRANSFER_PENDING');
  const me = getCurrentUser();
  body.innerHTML = `
    <div class="card st-card"><div class="card-header"><h3>Ventes d’antenne à valider</h3><span class="text-muted">${n(data.pendingTransfers.length)}</span></div>
      ${data.pendingTransfers.length ? `<div class="d2-cards">${data.pendingTransfers.map((o) => `
        <article class="d2-pending">
          <div class="row-between"><div><strong>${esc(o.code)} · ${esc(R.holderOf(o)?.name || '')}</strong><small class="d2-sub">Vendue par ${esc(o.requestedBy || '—')} (${esc(o.antennaName)}) le ${formatDateTime(o.requestedAt)}</small></div>${opBadge(o.status)}</div>
          <dl class="sup-identity d2-identity"><div><dt>Numéros</dt><dd class="d2-mono">${esc(rangeLabel(o))}</dd></div><div><dt>Quantité</dt><dd>${n(o.quantity)}</dd></div><div><dt>Reçu de caisse</dt><dd>${esc(o.receiptNo || '—')}</dd></div><div><dt>Montant TTC</dt><dd>${fcfa(o.amounts?.ttc)}</dd></div><div><dt>Encaissement</dt><dd>${payBadge(pays.get(o.id)?.status)}</dd></div></dl>
          <div class="row gap-2">${o.requestedById === me.id ? '<span class="hint">Saisie par vous : la validation revient à un autre administrateur.</span>' : `<button type="button" class="btn btn-primary btn-sm" data-ok="${esc(o.id)}">${icon('check', { size: 14 })} Valider le transfert</button><button type="button" class="btn btn-secondary btn-sm" data-ko="${esc(o.id)}">Refuser</button>`}</div>
        </article>`).join('')}</div>` : '<p class="sup-empty">Aucune vente en attente de validation.</p>'}
    </div>
    <div class="card st-card"><div class="card-header"><h3>Historique des transferts</h3><span class="text-muted">${n(history.length)}</span></div>
      ${table([
        ['Date', (o) => formatDate(o.requestedAt)], ['Transfert', (o) => `<strong class="d2-nowrap">${esc(o.code)}</strong><small class="d2-sub">${esc(o.antennaName)} → ${esc(R.holderOf(o)?.name || '')}</small>`],
        ['Numéros', (o) => `${rangeHtml(o)}`], ['Qté', (o) => n(o.quantity), 'num'], ['TTC', (o) => fcfa(o.amounts?.ttc), 'num'],
        ['Décision', (o) => `${opBadge(o.status)}<small class="d2-sub">${esc(o.decidedBy || '')}${o.rejectionReason ? ` · ${esc(o.rejectionReason)}` : ''}${o.revokeReason ? ` · ${esc(o.revokeReason)}` : ''}</small>`],
      ], history, 'Aucun transfert traité.')}
    </div>`;
  body.querySelectorAll('[data-ok]').forEach((b) => b.addEventListener('click', () => confirmAction({ title: 'Valider ce transfert ?', text: 'Les numéros deviennent disponibles dans le stock de références du transporteur.', confirmLabel: 'Valider', onConfirm: () => { try { R.decideTransfer(b.dataset.ok, true); toast({ type: 'success', title: 'Transfert validé' }); rerender(); } catch (ex) { toast({ type: 'error', title: 'Validation impossible', desc: ex.message }); } } })));
  body.querySelectorAll('[data-ko]').forEach((b) => b.addEventListener('click', () => promptAction({ title: 'Refuser le transfert', text: 'Les numéros reviennent au stock de l’antenne ; l’encaissement non validé est annulé.', label: 'Motif du refus', confirmLabel: 'Refuser', danger: true, onConfirm: (reason) => { try { R.decideTransfer(b.dataset.ko, false, reason); toast({ type: 'success', title: 'Transfert refusé' }); rerender(); } catch (ex) { toast({ type: 'error', title: 'Refus impossible', desc: ex.message }); } } })));
}

function settingsTab(body, rerender) {
  const p = pricing();
  const unit = (name, label, value, suffix, hint, attrs) => `<label class="field"><span>${esc(label)} <span class="req">*</span></span><div class="input-unit"><input class="input" name="${name}" type="number" required value="${esc(value)}" ${attrs}><b>${suffix}</b></div><small class="hint">${esc(hint)}</small></label>`;
  body.innerHTML = `<div class="settings-layout d2-top"><form id="price-form" class="admin-form settings-form">
    <section class="card settings-section"><div class="settings-head"><span class="settings-icon" style="background:var(--success-soft);color:var(--success)">${icon('coins', { size: 18 })}</span><div><h2>Tarif des références</h2><p>Montants figés sur chaque vente au moment où elle est enregistrée ; les ventes passées ne changent pas.</p></div></div>
      <div class="settings-grid">${unit('unitHT', 'Prix unitaire hors taxes', p.unitHT, 'FCFA', 'Par numéro de DUT.', 'min="0" max="1000000" step="1"')}${unit('tvaRate', 'Taux de TVA', p.tvaRate, '%', 'Entre 0 et 100 %.', 'min="0" max="100" step="0.01"')}${unit('stamp', 'Droit de timbre', p.stamp, 'FCFA', 'Par vente (un reçu).', 'min="0" max="100000" step="1"')}</div></section>
    <section class="card settings-section"><div class="settings-head"><span class="settings-icon" style="background:var(--navy-soft);color:var(--navy-2)">${icon('layers', { size: 18 })}</span><div><h2>Quantités proposées</h2><p>Valeurs pré-remplies dans les formulaires de demande et d’approvisionnement.</p></div></div>
      <div class="settings-grid">${unit('quantity', 'Demande d’un partenaire', p.quantity, 'numéros', 'Entre 1 et 10 000.', 'min="1" max="10000" step="1"')}${unit('antennaQuantity', 'Approvisionnement d’une antenne', p.antennaQuantity, 'numéros', 'Entre 1 et 50 000.', 'min="1" max="50000" step="1"')}</div></section>
    <div class="settings-bar"><span class="text-muted">Modification journalisée dans le journal d’audit.</span><button class="btn btn-primary" type="submit">${icon('check', { size: 15 })} Enregistrer les tarifs</button></div>
  </form>
  <aside class="settings-aside"><section class="card settings-summary"><div class="card-header"><h3>Exemple : plage de ${n(p.quantity)} numéros</h3></div><div id="price-example">${amountsHtml(amountsFor(p.quantity, p))}</div></section>
    <section class="card settings-help"><div class="card-header"><h3>Repères</h3></div><ul class="settings-help-list"><li>${icon('info', { size: 14 })}<span>Le droit de timbre est appliqué une fois par vente, comme sur un reçu. Valeur de démonstration à confirmer par la comptabilité OIC.</span></li><li>${icon('receipt', { size: 14 })}<span>Le rapport des ventes reprend les montants HT, TVA, timbre et TTC de chaque vente.</span></li></ul></section></aside></div>`;
  const form = body.querySelector('#price-form');
  form.addEventListener('input', () => { const v = formValues(form); body.querySelector('#price-example').innerHTML = amountsHtml(amountsFor(Number(v.quantity) || 0, { unitHT: Number(v.unitHT) || 0, tvaRate: Number(v.tvaRate) || 0, stamp: Number(v.stamp) || 0 })); });
  form.addEventListener('submit', (e) => { e.preventDefault(); try { savePricing(formValues(form)); toast({ type: 'success', title: 'Tarifs enregistrés' }); rerender(); } catch (ex) { toast({ type: 'error', title: 'Tarifs non enregistrés', desc: ex.message }); } });
}

// ------------------------------------------------------------- Modales
function openAllocateModal(onDone) {
  const antennas = listAntennas().filter((a) => (a.status || 'ACTIVE') === 'ACTIVE');
  const p = pricing();
  openModal({
    icon: 'layers', title: 'Approvisionner une antenne', text: 'Une plage nouvelle, sans chevauchement avec les plages existantes, est confiée à l’antenne.', confirmLabel: 'Approvisionner',
    bodyHtml: `<form class="admin-form" id="alloc-form"><label class="field"><span>Antenne <span class="req">*</span></span><select class="select" name="antennaId" required><option value="">Choisir…</option>${antennas.map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('')}</select></label>
      <label class="field"><span>Quantité <span class="req">*</span></span><input class="input" type="number" name="quantity" min="1" max="50000" required value="${p.antennaQuantity}"></label>
      <p class="hint" id="alloc-preview"></p><p role="alert" class="error-msg" id="alloc-error"></p></form>`,
    onConfirm: ({ root, close }) => {
      const f = root.querySelector('#alloc-form'); if (!f.reportValidity()) return;
      const v = formValues(f);
      try { const a = R.allocateToAntenna(v.antennaId, Number(v.quantity)); close(); toast({ type: 'success', title: 'Antenne approvisionnée', desc: `${a.code} : ${R.numberLabel(a.year, a.rangeStart)} à ${R.numberLabel(a.year, a.rangeEnd)}` }); onDone(); }
      catch (ex) { root.querySelector('#alloc-error').textContent = ex.message; }
    },
  });
  const root = document.querySelector('#alloc-form');
  const preview = () => { const q = Number(root.elements.quantity.value) || 0; const y = new Date().getFullYear(); const s = R.nextFreeStart(y); root.querySelector('#alloc-preview').textContent = q > 0 ? `Plage prévue : ${R.numberLabel(y, s)} à ${R.numberLabel(y, s + q - 1)}.` : ''; };
  root.elements.quantity.addEventListener('input', preview); preview();
}

export function openTransferModal({ antennaId = '', fixed = false, onDone = () => {} } = {}) {
  const user = getCurrentUser();
  const isAgent = user.role === 'ANTENNA_AGENT';
  const antennas = listAntennas().filter((a) => (a.status || 'ACTIVE') === 'ACTIVE');
  const transporters = R.listTransporterClients();
  const p = pricing();
  const modal = openModal({
    icon: 'arrowLeftRight', title: isAgent ? 'Vendre une plage au guichet' : 'Transférer une plage à un transporteur', large: true,
    text: isAgent ? 'Le bloc est prélevé sur le stock de votre antenne. La vente sera validée par l’OIC, l’encaissement par la caisse.' : 'Transfert émis par l’OIC : validé d’office, créance transmise à la caisse.',
    confirmLabel: isAgent ? 'Enregistrer la vente' : 'Transférer',
    bodyHtml: `<form class="admin-form d2-modal-form" id="tr-form" novalidate>
      <div class="field-row">
        ${fixed ? `<input type="hidden" name="antennaId" value="${esc(antennaId)}">` : `<label class="field"><span>Antenne d’origine <span class="req">*</span></span><select class="select" name="antennaId"><option value="">Choisir…</option>${antennas.map((a) => `<option value="${esc(a.id)}" ${a.id === antennaId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>`}
        <label class="field"><span>Transporteur bénéficiaire <span class="req">*</span></span><select class="select" name="transporterId"><option value="">Choisir…</option>${transporters.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select></label>
      </div>
      <p class="hint" id="tr-blocks"></p>
      <div class="field-row"><label class="field"><span>Premier numéro <span class="req">*</span></span><input class="input" type="number" name="start" min="1"></label><label class="field"><span>Quantité <span class="req">*</span></span><input class="input" type="number" name="quantity" min="1" max="10000" value="${p.quantity}"></label></div>
      <p class="hint" id="tr-range"></p>
      <div id="tr-amounts"></div>
      <div class="field-row"><label class="field"><span>Numéro du reçu de caisse${isAgent ? ' <span class="req">*</span>' : ''}</span><input class="input" name="receiptNo" maxlength="40" placeholder="RC-…"></label><label class="field">Commentaire<input class="input" name="commentaire" maxlength="200"></label></div>
      <p role="alert" class="error-msg" id="tr-error"></p></form>`,
    onConfirm: ({ root, close }) => {
      const v = formValues(root.querySelector('#tr-form'));
      try { const op = R.transferRange({ ...v, start: Number(v.start), quantity: Number(v.quantity) }); close(); toast({ type: 'success', title: isAgent ? 'Vente enregistrée' : 'Plage transférée', desc: `${op.code} · ${op.transporterName}${isAgent ? ' · en attente de validation OIC' : ''}` }); onDone(); }
      catch (ex) { root.querySelector('#tr-error').textContent = ex.message; }
    },
  });
  const form = modal.root.querySelector('#tr-form');
  let stock = null;
  const refreshStock = () => {
    const id = form.elements.antennaId.value;
    stock = id ? R.antennaStock(id) : null;
    const blocks = stock ? stock.allocations.filter((a) => a.status === 'ACTIVE').flatMap((a) => a.intervals.map(([s, e]) => ({ year: a.year, s, e }))) : [];
    form.querySelector('#tr-blocks').textContent = !id ? 'Choisissez l’antenne d’origine.' : blocks.length ? `Blocs disponibles : ${blocks.map((b) => `${R.numberLabel(b.year, b.s)} à ${R.numberLabel(b.year, b.e)} (${n(b.e - b.s + 1)})`).join(' ; ')}` : 'Aucun numéro disponible dans ce stock.';
    form.elements.start.value = stock?.firstAvailable || '';
    update();
  };
  const update = () => {
    const q = Number(form.elements.quantity.value) || 0; const s = Number(form.elements.start.value) || 0;
    form.querySelector('#tr-range').textContent = q > 0 && s > 0 && stock ? `Plage vendue : ${R.numberLabel(stock.year, s)} à ${R.numberLabel(stock.year, s + q - 1)}` : '';
    form.querySelector('#tr-amounts').innerHTML = q > 0 ? amountsHtml(amountsFor(q, p)) : '';
  };
  form.elements.antennaId.addEventListener?.('change', refreshStock);
  form.elements.quantity.addEventListener('input', update); form.elements.start.addEventListener('input', update);
  refreshStock();
}

