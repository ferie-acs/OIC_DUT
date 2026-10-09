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

Toutes les librairies sont chargées depuis cdnjs.cloudflare.com, sauf anime.js
(fichier local, aucune dépendance réseau pour cette partie). Aucune installation requise.

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
