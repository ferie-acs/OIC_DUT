# Contrôle sécurisé du DUT (lot 1) — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Au scan d'un QR, le POC enchaîne six vérifications (signature OIC, validité, statut, révocation, voyage impossible, canari) et rend un verdict vert / orange / rouge / inconnu, y compris en mode hors-ligne simulé, avec dérogation tracée.

**Architecture:** Une paire de clés ECDSA P-256 ensemencée signe une charge compacte embarquée dans le QR (`oicdut://v2/<charge>.<signature>`). `verification.service.js` enchaîne six vérificateurs purs et replie leurs constats en verdict ; `control.service.verifyScan` devient asynchrone et journalise le verdict ; l'écran de contrôle gagne un poste, un interrupteur hors-ligne, une horloge de démonstration et un formulaire de dérogation. Les données de démo sont régénérées par version.

**Tech Stack:** ES Modules natifs, zéro build, `globalThis.crypto.subtle` (ECDSA P-256 / SHA-256), LocalStorage via les repositories, tests `node --experimental-default-type=module tests/*.test.mjs` (Node 22 expose `crypto.subtle`).

**Spec:** `docs/superpowers/specs/2026-10-09-controle-securise-design.md`

## Global Constraints

- Couche stricte `VUE → SERVICE → REPOSITORY → LOCALSTORAGE` ; nommage `*.service.js`, `*.repository.js`, `*.view.js`.
- ES Modules stricts : aucune fonction globale, aucun `onclick` inline, aucun CSS inline (variables CSS via `style.setProperty` tolérées pour la mise à l'échelle uniquement).
- Aucune dépendance runtime nouvelle ; aucun `package.json` à la racine.
- Un seul schéma de QR : `oicdut://v2/<charge_b64url>.<signature_b64url>`. **`oicdut://verify/` disparaît du code et des données.**
- La charge du QR ne contient **jamais** marchandise, parties, prix ni conducteur.
- **Jamais de verdict VERT hors ligne.**
- L'horloge de démonstration (`clockOffsetHours`) n'influence que les calculs d'âge et de validité ; les horodatages journalisés restent `nowIso()` réel.
- Ensemencement : la clé est marquée `demo: true` ; le POC affiche « QR signé — clé de démonstration » à côté de tout QR.
- Tests : fichiers `tests/*.test.mjs`, assertions de haut niveau avec `node:assert/strict`, stubs `globalThis.localStorage` / `globalThis.window` comme dans `tests/planning.test.mjs`.

## Review Focus

1. **L'horloge de démonstration ne doit jamais toucher les données** : avec `clockOffsetHours = 48`, un contrôle enregistré porte l'heure réelle, et seule l'évaluation d'âge de liste et de validité change. → Test en Tâche 4 (âge) et Tâche 5 (entrée journalisée).
2. **Contrôles ensemencés sans position** (`lat: null`) : `checkTravel` doit les ignorer sans exception et sans faux « voyage impossible ». → Test en Tâche 3.
3. **Ni poste ni géolocalisation** : `checkTravel` rend un constat `info` « position inconnue », jamais une exception ni un `block`. → Test en Tâche 3.
4. **Immatriculation absente ou non ASCII** dans la charge : signature, vérification et `parseQr` doivent fonctionner à l'identique (UTF-8). → Test en Tâche 1.
5. **Hors ligne sans liste jamais synchronisée** : verdict `INCONNU` non opposable, pas d'exception, et le bouton de dérogation n'apparaît pas. → Test en Tâche 3 (repli) et Tâche 4 (liste absente).

---

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `js/core/constants.js` (modifié) | `QR_SCHEME` v2, clés de stockage, actions et libellés d'audit, `VERDICT_LEVELS`, `DEROGATION_REASONS`, `CONTROL_POLICY` |
| `js/repositories/signing-key.repository.js` (nouveau) | la clé en LocalStorage |
| `js/services/signing.service.js` (nouveau) | base64url, génération, signature, vérification |
| `js/services/qr.service.js` (modifié) | `parseQr`, `buildSignedUri`, rendu avec mention |
| `js/services/verification.service.js` (nouveau) | six vérificateurs, Haversine, repli, `verify()` |
| `js/repositories/revocations.repository.js` (nouveau) | liste de révocation locale |
| `js/repositories/control-settings.repository.js` (nouveau) | hors-ligne simulé, horloge, poste |
| `js/services/revocation.service.js` (nouveau) | `sync()`, `ageHours()`, `demoNow()` |
| `js/repositories/controls.repository.js` (modifié) | dérogations |
| `js/services/control.service.js` (modifié) | `verifyScan` async, `recordDerogation` |
| `js/services/dut.service.js` (modifié) | `validate` async qui signe |
| `js/seed.js` (modifié) | version d'ensemencement, canari, `ensureSignedDemoData()` |
| `js/app.js` (modifié) | régénération par version, `await` de la signature |
| `js/views/control.view.js` (modifié) | poste, interrupteur, horloge, verdict, constats, dérogation |
| `js/views/dut-detail.view.js`, `js/services/pdf.service.js` (modifiés) | QR dessiné depuis `qrSigned` |
| `css/components.css` (modifié) | badge `orange`, liste de constats |
| `tests/verification.test.mjs` (nouveau) | toutes les tâches |

---

### Task 1: Clé de signature et signature de charge

**Files:**
- Modify: `js/core/constants.js`
- Create: `js/repositories/signing-key.repository.js`
- Create: `js/services/signing.service.js`
- Test: `tests/verification.test.mjs`

**Interfaces:**
- Consumes: `readObject`/`writeObject` de `js/core/storage.js`.
- Produces: `toBase64Url(bytes: Uint8Array) → string`, `fromBase64Url(text) → Uint8Array`, `ensureDemoKey() → Promise<{kid, publicJwk, privateJwk, createdAt, demo}>`, `loadKey() → key|null`, `signPayload(payloadObject, key) → Promise<string>` (rend `"<charge>.<signature>"`), `verifySignedString(signed: string, key) → Promise<{ ok: boolean, payload: object|null, reason: string|null }>`. Constantes : `STORAGE_KEYS.SIGNING_KEY = 'dut_signing_key_v1'`, `DEMO_KID = 'demo-2026-10'`.

- [ ] **Step 1: Write the failing test**

Créer `tests/verification.test.mjs` :

```js
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, v),
  removeItem: (k) => store.delete(k),
};
globalThis.window = { matchMedia: () => ({ matches: false }), crypto: globalThis.crypto };

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-default-type=module tests/verification.test.mjs`
Expected: FAIL — `Cannot find module '../js/services/signing.service.js'`

- [ ] **Step 3: Constantes**

Dans `js/core/constants.js`, ajouter à `STORAGE_KEYS` :

```js
  SIGNING_KEY: 'dut_signing_key_v1',
  CRL: 'dut_crl_v1',
  CONTROL_SETTINGS: 'dut_control_settings_v1',
  DEROGATIONS: 'dut_derogations_v1',
  DEMO_SEED_VERSION: 'dut_demo_seed_version',
```

Remplacer `export const QR_SCHEME = 'oicdut://verify/';` par :

```js
/** Un seul schéma : charge signée. L'ancien `oicdut://verify/` est abandonné. */
export const QR_SCHEME = 'oicdut://v2/';
export const DEMO_KID = 'demo-2026-10';
export const DEMO_SEED_VERSION = 2;

export const VERDICT_LEVELS = { VERT: 'VERT', ORANGE: 'ORANGE', ROUGE: 'ROUGE', INCONNU: 'INCONNU' };

export const DEROGATION_REASONS = {
  PANNE_VEHICULE: 'Panne du véhicule',
  CHANGEMENT_TRACTEUR: 'Changement de tracteur',
  RETARD_LEGITIME: 'Retard légitime',
  QR_ILLISIBLE: 'QR illisible',
  AUTRE: 'Autre (préciser)',
};

/** Politique de contrôle. Constantes pour ce lot ; un paramétrage admin viendra avec le lot 2. */
export const CONTROL_POLICY = {
  validityDays: 7,
  crlWarnHours: 24,
  crlMaxHours: 72,
  maxSpeedKmh: 90,
};
```

Ajouter à `AUDIT_ACTIONS` : `DUT_SIGNED: 'DUT_SIGNED'`, `CRL_SYNCED: 'CRL_SYNCED'`, `CANARY_TRIGGERED: 'CANARY_TRIGGERED'`, `DUT_DEROGATION: 'DUT_DEROGATION'`.
Ajouter à `AUDIT_LABELS` : `DUT_SIGNED: 'QR signé'`, `CRL_SYNCED: 'Liste de révocation synchronisée'`, `CANARY_TRIGGERED: 'DUT piège scanné'`, `DUT_DEROGATION: 'Dérogation accordée'`.

- [ ] **Step 4: Repository de la clé**

Créer `js/repositories/signing-key.repository.js` :

```js
import { STORAGE_KEYS } from '../core/constants.js';
import { readObject, writeObject } from '../core/storage.js';

export function getSigningKey() {
  return readObject(STORAGE_KEYS.SIGNING_KEY, null);
}

export function saveSigningKey(key) {
  writeObject(STORAGE_KEYS.SIGNING_KEY, key);
  return key;
}
```

- [ ] **Step 5: Service de signature**

Créer `js/services/signing.service.js` :

```js
import { DEMO_KID } from '../core/constants.js';
import { nowIso } from '../core/utils.js';
import { getSigningKey, saveSigningKey } from '../repositories/signing-key.repository.js';

/**
 * Signature des charges de QR. ECDSA P-256 / SHA-256 via Web Crypto.
 *
 * La clé privée vit en LocalStorage, marquée `demo: true` : ce POC DÉMONTRE le
 * mécanisme, il ne le garantit pas. En production, la clé est dans un coffre
 * matériel et seul le service d'émission peut signer.
 */

const ALGO = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN = { name: 'ECDSA', hash: 'SHA-256' };

function subtle() {
  const c = globalThis.crypto || (globalThis.window && globalThis.window.crypto);
  return c && c.subtle ? c.subtle : null;
}

export function toBase64Url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text) {
  const padded = String(text).replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (String(text).length % 4)) % 4);
  const bin = atob(padded);
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

