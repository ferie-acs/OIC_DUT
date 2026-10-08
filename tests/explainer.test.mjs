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

// ---------------------------------------------------------------------------
// Tâche 2 — primitives visuelles
// ---------------------------------------------------------------------------

const { STAGE_PRIMITIVES } = await import('../js/views/explainer/stage/index.js');

// Chaque kind déclaré par la donnée a une implémentation, et réciproquement.
assert.deepEqual(Object.keys(STAGE_PRIMITIVES).sort(), [...STAGE_KINDS].sort());

// Chaque primitive respecte le contrat build/animate.
for (const [kind, primitive] of Object.entries(STAGE_PRIMITIVES)) {
  assert.equal(typeof primitive.build, 'function', `${kind}.build manquant`);
  assert.equal(typeof primitive.animate, 'function', `${kind}.animate manquant`);
  assert.equal(primitive.build.length, 2, `${kind}.build(spec, doc)`);
}

// build() produit un élément porteur de son kind, sans style inline.
const fakeDoc = {
  createElement(tag) {
    return {
      tagName: tag.toUpperCase(), className: '', textContent: '', dataset: {},
      children: [], attributes: {},
      setAttribute(k, v) { this.attributes[k] = v; },
      getAttribute(k) { return this.attributes[k] ?? null; },
      appendChild(child) { this.children.push(child); return child; },
      addEventListener() {},
    };
  },
};
for (const [kind, primitive] of Object.entries(STAGE_PRIMITIVES)) {
  const el = primitive.build({ kind, label: 'x', title: 'x', text: 'x', icon: 'x', src: 'x' }, fakeDoc);
  assert.ok(el, `${kind}.build n'a rien retourné`);
  assert.ok(String(el.className).includes(`sc-${kind}`), `${kind} : classe sc-${kind} absente`);
  assert.equal(el.attributes.style, undefined, `${kind} : style inline interdit`);
}

// La primitive `screen` prévoit un repli nommé si l'image ne charge pas.
// (Couvre Review Focus n°5, versant exécution.)
const screenEl = STAGE_PRIMITIVES.screen.build(
  { kind: 'screen', src: 'antenne.png', alt: 'Panneau de revue d’un DUT par l’antenne' }, fakeDoc);
const img = screenEl.children.find((c) => c.tagName === 'IMG');
assert.ok(img, 'la primitive screen doit produire une img');
assert.equal(img.attributes.src, 'assets/explainer/antenne.png');
assert.ok(img.attributes.alt.length > 10, 'texte alternatif attendu');
const fallback = screenEl.children.find((c) => String(c.className).includes('sc-screen-fallback'));
assert.ok(fallback, 'cadre de remplacement absent');
assert.ok(fallback.textContent.includes('antenne.png'),
  'le remplacement doit nommer le fichier manquant');
assert.equal(screenEl.dataset.ratio, '16:9', 'le conteneur doit porter son ratio');

console.log('Primitives : registre complet, contrat build/animate respecté, repli image nommé, aucun style inline.');

// ---------------------------------------------------------------------------
// Tâche 3 — constructeur de timeline
// ---------------------------------------------------------------------------

const { buildChapter } = await import('../js/core/motion-timeline.js');

// Sans window.anime, le constructeur bascule en rendu par paliers au lieu d'échouer.
// (Couvre Review Focus n°2.)
const tlCalls = [];
const stageRoot = fakeDoc.createElement('div');
const built = buildChapter(storyboard.chapters[0], { doc: fakeDoc, root: stageRoot, timings: {} });
assert.equal(built.stepped, true, 'sans anime.js, le rendu doit être par paliers');
assert.equal(built.timeline, null);
assert.equal(typeof built.seek, 'function');

// En paliers, seek() n'active qu'une scène à la fois.
built.seek(0);
const activeAtZero = stageRoot.children.filter((c) => String(c.className).includes('is-active'));
assert.equal(activeAtZero.length, 1);
assert.equal(activeAtZero[0].dataset.sceneId, '1.1');
built.seek(30000);
const activeLater = stageRoot.children.filter((c) => String(c.className).includes('is-active'));
assert.equal(activeLater.length, 1);
assert.equal(activeLater[0].dataset.sceneId, '1.4');

