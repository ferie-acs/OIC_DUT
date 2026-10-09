// Filigrane des cartes : l'icône propre à la carte, en grand et grisée, posée dans le coin.
// Si la carte n'a pas d'icône, on lui en attribue une d'après son titre.
import { icon } from './icons.js';

const CARD_SELECTOR = '.card, .kpi-card, .chart-card, .plan-summary > div, .ac-metric, .map-card, .range-progress-card, .action-summary, .sidebar-note, .ac-hero, .cmp-score';
const OWN_ICON = '.kpi-icon svg, .ac-icon svg, .card-header svg, .chart-head svg, .ant-pin svg, .sup-avatar svg, :scope > svg, h3 svg, h2 svg';
const RULES = [
  [/contr[ôo]le|scan|verdict|refus|tampon|signature|qr/i, 'shield'],
  [/antenne|carte|zone|localis|corridor/i, 'map'],
  [/transport|camion|v[ée]hicule|trajet|planning|chronologie|livraison|route/i, 'truck'],
  [/incident|alerte|anomalie|piège|risque|attente/i, 'alertTriangle'],
  [/journal|audit|activit|historique|récent|dernier|connexion|usage|heure|jour/i, 'clock'],
  [/partenaire|plage|num[ée]ro|ressource|op[ée]ration/i, 'layers'],
  [/chauffeur|utilisateur|compte|agent|équipe|chef|tiers|exp[ée]diteur|destinataire|acteur/i, 'users'],
  [/qualit|complét|validé|check|résumé|récapitulatif/i, 'checkCircle'],
  [/statist|évolution|graph|répartition|mois|recette|montant|factur|tonnage|indicateur|comparer|score|tableau/i, 'barChart'],
  [/dut|document|dossier|brouillon|pièce|impression/i, 'file'],
];

function guessIcon(card) {
  const text = (card.querySelector('h1, h2, h3, .kpi-label, .card-header, .chart-head, .overline, strong')?.textContent || card.textContent || '').trim();
  for (const [re, name] of RULES) if (re.test(text)) return name;
  return 'file';
}

export function decorateCard(card) {
  if (!(card instanceof HTMLElement) || card.querySelector(':scope > .card-watermark')) return;
  if (card.closest('.modal-card, .toast, .leaflet-container')) return;
  const own = card.querySelector(OWN_ICON);
  const mark = document.createElement('span');
  mark.className = 'card-watermark'; mark.setAttribute('aria-hidden', 'true');
  mark.innerHTML = own ? own.outerHTML : icon(guessIcon(card), { size: 140 });
  card.appendChild(mark);
}

export function decorateCards(root = document) {
  root.querySelectorAll(CARD_SELECTOR).forEach(decorateCard);
}

/** Observe le rendu des vues : toute nouvelle carte reçoit son filigrane. */
export function watchCards(root) {
  if (!root || !('MutationObserver' in window)) return;
  let pending = null;
  const schedule = () => { if (pending) return; pending = requestAnimationFrame(() => { pending = null; decorateCards(root); }); };
  new MutationObserver(schedule).observe(root, { childList: true, subtree: true });
  decorateCards(root);
}
