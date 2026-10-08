# Vidéo explicative DUT-OIC — spécification de conception

**Date** : 2026-10-08
**Statut** : conception validée, implémentation non commencée
**Périmètre** : une explication animée du Document Unique de Transport et de sa chaîne
d'acteurs, jouable dans la plateforme POC et exportable en MP4.

---

## 1. Objectif

Produire une explication animée du DUT qui serve deux usages sans dupliquer le contenu :

1. **Convaincre** — direction OIC, ministère, bailleurs : montrer que le dispositif
   proposé est pertinent et qu'il tient debout.
2. **Expliquer** — néophytes, agents d'antenne, partenaires, intégrateurs : comprendre
   le DUT, qui fait quoi, et comment la plateforme matérialise ce parcours.

La contrainte structurante est la **symbiose avec la plateforme** : la vidéo ne doit pas
être un objet extérieur qui parle du produit, mais une vue du produit qui se laisse aussi
exporter en fichier.

## 2. Public visé

Du néophyte total à l'intégrateur technique, dans cet ordre de priorité : décideurs,
personnes sans aucune notion du DUT, personnes voulant comprendre le fonctionnement de
la plateforme, équipe technique, antennes, intégrateurs.

Conséquence de conception : **chapitres autonomes**. Personne n'est obligé de tout
regarder, et chaque chapitre est exportable seul.

## 3. Décisions actées

