# Sécuriser la délivrance et l'utilisation du DUT — méthodologie à 360°

**Date** : 2026-10-09
**Statut** : synthèse d'une table ronde à cinq voix (architecte, SRE, chef de projet, QA adversarial, red team), tranchée par l'architecte de référence. Aucune décision ci-dessous n'est figée : plusieurs dépendent de données terrain qui n'existent pas encore (§ 10).
**Périmètre** : le Document Unique de Transport de l'Office Ivoirien des Chargeurs — de l'allocation des plages de numéros jusqu'au contrôle au bord de la route.

---

## 1. Le principe qui commande tout

**Un papier est toujours copiable.** Aucun filigrane, aucun hologramme, aucune empreinte imprimée ne rend un document infalsifiable. La sécurité ne vient pas du papier ; elle vient de ce que **la vérification soit plus facile que la fraude** et qu'elle **fasse autorité**. Tout se conçoit depuis le geste de contrôle au bord de la route, pas depuis l'impression.

Deuxième principe, apporté par le red team et qui borne tout le reste : **l'authenticité n'est pas la véracité.** Un partenaire légitime peut émettre un vrai DUT, parfaitement signé, pour une marchandise, un poids ou une destination faux. Toute la cryptographie confirmera alors que la fraude vient bien de lui. Ce dispositif sécurise *le document* ; il ne sécurise pas *ce qu'il déclare*. Fermer ce trou exige une source indépendante (douane, pesée, manifeste), hors du périmètre présent.

## 2. Ce que le dispositif réel impose

Aujourd'hui, l'OIC n'exerce **aucun contrôle sur le DUT individuel**. Les numéros sont alloués par plages ; le partenaire s'auto-délivre en consommant son stock ; le seul contrôle humain porte sur la demande de plage. Conséquence : le contrôle d'émission est **en amont** (allocation), la détection de fraude est **en aval** (terrain, statistiques), et il n'y a rien entre les deux. Le POC propose d'y insérer une validation par antenne — la table ronde l'écarte en mode systématique (§ 4.2).

## 3. Modèle de menace consolidé

Classé par probabilité × impact, après croisement des cinq voix.

| # | Scénario | Qui | P × I | Ce qui l'arrête |
|---|---|---|---|---|
| 1 | **Fausse déclaration dans un vrai DUT** | partenaire légitime | élevée × élevé | rien dans ce périmètre (§ 1) |
| 2 | **L'agent ne scanne pas**, ou scanne un vrai DUT et laisse passer un autre camion | agent de terrain, éventuellement soudoyé | élevée × élevé | croisement contrôles déclarés / scans / postes tenus ; photo de plaque sur échantillon (§ 6.2) |
| 3 | **La dérogation devient le chemin normal** — ou l'outil de racket | agent + transporteur | élevée × moyen | dérogation tracée, plafonnée, revue a posteriori |
| 4 | **Dérive opérationnelle** : cérémonie de clés reportée, ancrage jamais comparé, liste de révocation vieillissante | l'organisation elle-même | quasi certaine à 18 mois × latent | propriétaires nommés, dates, budget (§ 8) |
| 5 | **QR photographié, rejoué sur un second voyage** | transporteur | élevée × fort | fenêtre de validité courte, liaison plaque, cohérence de trajet, DUT canaris |
| 6 | **Entités écran** : N sociétés sous le plafond individuel | bénéficiaire effectif unique | moyenne × fort | plafond consolidé par bénéficiaire effectif (§ 6.3) |
| 7 | **Vol ou prêt d'un terminal enrôlé** | agent | moyenne × fort | déverrouillage nominatif par agent, révocation du terminal, signature liée à l'agent et non au seul appareil |
| 8 | **Course entre deux contrôleurs hors ligne** | transporteur | moyenne × fort | détection à la synchronisation, orange jamais vert hors ligne |
| 9 | **Collusion antenne-partenaire sur les plages** | initié | faible × très fort | quatre yeux en base, plafond sur historique, revue des ratios |
| 10 | **Initié DSI** : admin Keycloak, DBA, exploitant | initié technique | faible à moyenne × critique | séparation des pouvoirs, alertes reçues hors équipe admin, journal ancré hors OIC |
| 11 | **Fuite de la clé d'émission** | attaquant externe ou initié | faible × critique | HSM, rotation, révocation datée — **mais le parc papier déjà imprimé ne peut pas être re-signé** |
| 12 | **App de contrôle modifiée** : clé publique remplacée sur téléphone rooté, supply chain de l'app | attaquant outillé | faible × fort | attestation d'appareil, version minimale imposée, chaîne de publication protégée |
| 13 | **La vérification publique comme oracle** : confirmer un faux, domaines sosies | faussaire | moyenne × moyen | vérification par uuid seulement, jamais par numéro ; statut seul ; limitation de débit ; DUT canaris |
| 14 | **Révocation de masse comme arme** contre un concurrent | admin compromis | faible × fort | double validation sur toute révocation par plage ou par partenaire |

