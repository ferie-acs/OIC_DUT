// Lot d2 : encaissements (caisse et comptabilité OIC, antenne au guichet, administration OIC).
// Saisie de l'encaissement, puis validation ou rejet par une autre personne que la saisie.
import { icon } from '../core/icons.js';
import { escapeHtml as esc, formatDate, formatDateTime } from '../core/utils.js';
import { getCurrentUser } from '../core/auth.js';
import { can } from '../core/permissions.js';
import { openModal, toast, promptAction, confirmAction } from '../core/ui.js';
import * as P from '../services/payments.service.js';
import { toCsv } from '../services/supervision.service.js';
import { amountsFor } from '../services/range-pricing.service.js';
import { header, kpi, n, fcfa, pillSelect, pillDate, downloadCsv, formValues } from './lot-d2-ui.js';
import { payBadge } from './ranges.view.js';

const filters = { status: '', kind: '', clientId: '', antennaId: '', from: '', to: '' };

export function render(container) {
  const user = getCurrentUser();
  const opts = P.filterOptions();
  const scopeLabel = user.role === 'ANTENNA_AGENT' ? `Antenne · ${user.antennaName || ''}` : user.role === 'CASHIER' ? 'Caisse et comptabilité OIC' : 'OIC · Caisse';
  container.innerHTML = `
    ${header(scopeLabel, 'Encaissements', 'Achats de plages et frais DUT : encaissement au guichet ou paiement simulé, puis validation par une autre personne que celle qui a saisi.', `
      ${can(user, 'payments.record') ? `<button type="button" class="btn btn-secondary" id="pay-fees">${icon('receipt', { size: 15 })} Frais DUT au guichet</button>` : ''}
      <button type="button" class="btn btn-secondary" id="pay-export">${icon('download', { size: 15 })} Exporter (CSV)</button>`)}
    <div class="kpi-grid sup-kpis" id="pay-kpis"></div>
    <div class="st-filters">
      ${pillSelect('pf-status', 'Statut', Object.entries(P.PAYMENT_STATUS_LABELS).map(([id, name]) => ({ id, name })), filters.status, 'Tous')}
      ${pillSelect('pf-kind', 'Objet', Object.entries(P.PAYMENT_KINDS).map(([id, name]) => ({ id, name })), filters.kind, 'Tous')}
      ${pillSelect('pf-client', 'Client', opts.clients, filters.clientId, 'Tous')}
      ${user.role === 'ANTENNA_AGENT' ? '' : pillSelect('pf-antenna', 'Antenne', opts.antennas, filters.antennaId, 'Toutes')}
      ${pillDate('pf-from', 'Du', filters.from)}${pillDate('pf-to', 'Au', filters.to)}
    </div>
    <p class="ant-note">${icon('info', { size: 14 })} Paiements mobile money et carte <strong>simulés</strong> : aucune transaction réelle n’est effectuée dans cette démonstration.</p>
    <section class="card sup-table-card"><div class="table-wrap"><table class="data-table sup-table"><thead><tr><th scope="col">Référence</th><th scope="col">Client</th><th scope="col">Objet</th><th scope="col" class="num">Montant TTC</th><th scope="col">Encaissement</th><th scope="col">Statut</th><th scope="col"></th></tr></thead><tbody id="pay-rows"></tbody></table></div></section>`;

  let rows = [];
  const draw = () => {
    rows = P.listPayments(filters);
    const sum = P.summarize(rows);
    container.querySelector('#pay-kpis').innerHTML = [
      kpi('À encaisser', fcfa(sum.aEncaisser.amount), `${n(sum.aEncaisser.count)} créance(s)`, 'rose', 'wallet'),
      kpi('Encaissés à valider', fcfa(sum.aValider.amount), `${n(sum.aValider.count)} saisie(s)`, 'amber', 'clock'),
      kpi('Paiements validés', fcfa(sum.valides.amount), `${n(sum.valides.count)} paiement(s)`, 'green', 'checkCircle'),
      kpi('Opérations', n(rows.length), 'dans la sélection', 'navy', 'receipt'),
    ].join('');
    container.querySelector('#pay-rows').innerHTML = rows.length ? rows.map((p) => {
      const mine = p.recordedBy?.id === user.id;
      const actions = [
        p.status === 'A_ENCAISSER' && (can(user, 'payments.record') || can(user, 'payments.pay')) ? `<button type="button" class="btn btn-primary btn-sm" data-collect="${esc(p.id)}">${icon('wallet', { size: 13 })} Encaisser</button>` : '',
        p.status === 'ENCAISSE' && can(user, 'payments.validate') && !mine ? `<button type="button" class="btn btn-primary btn-sm" data-validate="${esc(p.id)}">${icon('check', { size: 13 })} Valider</button><button type="button" class="btn btn-ghost btn-sm" data-reject="${esc(p.id)}">Rejeter</button>` : '',
        p.status === 'ENCAISSE' && mine ? '<small class="d2-sub">Saisi par vous : validation par une autre personne</small>' : '',
      ].join('');
      return `<tr>
        <td><button type="button" class="link-action d2-link" data-detail="${esc(p.id)}">${esc(p.ref)}</button><small class="d2-sub">${formatDate(p.createdAt)}</small></td>
        <td><strong>${esc(p.partnerName)}</strong><small class="d2-sub">${esc(P.CLIENT_TYPE_LABELS[p.clientType || 'PARTENAIRE'])} · ${esc(p.antennaName || '')}</small></td>
        <td>${esc(P.PAYMENT_KINDS[p.kind])}<small class="d2-sub">${p.kind === 'PLAGE' ? esc(p.operationCode || '') : `${n((p.dutIds || []).length)} DUT`} · ${n(p.quantity)} numéro(s)</small></td>
        <td class="num"><strong>${fcfa(p.ttc)}</strong><small class="d2-sub">HT ${fcfa(p.ht)} · TVA ${fcfa(p.tva)} · timbre ${fcfa(p.stamp)}</small></td>
        <td>${p.method ? esc(P.PAYMENT_METHODS[p.method]) : '<span class="text-muted">—</span>'}<small class="d2-sub">${p.receiptNo ? `Reçu ${esc(p.receiptNo)}` : p.transactionRef ? `Transaction ${esc(p.transactionRef)}` : ''}${p.recordedBy ? ` · ${esc(p.recordedBy.name)}` : ''}</small></td>
        <td>${payBadge(p.status)}${p.validatedBy ? `<small class="d2-sub">par ${esc(p.validatedBy.name)}</small>` : ''}</td>
        <td class="text-right"><div class="d2-row-actions">${actions}</div></td></tr>`;
    }).join('') : '<tr><td class="table-empty" colspan="7">Aucun paiement ne correspond.</td></tr>';
  };
  draw();

  const bind = (id, key) => container.querySelector(id)?.addEventListener('change', (e) => { filters[key] = e.target.value; e.target.closest('.plan-pill').classList.toggle('is-set', !!e.target.value); draw(); });
  bind('#pf-status', 'status'); bind('#pf-kind', 'kind'); bind('#pf-client', 'clientId'); bind('#pf-antenna', 'antennaId'); bind('#pf-from', 'from'); bind('#pf-to', 'to');
  container.querySelector('#pay-export').addEventListener('click', () => downloadCsv(`encaissements-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows.map((p) => ({
    reference: p.ref, date: p.createdAt?.slice(0, 10), objet: P.PAYMENT_KINDS[p.kind], plage: p.operationCode || (p.dutNumbers || []).join(' '), client: p.partnerName, type_client: P.CLIENT_TYPE_LABELS[p.clientType || 'PARTENAIRE'], antenne: p.antennaName || '',
    quantite: p.quantity, ht: p.ht, tva: p.tva, timbre: p.stamp, ttc: p.ttc, mode: p.method ? P.PAYMENT_METHODS[p.method] : '', recu: p.receiptNo || p.transactionRef || '',
    saisi_par: p.recordedBy?.name || '', valide_par: p.validatedBy?.name || '', statut: P.PAYMENT_STATUS_LABELS[p.status],
  })))));
  container.querySelector('#pay-fees')?.addEventListener('click', () => openFeesModal(opts.partners, draw));
  container.querySelector('#pay-rows').addEventListener('click', (e) => {
    const t = e.target.closest('[data-collect],[data-validate],[data-reject],[data-detail]'); if (!t) return;
    const p = rows.find((x) => x.id === (t.dataset.collect || t.dataset.validate || t.dataset.reject || t.dataset.detail));
    if (t.dataset.collect) openCollectModal(p, draw);
    else if (t.dataset.validate) confirmAction({ title: `Valider le paiement ${p.ref} ?`, text: `${fcfa(p.ttc)} encaissés par ${p.recordedBy?.name || '—'} (${P.PAYMENT_METHODS[p.method] || ''}${p.receiptNo ? `, reçu ${p.receiptNo}` : ''}). Vérifiez le reçu ou la transaction avant de valider.`, confirmLabel: 'Valider', onConfirm: () => { try { P.validatePayment(p.id); toast({ type: 'success', title: 'Paiement validé' }); draw(); } catch (ex) { toast({ type: 'error', title: 'Validation impossible', desc: ex.message }); } } });
    else if (t.dataset.reject) promptAction({ title: `Rejeter l’encaissement ${p.ref}`, text: 'La créance redevient « à encaisser ». Le rejet est conservé dans l’historique.', label: 'Motif du rejet', confirmLabel: 'Rejeter', danger: true, onConfirm: (reason) => { try { P.rejectPayment(p.id, reason); toast({ type: 'success', title: 'Encaissement rejeté' }); draw(); } catch (ex) { toast({ type: 'error', title: 'Rejet impossible', desc: ex.message }); } } });
    else openModal({ icon: 'receipt', title: `Paiement ${p.ref}`, text: `${p.partnerName} · ${fcfa(p.ttc)} TTC`, hideCancel: true, confirmLabel: 'Fermer', bodyHtml: `<ul class="sup-list">${(p.history || []).map((h) => `<li><span>${esc(h.text)}<small>${esc(h.by)}</small></span><b>${formatDateTime(h.at)}</b></li>`).join('')}</ul>` });
  });
}

export function openCollectModal(p, onDone) {
  const user = getCurrentUser();
  const methods = Object.entries(P.PAYMENT_METHODS).filter(([k]) => user.role !== 'PARTNER_ADMIN' || k !== 'GUICHET');
  const modal = openModal({
    icon: 'wallet', title: user.role === 'PARTNER_ADMIN' ? 'Payer en ligne' : 'Enregistrer l’encaissement', text: `${p.ref} · ${p.partnerName} · ${fcfa(p.ttc)} TTC`, confirmLabel: user.role === 'PARTNER_ADMIN' ? 'Payer (simulation)' : 'Enregistrer',
    bodyHtml: `<form class="admin-form" id="collect-form"><label class="field">Mode de paiement<select class="select" name="method">${methods.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label>
      <label class="field" id="collect-receipt">Numéro du reçu de caisse <span class="req">*</span><input class="input" name="receiptNo" maxlength="40" placeholder="RC-…"></label>
      <p class="admin-note d2-sim" id="collect-sim" hidden>${icon('info', { size: 14 })} Paiement simulé : aucune somme n’est débitée. Une référence de transaction fictive est générée.</p>
      <p class="hint">L’encaissement sera ensuite validé par une autre personne (caisse ou administration OIC).</p><p role="alert" class="error-msg" id="collect-error"></p></form>`,
    onConfirm: ({ root, close }) => {
      try { P.recordPayment(p.id, formValues(root.querySelector('#collect-form'))); close(); toast({ type: 'success', title: 'Encaissement enregistré', desc: 'En attente de validation.' }); onDone(); }
      catch (ex) { root.querySelector('#collect-error').textContent = ex.message; }
    },
  });
  const f = modal.root.querySelector('#collect-form');
  const sync = () => { const sim = f.elements.method.value !== 'GUICHET'; modal.root.querySelector('#collect-receipt').hidden = sim; modal.root.querySelector('#collect-sim').hidden = !sim; };
  f.elements.method.addEventListener('change', sync); sync();
}

function openFeesModal(partners, onDone) {
  const modal = openModal({
    icon: 'receipt', title: 'Encaisser des frais DUT à l’unité', text: 'Pour des DUT déjà numérotés dont les frais sont réglés au guichet, document par document.', confirmLabel: 'Enregistrer', large: true,
    bodyHtml: `<form class="admin-form d2-modal-form" id="fees-form"><label class="field"><span>Partenaire <span class="req">*</span></span><select class="select" name="partnerId"><option value="">Choisir…</option>${partners.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select></label>
      <fieldset class="d2-fieldset"><legend>DUT concernés</legend><div id="fees-duts" class="d2-checklist"><p class="sup-empty">Choisissez d’abord le partenaire.</p></div></fieldset>
      <div id="fees-amounts"></div>
      <div class="field-row"><label class="field">Mode de paiement<select class="select" name="method">${Object.entries(P.PAYMENT_METHODS).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label><label class="field">Numéro du reçu de caisse<input class="input" name="receiptNo" maxlength="40" placeholder="RC-…"></label></div>
      <p role="alert" class="error-msg" id="fees-error"></p></form>`,
    onConfirm: ({ root, close }) => {
      const f = root.querySelector('#fees-form');
      const dutIds = [...f.querySelectorAll('input[name="dut"]:checked')].map((c) => c.value);
      try { P.recordDutFees({ ...formValues(f), dutIds }); close(); toast({ type: 'success', title: 'Frais DUT encaissés', desc: 'En attente de validation par une autre personne.' }); onDone(); }
      catch (ex) { root.querySelector('#fees-error').textContent = ex.message; }
    },
  });
  const f = modal.root.querySelector('#fees-form');
  const amounts = () => { const c = f.querySelectorAll('input[name="dut"]:checked').length; const a = amountsFor(c); modal.root.querySelector('#fees-amounts').innerHTML = c ? `<p class="hint">${n(c)} DUT · HT ${fcfa(a.ht)} · TVA ${fcfa(a.tva)} · timbre ${fcfa(a.stamp)} · <strong>Total ${fcfa(a.ttc)}</strong></p>` : ''; };
  f.elements.partnerId.addEventListener('change', () => {
    const list = f.elements.partnerId.value ? P.dutsForFees(f.elements.partnerId.value) : [];
    modal.root.querySelector('#fees-duts').innerHTML = list.length ? list.map((d) => `<label class="checkbox-row"><input type="checkbox" name="dut" value="${esc(d.id)}"> <span class="d2-mono">${esc(d.dutNumber)}</span> <small class="d2-sub">${formatDate(d.validatedAt)} · ${esc(d.general?.transporterName || '')}</small></label>`).join('') : '<p class="sup-empty">Aucun DUT numéroté en attente de frais pour ce partenaire.</p>';
    amounts();
  });
  modal.root.querySelector('#fees-duts').addEventListener('change', amounts);
}
