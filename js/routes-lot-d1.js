// Lot d1 : routes des comptes et acteurs (déclarées depuis app.js par un seul bloc).
import * as accountView from './views/account.view.js';
import * as signupView from './views/transporter-signup.view.js';
import * as companyView from './views/company.view.js';
import * as actorsView from './views/actors-admin.view.js';
import * as adminView from './views/admin.view.js?v=settings2';
import { D1_ADMIN_TABS } from './views/admin-d1.view.js';

export function registerLotD1Routes({ registerRoute, withShell, renderLoginShell }) {
  const publicPage = (fn) => (params) => fn(renderLoginShell(), params);
  // Espace public : activation, mot de passe oublié, boîte de réception simulée, inscription transporteur.
  registerRoute('/activation', publicPage(accountView.renderActivation), { public: true });
  registerRoute('/activation/:code', publicPage(accountView.renderActivation), { public: true });
  registerRoute('/mot-de-passe-oublie', publicPage(accountView.renderForgot), { public: true });
  registerRoute('/boite-de-reception', publicPage(accountView.renderInbox), { public: true });
  registerRoute('/boite-de-reception/:address', publicPage(accountView.renderInbox), { public: true });
  registerRoute('/inscription-transporteur', publicPage(signupView.render), { public: true });
  // Tous les rôles connectés.
  registerRoute('/mon-profil', withShell({ render: accountView.renderProfile }, ['Mon compte', 'Mon profil']));
  registerRoute('/mes-messages', withShell({ render: accountView.renderMyMessages }, ['Mon compte', 'Mes messages']));
  // Partenaire habilité (administrateur) et transporteur.
  registerRoute('/entreprise', withShell({ render: companyView.renderCompany }, ['Mon entreprise', 'Fiche']), { permission: 'company.profile' });
  registerRoute('/entreprise/utilisateurs', withShell({ render: companyView.renderCompanyUsers }, ['Mon entreprise', 'Utilisateurs']), { permission: 'company.users' });
  registerRoute('/entreprise/activite', withShell({ render: companyView.renderActivity }, ['Mon entreprise', 'Activité des agents']), { permission: 'company.activity' });
  registerRoute('/entreprise/vehicules', withShell({ render: companyView.renderFleet }, ['Mon entreprise', 'Véhicules']), { permission: 'fleet.declare' });
  // Administrateur OIC : acteurs et onglets ajoutés à l'administration existante.
  registerRoute('/oic/acteurs', withShell({ render: (root) => actorsView.render(root, {}) }, ['OIC', 'Acteurs']), { permission: 'partners.manage' });
  registerRoute('/oic/acteurs/:section', withShell({ render: (root, p) => actorsView.render(root, p) }, (p) => ['OIC', 'Acteurs', { partenaires: 'Partenaires', transporteurs: 'Transporteurs', demandes: 'Demandes à valider', import: 'Import' }[p.section] || 'Acteurs']), { permission: 'partners.manage' });
  registerRoute('/oic/acteurs/:section/:id', withShell({ render: (root, p) => actorsView.render(root, p) }, ['OIC', 'Acteurs', 'Fiche']), { permission: 'partners.manage' });
  const ADMIN_PERM = { habilitations: 'admin.manage', groupements: 'admin.manage', messages: 'messages.journal' };
  for (const [section] of D1_ADMIN_TABS) registerRoute(`/admin/${section}`, withShell({ render: (root) => adminView.render(root, { section }) }, ['OIC', 'Administration']), { permission: ADMIN_PERM[section] });
}
