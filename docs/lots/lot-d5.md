# Lot d5 : pilotage de la Direction générale de l'OIC (plateforme DUT)

Ce lot donne à la Direction générale un espace de pilotage. Elle peut suivre et comparer les antennes, conduire les
contrats d'objectifs (cibles, résultats, écarts, actions correctives), tenir les fiches agents et leurs évaluations,
et gérer les documents, les réunions et décisions ainsi que le registre des contrats et conventions.
Tout fonctionne dans le navigateur (LocalStorage), selon la chaîne `VUE → SERVICE → REPOSITORY → LOCALSTORAGE`.

## Rôle et compte de démonstration

| Rôle | Identifiant | Compte | Accueil |
|---|---|---|---|
| Direction générale et pilotage | `ROLES.DIRECTION` | `direction@demo.oic.ci` (mot de passe de démonstration habituel) | `/direction/antennes` |

Le compte est créé par `js/seed-lot-d5.js`. Il est recréé s'il manque, y compris après une réinitialisation de la démonstration.
La Direction lit l'ensemble du réseau, mais **n'a aucun droit sur les DUT** : création, modification, soumission,
validation, rejet, suspension et retrait lui sont refusés. Le planning et le centre d'actions DUT sont retirés de son menu.

Répartition des droits (bloc `Lot d5` de `js/core/permissions.js`) :

| Droit | Direction | Admin OIC | Agent d'antenne |
|---|---|---|---|
| `pilotage.view`, `pilotage.report` (suivi des antennes, rapport) | oui | oui | non |
| `objectives.manage` (indicateurs, contrats, clôture) | oui | oui | non |
| `objectives.validate` (valider ou renvoyer un contrat) | oui | **non** | non |
| `objectives.results` (saisie des résultats) | oui | oui | sa seule antenne |
| `actions.manage` / `actions.follow` (actions correctives) | décider | décider | suivre celles de son antenne |
| `agents.manage`, `agents.evaluate` | oui | oui | non |
| `documents.view`, `documents.manage`, `documents.validate` | oui | oui | non |
| `meetings.manage` | oui | oui | non |
| `legal.view` ; `legal.manage` et `legal.visa` ; `legal.validate_final` | lecture et validation finale | lecture, rédaction et visa | non |
| `partners.evaluate` | oui | oui | non |
| `fieldreports.view`, `fieldreports.manage` (proposés par le lot d4) | oui | | |

## Écrans ajoutés

