# Journal des modifications — DUT-OIC (POC)

## 13 octobre 2026 — Démarches des acteurs (lots d0 à d5) et intégration

Fusion, sur la branche `travail/demarches`, des six lots de démarches documentés en annexe dans `docs/lots/`,
puis intégration de l'ensemble.

### Lots fusionnés

- **d0 — Listes de choix** : recherche intégrée à toutes les listes déroulantes (`js/core/searchable-select.js`).
- **d1 — Comptes et acteurs** : activation, mot de passe oublié, profil, messagerie simulée unique, partenaires,
  transporteurs, véhicules, import, habilitations, groupements.
- **d2 — Réseau, numéros et caisse** : antennes, sites, stock de numéros, vente de plages aux transporteurs,
  encaissements, rapport des ventes, rapprochement ; nouveau rôle « Caisse et comptabilité OIC » (`caisse@demo.oic.ci`).
- **d3 — Cycle de vie du DUT** : transporteur éditeur et règlement par référence, facture détaillée, transbordement,
  guichet, contrôle et archivage, annulation, référentiels cloisonnés, recherche par conducteur.
- **d4 — Exploitation** : incidents, lenteurs, remontées du terrain, équipements, échanges avec les partenaires.
- **d5 — Pilotage** : suivi des antennes, objectifs, actions correctives, agents, documents, réunions, contrats ;
  nouveau rôle « Direction générale et pilotage » (`direction@demo.oic.ci`).

### Intégration

- Corrections de fusion : tracés d'icônes déclarés par plusieurs lots dédoublonnés (`archive`, `arrowLeftRight`,
  `wallet`, `messageSquare`, `send`, `history`, `fileCheck`) ; test du lot d1 adapté à la saisie au guichet du lot d3
  (la séparation saisie / validation de l'agent d'antenne s'applique document par document).
- Messagerie unique branchée sur les lots d2 à d5 (`js/services/notifications.service.js`) : incidents, remontées,
  échanges partenaires, ventes de plages, encaissements, demandes de plages, suspension et annulation de DUT,
  contrats d'objectifs, actions correctives, documents, contrats juridiques, convocations. Envois simulés.
- Transporteurs et partenaires suspendus, résiliés ou non validés exclus des référentiels de saisie, du guichet et
  de la vente de plages ; véhicule retiré de la flotte exclu de la saisie.
- Stock du transporteur : la plus petite référence disponible est consommée en premier, toutes plages confondues ;
  parcours vente au guichet → validation → « Mes références » → règlement → validation testé de bout en bout.
- Rôle Direction : lecture nationale des incidents (droit `incidents.read`), des lenteurs, des remontées, des
  équipements (`equipment.read`), des ventes et du rapprochement ; la justification d'un écart devient un droit
  distinct (`reconciliation.justify`) ; une route peut accepter plusieurs droits.
- Validation et rejet d'un DUT : droit et ressort de l'antenne vérifiés par le service (et plus seulement par l'écran).
- Tableau de bord d'antenne complété (« Synthèse de l'antenne ») et nouveau tableau de bord de la Direction générale
  (`#/direction/tableau-de-bord`, page d'accueil du rôle), alimentés par `js/services/synthesis.service.js`.
- Menus : entrées Exploitation et Recettes pour la Direction, « Actions correctives » et « Indicateurs » pour
  l'Admin OIC, « Découvrir » et « Mon compte » en fin de menu, libellés en double supprimés.
- Habilitations : libellés lisibles pour tous les droits ajoutés ; les nouvelles décisions (validation de ventes,
  d'encaissements, d'objectifs, de documents, de contrats) ne peuvent pas être confiées à un rôle externe.
- Tests : `tests/integration-lots.test.mjs` (amorçage complet, messagerie, suspension, stock de bout en bout,
  droits de la Direction, agrégations des tableaux de bord).
