// Lot d1 : administrateur OIC — partenaires habilités, transporteurs, demandes à valider, import de l'existant.
import { icon } from '../core/icons.js';
import { navigate } from '../core/router.js';
import { toast, openModal } from '../core/ui.js';
import { ORG_STATUS_LABELS, ROLE_LABELS } from '../core/constants.js';
import { listPartners, partnerDetail, createPartner, validatePartner, updatePartner, suspendPartner, reactivatePartner, terminatePartner, refusePartner, decidePartnerChange, antennaChoices, PARTNER_CFG } from '../services/partners.service.js';
import { listTransporters, transporterDetail, createTransporterApplication, listApplications, validateApplication, refuseApplication, suspendTransporter, reactivateTransporter, decideTransporterChange, reviewDocument, importTransporters, IMPORT_TEMPLATE, DOC_TYPES, PORTEES, TRANSPORTER_CFG, originLabel } from '../services/transporters.service.js';
import { pendingDeclarations, decideDeclaration, KIND_LABELS, deadlines } from '../services/vehicle-declarations.service.js';
import { toCsv } from '../services/supervision.service.js';
import { esc, formatDate, formatDateTime, pageHeader, tabsNav, kpis, identity, field, formModal, reasonModal, fail, orgBadge, accountBadge, accountState, journalList, stateHistory, empty, downloadCsv } from './d1-ui.js';

function pendingCounts() {
  const apps = listApplications({ status: 'EN_ATTENTE' }).length;
  const partners = listPartners();
  const transporters = listTransporters();
  const changes = partners.filter((p) => p.demandeEnAttente).length + transporters.filter((t) => t.changeRequest?.status === 'EN_ATTENTE').length;
  return { total: apps + changes + pendingDeclarations().length + partners.filter((p) => p.status === 'EN_ATTENTE').length };
}
function nav(active) {
  const n = pendingCounts().total;
  return tabsNav([
    ['partenaires', 'Partenaires habilités', '#/oic/acteurs/partenaires', 'layers'],
    ['transporteurs', 'Transporteurs', '#/oic/acteurs/transporteurs', 'truck'],
    ['demandes', 'Demandes à valider', '#/oic/acteurs/demandes', 'checkCircle', n],
    ['import', 'Import de l’existant', '#/oic/acteurs/import', 'upload'],
  ], active);
}

export function render(root, params = {}) {
  const section = params.section || 'partenaires';
  try {
    if (section === 'partenaires' && params.id) return partnerPage(root, params.id);
    if (section === 'transporteurs' && params.id) return transporterPage(root, params.id);
    if (section === 'transporteurs') return transportersList(root);
    if (section === 'demandes') return requestsPage(root);
    if (section === 'import') return importPage(root);
    return partnersList(root);
  } catch (err) { root.innerHTML = empty('alertCircle', 'Affichage impossible', err.message); }
}