// seek() hors bornes ne lève pas et ne laisse pas d'état incohérent.
built.seek(-5000);
built.seek(999999);
assert.equal(stageRoot.children.filter((c) => String(c.className).includes('is-active')).length, 1);

// Un conteneur de scène est créé par scène, porteur de son identifiant.
assert.equal(stageRoot.children.length, storyboard.chapters[0].scenes.length);
assert.deepEqual(stageRoot.children.map((c) => c.dataset.sceneId),
  storyboard.chapters[0].scenes.map((s) => s.id));

// Les durées mesurées, quand elles existent, déplacent les fenêtres de scène.
const retimed = buildChapter(storyboard.chapters[0], {
  doc: fakeDoc, root: fakeDoc.createElement('div'), timings: { '1.1': 4000 },
});
assert.equal(retimed.duration, 57000, 'la durée du chapitre suit les mesures');

// Avec un faux anime.js, une vraie timeline est construite, en autoplay désactivé.
globalThis.window = {
  anime: {
    createTimeline(options) {
      tlCalls.push(['createTimeline', options]);
      return { add(...args) { tlCalls.push(['add', args]); return this; },
               seek(ms) { tlCalls.push(['seek', ms]); return this; },
               pause() { tlCalls.push(['pause']); return this; } };
    },
    stagger: (n) => n,
  },
  matchMedia: () => ({ matches: false }),
};
const animated = buildChapter(storyboard.chapters[0], { doc: fakeDoc, root: fakeDoc.createElement('div'), timings: {} });
assert.equal(animated.stepped, false);
assert.ok(animated.timeline, 'timeline attendue');
assert.equal(tlCalls[0][1].autoplay, false, 'la timeline doit être créée en autoplay: false');
assert.ok(tlCalls.some(([kind]) => kind === 'add'), 'aucun tween ajouté');

// Mouvement refusé par l'utilisateur : repli par paliers même avec anime.js présent.
globalThis.window.matchMedia = () => ({ matches: true });
const reduced = buildChapter(storyboard.chapters[0], { doc: fakeDoc, root: fakeDoc.createElement('div'), timings: {} });
assert.equal(reduced.stepped, true, 'prefers-reduced-motion doit forcer le rendu par paliers');
globalThis.window.matchMedia = () => ({ matches: false });

console.log('Timeline : repli par paliers sans anime.js et en reduced-motion, autoplay désactivé, une scène active à la fois.');

// ---------------------------------------------------------------------------
// Tâche 4 — service de timecodes et repository de progression
// ---------------------------------------------------------------------------

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, v),
  removeItem: (k) => store.delete(k),
};

const { resolveTimings, getChapters, createPlaybackState, buildVtt, buildTranscript } =
  await import('../js/services/explainer.service.js');
const { getExplainerState, saveExplainerProgress, setExplainerDismissed } =
  await import('../js/repositories/explainer.repository.js');

// Timings absents : on retombe sur les durées cibles, jamais de NaN.
// (Couvre Review Focus n°1.)
const noTimings = resolveTimings(null);
assert.equal(noTimings.total, TOTAL_DURATION_MS);
assert.ok(Object.values(noTimings.byScene).every(Number.isFinite));

// La mesure est un PLANCHER, pas une substitution : une voix plus longue que la
// cible étire la scène (plus 600 ms de silence de fin), une voix plus courte ne
// la raccourcit pas — sinon la vidéo de 5 min tomberait à la durée cumulée de la
// voix et toutes les scènes seraient précipitées.
const partial = resolveTimings({ '1.2': 13500 });
assert.equal(partial.byScene['1.2'], 14100, 'voix plus longue : la scène s’étire, voix non tronquée');
assert.equal(partial.byScene['1.3'], 12000, 'scène non mesurée : cible conservée');
assert.equal(partial.total, TOTAL_DURATION_MS + 2100);

const shorterVoice = resolveTimings({ '1.2': 6612 });
assert.equal(shorterVoice.byScene['1.2'], 12000, 'voix plus courte : la cible tient');
assert.equal(shorterVoice.total, TOTAL_DURATION_MS);

// Timings corrompus : valeurs non numériques ou négatives ignorées sans produire NaN.
const corrupt = resolveTimings({ '1.2': 'douze', '1.3': -4000, '1.4': null });
assert.equal(corrupt.byScene['1.2'], 12000);
assert.equal(corrupt.byScene['1.3'], 12000);
assert.ok(Number.isFinite(corrupt.total));

