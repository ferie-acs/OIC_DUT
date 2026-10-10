import { COPIES, printHistory, nextRank } from '../services/dut-print.service.js';
import { renderWorkspace } from './dossier-workspace.view.js';
import { accessibleDut, duplicateDut } from '../services/workspace.service.js';
import { icon } from '../core/icons.js';
import { escapeHtml, formatDate, formatDateTime, formatMoney, formatNumber } from '../core/utils.js';
import { navigate } from '../core/router.js';
import { getCurrentUser } from '../core/auth.js';
import { can } from '../core/permissions.js';
import { DUT_STATUS_LABELS, AUDIT_LABELS } from '../core/constants.js';
import { confirmAction, promptAction, toast, openModal } from '../core/ui.js';
import * as dutService from '../services/dut.service.js';
import * as auditService from '../services/audit.service.js';
import * as qrService from '../services/qr.service.js';
import { dossier } from '../services/workspace.service.js';
import { getAllControlLogs } from '../repositories/controls.repository.js';
import { verdictOf } from '../services/supervision.service.js';
import { transportActionsHtml, bindTransportActions, stageLabel, nextStage } from './transport-actions.js';

const DONE_ACTIONS = ['DUT_VALIDATED', 'DUT_UNSUSPENDED'];
const ACCOUNT_LABELS = { PROPRE: 'Compte propre', AUTRUI: 'Pour autrui', SOUS_TRAITANCE: 'Sous-traitance' };
const TRANSPORT_LABELS = { NATIONAL: 'National', VERS_INTERNATIONAL: 'Vers l’international', VERS_NATIONAL: 'Vers le national' };

let activeTab = 'detail';

export function render(container, params) {
  activeTab = ['transport', 'incidents', 'documents', 'checklist', 'audit'].includes(params.section) ? params.section : 'detail';
  let dut;
  try { dut = accessibleDut(params.id); } catch {}
  if (!dut) {
    container.innerHTML = `<div class="empty-state">${icon('alertCircle', { size: 40 })}<h3>DUT introuvable</h3><a href="#/partner/dut">Retour à la liste</a></div>`;
    return;
  }
  paint(container, dut);
}

function paint(container, dut) {
  const user = getCurrentUser();
  const totalsM = dutService.computeMarchandiseTotals(dut.marchandises);

  container.innerHTML = `
    ${heroHtml(dut, totalsM)}
    ${statusAlertHtml(dut, user)}
    ${lifecycleHtml(dut)}

    <div class="tabs">
      <button type="button" class="tab-btn ${activeTab === 'detail' ? 'active' : ''}" data-tab="detail">Détail</button>
      ${[['transport', 'Transport'], ['incidents', 'Incidents & réserves'], ['documents', 'Documents & preuves'], ['checklist', 'Checklist']].map(([key,label]) => `<button type="button" class="tab-btn ${activeTab === key ? 'active' : ''}" data-tab="${key}">${label}</button>`).join('')}
      <button type="button" class="tab-btn ${activeTab === 'audit' ? 'active' : ''}" data-tab="audit">Journal d’audit</button>
    </div>
    <div id="tab-content"></div>
  `;

  container.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => navigate(`/dut/${encodeURIComponent(dut.id)}/${btn.dataset.tab}`));
  });

  renderActions(container, dut, user);
  if (activeTab === 'detail') renderDetailTab(container, dut);
  else if (activeTab === 'audit') renderAuditTab(container, dut);
  else renderWorkspace(container.querySelector('#tab-content'), dut, activeTab, () => paint(container, dutService.getDut(dut.id)));
}

