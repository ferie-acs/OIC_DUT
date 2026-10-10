# Passerelle Bourse de fret (B2F) ↔ DUT — conception

Date : 2026-10-10 · Statut : proposé · Périmètre : POC (stockage navigateur)

## 1. Problème

Un transport peut naître de deux façons :

- **via la Bourse de fret** : un affréteur publie un fret, un transporteur le prend, l'appariement est validé ;
- **hors Bourse de fret** : l'entreprise transporte pour son compte ou pour un tiers, sans passer par B2F.

Dans les deux cas, le camion doit circuler avec un **DUT valide**. Aujourd'hui :

- B2F suit déjà le transport (six étapes `valide → a_quai → charge → en_route → livre → cloture`) et ses incidents (`panne`, `retard`, `barrage`, `litige_chargement`), dans un journal à ajout seul ;
- B2F produit sa **propre fiche DUT**, un instantané PDF marqué « SANS VALEUR », sans lien avec la plateforme DUT ;
- la plateforme DUT permet maintenant au transporteur de déclarer les étapes (`À préparer → Chargé → En route → Arrivé → Livré`) et les incidents.

Sans lien, un transport pris via B2F serait déclaré deux fois, avec des versions qui divergent.

## 2. Principe : une seule source des étapes par transport

| Origine du transport | Source des étapes et incidents | Plateforme DUT |
|---|---|---|
| Fret pris via B2F | **B2F** | Reçoit et affiche ; boutons « Marquer » remplacés par « Suivi par la Bourse de fret » |
| Fret hors B2F (compte propre, tiers) | **DUT** | Boutons « Marquer : … » et « Signaler un incident » (déjà livrés) |

Un dossier DUT relié à une mission B2F porte `source = { plateforme: 'B2F', appariementId, reference }`.

## 3. Parcours cible

1. **Appariement validé dans B2F** → B2F envoie la mission à la plateforme DUT.
2. La mission arrive dans une **boîte de réception « Missions de la Bourse de fret »** côté partenaire DUT. Le partenaire clique « Créer le DUT » : un brouillon est prérempli (transporteur, véhicule, conducteur, villes, dates, marchandise, poids) et relié à la mission.
3. Le DUT suit son circuit normal : complétion, soumission, relecture antenne, validation, numéro, QR.
4. Le transporteur déclare ses étapes et incidents **dans B2F**. Chaque événement est transmis au DUT et alimente le suivi du dossier.
5. **(Lot B)** B2F interroge le statut du DUT et **refuse « En route » tant que le DUT n'est pas validé**.

## 4. Correspondances

### Étapes

| B2F | DUT | Remarque |
|---|---|---|
| `valide` | À préparer | événement inscrit à l'historique |
| `a_quai` | À préparer | événement « À quai » inscrit à l'historique |
| `charge` | Chargé | |
| `en_route` | En route | |
| `livre` | Arrivé puis Livré | les deux étapes sont horodatées au même instant |
| `cloture` | Livré | événement « Clôturé » inscrit à l'historique |

L'étape DUT ne recule jamais : on retient la plus avancée reçue.

### Incidents

| B2F | DUT |
|---|---|
| `panne` | Panne |
| `retard` | Retard |
| `barrage` | Barrage *(type ajouté côté DUT)* |
| `litige_chargement` | Litige au chargement *(type ajouté côté DUT)* |

Priorité « Normale », responsable du suivi « Transporteur (Bourse de fret) », faits = description saisie dans B2F.

### Mission → brouillon de DUT

