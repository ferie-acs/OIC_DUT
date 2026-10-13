// Lot d0 : recherche intégrée à toutes les listes de choix.
// 1) Règles de filtrage (sans navigateur) ; 2) comportement réel dans Chromium si Playwright est installé.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { normalizeText, matchesQuery, filterOptions } from '../js/core/searchable-select.js';

/* ===== 1. Filtrage : insensible à la casse et aux accents ===== */
assert.equal(normalizeText('  Côte d’Ivoire  '), "cote d'ivoire");
assert.equal(normalizeText('ŒUVRE Élevée'), 'oeuvre elevee');
assert.ok(matchesQuery('Bouaké', 'BOUAKE'));
assert.ok(matchesQuery('BOUAKE', 'bouaké'));
assert.ok(matchesQuery('San-Pédro', 'pedro'));
assert.ok(matchesQuery('Agent Contrôle', 'contr  agent'), 'chaque mot, dans n’importe quel ordre');
assert.ok(matchesQuery('Compte d’autrui', "d'autrui"), 'apostrophes typographiques et droites équivalentes');
assert.ok(!matchesQuery('Abidjan', 'bouake'));
assert.ok(matchesQuery('Abidjan', ''), 'recherche vide : tout est affiché');
const entries = [
  { index: 0, label: 'Toutes', value: '' },
  { label: 'Nord', options: [{ index: 1, label: 'Korhogo' }, { index: 2, label: 'Ferkessédougou' }] },
  { label: 'Sud', options: [{ index: 3, label: 'Abidjan' }] },
];
assert.deepEqual(filterOptions(entries, 'FERKE').map((e) => e.label), ['Nord']);
assert.deepEqual(filterOptions(entries, 'ferke')[0].options.map((o) => o.label), ['Ferkessédougou']);
assert.equal(filterOptions(entries, 'zzz').length, 0, 'aucun résultat');
assert.equal(entries[1].options.length, 2, 'les entrées d’origine ne sont pas modifiées');
console.log('Lot d0 : filtrage insensible à la casse et aux accents, groupes respectés.');

/* ===== 2. Navigateur : la valeur native reste la source de vérité ===== */
let chromium = null;
const require = createRequire(import.meta.url);
for (const id of ['playwright', '/opt/npm-tools/node_modules/playwright']) {
  try { ({ chromium } = require(id)); break; } catch {}
}
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
if (!chromium) {
  console.log('Lot d0 : Playwright absent, vérification dans le navigateur ignorée.');
  process.exit(0);
}