function renderActions(container, dut, user) {
  const box = container.querySelector('#dut-actions');
  const buttons = [];
  if (can(user, 'dut.create')) buttons.push('<button class="btn btn-secondary" id="btn-duplicate">Dupliquer</button>');

  if (dut.status === 'EN_EDITION' && dut.createdBy === user.id) {
    buttons.push(`<button type="button" class="btn btn-primary" id="btn-continue-edit">${icon('edit', { size: 15 })} Continuer l’édition</button>`);
  }
  if (dut.status === 'TERMINE' && can(user, 'dut.validate')) {
    buttons.push(`<button type="button" class="btn btn-danger" id="btn-reject">${icon('xCircle', { size: 15 })} Rejeter</button>`);
    buttons.push(`<button type="button" class="btn btn-success" id="btn-validate">${icon('checkCircle', { size: 15 })} Valider</button>`);
  }
  if (dut.status === 'VALIDE' && can(user, 'dut.suspend')) {
    buttons.push(`<button type="button" class="btn btn-secondary" id="btn-suspend">${icon('alertTriangle', { size: 15 })} Suspendre</button>`);
  }
  if (dut.status === 'SUSPENDU' && can(user, 'dut.unsuspend')) {
    buttons.push(`<button type="button" class="btn btn-secondary" id="btn-unsuspend">${icon('checkCircle', { size: 15 })} Lever la suspension</button>`);
  }
  if (['VALIDE', 'SUSPENDU'].includes(dut.status) && can(user, 'dut.withdraw')) {
    buttons.push(`<button type="button" class="btn btn-danger" id="btn-withdraw">${icon('trash', { size: 15 })} Retirer</button>`);
  }
  if (['PARTNER_ADMIN','PARTNER_EDITOR','OIC_ADMIN','ANTENNA_AGENT','TRANSPORTEUR'].includes(user.role)) {
    buttons.push(`<button type="button" class="btn btn-secondary" id="btn-pdf">${icon('download', { size: 15 })} DUT recto / verso</button>`);
    buttons.push(`<button type="button" class="btn btn-ghost" id="btn-preview-pdf">${icon('eye', { size: 15 })} Aperçu</button>`);
  }
  box.innerHTML = transportActionsHtml(dut) + buttons.join('');
  bindTransportActions(box, (id) => dutService.getDut(id), () => paint(container, dutService.getDut(dut.id)));
  box.querySelector('#btn-duplicate')?.addEventListener('click', () => {
    try {
      const copy = duplicateDut(dut.id);
      sessionStorage.setItem('dut_wizard_draft_id', copy.id);
      toast({ type: 'success', title: 'Nouveau brouillon créé', desc: 'Les dates, le numéro officiel, le QR et les preuves sont à établir pour ce nouveau transport.' });
      navigate('/dut/new/1');
    } catch (err) { toast({ type: 'error', title: 'Duplication impossible', desc: err.message }); }
  });

  box.querySelector('#btn-continue-edit')?.addEventListener('click', () => {
    sessionStorage.setItem('dut_wizard_draft_id', dut.id);
    navigate('/dut/new/1');
  });
  container.querySelector('#btn-correct')?.addEventListener('click', () => {
    dutService.reopenForCorrection(dut.id);
    sessionStorage.setItem('dut_wizard_draft_id', dut.id);
    navigate('/dut/new/1');
  });
  box.querySelector('#btn-reject')?.addEventListener('click', () => {
    promptAction({
      title: 'Rejeter ce DUT ?', label: 'Motif du rejet', placeholder: 'ex : Carte de transport expirée.',
      confirmLabel: 'Rejeter', danger: true,
      onConfirm: (reason) => {
        try {
          dutService.reject(dut.id, reason);
          toast({ type: 'success', title: 'DUT rejeté' });
          paint(container, dutService.getDut(dut.id));
        } catch (err) { toast({ type: 'error', title: 'Action impossible', desc: err.message }); }
      },
    });
  });
  box.querySelector('#btn-validate')?.addEventListener('click', () => {
    confirmAction({
      title: 'Valider ce DUT ?', text: 'Un numéro officiel sera attribué et un QR code sécurisé sera généré. Cette action est irréversible.',
      confirmLabel: 'Valider', icon: 'checkCircle',
      onConfirm: async () => {
        try {
          const updated = await dutService.validate(dut.id);
          toast({ type: 'success', title: 'DUT validé', desc: `Numéro attribué : ${updated.dutNumber}` });
          paint(container, updated);
        } catch (err) { toast({ type: 'error', title: 'Validation impossible', desc: err.message }); }
      },
    });
  });
  box.querySelector('#btn-suspend')?.addEventListener('click', () => {
    promptAction({
      title: 'Suspendre ce DUT ?', label: 'Motif', danger: true, confirmLabel: 'Suspendre',
      onConfirm: (note) => { dutService.suspend(dut.id, note); toast({ type: 'success', title: 'DUT suspendu' }); paint(container, dutService.getDut(dut.id)); },
    });
  });
  box.querySelector('#btn-unsuspend')?.addEventListener('click', () => {
    confirmAction({
      title: 'Lever la suspension ?', text: 'Le DUT redevient valide immédiatement.', confirmLabel: 'Lever la suspension', icon: 'checkCircle',
      onConfirm: () => { dutService.unsuspend(dut.id); toast({ type: 'success', title: 'Suspension levée' }); paint(container, dutService.getDut(dut.id)); },
    });
  });
  box.querySelector('#btn-withdraw')?.addEventListener('click', () => {
    promptAction({
      title: 'Retirer ce DUT ?', label: 'Motif du retrait', danger: true, confirmLabel: 'Retirer',
      onConfirm: (note) => { dutService.withdraw(dut.id, note); toast({ type: 'success', title: 'DUT retiré' }); paint(container, dutService.getDut(dut.id)); },
    });
  });
  box.querySelector('#btn-pdf')?.addEventListener('click', () => {
    const rank = nextRank(dutService.getDut(dut.id));
    openModal({ title: 'Éditer le DUT recto / verso', icon: 'file', confirmLabel: 'Générer le PDF',
      bodyHtml: `<p class="text-muted">Impression n° ${rank} · Le statut actuel figurera sur chaque exemplaire.</p><div class="field"><label for="pdf-copy">Exemplaire</label><select class="select" id="pdf-copy">${Object.entries(COPIES).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></div>${rank>1?'<div class="field"><label for="pdf-reason">Motif de réimpression *</label><textarea class="textarea" id="pdf-reason" rows="2" placeholder="Ex. exemplaire destinataire ou remplacement"></textarea></div>':''}<p id="pdf-error" role="alert"></p>`,
      onConfirm: async ({root,close}) => {
        const button=root.querySelector('[data-action="confirm"]');button.disabled=true;
        try { const pdf=await import('../services/pdf.service.js?v=dut-v2'); await pdf.generateDutPdf(dut,{copy:root.querySelector('#pdf-copy').value,reason:root.querySelector('#pdf-reason')?.value||''}); close(); toast({type:'success',title:'DUT recto / verso généré',desc:'Impression et empreinte enregistrées localement.'}); paint(container,dutService.getDut(dut.id)); }
        catch(err){root.querySelector('#pdf-error').textContent=err.message;button.disabled=false;}
      },
    });
  });
  box.querySelector('#btn-preview-pdf')?.addEventListener('click', async () => {
    const button=box.querySelector('#btn-preview-pdf');button.disabled=true;
    try {
      const pdf=await import('../services/pdf.service.js?v=dut-v2');
      const doc=await pdf.generateDutPdf(dut,{preview:true,download:false});
      const preview=await import('./pdf-preview.view.js');
      await preview.showPdfPreview(doc);
    } catch(err){toast({type:'error',title:'Aperçu impossible',desc:err.message});}
    finally {button.disabled=false;}
  });
}

