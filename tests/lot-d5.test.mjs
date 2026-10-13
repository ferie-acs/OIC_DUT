// Lot d5 : pilotage de la Direction générale — services, calculs et refus.
import assert from 'node:assert/strict';
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear(), key: (i) => [...store.keys()][i], get length() { return store.size; } };
globalThis.window = { matchMedia: () => ({ matches: false }), crypto: globalThis.crypto };
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true });
globalThis.document ??= { createElement: () => ({ style: {} }) };

const { seedDemoData, ensureSignedDemoData } = await import('../js/seed.js');
const { seedLotD5 } = await import('../js/seed-lot-d5.js');
const { readObject, writeObject } = await import('../js/core/storage.js');
const { can } = await import('../js/core/permissions.js');
const O = await import('../js/services/objectives.service.js');
const A = await import('../js/services/agents.service.js');
const D = await import('../js/services/direction-documents.service.js');
const M = await import('../js/services/meetings.service.js');
const L = await import('../js/services/legal-contracts.service.js');
const P = await import('../js/services/pilotage.service.js');
const { getAllAuditLogs } = await import('../js/repositories/audit.repository.js');

seedDemoData(); await ensureSignedDemoData(); seedLotD5();
const users = () => readObject('dut_users', []);
const as = (email) => { const u = users().find((x) => x.email === email); assert.ok(u, email); const { credential, ...s } = u; writeObject('dut_current_user', s); return u; };
const iso = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

// ---------------------------------------------------------------- Rôle et amorçage
const direction = users().find((u) => u.email === 'direction@demo.oic.ci');
assert.equal(direction.role, 'DIRECTION');
assert.ok(can(direction, 'pilotage.view') && can(direction, 'objectives.validate'));
assert.ok(can(direction, 'fieldreports.view') && can(direction, 'fieldreports.manage'), 'droits proposés par le lot d4');
for (const p of ['dut.create', 'dut.edit_draft', 'dut.submit', 'dut.validate', 'dut.reject', 'dut.suspend', 'dut.withdraw', 'admin.manage']) assert.ok(!can(direction, p), `la Direction n’a pas ${p}`);
const countsBefore = ['dut_users', 'dut_pilot_contracts_v1', 'dut_pilot_indicators_v1', 'dut_agent_profiles_v1', 'dut_direction_documents_v1', 'dut_meetings_v1', 'dut_legal_contracts_v1'].map((k) => readObject(k, []).length);
seedLotD5(); seedLotD5();
assert.deepEqual(['dut_users', 'dut_pilot_contracts_v1', 'dut_pilot_indicators_v1', 'dut_agent_profiles_v1', 'dut_direction_documents_v1', 'dut_meetings_v1', 'dut_legal_contracts_v1'].map((k) => readObject(k, []).length), countsBefore, 'amorçage idempotent');

// ---------------------------------------------------------------- Calculs d'atteinte (purs)
assert.deepEqual(O.attainment(10, 8, 'high'), { taux: 80, ecart: -2, favorable: false, statut: 'PROCHE' });
assert.deepEqual(O.attainment(10, 12, 'high'), { taux: 120, ecart: 2, favorable: true, statut: 'ATTEINT' });
assert.deepEqual(O.attainment(12, 24, 'low'), { taux: 50, ecart: 12, favorable: false, statut: 'NON_ATTEINT' }, 'délai : plus bas = mieux');
assert.deepEqual(O.attainment(12, 6, 'low'), { taux: 200, ecart: -6, favorable: true, statut: 'ATTEINT' }, 'plafond 200 %');
assert.equal(O.attainment(10, 0, 'low').taux, 100, 'aucun rejet : objectif « plus bas » atteint');
assert.equal(O.attainment(0, 5, 'high').taux, 100, 'cible nulle');
assert.equal(O.attainment(10, null).statut, 'SANS_RESULTAT');
assert.equal(O.attainment(3, 1, 'high').taux, 33.3);
assert.equal(O.globalAttainment([120, 50, null, 80]), 76.7, 'moyenne plafonnée à 100 %, sans les objectifs sans résultat');
assert.equal(O.globalAttainment([null]), null);

