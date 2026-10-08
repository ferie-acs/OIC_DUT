# Vidéo explicative DUT — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter au POC DUT-OIC une vue `#/decouvrir` qui joue une explication animée de 5 minutes du DUT et de ses acteurs, et dont la même timeline est exportable en MP4.

**Architecture:** Le storyboard est une donnée (`js/data/storyboard.js`) : chapitres, scènes, narration, timecodes. Un constructeur le transforme en une unique timeline anime.js v4 créée en `autoplay: false`. En lecture web, la timeline est asservie à l'élément audio (`tl.seek(audio.currentTime * 1000)`) ; à l'export, elle est asservie au numéro d'image. Les scènes se composent de 7 primitives visuelles déclaratives, plus 3 scènes sur mesure.

**Tech Stack:** HTML5/CSS3/JS vanilla, ES Modules natifs, zéro build. anime.js v4 déjà vendorisé (`js/vendor/anime.iife.min.js`, global `window.anime`). Tests : `node --experimental-default-type=module`. Export (phase 3, isolée) : Playwright + ffmpeg dans `tools/video-export/`.

**Spec:** `docs/superpowers/specs/2026-10-08-video-explicative-dut-design.md`

## Global Constraints

- ES Modules stricts : aucune fonction globale, aucun `onclick` inline, aucun CSS inline.
- Couche stricte `VUE → SERVICE → REPOSITORY → LOCALSTORAGE`. Une vue ne lit jamais LocalStorage.
- Nommage imposé : `js/views/<ecran>.view.js`, `js/repositories/<collection>.repository.js`, `js/services/<domaine>.service.js`.
- **Aucune dépendance runtime nouvelle.** L'application reste statique, sans étape de build et sans `package.json` à la racine.
- **Contrat de déterminisme :** tout mouvement passe par l'unique timeline anime.js. Aucune `transition` CSS, aucune `animation` CSS, aucune boucle `requestAnimationFrame` hors timeline dans `css/explainer.css` et `js/views/explainer/`.
- anime.js s'utilise via `window.anime` (`anime.createTimeline`, `anime.stagger`), jamais par import.
- Scène toujours 1920×1080, 25 images par seconde. Zone capturable : l'élément `.scene-stage` seul ; aucun contrôle de lecture à l'intérieur.
- Durée totale 300 000 ms, 5 chapitres, 28 scènes dont 5 cartons de titre.
- Données de démonstration toujours marquées, jamais mêlées silencieusement aux vraies données ; ajouts additifs uniquement.
- Tests : fichiers `tests/*.test.mjs`, assertions de haut niveau avec `node:assert/strict`, pas de framework. Lancement : `node --experimental-default-type=module tests/<nom>.test.mjs`.

## Review Focus

Cinq situations que la spec implique sans qu'aucune tâche ne les exerce spontanément. Chaque ligne a son test rattaché à la tâche qui possède le code.

1. **`storyboard.timing.json` absent, partiel ou périmé** (une scène ajoutée au storyboard sans voix regénérée) — la lecture doit retomber sur les durées cibles du storyboard pour les scènes manquantes au lieu de produire `NaN` dans `seek()`. → Test en Tâche 4.
2. **`window.anime` indisponible** (fichier vendor non chargé) — la vue doit afficher le contenu en rendu par paliers plutôt qu'une scène vide. C'est le même chemin que `prefers-reduced-motion`. → Test en Tâche 3.
3. **Fenêtre plus petite que 1920×1080, jusqu'à la largeur d'un téléphone** — la scène doit se mettre à l'échelle sans débordement horizontal et sans déformer le ratio 16:9. → Test en Tâche 5.
4. **Saut de chapitre pendant le chargement de l'audio** — `seek()` demandé avant que la piste soit prête ne doit ni lever ni désynchroniser : la position demandée est mémorisée et appliquée dès que la piste est prête. → Test en Tâche 4.
5. **Capture d'écran référencée mais absente, ou de dimensions inattendues** — la scène affiche un cadre de remplacement nommé au lieu d'une image brisée, et le ratio du conteneur reste stable. → Deux tests complémentaires : le repli à l'exécution appartient à la primitive `screen`, donc Tâche 2 ; la détection au build (fichier référencé mais absent du disque) appartient à Tâche 6.

---

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `js/data/storyboard.js` | Contenu : chapitres, scènes, narration, timecodes cibles, specs de scène. Déclare aussi `STAGE_KINDS`, le contrat des primitives. |
| `js/data/storyboard.timing.json` | Durées **mesurées** sur les fichiers audio réels. Produit par `scripts/tts.mjs`. |
| `js/data/storyboard.validate.js` | Règles de cohérence du storyboard, utilisables en test comme à l'exécution. |
| `js/views/explainer/stage/*.js` | Les 7 primitives visuelles : `title`, `actor`, `doc`, `flow`, `picto`, `screen`, `callout`. Une par fichier. |
| `js/views/explainer/stage/index.js` | Registre des primitives. |
| `js/views/explainer/custom/*.js` | Les 3 scènes sur mesure : `carte-depart`, `copie-retiree`, `architecture-cible`. |
| `js/core/motion-timeline.js` | Storyboard → DOM des scènes + unique timeline anime.js. Gère entrée/sortie de scène et le rendu par paliers. |
| `js/services/explainer.service.js` | Résolution des timecodes (cibles vs mesurés), chapitrage, état de lecture, génération du WebVTT et de la transcription. |
| `js/repositories/explainer.repository.js` | Progression et préférence « ne plus afficher ». |
| `js/views/decouvrir.view.js` | Vue : scène, contrôles hors scène, mode `?render=1`. |
| `css/explainer.css` | Scène, primitives, contrôles. Aucune transition ni animation. |
| `assets/explainer/` | SVG des acteurs et pictos, captures recadrées. |
| `audio/explainer/` | Une piste par scène. |
| `scripts/tts.mjs` | Génère les voix, mesure les durées, écrit `storyboard.timing.json`. |
| `tools/video-export/` | Dossier isolé avec son propre `package.json` : Playwright + ffmpeg. |
| `tests/explainer.test.mjs` | Storyboard, timeline, service, repository, déterminisme. |
| `tests/explainer-assets.test.mjs` | Intégrité des fichiers référencés. |

Modifications de fichiers existants : `js/app.js` (route), `index.html` (feuille de style), `js/core/constants.js` (clé de stockage), `.gitignore` (sorties vidéo).

---

## Phase 1 — Socle jouable sans voix et sans export

### Task 1: Storyboard, contrat et validation

**Files:**
- Create: `js/data/storyboard.js`
- Create: `js/data/storyboard.validate.js`
- Test: `tests/explainer.test.mjs`

