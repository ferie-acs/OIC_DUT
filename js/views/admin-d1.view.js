// Lot d1 : onglets ajoutés à l'administration existante — habilitations, groupements, messages envoyés.
import { icon } from '../core/icons.js';
import { toast } from '../core/ui.js';
import { habilitationMatrix, setPermission, resetHabilitations, listGroupements, groupementsCsv, GROUP_TYPES, permissionLabel } from '../services/habilitations.service.js';
import { messageJournal, CHANNELS, MESSAGE_KINDS } from '../services/messaging.service.js';
import { ORG_STATUS_LABELS } from '../core/constants.js';
import { esc, formatDate, formatDateTime, reasonModal, orgBadge, downloadCsv, simulatedNote } from './d1-ui.js';

export const D1_ADMIN_TABS = [['habilitations', 'Habilitations'], ['groupements', 'Groupements'], ['messages', 'Messages envoyés']];

export function renderAdminSection(body, section, rerender) {
  if (section === 'habilitations') return habilitations(body, rerender);
  if (section === 'groupements') return groupements(body);
  if (section === 'messages') return messages(body);
  return null;
}

function habilitations(body, rerender) {
  const m = habilitationMatrix();
  body.innerHTML = `<section class="card admin-panel"><h2>Habilitations par rôle</h2>
    <p>Cochez ou décochez un droit pour un rôle ; chaque changement demande un motif et est journalisé. Les cases grisées sont verrouillées pour la sécurité : un rôle externe (partenaire, transporteur) ne reçoit jamais de droit de validation, de contrôle ou d’administration ; un même rôle ne peut pas saisir et valider des DUT ; l’administrateur OIC garde toujours l’administration.</p>
    <div class="d1-legend"><span><span class="badge badge-accent">Modifié</span> différent du réglage par défaut</span><span>${icon('lock', { size: 13 })} verrouillé (survolez pour le motif)</span></div>
    <div class="table-wrap"><table class="data-table d1-matrix"><thead><tr><th>Droit</th>${m.roles.map((r) => `<th class="num">${esc(r.label)}</th>`).join('')}</tr></thead><tbody>
    ${m.catalog.map((fam) => `<tr class="d1-family"><td colspan="${m.roles.length + 1}"><strong>${esc(fam.family)}</strong></td></tr>${fam.permissions.map((p) => `<tr><td>${esc(p.label)}<br><small>${esc(p.id)}</small></td>${p.cells.map((c) => `<td class="num"><label class="d1-cell" title="${esc(c.locked || '')}"><input type="checkbox" data-role="${esc(c.role)}" data-perm="${esc(p.id)}" ${c.effective ? 'checked' : ''} ${c.locked ? 'disabled' : ''} aria-label="${esc(p.label)} — ${esc(c.role)}">${c.locked ? icon('lock', { size: 12 }) : ''}${c.changed ? '<span class="badge badge-accent">Modifié</span>' : ''}</label></td>`).join('')}</tr>`).join('')}`).join('')}
    </tbody></table></div>
    ${m.modified ? `<div class="d1-form-actions"><button type="button" class="btn btn-secondary" id="reset-hab">${icon('refresh', { size: 15 })} Rétablir les droits par défaut</button></div>` : ''}
  </section>`;
  body.querySelectorAll('input[data-perm]').forEach((box) => box.addEventListener('change', () => {
    const granted = box.checked;
    box.checked = !granted; // l'état réel n'est appliqué qu'après confirmation
    reasonModal({ title: `${granted ? 'Accorder' : 'Retirer'} ce droit ?`, text: `${permissionLabel(box.dataset.perm)} — rôle ${box.dataset.role}.`, danger: !granted, confirmLabel: granted ? 'Accorder' : 'Retirer', onSubmit: (motif) => { setPermission(box.dataset.role, box.dataset.perm, granted, motif); toast({ type: 'success', title: 'Habilitations mises à jour' }); rerender(); } });
  }));
  body.querySelector('#reset-hab')?.addEventListener('click', () => reasonModal({ title: 'Rétablir les droits par défaut ?', text: 'Tous les ajouts et retraits de droits sont annulés.', confirmLabel: 'Rétablir', onSubmit: (motif) => { resetHabilitations(motif); toast({ type: 'success', title: 'Droits par défaut rétablis' }); rerender(); } }));
}

