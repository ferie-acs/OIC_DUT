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

// Scénario : structure, contiguïté, durée.
{
  const scenario = await import('../js/demo3d/scenario.js');
  const { validateScenario } = await import('../js/demo3d/scenario.validate.js');
  const { PALETTE, DUT_STATUS_STYLE } = await import('../js/demo3d/palette.js');
  assert.deepEqual(validateScenario(scenario), []);
  assert.equal(scenario.TOTAL_MS, 75000);
  assert.equal(scenario.SHOTS.length, 8);
  assert.deepEqual(scenario.SHOTS.map((s) => s.id),
    ['port', 'creation', 'validation', 'impression', 'route', 'controle', 'livraison', 'audit']);
  assert.equal(scenario.AUDIT.length, 6);
  for (const st of scenario.DUT_STATUSES) assert.ok(st in DUT_STATUS_STYLE, `style manquant : ${st}`);
  for (const v of Object.values(PALETTE).flat()) assert.match(v, /^#[0-9A-F]{6}$/i);
  // Un scénario cassé est détecté.
  const broken = { ...scenario, SHOTS: scenario.SHOTS.map((s, i) => (i === 3 ? { ...s, at: s.at + 1 } : s)) };
  assert.ok(validateScenario(broken).some((e) => e.includes('contigu')));
  const noSub = { ...scenario, SHOTS: scenario.SHOTS.map((s, i) => (i === 0 ? { ...s, subtitle: ' ' } : s)) };
  assert.ok(validateScenario(noSub).some((e) => e.includes('sous-titre')));
  console.log('demo3d : scénario valide (8 plans, 75 s).');
}