const statusFilter = (value) => `<select class="select" id="f-status" aria-label="Filtrer par état"><option value="">Tous les états</option>${Object.entries(ORG_STATUS_LABELS).map(([k, l]) => `<option value="${k}" ${k === value ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
const searchBox = (value) => `<label class="search-input ant-search">${icon('search', { size: 16 })}<input type="search" id="f-query" placeholder="Nom, RCCM, e-mail, ville…" value="${esc(value)}" autocomplete="off"></label>`;

// ------------------------------------------------------------------ Partenaires
let pFilter = { status: '', query: '' };
const partnerFields = (p = {}) => `
  <div class="field-row">${field({ name: 'name', label: 'Raison sociale', value: p.name || '', required: true })}${field({ name: 'rccm', label: 'RCCM', value: p.rccm || '', required: true, attrs: 'placeholder="CI-ABJ-2015-B-4521"' })}</div>
  <div class="field-row">${field({ name: 'email', label: 'Adresse e-mail de l’entreprise', value: p.email || '', type: 'email', required: true, hint: 'Le lien d’activation du compte administrateur y sera envoyé à la validation.' })}${field({ name: 'phone', label: 'Téléphone', value: p.phone || '', type: 'tel', required: true })}</div>
  <div class="field-row">${field({ name: 'contactName', label: 'Responsable (administrateur du compte)', value: p.contactName || '', required: true })}${field({ name: 'antennaId', label: 'Antenne OIC de rattachement', value: p.antennaId || '', required: true, options: [['', 'Choisir…'], ...antennaChoices().map((a) => [a.id, a.name])] })}</div>
  <div class="field-row">${field({ name: 'address', label: 'Adresse', value: p.address || '' })}${field({ name: 'city', label: 'Ville', value: p.city || '', required: true })}</div>`;

function partnersList(root) {
  const all = listPartners();
  const rows = listPartners(pFilter);
  root.innerHTML = `${pageHeader({ overline: 'OIC · Acteurs', title: 'Partenaires habilités', subtitle: 'Création, validation, modification, suspension et résiliation des partenaires. Chaque changement d’état exige un motif et reste tracé.', actions: `<button type="button" class="btn btn-secondary" id="export">${icon('download', { size: 15 })} Exporter (CSV)</button><button type="button" class="btn btn-primary" id="create">${icon('plus', { size: 15 })} Nouveau partenaire</button>` })}
    ${nav('partenaires')}
    ${kpis([['Partenaires', all.length, 'layers'], ['Actifs', all.filter((p) => p.status === 'ACTIF').length, 'checkCircle'], ['En attente', all.filter((p) => p.status === 'EN_ATTENTE').length, 'clock'], ['Suspendus ou résiliés', all.filter((p) => ['SUSPENDU', 'RESILIE'].includes(p.status)).length, 'ban']])}
    <section class="card sup-table-card">
      <div class="sup-table-head"><div><h2>Liste des partenaires</h2><p>Cliquez sur une ligne pour ouvrir la fiche et ses actions.</p></div><div class="sup-table-tools">${searchBox(pFilter.query)}${statusFilter(pFilter.status)}<span class="sup-count">${rows.length} / ${all.length}</span></div></div>
      <div class="table-wrap"><table class="data-table sup-table"><thead><tr><th>Partenaire</th><th>RCCM</th><th>Contact</th><th>Antenne</th><th class="num">Comptes</th><th>État</th><th></th></tr></thead><tbody>
      ${rows.length ? rows.map((p) => `<tr data-id="${esc(p.id)}" tabindex="0"><td><strong>${esc(p.name)}</strong><small>${esc(p.city || '')}</small></td><td>${esc(p.rccm || '—')}</td><td>${esc(p.email || '—')}<br><small>${esc(p.phone || '')}</small></td><td>${esc(p.antennaName || '—')}</td><td class="num">${p.comptes}</td><td>${orgBadge(p.status)}${p.demandeEnAttente ? '<br><span class="badge badge-accent d1-signal">Modification à valider</span>' : ''}</td><td class="text-right"><span class="sup-open">${icon('chevronRight', { size: 15 })}</span></td></tr>`).join('') : '<tr><td class="table-empty" colspan="7">Aucun partenaire.</td></tr>'}
      </tbody></table></div>
    </section>`;
  bindListFilters(root, pFilter, () => partnersList(root));
  bindRows(root, (id) => navigate(`/oic/acteurs/partenaires/${id}`));
  root.querySelector('#export').addEventListener('click', () => downloadCsv(`partenaires-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows.map((p) => ({ raison_sociale: p.name, rccm: p.rccm || '', email: p.email || '', telephone: p.phone || '', ville: p.city || '', antenne: p.antennaName || '', etat: ORG_STATUS_LABELS[p.status], comptes: p.comptes, valide_le: p.validatedAt ? p.validatedAt.slice(0, 10) : '' })))));
  root.querySelector('#create').addEventListener('click', () => formModal({ title: 'Nouveau partenaire habilité', icon: 'layers', large: true, confirmLabel: 'Créer la fiche', text: 'La fiche est créée en attente. Un autre administrateur OIC la valide : le compte administrateur du partenaire est alors créé et reçoit son lien d’activation.', fields: partnerFields(), onSubmit: (v) => { const p = createPartner(v); toast({ type: 'success', title: 'Fiche créée', desc: 'En attente de validation par un autre administrateur.' }); navigate(`/oic/acteurs/partenaires/${p.id}`); } }));
}

function bindListFilters(root, state, redraw) {
  root.querySelector('#f-status').addEventListener('change', (e) => { state.status = e.target.value; redraw(); });
  const q = root.querySelector('#f-query');
  q.addEventListener('change', (e) => { state.query = e.target.value; redraw(); });
  q.addEventListener('search', (e) => { state.query = e.target.value; redraw(); });
}
function bindRows(root, open) {
  const tbody = root.querySelector('.sup-table tbody');
  tbody.addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) open(tr.dataset.id); });
  tbody.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const tr = e.target.closest('tr[data-id]'); if (tr) open(tr.dataset.id); } });
}

const changeCard = (org, cfg) => {
  const req = org.changeRequest;
  if (req?.status !== 'EN_ATTENTE') return '';
  return `<section class="card"><div class="card-header"><h3>Modification demandée par l’entreprise</h3><span class="badge badge-warning">À valider</span></div>
    <div class="table-wrap"><table class="data-table"><thead><tr><th>Donnée</th><th>Valeur actuelle</th><th>Valeur demandée</th></tr></thead><tbody>${Object.entries(req.fields).map(([k, v]) => `<tr><td>${esc(cfg.sensitive[k])}</td><td>${esc(req.previous[k] || '—')}</td><td><strong>${esc(v)}</strong></td></tr>`).join('')}</tbody></table></div>
    <p class="text-muted d1-small">Demandée par ${esc(req.requestedBy)} le ${formatDateTime(req.requestedAt)}.</p>
    <div class="d1-form-actions"><button type="button" class="btn btn-secondary" data-change="refuse">Refuser</button><button type="button" class="btn btn-primary" data-change="approve">${icon('check', { size: 15 })} Approuver</button></div></section>`;
};
function bindChange(root, decide, refresh) {
  root.querySelectorAll('[data-change]').forEach((b) => b.addEventListener('click', () => {
    const approve = b.dataset.change === 'approve';
    reasonModal({ title: approve ? 'Approuver la modification ?' : 'Refuser la modification ?', text: approve ? 'Les nouvelles valeurs remplacent la fiche ; l’entreprise est prévenue à l’ancienne et à la nouvelle adresse.' : 'L’entreprise est prévenue avec le motif.', danger: !approve, optional: approve, confirmLabel: approve ? 'Approuver' : 'Refuser', onSubmit: (motif) => { decide(approve, motif); toast({ type: 'success', title: approve ? 'Modification approuvée' : 'Modification refusée' }); refresh(); } });
  }));
}

const accountsList = (list) => list.length ? `<ul class="sup-list">${list.map((u) => `<li><span>${esc(u.name)}<small>${esc(u.email)} · ${esc(u.companyAdmin ? 'Administrateur du compte' : ROLE_LABELS[u.role])}</small></span>${accountBadge(accountState(u))}</li>`).join('')}</ul>` : '<p class="sup-empty">Aucun compte : il est créé à la validation.</p>';

function partnerPage(root, id) {
  const d = partnerDetail(id);
  if (!d) { root.innerHTML = empty('alertCircle', 'Fiche introuvable'); return; }
  const p = d.partner;
  const act = {
    EN_ATTENTE: `<button type="button" class="btn btn-secondary" data-act="refuse">${icon('xCircle', { size: 15 })} Refuser</button><button type="button" class="btn btn-primary" data-act="validate">${icon('checkCircle', { size: 15 })} Valider le partenaire</button>`,
    ACTIF: `<button type="button" class="btn btn-secondary" data-act="suspend">${icon('ban', { size: 15 })} Suspendre</button><button type="button" class="btn btn-danger" data-act="terminate">Résilier</button>`,
    SUSPENDU: `<button type="button" class="btn btn-secondary" data-act="reactivate">${icon('refresh', { size: 15 })} Réactiver</button><button type="button" class="btn btn-danger" data-act="terminate">Résilier</button>`,
  }[p.status] || '';
  root.innerHTML = `<div class="page-header"><div><a class="sup-back" href="#/oic/acteurs/partenaires">${icon('chevronLeft', { size: 14 })} Partenaires habilités</a><h1>${esc(p.name)}</h1><div class="subtitle">RCCM ${esc(p.rccm || '—')} · antenne ${esc(p.antennaName || '—')}</div><div class="sup-badges">${orgBadge(p.status)}</div></div><div class="row gap-2 d1-actions">${act}</div></div><div class="page-header-rule"></div>
    ${p.status === 'EN_ATTENTE' ? `<div class="alert-banner warning">${icon('info', { size: 18 })}<div><strong>Fiche créée par ${esc(p.createdByName || '—')} le ${formatDateTime(p.createdAt)}</strong><p>La validation doit être faite par un autre administrateur OIC. Elle active le partenaire et crée son compte administrateur (lien d’activation envoyé à ${esc(p.email)}).</p></div></div>` : ''}
    <div class="sup-grid">
      <div class="sup-main">
        ${changeCard(p, PARTNER_CFG)}
        <section class="card"><div class="card-header"><h3>Fiche du partenaire</h3>${p.status !== 'RESILIE' ? `<button type="button" class="btn btn-ghost btn-sm" id="edit">${icon('edit', { size: 13 })} Modifier</button>` : ''}</div>
          ${identity([['Raison sociale', `<strong>${esc(p.name)}</strong>`], ['RCCM', esc(p.rccm || '—')], ['Adresse e-mail', esc(p.email || '—')], ['Téléphone', esc(p.phone || '')], ['Adresse', esc([p.address, p.city].filter(Boolean).join(', '))], ['Responsable', esc(p.contactName || '')], ['Antenne', esc(p.antennaName || '')], ['Validé le', p.validatedAt ? `${formatDateTime(p.validatedAt)} par ${esc(p.validatedBy || '—')}` : '']])}
        </section>
        <section class="card"><div class="card-header"><h3>Journal des actions sur la fiche</h3></div>${journalList(d.journal)}</section>
      </div>
      <aside class="sup-side">
        <section class="card"><div class="card-header"><h3>Comptes</h3></div>${accountsList(d.comptes)}</section>
        <section class="card"><div class="card-header"><h3>Historique de l’état</h3></div>${stateHistory(p.stateHistory)}</section>
        <section class="card"><div class="card-header"><h3>Activité DUT</h3><a href="#/oic/supervision/partenaires/${esc(p.id)}">Supervision</a></div><p class="text-muted d1-small">Volumes, plages et contrôles du partenaire.</p></section>
      </aside>
    </div>`;
  const refresh = () => partnerPage(root, id);
  bindChange(root, (approve, motif) => decidePartnerChange(id, approve, motif), refresh);
  root.querySelector('#edit')?.addEventListener('click', () => formModal({ title: 'Modifier la fiche', icon: 'edit', large: true, text: 'L’état du partenaire ne se change pas ici : utilisez les actions dédiées. Si la raison sociale, l’e-mail ou le RCCM changent, l’entreprise est prévenue.', fields: partnerFields(p), onSubmit: (v) => { updatePartner(id, v); toast({ type: 'success', title: 'Fiche modifiée' }); refresh(); } }));
  const actions = {
    validate: () => openModal({ title: 'Valider ce partenaire ?', icon: 'checkCircle', text: `${p.name} devient actif. Son compte administrateur est créé et le lien d’activation part à ${p.email} (message simulé).`, confirmLabel: 'Valider', onConfirm: async ({ close, root: overlay }) => { const btn = overlay.querySelector('[data-action="confirm"]'); btn.disabled = true; try { await validatePartner(id); close(); toast({ type: 'success', title: 'Partenaire validé', desc: 'Lien d’activation envoyé.' }); refresh(); } catch (err) { close(); fail(err); } } }),
    refuse: () => reasonModal({ title: 'Refuser ce partenaire ?', text: 'La fiche passe à l’état « Refusé ».', confirmLabel: 'Refuser', onSubmit: (m) => { refusePartner(id, m); refresh(); } }),
    suspend: () => reasonModal({ title: 'Suspendre ce partenaire ?', text: 'Ses comptes ne peuvent plus se connecter jusqu’à la réactivation. Les sessions ouvertes sont fermées.', confirmLabel: 'Suspendre', onSubmit: (m) => { suspendPartner(id, m); toast({ type: 'success', title: 'Partenaire suspendu' }); refresh(); } }),
    reactivate: () => reasonModal({ title: 'Réactiver ce partenaire ?', text: 'Ses comptes actifs peuvent de nouveau se connecter.', danger: false, confirmLabel: 'Réactiver', onSubmit: (m) => { reactivatePartner(id, m); toast({ type: 'success', title: 'Partenaire réactivé' }); refresh(); } }),
    terminate: () => reasonModal({ title: 'Résilier ce partenaire ?', text: 'Décision définitive : ses comptes sont désactivés et la fiche n’est plus modifiable.', confirmLabel: 'Résilier', onSubmit: (m) => { terminatePartner(id, m); toast({ type: 'success', title: 'Partenaire résilié' }); refresh(); } }),
  };
  root.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => actions[b.dataset.act]()));
}

// ------------------------------------------------------------------ Transporteurs
let tFilter = { status: '', query: '' };
const transporterFields = () => `
  <div class="field-row">${field({ name: 'name', label: 'Raison sociale', required: true })}${field({ name: 'rccm', label: 'RCCM', required: true })}</div>
  <div class="field-row">${field({ name: 'carteTransporteur', label: 'Carte de transporteur', required: true })}${field({ name: 'portee', label: 'Portée', options: Object.entries(PORTEES) })}</div>
  <div class="field-row">${field({ name: 'email', label: 'Adresse e-mail de l’entreprise', type: 'email', required: true })}${field({ name: 'phone', label: 'Téléphone', type: 'tel', required: true })}</div>
  <div class="field-row">${field({ name: 'contactName', label: 'Responsable', required: true })}${field({ name: 'city', label: 'Ville', required: true })}</div>
  ${field({ name: 'address', label: 'Adresse' })}`;

function transportersList(root) {
  const all = listTransporters();
  const rows = listTransporters(tFilter);
  const apps = listApplications({ status: 'EN_ATTENTE' }).length;
  root.innerHTML = `${pageHeader({ overline: 'OIC · Acteurs', title: 'Transporteurs', subtitle: 'Transporteurs enregistrés, leur état, leur flotte et leurs comptes. Les inscriptions en attente se traitent dans « Demandes à valider ».', actions: `<button type="button" class="btn btn-secondary" id="export">${icon('download', { size: 15 })} Exporter (CSV)</button><button type="button" class="btn btn-primary" id="create">${icon('plus', { size: 15 })} Nouveau transporteur</button>` })}
    ${nav('transporteurs')}
    ${kpis([['Transporteurs', all.length, 'truck'], ['Actifs', all.filter((t) => t.status === 'ACTIF').length, 'checkCircle'], ['Inscriptions en attente', apps, 'clock'], ['Suspendus', all.filter((t) => t.status === 'SUSPENDU').length, 'ban']])}
    <section class="card sup-table-card">
      <div class="sup-table-head"><div><h2>Liste des transporteurs</h2><p>Cliquez sur une ligne pour ouvrir le dossier.</p></div><div class="sup-table-tools">${searchBox(tFilter.query)}${statusFilter(tFilter.status)}<span class="sup-count">${rows.length} / ${all.length}</span></div></div>
      <div class="table-wrap"><table class="data-table sup-table"><thead><tr><th>Transporteur</th><th>RCCM</th><th>Contact</th><th>Origine</th><th class="num">Véhicules</th><th class="num">Comptes</th><th>État</th><th></th></tr></thead><tbody>
      ${rows.length ? rows.map((t) => `<tr data-id="${esc(t.id)}" tabindex="0"><td><strong>${esc(t.name)}</strong><small>${esc(t.parentName ? `Rattaché à ${t.parentName}` : t.city || '')}</small></td><td>${esc(t.rccm || '—')}</td><td>${esc(t.email || '—')}<br><small>${esc(t.phone || t.contact || '')}</small></td><td>${esc(t.originLabel)}</td><td class="num">${t.vehicules}</td><td class="num">${t.comptes}</td><td>${orgBadge(t.status)}${t.aValider ? `<br><span class="badge badge-accent d1-signal">${t.aValider} à valider</span>` : ''}</td><td class="text-right"><span class="sup-open">${icon('chevronRight', { size: 15 })}</span></td></tr>`).join('') : '<tr><td class="table-empty" colspan="8">Aucun transporteur.</td></tr>'}
      </tbody></table></div>
    </section>`;
  bindListFilters(root, tFilter, () => transportersList(root));
  bindRows(root, (id) => navigate(`/oic/acteurs/transporteurs/${id}`));
  root.querySelector('#export').addEventListener('click', () => downloadCsv(`transporteurs-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows.map((t) => ({ raison_sociale: t.name, rccm: t.rccm, carte_transporteur: t.carteTransporteur || '', email: t.email || '', telephone: t.phone || t.contact || '', ville: t.city || '', etat: ORG_STATUS_LABELS[t.status], origine: t.originLabel, vehicules: t.vehicules, comptes: t.comptes })))));
  root.querySelector('#create').addEventListener('click', () => formModal({ title: 'Nouveau transporteur', icon: 'truck', large: true, confirmLabel: 'Enregistrer la demande', text: 'La demande est créée en attente. Un autre administrateur OIC la valide ; le responsable reçoit alors son lien d’activation.', fields: transporterFields(), onSubmit: (v) => { createTransporterApplication(v); toast({ type: 'success', title: 'Demande enregistrée', desc: 'À valider dans « Demandes à valider ».' }); navigate('/oic/acteurs/demandes'); } }));
}

