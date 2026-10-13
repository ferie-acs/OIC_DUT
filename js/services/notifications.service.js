// Intégration des lots d1 à d5 : avis adressés aux personnes concernées par un changement d'état.
// Tous les envois passent par la messagerie unique du lot d1 (`envoyer`), donc restent SIMULÉS :
// conservés localement, visibles dans « Mes messages » du destinataire et dans le journal OIC.
// Un avis ne bloque jamais l'action métier qui l'a déclenché : l'état est déjà enregistré et journalisé.
import { getCurrentUser } from '../core/auth.js';
import { can } from '../core/permissions.js';
import { usersStore } from '../repositories/actors.repository.js';
import { envoyer } from './messaging.service.js';

const actif = (u) => u && u.active !== false && u.status !== 'DESACTIVE';

/**
 * Comptes destinataires, sans doublon. Critères cumulatifs (tous facultatifs) :
 * `ids` (comptes précis), `roles`, `permission` (moteur de permissions, habilitations comprises),
 * `antennaId`, `partnerId`, `transporterId`. L'auteur de l'action est exclu par défaut.
 */
export function destinataires({ ids = null, roles = null, permission = null, antennaId = null, partnerId = null, transporterId = null, exclureAuteur = true } = {}) {
  const auteur = getCurrentUser();
  const wanted = ids ? new Set(ids.filter(Boolean)) : null;
  return usersStore.getAll().filter((u) => actif(u)
    && (!wanted || wanted.has(u.id))
    && (!roles || roles.includes(u.role))
    && (!permission || can(u, permission))
    && (!antennaId || u.antennaId === antennaId)
    && (!partnerId || u.partnerId === partnerId)
    && (!transporterId || u.transporterId === transporterId)
    && (!exclureAuteur || u.id !== auteur?.id));
}

/** Envoie le même avis (courriel simulé) à chaque compte ; renvoie le nombre de messages enregistrés. */
export function notifier(comptes, { objet, corps, origine, lien = null, entite = null } = {}) {
  const vus = new Set();
  let n = 0;
  for (const compte of comptes || []) {
    if (!compte?.id || vus.has(compte.id)) continue;
    vus.add(compte.id);
    try {
      if (envoyer({ canal: 'EMAIL', destinataire: compte.id, objet, corps: `Bonjour ${compte.name || ''},\n\n${corps}\n\nMessage simulé : aucun courriel n’est réellement envoyé dans cette démonstration.`, origine, lien, entite })) n += 1;
    } catch (err) {
      console.warn('Avis non enregistré :', err?.message || err);
    }
  }
  return n;
}

/** Raccourci : critères de `destinataires` + contenu de `notifier`. */
export function aviser(criteres, message) {
  return notifier(destinataires(criteres), message);
}
