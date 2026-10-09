import { findCity, routePoints } from '../data/cities.js';
import { escapeHtml as esc } from '../core/utils.js';

const CI_CENTER = [7.54, -5.55];
const durationOf = (a, b) => { const h = Math.round((Date.parse(b) - Date.parse(a)) / 36e5); if (!Number.isFinite(h) || h <= 0) return ''; const d = Math.floor(h / 24), r = h % 24; return d ? (r ? `${d} j ${r} h` : `${d} j`) : `${h} h`; };
const when = (iso) => iso ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const TRUCK_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.6" fill="#fff"/><circle cx="17" cy="18" r="1.6" fill="#fff"/></svg>';
const COLORS = { blue: '#0E56A4', green: '#0C8B41', gray: '#8A93A0', orange: '#F17D0C' };

/** Un trajet dessinable : les deux villes sont connues. */
function tripOf(row, color) {
  const from = findCity(row.dut.trajet?.chargement?.ville), to = findCity(row.dut.trajet?.dechargement?.ville);
  if (!from || !to || from === to) return null;
  return { id: row.dut.id, from, to, color: COLORS[color] || COLORS.blue, colorName: color, row };
}

/**
 * Carte des trajets de la période. `rows` : lignes du planning ; `colorOf(row)` : teinte du statut.
 * Rend { select(id), destroy() }. Sans Leaflet (hors ligne, tests), la carte affiche un message et la liste reste utilisable.
 */
export function mountTripMap(container, rows, { colorOf, selectedId = null, onSelect = () => {} } = {}) {
  const mapEl = container.querySelector('#plan-map');
  const listEl = container.querySelector('#plan-map-list');
  const trips = rows.map((r) => tripOf(r, colorOf(r))).filter(Boolean);
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let map = null, layers = new Map(), truck = null, frame = null, current = null;

  listEl.innerHTML = trips.length ? trips.map((t) => `
    <button type="button" class="plan-map-item" data-trip="${esc(t.id)}" aria-pressed="false">
      <i class="plan-dot ${t.colorName === 'blue' ? '' : t.colorName}"></i>
      <span><strong>${esc(t.row.dut.general?.immatriculation || 'Camion à préciser')}</strong><small>${esc(t.from.name)} → ${esc(t.to.name)}</small><small class="plan-map-when">${esc(when(t.row.start))} → ${esc(when(t.row.end))}${durationOf(t.row.start, t.row.end) ? ` · <b>${esc(durationOf(t.row.start, t.row.end))}</b>` : ''}</small></span>
    </button>`).join('') : '<p class="plan-map-empty">Aucun trajet avec deux villes connues sur cette période.</p>';

  if (!window.L || !mapEl) {
    if (mapEl) mapEl.innerHTML = '<div class="plan-map-offline">Carte indisponible : fond de carte non chargé.</div>';
  } else {
    map = window.L.map(mapEl, { zoomControl: true, attributionControl: false, scrollWheelZoom: false }).setView(CI_CENTER, 7);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 12 }).addTo(map);
    trips.forEach((t) => {
      const pts = routePoints(t.from, t.to, 40);
      const line = window.L.polyline(pts, { color: t.color, weight: 2, opacity: .28, dashArray: '2 8', lineCap: 'round' }).addTo(map);
      line.on('click', () => select(t.id));
      layers.set(t.id, { line, pts });
    });
  }

  function pin(latlng, color, label) {
    return window.L.circleMarker(latlng, { radius: 7, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 }).bindTooltip(label, { direction: 'top', offset: [0, -8], className: 'plan-map-tip' });
  }

  function clearSelection() {
    if (current) {
      current.extra.forEach((l) => map.removeLayer(l));
      current.line.setStyle({ weight: 2, opacity: .28, dashArray: '2 8' });
      current = null;
    }
    if (frame) cancelAnimationFrame(frame); frame = null;
    if (truck) { map.removeLayer(truck); truck = null; }
  }

  function select(id) {
    const t = trips.find((x) => x.id === id);
    listEl.querySelectorAll('.plan-map-item').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.trip === id)));
    onSelect(id);
    if (!map || !t) return;
    clearSelection();
    const { line, pts } = layers.get(id);
    line.setStyle({ weight: 4, opacity: 1, dashArray: '1 10' }).bringToFront();
    const extra = [
      pin(pts[0], '#0E56A4', `Départ · ${t.from.name} · ${when(t.row.start)}`).addTo(map),
      pin(pts[pts.length - 1], '#F17D0C', `Arrivée · ${t.to.name} · ${when(t.row.end)}`).addTo(map),
    ];
    current = { line, extra };
    map.fitBounds(line.getBounds(), { padding: [48, 48], maxZoom: 9 });
    truck = window.L.marker(pts[0], { icon: window.L.divIcon({ className: 'plan-truck', html: TRUCK_SVG, iconSize: [30, 30], iconAnchor: [15, 15] }), interactive: false, zIndexOffset: 1000 }).addTo(map);
    if (reduced) { truck.setLatLng(pts[Math.floor(pts.length / 2)]); return; }
    const t0 = performance.now(), duration = 2600;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      const idx = Math.min(pts.length - 1, Math.round(eased * (pts.length - 1)));
      truck.setLatLng(pts[idx]);
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  }

  listEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-trip]'); if (b) select(b.dataset.trip);
  });
  if (selectedId && trips.some((t) => t.id === selectedId)) select(selectedId);

  return {
    select,
    destroy() { if (frame) cancelAnimationFrame(frame); if (map) map.remove(); map = null; },
  };
}
