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

const DONE_ACTIONS = ['DUT_VALIDATED', 'DUT_UNSUSPENDED'];

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
  const totalsF = dutService.computeFacturationTotals(dut.facturation);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <span class="overline">DUT · Détail</span>
        <div class="row gap-2" style="margin-top:6px">
          <h1>${escapeHtml(dut.dutNumber || 'Brouillon DUT')}</h1>
          <span class="badge status-${dut.status}"><span class="badge-dot"></span>${DUT_STATUS_LABELS[dut.status]}</span>
        </div>
        <div class="subtitle">${escapeHtml(dut.partnerName)} · Antenne ${escapeHtml(dut.antennaName || '—')}</div>
      </div>
      <div class="row gap-2" id="dut-actions"></div>
    </div>
    <div class="page-header-rule"></div>

    ${dut.status === 'REJETE' ? `
      <div class="alert-banner error">${icon('alertTriangle', { size: 18 })}<div class="alert-text"><strong>DUT rejeté</strong>${escapeHtml(dut.rejectionReason || '')}</div></div>
    ` : ''}
    ${dut.status === 'SUSPENDU' ? `
      <div class="alert-banner warning">${icon('alertTriangle', { size: 18 })}<div class="alert-text"><strong>DUT suspendu</strong>Ce DUT ne peut plus être présenté comme valide tant que la suspension n’est pas levée.</div></div>
    ` : ''}
    ${dut.status === 'RETIRE' ? `
      <div class="alert-banner error">${icon('xCircle', { size: 18 })}<div class="alert-text"><strong>DUT retiré</strong>Ce document n’est plus valide.</div></div>
    ` : ''}

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
  if (dut.status === 'REJETE' && can(user, 'dut.edit_draft')) {
    buttons.push(`<button type="button" class="btn btn-primary" id="btn-correct">${icon('edit', { size: 15 })} Corriger</button>`);
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
  box.innerHTML = buttons.join('');
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
  box.querySelector('#btn-correct')?.addEventListener('click', () => {
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
  const tab = container.querySelector('#tab-content');

  tab.innerHTML = `
    <div class="dash-grid">
      <div class="card" style="padding:26px 0">
        ${recapSection('Transport', [
          ['Date émission', formatDate(dut.general.dateEmission)],
          ['Compte', dut.general.compte],
          ['Type de transport', dut.general.transportType?.replaceAll('_', ' ')],
          ['Transporteur', dut.general.transporterName],
          ['Véhicule', dut.general.immatriculation],
          ['Conducteur', `${dut.general.driverNom} ${dut.general.driverPrenoms}`],
        ])}
        ${recapSection('Parties', [
          ['Expéditeur', dut.expediteur.raisonSociale],
          ['Destinataire', dut.destinataire.raisonSociale],
        ])}
        ${recapSection('Trajet', [
          ['Origine', dut.trajet.chargement.ville],
          ['Destination', dut.trajet.dechargement.ville],
          ['Départ', dut.trajet.dateDepart ? formatDate(dut.trajet.dateDepart) : '—'],
          ['Arrivée', dut.trajet.dateArrivee ? formatDate(dut.trajet.dateArrivee) : '—'],
        ])}
        ${recapSection('Marchandise', [
          ['Nature', dut.marchandises[0]?.nature],
          ['Poids total', `${formatNumber(totalsM.poidsTonnes, 1)} t`],
          ['Volume total', `${formatNumber(totalsM.volumeM3, 1)} m³`],
          ['Valeur totale', formatMoney(totalsM.valeur)],
        ])}
        ${recapSection('Conditions financières', [
          ['Total HT', formatMoney(totalsF.totalHT)],
          ['TVA', formatMoney(totalsF.tva)],
          ['Timbre fiscal', formatMoney(totalsF.timbreTotal)],
          ['Total à percevoir', formatMoney(totalsF.totalAPercevoir)],
        ], true)}
      </div>
      <div class="stack gap-4">
        ${dut.dutNumber ? `
          <div class="card text-center">
            <h3 style="margin-bottom:var(--s3)">QR de vérification</h3>
            <div id="qr-holder" style="display:flex;justify-content:center"></div>
            <p class="text-muted" style="font-size:.75rem;margin-top:var(--s2)">Jeton opaque, sans donnée métier — vérifié dans les données locales du POC.</p>
          </div>
        ` : ''}
        <div class="card">
          <h3 style="margin-bottom:var(--s2)">Cycle de vie</h3>
          <div class="timeline">
            <div class="timeline-item"><span class="timeline-dot done"></span><div class="timeline-content"><strong>Créé</strong><div class="meta">${formatDateTime(dut.createdAt)}</div></div></div>
            ${dut.submittedAt ? `<div class="timeline-item"><span class="timeline-dot done"></span><div class="timeline-content"><strong>Soumis</strong><div class="meta">${formatDateTime(dut.submittedAt)}</div></div></div>` : ''}
            ${dut.validatedAt ? `<div class="timeline-item"><span class="timeline-dot done"></span><div class="timeline-content"><strong>Validé</strong><div class="meta">${formatDateTime(dut.validatedAt)} · ${escapeHtml(dut.validatedBy || '')}</div></div></div>` : ''}
          </div>
        </div>
      </div>
    </div>
  `;

  if (dut.dutNumber) qrService.renderQrInto(tab.querySelector('#qr-holder'), dut.qrSigned, 168);
}

function recapSection(title, rows, highlight = false) {
  return `
    <div class="recap-section" style="padding-left:26px;padding-right:26px">
      <h3><span class="overline" style="font-size:.6rem">${title}</span></h3>
      <div class="recap-grid">
        ${rows.map(([label, value]) => `<div class="recap-item"><span>${label}</span><strong${highlight ? ' style="font-size:18px"' : ''}>${escapeHtml(value || '—')}</strong></div>`).join('')}
      </div>
    </div>
  `;
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