// ---------------------------------------------------------------- Contrats d'objectifs : cycle et séparation des tâches
as('oic.admin@demo.oic.ci');
const antennas = readObject('dut_antennas', []);
const abj = antennas.find((a) => a.name === 'ABIDJAN SIEGE');
const man = antennas.find((a) => a.name === 'MAN');
const inds = O.listIndicators();
const iValides = inds.find((i) => i.source === 'dutValides');
const iSensib = inds.find((i) => i.code === 'IND-05');
assert.throws(() => O.saveContract({ title: 'X', periodLabel: 'T', from: iso(0), to: iso(-1), lines: [{ indicatorId: iValides.id, antennaId: man.id, target: 3 }] }), /fin doit suivre/);
assert.throws(() => O.saveContract({ title: 'X', periodLabel: 'T', from: iso(-10), to: iso(30), lines: [] }), /au moins un objectif/);
assert.throws(() => O.saveContract({ title: 'X', periodLabel: 'T', from: iso(-10), to: iso(30), lines: [{ indicatorId: iValides.id, antennaId: man.id, target: -1 }] }), /Cible invalide/);
assert.throws(() => O.saveContract({ title: 'X', periodLabel: 'T', from: iso(-10), to: iso(30), lines: [{ indicatorId: iValides.id, antennaId: man.id, target: 2 }, { indicatorId: iValides.id, antennaId: man.id, target: 3 }] }), /deux fois/);
const c = O.saveContract({ title: 'Contrat de test', periodLabel: 'Test', from: iso(-30), to: iso(30), lines: [{ indicatorId: iValides.id, antennaId: abj.id, target: 4 }, { indicatorId: iSensib.id, antennaId: man.id, target: 2 }] });
assert.equal(c.status, 'BROUILLON'); assert.match(c.reference, /^CO-\d{4}-\d{3}$/);
assert.throws(() => O.recordResult(c.id, c.lines[0].id, { value: 3 }), /contrat en vigueur/);
O.submitContract(c.id);
assert.throws(() => O.saveContract({ ...c, lines: c.lines }, c.id), /en préparation/);
assert.throws(() => O.validateContract(c.id), /rôle ne permet pas/, 'l’Admin OIC prépare mais ne valide pas');
as('direction@demo.oic.ci');
assert.throws(() => O.rejectContract(c.id, ''), /obligatoire/);
O.rejectContract(c.id, 'Cible de Man à revoir.');
assert.equal(O.getContract(c.id).status, 'BROUILLON');
O.submitContract(c.id); // la Direction resoumet : elle ne pourra plus valider elle-même
assert.throws(() => O.validateContract(c.id), /autre personne/);
O.rejectContract(c.id, 'Resoumission par le préparateur.'); // renvoi : le préparateur resoumet
as('oic.admin@demo.oic.ci'); O.submitContract(c.id);
as('direction@demo.oic.ci');
const validated = O.validateContract(c.id);
assert.equal(validated.status, 'VALIDE'); assert.equal(validated.validatedBy.id, direction.id);

// ---------------------------------------------------------------- Résultats, écarts, cloisonnement de l'antenne
as('antenne.agent@demo.oic.ci');
const agentView = O.listContracts();
assert.ok(agentView.every((x) => x.status === 'VALIDE' || x.status === 'CLOTURE'), 'l’antenne ne voit que les contrats en vigueur ou clôturés');
assert.ok(agentView.flatMap((x) => x.lines).every((l) => l.assignee.antennaId === abj.id), 'l’antenne ne voit que ses objectifs');
const lineManId = c.lines[1].id, lineAbjId = c.lines[0].id;
assert.throws(() => O.recordResult(c.id, lineManId, { value: 1 }), /votre antenne/);
assert.throws(() => O.recordResult(c.id, lineAbjId, { value: -2 }), /positif/);
assert.throws(() => O.recordResult(c.id, lineAbjId, { value: 2, date: iso(3) }), /futur/);
assert.throws(() => O.recordResult(c.id, lineAbjId, { value: 2, date: iso(-60) }), /précède/);
const measured = O.measuredValue(c.id, lineAbjId);
assert.equal(typeof measured, 'number');
const l1 = O.recordResult(c.id, lineAbjId, { value: 2, date: iso(-1), comment: 'Relevé' });
assert.equal(l1.taux, 50); assert.equal(l1.ecart, -2); assert.equal(l1.statut, 'NON_ATTEINT');
const l2 = O.recordResult(c.id, lineAbjId, { value: 5, date: iso(0) });
assert.equal(l2.taux, 125); assert.equal(l2.statut, 'ATTEINT'); assert.equal(l2.results.length, 2, 'historique conservé');
assert.throws(() => O.saveContract({ title: 'Y', periodLabel: 'T', from: iso(0), to: iso(1), lines: [] }), /rôle ne permet pas/);
assert.throws(() => O.attainmentByAntenna(), /rôle ne permet pas/);
as('transporteur@demo.oic.ci');
assert.throws(() => O.listContracts(), /rôle ne permet pas/);
as('oic.admin@demo.oic.ci');
O.recordResult(c.id, lineManId, { value: 1, date: iso(0) });
const full = O.getContract(c.id);
assert.equal(full.global, 75, 'global : (min(125,100) + 50) / 2');
assert.equal(full.nonAtteints, 1);
const byAntenna = O.attainmentByAntenna();
assert.ok(byAntenna.some((r) => r.antennaId === man.id && r.taux === 50));