export function loadKey() {
  return getSigningKey();
}

/** Crée la clé de démonstration si elle n'existe pas encore ; ne régénère jamais. */
export async function ensureDemoKey() {
  const existing = getSigningKey();
  if (existing) return existing;
  const s = subtle();
  if (!s) throw new Error('Web Crypto indisponible : impossible de créer la clé de démonstration.');
  const pair = await s.generateKey(ALGO, true, ['sign', 'verify']);
  const key = {
    kid: DEMO_KID,
    publicJwk: await s.exportKey('jwk', pair.publicKey),
    privateJwk: await s.exportKey('jwk', pair.privateKey),
    createdAt: nowIso(),
    demo: true,
  };
  return saveSigningKey(key);
}

async function importPrivate(key) {
  return subtle().importKey('jwk', key.privateJwk, ALGO, false, ['sign']);
}

async function importPublic(key) {
  return subtle().importKey('jwk', key.publicJwk, ALGO, false, ['verify']);
}

/** Signe la charge et rend "<charge_b64url>.<signature_b64url>". */
export async function signPayload(payload, key) {
  const chargeBytes = new TextEncoder().encode(JSON.stringify(payload));
  const charge = toBase64Url(chargeBytes);
  const signature = await subtle().sign(SIGN, await importPrivate(key), new TextEncoder().encode(charge));
  return `${charge}.${toBase64Url(new Uint8Array(signature))}`;
}

/** Vérifie "<charge>.<signature>". Ne lève jamais : rend { ok, payload, reason }. */
export async function verifySignedString(signed, key) {
  try {
    const s = subtle();
    if (!s) return { ok: false, payload: null, reason: 'crypto-indisponible' };
    if (!key || !key.publicJwk) return { ok: false, payload: null, reason: 'cle-absente' };
    const parts = String(signed || '').split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, payload: null, reason: 'forme-invalide' };
    const [charge, signature] = parts;
    const valid = await s.verify(SIGN, await importPublic(key), fromBase64Url(signature), new TextEncoder().encode(charge));
    if (!valid) return { ok: false, payload: null, reason: 'signature-invalide' };
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(charge)));
    return { ok: true, payload, reason: null };
  } catch {
    return { ok: false, payload: null, reason: 'illisible' };
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --experimental-default-type=module tests/verification.test.mjs`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add js/core/constants.js js/repositories/signing-key.repository.js js/services/signing.service.js tests/verification.test.mjs
git commit -m "feat(controle): cle de demonstration et signature de charge ECDSA"
```

---

### Task 2: Format du QR v2

**Files:**
- Modify: `js/services/qr.service.js`
- Test: `tests/verification.test.mjs` (ajouts)

**Interfaces:**
- Consumes: `QR_SCHEME` (Tâche 1).
- Produces: `buildSignedUri(signed) → string`, `parseQr(raw) → { format: 'v2'|'invalid', token: string|null, signed: string|null, payload: object|null }`, `renderQrInto(container, signed, size)`, `qrToDataUrl(signed, size)`. **`extractToken` et `buildVerifyUri` sont supprimés.**

- [ ] **Step 1: Write the failing test**

Ajouter à `tests/verification.test.mjs` :

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-default-type=module tests/verification.test.mjs`
Expected: FAIL — `parseQr is not a function` (ou `buildSignedUri`)

- [ ] **Step 3: Réécrire `js/services/qr.service.js`**

```js
import { QR_SCHEME } from '../core/constants.js';
import { fromBase64Url } from './signing.service.js';

/**
 * Le QR porte une charge SIGNÉE : numéro, plaque, fenêtre de validité, jeton
 * opaque. Jamais de donnée commerciale. Un seul format est accepté.
 */

export function buildSignedUri(signed) {
  return `${QR_SCHEME}${signed}`;
}

/** Lit un QR. Ne lève jamais : tout ce qui n'est pas v2 bien formé est `invalid`. */
export function parseQr(raw) {
  const invalid = { format: 'invalid', token: null, signed: null, payload: null };
  const value = String(raw || '').trim();
  if (!value.startsWith(QR_SCHEME)) return invalid;
  const signed = value.slice(QR_SCHEME.length);
  const parts = signed.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return invalid;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[0])));
    if (!payload || payload.v !== 2 || typeof payload.uid !== 'string' || !payload.uid) return invalid;
    return { format: 'v2', token: payload.uid, signed, payload };
  } catch {
    return invalid;
  }
}

/** Rend le QR dans un conteneur DOM visible (détail DUT, aperçu PDF). */
export function renderQrInto(container, signed, size = 176) {
  container.innerHTML = '';
  if (!window.QRCode) {
    container.textContent = 'QR indisponible (librairie non chargée).';
    return;
  }
  // eslint-disable-next-line no-new
  new window.QRCode(container, {
    text: buildSignedUri(signed),
    width: size,
    height: size,
    correctLevel: window.QRCode.CorrectLevel.M,
  });
  const note = document.createElement('p');
  note.className = 'qr-demo-note';
  note.textContent = 'QR signé — clé de démonstration. En production : coffre matériel.';
  container.appendChild(note);
}

/** Génère une image QR en data-URL (intégration PDF). */
export function qrToDataUrl(signed, size = 220) {
  if (!window.QRCode) return null;
  const holder = document.createElement('div');
  holder.style.position = 'fixed';
  holder.style.left = '-9999px';
  document.body.appendChild(holder);
  // eslint-disable-next-line no-new
  new window.QRCode(holder, {
    text: buildSignedUri(signed),
    width: size,
    height: size,
    correctLevel: window.QRCode.CorrectLevel.M,
  });
  const canvas = holder.querySelector('canvas');
  const dataUrl = canvas ? canvas.toDataURL('image/png') : null;
  document.body.removeChild(holder);
  return dataUrl;
}
```

> `holder.style.position` existait déjà avant ce lot pour un élément hors écran jetable ; conservé tel quel.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-default-type=module tests/verification.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/services/qr.service.js tests/verification.test.mjs
git commit -m "feat(controle): un seul format de QR, signe, parseQr remplace extractToken"
```

---

### Task 3: Pipeline de vérification

**Files:**
- Create: `js/services/verification.service.js`
- Test: `tests/verification.test.mjs` (ajouts)

