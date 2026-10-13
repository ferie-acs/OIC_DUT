# Lot d3 — Cycle de vie du DUT et contrôle (plateforme DUT)

## Écrans ajoutés ou modifiés

| Route | Rôle(s) | Entrée de menu | Objet |
|---|---|---|---|
| `#/transporteur/references` | Transporteur | Documents › Mes références | Stock de références, références utilisées et retirées, bouton « Nouveau DUT » |
| `#/dut/new/:step` (existant) | + Transporteur, + Agent d'antenne | Documents › Nouveau DUT (transporteur) | Assistant adapté à l'éditeur : transporteur imposé, fiches actives du périmètre, facture détaillée, localités, mention de sous-traitance |
| `#/antenna/guichet` | Agent d'antenne | Guichet › Saisie au guichet | Saisie d'un DUT pour un usager (partenaire ou transporteur), liste des saisies de l'antenne |
| `#/antenna/archives` | Agent d'antenne | Guichet › Contrôle et archives | DUT édités à contrôler, archivage, archives par période |
| `#/oic/archives` | Admin OIC | Archives › Archives des antennes | Archives de toutes les antennes, filtre par période et antenne |
| `#/control/conducteur` | Agent de contrôle | Onglet « Recherche par conducteur » | Recherche d'un DUT par nom, pièce d'identité ou permis |
| `#/control/historique` | Agent de contrôle | Onglet « Mes contrôles » | Historique des scans et recherches de l'agent, par période |
| `#/dut/:id` (existant) | selon droits | — | Boutons « Régler et soumettre », « Transborder », « Contrôler et archiver », « Annuler le DUT » ; rubriques Facturation détaillée, Édition/règlement/archivage, Transbordements |
| `#/partner/referentials` (existant) | Partenaire | Ressources › Référentiels | Onglet Localités, colonne État, Désactiver / Réactiver / Retirer / Historique, cloisonnement |

Aucun nouveau rôle. Permissions ajoutées (bloc « Lot d3 » de `js/core/permissions.js`) :
`dut.transship` (partenaires, transporteur), `dut.create`, `dut.edit_draft`, `dut.pay_reference`, `references.view`, `dut.print` (transporteur),
`dut.create`, `dut.edit_draft`, `dut.counter`, `dut.pay_reference`, `dut.withdraw`, `dut.archive`, `archives.view`, `dut.print` (agent d'antenne),
`archives.view` (admin OIC), `control.driver_search`, `control.history` (agent de contrôle).

## Règles métier

**Brouillon verrouillé (faille de la mise à jour générique).** `saveDraft` n'accepte plus que les rubriques de saisie
(`general`, parties, marchandises, facture, trajet, annexes) : statut, numéro, QR, partenaire ou antenne ne passent jamais par elle.
Seul l'éditeur du dossier peut la faire (partenaire de l'entreprise, transporteur éditeur, agent de l'antenne du guichet), et seulement
en statut « En édition ». Un DUT validé, suspendu ou retiré ne se modifie plus : il peut seulement être annulé, suspendu ou transbordé.
`submit`, `reopenForCorrection` vérifient aussi l'éditeur ; `suspend`, `unsuspend`, `withdraw` vérifient le droit et, pour l'antenne,
le ressort. La suspension exige désormais un motif côté service. Le dépôt (`updateDut`) reste générique : il est interne et sert aux
jeux d'essai existants ; la protection est portée par les services, seule voie depuis les vues.

**Transporteur.** Il crée le DUT de son propre transport (son nom est imposé, ses véhicules et conducteurs seulement). Il ne peut pas
le soumettre sans l'avoir réglé : « Régler et soumettre » consomme la plus petite référence disponible de son stock (débit simulé,
affiché comme tel), choisit l'antenne qui validera, puis soumet. À la validation, le numéro du DUT est la référence réglée : aucune
autre référence ni plage partenaire n'est consommée. Passerelle Bourse de Fret inchangée (`b2f-link.service.js`, test vert).

