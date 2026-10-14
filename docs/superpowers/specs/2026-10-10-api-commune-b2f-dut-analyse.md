# API commune Bourse de fret (B2F) ↔ DUT — analyse préalable à l'implémentation

Date : 2026-10-10 · Statut : analyse · Complète : [passerelle-b2f-dut-design](2026-10-10-passerelle-b2f-dut-design.md)

Fondée sur le code des deux POC (DUT : `js/core/constants.js`, `js/services/*`, `js/seed.js` ; B2F : `js/domain/schema.js`, `roles.js`, `permissions.js`, `enums.js`, `js/services/*`, `js/seed.js`). Rien n'est construit ici : ce document liste ce que la plateforme réelle devra prévoir.

## 1. Ce que les deux plateformes décrivent en double

Chaque ligne est un référentiel à **unifier** : sans clé commune, la passerelle du POC rapproche par libellés, ce qui ne tient pas en production.

| Objet | DUT (POC) | B2F (POC) | Clé commune proposée |
|---|---|---|---|
| Transporteur | `dut_transporters` : nom, `registre` (RCCM), contact, adresse | `groupement` (type transporteur) : raison sociale, `rccm`, carte transporteur, localité, contacts | **RCCM** + numéro de carte transporteur |
| Donneur d'ordre | Partenaire DUT (commissionnaire, chargeur) ; expéditeur / destinataire saisis | `groupement` affréteur (et auxiliaires) | RCCM |
| Véhicule | `dut_vehicles` : immatriculation, carte grise, PTAC, carte de transport, mise en circulation, capacité | `vehicule` : immatriculation (unique), carte de transport (numéro + **échéance**), capacité, PTAC, carrosserie, essieux, pays d'immatriculation | **Immatriculation + pays** |
| Conducteur | `dut_drivers` : nom, prénoms, permis, date de délivrance, pièce d'identité | `chauffeur` : nom, permis (numéro + **échéance**), téléphone | **Numéro de permis** (+ pays) |
| Marchandise | Types en libellés (`dut_merchandise_types`) | Produits en **code SH à 6 chiffres** (`sh-1801` cacao…) | **Code SH** (nomenclature douanière) |
| Emballage | Libellés (`dut_packaging_types`) | `sac`, `vrac`, `palette`, `conteneur` | Liste de codes commune |
| Localités | Villes en **texte libre** dans le trajet | Codes (`loc-abidjan`, `loc-bouake`…) | **Code localité** officiel (liste OIC / INS) |
| Corridor | Calculé (origine → destination) | Corridor d'offre (départ / arrivée) | Paire de codes localité |

**Conséquence majeure** : la future plateforme doit porter un **référentiel partagé** (transporteurs, véhicules, conducteurs, localités, produits SH) servi aux deux applications, plutôt que deux référentiels synchronisés.

## 2. Ce que B2F peut nourrir dans le DUT

| Donnée B2F | Usage côté DUT | Statut |
|---|---|---|
| Mission validée (corridor, dates prévues, marchandise, poids, transporteur, véhicule, chauffeur, affréteur) | Préremplir le brouillon de DUT, le relier à la mission | **POC lot A** |
| Étapes du transport (`valide → a_quai → charge → en_route → livre → cloture`) | Suivi déclaré du DUT, frise, planning, statistiques logistiques | **POC lot A** |
| Incidents (`panne`, `retard`, `barrage`, `litige_chargement`) | Incidents & réserves du DUT, centre d'actions, statistiques de sinistralité | **POC lot A** |
| Échéances carte de transport et permis | Alerte à la saisie et au contrôle d'un DUT (document en cours de validité) | À prévoir |
| Lignes de marchandise en code SH (poids, volume, colis) | Marchandises du DUT structurées, statistiques par produit | À prévoir |
| Capacité / PTAC du véhicule engagé | Contrôle de surcharge déjà présent dans les statistiques DUT | À prévoir |

## 3. Ce que le DUT peut nourrir dans B2F

| Donnée DUT | Usage côté B2F | Statut |
|---|---|---|
| Statut du DUT relié (terminé, **validé**, rejeté, suspendu, retiré) et numéro officiel | Affichage sur la mission ; **refus de « en route » sans DUT validé** | Lot B |
| Révocations (liste de révocation, DUT retirés ou suspendus) | Blocage de la poursuite du transport, alerte à l'affréteur | Lot B |
| Contrôles routiers (date, poste, verdict, mode en ligne / hors ligne) | Visibilité pour l'affréteur : « camion contrôlé au poste X à 10 h 12 » | À prévoir |
| Refus au contrôle, dérogations | Incident B2F automatique sur le transport | À prévoir |
| Postes de contrôle et antennes | Localisation des points de passage sur la carte B2F | À prévoir |
| DUT expirés jamais contrôlés, corridors sans contrôle | Indicateurs de risque partagés pour l'OIC et la DGTTC | À prévoir |

## 4. Ce qui ne doit jamais passer d'une plateforme à l'autre

- **Finances B2F** (classification `FINANCIER` : frais de mise en relation, soldes, opérations, abonnements) : aucun usage côté DUT.
- **Coordonnées B2F** (classification `CONTACT` : téléphones, e-mails, observations) : B2F ne les sert qu'après validation ; le DUT n'en a pas besoin. Le POC les écarte déjà à l'envoi et à la réception.
- **Facturation DUT** (prix du transport, TVA, timbre) et **valeur déclarée** des marchandises : secret commercial, inutile à B2F.
- **Jetons QR et clés de signature** du DUT : jamais exposés ; B2F interroge un statut, il ne vérifie pas lui-même un QR.

