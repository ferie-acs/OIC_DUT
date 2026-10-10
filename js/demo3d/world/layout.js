/** Positions du décor — donnée pure. at = [x, z]. */
export const LAYOUT = Object.freeze({
  trees: [
    { at: [-8, 9], scale: 1.1 }, { at: [2, 10], scale: 0.9 }, { at: [12, 9], scale: 1.2 }, { at: [40, 9.5], scale: 1.0 },
    { at: [50, 10], scale: 1.3 }, { at: [60, 9], scale: 0.9 }, { at: [88, 9.5], scale: 1.1 }, { at: [96, 10], scale: 1.0 },
    { at: [10, -12], scale: 1.0 }, { at: [16, -16], scale: 1.2 }, { at: [44, -12], scale: 1.1 }, { at: [52, -15], scale: 0.9 },
    { at: [60, -12], scale: 1.0 }, { at: [96, -14], scale: 1.2 },
  ],
  palms: [
    { at: [-36, 13], scale: 1.1, lean: 0.12 }, { at: [-40, 12], scale: 0.95, lean: -0.1 }, { at: [-30, 11], scale: 1.2, lean: 0.08 },
    { at: [-44, -36], scale: 1.0, lean: 0.1 }, { at: [-12, -34], scale: 1.1, lean: -0.08 }, { at: [0, -12], scale: 1.0, lean: 0.12 },
    { at: [66, -30], scale: 1.1, lean: -0.1 }, { at: [95, -24], scale: 1.0, lean: 0.1 },
  ],
  fences: [
    { from: [-47, -7.5], to: [-34, -7.5] }, { from: [-22, -7.5], to: [4, -7.5] },
    { from: [64, -7.5], to: [73, -7.5] }, { from: [83, -7.5], to: [92, -7.5] },
  ],
});