**Facturation et sous-traitance** (`js/services/dut-billing.service.js`, module pur). Par côté : lignes, total HT, TVA au taux du côté
arrondie au franc, sous-total TTC, droit de timbre, total. Contrôles : montants non négatifs, TVA entre 0 et 100 %, facture
obligatoire (total HT > 0), timbres ≥ 100 FCFA, donneur d'ordre obligatoire en sous-traitance. Mention : compte propre, compte
d'autrui (expéditeur), sous-traitance pour le compte du donneur d'ordre. Le reçu de la fiche utilise les mêmes calculs arrondis.

**Transbordement** (DUT validé ; partenaire éditeur ou transporteur en charge). Nouveau transporteur, véhicule (de ce transporteur)
et conducteur (pièce et permis obligatoires), parmi les fiches actives du périmètre ; lieu, pays, date et heure de prise en charge
(pas avant la validation, pas plus de 24 h à l'avance) ; motif. Effets : nouveau jeton et nouvelle charge QR signée avec la nouvelle
plaque (nouveau document), ancien jeton conservé dans `replacedTokens` et refusé au contrôle (« Document remplacé… », ROUGE ; présent
dans la liste de révocation hors ligne), historique avant/après dans `transbordements`, audit. Le numéro du DUT ne change pas. Un
transporteur remplacé garde l'accès au DUT.

**Annulation** (complète `dut.withdraw`, pas de doublon). Admin OIC ou agent de l'antenne du DUT ; DUT validé ou suspendu ; motif
obligatoire ; auteur, rôle, date et motif enregistrés et journalisés. **Règle du numéro : retiré, jamais rendu.** Le numéro figure déjà
sur un papier imprimé et dans un QR signé ; le remettre en circulation permettrait deux documents sous le même numéro. Il est tracé
dans `retiredReferences` de l'opération (plage ou stock) et ne revient pas dans le stock.

**Guichet de l'antenne.** L'agent identifie l'usager (partenaire habilité, ou transporteur disposant d'un stock) et le déposant (nom,
pièce obligatoires), puis saisit le DUT. Partenaire : numéro pris sur sa plage à la validation. Transporteur : réglé au guichet avec son
stock. **L'agent qui a saisi un DUT ne peut pas le valider** (règle générale ajoutée dans `validate`) : un second agent valide.

