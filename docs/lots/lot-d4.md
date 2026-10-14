# Lot d4 : incidents, remontées du terrain, équipements, échanges avec les partenaires

Plateforme DUT. Ce document décrit ce que le lot d4 ajoute au POC : écrans, règles métier, comptes et parcours de démonstration, points à reprendre après fusion et limites assumées.

## Démarches traitées

| Id | Démarche | Résultat |
|---|---|---|
| 70 | Remonter besoins et difficultés terrain (Antenne OIC) | Fait |
| 98 | Déclarer, qualifier et attribuer un incident (côté DUT) | Fait |
| 99 | Traiter, clôturer et surveiller les incidents | Fait (alerte interne ; envoi de courriel à brancher après fusion) |
| 100 | Suivre les incidents de performance | Fait (lenteurs déclarées par les utilisateurs ; aucune mesure automatique) |
| 121 | Recenser, affecter et dépanner les équipements | Fait |
| 125 | Échanger informations et remontées avec les partenaires | Fait |

Les incidents de la plateforme sont distincts des incidents de transport, qui restent déclarés dans le dossier de chaque DUT (`workspace.service.js`, inchangé).

## Écrans ajoutés

| Route | Écran | Droit (moteur existant) | Rôles | Entrée de menu |
|---|---|---|---|---|
| `/incidents` | Liste des incidents, déclaration | `incidents.declare` | Partenaire (admin, éditeur), agent d'antenne, administrateur OIC, transporteur | Assistance, Terrain ou Exploitation › Incidents |
| `/incidents/:id` | Fiche d'incident : qualification, attribution, suivi, résolution, clôture, historique | `incidents.declare` (les actions sont filtrées par le service) | idem | — |
| `/lenteurs` | Suivi des lenteurs (incidents de performance) | `incidents.manage` | Administrateur OIC | Exploitation › Suivi des lenteurs |
| `/remontees`, `/remontees/:id` | Remontées du terrain : liste, nouvelle remontée, échanges, décision, clôture | `fieldreports.view` | Agent d'antenne, administrateur OIC | Terrain ou Exploitation › Remontées du terrain |
| `/equipements`, `/equipements/:id` | Inventaire, fiche, affectation, panne, dépannage | `equipment.view` | Agent d'antenne, administrateur OIC | Terrain ou Exploitation › Équipements |
| `/echanges`, `/echanges/:id` | Fils d'échange OIC ↔ partenaire | `exchanges.view` | Partenaire admin, administrateur OIC | Assistance › Échanges avec l'OIC ; Exploitation › Échanges partenaires |