// Une scène inconnue dans les timings n'invente pas de durée.
const stale = resolveTimings({ '9.9': 5000 });
assert.equal(stale.total, TOTAL_DURATION_MS);
assert.equal(stale.byScene['9.9'], undefined);

// Chapitrage : positions de départ cumulées.
const chapters = getChapters();
assert.equal(chapters.length, 5);
assert.equal(chapters[0].startMs, 0);
assert.equal(chapters[1].startMs, 55000);

// Saut demandé avant que l'audio soit prêt : mémorisé puis rejoué.
// (Couvre Review Focus n°4.)
const playback = createPlaybackState();
playback.requestSeek(42000);
assert.equal(playback.isPending(), true);
assert.equal(playback.flush(), null, 'rien à rejouer tant que la piste n’est pas prête');
playback.markReady();
assert.equal(playback.flush(), 42000);
assert.equal(playback.isPending(), false);
assert.equal(playback.flush(), null, 'un saut n’est rejoué qu’une fois');

// WebVTT : en-tête valide, un cue par scène parlée, timecodes croissants.
const vtt = buildVtt('ch1');
assert.ok(vtt.startsWith('WEBVTT\n'));
const cues = vtt.split('\n\n').filter((b) => b.includes('-->'));
assert.equal(cues.length, storyboard.chapters[0].scenes.filter((s) => s.narration).length);
assert.ok(/^00:00:02\.000 --> 00:00:14\.000$/m.test(vtt));

// Chapitre inconnu : en-tête seul, pas d'exception.
assert.equal(buildVtt('ch-inexistant'), 'WEBVTT\n');

// Repository : état par défaut, persistance, relecture.
assert.deepEqual(getExplainerState(), { lastChapterId: null, lastPositionMs: 0, dismissed: false });
saveExplainerProgress('ch2', 12345);
assert.deepEqual(getExplainerState(), { lastChapterId: 'ch2', lastPositionMs: 12345, dismissed: false });
setExplainerDismissed(true);
assert.equal(getExplainerState().dismissed, true);
assert.equal(getExplainerState().lastPositionMs, 12345, 'dismissed ne doit pas écraser la progression');

console.log('Service : timings partiels et corrompus, chapitrage, saut différé, WebVTT. Repository : persistance.');

// ---------------------------------------------------------------------------
// Tâche 5 — vue et lecteur
// ---------------------------------------------------------------------------

const { computeStageScale, readRenderOptions } = await import('../js/views/decouvrir.view.js');

// Mise à l'échelle : jamais de débordement, ratio 16:9 préservé, jamais d'agrandissement.
// (Couvre Review Focus n°3.)
assert.equal(computeStageScale(1920, 1080), 1);
assert.equal(computeStageScale(960, 540), 0.5);
assert.equal(computeStageScale(3840, 2160), 1, 'pas d’agrandissement au-delà de 1920×1080');
assert.equal(computeStageScale(960, 2000), 0.5, 'limité par la largeur');
assert.equal(computeStageScale(3840, 540), 0.5, 'limité par la hauteur');

// Largeur téléphone : la scène tient, l’échelle reste strictement positive.
const phone = computeStageScale(360, 640);
assert.ok(phone > 0 && phone <= 1);
assert.ok(1920 * phone <= 360 + 0.5, 'débordement horizontal');

// Conteneur dégénéré : pas de division par zéro, pas de NaN.
assert.ok(Number.isFinite(computeStageScale(0, 0)));
assert.ok(computeStageScale(0, 0) > 0);
assert.ok(Number.isFinite(computeStageScale(undefined, null)));

// Mode export : lu depuis la vraie query string, pas depuis le hash — le
// routeur ancre son motif et `#/decouvrir?render=1` ne résoudrait rien.
assert.deepEqual(readRenderOptions(''), { render: false, chapterId: null });
assert.deepEqual(readRenderOptions('?render=1'), { render: true, chapterId: null });
assert.deepEqual(readRenderOptions('?render=1&chapitre=ch3'), { render: true, chapterId: 'ch3' });
assert.deepEqual(readRenderOptions('?chapitre=ch9'), { render: false, chapterId: null },
  'un chapitre inconnu est ignoré');