**Contrôle et archivage.** Sur un DUT édité (numéroté) de son antenne, l'agent coche les quatre points de contrôle, indique le
résultat (conforme / avec réserves, observations obligatoires dans ce cas) et le classement ; une cote `ARC-<ANT>-<année>-<n°>` est
attribuée. Une archive ne se modifie pas et un DUT ne s'archive qu'une fois. Consultation par période (date d'archivage).

**Référentiels.** Transporteurs, véhicules, conducteurs : cloisonnés par partenaire propriétaire (`ownerPartnerId`) ; le transporteur
ne voit que sa fiche, sa flotte et ses conducteurs. Désactivation (réversible) et retrait (définitif, motif obligatoire) : historique
conservé, fiche plus proposée à la saisie ; une fiche devenue inactive bloque la soumission. Tiers, marchandises, emballages,
localités : partagés, désactivables et réactivables. Chaque changement est journalisé.

**Contrôle sur route.** Recherche limitée aux DUT édités (validés, suspendus, retirés), hors DUT piège : nom (3 lettres min., sans
accents ni casse), pièce ou permis (numéro complet, sans espaces ni tirets). Les conducteurs remplacés par transbordement sont
retrouvés et signalés comme n'étant plus en charge. Chaque recherche est journalisée (`dut_control_searches_v1` + audit) ; l'agent voit
l'historique de ses scans et recherches.

## Comptes de démonstration (mot de passe `demo123`)

Existants : `partner.admin@`, `antenne.agent@`, `oic.admin@`, `controle.agent@`, `transporteur@demo.oic.ci`.
Ajouté par `js/seed-lot-d3.js` : `antenne.agent2@demo.oic.ci` (Brou Adjoua, même antenne d'Abidjan), pour la validation par une
seconde personne. L'amorçage ajoute aussi : propriétaires des fiches (SAHEL TRANS EXPRESS chez TRANSCARGO, le reste chez STFA), un
véhicule et un conducteur pour IVOIRE LOGISTIQUE SA, dix localités, un stock de 20 références pour ABC TRANSPORT CI
(`OP-T-<année>-00031`, numéros 5000 à 5019), les pièces d'identité des conducteurs sur les DUT historiques.

## Parcours de démonstration

1. `transporteur@` › Mes références (20 disponibles) › Nouveau DUT › assistant (transporteur imposé) › Récapitulatif › « Régler et
   soumettre » : référence proposée, choisir l'antenne Abidjan › le DUT passe « Terminé ».
2. `antenne.agent2@` › tableau de bord › ouvrir le DUT › Valider : le numéro est la référence réglée.
3. `transporteur@` › le DUT › Transborder : véhicule CI-5567-YZ, conducteur OUATTARA, lieu, motif › rubrique Transbordements.
4. `controle.agent@` › Recherche par conducteur › permis `CI-PL-004521` : le DUT apparaît avec « n'est plus en charge » ; Mes contrôles.
5. `antenne.agent@` › Saisie au guichet › usager STFA DEMO, déposant › saisir › soumettre ; tenter de valider : refusé ; valider avec `antenne.agent2@`.
6. `antenne.agent@` › Contrôle et archives › « Contrôler et archiver » › archives du mois ; sur un DUT validé : « Annuler le DUT » (motif).
7. `partner.admin@` › Référentiels › Véhicules : désactiver, réactiver, retirer, historique ; onglet Localités ; assistant étape 4.
8. `oic.admin@` › Archives des antennes.

## Fichiers

Nouveaux : `js/services/dut-lifecycle.service.js`, `dut-billing.service.js`, `road-control.service.js`,
`js/repositories/archives.repository.js`, `control-searches.repository.js`, `js/views/dut-lifecycle.view.js`,
`antenna-counter.view.js`, `antenna-archives.view.js`, `transporter-references.view.js`, `control-driver.view.js`,
`js/seed-lot-d3.js`, `css/lot-d3.css`, `tests/lot-d3.test.mjs`.
Partagés modifiés (blocs « Lot d3 ») : `js/core/constants.js`, `permissions.js`, `layout.js`, `icons.js` (archive, arrowLeftRight,
wallet, ban, history, userSearch, rotateCcw, tracés Lucide 0.468.0), `js/app.js`, `index.html`, `precache.json` (régénéré),
`js/repositories/dut.repository.js`, `operations.repository.js`, `referentials.repository.js`.
Modifiés dans leur logique : `js/services/dut.service.js`, `referentials.service.js` (réécrit, même interface), `insights.service.js`
(visibilité après transbordement), `revocation.service.js`, `verification.service.js`, `control.service.js`,
`js/views/dut-detail.view.js`, `dut-form.view.js`, `referentials.view.js`, `control.view.js` (onglets).

## Limites assumées

- **Espace chauffeur : non réalisé.** Sans nouveau rôle, un conducteur ne peut pas s'authentifier ; un accès anonyme par numéro de
  permis et de pièce exposerait des données commerciales à quiconque détient une copie du DUT (ces numéros y sont imprimés). Le
  conducteur dispose déjà du document et de son QR. À traiter avec un rôle dédié et une authentification propre.
- Paiement : débit simulé d'un stock déjà acheté ; l'achat de références par le transporteur relève du lot d2 (le stock d'essai est
  une opération portant `transporterId`, sans `partnerId`).
- Références consommées dans l'ordre (plus petite disponible), comme l'application en service le propose.
- Le PDF du nouveau document après transbordement reprend les données à jour ; l'historique est sur la fiche, pas sur le PDF.
- L'annulation n'est pas ouverte à l'éditeur (partenaire, transporteur) : décision réservée à l'OIC et à l'antenne.
- Dans les tableaux larges, le défilement horizontal reste interne au tableau (comportement existant), jamais sur la page.