## 4. Les décisions tranchées

Chaque décision indique le désaccord qu'il y a eu et la raison du choix.

### 4.1 Format du QR : signé dès la phase 2, hors ligne activé en phase 3 sur données

**Le désaccord.** L'architecte et le SRE voulaient l'hybride (charge signée + jeton opaque) dès le départ. Le chef de projet voulait un jeton opaque en phase 2 et arbitrer le hors-ligne en phase 3, une fois la couverture réseau mesurée.

**Le choix.** Le calendrier du chef de projet, le format de l'architecte. Deux formats de QR qui coexistent ouvrent une attaque par rétrogradation (présenter l'ancien format, moins vérifié). On signe donc **dès la phase 2**, mais la **vérification hors ligne n'est activée qu'en phase 3**, quand on sait combien de temps un agent reste sans réseau.

**Le contenu du QR** (COSE/CWT, environ 200 octets) : version, identifiant de clé, uuid opaque, numéro de DUT, immatriculation du tracteur et de la remorque, fenêtre de validité. **Aucune donnée commerciale** — la plaque est déjà visible sur le camion, la mettre dans le QR ne fait rien fuiter. En ligne, l'uuid interroge le statut réel, qui fait toujours foi. Hors ligne, on vérifie la signature et la liste de révocation.

**La signature** est apposée par le serveur OIC à la consommation du numéro. **Jamais de clé chez un partenaire.** Prérequis absolu : plus aucune émission hors plateforme ne reste légale — si un seul canal papier subsiste, l'attaquant le choisit et le contrôleur doit l'accepter.

**Le PAdES est distinct** : il donne la valeur probante au PDF ; le QR sert au contrôle. L'empreinte SHA-256 « illustrative » du POC doit soit devenir une vraie signature, soit cesser d'être présentée comme une preuve.

### 4.2 Validation : par seuil de risque et par aléa, jamais par antenne systématique

**Le désaccord.** Le POC et l'architecte inscrivent la validation par antenne. Le chef de projet et la QA la refusent en mode obligatoire : goulot à 23 antennes face à un fret qui roule la nuit, péage informel au guichet, contournement — et surtout, **le contrôleur devient le contrôlé** en cas de collusion antenne-partenaire.

**Le choix.** Parcours automatique par défaut. Validation manuelle sur critères de risque : nouveau partenaire, consommation anormale, marchandise sensible, partenaire déjà sanctionné. **Plus une part d'aléa non déterministe** — le red team a raison : un seuil confidentiel seul est de la sécurité par l'obscurité, les partenaires le retrouveront en observant les refus. Délai maximal au-delà duquel le DUT est accordé et tracé « non revu ».

### 4.3 Unicité d'usage : pas de consommation au premier contrôle

**Le désaccord.** Le fil initial et le chef de projet (phase 3) prévoyaient de « consommer » le DUT au premier contrôle. La QA l'a démonté : cela **déplace la fraude vers le DUT jamais contrôlé** — majoritaire si le taux de contrôle est faible — et crée des faux positifs à chaque double contrôle légitime.

