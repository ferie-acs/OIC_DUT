# Script d’enregistrement — voix off de la vidéo DUT

> Fichier généré par `scripts/build-explainer-subtitles.mjs`. Ne pas éditer à la main.

## Comment enregistrer

1. Enregistrez **un fichier par segment**, nommé exactement comme la colonne « Fichier ».
2. Déposez-les dans `audio/explainer/` (format `.m4a`, AAC).
3. Lancez : `node --experimental-default-type=module scripts/tts.mjs --measure-only`
4. Relancez ce générateur, puis l’export vidéo. L’animation se recale seule.

La **durée visée** est indicative : une prise plus longue étire la scène
(aucune voix n’est jamais coupée), une prise plus courte laisse du silence.
Un écart de plus de 20 % est signalé par le script de mesure.

## Chapitre 1 — Le problème et le DUT

| Fichier | Durée visée | Texte à dire |
|---|---|---|
| `1.2.m4a` | 12 s | Chaque jour, des marchandises quittent le port d’Abidjan pour rejoindre l’intérieur du pays, ou franchir une frontière. |
| `1.3.m4a` | 10 s | Chacun de ces transports doit être accompagné d’un document. Ce document, c’est le Document Unique de Transport : le DUT. |
| `1.4.m4a` | 12 s | Un document sur papier ne porte pas la preuve de sa propre authenticité. Au bord de la route, rien ne permet de trancher entre l’original et une copie. |
| `1.5.m4a` | 12 s | Trois garanties sont donc attendues : qu’un DUT soit authentifiable, que son parcours soit tracé, et que l’ensemble devienne une statistique nationale exploitable. |

## Chapitre 2 — Le parcours, acteur par acteur

| Fichier | Durée visée | Texte à dire |
|---|---|---|
| `2.2.m4a` | 14 s | Tout commence chez le partenaire : un commissionnaire, un transporteur, un chargeur. Il ouvre un dossier et décrit le transport — la marchandise, le véhicule, le conducteur, l’itinéraire. |
| `2.3.m4a` | 7 s | Quand le dossier est complet, il le soumet. |
| `2.4.m4a` | 16 s | L’antenne OIC prend le relais. L’agent vérifie les pièces et la cohérence du dossier. S’il manque quelque chose, il renvoie le dossier avec un motif de rejet obligatoire — le partenaire corrige, puis soumet à nouveau. |
| `2.5.m4a` | 15 s | À la validation seulement, le dossier reçoit son numéro officiel, pris sur une plage allouée à l’antenne. Précisons-le : aujourd’hui cette vérification n’existe pas à l’OIC. C’est une amélioration proposée. |
| `2.6.m4a` | 16 s | Le DUT devient alors imprimable, recto-verso, avec son code QR. Chaque impression est enregistrée : à partir de la deuxième, un motif est exigé. |
| `2.7.m4a` | 7 s | Le transporteur prend la route, le document l’accompagne. |
| `2.8.m4a` | 7 s | Au contrôle, l’agent scanne le code QR. |
| `2.9.m4a` | 11 s | Et chaque geste — création, rejet, validation, impression, contrôle — s’inscrit dans un journal d’audit que personne ne peut modifier ni effacer. |

## Chapitre 3 — Pourquoi une copie ne passe pas

| Fichier | Durée visée | Texte à dire |
|---|---|---|
| `3.2.m4a` | 13 s | Le code QR imprimé sur un DUT ne contient aucune donnée de transport. Rien que ceci : un jeton opaque, tiré au hasard, qui ne dit rien de la marchandise ni du transporteur. |
| `3.3.m4a` | 12 s | Le scanner ne lit donc pas le document : il interroge le système. Et c’est le système qui répond. Ce qui est imprimé sur le papier n’a aucune autorité. |
| `3.4.m4a` | 9 s | Prenons une copie. Même papier, même QR, même numéro. Le scan interroge le système — et le système répond : « retiré ». |
| `3.5.m4a` | 9 s | À cela s’ajoutent les statuts qui pilotent l’impression, le rang de génération, et une empreinte du contenu. |

## Chapitre 4 — Piloter le dispositif

| Fichier | Durée visée | Texte à dire |
|---|---|---|
| `4.2.m4a` | 9 s | Côté OIC, tout part des plages de numéros : une antenne en demande, l’OIC alloue, et chaque numéro consommé est connu. |
| `4.3.m4a` | 8 s | Les DUT émis deviennent alors une statistique : volumes, délais de traitement, corridors, tonnages. |
| `4.4.m4a` | 4 s | Le réseau des antennes est cartographié. |
| `4.5.m4a` | 7 s | Et l’administration des utilisateurs et des rôles reste entre les mains de l’OIC. |
| `4.6.m4a` | 5 s | Office Ivoirien des Chargeurs. Document Unique de Transport. |

**Total : 21 segments, environ 415 mots.**
