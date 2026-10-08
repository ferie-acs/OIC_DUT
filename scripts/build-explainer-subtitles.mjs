/**
 * Génère les sous-titres WebVTT (un fichier par chapitre) et la transcription
 * texte depuis le storyboard. Source unique : js/data/storyboard.js.
 *
 * Lancement : node --experimental-default-type=module scripts/build-explainer-subtitles.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { storyboard } from '../js/data/storyboard.js';
import { buildVtt, buildTranscript } from '../js/services/explainer.service.js';

mkdirSync('audio/explainer', { recursive: true });

for (const chapter of storyboard.chapters) {
  const path = `audio/explainer/${chapter.id}.vtt`;
  writeFileSync(path, buildVtt(chapter.id), 'utf8');
  console.log(path);
}

const header = [
  '# Transcription — vidéo explicative DUT',
  '',
  '> Fichier généré par `scripts/build-explainer-subtitles.mjs`. Ne pas éditer à la main :',
  '> modifier `js/data/storyboard.js` puis relancer le générateur.',
  '',
].join('\n');

writeFileSync('docs/explainer-transcription.md', `${header}${buildTranscript()}\n`, 'utf8');
console.log('docs/explainer-transcription.md');
