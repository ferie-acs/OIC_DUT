import { syncAntennaDirectory } from './services/antenna-directory.service.js';
import * as adminView from './views/admin.view.js';
import * as planningView from './views/planning.view.js?v=finder2';
import * as actionCenterView from './views/action-center.view.js?v=charte';
import { decorateKpis } from './views/kpi-trends.view.js';
import { registerRoute, startRouter, getCurrentPath, setNotFoundHandler, navigate } from './core/router.js';
import { mountInsights } from './views/insights.view.js?v=oic-blue';
import { icon } from './core/icons.js';
import { getCurrentUser } from './core/auth.js';
import { renderAppShell, renderLoginShell, renderControlShell } from './core/layout.js?v=supervision3';
import { isSeeded, seedDemoData, ensureSignedDemoData, refreshExpiredDemoSignatures } from './seed.js';
import { registerServiceWorker, mountInstallButton } from './core/pwa.js';
import { watchCards } from './core/card-icons.js';

import * as loginView from './views/login.view.js?v=oic-blue';
import * as partnerDashboardView from './views/partner-dashboard.view.js?v=oic-blue';
import * as operationsView from './views/operations.view.js';
import * as referentialsView from './views/referentials.view.js';
import * as antennasMapView from './views/antennas-map.view.js?v=fiche';
import * as dutFormView from './views/dut-form.view.js?v=dut-v3';
import * as dutListView from './views/dut-list.view.js';
import * as dutDetailView from './views/dut-detail.view.js?v=dut-v2';
import * as antennaDashboardView from './views/antenna-dashboard.view.js';
import * as antennaReviewView from './views/antenna-review.view.js?v=dut-v2';
import * as controlView from './views/control.view.js?v=charte';
import * as oicDashboardView from './views/oic-dashboard.view.js?v=charts';
import * as transporteurDashboardView from './views/transporteur-dashboard.view.js?v=oic-blue';
import * as decouvrirView from './views/decouvrir.view.js';
import * as supervisionView from './views/supervision.view.js';
import * as statisticsView from './views/statistics.view.js';

// Une démo ensemencée avant ce lot est régénérée (données locales uniquement).
if (!isSeeded()) {
  Object.keys(localStorage).filter((k) => k.startsWith('dut_')).forEach((k) => localStorage.removeItem(k));
  seedDemoData();
}
// Sans Web Crypto (page servie hors contexte sécurisé), l'application démarre quand même :
// le contrôle affichera « signature non vérifiable » et la validation refusera de signer.
try {
  await ensureSignedDemoData();
  await refreshExpiredDemoSignatures();
} catch (err) {
  console.error('Signature de démonstration indisponible :', err);
}
syncAntennaDirectory();

function withShell(view, breadcrumb) {
  return (params) => {
    const user = getCurrentUser();
    const crumbs = typeof breadcrumb === 'function' ? breadcrumb(params) : breadcrumb;
    const main = renderAppShell(user, getCurrentPath(), crumbs);
    view.render(main, params);
    if (getCurrentPath().endsWith('/dashboard')) { decorateKpis(main, user); mountInsights(main); actionCenterView.mountActionSummary(main, user); }
  };
}

registerRoute('/login', () => {
  const el = renderLoginShell();
  loginView.render(el);
}, { public: true });

for (const section of ['users','roles','settings','audit']) registerRoute('/admin/'+section, withShell({render:root=>adminView.render(root,{section})}, ['OIC','Administration']), {permission:'admin.manage'});

// Aucune permission : l'explication du DUT est accessible à tous les rôles connectés.
registerRoute('/decouvrir', withShell(decouvrirView, ['Découvrir', 'Comment fonctionne le DUT']));

registerRoute('/planning', withShell(planningView, ['Pilotage', 'Planning des trajets']), { permission: 'dut.view' });
registerRoute('/actions', withShell(actionCenterView, ['Pilotage', 'Centre d’actions']), { permission: 'dut.view' });
registerRoute('/oic/operations', withShell(operationsView, ['OIC', 'Demandes de plages']), { permission: 'dashboard.oic' });