**Interfaces:**
- Consumes: rien.
- Produces: `storyboard` (objet), `STAGE_KINDS` (tableau de chaînes), `TOTAL_DURATION_MS` (nombre), `validateStoryboard(storyboard) → string[]` (tableau de messages d'erreur, vide si valide).

- [ ] **Step 1: Write the failing test**

Créer `tests/explainer.test.mjs` :

```js
import assert from 'node:assert/strict';
import { storyboard, STAGE_KINDS, TOTAL_DURATION_MS } from '../js/data/storyboard.js';
import { validateStoryboard } from '../js/data/storyboard.validate.js';

// Le storyboard livré est valide.
assert.deepEqual(validateStoryboard(storyboard), []);

// Structure globale conforme à la spec.
assert.equal(storyboard.fps, 25);
assert.equal(storyboard.width, 1920);
assert.equal(storyboard.height, 1080);
assert.equal(TOTAL_DURATION_MS, 300000);
assert.equal(storyboard.chapters.length, 5);
assert.equal(storyboard.chapters.reduce((n, c) => n + c.scenes.length, 0), 28);
assert.equal(storyboard.chapters.reduce((n, c) => n + c.duration, 0), TOTAL_DURATION_MS);

// Un carton de titre par chapitre, muet, 2 s, en tête.
for (const chapter of storyboard.chapters) {
  const first = chapter.scenes[0];
  assert.equal(first.kindOfScene, 'title-card', `${chapter.id} ne commence pas par un carton`);
  assert.equal(first.at, 0);
  assert.equal(first.duration, 2000);
  assert.equal(first.narration, null);
}

// Le validateur détecte un chevauchement.
const overlapping = structuredClone(storyboard);
overlapping.chapters[0].scenes[1].at -= 500;
assert.ok(validateStoryboard(overlapping).some((e) => e.includes('chevauchement')));

// Le validateur détecte une somme de durées incohérente.
const tooShort = structuredClone(storyboard);
tooShort.chapters[0].duration -= 1000;
assert.ok(validateStoryboard(tooShort).some((e) => e.includes('durée')));

// Le validateur détecte une narration manquante sur une scène parlée.
const mute = structuredClone(storyboard);
mute.chapters[0].scenes[1].narration = '';
assert.ok(validateStoryboard(mute).some((e) => e.includes('narration')));

// Le validateur détecte une primitive inconnue.
const unknown = structuredClone(storyboard);
unknown.chapters[0].scenes[2].stage = [{ kind: 'licorne' }];
assert.ok(validateStoryboard(unknown).some((e) => e.includes('licorne')));

// Toute scène a soit un stage déclaratif, soit un rendu sur mesure, jamais les deux.
for (const chapter of storyboard.chapters) {
  for (const scene of chapter.scenes) {
    const hasStage = Array.isArray(scene.stage) && scene.stage.length > 0;
    const hasCustom = typeof scene.custom === 'string' && scene.custom.length > 0;
    assert.ok(hasStage !== hasCustom || scene.kindOfScene === 'title-card',
      `scène ${scene.id} : stage et custom doivent être exclusifs`);
  }
}

// Les 7 primitives attendues, ni plus ni moins.
assert.deepEqual([...STAGE_KINDS].sort(),
  ['actor', 'callout', 'doc', 'flow', 'picto', 'screen', 'title']);

console.log('Storyboard : structure, cartons, exclusivité stage/custom et règles de validation vérifiés.');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-default-type=module tests/explainer.test.mjs`
Expected: FAIL — `Cannot find module '../js/data/storyboard.js'`

- [ ] **Step 3: Write the validator**

Créer `js/data/storyboard.validate.js` :

```js
import { STAGE_KINDS } from './storyboard.js';

/**
 * Vérifie la cohérence d'un storyboard.
 * Retourne la liste des problèmes trouvés ; tableau vide si tout est conforme.
 */
export function validateStoryboard(storyboard) {
  const errors = [];
  const kinds = new Set(STAGE_KINDS);

  for (const chapter of storyboard.chapters || []) {
    const scenes = chapter.scenes || [];
    if (!scenes.length) { errors.push(`${chapter.id} : aucune scène`); continue; }

    let cursor = 0;
    for (const scene of scenes) {
      if (scene.at !== cursor) {
        errors.push(`${chapter.id}/${scene.id} : chevauchement ou trou (attendu à ${cursor} ms, déclaré à ${scene.at} ms)`);
      }
      cursor = scene.at + scene.duration;

      const isTitleCard = scene.kindOfScene === 'title-card';
      if (!isTitleCard && !String(scene.narration || '').trim()) {
        errors.push(`${chapter.id}/${scene.id} : narration absente`);
      }
      for (const item of scene.stage || []) {
        if (!kinds.has(item.kind)) {
          errors.push(`${chapter.id}/${scene.id} : primitive inconnue « ${item.kind} »`);
        }
      }
    }

    if (cursor !== chapter.duration) {
      errors.push(`${chapter.id} : somme des durées de scènes (${cursor} ms) différente de la durée du chapitre (${chapter.duration} ms)`);
    }
  }

  return errors;
}
```

- [ ] **Step 4: Write the storyboard — chapitre 1 complet, chapitres 2 à 5 en structure**

Créer `js/data/storyboard.js`. Le contrat et le chapitre 1 sont écrits ici ; les chapitres 2 à 5 reçoivent leurs cartons et leurs scènes vides de `stage` en Tâches 6 et 7, mais leurs **durées, identifiants et narrations** sont posés dès maintenant pour que le total de 300 000 ms et les 28 scènes soient vrais dès la Tâche 1.

```js
/**
 * Storyboard de la vidéo explicative DUT-OIC.
 *
 * Donnée, pas code : les scènes déclarent leur contenu et leur minutage cible.
 * Les durées réelles sont mesurées sur les fichiers audio et stockées dans
 * storyboard.timing.json ; c'est ce fichier qui pilote la lecture quand il existe.
 */

/** Contrat des primitives visuelles. Toute valeur de `kind` doit figurer ici. */
export const STAGE_KINDS = ['title', 'actor', 'doc', 'flow', 'picto', 'screen', 'callout'];

export const TOTAL_DURATION_MS = 300000;

const titleCard = (id, kicker, title) => ({
  id, kindOfScene: 'title-card', at: 0, duration: 2000, narration: null,
  stage: [{ kind: 'title', kicker, title, variant: 'card' }],
});

export const storyboard = {
  fps: 25,
  width: 1920,
  height: 1080,
  chapters: [
    {
      id: 'ch1', number: 1, register: 'vectoriel', duration: 55000,
      title: 'Le problème et le DUT',
      scenes: [
        titleCard('1.1', 'Chapitre 1', 'Le problème et le DUT'),
        {
          id: '1.2', at: 2000, duration: 12000, custom: 'carte-depart',
          narration: 'Chaque jour, des marchandises quittent le port d’Abidjan pour rejoindre l’intérieur du pays, ou franchir une frontière.',
        },
        {
          id: '1.3', at: 14000, duration: 12000,
          narration: 'Chacun de ces transports doit être accompagné d’un document. Ce document, c’est le Document Unique de Transport : le DUT.',
          stage: [
            { kind: 'title', title: 'Le Document Unique de Transport', at: 400 },
            { kind: 'doc', id: 'dut', label: 'DUT', at: 1200, from: 'bottom' },
          ],
        },
        {
          id: '1.4', at: 26000, duration: 16000,
          narration: 'Mais un document sur papier ne porte pas la preuve de sa propre authenticité. Sans référence unique et vérifiable, rien ne permet de trancher au bord de la route entre l’original et une copie. Et personne, au niveau national, ne voit circuler l’ensemble.',
          stage: [
            { kind: 'doc', id: 'original', label: 'DUT', at: 0, x: -280 },
            { kind: 'doc', id: 'copie1', label: 'DUT', at: 2200, x: -40, dimmed: true },
            { kind: 'doc', id: 'copie2', label: 'DUT', at: 3200, x: 200, dimmed: true },
            { kind: 'callout', text: 'Lequel est l’original ?', at: 6000, anchor: 'original', tone: 'warning' },
          ],
        },
        {
          id: '1.5', at: 42000, duration: 13000,
          narration: 'Trois garanties sont donc attendues : qu’un DUT soit authentifiable, que son parcours soit tracé, et que l’ensemble devienne une statistique nationale exploitable.',
          stage: [
            { kind: 'title', title: 'Trois garanties attendues', at: 300 },
            { kind: 'picto', id: 'auth', icon: 'shield-check', label: 'Authenticité', at: 1600 },
            { kind: 'picto', id: 'trace', icon: 'route', label: 'Traçabilité', at: 2400 },
            { kind: 'picto', id: 'stats', icon: 'bar-chart-3', label: 'Statistique nationale', at: 3200 },
          ],
        },
      ],
    },
    { id: 'ch2', number: 2, register: 'hybride', duration: 130000, title: 'Le parcours, acteur par acteur', scenes: [] },
    { id: 'ch3', number: 3, register: 'hybride', duration: 50000, title: 'Pourquoi c’est infalsifiable', scenes: [] },
    { id: 'ch4', number: 4, register: 'ecrans', duration: 40000, title: 'Piloter le dispositif', scenes: [] },
    { id: 'ch5', number: 5, register: 'vectoriel', duration: 25000, title: 'Du POC au système réel', scenes: [] },
  ],
};
```

> Les chapitres 2 à 5 sont volontairement vides à cette étape. **Les assertions du Step 1 portant sur les 28 scènes et la somme des durées échoueront donc encore** : c'est voulu, elles passent en Tâche 7. Pour isoler ce qui doit passer dès maintenant, commenter temporairement les deux assertions `28` et `reduce(... c.duration)` avec la mention `// réactivé en Tâche 7`, et les réactiver en Tâche 7.

- [ ] **Step 5: Run the test**

Run: `node --experimental-default-type=module tests/explainer.test.mjs`
Expected: PASS, avec les deux assertions marquées « réactivé en Tâche 7 » commentées.

- [ ] **Step 6: Commit**

```bash
git add js/data/storyboard.js js/data/storyboard.validate.js tests/explainer.test.mjs
git commit -m "feat(explainer): storyboard déclaratif et validation de cohérence"
```

---

### Task 2: Les 7 primitives visuelles

**Files:**
- Create: `js/views/explainer/stage/title.js`, `actor.js`, `doc.js`, `flow.js`, `picto.js`, `screen.js`, `callout.js`, `index.js`
- Create: `css/explainer.css`
- Test: `tests/explainer.test.mjs` (ajouts)

**Interfaces:**
- Consumes: `STAGE_KINDS` de la Tâche 1.
- Produces: `STAGE_PRIMITIVES` (objet indexé par `kind`). Chaque primitive expose `build(spec, doc) → HTMLElement` et `animate(tl, el, spec, offsetMs) → void`. `offsetMs` est l'instant absolu dans la timeline du chapitre où la scène commence ; `spec.at` est relatif à la scène.

- [ ] **Step 1: Write the failing test**

Ajouter à `tests/explainer.test.mjs` :

```js
import { STAGE_PRIMITIVES } from '../js/views/explainer/stage/index.js';

// Chaque kind déclaré par la donnée a une implémentation, et réciproquement.
assert.deepEqual(Object.keys(STAGE_PRIMITIVES).sort(), [...STAGE_KINDS].sort());

// Chaque primitive respecte le contrat build/animate.
for (const [kind, primitive] of Object.entries(STAGE_PRIMITIVES)) {
  assert.equal(typeof primitive.build, 'function', `${kind}.build manquant`);
  assert.equal(typeof primitive.animate, 'function', `${kind}.animate manquant`);
  assert.equal(primitive.build.length, 2, `${kind}.build(spec, doc)`);
}

// build() produit un élément porteur de son kind, sans style inline.
const fakeDoc = {
  createElement(tag) {
    return {
      tagName: tag.toUpperCase(), className: '', textContent: '', dataset: {},
      children: [], attributes: {},
      setAttribute(k, v) { this.attributes[k] = v; },
      getAttribute(k) { return this.attributes[k] ?? null; },
      appendChild(child) { this.children.push(child); return child; },
    };
  },
};
for (const [kind, primitive] of Object.entries(STAGE_PRIMITIVES)) {
  const el = primitive.build({ kind, label: 'x', title: 'x', text: 'x', icon: 'x', src: 'x' }, fakeDoc);
  assert.ok(el, `${kind}.build n'a rien retourné`);
  assert.ok(String(el.className).includes(`sc-${kind}`), `${kind} : classe sc-${kind} absente`);
  assert.equal(el.attributes.style, undefined, `${kind} : style inline interdit`);
}

