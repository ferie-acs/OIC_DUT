import { storyboard } from '../data/storyboard.js';
import { buildChapter } from '../core/motion-timeline.js';
import { resolveTimings, getChapters, createPlaybackState } from '../services/explainer.service.js';
import { getExplainerState, saveExplainerProgress } from '../repositories/explainer.repository.js';
import { escapeHtml } from '../core/utils.js';

/**
 * Vue « Découvrir » : joue l'explication animée du DUT.
 *
 * Deux invariants portés par ce fichier :
 *  - la zone capturée à l'export est `.scene-stage` SEULE ; les contrôles de
 *    lecture vivent en dehors, sinon ils finiraient incrustés dans le MP4 ;
 *  - la voix est l'horloge : la timeline est asservie à `audio.currentTime`,
 *    jamais jouée de son côté. Aucune dérive n'est donc possible.
 */

const MIN_SCALE = 0.05;

/** Échelle à appliquer à la scène 1920×1080 pour qu'elle tienne sans jamais être agrandie. */
export function computeStageScale(containerWidth, containerHeight) {
  const w = Number(containerWidth) > 0 ? Number(containerWidth) : storyboard.width;
  const h = Number(containerHeight) > 0 ? Number(containerHeight) : storyboard.height;
  const scale = Math.min(w / storyboard.width, h / storyboard.height, 1);
  return Number.isFinite(scale) && scale > MIN_SCALE ? scale : MIN_SCALE;
}

/**
 * Lit le mode export depuis la VRAIE query string (`?render=1&chapitre=ch3`),
 * et non depuis le hash : le routeur du projet ancre son motif
 * (`^/decouvrir$`), donc `#/decouvrir?render=1` ne résoudrait aucune route.
 */
export function readRenderOptions(search) {
  const params = new URLSearchParams(String(search || ''));
  const requested = params.get('chapitre');
  const known = storyboard.chapters.some((c) => c.id === requested);
  return {
    render: params.get('render') === '1',
    chapterId: known ? requested : null,
  };
}