**Interfaces:**
- Consumes: `parseQr` (T2), `verifySignedString`, `loadKey` (T1), `VERDICT_LEVELS`, `CONTROL_POLICY`, `DUT_STATUS` (constantes), `findDutByQrToken` (dépôt des DUT), `getAllControlLogs` (dépôt des contrôles), `getCrl` (T4 — **dans cette tâche, le pipeline reçoit `crl` par `ctx` ; l'accès au dépôt arrive en T4**).
- Produces: `haversineKm(a, b) → number`, `checkSignature(ctx)`, `checkValidity(ctx)`, `checkStatus(ctx)`, `checkRevocation(ctx)`, `checkTravel(ctx)`, `checkCanary(ctx)` — chacun `→ finding|null` ou promesse —, `foldVerdict(findings, { online }) → level`, `verify(raw, context, deps) → Promise<verdict>`.
  Un `finding` : `{ check, severity: 'ok'|'info'|'warn'|'block', code, message }` ; `code: 'NON_OPPOSABLE'` est le seul block qui donne `INCONNU`.
  `context` : `{ now: Date, online: boolean, post: {id,name,lat,lng}|null, geo: {lat,lng}|null }`.
  `deps` (injectables pour les tests) : `{ key, findDut(token), controls: array, crl: {syncedAt, entries}|null }`.

- [ ] **Step 1: Write the failing test**

Ajouter à `tests/verification.test.mjs` :

```js
const V = await import('../js/services/verification.service.js');

// Haversine : Abidjan ↔ Bouaké ≈ 300 km (±15 km).
const ABIDJAN = { lat: 5.345, lng: -4.024 };
const BOUAKE = { lat: 7.690, lng: -5.030 };
const km = V.haversineKm(ABIDJAN, BOUAKE);
assert.ok(km > 285 && km < 315, `distance Abidjan-Bouaké attendue ~300 km, obtenu ${km.toFixed(1)}`);

const T0 = new Date('2026-10-10T10:00:00Z');
const dutOk = { id: 'd1', qrToken: 'u-1', status: 'VALIDE', dutNumber: 'DUT-CI-2026-000401', canary: false };
const baseCtx = (over = {}) => ({
  now: T0, online: true, post: { id: 'p-bke', name: 'Bouaké', ...BOUAKE }, geo: null,
  parsed: parseQr(uri), key: otherKey, dut: dutOk, controls: [], crl: null, ...over,
});

// Signature : vraie → ok ; altérée → block.
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

// Révocation (hors ligne) : présent → block ; âge 23 h → ok ; 25 h → warn ; 73 h → NON_OPPOSABLE ; liste absente → NON_OPPOSABLE.
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
assert.equal(V.foldVerdict([F('block'), F('block', 'NON_OPPOSABLE')], { online: false }), 'INCONNU', 'NON_OPPOSABLE prime');
assert.equal(V.foldVerdict([], { online: true }), 'VERT');

// verify() de bout en bout, dépendances injectées.
const goodUri = buildSignedUri(await signPayload({ ...payload, nbf: '2026-10-09', exp: '2026-10-16' }, otherKey));
const deps = { key: otherKey, findDut: (t) => (t === 'u-1' ? dutOk : null), controls: [], crl: null };
const verdict = await V.verify(goodUri, { now: T0, online: true, post: baseCtx().post, geo: null }, deps);
assert.equal(verdict.level, 'VERT');
assert.equal(verdict.mode, 'EN_LIGNE');
assert.equal(verdict.findings.length, 6, 'un constat par vérificateur, sauf révocation hors de propos en ligne');
const offline = await V.verify(goodUri, { now: T0, online: false, post: baseCtx().post, geo: null }, { ...deps, crl: crlAt(2) });
assert.equal(offline.level, 'ORANGE');
assert.equal(offline.mode, 'HORS_LIGNE');
assert.ok(offline.crlAgeHours >= 1.9 && offline.crlAgeHours <= 2.1);
// Review Focus n°5 : hors ligne, liste jamais synchronisée → INCONNU, pas d'exception.
assert.equal((await V.verify(goodUri, { now: T0, online: false, post: null, geo: null }, { ...deps, crl: null })).level, 'INCONNU');
// QR malformé → INCONNU avec un constat explicite.
const bad = await V.verify('n-importe-quoi', { now: T0, online: true, post: null, geo: null }, deps);
assert.equal(bad.level, 'INCONNU');
assert.ok(bad.findings.some((f) => f.code === 'QR_INVALIDE'));

console.log('Pipeline : six vérificateurs, Haversine, repli, verify() en ligne, hors ligne, liste absente, QR malformé.');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-default-type=module tests/verification.test.mjs`
Expected: FAIL — `Cannot find module '../js/services/verification.service.js'`

- [ ] **Step 3: Implémenter `js/services/verification.service.js`**

```js
import { CONTROL_POLICY, DUT_STATUS, VERDICT_LEVELS } from '../core/constants.js';
import { parseQr } from './qr.service.js';
import { verifySignedString } from './signing.service.js';

/**
 * Pipeline de vérification d'un QR de DUT.
 *
 * Six vérificateurs purs, chacun une fonction (ctx) → constat | null, enchaînés
 * par verify() puis repliés en un verdict VERT / ORANGE / ROUGE / INCONNU.
 * Les dépendances (clé, dépôts, liste) sont injectées : chaque vérificateur se
 * teste seul.
 */

const f = (check, severity, code, message) => ({ check, severity, code, message });

const EARTH_KM = 6371;
export function haversineKm(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(s));
}

function dayStart(iso) { return new Date(`${iso}T00:00:00Z`); }
function dayEnd(iso) { return new Date(`${iso}T23:59:59.999Z`); }

// 1. La charge a-t-elle été signée par l'OIC, et personne ne l'a modifiée ?
export async function checkSignature(ctx) {
  if (!ctx.key) return f('signature', 'warn', 'CLE_ABSENTE', 'Clé de vérification absente : signature non vérifiable, le statut en ligne fait foi.');
  const r = await verifySignedString(ctx.parsed.signed, ctx.key);
  if (r.ok) return f('signature', 'ok', 'SIGNATURE_OK', 'Signé par l’OIC, non modifié.');
  if (r.reason === 'crypto-indisponible') return f('signature', 'warn', 'CRYPTO_INDISPONIBLE', 'Signature non vérifiable sur cet appareil.');
  return f('signature', 'block', 'SIGNATURE_INVALIDE', 'Faux document : la signature ne correspond pas.');
}

// 2. Sommes-nous dans la période de validité ?
export function checkValidity(ctx) {
  const p = ctx.parsed.payload || {};
  if (!p.nbf || !p.exp) return f('validite', 'warn', 'VALIDITE_ABSENTE', 'Période de validité absente de la charge.');
  if (ctx.now < dayStart(p.nbf)) return f('validite', 'block', 'PAS_ENCORE_VALIDE', `Valide à partir du ${p.nbf}.`);
  if (ctx.now > dayEnd(p.exp)) return f('validite', 'block', 'EXPIRE', `Expiré depuis le ${p.exp}.`);
  return f('validite', 'ok', 'VALIDITE_OK', `Valide du ${p.nbf} au ${p.exp}.`);
}

// 3. Le statut dans le système (en ligne seulement).
export function checkStatus(ctx) {
  if (!ctx.online) return f('statut', 'info', 'STATUT_HORS_LIGNE', 'Statut non consultable hors ligne.');
  if (!ctx.dut) return f('statut', 'block', 'INCONNU_DU_SYSTEME', 'Ce DUT n’existe pas dans le système.');
  if (ctx.dut.status === DUT_STATUS.SUSPENDU) return f('statut', 'block', 'SUSPENDU', 'DUT suspendu.');
  if (ctx.dut.status === DUT_STATUS.RETIRE) return f('statut', 'block', 'RETIRE', 'DUT retiré.');
  if (ctx.dut.status === DUT_STATUS.VALIDE) return f('statut', 'ok', 'STATUT_OK', 'Statut : validé.');
  return f('statut', 'block', 'STATUT_INATTENDU', `Statut ${ctx.dut.status} : non contrôlable.`);
}

export function crlAgeHours(crl, now) {
  if (!crl || !crl.syncedAt) return Infinity;
  return (now.getTime() - new Date(crl.syncedAt).getTime()) / 3600e3;
}

// 4. La liste locale de révocation (hors ligne seulement).
export function checkRevocation(ctx) {
  if (ctx.online) return null;
  const age = crlAgeHours(ctx.crl, ctx.now);
  if (!Number.isFinite(age) || age > CONTROL_POLICY.crlMaxHours) {
    return f('revocation', 'block', 'NON_OPPOSABLE', 'Liste de révocation absente ou trop ancienne : contrôle non opposable, reconnectez-vous.');
  }
  const hit = (ctx.crl.entries || []).find((e) => e.uid === ctx.parsed.token);
  if (hit) return f('revocation', 'block', 'REVOQUE', `Présent dans la liste de révocation (${hit.status}).`);
  if (age > CONTROL_POLICY.crlWarnHours) return f('revocation', 'warn', 'LISTE_ANCIENNE', `Liste à jour il y a ${Math.round(age)} h.`);
  return f('revocation', 'ok', 'LISTE_OK', `Absent de la liste, à jour il y a ${Math.round(age)} h.`);
}

// 5. Ce DUT a-t-il été vu ailleurs trop peu de temps avant ?
export function checkTravel(ctx) {
  const here = ctx.geo || ctx.post;
  if (!here || !Number.isFinite(here.lat) || !Number.isFinite(here.lng)) {
    return f('trajet', 'info', 'POSITION_INCONNUE', 'Position du contrôle inconnue : cohérence de trajet non évaluée.');
  }
  const dutId = ctx.dut ? ctx.dut.id : null;
  const previous = (ctx.controls || [])
    .filter((c) => dutId && c.dutId === dutId && Number.isFinite(c.lat) && Number.isFinite(c.lng) && c.date)
    .map((c) => ({ ...c, at: new Date(c.date) }))
    .filter((c) => c.at < ctx.now)
    .sort((a, b) => b.at - a.at)[0];
  if (!previous) return f('trajet', 'ok', 'TRAJET_OK', 'Aucun contrôle antérieur.');
  const hours = Math.max((ctx.now - previous.at) / 3600e3, 1 / 60);
  const km = haversineKm(here, previous);
  const speed = km / hours;
  if (speed > CONTROL_POLICY.maxSpeedKmh) {
    return f('trajet', 'block', 'VOYAGE_IMPOSSIBLE', `Vu il y a ${hours.toFixed(1)} h à ${km.toFixed(0)} km : ${speed.toFixed(0)} km/h, impossible. Probable copie.`);
  }
  return f('trajet', 'ok', 'TRAJET_OK', `Dernier contrôle il y a ${hours.toFixed(1)} h à ${km.toFixed(0)} km.`);
}

// 6. Est-ce un DUT piège ?
export function checkCanary(ctx) {
  if (ctx.dut && ctx.dut.canary === true) return f('canari', 'block', 'CANARI', 'DUT piège : ce document ne devrait jamais circuler. Alerte au siège.');
  return null;
}

export function foldVerdict(findings, { online }) {
  const list = findings.filter(Boolean);
  if (list.some((x) => x.code === 'NON_OPPOSABLE')) return VERDICT_LEVELS.INCONNU;
  if (list.some((x) => x.severity === 'block')) return VERDICT_LEVELS.ROUGE;
  if (list.some((x) => x.severity === 'warn')) return VERDICT_LEVELS.ORANGE;
  if (!online) return VERDICT_LEVELS.ORANGE;
  return VERDICT_LEVELS.VERT;
}

/**
 * Vérifie un QR scanné. `deps` : { key, findDut(token), controls, crl }.
 * Ne lève jamais.
 */
export async function verify(raw, context, deps) {
  const parsed = parseQr(raw);
  const mode = context.online ? 'EN_LIGNE' : 'HORS_LIGNE';
  if (parsed.format !== 'v2') {
    return {
      level: VERDICT_LEVELS.INCONNU, mode, token: null, format: parsed.format, dut: null,
      crlAgeHours: null, findings: [f('format', 'block', 'QR_INVALIDE', 'QR non reconnu : ce n’est pas un DUT signé.')],
    };
  }
  const dut = context.online ? deps.findDut(parsed.token) : (deps.findDut ? deps.findDut(parsed.token) : null);
  const ctx = { ...context, parsed, dut, key: deps.key, controls: deps.controls || [], crl: deps.crl || null };
  const findings = [
    await checkSignature(ctx),
    checkValidity(ctx),
    checkStatus(ctx),
    checkRevocation(ctx),
    checkTravel(ctx),
    checkCanary(ctx),
  ].filter(Boolean);
  const age = context.online ? null : crlAgeHours(ctx.crl, context.now);
  return {
    level: foldVerdict(findings, { online: context.online }),
    mode, token: parsed.token, format: 'v2', dut, findings,
    crlAgeHours: Number.isFinite(age) ? age : null,
  };
}
```

> Hors ligne, `findDut` reste appelé : dans ce POC le « système » est LocalStorage, donc le DUT est lisible localement — c'est le **statut** qu'on refuse de consulter, pour rester fidèle au vrai hors-ligne. Le canari et le trajet, eux, se détectent sur les données locales du terminal.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-default-type=module tests/verification.test.mjs`
Expected: PASS. Si le compte `findings.length === 6` échoue en ligne : `checkRevocation` rend `null` en ligne, donc 5 constats — **corriger l'assertion à 5**, le code est juste.

- [ ] **Step 5: Commit**

```bash
git add js/services/verification.service.js tests/verification.test.mjs
git commit -m "feat(controle): pipeline de six verificateurs et verdict"
```

---

### Task 4: Liste de révocation, réglages de contrôle, horloge de démonstration

**Files:**
- Create: `js/repositories/revocations.repository.js`
- Create: `js/repositories/control-settings.repository.js`
- Create: `js/services/revocation.service.js`
- Test: `tests/verification.test.mjs` (ajouts)

**Interfaces:**
- Consumes: `getAllDuts` (dépôt des DUT), `auditService.log`, `CONTROL_POLICY`, `STORAGE_KEYS`.
- Produces: `getCrl() → {syncedAt, entries}|null`, `saveCrl(crl)`, `getControlSettings() → {offlineSimulated, clockOffsetHours, postId}`, `saveControlSettings(patch)`, `sync() → crl`, `demoNow() → Date`, `isOnline() → boolean`, `ageHours() → number`.

- [ ] **Step 1: Write the failing test**

Ajouter à `tests/verification.test.mjs` :

```js
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
globalThis.navigator = { onLine: true };
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-default-type=module tests/verification.test.mjs`
Expected: FAIL — `Cannot find module '../js/repositories/control-settings.repository.js'`

- [ ] **Step 3: Repositories**

`js/repositories/revocations.repository.js` :

```js
import { STORAGE_KEYS } from '../core/constants.js';
import { readObject, writeObject } from '../core/storage.js';

export function getCrl() {
  return readObject(STORAGE_KEYS.CRL, null);
}

export function saveCrl(crl) {
  writeObject(STORAGE_KEYS.CRL, crl);
  return crl;
}
```

`js/repositories/control-settings.repository.js` :

```js
import { STORAGE_KEYS } from '../core/constants.js';
import { readObject, writeObject } from '../core/storage.js';

const DEFAULTS = { offlineSimulated: false, clockOffsetHours: 0, postId: null };

export function getControlSettings() {
  const raw = readObject(STORAGE_KEYS.CONTROL_SETTINGS, null);
  return { ...DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) };
}