// La primitive `screen` prévoit un repli nommé si l'image ne charge pas.
// (Couvre Review Focus n°5, versant exécution.)
const screenEl = STAGE_PRIMITIVES.screen.build(
  { kind: 'screen', src: 'antenne.png', alt: 'Panneau de revue d’un DUT par l’antenne' }, fakeDoc);
const img = screenEl.children.find((c) => c.tagName === 'IMG');
assert.ok(img, 'la primitive screen doit produire une img');
assert.equal(img.attributes.src, 'assets/explainer/antenne.png');
assert.ok(img.attributes.alt.length > 10, 'texte alternatif attendu');
const fallback = screenEl.children.find((c) => String(c.className).includes('sc-screen-fallback'));
assert.ok(fallback, 'cadre de remplacement absent');
assert.ok(fallback.textContent.includes('antenne.png'),
  'le remplacement doit nommer le fichier manquant');
assert.equal(screenEl.dataset.ratio, '16:9', 'le conteneur doit porter son ratio');

console.log('Primitives : registre complet, contrat build/animate respecté, repli image nommé, aucun style inline.');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-default-type=module tests/explainer.test.mjs`
Expected: FAIL — `Cannot find module '../js/views/explainer/stage/index.js'`

- [ ] **Step 3: Implémenter les primitives**

`js/views/explainer/stage/doc.js` (modèle à suivre pour les six autres) :

```js
/**
 * Primitive « document » : une feuille DUT, éventuellement numérotée et porteuse d'un QR.
 * spec : { id, label, at, x, dimmed, number, qr }
 */
export const kind = 'doc';

export function build(spec, doc) {
  const el = doc.createElement('div');
  el.className = `sc-doc${spec.dimmed ? ' is-dimmed' : ''}`;
  el.dataset.stageId = spec.id || '';
  if (Number.isFinite(spec.x)) el.dataset.x = String(spec.x);

  const label = doc.createElement('span');
  label.className = 'sc-doc-label';
  label.textContent = spec.label || 'DUT';
  el.appendChild(label);

  if (spec.number) {
    const number = doc.createElement('span');
    number.className = 'sc-doc-number';
    number.textContent = spec.number;
    el.appendChild(number);
  }
  if (spec.qr) {
    const qr = doc.createElement('span');
    qr.className = 'sc-doc-qr';
    el.appendChild(qr);
  }
  return el;
}

export function animate(tl, el, spec, offsetMs) {
  const x = Number.isFinite(spec.x) ? spec.x : 0;
  const fromY = spec.from === 'bottom' ? 60 : 0;
  tl.add(el, {
    opacity: [0, 1],
    translateX: [x, x],
    translateY: [fromY, 0],
    duration: 600,
    ease: 'out(3)',
  }, offsetMs + (spec.at || 0));
}
```

`js/views/explainer/stage/index.js` :

```js
import * as title from './title.js';
import * as actor from './actor.js';
import * as doc from './doc.js';
import * as flow from './flow.js';
import * as picto from './picto.js';
import * as screen from './screen.js';
import * as callout from './callout.js';

/** Registre des primitives, indexé par la valeur de `kind` du storyboard. */
export const STAGE_PRIMITIVES = Object.fromEntries(
  [title, actor, doc, flow, picto, screen, callout].map((m) => [m.kind, m]),
);
```

Les six autres suivent exactement la même forme :

| Primitive | DOM produit | Animation |
|---|---|---|
| `title` | `.sc-title` avec `.sc-kicker` optionnel et `.sc-title-text` ; `variant: 'card'` ajoute `is-card` | opacité 0→1, `translateY` 18→0, 700 ms, `out(3)` |
| `actor` | `.sc-actor` avec `.sc-actor-dot` et `.sc-actor-label` ; `spec.live` ajoute `is-live` | opacité 0→1 et `scale` 0.9→1 à l'entrée ; si `live`, `scale` 1→1.06→1 sur 500 ms à `spec.liveAt` |
| `flow` | `.sc-flow` avec `data-from`/`data-to` renseignés depuis `spec.from`/`spec.to` | `width` de 0 % à 100 %, 900 ms, `inOut(2)` |
| `picto` | `.sc-picto` avec `.sc-picto-icon` (`data-icon` = `spec.icon`) et `.sc-picto-label` | opacité 0→1, `translateY` 14→0, 520 ms |
| `screen` | `.sc-screen` (`data-ratio="16:9"`) contenant une `img` (`src` = `assets/explainer/${spec.src}`, `alt` = `spec.alt`), un `.sc-screen-fallback` portant le nom du fichier, et un `.sc-screen-ring` si `spec.highlight`. L'`img` reçoit `onerror` **par `addEventListener`** qui ajoute `is-missing` au conteneur, révélant le repli par CSS | opacité 0→1 et `scale` 1.04→1 sur 800 ms ; l'anneau apparaît à `spec.highlightAt` |
| `callout` | `.sc-callout` avec `data-anchor` = `spec.anchor` et `data-tone` = `spec.tone` | opacité 0→1, `translateY` 10→0, 450 ms |

- [ ] **Step 4: Écrire `css/explainer.css`**

Reprend les tokens maison (`var(--navy)`, `var(--accent)`, `var(--surface)`, `var(--r-md)`…), système plat sans ombre. Positionnement par `position: absolute` et `transform`, jamais par animation CSS.

**Interdit par le contrat de déterminisme :** aucune propriété `transition`, aucune `animation`, aucun `@keyframes`. Le test de la Tâche 8 fait échouer la suite si l'une apparaît.

- [ ] **Step 5: Run the test**

Run: `node --experimental-default-type=module tests/explainer.test.mjs`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add js/views/explainer/stage css/explainer.css tests/explainer.test.mjs
git commit -m "feat(explainer): 7 primitives visuelles et feuille de style de scène"
```

---

### Task 3: Constructeur de timeline et rendu par paliers

**Files:**
- Create: `js/core/motion-timeline.js`
- Test: `tests/explainer.test.mjs` (ajouts)

**Interfaces:**
- Consumes: `STAGE_PRIMITIVES` (Tâche 2), `storyboard` (Tâche 1).
- Produces: `buildChapter(chapter, { doc, root, timings }) → { timeline, seek(ms), stepped }`. `timeline` est `null` si anime.js est absent ou si le mouvement est refusé ; dans ce cas `stepped` vaut `true` et `seek(ms)` applique le rendu par paliers. `timings` est la table des durées mesurées, éventuellement partielle.

- [ ] **Step 1: Write the failing test**

Ajouter à `tests/explainer.test.mjs` :

```js
import { buildChapter } from '../js/core/motion-timeline.js';

// Sans window.anime, le constructeur bascule en rendu par paliers au lieu d'échouer.
// (Couvre Review Focus n°2.)
const tlCalls = [];
const stageRoot = fakeDoc.createElement('div');
const built = buildChapter(storyboard.chapters[0], { doc: fakeDoc, root: stageRoot, timings: {} });
assert.equal(built.stepped, true, 'sans anime.js, le rendu doit être par paliers');
assert.equal(built.timeline, null);
assert.equal(typeof built.seek, 'function');

// En paliers, seek() n'active qu'une scène à la fois.
built.seek(0);
const activeAtZero = stageRoot.children.filter((c) => String(c.className).includes('is-active'));
assert.equal(activeAtZero.length, 1);
assert.equal(activeAtZero[0].dataset.sceneId, '1.1');
built.seek(30000);
const activeLater = stageRoot.children.filter((c) => String(c.className).includes('is-active'));
assert.equal(activeLater.length, 1);
assert.equal(activeLater[0].dataset.sceneId, '1.4');

// seek() hors bornes ne lève pas et ne laisse pas d'état incohérent.
built.seek(-5000);
built.seek(999999);
assert.equal(stageRoot.children.filter((c) => String(c.className).includes('is-active')).length, 1);

// Un conteneur de scène est créé par scène, porteur de son identifiant.
assert.equal(stageRoot.children.length, storyboard.chapters[0].scenes.length);
assert.deepEqual(stageRoot.children.map((c) => c.dataset.sceneId),
  storyboard.chapters[0].scenes.map((s) => s.id));

// Avec un faux anime.js, une vraie timeline est construite, en autoplay désactivé.
globalThis.window = {
  anime: {
    createTimeline(options) {
      tlCalls.push(['createTimeline', options]);
      return { add(...args) { tlCalls.push(['add', args]); return this; },
               seek(ms) { tlCalls.push(['seek', ms]); return this; },
               pause() { tlCalls.push(['pause']); return this; } };
    },
    stagger: (n) => n,
  },
  matchMedia: () => ({ matches: false }),
};
const animated = buildChapter(storyboard.chapters[0], { doc: fakeDoc, root: fakeDoc.createElement('div'), timings: {} });
assert.equal(animated.stepped, false);
assert.ok(animated.timeline, 'timeline attendue');
assert.equal(tlCalls[0][1].autoplay, false, 'la timeline doit être créée en autoplay: false');
assert.ok(tlCalls.some(([kind]) => kind === 'add'), 'aucun tween ajouté');

console.log('Timeline : repli par paliers sans anime.js, autoplay désactivé, une scène active à la fois.');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-default-type=module tests/explainer.test.mjs`
Expected: FAIL — `Cannot find module '../js/core/motion-timeline.js'`

- [ ] **Step 3: Implémenter le constructeur**

