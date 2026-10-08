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
