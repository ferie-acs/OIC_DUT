// Repères géographiques des principales villes de Côte d'Ivoire (centre-ville approximatif).
// Servent à dessiner les trajets sur la carte du planning ; pas des adresses.
import { officialAntennas } from './antennas.js';

const CITIES = [
  ['Abidjan', 5.345, -4.024], ['Yamoussoukro', 6.827, -5.289], ['Bouaké', 7.690, -5.030],
  ['San-Pédro', 4.748, -6.636], ['Korhogo', 9.458, -5.629], ['Man', 7.412, -7.554],
  ['Daloa', 6.877, -6.450], ['Gagnoa', 6.132, -5.950], ['Divo', 5.838, -5.360],
  ['Abengourou', 6.730, -3.496], ['Bondoukou', 8.040, -2.800], ['Ferkessédougou', 9.593, -5.195],
  ['Ouangolodougou', 9.966, -5.150], ['Odienné', 9.508, -7.564], ['Séguéla', 7.961, -6.673],
  ['Soubré', 5.785, -6.594], ['Aboisso', 5.467, -3.207], ['Adzopé', 6.107, -3.861],
  ['Agboville', 5.928, -4.213], ['Grand-Bassam', 5.211, -3.739], ['Dabou', 5.325, -4.377],
  ['Sassandra', 4.953, -6.083], ['Tabou', 4.423, -7.353], ['Guiglo', 6.544, -7.493],
  ['Duékoué', 6.742, -7.349], ['Danané', 7.260, -8.155], ['Touba', 8.283, -7.683],
  ['Boundiali', 9.522, -6.487], ['Tengrela', 10.481, -6.410], ['Katiola', 8.137, -5.101],
  ['Dimbokro', 6.647, -4.705], ['Bouaflé', 6.990, -5.744], ['Toumodi', 6.558, -5.019],
  ['Tiassalé', 5.898, -4.828], ['Sinfra', 6.621, -5.911], ['Issia', 6.492, -6.586],
  ['Vavoua', 7.382, -6.477], ['Zuénoula', 7.430, -6.050], ['Mankono', 8.059, -6.189],
  ['Bouna', 9.269, -2.995], ['Takikro', 7.870, -3.160],
].map(([name, lat, lng]) => ({ name, lat, lng }));

/** « San Pédro », « san-pedro », « BOUAKÉ » désignent la même ville. */
export function normalizeCity(name) {
  return String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Retrouve une ville par son nom (accents, casse, tirets ignorés) ; repli sur le répertoire des antennes. */
export function findCity(name) {
  const key = normalizeCity(name);
  if (!key) return null;
  const direct = CITIES.find((c) => normalizeCity(c.name) === key);
  if (direct) return direct;
  const antenna = officialAntennas.find((a) => normalizeCity(a.city).split(' ')[0] === key.split(' ')[0]);
  return antenna ? { name: antenna.city, lat: antenna.lat, lng: antenna.lng } : null;
}

/**
 * Points d'un tracé légèrement courbé entre deux villes (arc de Bézier quadratique),
 * du départ (index 0) à l'arrivée (index n). Rend n+1 couples [lat, lng].
 */
export function routePoints(from, to, n = 32) {
  const dx = to.lng - from.lng, dy = to.lat - from.lat;
  const dist = Math.hypot(dx, dy) || 1;
  // Point de contrôle décalé perpendiculairement : la courbe se lit mieux qu'une droite.
  const cx = (from.lng + to.lng) / 2 - (dy / dist) * dist * 0.18;
  const cy = (from.lat + to.lat) / 2 + (dx / dist) * dist * 0.18;
  const pts = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n, u = 1 - t;
    const lng = u * u * from.lng + 2 * u * t * cx + t * t * to.lng;
    const lat = u * u * from.lat + 2 * u * t * cy + t * t * to.lat;
    pts.push([i === n ? to.lat : i === 0 ? from.lat : lat, i === n ? to.lng : i === 0 ? from.lng : lng]);
  }
  return pts;
}
