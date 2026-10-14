/*
 * Lot d3 : contrôle sur route sans QR lisible.
 * - Recherche d'un DUT par le nom du conducteur, le numéro de sa pièce d'identité ou de son permis
 *   (conducteur principal et conducteurs de transbordement).
 * - Chaque recherche est une vérification journalisée (agent, critère, résultats, date, poste).
 * - L'agent consulte l'historique de ses propres contrôles (scans de QR et recherches).
 */
import { uuid, nowIso } from '../core/utils.js';
import { getCurrentUser } from '../core/auth.js';
import { requirePermission } from '../core/permissions.js';
import { AUDIT_ACTIONS, DUT_STATUS } from '../core/constants.js';
import { getAllDuts } from '../repositories/dut.repository.js';
import { getAllControlLogs } from '../repositories/controls.repository.js';
import { getAllControlSearches, appendControlSearch } from '../repositories/control-searches.repository.js';
import { getControlSettings } from '../repositories/control-settings.repository.js';
import { findAntennaById } from '../repositories/antennas.repository.js';
import { verdictOf } from './supervision.service.js';
import * as auditService from './audit.service.js';

export const DRIVER_CRITERIA = {
  NOM: 'Nom du conducteur',
  PIECE: 'Numéro de pièce d’identité',
  PERMIS: 'Numéro de permis de conduire',
};
const SEARCHABLE = [DUT_STATUS.VALIDE, DUT_STATUS.SUSPENDU, DUT_STATUS.RETIRE];
const MAX_RESULTS = 20;

const fold = (value) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
const compact = (value) => fold(value).replace(/[^A-Z0-9]/g, '');

/** Conducteurs d'un DUT : le conducteur en charge et ceux qu'il a remplacés lors des transbordements. */
function driversOf(dut) {
  const list = [{ role: 'principal', nom: dut.general?.driverNom, prenoms: dut.general?.driverPrenoms, piece: dut.general?.driverPiece, permis: dut.general?.driverPermis }];
  (dut.transbordements || []).forEach((t) => list.push({ role: 'transbordement', nom: t.avant?.driverNom, prenoms: t.avant?.driverPrenoms, piece: t.avant?.driverPiece, permis: t.avant?.driverPermis, rang: t.rang }));
  return list;
}

function matches(critere, value, driver) {
  if (critere === 'NOM') return fold(`${driver.nom || ''} ${driver.prenoms || ''}`).includes(fold(value));
  const field = critere === 'PIECE' ? driver.piece : driver.permis;
  return !!field && compact(field) === compact(value);
}

export function validateCriteria(critere, valeur) {
  if (!DRIVER_CRITERIA[critere]) throw new Error('Choisissez un critère de recherche.');
  const v = String(valeur ?? '').trim();
  if (critere === 'NOM' && fold(v).length < 3) throw new Error('Saisissez au moins 3 lettres du nom.');
  if (critere !== 'NOM' && compact(v).length < 4) throw new Error('Saisissez le numéro complet.');
  return v.slice(0, 80);
}

/** Recherche (journalisée) des DUT édités où figure le conducteur. Le statut affiché est celui du système. */
export function searchByDriver(critere, valeur) {
  const user = getCurrentUser();
  requirePermission(user, 'control.driver_search');
  const value = validateCriteria(critere, valeur);
  const results = [];
  for (const dut of getAllDuts()) {
    if (dut.canary || !dut.dutNumber || !SEARCHABLE.includes(dut.status)) continue;
    const hit = driversOf(dut).find((d) => matches(critere, value, d));
    if (hit) results.push({ dut, matchedOn: hit.role, rang: hit.rang || null, conducteur: [hit.nom, hit.prenoms].filter(Boolean).join(' ') });
  }
  results.sort((a, b) => Date.parse(b.dut.validatedAt || 0) - Date.parse(a.dut.validatedAt || 0));
  const shown = results.slice(0, MAX_RESULTS);
  const settings = getControlSettings();
  const post = settings.postId ? findAntennaById(settings.postId) : null;
  const entry = appendControlSearch({
    id: uuid(), agentId: user.id, agentLabel: user.name, critere, valeur: value,
    resultCount: results.length, dutIds: shown.map((r) => r.dut.id), dutNumbers: shown.map((r) => r.dut.dutNumber),
    statuses: shown.map((r) => r.dut.status), postId: post?.id || null, postName: post?.name || null, date: nowIso(),
  });
  auditService.log(AUDIT_ACTIONS.CONTROL_DRIVER_SEARCH, {
    newValue: String(results.length),
    note: `${DRIVER_CRITERIA[critere]} « ${value} » — ${results.length} DUT trouvé(s)${post ? ` — poste ${post.name}` : ''}`,
  });
  return { entry, results: shown, total: results.length };
}

/** Synthèse d'une recherche : aucun résultat, tous valides, aucun valide, ou mélange à examiner. */
export function searchVerdict(statuses = []) {
  if (!statuses.length) return 'INCONNU';
  const valid = statuses.filter((x) => x === DUT_STATUS.VALIDE).length;
  if (valid === statuses.length) return 'VERT';
  return valid === 0 ? 'ROUGE' : 'ORANGE';
}

/** Historique des contrôles de l'agent connecté (scans et recherches), du plus récent au plus ancien. */
export function myControls(user = getCurrentUser(), { from = '', to = '' } = {}) {
  requirePermission(user, 'control.history');
  // Les contrôles ensemencés de la démonstration portent l'identifiant SEED et le nom de l'agent.
  const mine = (c) => c.agentId === user.id || (c.agentId === 'SEED' && c.agentLabel === user.name);
  const scans = getAllControlLogs().filter(mine).map((c) => ({
    id: c.id, type: 'SCAN', date: c.date, dutId: c.dutId, dutNumber: c.dutNumber, verdict: verdictOf(c),
    detail: c.mode === 'HORS_LIGNE' ? 'Scan du QR · hors ligne' : 'Scan du QR · en ligne', postName: c.postName || '',
  }));
  const searches = getAllControlSearches().filter((s) => s.agentId === user.id).map((s) => ({
    id: s.id, type: 'RECHERCHE', date: s.date, dutId: s.dutIds[0] || null, dutNumber: s.dutNumbers.length > 1 ? `${s.dutNumbers[0]} et ${s.resultCount - 1} autre(s)` : (s.dutNumbers[0] || ''),
    verdict: searchVerdict(s.statuses),
    detail: `${DRIVER_CRITERIA[s.critere]} « ${s.valeur} » · ${s.resultCount} résultat(s)`, postName: s.postName || '',
  }));
  return [...scans, ...searches]
    .filter((x) => (!from || (x.date || '').slice(0, 10) >= from) && (!to || (x.date || '').slice(0, 10) <= to))
    .sort((a, b) => Date.parse(b.date || 0) - Date.parse(a.date || 0));
}