```js
import { STAGE_PRIMITIVES } from '../views/explainer/stage/index.js';
import { prefersReducedMotion } from './motion.js';

function canAnimate() {
  return !!(globalThis.window && globalThis.window.anime) && !reducedMotion();
}

function reducedMotion() {
  try { return prefersReducedMotion(); } catch { return false; }
}

/** Durée effective d'une scène : mesurée si disponible, cible du storyboard sinon. */
function effectiveDuration(scene, timings) {
  const measured = timings && timings[scene.id];
  return Number.isFinite(measured) && measured > 0 ? measured : scene.duration;
}

/**
 * Construit le DOM des scènes d'un chapitre et, si l'animation est possible,
 * l'unique timeline anime.js qui les pilote.
 */
export function buildChapter(chapter, { doc, root, timings = {} }) {
  const animate = canAnimate();
  const timeline = animate
    ? globalThis.window.anime.createTimeline({ autoplay: false, defaults: { ease: 'out(3)' } })
    : null;

  const windows = [];
  let offset = 0;

  for (const scene of chapter.scenes) {
    const duration = effectiveDuration(scene, timings);
    const container = doc.createElement('div');
    container.className = 'sc-scene';
    container.dataset.sceneId = scene.id;
    root.appendChild(container);
    windows.push({ sceneId: scene.id, container, start: offset, end: offset + duration });

    for (const spec of scene.stage || []) {
      const primitive = STAGE_PRIMITIVES[spec.kind];
      if (!primitive) continue;
      const el = primitive.build(spec, doc);
      container.appendChild(el);
      if (timeline) primitive.animate(timeline, el, spec, offset);
    }

    if (timeline) {
      timeline.add(container, { opacity: [0, 1], duration: 300 }, offset);
      timeline.add(container, { opacity: [1, 0], duration: 300 }, offset + duration - 300);
    }
    offset += duration;
  }

  function applyStepped(ms) {
    const clamped = Math.min(Math.max(ms, 0), Math.max(offset - 1, 0));
    const current = windows.find((w) => clamped >= w.start && clamped < w.end) || windows[windows.length - 1];
    for (const w of windows) {
      w.container.className = w === current ? 'sc-scene is-active' : 'sc-scene';
    }
  }

  function seek(ms) {
    if (timeline) { timeline.seek(Math.min(Math.max(ms, 0), offset)); return; }
    applyStepped(ms);
  }

  if (!timeline) applyStepped(0);

  return { timeline, seek, stepped: !timeline, duration: offset };
}
```

- [ ] **Step 4: Run the test**

Run: `node --experimental-default-type=module tests/explainer.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/core/motion-timeline.js tests/explainer.test.mjs
git commit -m "feat(explainer): constructeur de timeline avec repli par paliers"
```

---

### Task 4: Service et repository

**Files:**
- Create: `js/services/explainer.service.js`
- Create: `js/repositories/explainer.repository.js`
- Modify: `js/core/constants.js` (ajouter `EXPLAINER_STATE: 'dut_explainer_v1'` à `STORAGE_KEYS`)
- Test: `tests/explainer.test.mjs` (ajouts)

**Interfaces:**
- Consumes: `storyboard`, `TOTAL_DURATION_MS` (Tâche 1) ; `readObject`/`writeObject` de `js/core/storage.js`.
- Produces:
  - Repository : `getExplainerState() → { lastChapterId, lastPositionMs, dismissed }`, `saveExplainerProgress(chapterId, positionMs)`, `setExplainerDismissed(flag)`.
  - Service : `resolveTimings(rawTimings) → { byScene, byChapter, total }`, `getChapters() → [{id, number, title, startMs, durationMs}]`, `createPlaybackState() → { requestSeek(ms), markReady(), isPending(), flush() }`, `buildVtt(chapterId) → string`, `buildTranscript() → string`.

- [ ] **Step 1: Write the failing test**

Ajouter à `tests/explainer.test.mjs` :

```js
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, v),
  removeItem: (k) => store.delete(k),
};

const { resolveTimings, getChapters, createPlaybackState, buildVtt } =
  await import('../js/services/explainer.service.js');
const { getExplainerState, saveExplainerProgress, setExplainerDismissed } =
  await import('../js/repositories/explainer.repository.js');

// Timings absents : on retombe sur les durées cibles, jamais de NaN.
// (Couvre Review Focus n°1.)
const noTimings = resolveTimings(null);
assert.equal(noTimings.total, TOTAL_DURATION_MS);
assert.ok(Object.values(noTimings.byScene).every(Number.isFinite));

// Timings partiels : les scènes mesurées utilisent la mesure, les autres la cible.
const partial = resolveTimings({ '1.2': 13500 });
assert.equal(partial.byScene['1.2'], 13500);
assert.equal(partial.byScene['1.3'], 12000);
assert.equal(partial.total, TOTAL_DURATION_MS + 1500);

// Timings corrompus : valeurs non numériques ou négatives ignorées sans produire NaN.
const corrupt = resolveTimings({ '1.2': 'douze', '1.3': -4000, '1.4': null });
assert.equal(corrupt.byScene['1.2'], 12000);
assert.equal(corrupt.byScene['1.3'], 12000);
assert.ok(Number.isFinite(corrupt.total));

// Chapitrage : positions de départ cumulées.
const chapters = getChapters();
assert.equal(chapters.length, 5);
assert.equal(chapters[0].startMs, 0);
assert.equal(chapters[1].startMs, 55000);

// Saut demandé avant que l'audio soit prêt : mémorisé puis rejoué.
// (Couvre Review Focus n°4.)
const playback = createPlaybackState();
playback.requestSeek(42000);
assert.equal(playback.isPending(), true);
assert.equal(playback.flush(), null, 'rien à rejouer tant que la piste n’est pas prête');
playback.markReady();
assert.equal(playback.flush(), 42000);
assert.equal(playback.isPending(), false);
assert.equal(playback.flush(), null, 'un saut n’est rejoué qu’une fois');

// WebVTT : en-tête valide, un cue par scène parlée, timecodes croissants.
const vtt = buildVtt('ch1');
assert.ok(vtt.startsWith('WEBVTT\n'));
const cues = vtt.split('\n\n').filter((b) => b.includes('-->'));
assert.equal(cues.length, storyboard.chapters[0].scenes.filter((s) => s.narration).length);
assert.ok(/^00:00:02\.000 --> 00:00:14\.000$/m.test(vtt));

// Repository : état par défaut, persistance, relecture.
assert.deepEqual(getExplainerState(), { lastChapterId: null, lastPositionMs: 0, dismissed: false });
saveExplainerProgress('ch2', 12345);
assert.deepEqual(getExplainerState(), { lastChapterId: 'ch2', lastPositionMs: 12345, dismissed: false });
setExplainerDismissed(true);
assert.equal(getExplainerState().dismissed, true);
assert.equal(getExplainerState().lastPositionMs, 12345, 'dismissed ne doit pas écraser la progression');

console.log('Service : timings partiels et corrompus, chapitrage, saut différé, WebVTT. Repository : persistance.');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-default-type=module tests/explainer.test.mjs`
Expected: FAIL — `Cannot find module '../js/services/explainer.service.js'`

- [ ] **Step 3: Implémenter le repository**

```js
import { STORAGE_KEYS } from '../core/constants.js';
import { readObject, writeObject } from '../core/storage.js';

const DEFAULT_STATE = { lastChapterId: null, lastPositionMs: 0, dismissed: false };

export function getExplainerState() {
  const raw = readObject(STORAGE_KEYS.EXPLAINER_STATE, null);
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_STATE };
  return {
    lastChapterId: typeof raw.lastChapterId === 'string' ? raw.lastChapterId : null,
    lastPositionMs: Number.isFinite(raw.lastPositionMs) ? raw.lastPositionMs : 0,
    dismissed: raw.dismissed === true,
  };
}

export function saveExplainerProgress(chapterId, positionMs) {
  const state = getExplainerState();
  state.lastChapterId = chapterId;
  state.lastPositionMs = Number.isFinite(positionMs) ? positionMs : 0;
  writeObject(STORAGE_KEYS.EXPLAINER_STATE, state);
  return state;
}

export function setExplainerDismissed(flag) {
  const state = getExplainerState();
  state.dismissed = flag === true;
  writeObject(STORAGE_KEYS.EXPLAINER_STATE, state);
  return state;
}
```

- [ ] **Step 4: Implémenter le service**

```js
import { storyboard } from '../data/storyboard.js';

function formatVttTime(ms) {
  const total = Math.max(0, Math.round(ms));
  const h = String(Math.floor(total / 3600000)).padStart(2, '0');
  const m = String(Math.floor((total % 3600000) / 60000)).padStart(2, '0');
  const s = String(Math.floor((total % 60000) / 1000)).padStart(2, '0');
  const msPart = String(total % 1000).padStart(3, '0');
  return `${h}:${m}:${s}.${msPart}`;
}

/**
 * Fusionne les durées mesurées avec les durées cibles du storyboard.
 * Une mesure absente, non numérique ou négative est ignorée au profit de la cible.
 */
export function resolveTimings(rawTimings) {
  const measured = rawTimings && typeof rawTimings === 'object' ? rawTimings : {};
  const byScene = {};
  const byChapter = {};
  let total = 0;

  for (const chapter of storyboard.chapters) {
    let chapterTotal = 0;
    for (const scene of chapter.scenes) {
      const candidate = Number(measured[scene.id]);
      const duration = Number.isFinite(candidate) && candidate > 0 ? candidate : scene.duration;
      byScene[scene.id] = duration;
      chapterTotal += duration;
    }
    byChapter[chapter.id] = chapterTotal || chapter.duration;
    total += byChapter[chapter.id];
  }
  return { byScene, byChapter, total };
}

export function getChapters() {
  let startMs = 0;
  return storyboard.chapters.map((chapter) => {
    const entry = { id: chapter.id, number: chapter.number, title: chapter.title, startMs, durationMs: chapter.duration };
    startMs += chapter.duration;
    return entry;
  });
}

/**
 * Mémorise un saut demandé avant que la piste audio soit prête, pour le rejouer
 * une seule fois dès qu'elle l'est.
 */
export function createPlaybackState() {
  let ready = false;
  let pending = null;
  return {
    markReady() { ready = true; },
    requestSeek(ms) { if (Number.isFinite(ms)) pending = ms; },
    isPending() { return pending !== null; },
    flush() {
      if (!ready || pending === null) return null;
      const value = pending;
      pending = null;
      return value;
    },
  };
}

export function buildVtt(chapterId) {
  const chapter = storyboard.chapters.find((c) => c.id === chapterId);
  if (!chapter) return 'WEBVTT\n';
  const blocks = ['WEBVTT'];
  for (const scene of chapter.scenes) {
    if (!scene.narration) continue;
    blocks.push(`${scene.id}\n${formatVttTime(scene.at)} --> ${formatVttTime(scene.at + scene.duration)}\n${scene.narration}`);
  }
  return `${blocks.join('\n\n')}\n`;
}

export function buildTranscript() {
  return storyboard.chapters
    .map((chapter) => {
      const lines = chapter.scenes.filter((s) => s.narration).map((s) => s.narration);
      return `## Chapitre ${chapter.number} — ${chapter.title}\n\n${lines.join('\n\n')}`;
    })
    .join('\n\n');
}
```

- [ ] **Step 5: Run the test**

Run: `node --experimental-default-type=module tests/explainer.test.mjs`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add js/services/explainer.service.js js/repositories/explainer.repository.js js/core/constants.js tests/explainer.test.mjs
git commit -m "feat(explainer): service de timecodes et repository de progression"
```