function transporterPage(root, id) {
  const d = transporterDetail(id);
  if (!d) { root.innerHTML = empty('alertCircle', 'Fiche introuvable'); return; }
  const t = d.transporter;
  const act = t.status === 'ACTIF' ? `<button type="button" class="btn btn-secondary" data-act="suspend">${icon('ban', { size: 15 })} Suspendre</button>` : t.status === 'SUSPENDU' ? `<button type="button" class="btn btn-primary" data-act="reactivate">${icon('refresh', { size: 15 })} Réactiver</button>` : '';
  const docTone = { CONFORME: 'badge-success', NON_CONFORME: 'badge-error' };
  root.innerHTML = `<div class="page-header"><div><a class="sup-back" href="#/oic/acteurs/transporteurs">${icon('chevronLeft', { size: 14 })} Transporteurs</a><h1>${esc(t.name)}</h1><div class="subtitle">RCCM ${esc(t.rccm || '—')} · ${esc(t.originLabel)}${d.parent ? ` · rattaché à <a href="#/oic/acteurs/transporteurs/${esc(d.parent.id)}">${esc(d.parent.name)}</a>` : ''}</div><div class="sup-badges">${orgBadge(t.status)}</div></div><div class="row gap-2 d1-actions">${act}</div></div><div class="page-header-rule"></div>
    <div class="sup-grid">
      <div class="sup-main">
        ${changeCard(t, TRANSPORTER_CFG)}
        <section class="card"><div class="card-header"><h3>Pièces du dossier</h3></div>
          ${d.documents.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Pièce</th><th>Fichier</th><th>Déposée</th><th>Examen</th><th></th></tr></thead><tbody>${d.documents.map((doc) => `<tr><td>${esc(DOC_TYPES[doc.type] || doc.type)}${doc.inherited ? '<br><small>Héritée de l’entreprise principale</small>' : ''}</td><td><a href="${esc(doc.dataUrl)}" download="${esc(doc.fileName)}">${esc(doc.fileName)}</a></td><td>${formatDate(doc.uploadedAt)}<br><small>${esc(doc.uploadedBy || '')}</small></td><td>${doc.review ? `<span class="badge ${docTone[doc.review.status]}">${doc.review.status === 'CONFORME' ? 'Conforme' : 'Non conforme'}</span><br><small>${esc(doc.review.by)}${doc.review.note ? ` — ${esc(doc.review.note)}` : ''}</small>` : '<span class="badge badge-warning">À examiner</span>'}</td><td>${doc.inherited ? '' : `<div class="admin-actions"><button class="btn btn-ghost btn-sm" data-doc-ok="${esc(doc.id)}">Conforme</button><button class="btn btn-ghost btn-sm" data-doc-ko="${esc(doc.id)}">Non conforme</button></div>`}</td></tr>`).join('')}</tbody></table></div>` : '<p class="sup-empty">Aucune pièce déposée.</p>'}
        </section>
        <section class="card"><div class="card-header"><h3>Flotte</h3><a href="#/oic/acteurs/demandes">Déclarations à valider</a></div>
          ${d.vehicules.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Immatriculation</th><th>Type</th><th class="num">PTAC</th><th>Carte de transport</th><th>Échéances</th><th>État</th></tr></thead><tbody>${d.vehicules.map((v) => `<tr><td><strong>${esc(v.immatriculation)}</strong></td><td>${esc(v.type || '—')}</td><td class="num">${esc(String(v.ptac ?? '—'))} t</td><td>${esc(v.carteTransport || '—')}</td><td>${deadlines(v).map((x) => `<span class="badge ${x.level === 'ECHUE' ? 'badge-error' : x.level === 'PROCHE' ? 'badge-warning' : 'badge-neutral'} d1-signal">${esc(x.label)} : ${x.level === 'ECHUE' ? 'échue' : formatDate(x.date)}</span>`).join(' ') || '—'}</td><td><span class="badge ${v.status === 'RETIRE' ? 'badge-neutral' : 'badge-success'}">${v.status === 'RETIRE' ? 'Retiré' : 'Validé'}</span></td></tr>`).join('')}</tbody></table></div>` : '<p class="sup-empty">Aucun véhicule.</p>'}
        </section>
        <section class="card"><div class="card-header"><h3>Journal des actions sur le dossier</h3></div>${journalList(d.journal)}</section>
      </div>
      <aside class="sup-side">
        <section class="card sup-card-id"><div class="card-header"><h3>Fiche</h3></div>${identity([['Carte de transporteur', esc(t.carteTransporteur || '—')], ['Adresse e-mail', esc(t.email || '—')], ['Téléphone', esc(t.phone || t.contact || '')], ['Adresse', esc([t.address, t.city].filter(Boolean).join(', ') || t.adresse || '')], ['Responsable', esc(t.contactName || '')], ['Portée', esc(PORTEES[t.portee] || '')], ['Validé le', t.validatedAt ? `${formatDate(t.validatedAt)} par ${esc(t.validatedBy || '—')}` : '']])}</section>
        <section class="card"><div class="card-header"><h3>Comptes</h3></div>${accountsList(d.comptes)}</section>
        <section class="card"><div class="card-header"><h3>Entités rattachées</h3></div>${d.filiales.length ? `<ul class="sup-list">${d.filiales.map((f) => `<li><span>${f.application ? esc(f.name) : `<a href="#/oic/acteurs/transporteurs/${esc(f.id)}">${esc(f.name)}</a>`}<small>${esc(f.city || '')}</small></span>${orgBadge(f.status)}</li>`).join('')}</ul>` : '<p class="sup-empty">Aucune.</p>'}</section>
        <section class="card"><div class="card-header"><h3>Historique de l’état</h3></div>${stateHistory(t.stateHistory)}</section>
      </aside>
    </div>`;
  const refresh = () => transporterPage(root, id);
  bindChange(root, (approve, motif) => decideTransporterChange(id, approve, motif), refresh);
  root.querySelector('[data-act="suspend"]')?.addEventListener('click', () => reasonModal({ title: 'Suspendre ce transporteur ?', text: 'Ses comptes ne peuvent plus se connecter jusqu’à la réactivation.', confirmLabel: 'Suspendre', onSubmit: (m) => { suspendTransporter(id, m); toast({ type: 'success', title: 'Transporteur suspendu' }); refresh(); } }));
  root.querySelector('[data-act="reactivate"]')?.addEventListener('click', () => reasonModal({ title: 'Réactiver ce transporteur ?', danger: false, confirmLabel: 'Réactiver', onSubmit: (m) => { reactivateTransporter(id, m); toast({ type: 'success', title: 'Transporteur réactivé' }); refresh(); } }));
  root.querySelectorAll('[data-doc-ok]').forEach((b) => b.addEventListener('click', () => { try { reviewDocument(id, b.dataset.docOk, true); refresh(); } catch (err) { fail(err); } }));
  root.querySelectorAll('[data-doc-ko]').forEach((b) => b.addEventListener('click', () => reasonModal({ title: 'Pièce non conforme', text: 'Le transporteur est prévenu et invité à déposer une nouvelle pièce.', confirmLabel: 'Enregistrer', onSubmit: (m) => { reviewDocument(id, b.dataset.docKo, false, m); refresh(); } })));
}

