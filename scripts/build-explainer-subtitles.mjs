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

// Script d'enregistrement : ce qu'il faut dire, dans quel fichier le deposer,
// et la duree visee. L'animation se recale ensuite sur les durees reelles.
const lines = [
  '# Script d’enregistrement — voix off de la vidéo DUT',
  '',
  '> Fichier généré par `scripts/build-explainer-subtitles.mjs`. Ne pas éditer à la main.',
  '',
  '## Comment enregistrer',
  '',
  '1. Enregistrez **un fichier par segment**, nommé exactement comme la colonne « Fichier ».',
  '2. Déposez-les dans `audio/explainer/` (format `.m4a`, AAC).',
  '3. Lancez : `node --experimental-default-type=module scripts/tts.mjs --measure-only`',
  '4. Relancez ce générateur, puis l’export vidéo. L’animation se recale seule.',
  '',
  'La **durée visée** est indicative : une prise plus longue étire la scène',
  '(aucune voix n’est jamais coupée), une prise plus courte laisse du silence.',
  'Un écart de plus de 20 % est signalé par le script de mesure.',
  '',
];
for (const chapter of storyboard.chapters) {
  const spoken = chapter.scenes.filter((s) => s.narration);
  if (!spoken.length) continue;
  lines.push(`## Chapitre ${chapter.number} — ${chapter.title}`, '');
  lines.push('| Fichier | Durée visée | Texte à dire |', '|---|---|---|');
  for (const scene of spoken) {
    const text = scene.narration.replace(/\|/g, '\\|');
    lines.push(`| \`${scene.id}.m4a\` | ${(scene.duration / 1000).toFixed(0)} s | ${text} |`);
  }
  lines.push('');
}
const totalWords = storyboard.chapters
  .flatMap((c) => c.scenes)
  .filter((s) => s.narration)
  .reduce((n, s) => n + s.narration.split(/\s+/).length, 0);
lines.push(`**Total : ${storyboard.chapters.flatMap((c) => c.scenes).filter((s) => s.narration).length} segments, environ ${totalWords} mots.**`, '');

writeFileSync('docs/explainer-script-enregistrement.md', lines.join('\n'), 'utf8');
console.log('docs/explainer-script-enregistrement.md');
