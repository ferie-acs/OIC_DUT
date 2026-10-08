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

// Les artefacts générés par scripts/build-explainer-subtitles.mjs sont présents
// et à jour : un chapitre ajouté au storyboard sans régénération est détecté ici.
const { buildVtt, buildTranscript, resolveTimings } = await import('../js/services/explainer.service.js');
const { readFileSync } = await import('node:fs');

// Les cues suivent les durees resolues : le fichier sur disque doit etre
// identique a ce que regenere le generateur avec les memes mesures.
const byScene = resolveTimings(
  existsSync('js/data/storyboard.timing.json')
    ? JSON.parse(readFileSync('js/data/storyboard.timing.json', 'utf8'))
    : null,
).byScene;

for (const chapter of storyboard.chapters) {
  const path = `audio/explainer/${chapter.id}.vtt`;
  assert.ok(existsSync(path), `${path} absent — lancer scripts/build-explainer-subtitles.mjs`);
  assert.equal(readFileSync(path, 'utf8'), buildVtt(chapter.id, byScene),
    `${path} périmé — relancer scripts/build-explainer-subtitles.mjs`);
}

const transcriptPath = 'docs/explainer-transcription.md';
assert.ok(existsSync(transcriptPath), `${transcriptPath} absent — lancer le générateur`);
assert.ok(readFileSync(transcriptPath, 'utf8').includes(buildTranscript()),
  `${transcriptPath} périmé — relancer le générateur`);

console.log(`Sous-titres : ${storyboard.chapters.length} fichiers WebVTT et la transcription présents et à jour.`);
