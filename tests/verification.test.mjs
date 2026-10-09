import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, v),
  removeItem: (k) => store.delete(k),
};
globalThis.window = { matchMedia: () => ({ matches: false }), crypto: globalThis.crypto };

// ---------------------------------------------------------------------------
// Tâche 1 — clé de démonstration et signature de charge
// ---------------------------------------------------------------------------

const { toBase64Url, fromBase64Url, ensureDemoKey, loadKey, signPayload, verifySignedString } =
  await import('../js/services/signing.service.js');

// base64url : aller-retour, sans '=' ni '+' ni '/'.
const bytes = new Uint8Array([0, 251, 255, 62, 63, 1]);
const b64 = toBase64Url(bytes);
assert.ok(!/[=+/]/.test(b64), 'base64url ne contient ni =, ni +, ni /');
assert.deepEqual([...fromBase64Url(b64)], [...bytes]);

// Clé de démonstration : créée une fois, relue ensuite à l'identique.
assert.equal(loadKey(), null, 'aucune clé avant ensemencement');
const key = await ensureDemoKey();
assert.equal(key.kid, 'demo-2026-10');
assert.equal(key.demo, true);
assert.ok(key.publicJwk && key.privateJwk, 'paire JWK attendue');
const again = await ensureDemoKey();
assert.equal(again.kid, key.kid);
assert.deepEqual(again.publicJwk, key.publicJwk, 'ensureDemoKey ne régénère pas une clé existante');

// Signature : aller-retour.
const payload = { v: 2, kid: key.kid, uid: 'u-1', num: 'DUT-CI-2026-000401', plq: 'AA-0001-AA', nbf: '2026-10-09', exp: '2026-10-16' };
const signed = await signPayload(payload, key);
assert.ok(signed.includes('.'), 'forme <charge>.<signature>');
const ok = await verifySignedString(signed, key);
assert.equal(ok.ok, true);
assert.deepEqual(ok.payload, payload);

// Charge altérée d'un caractère → invalide.
const [charge, sig] = signed.split('.');
const altered = `${charge.slice(0, -1)}${charge.at(-1) === 'A' ? 'B' : 'A'}.${sig}`;
assert.equal((await verifySignedString(altered, key)).ok, false);

// Mauvaise clé → invalide.
store.delete('dut_signing_key_v1');
const otherKey = await ensureDemoKey();
assert.equal((await verifySignedString(signed, otherKey)).ok, false, 'une autre clé ne vérifie pas');

// Review Focus n°4 : plaque non ASCII et plaque absente.
const accent = await signPayload({ ...payload, plq: 'Ç-É-0001' }, otherKey);
assert.equal((await verifySignedString(accent, otherKey)).payload.plq, 'Ç-É-0001');
const noPlate = await signPayload({ ...payload, plq: '' }, otherKey);
assert.equal((await verifySignedString(noPlate, otherKey)).ok, true);

// Chaîne malformée : jamais d'exception.
assert.equal((await verifySignedString('pas-un-qr', otherKey)).ok, false);
assert.equal((await verifySignedString('', otherKey)).ok, false);

console.log('Signature : base64url, clé de démonstration stable, aller-retour, altération et mauvaise clé refusées.');

// ---------------------------------------------------------------------------
// Tâche 2 — format du QR v2
// ---------------------------------------------------------------------------

const { parseQr, buildSignedUri } = await import('../js/services/qr.service.js');

const uri = buildSignedUri(signed);
assert.ok(uri.startsWith('oicdut://v2/'));
const parsed = parseQr(uri);
assert.equal(parsed.format, 'v2');
assert.equal(parsed.token, 'u-1', 'le jeton est le uid de la charge');
assert.equal(parsed.signed, signed);
assert.equal(parsed.payload.num, 'DUT-CI-2026-000401');

// Entrées rejetées : ancien schéma, préfixe seul, charge indécodable, vide.
for (const bad of ['oicdut://verify/u-1', 'oicdut://v2/', 'oicdut://v2/%%%.%%%', '', null, 'DUT-CI-2026-000401']) {
  const p = parseQr(bad);
  assert.equal(p.format, 'invalid', `doit être invalide : ${JSON.stringify(bad)}`);
  assert.equal(p.token, null);
}

