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

// Timings partiels : les scènes mesurées utilisent la mesure, les autres la cible.
const partial = resolveTimings({ '1.2': 13500 });
assert.equal(partial.byScene['1.2'], 13500);
assert.equal(partial.byScene['1.3'], 12000);
assert.equal(partial.total, TOTAL_DURATION_MS + 1500);

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
