/**
 * Couleurs de la démo 3D — source unique.
 * ~70 % logo OIC (bleu royal, bleu ciel, marine, orange, vert),
 * ~30 % touches ivoiriennes dans le décor (latérite, lagune, végétation, ocre).
 * L'orange est réservé au camion suivi.
 */
export const PALETTE = Object.freeze({
  // Logo OIC
  royal: '#1A5BA6',
  ciel: '#5BA8DE',
  marine: '#1E3A6E',
  orange: '#F08A1C',
  vert: '#1E9A48',
  rouge: '#E11D2E',
  blanc: '#FFFFFF',
  // Sol et route
  fond: '#EAF0F6',
  sol: '#EEF2F7',
  dalle: '#E2E8EF',
  route: '#CDD5DF',
  marquage: '#FFFFFF',
  marquageJaune: '#F2C14E',
  // Touches ivoiriennes
  laterite: '#D08158',
  lagune: '#4FB7B0',
  herbe: '#6CC070',
  feuillage: '#4CAF6A',
  feuillageFonce: '#3C9A58',
  palme: '#3FA65A',
  tronc: '#8A5A3B',
  murOcre: '#E9C99A',
  // Bâti et objets
  mur: '#F4F6F9',
  tole: '#B8C2CC',
  quai: '#3B4656',
  vitre: '#22324A',
  pneu: '#2B2F36',
  jante: '#C9CDD3',
  acier: '#8C96A3',
  carton: '#D9A86C',
  bois: '#C08A55',
  chariot: '#F5B82E',
  gilet: '#F2C14E',
  peau: '#8D5A3B',
  coque: '#24467A',
  conteneurs: Object.freeze(['#C8553D', '#D9A441', '#1E9A48', '#1A5BA6', '#E07B39', '#5BA8DE']),
  // Lumière
  soleil: '#FFF3DC',
  cielHemi: '#EAF3FF',
  solHemi: '#E8D9C8',
});

/** Libellé et couleur de l'étiquette pour chaque état du DUT. */
export const DUT_STATUS_STYLE = Object.freeze({
  aucun: null,
  brouillon: Object.freeze({ label: 'Brouillon', color: '#6B7480' }),
  valide: Object.freeze({ label: 'Validé', color: PALETTE.royal }),
  imprime: Object.freeze({ label: 'Imprimé · QR', color: PALETTE.marine }),
  authentique: Object.freeze({ label: 'Contrôlé · Authentique ✓', color: PALETTE.vert }),
  livre: Object.freeze({ label: 'Livré', color: PALETTE.vert }),
});