Principe : chaque champ transmis a une **classification déclarée** (le schéma B2F en a déjà : `PUBLIC`, `IDENTITE`, `CONTACT`, `FINANCIER`) et l'API refuse un champ non classé.

## 5. Identités, rôles, habilitations

| Acteur | DUT | B2F | À trancher |
|---|---|---|---|
| OIC (administration) | `OIC_ADMIN` | `concessionnaire` | Compte unique OIC sur les deux |
| Transporteur | `TRANSPORTEUR` (portail lecture + suivi) | `transporteur`, `transporteur_prive`, `transporteur_etranger`, `auxiliaire_transporteur` | Même identité, mêmes droits de suivi |
| Donneur d'ordre | `PARTNER_ADMIN`, `PARTNER_EDITOR` | `affreteur`, `auxiliaire_affreteur` | Un affréteur B2F est-il un partenaire DUT ? |
| Agent de terrain | `CONTROLLER` (scan), `ANTENNA_AGENT` (relecture) | — | — |
| Tutelle | — | `dgttc` (lecture, ni finances ni coordonnées) | Accès DGTTC aux DUT ? |
| Lecture DUT | — | `partenaire` (flotte + DUT), `dut_transport` (lecture DUT, portée totale) | Rôles B2F à mapper sur les droits DUT |

Recommandation : **un fournisseur d'identité commun** (OpenID Connect) émettant l'identité, l'organisation (RCCM) et les rôles ; chaque plateforme garde ses propres habilitations fines.

## 6. API commune : surface proposée

### Ressources (REST, versionnées `/v1`)

| Ressource | Propriétaire | Opérations |
|---|---|---|
| `referentiels/transporteurs`, `vehicules`, `conducteurs`, `localites`, `produits`, `emballages` | Référentiel partagé | Lecture ; écriture par le propriétaire de la donnée |
| `missions` | B2F | Création à la validation ; lecture par le DUT |
| `missions/{id}/evenements` | B2F | Ajout seul (étapes, incidents) ; lecture |
| `duts?mission={id}` | DUT | Lecture du DUT relié (statut, numéro) |
| `duts/{numero}/statut` | DUT | Lecture du statut courant ; utilisé par B2F avant « en route » |
| `controles?dut={numero}` | DUT | Lecture des contrôles d'un DUT |

### Événements (notifications sortantes)

`mission.validee`, `transport.etape`, `transport.incident`, `transport.cloture` (B2F) ; `dut.cree`, `dut.valide`, `dut.rejete`, `dut.suspendu`, `dut.retire`, `dut.controle` (DUT).

Chaque événement : identifiant unique, horodatage, version de schéma, référence de mission et de DUT, charge utile minimale.

### Exigences de sécurité

- Authentification entre systèmes par **OAuth 2.0 client credentials** et TLS mutuel ; aucun secret dans le code.
- Notifications **signées (HMAC)**, horodatées, avec fenêtre anti-rejeu et **clé d'idempotence** ; rejeu possible après panne.
- Validation stricte des schémas en entrée (types, longueurs, énumérations), refus des champs inconnus ou non classés.
- Journal d'audit croisé : chaque événement reçu porte la référence de l'événement émis.
- Minimisation des données personnelles (conducteurs, contacts) et durée de conservation définie, conformément à la loi ivoirienne n° 2013-450 sur la protection des données à caractère personnel (autorité : ARTCI).
- Limitation de débit et supervision des échecs de livraison.

## 7. Du POC à la production

| Sujet | POC (aujourd'hui) | Production |
|---|---|---|
| Transport des messages | `postMessage` vers une page relais, iframe invisible | API REST + notifications signées |
| Contrôle de l'émetteur | Liste blanche d'origines | OAuth 2.0 + TLS mutuel + signature |
| Idempotence | Identifiant d'événement, doublons ignorés | Clé d'idempotence côté API |
| File en cas de panne | File dans les préférences B2F, renvoi au chargement | File de messages persistante, reprises avec délai croissant |
| Rapprochement des acteurs | Libellés (raison sociale, immatriculation) | Référentiel partagé (RCCM, immatriculation, permis) |
| Localités, produits | Texte libre (DUT), codes (B2F) | Codes officiels communs |
| Statut DUT pour B2F | Non (lot B) | `duts/{numero}/statut` + événements |

## 8. Questions à trancher avec le client

1. **Qui crée le DUT d'une mission B2F** : l'affréteur (en tant que partenaire DUT), le transporteur, ou un commissionnaire désigné ?
2. Un affréteur ou un transporteur B2F doit-il avoir **automatiquement un compte DUT** (et inversement) ?
3. Le **circuit de validation par antenne** du DUT est une amélioration proposée par le POC (le système réel s'auto-valide sur plage de numéros) : s'applique-t-il aux DUT issus de B2F ?
4. Faut-il **bloquer** « en route » sans DUT validé (règle forte) ou seulement **alerter** ?
5. La **DGTTC** doit-elle voir les DUT et les contrôles, comme elle voit les transports B2F ?
6. Quelle **liste officielle** de localités et quelle nomenclature produits retenir (SH à 6 chiffres) ?
7. Les **transports hors B2F** déclarés dans le DUT doivent-ils remonter dans B2F (statistiques de marché) ?
