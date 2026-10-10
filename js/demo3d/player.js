/**
 * Pilote de lecture — SEUL fichier de js/demo3d autorisé à utiliser
 * requestAnimationFrame. Il ne calcule aucun état : il fait avancer un temps
 * et appelle renderAt(ms).
 */
export const MAX_STEP_MS = 100;

/** Avance le temps d'une image, plafonnée (onglet masqué, machine lente). */
export function advance(position, deltaMs, duration) {
  const step = Math.min(Math.max(deltaMs, 0), MAX_STEP_MS);
  return Math.min(duration, position + step);
}

export function startPlayer({ renderAt, duration, button }) {
  let playing = false;
  let position = 0;
  let last = null;
  const label = () => {
    button.textContent = playing ? 'Pause' : position >= duration ? 'Revoir' : 'Lire';
    button.setAttribute('aria-pressed', String(playing));
  };
  const tick = (ts) => {
    if (playing) {
      if (last !== null) position = advance(position, ts - last, duration);
      last = ts;
      renderAt(position);
      if (position >= duration) { playing = false; label(); }
    }
    requestAnimationFrame(tick);
  };
  const toggle = () => {
    if (!playing && position >= duration) position = 0;
    playing = !playing;
    last = null;
    label();
  };
  button.addEventListener('click', toggle);
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); toggle(); }
  });
  label();
  requestAnimationFrame(tick);
}