// ---------------------------------------------------------------- Actions correctives
assert.throws(() => O.createAction(c.id, lineAbjId, { title: 'Inutile', responsible: 'X', dueDate: iso(5) }), /atteint/);
assert.throws(() => O.createAction(c.id, lineManId, { title: 'Relance', responsible: 'Chef', dueDate: iso(-1) }), /passée/);
assert.throws(() => O.createAction(c.id, lineManId, { title: '', responsible: 'Chef', dueDate: iso(5) }), /obligatoire/);
const action = O.createAction(c.id, lineManId, { title: 'Organiser deux séances', responsible: 'Chef d’antenne de Man', dueDate: iso(10) });
assert.equal(action.status, 'A_LANCER');
as('antenne.agent@demo.oic.ci');
assert.throws(() => O.updateAction(action.id, { status: 'EN_COURS', comment: 'ok' }), /votre antenne/, 'l’antenne d’Abidjan ne suit pas Man');
as('oic.admin@demo.oic.ci');
assert.throws(() => O.updateAction(action.id, { status: 'EN_COURS', comment: '' }), /obligatoire/);
O.updateAction(action.id, { status: 'EN_COURS', comment: 'Première séance fixée.' });
const done = O.updateAction(action.id, { status: 'REALISEE', comment: 'Deux séances tenues.' });
assert.equal(done.updates.length, 3);
assert.throws(() => O.updateAction(action.id, { status: 'EN_COURS', comment: 'Rouvrir' }), /close/);
const overdue = O.overdueActions();
assert.ok(overdue.length >= 1 && overdue.every((a) => a.late && !a.closed), 'action amorcée en retard remontée');
O.closeContract(c.id, 'Bilan : objectif d’Abidjan atteint, Man en retrait.');
assert.throws(() => O.recordResult(c.id, lineAbjId, { value: 6 }), /contrat en vigueur/);

// ---------------------------------------------------------------- Indicateurs
assert.throws(() => O.saveIndicator({ code: 'IND-01', label: 'Doublon', source: 'MANUEL' }), /déjà utilisé/);
assert.throws(() => O.saveIndicator({ code: 'X', label: 'Libellé', unit: '' }, iValides.id), /déjà utilisé dans un contrat/);
const created = O.saveIndicator({ code: 'ind-07', label: 'Réclamations traitées', source: 'MANUEL', unit: 'réclamations', better: 'high' });
assert.equal(created.code, 'IND-07');
const auto = O.saveIndicator({ code: 'IND-08', label: 'Délai mesuré', source: 'delaiValidationH', unit: 'ignoré', better: 'high' });
assert.equal(auto.better, 'low', 'une mesure automatique reprend le sens du catalogue'); assert.equal(auto.unit, 'h');