export function saveControlSettings(patch) {
  const next = { ...getControlSettings(), ...patch };
  writeObject(STORAGE_KEYS.CONTROL_SETTINGS, next);
  return next;
}
```

- [ ] **Step 4: Service**

`js/services/revocation.service.js` :

```js
import { AUDIT_ACTIONS, DUT_STATUS } from '../core/constants.js';
import { nowIso } from '../core/utils.js';
import { getAllDuts } from '../repositories/dut.repository.js';
import { getCrl, saveCrl } from '../repositories/revocations.repository.js';
import { getControlSettings } from '../repositories/control-settings.repository.js';
import * as auditService from './audit.service.js';

/**
 * Liste de révocation locale du terminal de contrôle, et horloge de démo.
 *
 * L'horloge de démonstration sert UNIQUEMENT aux calculs d'âge et de validité
 * pendant une présentation ; tout ce qui est journalisé garde l'heure réelle.
 */

export function demoNow() {
  const { clockOffsetHours } = getControlSettings();
  return new Date(Date.now() + (Number(clockOffsetHours) || 0) * 3600e3);
}

export function isOnline() {
  const navOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
  return navOnline && !getControlSettings().offlineSimulated;
}

/** Reconstruit la liste depuis les statuts du système. À appeler quand on a le réseau. */
export function sync() {
  const entries = getAllDuts()
    .filter((d) => d.qrToken && [DUT_STATUS.SUSPENDU, DUT_STATUS.RETIRE].includes(d.status))
    .map((d) => ({ uid: d.qrToken, status: d.status, at: d.withdrawnAt || d.suspendedAt || d.validatedAt || nowIso() }));
  const crl = saveCrl({ syncedAt: nowIso(), entries });
  auditService.log(AUDIT_ACTIONS.CRL_SYNCED, { note: `${entries.length} entrée(s)` });
  return crl;
}

export function ageHours() {
  const crl = getCrl();
  if (!crl || !crl.syncedAt) return Infinity;
  return (demoNow().getTime() - new Date(crl.syncedAt).getTime()) / 3600e3;
}
```

> `auditService.log` lit l'utilisateur courant via `getCurrentUser()` ; en test il est `null` et le service existant écrit `SYSTEM`. Vérifier en lançant le test : si `audit.service.log` lève sans utilisateur, envelopper l'appel dans `try/catch` **dans le service d'audit** n'est pas de notre ressort — passer plutôt `note` seul comme ici, ce que le service accepte déjà.

- [ ] **Step 5: Run test to verify it passes**

Run: `node --experimental-default-type=module tests/verification.test.mjs`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add js/repositories/revocations.repository.js js/repositories/control-settings.repository.js js/services/revocation.service.js tests/verification.test.mjs
git commit -m "feat(controle): liste de revocation locale, reglages et horloge de demonstration"
```

---

### Task 5: `verifyScan` asynchrone et dérogation

**Files:**
- Modify: `js/services/control.service.js`
- Modify: `js/repositories/controls.repository.js`
- Test: `tests/verification.test.mjs` (ajouts)

