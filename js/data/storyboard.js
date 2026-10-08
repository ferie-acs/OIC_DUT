/**
 * Storyboard de la vidéo explicative DUT-OIC.
 *
 * Donnée, pas code : les scènes déclarent leur contenu et leur minutage cible.
 * Les durées réelles sont mesurées sur les fichiers audio et stockées dans
 * storyboard.timing.json ; c'est ce fichier qui pilote la lecture quand il existe.
 *
 * Avertissement de contenu : le chapitre 2 présente une vérification par
 * l'antenne OIC avant attribution du numéro. Cette étape n'existe pas dans le
 * dispositif OIC actuel — le partenaire consomme directement un numéro de son
 * stock. La scène 2.5 le dit explicitement : c'est une amélioration proposée,
 * pas une description de l'existant. Ne pas retirer cette mention.
 */

/** Contrat des primitives visuelles. Toute valeur de `kind` doit figurer ici. */
export const STAGE_KINDS = ['title', 'actor', 'doc', 'flow', 'picto', 'screen', 'callout'];

export const TOTAL_DURATION_MS = 300000;

const titleCard = (id, kicker, title) => ({
  id, kindOfScene: 'title-card', at: 0, duration: 2000, narration: null,
  stage: [{ kind: 'title', kicker, title, variant: 'card' }],
});