**Le choix.** On ne consomme pas. On vérifie un **nombre plafonné de contrôles** et la **cohérence du trajet** (deux contrôles incompatibles avec la distance et le temps = voyage impossible). La fenêtre de validité reste courte, et sa durée est **gouvernée** — le red team note qu'aucune position ne prévoyait qui a le droit de l'allonger sous pression commerciale.

### 4.4 Hors ligne : orange au-delà de 24 h, puis plus de contrôle opposable

**Le désaccord.** Le SRE posait un SLO de fraîcheur à 24 h et une alerte à 72 h — 48 h de mode dégradé silencieux. L'architecte posait « orange, jamais vert hors ligne » ; le red team objecte que là où le réseau manque, l'orange devient la norme et vaut vert de fait.

**Le choix.** Au-delà de 24 h sans synchronisation : orange, avec l'âge de la liste affiché en clair. Au-delà d'un **âge maximal fixé sur les mesures de couverture réseau** (aucun chiffre avant les données), l'application **refuse de produire un contrôle opposable**. Ce seuil est la seule façon d'empêcher que l'orange devienne le vert.

Le hors ligne est aussi la vraie défense contre le déni de service : si l'API de vérification tombe, le contrôle continue avec « signature valide, révocation à jour il y a X heures ». Chemin de lecture séparé du chemin d'écriture.

### 4.5 Journal : chaîné, complet, ancré hors OIC, vérifié par quelqu'un d'extérieur

**Le point que trois voix avaient manqué.** Un journal chaîné prouve qu'on n'a pas modifié ce qui a été écrit ; il **ne prouve pas que tout a été écrit**. L'omission en amont passe. La complétude vient du **compteur atomique par plage** : tout numéro consommé est un événement, et un trou se voit.

**Le choix.** Chaînage par hachage, racine de Merkle horaire, **ancrage croisé** : horodatage RFC 3161 par un tiers *et* envoi quotidien à une institution hors OIC (publication sur le site OIC seule = insuffisant, c'est sous contrôle OIC). Rôle applicatif **sans `UPDATE` ni `DELETE`** sur le journal. Et le point du red team : le « vérificateur indépendant » doit avoir un **propriétaire extérieur à l'OIC** et une procédure de comparaison réellement exécutée — sinon la DSI se contrôle elle-même avec ses propres outils.

**Séparation des pouvoirs** : l'administrateur de base n'a pas la clé d'audit ; le détenteur de la clé d'audit n'écrit pas en base ; le propriétaire du stockage WORM n'est ni l'un ni l'autre ; l'accès d'urgence demande deux personnes et est journalisé ; **toute action d'un admin déclenche une alerte reçue hors de l'équipe admin**.

### 4.6 Clés : HSM ou KMS, racine à quorum, cérémonie datée

Clé d'émission non exportable (HSM cluster chez l'OIC, ou KMS cloud selon l'arbitrage de souveraineté — l'hébergement tranche). Racine hors ligne gardée à quorum (par exemple 3 sur 5, dont une personne hors DSI), **cérémonie avec date, budget et détenteurs nommés** — sinon la clé logicielle « de recette » part en production et y reste. Rotation trimestrielle par identifiant de clé. Clé compromise : révocation datée, DUT postérieurs en vérification en ligne obligatoire, re-signature en base — **en sachant que le parc papier déjà sur la route garde l'ancienne signature**. La fenêtre de validité courte est la seule borne de cette exposition.

### 4.7 Invariants : garantis par la base, pas par l'application

| Invariant | Mécanisme |
|---|---|
| Les plages ne se chevauchent pas | contrainte `EXCLUDE` sur intervalles |
| Quatre yeux sur l'allocation | contrainte demandeur ≠ approbateur, rôles distincts |
| Un numéro est unique et appartient à sa plage | `UNIQUE` + clé étrangère + vérification des bornes |
| Monotonie sans trou silencieux | compteur atomique par plage ; un numéro annulé reste, statut « annulé » |
| Transitions de statut légales | machine à états en base |
| Pas de doublon sur rejeu | clé d'idempotence par émission |
| Journal en ajout seul | rôle applicatif `INSERT` uniquement |
| Révocation de masse à double validation | contrainte sur toute révocation par plage ou partenaire |

