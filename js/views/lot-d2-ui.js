// Lot d2 : petits gabarits partagés par les écrans antennes, sites, plages, caisse et rapprochement.
// Ils reprennent les composants existants (KPI, badges, filtres en pastilles, cartes Leaflet).
import { icon } from '../core/icons.js';
import { iconForLabel } from '../core/card-icons.js';
import { escapeHtml as esc, formatNumber } from '../core/utils.js';

export const n = (v, d = 0) => (v == null || Number.isNaN(v) ? '—' : formatNumber(v, d));
export const fcfa = (v) => (v == null ? '—' : `${formatNumber(Math.round(Number(v) || 0))} F`);
export const isoDay = (offset = 0) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };

export const kpi = (label, value, hint = '', tone = 'navy', iconName = '') => `<div class="kpi-card st-kpi" style="--kpi-tone:var(--sq-${tone}-fg)"><div class="kpi-label"><span>${esc(label)}</span><span class="st-kpi-icon" aria-hidden="true">${icon(iconName || iconForLabel(label), { size: 17 })}</span></div><div class="kpi-value" style="color:var(--sq-${tone}-fg)">${value}</div>${hint ? `<div class="kpi-hint">${hint}</div>` : ''}</div>`;

export const badge = (tone, label) => `<span class="badge badge-${tone}"><span class="badge-dot"></span>${esc(label)}</span>`;

export const header = (overline, title, subtitle, actions = '') => `
  <div class="page-header">
    <div><span class="overline">${esc(overline)}</span><h1>${esc(title)}</h1><div class="subtitle">${subtitle}</div></div>
    ${actions ? `<div class="row gap-2 d2-actions">${actions}</div>` : ''}
  </div>
  <div class="page-header-rule"></div>`;

export const pillSelect = (id, label, list, current, all) => `<label class="plan-pill ${current ? 'is-set' : ''}"><span>${esc(label)}</span><select class="plan-pill-select" id="${id}">${all !== null ? `<option value="">${esc(all)}</option>` : ''}${list.map((o) => `<option value="${esc(o.id)}" ${o.id === current ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select></label>`;
export const pillDate = (id, label, value) => `<label class="plan-pill ${value ? 'is-set' : ''}"><span>${icon('calendar', { size: 13 })} ${esc(label)}</span><input class="plan-pill-select" type="date" id="${id}" value="${esc(value || '')}"></label>`;

export const table = (cols, rows, empty = 'Aucune donnée.') => (rows.length
  ? `<div class="table-wrap"><table class="data-table st-table d2-table"><thead><tr>${cols.map(([l, , cls]) => `<th scope="col" class="${cls || ''}">${esc(l)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map(([, f, cls]) => `<td class="${cls || ''}">${f(r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
  : `<p class="sup-empty">${esc(empty)}</p>`);

export function downloadCsv(filename, text) {
  const blob = new Blob([`﻿${text}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Valeurs d'un formulaire sous forme d'objet. */
export const formValues = (form) => Object.fromEntries(new FormData(form));

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

/**
 * Carte Leaflet de choix d'une position (même fond et mêmes marqueurs que la carte des antennes).
 * Un clic place le repère ; `context` affiche d'autres points pour se repérer.
 */
export function mountMapPicker(el, { lat = null, lng = null, context = [], onPick = () => {} } = {}) {
  if (!el) return null;
  if (!window.L) { el.innerHTML = '<p class="plan-map-offline">Carte indisponible (fond de carte non chargé). Saisissez la latitude et la longitude.</p>'; return null; }
  const L = window.L;
  const has = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && lat !== '' && lng !== '' && lat !== null;
  const map = L.map(el, { scrollWheelZoom: false, attributionControl: false, zoomSnap: 0.25 }).setView(has ? [Number(lat), Number(lng)] : [7.54, -5.55], has ? 10 : 6.5);
  L.tileLayer(TILE_URL, { maxZoom: 18 }).addTo(map);
  context.forEach((c) => L.marker([c.lat, c.lng], { icon: L.divIcon({ className: `ant-marker ${c.kind === 'site' ? 'd2-site-marker' : ''}`, html: '<i></i>', iconSize: [14, 14], iconAnchor: [7, 7] }), keyboard: false })
    .bindTooltip(esc(c.name), { direction: 'top', offset: [0, -8], className: 'antenna-phone-tooltip' }).addTo(map));
  const pickIcon = L.divIcon({ className: 'ant-marker is-active', html: '<i></i>', iconSize: [20, 20], iconAnchor: [10, 10] });
  let marker = has ? L.marker([Number(lat), Number(lng)], { icon: pickIcon }).addTo(map) : null;
  const place = (la, ln, fly = false) => {
    if (marker) marker.setLatLng([la, ln]); else marker = L.marker([la, ln], { icon: pickIcon }).addTo(map);
    if (fly) map.setView([la, ln], Math.max(map.getZoom(), 9));
  };
  map.on('click', (e) => { const la = Math.round(e.latlng.lat * 1e5) / 1e5; const ln = Math.round(e.latlng.lng * 1e5) / 1e5; place(la, ln); onPick(la, ln); });
  const fit = () => { if (!has && context.length) map.fitBounds(context.map((c) => [c.lat, c.lng]), { padding: [24, 24], maxZoom: 8 }); };
  fit();
  requestAnimationFrame(() => { map.invalidateSize(); fit(); });
  return { map, setPosition: (la, ln) => { if (Number.isFinite(la) && Number.isFinite(ln)) place(la, ln, true); }, remove: () => map.remove() };
}