| Route | Rôles | Entrée de menu | Contenu |
|---|---|---|---|
| `/direction/antennes` | Direction, Admin OIC | Pilotage › Suivi des antennes | Indicateurs nationaux et par antenne sur une période (DUT édités, validés, rejetés, taux de rejet, délai médian de validation, part validée sous 24 h, contrôles, taux d'atteinte des objectifs). Comparaison avec la période précédente, classement selon l'indicateur choisi, points d'attention cliquables, comparateur existant, rapport périodique en **CSV** et en **PDF** |
| `/direction/statistiques` | Direction | Pilotage › Statistiques | Écran de statistiques existant, en lecture nationale |
| `/direction/objectifs`, `/direction/objectifs/:id` | Direction, Admin OIC | Objectifs › Contrats d'objectifs | Liste des contrats et fiche d'un contrat : objectifs attribués (antenne ou agent), cible, réalisé, écart, taux d'atteinte, statut, historique des résultats, actions correctives, circuit de validation |
| `/direction/actions` | Direction, Admin OIC | Objectifs › Actions correctives | Toutes les actions (filtre par état, « en retard seulement ») et leur suivi |
| `/direction/indicateurs` | Direction, Admin OIC | Objectifs › Indicateurs | Catalogue d'indicateurs : soit mesurés automatiquement sur les DUT (repris du comparateur), soit saisis manuellement |
| `/direction/agents`, `/direction/agents/:id` | Direction, Admin OIC | Ressources humaines › Agents | Fiche agent (matricule, fonction, antenne et date d'affectation, responsabilités, compte rattaché), activité mesurée du compte, objectifs personnels, évaluations périodiques, parcours, fin d'affectation |
| `/direction/documents`, `/direction/documents/:id` | Direction, Admin OIC | Gouvernance › Documents | Dépôt, classement par catégorie et par antenne, validation ou refus, nouvelles versions, archivage, journal |
| `/direction/reunions`, `/direction/reunions/:id` | Direction, Admin OIC | Gouvernance › Réunions et décisions | Planification, convocation (simulée), compte rendu, décisions avec responsable, échéance et suivi, annulation |
| `/direction/contrats`, `/direction/contrats/:id` | Direction, Admin OIC | Gouvernance › Contrats et conventions | Registre des conventions de partenariat DUT et des contrats de prestation, alertes d'échéance, circuit de validation, sites affectés, indicateurs du partenaire, évaluation du partenaire |
| `/antenna/objectifs`, `/antenna/objectifs/:id` | Agent d'antenne | Objectifs › Objectifs de l'antenne | Objectifs en vigueur de son antenne et de ses agents, saisie des résultats |
| `/antenna/actions` | Agent d'antenne | Objectifs › Actions correctives | Actions de son antenne, avec points d'avancement |

L'Admin OIC dispose aussi d'une section de menu « Pilotage de la Direction ».

## Règles métier

**Contrats d'objectifs.** Le cycle est le suivant : `En préparation → À valider → En vigueur → Clôturé`.
- Un contrat n'est modifiable qu'en préparation.
- Un renvoi exige un motif et ramène le contrat en préparation.
- La validation revient à une autre personne que celle qui a préparé ou soumis le contrat. L'Admin OIC prépare, la Direction valide.
- Un même indicateur ne peut pas être attribué deux fois au même bénéficiaire.
- Une cible doit être un nombre positif ou nul.
- Un indicateur déjà utilisé dans un contrat soumis ne peut plus être modifié.

**Résultats et écarts** (`attainment`, `globalAttainment` dans `objectives.service.js`, testés).
- Écart = réalisé − cible.
- Taux d'atteinte : réalisé / cible quand « plus haut = mieux » ; cible / réalisé quand « plus bas = mieux » (délai, taux de rejet). Le taux est plafonné à 200 %.
- Statut : atteint à partir de 100 %, proche de la cible de 80 à moins de 100 %, non atteint en dessous de 80 %.
- Le taux global est la moyenne des taux plafonnés à 100 %, pour qu'un dépassement ne masque pas un échec ailleurs.
- Saisie : uniquement sur un contrat en vigueur. Elle est refusée pour une date future ou antérieure au contrat. L'agent d'antenne ne saisit que pour son antenne.
- La valeur mesurée sur la plateforme est proposée en un clic.
- Les résultats précédents restent dans l'historique.

**Actions correctives.**
- Une action est rattachée à un objectif présentant un écart (non atteint ou proche de la cible). Elle est refusée sans résultat saisi ou sur un objectif atteint.
- Chaque action a un responsable et une échéance non passée.
- États : à lancer, en cours, réalisée, abandonnée. Chaque changement d'état demande un point d'avancement.
- L'antenne suit ses actions. Seul le pilotage reporte une échéance ou abandonne une action.
- Une action close ne peut plus être modifiée.

**Agents.**
- Le matricule est unique.
- Un compte utilisateur existant ne peut être rattaché qu'à une seule fiche.
- Une réaffectation est tracée dans le parcours de l'agent.
- Une évaluation porte sur six critères notés de 1 à 5 ; la note globale est la moyenne. Les observations sont obligatoires.
- Une seule évaluation par période. Elle n'est plus modifiable une fois enregistrée.
- Personne ne peut s'évaluer soi-même.
- Un agent dont l'affectation a pris fin n'est plus évalué.

**Documents.**
- Seules les **métadonnées** du fichier sont conservées (nom, taille, type), jamais son contenu.
- Formats acceptés : PDF, Word, Excel, OpenDocument, CSV, image et texte, jusqu'à 20 Mo.
- Chaque version est validée ou refusée par une autre personne que celle qui l'a déposée. Le refus demande un motif.
- Aucune nouvelle version ni archivage tant qu'une version attend sa décision.
- Un document archivé n'est plus modifiable.

**Réunions.**
- La convocation est **simulée** et l'écran l'indique.
- Le compte rendu se rédige après l'heure de la réunion.
- Les décisions sont prises sur une réunion tenue, avec un responsable, une échéance et un suivi jusqu'à la clôture. Une décision dépassée apparaît en retard.

**Contrats et conventions.**
- Circuit : `En rédaction → Visa juridique → Validation Direction générale → En vigueur`. Un contrat passe à « Échu » après sa date de fin.
- L'Admin OIC rédige et vise ; la Direction valide.
- La validation finale revient à une autre personne que le rédacteur et que l'auteur du visa.
- Un renvoi exige un motif.
- Une alerte apparaît 60 jours avant l'échéance.
- Seule une convention en vigueur peut être évaluée, une fois par période.

**Journal.** Chaque changement d'état est inscrit dans le journal d'audit existant (qui, quoi, quand, motif) : contrats,
résultats, actions, fiches et évaluations, documents, réunions et décisions, contrats juridiques, export de rapport.

## Fonctions de service pour le futur tableau de bord de la Direction (après fusion)

- `attainmentByAntenna()` dans `objectives.service.js` : taux d'atteinte par antenne sur les contrats en vigueur.
- `overdueActions()` et `contractsToValidate()` dans `objectives.service.js`.
- `documentsToValidate()` dans `direction-documents.service.js`.
- `overdueDecisions()` dans `meetings.service.js`.
- `expiringLegalContracts()` et `legalContractsAwaiting()` dans `legal-contracts.service.js`.
- `attentionPoints()` dans `pilotage.service.js` : synthèse chiffrée de tout ce qui précède.
- `antennaPerformance(période, { rankBy })` et `periodicReport(...)` dans `pilotage.service.js`.

Réutilisation : les indicateurs par antenne proviennent de `comparison.service.js`, qui s'appuie sur `statistics.service.js`.
Le comparateur existant est monté sur l'écran de suivi. Le PDF suit la mise en page du PDF officiel du DUT, avec le jsPDF déjà embarqué.

## Parcours de démonstration

1. **Direction** (`direction@demo.oic.ci`). Sur « Suivi des antennes », choisissez « 90 j ». Changez « Classer par » pour « Délai de validation », puis téléchargez le rapport en CSV et en PDF.
2. Ouvrez le point d'attention « contrat(s) d'objectifs à valider ». Ouvrez le contrat CO-…-002 puis cliquez sur « Valider et attribuer ».
3. **Admin OIC** (`oic.admin@demo.oic.ci`). Dans « Contrats d'objectifs », créez un « Nouveau contrat » avec une antenne, un indicateur et une cible, puis soumettez-le. Si vous essayez de le valider, l'action est refusée : vous n'avez pas ce droit.
4. **Agent d'antenne** (`antenne.agent@demo.oic.ci`). Ouvrez « Objectifs de l'antenne », puis le contrat pilote. Cliquez sur « Saisir un résultat » et utilisez éventuellement la valeur mesurée. Le taux et l'écart sont recalculés aussitôt. Dans « Actions correctives », donnez un point d'avancement.
5. **Direction**. Sur un objectif non atteint, créez une « Action corrective » avec un responsable et une échéance. Elle apparaît dans « Actions correctives ».
6. **Direction**. Dans Agents, ouvrez la fiche de Fatou Diabaté puis cliquez sur « Évaluer ». Une seconde évaluation sur la même période est refusée.
7. **Direction**. Dans Documents, validez le « Registre des contrôles routiers ». Pour tester le refus : déposez un document, puis essayez de le valider vous-même.
8. **Direction**. Dans Réunions, ouvrez le comité tenu et faites le suivi d'une décision en retard. Ouvrez la revue planifiée et lancez la convocation (simulée).
9. **Direction**. Dans Contrats et conventions, validez la convention TRANSCARGO, qui a déjà reçu le visa juridique. Évaluez ensuite la convention STFA, en vigueur, qui arrive à échéance sous 60 jours.
10. **Admin OIC**. Dans Administration › Journal, retrouvez toutes ces actions.

## Démarches non couvertes, et pourquoi

- **Suivre le trafic et les infrastructures logistiques** (entrepôts, aires de stationnement) : non traité. Le POC ne
  contient ni entrepôt, ni aire de stationnement, ni comptage de trafic. Les seuls flux disponibles sont les DUT et les
  contrôles, déjà présentés dans les onglets « Logistique » et « Corridors » des statistiques, accessibles à la Direction. Créer
  des infrastructures fictives produirait une maquette sans données réelles.
- **Contractualiser et évaluer un partenaire** : traité au plus près des données disponibles. Il couvre la convention de
  partenariat au registre (sites affectés, engagements, circuit de validation, échéance), les indicateurs mesurés du
  partenaire sur la durée de la convention et une évaluation périodique sur trois critères.

## Limites assumées

- Documents : le fichier n'est pas conservé (POC sans serveur). L'écran le signale.
- Convocations : simulées, aucun courriel n'est envoyé.
- Les cibles ne sont pas réparties automatiquement entre antennes : chaque cible est saisie.
- Le tableau de bord agrégé de la Direction (objectifs, incidents, équipements, rapprochement, partenaires) sera assemblé
  après fusion, à partir des fonctions de service ci-dessus.

## Fichiers

Nouveaux fichiers :
- `js/repositories/pilotage.repository.js` ;
- services : `js/services/pilotage-core.service.js`, `pilotage.service.js`, `direction-report.service.js`,
  `objectives.service.js`, `agents.service.js`, `direction-documents.service.js`, `meetings.service.js`,
  `legal-contracts.service.js` ;
- vues : `js/views/direction-ui.js`, `direction-antennas.view.js`, `objectives.view.js`, `agents.view.js`,
  `direction-documents.view.js`, `meetings.view.js`, `legal-contracts.view.js` ;
- `js/seed-lot-d5.js`, `css/lot-d5.css`, `tests/lot-d5.test.mjs`.

Fichiers partagés modifiés (blocs `Lot d5`, placés en fin de liste) : `index.html`, `js/app.js`, `js/core/constants.js`,
`js/core/permissions.js`, `js/core/layout.js`, `js/core/icons.js` (tracés `lucide-static@0.468.0`), `js/seed.js`
(compte dans la liste de démonstration), `js/views/login.view.js`, `js/views/admin.view.js`, `precache.json` (régénéré).
