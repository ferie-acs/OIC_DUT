import { settings } from '../services/settings.service.js';
import { getCurrentUser } from '../core/auth.js';
import { icon } from '../core/icons.js';
import { escapeHtml, formatDate, formatMoney, segmentedProgressHtml } from '../core/utils.js';
import { openModal, toast, confirmAction, promptAction } from '../core/ui.js';
import * as operationsService from '../services/operations.service.js';
// Lot d2 : modification / annulation d'une demande, paiement simulé, reprise, nouveaux statuts
import { can } from '../core/permissions.js';
import { revokeRange } from '../services/ranges.service.js';
import { paymentForOperation } from '../services/payments.service.js';
import { pricing, amountsFor } from '../services/range-pricing.service.js';
import { payBadge } from './ranges.view.js';
import { openCollectModal } from './payments.view.js';
// Fin lot d2

const STATUS_BADGE = {
  VALIDATED: '<span class="badge badge-success"><span class="badge-dot"></span>Validée</span>',
  PENDING: '<span class="badge badge-warning"><span class="badge-dot"></span>En attente</span>',
  REJECTED: '<span class="badge badge-error"><span class="badge-dot"></span>Rejetée</span>',
  // Lot d2 : statuts des transferts, reprises et annulations
  TRANSFER_PENDING: '<span class="badge badge-warning"><span class="badge-dot"></span>Transfert à valider</span>',
  REVOKED: '<span class="badge badge-neutral"><span class="badge-dot"></span>Reprise</span>',
  CANCELLED: '<span class="badge badge-neutral"><span class="badge-dot"></span>Annulée</span>',
  // Fin lot d2
};

export function render(container) {
  const user = getCurrentUser();
  renderList(container, user);
}

function renderList(container, user) {
  const operations = (user.role === 'OIC_ADMIN' ? operationsService.listAll() : operationsService.listForPartner(user.partnerId)).sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));

  container.innerHTML = `
    <div class="page-header">
      <div>
        <span class="overline">${user.role === 'OIC_ADMIN' ? 'OIC' : 'Partenaire'} · Ressources</span>
        <h1>Opérations &amp; plages de numéros</h1>
        <div class="subtitle">${escapeHtml(user.role === 'OIC_ADMIN' ? 'Demandes des partenaires · Attribution locale des plages' : user.partnerName)}</div>
      </div>
      ${can(user, 'operations.request') ? `<button type="button" class="btn btn-primary" id="btn-request-range">${icon('plus', { size: 15 })} Demander une nouvelle plage</button>` : ''}
    </div>
    <div class="page-header-rule"></div>

    <div class="stack gap-3" id="operations-list"></div>
  `;

  const list = container.querySelector('#operations-list');
  if (operations.length === 0) {
    list.innerHTML = `<div class="card empty-state">${icon('layers', { size: 40 })}<h3>Aucune opération</h3><p>Demandez votre première plage de numéros DUT.</p></div>`;
  } else {
    list.innerHTML = operations.map((op) => `
        <div class="range-progress-card">
          <div class="row-between" style="margin-bottom:8px">
            <div>
              <div class="range-code">${escapeHtml(op.code)} · ${escapeHtml(op.partnerName || '')}</div>
              <div class="text-muted" style="font-size:.78rem">Demandée le ${formatDate(op.requestedAt)}</div>
            </div>
            ${STATUS_BADGE[op.status] || ''}
          </div>
          ${['VALIDATED', 'REVOKED'].includes(op.status) ? `
            <div style="margin:12px 0 10px">${segmentedProgressHtml(op.quantity, op.used)}</div>
            <div class="range-meta" style="margin-top:0">
              <span>DUT-CI-${op.year}-${String(op.rangeStart).padStart(6, '0')} à DUT-CI-${op.year}-${String(op.rangeEnd).padStart(6, '0')}</span>
              <span class="mono-num fw-bold">${op.status === 'REVOKED' ? `${op.used} utilisés · ${op.returnedQuantity || 0} repris` : `${op.quantity - op.used} / ${op.quantity} disponibles`}</span>
            </div>
          ` : `
            <div class="text-muted" style="font-size:.85rem;margin-top:8px">Quantité demandée : ${op.quantity} · Montant estimé : ${formatMoney(op.montantTotal)}</div>
          `}
          ${op.commentaire ? `<p>${escapeHtml(op.commentaire)}</p>` : ''}
          ${op.rejectionReason ? `<p class="text-error">Motif du refus : ${escapeHtml(op.rejectionReason)}</p>` : ''}
          ${op.decidedBy ? `<p class="text-muted">Décision : ${escapeHtml(op.decidedBy)} · ${formatDate(op.validatedAt || op.rejectedAt)}</p>` : ''}
          ${lotD2Extras(op, user)}
          ${user.role === 'OIC_ADMIN' && op.status === 'PENDING' ? `<div class="row gap-2" style="margin-top:16px"><button class="btn btn-primary" data-approve="${op.id}">Attribuer la plage</button><button class="btn btn-secondary" data-reject="${op.id}">Refuser</button></div>` : ''}
        </div>
      `).join('');
  }

  const decide = (id, accepted, reason) => {
    try { operationsService.decideRange(id, accepted, reason); renderList(container, user); toast({ type: 'success', title: accepted ? 'Plage attribuée localement' : 'Demande refusée' }); }
    catch (err) { toast({ type: 'error', title: 'Décision impossible', desc: err.message }); }
  };
  container.querySelectorAll('[data-approve]').forEach(button => button.addEventListener('click', () => confirmAction({ title: 'Attribuer cette plage ?', text: 'Une nouvelle plage sans chevauchement sera réservée au partenaire dans ce POC.', confirmLabel: 'Attribuer', onConfirm: () => decide(button.dataset.approve, true) })));
  container.querySelectorAll('[data-reject]').forEach(button => button.addEventListener('click', () => promptAction({ title: 'Refuser la demande', label: 'Motif du refus', confirmLabel: 'Refuser', danger: true, onConfirm: reason => decide(button.dataset.reject, false, reason) })));
  container.querySelector('#btn-request-range')?.addEventListener('click', () => openRequestModal(container, user));
  bindLotD2(container, user, operations);
}

