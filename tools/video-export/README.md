# Export MP4 — outil de développement

Produit des fichiers `.mp4` **autonomes** depuis la vue `#/decouvrir`. Les fichiers
obtenus ne dépendent en rien de la plateforme : ils se lisent dans n'importe quel
lecteur, s'envoient par mail, se projettent, se publient.

Ce dossier porte ses propres dépendances pour que la racine du dépôt reste sans
`package.json` et sans étape de build — l'application, elle, ne gagne aucune
dépendance.

## Installation

```bash
brew install ffmpeg
cd tools/video-export && npm install && npx playwright install chromium
```

## Utilisation

Un serveur doit servir le POC pendant le rendu :

```bash
python3 -m http.server 8080        # depuis la racine du dépôt
```

Puis :

```bash
cd tools/video-export
node render.mjs --chapter ch3 --port 8080   # un seul chapitre
node render.mjs --all --port 8080           # les 5 chapitres + montages
```

Sorties dans `output/video/` (ignoré par git) : `ch1.mp4` … `ch5.mp4`,
`principal.mp4` (les 5 chapitres), `teaser.mp4` (chapitre 1 + scène pivot).

## Comment le déterminisme est obtenu

La page n'est pas enregistrée en temps réel — ce qui perdrait des images sur les
scènes chargées. Le temps virtuel est piloté image par image :
`window.__explainer.seek(frame / 25 * 1000)`, capture de l'élément
`.scene-stage` seul, puis assemblage par ffmpeg. Le rendu est donc identique à
chaque exécution, quelle que soit la machine.