// ------------------------------------------------------------------ Demandes à valider
function requestsPage(root) {
  const apps = listApplications({ status: 'EN_ATTENTE' });
  const partners = listPartners();
  const pendingPartners = partners.filter((p) => p.status === 'EN_ATTENTE');
  const changes = [...partners.filter((p) => p.demandeEnAttente).map((p) => ({ ...p, kind: 'Partenaire', href: `#/oic/acteurs/partenaires/${p.id}`, cfg: PARTNER_CFG })), ...listTransporters().filter((t) => t.changeRequest?.status === 'EN_ATTENTE').map((t) => ({ ...t, kind: 'Transporteur', href: `#/oic/acteurs/transporteurs/${t.id}`, cfg: TRANSPORTER_CFG }))];
  const decl = pendingDeclarations();
  root.innerHTML = `${pageHeader({ overline: 'OIC · Acteurs', title: 'Demandes à valider', subtitle: 'Inscriptions, entités rattachées, modifications de fiches et déclarations de véhicules en attente d’une décision de l’OIC.' })}
    ${nav('demandes')}
    ${kpis([['Inscriptions de transporteurs', apps.length, 'truck'], ['Partenaires à valider', pendingPartners.length, 'layers'], ['Modifications de fiches', changes.length, 'edit'], ['Véhicules déclarés', decl.length, 'clock']])}
    <section class="card sup-table-card"><div class="sup-table-head"><div><h2>Inscriptions de transporteurs</h2><p>En ligne, saisies par l’OIC ou entités rattachées. Validation par une personne différente de l’auteur.</p></div></div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Demande</th><th>RCCM / carte</th><th>Contact</th><th>Origine</th><th>Pièces</th><th>Actions</th></tr></thead><tbody>
      ${apps.length ? apps.map((a) => `<tr><td><strong>${esc(a.name)}</strong><small>${formatDateTime(a.createdAt)} · ${esc(a.createdByName || '')}</small></td><td>${esc(a.rccm)}<br><small>${esc(a.carteTransporteur)}</small></td><td>${esc(a.email)}<br><small>${esc(a.phone)} · ${esc(a.city)}</small></td><td>${esc(originLabel(a.origin))}${a.parentName ? `<br><small>Rattachée à ${esc(a.parentName)}</small>` : ''}</td><td>${a.documents?.length ? a.documents.map((doc) => `<a href="${esc(doc.dataUrl)}" download="${esc(doc.fileName)}">${esc(DOC_TYPES[doc.type] || doc.type)}</a>`).join('<br>') : (a.parentId ? '<small>Héritées</small>' : '<small>Aucune</small>')}</td><td><div class="admin-actions"><button class="btn btn-primary btn-sm" data-app-ok="${esc(a.id)}">Valider</button><button class="btn btn-ghost btn-sm" data-app-ko="${esc(a.id)}">Refuser</button></div></td></tr>`).join('') : '<tr><td class="table-empty" colspan="6">Aucune inscription en attente.</td></tr>'}
      </tbody></table></div></section>
    <section class="card sup-table-card"><div class="sup-table-head"><div><h2>Partenaires et modifications de fiches</h2><p>Ouvrez la fiche pour décider.</p></div></div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Groupement</th><th>Nature</th><th>Demandée par</th><th></th></tr></thead><tbody>
      ${pendingPartners.map((p) => `<tr><td><strong>${esc(p.name)}</strong><small>Partenaire</small></td><td>Validation d’un nouveau partenaire</td><td>${esc(p.createdByName || '—')}<br><small>${formatDateTime(p.createdAt)}</small></td><td><a class="btn btn-secondary btn-sm" href="#/oic/acteurs/partenaires/${esc(p.id)}">Ouvrir</a></td></tr>`).join('')}
      ${changes.map((c) => `<tr><td><strong>${esc(c.name)}</strong><small>${esc(c.kind)}</small></td><td>Modification : ${Object.keys(c.changeRequest.fields).map((k) => esc(c.cfg.sensitive[k])).join(', ')}</td><td>${esc(c.changeRequest.requestedBy)}<br><small>${formatDateTime(c.changeRequest.requestedAt)}</small></td><td><a class="btn btn-secondary btn-sm" href="${c.href}">Ouvrir</a></td></tr>`).join('')}
      ${pendingPartners.length + changes.length ? '' : '<tr><td class="table-empty" colspan="4">Aucune demande.</td></tr>'}
      </tbody></table></div></section>
    <section class="card sup-table-card"><div class="sup-table-head"><div><h2>Déclarations de véhicules</h2><p>Le véhicule n’entre dans la flotte qu’après validation.</p></div></div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Véhicule</th><th>Transporteur</th><th>Nature</th><th>Caractéristiques</th><th>Échéances</th><th>Actions</th></tr></thead><tbody>
      ${decl.length ? decl.map((x) => `<tr><td><strong>${esc(x.data.immatriculation)}</strong><small>${formatDateTime(x.createdAt)} · ${esc(x.createdBy)}</small></td><td>${esc(x.transporterName)}</td><td>${esc(KIND_LABELS[x.kind])}${x.motif ? `<br><small>${esc(x.motif)}</small>` : ''}</td><td>${x.kind === 'RETRAIT' ? '—' : `${esc(x.data.type)} · PTAC ${esc(String(x.data.ptac))} t<br><small>Carte grise ${esc(x.data.cartegrise)} · carte de transport ${esc(x.data.carteTransport)}</small>`}</td><td>${x.kind === 'RETRAIT' ? '—' : deadlines(x.data).map((e) => `<small>${esc(e.label)} : ${formatDate(e.date)}</small>`).join('<br>')}</td><td><div class="admin-actions"><button class="btn btn-primary btn-sm" data-decl-ok="${esc(x.id)}">Valider</button><button class="btn btn-ghost btn-sm" data-decl-ko="${esc(x.id)}">Refuser</button></div></td></tr>`).join('') : '<tr><td class="table-empty" colspan="6">Aucune déclaration en attente.</td></tr>'}
      </tbody></table></div></section>`;
  const refresh = () => requestsPage(root);
  root.querySelectorAll('[data-app-ok]').forEach((b) => b.addEventListener('click', () => {
    const a = apps.find((x) => x.id === b.dataset.appOk);
    openModal({ title: 'Valider cette inscription ?', icon: 'checkCircle', text: `${a.name} devient transporteur actif. Le compte administrateur est créé et le lien d’activation part à ${a.email} (message simulé).`, confirmLabel: 'Valider', onConfirm: async ({ close, root: overlay }) => { overlay.querySelector('[data-action="confirm"]').disabled = true; try { await validateApplication(a.id); close(); toast({ type: 'success', title: 'Transporteur validé', desc: 'Lien d’activation envoyé.' }); refresh(); } catch (err) { close(); fail(err); } } });
  }));
  root.querySelectorAll('[data-app-ko]').forEach((b) => b.addEventListener('click', () => reasonModal({ title: 'Refuser cette inscription ?', text: 'Le demandeur est prévenu avec le motif.', confirmLabel: 'Refuser', onSubmit: (m) => { refuseApplication(b.dataset.appKo, m); toast({ type: 'success', title: 'Demande refusée' }); refresh(); } })));
  root.querySelectorAll('[data-decl-ok]').forEach((b) => b.addEventListener('click', () => reasonModal({ title: 'Valider cette déclaration ?', text: 'Vérifiez la carte grise, le PTAC et la carte de transport présentés.', danger: false, optional: true, confirmLabel: 'Valider', onSubmit: (m) => { decideDeclaration(b.dataset.declOk, true, m); toast({ type: 'success', title: 'Déclaration validée' }); refresh(); } })));
  root.querySelectorAll('[data-decl-ko]').forEach((b) => b.addEventListener('click', () => reasonModal({ title: 'Refuser cette déclaration ?', text: 'Le transporteur est prévenu avec le motif.', confirmLabel: 'Refuser', onSubmit: (m) => { decideDeclaration(b.dataset.declKo, false, m); toast({ type: 'success', title: 'Déclaration refusée' }); refresh(); } })));
}

