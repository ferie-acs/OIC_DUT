// Lot d1 : habilitations consultables et paramétrables dans une limite sûre, et liste des groupements.
import { AUDIT_ACTIONS, ROLE_LABELS, ORG_STATUS_LABELS } from '../core/constants.js';
import { basePermissions, effectivePermissions, grantRefusal, removalRefusal } from '../core/permissions.js';
import { readHabilitations, writeHabilitations, partnersStore, transportersStore, antennasStore, applicationsRepo, usersStore } from '../repositories/actors.repository.js';
import { actorWith, trace, reason as cleanReason } from './d1-common.service.js';
import { statusOf } from './org-lifecycle.js';

/** Catalogue lisible des droits de la plateforme DUT, par famille. */
export const PERMISSION_CATALOG = [
  ['Tableaux de bord', [['dashboard.partner', 'Tableau de bord partenaire'], ['dashboard.antenna', 'Tableau de bord antenne'], ['dashboard.oic', 'Tableau de bord national'], ['dashboard.transporteur', 'Tableau de bord transporteur']]],
  ['Saisie des DUT', [['dut.view', 'Consulter les DUT'], ['dut.create', 'Créer un DUT'], ['dut.edit_draft', 'Modifier un brouillon'], ['dut.submit', 'Soumettre un DUT'], ['dut.print', 'Imprimer un DUT']]],
  ['Validation et décisions', [['dut.validate', 'Valider un DUT'], ['dut.reject', 'Rejeter un DUT'], ['dut.suspend', 'Suspendre un DUT'], ['dut.unsuspend', 'Lever une suspension'], ['dut.withdraw', 'Retirer un DUT'], ['actors.validate', 'Valider partenaires, transporteurs et véhicules']]],
  ['Contrôle routier', [['control.scan', 'Scanner un DUT'], ['control.verify', 'Vérifier un DUT'], ['control.log', 'Enregistrer un contrôle']]],
  ['Ressources', [['operations.view', 'Consulter les plages'], ['operations.request', 'Demander une plage'], ['referentials.manage', 'Gérer les référentiels de saisie'], ['antennas.view', 'Carte des antennes'], ['partners.view', 'Consulter les partenaires']]],
  ['Entreprise', [['company.profile', 'Fiche de l’entreprise'], ['company.users', 'Utilisateurs de l’entreprise'], ['company.activity', 'Activité des agents'], ['fleet.declare', 'Déclarer des véhicules']]],
  ['Pilotage OIC', [['reporting.view', 'Rapports'], ['stats.view', 'Statistiques'], ['anomalies.view', 'Anomalies']]],
  ['Administration', [['admin.manage', 'Administration de la plateforme'], ['habilitations.manage', 'Paramétrer les habilitations'], ['partners.manage', 'Gérer les partenaires'], ['transporters.manage', 'Gérer les transporteurs'], ['messages.journal', 'Journal des messages envoyés']]],
];
// Intégration des lots d2 à d5 : libellés des droits ajoutés (la matrice n'affiche plus d'identifiants techniques).
PERMISSION_CATALOG.push(
  ['Cycle du DUT', [['dut.transship', 'Transborder un DUT'], ['dut.counter', 'Saisir un DUT au guichet'], ['dut.pay_reference', 'Régler un DUT par référence'], ['dut.archive', 'Contrôler et archiver un DUT'], ['archives.view', 'Consulter les archives'], ['references.view', 'Consulter son stock de références'], ['control.driver_search', 'Rechercher par conducteur'], ['control.history', 'Historique de ses contrôles']]],
  ['Réseau et numéros', [['antennas.manage', 'Gérer les antennes'], ['sites.view', 'Consulter les sites'], ['sites.manage', 'Gérer les sites'], ['ranges.stock', 'Consulter le stock de numéros'], ['ranges.allocate', 'Approvisionner une antenne'], ['ranges.transfer', 'Vendre une plage'], ['ranges.validate', 'Valider une vente de plage'], ['ranges.revoke', 'Reprendre une plage'], ['ranges.settings', 'Fixer les tarifs des plages']]],
  ['Caisse', [['payments.view', 'Consulter les paiements'], ['payments.record', 'Saisir un encaissement'], ['payments.validate', 'Valider un encaissement'], ['payments.desk', 'Écran des encaissements'], ['payments.pay', 'Payer en ligne (simulé)'], ['sales.report', 'Rapport des ventes'], ['reconciliation.view', 'Consulter le rapprochement'], ['reconciliation.justify', 'Justifier un écart de rapprochement']]],
  ['Exploitation', [['incidents.declare', 'Déclarer un incident'], ['incidents.read', 'Consulter tous les incidents'], ['incidents.treat', 'Traiter un incident attribué'], ['incidents.manage', 'Qualifier, attribuer et clore les incidents'], ['fieldreports.view', 'Consulter les remontées du terrain'], ['fieldreports.submit', 'Transmettre une remontée'], ['fieldreports.manage', 'Décider des remontées'], ['equipment.view', 'Consulter les équipements'], ['equipment.read', 'Consulter le parc national'], ['equipment.manage', 'Gérer les équipements'], ['equipment.retire', 'Réformer un équipement'], ['exchanges.view', 'Consulter les échanges'], ['exchanges.partner', 'Échanger avec l’OIC'], ['exchanges.manage', 'Piloter les échanges partenaires']]],
  ['Pilotage de la Direction', [['pilotage.view', 'Suivi des antennes'], ['pilotage.report', 'Rapport périodique'], ['objectives.manage', 'Préparer les contrats d’objectifs'], ['objectives.validate', 'Valider les contrats d’objectifs'], ['objectives.results', 'Saisir les résultats'], ['actions.manage', 'Décider des actions correctives'], ['actions.follow', 'Suivre les actions correctives'], ['agents.manage', 'Gérer les fiches agents'], ['agents.evaluate', 'Évaluer les agents'], ['documents.view', 'Consulter les documents'], ['documents.manage', 'Déposer des documents'], ['documents.validate', 'Valider les documents'], ['meetings.manage', 'Réunions et décisions'], ['legal.view', 'Consulter les contrats'], ['legal.manage', 'Rédiger les contrats'], ['legal.visa', 'Viser les contrats'], ['legal.validate_final', 'Validation finale des contrats'], ['partners.evaluate', 'Évaluer les partenaires']]],
);
const KNOWN = new Map(PERMISSION_CATALOG.flatMap(([, list]) => list));
export const permissionLabel = (p) => KNOWN.get(p) || p;

