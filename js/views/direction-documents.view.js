// Lot d5 : espace documentaire de la Direction — déposer, classer, valider, consulter, mettre à jour, archiver.
import { filterOptions } from '../services/statistics.service.js';
import * as D from '../services/direction-documents.service.js';
import {
  esc, icon, num, formatDate, formatDateTime, kpi, kpis, pageHeader, badge, identity, journalHtml,
  tableCard, plainTable, bindRowLinks, options, field, formModal, run, allowed, notFound,
} from './direction-ui.js';
import { getCurrentUser } from '../core/auth.js';

const TONE = { EN_VALIDATION: 'warning', VALIDE: 'success', REFUSE: 'error', ARCHIVE: 'neutral' };
const statusBadge = (s) => badge(D.DOCUMENT_STATUS_LABELS[s] || s, TONE[s]);
const size = (b) => (b >= 1048576 ? `${num(b / 1048576, 1)} Mo` : `${num(Math.max(1, Math.round(b / 1024)))} Ko`);
const NOTE = `<div class="st-alerts"><span class="st-alert is-info">${icon('info', { size: 14 })} Démonstration : seules les informations du fichier (nom, taille, type) sont enregistrées ; le fichier lui-même n’est pas conservé.</span></div>`;

export function render(container, params = {}) {
  if (params.id) return renderDocument(container, params.id);
  return renderList(container);
}

function fileField(required = true) {
  return field('Fichier', '<input class="input" type="file" name="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.odt,.ods,.csv,.jpg,.jpeg,.png,.txt">', { required, hint: 'PDF, Word, Excel, OpenDocument, CSV, image ou texte · 20 Mo au maximum.' });
}
const chosenFile = (form) => form.elements.file?.files?.[0] || null;

function renderList(container) {
  const state = { category: '', status: '', query: '', archived: false };
  const antennas = filterOptions().antennes;
  const draw = () => {
    const all = D.listDocuments({ includeArchived: true });
    const list = D.listDocuments({ category: state.category, status: state.status, query: state.query, includeArchived: state.archived });
    container.innerHTML = `${pageHeader({ overline: 'Direction générale · Documents', title: 'Documents de pilotage', subtitle: 'Rapports, registres, pièces justificatives et documents contractuels : déposés, classés, validés par une autre personne, mis à jour par versions puis archivés.',
        actions: allowed('documents.manage') ? `<button type="button" class="btn btn-primary" id="doc-new">${icon('upload', { size: 15 })} Déposer un document</button>` : '' })}
      ${NOTE}
      ${kpis([
        kpi('Documents en cours', num(all.filter((d) => d.status !== 'ARCHIVE').length), `${num(Object.keys(D.DOCUMENT_CATEGORIES).length)} catégories de classement`),
        kpi('À valider', num(all.filter((d) => d.status === 'EN_VALIDATION').length), 'version en attente', 'amber'),
        kpi('Validés', num(all.filter((d) => d.status === 'VALIDE').length), 'version courante validée', 'green'),
        kpi('Archivés', num(all.filter((d) => d.status === 'ARCHIVE').length), 'consultables, non modifiables', 'navy'),
      ])}
      ${tableCard({ title: 'Registre des documents', intro: 'Cliquez sur un document pour consulter ses versions et le valider.', rows: list, empty: 'Aucun document ne correspond.', link: (d) => `/direction/documents/${d.id}`,
        tools: `<label class="search-input ant-search">${icon('search', { size: 16 })}<input type="search" id="doc-query" placeholder="Titre, référence, fichier…" autocomplete="off" value="${esc(state.query)}"></label>
          <label class="plan-pill ${state.category ? 'is-set' : ''}"><span>Catégorie</span><select class="plan-pill-select" id="doc-category">${options(Object.entries(D.DOCUMENT_CATEGORIES), state.category, 'Toutes')}</select></label>
          <label class="plan-pill ${state.status ? 'is-set' : ''}"><span>État</span><select class="plan-pill-select" id="doc-status">${options(Object.entries(D.DOCUMENT_STATUS_LABELS), state.status, 'Tous')}</select></label>
          <label class="checkbox-row"><input type="checkbox" id="doc-archived" ${state.archived ? 'checked' : ''}><span>Inclure les archives</span></label>`,
        columns: [
          ['title', 'Document', (d) => `<strong>${esc(d.title)}</strong><small>${esc(d.reference)} · ${esc(d.current.fileName)}</small>`],
          ['category', 'Catégorie', (d) => esc(d.categoryLabel)], ['antennaName', 'Antenne', (d) => esc(d.antennaName || 'Toutes')],
          ['version', 'Version', (d) => `v${d.current.n}`, 'num'], ['deposit', 'Dernier dépôt', (d) => `${esc(d.current.by)}<small>${formatDate(d.current.at)}</small>`],
          ['status', 'État', (d) => statusBadge(d.status)],
        ] })}`;
    container.querySelector('#doc-query').addEventListener('input', (e) => { state.query = e.target.value; const pos = e.target.selectionStart; draw(); const i = container.querySelector('#doc-query'); i.focus(); i.setSelectionRange(pos, pos); });
    container.querySelector('#doc-category').addEventListener('change', (e) => { state.category = e.target.value; draw(); });
    container.querySelector('#doc-status').addEventListener('change', (e) => { state.status = e.target.value; if (state.status === 'ARCHIVE') state.archived = true; draw(); });
    container.querySelector('#doc-archived').addEventListener('change', (e) => { state.archived = e.target.checked; draw(); });
    container.querySelector('#doc-new')?.addEventListener('click', () => formModal({
      title: 'Déposer un document', icon: 'upload', large: true, confirmLabel: 'Déposer',
      text: 'Le document sera soumis à la validation d’une autre personne habilitée.',
      body: `${field('Titre', '<input class="input" name="title" maxlength="160">', { required: true })}
        <div class="field-row">${field('Catégorie de classement', `<select class="select" name="category">${options(Object.entries(D.DOCUMENT_CATEGORIES), '', 'Choisir…')}</select>`, { required: true })}${field('Antenne concernée', `<select class="select" name="antennaId">${options(antennas.map((a) => [a.id, a.name]), '', 'Toutes les antennes')}</select>`)}</div>
        ${field('Description', '<textarea class="textarea" name="description" rows="2"></textarea>')}${fileField()}`,
      submit: (v, form) => { const d = D.depositDocument({ ...v, file: chosenFile(form) }); window.location.hash = `/direction/documents/${d.id}`; run(() => {}, 'Document déposé, en attente de validation'); },
    }));
    bindRowLinks(container);
  };
  draw();
}