function formatClock(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function shell(chapters, options) {
  const buttons = chapters.map((c) => `
    <button type="button" class="explainer-chapter" data-chapter="${escapeHtml(c.id)}">
      ${c.number}. ${escapeHtml(c.title)}
    </button>`).join('');

  return `
    <div class="explainer${options.render ? ' is-render' : ''}">
      <div class="explainer-viewport">
        <div class="scene-stage"></div>
      </div>
      <div class="explainer-controls">
        <button type="button" class="btn btn-primary" data-action="toggle">Lecture</button>
        <div class="explainer-chapters">${buttons}</div>
        <input type="range" class="explainer-seek" min="0" max="1000" value="0"
               aria-label="Position dans le chapitre">
        <span class="explainer-time">00:00</span>
        <button type="button" class="btn" data-action="subtitles" aria-pressed="true">Sous-titres</button>
      </div>
      <p class="explainer-notice" data-role="notice"></p>
    </div>`;
}

export async function render(container, params = {}) {
  const options = readRenderOptions(typeof window !== 'undefined' ? window.location.search : '');
  const chapters = getChapters();
  const saved = getExplainerState();
  const startId = options.chapterId || params.chapitre || saved.lastChapterId || chapters[0].id;

  container.innerHTML = shell(chapters, options);

  const viewport = container.querySelector('.explainer-viewport');
  const stage = container.querySelector('.scene-stage');
  const notice = container.querySelector('[data-role="notice"]');
  const toggle = container.querySelector('[data-action="toggle"]');
  const seekBar = container.querySelector('.explainer-seek');
  const clock = container.querySelector('.explainer-time');

  // Les durées mesurées pilotent la lecture quand elles existent. Un fichier
  // absent, partiel ou illisible n'est pas une erreur : on retombe sur les
  // durées cibles du storyboard.
  let rawTimings = null;
  try {
    const response = await fetch('js/data/storyboard.timing.json', { cache: 'no-cache' });
    if (response.ok) rawTimings = await response.json();
  } catch { rawTimings = null; }
  const timings = resolveTimings(rawTimings);

  // L'élément audio et sa piste de sous-titres vivent HORS de `.scene-stage`
  // pour ne jamais entrer dans la zone capturée à l'export.
  const audio = document.createElement('audio');
  audio.preload = 'auto';
  audio.src = `audio/explainer/${startId}.m4a`;

  container.querySelector('.explainer').appendChild(audio);

  const playback = createPlaybackState();

  const chapter = storyboard.chapters.find((c) => c.id === startId);
  const built = buildChapter(chapter, { doc: document, root: stage, timings: timings.byScene });

  // Sans cette classe, les éléments de scène resteraient à `opacity: 0` alors
  // que plus rien ne les révèle : c'est le contrat posé par css/explainer.css.
  if (!built.stepped) stage.classList.add('is-animated');

  // Les sous-titres sont rendus DANS la scène, par le même seek que la
  // timeline : un élément <audio> n'a aucune surface d'affichage, donc une
  // piste <track> y serait inerte. Les fichiers .vtt générés servent à
  // l'incrustation dans le MP4 et aux lecteurs externes, pas à cette lecture.
  const subtitle = document.createElement('p');
  subtitle.className = 'sc-subtitle';
  stage.appendChild(subtitle);

  // Fenêtres de narration, calculées sur les mêmes durées que la timeline.
  const cues = [];
  let cueOffset = 0;
  for (const scene of chapter.scenes) {
    const duration = timings.byScene[scene.id] || scene.duration;
    if (scene.narration) cues.push({ start: cueOffset, end: cueOffset + duration, text: scene.narration });
    cueOffset += duration;
  }

  built.seek(0);

  function applyScale() {
    const scale = computeStageScale(viewport.clientWidth, viewport.clientHeight || storyboard.height);
    viewport.style.setProperty('--stage-scale', String(scale));
  }
  applyScale();
  window.addEventListener('resize', applyScale);

  function paint(ms) {
    built.seek(ms);
    const cue = cues.find((c) => ms >= c.start && ms < c.end);
    subtitle.textContent = cue ? cue.text : '';
    clock.textContent = `${formatClock(ms)} / ${formatClock(built.duration)}`;
    seekBar.value = String(Math.round((ms / built.duration) * 1000));
  }

  // --- Horloge ----------------------------------------------------------
  // Chemin normal : la voix mène. Chemin de secours (piste absente) : une
  // horloge interne pilote la même timeline, lecture muette avec sous-titres,
  // jamais d'écran noir.
  let fallbackStart = null;
  let fallbackHandle = null;
  let hasAudio = false;

  audio.addEventListener('canplaythrough', () => {
    hasAudio = true;
    playback.markReady();
    const pending = playback.flush();
    if (pending !== null) audio.currentTime = pending / 1000;
    notice.textContent = '';
  });
  audio.addEventListener('error', () => {
    hasAudio = false;
    playback.markReady();
    notice.textContent = 'Voix off pas encore enregistrée : lecture muette, sous-titres disponibles.';
  });
  audio.addEventListener('timeupdate', () => paint(audio.currentTime * 1000));

  function tickFallback(now) {
    if (fallbackStart === null) fallbackStart = now;
    const elapsed = now - fallbackStart;
    if (elapsed >= built.duration) { stopPlayback(); paint(built.duration); return; }
    paint(elapsed);
    fallbackHandle = window.requestAnimationFrame(tickFallback);
  }

  function startPlayback() {
    toggle.textContent = 'Pause';
    if (hasAudio) { audio.play().catch(() => { hasAudio = false; startPlayback(); }); return; }
    fallbackStart = null;
    fallbackHandle = window.requestAnimationFrame(tickFallback);
  }

  function stopPlayback() {
    toggle.textContent = 'Lecture';
    if (hasAudio) audio.pause();
    if (fallbackHandle !== null) { window.cancelAnimationFrame(fallbackHandle); fallbackHandle = null; }
    saveExplainerProgress(startId, hasAudio ? audio.currentTime * 1000 : 0);
  }

  toggle.addEventListener('click', () => {
    const playing = toggle.textContent === 'Pause';
    if (playing) stopPlayback(); else startPlayback();
  });

  const subtitlesButton = container.querySelector('[data-action="subtitles"]');
  subtitlesButton.addEventListener('click', () => {
    const shown = subtitlesButton.getAttribute('aria-pressed') === 'true';
    subtitlesButton.setAttribute('aria-pressed', String(!shown));
    subtitle.classList.toggle('is-hidden', shown);
  });

  seekBar.addEventListener('input', () => {
    const ms = (Number(seekBar.value) / 1000) * built.duration;
    if (hasAudio) { playback.requestSeek(ms); const pending = playback.flush(); if (pending !== null) audio.currentTime = pending / 1000; }
    paint(ms);
  });

  for (const button of container.querySelectorAll('[data-chapter]')) {
    button.setAttribute('aria-current', String(button.dataset.chapter === startId));
    button.addEventListener('click', () => {
      stopPlayback();
      saveExplainerProgress(button.dataset.chapter, 0);
      render(container, { chapitre: button.dataset.chapter });
    });
  }

  // --- Surface exposée au moteur d'export -------------------------------
  if (options.render) {
    window.__explainer = {
      seek: (ms) => built.seek(ms),
      duration: built.duration,
      chapters: chapters.map((c) => c.id),
      ready: true,
    };
  }
}