**Interfaces:**
- Consumes: `verify` (T3), `loadKey` (T1), `getCrl`, `isOnline`, `demoNow` (T4), `findDutByQrToken`, `getAllControlLogs`, `appendControlLog`, `getAntenna` (répertoire), `getControlSettings`.
- Produces: `verifyScan(raw, { geo } = {}) → Promise<{ verdict, dut, entry }>`, `recordDerogation({ controlId, reason, note }) → derogation`, dépôt : `getAllDerogations()`, `appendDerogation(d)`, `findControlLogById(id)`.

- [ ] **Step 1: Write the failing test**

Ajouter à `tests/verification.test.mjs` :

```js
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
const scan2 = await C.verifyScan(buildSignedUri(liveSigned), {});
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-default-type=module tests/verification.test.mjs`
Expected: FAIL — `C.recordDerogation is not a function` (ou `verifyScan` rend une forme sans `verdict`)

- [ ] **Step 3: Dépôt des contrôles**

Remplacer `js/repositories/controls.repository.js` par :

```js
import { STORAGE_KEYS } from '../core/constants.js';
import { readCollection, writeCollection } from '../core/storage.js';

export function getAllControlLogs() {
  return readCollection(STORAGE_KEYS.CONTROL_LOGS);
}

export function findControlLogById(id) {
  return getAllControlLogs().find((c) => c.id === id) || null;
}

export function appendControlLog(entry) {
  const list = readCollection(STORAGE_KEYS.CONTROL_LOGS);
  list.push(entry);
  writeCollection(STORAGE_KEYS.CONTROL_LOGS, list);
  return entry;
}

export function getAllDerogations() {
  return readCollection(STORAGE_KEYS.DEROGATIONS);
}

export function appendDerogation(derogation) {
  const list = readCollection(STORAGE_KEYS.DEROGATIONS);
  list.push(derogation);
  writeCollection(STORAGE_KEYS.DEROGATIONS, list);
  return derogation;
}
```

- [ ] **Step 4: Service de contrôle**

Remplacer `js/services/control.service.js` par :

```js
import { uuid, nowIso } from '../core/utils.js';
import { getCurrentUser } from '../core/auth.js';
import { AUDIT_ACTIONS, DEROGATION_REASONS, VERDICT_LEVELS } from '../core/constants.js';
import { findDutByQrToken } from '../repositories/dut.repository.js';
import { appendControlLog, getAllControlLogs, findControlLogById, appendDerogation } from '../repositories/controls.repository.js';
import { getCrl } from '../repositories/revocations.repository.js';
import { getControlSettings } from '../repositories/control-settings.repository.js';
import { getAntenna } from './directory.service.js';
import { loadKey } from './signing.service.js';
import { verify } from './verification.service.js';
import { demoNow, isOnline } from './revocation.service.js';
import * as auditService from './audit.service.js';

/**
 * Contrôle d'un QR scanné. Le verdict vient du pipeline de vérification ; ce
 * service assemble le contexte (réseau, poste, horloge de démo), journalise
 * le contrôle avec son verdict et audite.
 */
export async function verifyScan(rawScanValue, { geo = null } = {}) {
  const settings = getControlSettings();
  const post = settings.postId ? getAntenna(settings.postId) : null;
  const context = {
    now: demoNow(),
    online: isOnline(),
    post: post ? { id: post.id, name: post.name, lat: post.lat, lng: post.lng } : null,
    geo: geo && Number.isFinite(geo.lat) && Number.isFinite(geo.lng) ? geo : null,
  };
  const verdict = await verify(rawScanValue, context, {
    key: loadKey(),
    findDut: findDutByQrToken,
    controls: getAllControlLogs(),
    crl: getCrl(),
  });

  const user = getCurrentUser();
  const position = context.geo || context.post;
  const entry = {
    id: uuid(),
    token: verdict.token,
    dutId: verdict.dut?.id || null,
    dutNumber: verdict.dut?.dutNumber || null,
    agentId: user?.id || 'SYSTEM',
    agentLabel: user?.name || 'SYSTEM',
    result: verdict.level,
    verdictLevel: verdict.level,
    mode: verdict.mode,
    postId: context.post?.id || null,
    postName: context.post?.name || null,
    findings: verdict.findings,
    date: nowIso(),
    lat: position ? position.lat : null,
    lng: position ? position.lng : null,
  };
  appendControlLog(entry);

  if (verdict.dut) {
    auditService.log(AUDIT_ACTIONS.DUT_CONTROLLED, {
      dutId: verdict.dut.id, dutNumber: verdict.dut.dutNumber, newValue: verdict.level,
      note: `Contrôle ${verdict.mode === 'HORS_LIGNE' ? 'hors ligne' : 'en ligne'} par ${entry.agentLabel} — ${verdict.level}`,
    });
    if (verdict.findings.some((x) => x.code === 'CANARI')) {
      auditService.log(AUDIT_ACTIONS.CANARY_TRIGGERED, {
        dutId: verdict.dut.id, dutNumber: verdict.dut.dutNumber,
        note: `DUT piège scanné par ${entry.agentLabel}${context.post ? ` à ${context.post.name}` : ''}`,
      });
    }
  }

  return { verdict, dut: verdict.dut, entry };
}

/** Lever un refus. Jamais sec : motif obligatoire, tracé, audité. */
export function recordDerogation({ controlId, reason, note = '' }) {
  if (!reason || !DEROGATION_REASONS[reason]) throw new Error('Le motif de dérogation est obligatoire.');
  if (reason === 'AUTRE' && !String(note).trim()) throw new Error('Motif « Autre » : veuillez préciser.');
  const control = findControlLogById(controlId);
  if (!control) throw new Error('Contrôle introuvable : impossible de déroger.');
  if (control.verdictLevel === VERDICT_LEVELS.INCONNU) throw new Error('Contrôle non opposable : reconnectez-vous avant toute dérogation.');

  const user = getCurrentUser();
  const derogation = appendDerogation({
    id: uuid(),
    controlId,
    dutId: control.dutId,
    dutNumber: control.dutNumber,
    agentId: user?.id || 'SYSTEM',
    agentLabel: user?.name || 'SYSTEM',
    reason,
    note: String(note).trim(),
    verdictLevel: control.verdictLevel,
    date: nowIso(),
  });
  auditService.log(AUDIT_ACTIONS.DUT_DEROGATION, {
    dutId: control.dutId, dutNumber: control.dutNumber, newValue: reason,
    note: `${DEROGATION_REASONS[reason]}${derogation.note ? ` — ${derogation.note}` : ''} (verdict ${control.verdictLevel})`,
  });
  return derogation;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --experimental-default-type=module tests/verification.test.mjs`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add js/services/control.service.js js/repositories/controls.repository.js tests/verification.test.mjs