// ---------------------------------------------------------------- Suivi des antennes et rapport
const period = P.periodPreset('90j');
const perf = P.antennaPerformance(period, { rankBy: 'dutValides' });
assert.equal(perf.rows.length, antennas.length);
assert.ok(perf.rows.every((r, i) => r.rang === i + 1));
const actives = perf.rows.filter((r) => r.actif);
assert.ok(actives.length >= 2 && perf.rows.slice(0, actives.length).every((r) => r.actif), 'antennes actives classées d’abord');
assert.ok(actives.every((r, i) => i === 0 || actives[i - 1].values.dutValides >= r.values.dutValides));
assert.equal(perf.rows.reduce((s, r) => s + r.values.dutCrees, 0), perf.national.dutCrees, 'la somme des antennes égale le national');
const byDelay = P.antennaPerformance(period, { rankBy: 'delaiValidationH' }).rows.filter((r) => r.actif);
assert.ok(byDelay.every((r, i) => i === 0 || byDelay[i - 1].values.delaiValidationH <= r.values.delaiValidationH), 'délai : le plus court en tête');
assert.deepEqual(P.previousPeriod({ from: '2026-10-01', to: '2026-10-31' }), { from: '2026-08-31', to: '2026-09-30' });
assert.throws(() => P.antennaPerformance({ from: '2026-10-10', to: '2026-10-01' }), /fin doit suivre/);
const report = P.periodicReport(period, { label: '90 derniers jours' });
const csv = P.reportCsv(report);
assert.ok(csv.includes('Rapport périodique') && csv.includes('ABIDJAN SIEGE') && csv.includes('National'));
{
  const table = csv.split('\n\n')[1].split('\n');
  const head = table[0].split(';');
  assert.ok(head.includes('DUT validés') && head.includes('Taux d’atteinte des objectifs (%)'), 'toutes les colonnes d’indicateurs figurent dans l’en-tête');
  assert.ok(table.every((l) => l.split(';').length === head.length), 'chaque ligne a autant de cellules que l’en-tête');
  const abj = table.find((l) => l.includes('ABIDJAN SIEGE')).split(';');
  assert.equal(Number(abj[head.indexOf('DUT validés')]), perf.rows.find((r) => r.name === 'ABIDJAN SIEGE').values.dutValides);
}
P.logReportExport(report, 'CSV');
assert.ok(getAllAuditLogs().some((e) => e.action === 'PILOT_REPORT_EXPORTED'));
const attention = P.attentionPoints();
assert.ok(attention.contratsAValider >= 1 && attention.documentsAValider >= 1 && attention.decisionsEnRetard >= 1 && attention.contratsEcheance >= 1);
as('antenne.agent@demo.oic.ci');
assert.throws(() => P.antennaPerformance(period), /rôle ne permet pas/);
as('partner.admin@demo.oic.ci');
assert.throws(() => P.periodicReport(period), /rôle ne permet pas/);

// ---------------------------------------------------------------- Agents
as('oic.admin@demo.oic.ci');
const fatouProfile = A.listAgents().find((p) => p.matricule === 'OIC-0412');
assert.ok(fatouProfile.userId);
assert.throws(() => A.saveAgentProfile({ matricule: 'OIC-0412', name: 'Doublon', fonction: 'Agent', antennaId: man.id, assignedAt: iso(-1), responsibilities: 'x' }), /matricule/);
assert.throws(() => A.saveAgentProfile({ matricule: 'OIC-0999', name: 'Autre', fonction: 'Agent', antennaId: man.id, assignedAt: iso(-1), responsibilities: 'x', userId: fatouProfile.userId }), /déjà rattaché/);
assert.throws(() => A.saveAgentProfile({ matricule: 'OIC-0999', name: 'Sans antenne', fonction: 'Agent', antennaId: 'inconnue', assignedAt: iso(-1), responsibilities: 'x' }), /antenne/);
const moved = A.saveAgentProfile({ ...fatouProfile, antennaId: man.id }, fatouProfile.id);
assert.ok(moved.history.some((h) => /Réaffectation/.test(h.label)));
assert.throws(() => A.evaluateAgent(fatouProfile.id, { period: 'T4 2026', scores: { volume: 6 }, comment: 'Commentaire suffisant.' }), /de 1 à 5/);
assert.throws(() => A.evaluateAgent(fatouProfile.id, { period: 'T3 2026', scores: { volume: 3, objectifs: 3, qualite: 3, delais: 3, procedures: 3, integrite: 3 }, comment: 'Commentaire suffisant.' }), /déjà été évalué/);
const ev = A.evaluateAgent(fatouProfile.id, { period: 'T4 2026', scores: { volume: 5, objectifs: 4, qualite: 4, delais: 3, procedures: 4, integrite: 5 }, comment: 'Bon trimestre, délais à tenir.' });
assert.equal(ev.note, 4.2); assert.equal(ev.appreciation, 'Très satisfaisant');
assert.deepEqual(A.overallScore({ volume: 5, objectifs: 5, qualite: 5, delais: 4, procedures: 5, integrite: 5 }), { note: 4.8, appreciation: 'Excellent' });
const ctrlProfile = A.listAgents().find((p) => p.matricule === 'OIC-0533');
as('controle.agent@demo.oic.ci');
assert.throws(() => A.evaluateAgent(ctrlProfile.id, { period: 'T4 2026', scores: {}, comment: 'x' }), /rôle ne permet pas/);
// Le compte Direction rattaché à une fiche ne peut pas s'évaluer.
as('oic.admin@demo.oic.ci');
const dirProfile = A.saveAgentProfile({ matricule: 'DG-0001', name: direction.name, fonction: 'Directrice générale adjointe', antennaId: abj.id, assignedAt: iso(-500), responsibilities: 'Pilotage du réseau', userId: direction.id });
as('direction@demo.oic.ci');
assert.throws(() => A.evaluateAgent(dirProfile.id, { period: 'T4 2026', scores: { volume: 5, objectifs: 5, qualite: 5, delais: 5, procedures: 5, integrite: 5 }, comment: 'Auto-évaluation interdite.' }), /lui-même/);
const detail = A.agentDetail(fatouProfile.id);
assert.ok(detail.activity.valides >= 1, 'activité mesurée à partir du journal');
assert.ok(detail.evaluations.length === 2 && !('credential' in detail.user));

