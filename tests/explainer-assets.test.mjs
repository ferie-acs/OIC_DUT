import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { storyboard } from '../js/data/storyboard.js';

// Tout fichier référencé par le storyboard existe sur le disque.
// (Couvre Review Focus n°5, versant build.)
const missing = [];
let checked = 0;
for (const chapter of storyboard.chapters) {
  for (const scene of chapter.scenes) {
    for (const item of scene.stage || []) {
      if (item.kind !== 'screen') continue;
      checked += 1;
      const path = `assets/explainer/${item.src}`;
      assert.ok(item.alt && item.alt.length > 10,
        `${chapter.id}/${scene.id} → ${path} : texte alternatif absent ou trop court`);
      if (!existsSync(path)) { missing.push(`${chapter.id}/${scene.id} → ${path}`); continue; }
      assert.ok(statSync(path).size > 0, `${path} est vide`);
    }
  }
}
assert.deepEqual(missing, [], `captures référencées mais absentes :\n${missing.join('\n')}`);
assert.ok(checked > 0, 'aucune capture référencée : le storyboard a-t-il perdu ses scènes « screen » ?');

console.log(`Assets : ${checked} captures référencées, toutes présentes, non vides, avec texte alternatif.`);