---

### Task 5: Vue, lecteur et route

**Files:**
- Create: `js/views/decouvrir.view.js`
- Modify: `js/app.js` (import + `registerRoute('/decouvrir', …)`)
- Modify: `index.html` (ajout de `css/explainer.css`)
- Modify: `css/explainer.css` (mise à l'échelle de la scène, contrôles)
- Test: `tests/explainer.test.mjs` (ajouts)

**Interfaces:**
- Consumes: `buildChapter` (Tâche 3), `resolveTimings`/`getChapters`/`createPlaybackState`/`buildVtt` (Tâche 4), repository (Tâche 4).
- Produces: `render(root, params)` conforme aux autres vues ; `computeStageScale(containerWidth, containerHeight) → number` exportée pour test ; en mode `?render=1`, `window.__explainer = { seek, duration, chapters, ready }`.

- [ ] **Step 1: Write the failing test**

Ajouter à `tests/explainer.test.mjs` :

```js
const { computeStageScale } = await import('../js/views/decouvrir.view.js');

// Mise à l'échelle : jamais de débordement, ratio 16:9 préservé, jamais d'agrandissement.
// (Couvre Review Focus n°3.)
assert.equal(computeStageScale(1920, 1080), 1);
assert.equal(computeStageScale(960, 540), 0.5);
assert.equal(computeStageScale(3840, 2160), 1, 'pas d’agrandissement au-delà de 1920×1080');
assert.equal(computeStageScale(960, 2000), 0.5, 'limité par la largeur');
assert.equal(computeStageScale(3840, 540), 0.5, 'limité par la hauteur');

// Largeur téléphone : la scène tient, l’échelle reste strictement positive.
const phone = computeStageScale(360, 640);
assert.ok(phone > 0 && phone <= 1);
assert.ok(1920 * phone <= 360 + 0.5, 'débordement horizontal');

// Conteneur dégénéré : pas de division par zéro, pas de NaN.
assert.ok(Number.isFinite(computeStageScale(0, 0)));
assert.ok(computeStageScale(0, 0) > 0);

console.log('Vue : mise à l’échelle de la scène bornée, sans débordement ni NaN.');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-default-type=module tests/explainer.test.mjs`
Expected: FAIL — `Cannot find module '../js/views/decouvrir.view.js'`

- [ ] **Step 3: Implémenter la mise à l'échelle et la vue**

Dans `js/views/decouvrir.view.js` :

```js
import { storyboard } from '../data/storyboard.js';
import { buildChapter } from '../core/motion-timeline.js';
import { resolveTimings, getChapters, createPlaybackState, buildVtt } from '../services/explainer.service.js';
import { getExplainerState, saveExplainerProgress } from '../repositories/explainer.repository.js';

const MIN_SCALE = 0.05;

/** Échelle à appliquer à la scène 1920×1080 pour qu'elle tienne sans jamais être agrandie. */
export function computeStageScale(containerWidth, containerHeight) {
  const w = Number(containerWidth) > 0 ? Number(containerWidth) : storyboard.width;
  const h = Number(containerHeight) > 0 ? Number(containerHeight) : storyboard.height;
  const scale = Math.min(w / storyboard.width, h / storyboard.height, 1);
  return Number.isFinite(scale) && scale > MIN_SCALE ? scale : MIN_SCALE;
}
```

Le reste de la vue :

- Rend `.explainer`, contenant `.explainer-viewport > .scene-stage` puis `.explainer-controls` **hors** de `.scene-stage`.
- Applique l'échelle via `style.setProperty('--stage-scale', …)` sur `.explainer-viewport` — une variable CSS, pas du style de présentation en dur, et recalculée sur `resize`.
- Contrôles : lecture/pause, 5 boutons de chapitre, barre de temps, bascule des sous-titres, vitesse. Écouteurs par `addEventListener`, jamais d'`onclick` inline.
- **La voix est l'horloge** : `audio.addEventListener('timeupdate', () => built.seek(audio.currentTime * 1000))`. Un saut utilisateur déplace `audio.currentTime` ; la timeline suit.
- Si aucune piste audio n'est disponible, une horloge interne pilote `seek()` et les sous-titres restent affichés — lecture muette, jamais d'écran noir.
- `createPlaybackState()` absorbe les sauts demandés avant `canplaythrough`, puis `flush()` les rejoue.
- Progression enregistrée par `saveExplainerProgress` au changement de chapitre et à la pause.
- Mode `?render=1` : `.explainer-controls` n'est pas rendu, et `window.__explainer = { seek, duration, chapters, ready }` est exposé.

Dans `js/app.js`, à la suite des autres routes :

```js
registerRoute('/decouvrir', withShell(decouvrirView, ['Découvrir', 'Comment fonctionne le DUT']));
```

Pas d'option `permission` : la vue est accessible à tous les rôles connectés, comme le prévoit la spec.

- [ ] **Step 4: Run the test**

Run: `node --experimental-default-type=module tests/explainer.test.mjs`
Expected: PASS

- [ ] **Step 5: Vérification manuelle**

Run: `python3 -m http.server 8080`, ouvrir `http://localhost:8080/#/decouvrir`.
Attendu : le chapitre 1 se déroule du carton de titre aux trois pictos ; la scène reste en 16:9 en réduisant la fenêtre jusqu'à 360 px de large, sans barre de défilement horizontale.

- [ ] **Step 6: Commit**

```bash
git add js/views/decouvrir.view.js js/app.js index.html css/explainer.css tests/explainer.test.mjs
git commit -m "feat(explainer): vue #/decouvrir, lecteur et route"
```

---

### Task 6: Chapitre 2 — le parcours, acteur par acteur

**Files:**
- Modify: `js/data/storyboard.js` (chapitre `ch2`)
- Create: `assets/explainer/creation.png`, `antenne.png`, `impression.png`, `controle.png` (recadrages depuis `docs/manual-assets/`)
- Test: `tests/explainer-assets.test.mjs`

**Interfaces:**
- Consumes: primitives `actor`, `doc`, `flow`, `screen`, `callout`, `title` (Tâche 2).
- Produces: `ch2` renseigné, 9 scènes, 130 000 ms.

- [ ] **Step 1: Write the failing test**

Créer `tests/explainer-assets.test.mjs` :

```js
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { storyboard } from '../js/data/storyboard.js';

// Tout fichier référencé par le storyboard existe sur le disque.
// (Couvre Review Focus n°5.)
const missing = [];
for (const chapter of storyboard.chapters) {
  for (const scene of chapter.scenes) {
    for (const item of scene.stage || []) {
      if (item.kind !== 'screen') continue;
      const path = `assets/explainer/${item.src}`;
      if (!existsSync(path)) { missing.push(`${chapter.id}/${scene.id} → ${path}`); continue; }
      assert.ok(statSync(path).size > 0, `${path} est vide`);
      assert.ok(item.alt && item.alt.length > 10, `${path} : texte alternatif absent ou trop court`);
    }
  }
}
assert.deepEqual(missing, [], `captures référencées mais absentes :\n${missing.join('\n')}`);

console.log('Assets : toutes les captures référencées existent, non vides, avec texte alternatif.');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-default-type=module tests/explainer-assets.test.mjs`
Expected: FAIL — les quatre captures de `ch2` sont référencées mais absentes de `assets/explainer/`.

- [ ] **Step 3: Renseigner `ch2` dans le storyboard**

Remplacer `{ id: 'ch2', …, scenes: [] }` par les 9 scènes ci-dessous. Narration ≈ 320 mots.

| Scène | `at` | `duration` | Narration | Stage |
|---|---|---|---|---|
| 2.1 | 0 | 2000 | — | `titleCard('2.1','Chapitre 2','Le parcours d’un DUT')` |
| 2.2 | 2000 | 16000 | « Tout commence chez le partenaire : un commissionnaire, un transporteur, un chargeur. Il ouvre un dossier et décrit le transport — la marchandise, le véhicule, le conducteur, l’itinéraire. » | `actor` `partner` (live), `screen` `creation.png` (highlight sur le formulaire), `title` |
| 2.3 | 18000 | 10000 | « Quand le dossier est complet, il le soumet. » | `doc` `dut`, `flow` `partner → antenne` |
| 2.4 | 28000 | 20000 | « L’antenne OIC prend le relais. L’agent vérifie les pièces et la cohérence du dossier. S’il manque quelque chose, il renvoie le dossier avec un motif de rejet obligatoire — le partenaire corrige, puis resoumet. » | `actor` `antenne` (live), `screen` `antenne.png`, `flow` retour `antenne → partner`, `callout` « Motif de rejet obligatoire » |
| 2.5 | 48000 | 18000 | « À la validation, et seulement à ce moment-là, le dossier reçoit son numéro officiel, pris sur une plage allouée à l’antenne. Précisons-le franchement : dans le dispositif actuel de l’OIC, cette vérification par l’antenne n’existe pas — le partenaire consomme directement un numéro de son stock. Ce contrôle est une amélioration proposée pour le futur système. » | `doc` `dut` avec `number: 'CI-2026-004812'`, `callout` « Amélioration proposée, pas l’existant » (`tone: 'info'`) |
| 2.6 | 66000 | 22000 | « Le DUT devient alors imprimable, recto-verso, avec son code QR. Chaque impression est enregistrée : à partir de la deuxième, un motif est exigé. » | `screen` `impression.png`, `doc` avec `qr: true` |
| 2.7 | 88000 | 12000 | « Le transporteur prend la route, le document l’accompagne. » | `actor` `transporteur` (live), `flow` long |
| 2.8 | 100000 | 18000 | « Au contrôle, l’agent scanne le code QR. » | `actor` `controle` (live), `screen` `controle.png` |
| 2.9 | 118000 | 12000 | « Et chaque geste — création, rejet, validation, impression, contrôle — s’inscrit dans un journal d’audit que personne ne peut modifier ni effacer. » | `title` « Journal d’audit », `picto` `lock` « Ajout seul », 6 `callout` en cascade |

Somme : 2000 + 16000 + 10000 + 20000 + 18000 + 22000 + 12000 + 18000 + 12000 = **130 000 ms**. ✓

- [ ] **Step 4: Produire les quatre captures recadrées**

Recadrer depuis `docs/manual-assets/` vers `assets/explainer/`, en resserrant sur la zone utile (la spec R5 : un cadrage serré vieillit mieux qu'une capture plein écran).

```bash
mkdir -p assets/explainer
for f in creation antenne impression controle; do
  sips -s format png "docs/manual-assets/$f.png" --out "assets/explainer/$f.png"
done
```

Puis recadrer manuellement sur la zone pertinente de chaque écran (formulaire de création, panneau de revue, aperçu d'impression, résultat de contrôle). `sips --cropToHeightWidth` convient si le recadrage est centré.

- [ ] **Step 5: Run the tests**

Run: `node --experimental-default-type=module tests/explainer-assets.test.mjs`
Expected: PASS

Run: `node --experimental-default-type=module tests/explainer.test.mjs`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add js/data/storyboard.js assets/explainer tests/explainer-assets.test.mjs
git commit -m "feat(explainer): chapitre 2, le parcours d'un DUT acteur par acteur"
```

---

### Task 7: Chapitres 3, 4 et 5, et scènes sur mesure

**Files:**
- Modify: `js/data/storyboard.js` (`ch3`, `ch4`, `ch5`)
- Create: `js/views/explainer/custom/carte-depart.js`, `copie-retiree.js`, `architecture-cible.js`
- Modify: `js/core/motion-timeline.js` (résolution des rendus sur mesure)
- Create: `assets/explainer/plages.png`, `oic.png`, `antennes.png`, `actions.png`
- Test: `tests/explainer.test.mjs` (réactivation des deux assertions de la Tâche 1)

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: `CUSTOM_SCENES` (objet indexé par identifiant) exporté par `js/views/explainer/custom/index.js`, même contrat que les primitives : `build(scene, doc) → HTMLElement`, `animate(tl, el, scene, offsetMs)`.

- [ ] **Step 1: Réactiver les assertions de la Tâche 1**

Dans `tests/explainer.test.mjs`, décommenter les deux assertions marquées `// réactivé en Tâche 7` :

```js
assert.equal(storyboard.chapters.reduce((n, c) => n + c.scenes.length, 0), 28);
assert.equal(storyboard.chapters.reduce((n, c) => n + c.duration, 0), TOTAL_DURATION_MS);
```

Ajouter la vérification du registre sur mesure :

```js
const { CUSTOM_SCENES } = await import('../js/views/explainer/custom/index.js');
const referenced = storyboard.chapters.flatMap((c) => c.scenes.map((s) => s.custom)).filter(Boolean);
assert.deepEqual([...new Set(referenced)].sort(), ['architecture-cible', 'carte-depart', 'copie-retiree']);
for (const id of referenced) {
  assert.ok(CUSTOM_SCENES[id], `scène sur mesure « ${id} » non implémentée`);
  assert.equal(typeof CUSTOM_SCENES[id].build, 'function');
  assert.equal(typeof CUSTOM_SCENES[id].animate, 'function');
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-default-type=module tests/explainer.test.mjs`
Expected: FAIL — 5 scènes trouvées au lieu de 28, et module `custom/index.js` introuvable.

- [ ] **Step 3: Renseigner `ch3` (50 000 ms, 5 scènes, ≈120 mots)**

| Scène | `at` | `duration` | Narration | Stage |
|---|---|---|---|---|
| 3.1 | 0 | 2000 | — | `titleCard('3.1','Chapitre 3','Pourquoi c’est infalsifiable')` |
| 3.2 | 2000 | 14000 | « Le code QR imprimé sur un DUT ne contient aucune donnée de transport. Rien que ceci : un jeton opaque, tiré au hasard, qui ne dit rien de la marchandise ni du transporteur. » | `title`, `doc` `qr: true`, `callout` `oicdut://verify/<jeton>` (`tone: 'info'`) |
| 3.3 | 16000 | 14000 | « Le scanner ne lit donc pas le document : il interroge le système. Et c’est le système qui répond. Ce qui est imprimé sur le papier n’a aucune autorité. » | `flow` `doc → systeme`, `actor` `systeme` (live), `callout` « Le papier ne fait pas autorité » |
| 3.4 | 30000 | 12000 | « Prenons une copie. Même papier, même QR, même numéro. Le scan interroge le système — et le système répond : retiré. » | `custom: 'copie-retiree'` |
| 3.5 | 42000 | 8000 | « À cela s’ajoutent les statuts qui pilotent l’impression, le rang de génération, et une empreinte du contenu. » | `picto` ×3 : `stamp` « Statuts et filigranes », `layers` « Rang de génération », `fingerprint` « Empreinte SHA-256 » |

Somme : 2000 + 14000 + 14000 + 12000 + 8000 = **50 000 ms**. ✓

- [ ] **Step 4: Renseigner `ch4` (40 000 ms, 5 scènes, ≈95 mots)**

| Scène | `at` | `duration` | Narration | Stage |
|---|---|---|---|---|
| 4.1 | 0 | 2000 | — | `titleCard('4.1','Chapitre 4','Piloter le dispositif')` |
| 4.2 | 2000 | 12000 | « Côté OIC, tout part des plages de numéros : une antenne en demande, l’OIC alloue, et chaque numéro consommé est connu. » | `screen` `plages.png` |
| 4.3 | 14000 | 12000 | « Les DUT émis deviennent alors une statistique : volumes, délais de traitement, corridors, tonnages. » | `screen` `oic.png` |
| 4.4 | 26000 | 8000 | « Le réseau des antennes est cartographié. » | `screen` `antennes.png` |
| 4.5 | 34000 | 6000 | « Et l’administration des utilisateurs et des rôles reste entre les mains de l’OIC. » | `screen` `actions.png` |

Somme : 2000 + 12000 + 12000 + 8000 + 6000 = **40 000 ms**. ✓

- [ ] **Step 5: Renseigner `ch5` (25 000 ms, 4 scènes, ≈57 mots)**

| Scène | `at` | `duration` | Narration | Stage |
|---|---|---|---|---|
| 5.1 | 0 | 2000 | — | `titleCard('5.1','Chapitre 5','Du POC au système réel')` |
| 5.2 | 2000 | 10000 | « Soyons clairs sur ce que vous venez de voir : une démonstration qui tourne dans un navigateur, sur des données fictives, sans serveur. Elle montre les concepts, elle ne les sécurise pas. » | `title` « Ce que cette démonstration est », `picto` ×3 : `monitor` « Navigateur seul », `database` « Données de démonstration », `alert-triangle` « Pas un dispositif de sécurité » |
| 5.3 | 12000 | 10000 | « Le système réel, lui, reposerait sur une architecture éprouvée : Angular et NestJS, PostgreSQL avec PostGIS, Keycloak pour les identités, un stockage objet pour les pièces, et une signature électronique conforme. » | `custom: 'architecture-cible'` |
| 5.4 | 22000 | 3000 | « Office Ivoirien des Chargeurs. Document Unique de Transport. » | `title` variant `card` |

Somme : 2000 + 10000 + 10000 + 3000 = **25 000 ms**. ✓

- [ ] **Step 6: Implémenter les trois scènes sur mesure**

`js/views/explainer/custom/copie-retiree.js` :

```js
/**
 * Scène pivot du chapitre 3 : un DUT, sa photocopie, le scan, et la réponse
 * du système. Sur mesure parce que la séquence enchaîne quatre états sur un
 * même objet — ce qu'aucune primitive ne sait faire.
 */
export const id = 'copie-retiree';

export function build(scene, doc) {
  const el = doc.createElement('div');
  el.className = 'sc-custom sc-copie-retiree';

  const original = doc.createElement('div');
  original.className = 'sc-doc sc-copie-original';
  original.dataset.stageId = 'original';
  el.appendChild(original);

  const copy = doc.createElement('div');
  copy.className = 'sc-doc sc-copie-copie';
  copy.dataset.stageId = 'copie';
  el.appendChild(copy);

  const beam = doc.createElement('div');
  beam.className = 'sc-copie-beam';
  el.appendChild(beam);

  const verdict = doc.createElement('div');
  verdict.className = 'sc-copie-verdict';
  verdict.textContent = 'RETIRÉ';
  el.appendChild(verdict);

  return el;
}

export function animate(tl, el, scene, offsetMs) {
  const q = (selector) => el.querySelector(selector);
  tl.add(q('.sc-copie-original'), { opacity: [0, 1], duration: 500 }, offsetMs);
  tl.add(q('.sc-copie-copie'), { opacity: [0, 1], translateX: [0, 240], duration: 700 }, offsetMs + 2000);
  tl.add(q('.sc-copie-beam'), { opacity: [0, 1, 0], scaleY: [0, 1, 1], duration: 1200 }, offsetMs + 4500);
  tl.add(q('.sc-copie-verdict'), { opacity: [0, 1], scale: [1.35, 1], duration: 600 }, offsetMs + 6500);
}
```

`carte-depart.js` : carte de Côte d'Ivoire en SVG inline, point d'Abidjan, tracé de route animé par `strokeDashoffset`, camion suivant le tracé.
`architecture-cible.js` : six blocs nommés (Angular, NestJS, PostgreSQL/PostGIS, Keycloak, MinIO, PAdES) apparaissant en cascade avec leurs liens.

`js/views/explainer/custom/index.js` :

```js
import * as carteDepart from './carte-depart.js';
import * as copieRetiree from './copie-retiree.js';
import * as architectureCible from './architecture-cible.js';

export const CUSTOM_SCENES = Object.fromEntries(
  [carteDepart, copieRetiree, architectureCible].map((m) => [m.id, m]),
);
```

- [ ] **Step 7: Brancher les scènes sur mesure dans le constructeur**

Dans `js/core/motion-timeline.js`, ajouter l'import `CUSTOM_SCENES` et, dans la boucle sur les scènes, avant la boucle sur `scene.stage` :

```js
    if (scene.custom) {
      const custom = CUSTOM_SCENES[scene.custom];
      if (custom) {
        const el = custom.build(scene, doc);
        container.appendChild(el);
        if (timeline) custom.animate(timeline, el, scene, offset);
      }
    }
```

- [ ] **Step 8: Produire les quatre captures du chapitre 4**

```bash
for f in plages oic antennes actions; do
  sips -s format png "docs/manual-assets/$f.png" --out "assets/explainer/$f.png"
done
```

Recadrer sur la zone utile de chaque écran.

- [ ] **Step 9: Run the tests**

Run: `node --experimental-default-type=module --test tests/*.test.mjs`
Expected: PASS — 28 scènes, 300 000 ms, tous les assets présents.

- [ ] **Step 10: Commit**

```bash
git add js/data/storyboard.js js/views/explainer/custom js/core/motion-timeline.js assets/explainer tests/explainer.test.mjs
git commit -m "feat(explainer): chapitres 3 à 5 et scènes sur mesure"
```

---

### Task 8: Sous-titres, transcription et garde-fou de déterminisme

**Files:**
- Create: `scripts/build-explainer-subtitles.mjs`
- Create: `docs/explainer-transcription.md` (généré)
- Modify: `js/views/decouvrir.view.js` (piste `<track>` et bascule)
- Test: `tests/explainer.test.mjs` (ajouts)

**Interfaces:**
- Consumes: `buildVtt`, `buildTranscript` (Tâche 4).
- Produces: `audio/explainer/<chapterId>.vtt` ×5, `docs/explainer-transcription.md`.

- [ ] **Step 1: Write the failing test**

Ajouter à `tests/explainer.test.mjs` :

```js
import { readFileSync } from 'node:fs';

// Garde-fou de déterminisme : aucune transition ni animation CSS dans l'explainer.
// Une seule violation suffirait à faire diverger le MP4 de ce qu'on voit à l'écran.
const explainerCss = readFileSync('css/explainer.css', 'utf8');
const forbidden = [/\btransition\s*:/i, /\banimation\s*:/i, /@keyframes/i];
for (const pattern of forbidden) {
  assert.ok(!pattern.test(explainerCss),
    `css/explainer.css contient ${pattern} — interdit par le contrat de déterminisme`);
}

// Le WebVTT de chaque chapitre est valide et ses cues sont strictement croissants.
for (const chapter of storyboard.chapters) {
  const vtt = buildVtt(chapter.id);
  assert.ok(vtt.startsWith('WEBVTT\n'), `${chapter.id} : en-tête WEBVTT absent`);
  const starts = [...vtt.matchAll(/^(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})$/gm)];
  assert.ok(starts.length > 0, `${chapter.id} : aucun cue`);
  for (let i = 1; i < starts.length; i += 1) {
    assert.ok(starts[i][1] >= starts[i - 1][2], `${chapter.id} : cues non croissants`);
  }
}

// La transcription couvre les cinq chapitres.
const transcript = buildTranscript();
for (const chapter of storyboard.chapters) {
  assert.ok(transcript.includes(chapter.title), `transcription : ${chapter.title} absent`);
}

console.log('Déterminisme : aucune transition CSS. Sous-titres et transcription conformes.');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-default-type=module tests/explainer.test.mjs`
Expected: FAIL si `css/explainer.css` contient encore une `transition` héritée de la Tâche 2 ; sinon FAIL sur `buildTranscript` non importé.

- [ ] **Step 3: Nettoyer le CSS et écrire le générateur**

Retirer toute `transition`, `animation` et `@keyframes` de `css/explainer.css`.

`scripts/build-explainer-subtitles.mjs` :

```js
import { writeFileSync, mkdirSync } from 'node:fs';
import { storyboard } from '../js/data/storyboard.js';
import { buildVtt, buildTranscript } from '../js/services/explainer.service.js';

mkdirSync('audio/explainer', { recursive: true });
for (const chapter of storyboard.chapters) {
  writeFileSync(`audio/explainer/${chapter.id}.vtt`, buildVtt(chapter.id), 'utf8');
  console.log(`audio/explainer/${chapter.id}.vtt`);
}
writeFileSync('docs/explainer-transcription.md',
  `# Transcription — vidéo explicative DUT\n\n${buildTranscript()}\n`, 'utf8');
console.log('docs/explainer-transcription.md');
```

- [ ] **Step 4: Générer et brancher**

Run: `node --experimental-default-type=module scripts/build-explainer-subtitles.mjs`

Dans `js/views/decouvrir.view.js`, ajouter au `<audio>` une piste par chapitre :
`<track kind="subtitles" srclang="fr" label="Français" src="audio/explainer/<chapterId>.vtt">`, et un bouton de bascule qui agit sur `track.mode`.

- [ ] **Step 5: Run the test**

Run: `node --experimental-default-type=module tests/explainer.test.mjs`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add scripts/build-explainer-subtitles.mjs audio/explainer docs/explainer-transcription.md js/views/decouvrir.view.js css/explainer.css tests/explainer.test.mjs
git commit -m "feat(explainer): sous-titres WebVTT, transcription et garde-fou de déterminisme"
```

---

## Phase 2 — Voix et timecodes mesurés

### Task 9: Génération des voix et mesure des durées

**Files:**
- Create: `scripts/tts.mjs`
- Create: `js/data/storyboard.timing.json` (généré)
- Modify: `js/views/decouvrir.view.js` (chargement de `storyboard.timing.json`)
- Modify: `.gitignore` (`audio/explainer/*.m4a`)
- Test: `tests/explainer.test.mjs` (ajouts)

**Interfaces:**
- Consumes: `storyboard` (Tâche 1), `resolveTimings` (Tâche 4).
- Produces: `audio/explainer/<sceneId>.m4a` par scène parlée, `audio/explainer/<chapterId>.m4a` concaténé, `js/data/storyboard.timing.json` au format `{ "<sceneId>": <ms>, … }`.

- [ ] **Step 1: Write the failing test**

Ajouter à `tests/explainer.test.mjs` :

```js
const { planTtsSegments, parseAfinfoDuration } = await import('../scripts/tts.mjs');

// Un segment par scène parlée, aucun pour les cartons de titre.
const segments = planTtsSegments(storyboard);
const spoken = storyboard.chapters.flatMap((c) => c.scenes).filter((s) => s.narration);
assert.equal(segments.length, spoken.length);
assert.equal(segments.filter((s) => s.sceneId.endsWith('.1')).length, 0,
  'les cartons de titre ne doivent pas être sonorisés');
for (const segment of segments) {
  assert.ok(segment.text.length > 0);
  assert.ok(segment.out.startsWith('audio/explainer/'));
  assert.ok(segment.out.endsWith('.m4a'));
}

// Lecture de la durée réelle depuis la sortie d'afinfo.
assert.equal(parseAfinfoDuration('estimated duration: 13.482993 sec\n'), 13483);
assert.equal(parseAfinfoDuration('rien d’exploitable'), null);
assert.equal(parseAfinfoDuration(''), null);

console.log('TTS : un segment par scène parlée, durées mesurées lues depuis afinfo.');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-default-type=module tests/explainer.test.mjs`
Expected: FAIL — `Cannot find module '../scripts/tts.mjs'`

- [ ] **Step 3: Implémenter `scripts/tts.mjs`**

```js
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { storyboard } from '../js/data/storyboard.js';

const VOICE = process.env.EXPLAINER_VOICE || 'Jacques';
const OUT_DIR = 'audio/explainer';

/** Un segment de voix par scène parlée ; les cartons de titre restent muets. */
export function planTtsSegments(board) {
  const segments = [];
  for (const chapter of board.chapters) {
    for (const scene of chapter.scenes) {
      if (!scene.narration) continue;
      segments.push({
        chapterId: chapter.id,
        sceneId: scene.id,
        text: scene.narration,
        out: `${OUT_DIR}/${scene.id}.m4a`,
      });
    }
  }
  return segments;
}

/** Extrait la durée en millisecondes de la sortie d'`afinfo`. */
export function parseAfinfoDuration(output) {
  const match = /estimated duration:\s*([\d.]+)\s*sec/i.exec(String(output));
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) ? Math.round(seconds * 1000) : null;
}

function requireTool(binary, hint) {
  try { execFileSync('which', [binary], { stdio: 'pipe' }); }
  catch { console.error(`Outil manquant : ${binary}\n${hint}`); process.exit(1); }
}

function main() {
  requireTool('say', 'Commande macOS « say » introuvable — ce script nécessite macOS.');
  requireTool('afinfo', 'Commande macOS « afinfo » introuvable — ce script nécessite macOS.');
  mkdirSync(OUT_DIR, { recursive: true });

  const timings = {};
  for (const segment of planTtsSegments(storyboard)) {
    execFileSync('say', ['-v', VOICE, '-o', segment.out, '--data-format=aac', segment.text]);
    const duration = parseAfinfoDuration(execFileSync('afinfo', [segment.out], { encoding: 'utf8' }));
    if (duration === null) {
      console.error(`Durée illisible pour ${segment.out} — abandon plutôt que d'écrire un timing faux.`);
      process.exit(1);
    }
    timings[segment.sceneId] = duration;
    const target = storyboard.chapters.flatMap((c) => c.scenes).find((s) => s.id === segment.sceneId).duration;
    const drift = Math.round(((duration - target) / target) * 100);
    console.log(`${segment.sceneId} : ${duration} ms (cible ${target} ms, écart ${drift > 0 ? '+' : ''}${drift} %)`);
  }
  writeFileSync('js/data/storyboard.timing.json', `${JSON.stringify(timings, null, 2)}\n`, 'utf8');
  console.log(`\n${Object.keys(timings).length} segments. js/data/storyboard.timing.json écrit.`);
}

