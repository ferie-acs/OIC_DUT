// Lot d4 : incidents, remontées du terrain, équipements, échanges partenaires (services et règles, refus compris).
import assert from 'node:assert/strict';
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear(), key: (i) => [...store.keys()][i], get length() { return store.size; } };
globalThis.window = { matchMedia: () => ({ matches: false }), crypto: globalThis.crypto };
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true });
globalThis.document ??= { createElement: () => ({ style: {} }) };

const { seedDemoData } = await import('../js/seed.js');
const { syncAntennaDirectory } = await import('../js/services/antenna-directory.service.js');
const { seedLotD4 } = await import('../js/seed-lot-d4.js');
const { getAllUsers, setCurrentUser, clearCurrentUser } = await import('../js/repositories/users.repository.js');
const { getAllAuditLogs } = await import('../js/repositories/audit.repository.js');
const { can } = await import('../js/core/permissions.js');
const I = await import('../js/services/incidents.service.js');
const R = await import('../js/services/field-reports.service.js');
const E = await import('../js/services/equipment.service.js');
const X = await import('../js/services/partner-exchanges.service.js');
const incidentsRepo = await import('../js/repositories/incidents.repository.js');

seedDemoData();
const antennas = syncAntennaDirectory();
assert.equal(seedLotD4(), true, 'premier ensemencement');
const counts = () => [incidentsRepo.getAll().length, (await_reports()).length];
function await_reports() { return JSON.parse(localStorage.getItem('dut_field_reports_v1') || '[]'); }
const before = counts();
assert.equal(seedLotD4(), false, 'ensemencement idempotent');
assert.deepEqual(counts(), before, 'aucun doublon après un second appel');

const users = getAllUsers();
const as = (email) => { const u = users.find((x) => x.email === email); const { credential, ...s } = u; setCurrentUser(s); return s; };
const throwsMsg = (fn, re, label) => assert.throws(fn, re, label);
const auditCount = (action) => getAllAuditLogs().filter((l) => l.action === action).length;

// ---------------------------------------------------------------- Droits (moteur existant, aucun nouveau rôle)
assert.ok(can({ role: 'TRANSPORTEUR' }, 'incidents.declare'));
assert.ok(!can({ role: 'TRANSPORTEUR' }, 'incidents.manage'));
assert.ok(!can({ role: 'CONTROLLER' }, 'incidents.declare'));
assert.ok(can({ role: 'ANTENNA_AGENT' }, 'fieldreports.submit') && !can({ role: 'ANTENNA_AGENT' }, 'fieldreports.manage'));
assert.ok(can({ role: 'PARTNER_ADMIN' }, 'exchanges.partner') && !can({ role: 'PARTNER_EDITOR' }, 'exchanges.view'));
assert.ok(!can({ role: 'ANTENNA_AGENT' }, 'equipment.retire') && can({ role: 'OIC_ADMIN' }, 'equipment.retire'));

// ---------------------------------------------------------------- Incidents : déclaration
clearCurrentUser();
throwsMsg(() => I.listIncidents(), /Connectez-vous/, 'sans session');
const partner = as('partner.admin@demo.oic.ci');
throwsMsg(() => I.declareIncident({ category: 'INCONNUE', title: 'Titre correct', description: 'Une description suffisante' }), /Catégorie invalide/);
throwsMsg(() => I.declareIncident({ category: 'APPLICATIF', title: 'abc', description: 'Une description suffisante' }), /objet/);
throwsMsg(() => I.declareIncident({ category: 'PERFORMANCE', screen: 'VALIDATION', title: 'Lenteur forte', description: 'Écran très lent ce matin', observedAt: new Date().toISOString() }), /durée constatée/);
throwsMsg(() => I.declareIncident({ category: 'PERFORMANCE', screen: 'VALIDATION', durationSec: 40, title: 'Lenteur forte', description: 'Écran très lent ce matin', observedAt: new Date(Date.now() + 86400000).toISOString() }), /futur/);
const abj = antennas.find((a) => a.name === 'ABIDJAN SIEGE');
const inc = I.declareIncident({ category: 'APPLICATIF', severity: 'MINEURE', antennaId: abj.id, title: 'Erreur à l’enregistrement', description: 'Le brouillon ne s’enregistre pas à l’étape 3.', attachments: [{ name: 'capture.png', size: 1200, type: 'image/png', content: 'ignoré' }] });
assert.equal(inc.status, 'DECLARE');
assert.match(inc.reference, /^INC-\d{4}-\d{4}$/);
assert.deepEqual(Object.keys(inc.attachments[0]).sort(), ['name', 'size', 'type'], 'pièces en métadonnées seulement');
assert.equal(inc.declaredBy.partnerId, partner.partnerId);
assert.ok(auditCount('INCIDENT_DECLARED') >= 1, 'déclaration journalisée');
const perf = I.declareIncident({ category: 'PERFORMANCE', severity: 'MAJEURE', antennaId: abj.id, screen: 'IMPRESSION', durationSec: 75, observedAt: new Date(Date.now() - 3600000).toISOString(), title: 'Impression très lente', description: 'Le DUT met plus d’une minute à s’afficher.' });
assert.equal(perf.performance.durationSec, 75);

