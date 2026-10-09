import { settings } from '../services/settings.service.js';
import { readObject, writeObject } from './storage.js';
import { searchDocuments, documentUrl, computeInsights, visibleDuts } from '../services/insights.service.js';
import { icon } from './icons.js';
import { initials, escapeHtml } from './utils.js';
import { logout } from './auth.js';
import { navigate } from './router.js';
import { ROLE_LABELS } from './constants.js';
import { createDraft } from '../services/dut.service.js';

let shellEvents;

const NAV_SECTIONS_BY_ROLE = {
  PARTNER_ADMIN: [
    { label: 'Pilotage', items: [{ path: '/partner/dashboard', label: 'Tableau de bord', icon: 'dashboard' }] },
    { label: 'Documents', items: [
      { path: '/partner/dut', label: 'Mes DUT', icon: 'file' },
      { action: 'new-dut', label: 'Nouveau DUT', icon: 'plus' },
    ] },
    { label: 'Ressources', items: [
      { path: '/partner/operations', label: 'Opérations & plages', icon: 'layers' },
      { path: '/partner/referentials', label: 'Référentiels', icon: 'users' },
    ] },
    { label: 'Réseau', items: [{ path: '/partner/antennas', label: 'Carte des antennes', icon: 'map' }] },
  ],
  PARTNER_EDITOR: [
    { label: 'Pilotage', items: [{ path: '/partner/dashboard', label: 'Tableau de bord', icon: 'dashboard' }] },
    { label: 'Documents', items: [
      { path: '/partner/dut', label: 'Mes DUT', icon: 'file' },
      { action: 'new-dut', label: 'Nouveau DUT', icon: 'plus' },
    ] },
    { label: 'Ressources', items: [{ path: '/partner/operations', label: 'Opérations & plages', icon: 'layers' }] },
    { label: 'Réseau', items: [{ path: '/partner/antennas', label: 'Carte des antennes', icon: 'map' }] },
  ],
  ANTENNA_AGENT: [
    { label: 'Pilotage', items: [{ path: '/antenna/dashboard', label: 'Tableau de bord', icon: 'dashboard' }] },
  ],
  OIC_ADMIN: [
    { label: 'Pilotage', items: [{ path: '/oic/dashboard', label: 'Dashboard national', icon: 'dashboard' }, { path: '/oic/supervision', label: 'Supervision', icon: 'target' }] },
  ],
  TRANSPORTEUR: [
    { label: 'Pilotage', items: [{ path: '/transporteur/dashboard', label: 'Tableau de bord', icon: 'dashboard' }] },
  ],
};

function appRoot() {
  return document.getElementById('app');
}

function isActive(navPath, currentPath) {
  if (navPath === currentPath) return true;
  if (navPath !== '/' && currentPath.startsWith(`${navPath}/`)) return true;
  return false;
}