function renderDetailTab(container, dut) {
  const totalsM = dutService.computeMarchandiseTotals(dut.marchandises);
  const totalsF = dutService.computeFacturationTotals(dut.facturation);
  const record = safeDossier(dut.id);
  const openIncidents = record.incidents.filter((i) => i.status === 'OPEN').length;
  const controls = getAllControlLogs().filter((c) => c.dutId === dut.id).sort((x, y) => Date.parse(y.date || 0) - Date.parse(x.date || 0));
  const driver = [dut.general.driverNom, dut.general.driverPrenoms].filter(Boolean).join(' ');
  const tab = container.querySelector('#tab-content');

  tab.innerHTML = `
    <div class="dd-body">
      <div class="dd-main">
        <article class="card dd-card">
          <header class="dd-card-head">${icon('users', { size: 18 })}<h3>Parties</h3></header>
          <div class="dd-parties">
            ${partyHtml('Expéditeur', dut.expediteur)}
            <span class="dd-parties-arrow" aria-hidden="true">${icon('arrowRight', { size: 18 })}</span>
            ${partyHtml('Destinataire', dut.destinataire)}
          </div>
        </article>

        <article class="card dd-card">
          <header class="dd-card-head">${icon('truck', { size: 18 })}<h3>Véhicule et conducteur</h3></header>
          <div class="dd-vehicle">
            <div class="dd-plate" aria-label="Immatriculation">${escapeHtml(dut.general.immatriculation || '—')}</div>
            <dl class="dd-list">
              ${dlRow('Transporteur', dut.general.transporterName)}
              ${dlRow('Conducteur', driver)}
              ${dlRow('Compte', ACCOUNT_LABELS[dut.general.compte] || dut.general.compte)}
              ${dlRow('Type de transport', TRANSPORT_LABELS[dut.general.transportType] || dut.general.transportType)}
              ${dlRow('Date d’émission', dut.general.dateEmission ? formatDate(dut.general.dateEmission) : '')}
            </dl>
          </div>
        </article>

        <article class="card dd-card">
          <header class="dd-card-head">${icon('package', { size: 18 })}<h3>Marchandise</h3>${dut.dangereuse ? '<span class="badge badge-warning">Dangereuse</span>' : ''}${dut.temperatureControlee ? '<span class="badge badge-neutral">Sous température</span>' : ''}</header>
          <div class="dd-figures">
            <div><strong>${formatNumber(totalsM.poidsTonnes, 1)}<small> t</small></strong><span>Poids total</span></div>
            <div><strong>${formatNumber(totalsM.volumeM3, 1)}<small> m³</small></strong><span>Volume total</span></div>
            <div><strong>${formatMoney(totalsM.valeur)}</strong><span>Valeur déclarée</span></div>
          </div>
          ${dut.marchandises.length ? `<ul class="dd-goods">${dut.marchandises.map((m) => `<li><span>${escapeHtml(m.nature || 'Nature non précisée')}</span><b>${formatNumber(Number(m.poidsTonnes) || 0, 1)} t</b></li>`).join('')}</ul>` : '<p class="text-muted">Aucune marchandise déclarée.</p>'}
        </article>
      </div>

      <aside class="dd-aside">
        ${dut.dutNumber ? `
          <article class="card dd-card dd-qr">
            <header class="dd-card-head">${icon('qrcode', { size: 18 })}<h3>QR de vérification</h3></header>
            <div id="qr-holder"></div>
            <p class="text-muted">Jeton opaque, sans donnée métier — vérifié dans les données locales du POC.</p>
          </article>` : ''}

        <article class="card dd-card dd-receipt">
          <header class="dd-card-head">${icon('file', { size: 18 })}<h3>Montant à percevoir</h3></header>
          <dl>
            ${receiptRow('Total HT', totalsF.totalHT)}
            ${receiptRow('TVA', totalsF.tva)}
            ${receiptRow('Timbre fiscal', totalsF.timbreTotal)}
          </dl>
          <div class="dd-receipt-total"><span>Total</span><strong>${formatMoney(totalsF.totalAPercevoir)}</strong></div>
        </article>

        <article class="card dd-card">
          <header class="dd-card-head">${icon('layers', { size: 18 })}<h3>Suivi du dossier</h3></header>
          <div class="dd-counters">
            ${counterHtml('documents', 'Documents joints', record.files.length, 'paperclip')}
            ${counterHtml('incidents', 'Incidents ouverts', openIncidents, 'alertTriangle', openIncidents > 0)}
            ${counterHtml('controls', 'Contrôles routiers', controls.length, 'shield')}
          </div>
        </article>
      </aside>
    </div>
  `;

  const goTo = (section) => navigate(`/dut/${encodeURIComponent(dut.id)}/${section}`);
  const modals = {
    documents: () => openModal({ icon: 'paperclip', title: 'Documents joints', large: true, bodyHtml: documentsModalHtml(record.files), confirmLabel: 'Gérer les documents', cancelLabel: 'Fermer', onConfirm: ({ close }) => { close(); goTo('documents'); } }),
    incidents: () => openModal({ icon: 'alertTriangle', tone: openIncidents ? 'error' : 'accent', title: 'Incidents et réserves', large: true, bodyHtml: incidentsModalHtml(record.incidents), confirmLabel: 'Gérer les incidents', cancelLabel: 'Fermer', onConfirm: ({ close }) => { close(); goTo('incidents'); } }),
    controls: () => openModal({ icon: 'shield', title: 'Contrôles routiers', large: true, bodyHtml: controlsModalHtml(controls), confirmLabel: 'Fermer', hideCancel: true }),
  };
  tab.querySelectorAll('[data-counter]').forEach((button) => button.addEventListener('click', () => modals[button.dataset.counter]()));
  if (dut.dutNumber) qrService.renderQrInto(tab.querySelector('#qr-holder'), dut.qrSigned, 168);
}