git commit -m "feat(controle): verifyScan asynchrone avec verdict, derogation tracee"
```

---

### Task 6: Signature à la validation, ensemencement régénéré, canari

**Files:**
- Modify: `js/services/dut.service.js` (`validate`)
- Modify: `js/seed.js`
- Modify: `js/app.js`
- Modify: toute vue appelant `dutService.validate(` (chercher avec `rg "validate\(" js/views`)
- Test: `tests/verification.test.mjs` (ajouts)

**Interfaces:**
- Consumes: `ensureDemoKey`, `signPayload`, `loadKey` (T1), `CONTROL_POLICY`, `DEMO_SEED_VERSION`.
- Produces: `buildQrPayload(dut, key, { nbf }) → payload`, `validate(id) → Promise<dut>` (async), `ensureSignedDemoData() → Promise<void>`, `isSeeded()` sensible à la version, `seedDemoData()` crée le canari.

- [ ] **Step 1: Write the failing test**

Ajouter à `tests/verification.test.mjs` :

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-default-type=module tests/verification.test.mjs`
Expected: FAIL — `buildQrPayload is not a function`

- [ ] **Step 3: `dut.service.js` — charge et validation signée**

Ajouter les imports `import { CONTROL_POLICY } from '../core/constants.js';` (si `constants` est déjà importé, compléter la liste) et `import { loadKey, signPayload } from './signing.service.js';`. Puis :

```js
function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** La charge du QR : identité minimale du DUT, jamais de donnée commerciale. */
export function buildQrPayload(dut, key, { nbf }) {
  return {
    v: 2,
    kid: key.kid,
    uid: dut.qrToken,
    num: dut.dutNumber,
    plq: dut.general?.immatriculation || '',
    nbf,
    exp: addDays(nbf, CONTROL_POLICY.validityDays),
  };
}
```

Remplacer `validate(id)` par :

```js
export async function validate(id) {
  const dut = findDutById(id);
  if (!dut) throw new Error('DUT introuvable.');
  if (dut.status !== DUT_STATUS.TERMINE) throw new Error('Le DUT doit être terminé avant validation.');
  const operation = dut.operationId ? findOperationById(dut.operationId) : findActiveOperationForPartner(dut.partnerId);
  if (!operation) throw new Error('Impossible de valider : aucune plage de numéros active pour ce partenaire.');
  if (operation.used >= operation.quantity) throw new Error('Impossible de valider : aucun numéro DUT disponible.');
  const key = loadKey();
  if (!key) throw new Error('Clé de signature absente : rechargez la démonstration.');

  const dutNumber = consumeNextNumber(operation.id);
  const qrToken = generateToken();
  const validatedAt = nowIso();
  const qrSigned = await signPayload(
    buildQrPayload({ ...dut, qrToken, dutNumber }, key, { nbf: validatedAt.slice(0, 10) }),
    key,
  );
  const user = getCurrentUser();
  updateDut(id, {
    status: DUT_STATUS.VALIDE,
    dutNumber,
    qrToken,
    qrSigned,
    operationId: operation.id,
    validatedAt,
    validatedBy: user?.name || null,
  });
  auditService.log(AUDIT_ACTIONS.DUT_VALIDATED, { dutId: id, dutNumber, newValue: dutNumber });
  auditService.log(AUDIT_ACTIONS.DUT_SIGNED, { dutId: id, dutNumber, note: `Clé ${key.kid}` });
  return findDutById(id);
}
```

- [ ] **Step 4: Appelants de `validate`**

Run: `rg -n "validate\(" js/views`
Pour chaque appel `dutService.validate(id)` (ou équivalent) dans un gestionnaire d'événement : rendre le gestionnaire `async` et écrire `await dutService.validate(id)`, en conservant le `try/catch` existant qui affiche le toast d'erreur. Ne rien changer d'autre.

- [ ] **Step 5: `seed.js` — version, canari, signature**

En tête du fichier, compléter les imports :

```js
import { STORAGE_KEYS, ROLES, DUT_STATUS, AUDIT_ACTIONS, AUDIT_LABELS, DEMO_PASSWORD, DEMO_SEED_VERSION } from './core/constants.js';
import { ensureDemoKey, signPayload, loadKey } from './services/signing.service.js';
import { blankDut, buildQrPayload } from './services/dut.service.js';
```

Remplacer `isSeeded` :

```js
/** Ensemencé ET à la version courante : une version antérieure est régénérée. */
export function isSeeded() {
  return readObject(STORAGE_KEYS.DEMO_SEED_VERSION, 0) >= DEMO_SEED_VERSION;
}
```

Dans `seedDemoData()`, juste avant `writeCollection(STORAGE_KEYS.DUT_LIST, duts);`, ajouter le canari :

```js
  // DUT piège : vrai en apparence, ne doit jamais circuler. Le scanner alerte le siège.
  const canary = blankDut({ id: 'SEED', name: 'Siège OIC', partnerId: partnerStfa.id, partnerName: partnerStfa.name, antennaId: antennaAbidjan.id, antennaName: antennaAbidjan.name });
  canary.status = DUT_STATUS.VALIDE;
  canary.canary = true;
  canary.dutNumber = 'DUT-CI-2026-000777';
  canary.qrToken = uuid();
  canary.validatedAt = daysAgoIso(4);
  canary.validatedBy = 'Siège OIC';
  canary.general.immatriculation = 'CI-0777-CN';
  canary.general.transporterName = 'TRANSPORT ÉCHANTILLON';
  canary.trajet.chargement.ville = 'Abidjan';
  canary.trajet.dechargement.ville = 'Korhogo';
  duts.push(canary);
```

> `partnerStfa` et `antennaAbidjan` existent déjà plus haut dans `seedDemoData()`. Si `blankDut` attend d'autres champs utilisateur, passer exactement ceux qu'il lit (`partnerId`, `partnerName`, `antennaId`, `antennaName`, `id`, `name`).

Remplacer la dernière ligne `writeObject(STORAGE_KEYS.DEMO_INITIALIZED, true);` par :

```js
  writeObject(STORAGE_KEYS.DEMO_INITIALIZED, true);
  writeObject(STORAGE_KEYS.DEMO_SEED_VERSION, DEMO_SEED_VERSION);
```

Ajouter en fin de fichier :

```js
/**
 * Signe tout DUT numéroté qui ne l'est pas encore, avec la clé de démonstration
 * (créée si absente). Idempotent : sans effet si tout est déjà signé.
 */
export async function ensureSignedDemoData() {
  const key = await ensureDemoKey();
  const duts = readCollection(STORAGE_KEYS.DUT_LIST);
  let changed = false;
  for (const dut of duts) {
    if (!dut.dutNumber || !dut.qrToken || dut.qrSigned) continue;
    const nbf = (dut.validatedAt || nowIso()).slice(0, 10);
    dut.qrSigned = await signPayload(buildQrPayload(dut, key, { nbf }), key);
    changed = true;
  }
  if (changed) writeCollection(STORAGE_KEYS.DUT_LIST, duts);
}
```

Compléter l'import de stockage : `import { writeCollection, writeObject, readObject, readCollection } from './core/storage.js';`. Dans `resetDemo()`, la suppression des clés `dut_*` efface aussi la clé de signature : c'est voulu, `ensureSignedDemoData()` la recrée.

- [ ] **Step 6: `app.js` — régénération et attente**

Remplacer `if (!isSeeded()) seedDemoData();` par :

```js
// Une démo ensemencée avant ce lot est régénérée (données locales uniquement).
if (!isSeeded()) {
  Object.keys(localStorage).filter((k) => k.startsWith('dut_')).forEach((k) => localStorage.removeItem(k));
  seedDemoData();
}
await ensureSignedDemoData();
```

et compléter l'import : `import { isSeeded, seedDemoData, ensureSignedDemoData } from './seed.js';`. `app.js` est un module ES : le `await` de premier niveau est valide, et `startRouter()` plus bas ne démarre qu'une fois les QR signés.

- [ ] **Step 7: Run test to verify it passes**

Run: `node --experimental-default-type=module tests/verification.test.mjs`
Expected: PASS

Puis la suite complète : `node --experimental-default-type=module --test tests/*.test.mjs` — Expected: PASS. Si `tests/pdf.test.mjs` ou `tests/workspace.test.mjs` échouent sur `extractToken`/`buildVerifyUri` ou sur `validate` devenu asynchrone, **les mettre à jour** vers `parseQr`/`buildSignedUri` et `await validate(...)` : ce sont des tests du projet qui suivent l'interface, pas des régressions.

- [ ] **Step 8: Commit**

```bash
git add js/services/dut.service.js js/seed.js js/app.js js/views tests
git commit -m "feat(controle): signature a la validation, ensemencement regenere et signe, DUT piege"
```

---

### Task 7: Écran de contrôle, rendu des QR, style

**Files:**
- Modify: `js/views/control.view.js`
- Modify: `js/views/dut-detail.view.js:250`
- Modify: `js/services/pdf.service.js:18-24`
- Modify: `css/components.css`
- Test: `tests/verification.test.mjs` (ajout d'un test sur l'aide pure `badgeClassFor`)

**Interfaces:**
- Consumes: `verifyScan`, `recordDerogation` (T5), `sync`, `isOnline`, `ageHours` (T4), `getControlSettings`, `saveControlSettings` (T4), `listAntennas` (répertoire), `DEROGATION_REASONS`, `VERDICT_LEVELS`, `CONTROL_POLICY`.
- Produces: `badgeClassFor(level) → 'valid'|'orange'|'withdrawn'|'unknown'` exporté pour test.

- [ ] **Step 1: Write the failing test**

Ajouter à `tests/verification.test.mjs` :

```js
const { badgeClassFor } = await import('../js/views/control.view.js');
assert.equal(badgeClassFor('VERT'), 'valid');
assert.equal(badgeClassFor('ORANGE'), 'orange');
assert.equal(badgeClassFor('ROUGE'), 'withdrawn');
assert.equal(badgeClassFor('INCONNU'), 'unknown');
assert.equal(badgeClassFor('n-importe'), 'unknown');
console.log('Vue de contrôle : classe de bandeau par niveau.');
```

> La vue importe `icon`, `navigate`, `toast` : ces modules ne touchent pas le DOM à l'import. Si l'import échoue en Node, c'est qu'un import de la vue lit `document` au chargement ; le corriger dans la vue (lecture différée dans `render`), pas en test.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-default-type=module tests/verification.test.mjs`
Expected: FAIL — `badgeClassFor is not a function`

- [ ] **Step 3: Rendu des QR depuis `qrSigned`**

`js/views/dut-detail.view.js:250` → `if (dut.dutNumber) qrService.renderQrInto(tab.querySelector('#qr-holder'), dut.qrSigned, 168);`

`js/services/pdf.service.js` : remplacer les trois occurrences de `dut.qrToken` (lignes 18, 23, 24) par `dut.qrSigned`, et le message de la ligne 18 par `'Ce dossier ne possède pas de numéro ou de QR signé. Génération impossible.'`.

- [ ] **Step 4: Réécrire `js/views/control.view.js`**

```js
import { verifyPrint } from '../services/dut-print.service.js';
import { icon } from '../core/icons.js';
import { escapeHtml, formatDate, formatDateTime, formatNumber } from '../core/utils.js';
import { navigate } from '../core/router.js';
import { toast } from '../core/ui.js';
import { CONTROL_POLICY, DEROGATION_REASONS, VERDICT_LEVELS } from '../core/constants.js';
import * as controlService from '../services/control.service.js';
import * as revocationService from '../services/revocation.service.js';
import { getControlSettings, saveControlSettings } from '../repositories/control-settings.repository.js';
import { listAntennas } from '../services/directory.service.js';
import { getAllDuts } from '../repositories/dut.repository.js';
import { buildSignedUri } from '../services/qr.service.js';

let html5QrInstance = null;
let lastGeo = null;

export function badgeClassFor(level) {
  return {
    [VERDICT_LEVELS.VERT]: 'valid',
    [VERDICT_LEVELS.ORANGE]: 'orange',
    [VERDICT_LEVELS.ROUGE]: 'withdrawn',
    [VERDICT_LEVELS.INCONNU]: 'unknown',
  }[level] || 'unknown';
}

const LEVEL_TITLE = {
  VERT: 'DUT AUTHENTIQUE ET VALIDE',
  ORANGE: 'AUTHENTIQUE — VÉRIFICATION PARTIELLE',
  ROUGE: 'REFUS',
  INCONNU: 'CONTRÔLE NON OPPOSABLE',
};
const LEVEL_ICON = { VERT: 'checkCircle', ORANGE: 'alertTriangle', ROUGE: 'xCircle', INCONNU: 'alertCircle' };
const SEVERITY_ICON = { ok: 'check', info: 'info', warn: 'alertTriangle', block: 'xCircle' };

export function render(container, params) {
  stopScanner();
  if (revocationService.isOnline()) revocationService.sync();
  if (params.token) renderResult(container, params.token);
  else renderScan(container);
}

function headerHtml() {
  const settings = getControlSettings();
  const online = revocationService.isOnline();
  const age = revocationService.ageHours();
  const ageLabel = Number.isFinite(age) ? `${Math.round(age)} h` : 'jamais';
  const posts = listAntennas().map((a) => `<option value="${escapeHtml(a.id)}" ${a.id === settings.postId ? 'selected' : ''}>${escapeHtml(a.name)}</option>`).join('');
  return `
    <div class="card control-context">
      <div class="field">
        <label for="control-post">Poste de contrôle</label>
        <select class="input" id="control-post"><option value="">— choisir —</option>${posts}</select>
        <button type="button" class="btn btn-secondary btn-block" id="btn-geo" style="margin-top:var(--s2)">${icon('pin', { size: 15 })} Utiliser ma position</button>
      </div>
      <div class="control-network ${online ? 'is-online' : 'is-offline'}">
        <label class="switch"><input type="checkbox" id="toggle-offline" ${settings.offlineSimulated ? 'checked' : ''}> Simuler : réseau coupé</label>
        <span class="text-muted">${online ? 'En ligne — le statut du système fait foi' : `Hors ligne — liste de révocation à jour il y a ${ageLabel}`}</span>
      </div>
      <div class="control-clock">
        <span class="text-muted">Horloge de démonstration : ${settings.clockOffsetHours ? `+${settings.clockOffsetHours} h` : 'à l’heure'}</span>
        <button type="button" class="btn btn-secondary" id="btn-clock-age">Vieillir la liste de 24 h</button>
        <button type="button" class="btn btn-secondary" id="btn-clock-reset">Remettre à l’heure</button>
      </div>
    </div>`;
}

function bindHeader(container) {
  container.querySelector('#control-post').addEventListener('change', (e) => {
    saveControlSettings({ postId: e.target.value || null });
  });
  container.querySelector('#btn-geo').addEventListener('click', () => {
    if (!navigator.geolocation) { toast({ type: 'warning', title: 'Géolocalisation indisponible' }); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { lastGeo = { lat: pos.coords.latitude, lng: pos.coords.longitude }; toast({ type: 'success', title: 'Position relevée' }); },
      () => toast({ type: 'warning', title: 'Position refusée', desc: 'Le poste de contrôle sera utilisé.' }),
    );
  });
  container.querySelector('#toggle-offline').addEventListener('change', (e) => {
    saveControlSettings({ offlineSimulated: e.target.checked });
    navigate('/control');
  });
  container.querySelector('#btn-clock-age').addEventListener('click', () => {
    saveControlSettings({ clockOffsetHours: getControlSettings().clockOffsetHours + 24 });
    navigate('/control');
  });
  container.querySelector('#btn-clock-reset').addEventListener('click', () => {
    saveControlSettings({ clockOffsetHours: 0 });
    navigate('/control');
  });
}

function renderScan(container) {
  container.innerHTML = `
    <div class="text-center" style="margin-bottom:var(--s4)">
      <h1 style="font-size:1.3rem">Contrôle DUT</h1>
      <p class="text-muted" style="font-size:.85rem">Scannez le QR signé du document ou saisissez-le manuellement.</p>
    </div>
    ${headerHtml()}
    <div class="card">
      <div class="scan-box" id="scan-box">${icon('camera', { size: 40 })}</div>
      <button type="button" class="btn btn-primary btn-block btn-lg" id="btn-start-scan" style="margin-top:var(--s3)">
        ${icon('scan', { size: 17 })} Scanner un DUT
      </button>
    </div>
    <div class="card" style="margin-top:var(--s3)">
      <h3 style="margin-bottom:var(--s2)">Saisie manuelle</h3>
      <div class="field">
        <label for="manual-token">Contenu du QR (repli si la caméra est indisponible)</label>
        <input class="input" id="manual-token" placeholder="oicdut://v2/…">
      </div>
      <button type="button" class="btn btn-secondary btn-block" id="btn-manual-verify">Vérifier</button>
    </div>
    <div class="card" style="margin-top:var(--s3)">
      <h3 style="margin-bottom:var(--s2)">Simulation (démonstration)</h3>
      <div class="stack gap-2">
        <button type="button" class="btn btn-success btn-block" id="btn-sim-valid">${icon('checkCircle', { size: 15 })} Scanner un DUT valide</button>
        <button type="button" class="btn btn-warning btn-block" id="btn-sim-canary">${icon('alertTriangle', { size: 15 })} Scanner le DUT piège</button>
        <button type="button" class="btn btn-danger btn-block" id="btn-sim-fake">${icon('xCircle', { size: 15 })} Scanner un faux QR</button>
      </div>
    </div>
  `;
  bindHeader(container);

  container.querySelector('#btn-manual-verify').addEventListener('click', () => {
    const value = container.querySelector('#manual-token').value.trim();
    if (!value) { toast({ type: 'error', title: 'Veuillez saisir le contenu du QR.' }); return; }
    navigate(`/control/result/${encodeURIComponent(value)}`);
  });
  container.querySelector('#btn-sim-valid').addEventListener('click', () => {
    const d = getAllDuts().find((x) => x.status === 'VALIDE' && x.qrSigned && !x.canary);
    if (!d) { toast({ type: 'error', title: 'Aucun DUT validé en démonstration.' }); return; }
    navigate(`/control/result/${encodeURIComponent(buildSignedUri(d.qrSigned))}`);
  });
  container.querySelector('#btn-sim-canary').addEventListener('click', () => {
    const d = getAllDuts().find((x) => x.canary && x.qrSigned);
    if (!d) { toast({ type: 'error', title: 'Aucun DUT piège en démonstration.' }); return; }
    navigate(`/control/result/${encodeURIComponent(buildSignedUri(d.qrSigned))}`);
  });
  container.querySelector('#btn-sim-fake').addEventListener('click', () => {
    const d = getAllDuts().find((x) => x.status === 'VALIDE' && x.qrSigned);
    const forged = d ? `${d.qrSigned.slice(0, -2)}xx` : 'faux';
    navigate(`/control/result/${encodeURIComponent(buildSignedUri(forged))}`);
  });
  container.querySelector('#btn-start-scan').addEventListener('click', () => startScanner(container));
}

function startScanner(container) {
  const box = container.querySelector('#scan-box');
  if (!window.Html5Qrcode) {
    toast({ type: 'warning', title: 'Caméra indisponible', desc: 'Utilisez la saisie manuelle ou la simulation.' });
    return;
  }
  box.innerHTML = '<div id="qr-reader" class="qr-reader"></div>';
  html5QrInstance = new window.Html5Qrcode('qr-reader');
  html5QrInstance.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: 220 },
    (decodedText) => { navigate(`/control/result/${encodeURIComponent(decodedText)}`); },
    () => {},
  ).catch(() => {
    toast({ type: 'warning', title: 'Caméra inaccessible', desc: 'Utilisez la saisie manuelle ou la simulation.' });
    box.innerHTML = icon('camera', { size: 40 });
  });
}