## 5. Contrôles organisationnels — ce qui pèse plus que la cryptographie

Le chef de projet a raison sur le fond : **la fraude passe d'abord par l'organisation**.

- Double validation des plages : l'antenne instruit, le siège approuve. Plafond calculé sur l'historique de consommation. Aucune auto-approbation.
- Comptes nominatifs, double authentification, responsabilité contractuelle du titulaire de la plage, alerte sur connexions simultanées.
- **Le scan est la seule preuve du contrôle** : un contrôle sans scan n'existe pas. Rapprochement entre scans et postes tenus.
- Séparation entre administration des comptes et allocation. Journal consulté par une fonction indépendante (audit interne).
- Rotation des agents, contrôles aléatoires a posteriori par un tiers — faisabilité suspendue aux effectifs, inconnus.
- Pas de prime au signalement : elle crée des faux positifs et du racket.
- **Le transporteur peut vérifier son propre DUT** — contre l'extorsion « ton QR ne passe pas ». Mais le red team ajoute la contrepartie : l'agent ne doit jamais accepter une capture d'écran du transporteur à la place de son propre scan, et les domaines sosies deviennent une surface.

## 6. Trois mesures qu'aucune des quatre voix n'avait proposées

1. **DUT canaris.** L'OIC émet des DUT pièges, jamais présentables légitimement. Un scan terrain ou une vérification publique de l'un d'eux révèle une chaîne compromise, un oracle exploité, ou un agent qui valide sans regarder.
2. **Preuve physique signée sur échantillon.** Sur une part aléatoire des contrôles, l'application exige une photo de la plaque, horodatée et signée par le terminal, prise au déverrouillage nominatif de l'agent. Rapprochée a posteriori, elle rend détectable le « scan d'un vrai, passage d'un autre ».
3. **Plafond consolidé par bénéficiaire effectif.** On relie les partenaires par identifiants légaux, dirigeants, adresses, comptes bancaires, appareils et adresses de connexion. Plafonds et revues portent sur le groupe, pas sur l'entité.

## 7. Comment on prouve que ça marche

- **Invariants en base** testés et surveillés en production.
- **Tests de propriétés** sur l'allocation : séquences aléatoires d'allocation, consommation, révocation, réallocation, sous accès concurrents ; bornes (plage vide, dernier numéro, débordement).
- **Chaos hors ligne** : coupures aléatoires, liste de révocation obsolète, horloge décalée de plusieurs jours, synchronisation interrompue, double synchronisation (idempotence attendue), même DUT scanné par K terminaux déconnectés puis fusion.
- **Jeu de données d'attaque** : QR photocopiés et recadrés, URI modifiées, épreuves au filigrane masqué, DUT révoqués, expirés, de plage révoquée, motifs vides ou répétés, Unicode dans les champs.
- **Red team terrain non annoncé** : faux DUT et DUT rejoués injectés dans des convois réels ; taux d'interception par poste et par agent. **C'est la seule preuve que le contrôle humain mord.** Obligatoire avant toute généralisation.
- **Journal** : altération volontaire d'une ligne en test, vérification que l'alerte part ; vérification périodique de l'ancrage externe.
- **Métriques de production** : taux de scan réel par agent rapporté aux passages estimés ; délai de propagation d'une révocation jusqu'au dernier terminal ; âge de la liste par terminal ; doublons détectés à la synchronisation ; distribution des rangs de réimpression par partenaire ; ratio plage allouée / DUT contrôlés ; taux de scans hors ligne ; **taux de « refus puis levée » par motif** — un dispositif qui bloque des honnêtes pousse les agents à le contourner.

## 8. Lignes rouges consolidées — pas de production sans

