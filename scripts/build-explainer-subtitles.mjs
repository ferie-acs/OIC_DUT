/**
 * Génère les sous-titres WebVTT (un fichier par chapitre) et la transcription
 * texte depuis le storyboard. Source unique : js/data/storyboard.js.
 *
 * Lancement : node --experimental-default-type=module scripts/build-explainer-subtitles.mjs
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { storyboard } from '../js/data/storyboard.js';
import { buildVtt, buildTranscript, resolveTimings } from '../js/services/explainer.service.js';

// Les cues doivent suivre les durees REELLES de lecture, pas les cibles du
// storyboard : des qu'une voix etire une scene, toutes les suivantes glissent,
// et des sous-titres construits sur les cibles arrivent plusieurs secondes trop
// tot (jusqu'a 3,2 s sur la seconde moitie du chapitre 2).
const TIMING_FILE = 'js/data/storyboard.timing.json';
const rawTimings = existsSync(TIMING_FILE)
  ? JSON.parse(readFileSync(TIMING_FILE, 'utf8'))
  : null;
const byScene = resolveTimings(rawTimings).byScene;
if (!rawTimings) console.warn(`${TIMING_FILE} absent : cues construits sur les durees cibles.`);

mkdirSync('audio/explainer', { recursive: true });

for (const chapter of storyboard.chapters) {
  const path = `audio/explainer/${chapter.id}.vtt`;
  writeFileSync(path, buildVtt(chapter.id, byScene), 'utf8');
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