function safeDossier(id) {
  try { return dossier(id); } catch { return { incidents: [], files: [], events: [] }; }
}

function heroHtml(dut, totalsM) {
  const from = dut.trajet.chargement;
  const to = dut.trajet.dechargement;
  const goods = dut.marchandises[0]?.nature;
  return `
    <section class="dd-hero">
      <div class="dd-hero-top">
        <div class="dd-hero-id">
          <span class="overline">DUT · ${dut.dutNumber ? 'Document officiel' : 'Dossier non numéroté'}</span>
          <div class="dd-title-row">
            <h1>${escapeHtml(dut.dutNumber || `Dossier ${dut.general.immatriculation || 'sans véhicule'}`)}</h1>
            <span class="badge status-${dut.status}"><span class="badge-dot"></span>${DUT_STATUS_LABELS[dut.status]}</span>
          </div>
          <p class="dd-hero-sub">${escapeHtml(dut.partnerName)} · Antenne ${escapeHtml(dut.antennaName || '—')}</p>
        </div>
        <div class="dd-actions" id="dut-actions"></div>
      </div>
      <div class="dd-route" aria-label="Trajet de ${escapeHtml(from.ville || 'départ inconnu')} à ${escapeHtml(to.ville || 'arrivée inconnue')}">
        <div class="dd-city">
          <small>Départ</small>
          <strong>${escapeHtml(from.ville || '—')}</strong>
          <span>${dut.trajet.dateDepart ? formatDate(dut.trajet.dateDepart) : 'Date à préciser'}${dut.trajet.heureDepart ? ` · ${escapeHtml(dut.trajet.heureDepart)}` : ''}</span>
        </div>
        <div class="dd-route-line" aria-hidden="true"><span class="dd-route-truck">${icon('truck', { size: 18 })}</span></div>
        <div class="dd-city dd-city-end">
          <small>Arrivée</small>
          <strong>${escapeHtml(to.ville || '—')}</strong>
          <span>${dut.trajet.dateArrivee ? formatDate(dut.trajet.dateArrivee) : 'Date à préciser'}${dut.trajet.heureArrivee ? ` · ${escapeHtml(dut.trajet.heureArrivee)}` : ''}</span>
        </div>
      </div>
      <dl class="dd-facts">
        <div><dt>Transporteur</dt><dd>${escapeHtml(dut.general.transporterName || '—')}</dd></div>
        <div><dt>Véhicule</dt><dd>${escapeHtml(dut.general.immatriculation || '—')}</dd></div>
        <div><dt>Marchandise</dt><dd>${escapeHtml(goods || '—')}${totalsM.poidsTonnes ? ` · ${formatNumber(totalsM.poidsTonnes, 1)} t` : ''}</dd></div>
        <div><dt>Valeur déclarée</dt><dd>${formatMoney(totalsM.valeur)}</dd></div>
      </dl>
    </section>`;
}