// Cloisonnement : un agent d'antenne déclare toujours pour sa propre antenne.
const agent = as('antenne.agent@demo.oic.ci');
const other = antennas.find((a) => a.name === 'KORHOGO');
const agentInc = I.declareIncident({ category: 'RESEAU', severity: 'CRITIQUE', antennaId: other.id, title: 'Connexion coupée', description: 'Aucune connexion depuis une heure.' });
assert.equal(agentInc.antennaId, agent.antennaId, 'antenne forcée à celle de l’agent');

// Visibilité : le transporteur ne voit pas l'incident du partenaire ; l'éditeur du même partenaire le voit.
as('transporteur@demo.oic.ci');
throwsMsg(() => I.getIncident(inc.id), /hors de votre périmètre/);
assert.ok(!I.listIncidents().some((i) => i.id === inc.id));
as('partner.editor@demo.oic.ci');
assert.equal(I.getIncident(inc.id).id, inc.id);
throwsMsg(() => I.qualifyIncident(inc.id, { severity: 'MAJEURE', impact: 'ANTENNE' }), /rôle ne permet pas/, 'qualification refusée au partenaire');

// ---------------------------------------------------------------- Qualifier, attribuer, traiter, clore
const admin = as('oic.admin@demo.oic.ci');
throwsMsg(() => I.assignIncident(inc.id, { team: 'SUPPORT', assigneeId: admin.id }), /Qualifiez/, 'attribution avant qualification');
throwsMsg(() => I.resolveIncident(inc.id, { cause: 'Cause connue', solution: 'Solution ok' }), /attribué/, 'résolution d’un incident non attribué');
I.qualifyIncident(inc.id, { severity: 'MAJEURE', impact: 'ANTENNE', note: 'Bloquant pour les brouillons' });
assert.equal(I.getIncident(inc.id).status, 'QUALIFIE');
assert.equal(I.getIncident(inc.id).severity, 'MAJEURE');
throwsMsg(() => I.assignIncident(inc.id, { team: 'SUPPORT', assigneeId: users.find((u) => u.role === 'PARTNER_ADMIN').id }), /responsable habilité/, 'un partenaire ne peut pas être responsable');
I.assignIncident(inc.id, { team: 'ANTENNE', assigneeId: agent.id });
assert.equal(I.getIncident(inc.id).status, 'ATTRIBUE');
// Agent d'une autre antenne : refusé comme responsable d'un incident de Korhogo.
const korInc = I.declareIncident({ category: 'PROCEDURE', antennaId: other.id, title: 'Procédure locale', description: 'Question sur la procédure locale.' });
I.qualifyIncident(korInc.id, { severity: 'MINEURE', impact: 'ANTENNE' });
throwsMsg(() => I.assignIncident(korInc.id, { team: 'ANTENNE', assigneeId: agent.id }), /responsable habilité/, 'agent d’une autre antenne refusé');

