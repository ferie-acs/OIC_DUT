import { storyboard } from '../data/storyboard.js';
import { buildChapter } from '../core/motion-timeline.js';
import {
  resolveTimings, getChapters, buildCues, voiceCueFor, createClock,
} from '../services/explainer.service.js';
import { getExplainerState, saveExplainerProgress } from '../repositories/explainer.repository.js';
import { escapeHtml } from '../core/utils.js';

/**
 * Vue « Découvrir » : joue l'explication animée du DUT.
 *
 * Invariants portés par ce fichier :
 *  - la zone capturée à l'export est `.scene-stage` SEULE ; les contrôles de
 *    lecture vivent en dehors, sinon ils finiraient incrustés dans le MP4 ;
 *  - l'horloge est autoritaire et la voix la suit. La spec disait l'inverse
 *    (« la voix est l'horloge »), mais la politique de plancher garantit que
 *    chaque fenêtre de scène est au moins aussi longue que sa voix : une voix
 *    maîtresse tronquerait l'animation. Et la piste concaténée par chapitre qui
 *    aurait permis l'inverse demanderait ffmpeg (risque R1, non autorisé).
 *    On joue donc les pistes par scène, recalées sur l'horloge.
 */

const MIN_SCALE = 0.05;
/** Part de la hauteur de fenêtre laissée à la scène ; le reste va aux contrôles. */
const VIEWPORT_HEIGHT_RATIO = 0.72;
/** Au-delà de ce décalage, on recale la piste de voix sur l'horloge. */
const VOICE_RESYNC_MS = 300;

/** Échelle à appliquer à la scène 1920×1080 pour qu'elle tienne sans jamais être agrandie. */
export function computeStageScale(containerWidth, containerHeight) {
  const w = Number(containerWidth) > 0 ? Number(containerWidth) : storyboard.width;
  const h = Number(containerHeight) > 0 ? Number(containerHeight) : storyboard.height;
  const scale = Math.min(w / storyboard.width, h / storyboard.height, 1);
  return Number.isFinite(scale) && scale > MIN_SCALE ? scale : MIN_SCALE;
}

/**
 * Applique l'échelle au conteneur et la retourne.
 *
 * La hauteur disponible vient de la FENÊTRE, jamais de `viewport.clientHeight` :
 * la hauteur du conteneur est elle-même calculée depuis `--stage-scale`, donc la
 * lire rendait la sortie dépendante de l'entrée et faisait décroître l'échelle à
 * chaque redimensionnement, sans retour possible, jusqu'à la vignette.
 */
