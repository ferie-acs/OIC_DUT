// Lot d1 : « Mon entreprise » — fiche et dossier, utilisateurs, activité des agents (partenaire habilité),
// véhicules et entités rattachées (transporteur).
import { icon } from '../core/icons.js';
import { getCurrentUser } from '../core/auth.js';
import { can } from '../core/permissions.js';
import { toast, openModal } from '../core/ui.js';
import { ROLES, ROLE_LABELS } from '../core/constants.js';
import { myPartner, updateMyPartner, cancelMyPartnerChange, PARTNER_CFG } from '../services/partners.service.js';
import { myTransporter, updateMyTransporter, cancelMyTransporterChange, addMyDocument, requestSubsidiary, DOC_TYPES, PORTEES, TRANSPORTER_CFG } from '../services/transporters.service.js';
import { listCompanyUsers, companyRoles, createCompanyUser, updateCompanyUser, setCompanyUserActive, resetCompanyUserAccess } from '../services/company-users.service.js';
import { agentActivity, PERIODS } from '../services/agent-activity.service.js';
import { myFleet, declareVehicle, cancelDeclaration, VEHICLE_TYPES, KIND_LABELS, DECL_STATUS_LABELS, ECHEANCES } from '../services/vehicle-declarations.service.js';
import { esc, formatDate, formatDateTime, pageHeader, tabsNav, kpis, identity, field, formModal, reasonModal, fail, accountBadge, orgBadge, empty, readFile, stateHistory } from './d1-ui.js';

const isTransporter = (u) => u.role === ROLES.TRANSPORTEUR;
function companyTabs(user, active) {
  const items = [['fiche', isTransporter(user) ? 'Fiche et dossier' : 'Fiche de l’entreprise', '#/entreprise', 'building2']];
  if (can(user, 'company.users') && (!isTransporter(user) || user.companyAdmin)) items.push(['utilisateurs', isTransporter(user) ? 'Utilisateurs' : 'Agents', '#/entreprise/utilisateurs', 'users']);
  if (can(user, 'company.activity')) items.push(['activite', 'Activité des agents', '#/entreprise/activite', 'barChart']);
  if (can(user, 'fleet.declare')) items.push(['vehicules', 'Véhicules', '#/entreprise/vehicules', 'truck']);
  return tabsNav(items, active);
}
const header = (user, title, subtitle) => pageHeader({ overline: `${isTransporter(user) ? 'Transporteur' : 'Partenaire'} · Mon entreprise`, title, subtitle });

// ------------------------------------------------------------------ Fiche
export function renderCompany(root) {
  const user = getCurrentUser();
  if (isTransporter(user)) return renderTransporterFile(root, user);
  const p = myPartner();
  const req = p.changeRequest?.status === 'EN_ATTENTE' ? p.changeRequest : null;
  root.innerHTML = `${header(user, p.name, 'Coordonnées de votre entreprise. La raison sociale, l’adresse e-mail et le RCCM ne changent qu’après validation de l’OIC.')}
    ${companyTabs(user, 'fiche')}
    ${pendingBanner(req, PARTNER_CFG)}
    <div class="sup-grid">
      <div class="sup-main">
        <section class="card"><div class="card-header"><h3>Mettre à jour la fiche</h3></div>${orgForm(p, PARTNER_CFG, !!req)}</section>
        <section class="card"><div class="card-header"><h3>Demandes de modification</h3></div>${changeHistory(p, PARTNER_CFG)}</section>
      </div>
      <aside class="sup-side">
        <section class="card sup-card-id"><div class="card-header"><h3>Fiche en vigueur</h3>${orgBadge(p.status)}</div>
          ${identity([['Raison sociale', `<strong>${esc(p.name)}</strong>`], ['RCCM', esc(p.rccm || '—')], ['Adresse e-mail', esc(p.email || '—')], ['Téléphone', esc(p.phone || '')], ['Adresse', esc([p.address, p.city].filter(Boolean).join(', '))], ['Responsable', esc(p.contactName || '')], ['Antenne de rattachement', esc(p.antennaName || '')], ['Validé le', p.validatedAt ? formatDate(p.validatedAt) : '']])}
        </section>
        <section class="card"><div class="card-header"><h3>Historique de l’état</h3></div>${stateHistory(p.stateHistory)}</section>
      </aside>
    </div>`;
  bindOrgForm(root, (v) => updateMyPartner(v), () => cancelMyPartnerChange(), () => renderCompany(root));
}