function statusAlertHtml(dut, user) {
  const anomaly = safeDossier(dut.id).b2fAnomalie;
  const b2fAlert = anomaly ? `<div class="dd-alert is-warning" role="status">${icon('alertTriangle', { size: 20 })}<div class="dd-alert-text"><strong>Étape « ${escapeHtml(anomaly.etape)} » déclarée dans la Bourse de fret le ${formatDateTime(anomaly.at)} alors que le DUT n’était pas validé</strong><p>Statut du DUT à ce moment : ${escapeHtml(DUT_STATUS_LABELS[anomaly.statutDut] || anomaly.statutDut)}. Le camion a pu circuler sans document valide.</p></div></div>` : '';
  return b2fAlert + statusAlertCore(dut, user);
}

function statusAlertCore(dut, user) {
  if (dut.status === 'REJETE') {
    const who = [dut.rejectedAt ? `le ${formatDateTime(dut.rejectedAt)}` : '', dut.rejectedBy ? `par ${escapeHtml(dut.rejectedBy)}` : ''].filter(Boolean).join(' ');
    const cta = can(user, 'dut.edit_draft') ? `<button type="button" class="btn btn-primary" id="btn-correct">${icon('edit', { size: 15 })} Corriger et resoumettre</button>` : '';
    return `<div class="dd-alert is-error" role="status">${icon('xCircle', { size: 20 })}<div class="dd-alert-text"><strong>Dossier rejeté${who ? ` ${who}` : ''}</strong><p>${escapeHtml(dut.rejectionReason || 'Aucun motif précisé.')}</p></div>${cta}</div>`;
  }
  if (dut.status === 'SUSPENDU') return `<div class="dd-alert is-warning" role="status">${icon('alertTriangle', { size: 20 })}<div class="dd-alert-text"><strong>DUT suspendu${dut.suspendedAt ? ` le ${formatDateTime(dut.suspendedAt)}` : ''}</strong><p>Ce DUT ne peut plus être présenté comme valide tant que la suspension n’est pas levée.</p></div></div>`;
  if (dut.status === 'RETIRE') return `<div class="dd-alert is-error" role="status">${icon('xCircle', { size: 20 })}<div class="dd-alert-text"><strong>DUT retiré${dut.withdrawnAt ? ` le ${formatDateTime(dut.withdrawnAt)}` : ''}</strong><p>Ce document n’est plus valide.</p></div></div>`;
  return '';
}

