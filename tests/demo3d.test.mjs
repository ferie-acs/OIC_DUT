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

// Moteur d'état : pur, déterministe, borné.
{
  const { stateAt, frustum, PATHS, FOLLOW_LAG_MS, BASE_VIEW_HEIGHT } = await import('../js/demo3d/timeline.js');
  const { smooth, makePath, sampleAt, nearestU } = await import('../js/demo3d/path.js');
  const { keyed, stepped } = await import('../js/demo3d/keyframes.js');
  const { TOTAL_MS, PLACES, DUT_NUMBER } = await import('../js/demo3d/scenario.js');

  // Briques.
  assert.equal(keyed([[0, 0], [100, 10]], 50, (t) => t), 5);
  assert.deepEqual(keyed([[0, [0, 0]], [100, [10, 20]]], 100), [10, 20]);
  assert.equal(stepped([[0, 'a'], [10, 'b']], 9), 'a');
  assert.equal(stepped([[0, 'a'], [10, 'b']], 10), 'b');
  const line = makePath([[0, 0], [10, 0]]);
  assert.equal(line.length, 10);
  assert.deepEqual(sampleAt(line, 0.5), { x: 5, z: 0, heading: Math.PI / 2 });
  assert.ok(Math.abs(nearestU(line, [3, 4]).u - 0.3) < 1e-9);
  const sm = smooth([[0, 0], [10, 0], [10, 10]]);
  assert.deepEqual(sm[0], [0, 0]);
  assert.deepEqual(sm[sm.length - 1], [10, 10]);

  // Déterminisme : deux appels identiques donnent le même état.
  for (const ms of [0, 12345, 45000, 55000, 74999]) assert.deepEqual(stateAt(ms), stateAt(ms));

  // Bornes (Review Focus 1).
  assert.deepEqual(stateAt(-5000), stateAt(0));
  assert.deepEqual(stateAt(1e9), stateAt(TOTAL_MS));
  assert.deepEqual(stateAt(Number.NaN), stateAt(0));
  assert.deepEqual(stateAt(undefined), stateAt(0));

  // Récit.
  assert.equal(stateAt(0).dut.status, 'aucun');
  assert.equal(stateAt(10000).dut.status, 'brouillon');
  assert.equal(stateAt(10000).dut.number, null);
  assert.equal(stateAt(25000).dut.number, DUT_NUMBER);
  assert.equal(stateAt(30000).dut.qr, false);
  assert.equal(stateAt(34000).dut.qr, true);
  assert.equal(stateAt(61000).dut.status, 'authentique');
  assert.equal(stateAt(71000).dut.status, 'livre');
  assert.equal(stateAt(20000).dut.anchor, 'document');
  assert.equal(stateAt(30000).dut.anchor, 'truck');

  // Le camion attend au poste de contrôle puis rejoint la destination.
  const atCheck = stateAt(55000).truck;
  assert.ok(Math.hypot(atCheck.x - PLACES.checkpointStop[0], atCheck.z - PLACES.checkpointStop[1]) < 0.5);
  const atEnd = stateAt(74000).truck;
  assert.ok(Math.hypot(atEnd.x - PLACES.destinationDock[0], atEnd.z - PLACES.destinationDock[1]) < 0.5);
  assert.ok(Math.hypot(stateAt(10000).truck.x - PLACES.partnerDock[0], stateAt(10000).truck.z - PLACES.partnerDock[1]) < 0.5);

  // Caméra en suivi pendant la route : cible = camion avec retard.
  const s = stateAt(45000);
  const lagged = stateAt(45000 - FOLLOW_LAG_MS).truck;
  assert.ok(Math.hypot(s.camera.x - lagged.x, s.camera.z - lagged.z) < 1e-6);

  // Barrière fermée pendant le scan, ouverte au départ.
  assert.equal(stateAt(57000).fx.barrier, 0);
  assert.equal(stateAt(62000).fx.barrier, 1);
  assert.ok(stateAt(57000).fx.scan > 0);

  // Journal d'audit : 6 lignes allumées en fin de film.
  assert.equal(stateAt(71000).audit.visible, false);
  assert.equal(stateAt(TOTAL_MS).audit.lit, 6);

  // Sous-titres : fondu d'entrée, texte du plan courant.
  assert.equal(stateAt(6000).subtitle.opacity, 0);
  assert.equal(stateAt(10000).subtitle.opacity, 1);
  assert.equal(stateAt(10000).subtitle.text, 'Le partenaire crée le DUT.');

  // Cadrage : hauteur fixe, largeur suivant l'aspect (Review Focus 2).
  assert.deepEqual(frustum(16 / 9, 1), { halfH: BASE_VIEW_HEIGHT / 2, halfW: (BASE_VIEW_HEIGHT / 2) * (16 / 9) });
  assert.equal(frustum(16 / 9, 2).halfH, BASE_VIEW_HEIGHT / 4);
  assert.ok(PATHS.truck.length > 100);
  console.log('demo3d : moteur d’état déterministe et borné.');
}