1. Clé d'émission non exportable (HSM ou KMS), racine à quorum, **cérémonie datée et tenue**, procédure écrite et testée de compromission de clé.
2. Quatre yeux sur l'allocation des plages, **appliqué en base**.
3. Journal chaîné avec compteur atomique, **ancré hors OIC**, vérifié chaque jour par un **propriétaire extérieur à l'OIC**.
4. Rôle applicatif sans `UPDATE` ni `DELETE` sur le journal.
5. QR sans aucune donnée commerciale ; vérification publique par uuid seulement, statut seul, débit limité.
6. Âge maximal de la liste de révocation **appliqué et affiché** ; au-delà, aucun contrôle opposable.
7. Heure de confiance côté serveur pour toute décision de validité ; l'horloge et le GPS du terminal ne font pas foi.
8. Terminaux enrôlés, révocables, **déverrouillage nominatif par agent** ; attestation d'appareil et version minimale imposée.
9. Double validation sur toute révocation par plage ou par partenaire.
10. Restauration testée et chronométrée, **et les révocations rejouées depuis le journal ancré** — une restauration ne fait jamais réapparaître un DUT révoqué.
11. Alertes sur les actions admin, reçues hors de l'équipe admin.
12. Écran de contrôle sans ambiguïté pour épreuve, suspendu, retiré.
13. Parcours de dérogation tracée, plafonné, revu a posteriori.
14. **Sponsor à la direction générale** portant la séparation des tâches et les sanctions.
15. **Avis juridique sur la valeur probante** avant de supprimer le papier.
16. **Engagement écrit de l'acteur qui scanne au bord de la route.**
17. Au moins un red team terrain non annoncé avant généralisation.
18. Audit par un expert sécurité indépendant et pentest réussis. Aucun des contributeurs ne déclare sûr son propre design.

## 9. Trajectoire en trois phases

**Phase 1 — maîtriser l'émission, sans toucher le terrain.**
Double validation des plages, comptes nominatifs avec double authentification, journal protégé et ancré, registre central de chaque DUT émis, détection des anomalies de consommation, plafond consolidé par bénéficiaire effectif.
*Laisse ouvert* : le faux papier, la réutilisation, l'absence de contrôle routier.
*Signal de passage* : le registre central contient bien tous les DUT, et les anomalies sont traitées.

**Phase 2 — rendre le DUT vérifiable.**
QR **signé** (format cible, vérification en ligne seulement), statuts, vérification ouverte au transporteur, pilote de contrôle sur un ou deux corridors avec une seule force partenaire, validation par seuil et aléa, DUT canaris, **mesure de la couverture réseau et du taux de contrôle réel**.
*Laisse ouvert* : les zones sans réseau, le double usage simultané.
*Signal de passage* : taux de scan et zones blanches mesurés ; convention signée avec la force de contrôle.

**Phase 3 — le dispositif cible.**
Vérification hors ligne avec âge maximal fixé sur les données de la phase 2, cohérence de trajet, photo de plaque sur échantillon, signature à valeur juridique confirmée, généralisation aux 23 antennes.
*Laisse ouvert* : la collusion contrôleur-fraudeur (contrôle interne), la véracité des déclarations (hors périmètre).
*Signal de passage* : aucun — amélioration continue.

## 10. Les questions au terrain qui tranchent tout

Dédupliquées des cinq voix. Sans leurs réponses, plusieurs décisions ci-dessus restent provisoires.

