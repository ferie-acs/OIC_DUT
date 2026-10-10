import { accessibleDut, dossier } from '../services/workspace.service.js';
import { renderWorkspace } from './dossier-workspace.view.js';
import { icon } from '../core/icons.js';
import { escapeHtml, uuid, formatMoney, formatNumber } from '../core/utils.js';
import { navigate } from '../core/router.js';
import { toast, confirmAction } from '../core/ui.js';
import { getCurrentUser } from '../core/auth.js';
import * as dutService from '../services/dut.service.js';
import {
  transporters, vehicles, drivers, thirdParties, merchandiseTypes, packagingTypes,
} from '../services/referentials.service.js';

const STEPS = [
  { id: '1', label: 'Général' },
  { id: '2', label: 'Parties' },
  { id: '3', label: 'Marchandise' },
  { id: '4', label: 'Facturation' },
  { id: '5', label: 'Trajet' },
  { id: '6', label: 'Annexes' },
  { id: 'summary', label: 'Récapitulatif' },
];

function getDraftId() {
  return sessionStorage.getItem('dut_wizard_draft_id');
}

export function render(container, params) {
  const id = getDraftId();
  let dut;
  try { dut = id ? accessibleDut(id) : null; } catch {}
  if (!dut) {
    toast({ type: 'error', title: 'Aucun brouillon en cours', desc: 'Créez un nouveau DUT depuis le tableau de bord.' });
    navigate('/partner/dashboard');
    return;
  }
  if (dut.status !== 'EN_EDITION') {
    navigate(`/dut/${dut.id}`);
    return;
  }
  const step = params.step || '1';

  const currentIdx = STEPS.findIndex((x) => x.id === step);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <span class="overline">Partenaire · Documents</span>
        <h1>Nouveau DUT</h1>
        <div class="subtitle">Brouillon · ${escapeHtml(dut.partnerName)}</div>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" id="btn-exit">${icon('x', { size: 14 })} Fermer</button>
    </div>
    <div class="page-header-rule"></div>

    <div class="stepper-h" aria-label="Étapes du dossier">
      ${STEPS.map((s, i) => {
        const cls = i < currentIdx ? 'done' : i === currentIdx ? 'current' : '';
        return `
          ${i > 0 ? `<div class="stepper-h-connector ${i <= currentIdx ? 'done' : ''}"></div>` : ''}
          <a class="stepper-h-step ${cls}" href="#/dut/new/${s.id}" style="text-decoration:none">
            <span class="dot">${i < currentIdx ? icon('check', { size: 12 }) : i + 1}</span>
            <span class="label">${s.label}</span>
          </a>
        `;
      }).join('')}
    </div>

    <div class="wizard">
      <div class="card wizard-content" id="wizard-content"></div>
      <div class="card live-recap">
        <div class="live-recap-head">
          <div class="live-recap-ring" style="--p:${Math.round((currentIdx / (STEPS.length - 1)) * 100)}%" aria-hidden="true"><span>${currentIdx + 1}/${STEPS.length}</span></div>
          <div>
            <h3>Récapitulatif en cours</h3>
            <p class="live-recap-step">Étape ${currentIdx + 1} sur ${STEPS.length} · ${STEPS[currentIdx]?.label || ''}</p>
          </div>
        </div>
        <div id="live-recap-body"></div>
      </div>
    </div>
  `;

  container.querySelector('#btn-exit').addEventListener('click', () => {
    sessionStorage.removeItem('dut_wizard_draft_id');
    navigate('/partner/dut');
  });

  renderLiveRecap(container.querySelector('#live-recap-body'), dut);

  const content = container.querySelector('#wizard-content');
  renderStep(content, dut, step);
}

function recapRow(label, value) {
  return value ? `<div class="live-recap-item"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>` : '';
}

function renderLiveRecap(el, dut) {
  const rows = [
    recapRow('Transporteur', dut.general.transporterName),
    recapRow('Véhicule', dut.general.immatriculation),
    recapRow('Conducteur', [dut.general.driverNom, dut.general.driverPrenoms].filter(Boolean).join(' ')),
    recapRow('Expéditeur', dut.expediteur.raisonSociale),
    recapRow('Destinataire', dut.destinataire.raisonSociale),
    recapRow('Marchandise', dut.marchandises[0]?.nature),
    recapRow('Origine', dut.trajet.chargement.ville),
    recapRow('Destination', dut.trajet.dechargement.ville),
  ].join('');
  el.innerHTML = rows || '<p class="live-recap-empty">Les informations saisies apparaîtront ici au fil des étapes.</p>';
}

function renderStep(content, dut, step) {
  const renderers = {
    1: stepGeneral, 2: stepParties, 3: stepMarchandise,
    4: stepFacturation, 5: stepTrajet, 6: stepAnnexes, summary: stepSummary,
  };
  const wirers = {
    1: wireGeneral, 2: wireParties, 3: wireMarchandise,
    4: wireFacturation, 5: wireTrajet, 6: wireAnnexes, summary: wireSummary,
  };
  content.innerHTML = renderers[step](dut);
  wirers[step](content, dut);
}

function footerNav(content, dut, step, { onNext, isLast = false } = {}) {
  const idx = STEPS.findIndex((s) => s.id === step);
  const footer = document.createElement('div');
  footer.className = 'wizard-footer';
  footer.innerHTML = `
    <div>${idx > 0 ? `<button type="button" class="btn btn-secondary" id="btn-prev">${icon('chevronLeft', { size: 15 })} Retour</button>` : '<span></span>'}</div>
    <div class="row gap-2">
      <button type="button" class="btn btn-secondary" id="btn-save-draft">Sauvegarder brouillon</button>
      ${!isLast ? `<button type="button" class="btn btn-primary" id="btn-continue">Continuer ${icon('chevronRight', { size: 15 })}</button>` : ''}
    </div>
  `;
  content.appendChild(footer);

  footer.querySelector('#btn-prev')?.addEventListener('click', () => {
    dutService.saveDraft(dut.id, collectStep(step, content), { silent: true });
    navigate(`/dut/new/${STEPS[idx - 1].id}`);
  });
  footer.querySelector('#btn-save-draft').addEventListener('click', () => {
    dutService.saveDraft(dut.id, collectStep(step, content));
    toast({ type: 'success', title: 'Brouillon sauvegardé' });
  });
  footer.querySelector('#btn-continue')?.addEventListener('click', () => {
    const patch = collectStep(step, content);
    const errors = onNext ? onNext(patch, content) : [];
    if (errors && errors.length) {
      toast({ type: 'error', title: errors[0] });
      return;
    }
    dutService.saveDraft(dut.id, patch, { silent: true });
    navigate(`/dut/new/${STEPS[idx + 1].id}`);
  });
}

function field({ id, label, value = '', type = 'text', required = false, placeholder = '', list = null }) {
  return `
    <div class="field">
      <label for="${id}">${label}${required ? ' <span class="req">*</span>' : ''}</label>
      <input class="input" type="${type}" id="${id}" value="${escapeHtml(value)}" placeholder="${placeholder}" ${list ? `list="${list}"` : ''}>
    </div>
  `;
}

function selectField({ id, label, value = '', options, required = false }) {
  return `
    <div class="field">
      <label for="${id}">${label}${required ? ' <span class="req">*</span>' : ''}</label>
      <div class="select-wrap">
        <select class="select" id="${id}">
          ${options.map((o) => `<option value="${o.value}" ${o.value === value ? 'selected' : ''}>${o.label}</option>`).join('')}
        </select>
        ${icon('chevronDown', { size: 14 })}
      </div>
    </div>
  `;
}

function val(content, id) { return content.querySelector(`#${id}`)?.value ?? ''; }

/* ===================== ÉTAPE 1 — GÉNÉRAL ===================== */
function stepGeneral(dut) {
  const g = dut.general;
  return `
    <h2>1. Informations générales</h2>
    <div class="wizard-section-label">Émission</div>
    <div class="field-row">
      ${field({ id: 'f-dateEmission', label: 'Date émission', type: 'date', value: g.dateEmission, required: true })}
      ${field({ id: 'f-lieuEdition', label: 'Lieu édition', value: g.lieuEdition, placeholder: 'ex : Abidjan' })}
    </div>
    <div class="field-row">
      ${selectField({ id: 'f-compte', label: 'Compte', value: g.compte, options: [{ value: 'PROPRE', label: 'Compte propre' }, { value: 'AUTRUI', label: 'Compte d’autrui' }, { value: 'SOUS_TRAITANCE', label: 'Sous-traitance' }] })}
      ${selectField({ id: 'f-transportType', label: 'Type de transport', value: g.transportType, options: [{ value: 'NATIONAL', label: 'National' }, { value: 'VERS_INTERNATIONAL', label: 'Vers international' }, { value: 'VERS_NATIONAL', label: 'Vers national' }] })}
    </div>
    <div class="wizard-section-label">Transporteur & véhicule</div>
    <div class="field-row">
      ${field({ id: 'f-transporterName', label: 'Transporteur (recherche)', value: g.transporterName, required: true, placeholder: 'Nom du transporteur', list: 'dl-transporters' })}
      ${field({ id: 'f-immatriculation', label: 'Véhicule (immatriculation)', value: g.immatriculation, required: true, placeholder: 'AA-0000-AA', list: 'dl-vehicles' })}
      <input type="hidden" id="f-transporterId" value="${escapeHtml(g.transporterId || '')}">
    </div>
    <datalist id="dl-transporters">${transporters.list().map((t) => `<option value="${escapeHtml(t.name)}">`).join('')}</datalist>
    <datalist id="dl-vehicles">${vehicles.list().map((v) => `<option value="${escapeHtml(v.immatriculation)}">`).join('')}</datalist>
    <div class="wizard-section-label">Conducteur</div>
    <div class="field-row">
      ${field({ id: 'f-driverNom', label: 'Nom', value: g.driverNom, required: true, list: 'dl-drivers' })}
      ${field({ id: 'f-driverPrenoms', label: 'Prénoms', value: g.driverPrenoms, required: true })}
    </div>
    <datalist id="dl-drivers">${drivers.list().map((d) => `<option value="${escapeHtml(d.nom)}">`).join('')}</datalist>
    <div class="field-row">
      ${field({ id: 'f-driverPermis', label: 'Numéro de permis', value: g.driverPermis, required: true })}
      ${field({ id: 'f-driverPiece', label: 'Pièce d’identité', value: g.driverPiece })}
    </div>
  `;
}
function collectGeneral(content) {
  return { general: {
    dateEmission: val(content, 'f-dateEmission'), lieuEdition: val(content, 'f-lieuEdition'),
    compte: val(content, 'f-compte'), transportType: val(content, 'f-transportType'),
    transporterId: val(content, 'f-transporterId'), transporterName: val(content, 'f-transporterName'), immatriculation: val(content, 'f-immatriculation'),
    driverNom: val(content, 'f-driverNom'), driverPrenoms: val(content, 'f-driverPrenoms'),
    driverPermis: val(content, 'f-driverPermis'), driverPiece: val(content, 'f-driverPiece'),
  } };
}
function wireGeneral(content, dut) {
  content.querySelector('#f-transporterName').addEventListener('change', (e) => {
    const t = transporters.list().find((x) => x.name === e.target.value);
    content.querySelector('#f-transporterId').value = t ? t.id : '';
    if (t) content.querySelector('#f-immatriculation').value = vehicles.listByTransporter(t.id)[0]?.immatriculation || content.querySelector('#f-immatriculation').value;
  });
  footerNav(content, dut, '1', {
    onNext: (patch) => {
      const errors = [];
      if (!patch.general.transporterName) errors.push('Le transporteur est obligatoire.');
      if (!patch.general.immatriculation) errors.push('Le véhicule (immatriculation) est obligatoire.');
      if (!patch.general.driverPermis) errors.push('Le numéro de permis est obligatoire.');
      return errors;
    },
  });
}

/* ===================== ÉTAPE 2 — PARTIES ===================== */
function partyBlock(prefix, party, title) {
  return `
    <div class="wizard-section-label">${title}</div>
    <div class="field-row">
      ${field({ id: `f-${prefix}-raisonSociale`, label: 'Raison sociale / nom', value: party.raisonSociale, required: true, list: `dl-third-${prefix}` })}
      ${field({ id: `f-${prefix}-registre`, label: 'Registre', value: party.registre })}
    </div>
    <datalist id="dl-third-${prefix}">${thirdParties.list().map((t) => `<option value="${escapeHtml(t.raisonSociale)}">`).join('')}</datalist>
    <div class="field-row">
      ${field({ id: `f-${prefix}-adresse`, label: 'Adresse', value: party.adresse })}
      ${field({ id: `f-${prefix}-contact`, label: 'Contact', value: party.contact })}
    </div>
    ${field({ id: `f-${prefix}-reference`, label: 'Référence', value: party.reference })}
  `;
}
function stepParties(dut) {
  return `
    <h2>2. Expéditeur / Destinataire</h2>
    ${partyBlock('exp', dut.expediteur, 'Expéditeur')}
    ${partyBlock('dest', dut.destinataire, 'Destinataire')}
  `;
}
function collectParty(content, prefix) {
  return {
    type: 'ENTREPRISE',
    raisonSociale: val(content, `f-${prefix}-raisonSociale`),
    registre: val(content, `f-${prefix}-registre`),
    adresse: val(content, `f-${prefix}-adresse`),
    contact: val(content, `f-${prefix}-contact`),
    reference: val(content, `f-${prefix}-reference`),
  };
}
function collectParties(content) {
  return { expediteur: collectParty(content, 'exp'), destinataire: collectParty(content, 'dest') };
}
function wireParties(content, dut) {
  footerNav(content, dut, '2', {
    onNext: (patch) => {
      const errors = [];
      if (!patch.expediteur.raisonSociale) errors.push('L’expéditeur est obligatoire.');
      if (!patch.destinataire.raisonSociale) errors.push('Le destinataire est obligatoire.');
      return errors;
    },
  });
}

/* ===================== ÉTAPE 3 — MARCHANDISE ===================== */
function stepMarchandise(dut) {
  return `
    <h2>3. Marchandise</h2>
    <div class="field-row" style="margin-bottom:var(--s2)">
      <label class="checkbox-row"><input type="checkbox" id="f-dangereuse" ${dut.dangereuse ? 'checked' : ''}> Marchandise dangereuse</label>
      <label class="checkbox-row"><input type="checkbox" id="f-temperature" ${dut.temperatureControlee ? 'checked' : ''}> Température contrôlée</label>
    </div>
    <div class="table-wrap">
      <table class="data-table" id="marchandise-table">
        <thead><tr><th>Désignation</th><th>Nature</th><th>Emballage</th><th>Qté</th><th>Poids (t)</th><th>Volume (m³)</th><th>Valeur</th><th>Devise</th><th></th></tr></thead>
        <tbody id="marchandise-tbody"></tbody>
      </table>
    </div>
    <datalist id="dl-marchandise">${merchandiseTypes.list().map((m) => `<option value="${escapeHtml(m.nom)}">`).join('')}</datalist>
    <datalist id="dl-emballage">${packagingTypes.list().map((p) => `<option value="${escapeHtml(p.nom)}">`).join('')}</datalist>
    <button type="button" class="btn btn-secondary btn-sm" id="btn-add-marchandise" style="margin-top:var(--s2)">${icon('plus', { size: 14 })} Ajouter une marchandise</button>
    <div class="card-flat" style="margin-top:var(--s3)">
      <div class="recap-grid" id="marchandise-totals"></div>
    </div>
  `;
}
function marchandiseRow(m) {
  return `
    <tr data-id="${m.id}">
      <td><input class="input" data-f="designation" value="${escapeHtml(m.designation || '')}" placeholder="Description de la marchandise"></td>
      <td><input class="input" data-f="nature" value="${escapeHtml(m.nature)}" list="dl-marchandise"></td>
      <td><input class="input" data-f="emballage" value="${escapeHtml(m.emballage)}" list="dl-emballage"></td>
      <td><input class="input" type="number" data-f="quantite" value="${m.quantite}" style="width:80px"></td>
      <td><input class="input" type="number" data-f="poidsTonnes" value="${m.poidsTonnes}" style="width:90px"></td>
      <td><input class="input" type="number" data-f="volumeM3" value="${m.volumeM3}" style="width:90px"></td>
      <td><input class="input" type="number" data-f="valeur" value="${m.valeur}" style="width:110px"></td>
      <td><input class="input" data-f="devise" value="${escapeHtml(m.devise || 'FCFA')}" style="width:80px"></td>
      <td><button type="button" class="btn btn-ghost btn-icon btn-remove-row" aria-label="Retirer">${icon('trash', { size: 14 })}</button></td>
    </tr>
  `;
}
function readMarchandisesFromDom(content) {
  return [...content.querySelectorAll('#marchandise-tbody tr')].map((tr) => ({
    id: tr.dataset.id,
    designation: tr.querySelector('[data-f=designation]').value,
    nature: tr.querySelector('[data-f=nature]').value,
    emballage: tr.querySelector('[data-f=emballage]').value,
    quantite: Number(tr.querySelector('[data-f=quantite]').value) || 0,
    poidsTonnes: Number(tr.querySelector('[data-f=poidsTonnes]').value) || 0,
    volumeM3: Number(tr.querySelector('[data-f=volumeM3]').value) || 0,
    valeur: Number(tr.querySelector('[data-f=valeur]').value) || 0,
    devise: tr.querySelector('[data-f=devise]').value || 'FCFA',
  }));
}
function renderTotals(content) {
  const totals = dutService.computeMarchandiseTotals(readMarchandisesFromDom(content));
  content.querySelector('#marchandise-totals').innerHTML = `
    <div class="recap-item"><span>Total quantité</span><strong>${formatNumber(totals.quantite)}</strong></div>
    <div class="recap-item"><span>Total poids</span><strong>${formatNumber(totals.poidsTonnes, 1)} t</strong></div>
    <div class="recap-item"><span>Total volume</span><strong>${formatNumber(totals.volumeM3, 1)} m³</strong></div>
    <div class="recap-item"><span>Total valeur</span><strong>${formatMoney(totals.valeur)}</strong></div>
  `;
}
function collectMarchandise(content) {
  return { dangereuse: content.querySelector('#f-dangereuse').checked, temperatureControlee: content.querySelector('#f-temperature').checked, marchandises: readMarchandisesFromDom(content) };
}
function wireMarchandise(content, dut) {
  const tbody = content.querySelector('#marchandise-tbody');
  const list = dut.marchandises.length ? dut.marchandises : [{ id: uuid(), nature: '', emballage: '', quantite: 0, poidsTonnes: 0, volumeM3: 0, valeur: 0, devise: 'FCFA' }];
  tbody.innerHTML = list.map(marchandiseRow).join('');
  renderTotals(content);

  tbody.addEventListener('input', () => renderTotals(content));
  tbody.addEventListener('click', (e) => {
    if (e.target.closest('.btn-remove-row')) {
      e.target.closest('tr').remove();
      renderTotals(content);
    }
  });
  content.querySelector('#btn-add-marchandise').addEventListener('click', () => {
    tbody.insertAdjacentHTML('beforeend', marchandiseRow({ id: uuid(), nature: '', emballage: '', quantite: 0, poidsTonnes: 0, volumeM3: 0, valeur: 0, devise: 'FCFA' }));
  });

  footerNav(content, dut, '3', {
    onNext: (patch) => {
      const errors = [];
      if (!patch.marchandises.length || patch.marchandises.every((m) => !m.nature)) errors.push('Veuillez ajouter au moins une marchandise.');
      return errors;
    },
  });
}

/* ===================== ÉTAPE 4 — FACTURATION ===================== */
function posteFields(prefix, poste, title) {
  return `
    <div class="card-flat">
      <h3 style="margin-bottom:var(--s3)">${title}</h3>
      ${field({ id: `f-${prefix}-prixTransport`, label: 'Prix transport', type: 'number', value: poste.prixTransport })}
      ${field({ id: `f-${prefix}-accessoires`, label: 'Prestations accessoires', type: 'number', value: poste.accessoires })}
      ${field({ id: `f-${prefix}-complementaires`, label: 'Prestations complémentaires', type: 'number', value: poste.complementaires })}
      ${field({ id: `f-${prefix}-autres`, label: 'Autres frais', type: 'number', value: poste.autres })}
      <div class="field-row">
        ${field({ id: `f-${prefix}-tva`, label: 'TVA (%)', type: 'number', value: poste.tva ?? 18 })}
        ${field({ id: `f-${prefix}-timbre`, label: 'Timbre fiscal (FCFA)', type: 'number', value: poste.timbre ?? 0 })}
      </div>
    </div>
  `;
}
function stepFacturation(dut) {
  const f = dut.facturation;
  return `
    <h2>4. Facturation</h2>
    <div class="field-row">
      ${posteFields('exp', f.expediteur, 'Expéditeur')}
      ${posteFields('dest', f.destinataire, 'Destinataire')}
    </div>
    <div class="hint" style="margin-bottom:var(--s3)">Le droit de timbre fiscal ivoirien s’applique par côté ; le total des deux timbres doit atteindre 100 FCFA minimum.</div>
    <div class="card-flat" id="facturation-totals"></div>
  `;
}
function readFacturationFromDom(content) {
  const num = (id) => Number(val(content, id)) || 0;
  return {
    expediteur: { prixTransport: num('f-exp-prixTransport'), accessoires: num('f-exp-accessoires'), complementaires: num('f-exp-complementaires'), autres: num('f-exp-autres'), tva: num('f-exp-tva'), timbre: num('f-exp-timbre') },
    destinataire: { prixTransport: num('f-dest-prixTransport'), accessoires: num('f-dest-accessoires'), complementaires: num('f-dest-complementaires'), autres: num('f-dest-autres'), tva: num('f-dest-tva'), timbre: num('f-dest-timbre') },
  };
}
function renderFacturationTotals(content) {
  const totals = dutService.computeFacturationTotals(readFacturationFromDom(content));
  content.querySelector('#facturation-totals').innerHTML = `
    <div class="recap-grid">
      <div class="recap-item"><span>Total HT</span><strong>${formatMoney(totals.totalHT)}</strong></div>
      <div class="recap-item"><span>TVA</span><strong>${formatMoney(totals.tva)}</strong></div>
      <div class="recap-item"><span>Timbre fiscal</span><strong>${formatMoney(totals.timbreTotal)}</strong></div>
      <div class="recap-item"><span>Total à percevoir</span><strong class="text-success" style="font-size:1.1rem">${formatMoney(totals.totalAPercevoir)}</strong></div>
    </div>
  `;
}
function collectFacturation(content) { return { facturation: readFacturationFromDom(content) }; }
function wireFacturation(content, dut) {
  content.addEventListener('input', (e) => { if (e.target.closest('.field-row')) renderFacturationTotals(content); });
  renderFacturationTotals(content);
  footerNav(content, dut, '4', {
    onNext: (patch) => {
      const total = (Number(patch.facturation.expediteur.timbre) || 0) + (Number(patch.facturation.destinataire.timbre) || 0);
      return total < 100 ? ['Facture sans timbre ou montant en dessous de 100 FCFA.'] : [];
    },
  });
}

/* ===================== ÉTAPE 5 — TRAJET ===================== */
function pointBlock(prefix, point, title) {
  return `
    <div class="wizard-section-label">${title}</div>
    <div class="field-row">
      ${field({ id: `f-${prefix}-lieu`, label: 'Lieu', value: point.lieu })}
      ${field({ id: `f-${prefix}-ville`, label: 'Ville', value: point.ville, required: true })}
    </div>
    <div class="field-row">
      ${field({ id: `f-${prefix}-adresse`, label: 'Adresse', value: point.adresse })}
      ${field({ id: `f-${prefix}-reference`, label: 'Référence', value: point.reference })}
    </div>
    ${field({ id: `f-${prefix}-datePrevue`, label: 'Date prévue', type: 'date', value: point.datePrevue })}
  `;
}
function stepTrajet(dut) {
  const t = dut.trajet;
  return `
    <h2>5. Chargement / Déchargement</h2>
    ${pointBlock('charg', t.chargement, 'Chargement')}
    ${pointBlock('dech', t.dechargement, 'Déchargement')}
    <div class="wizard-section-label">Suivi</div>
    <div class="field-row">
      ${field({ id: 'f-dateDepart', label: 'Date départ', type: 'date', value: t.dateDepart })}
      ${field({ id: 'f-heureDepart', label: 'Heure départ', type: 'time', value: t.heureDepart })}
    </div>
    <div class="field-row">
      ${field({ id: 'f-dateArrivee', label: 'Date arrivée', type: 'date', value: t.dateArrivee })}
      ${field({ id: 'f-heureArrivee', label: 'Heure arrivée', type: 'time', value: t.heureArrivee })}
    </div>
    <div class="error-msg hidden" id="trajet-error">${icon('alertCircle', { size: 13 })} <span></span></div>
  `;
}
function collectTrajet(content) {
  const point = (prefix) => ({
    lieu: val(content, `f-${prefix}-lieu`), adresse: val(content, `f-${prefix}-adresse`),
    ville: val(content, `f-${prefix}-ville`), reference: val(content, `f-${prefix}-reference`),
    datePrevue: val(content, `f-${prefix}-datePrevue`),
  });
  return { trajet: {
    chargement: point('charg'), dechargement: point('dech'),
    dateDepart: val(content, 'f-dateDepart'), heureDepart: val(content, 'f-heureDepart'),
    dateArrivee: val(content, 'f-dateArrivee'), heureArrivee: val(content, 'f-heureArrivee'),
  } };
}
function wireTrajet(content, dut) {
  footerNav(content, dut, '5', {
    onNext: (patch) => {
      const errors = [];
      const t = patch.trajet;
      if (t.dateDepart && t.dateArrivee) {
        const dep = new Date(`${t.dateDepart}T${t.heureDepart || '00:00'}`);
        const arr = new Date(`${t.dateArrivee}T${t.heureArrivee || '00:00'}`);
        if (arr < dep) errors.push('La date d’arrivée ne peut pas précéder la date de départ.');
      }
      return errors;
    },
  });
}

/* ===================== ÉTAPE 6 — ANNEXES ===================== */
function stepAnnexes(dut) {
  const a = dut.annexes;
  return `
    <h2>6. Annexes</h2>
    <div class="field-row">
      <div class="field"><label for="f-accessoires">Prestations accessoires</label><textarea class="textarea" id="f-accessoires" rows="2">${escapeHtml(a.accessoires)}</textarea></div>
      <div class="field"><label for="f-complementaires">Prestations complémentaires</label><textarea class="textarea" id="f-complementaires" rows="2">${escapeHtml(a.complementaires)}</textarea></div>
    </div>
    <div class="field-row">
      <div class="field"><label for="f-emballages">Emballages / supports</label><textarea class="textarea" id="f-emballages" rows="2">${escapeHtml(a.emballages)}</textarea></div>
      <div class="field"><label for="f-instructions">Autres instructions</label><textarea class="textarea" id="f-instructions" rows="2">${escapeHtml(a.instructions)}</textarea></div>
    </div>
    <div class="field-row">
      <div class="field"><label for="f-reservePrise">Réservé prise en charge</label><textarea class="textarea" id="f-reservePrise" rows="2">${escapeHtml(a.reservePriseEnCharge)}</textarea></div>
      <div class="field"><label for="f-reserveLivraison">Réservé livraison</label><textarea class="textarea" id="f-reserveLivraison" rows="2">${escapeHtml(a.reserveLivraison)}</textarea></div>
    </div>
    <div id="wizard-documents"></div>
  `;
}
function collectAnnexes(content) {
  return { annexes: {
    accessoires: val(content, 'f-accessoires'), complementaires: val(content, 'f-complementaires'),
    emballages: val(content, 'f-emballages'), instructions: val(content, 'f-instructions'),
    reservePriseEnCharge: val(content, 'f-reservePrise'), reserveLivraison: val(content, 'f-reserveLivraison'),
    pieces: JSON.parse(content.dataset.legacyPieces || '[]'),
  } };
}
function wireAnnexes(content, dut) {
  content.dataset.legacyPieces = JSON.stringify(dut.annexes.pieces || []);
  const target = content.querySelector('#wizard-documents');
  const refresh = () => renderWorkspace(target, dut, 'documents', refresh);
  refresh();
  footerNav(content, dut, '6', {});
}

/* ===================== RÉCAPITULATIF ===================== */
function stepSummary(dut) {
  const totalsM = dutService.computeMarchandiseTotals(dut.marchandises);
  const totalsF = dutService.computeFacturationTotals(dut.facturation);
  const g = dut.general;
  return `
    <h2>7. Récapitulatif avant soumission</h2>
    <div id="summary-errors"></div><div id="submission-checklist"></div>

    <div class="recap-section">
      <h3>Informations générales <button type="button" class="btn btn-ghost btn-sm" data-jump="1">${icon('edit', { size: 13 })} Modifier</button></h3>
      <div class="recap-grid">
        <div class="recap-item"><span>Date émission</span><strong>${escapeHtml(g.dateEmission)}</strong></div>
        <div class="recap-item"><span>Compte</span><strong>${g.compte}</strong></div>
        <div class="recap-item"><span>Type de transport</span><strong>${g.transportType.replaceAll('_', ' ')}</strong></div>
      </div>
    </div>
    <div class="recap-section">
      <h3>Transporteur / Véhicule / Conducteur</h3>
      <div class="recap-grid">
        <div class="recap-item"><span>Transporteur</span><strong>${escapeHtml(g.transporterName) || '—'}</strong></div>
        <div class="recap-item"><span>Véhicule</span><strong>${escapeHtml(g.immatriculation) || '—'}</strong></div>
        <div class="recap-item"><span>Conducteur</span><strong>${escapeHtml(g.driverNom)} ${escapeHtml(g.driverPrenoms)}</strong></div>
      </div>
    </div>
    <div class="recap-section">
      <h3>Expéditeur / Destinataire <button type="button" class="btn btn-ghost btn-sm" data-jump="2">${icon('edit', { size: 13 })} Modifier</button></h3>
      <div class="recap-grid">
        <div class="recap-item"><span>Expéditeur</span><strong>${escapeHtml(dut.expediteur.raisonSociale) || '—'}</strong></div>
        <div class="recap-item"><span>Destinataire</span><strong>${escapeHtml(dut.destinataire.raisonSociale) || '—'}</strong></div>
      </div>
    </div>
    <div class="recap-section">
      <h3>Marchandise <button type="button" class="btn btn-ghost btn-sm" data-jump="3">${icon('edit', { size: 13 })} Modifier</button></h3>
      <div class="recap-grid">
        <div class="recap-item"><span>Nature</span><strong>${escapeHtml(dut.marchandises[0]?.nature) || '—'}</strong></div>
        <div class="recap-item"><span>Poids total</span><strong>${formatNumber(totalsM.poidsTonnes, 1)} t</strong></div>
        <div class="recap-item"><span>Valeur totale</span><strong>${formatMoney(totalsM.valeur)}</strong></div>
      </div>
    </div>
    <div class="recap-section">
      <h3>Facturation <button type="button" class="btn btn-ghost btn-sm" data-jump="4">${icon('edit', { size: 13 })} Modifier</button></h3>
      <div class="recap-grid">
        <div class="recap-item"><span>Total HT</span><strong>${formatMoney(totalsF.totalHT)}</strong></div>
        <div class="recap-item"><span>Total à percevoir</span><strong>${formatMoney(totalsF.totalAPercevoir)}</strong></div>
      </div>
    </div>
    <div class="recap-section">
      <h3>Trajet <button type="button" class="btn btn-ghost btn-sm" data-jump="5">${icon('edit', { size: 13 })} Modifier</button></h3>
      <div class="recap-grid">
        <div class="recap-item"><span>Origine</span><strong>${escapeHtml(dut.trajet.chargement.ville) || '—'}</strong></div>
        <div class="recap-item"><span>Destination</span><strong>${escapeHtml(dut.trajet.dechargement.ville) || '—'}</strong></div>
      </div>
    </div>
    <div class="recap-section">
      <h3>Annexes <button type="button" class="btn btn-ghost btn-sm" data-jump="6">${icon('edit', { size: 13 })} Modifier</button></h3>
      <p class="text-muted" style="font-size:.85rem">${dossier(dut.id).files.length} fichier(s) enregistré(s) localement · ${dut.annexes.pieces?.length || 0} ancienne(s) référence(s)</p>
    </div>

    <div class="wizard-footer">
      <button type="button" class="btn btn-secondary" id="btn-save-draft">Sauvegarder</button>
      <button type="button" class="btn btn-primary btn-lg" id="btn-submit">${icon('arrowRight', { size: 16 })} Soumettre pour validation</button>
    </div>
  `;
}
function wireSummary(content, dut) {
  const checks = content.querySelector('#submission-checklist');
  const refresh = () => renderWorkspace(checks, dut, 'checklist', refresh);
  refresh();
  content.querySelectorAll('[data-jump]').forEach((btn) => btn.addEventListener('click', () => navigate(`/dut/new/${btn.dataset.jump}`)));
  content.querySelector('#btn-save-draft').addEventListener('click', () => { toast({ type: 'success', title: 'Brouillon sauvegardé' }); });
  content.querySelector('#btn-submit').addEventListener('click', () => {
    const errors = dutService.validateForSubmit(dut);
    if (errors.length) {
      content.querySelector('#summary-errors').innerHTML = `
        <div class="alert-banner error">${icon('alertCircle', { size: 18 })}<div class="alert-text"><strong>Impossible de soumettre</strong>${errors.map((e) => escapeHtml(e)).join('<br>')}</div></div>
      `;
      return;
    }
    confirmAction({
      title: 'Soumettre ce DUT pour validation ?',
      text: 'Le DUT sera transmis à l’antenne OIC pour validation. Vous ne pourrez plus le modifier tant qu’il n’aura pas été rejeté.',
      confirmLabel: 'Soumettre',
      icon: 'arrowRight',
      onConfirm: () => {
        try {
          dutService.submit(dut.id);
          sessionStorage.removeItem('dut_wizard_draft_id');
          toast({ type: 'success', title: 'DUT soumis pour validation' });
          navigate(`/dut/${dut.id}`);
        } catch (err) {
          toast({ type: 'error', title: 'Soumission impossible', desc: err.message });
        }
      },
    });
  });
}

/* ===================== Collecte générique par étape ===================== */
function collectStep(step, content) {
  switch (step) {
    case '1': return collectGeneral(content);
    case '2': return collectParties(content);
    case '3': return collectMarchandise(content);
    case '4': return collectFacturation(content);
    case '5': return collectTrajet(content);
    case '6': return collectAnnexes(content);
    default: return {};
  }
}