/** Frise du cycle de vie : étapes passées, en cours, à venir. */
function lifecycleHtml(dut) {
  const step = (label, at, state) => ({ label, at, state });
  const steps = [step('Créé', dut.createdAt, 'done')];
  const s = dut.status;
  if (s === 'EN_EDITION') steps.push(step('En édition', null, 'current'), step('Soumis', null, 'todo'), step('Validé', null, 'todo'));
  else steps.push(step('Soumis', dut.submittedAt, 'done'));
  if (s === 'TERMINE') steps.push(step('Relecture antenne', null, 'current'), step('Validé', null, 'todo'));
  if (s === 'REJETE') steps.push(step('Rejeté', dut.rejectedAt, 'error'), step('Correction', null, 'todo'), step('Validé', null, 'todo'));
  if (['VALIDE', 'SUSPENDU', 'RETIRE'].includes(s)) steps.push(step('Validé', dut.validatedAt, 'done'));
  if (s === 'VALIDE') steps.push(nextStage(dut.id) ? { label: 'Transport', at: null, state: 'current', note: stageLabel(dut.id) } : step('Livré', safeDossier(dut.id).events?.find((e) => e.label === 'Livré')?.at || null, 'done'));
  if (s === 'SUSPENDU') steps.push(step('Suspendu', dut.suspendedAt, 'warning'));
  if (s === 'RETIRE') steps.push(step('Retiré', dut.withdrawnAt, 'error'));
  return `<ol class="dd-steps" aria-label="Cycle de vie du dossier">${steps.map((x) => `
    <li class="dd-step is-${x.state}"${x.state === 'current' ? ' aria-current="step"' : ''}>
      <span class="dd-step-dot" aria-hidden="true">${x.state === 'done' ? icon('check', { size: 12 }) : x.state === 'error' ? icon('x', { size: 12 }) : ''}</span>
      <strong>${x.label}</strong>
      <small>${x.note ? escapeHtml(x.note) : x.at ? formatDateTime(x.at) : x.state === 'current' ? 'En cours' : 'À venir'}</small>
    </li>`).join('')}</ol>`;
}

function partyHtml(role, party = {}) {
  const name = party.raisonSociale || '';
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  return `<div class="dd-party">
    <span class="dd-party-avatar" aria-hidden="true">${escapeHtml(initials)}</span>
    <div><small>${role}</small><strong>${escapeHtml(name || '—')}</strong>${party.adresse ? `<span>${escapeHtml(party.adresse)}</span>` : ''}${party.contact ? `<span>${escapeHtml(party.contact)}</span>` : ''}</div>
  </div>`;
}

function dlRow(label, value) {
  return `<div><dt>${label}</dt><dd>${escapeHtml(value || '—')}</dd></div>`;
}

function receiptRow(label, value) {
  return `<div><dt>${label}</dt><dd>${formatMoney(value)}</dd></div>`;
}

/** Compteur du dossier : ouvre le détail dans une fenêtre. */
function counterHtml(key, label, value, iconName, alert = false) {
  return `<button type="button" class="dd-counter${alert ? ' is-alert' : ''}" data-counter="${key}" aria-haspopup="dialog">
    <span class="dd-counter-icon" aria-hidden="true">${icon(iconName, { size: 16 })}</span>
    <span>${label}</span><b>${formatNumber(value)}</b>${icon('chevronRight', { size: 15 })}
  </button>`;
}

const VERDICT_LABELS = { VERT: ['Valide', 'badge-success'], ORANGE: ['À vérifier', 'badge-warning'], ROUGE: ['Refusé', 'badge-error'], INCONNU: ['Inconnu', 'badge-neutral'] };

function emptyModal(text) {
  return `<p class="dd-modal-empty">${text}</p>`;
}