| Sujet | Décision | Écartée |
|---|---|---|
| Livraison | Animation web dans la plateforme (source unique de vérité) **et** export MP4 | — |
| Technique | Vue `#/decouvrir` + timeline anime.js v4 + export headless Playwright/ffmpeg | Remotion (gardé en repli pour la seule partie vidéo si l'export déçoit) |
| Narration | Voix off, humaine **ou** synthèse — non tranché, et le design n'oblige pas à trancher | — |
| Registre visuel | Hybride : schémas vectoriels pour le concept, vrais écrans du POC pour la plateforme | 100 % vectoriel · screencast · iframe live |
| Durée et découpage | 5 chapitres, 300 s, fusion du chapitre « acteurs » dans le « parcours » | 8 min en 6 chapitres · rabotage uniforme · coupe des chapitres 5 et 6 |
| Cadre de la scène | Plein cadre, sans bandeau permanent ; carton de titre de 2 s par chapitre | Bandeau institutionnel permanent · bandeau + panneau d'étapes |

Le repli Remotion ne concernerait que le rendu vidéo : l'animation web resterait acquise.

## 4. Hypothèses posées

- Français uniquement.
- 1920×1080, 25 images par seconde.
- Le workflow présenté est celui du POC, **validation par antenne incluse**.

Ce dernier point mérite d'être énoncé franchement, car `mem:domain` documente un écart
assumé : le système OIC réel n'a aucune étape de validation par antenne — le partenaire
consomme un numéro déjà alloué à son stock, et le seul contrôle humain porte sur la
demande de plage de numéros. Le workflow rejet/correction/validation du POC est une
**amélioration produit proposée**, pas une reproduction de l'existant. Une vidéo destinée
à des décideurs qui tairait cette distinction les induirait en erreur sur ce qui existe
déjà. Le chapitre 2 doit donc le dire, en une phrase, sans lourdeur.

## 5. Risques et points ouverts

| # | Sujet | État |
|---|---|---|
| R1 | `ffmpeg` et Playwright absents de la machine | **Installation non autorisée à ce jour.** L'animation web se fait sans eux ; l'export MP4 est impossible tant qu'ils manquent. À reposer avant l'étape d'export. |
| R2 | Qualité des voix françaises macOS | Les voix disponibles (Jacques, Eddy, Flo, fr_FR) sont des voix *legacy* de qualité moyenne. Suffisantes pour itérer et minuter ; à remplacer par une voix Premium téléchargée, un service TTS, ou une voix humaine pour la version diffusée. |
| R3 | Formulation du chapitre 1 | Comparer à l'existant (papier, numéros en blocs, copie indétectable) est une affirmation politique devant l'OIC. **Parti retenu : décrire le risque structurel sans accuser l'existant.** Validation nécessaire à la relecture du script. |
| R4 | Coût du rendu | 7 500 images par montage complet, ~15 à 25 min de rendu. Acceptable, mais interdit une boucle d'itération sur le MP4 : l'itération se fait dans le navigateur. |
| R5 | Péremption des captures d'écran | Les vrais écrans montrés vieilliront avec l'interface. Atténuation : captures cadrées serré sur une zone utile stable, et test d'intégrité listant les fichiers manquants. |

## 6. Architecture

### 6.1 Deux décisions centrales

**Le storyboard est une donnée, pas du code.** `js/data/storyboard.js` déclare chapitres,
scènes, narration, timecodes et références d'écrans. Un constructeur le transforme en
timeline anime.js. Conséquences : le contenu se modifie sans toucher au code d'animation,
les tests valident le storyboard, et le script de voix comme le moteur d'export lisent la
même source. Ajouter une scène, c'est ajouter de la donnée.

**La voix est l'horloge.** En lecture web, la timeline n'est pas autonome : elle est
asservie à l'élément audio, `tl.seek(audio.currentTime * 1000)`. La synchronisation est
vraie par construction, aucune dérive n'est possible. À l'export il n'y a pas d'audio : le
moteur fait `tl.seek(frame / fps * 1000)`, capture, et ffmpeg colle la voix après. Même
timeline, même rendu, deux horloges.

### 6.2 Contrat de déterminisme

Non négociable : **tout mouvement passe par l'unique timeline anime.js**, créée en
`autoplay: false`. Aucune `transition` CSS, aucune `animation` CSS, aucune boucle
`requestAnimationFrame` hors timeline. Une seule violation suffit à produire un MP4 qui
diverge de ce qu'on voit à l'écran, sans message d'erreur. Un test interdit ces règles
dans la feuille de style de l'explainer.

L'état de l'art confirme cette approche : le rendu déterministe se fait en pilotant le
temps virtuel image par image, jamais en enregistrant en temps réel (frames perdues sur
les scènes chargées).

### 6.3 Arborescence

```
index.html                              + 1 route
js/app.js                               + déclaration de la route #/decouvrir
js/data/storyboard.js                    contenu : chapitres, scènes, narration, timecodes
js/data/storyboard.timing.json           timecodes mesurés sur les fichiers audio réels
js/core/motion-timeline.js               storyboard → timeline anime.js
js/views/decouvrir.js                    vue, lecteur, contrôles hors scène
js/views/explainer/scenes/*.js            un module par scène (build + animate)
js/services/explainer.service.js          état de lecture, chapitrage, résolution des timecodes
js/repositories/explainer.repo.js         progression et préférence « ne plus afficher »
css/explainer.css                        scènes, acteurs, flux
assets/explainer/                        SVG acteurs et pictos, captures cadrées
audio/explainer/                         une piste par scène
scripts/tts.mjs                          génère les voix, mesure les durées réelles
scripts/render-video.mjs                 export MP4 déterministe
tests/explainer.test.mjs
```

Respecte la règle d'architecture du projet : `VUE → SERVICE → REPOSITORY → LOCALSTORAGE`.
**Aucune dépendance runtime ajoutée** : anime.js v4 est déjà vendorisé
(`js/vendor/anime.iife.min.js`), l'application reste statique et sans étape de build.
Playwright et ffmpeg sont des outils de développement, hors de l'application.

### 6.4 Interface d'une scène

Le storyboard porte le contenu et le minutage ; chaque scène porte son visuel dans un
module isolé, testable seul :

```js
// js/views/explainer/scenes/risque-duplication.js
export default {
  id: 'risque-duplication',
  build(root, ctx) { /* crée le DOM de la scène, retourne les références */ },
  animate(tl, refs, offset, duration) { /* ajoute ses tweens à la timeline */ }
}
```

Le storyboard ne référence qu'un identifiant de rendu :

```js
{ id: '1.4', render: 'risque-duplication', at: 26000, duration: 16000,
  narration: '…', screenshot: null }
```

### 6.5 Surface exposée au moteur d'export

En mode `?render=1`, la vue masque les contrôles et expose :

```js
window.__explainer = { seek(ms), duration, chapters, ready }
```

La zone capturée est **exclusivement** l'élément `.scene-stage`. Les contrôles de lecture
vivent en dehors de cet élément — c'est ce qui permet au cadre plein écran retenu de
garder une navigation par chapitre complète dans la plateforme sans que rien de cette
navigation n'apparaisse dans le MP4.

## 7. Découpage et storyboard

300 s, 5 chapitres, **28 scènes** dont 5 cartons de titre. Narration effective 290 s, soit
**~725 mots** à 150 mots par minute.

Chaque chapitre ouvre sur un carton de titre muet de 2 s (kicker orange, titre), ce qui
remplace le bandeau permanent écarté.

### Chapitre 1 — Le problème et le DUT (0 → 55 s, vectoriel, ~132 mots)

| Scène | Fenêtre | Contenu |
|---|---|---|
| 1.1 | 0–2 s | Carton de titre |
| 1.2 | 2–14 s | Carte de Côte d'Ivoire, port d'Abidjan, un camion chargé prend la route |
| 1.3 | 14–26 s | Le document qui doit accompagner ce transport apparaît |
| 1.4 | 26–42 s | Le risque structurel : sans référence unique vérifiable, rien ne permet de trancher sur le terrain entre un document authentique et sa copie |
| 1.5 | 42–55 s | Ce que le DUT doit garantir — authenticité, traçabilité, statistique nationale (trois pictos) |

### Chapitre 2 — Le parcours, acteur par acteur (55 → 185 s, hybride, ~320 mots)

Cœur de la vidéo. On suit **un seul** DUT, et chaque acteur entre en scène au moment où
il agit — c'est cette fusion qui supprime la redondance de l'ancien découpage en 8 min.

| Scène | Fenêtre | Contenu | Écran réel |
|---|---|---|---|
| 2.1 | 0–2 s | Carton de titre | — |
| 2.2 | 2–18 s | Le partenaire crée le dossier | `creation.png`, cadré serré |
| 2.3 | 18–28 s | Soumission : le dossier glisse vers l'antenne | — |
| 2.4 | 28–48 s | L'antenne vérifie — rejet, correction, resoumission | `antenne.png` |
| 2.5 | 48–66 s | Validation et attribution du numéro officiel ; mention de l'écart assumé (§4) | — |
| 2.6 | 66–88 s | QR et impression recto/verso | `impression.png` |
| 2.7 | 88–100 s | Le transporteur prend la route | — |
| 2.8 | 100–118 s | Contrôle terrain : scan du QR | `controle.png` |
| 2.9 | 118–130 s | Journal d'audit : chaque geste est tracé | — |

### Chapitre 3 — Pourquoi c'est infalsifiable (185 → 235 s, hybride, ~120 mots)

| Scène | Fenêtre | Contenu |
|---|---|---|
| 3.1 | 0–2 s | Carton de titre |
| 3.2 | 2–16 s | Ce que contient le QR : `oicdut://verify/<uuid>`, un jeton opaque, aucune donnée métier en clair |
| 3.3 | 16–30 s | Le contrôle interroge toujours le système, jamais ce qui est imprimé |
| 3.4 | 30–42 s | **Scène pivot** : un PDF photocopié, scanné, ressort « RETIRÉ » en rouge |
| 3.5 | 42–50 s | Statuts, filigranes, rang de génération, empreinte SHA-256 |

La scène 3.4 est aussi la seconde moitié du teaser de 90 s.

### Chapitre 4 — Piloter le dispositif (235 → 275 s, écrans réels, ~95 mots)

| Scène | Fenêtre | Contenu | Écran réel |
|---|---|---|---|
| 4.1 | 0–2 s | Carton de titre | — |
| 4.2 | 2–14 s | Plages de numéros : demande et allocation | `plages.png` |
| 4.3 | 14–26 s | Statistiques nationales | `oic.png` |
| 4.4 | 26–34 s | Carte des antennes | `antennes.png` |
| 4.5 | 34–40 s | Journal d'audit et administration des rôles | `actions.png` |

### Chapitre 5 — Du POC au système réel (275 → 300 s, vectoriel, ~57 mots)

| Scène | Fenêtre | Contenu |
|---|---|---|
| 5.1 | 0–2 s | Carton de titre |
| 5.2 | 2–12 s | Ce qu'est cette démonstration : un navigateur, des données de démo, aucun serveur |
| 5.3 | 12–22 s | L'architecture cible : Angular, NestJS, PostgreSQL/PostGIS, Keycloak, Redis, MinIO, signature PAdES |
| 5.4 | 22–25 s | Clôture OIC |

L'honnêteté est ici un argument de vente, pas une concession : énoncer les limites
assumées désarme la première objection d'un intégrateur.

### Montages

Un montage n'est qu'une liste de chapitres à concaténer — aucune réanimation.

| Montage | Contenu | Durée |
|---|---|---|
| Teaser | Chapitre 1 + scène 3.4 | ~67 s |
| Principal | Chapitres 1 à 5 | 5 min 00 |

D'autres montages resteront produisibles plus tard sans toucher à l'animation.

## 8. Production du son

`scripts/tts.mjs` lit le storyboard, génère **un fichier par scène**
(`say -v Jacques -o`), **mesure la durée réelle** de chacun (`afinfo`) et écrit
`js/data/storyboard.timing.json`.

Les durées ne sont jamais devinées, elles sont mesurées. C'est ce qui rend la voix
substituable : quand une voix humaine sera fournie, le même script mesure les fichiers
livrés et recalcule les timecodes — l'animation se recale seule, sans retouche. Les
fenêtres du §7 sont donc des **cibles de rédaction**, pas des valeurs figées : le
storyboard porte les durées cibles, `storyboard.timing.json` porte les durées réelles, et
c'est ce dernier qui pilote la lecture.

Les sous-titres WebVTT sont générés depuis la même source, ainsi qu'une transcription
texte.

## 9. Export MP4

`scripts/render-video.mjs` :

1. Playwright lance Chromium et ouvre `#/decouvrir?render=1&chapitre=N`.
2. Attente de `window.__explainer.ready`.
3. Boucle sur les images : `seek(frame / 25 * 1000)`, puis capture du seul élément
   `.scene-stage`.
4. ffmpeg assemble en 1920×1080 à 25 fps, muxe la voix, incruste les sous-titres en
   option.
5. Un montage est un `ffmpeg concat` des chapitres rendus.

## 10. Erreurs et dégradations

Aucune ne produit un écran noir.

| Situation | Comportement |
|---|---|
| Voix pas encore générée | Horloge interne, lecture muette avec sous-titres |
| Capture d'écran absente | Cadre de remplacement nommé à l'écran ; test listant les fichiers manquants |
| `ffmpeg` ou Playwright absents | Arrêt avec la commande d'installation exacte, pas une trace d'exception |
| Storyboard incohérent | Détecté par les tests, jamais à l'exécution |
| `prefers-reduced-motion` | Rendu par paliers : chaque scène apparaît d'un coup à son timecode, sans interpolation ; voix et sous-titres inchangés |

## 11. Tests

`node --test`, comme le reste du projet, dans `tests/explainer.test.mjs`.

1. **Storyboard** — aucun chevauchement de timecodes ; somme des durées de scènes égale à
   la durée du chapitre ; chaque scène a une narration et un identifiant de rendu.
2. **Intégrité des assets** — tout fichier (écran, SVG, audio) référencé par le storyboard
   existe sur le disque.
3. **Timeline** — construite depuis une fixture, `seek()` à N timecodes produit les états
   attendus sur les éléments clés.
4. **Déterminisme** — échoue si une `transition` ou une `animation` CSS apparaît dans
   `css/explainer.css`. C'est le garde-fou du §6.2 : sans lui, une régression casserait
   l'export silencieusement.
5. **Sous-titres** — le WebVTT généré est valide et ses cues correspondent aux timecodes
   mesurés.
6. **Repository** — progression et préférence « ne plus afficher » persistées et relues.

## 12. Hors périmètre

- Toute autre langue que le français.
- Montage vidéo manuel dans un logiciel tiers.
- Animation des écrans du POC en direct dans un iframe (approche écartée).
- Enregistrement d'une voix humaine (le design l'accueille, mais la prise de son n'est pas
  dans ce lot).
- Hébergement ou diffusion du MP4 (YouTube, réseaux sociaux).

---

## Références

- [anime.js v4 — `timeline.seek()`](https://animejs.com/documentation/timeline/timeline-methods/seek)
- [videowright — capture déterministe Playwright + ffmpeg](https://github.com/scosman/videowright)
- [HyperFrames — rendu MP4 piloté par timeline](https://www.mindstudio.ai/blog/what-is-hyperframes-ai-video-rendering)
- [web-animation-to-video](https://github.com/chuongdang/web-animation-to-video)
- Mémoires projet : `mem:core`, `mem:domain`, `mem:tech_stack`