console.log('Vue : mise à l’échelle bornée sans débordement ni NaN, mode export lu depuis la query string.');

// ---------------------------------------------------------------------------
// Tâche 7 — scènes sur mesure
// ---------------------------------------------------------------------------

const { CUSTOM_SCENES } = await import('../js/views/explainer/custom/index.js');

// Les scènes sur mesure référencées par la donnée sont exactement celles implémentées.
const referenced = storyboard.chapters.flatMap((c) => c.scenes.map((s) => s.custom)).filter(Boolean);
assert.deepEqual([...new Set(referenced)].sort(), ['architecture-cible', 'carte-depart', 'copie-retiree']);
for (const id of referenced) {
  assert.ok(CUSTOM_SCENES[id], `scène sur mesure « ${id} » non implémentée`);
  assert.equal(typeof CUSTOM_SCENES[id].build, 'function');
  assert.equal(typeof CUSTOM_SCENES[id].animate, 'function');
}

// Aucun module sur mesure orphelin : tout ce qui est implémenté est utilisé.
assert.deepEqual(Object.keys(CUSTOM_SCENES).sort(), [...new Set(referenced)].sort());

// build() produit un élément marqué comme scène sur mesure, sans style inline.
for (const [id, scene] of Object.entries(CUSTOM_SCENES)) {
  const el = scene.build({ id: 'x' }, fakeDoc);
  assert.ok(el, `${id}.build n'a rien retourné`);
  assert.ok(String(el.className).includes('sc-custom'), `${id} : classe sc-custom absente`);
  assert.equal(el.attributes.style, undefined, `${id} : style inline interdit`);
}

// Le constructeur de timeline monte bien les scènes sur mesure, et pas seulement
// les primitives : la scène 1.2 du chapitre 1 n'a QUE du custom.
const withCustom = fakeDoc.createElement('div');
buildChapter(storyboard.chapters[0], { doc: fakeDoc, root: withCustom, timings: {} });
const sceneTwo = withCustom.children.find((c) => c.dataset.sceneId === '1.2');
assert.ok(sceneTwo, 'conteneur de la scène 1.2 absent');
assert.equal(sceneTwo.children.length, 1, 'la scène 1.2 doit contenir son rendu sur mesure');
assert.ok(String(sceneTwo.children[0].className).includes('sc-carte-depart'));

console.log('Scènes sur mesure : registre sans orphelin, montées par le constructeur de timeline.');

// ---------------------------------------------------------------------------
// Tâche 8 — sous-titres, transcription, garde-fou de déterminisme
// ---------------------------------------------------------------------------

const { readFileSync } = await import('node:fs');

// Garde-fou de déterminisme : aucune règle de mouvement CSS dans l'explainer.
// Une seule violation suffirait à faire diverger le MP4 de ce qu'on voit à l'écran.
for (const sheet of ['css/explainer.css']) {
  const source = readFileSync(sheet, 'utf8');
  for (const pattern of [/\btransition\s*:/i, /\banimation\s*:/i, /@keyframes/i]) {
    assert.ok(!pattern.test(source),
      `${sheet} contient ${pattern} — interdit par le contrat de déterminisme`);
  }
}

// Le WebVTT de chaque chapitre est valide et ses cues sont strictement croissants.
for (const chapter of storyboard.chapters) {
  const chapterVtt = buildVtt(chapter.id);
  assert.ok(chapterVtt.startsWith('WEBVTT\n'), `${chapter.id} : en-tête WEBVTT absent`);
  const times = [...chapterVtt.matchAll(/^(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})$/gm)];
  assert.ok(times.length > 0, `${chapter.id} : aucun cue`);
  for (let i = 1; i < times.length; i += 1) {
    assert.ok(times[i][1] >= times[i - 1][2], `${chapter.id} : cues non croissants`);
  }
  // Un cue par scène parlée, pas un de plus.
  assert.equal(times.length, chapter.scenes.filter((s) => s.narration).length,
    `${chapter.id} : nombre de cues incohérent`);
}

// La transcription couvre les cinq chapitres et porte la mention d'écart assumé.
const transcript = buildTranscript();
for (const chapter of storyboard.chapters) {
  assert.ok(transcript.includes(chapter.title), `transcription : ${chapter.title} absent`);
}
assert.ok(transcript.includes('amélioration proposée'),
  'la transcription doit conserver la mention « amélioration proposée » de la scène 2.5');