if (process.argv[1] && process.argv[1].endsWith('tts.mjs')) main();
```

> **Substitution d'une voix humaine :** déposer les fichiers enregistrés sous `audio/explainer/<sceneId>.m4a` et relancer `node --experimental-default-type=module scripts/tts.mjs --measure-only`. Le script mesure les fichiers existants sans les regénérer et réécrit `storyboard.timing.json` : l'animation se recale seule. Implémenter cette option en sautant l'appel à `say` quand `existsSync(segment.out)` et que `--measure-only` est passé.

- [ ] **Step 4: Run the test**

Run: `node --experimental-default-type=module tests/explainer.test.mjs`
Expected: PASS

- [ ] **Step 5: Générer les voix**

Run: `node --experimental-default-type=module scripts/tts.mjs`
Attendu : 23 segments (28 scènes moins 5 cartons), un écart affiché par scène. **Tout écart supérieur à ±20 % signale un texte à réécrire** : c'est le texte qui s'adapte au minutage, pas l'inverse.

- [ ] **Step 6: Brancher les timings dans la vue**

Dans `js/views/decouvrir.view.js` :

```js
let rawTimings = null;
try {
  const response = await fetch('js/data/storyboard.timing.json', { cache: 'no-cache' });
  if (response.ok) rawTimings = await response.json();
} catch { /* durées cibles du storyboard : voir ci-dessous */ }

