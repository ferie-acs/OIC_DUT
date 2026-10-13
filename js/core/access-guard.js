// Lot d1 : un compte n'ouvre pas de session tant qu'il n'est pas activé, ni quand son groupement
// (partenaire habilité, transporteur) n'est pas actif. Lecture seule du stockage.
import { STORAGE_KEYS } from './constants.js';
import { readCollection } from './storage.js';

const BLOCKING = ['EN_ATTENTE', 'SUSPENDU', 'RESILIE', 'REFUSE'];

/** Motif de blocage d'un compte, ou null si la session est permise. */
export function accessBlockReason(user) {
  if (!user) return null;
  if (user.activationPending) return 'Ce compte n’est pas encore activé. Utilisez le lien d’activation reçu par courriel.';
  if (user.partnerId) {
    const p = readCollection(STORAGE_KEYS.PARTNERS).find((x) => x.id === user.partnerId);
    if (p && BLOCKING.includes(p.status)) return 'L’accès de votre entreprise est suspendu ou clos. Contactez l’OIC.';
  }
  if (user.role === 'TRANSPORTEUR' && user.transporterId) {
    const t = readCollection(STORAGE_KEYS.TRANSPORTERS).find((x) => x.id === user.transporterId);
    if (t && BLOCKING.includes(t.status)) return 'L’accès de votre entreprise est suspendu ou clos. Contactez l’OIC.';
  }
  return null;
}