| B2F (`donnees` de l'instantané) | DUT |
|---|---|
| `corridor` (provenance → destination) | `trajet.chargement.ville`, `trajet.dechargement.ville` |
| `departPrevu`, `arriveePrevue` | `trajet.dateDepart`, `trajet.dateArrivee` |
| `marchandise`, `poidsTotalT` | `marchandises[0].nature`, `marchandises[0].poidsTonnes` |
| `transporteurRaisonSociale` | `general.transporterName` |
| `immatriculation` | `general.immatriculation` |
| `chauffeurNom` | `general.driverNom` |
| `affreteurRaisonSociale` | `expediteur.raisonSociale` (modifiable) |

Ne sont **pas** transmis : téléphones et e-mails (classés CONTACT dans B2F), numéros de permis et de carte grise. Le partenaire les reprend de ses référentiels DUT.

## 5. Transport technique (POC)

Les deux POC gardent leurs **origines séparées** (DUT `localhost:8080`, B2F `localhost:8081`) : c'est une décision de sécurité de B2F, deux applications sur la même origine partageant le même stockage.

La passerelle utilise `postMessage` entre origines :

- côté DUT, une page relais `bridge.html`, chargée par B2F dans une `iframe` invisible ;
- elle n'accepte que les messages dont `event.origin` figure dans une **liste blanche explicite** (`http://localhost:8081`) et refuse tout autre émetteur ;
- chaque message porte `v: 1` (version du protocole) et est **validé strictement** (type connu, champs attendus, longueurs bornées, dates ISO) ; tout message invalide est ignoré et compté ;
- chaque événement porte un identifiant unique : un événement reçu deux fois n'est appliqué qu'une fois (**idempotence**) ;
- le relais répond par un accusé (`ack`) envoyé à l'origine exacte de l'émetteur, jamais à `*` ;
- les événements d'une mission pas encore reliée à un DUT sont **conservés en attente** et appliqués à la création du lien.

Stockage côté DUT, à ajout seul :

- `dut_b2f_missions` : missions reçues (instantané minimal), état `reçue | reliée`, `dutId` ;
- `dut_b2f_events` : événements reçus (`id`, `appariementId`, `type`, `valeur`, `observation`, `horodatage`, `appliqué`).

### Messages

| Type | Émetteur | Contenu |
|---|---|---|
| `b2f.mission` | B2F | `appariementId`, `reference`, `donnees` (champs du §4 uniquement) |
| `b2f.event` | B2F | `id`, `appariementId`, `categorie` (`etape`/`incident`), `valeur`, `observation`, `horodatage` |
| `dut.ack` | DUT | `id` du message reçu, `statut` (`appliqué`, `en attente`, `refusé`) |
| `dut.status?` / `dut.status` | B2F / DUT | **Lot B** : statut et numéro du DUT relié à un appariement |

## 6. Règles et cas limites

- **DUT non validé quand un événement arrive** : l'événement est inscrit quand même (la réalité du terrain prime) et le dossier affiche une alerte « Étape déclarée dans la Bourse de fret alors que le DUT n'est pas validé ». C'est un signal de contrôle pour l'OIC.
- **DUT rejeté après chargement** : même alerte ; le suivi reste visible.
- **Mission annulée dans B2F avant création du DUT** : hors périmètre du lot A (B2F n'annule qu'avant validation, donc avant envoi).
- **Dossier relié** : les boutons « Marquer » et « Signaler un incident » du DUT sont remplacés par la mention « Suivi par la Bourse de fret · MR-… ». Les agents OIC gardent l'onglet Incidents & réserves pour leurs propres réserves.
- **Relais indisponible** (DUT non lancé) : B2F met les messages en file locale et les renvoie au prochain chargement ; aucune action B2F n'est bloquée en lot A.

## 7. Découpage

- **Lot A — flux B2F → DUT** : relais, liste blanche, validation, idempotence, file d'attente ; boîte de réception des missions et création du brouillon relié ; application des étapes et incidents ; mention « Suivi par la Bourse de fret ». Côté B2F : client de passerelle et émission après validation, étape et incident.
- **Lot B — retour DUT → B2F** : statut du DUT affiché sur la mission B2F, et refus de « En route » sans DUT validé.

## 8. Cible production (non construite)

API entre les deux systèmes, notifications signées (HMAC) avec identifiant unique par événement et rejeu, référentiel transporteurs commun (RCCM, carte de transport, immatriculation) en lieu et place de la correspondance par libellés, journal d'audit croisé.

## 9. Réversibilité

Aucune donnée existante n'est modifiée par la passerelle : elle ajoute deux collections côté DUT et un client de passerelle côté B2F. Pour la retirer : supprimer `bridge.html`, le client B2F et les deux collections ; chaque POC redevient autonome.