function stopScanner() {
  if (html5QrInstance) {
    html5QrInstance.stop().catch(() => {}).finally(() => { html5QrInstance = null; });
  }
}

function findingsHtml(findings) {
  return `<ul class="findings">${findings.map((x) => `
    <li class="finding is-${x.severity}">${icon(SEVERITY_ICON[x.severity] || 'info', { size: 15 })}<span>${escapeHtml(x.message)}</span></li>`).join('')}</ul>`;
}

function derogationHtml(level) {
  if (level === VERDICT_LEVELS.VERT || level === VERDICT_LEVELS.INCONNU) return '';
  const options = Object.entries(DEROGATION_REASONS).map(([k, v]) => `<option value="${k}">${escapeHtml(v)}</option>`).join('');
  return `
    <div class="card" style="margin-top:var(--s3)">
      <h3>Laisser passer avec dérogation</h3>
      <p class="text-muted">Un refus n’est jamais sec. Le motif, votre nom et l’heure sont enregistrés et revus par le siège.</p>
      <form id="derogation-form">
        <div class="field"><label for="dero-reason">Motif</label><select class="input" id="dero-reason" required><option value="">— choisir —</option>${options}</select></div>
        <div class="field"><label for="dero-note">Précision</label><input class="input" id="dero-note" placeholder="Obligatoire si « Autre »"></div>
        <button class="btn btn-secondary" type="submit">Enregistrer la dérogation</button>
        <p id="dero-result" role="status"></p>
      </form>
    </div>`;
}

