import { clamp } from './keyframes.js';

/** Lissage de Chaikin : arrondit les coins, conserve les extrémités. */
export function smooth(points, iterations = 3) {
  let pts = points.map((p) => [p[0], p[1]]);
  for (let n = 0; n < iterations; n += 1) {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i += 1) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      out.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

/** Polyligne paramétrée par la longueur. */
export function makePath(points) {
  const segs = [];
  let length = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    segs.push({ a, b, len, start: length });
    length += len;
  }
  return { points, segs, length };
}

/** Position et cap à l'avancement u ∈ [0, 1]. Cap = atan2(dx, dz) (avant du véhicule vers +z). */
export function sampleAt(path, u) {
  const d = clamp(u, 0, 1) * path.length;
  let seg = path.segs[path.segs.length - 1];
  for (const s of path.segs) {
    if (d <= s.start + s.len && s.len > 0) { seg = s; break; }
  }
  const k = seg.len ? clamp((d - seg.start) / seg.len, 0, 1) : 0;
  return {
    x: seg.a[0] + (seg.b[0] - seg.a[0]) * k,
    z: seg.a[1] + (seg.b[1] - seg.a[1]) * k,
    heading: Math.atan2(seg.b[0] - seg.a[0], seg.b[1] - seg.a[1]),
  };
}

/** Avancement u du point de la trajectoire le plus proche de [x, z]. */
export function nearestU(path, [px, pz]) {
  let best = { u: 0, dist: Infinity };
  for (const s of path.segs) {
    const dx = s.b[0] - s.a[0];
    const dz = s.b[1] - s.a[1];
    const k = s.len ? clamp(((px - s.a[0]) * dx + (pz - s.a[1]) * dz) / (s.len * s.len), 0, 1) : 0;
    const dist = Math.hypot(px - (s.a[0] + dx * k), pz - (s.a[1] + dz * k));
    if (dist < best.dist) best = { u: (s.start + s.len * k) / path.length, dist };
  }
  return best;
}