// Le responsable attribué traite et propose une résolution ; un autre rôle est refusé.
as('partner.admin@demo.oic.ci');
throwsMsg(() => I.followIncident(inc.id, 'Je regarde'), /responsable attribué/);
as('antenne.agent@demo.oic.ci');
I.followIncident(inc.id, 'Problème reproduit au guichet 1.');
assert.equal(I.getIncident(inc.id).status, 'EN_TRAITEMENT');
throwsMsg(() => I.closeIncident(inc.id), /rôle ne permet pas/, 'clôture réservée à l’OIC');
I.resolveIncident(inc.id, { cause: 'Cache du navigateur saturé', solution: 'Cache vidé et poste mis à jour' });
assert.equal(I.getIncident(inc.id).status, 'RESOLU');

// Le déclarant conteste : retour en traitement ; puis nouvelle résolution et clôture par l'OIC.
as('partner.admin@demo.oic.ci');
I.reopenIncident(inc.id, 'Le problème est revenu ce matin.');
assert.equal(I.getIncident(inc.id).status, 'EN_TRAITEMENT');
as('antenne.agent@demo.oic.ci');
I.resolveIncident(inc.id, { cause: 'Extension du navigateur en conflit', solution: 'Extension désactivée sur les postes' });
as('oic.admin@demo.oic.ci');
I.closeIncident(inc.id, 'Vérifié avec le partenaire.');
const closed = I.getIncident(inc.id);
assert.equal(closed.status, 'CLOS');
throwsMsg(() => I.closeIncident(inc.id), /Seul un incident résolu/, 'double clôture refusée');
throwsMsg(() => I.qualifyIncident(inc.id, { severity: 'MINEURE', impact: 'UTILISATEUR' }), /ne peut plus/);
assert.ok(closed.history.length >= 7, 'historique complet');
assert.ok(['INCIDENT_QUALIFIED', 'INCIDENT_ASSIGNED', 'INCIDENT_RESOLVED', 'INCIDENT_REOPENED', 'INCIDENT_CLOSED'].every((a) => auditCount(a) >= 1), 'chaque étape journalisée');

// ---------------------------------------------------------------- Délais cibles et alertes
const now = Date.now();
const late = { ...perf, declaredAt: new Date(now - 30 * 3600000).toISOString(), status: 'QUALIFIE', deadlineAlertAt: null };
incidentsRepo.upsert(late);
assert.ok(I.isOverdue(late, now));
assert.ok(!I.isOverdue({ ...late, status: 'RESOLU' }, now), 'résolu : plus en retard');
const alertsBefore = auditCount('INCIDENT_DEADLINE_EXCEEDED');
const alerted = I.scanDeadlines(now);
assert.ok(alerted.some((i) => i.id === perf.id));
assert.equal(I.scanDeadlines(now).length, 0, 'une seule alerte par incident');
assert.ok(auditCount('INCIDENT_DEADLINE_EXCEEDED') > alertsBefore);
assert.ok(I.incidentAlerts().some((i) => i.id === perf.id));
assert.ok(I.overdueIncidents({ antennaId: abj.id }).some((i) => i.id === perf.id));
const byAntenna = I.incidentsByAntenna();
assert.ok(byAntenna.find((r) => r.antennaId === abj.id).overdue >= 1);
assert.equal(I.dueAt({ severity: 'CRITIQUE', declaredAt: '2026-01-01T00:00:00.000Z' }), '2026-01-01T04:00:00.000Z');

// ---------------------------------------------------------------- Suivi des lenteurs
const stats = I.performanceStats({ days: 30 });
assert.ok(stats.count >= 10 && stats.antennasTouched >= 4);
assert.ok(stats.maxSec >= 120 && stats.averageSec > 0);
assert.ok(stats.byScreen[0].count >= stats.byScreen[stats.byScreen.length - 1].count, 'écrans triés par fréquence');
assert.equal(stats.bySlot.reduce((n, s) => n + s.count, 0), stats.count, 'tranches horaires complètes');
as('antenne.agent@demo.oic.ci');
throwsMsg(() => I.performanceStats(), /rôle ne permet pas/, 'suivi des lenteurs réservé à l’OIC');

