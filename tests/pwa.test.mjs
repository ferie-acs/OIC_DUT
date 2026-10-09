import assert from 'node:assert/strict';
import { listPrecacheFiles } from '../tools/pwa/precache.mjs';
const files = await listPrecacheFiles(new URL('..', import.meta.url).pathname);
assert.ok(files.includes('index.html'));
assert.ok(files.includes('manifest.webmanifest'));
assert.ok(files.includes('css/charte-oic.css'));
assert.ok(files.includes('js/app.js'));
assert.ok(files.includes('js/views/control.view.js'));
assert.ok(files.includes('assets/icons/icon-192.png'));
assert.ok(!files.some((f) => f.startsWith('tools/') || f.startsWith('tests/') || f.startsWith('docs/') || f.startsWith('output/') || f === 'sw.js'), 'ni outils, ni tests, ni docs, ni le service worker lui-même');
assert.ok(!files.some((f) => f.endsWith('.mp4') || f.endsWith('.zip')), 'pas de médias lourds');
console.log(`PWA : ${files.length} fichiers à pré-cacher, périmètre borné à l’application.`);

// precache.json doit refléter les fichiers réellement publiés : à régénérer (node tools/pwa/precache.mjs) avant chaque livraison.
{
  const { contentVersion } = await import('../tools/pwa/precache.mjs');
  const { readFile } = await import('node:fs/promises');
  const root = new URL('..', import.meta.url).pathname;
  const current = JSON.parse(await readFile(`${root}/precache.json`, 'utf8'));
  assert.equal(current.version, await contentVersion(root, files), 'precache.json périmé : lancez `node tools/pwa/precache.mjs`');
  console.log('PWA : precache.json à jour.');
}