const timings = resolveTimings(rawTimings);
const built = buildChapter(chapter, { doc: document, root: stageEl, timings: timings.byScene });
```

`buildChapter` attend **`timings.byScene`**, pas l'objet complet rendu par `resolveTimings` — c'est une table `{ sceneId: ms }`. **Un échec de chargement n'est pas une erreur** : `rawTimings` reste `null` et les durées cibles s'appliquent (Review Focus n°1, déjà testé en Tâche 4).

- [ ] **Step 7: Commit**

```bash
git add scripts/tts.mjs js/data/storyboard.timing.json js/views/decouvrir.view.js .gitignore tests/explainer.test.mjs
git commit -m "feat(explainer): génération des voix et timecodes mesurés"
```

---

## Phase 3 — Export MP4

> **Phase bloquée.** `ffmpeg` et Playwright sont absents de la machine et leur installation n'a pas été autorisée. Les phases 1 et 2 livrent une animation web complète et jouable sans eux. **Ne pas commencer cette tâche sans accord explicite** sur :
>
> ```bash
> brew install ffmpeg
> cd tools/video-export && npm install && npx playwright install chromium
> ```

### Task 10: Export MP4 déterministe

**Files:**
- Create: `tools/video-export/package.json`, `tools/video-export/render.mjs`, `tools/video-export/README.md`
- Modify: `.gitignore` (`output/video/`, `tools/video-export/node_modules/`)

**Interfaces:**
- Consumes: `window.__explainer = { seek, duration, chapters, ready }` exposé par la vue en mode `?render=1` (Tâche 5).
- Produces: `output/video/<chapterId>.mp4` ×5, `output/video/teaser.mp4`, `output/video/principal.mp4`.

**Pourquoi un dossier isolé :** le projet n'a volontairement aucun `package.json` à la racine et aucun gestionnaire de paquets. Installer Playwright à la racine en créerait un et casserait cette propriété. `tools/video-export/` porte sa propre déclaration de dépendances ; l'application reste intacte.

- [ ] **Step 1: Déclarer l'outil**

`tools/video-export/package.json` :

```json
{
  "name": "dut-video-export",
  "private": true,
  "type": "module",
  "description": "Export MP4 deterministe de la vue #/decouvrir. Outil de developpement, hors application.",
  "scripts": { "render": "node render.mjs" },
  "devDependencies": { "playwright": "^1.64.0" }
}
```

- [ ] **Step 2: Écrire le vérificateur d'outils et le test d'arrêt propre**

Dans `tools/video-export/render.mjs`, avant tout travail :

```js
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

