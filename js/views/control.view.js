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

/** « Authentique » n'est affiché que si la signature a réellement été vérifiée. */
export function titleFor(level, findings = []) {
  if (level === VERDICT_LEVELS.ORANGE && !findings.some((x) => x && x.code === 'SIGNATURE_OK')) {
    return 'VÉRIFICATION PARTIELLE — SIGNATURE NON VÉRIFIÉE';
  }
  return LEVEL_TITLE[level] || LEVEL_TITLE.INCONNU;
}
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
      <div class="control-context-head"><span class="overline">Réglages du poste</span><span class="control-pill ${online ? 'is-online' : 'is-offline'}"><i></i>${online ? 'En ligne' : `Hors ligne · liste à jour il y a ${ageLabel}`}</span></div>
      <div class="control-context-grid">
        <label class="plan-pill"><span>${icon('map', { size: 14 })} Poste de contrôle</span><select class="plan-pill-select" id="control-post"><option value="">— choisir —</option>${posts}</select></label>
        <button type="button" class="btn btn-secondary" id="btn-geo">${icon('pin', { size: 15 })} Utiliser ma position</button>
      </div>
      <div class="control-demo">
        <span class="control-demo-label">Démonstration</span>
        <label class="switch control-switch"><input type="checkbox" id="toggle-offline" ${settings.offlineSimulated ? 'checked' : ''}><span class="control-switch-track"></span>Simuler : réseau coupé</label>
        <span class="control-clock-state">${icon('clock', { size: 14 })} Horloge : ${settings.clockOffsetHours ? `+${settings.clockOffsetHours} h` : 'à l’heure'}</span>
        <div class="plan-nav"><button type="button" class="plan-nav-btn" id="btn-clock-age">Vieillir la liste de 24 h</button><button type="button" class="plan-nav-btn" id="btn-clock-reset">Remettre à l’heure</button></div>
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
    <div class="control-intro">
      <h1>Contrôle DUT</h1>
      <p>Scannez le tampon du document ou saisissez-le manuellement. Le téléphone répond en trois secondes.</p>
    </div>
    ${headerHtml()}
    <div class="card control-scan-card">
      <div class="scan-box" id="scan-box">${icon('camera', { size: 40 })}<span class="scan-hint">Cadrez le QR du DUT</span></div>
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
      <h3 style="margin-bottom:var(--s1)">Simulation (démonstration)</h3>
      <p class="text-muted control-sim-hint">Sans caméra : jouez les cas typiques pour voir la réponse de l’agent.</p>
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
    // Le plus récemment validé : encore dans sa période de validité, donc VERT attendu.
    const d = getAllDuts().filter((x) => x.status === 'VALIDE' && x.qrSigned && !x.canary)
      .sort((a, b) => (b.validatedAt || '').localeCompare(a.validatedAt || ''))[0];
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
      <h2>${titleFor(verdict.level, verdict.findings)}</h2>
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

  toast({ type: verdict.level === 'VERT' ? 'success' : verdict.level === 'ORANGE' ? 'warning' : 'error', title: titleFor(verdict.level, verdict.findings) });

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
