# Démo 3D isométrique du DUT — spécification de conception

**Date** : 2026-10-10
**Statut** : conception validée, implémentation non commencée
**Référence visuelle** : enregistrement d'écran « WareTrack » (2026-10-10), retenu pour son
animation (caméra, trajets, repères), pas pour son interface.

---

## 1. Objectif

Une démo animée courte, en vraie 3D isométrique, qui montre le parcours d'un DUT de sa
création à la livraison de la marchandise. Elle sert à présenter le projet à des décideurs
et à des néophytes, sans voix off : l'image raconte, quelques sous-titres courts appuient.

Elle **ne remplace pas** la vidéo explicative existante (`#/decouvrir`, moteur SVG,
3 min 43). Elle valide le rendu 3D sur un périmètre réduit ; le moteur produit pourra
ensuite servir de scène interactive ou de base à une refonte de la vidéo longue.

## 2. Décisions actées

| Sujet | Décision | Écartée |
|---|---|---|
| Usage | Démo séparée ~75 s, sans voix off, sous-titres courts | Remplacement de la vidéo longue · scène interactive (plus tard) |
| Scénario | Parcours complet sur un seul plateau, un seul camion suivi | Fraude déjouée en plus · contrôle seul |
| Technique | Three.js r186 (WebGLRenderer), maquettes construites en code | Modèles GLB téléchargés · Blender pré-rendu · WebGPU |
| Livraison | Page autonome `demo-3d.html` + export MP4 1920×1080, 25 i/s | Intégration directe dans la plateforme (lien ultérieur possible) |
| Couleurs | ~70 % logo OIC, ~30 % touches ivoiriennes dans le décor | Palette grise neutre WareTrack |

## 3. Storyboard (~75 s)

Plateau unique : port d'Abidjan à gauche, route au centre, poste de contrôle, destination
à droite (entrepôt client). Un camion et son DUT sont suivis du début à la fin.

| # | Fenêtre | Image | Sous-titre |
|---|---|---|---|
| 1 | 0–6 s | Vue large du port vivant : portiques, conteneurs, camions qui circulent | « Chaque transport de marchandises a besoin d'un document fiable. » |
| 2 | 6–16 s | Zoom sur l'entrepôt du partenaire ; étiquette « DUT · Brouillon » | « Le partenaire crée le DUT. » |
| 3 | 16–28 s | Trajet pointillé vers l'antenne OIC qui se remplit ; quai qui s'illumine ; étiquette « Validé · N° OIC-… » | « L'antenne OIC le vérifie et lui attribue un numéro officiel. » |
| 4 | 28–38 s | Un chariot charge le conteneur ; un QR apparaît sur l'étiquette du camion | « Le DUT est imprimé avec son QR code. » |
| 5 | 38–52 s | Le camion quitte le port, caméra en suivi ; trait plein derrière, pointillés devant, point d'arrivée qui pulse | « Le transporteur prend la route. » |
| 6 | 52–64 s | Ralentissement au poste de contrôle ; crochets de sélection ; l'agent scanne ; un signal part vers le serveur ; étiquette « Contrôlé · Authentique ✓ » | « Au contrôle, le QR est vérifié auprès du système, jamais sur le papier. » |
| 7 | 64–72 s | Arrivée et mise à quai à destination ; étiquette « Livré » | « Livraison confirmée. » |
| 8 | 72–75 s | Vue d'ensemble qui s'éloigne ; journal d'audit : 6 lignes horodatées s'allument une à une | « Chaque étape est tracée. » |

Le journal d'audit est le seul élément d'interface de la démo : c'est l'argument central
du DUT.

## 4. Direction visuelle

### 4.1 Palette

Couleurs relevées sur `assets/images/logo-oic.jpg`. Valeurs à caler précisément au lot 1,
centralisées dans `js/demo3d/palette.js`.

**Logo OIC (~70 %)**

