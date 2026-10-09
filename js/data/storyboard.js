/**
 * Storyboard de la vidéo explicative DUT-OIC.
 *
 * Donnée, pas code : les scènes déclarent leur contenu et leur minutage cible.
 * Les durées réelles sont mesurées sur les fichiers audio et stockées dans
 * storyboard.timing.json ; c'est ce fichier qui pilote la lecture quand il existe.
 *
 * Avertissement de contenu : le chapitre 2 présente une vérification par
 * l'antenne OIC avant attribution du numéro. Cette étape n'existe pas dans le
 * dispositif OIC actuel — le partenaire consomme directement un numéro de son
 * stock. La scène 2.5 le dit explicitement : c'est une amélioration proposée,
 * pas une description de l'existant. Ne pas retirer cette mention.
 */

/** Contrat des primitives visuelles. Toute valeur de `kind` doit figurer ici. */
export const STAGE_KINDS = ['title', 'actor', 'doc', 'flow', 'picto', 'screen', 'callout'];

export const TOTAL_DURATION_MS = 290000;

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
          id: '1.2', at: 2000, duration: 12000, custom: 'port-abidjan',
          narration: 'Chaque jour, des marchandises quittent le port d’Abidjan pour rejoindre l’intérieur du pays, ou franchir une frontière.',
        },
        {
          id: '1.3', at: 14000, duration: 12000,
          narration: 'Chacun de ces transports doit être accompagné d’un document. Ce document, c’est le Document Unique de Transport : le DUT.',
          custom: 'iso-documents',
          customParams: { docs: [{ label: 'Le DUT' }] },
          stage: [{ kind: 'title', title: 'Le Document Unique de Transport', at: 400 }],
        },
        {
          id: '1.4', at: 26000, duration: 16000,
          narration: 'Mais un document sur papier ne porte pas la preuve de sa propre authenticité. Sans référence unique et vérifiable, rien ne permet de trancher au bord de la route entre l’original et une copie. Et personne, au niveau national, ne voit circuler l’ensemble.',
          custom: 'iso-documents',
          customParams: {
            docs: [
              { label: 'Original' },
              { dashed: true, label: 'Copie' },
              { dashed: true, label: 'Copie' },
            ],
          },
          stage: [
            { kind: 'title', title: 'Un papier ne prouve pas sa propre authenticité', at: 200 },
            { kind: 'callout', text: 'Lequel est l’original\u00a0?', at: 6000, anchor: 'original', tone: 'warning' },
          ],
        },
        {
          id: '1.5', at: 42000, duration: 13000,
          narration: 'Trois garanties sont donc attendues : qu’un DUT soit authentifiable, que son parcours soit tracé, et que l’ensemble devienne une statistique nationale exploitable.',
          custom: 'iso-socles',
          customParams: {
            items: [
              { icon: 'shield', label: 'Authenticité' },
              { icon: 'map', label: 'Traçabilité' },
              { icon: 'barChart', label: 'Statistique nationale' },
            ],
          },
          stage: [{ kind: 'title', title: 'Trois garanties attendues', at: 300 }],
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
          narration: 'Tout commence chez le partenaire : un commissionnaire, un transporteur, un chargeur. Il ouvre un dossier et décrit le transport — la marchandise, le véhicule, le conducteur, l’itinéraire.',
          custom: 'iso-acteur',
          customParams: { acteur: 'partenaire' },
          stage: [
            { kind: 'title', title: 'Le partenaire ouvre un dossier', at: 300 },
            { kind: 'picto', id: 'b-marchandise', icon: 'package', label: 'Marchandise et véhicule', slot: 1, at: 4200 },
            { kind: 'picto', id: 'b-trajet', icon: 'map', label: 'Conducteur et itinéraire', slot: 2, at: 5000 },
            { kind: 'screen', src: 'creation.png', alt: 'Formulaire de création d’un DUT côté partenaire', at: 3000, highlight: true, highlightAt: 6000 },
          ],
        },
        {
          id: '2.3', at: 18000, duration: 10000, custom: 'chaine-acteurs',
          narration: 'Quand le dossier est complet, il le soumet.',
          stage: [{ kind: 'title', title: 'La soumission du dossier', at: 200 }],
        },
        {
          id: '2.4', at: 28000, duration: 20000,
          narration: 'L’antenne OIC prend le relais. L’agent vérifie les pièces et la cohérence du dossier. S’il manque quelque chose, il renvoie le dossier avec un motif de rejet obligatoire — le partenaire corrige, puis soumet à nouveau.',
          custom: 'iso-acteur',
          customParams: { acteur: 'antenne' },
          stage: [
            { kind: 'title', title: 'L’antenne vérifie', at: 300 },
            { kind: 'screen', src: 'antenne.png', alt: 'Panneau de revue d’un DUT par un agent d’antenne', at: 2600, highlight: true, highlightAt: 5000 },
            { kind: 'callout', text: 'Motif de rejet obligatoire', at: 10500, anchor: 'rejet', tone: 'warning' },
          ],
        },
        {
          id: '2.5', at: 48000, duration: 18000,
          narration: 'À la validation, et seulement à ce moment-là, le dossier reçoit son numéro officiel, pris sur une plage allouée à l’antenne. Précisons-le franchement : dans le dispositif actuel de l’OIC, cette vérification par l’antenne n’existe pas — le partenaire consomme directement un numéro de son stock. Ce contrôle est une amélioration proposée pour le futur système.',
          custom: 'iso-documents',
          customParams: { docs: [{ numero: 'CI-2026-004812', label: 'Numéro officiel' }] },
          stage: [
            { kind: 'title', title: 'Le numéro officiel', at: 300 },
            { kind: 'callout', text: 'Amélioration proposée, pas l’existant', at: 9000, anchor: 'dut', tone: 'info' },
          ],
        },
        {
          id: '2.6', at: 66000, duration: 22000,
          narration: 'Le DUT devient alors imprimable, recto-verso, avec son code QR. Chaque impression est enregistrée : à partir de la deuxième, un motif est exigé.',
          custom: 'iso-documents',
          customParams: { docs: [{ numero: 'CI-2026-004812', qr: true, label: 'Recto-verso et code QR' }] },
          stage: [
            { kind: 'title', title: 'Impression et code QR', at: 300 },
            { kind: 'screen', src: 'impression.png', alt: 'Aperçu d’impression recto-verso d’un DUT', at: 3000, highlight: true, highlightAt: 7000 },
            { kind: 'callout', text: 'Motif exigé dès la 2e impression', at: 14000, anchor: 'dut', tone: 'info' },
          ],
        },
        {
          id: '2.7', at: 88000, duration: 12000,
          narration: 'Le transporteur prend la route, le document l’accompagne.',
          custom: 'iso-acteur',
          customParams: { acteur: 'controle', camion: true },
          stage: [{ kind: 'title', title: 'Le document prend la route', at: 200 }],
        },
        {
          id: '2.8', at: 100000, duration: 18000,
          narration: 'Au contrôle, l’agent scanne le code QR.',
          custom: 'iso-acteur',
          customParams: { acteur: 'controle' },
          stage: [
            { kind: 'title', title: 'Le contrôle terrain', at: 300 },
            { kind: 'picto', id: 'b-scan', icon: 'scan', label: 'Scan du code QR', slot: 1, at: 4000 },
            { kind: 'picto', id: 'b-reponse', icon: 'building', label: 'Le système répond, pas le papier', slot: 2, at: 4800 },
            { kind: 'screen', src: 'controle.png', alt: 'Résultat de contrôle d’un DUT après scan du code QR', at: 2800, highlight: true, highlightAt: 6000 },
          ],
        },
        {
          id: '2.9', at: 118000, duration: 12000,
          narration: 'Et chaque geste — création, rejet, validation, impression, contrôle — s’inscrit dans un journal d’audit que personne ne peut modifier ni effacer.',
          custom: 'iso-journal',
          customParams: {
            entrees: ['Création', 'Rejet', 'Validation', 'Impression', 'Contrôle', 'Ni modification ni suppression'],
          },
          stage: [{ kind: 'title', title: 'Journal d’audit', at: 300 }],
        },
      ],
    },
    {
      id: 'ch3', number: 3, register: 'hybride', duration: 50000,
      title: 'Pourquoi une copie ne passe pas',
      scenes: [
        titleCard('3.1', 'Chapitre 3', 'Pourquoi une copie ne passe pas'),
        {
          id: '3.2', at: 2000, duration: 14000,
          narration: 'Le code QR imprimé sur un DUT ne contient aucune donnée de transport. Rien que ceci : un jeton opaque, tiré au hasard, qui ne dit rien de la marchandise ni du transporteur.',
          custom: 'iso-documents',
          customParams: { docs: [{ qr: true, label: 'Un jeton, rien d’autre' }] },
          stage: [
            { kind: 'title', title: 'Ce que contient le code QR', at: 300 },
            { kind: 'callout', text: 'oicdut://verify/<jeton>', at: 3000, anchor: 'dut', tone: 'info' },
          ],
        },
        {
          id: '3.3', at: 16000, duration: 14000,
          narration: 'Le scanner ne lit donc pas le document : il interroge le système. Et c’est le système qui répond. Ce qui est imprimé sur le papier n’a aucune autorité.',
          custom: 'iso-acteur',
          customParams: { acteur: 'siege' },
          stage: [
            { kind: 'title', title: 'Le scan interroge le système', at: 200 },
            { kind: 'callout', text: 'Le papier ne fait pas autorité', at: 6000, anchor: 'systeme', tone: 'warning' },
          ],
        },
        {
          id: '3.4', at: 30000, duration: 12000, custom: 'copie-retiree',
          narration: 'Prenons une copie. Même papier, même QR, même numéro. Le scan interroge le système — et le système répond : « retiré ».',
        },
        {
          id: '3.5', at: 42000, duration: 8000,
          narration: 'À cela s’ajoutent les statuts qui pilotent l’impression, le rang de génération, et une empreinte du contenu.',
          custom: 'iso-socles',
          customParams: {
            items: [
              { icon: 'checkCircle', label: 'Statuts et filigranes' },
              { icon: 'layers', label: 'Rang de génération' },
              { icon: 'target', label: 'Empreinte SHA-256' },
            ],
          },
          stage: [{ kind: 'title', title: 'Trois garde-fous de plus', at: 150 }],
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
          narration: 'Côté OIC, tout part des plages de numéros : une antenne en demande, l’OIC alloue, et chaque numéro consommé est connu.',
          custom: 'iso-acteur',
          customParams: { acteur: 'antenne' },
          stage: [
            { kind: 'title', title: 'Les plages de numéros', at: 300 },
            { kind: 'picto', id: 'b-demande', icon: 'inbox', label: 'Demande par l’antenne', slot: 1, at: 2600 },
            { kind: 'picto', id: 'b-alloc', icon: 'layers', label: 'Allocation par l’OIC', slot: 2, at: 3400 },
            { kind: 'screen', src: 'plages.png', alt: 'Écran de demande et d’allocation des plages de numéros DUT', at: 1200, highlight: true, highlightAt: 4000 },
          ],
        },
        {
          id: '4.3', at: 14000, duration: 12000,
          narration: 'Les DUT émis deviennent alors une statistique : volumes, délais de traitement, corridors, tonnages.',
          custom: 'iso-acteur',
          customParams: { acteur: 'siege' },
          stage: [
            { kind: 'title', title: 'La statistique nationale', at: 300 },
            { kind: 'picto', id: 'b-volumes', icon: 'barChart', label: 'Volumes et délais', slot: 1, at: 2600 },
            { kind: 'picto', id: 'b-corridors', icon: 'map', label: 'Corridors et tonnages', slot: 2, at: 3400 },
            { kind: 'screen', src: 'oic.png', alt: 'Tableau de bord national OIC avec volumes et délais de traitement', at: 1200, highlight: true, highlightAt: 4000 },
          ],
        },
        {
          id: '4.4', at: 26000, duration: 8000,
          narration: 'Le réseau des antennes est cartographié.',
          custom: 'iso-reseau',
          stage: [
            { kind: 'title', title: 'Le réseau des antennes', at: 200 },
            { kind: 'picto', id: 'b-reseau', icon: 'map', label: '23 antennes cartographiées', slot: 1, at: 1400 },
          ],
        },
        {
          id: '4.5', at: 34000, duration: 6000,
          narration: 'Et l’administration des utilisateurs et des rôles reste entre les mains de l’OIC.',
          custom: 'iso-acteur',
          customParams: { acteur: 'siege' },
          stage: [
            { kind: 'title', title: 'L’administration reste à l’OIC', at: 200 },
            { kind: 'picto', id: 'b-roles', icon: 'users', label: 'Utilisateurs et rôles', slot: 1, at: 1200 },
            { kind: 'picto', id: 'b-audit', icon: 'shield', label: 'Journal d’audit', slot: 2, at: 1800 },
            { kind: 'screen', src: 'actions.png', alt: 'Centre d’actions et administration des rôles côté OIC', at: 300 },
          ],
        },
      ],
    },
    {
      id: 'ch5', number: 5, register: 'vectoriel', duration: 15000,
      title: 'Du POC au système réel',
      scenes: [
        titleCard('5.1', 'Chapitre 5', 'Du POC au système réel'),
        {
          id: '5.2', at: 2000, duration: 10000,
          narration: 'Soyons clairs sur ce que vous venez de voir : une démonstration qui tourne dans un navigateur, sur des données fictives, sans serveur. Elle montre les concepts, elle ne les sécurise pas.',
          custom: 'iso-socles',
          customParams: {
            items: [
              { icon: 'dashboard', label: 'Navigateur seul' },
              { icon: 'layers', label: 'Données de démonstration' },
              { icon: 'alertTriangle', label: 'Pas un dispositif de sécurité' },
            ],
          },
          stage: [{ kind: 'title', title: 'Ce qu’est cette démonstration', at: 300 }],
        },
        {
          id: '5.4', at: 12000, duration: 3000,
          narration: 'Office Ivoirien des Chargeurs. Document Unique de Transport.',
          stage: [
            { kind: 'title', title: 'Document Unique de Transport', kicker: 'Office Ivoirien des Chargeurs', variant: 'card', at: 200 },
          ],
        },
      ],
    },
  ],
};
