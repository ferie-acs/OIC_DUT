import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url).pathname;

// Three.js vendorisé : r186 exactement.
{
  const core = await readFile(`${root}js/demo3d/vendor/three.core.js`, 'utf8');
  assert.match(core, /REVISION = '186'/, 'Three.js doit être en r186');
  const mod = await readFile(`${root}js/demo3d/vendor/three.module.js`, 'utf8');
  assert.match(mod, /from '\.\/three\.core\.js'/, 'le module doit importer le core vendorisé');
  console.log('demo3d : Three.js r186 vendorisé.');
}
