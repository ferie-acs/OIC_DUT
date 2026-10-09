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
