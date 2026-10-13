# Lot d1 : comptes et acteurs

Plateforme DUT. Ce document décrit ce que le lot d1 ajoute au POC : activation et mot de passe en libre-service, messagerie sortante simulée, partenaires habilités, transporteurs, agents, back-office et habilitations. Pour les démarches marquées « Les deux », seul le côté DUT est traité.

## Démarches traitées

| Id | Acteur | Démarche | Résultat |
|---|---|---|---|
| 16 | Transporteur | Inscrire son entreprise et activer son compte | Fait |
| 18 | Transporteur | Récupérer ou changer son mot de passe | Fait |
| 19 | Transporteur | Déposer son dossier, mettre à jour sa fiche | Fait (pièces de 300 Ko au plus, conservées localement) |
| 20 | Transporteur | Créer une entité rattachée (filiale) | Fait |
| 21 | Transporteur | Gérer les utilisateurs de l'entreprise | Fait |
| 25 | Transporteur | Déclarer ses véhicules au DUT | Fait |
| 48 | Partenaire habilité | Activer son compte ou mot de passe oublié | Fait |
| 49 | Partenaire habilité | Mettre à jour sa fiche partenaire | Fait |
| 50 | Partenaire habilité | Créer et gérer ses agents éditeurs | Fait |
| 51 | Partenaire habilité | Contrôler l'activité de ses agents | Fait (signaux simples, pas de détection de fraude avancée) |
| 63 | Antenne OIC | Activer son compte ou mot de passe oublié | Fait |
| 82 | Administrateur OIC | Créer et valider un partenaire habilité | Fait |
| 83 | Administrateur OIC | Modifier, suspendre ou résilier un partenaire | Fait |
| 84 | Administrateur OIC | Créer, valider, suspendre un transporteur (et import) | Fait |
| 85 | Administrateur OIC | Gérer les comptes du back-office | Fait (création avec lien d'activation) |
| 86 | Administrateur OIC | Gérer les profils et habilitations | Fait (dans une limite sûre) |
| 87 | Administrateur OIC | Gérer les groupements inscrits | Fait (liste, états, export ; actions depuis les fiches) |
| 97 | Administrateur OIC | Envoyer notifications, e-mails et SMS | Fait (simulés) |

## Écrans ajoutés

| Route | Écran | Droit | Rôles | Entrée de menu |
|---|---|---|---|---|
| `/activation`, `/activation/:code` | Premier accès : adresse, code, mot de passe choisi | public | tous | lien « Activer mon compte » (connexion) |
| `/mot-de-passe-oublie` | Demande de code puis nouveau mot de passe | public | tous | lien « Mot de passe oublié ? » |
| `/boite-de-reception`, `/boite-de-reception/:address` | Boîte de réception simulée (démonstration) | public | — | liens des écrans publics |
| `/inscription-transporteur` | Inscription en ligne d'une entreprise de transport, pièces jointes | public | — | « Transporteur : inscrire mon entreprise » |
| `/mon-profil` | Nom, téléphone, changement de mot de passe | connecté | tous | Mon compte › Mon profil |
| `/mes-messages` | Courriels et SMS adressés à l'utilisateur | connecté | tous | Mon compte › Mes messages |
| `/entreprise` | Fiche de l'entreprise ; pour le transporteur : dossier, pièces, entités rattachées | `company.profile` | Partenaire admin, transporteur | Mon entreprise › Fiche |
| `/entreprise/utilisateurs` | Agents / utilisateurs de l'entreprise | `company.users` | Partenaire admin, administrateur du compte transporteur | Mon entreprise › Agents (ou Utilisateurs) |
| `/entreprise/activite` | Activité des agents par période, signaux | `company.activity` | Partenaire admin | Mon entreprise › Activité des agents |
| `/entreprise/vehicules` | Flotte, déclarations, échéances | `fleet.declare` | Transporteur | Mon entreprise › Véhicules |
| `/oic/acteurs/partenaires[/:id]` | Liste, création, fiche, validation, modification, suspension, réactivation, résiliation, export | `partners.manage` (décisions : `actors.validate`) | Administrateur OIC | Acteurs › Partenaires habilités |
| `/oic/acteurs/transporteurs[/:id]` | Liste, création, dossier, examen des pièces, suspension, export | `partners.manage` (décisions : `actors.validate`) | Administrateur OIC | Acteurs › Transporteurs |
| `/oic/acteurs/demandes` | Inscriptions, partenaires en attente, modifications de fiches, déclarations de véhicules | idem | Administrateur OIC | Acteurs › Demandes à valider |
| `/oic/acteurs/import` | Import CSV de transporteurs et véhicules : analyse, rapport, confirmation | idem | Administrateur OIC | Acteurs › Import de l'existant |
| `/admin/habilitations` | Matrice rôle × droit paramétrable | `admin.manage` (modification : `habilitations.manage`) | Administrateur OIC | Administration › Habilitations |
| `/admin/groupements` | Partenaires, transporteurs, demandes, antennes, avec état et export CSV | `admin.manage` | Administrateur OIC | Administration › Groupements |
| `/admin/messages` | Journal des messages sortants (codes masqués) | `messages.journal` | Administrateur OIC | Administration › Messages envoyés |

Les trois derniers écrans sont des onglets de l'administration existante (`js/views/admin.view.js`), pas une seconde administration. L'onglet « Utilisateurs » existant propose désormais la création avec lien d'activation (case cochée par défaut) et « Renvoyer l'activation » pour un compte non activé. Aucun nouveau rôle n'est créé ; l'administrateur d'un compte transporteur est un compte `TRANSPORTEUR` marqué `companyAdmin`.

## Règles métier

**Activation.** Un compte créé par l'OIC, un partenaire ou à la validation d'un groupement n'a aucun mot de passe : il reçoit un code d'activation (10 caractères, haché, valable 72 h, 5 essais, usage unique) à son adresse enregistrée. Tant qu'il n'est pas activé, il ne peut pas se connecter, même avec le mot de passe de démonstration.

**Mot de passe oublié** (règle stricte de `commun.md`, les deux failles de l'application en service ne sont pas reproduites) : le code part toujours à l'adresse enregistrée sur le compte, jamais à une adresse saisie ; la demande ne bloque pas le compte (l'ancien mot de passe reste valable jusqu'au choix du nouveau) ; code à 6 chiffres, haché, valable 15 minutes, 5 essais, usage unique ; une seule demande par minute ; réponse identique que le compte existe ou non ; alerte SMS au téléphone enregistré. Un mot de passe défini ferme les sessions ouvertes ailleurs.

**Mon profil.** Nom et téléphone modifiables ; l'adresse e-mail reste gérée par l'administrateur. Le changement de mot de passe exige l'ancien et ferme les autres sessions.

**Messagerie unique.** `js/services/messaging.service.js` est le seul point d'envoi de l'application DUT. Les autres modules appellent :

```js
import { envoyer } from './messaging.service.js';
envoyer({ canal: 'EMAIL', destinataire: userId, objet: 'Incident attribué', corps: 'Bonjour…', origine: 'Incidents' });
```

`canal` : `EMAIL` ou `SMS`. `destinataire` : identifiant ou objet compte (le message part alors à l'adresse ou au téléphone enregistré du compte) ou adresse brute. `origine` : module émetteur, affiché dans le journal. Options : `code` (remplace `{{code}}`, masqué dans le journal), `lien`, `nature`, `entite`. Renvoie `null` si le destinataire n'est pas joignable par ce canal. Les points marqués « Après fusion avec le lot d1 » dans le lot d4 (`incidents.service.js`, `field-reports.service.js`, `partner-exchanges.service.js`) se branchent par cet appel.

**Partenaires.** Création par l'OIC à l'état « En attente ». Validation par un autre administrateur OIC que l'auteur : l'état passe réellement à « Actif », le compte administrateur du partenaire est créé une seule fois (une seconde validation est refusée), le contrôle anti-doublon d'e-mail et de RCCM exclut la fiche elle-même et compare aux autres fiches et comptes. Suspension, réactivation, résiliation et refus passent par des actions dédiées avec motif obligatoire, historique d'état dans la fiche, journal d'audit et message au partenaire ; une modification de fiche ne peut jamais changer l'état. Suspension : sessions fermées et connexion refusée ; résiliation : comptes désactivés, fiche figée.

**Fiche tenue par l'entreprise.** Téléphone, adresse, ville, responsable (et portée pour un transporteur) s'appliquent tout de suite. Raison sociale, e-mail, RCCM (et carte de transporteur) forment une demande en attente que l'OIC approuve ou refuse ; le demandeur ne peut pas la valider. Un changement d'adresse est signalé à l'ancienne et à la nouvelle adresse.

**Agents et utilisateurs.** L'administrateur ne voit et ne gère que les comptes de son entreprise : création avec lien d'activation, rôle (éditeur ou administrateur pour un partenaire ; administrateur du compte ou simple utilisateur pour un transporteur), désactivation, réinitialisation d'accès (code à l'adresse enregistrée). Il ne peut ni changer son propre rôle ni se désactiver ; l'entreprise garde au moins un administrateur actif.

**Activité des agents.** DUT créés, soumissions, validés, rejetés, taux de rejet, volume par jour, semaine ou mois. Signaux : taux de rejet d'au moins 30 %, DUT suspendus ou retirés, créations entre 20 h et 6 h, pic de plus de 8 DUT par jour, brouillons abandonnés, activité d'un compte désactivé. Ce sont des invitations à vérifier, pas des preuves.

**Transporteurs.** L'inscription en ligne crée une demande hors du référentiel : un transporteur non validé n'est jamais proposé à la saisie d'un DUT. Validation par un administrateur OIC différent de l'auteur de la saisie (l'inscription en ligne n'a pas d'auteur OIC) ; création de la fiche active et du compte administrateur, sinon rien n'est validé. Pièces : RCCM, carte de transporteur, DFE, assurance (PDF, PNG ou JPEG), examinées « conforme / non conforme » par l'OIC. Entité rattachée : reprend le RCCM, la carte et les pièces du parent, validée par l'OIC.

**Véhicules.** Le transporteur déclare un ajout, une mise à jour ou un retrait : immatriculation, type, carte grise, PTAC, charge utile (pas plus que le PTAC), carte de transport et échéances (carte de transport obligatoire, visite technique, assurance ; une échéance déjà passée est refusée). Le véhicule n'entre dans la flotte qu'après validation OIC par une autre personne que le déclarant. Échéances échues ou à moins de 30 jours signalées.

**Import de l'existant.** CSV (modèle téléchargeable, `;` ou `,`, 500 lignes) : une ligne par véhicule. Analyse sans enregistrement, rapport ligne par ligne téléchargeable, puis confirmation (droit de validation requis). Rejets : RCCM ou e-mail déjà utilisés, immatriculation connue ou déclarée, demande d'inscription en cours. Les transporteurs importés sont actifs et leur responsable reçoit un lien d'activation.

**Habilitations.** Matrice paramétrable avec motif et journal. Refusés par le service et ignorés même s'ils sont écrits directement dans le stockage : droit de validation, de contrôle ou d'administration donné à un rôle partenaire ou transporteur ; droit d'administration hors administrateur OIC ; cumul saisie et validation des DUT ; retrait de l'administration à l'administrateur OIC. « Rétablir les droits par défaut » annule tout.

## Comptes de démonstration

Mot de passe `demo123` pour les comptes existants (`js/seed.js`), plus :

| Compte | Rôle | Usage |
|---|---|---|
| `oic.superviseur@demo.oic.ci` | Administrateur OIC (Bamba Mariam) | Second valideur : valide ce que `oic.admin@` a saisi |
| `agent.stfa@demo.oic.ci` | Partenaire éditeur, non activé | Lien d'activation dans la boîte de réception simulée |

Données ajoutées (`js/seed-lot-d1.js`, idempotent) : états et coordonnées des partenaires et transporteurs existants ; partenaire « LOGISTIQUE DU LITTORAL » en attente (créé par `oic.admin@`) ; inscription en ligne « GBÊKÊ FRET SARL » avec une pièce ; déclaration du véhicule AB-7788-CI par ABC TRANSPORT CI ; échéances des véhicules (l'une échue, l'une proche) ; `transporteur@demo.oic.ci` administrateur de son compte.

## Parcours de démonstration

1. **Activation.** Écran de connexion › « Activer mon compte » › « Boîte de réception simulée », saisir `agent.stfa@demo.oic.ci`, « Ouvrir le lien ». Saisir l'adresse et un mot de passe (8 caractères, une lettre, un chiffre), activer, se connecter.
2. **Mot de passe oublié.** « Mot de passe oublié ? », saisir `partner.editor@demo.oic.ci`. Le code est dans la boîte de réception simulée de cette adresse ; `demo123` fonctionne toujours tant que le nouveau mot de passe n'est pas choisi.
3. **Partenaire.** `partner.admin@` › Mon entreprise › Fiche : changer le téléphone (appliqué) et la raison sociale (en attente). Agents : ajouter un agent, le désactiver, réinitialiser son accès. Activité des agents : changer la période.
4. **OIC, partenaire.** `oic.admin@` › Acteurs › Partenaires habilités › « LOGISTIQUE DU LITTORAL » : « Valider » est refusé (même auteur). Se connecter en `oic.superviseur@`, valider : état « Actif », compte administrateur à activer, message dans Administration › Messages envoyés. Suspendre puis réactiver avec motif. Approuver la modification de STFA dans « Demandes à valider ».
5. **Transporteur.** Déconnecté : « Transporteur : inscrire mon entreprise ». Puis `oic.admin@` › Demandes à valider : valider l'inscription ; le lien d'activation part à l'adresse de l'entreprise. Valider la déclaration AB-7788-CI. `transporteur@` › Mon entreprise : déposer une pièce, créer une entité rattachée, ajouter un utilisateur, déclarer un véhicule.
6. **Import.** Acteurs › Import de l'existant › « Télécharger le modèle », l'analyser, confirmer ; réimporter : tout est rejeté comme doublon.
7. **Back-office.** Administration › Habilitations (les cases verrouillées affichent leur motif au survol) ; Groupements (filtres, export CSV) ; Utilisateurs (création avec lien d'activation).

## Fichiers

- Nouveaux : `js/services/{messaging,account,partners,transporters,vehicle-declarations,company-users,agent-activity,habilitations,d1-common}.service.js`, `js/services/org-lifecycle.js`, `js/repositories/actors.repository.js`, `js/views/{account,transporter-signup,company,actors-admin,admin-d1}.view.js`, `js/views/d1-ui.js`, `js/core/access-guard.js`, `js/core/nav-lot-d1.js`, `js/routes-lot-d1.js`, `js/seed-lot-d1.js`, `css/lot-d1.css`, `tests/lot-d1.test.mjs`.
- Partagés, par blocs « Lot d1 » : `js/app.js` (une ligne : amorçage et routes), `js/core/layout.js` (menu), `js/core/permissions.js` (droits ajoutés, habilitations effectives), `js/core/constants.js` (clés, états, actions d'audit), `js/core/icons.js` (12 tracés Lucide exacts, lucide-static 0.468.0), `js/core/auth.js` (connexion refusée à un compte non activé ou à un groupement suspendu), `js/services/admin.service.js` (champs de compte conservés à la modification), `js/views/admin.view.js` (onglets, activation), `js/views/login.view.js` (liens), `index.html` (feuille `css/lot-d1.css`), `precache.json` (régénéré).
- Clés de stockage : `dut_messages_v1`, `dut_transporter_applications_v1`, `dut_vehicle_declarations_v1`, `dut_habilitations_v1`, `dut_lot_d1_seed_v1`.

## Limites assumées

- Courriels et SMS simulés : conservés localement, visibles dans « Mes messages », dans le journal OIC (codes masqués) et dans la boîte de réception simulée, page de démonstration qui n'existerait pas en production.
- Les pièces jointes sont stockées en LocalStorage (300 Ko par pièce) ; pas d'antivirus ni de stockage de fichiers.
- « Réinitialiser l'accès » de l'administration OIC existante affiche toujours un mot de passe provisoire à l'administrateur (comportement antérieur conservé, couvert par `tests/admin.test.mjs`) ; le libre-service et « Renvoyer l'activation » sont recommandés.
- Les transporteurs suspendus restent visibles dans les référentiels de saisie des DUT (lot d3) ; leur filtrage est à faire après fusion.
- Les codes sont hachés côté navigateur : protection de démonstration, pas une sécurité serveur.