function renderDocument(container, id) {
  let d;
  try { d = D.getDocument(id); } catch { return notFound(container, '/direction/documents'); }
  const me = getCurrentUser(), refresh = () => renderDocument(container, id);
  const pending = d.status === 'EN_VALIDATION', archived = d.status === 'ARCHIVE';
  const acts = [];
  if (pending && allowed('documents.validate') && d.current.byId !== me.id) acts.push(`<button type="button" class="btn btn-secondary" data-do="reject">${icon('xCircle', { size: 15 })} Refuser</button>`, `<button type="button" class="btn btn-primary" data-do="validate">${icon('fileCheck', { size: 15 })} Valider la version ${d.current.n}</button>`);
  if (!archived && allowed('documents.manage')) {
    acts.push(`<button type="button" class="btn btn-secondary" data-do="classify">${icon('edit', { size: 15 })} Reclasser</button>`);
    if (!pending) acts.push(`<button type="button" class="btn btn-secondary" data-do="version">${icon('upload', { size: 15 })} Nouvelle version</button>`, `<button type="button" class="btn btn-ghost" data-do="archive">${icon('archive', { size: 15 })} Archiver</button>`);
  }
  container.innerHTML = `${pageHeader({ back: { href: '/direction/documents', label: 'Documents de pilotage' }, title: d.title, subtitle: `${esc(d.reference)} · ${esc(d.categoryLabel)} · ${esc(d.antennaName || 'Toutes les antennes')}`,
      badges: `${statusBadge(d.status)}${badge(`Version ${d.current.n}`, 'navy')}`, actions: acts.join('') })}
    ${pending && d.current.byId === me.id && allowed('documents.validate') ? `<div class="st-alerts"><span class="st-alert is-info">${icon('info', { size: 14 })} Vous avez déposé cette version : sa validation revient à une autre personne habilitée.</span></div>` : ''}
    ${archived ? `<div class="st-alerts"><span class="st-alert is-warning">${icon('archive', { size: 14 })} Archivé le ${formatDate(d.archivedAt)} par ${esc(d.archivedBy)} : ${esc(d.archiveReason)}</span></div>` : ''}
    ${NOTE}
    <div class="sup-grid">
      <div class="sup-main">
        <div class="card"><div class="card-header"><h3>Versions</h3><span class="text-muted">La plus récente en premier</span></div>
          ${plainTable([
            ['n', 'Version', (v) => `<strong>v${v.n}</strong>`], ['fileName', 'Fichier', (v) => `${esc(v.fileName)}<small>${size(v.fileSize)} · ${esc(v.fileType)}</small>`],
            ['note', 'Objet', (v) => esc(v.note)], ['by', 'Déposé par', (v) => `${esc(v.by)}<small>${formatDateTime(v.at)}</small>`],
            ['status', 'Décision', (v) => `${statusBadge(v.status)}${v.decidedBy ? `<small>${esc(v.decidedBy)} · ${formatDate(v.decidedAt)}${v.decisionNote ? ` — ${esc(v.decisionNote)}` : ''}</small>` : ''}`],
          ], d.versions.slice().reverse())}</div>
        <div class="card"><div class="card-header"><h3>Journal du document</h3></div>${journalHtml(d.journal)}</div>
      </div>
      <aside class="sup-side">
        <div class="card"><div class="card-header"><h3>Classement</h3></div>${identity([
          ['Référence', esc(d.reference)], ['Catégorie', `<strong>${esc(d.categoryLabel)}</strong>`], ['Antenne', esc(d.antennaName || 'Toutes les antennes')],
          ['Description', esc(d.description || '')], ['Créé par', `${esc(d.createdBy?.name || '—')} · ${formatDate(d.createdAt)}`],
        ])}</div>
      </aside>
    </div>`;
  const antennas = filterOptions().antennes;
  container.querySelectorAll('[data-do]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.do;
    if (k === 'validate') formModal({ title: `Valider la version ${d.current.n} ?`, icon: 'fileCheck', confirmLabel: 'Valider', text: `${d.current.fileName} — déposé par ${d.current.by}.`, body: field('Observation', '<textarea class="textarea" name="note" rows="2"></textarea>'), submit: (v) => { D.validateDocument(id, v.note); refresh(); } });
    if (k === 'reject') formModal({ title: 'Refuser cette version', icon: 'xCircle', danger: true, confirmLabel: 'Refuser', body: field('Motif du refus', '<textarea class="textarea" name="reason" rows="3"></textarea>', { required: true }), submit: (v) => { D.rejectDocument(id, v.reason); refresh(); } });
    if (k === 'version') formModal({ title: 'Mettre à jour le document', icon: 'upload', confirmLabel: 'Déposer la nouvelle version', text: 'La nouvelle version devra être validée ; les versions précédentes restent consultables.', body: `${field('Objet de la mise à jour', '<input class="input" name="note" maxlength="300">', { required: true })}${fileField()}`, submit: (v, form) => { D.addVersion(id, { note: v.note, file: chosenFile(form) }); refresh(); } });
    if (k === 'archive') formModal({ title: 'Archiver ce document', icon: 'archive', confirmLabel: 'Archiver', text: 'Le document reste consultable mais ne peut plus être modifié.', body: field('Motif d’archivage', '<textarea class="textarea" name="reason" rows="2"></textarea>', { required: true }), submit: (v) => { D.archiveDocument(id, v.reason); refresh(); } });
    if (k === 'classify') formModal({ title: 'Reclasser le document', icon: 'edit', body: `${field('Titre', `<input class="input" name="title" maxlength="160" value="${esc(d.title)}">`, { required: true })}<div class="field-row">${field('Catégorie', `<select class="select" name="category">${options(Object.entries(D.DOCUMENT_CATEGORIES), d.category)}</select>`, { required: true })}${field('Antenne concernée', `<select class="select" name="antennaId">${options(antennas.map((a) => [a.id, a.name]), d.antennaId || '', 'Toutes les antennes')}</select>`)}</div>${field('Description', `<textarea class="textarea" name="description" rows="2">${esc(d.description || '')}</textarea>`)}`, submit: (v) => { D.classifyDocument(id, v); refresh(); } });
  }));
}