| Rôle | Couleur | Usage |
|---|---|---|
| Bleu royal | ≈ #1A5BA6 | Toits des bâtiments OIC, portiques, état « validé » |
| Bleu ciel | ≈ #5BA8DE | Eau du port, reflets |
| Marine | ≈ #1E3A6E | Étiquettes, textes, encadrements de quai |
| Orange | ≈ #F08A1C | Cabine du camion suivi |
| Vert | ≈ #1E9A48 | Bande du conteneur suivi, états « authentique » et « livré » |
| Rouge | `--error` #E11D2E | Alerte, réservé |

Le camion suivi porte une petite vague orange-blanc-vert sur la portière, en écho au logo.
C'est le seul objet orange de la scène : l'œil sait toujours qui suivre.

**Touches ivoiriennes (~30 %, décor uniquement)**

- Accotements en terre rouge latérite ; bitume gris clair au centre.
- Cocotiers et palmiers à huile près du port ; arbres ronds le long de la route ; herbe vert franc.
- Lagune Ébrié bleu-vert turquoise.
- Conteneurs empilés aux couleurs chaudes : ocre, brique, vert, bleu.
- Poste de contrôle : abri à toit de tôle, barrière rayée orange et blanc.
- Destination : entrepôt à mur ocre clair.
- Lumière légèrement dorée, ombres un peu plus franches (soleil tropical).

Le fond reste clair et doux ; le bleu royal domine.

### 4.2 Maquettes (construites en code, style « jouet »)

Formes simples à angles arrondis, aucun contour noir.

| Maquette | Détails |
|---|---|
| Camion suivi | Cabine orange, conteneur 20 pieds blanc à bande verte, 3 essieux, phares, rétroviseurs |
| Camions secondaires | 2–3 livrées neutres |
| Entrepôt partenaire | Toit nervuré, quais numérotés, portes ouvertes avec palettes visibles, marquages jaunes |
| Antenne OIC | Bâtiment administratif, pastille logo OIC sur le toit, quai |
| Port | 1–2 portiques, piles de conteneurs, bord de quai, eau |
| Poste de contrôle | Abri, barrière levante, agent avec scanner, bandes au sol |
| Destination | Entrepôt client simplifié |
| Décor | Chariots élévateurs, palettes de cartons, arbres, palmiers, clôtures, route marquée |

### 4.3 Repères animés

Trajet plein derrière l'objet et pointillé devant · point d'arrivée qui pulse · crochets de
sélection 3D · étiquette flottante qui suit l'objet et change d'état · quai qui s'illumine ·
repères en goutte.

### 4.4 Rendu

Caméra orthographique en angle isométrique fixe (seuls zoom et cadrage bougent) · lumière
directionnelle douce avec ombres floues + lumière ambiante · ombre de contact sous chaque
véhicule · police des étiquettes et sous-titres : Instrument Sans.

## 5. Architecture

### 5.1 Arborescence

```
demo-3d.html                          page plein écran : canvas + calque étiquettes/sous-titres
js/demo3d/
  vendor/                             Three.js r186 embarqué (core + module + RoundedBoxGeometry + LICENSE)
  demo3d.css                          styles de la page (hors css/ pour rester hors PWA)
  main.js                             initialisation : renderer, caméra ortho, lumières
  palette.js                          couleurs, source unique
  scenario.js                         DONNÉE : plans, minutage, sous-titres, états du DUT
  keyframes.js · path.js              interpolation et trajectoires, fonctions pures
  timeline.js                         stateAt(ms) : état complet de la scène, fonction pure
  world/                              décor statique : sol, route, lagune, végétation
  models/                             une maquette par fichier
  fx/                                 trajets, pulsation, crochets, quai illuminé, goutte, ombre de contact
  overlay/                            étiquette flottante, sous-titres, journal d'audit
tests/demo3d.test.mjs
tools/video-export/render-demo3d.mjs  export MP4 image par image
```

La page est autonome, hors plateforme (pas de menu, pas de connexion). Un lien depuis
`#/decouvrir` pourra être ajouté plus tard sans réécriture.

### 5.2 Décisions structurantes

1. **Le scénario est une donnée.** `scenario.js` porte plans, durées, sous-titres et états ;
   les maquettes et effets ne contiennent aucun texte.
