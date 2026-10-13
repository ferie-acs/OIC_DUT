# DUT-OIC — Proof of Concept

Preuve de concept du **Document Unique de Transport (DUT)** de l'Office Ivoirien
des Chargeurs (OIC). Démontre le passage d'un document papier à imprimer vers un
**système d'information sécurisé, traçable et exploitable** du transport routier
de marchandises en Côte d'Ivoire.

## Objectif de la démonstration

Suivre un même DUT de bout en bout :

```
PARTENAIRE → CRÉATION → BROUILLON → SOUMISSION → ANTENNE OIC → (REJET → CORRECTION)
→ VALIDATION → NUMÉRO OFFICIEL → QR CODE → PDF → CONTRÔLE TERRAIN
→ JOURNAL D'AUDIT → STATISTIQUES OIC
```

## Stack technique

100 % statique, zéro backend, zéro build :

- HTML5 / CSS3 / JavaScript vanilla (ES Modules)
- LocalStorage comme unique source de données (simule le futur système central)
- [Chart.js 4](https://www.chartjs.org/) — graphiques du dashboard national
- [Leaflet 1.9](https://leafletjs.com/) + OpenStreetMap — carte des antennes
- [QRCode.js](https://davidshimjs.github.io/qrcodejs/) — génération des QR codes
- [html5-qrcode](https://github.com/mebjas/html5-qrcode) — scan caméra (avec repli manuel)
- [jsPDF](https://github.com/parallax/jsPDF) — génération du PDF officiel
- [anime.js v4](https://animejs.com/) — micro-interactions (compteurs KPI, apparition en cascade), vendorisé localement dans `js/vendor/anime.iife.min.js`, respecte `prefers-reduced-motion`

Toutes les librairies sont chargées depuis cdnjs.cloudflare.com, sauf anime.js et jsPDF
(fichiers locaux). Aucune installation requise. Sans accès aux CDN, l'application fonctionne :
les graphiques Chart.js et le fond de carte ne s'affichent pas, les tableaux et indicateurs restent disponibles.

## Lancer le POC

```bash
cd DUT
python3 -m http.server 8080
```

Puis ouvrir : **http://localhost:8080**

Aucune étape de compilation n'est nécessaire. Une connexion Internet est requise
au premier chargement pour les CDN (Chart.js, Leaflet, QRCode.js, html5-qrcode, jsPDF).

## Design

Le pilotage opérationnel est disponible pour les partenaires, antennes, administrateurs
OIC et transporteurs : évolution mensuelle, cycle de traitement, délai moyen de
validation, dossiers prioritaires, corridors par tonnage et export CSV. La recherche
transversale porte sur les DUT, véhicules, transporteurs et trajets du rôle connecté.

Les filtres 30/90 jours et historique portent sur la **date de création**. Les
priorités couvrent tous les dossiers actifs, hors filtre de période ; le seuil de
2 jours est un repère de démonstration, pas un SLA réglementaire. Le tonnage du
nouveau pilotage couvre seulement les DUT **actuellement validés**. Les graphiques
mensuels montrent six mois ; le total historique peut donc être plus large.
La plateforme reste une simulation LocalStorage, sans nouveaux services distants.

Vérification des nouveaux calculs et périmètres : `node tests/insights.test.mjs`.

## Alignement avec le système réel de l'OIC

Une revue du code source legacy (.NET) du DUT en production a permis d'aligner
ce POC sur le vrai modèle métier : droit de timbre fiscal par côté (facturation),
type de compte « Sous-traitance », référentiels Marchandises/Emballages
(remplacent le texte libre), champs réels des véhicules (carte grise, PTAC,
carte de transport) et des conducteurs (pièce d'identité, dates de délivrance),
et un **portail Transporteur** dédié (lecture des DUT et contribution au suivi de ses propres transports).

**Écart assumé et documenté** : le système réel n'a **aucune étape de
validation/rejet par antenne** — le partenaire s'auto-valide en consommant un
numéro déjà alloué à son stock, et le seul point de contrôle humain de l'OIC
porte sur la **demande de plage de numéros** (équivalent de l'écran
« Opérations & plages » de ce POC), pas sur chaque DUT individuellement. Le
workflow antenne (rejet → correction → resoumission → validation) de ce POC est
une **amélioration proposée pour le futur système**, pas une reproduction de
l'existant — conservé ici car c'est la vision produit explicitement demandée
pour cette démonstration.

## Structure du projet

```
DUT/
├── index.html
├── css/            variables · base · layout · components · forms · dashboard · responsive
└── js/
    ├── app.js          bootstrap + déclaration des routes
    ├── seed.js         données de démonstration (utilisateurs, antennes, DUT historiques...)
    ├── core/           router, storage, auth, permissions, utils, icônes, ui (modals/toasts), layout
    ├── repositories/   seul point d'accès à LocalStorage (un fichier par collection)
    ├── services/       logique métier (cycle de vie DUT, QR, PDF, audit, contrôle, dashboards)
    └── views/          un rendu par écran, jamais d'accès direct à LocalStorage
```

Règle d'architecture stricte respectée dans tout le code :

```
VUE → SERVICE → REPOSITORY → LOCALSTORAGE
```

## Fonctionnalités ajoutées (lots d0 à d5)

Chaque domaine est décrit en détail dans `docs/lots/lot-dX.md` (annexes : écrans, règles, limites).
L'historique des versions est tenu dans `docs/CHANGELOG.md`.

| Domaine | Ce que le POC permet | Annexe |
|---|---|---|
| Listes de choix | Recherche intégrée à toutes les listes déroulantes de l'application | `lot-d0.md` |
| Comptes et acteurs | Activation de compte, mot de passe oublié (code envoyé à l'adresse enregistrée), profil, messagerie simulée unique, partenaires et transporteurs (création, validation par une seconde personne, suspension, résiliation), véhicules déclarés, import de l'existant, habilitations, groupements | `lot-d1.md` |
| Réseau, numéros et caisse | Gestion des antennes et des sites, stock de numéros par antenne, vente de plages aux transporteurs au guichet, validation des ventes, reprise, tarifs, encaissements (simulés) validés par une seconde personne, rapport des ventes, rapprochement | `lot-d2.md` |
| Cycle de vie du DUT | Transporteur éditeur qui règle son DUT avec une référence de son stock, facture détaillée, transbordement, saisie au guichet, contrôle et archivage, annulation (numéro retiré), référentiels cloisonnés, recherche par conducteur au contrôle | `lot-d3.md` |
| Exploitation | Incidents de la plateforme (qualification, attribution, délais, clôture), suivi des lenteurs, remontées du terrain, équipements et dépannage, échanges avec les partenaires | `lot-d4.md` |
| Pilotage de la Direction | Suivi et classement des antennes, rapport périodique (CSV, PDF), contrats d'objectifs, résultats et écarts, actions correctives, fiches agents et évaluations, documents, réunions et décisions, contrats et conventions | `lot-d5.md` |

**Intégration des lots** (octobre 2026) :

- **Messagerie unique** : toutes les notifications passent par `envoyer(...)` (`js/services/messaging.service.js`), via
  `js/services/notifications.service.js`. Courriels **simulés**, visibles dans « Mes messages » du destinataire et
  dans Administration › Messages envoyés : incident attribué ou hors délai, réponse à une remontée, message
  d'échange partenaire, vente de plage à valider puis validée ou refusée, références disponibles pour le
  transporteur, encaissement rejeté, demande de plage acceptée ou refusée, DUT suspendu ou annulé, contrat
  d'objectifs à valider, validé ou renvoyé, nouveaux objectifs d'antenne, action corrective décidée, document
  à valider puis validé ou refusé, contrat juridique à valider, en vigueur ou renvoyé, convocation de réunion.
- **Transporteurs et partenaires suspendus** (ou en attente, résiliés) : plus proposés dans les référentiels de
  saisie des DUT, au guichet ni dans la vente de plages ; un véhicule retiré de la flotte non plus.
- **Stock du transporteur** : une plage vendue au guichet puis validée par l'OIC alimente « Mes références » ; la
  plus petite référence disponible est consommée en premier ; le numéro du DUT validé est la référence réglée.
- **Rôle Direction générale** : lecture nationale des incidents, des lenteurs, des remontées, des équipements, des
  ventes et du rapprochement ; aucun droit de saisie ni de validation de DUT (contrôlé par les services).
- **Tableaux de bord de synthèse** : tableau de bord d'antenne complété (performance des agents, objectifs, stock,
  incidents, équipements, remontées) et tableau de bord de la Direction générale (page d'accueil du rôle).
- Validation et rejet d'un DUT vérifient désormais le droit et le ressort de l'antenne dans le service.

## Rôles et comptes de démonstration

Mot de passe de démonstration commun : `demo123` (voir `js/seed.js`). La page de connexion propose la liste
des comptes, avec recherche.

| Rôle | Compte | Page d'accueil | Usage |
|---|---|---|---|
| Partenaire — Admin | `partner.admin@demo.oic.ci` | Tableau de bord partenaire | DUT, plages, référentiels, rapprochement, entreprise et agents, incidents, échanges avec l'OIC |
| Partenaire — Éditeur | `partner.editor@demo.oic.ci` | Tableau de bord partenaire | Saisie des DUT, incidents |
| Agent Antenne | `antenne.agent@demo.oic.ci` | Tableau de bord d'antenne | Validation, guichet, archives, stock et ventes, encaissements, terrain, objectifs |
| Agent Antenne (second agent) | `antenne.agent2@demo.oic.ci` | Tableau de bord d'antenne | Valide ce que le premier agent a saisi |
| Autres agents d'antenne | `agent.bouake@`, `agent.yopougon@`, `agent2.siege@demo.oic.ci` | Tableau de bord d'antenne | Antennes de Bouaké, Yopougon, siège |
| Admin OIC | `oic.admin@demo.oic.ci` | Dashboard national | Supervision, acteurs, réseau, caisse, exploitation, administration, préparation du pilotage |
| Admin OIC — second valideur | `oic.superviseur@demo.oic.ci` | Dashboard national | Valide ce que `oic.admin@` a saisi |
| Agent Contrôle | `controle.agent@demo.oic.ci` | Application de contrôle | Scan, recherche par conducteur, historique |
| Transporteur | `transporteur@demo.oic.ci` | Tableau de bord transporteur | Ses DUT, « Mes références », entreprise et véhicules, incidents |
| Caisse et comptabilité OIC | `caisse@demo.oic.ci` | Encaissements | Encaissements, ventes de références, rapprochement |
| Direction générale et pilotage | `direction@demo.oic.ci` | Tableau de bord de la Direction | Pilotage, validations, lecture de l'exploitation et des recettes |
| Compte à activer | `agent.stfa@demo.oic.ci` | — | Démonstration de l'activation (boîte de réception simulée) |

## Scénario de démonstration (≈20 min)

**0–3 min — Partenaire**
Connexion `partner.admin` → dashboard (plage active : 37 numéros disponibles sur
100) → référentiels → carte des antennes.

**3–10 min — Création DUT**
`+ Nouveau DUT` → assistant en 7 étapes (Général, Parties, Marchandise,
Facturation, Trajet, Annexes, Récapitulatif) → sauvegarde brouillon → soumission.

Jeu de données suggéré : transporteur *ABC TRANSPORT CI*, véhicule *AB-1234-CD*,
conducteur *KOUASSI Jean*, expéditeur *SOCIETE AFRICAINE DE NEGOCE*, destinataire
*INDUSTRIES DU NORD*, trajet *Abidjan → Bouaké*, marchandise *Cacao*, 35 tonnes.

**10–14 min — Antenne**
Connexion `antenne.agent` → DUT à valider → **Rejeter** (motif : carte de
transport expirée) → reconnexion partenaire → **Corriger** → resoumission →
reconnexion antenne → **Valider** → numéro attribué `DUT-CI-2026-001063`,
solde 37 → 36.

**14–17 min — QR & contrôle**
Détail DUT validé → QR code → génération PDF → connexion `controle.agent` →
scan valide, puis simulation d'un QR faux.

**17–20 min — OIC**
Connexion `oic.admin` → dashboard national (le DUT de 35 tonnes apparaît
immédiatement dans les statistiques) → journal d'audit → section sécurité &
contrôles.

### Scénario enrichi (≈30 min de plus, données de démonstration incluses)

**1. Vente de références au guichet et DUT du transporteur (8 min)**
`antenne.agent` → Ressources › Stock de numéros → « Vendre une plage » à *ABC TRANSPORT CI*, 10 numéros, reçu
`RC-DEMO-01` : la vente est « Transfert à valider » et l'OIC reçoit un message simulé. `oic.admin` → Ressources ›
Stock et transferts › Transferts → « Valider le transfert ». `transporteur` → Mon compte › Mes messages (références
disponibles) → Documents › Mes références (stock augmenté) → Nouveau DUT → « Régler et soumettre ».
`antenne.agent2` → valide le DUT : son numéro est la référence réglée. `caisse` → Encaissements → « Valider »
l'encaissement saisi par l'agent.

**2. Suspension d'un transporteur (3 min)**
`oic.admin` → Acteurs › Gestion des transporteurs → *IVOIRE LOGISTIQUE SA* → « Suspendre » (motif). Il n'est plus
proposé dans la vente de plages, au guichet, ni dans les référentiels de saisie des DUT ; « Réactiver » le rétablit.

**3. Exploitation et messagerie (6 min)**
`oic.admin` → Exploitation › Incidents : qualifier puis attribuer un incident à Fatou Diabaté. `antenne.agent` →
Mon compte › Mes messages : l'avis d'attribution ; Terrain › Incidents → proposer une résolution. Les incidents hors
délai produisent une alerte unique au responsable et aux administrateurs.

**4. Tableau de bord d'antenne (3 min)**
`antenne.agent` → Tableau de bord → section « Synthèse de l'antenne » : performance de chaque agent (saisis,
validés, rejetés, délai médian), objectifs et taux d'atteinte, stock de numéros, incidents ouverts et en retard,
équipements en panne, remontées en cours ; changer la période.

**5. Direction générale (10 min)**
`oic.admin` → Pilotage de la Direction › Contrats d'objectifs → « Nouveau contrat », le soumettre. `direction` →
le tableau de bord s'ouvre : points d'attention, indicateurs nationaux, comparaison des antennes, validations en
attente, incidents et équipements, actions en retard, ventes et rapprochement, partenaires et transporteurs.
Ouvrir le contrat à valider (message reçu dans Mes messages) → « Valider et attribuer ». Exploitation › Incidents :
lecture seule, aucun bouton d'action. Recettes › Rapprochement : consultation sans justification possible.

## Anti-falsification

Le QR code ne contient **aucune donnée métier en clair** — uniquement :

```
oicdut://verify/<token opaque, aléatoire, crypto.randomUUID()>
```

Après scan, l'application de contrôle interroge le **système officiel**
(LocalStorage dans ce POC) et affiche les données réelles pour comparaison
avec le document présenté. Le statut affiché est **toujours** celui du système,
jamais celui imprimé sur le papier : un DUT retiré reste retiré même si le PDF
affiche encore « Validé ».

## Architecture cible de production

| Domaine | Cible |
|---|---|
| Frontend | Angular |
| Backend | NestJS |
| Base de données | PostgreSQL + PostGIS (géolocalisation antennes/contrôles) |
| Identité | Keycloak (SSO, MFA, RBAC) |
| Cache / files | Redis |
| Stockage documentaire | MinIO / S3 |
| Intégrité document | Signature cryptographique asymétrique + **PAdES** sur le PDF |
| Vérification terrain | Application de contrôle avec vérification **offline** de la signature + synchronisation du statut temps réel dès reconnexion |
| Observabilité | Monitoring, journal d'audit **append-only côté serveur** |
| API | API sécurisée HTTPS, authentification forte, révocation de session |


## DUT révisé : recto / verso et contrôle d’impression

Les quatre PDF de `docs/` servent de références de présentation. Le dossier propose maintenant **DUT recto / verso** (téléchargement) et **Aperçu** (lecteur PDF.js local, sans enregistrer une impression).
## Application installable (PWA)

L'application s'installe sur ordinateur et téléphone (bouton « Installer l'application » dans la barre latérale quand le navigateur le propose) et fonctionne hors ligne : la coquille (pages, styles, scripts, images, icônes) est pré-cachée par `sw.js` ; les bibliothèques externes et les polices sont gardées en cache après la première visite ; le fond de carte OpenStreetMap est servi depuis le cache quand le réseau manque. Les données restent dans le navigateur (LocalStorage).

- `manifest.webmanifest` — nom, icônes (`assets/icons/`), couleur de thème, raccourcis (Contrôle, Nouveau DUT).
- `sw.js` — service worker ; la liste des fichiers et leur version viennent de `precache.json`.
- **Avant chaque livraison** : `node tools/pwa/precache.mjs` régénère `precache.json` (le test `tests/pwa.test.mjs` échoue s'il est périmé).
- Nécessite un contexte sécurisé : `localhost` ou HTTPS (pas d'installation via une adresse IP en HTTP).

## Démo 3D du parcours DUT

Animation 3D isométrique de 75 s, du dépôt du DUT à la livraison (Three.js r186, sans build).
Spec : `docs/superpowers/specs/2026-10-10-demo-3d-dut-design.md`.

- **Moteur** : `js/demo3d/`. Tout l'état de la scène est une fonction pure `stateAt(ms)` ; le contenu
  (plans, sous-titres, minutage, états du DUT) se modifie dans `js/demo3d/scenario.js` uniquement.
- **Lecture autonome** : servir le dépôt (`python3 -m http.server 8091`) puis ouvrir
  `http://127.0.0.1:8091/demo-3d.html`. Page hors plateforme et hors PWA.
- **Vidéo (HyperFrames)** : projet `video/demo-3d-dut/`, qui réutilise le moteur par lien symbolique
  (`demo3d -> ../../js/demo3d`). Dans ce dossier :
  - aperçu et retouches : `npx hyperframes preview --background` ;
  - images fixes : `npx hyperframes snapshot --at 10,45,57 --no-end` ;
  - export MP4 : `npx hyperframes render --fps 25 --quality delivery` → `renders/demo-3d-dut.mp4`.
- **Tests** : `node tests/demo3d.test.mjs` ; validation de la composition : `cd video/demo-3d-dut && npx hyperframes check`.
- Three.js vendorisé dans `js/demo3d/vendor/` (version et empreintes dans `VERSION.md`).
