import { storyboard } from '../data/storyboard.js';

function formatVttTime(ms) {
  const total = Math.max(0, Math.round(ms));
  const h = String(Math.floor(total / 3600000)).padStart(2, '0');
  const m = String(Math.floor((total % 3600000) / 60000)).padStart(2, '0');
  const s = String(Math.floor((total % 60000) / 1000)).padStart(2, '0');
  const msPart = String(total % 1000).padStart(3, '0');
  return `${h}:${m}:${s}.${msPart}`;
}

/** Silence laissé après la voix pour qu'elle ne bute pas sur le changement de scène. */
const VOICE_TAIL_MS = 600;

/**
 * Fusionne les durées mesurées avec les durées cibles du storyboard.
 *
 * La mesure est un PLANCHER, pas une substitution : une voix plus longue que sa
 * cible étire la scène (plus VOICE_TAIL_MS de silence), une voix plus courte ne
 * la raccourcit pas. Une scène n'est pas réductible à sa phrase — elle a un
 * temps visuel propre, et la durée totale de 5 minutes est une décision de
 * conception, pas un sous-produit du débit de la voix. Sans ce plancher, une
 * voix rapide comprimerait la vidéo et précipiterait toutes les scènes.
 *
 * Une mesure absente, non numérique ou négative est ignorée au profit de la
 * cible : un storyboard.timing.json manquant, partiel ou périmé ne doit jamais
 * produire de NaN dans un seek().
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
      const voice = Number.isFinite(candidate) && candidate > 0 ? candidate + VOICE_TAIL_MS : 0;
      const duration = Math.max(scene.duration, voice);
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
    const entry = {
      id: chapter.id,
      number: chapter.number,
      title: chapter.title,
      startMs,
      durationMs: chapter.duration,
    };
    startMs += chapter.duration;
    return entry;
  });
}

/**
 * Mémorise un saut demandé avant que la piste audio soit prête, pour le rejouer
 * une seule fois dès qu'elle l'est. Sans cela, un clic de chapitre pendant le
 * chargement serait perdu ou désynchroniserait la scène.
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

/**
 * Fenêtres de narration d'un chapitre, calculées sur les durées RÉSOLUES.
 *
 * `scene.at` et `scene.duration` sont les cibles du storyboard ; dès qu'une voix
 * étire une scène (politique de plancher ci-dessus), toutes les scènes suivantes
 * glissent. Construire des cues sur les cibles les décalerait de plusieurs
 * secondes — c'est ce qui rendait les sous-titres incrustés faux.
 */
export function buildCues(chapter, byScene = {}) {
  const cues = [];
  let offset = 0;
  for (const scene of chapter.scenes) {
    const duration = Number(byScene[scene.id]) > 0 ? Number(byScene[scene.id]) : scene.duration;
    if (scene.narration) {
      cues.push({ sceneId: scene.id, start: offset, end: offset + duration, text: scene.narration });
    }
    offset += duration;
  }
  return cues;
}

/**
 * Quelle piste de voix jouer à une position donnée, et à quel décalage interne.
 * Retourne `null` sur un carton de titre, dans le silence de fin d'une scène
 * non narrée, ou hors bornes.
 */
export function voiceCueFor(cues, positionMs) {
  if (!Number.isFinite(positionMs) || positionMs < 0) return null;
  const cue = cues.find((c) => positionMs >= c.start && positionMs < c.end);
  if (!cue) return null;
  return { sceneId: cue.sceneId, offsetMs: positionMs - cue.start, text: cue.text };
}

/**
 * Horloge de lecture. Elle est AUTORITAIRE et la voix la suit, à l'inverse de ce
 * que prévoyait la spec (« la voix est l'horloge ») : la politique de plancher
 * garantit que chaque fenêtre de scène est au moins aussi longue que sa voix,
 * donc une voix maîtresse tronquerait l'animation ; et une piste concaténée par
 * chapitre, qui aurait permis l'inverse, demanderait ffmpeg (risque R1).
 *
 * `tick(now)` reçoit l'horodatage du navigateur ; l'état de lecture vit ici et
 * jamais dans le texte d'un bouton.
 */
export function createClock({ duration }) {
  const total = Number(duration) > 0 ? Number(duration) : 0;
  let playing = false;
  let base = 0;
  let startedAt = null;

  function clamp(ms) {
    return Math.min(Math.max(Number.isFinite(ms) ? ms : 0, 0), total);
  }

  return {
    isPlaying() { return playing; },
    position() { return base; },
    duration() { return total; },
    play() { if (!playing) { playing = true; startedAt = null; } },
    pause() { playing = false; startedAt = null; },
    seek(ms) { base = clamp(ms); startedAt = null; },
    tick(now) {
      if (!playing) return base;
      if (startedAt === null) { startedAt = now; return base; }
      base = clamp(base + (now - startedAt));
      startedAt = now;
      if (base >= total) { playing = false; startedAt = null; }
      return base;
    },
  };
}

export function buildVtt(chapterId, byScene = {}) {
  const chapter = storyboard.chapters.find((c) => c.id === chapterId);
  if (!chapter) return 'WEBVTT\n';
  const blocks = ['WEBVTT'];
  for (const cue of buildCues(chapter, byScene)) {
    blocks.push(`${cue.sceneId}\n${formatVttTime(cue.start)} --> ${formatVttTime(cue.end)}\n${cue.text}`);
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