// ---------------------------------------------------------------- Documents
as('oic.admin@demo.oic.ci');
assert.throws(() => D.depositDocument({ title: 'Doc', category: 'INCONNUE', file: { name: 'a.pdf', size: 10 } }), /catégorie/);
assert.throws(() => D.depositDocument({ title: 'Doc', category: 'RAPPORT', file: { name: 'a.exe', size: 10 } }), /Format/);
assert.throws(() => D.depositDocument({ title: 'Doc', category: 'RAPPORT', file: { name: 'a.pdf', size: 30 * 1024 * 1024 } }), /20 Mo/);
const doc = D.depositDocument({ title: 'Rapport mensuel de Man', category: 'RAPPORT', antennaId: man.id, file: { name: 'rapport-man.pdf', size: 2048, type: 'application/pdf' } });
assert.equal(doc.status, 'EN_VALIDATION');
assert.ok(!JSON.stringify(readObject('dut_direction_documents_v1')).includes('base64'), 'aucun contenu binaire stocké');
assert.throws(() => D.validateDocument(doc.id), /autre personne/);
assert.throws(() => D.addVersion(doc.id, { file: { name: 'v2.pdf', size: 1 }, note: 'Correction' }), /attend encore/);
assert.throws(() => D.archiveDocument(doc.id, 'Ancien'), /Validez ou refusez/);
as('direction@demo.oic.ci');
assert.throws(() => D.rejectDocument(doc.id, ''), /obligatoire/);
D.rejectDocument(doc.id, 'Tableau des rejets incomplet.');
as('oic.admin@demo.oic.ci');
const v2 = D.addVersion(doc.id, { file: { name: 'rapport-man-v2.pdf', size: 3000 }, note: 'Tableau complété' });
assert.equal(v2.current.n, 2); assert.equal(v2.versions[0].status, 'REFUSE');
as('direction@demo.oic.ci');
assert.equal(D.validateDocument(doc.id).status, 'VALIDE');
D.classifyDocument(doc.id, { title: 'Rapport mensuel — Man', category: 'REGISTRE', antennaId: man.id });
const archived = D.archiveDocument(doc.id, 'Remplacé par le rapport trimestriel.');
assert.equal(archived.status, 'ARCHIVE');
assert.throws(() => D.addVersion(doc.id, { file: { name: 'v3.pdf', size: 1 }, note: 'x' }), /archivé/);
assert.ok(!D.listDocuments().some((d) => d.id === doc.id) && D.listDocuments({ includeArchived: true }).some((d) => d.id === doc.id), 'archivé : hors liste courante, consultable');
assert.ok(D.getDocument(doc.id).journal.length >= 5, 'chaque étape est journalisée');
as('antenne.agent@demo.oic.ci');
assert.throws(() => D.listDocuments(), /rôle ne permet pas/);