console.log('Déterminisme : aucune règle de mouvement CSS. Sous-titres et transcription conformes.');

// ---------------------------------------------------------------------------
// Tâche 9 — voix et durées mesurées
// ---------------------------------------------------------------------------

const { planTtsSegments, parseAfinfoDuration } = await import('../scripts/tts.mjs');

// Un segment par scène parlée, aucun pour les cartons de titre.
const segments = planTtsSegments(storyboard);
const spoken = storyboard.chapters.flatMap((c) => c.scenes).filter((s) => s.narration);
assert.equal(segments.length, spoken.length);
assert.equal(segments.filter((s) => s.sceneId.endsWith('.1')).length, 0,
  'les cartons de titre ne doivent pas être sonorisés');
for (const segment of segments) {
  assert.ok(segment.text.length > 0);
  assert.ok(segment.out.startsWith('audio/explainer/'));
  assert.ok(segment.out.endsWith('.m4a'));
  assert.ok(Number.isFinite(segment.target) && segment.target > 0,
    `${segment.sceneId} : durée cible absente, l'écart ne pourrait pas être calculé`);
}

// Lecture de la durée réelle depuis la sortie d'afinfo.
assert.equal(parseAfinfoDuration('estimated duration: 13.482993 sec\n'), 13483);
assert.equal(parseAfinfoDuration('rien d’exploitable'), null);
assert.equal(parseAfinfoDuration(''), null);
assert.equal(parseAfinfoDuration(null), null);

console.log(`TTS : ${segments.length} segments planifiés, durées mesurées lues depuis afinfo.`);

// ---------------------------------------------------------------------------
// Revue finale — correctifs
// ---------------------------------------------------------------------------

const { buildCues, voiceCueFor, createClock } = await import('../js/services/explainer.service.js');

// #12 — les cues sont construits sur les durées RÉSOLUES, pas sur les cibles.
// Sinon les sous-titres incrustés et les lecteurs externes dérivent de plusieurs
// secondes sur la moitié du chapitre 2.
const realTimings = resolveTimings(JSON.parse(
  readFileSync('js/data/storyboard.timing.json', 'utf8'))).byScene;
const ch2 = storyboard.chapters.find((c) => c.id === 'ch2');
const ch2Cues = buildCues(ch2, realTimings);
const cue26 = ch2Cues.find((c) => c.sceneId === '2.6');
const target26 = ch2.scenes.find((s) => s.id === '2.6').at;
assert.ok(cue26.start > target26,
  'la scène 2.6 commence plus tard que sa cible dès que 2.5 est étirée par la voix');
assert.equal(cue26.start,
  ch2.scenes.slice(0, 5).reduce((n, s) => n + realTimings[s.id], 0),
  'le début d’un cue est la somme des durées résolues qui le précèdent');

// Le VTT généré suit les mêmes durées résolues.
const vttResolved = buildVtt('ch2', realTimings);
const vttTarget = buildVtt('ch2');
assert.notEqual(vttResolved, vttTarget,
  'buildVtt doit tenir compte des durées résolues quand on les lui donne');
assert.ok(vttResolved.startsWith('WEBVTT\n'));

// #1 — quelle piste de voix jouer à une position donnée, et à quel décalage.
const cuesCh1 = buildCues(storyboard.chapters[0], resolveTimings(null).byScene);
assert.equal(voiceCueFor(cuesCh1, 0), null, 'un carton de titre est muet');
const at3s = voiceCueFor(cuesCh1, 3000);
assert.equal(at3s.sceneId, '1.2');
assert.equal(at3s.offsetMs, 1000, 'décalage relatif au début de la scène');
assert.equal(voiceCueFor(cuesCh1, 999999), null, 'hors bornes : aucune piste');
assert.equal(voiceCueFor(cuesCh1, -1), null);

// #5 #7 #15 — horloge de lecture : la pause conserve la position, le saut tient,
// la fin arrête la lecture. L'état ne vit pas dans un textContent.
const clock = createClock({ duration: 10000 });
assert.equal(clock.isPlaying(), false);
assert.equal(clock.position(), 0);

