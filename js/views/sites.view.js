// Lot d2 : référentiel des sites (ports, frontières, gares, zones industrielles, parcs…) sur la carte.
// L'administration OIC crée, modifie et désactive ; l'agent d'antenne consulte les sites de son antenne.
import { icon } from '../core/icons.js';
import { escapeHtml as esc } from '../core/utils.js';
import { getCurrentUser } from '../core/auth.js';
import { can } from '../core/permissions.js';
import { openModal, toast, promptAction } from '../core/ui.js';
import { listAntennas } from '../services/directory.service.js';
import { listSites, saveSite, setSiteActive, SITE_TYPES } from '../services/sites.service.js';
import { header, kpi, badge, n, pillSelect, formValues, mountMapPicker } from './lot-d2-ui.js';

let mapInstance = null;
let modalPicker = null;
const PLURAL = { PORT: 'Ports', FRONTIERE: 'Postes frontières', GARE: 'Gares', ZONE_INDUSTRIELLE: 'Zones industrielles', PARC: 'Parcs à camions' };

export function render(container) {
  const user = getCurrentUser();
  const manage = can(user, 'sites.manage');
  const state = { type: '', antennaId: '', showInactive: false, query: '' };
  const antennas = listAntennas();
  const all = () => listSites({ includeInactive: manage });
  container.innerHTML = `
    ${header(manage ? 'OIC · Réseau' : `Antenne · ${user.antennaName || ''}`, 'Sites', manage ? 'Ports, postes frontières, gares, zones industrielles et parcs, chacun rattaché à une antenne.' : 'Les sites suivis par votre antenne.', manage ? `<button type="button" class="btn btn-primary" id="site-new">${icon('plus', { size: 15 })} Nouveau site</button>` : '')}
    <div class="kpi-grid sup-kpis" id="site-kpis"></div>
    <div class="st-filters">
      ${pillSelect('site-type', 'Type', Object.entries(SITE_TYPES).map(([id, t]) => ({ id, name: t.label })), '', 'Tous')}
      ${manage ? pillSelect('site-antenna', 'Antenne', antennas.map((a) => ({ id: a.id, name: a.name })), '', 'Toutes') : ''}
      ${manage ? pillSelect('site-status', 'Statut', [{ id: 'all', name: 'Actifs et désactivés' }], '', 'Actifs') : ''}
    </div>
    <p class="ant-note">${icon('info', { size: 14 })} Positions indicatives de démonstration, à confirmer par la direction en charge du réseau.</p>
    <div class="antennas-layout ant-layout">
      <section class="card ant-map-card" aria-label="Carte des sites"><div id="sites-map" class="map-container ant-map"></div>
        <div class="ant-map-legend"><span><i class="ant-dot"></i>Antenne</span><span><i class="ant-dot d2-site-dot"></i>Site</span><span><i class="ant-dot is-active"></i>Sélection</span></div></section>
      <section class="card ant-list-card" aria-label="Liste des sites">
        <label class="ant-search">${icon('search', { size: 16 })}<input type="search" id="site-q" placeholder="Rechercher un site, une ville…" autocomplete="off"></label>
        <div class="ant-count" id="site-count"></div>
        <div class="ant-list" id="site-list" role="list"></div>
      </section>
    </div>`;

  const markers = new Map();
  let layer = null;
  const filtered = () => all().filter((s) => (!state.type || s.type === state.type) && (!state.antennaId || s.antennaId === state.antennaId) && (state.showInactive || s.status !== 'INACTIVE')
    && (!state.query || `${s.name} ${s.city} ${s.antennaName} ${s.code}`.toLowerCase().includes(state.query)));
  const draw = () => {
    const rows = filtered(); const every = all().filter((s) => s.status !== 'INACTIVE');
    container.querySelector('#site-kpis').innerHTML = ['PORT', 'FRONTIERE', 'GARE', 'ZONE_INDUSTRIELLE', 'PARC'].map((t, i) => kpi(PLURAL[t], n(every.filter((s) => s.type === t).length), '', ['navy', 'blue', 'teal', 'amber', 'green'][i], SITE_TYPES[t].icon)).join('');
    container.querySelector('#site-count').textContent = `${rows.length} site${rows.length > 1 ? 's' : ''}`;
    container.querySelector('#site-list').innerHTML = rows.length ? rows.map((s) => `
      <div class="ant-item" data-id="${esc(s.id)}" role="listitem" aria-pressed="false" tabindex="0">
        <span class="ant-pin">${icon(SITE_TYPES[s.type]?.icon || 'mapPin', { size: 15 })}</span>
        <span class="ant-body"><strong>${esc(s.name)}</strong><small>${esc(SITE_TYPES[s.type]?.label || s.type)} · ${esc(s.city || '')} · ${esc(s.code)}</small>
          <span class="ant-meta"><span>${icon('map', { size: 12 })} ${esc(s.antennaName)}</span>${s.status === 'INACTIVE' ? badge('neutral', 'Désactivé') : ''}</span></span>
        ${manage ? `<span class="d2-item-actions"><button type="button" class="icon-btn-ghost" data-edit="${esc(s.id)}" aria-label="Modifier ${esc(s.name)}" title="Modifier">${icon('edit', { size: 15 })}</button><button type="button" class="icon-btn-ghost" data-toggle="${esc(s.id)}" aria-label="${s.status === 'INACTIVE' ? 'Réactiver' : 'Désactiver'} ${esc(s.name)}" title="${s.status === 'INACTIVE' ? 'Réactiver' : 'Désactiver'}">${icon(s.status === 'INACTIVE' ? 'refresh' : 'power', { size: 15 })}</button></span>` : ''}
      </div>`).join('') : '<p class="ant-empty">Aucun site ne correspond.</p>';
    if (mapInstance) {
      layer?.remove(); layer = window.L.layerGroup().addTo(mapInstance); markers.clear();
      rows.forEach((s) => {
        const m = window.L.marker([s.lat, s.lng], { icon: window.L.divIcon({ className: 'ant-marker d2-site-marker', html: '<i></i>', iconSize: [16, 16], iconAnchor: [8, 8] }), title: s.name, keyboard: true })
          .bindTooltip(`<strong>${esc(s.name)}</strong><br><span>${esc(SITE_TYPES[s.type]?.label || '')} · ${esc(s.antennaName)}</span>`, { direction: 'top', offset: [0, -8], className: 'antenna-phone-tooltip', opacity: 1 }).addTo(layer);
        m.on('click', () => select(s.id)); markers.set(s.id, m);
      });
    }
  };
  const select = (id) => {
    container.querySelectorAll('#site-list .ant-item').forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.id === id)));
    container.querySelector(`#site-list .ant-item[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const s = all().find((x) => x.id === id);
    if (s && mapInstance) { mapInstance.flyTo([s.lat, s.lng], 11, { duration: 0.6 }); markers.get(id)?.openTooltip(); }
  };

  if (mapInstance) { mapInstance.remove(); mapInstance = null; }
  if (window.L) {
    mapInstance = window.L.map('sites-map', { scrollWheelZoom: false, attributionControl: false, zoomSnap: 0.25 }).setView([7.54, -5.55], 7);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(mapInstance);
    antennas.forEach((a) => window.L.marker([a.lat, a.lng], { icon: window.L.divIcon({ className: 'ant-marker', html: '<i></i>', iconSize: [14, 14], iconAnchor: [7, 7] }), keyboard: false })
      .bindTooltip(`<strong>${esc(a.name)}</strong>`, { direction: 'top', offset: [0, -8], className: 'antenna-phone-tooltip' }).addTo(mapInstance));
    const fit = () => { const pts = filtered().map((s) => [s.lat, s.lng]); if (pts.length) mapInstance.fitBounds(pts, { padding: [36, 36], maxZoom: 9 }); };
    fit(); requestAnimationFrame(() => { mapInstance.invalidateSize(); fit(); });
  } else container.querySelector('#sites-map').innerHTML = '<p class="plan-map-offline">Carte indisponible (fond de carte non chargé).</p>';
  draw();

  container.querySelector('#site-type').addEventListener('change', (e) => { state.type = e.target.value; e.target.closest('.plan-pill').classList.toggle('is-set', !!e.target.value); draw(); });
  container.querySelector('#site-antenna')?.addEventListener('change', (e) => { state.antennaId = e.target.value; e.target.closest('.plan-pill').classList.toggle('is-set', !!e.target.value); draw(); });
  container.querySelector('#site-status')?.addEventListener('change', (e) => { state.showInactive = e.target.value === 'all'; e.target.closest('.plan-pill').classList.toggle('is-set', !!e.target.value); draw(); });
  container.querySelector('#site-q').addEventListener('input', (e) => { state.query = e.target.value.trim().toLowerCase(); draw(); });
  const list = container.querySelector('#site-list');
  list.addEventListener('click', (e) => {
    const edit = e.target.closest('[data-edit]'); const toggle = e.target.closest('[data-toggle]');
    if (edit) return openSiteModal(all().find((s) => s.id === edit.dataset.edit), antennas, draw);
    if (toggle) {
      const s = all().find((x) => x.id === toggle.dataset.toggle);
      if (s.status === 'INACTIVE') { try { setSiteActive(s.id, true); toast({ type: 'success', title: 'Site réactivé' }); draw(); } catch (ex) { toast({ type: 'error', title: 'Action impossible', desc: ex.message }); } return; }
      return promptAction({ title: `Désactiver « ${s.name} »`, text: 'Le site n’apparaîtra plus sur les cartes. Il pourra être réactivé.', label: 'Motif', confirmLabel: 'Désactiver', danger: true, onConfirm: (reason) => { try { setSiteActive(s.id, false, reason); toast({ type: 'success', title: 'Site désactivé' }); draw(); } catch (ex) { toast({ type: 'error', title: 'Action impossible', desc: ex.message }); } } });
    }
    const item = e.target.closest('.ant-item'); if (item) select(item.dataset.id);
  });
  list.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('.ant-item')) select(e.target.dataset.id); });
  container.querySelector('#site-new')?.addEventListener('click', () => openSiteModal(null, antennas, draw));
}

function openSiteModal(site, antennas, onSaved) {
  const s = site || { type: 'PORT', antennaId: '', code: '' };
  const open = antennas.filter((a) => a.status !== 'INACTIVE' || a.id === s.antennaId);
  const modal = openModal({
    icon: 'mapPin', title: site ? 'Modifier le site' : 'Nouveau site', confirmLabel: 'Enregistrer', large: true,
    bodyHtml: `<form id="site-form" class="admin-form d2-modal-form" novalidate>
      <div class="field-row"><label class="field"><span>Nom du site <span class="req">*</span></span><input class="input" name="name" maxlength="80" required value="${esc(s.name || '')}"></label><label class="field"><span>Code <span class="req">*</span></span><input class="input" name="code" maxlength="16" required value="${esc(s.code || '')}" placeholder="PAA-PORT"></label></div>
      <div class="field-row"><label class="field"><span>Type <span class="req">*</span></span><select class="select" name="type">${Object.entries(SITE_TYPES).map(([k, t]) => `<option value="${k}" ${k === s.type ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select></label><label class="field"><span>Antenne de rattachement <span class="req">*</span></span><select class="select" name="antennaId"><option value="">Choisir…</option>${open.map((a) => `<option value="${esc(a.id)}" ${a.id === s.antennaId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label></div>
      <div class="field-row"><label class="field">Ville<input class="input" name="city" maxlength="60" value="${esc(s.city || '')}"></label><label class="field">Description<input class="input" name="description" maxlength="300" value="${esc(s.description || '')}"></label></div>
      <p class="hint">Cliquez sur la carte pour placer le site, ou saisissez ses coordonnées.</p>
      <div class="d2-picker"><div id="site-picker" class="map-container ant-map d2-picker-map is-small"></div></div>
      <div class="field-row"><label class="field"><span>Latitude <span class="req">*</span></span><input class="input" name="lat" inputmode="decimal" value="${esc(s.lat ?? '')}"></label><label class="field"><span>Longitude <span class="req">*</span></span><input class="input" name="lng" inputmode="decimal" value="${esc(s.lng ?? '')}"></label></div>
      <p role="alert" class="error-msg" id="site-error"></p></form>`,
    onConfirm: ({ root, close }) => {
      try { saveSite(site?.id || null, formValues(root.querySelector('#site-form'))); modalPicker?.remove(); modalPicker = null; close(); toast({ type: 'success', title: 'Site enregistré' }); onSaved(); }
      catch (ex) { root.querySelector('#site-error').textContent = ex.message; }
    },
  });
  const form = modal.root.querySelector('#site-form');
  modalPicker?.remove();
  modalPicker = mountMapPicker(modal.root.querySelector('#site-picker'), { lat: s.lat, lng: s.lng, context: antennas.map((a) => ({ name: a.name, lat: a.lat, lng: a.lng })), onPick: (la, ln) => { form.elements.lat.value = la; form.elements.lng.value = ln; } });
  const sync = () => modalPicker?.setPosition(Number(form.elements.lat.value.replace(',', '.')), Number(form.elements.lng.value.replace(',', '.')));
  form.elements.lat.addEventListener('change', sync); form.elements.lng.addEventListener('change', sync);
}
