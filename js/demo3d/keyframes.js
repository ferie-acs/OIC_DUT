/** Interpolation pure, sans état ni horloge. */
export const ease = Object.freeze({
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2),
  out: (t) => 1 - (1 - t) ** 3,
});

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, k) => a + (b - a) * k;

/** Valeur interpolée d'une série [[ms, valeur], ...] ; valeur = nombre ou tableau de nombres. */
export function keyed(keys, ms, easeFn = ease.inOut) {
  if (ms <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i += 1) {
    const [t1, v1] = keys[i];
    if (ms <= t1) {
      const [t0, v0] = keys[i - 1];
      const k = t1 === t0 ? 1 : easeFn((ms - t0) / (t1 - t0));
      return Array.isArray(v0) ? v0.map((x, j) => lerp(x, v1[j], k)) : lerp(v0, v1, k);
    }
  }
  return keys[keys.length - 1][1];
}

/** Valeur en escalier : la dernière clé atteinte. */
export function stepped(keys, ms) {
  let value = keys[0][1];
  for (const [t, v] of keys) {
    if (ms >= t) value = v;
    else break;
  }
  return value;
}

export const within = ([a, b], ms) => ms >= a && ms < b;
export const spanProgress = ([a, b], ms) => clamp((ms - a) / (b - a), 0, 1);
/** Monte vite, tient, redescend vite : 0 → 1 → 1 → 0. */
export const plateau = (p) => clamp(Math.min(p * 4, (1 - p) * 4), 0, 1);