// Espaces autour : tolérés.
assert.equal(parseQr(`  ${uri}  `).format, 'v2');

console.log('QR v2 : construction, lecture, rejet de tout autre format.');

// ---------------------------------------------------------------------------
// Tâche 3 — pipeline de vérification
// ---------------------------------------------------------------------------

const V = await import('../js/services/verification.service.js');

// Haversine : Abidjan ↔ Bouaké ≈ 284 km à vol d'oiseau (Δlat 2,345° ≈ 261 km, Δlng ≈ 111 km) ; ±10 km.
const ABIDJAN = { lat: 5.345, lng: -4.024 };
const BOUAKE = { lat: 7.690, lng: -5.030 };
const km = V.haversineKm(ABIDJAN, BOUAKE);
assert.ok(km > 274 && km < 294, `distance Abidjan-Bouaké attendue ~284 km, obtenu ${km.toFixed(1)}`);

const T0 = new Date('2026-10-10T10:00:00Z');
const dutOk = { id: 'd1', qrToken: 'u-1', status: 'VALIDE', dutNumber: 'DUT-CI-2026-000401', canary: false };
const baseCtx = (over = {}) => ({
  now: T0, online: true, post: { id: 'p-bke', name: 'Bouaké', ...BOUAKE }, geo: null,
  parsed: parseQr(uri), key: otherKey, dut: dutOk, controls: [], crl: null, ...over,
});

// Signature : vraie → ok ; altérée → block ; clé absente → warn.
assert.equal((await V.checkSignature(baseCtx({ parsed: parseQr(buildSignedUri(await signPayload(payload, otherKey))) }))).severity, 'ok');
assert.equal((await V.checkSignature(baseCtx({ parsed: parseQr(buildSignedUri(altered)) }))).severity, 'block');
assert.equal((await V.checkSignature(baseCtx({ key: null }))).severity, 'warn', 'clé absente : non vérifiable, pas rouge');

// Validité : dans la fenêtre / avant / après.
const inWindow = { ...payload, nbf: '2026-10-09', exp: '2026-10-16' };
assert.equal(V.checkValidity(baseCtx({ parsed: { format: 'v2', payload: inWindow } })).severity, 'ok');
assert.equal(V.checkValidity(baseCtx({ parsed: { format: 'v2', payload: { ...inWindow, nbf: '2026-10-11' } } })).severity, 'block');
assert.equal(V.checkValidity(baseCtx({ parsed: { format: 'v2', payload: { ...inWindow, exp: '2026-10-09' } } })).severity, 'block');

// Statut : en ligne fait foi ; hors ligne non consultable.
assert.equal(V.checkStatus(baseCtx()).severity, 'ok');
assert.equal(V.checkStatus(baseCtx({ dut: { ...dutOk, status: 'SUSPENDU' } })).severity, 'block');
assert.equal(V.checkStatus(baseCtx({ dut: { ...dutOk, status: 'RETIRE' } })).severity, 'block');
assert.equal(V.checkStatus(baseCtx({ dut: null })).severity, 'block');
assert.equal(V.checkStatus(baseCtx({ online: false })).severity, 'info');

// Révocation (hors ligne) : présent → block ; 23 h → ok ; 25 h → warn ; 73 h → NON_OPPOSABLE ; absente → NON_OPPOSABLE.
const crlAt = (hoursAgo, entries = []) => ({ syncedAt: new Date(T0.getTime() - hoursAgo * 3600e3).toISOString(), entries });
assert.equal(V.checkRevocation(baseCtx({ online: false, crl: crlAt(2, [{ uid: 'u-1', status: 'RETIRE' }]) })).severity, 'block');
assert.equal(V.checkRevocation(baseCtx({ online: false, crl: crlAt(23) })).severity, 'ok');
assert.equal(V.checkRevocation(baseCtx({ online: false, crl: crlAt(25) })).severity, 'warn');
assert.equal(V.checkRevocation(baseCtx({ online: false, crl: crlAt(73) })).code, 'NON_OPPOSABLE');
assert.equal(V.checkRevocation(baseCtx({ online: false, crl: null })).code, 'NON_OPPOSABLE');
assert.equal(V.checkRevocation(baseCtx({ online: true })), null, 'en ligne, la liste locale ne sert pas');