export function applyStageScale(viewport, win) {
  const available = Number(win && win.innerHeight) > 0
    ? win.innerHeight * VIEWPORT_HEIGHT_RATIO
    : storyboard.height;
  const scale = computeStageScale(viewport.clientWidth, available);
  viewport.style.setProperty('--stage-scale', String(scale));
  return scale;
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

/** Un id de chapitre n'est accepté que s'il existe encore dans le storyboard. */
function knownChapterId(candidate) {
  return storyboard.chapters.some((c) => c.id === candidate) ? candidate : null;
}

function formatClock(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function shell(chapters, options, currentId) {
  const buttons = chapters.map((c) => `
    <button type="button" class="explainer-chapter" data-chapter="${escapeHtml(c.id)}"
            aria-current="${c.id === currentId ? 'true' : 'false'}">
      ${c.number}. ${escapeHtml(c.title)}
    </button>`).join('');

  return `
    <div class="explainer${options.render ? ' is-render' : ''}">
      <div class="explainer-viewport">
        <!-- La scène est retirée de l'arbre d'accessibilité : sinon un lecteur
             d'écran annonce d'affilée les titres, acteurs, annotations et textes
             alternatifs des 9 scènes du chapitre. L'équivalent accessible est le
             lien « Transcription texte » des contrôles. -->
        <div class="scene-stage" aria-hidden="true"></div>
      </div>
      <div class="explainer-controls">
        <button type="button" class="btn btn-primary" data-action="toggle" aria-pressed="false">Lecture</button>
        <div class="explainer-chapters">${buttons}</div>
        <input type="range" class="explainer-seek" min="0" max="1000" value="0"
               aria-label="Position dans le chapitre">
        <span class="explainer-time">00:00</span>
        <button type="button" class="btn" data-action="subtitles" aria-pressed="true">Sous-titres</button>
        <a class="explainer-transcript" href="docs/explainer-transcription.md">Transcription texte</a>
      </div>
      <p class="explainer-notice" data-role="notice"></p>
    </div>`;
}

/**
 * Joue les pistes de voix par scène en les recalant sur l'horloge.
 * Aucune piste pour une scène, ou un fichier absent : silence, jamais d'erreur.
 */
function createVoice(cues, doc) {
  const elements = new Map();
  let currentId = null;
  let available = false;

  for (const cue of cues) {
    const audio = doc.createElement('audio');
    audio.preload = 'auto';
    audio.src = `audio/explainer/${cue.sceneId}.m4a`;
    audio.addEventListener('canplaythrough', () => { available = true; });
    elements.set(cue.sceneId, audio);
  }

  function stopAll() {
    for (const audio of elements.values()) { try { audio.pause(); } catch { /* sans effet */ } }
    currentId = null;
  }

  return {
    hasAnyTrack() { return available; },
    stop() { stopAll(); },
    /** Place la voix à `positionMs`. `playing` dit s'il faut qu'elle sonne. */
    sync(positionMs, playing) {
      const cue = voiceCueFor(cues, positionMs);
      if (!cue) { stopAll(); return; }

      const audio = elements.get(cue.sceneId);
      if (!audio) return;

      if (currentId !== cue.sceneId) {
        stopAll();
        currentId = cue.sceneId;
      }

      const target = cue.offsetMs / 1000;
      // Au-delà de la durée réelle de la piste, la scène continue en silence.
      const beyond = Number.isFinite(audio.duration) && target > audio.duration;
      if (beyond) { try { audio.pause(); } catch { /* sans effet */ } return; }

      if (Math.abs(audio.currentTime - target) * 1000 > VOICE_RESYNC_MS) {
        try { audio.currentTime = target; } catch { /* piste pas encore prête */ }
      }
      if (playing && audio.paused) audio.play().catch(() => { /* fichier absent ou geste requis */ });
      if (!playing && !audio.paused) { try { audio.pause(); } catch { /* sans effet */ } }
    },
  };
}

export async function render(container, params = {}) {
  // La vue se re-rend elle-même au changement de chapitre et `withShell` n'offre
  // aucun crochet de destruction : on démonte explicitement la précédente, sinon
  // ses écouteurs `resize` et sa boucle rAF survivent et peignent un DOM détaché.
  if (typeof container.__explainerDispose === 'function') container.__explainerDispose();

  const options = readRenderOptions(typeof window !== 'undefined' ? window.location.search : '');
  const chapters = getChapters();
  const saved = getExplainerState();
  const startId = options.chapterId
    || knownChapterId(params.chapitre)
    || knownChapterId(saved.lastChapterId)
    || chapters[0].id;

  container.innerHTML = shell(chapters, options, startId);

  const viewport = container.querySelector('.explainer-viewport');
  const stage = container.querySelector('.scene-stage');
  const notice = container.querySelector('[data-role="notice"]');
  const toggle = container.querySelector('[data-action="toggle"]');
  const seekBar = container.querySelector('.explainer-seek');
  const clockLabel = container.querySelector('.explainer-time');

  // Les durées mesurées pilotent la lecture quand elles existent. Un fichier
  // absent, partiel ou illisible n'est pas une erreur : on retombe sur les
  // durées cibles du storyboard.
  let rawTimings = null;
  try {
    const response = await fetch('js/data/storyboard.timing.json', { cache: 'no-cache' });
    if (response.ok) rawTimings = await response.json();
  } catch { rawTimings = null; }
  const timings = resolveTimings(rawTimings);

  const chapter = storyboard.chapters.find((c) => c.id === startId);
  const built = buildChapter(chapter, { doc: document, root: stage, timings: timings.byScene });
  if (!built.stepped) stage.classList.add('is-animated');

  // Sous-titres rendus DANS la scène, donc dans la zone capturée : un <audio>
  // n'a aucune surface d'affichage, une piste <track> y serait inerte.
  const subtitle = document.createElement('p');
  subtitle.className = 'sc-subtitle';
  stage.appendChild(subtitle);

  const cues = buildCues(chapter, timings.byScene);
  const voice = createVoice(cues, document);
  const clock = createClock({ duration: built.duration });

  let frame = null;
  let disposed = false;

  function paint(ms) {
    built.seek(ms);
    const cue = voiceCueFor(cues, ms);
    subtitle.textContent = cue ? cue.text : '';
    clockLabel.textContent = `${formatClock(ms)} / ${formatClock(built.duration)}`;
    seekBar.value = String(Math.round((ms / built.duration) * 1000));
  }

  function reflectPlaying() {
    const playing = clock.isPlaying();
    toggle.textContent = playing ? 'Pause' : 'Lecture';
    toggle.setAttribute('aria-pressed', String(playing));
  }

  function loop(now) {
    if (disposed) return;
    const position = clock.tick(now);
    paint(position);
    voice.sync(position, clock.isPlaying());
    if (!clock.isPlaying()) { frame = null; reflectPlaying(); persist(); return; }
    frame = window.requestAnimationFrame(loop);
  }

  function startLoop() {
    if (frame === null && !disposed) frame = window.requestAnimationFrame(loop);
  }

  function persist() {
    saveExplainerProgress(startId, clock.position());
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    clock.pause();
    voice.stop();
    if (frame !== null) { window.cancelAnimationFrame(frame); frame = null; }
    if (!options.render) window.removeEventListener('resize', onResize);
    window.removeEventListener('hashchange', onHashChange);
    delete container.__explainerDispose;
  }

  function onResize() { applyStageScale(viewport, window); }
  function onHashChange() {
    // Quitter la vue : on enregistre la position puis on démonte.
    if (!window.location.hash.startsWith('#/decouvrir')) { persist(); dispose(); }
  }

  container.__explainerDispose = dispose;
  window.addEventListener('hashchange', onHashChange);

  if (options.render) {
    // En mode export, la scene est sortie de la coquille applicative et posee
    // seule en haut a gauche de la page, a l'echelle 1. Sans cela la capture
    // emportait le menu lateral et rognait la scene, qui deborde de la zone de
    // contenu : le MP4 montrait l'interface du POC autour de la video.
    document.body.classList.add('is-explainer-render');
    document.body.appendChild(stage);
  } else {
    window.addEventListener('resize', onResize);
    applyStageScale(viewport, window);
  }

  // Reprise : la position enregistrée n'est restituée que pour le chapitre où
  // elle a été prise, et seulement si elle tombe encore dans sa durée.
  const resumeAt = saved.lastChapterId === startId && saved.lastPositionMs < built.duration
    ? saved.lastPositionMs
    : 0;
  clock.seek(resumeAt);
  paint(resumeAt);
  reflectPlaying();

  toggle.addEventListener('click', () => {
    if (clock.isPlaying()) {
      clock.pause();
      voice.sync(clock.position(), false);
      reflectPlaying();
      persist();
      return;
    }
    if (clock.position() >= built.duration) clock.seek(0);
    clock.play();
    reflectPlaying();
    startLoop();
  });

  const subtitlesButton = container.querySelector('[data-action="subtitles"]');
  subtitlesButton.addEventListener('click', () => {
    const shown = subtitlesButton.getAttribute('aria-pressed') === 'true';
    subtitlesButton.setAttribute('aria-pressed', String(!shown));
    subtitle.classList.toggle('is-hidden', shown);
  });

  seekBar.addEventListener('input', () => {
    const ms = (Number(seekBar.value) / 1000) * built.duration;
    clock.seek(ms);
    paint(ms);
    voice.sync(ms, clock.isPlaying());
  });

  for (const button of container.querySelectorAll('[data-chapter]')) {
    button.addEventListener('click', () => {
      const target = button.dataset.chapter;
      saveExplainerProgress(target, 0);
      render(container, { chapitre: target });
    });
  }

  if (!voice.hasAnyTrack()) {
    notice.textContent = 'Voix off en cours de chargement. Si elle reste absente, la lecture se fait en silence avec les sous-titres.';
  }

  // --- Surface exposée au moteur d'export -------------------------------
  if (options.render) {
    // `ready` n'est posé qu'une fois les captures décodées : un moteur qui
    // commence à capturer avant verrait des cadres vides là où il y a un écran.
    const images = [...stage.querySelectorAll('img')];
    await Promise.all(images.map((img) => (
      typeof img.decode === 'function' ? img.decode().catch(() => {}) : Promise.resolve()
    )));

    window.__explainer = {
      // paint() et non built.seek() : sinon le sous-titre reste vide sur toutes
      // les images et le MP4 n'en porterait aucun.
      seek: (ms) => paint(ms),
      duration: built.duration,
      chapters: chapters.map((c) => c.id),
      chapterId: startId,
      // Fenêtres de narration, pour que le moteur d'export assemble la piste
      // audio du chapitre : les pistes existent par scène, pas par chapitre.
      cues: cues.map((c) => ({ sceneId: c.sceneId, start: c.start, end: c.end })),
      ready: true,
    };
  }
}