// Lecture : avance plafonnée (Review Focus 3) ; projection écran (Review Focus 2).
{
  const { advance, MAX_STEP_MS } = await import('../js/demo3d/player.js');
  const { ndcToPixels } = await import('../js/demo3d/overlay/project.js');
  assert.equal(MAX_STEP_MS, 100);
  assert.equal(advance(1000, 16, 75000), 1016);
  assert.equal(advance(1000, 5000, 75000), 1100, 'retour d’onglet : pas de saut de 5 s');
  assert.equal(advance(74990, 50, 75000), 75000);
  assert.equal(advance(1000, -20, 75000), 1000, 'horloge qui recule : on ne recule pas');
  assert.deepEqual(ndcToPixels(0, 0, 1920, 1080), { left: 960, top: 540 });
  assert.deepEqual(ndcToPixels(-1, 1, 1920, 1080), { left: 0, top: 0 });
  assert.deepEqual(ndcToPixels(1, -1, 800, 450), { left: 800, top: 450 });
  console.log('demo3d : lecture plafonnée, projection écran exacte.');
}

// Décor : aucun arbre ni palmier sur la chaussée ni sur les trajectoires.
{
  const { LAYOUT } = await import('../js/demo3d/world/layout.js');
  const { PATHS } = await import('../js/demo3d/timeline.js');
  const { nearestU } = await import('../js/demo3d/path.js');
  for (const [x, z] of [...LAYOUT.trees, ...LAYOUT.palms].map((p) => p.at)) {
    assert.ok(Math.abs(z) > 7, `végétation sur la route : ${x},${z}`);
    assert.ok(nearestU(PATHS.truck, [x, z]).dist > 4, `végétation sur le trajet du camion : ${x},${z}`);
  }
  console.log(`demo3d : décor hors chaussée (${LAYOUT.trees.length} arbres, ${LAYOUT.palms.length} palmiers).`);
}

// Circulation d'ambiance : présente dans le plan d'ouverture, absente dès le départ du camion suivi.
// (Bornes de chaussée et apparitions hors champ : bloc « Passe de corrections » plus bas.)
{
  const { stateAt } = await import('../js/demo3d/timeline.js');
  assert.ok(stateAt(3000).traffic.some((t) => t.visible), 'aucun camion dans le plan d’ouverture');
  for (let ms = 38000; ms <= 75000; ms += 500) assert.ok(stateAt(ms).traffic.every((t) => !t.visible), `circulation visible à ${ms} ms`);
  console.log('demo3d : circulation limitée à la partie port.');
}

// Contrat d'horloge unique (spec §5.2-2) : la scène ne dépend que de stateAt(ms).
{
  const { readdir, readFile: rf } = await import('node:fs/promises');
  const dir = `${root}js/demo3d`;
  const files = (await readdir(dir, { recursive: true })).filter((f) => f.endsWith('.js') && !f.startsWith('vendor'));
  const CLOCK = /requestAnimationFrame|setTimeout|setInterval|Date\.now|performance\.now|Math\.random/;
  const violations = [];
  for (const f of files) {
    const src = await rf(`${dir}/${f}`, 'utf8');
    if (f !== 'player.js' && CLOCK.test(src)) violations.push(`${f} : horloge ou hasard hors player.js`);
    if (/innerHTML/.test(src)) violations.push(`${f} : innerHTML interdit`);
  }
  const css = await rf(`${dir}/demo3d.css`, 'utf8');
  if (/transition|animation|@keyframes/.test(css)) violations.push('demo3d.css : transition ou animation CSS interdite');
  assert.deepEqual(violations, []);
  console.log(`demo3d : contrat d’horloge respecté (${files.length} fichiers).`);
}

// ---- Passe de corrections de la revue finale ----

// Circulation : uniquement sur la chaussée, jamais visible après 38 s, et chaque apparition /
// disparition a lieu hors champ (à l'est) ou à l'intérieur du hangar du terminal (à l'ouest).
{
  const { stateAt } = await import('../js/demo3d/timeline.js');
  const { ROAD, PORT_GATE } = await import('../js/demo3d/world/layout.js');
  const prev = new Map();
  for (let ms = 0; ms <= 75000; ms += 100) {
    for (const t of stateAt(ms).traffic) {
      if (t.visible) {
        assert.ok(t.x >= PORT_GATE.hideX - 0.01 && t.x <= ROAD.toX + 0.01, `${t.id} hors chaussée à ${ms} ms (x = ${t.x.toFixed(1)})`);
        assert.ok(ms < 38000, `${t.id} visible pendant la route (${ms} ms)`);
      }
      const was = prev.get(t.id);
      if (was !== undefined && was.visible !== t.visible) {
        const edge = t.visible ? t : was;
        const inGate = edge.x <= PORT_GATE.hideX + 1 && edge.x >= PORT_GATE.x0 && Math.abs(edge.z - PORT_GATE.zCenter) < PORT_GATE.width / 2;
        assert.ok(inGate || edge.x >= ROAD.toX - 1, `${t.id} apparaît/disparaît en plein champ à ${ms} ms (x = ${edge.x.toFixed(1)})`);
      }
      prev.set(t.id, t);
    }
  }
  console.log('demo3d : circulation sur la chaussée, apparitions hors champ.');
}

