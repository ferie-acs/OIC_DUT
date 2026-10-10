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
  const raw = String(text);
  const padded = raw.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (raw.length % 4)) % 4);
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