/** Matrice rôle × droit : état effectif, origine (base / ajout / retrait) et possibilité de modifier. */
export function habilitationMatrix() {
  actorWith('admin.manage');
  const overrides = readHabilitations();
  const extra = [...new Set(Object.keys(ROLE_LABELS).flatMap((r) => basePermissions(r)).filter((p) => !KNOWN.has(p)))];
  const catalog = extra.length ? [...PERMISSION_CATALOG, ['Autres droits', extra.map((p) => [p, p])]] : PERMISSION_CATALOG;
  return {
    roles: Object.entries(ROLE_LABELS).map(([id, label]) => ({ id, label })),
    catalog: catalog.map(([family, list]) => ({
      family,
      permissions: list.map(([id, label]) => ({
        id, label,
        cells: Object.keys(ROLE_LABELS).map((role) => {
          const base = basePermissions(role).includes(id);
          const effective = effectivePermissions(role).includes(id);
          const lock = effective ? removalRefusal(role, id) : grantRefusal(role, id, effectivePermissions(role));
          return { role, base, effective, changed: base !== effective, locked: lock };
        }),
      })),
    })),
    modified: Object.values(overrides).some((o) => (o.add || []).length || (o.remove || []).length),
  };
}

/** Ajoute ou retire un droit à un rôle, avec motif ; les combinaisons non sûres sont refusées. */
export function setPermission(role, permission, granted, motif) {
  const actor = actorWith('habilitations.manage');
  if (!ROLE_LABELS[role]) throw new Error('Rôle inconnu.');
  if (!KNOWN.has(permission) && !basePermissions(role).includes(permission)) throw new Error('Droit inconnu.');
  const why = cleanReason(motif);
  const current = effectivePermissions(role);
  if (granted === current.includes(permission)) throw new Error('Aucun changement.');
  const refusal = granted ? grantRefusal(role, permission, current) : removalRefusal(role, permission);
  if (refusal) throw new Error(refusal);
  const all = readHabilitations();
  const o = { add: [...(all[role]?.add || [])], remove: [...(all[role]?.remove || [])] };
  const base = basePermissions(role).includes(permission);
  if (granted) { o.remove = o.remove.filter((p) => p !== permission); if (!base) o.add.push(permission); }
  else { o.add = o.add.filter((p) => p !== permission); if (base) o.remove.push(permission); }
  all[role] = o;
  writeHabilitations(all);
  trace(AUDIT_ACTIONS.HABILITATIONS_UPDATED, { actor, entity: 'ROLE', entityId: role, entityLabel: ROLE_LABELS[role], note: `${granted ? 'Ajout' : 'Retrait'} : ${permissionLabel(permission)} — ${why}` });
  return effectivePermissions(role);
}

