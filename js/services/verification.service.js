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

const DAY = /^\d{4}-\d{2}-\d{2}$/;
function dayStart(iso) { return new Date(`${iso}T00:00:00Z`); }
function dayEnd(iso) { return new Date(`${iso}T23:59:59.999Z`); }
/** Une date de charge est lisible si elle a la forme AAAA-MM-JJ et désigne un vrai jour. */
function readableDay(iso) { return typeof iso === 'string' && DAY.test(iso) && !Number.isNaN(dayStart(iso).getTime()) && dayStart(iso).toISOString().slice(0, 10) === iso; }

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
  if (!readableDay(p.nbf) || !readableDay(p.exp)) return f('validite', 'block', 'DATE_ILLISIBLE', 'Dates de validité illisibles : document suspect.');
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
  // Les contrôles sont journalisés à l'heure réelle : l'écart se mesure à l'heure réelle,
  // jamais à l'horloge de démonstration (qui ne sert qu'à la validité et à l'âge de la liste).
  const realNow = ctx.realNow || ctx.now;
  const dutId = ctx.dut ? ctx.dut.id : null;
  const previous = (ctx.controls || [])
    .filter((c) => dutId && c.dutId === dutId && Number.isFinite(c.lat) && Number.isFinite(c.lng) && c.date)
    .map((c) => ({ ...c, at: new Date(c.date) }))
    .filter((c) => c.at < realNow)
    .sort((a, b) => b.at - a.at)[0];
  if (!previous) return f('trajet', 'ok', 'TRAJET_OK', 'Aucun contrôle antérieur.');
  const hours = Math.max((realNow - previous.at) / 3600e3, 1 / 60);
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
  // Un faux, un piège, une charge expirée ou un voyage impossible se refusent quel que soit l'âge
  // de la liste : seul l'absence d'autre constat bloquant rend le contrôle « non opposable ».
  if (list.some((x) => x.severity === 'block' && x.code !== 'NON_OPPOSABLE')) return VERDICT_LEVELS.ROUGE;
  if (list.some((x) => x.code === 'NON_OPPOSABLE')) return VERDICT_LEVELS.INCONNU;
  if (list.some((x) => x.severity === 'warn')) return VERDICT_LEVELS.ORANGE;
  if (!online) return VERDICT_LEVELS.ORANGE;
  return VERDICT_LEVELS.VERT;
}

/**
 * Vérifie un QR scanné. `deps` : { key, findDut(token), controls, crl }.
 * Ne lève jamais.
 *
 * Hors ligne, `findDut` reste appelé : dans ce POC le « système » est
 * LocalStorage, donc le DUT est lisible localement — c'est le STATUT qu'on
 * refuse de consulter, pour rester fidèle au vrai hors-ligne. Le canari et le
 * trajet, eux, se détectent sur les données locales du terminal.
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
  const dut = deps.findDut ? deps.findDut(parsed.token) : null;
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