// ---------------------------------------------------------------- Réunions et décisions
as('oic.admin@demo.oic.ci');
assert.throws(() => M.saveMeeting({ title: 'Réunion', date: `${iso(2)}T10:00`, place: 'Siège', participants: '', agenda: 'Points' }), /participant/);
const meeting = M.saveMeeting({ title: 'Point hebdomadaire', date: `${iso(2)}T10:00`, place: 'Siège', participants: 'Direction\nAdmin OIC', agenda: 'Points ouverts' });
assert.equal(meeting.participants.length, 2);
M.convene(meeting.id);
assert.ok(getAllAuditLogs().some((e) => e.action === 'MEETING_CONVENED' && /simulé/.test(e.note)));
assert.throws(() => M.recordMinutes(meeting.id, { minutes: 'Compte rendu suffisamment long pour être accepté.' }), /après la tenue/);
assert.throws(() => M.addDecision(meeting.id, { text: 'X', responsible: 'Y', dueDate: iso(3) }), /réunion tenue/);
const past = M.saveMeeting({ title: 'Point passé', date: `${iso(-1)}T10:00`, place: 'Siège', participants: 'Direction', agenda: 'Bilan' });
M.recordMinutes(past.id, { minutes: 'Le point a permis de faire le bilan des actions.' });
const dec = M.addDecision(past.id, { text: 'Envoyer la synthèse aux antennes', responsible: 'Admin OIC', dueDate: iso(4) });
M.updateDecision(past.id, dec.id, { status: 'CLOTUREE', comment: 'Synthèse envoyée.' });
assert.throws(() => M.updateDecision(past.id, dec.id, { status: 'EN_COURS', comment: 'x' }), /clôturée/);
assert.ok(M.overdueDecisions().length >= 1);

// ---------------------------------------------------------------- Contrats et circuit de validation
const partners = readObject('dut_partners', []);
assert.throws(() => L.saveLegalContract({ type: 'PARTENARIAT', partnerId: 'x', object: 'Objet', startDate: iso(0), endDate: iso(10) }), /partenaire/);
const lc = L.saveLegalContract({ type: 'PARTENARIAT', partnerId: partners[0].id, object: 'Avenant de test', startDate: iso(0), endDate: iso(50), antennaIds: [abj.id] });
assert.equal(lc.expiry.level, 'PROCHE');
assert.equal(L.expiry(iso(-1)).level, 'ECHU'); assert.equal(L.expiry(iso(61)).level, 'NORMAL'); assert.equal(L.expiry(iso(60)).level, 'PROCHE');
assert.throws(() => L.validateLegalContract(lc.id), /rôle ne permet pas/);
L.submitLegalContract(lc.id);
as('direction@demo.oic.ci');
assert.throws(() => L.giveLegalVisa(lc.id), /rôle ne permet pas/, 'le visa revient au service juridique');
assert.throws(() => L.validateLegalContract(lc.id), /n’attend pas/);
assert.throws(() => L.saveLegalContract({ type: 'AUTRE', counterparty: 'X', object: 'Y', startDate: iso(0), endDate: iso(1) }), /rôle ne permet pas/);
as('oic.admin@demo.oic.ci');
L.giveLegalVisa(lc.id, 'Clauses conformes.');
assert.throws(() => L.validateLegalContract(lc.id), /rôle ne permet pas/);
as('direction@demo.oic.ci');
assert.throws(() => L.evaluatePartner(lc.id, { period: 'S2', scores: { engagements: 4, qualite: 4, reactivite: 4 }, comment: 'Évaluation trop tôt.' }), /en vigueur/);
const inForce = L.validateLegalContract(lc.id);
assert.equal(inForce.status, 'EN_VIGUEUR');
const pe = L.evaluatePartner(lc.id, { period: 'Semestre 2 2026', scores: { engagements: 4, qualite: 3, reactivite: 5 }, comment: 'Partenaire réactif, qualité à suivre.' });
assert.equal(pe.note, 4);
assert.ok(L.getLegalContract(lc.id).indicateurs, 'indicateurs DUT du partenaire repris');
assert.ok(L.expiringLegalContracts().some((x) => x.id === lc.id));
// Un contrat préparé et visé par la même personne reste validable par la Direction ; la Direction ne valide jamais son propre visa.
assert.throws(() => L.returnLegalContract(lc.id, 'x'), /pas renvoyer/);
const pendingLegal = L.listLegalContracts({ status: 'VALIDATION_DG' })[0];
assert.throws(() => L.returnLegalContract(pendingLegal.id, ''), /obligatoire/);
L.returnLegalContract(pendingLegal.id, 'Préciser les sites affectés.');
assert.equal(L.getLegalContract(pendingLegal.id).status, 'BROUILLON');

// ---------------------------------------------------------------- Journal d'audit
const pilotLogs = getAllAuditLogs().filter((e) => e.entity);
assert.ok(pilotLogs.length >= 25 && pilotLogs.every((e) => e.userLabel && e.date && e.label && e.role));
console.log(`Lot d5 : rôle Direction, contrats d’objectifs (cycle, séparation, écarts, taux), actions correctives, suivi et rapport des antennes, agents, documents, réunions, contrats — ${pilotLogs.length} actions journalisées.`);
