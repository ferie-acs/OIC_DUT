// Lot d3 : actions et rubriques du cycle de vie sur la fiche DUT (règlement par référence, transbordement,
// contrôle et archivage, annulation), plus le détail de la facture. Partagé par la fiche et l'assistant.
import { icon } from '../core/icons.js';
import { escapeHtml, formatDate, formatDateTime, formatMoney } from '../core/utils.js';
import { openModal, toast } from '../core/ui.js';
import { getCurrentUser } from '../core/auth.js';
import { can } from '../core/permissions.js';
import { ROLE_LABELS } from '../core/constants.js';
import { billingDetail, accountMention, ACCOUNT_LABELS } from '../services/dut-billing.service.js';
import * as lifecycle from '../services/dut-lifecycle.service.js';
import * as dutService from '../services/dut.service.js';

/* ------------------------------------------------------------------ Boutons de la fiche */

export function lifecycleActionsHtml(dut, user = getCurrentUser()) {
  const buttons = [];
  if (dut.status === 'EN_EDITION' && lifecycle.canPayWithReference(user, dut) && !dut.payment) {
    buttons.push(`<button type="button" class="btn btn-primary" data-lc="pay">${icon('wallet', { size: 15 })} Régler et soumettre</button>`);
  }
  if (lifecycle.canTransship(user, dut)) {
    buttons.push(`<button type="button" class="btn btn-secondary" data-lc="transship">${icon('arrowLeftRight', { size: 15 })} Transborder</button>`);
  }
  if (lifecycle.canArchive(user, dut)) {
    buttons.push(`<button type="button" class="btn btn-secondary" data-lc="archive">${icon('archive', { size: 15 })} Contrôler et archiver</button>`);
  }
  return buttons.join('');
}

export function bindLifecycleActions(root, dut, onDone) {
  root.querySelector('[data-lc="pay"]')?.addEventListener('click', () => openPaymentModal(dut, onDone));
  root.querySelector('[data-lc="transship"]')?.addEventListener('click', () => openTransshipModal(dut, onDone));
  root.querySelector('[data-lc="archive"]')?.addEventListener('click', () => openArchiveModal(dut, onDone));
}

/* ------------------------------------------------------------------ Règlement par référence */