const root = new URL('..', import.meta.url);
const FIXTURE = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/css/variables.css"><link rel="stylesheet" href="/css/forms.css"><link rel="stylesheet" href="/css/lot-d0.css"></head><body>
<p id="outside">Ailleurs</p><form id="f"><div class="field"><label for="s">Ville <span class="req">*</span></label><select class="select" id="s" name="ville" required>
<option value="">— choisir —</option><option value="abj">Abidjan</option><option value="bke">Bouaké</option><option value="sp" disabled>San-Pédro</option>
<optgroup label="Nord"><option value="kgo">Korhogo</option><option value="fer">Ferkessédougou</option></optgroup></select></div>
<label class="field">Pays<select name="pays" class="select" multiple><option value="ci">Côte d’Ivoire</option><option value="bf">Burkina Faso</option><option value="ml">Mali</option></select></label>
<button type="submit">Envoyer</button></form><div id="later"></div>
<script type="module">import * as ss from '/js/core/searchable-select.js'; window.ss = ss; window.changes = 0; window.inputs = 0;
const s = document.getElementById('s'); s.addEventListener('change', () => window.changes++); s.addEventListener('input', () => window.inputs++); window.ready = true;</script></body></html>`;

const browser = await chromium.launch(exe ? { executablePath: exe } : {});
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('http://d0.test/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/') return route.fulfill({ contentType: 'text/html', body: FIXTURE });
    try {
      const body = await readFile(new URL(`.${path}`, root));
      return route.fulfill({ contentType: path.endsWith('.css') ? 'text/css' : 'text/javascript', body });
    } catch { return route.fulfill({ status: 404, body: '' }); }
  });
  await page.goto('http://d0.test/');
  await page.waitForFunction(() => window.ready === true);

  const state = () => page.evaluate(() => {
    const s = document.getElementById('s');
    const t = s.closest('.ss')?.querySelector('.ss-trigger');
    const panel = document.querySelector('.ss-panel');
    return {
      value: s.value, formValue: new FormData(document.getElementById('f')).get('ville'), changes: window.changes, inputs: window.inputs,
      label: t?.querySelector('.ss-value').textContent, expanded: t?.getAttribute('aria-expanded'), open: !!panel?.isConnected,
      options: panel ? [...panel.querySelectorAll('.ss-option')].map((o) => o.textContent.trim()) : [],
      empty: panel ? !panel.querySelector('.ss-empty').hidden : false,
      focus: document.activeElement === t ? 'trigger' : document.activeElement?.className,
    };
  });
  const trigger = '#s ~ .ss-trigger';

  // Le select natif reste en place (id, name, required, formulaire, étiquette) ; un seul déclencheur.
  let info = await page.evaluate(() => {
    const s = document.getElementById('s');
    return { triggers: document.querySelectorAll('.ss-trigger').length, inForm: s.form?.id, required: s.required, name: s.name,
      label: s.labels[0]?.htmlFor, tabIndex: s.tabIndex, ariaName: s.closest('.ss').querySelector('.ss-trigger').getAttribute('aria-label') };
  });
  assert.deepEqual(info, { triggers: 2, inForm: 'f', required: true, name: 'ville', label: 's', tabIndex: -1, ariaName: 'Ville' });
  // Idempotent : une seconde passe n'ajoute rien.
  await page.evaluate(() => { window.ss.enhanceAll(document); window.ss.watchSelects(document.documentElement); window.ss.enhanceSelect(document.getElementById('s')); });
  assert.equal(await page.locator('.ss-trigger').count(), 2, 'aucune double amélioration');

  // Ouverture : le champ de recherche est en tête du panneau et reçoit le focus.
  await page.click(trigger);
  info = await page.evaluate(() => {
    const p = document.querySelector('.ss-panel');
    const input = p.firstElementChild.querySelector('input');
    return { first: p.firstElementChild.className, placeholder: input?.placeholder, focused: document.activeElement === input, role: input?.getAttribute('role'),
      listbox: p.querySelector('[role=listbox]')?.id, controls: document.querySelector('#s ~ .ss-trigger').getAttribute('aria-controls') };
  });
  assert.equal(info.first, 'ss-search');
  assert.equal(info.placeholder, 'Rechercher…');
  assert.ok(info.focused, 'focus dans la recherche');
  assert.equal(info.role, 'combobox');
  assert.equal(info.listbox, info.controls, 'motif ARIA combobox / listbox');
  assert.equal((await state()).expanded, 'true');

  // Recherche insensible à la casse et aux accents ; état « Aucun résultat ».
  await page.keyboard.type('BOUAKE');
  assert.deepEqual((await state()).options, ['Bouaké']);
  await page.fill('.ss-search-input', 'zzz');
  info = await state();
  assert.deepEqual(info.options, []);
  assert.ok(info.empty, '« Aucun résultat » affiché');
  // Groupe respecté : le libellé du groupe accompagne l'option trouvée.
  await page.fill('.ss-search-input', 'ferke');
  assert.equal(await page.locator('.ss-group-label').textContent(), 'Nord');
  // Entrée : la valeur native change, « input » et « change » partent, FormData la lit, le focus revient au déclencheur.
  await page.keyboard.press('Enter');
  info = await state();
  assert.equal(info.value, 'fer');
  assert.equal(info.formValue, 'fer');
  assert.equal(info.changes, 1);
  assert.equal(info.inputs, 1);
  assert.equal(info.label, 'Ferkessédougou');
  assert.equal(info.open, false);
  assert.equal(info.focus, 'trigger');

  // Échap : ferme sans rien changer.
  await page.keyboard.press('ArrowDown');
  assert.ok((await state()).open, 'Flèche bas ouvre la liste');
  await page.keyboard.press('Home');
  await page.keyboard.press('Escape');
  info = await state();
  assert.equal(info.open, false); assert.equal(info.value, 'fer'); assert.equal(info.changes, 1); assert.equal(info.focus, 'trigger');

  // Option désactivée : jamais choisie ; Fin va à la dernière option active.
  await page.keyboard.type('san');
  assert.deepEqual((await state()).options, ['San-Pédro']);
  assert.equal(await page.locator('.ss-option[aria-disabled="true"]').count(), 1);
  await page.keyboard.press('Enter');
  assert.equal((await state()).value, 'fer', 'option désactivée non sélectionnable');
  await page.fill('.ss-search-input', '');
  await page.keyboard.press('End');
  assert.equal(await page.evaluate(() => document.querySelector('.ss-option.is-active')?.textContent.trim()), 'Ferkessédougou');
  await page.keyboard.press('Home');
  assert.equal(await page.evaluate(() => document.querySelector('.ss-option.is-active')?.textContent.trim()), '— choisir —');
  // Clic extérieur : fermeture.
  await page.click('#outside');
  assert.equal((await state()).open, false);

  // Valeur posée par programme, option ajoutée, select désactivé : le déclencheur suit.
  await page.evaluate(() => { document.getElementById('s').value = 'abj'; });
  assert.equal((await state()).label, 'Abidjan');
  await page.evaluate(() => { document.getElementById('s').selectedIndex = 2; });
  assert.equal((await state()).label, 'Bouaké');
  await page.evaluate(() => { const o = new Option('Yamoussoukro', 'yam'); document.getElementById('s').append(o); });
  await page.click(trigger);
  await page.keyboard.type('yamou');
  assert.deepEqual((await state()).options, ['Yamoussoukro']);
  await page.click('.ss-option');
  info = await state();
  assert.equal(info.value, 'yam'); assert.equal(info.changes, 2);
  await page.evaluate(() => { document.getElementById('s').disabled = true; });
  await page.waitForFunction(() => document.querySelector('#s ~ .ss-trigger').disabled);
  await page.evaluate(() => { document.getElementById('s').disabled = false; });

  // Champ obligatoire : la validation native du formulaire s'applique toujours au select.
  info = await page.evaluate(() => { const s = document.getElementById('s'); s.value = ''; const ok = s.form.reportValidity(); return { ok, focus: document.activeElement === s }; });
  assert.deepEqual(info, { ok: false, focus: true }, 'required conservé, message du navigateur sur la liste');
  await page.keyboard.press('ArrowDown');
  assert.ok((await state()).open, 'depuis le message de validation, le clavier ouvre la liste');
  await page.keyboard.press('Escape');

  // Clic sur l'étiquette : le focus va au déclencheur, jamais au select masqué.
  await page.click('label[for="s"]');
  assert.equal((await state()).focus, 'trigger');
  // Saisie directe sur le déclencheur : la liste s'ouvre déjà filtrée.
  await page.keyboard.type('k');
  assert.equal(await page.inputValue('.ss-search-input'), 'k');
  assert.ok((await state()).options.includes('Korhogo'));
  await page.keyboard.press('Escape');

  // Sélection multiple : la liste reste ouverte, plusieurs valeurs natives.
  await page.click('select[name="pays"] ~ .ss-trigger');
  await page.keyboard.type('cote');
  await page.keyboard.press('Enter');
  await page.fill('.ss-search-input', 'mali');
  await page.keyboard.press('Enter');
  info = await page.evaluate(() => ({ values: new FormData(document.getElementById('f')).getAll('pays'), open: !!document.querySelector('.ss-panel')?.isConnected,
    label: document.querySelector('select[name="pays"] ~ .ss-trigger .ss-value').textContent, multi: document.querySelector('.ss-panel [role=listbox]').getAttribute('aria-multiselectable') }));
  assert.deepEqual(info, { values: ['ci', 'ml'], open: true, label: 'Côte d’Ivoire, Mali', multi: 'true' });
  await page.keyboard.press('Escape');

  // Panneau contenu dans l'écran à 390 px.
  await page.click(trigger);
  const box = await page.evaluate(() => { const r = document.querySelector('.ss-panel').getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: innerWidth, h: innerHeight, sw: document.documentElement.scrollWidth }; });
  assert.ok(box.l >= 0 && box.r <= box.w && box.t >= 0 && box.b <= box.h, `panneau dans l’écran ${JSON.stringify(box)}`);
  assert.ok(box.sw <= box.w, 'aucun défilement horizontal');
  await page.keyboard.press('Escape');

  // Liste insérée plus tard (modale, filtre) : améliorée automatiquement ; données échappées.
  await page.evaluate(() => { document.getElementById('later').innerHTML = '<select id="late" aria-label="Choix tardif"><option value="x">&lt;img src=x onerror=alert(1)&gt; Option</option></select>'; });
  await page.waitForFunction(() => !!document.querySelector('#late ~ .ss-trigger'));
  await page.click('#late ~ .ss-trigger');
  info = await page.evaluate(() => ({ html: document.querySelector('.ss-panel .ss-list').innerHTML, text: document.querySelector('.ss-panel .ss-option').textContent.trim() }));
  assert.ok(!info.html.includes('<img'), 'libellé inséré échappé');
  assert.equal(info.text, '<img src=x onerror=alert(1)> Option');
  await page.keyboard.press('Escape');
  // Liste retirée du document : panneau et observateurs libérés.
  await page.click('#late ~ .ss-trigger');
  await page.evaluate(() => { document.getElementById('later').innerHTML = ''; });
  await page.waitForFunction(() => !document.querySelector('.ss-panel'));

  assert.deepEqual(errors, [], 'aucune erreur JavaScript');
  console.log('Lot d0 : select natif conservé (valeur, événements, FormData, required), clavier, ARIA, synchronisation et observateur vérifiés dans Chromium.');
} finally {
  await browser.close();
}