// Voyage impossible : vu à Abidjan il y a 1 h, contrôlé à Bouaké → block ; il y a 6 h → ok.
const seen = (hoursAgo, pos) => ({ dutId: 'd1', date: new Date(T0.getTime() - hoursAgo * 3600e3).toISOString(), lat: pos.lat, lng: pos.lng });
assert.equal(V.checkTravel(baseCtx({ controls: [seen(1, ABIDJAN)] })).severity, 'block');
assert.equal(V.checkTravel(baseCtx({ controls: [seen(6, ABIDJAN)] })).severity, 'ok');
// Review Focus n°2 : contrôle ensemencé sans position → ignoré.
assert.equal(V.checkTravel(baseCtx({ controls: [{ dutId: 'd1', date: seen(1, ABIDJAN).date, lat: null, lng: null }] })).severity, 'ok');
// Review Focus n°3 : ni poste ni géolocalisation → info, pas d'exception.
assert.equal(V.checkTravel(baseCtx({ post: null, geo: null, controls: [seen(1, ABIDJAN)] })).severity, 'info');
// La géolocalisation prime sur le poste.
assert.equal(V.checkTravel(baseCtx({ geo: ABIDJAN, controls: [seen(1, ABIDJAN)] })).severity, 'ok');
// Un contrôle d'un AUTRE DUT ne compte pas.
assert.equal(V.checkTravel(baseCtx({ controls: [{ ...seen(1, ABIDJAN), dutId: 'autre' }] })).severity, 'ok');

// Canari.
assert.equal(V.checkCanary(baseCtx({ dut: { ...dutOk, canary: true } })).severity, 'block');
assert.equal(V.checkCanary(baseCtx()), null);

// Repli.
const F = (severity, code = 'X') => ({ check: 'x', severity, code, message: '' });
assert.equal(V.foldVerdict([F('ok')], { online: true }), 'VERT');
assert.equal(V.foldVerdict([F('ok')], { online: false }), 'ORANGE', 'jamais vert hors ligne');
assert.equal(V.foldVerdict([F('ok'), F('warn')], { online: true }), 'ORANGE');
assert.equal(V.foldVerdict([F('warn'), F('block')], { online: true }), 'ROUGE');
assert.equal(V.foldVerdict([F('block', 'NON_OPPOSABLE')], { online: false }), 'INCONNU', 'liste trop ancienne seule : non opposable');
assert.equal(V.foldVerdict([F('block'), F('block', 'NON_OPPOSABLE')], { online: false }), 'ROUGE', 'un autre constat bloquant prime sur NON_OPPOSABLE (revue finale)');
assert.equal(V.foldVerdict([], { online: true }), 'VERT');

// verify() de bout en bout, dépendances injectées.
const goodUri = buildSignedUri(await signPayload({ ...payload, nbf: '2026-10-09', exp: '2026-10-16' }, otherKey));
const deps = { key: otherKey, findDut: (t) => (t === 'u-1' ? dutOk : null), controls: [], crl: null };
const verdict = await V.verify(goodUri, { now: T0, online: true, post: baseCtx().post, geo: null }, deps);
assert.equal(verdict.level, 'VERT');
assert.equal(verdict.mode, 'EN_LIGNE');
// En ligne, checkRevocation se tait ; checkCanary se tait hors piège. On
// vérifie l'ensemble exact des vérificateurs qui ont parlé, pas un nombre.
assert.deepEqual(verdict.findings.map((x) => x.check).sort(), ['signature', 'statut', 'trajet', 'validite']);
const offline = await V.verify(goodUri, { now: T0, online: false, post: baseCtx().post, geo: null }, { ...deps, crl: crlAt(2) });
assert.equal(offline.level, 'ORANGE');
assert.equal(offline.mode, 'HORS_LIGNE');
assert.ok(offline.crlAgeHours >= 1.9 && offline.crlAgeHours <= 2.1);
// Review Focus n°5 : hors ligne, liste jamais synchronisée → INCONNU, pas d'exception.
assert.equal((await V.verify(goodUri, { now: T0, online: false, post: null, geo: null }, { ...deps, crl: null })).level, 'INCONNU');
// QR malformé → INCONNU avec un constat explicite.
const bad = await V.verify('n-importe-quoi', { now: T0, online: true, post: null, geo: null }, deps);
assert.equal(bad.level, 'INCONNU');
assert.ok(bad.findings.some((x) => x.code === 'QR_INVALIDE'));

