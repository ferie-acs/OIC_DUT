// Lot d4 : données de démonstration (incidents, lenteurs, remontées, équipements, échanges).
// Idempotent : sans effet si déjà ensemencé ; une réinitialisation de la démo efface le marqueur.
import { STORAGE_KEYS } from './core/constants.js';
import { readObject, writeObject } from './core/storage.js';
import { uuid } from './core/utils.js';
import { getAllAntennas } from './repositories/antennas.repository.js';
import { getAllUsers } from './repositories/users.repository.js';
import { getAllPartners } from './repositories/partners.repository.js';
import * as incidentsRepo from './repositories/incidents.repository.js';
import * as reportsRepo from './repositories/field-reports.repository.js';
import * as equipmentRepo from './repositories/equipment.repository.js';
import * as threadsRepo from './repositories/partner-exchanges.repository.js';

const H = 3600 * 1000;
const ago = (hours) => new Date(Date.now() - hours * H).toISOString();
const atHour = (daysAgo, hour, minute = 10) => { const d = new Date(Date.now() - daysAgo * 24 * H); d.setHours(hour, minute, 0, 0); return d.toISOString(); };
const year = new Date().getFullYear();
const ref = (prefix, n) => `${prefix}-${year}-${String(n).padStart(4, '0')}`;

