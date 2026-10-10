import { icon } from '../core/icons.js';
import { getCurrentUser } from '../core/auth.js';
import { escapeHtml as esc, formatDateTime } from '../core/utils.js';
import { readObject, writeObject } from '../core/storage.js';
import { toast } from '../core/ui.js';
import { visibleDuts, documentUrl } from '../services/insights.service.js';
import { getActions, dossier, STAGES } from '../services/workspace.service.js';
import { getAllOperations } from '../repositories/operations.repository.js';

const categories = { ALL: 'Toutes les actions', DOCUMENT: 'Documents', TRANSPORT: 'Transports', INCIDENT: 'Incidents' };
const keyFor = user => `dut_action_filters_${user.id}`;
function rangeNotice(user) {
  const ops = getAllOperations();
  if (user.role === 'OIC_ADMIN') {
    const pending = ops.filter(o => o.status === 'PENDING').length;
    return `<a class="action-notice" href="#/oic/operations"><strong>${pending} demande(s) de plage en attente</strong><span>Examiner les demandes →</span></a>`;
  }
  if (!user.role.startsWith('PARTNER_')) return '';
  const mine = ops.filter(o => o.partnerId === user.partnerId);
  const available = mine.filter(o => o.status === 'VALIDATED').reduce((sum, o) => sum + Math.max(0, o.quantity - o.used), 0);
  return `<a class="action-notice ${available <= 10 ? 'low-stock' : ''}" href="#/partner/operations"><strong>${available} numéro(s) disponible(s)${available <= 10 ? ' · Stock faible' : ''}</strong><span>${mine.filter(o => o.status === 'PENDING').length} demande(s) en attente · Gérer les plages →</span></a>`;
}
export function mountActionSummary(container, user) {
  const actions = getActions(user);
  const node = document.createElement('section'); node.className = 'action-summary';
  node.innerHTML = `<div><span class="overline">Votre journée</span><h3>${actions.length} action(s) à suivre</h3><p>${actions.filter(a => a.urgent).length} prioritaire(s) · ${actions.filter(a => a.category === 'INCIDENT').length} incident(s) ouvert(s)</p></div><a class="btn btn-primary" href="#/actions">Ouvrir le centre d’actions</a>`;
  const anchor = container.querySelector('.page-header-rule');
  if (anchor) anchor.after(node); else container.prepend(node);
}
export function render(container) {
  const user = getCurrentUser();
  const saved = readObject(keyFor(user), {});
  let filter = categories[saved.category] ? saved.category : 'ALL';
  let query = typeof saved.query === 'string' ? saved.query : '';
  let urgent = Boolean(saved.urgent);
  const all = getActions(user);
  const duts = visibleDuts(user);
  const records = duts.map(d => dossier(d.id));
  const metrics = [
    ['Actions ouvertes', all.length, 'list', 'blue', 'À traiter dans votre périmètre'],
    ['Prioritaires', all.filter(a => a.urgent).length, 'alertCircle', 'orange', 'Demandent votre attention'],
    ['Transports en route', records.filter(r => r.stage === 'DEPARTED').length, 'truck', 'blue', 'Départs déclarés'],
    ['Livraisons déclarées', records.filter(r => r.stage === 'DELIVERED').length, 'checkCircle', 'green', 'Transports terminés'],
  ];
  container.innerHTML = `<div class="actions-page">
  <header class="ac-heading"><div><span class="overline">Pilotage / Suivi quotidien</span><h1>Centre d’actions</h1><p>Gardez une longueur d’avance sur vos opérations.</p></div><span class="ac-local">${icon('checkCircle', {size:15})} Enregistré sur cet appareil</span></header>
  <section class="ac-hero"><div><span class="ac-eyebrow">VOTRE ACTIVITÉ, EN UN COUP D’ŒIL</span><h2>Chaque action fait avancer<br>votre transport.</h2><p><strong>${all.filter(a => a.urgent).length} action(s) prioritaire(s)</strong> à examiner dans votre espace.</p><a href="#action-queue" class="ac-hero-link" id="ac-see-priorities">Voir mes priorités ${icon('arrowRight', {size:17})}</a></div><img src="assets/images/dut-transport-illustration.png" alt="Camion, document de transport et itinéraire de livraison"></section>
  <section class="ac-metrics" aria-label="Indicateurs de suivi">${metrics.map(([label,value,symbol,tone,note]) => `<article class="card ac-metric"><div class="ac-metric-top"><span>${label}</span><span class="ac-icon ${tone}">${icon(symbol,{size:21})}</span></div><strong>${value}</strong><small>${note}</small></article>`).join('')}</section>
  <div class="ac-columns"><section class="card ac-queue" id="action-queue"><div class="ac-section-heading"><div><h2>À traiter</h2><p>Vos prochaines actions, par ordre de priorité.</p></div><span class="ac-total">${all.length}</span></div>
  <div class="ac-category-tabs" role="group" aria-label="Catégories d’actions">${Object.entries(categories).map(([key,label]) => `<button type="button" data-category="${key}" aria-pressed="${key === filter}">${key === 'ALL' ? 'Tout' : label}<span>${key === 'ALL' ? all.length : all.filter(a => a.category === key).length}</span></button>`).join('')}</div>
  <div class="ac-toolbar"><label class="ac-search">${icon('search',{size:18})}<input id="action-query" aria-label="Rechercher une action" placeholder="DUT, transporteur, trajet…" value="${esc(query)}"></label><label class="ac-urgent"><input id="action-urgent" type="checkbox" ${urgent ? 'checked' : ''}>Prioritaires</label><button class="btn btn-ghost ac-save" id="save-action-filter" title="Enregistrer cette vue" aria-label="Enregistrer cette vue">${icon('download',{size:17})}</button><button class="btn btn-ghost ac-save" id="reset-action-filter" title="Réinitialiser les filtres" aria-label="Réinitialiser">${icon('refresh',{size:17})}</button></div>
  <div class="ac-list-meta"><span id="action-count" role="status"></span><span>Priorité la plus haute d’abord</span></div><div id="action-rows"></div></section>
  <aside class="ac-side"><section class="card ac-resource"><span class="ac-icon blue">${icon('layers',{size:23})}</span><h3>Vos ressources</h3><p>Anticipez les besoins de vos prochaines opérations.</p>${rangeNotice(user) || `<a class="action-notice" href="#transports-overview"><strong>${duts.length} dossier(s) accessible(s)</strong><span>Consulter les transports ${icon('arrowRight',{size:16})}</span></a>`}</section><section class="card ac-guide"><span class="overline">Un suivi complet</span><h3>Du dossier à la livraison</h3><ol><li><span>01</span><div><strong>Préparer</strong><p>Complétez les dossiers et vérifiez les pièces.</p></div></li><li><span>02</span><div><strong>Suivre</strong><p>Déclarez les étapes et les incidents du trajet.</p></div></li><li><span>03</span><div><strong>Confirmer</strong><p>Enregistrez la livraison et ses justificatifs.</p></div></li></ol></section></aside></div>
  <section class="card ac-transports" id="transports-overview"><div class="ac-section-heading"><div><h2>Vue d’ensemble des transports</h2><p>Retrouvez tous vos dossiers, y compris les livraisons terminées.</p></div><span class="ac-total">${duts.length}</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Dossier / véhicule</th><th>Itinéraire</th><th>Suivi déclaré</th><th>Dernière activité</th><th>Action</th></tr></thead><tbody>${duts.map((d,i) => `<tr><td><a class="ac-dossier-link" href="${documentUrl(user,d)}">${icon('file',{size:17})}${esc(d.dutNumber || 'Brouillon')}</a><small class="ac-vehicle">${esc(d.general?.immatriculation || 'Véhicule à préciser')}</small></td><td><span class="ac-route">${esc(d.trajet?.chargement?.ville || '—')} ${icon('arrowRight',{size:14})} ${esc(d.trajet?.dechargement?.ville || '—')}</span></td><td><span class="ac-stage ${records[i].stage === 'DELIVERED' ? 'delivered' : ''}"><i></i>${STAGES[records[i].stage]}</span></td><td class="ac-activity">${records[i].updatedAt ? formatDateTime(records[i].updatedAt) : 'Aucune activité déclarée'}</td><td><a class="ac-open" href="${documentUrl(user,d)}" aria-label="Ouvrir ${esc(d.dutNumber || 'le brouillon')}">${icon('chevronRight',{size:18})}</a></td></tr>`).join('') || '<tr><td colspan="5" class="table-empty">Aucun dossier dans votre périmètre.</td></tr>'}</tbody></table></div></section></div>`;
  const draw = () => {
    const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const needle = normalize(query).trim();
    const rows = all.filter(a => (filter === 'ALL' || filter === a.category) && (!urgent || a.urgent) && normalize([a.label,a.dut.dutNumber,a.dut.general?.transporterName,a.dut.general?.immatriculation,a.dut.trajet?.chargement?.ville,a.dut.trajet?.dechargement?.ville].join(' ')).includes(needle));
    container.querySelector('#action-count').textContent = `${rows.length} action(s) affichée(s)`;
    container.querySelectorAll('[data-category]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.category === filter)));
    container.querySelector('#action-rows').innerHTML = rows.map(a => `<a class="ac-row" data-cat="${a.category}" data-urgent="${a.urgent ? '1' : '0'}" href="#/dut/${encodeURIComponent(a.dut.id)}/${a.category === 'INCIDENT' ? 'incidents' : a.category === 'TRANSPORT' ? 'transport' : 'detail'}"><span class="ac-row-icon ${a.urgent ? 'urgent' : ''}">${icon(a.category === 'TRANSPORT' ? 'truck' : a.category === 'INCIDENT' ? 'alertTriangle' : 'file',{size:21})}</span><div class="ac-row-content"><div class="ac-row-title"><strong>${esc(a.label)}</strong>${a.urgent ? '<span class="ac-priority">Prioritaire</span>' : ''}</div><p>${esc(a.dut.dutNumber || 'Brouillon')} <span>·</span> ${esc(a.dut.general?.transporterName || 'Transporteur à préciser')}</p><span class="ac-row-route">${esc(a.dut.trajet?.chargement?.ville || '—')} ${icon('arrowRight',{size:12})} ${esc(a.dut.trajet?.dechargement?.ville || '—')}</span></div><span class="ac-row-arrow">${icon('chevronRight',{size:19})}</span></a>`).join('') || `<div class="empty-state ac-empty">${icon('checkCircle',{size:36})}<h3>Vous êtes à jour pour cette vue</h3><p>Aucune action ne correspond aux filtres sélectionnés.</p></div>`;
  };
  container.querySelectorAll('[data-category]').forEach(button => button.addEventListener('click', () => { filter = button.dataset.category; draw(); }));
  container.querySelector('#ac-see-priorities').addEventListener('click', e => { e.preventDefault(); urgent = true; filter = 'ALL'; query = ''; container.querySelector('#action-query').value = ''; container.querySelector('#action-urgent').checked = true; draw(); container.querySelector('#action-queue').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); });
  container.querySelector('#action-query').addEventListener('input', e => { query = e.target.value; draw(); });
  container.querySelector('#action-urgent').addEventListener('change', e => { urgent = e.target.checked; draw(); });
  container.querySelector('#save-action-filter').addEventListener('click', () => {
    try { writeObject(keyFor(user), { category: filter, query, urgent }); toast({ type: 'success', title: 'Vue enregistrée pour votre compte local' }); }
    catch (err) { toast({ type: 'error', title: 'Sauvegarde impossible', desc: err.message }); }
  });
  container.querySelector('#reset-action-filter').addEventListener('click', () => {
    try { writeObject(keyFor(user), {}); render(container); } catch (err) { toast({ type: 'error', title: 'Sauvegarde impossible', desc: err.message }); }
  });
  container.querySelector('a[href="#transports-overview"]')?.addEventListener('click', e => { e.preventDefault(); container.querySelector('#transports-overview').scrollIntoView({ block: 'start' }); });
  draw();
}