clock.play();
assert.equal(clock.isPlaying(), true);
clock.tick(1000);
clock.tick(4000);
assert.equal(clock.position(), 3000, 'la position suit le temps écoulé depuis play()');

clock.pause();
assert.equal(clock.isPlaying(), false);
assert.equal(clock.position(), 3000, 'la pause conserve la position');
clock.play();
clock.tick(9000);
assert.equal(clock.position(), 3000, 'la reprise repart de la position, pas de zéro');
clock.tick(10000);
assert.equal(clock.position(), 4000);

clock.seek(8000);
assert.equal(clock.position(), 8000, 'un saut s’applique immédiatement');
clock.tick(11000);
assert.equal(clock.position(), 8000,
  'le premier tick après un saut se ré-ancre : il ne doit pas compter l’intervalle écoulé avant le saut');
clock.tick(12000);
assert.equal(clock.position(), 9000, 'le temps reprend ensuite depuis la nouvelle position');

clock.tick(13000);
assert.equal(clock.position(), 10000, 'la position est bornée par la durée');
assert.equal(clock.isPlaying(), false, 'atteindre la fin arrête la lecture');

const paused = createClock({ duration: 5000 });
paused.seek(2000);
assert.equal(paused.position(), 2000, 'un saut à l’arrêt est conservé');
assert.equal(paused.isPlaying(), false, 'un saut ne déclenche pas la lecture');
paused.seek(-500);
assert.equal(paused.position(), 0, 'saut négatif borné');
paused.seek(99999);
assert.equal(paused.position(), 5000, 'saut au-delà de la fin borné');

// #13 — l'emplacement d'un picto est porté par la donnée, pas déduit de son rang
// dans le DOM : la scène 3.5 n'a pas de titre, donc ses pictos sont les enfants
// 1-2-3 et les sélecteurs nth-of-type(2|3|4) en superposaient deux.
for (const chapter of storyboard.chapters) {
  for (const scene of chapter.scenes) {
    const pictos = (scene.stage || []).filter((item) => item.kind === 'picto');
    if (!pictos.length) continue;
    const slots = pictos.map((p) => p.slot);
    assert.ok(slots.every((s) => s === 1 || s === 2 || s === 3),
      `${chapter.id}/${scene.id} : chaque picto doit déclarer slot 1, 2 ou 3 (reçu ${JSON.stringify(slots)})`);
    assert.equal(new Set(slots).size, slots.length,
      `${chapter.id}/${scene.id} : deux pictos partagent le même emplacement`);
  }
}
const pictoEl = STAGE_PRIMITIVES.picto.build({ kind: 'picto', icon: 'lock', label: 'x', slot: 3 }, fakeDoc);
assert.equal(pictoEl.dataset.slot, '3', 'la primitive picto doit exposer son emplacement en data-slot');

// #4 — la mise à l'échelle ne doit pas se nourrir de son propre résultat.
// Le bug : la hauteur du conteneur valait 1080 * échelle, donc chaque resize
// faisait décroître l'échelle jusqu'au plancher, sans retour possible.
const { applyStageScale } = await import('../js/views/decouvrir.view.js');
const fakeViewport = {
  clientWidth: 1600,
  _vars: {},
  get clientHeight() { return Math.round(1080 * (Number(this._vars['--stage-scale']) || 1)) - 2; },
  style: { setProperty(name, value) { fakeViewport._vars[name] = value; } },
};
const fakeWin = { innerHeight: 2000 };
const first = applyStageScale(fakeViewport, fakeWin);
const second = applyStageScale(fakeViewport, fakeWin);
const third = applyStageScale(fakeViewport, fakeWin);
assert.equal(second, first, 'deux redimensionnements identiques doivent donner la même échelle');
assert.equal(third, first, 'et le troisième aussi : aucune dérive');
assert.ok(first > 0.8, `échelle attendue proche de 1600/1920, obtenue ${first}`);

// Une fenêtre basse borne bien l'échelle par la hauteur disponible.
assert.ok(applyStageScale({ clientWidth: 1920, style: { setProperty() {} } }, { innerHeight: 600 }) < 0.6,
  'une fenêtre basse doit réduire l’échelle');

console.log('Correctifs : cues sur durées résolues, piste de voix par scène, horloge avec pause et saut, emplacements de pictos, échelle stable.');
