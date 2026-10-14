# Lot d0 : recherche intégrée à toutes les listes de choix (plateforme DUT)

## Objet

Exigence de l'utilisateur : « toute liste de choix, quel que soit son format, doit contenir un champ de
recherche ». Le lot ajoute, sans modifier aucune vue, un champ « Rechercher… » en tête de chaque liste
déroulante de l'application, ainsi que dans la liste des comptes de démonstration de l'écran de connexion.

Aucun écran, aucune route, aucun rôle, aucun droit et aucune donnée de démonstration ne sont ajoutés.

## Fonctionnement

Amélioration progressive, globale et idempotente (`js/core/searchable-select.js`) :

- Le `<select>` natif **reste dans le DOM** : même `id`, même `name`, même `value`, mêmes événements
  `change` et `input`, même attribut `required`, même étiquette. Il est masqué visuellement
  (`opacity: 0`, retiré de l'ordre de tabulation) mais reste lu par le code des vues, par `FormData`
  et par la validation native du formulaire. Aucune vue existante ne change de logique.
- Un déclencheur (bouton, rôle ARIA `combobox`) le recouvre dans la même cellule de grille : il affiche
  le libellé choisi et un chevron Lucide du sprite local (`js/core/icons.js`). Il reprend les classes du
  select d'origine (`.select`, `.input`, `.plan-pill-select`) et hérite donc des bordures, rayons,
  typographie et anneau de focus définis par `forms.css` et la charte.
- Le panneau s'ouvre en position fixe, contenu dans l'écran (ouvert vers le haut s'il manque de place) :
  en tête, le champ de recherche (icône « search », « Rechercher… »), puis la liste filtrée (`listbox`).
- Filtrage insensible à la casse et aux accents (œ/æ, apostrophes typographiques unifiées), chaque mot
  saisi devant figurer dans le libellé ; état « Aucun résultat ». Les options désactivées restent
  visibles mais ne peuvent pas être choisies ; les `optgroup` gardent leur intitulé ; `select[multiple]`
  est géré (le panneau reste ouvert, chaque option se coche ou se décoche).
- Clavier : Flèches, Page précédente / suivante, Début / Fin, Entrée, Échap, Alt + Flèche haut,
  Tabulation ; une saisie directe sur le déclencheur ouvre la liste déjà filtrée. Le focus revient au
  déclencheur à la fermeture. Fermeture au clic extérieur.
- Synchronisation : valeur posée par programme (`select.value`, `selectedIndex`), options ajoutées ou
  retirées et attribut `disabled` (MutationObserver), réinitialisation du formulaire.
- Application automatique : l'import posé à l'amorçage (`js/app.js`, une ligne) installe un observateur
  du document ; tout `<select>` inséré (pages, modales, filtres) est amélioré une seule fois. Une liste
  retirée du document libère son panneau et ses observateurs. Un conteneur portant
  `data-native-select` est exclu (échappatoire, non utilisée à ce jour).
- Toute donnée insérée dans du HTML (libellés d'options, de groupes, nom de la liste) est échappée avec
  `escapeHtml` (`js/core/utils.js`).

Les champs `input` + `datalist` du formulaire DUT (transporteur, véhicule, conducteur, tiers,
marchandise) offrent déjà une saisie filtrante : ils ne sont pas transformés. Les captures confirment
qu'ils gardent la même hauteur, la même bordure et le même rayon que les listes améliorées.

## Fichiers

| Fichier | Nature |
| --- | --- |
| `js/core/searchable-select.js` | Nouveau module (fonctions pures de filtrage exportées + composant + observateur). |
| `css/lot-d0.css` | Nouveau fichier de style (variables existantes uniquement), chargé par `index.html`. |
| `js/app.js` | Une ligne d'import (bloc commenté « Lot d0 »). |
| `index.html` | Une ligne `<link>` vers `css/lot-d0.css`. |
| `precache.json` | Régénéré par `node tools/pwa/precache.mjs`. |
| `tests/lot-d0.test.mjs` | Nouveau test. |

## Écrans concernés (sans modification de leur code)

Statistiques (filtres en pilule), planning (pilules Départ / Arrivée / Transporteur), tableaux de bord
(sélecteur de période), administration (filtre par rôle, modale utilisateur : rôle et rattachement),
référentiels (modale de fiche), formulaire DUT (compte, type de transport), fiche DUT, espace dossier,
contrôle, indicateurs, comparateur, actions du transporteur, connexion (comptes de démonstration).

## Parcours de démonstration

1. Se connecter avec `oic.admin@demo.oic.ci` (mot de passe de démonstration habituel). À l'écran de
   connexion, ouvrir « Choisir un compte de démonstration » et saisir « controle » : seul le compte
   « Agent Contrôle » reste affiché.
2. Ouvrir « Statistiques », cliquer sur le filtre « Antenne », saisir « bouake » : « BOUAKE » s'affiche ;
   saisir « zzzz » : « Aucun résultat ». Entrée choisit, Échap ferme sans rien changer.
3. Ouvrir « Administration » > « Utilisateurs », filtrer par rôle en saisissant « contro », puis
   « Ajouter un utilisateur » : les listes « Rôle » et « Rattachement » de la modale ont le même champ.
4. Se connecter avec `partner.admin@demo.oic.ci`, « Référentiels » > « Tiers » > « Ajouter » : la liste
   « Type » est filtrable.
5. Avec `partner.editor@demo.oic.ci`, « Nouveau DUT » : listes « Compte » et « Type de transport ».

## Tests

`node tests/lot-d0.test.mjs` : filtrage (casse, accents, apostrophes, mots dans le désordre, groupes,
aucun résultat), puis dans Chromium (Playwright) : select natif conservé (id, name, required, étiquette,
`FormData`), événements `input` / `change`, idempotence, ARIA combobox / listbox, clavier, option
désactivée, groupe, clic extérieur, valeur posée par programme, option ajoutée, select désactivé,
validation native, sélection multiple, panneau contenu dans l'écran à 390 px, liste insérée plus tard,
échappement, libération à la suppression. Si Playwright est absent, la partie navigateur est ignorée.

## Limites assumées

- Le select natif n'est plus visible : sur mobile, la roue native du système est remplacée par le panneau
  (c'est ce qui permet la recherche).
- Le message de validation natif du navigateur (« Veuillez sélectionner un élément ») s'affiche sur la
  liste masquée, à l'emplacement du déclencheur ; le clavier rouvre alors la liste.
- Les listes non natives sont traitées au cas par cas (table `CHOICE_LISTS`) : seule la liste des comptes
  de démonstration existe à ce jour.