registerRoute('/partner/dashboard', withShell(partnerDashboardView, ['Partenaire', 'Tableau de bord']), { permission: 'dashboard.partner' });
registerRoute('/partner/dut', withShell(dutListView, ['Partenaire', 'Mes DUT']), { permission: 'dut.view' });
registerRoute('/partner/operations', withShell(operationsView, ['Partenaire', 'Opérations & plages']), { permission: 'operations.view' });
registerRoute('/partner/referentials', withShell(referentialsView, ['Partenaire', 'Référentiels']), { permission: 'referentials.manage' });
registerRoute('/oic/antennas', withShell(antennasMapView, ['OIC', 'Carte des antennes']), { permission: 'dashboard.oic' });
registerRoute('/oic/antennas/:id', withShell({ render: (root, p) => supervisionView.render(root, { actor: 'antennes', id: p.id }) }, ['OIC', 'Antennes', 'Fiche']), { permission: 'dashboard.oic' });
registerRoute('/oic/statistiques', withShell(statisticsView, ['OIC', 'Statistiques']), { permission: 'dashboard.oic' });
registerRoute('/oic/statistiques/:tab', withShell(statisticsView, ['OIC', 'Statistiques']), { permission: 'dashboard.oic' });
registerRoute('/oic/comparateur', () => navigate('/oic/supervision/antennes'), { permission: 'dashboard.oic' });
registerRoute('/oic/supervision', withShell(supervisionView, ['OIC', 'Supervision']), { permission: 'dashboard.oic' });
registerRoute('/oic/supervision/:actor', withShell(supervisionView, ['OIC', 'Supervision']), { permission: 'dashboard.oic' });
registerRoute('/oic/supervision/:actor/:id', withShell(supervisionView, ['OIC', 'Supervision', 'Fiche']), { permission: 'dashboard.oic' });
registerRoute('/partner/antennas', withShell(antennasMapView, ['Partenaire', 'Carte des antennes']), { permission: 'antennas.view' });

registerRoute('/dut/new/:step', withShell(dutFormView, ['Partenaire', 'Nouveau DUT']), { permission: 'dut.create' });
registerRoute('/dut/:id/:section', withShell(dutDetailView, ['DUT', 'Suivi du dossier']), { permission: 'dut.view' });
registerRoute('/dut/:id', withShell(dutDetailView, ['DUT', 'Détail']), { permission: 'dut.view' });

registerRoute('/antenna/dashboard', withShell(antennaDashboardView, ['Antenne', 'Tableau de bord']), { permission: 'dashboard.antenna' });
registerRoute('/antenna/dut/:id', withShell(antennaReviewView, ['Antenne', 'Revue DUT']), { permission: 'dashboard.antenna' });

registerRoute('/oic/dashboard', withShell(oicDashboardView, ['OIC', 'Dashboard national']), { permission: 'dashboard.oic' });

registerRoute('/transporteur/dashboard', withShell(transporteurDashboardView, ['Transporteur', 'Tableau de bord']), { permission: 'dashboard.transporteur' });

registerRoute('/control', (params) => {
  const el = renderControlShell(getCurrentUser());
  controlView.render(el, params);
}, { permission: 'control.scan' });
registerRoute('/control/result/:token', (params) => {
  const el = renderControlShell(getCurrentUser());
  controlView.render(el, params);
}, { permission: 'control.scan' });

setNotFoundHandler(({ reason }) => {
  const user = getCurrentUser();
  const title = reason === 'forbidden' ? 'Accès refusé' : 'Page introuvable';
  const text = reason === 'forbidden'
    ? 'Votre rôle ne dispose pas des permissions nécessaires pour accéder à cette page.'
    : 'Cette page n’existe pas ou son lien est incorrect.';
  const main = user ? renderAppShell(user, getCurrentPath(), ['Erreur']) : renderLoginShell();
  main.innerHTML = `
    <div class="empty-state" style="min-height:50vh">
      ${icon('alertTriangle', { size: 44 })}
      <h3>${title}</h3>
      <p>${text}</p>
      <button type="button" class="btn btn-primary" id="btn-back-home">Retour</button>
    </div>
  `;
  const homeByRole = {
    PARTNER_ADMIN: '/partner/dashboard', PARTNER_EDITOR: '/partner/dashboard', ANTENNA_AGENT: '/antenna/dashboard',
    OIC_ADMIN: '/oic/dashboard', CONTROLLER: '/control', TRANSPORTEUR: '/transporteur/dashboard',
  };
  main.querySelector('#btn-back-home').addEventListener('click', () => navigate(user ? (homeByRole[user.role] || '/login') : '/login'));
});

startRouter();
// Chaque carte reçoit en fond sa propre icône, en grand et grisée.
watchCards(document.getElementById('app') || document.body);

// Application installable et utilisable hors ligne (coquille en cache ; les données restent locales).
mountInstallButton();
registerServiceWorker();