export function renderAppShell(user, currentPath, breadcrumbItems = []) {
  shellEvents?.abort();
  shellEvents = new AbortController();
  const root = appRoot();
  document.documentElement.dataset.theme = readObject('dut_theme', 'light');
  const sections = (NAV_SECTIONS_BY_ROLE[user.role] || []).map(section => ({ ...section, items: [...section.items] }));
  if (sections.length) sections[0].items.push({ path: '/planning', label: 'Planning des trajets', icon: 'truck' });
  if (sections.length) sections[0].items.push({ path: '/actions', label: 'Centre d’actions', icon: 'checkCircle' });
  sections.push({ label: 'Découvrir', items: [{ path: '/decouvrir', label: 'Comment fonctionne le DUT', icon: 'file' }] });
  if (user.role === 'OIC_ADMIN') sections.push({ label: 'Ressources', items: [{ path: '/oic/operations', label: 'Demandes de plages', icon: 'layers' }, { path: '/oic/antennas', label: 'Carte des antennes', icon: 'map' }] });

  if(user.role==='OIC_ADMIN') sections.push({label:'Administration',items:[{path:'/admin/users',label:'Utilisateurs',icon:'users'},{path:'/admin/roles',label:'Rôles & accès',icon:'shield'},{path:'/admin/settings',label:'Paramètres',icon:'layers'},{path:'/admin/audit',label:'Journal',icon:'file'}]});
  document.title=settings().platformName;
  root.innerHTML = `
    <div class="app-shell">
      <div class="sidebar-backdrop" id="sidebar-backdrop"></div>
      <aside class="sidebar" id="sidebar">
        <nav class="app-rail" aria-label="Accès rapides">
          <span class="rail-logo"><img src="assets/images/oic-officiel.jpeg" alt="OIC — Office Ivoirien des Chargeurs"></span>
          ${sections.flatMap(section => section.items).filter(item => item.path).map(item=>`<a class="rail-link ${isActive(item.path,currentPath)?'active':''}" href="#${item.path}" aria-label="${item.label}" title="${item.label}">${icon(item.icon,{size:22})}</a>`).join('')}
          <span class="rail-bottom rail-link" title="Document Unique de Transport">${icon('shield',{size:23})}</span>
        </nav>
        <div class="sidebar-brand">
          <img src="assets/images/oic-officiel.jpeg" alt="OIC" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
          <div class="brand-fallback" style="display:none">OIC</div>
          <div class="sidebar-brand-text">
            <strong>${escapeHtml(settings().platformName)}</strong>
            <span>Office Ivoirien des Chargeurs</span>
          </div>
        </div>
        <nav class="sidebar-nav">
          ${sections.map((section) => `
            <div class="sidebar-section">
              <div class="sidebar-section-label">${section.label}</div>
              ${section.items.map((item) => (
                item.action
                  ? `<a class="nav-link" href="#" data-nav-action="${item.action}">${icon(item.icon, { size: 16 })}<span>${item.label}</span></a>`
                  : `<a class="nav-link ${isActive(item.path, currentPath) ? 'active' : ''}" href="#${item.path}">${icon(item.icon, { size: 16 })}<span>${item.label}</span></a>`
              )).join('')}
            </div>
          `).join('')}
        </nav>
        <div class="sidebar-note">${icon('shield', {size:22})}<strong>Un transport traçable</strong><p>Du document à la route, chaque étape de votre DUT est enregistrée.</p><span class="badge badge-accent" style="margin-top:12px">Espace de démonstration</span></div>
        <div class="sidebar-footer">
          <span class="avatar-round">${initials(user.name)}</span>
          <div class="sidebar-user">
            <strong>${escapeHtml(user.name)}</strong>
            <span>${ROLE_LABELS[user.role] || user.role}</span>
          </div>
          <button type="button" class="icon-btn-ghost" id="btn-logout" aria-label="Se déconnecter" title="Se déconnecter">
            ${icon('logout', { size: 17 })}
          </button>
        </div>
      </aside>
      <header class="topbar">
        <div class="row" style="gap:var(--s2)">
          <button type="button" class="icon-btn-ghost" id="btn-menu" aria-label="Ouvrir le menu" style="color:var(--text-secondary);display:none">${icon('menu', { size: 20 })}</button>
          <nav class="breadcrumb" id="breadcrumb"></nav>
        </div>
        <div class="header-search">${icon('search',{size:17})}<input id="global-search" aria-label="Rechercher un DUT, véhicule ou trajet" placeholder="Rechercher un DUT, véhicule…" autocomplete="off"><kbd>/</kbd><div class="search-results" id="search-results" role="region" aria-live="polite" aria-label="Résultats de recherche"></div></div>
        <div class="topbar-right">
          <button type="button" class="icon-btn-ghost" id="theme-toggle" aria-label="Changer le thème" title="Thème clair / sombre">${icon('sun',{size:21})}</button>
          <div style="position:relative"><button type="button" class="icon-btn-ghost" id="priority-toggle" aria-label="Voir les priorités" aria-expanded="false" title="Priorités">${icon('bell',{size:21})}</button><div id="priority-results" class="search-results" style="left:auto;right:0" hidden></div></div>
          <div class="topbar-profile"><div><strong>${escapeHtml(user.name)}</strong><small>${ROLE_LABELS[user.role] || user.role}</small></div><span class="avatar-round">${initials(user.name)}</span></div>
        </div>
      </header>
      <main class="main-content" id="main-content"></main>
      <footer class="app-footer">
        <span>${escapeHtml(settings().platformName)} — Proof of Concept de démonstration · v1.0</span>
        <span>${settings().supportEmail ? `Assistance : ${escapeHtml(settings().supportEmail)} · ` : ''}© ${new Date().getFullYear()} Office Ivoirien des Chargeurs</span>
      </footer>
    </div>
  `;

  renderBreadcrumb(breadcrumbItems);
  const themeButton = root.querySelector('#theme-toggle');
  const paintTheme = () => { themeButton.innerHTML = icon(document.documentElement.dataset.theme === 'dark' ? 'moon' : 'sun', {size:21}); themeButton.setAttribute('aria-label', document.documentElement.dataset.theme === 'dark' ? 'Activer le thème clair' : 'Activer le thème sombre'); };
  paintTheme();
  themeButton.addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme; writeObject('dut_theme', theme); paintTheme();
  });
  const search = root.querySelector('#global-search');
  const results = root.querySelector('#search-results');
  search.addEventListener('input', () => {
    results.hidden = false;
    if (!search.value.trim()) { results.innerHTML = ''; return; }
    const matches = searchDocuments(user, search.value);
    results.innerHTML = matches.map(d => `<a href="${documentUrl(user,d)}"><strong>${escapeHtml(d.dutNumber || 'Dossier · ' + (d.general?.immatriculation || 'Sans véhicule'))}</strong><small>${escapeHtml(d.general?.transporterName || 'À compléter')} · ${escapeHtml(d.trajet?.dechargement?.ville || 'Destination à compléter')}</small></a>`).join('') || '<p>Aucun dossier ne correspond à votre recherche.</p>';
  });
  root.addEventListener('keydown', event => {
    if (event.key === '/' && !event.target.matches('input,textarea,select,[contenteditable]')) { event.preventDefault(); search.focus(); }
    if (event.key === 'Escape') { results.hidden = true; root.querySelector('#priority-results').hidden = true; root.querySelector('#priority-toggle').setAttribute('aria-expanded','false'); }
  }, { signal: shellEvents.signal });
  root.querySelector('#priority-toggle').addEventListener('click', () => {
    const box = root.querySelector('#priority-results'); box.hidden = !box.hidden;
    root.querySelector('#priority-toggle').setAttribute('aria-expanded',String(!box.hidden));
    box.innerHTML = '<p><strong>Dossiers à traiter</strong></p>' + (computeInsights(visibleDuts(user)).priority.slice(0,5).map(d=>`<a href="${documentUrl(user,d)}">${escapeHtml(d.dutNumber || d.general?.transporterName || 'Brouillon')}<small>${escapeHtml(d.general?.immatriculation || 'Véhicule à renseigner')} · ${d.waitingDays} j depuis la création / soumission</small></a>`).join('') || '<p>Aucune priorité en cours.</p>');
  });
  root.addEventListener('click', event => {
    if (!event.target.closest('.header-search')) results.hidden = true;
    if (!event.target.closest('#priority-toggle, #priority-results')) { root.querySelector('#priority-results').hidden = true; root.querySelector('#priority-toggle').setAttribute('aria-expanded','false'); }
  }, { signal: shellEvents.signal });

  root.querySelector('[data-nav-action="new-dut"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    const dut = createDraft(user);
    sessionStorage.setItem('dut_wizard_draft_id', dut.id);
    navigate('/dut/new/1');
  });

  root.querySelector('#btn-logout').addEventListener('click', () => {
    logout();
    navigate('/login');
  });
  const sidebar = root.querySelector('#sidebar');
  const backdrop = root.querySelector('#sidebar-backdrop');
  const menuBtn = root.querySelector('#btn-menu');
  const toggleSidebar = (open) => {
    sidebar.classList.toggle('open', open);
    backdrop.classList.toggle('open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
  };
  menuBtn.setAttribute('aria-expanded', String(window.matchMedia('(min-width: 961px)').matches));
  menuBtn.addEventListener('click', () => {
    if (window.matchMedia('(min-width: 961px)').matches) { const collapsed = root.querySelector('.app-shell').classList.toggle('nav-collapsed'); menuBtn.setAttribute('aria-expanded', String(!collapsed)); }
    else toggleSidebar(!sidebar.classList.contains('open'));
  });
  backdrop.addEventListener('click', () => toggleSidebar(false));
  if (window.matchMedia('(max-width: 960px)').matches) menuBtn.style.display = 'flex';

  return root.querySelector('#main-content');
}