// ---------------------------------------------------------------- Remontées du terrain
const report = R.submitReport({ category: 'EFFECTIFS', priority: 'HAUTE', title: 'Renfort pour la campagne cacao', description: 'Le volume double pendant la campagne ; un agent de plus est nécessaire.' });
assert.equal(report.antennaId, agent.antennaId);
assert.equal(report.status, 'TRANSMISE');
throwsMsg(() => R.decideReport(report.id, { code: 'ACCEPTEE', text: 'Accordé' }), /rôle ne permet pas/);
R.replyToReport(report.id, 'Précision : de septembre à décembre.');
assert.equal(R.getReport(report.id).status, 'TRANSMISE', 'un message de l’antenne ne change pas l’état');
as('partner.admin@demo.oic.ci');
throwsMsg(() => R.listReports(), /rôle ne permet pas/);
as('oic.admin@demo.oic.ci');
throwsMsg(() => R.submitReport({ category: 'AUTRE', title: 'Remontée nationale', description: 'Le pilotage ne remonte pas vers lui-même.' }), /rôle ne permet pas/);
R.replyToReport(report.id, 'Demande transmise à la direction des ressources humaines.');
assert.equal(R.getReport(report.id).status, 'EN_EXAMEN');
throwsMsg(() => R.closeReport(report.id), /décision/);
R.decideReport(report.id, { code: 'PLANIFIEE', text: 'Renfort prévu du 1er septembre au 31 décembre.' });
throwsMsg(() => R.decideReport(report.id, { code: 'NON_RETENUE', text: 'Changement d’avis' }), /déjà été rendue/);
R.closeReport(report.id, 'Renfort confirmé.');
assert.equal(R.getReport(report.id).status, 'CLOSE');
throwsMsg(() => R.replyToReport(report.id, 'Encore un mot'), /n’accepte plus/);
// Cloisonnement : l'agent d'Abidjan ne voit pas la remontée de Bouaké.
as('antenne.agent@demo.oic.ci');
const bouake = await_reports().find((r) => r.antennaName === 'BOUAKE');
throwsMsg(() => R.getReport(bouake.id), /hors de votre périmètre/);
assert.ok(R.listReports().every((r) => r.antennaId === agent.antennaId));

// ---------------------------------------------------------------- Équipements
const mine = E.listEquipment();
assert.ok(mine.length > 0 && mine.every((e) => e.antennaId === agent.antennaId), 'l’agent ne voit que son antenne');
throwsMsg(() => E.registerEquipment({ antennaId: other.id, type: 'TABLETTE', label: 'Tablette', serialNumber: 'TAB-000', acquiredAt: '2025-01-01' }), /recenser que|antenne/i, 'recensement hors antenne refusé');
const eq = E.registerEquipment({ type: 'TABLETTE', label: 'Samsung Tab A9', serialNumber: 'tab-a9-0001', acquiredAt: '2025-02-01' });
assert.equal(eq.serialNumber, 'TAB-A9-0001');
assert.equal(eq.antennaId, agent.antennaId);
throwsMsg(() => E.registerEquipment({ type: 'TABLETTE', label: 'Doublon', serialNumber: 'TAB-A9-0001', acquiredAt: '2025-02-01' }), /déjà recensé/);
throwsMsg(() => E.registerEquipment({ type: 'TABLETTE', label: 'Futur', serialNumber: 'TAB-FUT-1', acquiredAt: '2999-01-01' }), /futur/);
const holders = E.holdersFor(eq);
assert.ok(holders.some((h) => h.id === agent.id) && holders.some((h) => h.id.startsWith('chef:')));
E.assignEquipment(eq.id, agent.id);
assert.equal(E.getEquipment(eq.id).holder.name, agent.name);
throwsMsg(() => E.assignEquipment(eq.id, users.find((u) => u.role === 'PARTNER_ADMIN').id), /agent de l’antenne/);
E.declareFailure(eq.id, { description: 'Écran fissuré, tactile inutilisable.', withIncident: true, severity: 'MINEURE' });
const broken = E.getEquipment(eq.id);
assert.equal(broken.status, 'EN_PANNE');
const failure = E.currentFailure(broken);
assert.ok(failure.incidentId, 'incident matériel lié');
assert.equal(I.getIncident(failure.incidentId).category, 'MATERIEL');
throwsMsg(() => E.declareFailure(eq.id, { description: 'Seconde panne déclarée' }), /déjà en cours/);
E.addIntervention(eq.id, { technician: 'Prestataire informatique', action: 'Écran commandé.' });
assert.equal(E.getEquipment(eq.id).status, 'EN_REPARATION');
throwsMsg(() => E.closeRepair(eq.id, { outcome: 'IRREPARABLE', report: 'Trop cher à réparer' }), /décidée par l’OIC/, 'réforme refusée à l’antenne');
E.closeRepair(eq.id, { outcome: 'REPARE', report: 'Écran remplacé, tablette testée.' });
assert.equal(E.getEquipment(eq.id).status, 'EN_SERVICE');
assert.ok(I.getIncident(failure.incidentId).history.some((h) => h.label === 'Équipement réparé'), 'note reportée sur l’incident');
as('partner.admin@demo.oic.ci');
throwsMsg(() => E.listEquipment(), /rôle ne permet pas/);
as('oic.admin@demo.oic.ci');
assert.ok(E.listEquipment().length > mine.length, 'l’OIC voit tout le parc');
E.declareFailure(eq.id, { description: 'Batterie gonflée, danger.' });
E.closeRepair(eq.id, { outcome: 'IRREPARABLE', report: 'Batterie non remplaçable ; réforme.' });
const retired = E.getEquipment(eq.id);
assert.equal(retired.status, 'REFORME');
assert.equal(retired.holder, null, 'affectation levée à la réforme');
throwsMsg(() => E.assignEquipment(eq.id, agent.id), /réformé/);
assert.ok(E.brokenEquipment().length >= 2);
assert.ok(E.equipmentByAntenna().find((r) => r.antennaName === 'ABIDJAN SIEGE').broken >= 1);
assert.ok(['EQUIPMENT_REGISTERED', 'EQUIPMENT_ASSIGNED', 'EQUIPMENT_FAILURE', 'EQUIPMENT_INTERVENTION', 'EQUIPMENT_REPAIRED', 'EQUIPMENT_RETIRED'].every((a) => auditCount(a) >= 1));