console.log('Pipeline : six vérificateurs, Haversine, repli, verify() en ligne, hors ligne, liste absente, QR malformé.');

// ---------------------------------------------------------------------------
// Tâche 4 — liste de révocation, réglages de contrôle, horloge de démonstration
// ---------------------------------------------------------------------------

const { getControlSettings, saveControlSettings } = await import('../js/repositories/control-settings.repository.js');
const { getCrl } = await import('../js/repositories/revocations.repository.js');
const { addDut } = await import('../js/repositories/dut.repository.js');
const R = await import('../js/services/revocation.service.js');

// Réglages : valeurs par défaut, puis fusion.
assert.deepEqual(getControlSettings(), { offlineSimulated: false, clockOffsetHours: 0, postId: null });
saveControlSettings({ clockOffsetHours: 48 });
assert.equal(getControlSettings().clockOffsetHours, 48);
assert.equal(getControlSettings().offlineSimulated, false, 'une fusion ne perd pas les autres champs');

// Review Focus n°1 : l'horloge de démonstration décale demoNow(), pas l'heure réelle.
const realNow = Date.now();
const shifted = R.demoNow().getTime();
assert.ok(Math.abs(shifted - (realNow + 48 * 3600e3)) < 5000, 'demoNow suit le décalage');
saveControlSettings({ clockOffsetHours: 0 });

// Hors-ligne simulé prime sur navigator.onLine.
// Node 22 expose `navigator` en lecture seule : on le redéfinit, on ne l'assigne pas.
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true });
assert.equal(R.isOnline(), true);
saveControlSettings({ offlineSimulated: true });
assert.equal(R.isOnline(), false);
saveControlSettings({ offlineSimulated: false });

// Synchronisation : seuls les suspendus et retirés entrent dans la liste.
addDut({ id: 'r1', qrToken: 'rev-1', status: 'RETIRE', dutNumber: 'DUT-CI-2026-000900', validatedAt: new Date().toISOString() });
addDut({ id: 'r2', qrToken: 'sus-1', status: 'SUSPENDU', dutNumber: 'DUT-CI-2026-000901', validatedAt: new Date().toISOString() });
addDut({ id: 'r3', qrToken: 'val-1', status: 'VALIDE', dutNumber: 'DUT-CI-2026-000902', validatedAt: new Date().toISOString() });
assert.equal(getCrl(), null, 'aucune liste avant synchronisation');
const crl = R.sync();
assert.deepEqual(crl.entries.map((e) => e.uid).sort(), ['rev-1', 'sus-1']);
assert.ok(crl.syncedAt);
assert.ok(R.ageHours() < 0.01);

console.log('Révocation : réglages fusionnés, horloge de démonstration isolée, hors-ligne simulé, liste construite depuis les statuts.');

// ---------------------------------------------------------------------------
// Tâche 5 — verifyScan asynchrone et dérogation
// ---------------------------------------------------------------------------

const C = await import('../js/services/control.service.js');
const { getAllControlLogs, getAllDerogations } = await import('../js/repositories/controls.repository.js');
const { getAllAuditLogs } = await import('../js/repositories/audit.repository.js');

