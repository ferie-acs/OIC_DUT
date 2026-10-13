# Lot d2 : antennes, sites, plages de numéros, rapprochement et caisse (DUT)

## Écrans ajoutés

| Route | Rôle(s) | Entrée de menu | Objet |
|---|---|---|---|
| `#/oic/reseau/antennes` | Admin OIC | Réseau › Gestion des antennes | Liste des antennes (statut, encadrement, comptes, sites, stock), recherche, filtre par statut |
| `#/oic/reseau/antennes/nouvelle` | Admin OIC | bouton « Nouvelle antenne » | Création : nom, code, ville, zone, adresse, position (carte Leaflet ou saisie), horaires, contacts |
| `#/oic/reseau/antennes/:id` | Admin OIC | ligne de la liste ; bouton « Modifier » de la fiche de supervision | Fiche complète modifiable (nom, ville, position compris), encadrement, comptes, statut (désactiver, réactiver, fermer) |
| `#/reseau/sites` | Admin OIC (gestion), agent d'antenne (sites de son antenne) | Réseau › Sites ; Ressources › Sites de l'antenne | Référentiel des sites sur carte et liste, création, modification, désactivation |
| `#/oic/plages/:tab` (`stock`, `transferts`, `parametres`) | Admin OIC | Ressources › Stock et transferts | Stock par état, approvisionnement des antennes, transferts, validation, reprise, tarifs et quantités |
| `#/antenna/stock` | Agent d'antenne | Ressources › Stock de numéros | Stock de l'antenne et vente au guichet à un transporteur |
| `#/caisse/paiements` | Caisse, Admin OIC, agent d'antenne (ses encaissements) | Caisse › Encaissements ; Ressources › Encaissements | Créances, encaissement (guichet ou paiement simulé), validation ou rejet par une autre personne, frais DUT à l'unité, export CSV |
| `#/caisse/ventes` | Caisse, Admin OIC | Caisse › Ventes de références | Rapport HT, TVA, timbre, TTC par période, client et antenne ; regroupement ; export CSV |
| `#/rapprochement` | Caisse, Admin OIC, partenaire administrateur (son entreprise) | Caisse › Rapprochement ; Ressources › Rapprochement | Numéros achetés, DUT édités, préimprimés, paiements, écarts justifiables |
| `#/partner/operations` (existant) | Partenaire administrateur | Ressources › Opérations & plages | + Modifier / Annuler une demande en attente, Payer en ligne (simulé) |
| `#/oic/antennas` (existant) | tous les rôles ayant la carte | — | + bouton « Afficher les sites » (couche des sites sur la carte) |

## Rôle « Caisse et comptabilité OIC »

`ROLES.CASHIER`, libellé « Caisse et comptabilité OIC », compte `caisse@demo.oic.ci` (mot de passe de démonstration commun),
page d'accueil `#/caisse/paiements`, menu propre (Caisse : Encaissements, Ventes de références, Rapprochement). Droits :
`payments.view`, `payments.record`, `payments.validate`, `payments.desk`, `sales.report`, `reconciliation.view`. Aucun accès aux DUT
ni à l'administration.

Nouveaux droits (bloc « Lot d2 » de `js/core/permissions.js`) : `antennas.manage`, `sites.view`, `sites.manage`, `ranges.stock`,
`ranges.allocate`, `ranges.transfer`, `ranges.validate`, `ranges.revoke`, `ranges.settings`, `reconciliation.view`, `payments.*`,
`sales.report`. Les services contrôlent ces droits ; les vues ne font que masquer les boutons.

## Règles métier

