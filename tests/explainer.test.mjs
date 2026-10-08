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