2. **Une seule horloge.** Tout l'état de la scène (caméra, véhicules, effets, étiquettes,
   sous-titres) est une fonction pure `stateAt(ms)` dérivée du scénario. Three.js ne fait
   que dessiner cet état. C'est le même contrat que la timeline anime.js de la vidéo longue
   (temps virtuel, `seek` exact), sans la dépendance au DOM : l'état se teste dans Node.
   Interdits dans `js/demo3d` (hors `player.js` et `vendor/`) : `requestAnimationFrame`,
   `setTimeout`/`setInterval`, `Date.now()`/`performance.now()`, `Math.random()` ;
   et partout : `transition`/`animation` CSS, `innerHTML`.
3. **Trajectoires.** Véhicules sur des polylignes lissées (Chaikin) paramétrées
   par la longueur ; position et cap dérivés de l'avancement. La caméra suit la cible avec un retard calculé comme
   fonction pure du temps (pas d'intégration d'image en image).
4. **Étiquettes en HTML.** Positionnées chaque image par projection 3D → écran ; texte net,
   police de la charte, accessible.
5. **Lecture et export.** En lecture, un unique pilote `requestAnimationFrame`
   (`player.js`) fait avancer le temps. En `?render=1`, la page expose
   `window.__demo3d = { seek(ms), duration, ready }` ; le script d'export avance image par
   image, capture la scène (canvas + calque), ffmpeg assemble en 1920×1080, 25 i/s.
   `preserveDrawingBuffer` est activé en mode rendu uniquement.
6. **Sans build.** Three.js chargé en module ES via `importmap` ; l'application reste
   statique.
7. **Hors PWA.** `js/demo3d/` est exclu du pré-cache de la plateforme
   (`tools/pwa/precache.mjs`) : la démo est autonome et ne doit pas alourdir l'application.

### 5.3 Sécurité et robustesse

- Three.js r186 embarqué, version et empreinte SHA-256 notées dans le README ; aucun CDN à
  l'exécution. CVE connues (CVE-2020-28496 < 0.125, CVE-2022-0177 rejetée) hors périmètre.
- Aucune donnée externe, aucune entrée utilisateur, aucun appel réseau.
- Textes injectés via `textContent`, jamais `innerHTML`.
- WebGL indisponible : message explicite renvoyant au MP4.
- Pixel ratio plafonné à 2 et ombres d'une seule lumière pour tenir sur un portable courant.

## 6. Tests

`node --test tests/demo3d.test.mjs` :

- Scénario : plans contigus, durée totale 75 s ± 1, chaque plan a un sous-titre non vide et
  un état DUT valide.
- Déterminisme : deux `seek(t)` donnent la même position de véhicule et de caméra
  (fonctions d'état testées hors navigateur).
- Contrat d'horloge : aucun motif interdit (§5.2-2) dans `js/demo3d`.

Validation visuelle : 4 images fixes exportées (plans 1, 3, 6, 8) relues avant l'export
complet.

## 7. Lots

| Lot | Contenu | Point de contrôle |
|---|---|---|
| 1 | Page, renderer, caméra, sol, route, camion suivi ; 1 image fixe | **Validation du rendu « jouet » par l'utilisateur avant la suite** |
| 2 | Toutes les maquettes + décor ivoirien | Images fixes du plateau |
| 3 | Repères animés + étiquettes | Courte séquence en navigateur |
| 4 | Scénario complet, timeline, sous-titres, journal d'audit | Lecture complète en navigateur |
| 5 | Export MP4, finitions | MP4 relu |

## 8. Risques

| # | Risque | Atténuation |
|---|---|---|
| R1 | Rendu WebGL en navigateur sans affichage (pas de GPU, SwiftShader lent ou différent) | Valider dès le lot 1 sur une image fixe ; repli : Chrome avec affichage hors écran |
| R2 | Rendu « jouet » en dessous de la référence | Point de contrôle lot 1 ; arrondis et ombre de contact traités en priorité |
| R3 | Poids de Three.js (~700 Ko) | Page autonome, hors chemin critique de la plateforme |
| R4 | Coût de l'export (1 875 images) | Itération en navigateur ; MP4 seulement en fin de lot |