// Un vrai DUT signé en base, un scan en ligne → VERT, entrée enrichie.
const { saveSigningKey } = await import('../js/repositories/signing-key.repository.js');
saveSigningKey(otherKey);
const liveSigned = await signPayload({ v: 2, kid: otherKey.kid, uid: 'live-1', num: 'DUT-CI-2026-000950', plq: 'CI-0950-AA', nbf: '2000-01-01', exp: '2099-12-31' }, otherKey);
addDut({ id: 'live', qrToken: 'live-1', qrSigned: liveSigned, status: 'VALIDE', dutNumber: 'DUT-CI-2026-000950', validatedAt: new Date().toISOString(), general: { immatriculation: 'CI-0950-AA' } });
saveControlSettings({ offlineSimulated: false, clockOffsetHours: 0, postId: null });

const scan = await C.verifyScan(buildSignedUri(liveSigned), { geo: { lat: 5.345, lng: -4.024 } });
assert.equal(scan.verdict.level, 'VERT');
const logged = getAllControlLogs().find((c) => c.dutId === 'live');
assert.ok(logged, 'le contrôle est journalisé');
assert.equal(logged.verdictLevel, 'VERT');
assert.equal(logged.mode, 'EN_LIGNE');
assert.equal(logged.lat, 5.345);
assert.ok(Array.isArray(logged.findings) && logged.findings.length > 0);

// Review Focus n°1 : avec l'horloge décalée de 48 h, l'heure JOURNALISÉE reste réelle.
saveControlSettings({ clockOffsetHours: 48 });
const before = Date.now();
await C.verifyScan(buildSignedUri(liveSigned), {});
const logged2 = getAllControlLogs().filter((c) => c.dutId === 'live').at(-1);
assert.ok(Math.abs(new Date(logged2.date).getTime() - before) < 5000, 'horodatage réel, pas décalé');
saveControlSettings({ clockOffsetHours: 0 });

// Dérogation : motif obligatoire ; AUTRE exige une note ; enregistrée et auditée.
assert.throws(() => C.recordDerogation({ controlId: logged.id, reason: '', note: '' }), /motif/i);
assert.throws(() => C.recordDerogation({ controlId: logged.id, reason: 'AUTRE', note: '' }), /préciser/i);
assert.throws(() => C.recordDerogation({ controlId: 'inexistant', reason: 'PANNE_VEHICULE', note: '' }), /contrôle/i);
const dero = C.recordDerogation({ controlId: logged.id, reason: 'PANNE_VEHICULE', note: 'Remorquage' });
assert.equal(dero.dutId, 'live');
assert.equal(getAllDerogations().length, 1);
assert.ok(getAllAuditLogs().some((a) => a.action === 'DUT_DEROGATION' && a.dutId === 'live'));

// Un QR inconnu ne lève pas et journalise INCONNU.
const unknown = await C.verifyScan('n-importe-quoi', {});
assert.equal(unknown.verdict.level, 'INCONNU');

console.log('Contrôle : verifyScan asynchrone enrichi, horodatage réel sous horloge décalée, dérogation validée et auditée.');

// ---------------------------------------------------------------------------
// Tâche 6 — signature à la validation, ensemencement régénéré, canari
// ---------------------------------------------------------------------------

const { buildQrPayload } = await import('../js/services/dut.service.js');
const { seedDemoData, ensureSignedDemoData, isSeeded } = await import('../js/seed.js');
const { getAllDuts } = await import('../js/repositories/dut.repository.js');

// Charge : jamais de donnée commerciale, fenêtre = validation + 7 jours.
const pl = buildQrPayload(
  { qrToken: 'u-9', dutNumber: 'DUT-CI-2026-000999', general: { immatriculation: 'CI-9999-ZZ', transporterName: 'SECRET' }, marchandises: [{ nature: 'SECRET' }] },
  otherKey, { nbf: '2026-10-09' },
);
assert.deepEqual(Object.keys(pl).sort(), ['exp', 'kid', 'nbf', 'num', 'plq', 'uid', 'v']);
assert.equal(pl.exp, '2026-10-16');
assert.ok(!JSON.stringify(pl).includes('SECRET'), 'aucune donnée commerciale dans la charge');