function pendingBanner(req, cfg) {
  if (!req) return '';
  const fields = Object.entries(req.fields).map(([k, v]) => `${esc(cfg.sensitive[k])} : <strong>${esc(v)}</strong>`).join(' · ');
  return `<div class="alert-banner warning">${icon('clock', { size: 18 })}<div><strong>Modification en attente de l’OIC</strong><p>${fields}</p><small>Demandée par ${esc(req.requestedBy)} le ${formatDateTime(req.requestedAt)}.</small></div><button type="button" class="btn btn-secondary btn-sm" id="cancel-change">Annuler la demande</button></div>`;
}

function orgForm(org, cfg, locked) {
  const sens = (k) => (locked ? 'disabled' : '') + ' data-sensitive="1"';
  const isT = cfg.entity === 'TRANSPORTER';
  return `<form id="org-form" class="workspace-form d1-form">
    <p class="wizard-section-label">Données soumises à validation OIC</p>
    <div class="field-row">${field({ name: 'name', label: 'Raison sociale', value: org.name, required: true, attrs: sens('name') })}${field({ name: 'email', label: 'Adresse e-mail de l’entreprise', value: org.email || '', type: 'email', required: true, attrs: sens('email') })}</div>
    <div class="field-row">${field({ name: 'rccm', label: 'RCCM', value: org.rccm || org.registre || '', required: true, attrs: org.parentId ? 'disabled' : sens('rccm'), hint: org.parentId ? 'Hérité de l’entreprise principale.' : '' })}${isT ? field({ name: 'carteTransporteur', label: 'Carte de transporteur', value: org.carteTransporteur || '', required: true, attrs: org.parentId ? 'disabled' : sens('carteTransporteur') }) : '<div></div>'}</div>
    <p class="wizard-section-label">Coordonnées (mises à jour immédiatement)</p>
    <div class="field-row">${field({ name: 'phone', label: 'Téléphone', value: org.phone || org.contact || '', type: 'tel', required: true })}${field({ name: 'contactName', label: 'Responsable', value: org.contactName || '', required: true })}</div>
    <div class="field-row">${field({ name: 'address', label: 'Adresse', value: org.address || '' })}${field({ name: 'city', label: 'Ville', value: org.city || '', required: true })}</div>
    ${isT ? field({ name: 'portee', label: 'Portée', value: org.portee || 'NATIONAL', options: Object.entries(PORTEES) }) : ''}
    <p class="error-msg hidden" role="alert"></p>
    <div class="d1-form-actions"><button class="btn btn-primary" type="submit">${icon('check', { size: 15 })} Enregistrer</button></div>
  </form>`;
}

function bindOrgForm(root, save, cancel, refresh) {
  const form = root.querySelector('#org-form');
  if (form) form.addEventListener('submit', (e) => {
    e.preventDefault(); if (!form.reportValidity()) return;
    const box = form.querySelector('.error-msg'); box.classList.add('hidden');
    const values = {};
    [...form.elements].filter((x) => x.name).forEach((x) => { values[x.name] = x.value.trim(); });
    // Champs verrouillés (demande en cours, données héritées) : la valeur en vigueur est conservée.
    [...form.elements].filter((x) => x.name && x.disabled).forEach((x) => { values[x.name] = x.defaultValue; });
    if (['name', 'email', 'rccm', 'carteTransporteur'].some((k) => k in values)) { values.name = values.name.toUpperCase(); values.email = values.email.toLowerCase(); }
    try {
      const r = save(values);
      toast({ type: 'success', title: r.requested.length ? 'Demande transmise à l’OIC' : 'Fiche mise à jour', desc: [r.applied.length ? `Appliqué : ${r.applied.join(', ')}.` : '', r.requested.length ? `En attente de validation : ${r.requested.join(', ')}.` : ''].join(' ') });
      refresh();
    } catch (err) { box.textContent = err.message; box.classList.remove('hidden'); }
  });
  root.querySelector('#cancel-change')?.addEventListener('click', () => { try { cancel(); toast({ type: 'success', title: 'Demande annulée' }); refresh(); } catch (err) { fail(err); } });
}