// ---------------------------------------------------------------- Échanges partenaires
const pa = as('partner.admin@demo.oic.ci');
const startCount = X.listThreads().length;
assert.ok(X.listThreads().every((t) => t.partnerId === pa.partnerId), 'le partenaire ne voit que ses échanges');
throwsMsg(() => X.startThread({ nature: 'EVOLUTION', subject: 'Nature OIC', text: 'Le partenaire ne publie pas d’évolution.' }), /Nature invalide/);
const [mineThread] = X.startThread({ nature: 'DIFFICULTE', partnerId: 'autre', subject: 'Retard de validation à Bouaké', text: 'Nos DUT attendent plus de deux jours.' });
assert.equal(mineThread.partnerId, pa.partnerId, 'un partenaire écrit toujours pour sa propre entreprise');
assert.equal(X.listThreads().length, startCount + 1);
as('partner.editor@demo.oic.ci');
throwsMsg(() => X.listThreads(), /rôle ne permet pas/, 'éditeur non habilité');
as('oic.admin@demo.oic.ci');
assert.ok(X.listThreads().find((t) => t.id === mineThread.id).unread, 'non lu côté OIC');
X.openThread(mineThread.id);
assert.ok(!X.listThreads().find((t) => t.id === mineThread.id).unread, 'lu après ouverture');
X.replyToThread(mineThread.id, 'Nous relançons l’antenne de Bouaké.');
const broadcast = X.startThread({ nature: 'INFORMATION', partnerId: 'ALL', subject: 'Maintenance samedi', text: 'La plateforme sera indisponible samedi de 6 h à 8 h.' });
assert.equal(broadcast.length, X.partners().length, 'diffusion : un fil par partenaire');
X.closeThread(mineThread.id, 'Situation rétablie.');
as('partner.admin@demo.oic.ci');
assert.ok(X.listThreads().find((t) => t.id === mineThread.id).unread, 'réponse de l’OIC non lue côté partenaire');
throwsMsg(() => X.replyToThread(mineThread.id, 'Merci'), /clos/);
throwsMsg(() => X.closeThread(broadcast[0].id), /rôle ne permet pas/);
const foreign = broadcast.find((t) => t.partnerId !== pa.partnerId);
if (foreign) throwsMsg(() => X.openThread(foreign.id), /hors de votre périmètre/, 'fil d’un autre partenaire');

console.log('lot-d4 : OK');