export function seedLotD4() {
  if (readObject(STORAGE_KEYS.LOT_D4_SEEDED, false)) return false;
  const antennas = getAllAntennas();
  const users = getAllUsers();
  if (!antennas.length || !users.length) return false;
  const ant = (name) => antennas.find((a) => a.name === name) || antennas[0];
  const usr = (email) => users.find((u) => u.email === email);
  const abj = ant('ABIDJAN SIEGE'), bke = ant('BOUAKE'), spy = ant('SAN PEDRO'), yak = ant('YAMOUSSOUKRO'), kor = ant('KORHOGO'), vri = ant('ABIDJAN VRIDI');
  const admin = usr('oic.admin@demo.oic.ci'), agent = usr('antenne.agent@demo.oic.ci'), pAdmin = usr('partner.admin@demo.oic.ci'), pEditor = usr('partner.editor@demo.oic.ci'), carrier = usr('transporteur@demo.oic.ci');
  if (!admin || !agent || !pAdmin) return false;
  const who = (u, extra = {}) => ({ id: u.id, name: u.name, role: u.role, partnerId: u.partnerId || null, partnerName: u.partnerName || null, antennaId: u.antennaId || null, ...extra });
  const field = (name, role, antennaId) => ({ id: `SEED-${uuid()}`, name, role, partnerId: null, partnerName: null, antennaId });
  const h = (at, by, label, note = '', role = 'OIC_ADMIN') => ({ id: uuid(), at, byId: 'SEED', by, role, label, note });

  // ===== Équipements (créés d'abord : un incident matériel y renvoie) =====
  const eq = [];
  const addEq = (type, label, serial, antenna, acquiredAt, status = 'EN_SERVICE', holder = null, extra = {}) => {
    const item = { id: uuid(), reference: ref('EQ', eq.length + 1), type, label, serialNumber: serial, antennaId: antenna.id, antennaName: antenna.name, acquiredAt, status, holder: holder ? { ...holder, since: ago(24 * 120) } : null, assignments: holder ? [{ holderId: holder.id, name: holder.name, from: ago(24 * 120), until: null, by: admin.name }] : [], failures: [], history: [h(ago(24 * 200), admin.name, 'Équipement recensé', `${antenna.name}`)], createdAt: ago(24 * 200), ...extra };
    if (holder) item.history.push(h(ago(24 * 120), admin.name, 'Équipement affecté', holder.name));
    eq.push(item);
    return item;
  };
  const chief = (a) => ({ id: `chef:${a.id}`, name: a.chef?.name || 'Chef d’antenne' });
  addEq('ORDINATEUR_PORTABLE', 'HP ProBook 450', 'HP5CD2341KQ', abj, '2023-03-14', 'EN_SERVICE', { id: agent.id, name: agent.name });
  addEq('ORDINATEUR_FIXE', 'Dell OptiPlex 7010', 'DL7010-88412', abj, '2022-06-02', 'EN_SERVICE', chief(abj));
  const printer = addEq('IMPRIMANTE', 'Epson WorkForce WF-C5790', 'EPX9WF5790A1', abj, '2021-11-20', 'EN_PANNE');
  addEq('LECTEUR_QR', 'Zebra DS2208', 'ZB22080041', abj, '2024-01-09', 'EN_SERVICE', { id: agent.id, name: agent.name });
  addEq('ONDULEUR', 'APC Back-UPS 1500', 'APC1500-3321', abj, '2022-06-02');
  addEq('MOTO', 'Yamaha Crux 110', 'MOTO-AB-2291', abj, '2023-08-30', 'EN_SERVICE', chief(abj));
  addEq('ORDINATEUR_PORTABLE', 'Lenovo ThinkPad E14', 'LNV-E14-55102', bke, '2023-05-11', 'EN_SERVICE', chief(bke));
  const vehicle = addEq('VEHICULE', 'Toyota Hilux double cabine', 'VF1HLX-BK-7781', bke, '2020-02-17', 'EN_REPARATION');
  addEq('TABLETTE', 'Samsung Galaxy Tab A8', 'SM-X200-99012', spy, '2024-04-03', 'EN_SERVICE', chief(spy));
  addEq('RESEAU', 'Routeur 4G Huawei B535', 'HW-B535-12007', spy, '2019-09-25', 'REFORME', null, { retiredAt: ago(24 * 20) });
  addEq('IMPRIMANTE', 'HP LaserJet Pro M404', 'HPM404-77120', yak, '2022-10-12');
  addEq('TELEPHONE', 'Tecno Spark 20', 'TCN-SPK20-4410', kor, '2024-07-01', 'EN_SERVICE', chief(kor));

  // ===== Incidents de la plateforme =====
  const inc = [];
  const addInc = (o) => {
    const declaredAt = o.declaredAt;
    const item = {
      id: uuid(), reference: ref('INC', inc.length + 1), category: o.category, severity: o.severity, declaredSeverity: o.declaredSeverity || o.severity,
      impact: o.impact || null, status: o.status, title: o.title, description: o.description,
      antennaId: o.antenna?.id || null, antennaName: o.antenna?.name || 'Niveau national',
      attachments: o.attachments || [], performance: o.performance || null, equipmentId: o.equipmentId || null,
      declaredBy: o.by, declaredAt, assignee: o.assignee || null, team: o.team || null,
      cause: o.cause || '', solution: o.solution || '', history: [h(declaredAt, o.by.name, 'Incident déclaré', '', o.by.role), ...(o.history || [])],
      qualifiedAt: o.qualifiedAt || null, assignedAt: o.assignedAt || null, resolvedAt: o.resolvedAt || null, closedAt: o.closedAt || null,
      deadlineAlertAt: null, updatedAt: declaredAt,
    };
    inc.push(item);
    return item;
  };
  const adminRef = { id: admin.id, name: admin.name, role: admin.role };
  const agentRef = { id: agent.id, name: agent.name, role: agent.role };

  addInc({ category: 'APPLICATIF', severity: 'MAJEURE', impact: 'ANTENNE', status: 'EN_TRAITEMENT', antenna: abj, by: who(pAdmin), declaredAt: ago(30),
    title: 'Le bouton « Soumettre » reste inactif après correction d’un DUT rejeté',
    description: 'Après avoir corrigé un DUT rejeté par l’antenne, le bouton de soumission ne réagit plus. Il faut fermer puis rouvrir le dossier pour pouvoir le soumettre.',
    attachments: [{ name: 'capture-ecran-soumission.png', size: 184320, type: 'image/png' }],
    assignee: adminRef, team: 'SUPPORT', qualifiedAt: ago(28), assignedAt: ago(27),
    history: [h(ago(28), admin.name, 'Incident qualifié', 'Gravité : Majeure · impact : une antenne'), h(ago(27), admin.name, 'Incident attribué', `${admin.name} · Support applicatif (DSI)`), h(ago(20), admin.name, 'Suivi du traitement', 'Anomalie reproduite sur un poste de test ; correctif en préparation.')] });
  addInc({ category: 'MATERIEL', severity: 'MAJEURE', impact: 'ANTENNE', status: 'ATTRIBUE', antenna: abj, by: who(agent), declaredAt: ago(6), equipmentId: printer.id,
    title: 'Panne : imprimante Epson WorkForce WF-C5790',
    description: 'L’imprimante du guichet affiche une erreur de bourrage permanente. Les DUT validés ne peuvent plus être imprimés au guichet.\nÉquipement EQ-' + year + '-0003, numéro de série EPX9WF5790A1.',
    assignee: agentRef, team: 'ANTENNE', qualifiedAt: ago(5), assignedAt: ago(5),
    history: [h(ago(5), admin.name, 'Incident qualifié', 'Gravité : Majeure · impact : une antenne'), h(ago(5), admin.name, 'Incident attribué', `${agent.name} · Antenne concernée`)] });
  addInc({ category: 'APPLICATIF', severity: 'CRITIQUE', status: 'DECLARE', antenna: null, by: who(carrier || pAdmin), declaredAt: ago(2),
    title: 'Impossible d’ouvrir l’aperçu du DUT recto verso',
    description: 'Depuis ce matin, l’aperçu du DUT reste sur une page blanche. Le téléchargement fonctionne, mais l’aperçu ne s’affiche pas.' });
  addInc({ category: 'RESEAU', severity: 'CRITIQUE', impact: 'ANTENNE', status: 'CLOS', antenna: spy, by: field('Agent de l’antenne de San-Pédro', 'ANTENNA_AGENT', spy.id), declaredAt: ago(24 * 9),
    title: 'Coupure de la connexion internet de l’antenne',
    description: 'Plus aucune connexion depuis 8 h. Les DUT ne peuvent plus être validés ; les partenaires attendent au guichet.',
    assignee: adminRef, team: 'RESEAU', qualifiedAt: ago(24 * 9 - 0.5), assignedAt: ago(24 * 9 - 0.5), resolvedAt: ago(24 * 9 - 3), closedAt: ago(24 * 9 - 5),
    cause: 'Routeur 4G hors d’usage après une surtension.', solution: 'Routeur remplacé par un modem de secours ; onduleur demandé pour l’antenne.',
    history: [h(ago(24 * 9 - 0.5), admin.name, 'Incident attribué', `${admin.name} · Réseaux et télécoms (DSI)`), h(ago(24 * 9 - 3), admin.name, 'Résolution proposée', 'Routeur remplacé par un modem de secours.'), h(ago(24 * 9 - 5), admin.name, 'Solution vérifiée, incident clos', 'Résolu dans le délai cible')] });
  addInc({ category: 'PROCEDURE', severity: 'MINEURE', impact: 'UTILISATEUR', status: 'RESOLU', antenna: abj, by: who(pEditor || pAdmin), declaredAt: ago(50),
    title: 'Procédure de demande de plage peu claire',
    description: 'Nous ne savons pas quel montant indiquer lorsque le tarif unitaire change en cours d’année.',
    assignee: adminRef, team: 'OPERATIONS', qualifiedAt: ago(48), assignedAt: ago(48), resolvedAt: ago(4),
    cause: 'Le tarif proposé par défaut n’était pas rappelé dans le formulaire.', solution: 'Le tarif en vigueur est désormais pré-rempli ; note d’information envoyée au partenaire.',
    history: [h(ago(48), admin.name, 'Incident attribué', `${admin.name} · Direction des opérations`), h(ago(4), admin.name, 'Résolution proposée', 'Tarif pré-rempli dans le formulaire.')] });

  // Lenteurs signalées : écrans, durées, heures et antennes variés sur 30 jours.
  const slow = [
    [abj, 'VALIDATION', 72, 2, 10, 'EN_TRAITEMENT'], [abj, 'IMPRESSION', 95, 3, 11, 'QUALIFIE'], [bke, 'VALIDATION', 62, 4, 10, 'CLOS'],
    [abj, 'SOUMISSION', 35, 6, 9, 'CLOS'], [spy, 'IMPRESSION', 120, 8, 15, 'CLOS'], [vri, 'VALIDATION', 41, 11, 10, 'CLOS'],
    [yak, 'TABLEAU', 22, 13, 14, 'CLOS'], [abj, 'IMPRESSION', 80, 16, 11, 'CLOS'], [bke, 'CONNEXION', 18, 19, 8, 'CLOS'], [kor, 'VALIDATION', 55, 24, 10, 'CLOS'],
  ];
  const screenLabel = { VALIDATION: 'la validation d’un DUT', IMPRESSION: 'l’édition du DUT', SOUMISSION: 'la soumission d’un DUT', TABLEAU: 'le tableau de bord', CONNEXION: 'la connexion' };
  for (const [antenna, screen, seconds, daysAgo, hour, status] of slow) {
    const observedAt = atHour(daysAgo, hour, 15);
    const declaredAt = new Date(new Date(observedAt).getTime() + 0.5 * H).toISOString();
    const by = antenna.id === abj.id ? (screen === 'SOUMISSION' ? who(pAdmin) : who(agent)) : field(`Agent de l’antenne ${antenna.name}`, 'ANTENNA_AGENT', antenna.id);
    const closed = status === 'CLOS';
    addInc({ category: 'PERFORMANCE', severity: seconds >= 60 ? 'MAJEURE' : 'MINEURE', impact: status === 'DECLARE' ? null : 'ANTENNE', status, antenna, by, declaredAt,
      title: `Lenteur sur ${screenLabel[screen]} (${seconds} s)`,
      description: `L’écran a mis environ ${seconds} secondes à répondre. Les partenaires présents au guichet ont dû patienter.`,
      performance: { screen, durationSec: seconds, observedAt },
      assignee: status === 'QUALIFIE' ? null : adminRef, team: status === 'QUALIFIE' ? null : 'SUPPORT', qualifiedAt: declaredAt,
      resolvedAt: closed ? new Date(new Date(declaredAt).getTime() + 6 * H).toISOString() : null, closedAt: closed ? new Date(new Date(declaredAt).getTime() + 8 * H).toISOString() : null,
      cause: closed ? 'Requête de recherche des dossiers non optimisée aux heures de pointe.' : '', solution: closed ? 'Recherche limitée aux dossiers de la période ; temps de réponse revenu sous 5 secondes.' : '' });
  }

  // Lien panne d'imprimante ↔ incident matériel.
  const printerIncident = inc.find((i) => i.equipmentId === printer.id);
  printer.failures.push({ id: uuid(), declaredAt: ago(6), declaredBy: { id: agent.id, name: agent.name, role: agent.role }, description: 'Erreur de bourrage permanente ; aucune impression possible au guichet.', incidentId: printerIncident.id, incidentReference: printerIncident.reference, interventions: [], closedAt: null, outcome: null, report: '' });
  printer.history.push(h(ago(6), agent.name, 'Panne déclarée', `Erreur de bourrage permanente · incident ${printerIncident.reference} ouvert`, 'ANTENNA_AGENT'));
  vehicle.failures.push({ id: uuid(), declaredAt: ago(24 * 5), declaredBy: { id: 'SEED', name: bke.chef?.name || 'Chef d’antenne', role: 'ANTENNA_AGENT' }, description: 'Bruit anormal au freinage ; véhicule immobilisé par précaution.', incidentId: null, incidentReference: null, interventions: [{ at: ago(24 * 3), by: admin.name, technician: 'Garage CFAO Bouaké', action: 'Diagnostic : plaquettes et disques avant à remplacer ; pièces commandées.' }], closedAt: null, outcome: null, report: '' });
  vehicle.history.push(h(ago(24 * 5), bke.chef?.name || 'Chef d’antenne', 'Panne déclarée', 'Bruit anormal au freinage', 'ANTENNA_AGENT'), h(ago(24 * 3), admin.name, 'Intervention enregistrée', 'Garage CFAO Bouaké : diagnostic, pièces commandées.'));

  // ===== Remontées du terrain =====
  const rep = [];
  const addRep = (o) => {
    const item = { id: uuid(), reference: ref('REM', rep.length + 1), antennaId: o.antenna.id, antennaName: o.antenna.name, category: o.category, priority: o.priority, title: o.title, description: o.description, status: o.status, createdBy: o.by, createdAt: o.at, messages: o.messages || [], decision: o.decision || null, history: [h(o.at, o.by.name, 'Remontée transmise au pilotage', '', 'ANTENNA_AGENT'), ...(o.history || [])], updatedAt: o.updatedAt || o.at, closedAt: o.closedAt || null };
    rep.push(item);
    return item;
  };
  const agentP = { id: agent.id, name: agent.name, role: agent.role };
  addRep({ antenna: abj, by: agentP, at: ago(20), category: 'EQUIPEMENT', priority: 'HAUTE', status: 'TRANSMISE',
    title: 'Besoin d’un second lecteur de QR code au guichet',
    description: 'Aux heures de pointe, un seul lecteur ne suffit pas : les partenaires attendent plus de 30 minutes. Nous demandons un second lecteur pour le guichet 2.' });
  addRep({ antenna: abj, by: agentP, at: ago(24 * 4), category: 'FORMATION', priority: 'NORMALE', status: 'EN_EXAMEN',
    title: 'Formation des nouveaux agents à la relecture des DUT',
    description: 'Deux agents arrivés ce mois-ci n’ont pas encore suivi la formation à la relecture. Nous proposons une session d’une demi-journée à l’antenne.',
    messages: [{ id: uuid(), at: ago(24 * 3), side: 'PILOTAGE', byId: admin.id, by: admin.name, text: 'Bien reçu. Pouvez-vous préciser les disponibilités des deux agents pour la semaine prochaine ?' }, { id: uuid(), at: ago(24 * 2), side: 'ANTENNE', byId: agent.id, by: agent.name, text: 'Ils sont disponibles mardi et jeudi matin.' }],
    history: [h(ago(24 * 3), admin.name, 'Réponse du pilotage'), h(ago(24 * 2), agent.name, 'Message de l’antenne', '', 'ANTENNA_AGENT')], updatedAt: ago(24 * 2) });
  addRep({ antenna: bke, by: { id: 'SEED', name: bke.chef?.name || 'Chef d’antenne', role: 'ANTENNA_AGENT' }, at: ago(24 * 10), category: 'LOCAUX', priority: 'NORMALE', status: 'DECIDEE',
    title: 'Salle d’attente trop petite pour les chauffeurs',
    description: 'Les chauffeurs attendent dehors pendant la relecture des dossiers, souvent sous la pluie.',
    decision: { code: 'PLANIFIEE', text: 'Aménagement d’un abri prévu au budget du prochain trimestre.', at: ago(24 * 6), by: { id: admin.id, name: admin.name, role: admin.role } },
    history: [h(ago(24 * 6), admin.name, 'Décision : Planifiée', 'Aménagement d’un abri prévu au budget du prochain trimestre.')], updatedAt: ago(24 * 6) });
  addRep({ antenna: spy, by: { id: 'SEED', name: spy.chef?.name || 'Chef d’antenne', role: 'ANTENNA_AGENT' }, at: ago(24 * 25), category: 'LOCAUX', priority: 'HAUTE', status: 'CLOSE',
    title: 'Onduleur nécessaire après les coupures d’électricité',
    description: 'Les coupures fréquentes endommagent le matériel réseau de l’antenne.',
    decision: { code: 'ACCEPTEE', text: 'Onduleur acheté et installé.', at: ago(24 * 18), by: { id: admin.id, name: admin.name, role: admin.role } },
    history: [h(ago(24 * 18), admin.name, 'Décision : Acceptée, mise en œuvre', 'Onduleur acheté et installé.'), h(ago(24 * 15), admin.name, 'Remontée clôturée')], updatedAt: ago(24 * 15), closedAt: ago(24 * 15) });

  // ===== Échanges avec les partenaires =====
  const partners = getAllPartners();
  const stfa = partners.find((p) => p.id === pAdmin.partnerId) || partners[0];
  const other = partners.find((p) => p.id !== stfa?.id);
  const threads = [];
  const addThread = (partner, nature, direction, subject, messages, status = 'OUVERT', readAt = {}) => {
    if (!partner) return;
    threads.push({ id: uuid(), reference: ref('ECH', threads.length + 1), partnerId: partner.id, partnerName: partner.name, nature, direction, subject, status, broadcast: false, createdAt: messages[0].at, createdBy: { id: messages[0].byId, name: messages[0].by, side: messages[0].side }, messages: messages.map((m) => ({ id: uuid(), ...m })), readAt });
  };
  const oicMsg = (at, t) => ({ at, side: 'OIC', byId: admin.id, by: admin.name, text: t });
  const pMsg = (at, t) => ({ at, side: 'PARTENAIRE', byId: pAdmin.id, by: pAdmin.name, text: t });
  addThread(stfa, 'EVOLUTION', 'OIC_VERS_PARTENAIRE', 'Nouveau DUT recto verso à partir du mois prochain', [oicMsg(ago(24 * 6), 'Le DUT imprimé passe au format recto verso. Les anciens modèles restent acceptés jusqu’à la fin du mois. Aucune action n’est requise de votre part.')], 'OUVERT', { OIC: ago(24 * 6) });
  addThread(stfa, 'PROPOSITION', 'PARTENAIRE_VERS_OIC', 'Être prévenus quand un DUT est validé', [pMsg(ago(24 * 3), 'Nos chauffeurs attendent parfois au guichet sans savoir que le DUT est déjà validé. Serait-il possible de recevoir un message à chaque validation ?'), oicMsg(ago(24 * 2), 'Merci pour cette proposition. Elle est étudiée avec l’équipe chargée de la messagerie de la plateforme ; nous reviendrons vers vous.')], 'OUVERT', { PARTENAIRE: ago(24 * 3), OIC: ago(24 * 2) });
  addThread(other, 'DECISION', 'OIC_VERS_PARTENAIRE', 'Rappel : carte de transport obligatoire', [oicMsg(ago(24 * 12), 'Tout DUT présentant une carte de transport expirée sera rejeté par l’antenne.')], 'CLOS', { OIC: ago(24 * 12) });

  incidentsRepo.saveAll(inc);
  reportsRepo.saveAll(rep);
  equipmentRepo.saveAll(eq);
  threadsRepo.saveAll(threads);
  writeObject(STORAGE_KEYS.LOT_D4_SEEDED, true);
  return true;
}