function changeHistory(org, cfg) {
  const list = [...(org.changeHistory || [])].reverse();
  if (!list.length) return '<p class="sup-empty">Aucune demande traitée.</p>';
  const tone = { APPROUVEE: 'badge-success', REFUSEE: 'badge-error', ANNULEE: 'badge-neutral' };
  const label = { APPROUVEE: 'Approuvée', REFUSEE: 'Refusée', ANNULEE: 'Annulée' };
  return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Modification</th><th>Décision</th><th>Par</th></tr></thead><tbody>${list.map((c) => `<tr><td>${formatDate(c.requestedAt)}</td><td>${Object.entries(c.fields).map(([k, v]) => `${esc(cfg.sensitive[k])} : ${esc(v)}`).join('<br>')}</td><td><span class="badge ${tone[c.status]}">${label[c.status] || esc(c.status)}</span>${c.motif ? `<br><small>${esc(c.motif)}</small>` : ''}</td><td>${esc(c.decidedBy || '—')}</td></tr>`).join('')}</tbody></table></div>`;
}

function renderTransporterFile(root, user) {
  const d = myTransporter();
  const t = d.transporter;
  const req = t.changeRequest?.status === 'EN_ATTENTE' ? t.changeRequest : null;
  const docTone = { CONFORME: 'badge-success', NON_CONFORME: 'badge-error' };
  root.innerHTML = `${header(user, t.name, d.parent ? `Entité rattachée à ${esc(d.parent.name)}.` : 'Dossier de votre entreprise auprès de l’OIC : fiche, pièces justificatives et entités rattachées.')}
    ${companyTabs(user, 'fiche')}
    ${pendingBanner(req, TRANSPORTER_CFG)}
    <div class="sup-grid">
      <div class="sup-main">
        <section class="card"><div class="card-header"><h3>Mettre à jour la fiche</h3></div>${d.canManage ? orgForm(t, TRANSPORTER_CFG, !!req) : '<p class="sup-empty">Seul l’administrateur du compte transporteur modifie la fiche.</p>'}</section>
        <section class="card"><div class="card-header"><h3>Pièces du dossier</h3>${d.canManage ? `<button type="button" class="btn btn-secondary btn-sm" id="add-doc">${icon('upload', { size: 14 })} Déposer une pièce</button>` : ''}</div>
          ${d.documents.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Pièce</th><th>Fichier</th><th>Déposée le</th><th>Examen OIC</th></tr></thead><tbody>${d.documents.map((doc) => `<tr><td>${esc(DOC_TYPES[doc.type] || doc.type)}${doc.inherited ? '<br><small>Héritée de l’entreprise principale</small>' : ''}</td><td><a href="${esc(doc.dataUrl)}" download="${esc(doc.fileName)}">${esc(doc.fileName)}</a></td><td>${formatDate(doc.uploadedAt)}</td><td>${doc.review ? `<span class="badge ${docTone[doc.review.status]}">${doc.review.status === 'CONFORME' ? 'Conforme' : 'Non conforme'}</span>${doc.review.note ? `<br><small>${esc(doc.review.note)}</small>` : ''}` : '<span class="badge badge-warning">À examiner</span>'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="sup-empty">Aucune pièce déposée. Déposez au moins le RCCM et la carte de transporteur.</p>'}
        </section>
        <section class="card"><div class="card-header"><h3>Demandes de modification</h3></div>${changeHistory(t, TRANSPORTER_CFG)}</section>
      </div>
      <aside class="sup-side">
        <section class="card sup-card-id"><div class="card-header"><h3>Fiche en vigueur</h3>${orgBadge(t.status)}</div>
          ${identity([['Raison sociale', `<strong>${esc(t.name)}</strong>`], ['RCCM', esc(t.rccm || '—')], ['Carte de transporteur', esc(t.carteTransporteur || '')], ['Adresse e-mail', esc(t.email || '')], ['Téléphone', esc(t.phone || t.contact || '')], ['Adresse', esc([t.address, t.city].filter(Boolean).join(', ') || t.adresse || '')], ['Portée', esc(PORTEES[t.portee] || '')], ['Entreprise principale', d.parent ? esc(d.parent.name) : '']])}
        </section>
        ${t.parentId ? '' : `<section class="card"><div class="card-header"><h3>Entités rattachées</h3>${d.canManage ? `<button type="button" class="btn btn-ghost btn-sm" id="add-sub">${icon('plus', { size: 13 })} Créer</button>` : ''}</div>
          ${d.filiales.length ? `<ul class="sup-list">${d.filiales.map((f) => `<li><span>${esc(f.name)}<small>${esc(f.city || '')}</small></span>${orgBadge(f.status)}</li>`).join('')}</ul>` : '<p class="sup-empty">Aucune entité rattachée.</p>'}</section>`}
        <section class="card"><div class="card-header"><h3>Historique de l’état</h3></div>${stateHistory(t.stateHistory)}</section>
      </aside>
    </div>`;
  const refresh = () => renderTransporterFile(root, user);
  bindOrgForm(root, (v) => updateMyTransporter(v), () => cancelMyTransporterChange(), refresh);
  root.querySelector('#add-doc')?.addEventListener('click', () => formModal({
    title: 'Déposer une pièce', icon: 'upload', confirmLabel: 'Déposer', text: 'PDF, PNG ou JPEG, 300 Ko au maximum (limite de la démonstration).',
    fields: `${field({ name: 'type', label: 'Type de pièce', required: true, options: Object.entries(DOC_TYPES) })}<div class="field"><label>Fichier <span class="req">*</span></label><input class="input" type="file" name="file" accept="application/pdf,image/png,image/jpeg" required></div>`,
    onSubmit: async (v, form) => { const file = await readFile(form.elements.file.files[0]); addMyDocument({ type: v.type, ...file }); toast({ type: 'success', title: 'Pièce déposée', desc: 'Elle sera examinée par l’OIC.' }); refresh(); },
  }));
  root.querySelector('#add-sub')?.addEventListener('click', () => formModal({
    title: 'Créer une entité rattachée', icon: 'building2', confirmLabel: 'Envoyer la demande', large: true,
    text: 'La filiale reprend le RCCM, la carte de transporteur et les pièces de votre entreprise. Elle est active après validation de l’OIC ; son responsable reçoit alors un lien d’activation.',
    fields: `<div class="field-row">${field({ name: 'name', label: 'Raison sociale de la filiale', required: true })}${field({ name: 'email', label: 'Adresse e-mail', type: 'email', required: true })}</div><div class="field-row">${field({ name: 'contactName', label: 'Responsable', required: true })}${field({ name: 'phone', label: 'Téléphone', type: 'tel', required: true })}</div><div class="field-row">${field({ name: 'address', label: 'Adresse' })}${field({ name: 'city', label: 'Ville', required: true })}</div>`,
    onSubmit: (v) => { requestSubsidiary(v); toast({ type: 'success', title: 'Demande envoyée à l’OIC' }); refresh(); },
  }));
}

// ------------------------------------------------------------------ Utilisateurs
export function renderCompanyUsers(root) {
  const user = getCurrentUser();
  let users;
  try { users = listCompanyUsers(); } catch (err) { root.innerHTML = empty('lock', 'Accès réservé', err.message); return; }
  const roles = companyRoles();
  const T = isTransporter(user);
  root.innerHTML = `${header(user, T ? 'Utilisateurs' : 'Mes agents', 'Comptes de votre entreprise. Chaque nouvel utilisateur reçoit un lien d’activation à son adresse et choisit lui-même son mot de passe.')}
    ${companyTabs(user, 'utilisateurs')}
    ${kpis([['Comptes', users.length, 'users'], ['Actifs', users.filter((u) => u.statut === 'ACTIF').length, 'userCheck'], ['À activer', users.filter((u) => u.statut === 'A_ACTIVER').length, 'mail'], ['Inactifs', users.filter((u) => u.statut === 'INACTIF').length, 'userX']])}
    <section class="card sup-table-card">
      <div class="sup-table-head"><div><h2>${T ? 'Utilisateurs de l’entreprise' : 'Agents de l’entreprise'}</h2><p>Vous ne voyez et ne gérez que les comptes de votre entreprise.</p></div><div class="sup-table-tools"><button type="button" class="btn btn-primary" id="add-user">${icon('userPlus', { size: 15 })} ${T ? 'Ajouter un utilisateur' : 'Ajouter un agent'}</button></div></div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Utilisateur</th><th>${T ? 'Droits' : 'Rôle'}</th><th>Téléphone</th><th>État</th><th>Actions</th></tr></thead><tbody>
      ${users.map((u) => `<tr><td><strong>${esc(u.name)}</strong>${u.id === user.id ? ' · vous' : ''}<br><small>${esc(u.email)}</small></td><td>${T ? (u.companyAdmin ? 'Administrateur du compte' : 'Utilisateur') : esc(ROLE_LABELS[u.role])}</td><td>${esc(u.phone || '—')}</td><td>${accountBadge(u.statut)}</td><td><div class="admin-actions"><button class="btn btn-secondary btn-sm" data-edit="${esc(u.id)}">Modifier</button>${u.id !== user.id ? `${u.statut !== 'INACTIF' ? `<button class="btn btn-ghost btn-sm" data-reset="${esc(u.id)}">${u.statut === 'A_ACTIVER' ? 'Renvoyer l’activation' : 'Réinitialiser l’accès'}</button>` : ''}<button class="btn btn-ghost btn-sm" data-toggle="${esc(u.id)}">${u.statut === 'INACTIF' ? 'Réactiver' : 'Désactiver'}</button>` : ''}</div></td></tr>`).join('')}
      </tbody></table></div>
    </section>`;
  const refresh = () => renderCompanyUsers(root);
  const form = (u) => `<div class="field-row">${field({ name: 'name', label: 'Nom complet', value: u?.name || '', required: true, attrs: 'maxlength="100"' })}${field({ name: 'phone', label: 'Téléphone', value: u?.phone || '', type: 'tel' })}</div>
    ${u ? `<div class="field"><label>Adresse e-mail</label><input class="input" value="${esc(u.email)}" disabled></div>` : field({ name: 'email', label: 'Adresse e-mail', type: 'email', required: true, hint: 'Le lien d’activation sera envoyé à cette adresse.' })}
    ${T ? `<label class="checkbox-row"><input type="checkbox" name="companyAdmin" ${u?.companyAdmin ? 'checked' : ''}> Administrateur du compte (gère la fiche, les utilisateurs et les entités rattachées)</label>` : field({ name: 'role', label: 'Rôle', value: u?.role || ROLES.PARTNER_EDITOR, options: roles.map((r) => [r.id, r.label]) })}`;
  root.querySelector('#add-user').addEventListener('click', () => formModal({ title: T ? 'Ajouter un utilisateur' : 'Ajouter un agent', icon: 'userPlus', confirmLabel: 'Créer et envoyer l’activation', fields: form(null), onSubmit: async (v) => { await createCompanyUser(v); toast({ type: 'success', title: 'Compte créé', desc: 'Le lien d’activation a été envoyé (message simulé).' }); refresh(); } }));
  root.querySelector('tbody').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const u = users.find((x) => x.id === (b.dataset.edit || b.dataset.reset || b.dataset.toggle));
    if (b.dataset.edit) formModal({ title: 'Modifier le compte', fields: form(u), onSubmit: (v) => { updateCompanyUser(u.id, { ...v, companyAdmin: v.companyAdmin === 'on' }); toast({ type: 'success', title: 'Compte modifié' }); refresh(); } });
    if (b.dataset.reset) openModal({ title: u.statut === 'A_ACTIVER' ? 'Renvoyer le lien d’activation ?' : 'Réinitialiser l’accès ?', icon: 'keyRound', text: `${u.name} recevra ${u.statut === 'A_ACTIVER' ? 'un nouveau lien d’activation' : 'un code à usage unique'} à son adresse enregistrée (${u.email}). Son accès actuel n’est pas bloqué.`, confirmLabel: 'Envoyer', onConfirm: async ({ close }) => { try { await resetCompanyUserAccess(u.id); close(); toast({ type: 'success', title: 'Message envoyé', desc: 'Message simulé, visible dans le journal des messages.' }); refresh(); } catch (err) { close(); fail(err); } } });
    if (b.dataset.toggle) openModal({ title: u.statut === 'INACTIF' ? 'Réactiver ce compte ?' : 'Désactiver ce compte ?', icon: u.statut === 'INACTIF' ? 'userCheck' : 'userX', tone: u.statut === 'INACTIF' ? 'accent' : 'error', danger: u.statut !== 'INACTIF', text: `${u.name} — ${u.email}. Ses sessions ouvertes sont fermées.`, onConfirm: ({ close }) => { try { setCompanyUserActive(u.id, u.statut === 'INACTIF'); close(); toast({ type: 'success', title: 'Accès mis à jour' }); refresh(); } catch (err) { close(); fail(err); } } });
  });
}

// ------------------------------------------------------------------ Activité des agents
let activityDays = 30;
export function renderActivity(root) {
  const user = getCurrentUser();
  const a = agentActivity({ days: activityDays });
  root.innerHTML = `${header(user, 'Activité des agents', 'Volume de DUT par agent et par période, et signaux à vérifier. Les signaux ne sont pas des preuves : ils invitent à examiner les dossiers concernés.')}
    ${companyTabs(user, 'activite')}
    <div class="table-toolbar"><label class="d1-inline">Période <select class="select" id="act-period">${Object.entries(PERIODS).map(([k, l]) => `<option value="${k}" ${Number(k) === a.period ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label></div>
    ${kpis([['DUT créés', a.totals.created, 'file'], ['Validés', a.totals.validated, 'checkCircle'], ['Rejetés', a.totals.rejected, 'xCircle'], ['Signaux à vérifier', a.totals.anomalies, 'alertTriangle']])}
    <section class="card sup-table-card">
      <div class="sup-table-head"><div><h2>Par agent</h2><p>${esc(a.periodLabel)} · DUT créés par chaque agent, soumissions et décisions de l’OIC.</p></div></div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Agent</th><th class="num">Créés</th><th class="num">Soumissions</th><th class="num">Validés</th><th class="num">Rejetés</th><th class="num">Taux de rejet</th><th>Dernier DUT</th><th>Signaux</th></tr></thead><tbody>
      ${a.rows.map((r) => `<tr><td><strong>${esc(r.name)}</strong>${r.active ? '' : ' <span class="badge badge-error">Inactif</span>'}<br><small>${esc(r.role ? ROLE_LABELS[r.role] : r.email)}</small></td><td class="num">${r.created}</td><td class="num">${r.submissions}</td><td class="num">${r.validated}</td><td class="num">${r.rejected}</td><td class="num"><span class="${r.rejectionRate >= 30 ? 'sup-neg' : ''}">${r.rejectionRate} %</span></td><td>${r.lastActivity ? formatDate(r.lastActivity) : '—'}</td><td>${r.anomalies.length ? r.anomalies.map((x) => `<span class="badge badge-warning d1-signal">${esc(x)}</span>`).join(' ') : '<span class="text-muted">Aucun</span>'}</td></tr>`).join('')}
      </tbody></table></div>
    </section>
    <section class="card sup-table-card">
      <div class="sup-table-head"><div><h2>Volume par période</h2><p>Nombre de DUT créés par agent, ${a.period === 7 ? 'jour par jour' : a.period === 30 ? 'semaine par semaine' : 'mois par mois'}.</p></div></div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Agent</th>${a.columns.map((c) => `<th class="num">${esc(c)}</th>`).join('')}<th class="num">Total</th></tr></thead><tbody>
      ${a.rows.map((r) => `<tr><td><strong>${esc(r.name)}</strong></td>${r.series.map((n) => `<td class="num">${n || '<span class="text-muted">0</span>'}</td>`).join('')}<td class="num"><strong>${r.created}</strong></td></tr>`).join('')}
      </tbody></table></div>
    </section>`;
  root.querySelector('#act-period').addEventListener('change', (e) => { activityDays = Number(e.target.value); renderActivity(root); });
}

// ------------------------------------------------------------------ Véhicules (transporteur)
const deadlineBadges = (v) => v.deadlines.map((d) => `<span class="badge ${d.level === 'ECHUE' ? 'badge-error' : d.level === 'PROCHE' ? 'badge-warning' : 'badge-neutral'} d1-signal">${esc(d.label)} : ${d.level === 'ECHUE' ? 'échue' : formatDate(d.date)}</span>`).join(' ');
export function renderFleet(root) {
  const user = getCurrentUser();
  let fleet;
  try { fleet = myFleet(); } catch (err) { root.innerHTML = empty('lock', 'Accès indisponible', err.message); return; }
  const pending = fleet.declarations.filter((d) => d.status === 'EN_ATTENTE');
  const vehicles = fleet.vehicles.filter((v) => v.status !== 'RETIRE');
  const alerts = vehicles.filter((v) => v.deadlines.some((d) => d.level !== 'OK')).length;
  const declTone = { EN_ATTENTE: 'badge-warning', VALIDEE: 'badge-success', REFUSEE: 'badge-error' };
  root.innerHTML = `${header(user, 'Véhicules', 'Déclarez vos véhicules à l’OIC. Un véhicule n’est utilisable sur un DUT qu’après validation de sa déclaration.')}
    ${companyTabs(user, 'vehicules')}
    ${kpis([['Véhicules validés', vehicles.length, 'truck'], ['Déclarations en attente', pending.length, 'clock'], ['Échéances à surveiller', alerts, 'alertTriangle'], ['Retirés', fleet.vehicles.length - vehicles.length, 'ban']])}
    <section class="card sup-table-card">
      <div class="sup-table-head"><div><h2>Ma flotte</h2><p>Carte grise, PTAC, carte de transport et échéances.</p></div><div class="sup-table-tools"><button type="button" class="btn btn-primary" id="add-vehicle">${icon('plus', { size: 15 })} Déclarer un véhicule</button></div></div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Immatriculation</th><th>Type</th><th class="num">PTAC</th><th>Carte grise</th><th>Carte de transport</th><th>Échéances</th><th>Actions</th></tr></thead><tbody>
      ${vehicles.length ? vehicles.map((v) => `<tr><td><strong>${esc(v.immatriculation)}</strong></td><td>${esc(v.type || '—')}</td><td class="num">${esc(String(v.ptac ?? '—'))} t</td><td>${esc(v.cartegrise || '—')}</td><td>${esc(v.carteTransport || '—')}</td><td>${deadlineBadges(v) || '<span class="text-muted">Non renseignées</span>'}</td><td>${v.pending ? `<span class="badge badge-warning">${esc(KIND_LABELS[v.pending.kind])} en attente</span>` : `<div class="admin-actions"><button class="btn btn-secondary btn-sm" data-update="${esc(v.id)}">Mettre à jour</button><button class="btn btn-ghost btn-sm" data-retire="${esc(v.id)}">Retirer</button></div>`}</td></tr>`).join('') : `<tr><td class="table-empty" colspan="7">Aucun véhicule validé.</td></tr>`}
      </tbody></table></div>
    </section>
    <section class="card sup-table-card">
      <div class="sup-table-head"><div><h2>Mes déclarations</h2><p>Suivi des demandes transmises à l’OIC.</p></div></div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Véhicule</th><th>Nature</th><th>État</th><th>Décision</th><th></th></tr></thead><tbody>
      ${fleet.declarations.length ? fleet.declarations.map((d) => `<tr><td>${formatDate(d.createdAt)}</td><td><strong>${esc(d.data.immatriculation)}</strong></td><td>${esc(KIND_LABELS[d.kind])}</td><td><span class="badge ${declTone[d.status]}">${esc(DECL_STATUS_LABELS[d.status])}</span></td><td>${d.decidedBy ? `${esc(d.decidedBy)}${d.decisionMotif ? `<br><small>${esc(d.decisionMotif)}</small>` : ''}` : '—'}</td><td>${d.status === 'EN_ATTENTE' ? `<button class="btn btn-ghost btn-sm" data-cancel="${esc(d.id)}">Annuler</button>` : ''}</td></tr>`).join('') : '<tr><td class="table-empty" colspan="6">Aucune déclaration.</td></tr>'}
      </tbody></table></div>
    </section>`;
  const refresh = () => renderFleet(root);
  const vehicleFields = (v = {}) => `<div class="field-row">${field({ name: 'immatriculation', label: 'Immatriculation', value: v.immatriculation || '', required: true, attrs: 'placeholder="AB-1234-CD"' })}${field({ name: 'type', label: 'Type de véhicule', value: v.type || VEHICLE_TYPES[0], required: true, options: VEHICLE_TYPES.map((x) => [x, x]) })}</div>
    <div class="field-row">${field({ name: 'cartegrise', label: 'Numéro de carte grise', value: v.cartegrise || '', required: true })}${field({ name: 'dateMiseEnCirculation', label: 'Mise en circulation', type: 'date', value: v.dateMiseEnCirculation || '' })}</div>
    <div class="field-row">${field({ name: 'ptac', label: 'PTAC (tonnes)', type: 'number', value: v.ptac ?? '', required: true, attrs: 'min="1" max="80" step="0.1"' })}${field({ name: 'capaciteTonnes', label: 'Charge utile (tonnes)', type: 'number', value: v.capaciteTonnes ?? '', required: true, attrs: 'min="1" max="80" step="0.1"' })}</div>
    <div class="field-row">${field({ name: 'carteTransport', label: 'Numéro de carte de transport', value: v.carteTransport || '', required: true })}${field({ name: 'carteTransportExpire', label: `Échéance — ${ECHEANCES.carteTransportExpire}`, type: 'date', value: v.carteTransportExpire || '', required: true })}</div>
    <div class="field-row">${field({ name: 'visiteTechniqueExpire', label: `Échéance — ${ECHEANCES.visiteTechniqueExpire}`, type: 'date', value: v.visiteTechniqueExpire || '' })}${field({ name: 'assuranceExpire', label: `Échéance — ${ECHEANCES.assuranceExpire}`, type: 'date', value: v.assuranceExpire || '' })}</div>`;
  root.querySelector('#add-vehicle').addEventListener('click', () => formModal({ title: 'Déclarer un véhicule', icon: 'truck', large: true, confirmLabel: 'Envoyer à l’OIC', text: 'La déclaration est examinée par l’OIC avant que le véhicule rejoigne votre flotte.', fields: vehicleFields(), onSubmit: (v) => { declareVehicle(v); toast({ type: 'success', title: 'Déclaration envoyée à l’OIC' }); refresh(); } }));
  root.querySelector('.sup-table-card').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const v = fleet.vehicles.find((x) => x.id === (b.dataset.update || b.dataset.retire));
    if (b.dataset.update) formModal({ title: `Mettre à jour ${v.immatriculation}`, icon: 'truck', large: true, confirmLabel: 'Envoyer à l’OIC', text: 'Le véhicule reste utilisable avec ses données actuelles jusqu’à la décision de l’OIC.', fields: vehicleFields(v), onSubmit: (vals) => { declareVehicle(vals, { vehicleId: v.id }); toast({ type: 'success', title: 'Mise à jour envoyée à l’OIC' }); refresh(); } });
    if (b.dataset.retire) reasonModal({ title: `Retirer ${v.immatriculation} ?`, text: 'Le retrait est appliqué après validation de l’OIC.', confirmLabel: 'Demander le retrait', onSubmit: (motif) => { declareVehicle({}, { vehicleId: v.id, kind: 'RETRAIT', motif }); toast({ type: 'success', title: 'Demande de retrait envoyée' }); refresh(); } });
  });
  root.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => { try { cancelDeclaration(b.dataset.cancel); toast({ type: 'success', title: 'Déclaration annulée' }); refresh(); } catch (err) { fail(err); } }));
}
