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