function openRequestModal(container, user) {
  const modal = openModal({
    icon: 'layers', title: 'Demander une nouvelle plage de numéros',
    confirmLabel: 'Soumettre la demande',
    bodyHtml: `
      <div class="field">
        <label for="req-qty">Quantité demandée <span class="req">*</span></label>
        <input class="input" type="number" min="1" id="req-qty" value="${settings().rangeQuantity}">
      </div>
      <div class="field">
        <label for="req-tarif">Tarif unitaire (FCFA) <span class="req">*</span></label>
        <input class="input" type="number" min="0" id="req-tarif" step="0.01" value="${settings().rangePrice}" readonly>
        <small class="hint">Tarif hors taxes fixé par l’OIC.</small>
      </div>
      <div class="field">
        <label>Montant total</label>
        <input class="input" id="req-total" readonly value="0 FCFA">
      </div>
      <div class="field">
        <label for="req-comment">Commentaire</label>
        <textarea class="textarea" id="req-comment" rows="2" placeholder="Précisions éventuelles"></textarea>
      </div>
    `,
    onConfirm: ({ close, root }) => {
      const quantite = root.querySelector('#req-qty').value;
      const tarifUnitaire = root.querySelector('#req-tarif').value;
      const commentaire = root.querySelector('#req-comment').value;
      try {
        operationsService.requestNewRange(user, { quantite, tarifUnitaire, commentaire });
        toast({ type: 'success', title: 'Demande envoyée', desc: 'Votre demande est enregistrée localement et visible dans l’espace OIC de ce navigateur.' });
        close();
        renderList(container, user);
      } catch (err) {
        toast({ type: 'error', title: 'Demande invalide', desc: err.message });
      }
    },
  });

  const updateTotal = () => {
    const q = Number(modal.root.querySelector('#req-qty').value) || 0;
    const t = Number(modal.root.querySelector('#req-tarif').value) || 0;
    const a = amountsFor(q, { ...pricing(), unitHT: t });
    modal.root.querySelector('#req-total').value = `${formatMoney(a.ht)} HT · ${formatMoney(a.ttc)} TTC (TVA et timbre inclus)`;
  };
  modal.root.querySelector('#req-qty').addEventListener('input', updateTotal);
  modal.root.querySelector('#req-tarif').addEventListener('input', updateTotal);
  updateTotal();
}

