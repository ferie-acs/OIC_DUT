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

// ---------------------------------------------------------------------------
// Tâche 2 — primitives visuelles
// ---------------------------------------------------------------------------

const { STAGE_PRIMITIVES } = await import('../js/views/explainer/stage/index.js');

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
      addEventListener() {},
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
