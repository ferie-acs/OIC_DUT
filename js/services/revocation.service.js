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
