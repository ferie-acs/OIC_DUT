# Transcription — vidéo explicative DUT

> Fichier généré par `scripts/build-explainer-subtitles.mjs`. Ne pas éditer à la main :
> modifier `js/data/storyboard.js` puis relancer le générateur.
## Chapitre 1 — Le problème et le DUT

Chaque jour, des marchandises quittent le port d’Abidjan pour rejoindre l’intérieur du pays, ou franchir une frontière.

Chacun de ces transports doit être accompagné d’un document. Ce document, c’est le Document Unique de Transport : le DUT.

Mais un document sur papier ne porte pas la preuve de sa propre authenticité. Sans référence unique et vérifiable, rien ne permet de trancher au bord de la route entre l’original et une copie. Et personne, au niveau national, ne voit circuler l’ensemble.

Trois garanties sont donc attendues : qu’un DUT soit authentifiable, que son parcours soit tracé, et que l’ensemble devienne une statistique nationale exploitable.

## Chapitre 2 — Le parcours, acteur par acteur

Tout commence chez le partenaire : un commissionnaire, un transporteur, un chargeur. Il ouvre un dossier et décrit le transport — la marchandise, le véhicule, le conducteur, l’itinéraire.

Quand le dossier est complet, il le soumet.

L’antenne OIC prend le relais. L’agent vérifie les pièces et la cohérence du dossier. S’il manque quelque chose, il renvoie le dossier avec un motif de rejet obligatoire — le partenaire corrige, puis soumet à nouveau.

À la validation, et seulement à ce moment-là, le dossier reçoit son numéro officiel, pris sur une plage allouée à l’antenne. Précisons-le franchement : dans le dispositif actuel de l’OIC, cette vérification par l’antenne n’existe pas — le partenaire consomme directement un numéro de son stock. Ce contrôle est une amélioration proposée pour le futur système.

Le DUT devient alors imprimable, recto-verso, avec son code QR. Chaque impression est enregistrée : à partir de la deuxième, un motif est exigé.

Le transporteur prend la route, le document l’accompagne.

Au contrôle, l’agent scanne le code QR.

Et chaque geste — création, rejet, validation, impression, contrôle — s’inscrit dans un journal d’audit que personne ne peut modifier ni effacer.

## Chapitre 3 — Pourquoi une copie ne passe pas

Le code QR imprimé sur un DUT ne contient aucune donnée de transport. Rien que ceci : un jeton opaque, tiré au hasard, qui ne dit rien de la marchandise ni du transporteur.

Le scanner ne lit donc pas le document : il interroge le système. Et c’est le système qui répond. Ce qui est imprimé sur le papier n’a aucune autorité.

Prenons une copie. Même papier, même QR, même numéro. Le scan interroge le système — et le système répond : « retiré ».

À cela s’ajoutent les statuts qui pilotent l’impression, le rang de génération, et une empreinte du contenu.

## Chapitre 4 — Piloter le dispositif

Côté OIC, tout part des plages de numéros : une antenne en demande, l’OIC alloue, et chaque numéro consommé est connu.

Les DUT émis deviennent alors une statistique : volumes, délais de traitement, corridors, tonnages.

Le réseau des antennes est cartographié.

Et l’administration des utilisateurs et des rôles reste entre les mains de l’OIC.

## Chapitre 5 — Du POC au système réel

Soyons clairs sur ce que vous venez de voir : une démonstration qui tourne dans un navigateur, sur des données fictives, sans serveur. Elle montre les concepts, elle ne les sécurise pas.

Le système réel, lui, reposerait sur une architecture éprouvée : Angular et NestJS, PostgreSQL avec PostGIS, Keycloak pour les identités, un stockage objet pour les pièces, et une signature électronique conforme.

Office Ivoirien des Chargeurs. Document Unique de Transport.