// Chariot : son emprise ne touche ni la façade de l'entrepôt partenaire ni le camion à quai.
{
  const { stateAt } = await import('../js/demo3d/timeline.js');
  const { PLACES } = await import('../js/demo3d/scenario.js');
  const corners = ({ x, z, heading }, back, front, half) => {
    const s = Math.sin(heading);
    const c = Math.cos(heading);
    return [[-half, back], [half, back], [half, front], [-half, front]].map(([lx, lz]) => [x + lx * c + lz * s, z - lx * s + lz * c]);
  };
  const facadeZ = PLACES.warehouseDoor[1];
  for (let ms = 28000; ms <= 37000; ms += 100) {
    const s = stateAt(ms);
    const f = corners(s.forklift, -1.4, 2.4, 0.85);
    assert.ok(f.every(([, z]) => z > facadeZ + 0.1), `chariot dans la façade à ${ms} ms`);
    const t = corners(s.truck, -5.1, 5.1, 1.3);
    const tMinX = Math.min(...t.map((p) => p[0]));
    const tMaxX = Math.max(...t.map((p) => p[0]));
    const tMinZ = Math.min(...t.map((p) => p[1]));
    assert.ok(f.every(([x, z]) => z < tMinZ - 0.1 || x < tMinX - 0.1 || x > tMaxX + 0.1), `chariot dans le camion à ${ms} ms`);
  }
  console.log('demo3d : chariot hors façade et hors camion.');
}

// Mise à quai perpendiculaire à destination (cap -z).
{
  const { stateAt } = await import('../js/demo3d/timeline.js');
  assert.ok(Math.abs(Math.abs(stateAt(74000).truck.heading) - Math.PI) < 0.01, 'camion en biais au quai de destination');
  console.log('demo3d : mise à quai perpendiculaire.');
}

// Points du trajet : seulement devant, sur la jambe en cours (aller ou retour).
{
  const { dotAhead } = await import('../js/demo3d/path.js');
  assert.equal(dotAhead(0.3, 0.2, [0.5]), true);
  assert.equal(dotAhead(0.7, 0.2, [0.5]), false, 'point du retour affiché pendant l’aller');
  assert.equal(dotAhead(0.7, 0.6, [0.5]), true);
  assert.equal(dotAhead(0.3, 0.6, [0.5]), false);
  assert.equal(dotAhead(0.9, 0.4, []), true);
  console.log('demo3d : points du trajet limités à la jambe en cours.');
}

// Polices : les trois graisses chargées avant le premier rendu, servies localement (pas de Google Fonts).
{
  const main = await readFile(`${root}js/demo3d/main.js`, 'utf8');
  const comp = await readFile(`${root}video/demo-3d-dut/index.html`, 'utf8');
  for (const w of ['500', '600', '700']) {
    assert.match(main, new RegExp(`fonts\\.load\\(['"\`]${w} `), `main.js ne charge pas la graisse ${w}`);
    assert.match(comp, new RegExp(`fonts\\.load\\(['"\`]${w} `), `composition : graisse ${w} non chargée`);
  }
  const page = await readFile(`${root}demo-3d.html`, 'utf8');
  assert.doesNotMatch(page, /fonts\.(googleapis|gstatic)\.com/, 'demo-3d.html dépend encore de Google Fonts');
  console.log('demo3d : polices locales, trois graisses préchargées.');
}

// Composition HyperFrames : message de repli si WebGL manque.
{
  const comp = await readFile(`${root}video/demo-3d-dut/index.html`, 'utf8');
  assert.match(comp, /id="d3-fallback"/, 'composition sans repli WebGL');
  console.log('demo3d : composition avec repli WebGL.');
}

// Liens symboliques du projet vidéo : uniquement vers js/demo3d (rien d'autre du dépôt ne peut être publié).
{
  const { readdir, lstat, realpath } = await import('node:fs/promises');
  const allowed = await realpath(`${root}js/demo3d`);
  const links = [];
  const walk = async (dir) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if ((await lstat(p)).isSymbolicLink()) links.push([p, await realpath(p)]);
      else if (e.isDirectory() && !['node_modules', 'renders', 'snapshots'].includes(e.name)) await walk(p);
    }
  };
  await walk(`${root}video`);
  for (const [p, target] of links) assert.ok(target === allowed, `lien interdit : ${p} -> ${target}`);
  console.log(`demo3d : liens symboliques bornés (${links.length}).`);
}
