/** Coordonnées normalisées (-1..1, y vers le haut) → pixels (origine en haut à gauche). */
export function ndcToPixels(nx, ny, width, height) {
  return { left: ((nx + 1) / 2) * width, top: ((1 - ny) / 2) * height };
}