function documentsModalHtml(files) {
  if (!files.length) return emptyModal('Aucun document joint pour ce dossier.');
  return `<ul class="dd-modal-list">${files.map((f) => `
    <li>
      <span class="dd-modal-icon" aria-hidden="true">${icon('file', { size: 16 })}</span>
      <div><strong>${escapeHtml(f.name)}</strong><small>${escapeHtml(f.category || 'Sans catégorie')} · ${Math.ceil((f.size || 0) / 1024)} Ko · ${formatDateTime(f.at)} · ${escapeHtml(f.author || '')}</small></div>
      ${/^data:(application\/pdf|image\/(png|jpeg));/.test(f.data || '') ? `<a class="btn btn-secondary btn-sm" href="${escapeHtml(f.data)}" download="${escapeHtml(f.name)}">${icon('download', { size: 14 })} Télécharger</a>` : ''}
    </li>`).join('')}</ul>`;
}

function incidentsModalHtml(incidents) {
  if (!incidents.length) return emptyModal('Aucun incident ni réserve signalé.');
  return `<ul class="dd-modal-list">${incidents.map((i) => {
    const open = i.status === 'OPEN';
    const badge = open ? (i.severity === 'URGENT' ? ['Urgent · ouvert', 'badge-error'] : ['Ouvert', 'badge-warning']) : ['Résolu', 'badge-success'];
    return `<li>
      <span class="dd-modal-icon${open ? ' is-alert' : ''}" aria-hidden="true">${icon(open ? 'alertTriangle' : 'checkCircle', { size: 16 })}</span>
      <div><strong>${escapeHtml(i.type)} <span class="badge ${badge[1]}">${badge[0]}</span></strong>
        <p class="preserve-lines">${escapeHtml(i.description)}</p>
        <small>Suivi : ${escapeHtml(i.assignee)} · ${formatDateTime(i.createdAt)} · ${escapeHtml(i.author || '')}</small>
        ${open ? '' : `<small>Résolution : ${escapeHtml(i.resolution || '')} · ${formatDateTime(i.resolvedAt)}</small>`}</div>
    </li>`;
  }).join('')}</ul>`;
}

function controlsModalHtml(controls) {
  if (!controls.length) return emptyModal('Ce DUT n’a encore été contrôlé sur aucun poste.');
  return `<ul class="dd-modal-list">${controls.map((c) => {
    const [label, cls] = VERDICT_LABELS[verdictOf(c)] || VERDICT_LABELS.INCONNU;
    return `<li>
      <span class="dd-modal-icon" aria-hidden="true">${icon('scan', { size: 16 })}</span>
      <div><strong>${escapeHtml(c.postName || 'Poste non renseigné')} <span class="badge ${cls}">${label}</span></strong>
        <small>${formatDateTime(c.date)} · ${escapeHtml(c.agentLabel || '')} · ${c.mode === 'HORS_LIGNE' ? 'hors ligne' : 'en ligne'}</small></div>
    </li>`;
  }).join('')}</ul>`;
}

function renderAuditTab(container, dut) {
  const logs = auditService.forDut(dut.id);
  const tab = container.querySelector('#tab-content');
  const prints = printHistory(dut.id);
  if (logs.length === 0 && prints.length === 0) {
    tab.innerHTML = `<div class="card empty-state">${icon('clock', { size: 36 })}<h3>Aucun événement</h3></div>`;
    return;
  }
  tab.innerHTML = `
    <div class="card">
      <div class="timeline">
        ${prints.map(p=>`<div class="timeline-item"><span class="timeline-dot done"></span><div class="timeline-content"><strong>Impression n° ${p.rank} · ${escapeHtml(COPIES[p.copy])}</strong><div class="meta">${formatDateTime(p.at)} · ${escapeHtml(p.author)}</div><p>${escapeHtml(p.reason)}</p><small style="overflow-wrap:anywhere">SHA-256 : ${escapeHtml(p.hash)}</small></div></div>`).join('')}
        ${logs.map((l) => `
          <div class="timeline-item">
            <span class="timeline-dot ${DONE_ACTIONS.includes(l.action) ? 'done' : ''}"></span>
            <div class="timeline-content">
              <strong>${escapeHtml(AUDIT_LABELS[l.action] || l.label)}</strong>
              <div class="meta">${formatDateTime(l.date)} · ${escapeHtml(l.userLabel)} (${l.role})</div>
              ${l.note ? `<div class="note">${escapeHtml(l.note)}</div>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}