// ------------------------------------------------------------------ Import
let lastImport = null;
function importPage(root) {
  root.innerHTML = `${pageHeader({ overline: 'OIC · Acteurs', title: 'Import de l’existant', subtitle: 'Reprise d’une liste de transporteurs et de leurs véhicules (fichier CSV). Le fichier est d’abord analysé ; rien n’est enregistré avant votre confirmation.', actions: `<button type="button" class="btn btn-secondary" id="template">${icon('download', { size: 15 })} Télécharger le modèle</button>` })}
    ${nav('import')}
    <div class="sup-grid">
      <div class="sup-main">
        <section class="card"><div class="card-header"><h3>Fichier à importer</h3></div>
          <form id="import-form" class="workspace-form d1-form">
            <div class="field"><label>Fichier CSV <span class="req">*</span></label><input class="input" type="file" name="file" accept=".csv,text/csv" required><small class="hint">Séparateur point-virgule ou virgule, une ligne par véhicule ; 500 lignes au maximum.</small></div>
            <p class="error-msg hidden" role="alert"></p>
            <div class="d1-form-actions"><button class="btn btn-primary" type="submit">${icon('search', { size: 15 })} Analyser le fichier</button></div>
          </form>
        </section>
        <div id="import-report"></div>
      </div>
      <aside class="sup-side">
        <section class="card"><div class="card-header"><h3>Règles d’import</h3></div><ul class="settings-help-list">
          <li>${icon('checkCircle', { size: 14 })}<span>Les transporteurs créés sont <b>actifs</b> (déjà reconnus par l’ancien système) ; leur responsable reçoit un lien d’activation.</span></li>
          <li>${icon('ban', { size: 14 })}<span><b>Doublons rejetés</b> : RCCM ou adresse e-mail déjà enregistrés, immatriculation déjà connue, demande d’inscription en cours.</span></li>
          <li>${icon('truck', { size: 14 })}<span>Une ligne dont le RCCM est déjà enregistré ajoute seulement son véhicule à la fiche existante.</span></li>
          <li>${icon('file', { size: 14 })}<span>Un rapport ligne par ligne est produit et peut être téléchargé.</span></li>
        </ul></section>
      </aside>
    </div>`;
  root.querySelector('#template').addEventListener('click', () => downloadCsv('modele-import-transporteurs.csv', IMPORT_TEMPLATE));
  const form = root.querySelector('#import-form');
  const box = form.querySelector('.error-msg');
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); box.classList.add('hidden');
    try {
      const file = form.elements.file.files[0];
      if (!file) throw new Error('Choisissez un fichier.');
      if (file.size > 512 * 1024) throw new Error('Fichier trop volumineux (512 Ko au maximum).');
      const content = await file.text();
      lastImport = { content, result: await importTransporters(content, { apply: false }) };
      drawReport(root);
    } catch (err) { box.textContent = err.message; box.classList.remove('hidden'); }
  });
}
function drawReport(root) {
  const { result } = lastImport;
  const s = result.summary;
  const target = root.querySelector('#import-report');
  target.innerHTML = `<section class="card"><div class="card-header"><h3>${result.applied ? 'Rapport d’import' : 'Analyse du fichier'}</h3>${result.applied ? '<span class="badge badge-success">Enregistré</span>' : '<span class="badge badge-warning">Rien n’est encore enregistré</span>'}</div>
    ${kpis([['Lignes lues', s.lines, 'file'], ['Transporteurs à créer', s.transporters, 'truck'], ['Véhicules à ajouter', s.vehicles, 'package'], ['Lignes rejetées', s.rejected, 'xCircle']])}
    <div class="table-wrap"><table class="data-table"><thead><tr><th class="num">Ligne</th><th>Transporteur</th><th>RCCM</th><th>Véhicule</th><th>Résultat</th></tr></thead><tbody>${result.report.map((r) => `<tr><td class="num">${esc(String(r.line))}</td><td>${esc(r.name || '—')}</td><td>${esc(r.rccm || '—')}</td><td>${esc(r.immatriculation || '—')}</td><td><span class="badge ${r.ok ? 'badge-success' : 'badge-error'}">${r.ok ? 'Accepté' : 'Rejeté'}</span> <small>${esc(r.result)}</small></td></tr>`).join('')}</tbody></table></div>
    <div class="d1-form-actions"><button type="button" class="btn btn-secondary" id="report-csv">${icon('download', { size: 15 })} Télécharger le rapport</button>${!result.applied && (s.transporters || s.vehicles) ? `<button type="button" class="btn btn-primary" id="apply">${icon('check', { size: 15 })} Confirmer l’import</button>` : ''}</div></section>`;
  target.querySelector('#report-csv').addEventListener('click', () => downloadCsv(`rapport-import-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(result.report.map((r) => ({ ligne: r.line, transporteur: r.name, rccm: r.rccm, vehicule: r.immatriculation, resultat: r.ok ? 'Accepté' : 'Rejeté', detail: r.result })))));
  target.querySelector('#apply')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    try { lastImport.result = await importTransporters(lastImport.content, { apply: true }); toast({ type: 'success', title: 'Import enregistré', desc: `${lastImport.result.summary.transporters} transporteur(s), ${lastImport.result.summary.vehicles} véhicule(s).` }); drawReport(root); }
    catch (err) { e.target.disabled = false; fail(err); }
  });
}