function requireFfmpeg() {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'pipe' });
  } catch {
    console.error(
      'ffmpeg est introuvable.\n' +
      'Installation : brew install ffmpeg\n' +
      'Aucune image n’a été rendue.',
    );
    process.exit(1);
  }
}
```

- [ ] **Step 3: Run it to verify the guard fires**

Run: `node tools/video-export/render.mjs`
Expected: sortie en code 1 avec `Installation : brew install ffmpeg`, **sans trace d'exception**. C'est le comportement attendu tant que la phase est bloquée.

- [ ] **Step 4: Implémenter la boucle de rendu**

```js
import { chromium } from 'playwright';

const FPS = 25;
const WIDTH = 1920;
const HEIGHT = 1080;

async function renderChapter(chapterId, port) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  await page.goto(`http://localhost:${port}/#/decouvrir?render=1&chapitre=${chapterId}`);
  await page.waitForFunction('window.__explainer && window.__explainer.ready === true', { timeout: 30000 });

  const duration = await page.evaluate('window.__explainer.duration');
  const frames = Math.ceil((duration / 1000) * FPS);
  const stage = page.locator('.scene-stage');

  mkdirSync('output/video', { recursive: true });
  const ffmpeg = spawn('ffmpeg', [
    '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', 'pipe:0',
    '-i', `audio/explainer/${chapterId}.m4a`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18',
    '-c:a', 'aac', '-shortest',
    `output/video/${chapterId}.mp4`,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });

  for (let frame = 0; frame < frames; frame += 1) {
    await page.evaluate((ms) => window.__explainer.seek(ms), (frame / FPS) * 1000);
    ffmpeg.stdin.write(await stage.screenshot({ type: 'png' }));
    if (frame % 250 === 0) console.log(`${chapterId} : ${frame}/${frames}`);
  }
  ffmpeg.stdin.end();
  await new Promise((resolve) => ffmpeg.on('close', resolve));
  await browser.close();
}
```

Montages par concaténation :

```js
// output/video/principal.mp4 = ch1 … ch5
execFileSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', 'output/video/montage-principal.txt',
  '-c', 'copy', 'output/video/principal.mp4']);
```

- [ ] **Step 5: Rendre un chapitre et vérifier**

Run: `python3 -m http.server 8080` dans un terminal, puis
`cd tools/video-export && node render.mjs --chapter ch3 --port 8080`
Attendu : `output/video/ch3.mp4`, 1920×1080, 25 images par seconde, ~50 s, voix synchronisée. Vérification : `ffprobe output/video/ch3.mp4`.

- [ ] **Step 6: Rendre tous les chapitres et les montages**

Run: `cd tools/video-export && node render.mjs --all --port 8080`
Attendu : 5 chapitres plus `teaser.mp4` et `principal.mp4`. Durée totale ~15 à 25 min.

- [ ] **Step 7: Commit**

```bash
git add tools/video-export .gitignore
git commit -m "feat(explainer): export MP4 deterministe par capture headless"
```

---

## Ordre d'exécution et dépendances

```
Tâche 1 (storyboard) ─┬─> Tâche 2 (primitives) ──> Tâche 3 (timeline) ─┬─> Tâche 5 (vue)
                      └─> Tâche 4 (service/repo) ───────────────────────┘
Tâche 5 ──> Tâche 6 (ch2) ──> Tâche 7 (ch3-5) ──> Tâche 8 (sous-titres) ──> Tâche 9 (voix) ──> Tâche 10 (export, bloquée)
```

Les Tâches 2 et 4 sont indépendantes l'une de l'autre. À partir de la Tâche 5, la chaîne est séquentielle : chaque tâche consomme le storyboard complété par la précédente.

**Jalon utilisable :** à la fin de la Tâche 8, l'animation web est complète, sous-titrée et jouable sans voix. Les Tâches 9 et 10 ajoutent le son puis le fichier.