export const storyboard = {
  fps: 25,
  width: 1920,
  height: 1080,
  chapters: [
    {
      id: 'ch1', number: 1, register: 'vectoriel', duration: 55000,
      title: 'Le problème et le DUT',
      scenes: [
        titleCard('1.1', 'Chapitre 1', 'Le problème et le DUT'),
        {
          id: '1.2', at: 2000, duration: 12000, custom: 'carte-depart',
          narration: 'Chaque jour, des marchandises quittent le port d’Abidjan pour rejoindre l’intérieur du pays, ou franchir une frontière.',
        },
        {
          id: '1.3', at: 14000, duration: 12000,
          narration: 'Chacun de ces transports doit être accompagné d’un document. Ce document, c’est le Document Unique de Transport : le DUT.',
          stage: [
            { kind: 'title', title: 'Le Document Unique de Transport', at: 400 },
            { kind: 'doc', id: 'dut', label: 'DUT', at: 1200, from: 'bottom' },
          ],
        },
        {
          id: '1.4', at: 26000, duration: 16000,
          narration: 'Mais un document sur papier ne porte pas la preuve de sa propre authenticité. Sans référence unique et vérifiable, rien ne permet de trancher au bord de la route entre l’original et une copie. Et personne, au niveau national, ne voit circuler l’ensemble.',
          stage: [
            { kind: 'doc', id: 'original', label: 'DUT', at: 0, x: -280 },
            { kind: 'doc', id: 'copie1', label: 'DUT', at: 2200, x: -40, dimmed: true },
            { kind: 'doc', id: 'copie2', label: 'DUT', at: 3200, x: 200, dimmed: true },
            { kind: 'callout', text: 'Lequel est l’original ?', at: 6000, anchor: 'original', tone: 'warning' },
          ],
        },
        {
          id: '1.5', at: 42000, duration: 13000,
          narration: 'Trois garanties sont donc attendues : qu’un DUT soit authentifiable, que son parcours soit tracé, et que l’ensemble devienne une statistique nationale exploitable.',
          stage: [
            { kind: 'title', title: 'Trois garanties attendues', at: 300 },
            { kind: 'picto', id: 'auth', icon: 'shield-check', label: 'Authenticité', slot: 1, at: 1600 },
            { kind: 'picto', id: 'trace', icon: 'route', label: 'Traçabilité', slot: 2, at: 2400 },
            { kind: 'picto', id: 'stats', icon: 'bar-chart-3', label: 'Statistique nationale', slot: 3, at: 3200 },
          ],
        },
      ],
    },
    {
      id: 'ch2', number: 2, register: 'hybride', duration: 130000,
      title: 'Le parcours, acteur par acteur',
      scenes: [
        titleCard('2.1', 'Chapitre 2', 'Le parcours d’un DUT'),
        {
          id: '2.2', at: 2000, duration: 16000,
          narration: 'Tout commence chez le partenaire : un commissionnaire, un transporteur, un chargeur. Il ouvre un dossier et décrit le transport — la marchandise, le véhicule, le conducteur, l’itinéraire.',
          stage: [
            { kind: 'title', title: 'Le partenaire ouvre un dossier', at: 300 },
            { kind: 'actor', id: 'partner', label: 'Partenaire', at: 800, live: true, liveAt: 1600 },
            { kind: 'screen', src: 'creation.png', alt: 'Formulaire de création d’un DUT côté partenaire', at: 3000, highlight: true, highlightAt: 6000 },
          ],
        },
        {
          id: '2.3', at: 18000, duration: 10000,
          narration: 'Quand le dossier est complet, il le soumet.',
          stage: [
            { kind: 'actor', id: 'partner', label: 'Partenaire', at: 0 },
            { kind: 'doc', id: 'dut', label: 'DUT', at: 600 },
            { kind: 'actor', id: 'antenne', label: 'Antenne OIC', at: 1000 },
            { kind: 'flow', id: 'soumission', from: 'partner', to: 'antenne', at: 1800 },
          ],
        },
        {
          id: '2.4', at: 28000, duration: 20000,
          narration: 'L’antenne OIC prend le relais. L’agent vérifie les pièces et la cohérence du dossier. S’il manque quelque chose, il renvoie le dossier avec un motif de rejet obligatoire — le partenaire corrige, puis resoumet.',
          stage: [
            { kind: 'title', title: 'L’antenne vérifie', at: 300 },
            { kind: 'actor', id: 'antenne', label: 'Antenne OIC', at: 700, live: true, liveAt: 1400 },
            { kind: 'screen', src: 'antenne.png', alt: 'Panneau de revue d’un DUT par un agent d’antenne', at: 2600, highlight: true, highlightAt: 5000 },
            { kind: 'flow', id: 'rejet', from: 'antenne', to: 'partner', at: 9000, reverse: true },
            { kind: 'callout', text: 'Motif de rejet obligatoire', at: 10500, anchor: 'rejet', tone: 'warning' },
          ],
        },
        {
          id: '2.5', at: 48000, duration: 18000,
          narration: 'À la validation, et seulement à ce moment-là, le dossier reçoit son numéro officiel, pris sur une plage allouée à l’antenne. Précisons-le franchement : dans le dispositif actuel de l’OIC, cette vérification par l’antenne n’existe pas — le partenaire consomme directement un numéro de son stock. Ce contrôle est une amélioration proposée pour le futur système.',
          stage: [
            { kind: 'title', title: 'Le numéro officiel', at: 300 },
            { kind: 'doc', id: 'dut', label: 'DUT', number: 'CI-2026-004812', at: 1200 },
            { kind: 'callout', text: 'Amélioration proposée, pas l’existant', at: 9000, anchor: 'dut', tone: 'info' },
          ],
        },
        {
          id: '2.6', at: 66000, duration: 22000,
          narration: 'Le DUT devient alors imprimable, recto-verso, avec son code QR. Chaque impression est enregistrée : à partir de la deuxième, un motif est exigé.',
          stage: [
            { kind: 'title', title: 'Impression et code QR', at: 300 },
            { kind: 'doc', id: 'dut', label: 'DUT', number: 'CI-2026-004812', qr: true, at: 900 },
            { kind: 'screen', src: 'impression.png', alt: 'Aperçu d’impression recto-verso d’un DUT', at: 3000, highlight: true, highlightAt: 7000 },
            { kind: 'callout', text: 'Motif exigé dès la 2e impression', at: 14000, anchor: 'dut', tone: 'info' },
          ],
        },
        {
          id: '2.7', at: 88000, duration: 12000,
          narration: 'Le transporteur prend la route, le document l’accompagne.',
          stage: [
            { kind: 'actor', id: 'transporteur', label: 'Transporteur', at: 400, live: true, liveAt: 1200 },
            { kind: 'doc', id: 'dut', label: 'DUT', qr: true, at: 800 },
            { kind: 'flow', id: 'route', from: 'transporteur', to: 'controle', at: 2000 },
            { kind: 'actor', id: 'controle', label: 'Contrôle terrain', at: 1600 },
          ],
        },
        {
          id: '2.8', at: 100000, duration: 18000,
          narration: 'Au contrôle, l’agent scanne le code QR.',
          stage: [
            { kind: 'title', title: 'Le contrôle terrain', at: 300 },
            { kind: 'actor', id: 'controle', label: 'Contrôle terrain', at: 700, live: true, liveAt: 1500 },
            { kind: 'screen', src: 'controle.png', alt: 'Résultat de contrôle d’un DUT après scan du code QR', at: 2800, highlight: true, highlightAt: 6000 },
          ],
        },
        {
          id: '2.9', at: 118000, duration: 12000,
          narration: 'Et chaque geste — création, rejet, validation, impression, contrôle — s’inscrit dans un journal d’audit que personne ne peut modifier ni effacer.',
          stage: [
            { kind: 'title', title: 'Journal d’audit', at: 300 },
            { kind: 'picto', id: 'lock', icon: 'lock', label: 'Ajout seul', slot: 2, at: 900 },
            { kind: 'callout', text: 'Création', at: 2200, anchor: 'lock', tone: 'neutral' },
            { kind: 'callout', text: 'Rejet', at: 2700, anchor: 'lock', tone: 'neutral' },
            { kind: 'callout', text: 'Validation', at: 3200, anchor: 'lock', tone: 'neutral' },
            { kind: 'callout', text: 'Impression', at: 3700, anchor: 'lock', tone: 'neutral' },
            { kind: 'callout', text: 'Contrôle', at: 4200, anchor: 'lock', tone: 'neutral' },
            { kind: 'callout', text: 'Ni modification ni suppression', at: 5200, anchor: 'lock', tone: 'info' },
          ],
        },
      ],
    },
    {
      id: 'ch3', number: 3, register: 'hybride', duration: 50000,
      title: 'Pourquoi c’est infalsifiable',
      scenes: [
        titleCard('3.1', 'Chapitre 3', 'Pourquoi c’est infalsifiable'),
        {
          id: '3.2', at: 2000, duration: 14000,
          narration: 'Le code QR imprimé sur un DUT ne contient aucune donnée de transport. Rien que ceci : un jeton opaque, tiré au hasard, qui ne dit rien de la marchandise ni du transporteur.',
          stage: [
            { kind: 'title', title: 'Ce que contient le code QR', at: 300 },
            { kind: 'doc', id: 'dut', label: 'DUT', qr: true, at: 900 },
            { kind: 'callout', text: 'oicdut://verify/<jeton>', at: 3000, anchor: 'dut', tone: 'info' },
          ],
        },
        {
          id: '3.3', at: 16000, duration: 14000,
          narration: 'Le scanner ne lit donc pas le document : il interroge le système. Et c’est le système qui répond. Ce qui est imprimé sur le papier n’a aucune autorité.',
          stage: [
            { kind: 'doc', id: 'dut', label: 'DUT', qr: true, at: 0 },
            { kind: 'actor', id: 'systeme', label: 'Le système', at: 900, live: true, liveAt: 3000 },
            { kind: 'flow', id: 'interrogation', from: 'dut', to: 'systeme', at: 1800 },
            { kind: 'callout', text: 'Le papier ne fait pas autorité', at: 6000, anchor: 'systeme', tone: 'warning' },
          ],
        },
        {
          id: '3.4', at: 30000, duration: 12000, custom: 'copie-retiree',
          narration: 'Prenons une copie. Même papier, même QR, même numéro. Le scan interroge le système — et le système répond : retiré.',
        },
        {
          id: '3.5', at: 42000, duration: 8000,
          narration: 'À cela s’ajoutent les statuts qui pilotent l’impression, le rang de génération, et une empreinte du contenu.',
          stage: [
            { kind: 'picto', id: 'statuts', icon: 'stamp', label: 'Statuts et filigranes', slot: 1, at: 300 },
            { kind: 'picto', id: 'rang', icon: 'layers', label: 'Rang de génération', slot: 2, at: 900 },
            { kind: 'picto', id: 'empreinte', icon: 'fingerprint', label: 'Empreinte SHA-256', slot: 3, at: 1500 },
          ],
        },
      ],
    },
    {
      id: 'ch4', number: 4, register: 'ecrans', duration: 40000,
      title: 'Piloter le dispositif',
      scenes: [
        titleCard('4.1', 'Chapitre 4', 'Piloter le dispositif'),
        {
          id: '4.2', at: 2000, duration: 12000,
          narration: 'Côté OIC, tout part des plages de numéros : une antenne en demande, l’OIC alloue, et chaque numéro consommé est connu.',
          stage: [
            { kind: 'title', title: 'Les plages de numéros', at: 300 },
            { kind: 'screen', src: 'plages.png', alt: 'Écran de demande et d’allocation des plages de numéros DUT', at: 1200, highlight: true, highlightAt: 4000 },
          ],
        },
        {
          id: '4.3', at: 14000, duration: 12000,
          narration: 'Les DUT émis deviennent alors une statistique : volumes, délais de traitement, corridors, tonnages.',
          stage: [
            { kind: 'title', title: 'La statistique nationale', at: 300 },
            { kind: 'screen', src: 'oic.png', alt: 'Tableau de bord national OIC avec volumes et délais de traitement', at: 1200, highlight: true, highlightAt: 4000 },
          ],
        },
        {
          id: '4.4', at: 26000, duration: 8000,
          narration: 'Le réseau des antennes est cartographié.',
          stage: [
            { kind: 'screen', src: 'antennes.png', alt: 'Carte du réseau des antennes OIC en Côte d’Ivoire', at: 300 },
          ],
        },
        {
          id: '4.5', at: 34000, duration: 6000,
          narration: 'Et l’administration des utilisateurs et des rôles reste entre les mains de l’OIC.',
          stage: [
            { kind: 'screen', src: 'actions.png', alt: 'Centre d’actions et administration des rôles côté OIC', at: 300 },
          ],
        },
      ],
    },
    {
      id: 'ch5', number: 5, register: 'vectoriel', duration: 25000,
      title: 'Du POC au système réel',
      scenes: [
        titleCard('5.1', 'Chapitre 5', 'Du POC au système réel'),
        {
          id: '5.2', at: 2000, duration: 10000,
          narration: 'Soyons clairs sur ce que vous venez de voir : une démonstration qui tourne dans un navigateur, sur des données fictives, sans serveur. Elle montre les concepts, elle ne les sécurise pas.',
          stage: [
            { kind: 'title', title: 'Ce que cette démonstration est', at: 300 },
            { kind: 'picto', id: 'navigateur', icon: 'monitor', label: 'Navigateur seul', slot: 1, at: 900 },
            { kind: 'picto', id: 'demo', icon: 'database', label: 'Données de démonstration', slot: 2, at: 1500 },
            { kind: 'picto', id: 'pas-securite', icon: 'alert-triangle', label: 'Pas un dispositif de sécurité', slot: 3, at: 2100 },
          ],
        },
        {
          id: '5.3', at: 12000, duration: 10000, custom: 'architecture-cible',
          narration: 'Le système réel, lui, reposerait sur une architecture éprouvée : Angular et NestJS, PostgreSQL avec PostGIS, Keycloak pour les identités, un stockage objet pour les pièces, et une signature électronique conforme.',
        },
        {
          id: '5.4', at: 22000, duration: 3000,
          narration: 'Office Ivoirien des Chargeurs. Document Unique de Transport.',
          stage: [
            { kind: 'title', title: 'Document Unique de Transport', kicker: 'Office Ivoirien des Chargeurs', variant: 'card', at: 200 },
          ],
        },
      ],
    },
  ],
};