async function renderResult(container, rawToken) {
  container.innerHTML = '<div class="card"><p class="text-muted">Vérification en cours…</p></div>';
  const { verdict, dut, entry } = await controlService.verifyScan(rawToken, { geo: lastGeo });
  const cls = badgeClassFor(verdict.level);

  container.innerHTML = `
    <div class="control-result-badge ${cls}">
      ${icon(LEVEL_ICON[verdict.level], { size: 48 })}
      <h2>${LEVEL_TITLE[verdict.level]}</h2>
      ${dut?.dutNumber ? `<div class="fw-bold">${escapeHtml(dut.dutNumber)}</div>` : ''}
      <div class="control-mode">${verdict.mode === 'HORS_LIGNE' ? `Hors ligne${Number.isFinite(verdict.crlAgeHours) ? ` — liste à jour il y a ${Math.round(verdict.crlAgeHours)} h` : ''}` : 'En ligne'}</div>
    </div>
    <div class="card"><h3>Vérifications</h3>${findingsHtml(verdict.findings)}</div>
    ${dut ? `
      <div class="card">
        <div class="recap-grid">
          <div class="recap-item"><span>Transporteur</span><strong>${escapeHtml(dut.general?.transporterName || '—')}</strong></div>
          <div class="recap-item"><span>Véhicule</span><strong>${escapeHtml(dut.general?.immatriculation || '—')}</strong></div>
          <div class="recap-item"><span>Trajet</span><strong>${escapeHtml(dut.trajet?.chargement?.ville || '—')} → ${escapeHtml(dut.trajet?.dechargement?.ville || '—')}</strong></div>
          <div class="recap-item"><span>Date validation</span><strong>${formatDateTime(dut.validatedAt)}</strong></div>
        </div>
        <p class="text-muted" style="font-size:.75rem;margin-top:var(--s3)">Comparez la plaque et le document présentés. Le statut affiché provient du système, jamais du papier.</p>
      </div>` : ''}
    ${dut ? `<div class="card" style="margin-top:var(--s3)"><h3>Vérifier l’impression présentée</h3><p class="text-muted">Comparez l’empreinte imprimée au rang enregistré localement. Cette vérification ne remplace pas la comparaison des champs du papier.</p><form id="verify-print-form"><div class="field"><label for="print-rank">Rang d’impression</label><input class="input" type="number" min="1" step="1" id="print-rank" required></div><div class="field"><label for="print-hash">Empreinte SHA-256 (64 caractères)</label><input class="input" id="print-hash" maxlength="64" required pattern="[a-fA-F0-9]{64}"></div><button class="btn btn-secondary" type="submit">Comparer l’empreinte</button><p id="print-check-result" role="status"></p></form></div>` : ''}
    ${derogationHtml(verdict.level)}
    <button type="button" class="btn btn-primary btn-block btn-lg" id="btn-new-scan" style="margin-top:var(--s3)">${icon('scan', { size: 16 })} Nouveau contrôle</button>
  `;

  toast({ type: verdict.level === 'VERT' ? 'success' : verdict.level === 'ORANGE' ? 'warning' : 'error', title: LEVEL_TITLE[verdict.level] });

  container.querySelector('#derogation-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const output = container.querySelector('#dero-result');
    try {
      controlService.recordDerogation({
        controlId: entry.id,
        reason: container.querySelector('#dero-reason').value,
        note: container.querySelector('#dero-note').value,
      });
      output.textContent = 'Dérogation enregistrée et transmise au siège.';
      output.style.color = 'var(--success)';
      e.target.querySelector('button[type="submit"]').disabled = true;
    } catch (err) {
      output.textContent = err.message;
      output.style.color = 'var(--error)';
    }
  });
  container.querySelector('#verify-print-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const output = container.querySelector('#print-check-result');
    try {
      const r = await verifyPrint(dut, container.querySelector('#print-rank').value, container.querySelector('#print-hash').value);
      output.textContent = r.message;
      output.style.color = r.ok ? 'var(--success)' : 'var(--error)';
    } catch (err) { output.textContent = err.message; }
  });
  container.querySelector('#btn-new-scan').addEventListener('click', () => navigate('/control'));
}
```

> Les `output.style.color` et les `style="…"` de mise en page reprennent le code existant de cette vue (mêmes attributs qu'avant ce lot). Le bloc « vérifier l'empreinte imprimée » est **conservé tel quel**, conformément à la spec §7.

- [ ] **Step 5: Style**

Dans `css/components.css`, ajouter :

```css
.control-result-badge.orange { background: var(--warning-soft); color: var(--text); border: 1px solid var(--warning); }
.control-mode { font-size: .8rem; margin-top: var(--s1); opacity: .85; }
.findings { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.finding { display: flex; align-items: flex-start; gap: 8px; font-size: .85rem; }
.finding.is-ok { color: var(--success); }
.finding.is-info { color: var(--text-secondary); }
.finding.is-warn { color: var(--warning); }
.finding.is-block { color: var(--error); font-weight: 600; }
.control-context { display: grid; gap: var(--s2); }
.control-network, .control-clock { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s2); font-size: .85rem; }
.control-network.is-offline { color: var(--warning); }
.qr-demo-note { font-size: .7rem; color: var(--text-muted); margin-top: 4px; text-align: center; }
.qr-reader { width: 100%; height: 100%; }
```

- [ ] **Step 6: Run the tests, then verify manually**

Run: `node --experimental-default-type=module --test tests/*.test.mjs` — Expected: PASS.

Run: `python3 -m http.server 8080`, ouvrir `http://localhost:8080/#/control` (compte `controle.agent@demo.oic.ci` / `demo123`). Attendu :
1. « Scanner un DUT valide » → **VERT**, 5 lignes de vérification vertes/grises.
2. Choisir un poste, cocher « réseau coupé », rescanner → **ORANGE**, « liste à jour il y a 0 h ».
3. « Vieillir la liste de 24 h » ×2, rescanner → ORANGE avec avertissement ; ×4 au total → **INCONNU**, aucun bouton de dérogation.
4. Remettre à l'heure, réseau rétabli, « Scanner le DUT piège » → **ROUGE** « DUT piège », et une entrée « DUT piège scanné » dans `#/admin/audit`.
5. « Scanner un faux QR » → **ROUGE** « faux document ».
6. Sur un ROUGE, enregistrer une dérogation → confirmation, entrée « Dérogation accordée » dans l'audit.
7. Choisir le poste Abidjan, scanner le DUT valide ; choisir Bouaké, rescanner aussitôt → **ROUGE** « voyage impossible ».
8. `#/dut/<id>` d'un DUT validé : le QR porte la mention « clé de démonstration » ; le PDF se génère.

- [ ] **Step 7: Commit**

```bash
git add js/views/control.view.js js/views/dut-detail.view.js js/services/pdf.service.js css/components.css tests/verification.test.mjs
git commit -m "feat(controle): ecran de controle avec poste, hors-ligne simule, verdict, constats et derogation"
```

---

## Ordre d'exécution

```
T1 (clé, signature) → T2 (QR) → T3 (pipeline) → T4 (révocation, réglages) → T5 (control.service) → T6 (validation, ensemencement) → T7 (vue)
```

Strictement séquentiel : chaque tâche consomme l'interface de la précédente. Jalon utilisable à la fin de T6 (tout est signé et vérifiable en test) ; T7 rend la démo visible.