// Ensemencement : version, canari, tout DUT numéroté signé et vérifiable.
store.clear();
assert.equal(isSeeded(), false);
seedDemoData();
await ensureSignedDemoData();
assert.equal(isSeeded(), true);
const numbered = getAllDuts().filter((d) => d.dutNumber);
assert.ok(numbered.length >= 10);
for (const d of numbered) {
  assert.ok(d.qrSigned, `${d.dutNumber} doit porter un QR signé`);
  const check = await verifySignedString(d.qrSigned, loadKey());
  assert.equal(check.ok, true, `${d.dutNumber} : signature vérifiable avec la clé ensemencée`);
  assert.equal(check.payload.uid, d.qrToken);
}
assert.ok(!JSON.stringify(getAllDuts()).includes('oicdut://verify/'), 'aucun ancien format dans les données');
const canaries = getAllDuts().filter((d) => d.canary === true);
assert.equal(canaries.length, 1, 'exactement un DUT piège');
assert.equal(canaries[0].status, 'VALIDE', 'le piège a l’air vrai');
assert.ok(canaries[0].qrSigned);

// Relancer ensureSignedDemoData() est sans effet (idempotent).
const snapshot = JSON.stringify(getAllDuts());
await ensureSignedDemoData();
assert.equal(JSON.stringify(getAllDuts()), snapshot);

console.log('Ensemencement : charge sans donnée commerciale, tout DUT numéroté signé, un canari, idempotent.');

// --- Tâche 7 : vue de contrôle ---
const { badgeClassFor } = await import('../js/views/control.view.js');
assert.equal(badgeClassFor('VERT'), 'valid');
assert.equal(badgeClassFor('ORANGE'), 'orange');
assert.equal(badgeClassFor('ROUGE'), 'withdrawn');
assert.equal(badgeClassFor('INCONNU'), 'unknown');
assert.equal(badgeClassFor('n-importe'), 'unknown');
console.log('Vue de contrôle : classe de bandeau par niveau.');

// --- Tâche 7 (ruling) : la démo contient au moins un DUT validé encore dans sa période de validité ---
{
  const today = new Date().toISOString().slice(0, 10);
  const { CONTROL_POLICY } = await import('../js/core/constants.js');
  const fresh = getAllDuts().filter((d) => d.status === 'VALIDE' && !d.canary && d.qrSigned)
    .filter((d) => { const exp = new Date(`${d.validatedAt.slice(0, 10)}T00:00:00Z`); exp.setUTCDate(exp.getUTCDate() + CONTROL_POLICY.validityDays); return exp.toISOString().slice(0, 10) >= today; });
  assert.ok(fresh.length >= 1, 'aucun DUT validé non expiré dans la démo');
  console.log('Ensemencement : au moins un DUT validé encore valable pour le scénario VERT.');
}