let gFilter = { type: '', status: '', query: '' };
function groupements(body) {
  const rows = listGroupements(gFilter);
  const all = listGroupements();
  body.innerHTML = `<section class="card admin-panel"><h2>Groupements inscrits</h2>
    <p>Partenaires habilités, transporteurs (y compris les inscriptions en attente) et antennes OIC, avec leur état. La création, la validation et la suspension se font depuis les fiches.</p>
    <div class="admin-toolbar"><input class="input" id="g-query" placeholder="Rechercher un nom, un RCCM, une ville" value="${esc(gFilter.query)}" aria-label="Rechercher un groupement">
      <select class="select" id="g-type" aria-label="Filtrer par type"><option value="">Tous les types</option>${Object.entries(GROUP_TYPES).map(([k, l]) => `<option value="${k}" ${k === gFilter.type ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
      <select class="select" id="g-status" aria-label="Filtrer par état"><option value="">Tous les états</option>${Object.entries(ORG_STATUS_LABELS).map(([k, l]) => `<option value="${k}" ${k === gFilter.status ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
      <button class="btn btn-secondary" id="g-export">${icon('download', { size: 15 })} Exporter (CSV)</button></div>
    <p class="text-muted">${rows.length} groupement(s) sur ${all.length}.</p>
    <div class="table-wrap"><table class="data-table"><thead><tr><th>Groupement</th><th>Type</th><th>RCCM</th><th>Contact</th><th class="num">Comptes</th><th>Depuis</th><th>État</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td><a href="${esc(r.link)}"><strong>${esc(r.name)}</strong></a><br><small>${esc(r.city)}</small></td><td>${esc(r.typeLabel)}</td><td>${esc(r.rccm || '—')}</td><td>${esc(r.email || '—')}</td><td class="num">${r.comptes}</td><td>${r.since ? formatDate(r.since) : '—'}</td><td>${orgBadge(r.status)}</td></tr>`).join('') || '<tr><td colspan="7">Aucun groupement.</td></tr>'}
    </tbody></table></div></section>`;
  const redraw = () => groupements(body);
  body.querySelector('#g-query').addEventListener('change', (e) => { gFilter.query = e.target.value; redraw(); });
  body.querySelector('#g-type').addEventListener('change', (e) => { gFilter.type = e.target.value; redraw(); });
  body.querySelector('#g-status').addEventListener('change', (e) => { gFilter.status = e.target.value; redraw(); });
  body.querySelector('#g-export').addEventListener('click', () => downloadCsv(`groupements-${new Date().toISOString().slice(0, 10)}.csv`, groupementsCsv(rows)));
}

let mFilter = { channel: '', kind: '', query: '' };
function messages(body) {
  const rows = messageJournal(mFilter);
  body.innerHTML = `${simulatedNote('Messages simulés : aucun courriel ni SMS n’est réellement envoyé. Les codes d’activation et de réinitialisation sont masqués dans ce journal ; seul le destinataire les voit.')}
    <section class="card admin-panel"><h2>Messages envoyés</h2>
    <p>Tous les courriels et SMS émis par la plateforme DUT : activation des comptes, mot de passe oublié, décisions sur les partenaires, transporteurs et véhicules.</p>
    <div class="admin-toolbar"><input class="input" id="m-query" placeholder="Rechercher un destinataire ou un objet" value="${esc(mFilter.query)}" aria-label="Rechercher un message">
      <select class="select" id="m-channel" aria-label="Canal"><option value="">Tous les canaux</option>${Object.entries(CHANNELS).map(([k, l]) => `<option value="${k}" ${k === mFilter.channel ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
      <select class="select" id="m-kind" aria-label="Nature"><option value="">Toutes les natures</option>${Object.entries(MESSAGE_KINDS).map(([k, l]) => `<option value="${k}" ${k === mFilter.kind ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
    <p class="text-muted">${rows.length} message(s).</p>
    <div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Canal</th><th>Destinataire</th><th>Objet et contenu</th><th>Origine</th></tr></thead><tbody>
    ${rows.map((m) => `<tr><td>${formatDateTime(m.createdAt)}</td><td><span class="badge ${m.channel === 'SMS' ? 'badge-navy' : 'badge-accent'}">${esc(m.channelLabel)}</span></td><td>${esc(m.to)}</td><td><strong>${esc(m.subject)}</strong><br><small>${esc(m.kindLabel)} — ${esc((m.channel === 'SMS' ? m.body : m.body.split('\n').slice(1).join(' ')).slice(0, 220))}</small></td><td>${esc(m.origin)}<br><small>${esc(m.sentBy)}</small></td></tr>`).join('') || '<tr><td colspan="5">Aucun message.</td></tr>'}
    </tbody></table></div></section>`;
  const redraw = () => messages(body);
  body.querySelector('#m-query').addEventListener('change', (e) => { mFilter.query = e.target.value; redraw(); });
  body.querySelector('#m-channel').addEventListener('change', (e) => { mFilter.channel = e.target.value; redraw(); });
  body.querySelector('#m-kind').addEventListener('change', (e) => { mFilter.kind = e.target.value; redraw(); });
}