export function openPaymentModal(dut, onDone) {
  const transporterId = lifecycle.payerTransporterId(dut);
  const stock = lifecycle.referenceStock(transporterId);
  const errors = dutService.validateForSubmit(dut).concat(dutService.referentialErrors(dut));
  const antennas = lifecycle.listAntennasForSubmission();
  const blocked = errors.length > 0 || !stock.next;
  openModal({
    icon: 'wallet',
    title: 'Régler le DUT avec une référence',
    confirmLabel: 'Régler et soumettre',
    bodyHtml: `
      <p class="ta-route">${escapeHtml(dut.general.transporterName || 'Transporteur')} · ${escapeHtml(dut.trajet.chargement.ville || '—')} → ${escapeHtml(dut.trajet.dechargement.ville || '—')}</p>
      ${errors.length ? `<div class="alert-banner error">${icon('alertCircle', { size: 18 })}<div class="alert-text"><strong>Dossier incomplet</strong>${errors.map((e) => escapeHtml(e)).join('<br>')}</div></div>` : ''}
      <div class="recap-grid lc-modal-grid">
        <div class="recap-item"><span>Références disponibles</span><strong>${stock.available} sur ${stock.total}</strong></div>
        <div class="recap-item"><span>Valeur d’une référence</span><strong>${stock.tarifUnitaire != null ? formatMoney(stock.tarifUnitaire) : '—'}</strong></div>
      </div>
      ${stock.next ? '' : '<p class="ta-error">Le stock de références de ce transporteur est épuisé.</p>'}
      <div class="field">
        <label for="lc-reference">Numéro de référence <span class="req">*</span></label>
        <input class="input" id="lc-reference" value="${escapeHtml(stock.next || '')}" autocomplete="off">
        <div class="hint">La plus petite référence disponible du stock est proposée. Elle deviendra le numéro du DUT validé.</div>
      </div>
      ${dut.guichet ? '' : `<div class="field">
        <label for="lc-antenna">Antenne OIC qui validera le DUT <span class="req">*</span></label>
        <select class="select" id="lc-antenna"><option value="">Choisir une antenne</option>${antennas.map((a) => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}</option>`).join('')}</select>
      </div>`}
      <p class="ta-hint">${icon('info', { size: 13 })} Paiement simulé : une référence est débitée du stock déjà acheté, aucune somme n’est prélevée dans cette démonstration.</p>
      <p class="ta-error" role="alert"></p>`,
    onConfirm: ({ root, close }) => {
      if (blocked) { root.querySelector('.ta-error[role=alert]').textContent = 'Complétez le dossier avant de le régler.'; return; }
      try {
        const updated = lifecycle.payAndSubmit(dut.id, {
          reference: root.querySelector('#lc-reference').value,
          antennaId: root.querySelector('#lc-antenna')?.value || '',
        });
        close();
        toast({ type: 'success', title: 'DUT réglé et soumis', desc: `Référence ${updated.payment.reference} débitée (simulation). L’antenne ${updated.antennaName} va le valider.` });
        onDone?.(updated);
      } catch (err) { root.querySelector('.ta-error[role=alert]').textContent = err.message; }
    },
  });
}

/* ------------------------------------------------------------------ Transbordement */

export function openTransshipModal(dut, onDone) {
  const options = lifecycle.transshipOptions();
  const option = (list, value, label) => list.map((x) => `<option value="${escapeHtml(x.id)}" ${x.id === value ? 'selected' : ''}>${escapeHtml(label(x))}</option>`).join('');
  const today = new Date().toISOString().slice(0, 10);
  const { root } = openModal({
    icon: 'arrowLeftRight',
    title: 'Transborder le DUT',
    large: true,
    confirmLabel: 'Enregistrer le transbordement',
    bodyHtml: `
      <p class="ta-route">${escapeHtml(dut.dutNumber)} · en charge : ${escapeHtml(dut.general.transporterName || '—')} · ${escapeHtml(dut.general.immatriculation || '—')} · ${escapeHtml([dut.general.driverNom, dut.general.driverPrenoms].filter(Boolean).join(' ') || '—')}</p>
      <div class="ta-grid">
        <label class="field">Transporteur qui prend en charge
          <select class="select" id="lc-tr">${option(options.transporteurs, dut.general.transporterId, (t) => t.name)}</select>
        </label>
        <label class="field">Véhicule
          <select class="select" id="lc-veh"></select>
        </label>
        <label class="field">Conducteur
          <select class="select" id="lc-drv">${option(options.conducteurs, dut.general.driverId, (d) => `${d.nom} ${d.prenoms || ''} · permis ${d.permis || '—'}`)}</select>
        </label>
        <label class="field">Motif
          <select class="select" id="lc-motif"><option value="">Choisir un motif</option>${Object.entries(lifecycle.TRANSSHIP_REASONS).map(([k, v]) => `<option value="${k}">${escapeHtml(v)}</option>`).join('')}</select>
        </label>
        <label class="field">Lieu de prise en charge
          <input class="input" id="lc-lieu" maxlength="120" placeholder="Ex. : Yamoussoukro, gare routière">
        </label>
        <label class="field">Pays
          <input class="input" id="lc-pays" maxlength="60" value="Côte d’Ivoire">
        </label>
        <label class="field">Date de prise en charge
          <input class="input" type="date" id="lc-date" value="${today}">
        </label>
        <label class="field">Heure
          <input class="input" type="time" id="lc-heure">
        </label>
      </div>
      <label class="field">Précision (obligatoire pour « Autre motif »)
        <textarea class="textarea" id="lc-precision" rows="2" maxlength="300"></textarea>
      </label>
      <p class="ta-hint">${icon('info', { size: 13 })} Un nouveau document signé est émis pour le nouveau véhicule. L’ancien QR sera refusé au contrôle. Le DUT garde l’historique de chaque transbordement.</p>
      <p class="ta-error" role="alert"></p>`,
    onConfirm: async ({ root: modal, close }) => {
      const button = modal.querySelector('[data-action="confirm"]');
      button.disabled = true;
      try {
        const updated = await lifecycle.transship(dut.id, {
          transporterId: modal.querySelector('#lc-tr').value, vehicleId: modal.querySelector('#lc-veh').value,
          driverId: modal.querySelector('#lc-drv').value, motif: modal.querySelector('#lc-motif').value,
          lieu: modal.querySelector('#lc-lieu').value, pays: modal.querySelector('#lc-pays').value,
          date: modal.querySelector('#lc-date').value, heure: modal.querySelector('#lc-heure').value,
          precision: modal.querySelector('#lc-precision').value,
        });
        close();
        toast({ type: 'success', title: 'Transbordement enregistré', desc: `Nouveau document émis pour ${updated.general.immatriculation}.` });
        onDone?.(updated);
      } catch (err) {
        modal.querySelector('.ta-error[role=alert]').textContent = err.message;
        button.disabled = false;
      }
    },
  });
  const fillVehicles = () => {
    const transporterId = root.querySelector('#lc-tr').value;
    const list = options.vehicules.filter((v) => v.transporterId === transporterId);
    root.querySelector('#lc-veh').innerHTML = list.length
      ? option(list, dut.general.vehicleId || list.find((v) => v.immatriculation === dut.general.immatriculation)?.id, (v) => `${v.immatriculation} · ${v.type || 'véhicule'}`)
      : '<option value="">Aucun véhicule actif pour ce transporteur</option>';
  };
  root.querySelector('#lc-tr').addEventListener('change', fillVehicles);
  fillVehicles();
}

/* ------------------------------------------------------------------ Contrôle et archivage */

export function openArchiveModal(dut, onDone) {
  openModal({
    icon: 'archive',
    title: 'Contrôler et archiver le DUT',
    confirmLabel: 'Archiver',
    bodyHtml: `
      <p class="ta-route">${escapeHtml(dut.dutNumber)} · ${escapeHtml(dut.partnerName || '')}</p>
      <div class="stack gap-2">
        ${Object.entries(lifecycle.ARCHIVE_CHECKS).map(([key, label]) => `<label class="checkbox-row"><input type="checkbox" data-check="${key}"> ${escapeHtml(label)}</label>`).join('')}
      </div>
      <div class="ta-grid" style="margin-top:var(--s3)">
        <label class="field">Résultat du contrôle
          <select class="select" id="lc-result"><option value="">Choisir</option>${Object.entries(lifecycle.ARCHIVE_RESULTS).map(([k, v]) => `<option value="${k}">${escapeHtml(v)}</option>`).join('')}</select>
        </label>
        <label class="field">Classement (classeur, boîte)
          <input class="input" id="lc-classeur" maxlength="80" placeholder="Ex. : Classeur octobre, boîte 3">
        </label>
      </div>
      <label class="field">Observations (obligatoires en cas de réserves)
        <textarea class="textarea" id="lc-observation" rows="3" maxlength="1000"></textarea>
      </label>
      <p class="ta-hint">${icon('info', { size: 13 })} Une cote d’archive est attribuée automatiquement. L’archivage ne modifie pas le DUT et ne peut pas être annulé.</p>
      <p class="ta-error" role="alert"></p>`,
    onConfirm: ({ root, close }) => {
      try {
        const verifications = Object.fromEntries([...root.querySelectorAll('[data-check]')].map((c) => [c.dataset.check, c.checked]));
        const entry = lifecycle.archiveDut(dut.id, {
          verifications, resultat: root.querySelector('#lc-result').value,
          classeur: root.querySelector('#lc-classeur').value, observation: root.querySelector('#lc-observation').value,
        });
        close();
        toast({ type: 'success', title: 'DUT archivé', desc: `Cote ${entry.cote} · ${entry.classeur}` });
        onDone?.();
      } catch (err) { root.querySelector('.ta-error[role=alert]').textContent = err.message; }
    },
  });
}

/* ------------------------------------------------------------------ Annulation */

export function openWithdrawModal(dut, onDone) {
  openModal({
    icon: 'ban', tone: 'error', danger: true,
    title: 'Annuler ce DUT ?',
    confirmLabel: 'Annuler le DUT',
    cancelLabel: 'Fermer',
    bodyHtml: `
      <p class="ta-route">${escapeHtml(dut.dutNumber || '')} · ${escapeHtml(dut.general.immatriculation || '')}</p>
      <div class="field">
        <label for="lc-withdraw">Motif de l’annulation <span class="req">*</span></label>
        <textarea class="textarea" id="lc-withdraw" rows="3" maxlength="500" placeholder="Ex. : transport abandonné, erreur de saisie constatée après validation"></textarea>
      </div>
      <p class="ta-hint">${icon('info', { size: 13 })} Le DUT sera retiré de la circulation : il sera refusé à tout contrôle. Son numéro ${escapeHtml(dut.dutNumber || '')} est retiré définitivement et ne sera jamais réattribué. Votre nom, la date et le motif sont enregistrés.</p>
      <p class="ta-error" role="alert"></p>`,
    onConfirm: ({ root, close }) => {
      try {
        dutService.withdraw(dut.id, root.querySelector('#lc-withdraw').value);
        close();
        toast({ type: 'success', title: 'DUT annulé', desc: 'Il est retiré de la circulation.' });
        onDone?.();
      } catch (err) { root.querySelector('.ta-error[role=alert]').textContent = err.message; }
    },
  });
}

export function withdrawnAlertHtml(dut) {
  const who = [dut.withdrawnAt ? `le ${formatDateTime(dut.withdrawnAt)}` : '', dut.withdrawnBy ? `par ${escapeHtml(dut.withdrawnBy)}` : ''].filter(Boolean).join(' ');
  return `<div class="dd-alert is-error" role="status">${icon('ban', { size: 20 })}<div class="dd-alert-text"><strong>DUT annulé et retiré de la circulation${who ? ` ${who}` : ''}</strong><p>${dut.withdrawalReason ? `Motif : ${escapeHtml(dut.withdrawalReason)}. ` : ''}Ce document n’est plus valide. Son numéro est retiré définitivement et ne sera jamais réattribué.</p></div></div>`;
}

/* ------------------------------------------------------------------ Rubriques de la fiche */

const money = (n) => formatMoney(n);

export function billingCardHtml(dut) {
  const b = billingDetail(dut.facturation);
  const row = (label, a, c, strong = false) => `<tr${strong ? ' class="fw-medium"' : ''}><td>${label}</td><td class="text-right">${a}</td><td class="text-right">${c}</td></tr>`;
  return `
    <article class="card dd-card">
      <header class="dd-card-head">${icon('wallet', { size: 18 })}<h3>Facturation</h3><span class="badge badge-neutral">${escapeHtml(ACCOUNT_LABELS[dut.general.compte] || dut.general.compte || '')}</span></header>
      <p class="lc-mention">${escapeHtml(accountMention(dut.general, dut.expediteur))}</p>
      <div class="table-wrap"><table class="data-table lc-billing">
        <thead><tr><th scope="col">Poste</th><th scope="col" class="text-right">Expéditeur</th><th scope="col" class="text-right">Destinataire</th></tr></thead>
        <tbody>
          ${b.expediteur.lines.map((l, i) => row(l.label, money(l.montant), money(b.destinataire.lines[i].montant))).join('')}
          ${row('Total hors taxes', money(b.expediteur.totalHT), money(b.destinataire.totalHT), true)}
          ${row(`TVA (${b.expediteur.tvaRate} % / ${b.destinataire.tvaRate} %)`, money(b.expediteur.tvaMontant), money(b.destinataire.tvaMontant))}
          ${row('Sous-total toutes taxes', money(b.expediteur.sousTotal), money(b.destinataire.sousTotal))}
          ${row('Droit de timbre', money(b.expediteur.timbre), money(b.destinataire.timbre))}
          ${row('Total à percevoir', money(b.expediteur.total), money(b.destinataire.total), true)}
        </tbody>
      </table></div>
    </article>`;
}

function carrierLine(c = {}) {
  return `${escapeHtml(c.transporterName || '—')} · ${escapeHtml(c.immatriculation || '—')} · ${escapeHtml([c.driverNom, c.driverPrenoms].filter(Boolean).join(' ') || '—')}`;
}

export function lifecycleCardsHtml(dut) {
  const cards = [billingCardHtml(dut)];
  const facts = [];
  if (dut.editeur?.type === 'TRANSPORTEUR') facts.push(['Édité par', `Le transporteur ${dut.editeur.name || ''}`]);
  if (dut.guichet) {
    facts.push(['Saisi au guichet', `Antenne ${dut.antennaName || ''} · ${dut.guichet.agentName || ''} · ${formatDateTime(dut.guichet.at)}`]);
    facts.push(['Usager', `${dut.guichet.usagerType === 'TRANSPORTEUR' ? 'Transporteur' : 'Partenaire'} ${dut.guichet.usagerName || ''}`]);
    facts.push(['Déposant', `${dut.guichet.deposant?.nom || ''} · pièce ${dut.guichet.deposant?.piece || ''}`]);
  }
  if (dut.payment) {
    facts.push(['Référence réglée', `${dut.payment.reference} · stock ${dut.payment.operationCode || ''}`]);
    facts.push(['Règlement', `${formatMoney(dut.payment.montant)} · ${formatDateTime(dut.payment.paidAt)} · ${dut.payment.paidBy || ''} (débit simulé)`]);
  }
  const archive = lifecycle.archiveFor(dut.id);
  if (archive) {
    facts.push(['Archivé', `${archive.cote} · ${archive.classeur} · ${formatDateTime(archive.archivedAt)} · ${archive.archivedBy}`]);
    facts.push(['Résultat du contrôle', `${lifecycle.ARCHIVE_RESULTS[archive.resultat] || archive.resultat}${archive.observation ? ` · ${archive.observation}` : ''}`]);
  }
  if (facts.length) {
    cards.push(`<article class="card dd-card">
      <header class="dd-card-head">${icon('layers', { size: 18 })}<h3>Édition, règlement et archivage</h3></header>
      <dl class="dd-list">${facts.map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join('')}</dl>
    </article>`);
  }
  if (dut.transbordements?.length) {
    cards.push(`<article class="card dd-card">
      <header class="dd-card-head">${icon('arrowLeftRight', { size: 18 })}<h3>Transbordements</h3><span class="badge badge-accent">${dut.transbordements.length}</span></header>
      <div class="timeline">
        ${[...dut.transbordements].reverse().map((t) => `
          <div class="timeline-item"><span class="timeline-dot done"></span><div class="timeline-content">
            <strong>Transbordement n° ${t.rang} · ${escapeHtml(t.priseEnCharge.lieu)}, ${escapeHtml(t.priseEnCharge.pays)}</strong>
            <div class="meta">Prise en charge le ${formatDate(t.priseEnCharge.date)}${t.priseEnCharge.heure ? ` à ${escapeHtml(t.priseEnCharge.heure)}` : ''} · ${escapeHtml(t.motifLabel)}${t.precision ? ` : ${escapeHtml(t.precision)}` : ''}</div>
            <p>Avant : ${carrierLine(t.avant)}</p>
            <p>Après : ${carrierLine(t.apres)}</p>
            <div class="meta">Déclaré le ${formatDateTime(t.at)} par ${escapeHtml(t.auteur?.name || '')} (${escapeHtml(ROLE_LABELS[t.auteur?.role] || '')}) · nouveau document émis, ancien QR refusé</div>
          </div></div>`).join('')}
      </div>
    </article>`);
  }
  return cards.join('');
}

/** Bouton « Annuler le DUT » : visible pour le rôle habilité, sur un DUT validé ou suspendu. */
export function canWithdraw(user, dut) {
  return ['VALIDE', 'SUSPENDU'].includes(dut.status) && can(user, 'dut.withdraw')
    && (user.role !== 'ANTENNA_AGENT' || dut.antennaId === user.antennaId);
}