// --- Passe finale (revue) ---------------------------------------------------------------
{
  const { CONTROL_POLICY: POLICY } = await import('../js/core/constants.js');
  // F1. L'horloge de démonstration ne touche pas le contrôle de trajet : l'écart se mesure à l'heure réelle.
  const tenMinAgo = new Date(T0.getTime() - 10 * 60e3).toISOString();
  const shifted = V.checkTravel(baseCtx({
    now: new Date(T0.getTime() + 48 * 3600e3), realNow: T0,
    controls: [{ dutId: 'd1', lat: ABIDJAN.lat, lng: ABIDJAN.lng, date: tenMinAgo }],
  }));
  assert.equal(shifted.code, 'VOYAGE_IMPOSSIBLE', 'horloge +48 h : le voyage impossible doit rester détecté');

  // F2. Un constat bloquant hors liste (faux, piège, expiré, trajet) reste ROUGE même si la liste est trop vieille.
  const f = (code, severity) => ({ code, severity });
  assert.equal(V.foldVerdict([f('SIGNATURE_INVALIDE', 'block'), f('NON_OPPOSABLE', 'block')], { online: false }), 'ROUGE');
  assert.equal(V.foldVerdict([f('CANARI', 'block'), f('NON_OPPOSABLE', 'block')], { online: false }), 'ROUGE');
  assert.equal(V.foldVerdict([f('SIGNATURE_OK', 'ok'), f('NON_OPPOSABLE', 'block')], { online: false }), 'INCONNU');

  // F3. Dates illisibles dans la charge : bloquant, jamais « valide ».
  assert.equal(V.checkValidity(baseCtx({ parsed: { format: 'v2', payload: { ...inWindow, nbf: 'zz' } } })).severity, 'block');
  assert.equal(V.checkValidity(baseCtx({ parsed: { format: 'v2', payload: { ...inWindow, exp: '2026-13-45' } } })).severity, 'block');
  // F3bis. Le titre ORANGE ne dit « authentique » que si la signature a été vérifiée.
  const { titleFor } = await import('../js/views/control.view.js');
  assert.match(titleFor('ORANGE', [f('SIGNATURE_OK', 'ok')]), /AUTHENTIQUE/);
  assert.doesNotMatch(titleFor('ORANGE', [f('CLE_ABSENTE', 'warn')]), /AUTHENTIQUE/);

  // F4. Signature impossible : la validation échoue sans brûler de numéro ni changer le dossier.
  const { findOperationById: findOp } = await import('../js/repositories/operations.repository.js');
  const { validate } = await import('../js/services/dut.service.js');
  const termine = getAllDuts().find((d) => d.status === 'TERMINE');
  const opBefore = findOp(termine.operationId) || (await import('../js/repositories/operations.repository.js')).findActiveOperationForPartner(termine.partnerId);
  const usedBefore = opBefore.used;
  const realCrypto = globalThis.crypto;
  Object.defineProperty(globalThis, 'crypto', { value: { getRandomValues: realCrypto.getRandomValues.bind(realCrypto), randomUUID: realCrypto.randomUUID.bind(realCrypto) }, configurable: true, writable: true });
  await assert.rejects(() => validate(termine.id), /signature/i);
  Object.defineProperty(globalThis, 'crypto', { value: realCrypto, configurable: true, writable: true });
  assert.equal((findOp(opBefore.id)).used, usedBefore, 'aucun numéro consommé');
  assert.equal(getAllDuts().find((d) => d.id === termine.id).status, 'TERMINE');

  // F5. Le DUT piège n'apparaît pas côté partenaire ni transporteur ; le siège le voit.
  const dutSvc = await import('../js/services/dut.service.js');
  const canary = getAllDuts().find((d) => d.canary);
  assert.ok(canary);
  assert.ok(!dutSvc.listForPartner(canary.partnerId).some((d) => d.canary), 'piège invisible côté partenaire');
  assert.ok(dutSvc.listAll().some((d) => d.canary), 'piège visible côté siège');

  // F6. La démo reste jouable après 7 jours : un DUT validé dont la charge a expiré est re-signé à aujourd'hui.
  const { refreshExpiredDemoSignatures } = await import('../js/seed.js');
  const { updateDut } = await import('../js/repositories/dut.repository.js');
  const demoKey = loadKey();
  const stale = getAllDuts().filter((d) => d.status === 'VALIDE' && !d.canary && d.qrSigned)[0];
  const old = new Date(Date.now() - 20 * 86400e3).toISOString();
  updateDut(stale.id, { validatedAt: old, qrSigned: await signPayload(buildQrPayload({ ...stale, validatedAt: old }, demoKey, { nbf: old.slice(0, 10) }), demoKey) });
  await refreshExpiredDemoSignatures();
  const refreshed = getAllDuts().find((d) => d.id === stale.id);
  const check = await (await import('../js/services/signing.service.js')).verifySignedString(refreshed.qrSigned, demoKey);
  assert.equal(check.payload.nbf, new Date().toISOString().slice(0, 10), 'charge re-signée à aujourd’hui');
  assert.ok(POLICY.validityDays > 0);
  console.log('Passe finale : horloge isolée du trajet, faux toujours ROUGE, dates illisibles bloquantes, numéro non brûlé, piège masqué, démo re-signée.');
}