Aucun nouveau rôle n'est créé. Les écrans reprennent les gabarits de l'écran Supervision (en-tête, KPI, carte tableau, fiche en deux colonnes, frise d'historique) et les fenêtres modales existantes.

### Droits ajoutés (bloc « Lot d4 » de `js/core/permissions.js`)

| Rôle | Droits |
|---|---|
| `PARTNER_ADMIN` | `incidents.declare`, `exchanges.view`, `exchanges.partner` |
| `PARTNER_EDITOR` | `incidents.declare` |
| `ANTENNA_AGENT` | `incidents.declare`, `incidents.treat`, `fieldreports.view`, `fieldreports.submit`, `equipment.view`, `equipment.manage` |
| `OIC_ADMIN` | `incidents.declare`, `incidents.treat`, `incidents.manage`, `fieldreports.view`, `fieldreports.manage`, `equipment.view`, `equipment.manage`, `equipment.retire`, `exchanges.view`, `exchanges.manage` |
| `TRANSPORTEUR` | `incidents.declare` |

Après fusion avec le lot d5, le rôle « Direction générale et pilotage » (`ROLES.DIRECTION`) pourra recevoir `fieldreports.view` et `fieldreports.manage` (pilotage des remontées), et `incidents.declare` pour consulter les incidents.

## Règles métier

### Incidents de la plateforme

- Catégories : applicatif, réseau et connexion, matériel, performance (lenteur), procédure. Pièces jointes enregistrées en métadonnées seulement (nom, type, taille), affichées comme telles à l'écran.
- Cycle : Déclaré → Qualifié → Attribué → En traitement → Résolu (à vérifier) → Clos. Chaque étape est inscrite dans l'historique de l'incident et dans le journal d'audit existant.
- Qualification (administrateur OIC) : gravité, impact, catégorie. La gravité fixe le délai cible, compté depuis la déclaration : critique 4 h, majeure 24 h, mineure 72 h (repères de démonstration, à fixer par l'OIC).
- Attribution (administrateur OIC, après qualification) : une équipe et un responsable, administrateur OIC ou agent de l'antenne concernée. Un partenaire ou un agent d'une autre antenne est refusé.
- Traitement : le responsable attribué (ou un administrateur OIC) enregistre des suivis puis propose une résolution avec cause et solution.
- Vérification : seul l'administrateur OIC clôt, et seulement un incident résolu dont la cause et la solution sont renseignées. Le déclarant ou l'OIC peut contester la résolution : l'incident repart en traitement.
- Alerte de délai : un incident non résolu dont l'échéance est passée est signalé « délai dépassé » (bandeau, badge, colonne Délai). La surveillance inscrit une alerte unique par incident dans l'historique et dans le journal d'audit (« Délai d'incident dépassé », auteur « Surveillance des délais »). Le délai s'arrête à la résolution proposée.
- Cloisonnement : un agent d'antenne déclare toujours pour sa propre antenne et voit les incidents de son antenne ; un partenaire voit ceux de son entreprise ; un transporteur voit les siens ; l'OIC voit tout.
- Lenteurs : un incident de performance porte l'écran concerné, la durée constatée (1 s à 1 h) et l'heure (pas dans le futur). Le suivi des lenteurs donne, sur 7, 30 ou 90 jours : nombre, durée moyenne et maximale, antennes touchées, répartition par écran, par antenne et par tranche horaire, derniers signalements.

### Remontées du terrain

- L'agent d'antenne transmet une remontée pour son antenne : catégorie, priorité, objet, description.
- Cycle : Transmise → En examen (première réponse du pilotage) → Décision rendue → Clôturée. Décisions possibles : acceptée, planifiée, orientée vers le service compétent, non retenue ; le motif est obligatoire. Une seule décision par remontée ; la clôture exige une décision.
- L'antenne et le pilotage échangent des messages tant que la remontée n'est pas clôturée. L'antenne ne voit que les remontées de son antenne.

### Équipements et mobilité

- Recensement : type (dont véhicule de service et motocyclette), désignation, numéro de série unique, antenne, date d'acquisition (pas dans le futur). Un agent d'antenne ne recense que le matériel de son antenne.
- Affectation : à un agent de l'antenne ou au chef d'antenne de l'annuaire ; retour en stock possible ; historique des affectations conservé.
- Panne : déclarée sur un équipement en service (agent de l'antenne ou OIC), avec ouverture facultative d'un incident matériel lié. Interventions successives (intervenant, action) ; clôture « réparé » (remise en service) ou « irréparable » (réforme, réservée à l'OIC, affectation levée). La clôture du dépannage ajoute une note sur l'incident lié, sans le clore : sa vérification reste à l'OIC.

### Échanges avec les partenaires

- Un fil est rattaché au dossier d'un seul partenaire. L'OIC publie une évolution, une décision ou une information, à un partenaire ou à tous (un fil par partenaire) ; le partenaire admin transmet une difficulté, une proposition ou une question pour sa propre entreprise.
- Suivi des messages non lus de chaque côté ; seul l'OIC clôt un fil ; un fil clos n'accepte plus de message. La fiche côté OIC renvoie à la fiche du partenaire dans la Supervision.
- La simulation est affichée : « Message simulé : aucun courriel n'est envoyé dans cette démonstration ».

## Fonctions de service pour les tableaux de bord (assemblage après fusion)

Ces fonctions ne contrôlent pas la session : le tableau de bord appelant vérifie le droit d'accès et passe le périmètre.

- `incidents.service.js` : `openIncidents({ antennaId })`, `overdueIncidents({ antennaId })`, `incidentsByAntenna()` (ouverts, en retard, critiques par antenne), `incidentAlerts()` (alertes visibles par l'utilisateur connecté, pour la cloche après fusion).
- `equipment.service.js` : `brokenEquipment({ antennaId })`, `equipmentByAntenna()` (recensés, en service, en panne, non affectés, réformés, mobilité).
- `field-reports.service.js` : `openReports({ antennaId })`.
- `partner-exchanges.service.js` : `unreadCount()` (utilisateur connecté).

## Points de branchement de la messagerie (lot d1)

Le POC n'a pas de mécanisme de notification interne : les alertes sont visibles dans les écrans du lot et dans le journal. Les envois simulés seront à brancher, après fusion, aux endroits marqués « Après fusion avec le lot d1 » :

- `incidents.service.js` › `scanDeadlines` : délai dépassé, prévenir le responsable attribué et les administrateurs OIC.
- `incidents.service.js` › `assignIncident` : prévenir le responsable attribué.
- `field-reports.service.js` › `replyToReport` : prévenir l'autre partie.
- `partner-exchanges.service.js` › `startThread`, `replyToThread` : prévenir l'autre partie.

## Données et fichiers

- Nouvelles clés de stockage (bloc « Lot d4 » de `constants.js`) : `dut_platform_incidents_v1`, `dut_field_reports_v1`, `dut_equipment_v1`, `dut_partner_threads_v1`, `dut_lot_d4_seeded_v1`. Nouvelles actions d'audit dans le même bloc.
- Nouveaux fichiers : 4 dépôts (`js/repositories/incidents|field-reports|equipment|partner-exchanges.repository.js`), 5 services (dont `support-common.service.js`), 5 vues (dont `support-ui.js`), `js/seed-lot-d4.js`, `css/lot-d4.css`, `tests/lot-d4.test.mjs`.
- Fichiers partagés modifiés, par blocs « Lot d4 » en fin de liste : `js/app.js` (une ligne d'amorçage, imports et routes), `js/core/layout.js` (menu), `js/core/permissions.js`, `js/core/constants.js`, `js/core/icons.js` (icônes Lucide `wrench`, `monitor`, `messageSquare`, `gauge`, `megaphone`, `send`, `history`, tracés exacts de lucide-static 0.468.0), `index.html` (feuille `css/lot-d4.css`), `precache.json` (régénéré).

## Comptes de démonstration

Mot de passe commun de démonstration (voir `js/seed.js`).

| Compte | Rôle | Usage dans ce lot |
|---|---|---|
| `partner.admin@demo.oic.ci` | Partenaire admin (STFA DEMO) | Déclarer un incident, contester une solution, échanger avec l'OIC |
| `partner.editor@demo.oic.ci` | Partenaire éditeur | Déclarer et suivre les incidents de l'entreprise |
| `antenne.agent@demo.oic.ci` | Agent d'antenne (Abidjan siège) | Incidents de l'antenne, traitement d'un incident attribué, remontées, équipements |
| `oic.admin@demo.oic.ci` | Administrateur OIC | Qualifier, attribuer, clore ; lenteurs ; décider des remontées ; parc national ; communications |
| `transporteur@demo.oic.ci` | Transporteur | Déclarer et suivre ses incidents |

Données préchargées : 15 incidents (dont 10 lenteurs sur 30 jours, 3 en retard, 1 résolu à vérifier, 1 incident matériel lié à l'imprimante en panne), 4 remontées dans les quatre états, 12 équipements dans 5 antennes (1 en panne, 1 véhicule en réparation, 1 réformé), 3 fils d'échange.

## Parcours de démonstration (environ 10 minutes)

1. `partner.admin` › Assistance › Incidents : le bandeau signale l'incident en retard de l'entreprise. « Déclarer un incident » : catégorie Applicatif, objet et description, une pièce jointe → la fiche s'ouvre à l'état « Déclaré ».
2. `oic.admin` › Exploitation › Incidents : bandeau des incidents en retard, filtres par état, catégorie, gravité, antenne. Ouvrir l'incident déclaré → « Qualifier » (gravité Critique, impact Une antenne : l'échéance passe à 4 h) → « Attribuer » (équipe Support applicatif, responsable Fatou Diabaté).
3. `antenne.agent` › Terrain › Incidents : ouvrir l'incident → « Ajouter un suivi » → « Proposer une résolution » (cause, solution).
4. `partner.admin` : ouvrir l'incident « Résolu, à vérifier » ; possibilité de « Contester la solution ». Sinon `oic.admin` › « Vérifier et clore » : l'historique complet et la mention « Résolu dans le délai cible » apparaissent. Chaque étape est aussi inscrite au journal d'audit national (append-only).
5. `oic.admin` › Exploitation › Suivi des lenteurs : écrans les plus lents, antennes touchées, tranches horaires ; changer la période.
6. `antenne.agent` › Terrain › Remontées du terrain › « Nouvelle remontée ». `oic.admin` › la remontée : répondre, « Rendre une décision », « Clôturer ». L'agent voit la décision dans sa fiche.
7. `antenne.agent` › Terrain › Équipements : « Recenser un équipement » (tablette), « Affecter », « Déclarer une panne » avec incident matériel. `oic.admin` › la fiche : « Enregistrer une intervention », puis « Clore le dépannage » (Réparé). La note apparaît dans l'historique de l'incident lié. Le tableau « Pannes par antenne » de l'inventaire national filtre l'inventaire au clic.
8. `oic.admin` › Exploitation › Échanges partenaires › « Nouvelle communication » à tous les partenaires. `partner.admin` › Assistance › Échanges avec l'OIC : le fil apparaît « Nouveau » ; répondre. `oic.admin` › « Clore l'échange ».

## Limites assumées

- Les délais cibles sont des constantes de démonstration ; ils ne sont pas encore paramétrables dans l'écran Paramètres.
- La surveillance des délais s'exécute à l'ouverture des écrans d'incidents (pas de tâche planifiée dans un POC sans serveur).
- Les lenteurs sont déclarées par les utilisateurs ; la plateforme ne mesure pas elle-même ses temps de réponse (« signalement par le système » : à prévoir avec la supervision technique de la cible).
- L'agent de contrôle (application de contrôle) n'a pas accès aux incidents : son interface dédiée ne comporte pas de menu.
- Le besoin « contrôle par le partenaire du matériel mis à disposition » (priorité non précisée) n'est pas traité : aucun matériel n'est aujourd'hui confié aux partenaires dans le POC.
- Seule l'administration OIC pilote les remontées tant que le rôle Direction (lot d5) n'est pas fusionné.
- Après une réinitialisation de la démonstration depuis Paramètres, les données de ce lot sont rechargées au prochain chargement de la page.
- Les fichiers joints ne sont pas conservés (métadonnées seulement), conformément au stockage local du POC.
