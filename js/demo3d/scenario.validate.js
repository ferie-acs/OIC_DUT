/** Validation structurelle du scénario. Retourne la liste des erreurs (vide = valide). */
const NAMED_STOPS = new Set(['start', 'checkpoint', 'end']);

export function validateScenario({ TOTAL_MS, SHOTS, KEYS, SPANS, AUDIT, DUT_STATUSES, ROUTES }) {
  const errors = [];
  let cursor = 0;
  for (const shot of SHOTS) {
    if (shot.at !== cursor) errors.push(`plan ${shot.id} non contigu (attendu ${cursor}, trouvé ${shot.at})`);
    if (!(shot.duration > 0)) errors.push(`plan ${shot.id} : durée invalide`);
    if (typeof shot.subtitle !== 'string' || !shot.subtitle.trim()) errors.push(`plan ${shot.id} : sous-titre vide`);
    cursor = shot.at + shot.duration;
  }
  if (cursor !== TOTAL_MS) errors.push(`durée totale ${cursor} ≠ ${TOTAL_MS}`);

  for (const [name, series] of Object.entries(KEYS)) {
    if (series[0][0] !== 0) errors.push(`KEYS.${name} ne commence pas à 0`);
    if (series[series.length - 1][0] !== TOTAL_MS) errors.push(`KEYS.${name} ne finit pas à ${TOTAL_MS}`);
    for (let i = 1; i < series.length; i += 1) {
      if (series[i][0] < series[i - 1][0]) errors.push(`KEYS.${name} non trié à l'indice ${i}`);
    }
  }
  for (const [, status] of KEYS.dutStatus) if (!DUT_STATUSES.includes(status)) errors.push(`état DUT inconnu : ${status}`);
  for (const [, stop] of KEYS.truckRoute) if (!NAMED_STOPS.has(stop)) errors.push(`arrêt camion inconnu : ${stop}`);

  for (const [name, [a, b]] of Object.entries(SPANS)) {
    if (!(a >= 0 && b <= TOTAL_MS && a < b)) errors.push(`SPANS.${name} invalide`);
  }
  for (const [name, pts] of Object.entries(ROUTES)) if (pts.length < 2) errors.push(`ROUTES.${name} trop court`);
  if (AUDIT.length !== 6) errors.push(`journal d'audit : 6 lignes attendues, ${AUDIT.length} trouvées`);
  return errors;
}