export function renderBreadcrumb(items) {
  const el = document.getElementById('breadcrumb');
  if (!el) return;
  el.innerHTML = items.map((label, i) => {
    const isLast = i === items.length - 1;
    return `${i > 0 ? `<span class="crumb-sep">${icon('chevronRight', { size: 13 })}</span>` : ''}<span class="${isLast ? 'crumb-current' : ''}">${escapeHtml(label)}</span>`;
  }).join('');
}

export function renderLoginShell() {
  shellEvents?.abort();
  appRoot().innerHTML = `
    <div class="auth-page auth-blue">
      <section class="auth-visual" aria-label="Document Unique de Transport">
        <div class="auth-wordmark"><img src="assets/images/oic-officiel.jpeg" alt="Office Ivoirien des Chargeurs"><span>DOCUMENT UNIQUE DE TRANSPORT</span></div>
        <div class="auth-visual-heading"><span class="overline">Le transport en toute confiance</span><h1>Votre DUT, simplifié.<br>Vos transports, sécurisés.</h1><p>Créez, suivez et vérifiez vos documents de transport<br>dans un espace unique.</p></div>
        <img class="auth-illustration" src="assets/images/dut-transport-illustration.png" alt="Camion de marchandises, document de transport vérifié et itinéraire de livraison">
        <div class="auth-assurance"><span>${icon('file',{size:18})} Un document unique</span><span>${icon('shield',{size:18})} Une traçabilité complète</span><span>${icon('truck',{size:18})} Un transport suivi</span></div>
      </section>
      <div class="auth-form-panel"><div class="auth-card" id="auth-card"></div><p class="auth-copyright">© ${new Date().getFullYear()} Office Ivoirien des Chargeurs</p></div>
    </div>
  `;
  return document.getElementById('auth-card');
}

export function renderControlShell(user) {
  shellEvents?.abort();
  appRoot().innerHTML = `
    <div class="control-page">
      <div class="control-topbar">
        <div class="row" style="gap:8px">
          <img class="control-brand-logo" src="assets/images/oic-officiel.jpeg" alt="OIC">
          <strong>DUT Contrôle OIC</strong>
        </div>
        <button type="button" class="icon-btn-ghost" id="btn-logout-control" aria-label="Se déconnecter" style="color:rgba(255,255,255,.7)">${icon('logout', { size: 18 })}</button>
      </div>
      <div class="flag-strip"></div>
      <div class="control-body" id="control-body"></div>
    </div>
  `;
  document.getElementById('btn-logout-control').addEventListener('click', () => {
    logout();
    navigate('/login');
  });
  return document.getElementById('control-body');
}