**Antennes.** Nom unique (sans tenir compte des accents ni de la casse), code unique (2 à 12 caractères), ville et position
obligatoires, position contrôlée dans l'emprise de la Côte d'Ivoire, zone déduite de la position si elle n'est pas choisie. Un
renommage est répercuté sur les comptes et partenaires rattachés ; une antenne de la liste officielle renommée garde son nom
d'origine (`directoryName`) pour que la synchronisation de l'annuaire ne la duplique pas (les 23 antennes et `antennas.test.mjs`
restent valides). Chef et adjoint sont choisis parmi les comptes actifs d'agent de l'antenne (deux personnes distinctes) ; un
compte d'agent s'ouvre depuis la fiche (mot de passe initial affiché une seule fois) ou un agent existant y est rattaché.
**Désactivation** (motif, date d'effet) : plus d'approvisionnement ni de vente ; réversible. **Fermeture** (motif, date) refusée tant
que restent des agents rattachés, du stock non repris, des ventes en attente de validation, des DUT à valider ou des sites actifs ;
la fiche propose « Réaffecter les agents » et « Reprendre le stock ». Une antenne fermée n'apparaît plus sur la carte et n'est plus
modifiable ; son historique de statut est conservé.

**Sites.** Types : port, poste frontière, gare, zone industrielle, parc à camions, autre. Code unique, antenne de rattachement
ouverte, position en Côte d'Ivoire. Désactivation motivée. L'agent d'antenne consulte les sites de son antenne. Les positions de
démonstration sont indicatives (mention à l'écran).

**Plages de numéros.**
- L'OIC approvisionne une antenne d'une plage nouvelle (`AF-…`, collection `dut_range_stock_v1`) commençant après le plus grand
  numéro déjà attribué (plages des partenaires, stocks d'antenne, DUT numérotés) : aucun chevauchement. L'attribution d'une demande
  de partenaire applique la même règle (`nextFreeStart`).
- **Transfert vers un transporteur (vente au guichet).** L'agent choisit un transporteur actif, un bloc continu de son stock
  (premier numéro disponible proposé) et saisit le numéro du reçu (obligatoire). Émise par l'antenne, la vente est « Transfert à
  valider » et ne fournit aucune référence ; l'encaissement est enregistré « Encaissé, à valider ». Émise par l'OIC, elle est validée
  d'office et la créance est « À encaisser ». Un transfert est validé ou refusé (motif) par l'OIC, jamais par la personne qui l'a
  saisi. Refus : numéros rendus au stock, encaissement annulé.
- **Reprise** (OIC, motif obligatoire) d'une plage validée de partenaire ou de transporteur : les numéros non utilisés reviennent
  au stock de l'antenne d'origine (si celui-ci est actif) ou sont retirés ; les numéros utilisés restent attachés aux DUT. Une plage
  reprise ou en attente ne fournit plus de numéro (`peekNextNumber` / `consumeNextNumber`). Les dossiers d'un partenaire en attente
  sont rattachés à une autre plage active ; un DUT déjà réglé par un transporteur garde sa référence. Reprise d'un stock d'antenne :
  les numéros non vendus sont retirés.
- **Stock par état** : en attente, disponibles, utilisés, retirés (national, par antenne, par partenaire ou par transporteur).
- **Paramétrage** : prix unitaire HT, taux de TVA, droit de timbre (par vente), quantité proposée d'une demande, dotation d'une
  antenne. Les montants sont figés sur chaque vente. Le tarif d'une demande vient des paramètres (le champ n'est plus modifiable).
- **Demandes des partenaires** : l'administrateur du partenaire modifie la quantité ou annule (motif) une demande encore en
  attente de son entreprise.

**Forme de l'opération de transfert (coordination avec le lot d3).** La vente crée, dans `dut_operations`, une opération de la
même forme que le stock de références lu par le lot d3 : `transporterId`, `transporterName`, `ownerType: 'TRANSPORTEUR'`, `year`,
`rangeStart`, `rangeEnd`, `quantity`, `used`, `tarifUnitaire`, `status`, `retiredReferences: []`, **sans `partnerId`**
(`partnerName` porte le nom du transporteur pour l'affichage, comme dans l'amorçage du lot d3). Champs propres au lot d2 :
`kind: 'TRANSFER'`, `code` (`TR-…`), `antennaId`, `antennaName`, `stockId`, `receiptNo`, `amounts`, `requestedBy(Id)`, `decidedBy`.
Après fusion, `findActiveOperationForTransporter` du lot d3 retrouve ces plages dès leur validation et le transporteur règle ses
DUT avec elles ; une plage en attente ou reprise n'est pas proposée (statut différent de `VALIDATED`).

**Caisse.** Chaque plage attribuée ou vendue crée une créance (`dut_payments_v1`) : HT, TVA, timbre, TTC. Encaissement au guichet
(reçu obligatoire) ou paiement mobile money / carte **simulé** (référence de transaction fictive `SIM-…`, mention à l'écran) ; le
partenaire peut payer en ligne (simulé) ses propres créances. Validation ou rejet (motif) par une **autre personne** que celle qui a
saisi ; un rejet remet la créance « à encaisser » et reste dans l'historique. Frais DUT à l'unité : DUT numérotés d'un partenaire, non
encore réglés, encaissés au guichet puis validés. **Rapport des ventes** : plages validées sur la période, filtres client
(partenaire ou transporteur) et antenne, regroupement par client, antenne ou jour, totaux cohérents (TTC = HT + TVA + timbre),
part encaissée et validée, export CSV.

**Rapprochement** (partenaire et période) : numéros achetés, DUT édités, préimprimés consommés (impressions enregistrées),
montant dû, paiements encaissés et validés. Écarts : plage non réglée, paiement à valider, compteur de plage différent des DUT
retrouvés, DUT hors des plages du partenaire, DUT sur numéros non réglés, réimpressions, paiement sans plage. Chaque écart se
justifie (texte conservé et journalisé). Le partenaire ne voit que son entreprise.

Toutes les actions qui changent un état sont journalisées (21 nouvelles actions d'audit, bloc « Lot d2 » de `constants.js`).

## Fonctions de service pour les tableaux de bord d'antenne

- `ranges.service.js` : `antennaStock(antennaId)`, `antennaStockSummary(antennaId)` (disponibles, en attente, vendus, prochain
  numéro, stock par état), `stockByState({ antennaId | partnerId | transporterId })`, `nationalStock()`, `listTransfers()`.
- `payments.service.js` : `antennaSalesSummary(antennaId, { from, to })` (ventes, quantités, HT, TVA, timbre, TTC, ventes par jour,
  encaissements à valider ou à encaisser), `salesReport(filtre)`, `summarize(liste)`.

## Comptes de démonstration (amorçage `js/seed-lot-d2.js`, idempotent)

- `caisse@demo.oic.ci` (Akissi Brou, Caisse et comptabilité OIC).
- `agent.bouake@demo.oic.ci` (chef de l'antenne de Bouaké), `agent.yopougon@demo.oic.ci`, `agent2.siege@demo.oic.ci`.
- Existants : `oic.admin@`, `antenne.agent@` (Abidjan siège), `partner.admin@` (STFA DEMO).

Données : codes `OIC-001…` des antennes ; stocks `AF-<année>-00101` (Abidjan siège, 500) et `AF-<année>-00102` (Bouaké, 300) ;
ventes à ABC TRANSPORT CI (`TR-<année>-00201`, validée et payée) et à IVOIRE LOGISTIQUE SA (`TR-<année>-00202`, à valider) ;
créances des plages historiques (STFA réglée, TRANSCARGO à encaisser) ; une demande STFA en attente ; frais DUT encaissés à Bouaké à
valider ; onze sites (ports d'Abidjan et de San-Pédro, postes de Noé, Pogo, Ouangolodougou, gares, zones industrielles, parcs).

## Parcours de démonstration

1. `antenne.agent@` › Ressources › Stock de numéros › « Vendre une plage » : transporteur ABC TRANSPORT CI, quantité 10, reçu
   `RC-TEST-01` › la vente est « Transfert à valider ».
2. `oic.admin@` › Ressources › Stock et transferts › onglet Transferts › « Valider le transfert » (ou Refuser avec motif). Onglet Stock
   par état : stock national et par antenne, « Reprendre » une plage ; onglet Tarifs et quantités : modifier le prix ou la TVA.
3. `caisse@` › Encaissements › « Valider » l'encaissement saisi par l'agent ; « Encaisser » la créance TRANSCARGO au guichet puis
   la faire valider par `oic.admin@` (la caisse ne peut pas valider sa propre saisie) › Ventes de références › filtres, Export CSV.
4. `partner.admin@` › Opérations & plages › « Modifier » puis « Annuler la demande » OP-…-00230 › Rapprochement : écarts et
   « Justifier ».
5. `oic.admin@` › Réseau › Gestion des antennes › « Nouvelle antenne » (position choisie sur la carte) › fiche : « Ouvrir un
   compte », désigner le chef, « Désactiver » puis « Réactiver » ; sur BOUAKE, « Fermer » est refusé tant que les agents, le stock
   et les sites ne sont pas réaffectés ou repris. Réseau › Sites › « Nouveau site » ; Carte des antennes › « Afficher les sites ».

## Fichiers partagés modifiés (blocs « Lot d2 »)

`index.html` (feuille `css/lot-d2.css`), `js/app.js` (routes, amorçage), `js/core/constants.js`, `js/core/permissions.js`,
`js/core/layout.js` (menus), `js/core/icons.js` (tracés Lucide 0.468.0), `js/seed.js` (compte de démonstration),
`js/views/login.view.js`, `js/views/admin.view.js` (mission du rôle), `js/data/antennas.js`, `js/services/directory.service.js`,
`js/services/operations.service.js`, `js/repositories/operations.repository.js`, `js/repositories/partners.repository.js`,
`js/views/operations.view.js`, `js/views/antennas-map.view.js`, `js/views/supervision.view.js`, `precache.json` (régénéré).

## Limites assumées

- Paiements simulés (aucune API) ; le droit de timbre (100 F par vente) et le taux de TVA (18 %) sont des valeurs de démonstration
  à confirmer par la comptabilité OIC.
- Le transporteur voit et utilise son stock de références par l'écran « Mes références » du lot d3 (après fusion) ; ce lot ne crée
  pas d'écran transporteur. Les partenaires habilités obtiennent leurs plages par demande à l'OIC, pas au guichet.
- Préimprimés : une impression enregistrée d'un DUT vaut un préimprimé consommé ; le stock physique des papiers n'est pas géré.
- Le rapprochement signale tels quels les écarts des données de démonstration historiques (DUT de STFA numérotés hors de sa plage).
- Aucun courriel n'est envoyé (ouverture de compte, validation d'un transfert) : le mot de passe initial est affiché une fois.
- Les positions des sites sont indicatives ; la carte nécessite le fond OpenStreetMap (sinon saisie de la latitude et de la longitude).
- Dans les tableaux larges, le défilement horizontal reste interne au tableau (comportement existant), jamais sur la page.
