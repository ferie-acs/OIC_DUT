import { icon } from '../core/icons.js';
import { escapeHtml } from '../core/utils.js';
import { listAntennas } from '../services/directory.service.js';

let mapInstance = null;

export function render(container) {
  const antennas = listAntennas();

  const cities = new Set(antennas.map((a) => (a.city || '').split('·')[0].trim())).size;
  container.innerHTML = `
    <div class="page-header">
      <div>
        <span class="overline">Réseau OIC</span>
        <h1>Carte des antennes OIC</h1>
        <div class="subtitle">${antennas.length} antennes dans ${cities} localités. Cliquez sur une antenne pour la situer.</div>
      </div>
      <span class="badge badge-navy">${antennas.length} antennes</span>
    </div>
    <div class="page-header-rule"></div>
    <p class="ant-note">${icon('info', { size: 14 })} Contacts issus de la liste OIC, numéros reproduits tels que fournis. Les points indiquent les localités ; les adresses exactes des bureaux restent à confirmer.</p>
    <div class="antennas-layout ant-layout">
      <section class="card ant-map-card" aria-label="Localisation des antennes">
        <div id="antennas-map" class="map-container ant-map"></div>
        <div class="ant-map-legend"><span><i class="ant-dot"></i>Antenne</span><span><i class="ant-dot is-hq"></i>Siège</span><span><i class="ant-dot is-active"></i>Sélection</span></div>
      </section>
      <section class="card ant-list-card" aria-label="Liste des antennes">
        <label class="ant-search">${icon('search', { size: 16 })}<input type="search" id="ant-query" placeholder="Rechercher une antenne ou une ville…" autocomplete="off"></label>
        <div class="ant-list" id="ant-list" role="list"></div>
      </section>
    </div>
  `;

  const listEl = container.querySelector('#ant-list');
  const isHq = (a) => /SIEGE|SIÈGE/i.test(a.name);
  function renderList(query = '') {
    const q = query.trim().toLowerCase();
    const shown = antennas.filter((a) => !q || `${a.name} ${a.city} ${a.phone}`.toLowerCase().includes(q));
    listEl.innerHTML = shown.length ? shown.map((a) => `
      <button type="button" class="ant-item ${isHq(a) ? 'is-hq' : ''}" data-id="${a.id}" role="listitem" aria-pressed="false">
        <span class="ant-pin">${icon('pin', { size: 15 })}</span>
        <span class="ant-body">
          <strong>${escapeHtml(a.name)}</strong>
          <small>${escapeHtml(a.city)}${isHq(a) ? ' · Siège' : ''}</small>
          <span class="ant-meta"><span>${icon('phone', { size: 12 })} ${escapeHtml(a.phone)}</span>${a.hours && a.hours !== 'Non renseignés' ? `<span>${icon('clock', { size: 12 })} ${escapeHtml(a.hours)}</span>` : ''}</span>
        </span>
        <a class="ant-zone" target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=${a.lat}&mlon=${a.lng}#map=15/${a.lat}/${a.lng}" title="Ouvrir la zone dans OpenStreetMap">${icon('map', { size: 14 })}</a>
      </button>`).join('') : '<p class="ant-empty">Aucune antenne ne correspond.</p>';
  }
  renderList();
  container.querySelector('#ant-query').addEventListener('input', (e) => { renderList(e.target.value); if (selected) highlight(selected); });

  if (!window.L) {
    container.querySelector('#antennas-map').innerHTML = '<p class="plan-map-offline">Carte indisponible (fond de carte non chargé).</p>';
    return;
  }

  if (mapInstance) { mapInstance.remove(); mapInstance = null; }
  mapInstance = window.L.map('antennas-map', { scrollWheelZoom: false, attributionControl: false }).setView([7.54, -5.55], 7);
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(mapInstance);
  if (antennas.length) mapInstance.fitBounds(antennas.map((a) => [a.lat, a.lng]), { padding: [28, 28], maxZoom: 7 });

  const markers = new Map();
  let selected = null;
  const iconFor = (a, active) => window.L.divIcon({ className: `ant-marker ${isHq(a) ? 'is-hq' : ''} ${active ? 'is-active' : ''}`, html: '<i></i>', iconSize: [18, 18], iconAnchor: [9, 9] });
  function highlight(id) {
    selected = id;
    markers.forEach((m, key) => m.setIcon(iconFor(m.antenna, key === id)));
    listEl.querySelectorAll('.ant-item').forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.id === id)));
    listEl.querySelector(`.ant-item[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  antennas.forEach((a) => {
    const marker = window.L.marker([a.lat, a.lng], { icon: iconFor(a, false), title: a.name, alt: `${a.name} — ${a.phone}`, keyboard: true }).addTo(mapInstance);
    marker.antenna = a;
    marker.bindTooltip(`<strong>${escapeHtml(a.name)}</strong><br><span>${escapeHtml(a.phone)}</span>`, { direction: 'top', offset: [0, -10], className: 'antenna-phone-tooltip', opacity: 1 });
    marker.on('click', () => { highlight(a.id); });
    markers.set(a.id, marker);
  });
  listEl.addEventListener('click', (e) => {
    if (e.target.closest('.ant-zone')) return;
    const item = e.target.closest('.ant-item'); if (!item) return;
    const a = antennas.find((x) => x.id === item.dataset.id); if (!a) return;
    highlight(a.id);
    mapInstance.flyTo([a.lat, a.lng], 11, { duration: 0.8 });
    markers.get(a.id)?.openTooltip();
  });
}
