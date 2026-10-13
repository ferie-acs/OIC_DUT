/*
 * Facturation du DUT : détail établi par côté (expéditeur, destinataire) du prix, de la TVA et du droit de
 * timbre, en francs CFA entiers, et mention du compte (propre, d'autrui, sous-traitance).
 * Module pur (aucun accès au stockage) : il se teste seul.
 */

export const ACCOUNT_LABELS = { PROPRE: 'Compte propre', AUTRUI: 'Pour le compte d’autrui', SOUS_TRAITANCE: 'Sous-traitance' };
export const BILLING_LINES = [
  ['prixTransport', 'Prix du transport'],
  ['accessoires', 'Prestations accessoires'],
  ['complementaires', 'Prestations complémentaires'],
  ['autres', 'Autres frais'],
];
export const MIN_TIMBRE_TOTAL = 100;

const amount = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** Un côté de la facture : HT, TVA arrondie au franc, sous-total TTC, timbre, total. */
export function billingSide(poste = {}) {
  const lines = BILLING_LINES.map(([key, label]) => ({ key, label, montant: Math.round(amount(poste[key])) }));
  const totalHT = lines.reduce((sum, l) => sum + l.montant, 0);
  const tvaRate = amount(poste.tva);
  const tvaMontant = Math.round(totalHT * tvaRate / 100);
  const sousTotal = totalHT + tvaMontant;
  const timbre = Math.round(amount(poste.timbre));
  return { lines, totalHT, tvaRate, tvaMontant, sousTotal, timbre, total: sousTotal + timbre };
}

/** Détail complet : chaque côté, puis les totaux de la facture. */
export function billingDetail(facturation = {}) {
  const expediteur = billingSide(facturation.expediteur);
  const destinataire = billingSide(facturation.destinataire);
  return {
    expediteur,
    destinataire,
    totalHT: expediteur.totalHT + destinataire.totalHT,
    tva: expediteur.tvaMontant + destinataire.tvaMontant,
    timbreTotal: expediteur.timbre + destinataire.timbre,
    sousTotal: expediteur.sousTotal + destinataire.sousTotal,
    totalAPercevoir: expediteur.total + destinataire.total,
  };
}

/** Mention portée sur le DUT selon le type de compte. */
export function accountMention(general = {}, expediteur = {}) {
  const compte = general.compte || 'PROPRE';
  if (compte === 'SOUS_TRAITANCE') {
    return `Transport en sous-traitance pour le compte de ${general.donneurOrdre || '[donneur d’ordre à préciser]'}.`;
  }
  if (compte === 'AUTRUI') {
    return `Transport pour le compte d’autrui : ${expediteur.raisonSociale || '[expéditeur à préciser]'}.`;
  }
  return 'Transport pour compte propre : le transporteur achemine sa propre marchandise.';
}

/** Règles de la facture et du compte, vérifiées avant soumission. */
export function billingErrors(facturation = {}, general = {}) {
  const errors = [];
  for (const side of ['expediteur', 'destinataire']) {
    const poste = facturation[side] || {};
    const label = side === 'expediteur' ? 'expéditeur' : 'destinataire';
    if ([...BILLING_LINES.map(([key]) => key), 'timbre'].some((key) => amount(poste[key]) < 0)) {
      errors.push(`Facture côté ${label} : les montants ne peuvent pas être négatifs.`);
    }
    const rate = amount(poste.tva);
    if (rate < 0 || rate > 100) errors.push(`Facture côté ${label} : le taux de TVA doit être compris entre 0 et 100 %.`);
  }
  const detail = billingDetail(facturation);
  if (detail.totalHT <= 0) errors.push('La facture est obligatoire : renseignez au moins le prix du transport.');
  if (detail.timbreTotal < MIN_TIMBRE_TOTAL) errors.push('Facture sans timbre ou montant en dessous de 100 FCFA.');
  if (!ACCOUNT_LABELS[general.compte || 'PROPRE']) errors.push('Type de compte inconnu.');
  if (general.compte === 'SOUS_TRAITANCE' && !String(general.donneurOrdre || '').trim()) {
    errors.push('Sous-traitance : indiquez le donneur d’ordre (transporteur principal ou auxiliaire de transport).');
  }
  return errors;
}