export function resetHabilitations(motif) {
  const actor = actorWith('habilitations.manage');
  const why = cleanReason(motif);
  writeHabilitations({});
  trace(AUDIT_ACTIONS.HABILITATIONS_UPDATED, { actor, entity: 'ROLE', entityLabel: 'Tous les rôles', note: `Droits par défaut rétablis — ${why}` });
}

// ------------------------------------------------------------------ Groupements
export const GROUP_TYPES = { PARTENAIRE: 'Partenaire habilité', TRANSPORTEUR: 'Transporteur', ANTENNE: 'Antenne OIC' };

export function listGroupements({ type = '', status = '', query = '' } = {}) {
  actorWith('admin.manage');
  const users = usersStore.getAll();
  const count = (key, id) => users.filter((u) => u[key] === id).length;
  const rows = [
    ...partnersStore.getAll().map((p) => ({ id: p.id, type: 'PARTENAIRE', name: p.name, rccm: p.rccm || '', email: p.email || '', city: p.city || p.antennaName || '', status: statusOf(p), comptes: count('partnerId', p.id), since: p.validatedAt || p.createdAt || '', link: `#/oic/acteurs/partenaires/${p.id}` })),
    ...transportersStore.getAll().map((t) => ({ id: t.id, type: 'TRANSPORTEUR', name: t.name, rccm: t.rccm || t.registre || '', email: t.email || '', city: t.city || t.adresse || '', status: statusOf(t), comptes: count('transporterId', t.id), since: t.validatedAt || t.createdAt || '', link: `#/oic/acteurs/transporteurs/${t.id}`, parentId: t.parentId || null })),
    ...applicationsRepo.getAll().filter((a) => a.status !== 'VALIDEE').map((a) => ({ id: a.id, type: 'TRANSPORTEUR', name: a.name, rccm: a.rccm, email: a.email, city: a.city, status: a.status === 'REFUSEE' ? 'REFUSE' : 'EN_ATTENTE', comptes: 0, since: a.createdAt, link: '#/oic/acteurs/demandes' })),
    ...antennasStore.getAll().map((a) => ({ id: a.id, type: 'ANTENNE', name: a.name, rccm: '', email: a.chef?.email || '', city: a.city || '', status: 'ACTIF', comptes: count('antennaId', a.id), since: '', link: `#/oic/antennas/${a.id}` })),
  ];
  const q = query.trim().toLowerCase();
  return rows.filter((r) => (!type || r.type === type) && (!status || r.status === status) && (!q || `${r.name} ${r.rccm} ${r.email} ${r.city}`.toLowerCase().includes(q)))
    .map((r) => ({ ...r, typeLabel: GROUP_TYPES[r.type], statusLabel: ORG_STATUS_LABELS[r.status] || r.status }))
    .sort((a, b) => a.typeLabel.localeCompare(b.typeLabel, 'fr') || a.name.localeCompare(b.name, 'fr'));
}

export function groupementsCsv(rows) {
  const cell = (v) => { const s = v == null ? '' : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = ['Type', 'Nom', 'RCCM', 'E-mail', 'Ville', 'État', 'Comptes', 'Depuis'];
  return [head.join(';'), ...rows.map((r) => [r.typeLabel, r.name, r.rccm, r.email, r.city, r.statusLabel, r.comptes, r.since ? r.since.slice(0, 10) : ''].map(cell).join(';'))].join('\n');
}