1. **Qui demande le DUT au bord de la route aujourd'hui** — agents OIC, gendarmerie, douane ? Combien de fois par trajet ? Qu'en fait-il : lecture visuelle, saisie, rien ? *Tranche : l'app de contrôle, la convention, la formation, et la ligne rouge n° 16.*
2. **Quelle part des points de contrôle n'a aucun réseau, et pendant combien de temps au maximum ?** *Tranche : l'âge maximal de la liste de révocation, le seuil du mode dégradé, l'activation du hors ligne.*
3. **Les agents ont-ils un terminal fourni et géré, ou leur téléphone personnel ?** *Tranche : tout le modèle de confiance du terminal. Avec des téléphones personnels, attestation, Keystore et révocation s'effondrent.*
4. **Quelle proportion des DUT est réellement contrôlée au moins une fois, et en combien de points ?** *Tranche : si elle est faible, la détection terrain est marginale et tout l'effort doit porter sur l'émission.*
5. **Combien de DUT par jour et par antenne, et combien de temps un transporteur peut-il attendre ?** *Tranche : la validation par seuil, le dimensionnement, HSM contre KMS.*
6. **Un DUT peut-il légitimement couvrir plusieurs véhicules ou trajets** — transbordement, changement de tracteur, groupage ? *Tranche : la liaison à la plaque, qui produirait des faux positifs en masse si oui.*
7. **Sur les fraudes déjà constatées, par où sont-elles passées** — allocation, faux document, réutilisation, prêt de compte ? *Tranche : l'hypothèse centrale que la fraude est d'abord organisationnelle.*
8. **L'hébergement doit-il légalement rester sur le territoire ?** *Tranche : HSM contre KMS cloud.*
9. **Reste-t-il un canal d'émission hors plateforme ?** *Tranche : si oui, la signature ne prouve rien.*

## 11. Ce qu'il faut demander à un juriste ivoirien — sans rien présumer

1. Quel texte fonde le DUT, et impose-t-il un support papier ? Un DUT dématérialisé ou un QR imprimé a-t-il la même force probante ?
2. Quel niveau de signature électronique est reconnu ? Faut-il un prestataire de certification agréé ? Une signature PAdES par l'OIC suffit-elle ?
3. Existe-t-il un statut d'horodatage qualifié ? Quelle valeur a un horodatage RFC 3161 d'un tiers ?
4. Quel régime ARTCI s'applique aux données des conducteurs et transporteurs ? Une analyse d'impact est-elle requise ?
5. Sur quelle base légale partager avec gendarmerie et douane ? Faut-il une convention ?
6. Comment protéger le secret commercial vis-à-vis des contrôleurs tiers ?
7. Quelles durées de conservation (DUT, journaux, preuves de contrôle) ?
8. Les DUT de transit relèvent-ils d'obligations régionales ?
9. Le journal d'audit est-il recevable comme preuve en cas de litige ou de sanction ?
10. L'OIC peut-elle juridiquement opposer un statut au bord de la route ?

## 12. Hypothèses non dites qui font tout tenir

Si l'une est fausse, la partie correspondante s'effondre.

- Terminaux fournis et gérés par l'OIC (→ tout le volet terminal).
- Aucune émission hors plateforme ne reste légale (→ toute la signature).
- Un taux de contrôle significatif (→ toute la détection terrain).
- L'OIC peut opposer un statut au bord de la route (→ la valeur du contrôle).
- Une équipe disponible pour la liste de révocation, le HSM et les alertes hors équipe admin — personne ne l'a nommée ni budgétée.
- Un référentiel d'immatriculations fiable (→ la liaison à la plaque).

## 13. Risques résiduels assumés

Ce qui reste ouvert quoi qu'on fasse, à inscrire dans le registre des risques et non à cacher :

1. La fausse déclaration dans un vrai DUT — hors périmètre, exige une source indépendante.
2. La collusion de l'agent de terrain — détectable a posteriori, partiellement.
3. La dérogation comme chemin normal ou outil de racket — contenue, pas fermée.
4. La dérive opérationnelle à 18 mois — la mesure la plus probable de toutes, et la moins technique.
5. Le clone d'un DUT valide avec fausse plaque pendant sa fenêtre — borné par la fenêtre.
6. L'initié DSI — réduit par la séparation des pouvoirs, jamais nul.
7. La fuite de clé face au parc papier — irréductible, bornée par la fenêtre de validité.

---

*Contributions : architecte technique, SRE, chef de projet, QA adversarial, red team. Arbitrages : architecte de référence. Aucun chiffre réglementaire ni budgétaire n'a été inventé ; les ordres de grandeur sont signalés comme tels.*
