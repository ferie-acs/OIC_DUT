/** Calque HTML : sous-titres (lot 1) ; étiquette et journal ajoutés au lot 3. */
export function createOverlay(stageEl) {
  const subtitle = stageEl.querySelector('#d3-subtitle');
  return {
    update(s) {
      if (subtitle.textContent !== s.subtitle.text) subtitle.textContent = s.subtitle.text;
      subtitle.style.opacity = String(s.subtitle.opacity);
    },
  };
}
