import { QR_SCHEME } from '../core/constants.js';
import { uuid } from '../core/utils.js';
import { fromBase64Url } from './signing.service.js';

/**
 * Le QR porte une charge SIGNÉE : numéro, plaque, fenêtre de validité, jeton
 * opaque. Jamais de donnée commerciale. Un seul format est accepté.
 */

/** Le jeton opaque embarqué dans la charge : aléatoire, non séquentiel. */
export function generateToken() {
  return uuid();
}

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