// Lot d2 : actions sur les demandes en attente, paiement et reprise
function lotD2Extras(op, user) {
  const parts = [];
  if (op.kind === 'TRANSFER') parts.push(`<p class="text-muted">Vendue au transporteur par l’antenne ${escapeHtml(op.antennaName || '')}${op.receiptNo ? ` · reçu ${escapeHtml(op.receiptNo)}` : ''}</p>`);
  if (op.status === 'CANCELLED') parts.push(`<p class="text-muted">Annulée par ${escapeHtml(op.cancelledBy || '')} le ${formatDate(op.cancelledAt)} : ${escapeHtml(op.cancelReason || '')}</p>`);
  if (op.status === 'REVOKED') parts.push(`<p class="text-muted">Reprise par ${escapeHtml(op.revokedBy || '')} le ${formatDate(op.revokedAt)} : ${escapeHtml(op.revokeReason || '')}</p>`);
  const pay = ['VALIDATED', 'REVOKED', 'TRANSFER_PENDING'].includes(op.status) ? paymentForOperation(op.id) : null;
  const buttons = [];
  if (op.status === 'PENDING' && op.partnerId === user.partnerId && can(user, 'operations.request')) buttons.push(`<button type="button" class="btn btn-secondary" data-edit-request="${op.id}">${icon('edit', { size: 15 })} Modifier</button>`, `<button type="button" class="btn btn-secondary" data-cancel-request="${op.id}">Annuler la demande</button>`);
  if (pay?.status === 'A_ENCAISSER' && can(user, 'payments.pay')) buttons.push(`<button type="button" class="btn btn-primary" data-pay="${pay.id}">${icon('wallet', { size: 15 })} Payer en ligne (simulé)</button>`);
  if (user.role === 'OIC_ADMIN' && op.status === 'VALIDATED' && op.used < op.quantity && can(user, 'ranges.revoke')) buttons.push(`<button type="button" class="btn btn-secondary" data-revoke-range="${op.id}">${icon('undo2', { size: 15 })} Reprendre la plage</button>`);
  if (user.role === 'OIC_ADMIN' && op.status === 'TRANSFER_PENDING') buttons.push(`<a class="btn btn-secondary" href="#/oic/plages/transferts">Examiner le transfert</a>`);
  return `${parts.join('')}${pay ? `<div class="row gap-2 d2-pay-line"><span class="text-muted">Paiement ${escapeHtml(pay.ref)} · ${formatMoney(pay.ttc)} TTC</span>${payBadge(pay.status)}</div>` : ''}${buttons.length ? `<div class="row gap-2" style="margin-top:16px;flex-wrap:wrap">${buttons.join('')}</div>` : ''}`;
}

function bindLotD2(container, user, operations) {
  const refresh = () => renderList(container, user);
  container.querySelectorAll('[data-edit-request]').forEach((b) => b.addEventListener('click', () => {
    const op = operations.find((o) => o.id === b.dataset.editRequest);
    openModal({
      icon: 'edit', title: `Modifier la demande ${op.code}`, confirmLabel: 'Enregistrer',
      bodyHtml: `<div class="field"><label for="edit-qty">Quantité demandée <span class="req">*</span></label><input class="input" type="number" min="1" max="10000" id="edit-qty" value="${op.quantity}"></div>
        <div class="field"><label for="edit-comment">Commentaire</label><textarea class="textarea" id="edit-comment" rows="2">${escapeHtml(op.commentaire || '')}</textarea></div><p role="alert" class="error-msg" id="edit-error"></p>`,
      onConfirm: ({ root, close }) => {
        try { operationsService.updatePendingRequest(user, op.id, { quantite: root.querySelector('#edit-qty').value, commentaire: root.querySelector('#edit-comment').value }); close(); toast({ type: 'success', title: 'Demande modifiée' }); refresh(); }
        catch (err) { root.querySelector('#edit-error').textContent = err.message; }
      },
    });
  }));
  container.querySelectorAll('[data-cancel-request]').forEach((b) => b.addEventListener('click', () => promptAction({
    title: 'Annuler la demande', text: 'La demande ne sera plus instruite par l’OIC.', label: 'Motif de l’annulation', confirmLabel: 'Annuler la demande', danger: true,
    onConfirm: (reason) => { try { operationsService.cancelPendingRequest(user, b.dataset.cancelRequest, reason); toast({ type: 'success', title: 'Demande annulée' }); refresh(); } catch (err) { toast({ type: 'error', title: 'Annulation impossible', desc: err.message }); } },
  })));
  container.querySelectorAll('[data-pay]').forEach((b) => b.addEventListener('click', () => {
    const op = operations.find((o) => paymentForOperation(o.id)?.id === b.dataset.pay);
    openCollectModal(paymentForOperation(op.id), refresh);
  }));
  container.querySelectorAll('[data-revoke-range]').forEach((b) => b.addEventListener('click', () => promptAction({
    title: 'Reprendre la plage', text: 'Les numéros non utilisés retournent au stock d’origine ou sont retirés. Les numéros utilisés restent attachés aux DUT.', label: 'Motif de la reprise', confirmLabel: 'Reprendre', danger: true,
    onConfirm: (reason) => { try { revokeRange(b.dataset.revokeRange, reason); toast({ type: 'success', title: 'Plage reprise' }); refresh(); } catch (err) { toast({ type: 'error', title: 'Reprise impossible', desc: err.message }); } },
  })));
}
// Fin lot d2
