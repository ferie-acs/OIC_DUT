// Lot d1 : comptes et acteurs — services et règles, y compris les refus (mauvais rôle, autre entreprise, état invalide).
import assert from 'node:assert/strict';
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear(), key: (i) => [...store.keys()][i], get length() { return store.size; } };
globalThis.window = { matchMedia: () => ({ matches: false }), crypto: globalThis.crypto };
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true });
globalThis.document ??= { createElement: () => ({ style: {} }) };

const { seedDemoData } = await import('../js/seed.js');
const { seedLotD1, SECOND_ADMIN_EMAIL, PENDING_AGENT_EMAIL } = await import('../js/seed-lot-d1.js');
const { readObject, writeObject, readCollection } = await import('../js/core/storage.js');
const { STORAGE_KEYS, DEMO_PASSWORD } = await import('../js/core/constants.js');
const { can } = await import('../js/core/permissions.js');
const auth = await import('../js/core/auth.js');
const M = await import('../js/services/messaging.service.js');
const A = await import('../js/services/account.service.js');
const P = await import('../js/services/partners.service.js');
const T = await import('../js/services/transporters.service.js');
const V = await import('../js/services/vehicle-declarations.service.js');
const U = await import('../js/services/company-users.service.js');
const ACT = await import('../js/services/agent-activity.service.js');
const H = await import('../js/services/habilitations.service.js');

const users = () => readCollection(STORAGE_KEYS.USERS);
const byEmail = (e) => users().find((u) => u.email === e);
function as(email) { const { credential, ...u } = byEmail(email); writeObject(STORAGE_KEYS.CURRENT_USER, u); return u; }
const messages = () => readCollection(STORAGE_KEYS.MESSAGES);
const lastSecretFor = (email) => [...messages()].reverse().find((m) => m.to === email && m.secret)?.secret;
const OIC = 'oic.admin@demo.oic.ci';

// ------------------------------------------------------------------ Données de démonstration idempotentes
seedDemoData();
await seedLotD1();
const snapshot = () => [STORAGE_KEYS.USERS, STORAGE_KEYS.PARTNERS, STORAGE_KEYS.TRANSPORTERS, STORAGE_KEYS.VEHICLES, STORAGE_KEYS.MESSAGES, STORAGE_KEYS.TRANSPORTER_APPLICATIONS, STORAGE_KEYS.VEHICLE_DECLARATIONS].map((k) => readCollection(k).length);
const before = snapshot();
await seedLotD1();
assert.deepEqual(snapshot(), before, 'seed-lot-d1 relancé sans doublon');
assert.ok(byEmail(SECOND_ADMIN_EMAIL) && byEmail(PENDING_AGENT_EMAIL).activationPending);
assert.ok(readCollection(STORAGE_KEYS.PARTNERS).every((p) => p.status));

// ------------------------------------------------------------------ Messagerie unique
as(OIC);
const partnerAdmin = byEmail('partner.admin@demo.oic.ci');
const sent = M.envoyer({ canal: 'EMAIL', destinataire: partnerAdmin.id, objet: 'Test', corps: 'Votre code : {{code}}', origine: 'Incidents', code: 'XYZ123' });
assert.equal(sent.to, partnerAdmin.email, 'un compte reçoit à son adresse enregistrée');
assert.equal(sent.origin, 'Incidents');
assert.equal(M.envoyer({ canal: 'SMS', destinataire: byEmail('antenne.agent@demo.oic.ci').id, corps: 'x' }), null, 'pas de téléphone, pas de SMS');
assert.throws(() => M.envoyer({ canal: 'FAX', destinataire: 'a@b.ci', corps: 'x' }), /Canal/);
const journal = M.messageJournal({ query: 'Incidents' });
assert.ok(journal.length && !JSON.stringify(journal).includes('XYZ123'), 'code masqué dans le journal OIC');
as('partner.admin@demo.oic.ci');
assert.ok(M.myMessages().some((m) => m.body.includes('XYZ123')), 'le destinataire voit son code');
assert.throws(() => M.messageJournal(), /non autorisée/, 'journal réservé à l’OIC');

// ------------------------------------------------------------------ Activation
await assert.rejects(auth.login(PENDING_AGENT_EMAIL, DEMO_PASSWORD), /pas encore activé/, 'aucun mot de passe de démonstration sur un compte à activer');
const actCode = lastSecretFor(PENDING_AGENT_EMAIL);
assert.match(actCode, /^ACT-/);
await assert.rejects(A.activateAccount({ email: PENDING_AGENT_EMAIL, code: 'ACT-FAUX0-FAUX0', password: 'Nouveau2026', confirm: 'Nouveau2026' }), /invalide/);
assert.equal(byEmail(PENDING_AGENT_EMAIL).activation.attempts, 1);
await assert.rejects(A.activateAccount({ email: PENDING_AGENT_EMAIL, code: actCode, password: 'court', confirm: 'court' }), /8 caractères/);
await assert.rejects(A.activateAccount({ email: PENDING_AGENT_EMAIL, code: actCode, password: DEMO_PASSWORD + 'x1', confirm: 'autre' }), /identiques/);
await A.activateAccount({ email: PENDING_AGENT_EMAIL, code: actCode, password: 'Nouveau2026', confirm: 'Nouveau2026' });
await assert.rejects(A.activateAccount({ email: PENDING_AGENT_EMAIL, code: actCode, password: 'Encore2026', confirm: 'Encore2026' }), /invalide/, 'code à usage unique');
await auth.login(PENDING_AGENT_EMAIL, 'Nouveau2026');
assert.equal(auth.getCurrentUser().email, PENDING_AGENT_EMAIL);

// ------------------------------------------------------------------ Mot de passe oublié (règle stricte)
const msgCount = messages().length;
assert.deepEqual(await A.requestPasswordReset('inconnu@nulle-part.ci'), { accepted: true }, 'réponse identique pour une adresse inconnue');
assert.equal(messages().length, msgCount, 'aucun message pour une adresse inconnue');
await A.requestPasswordReset('  PARTNER.ADMIN@demo.oic.ci ');
const resetMsg = messages().filter((m) => m.kind === 'RESET').pop();
assert.equal(resetMsg.to, 'partner.admin@demo.oic.ci', 'le code part à l’adresse enregistrée du compte');
assert.ok(messages().some((m) => m.channel === 'SMS' && m.to === partnerAdmin.phone), 'alerte SMS au téléphone enregistré');
await auth.login('partner.admin@demo.oic.ci', DEMO_PASSWORD); // le compte n'est pas bloqué par la demande
assert.equal(auth.getCurrentUser().email, 'partner.admin@demo.oic.ci');
const n2 = messages().length;
await A.requestPasswordReset('partner.admin@demo.oic.ci');
assert.equal(messages().length, n2, 'pas de rafale de codes (délai entre deux demandes)');
const resetCode = resetMsg.secret;
await assert.rejects(A.completePasswordReset({ email: 'partner.editor@demo.oic.ci', code: resetCode, password: 'Partner2026', confirm: 'Partner2026' }), /invalide/, 'le code ne vaut que pour son compte');
const list = users(); const pa = list.find((u) => u.email === 'partner.admin@demo.oic.ci');
const realExpiry = pa.reset.expiresAt; pa.reset.expiresAt = new Date(Date.now() - 1000).toISOString(); writeObject(STORAGE_KEYS.USERS, list);
await assert.rejects(A.completePasswordReset({ email: pa.email, code: resetCode, password: 'Partner2026', confirm: 'Partner2026' }), /expiré/, 'code expiré');
const list2 = users(); list2.find((u) => u.id === pa.id).reset.expiresAt = realExpiry; writeObject(STORAGE_KEYS.USERS, list2);
await A.completePasswordReset({ email: pa.email, code: resetCode, password: 'Partner2026', confirm: 'Partner2026' });
await assert.rejects(A.completePasswordReset({ email: pa.email, code: resetCode, password: 'Partner2027', confirm: 'Partner2027' }), /invalide/, 'usage unique');
await assert.rejects(auth.login(pa.email, DEMO_PASSWORD), /invalides/);
await auth.login(pa.email, 'Partner2026');

// ------------------------------------------------------------------ Mon profil : changement de mot de passe
await assert.rejects(A.changePassword({ current: 'mauvais', password: 'Partner2028', confirm: 'Partner2028' }), /actuel incorrect/);
await A.changePassword({ current: 'Partner2026', password: 'Partner2028', confirm: 'Partner2028' });
assert.equal(auth.getCurrentUser().email, pa.email, 'la session courante reste ouverte');
A.updateMyProfile({ name: 'Aïcha Koné', phone: '+225 07 07 10 20 30' });
assert.throws(() => A.updateMyProfile({ name: 'X', phone: 'abc' }), /téléphone/);

// ------------------------------------------------------------------ Partenaires : création, validation, anti-doublon, états
as('partner.editor@demo.oic.ci');
assert.throws(() => P.listPartners(), /non autorisée/, 'un agent partenaire ne gère pas les partenaires');
const oic = as(OIC);
const antennaId = readCollection(STORAGE_KEYS.ANTENNAS)[0].id;
const base = { name: 'Nouveau Partenaire', rccm: 'CI-ABJ-2020-B-9999', email: 'contact@nouveau-demo.ci', phone: '+225 27 20 30 40 50', city: 'Abidjan', contactName: 'Traoré Awa', antennaId };
const np = P.createPartner(base);
assert.equal(np.status, 'EN_ATTENTE');
assert.throws(() => P.createPartner({ ...base, email: 'autre@demo.ci' }), /RCCM/, 'RCCM déjà utilisé');
assert.throws(() => P.createPartner({ ...base, rccm: 'CI-ABJ-2020-B-1111', email: 'CONTACT@nouveau-demo.ci' }), /adresse/, 'e-mail déjà utilisé');
assert.ok(P.updatePartner(np.id, { ...base, phone: '+225 27 20 30 40 51' }), 'sa propre adresse et son propre RCCM ne sont pas des doublons');
assert.throws(() => P.updatePartner(np.id, { ...base, status: 'ACTIF' }), /actions dédiées/, 'jamais de changement d’état par la fiche');
await assert.rejects(P.validatePartner(np.id), /autre administrateur/, 'séparation saisie / validation');
as(SECOND_ADMIN_EMAIL);
const validated = await P.validatePartner(np.id);
assert.equal(validated.status, 'ACTIF', 'l’état passe réellement à actif');
assert.equal(users().filter((u) => u.email === base.email).length, 1, 'compte administrateur créé');
assert.ok(byEmail(base.email).activationPending && byEmail(base.email).role === 'PARTNER_ADMIN');
await assert.rejects(P.validatePartner(np.id), /en attente/, 'pas de seconde validation');
assert.equal(users().filter((u) => u.email === base.email).length, 1, 'compte créé une seule fois');
assert.throws(() => P.suspendPartner(np.id, ''), /motif/);
P.suspendPartner(np.id, 'Défaut de pièces justificatives');
assert.equal(P.partnerDetail(np.id).partner.status, 'SUSPENDU');
const stfa = readCollection(STORAGE_KEYS.PARTNERS).find((p) => p.name === 'STFA DEMO');
assert.throws(() => P.reactivatePartner(stfa.id, 'Motif valable'), /impossible/, 'transition invalide');
P.reactivatePartner(np.id, 'Pièces reçues et vérifiées');
P.terminatePartner(np.id, 'Fin de la convention');
assert.ok(users().filter((u) => u.partnerId === np.id).every((u) => u.active === false), 'résiliation : comptes désactivés');
assert.throws(() => P.updatePartner(np.id, base), /résilié/);
const audit = readCollection(STORAGE_KEYS.AUDIT_LOGS).filter((e) => e.entityId === np.id).map((e) => e.action);
for (const a of ['ORG_CREATED', 'ORG_VALIDATED', 'ORG_SUSPENDED', 'ORG_REACTIVATED', 'ORG_TERMINATED']) assert.ok(audit.includes(a), `journal : ${a}`);

// Suspension d'un partenaire existant : ses comptes ne se connectent plus.
P.suspendPartner(stfa.id, 'Contrôle en cours');
await assert.rejects(auth.login('partner.editor@demo.oic.ci', DEMO_PASSWORD), /suspendu/);
P.reactivatePartner(stfa.id, 'Contrôle terminé');
await auth.login('partner.editor@demo.oic.ci', DEMO_PASSWORD);

// ------------------------------------------------------------------ Partenaire : fiche (données sensibles → validation OIC)
as('partner.admin@demo.oic.ci');
const mine = P.myPartner();
const r = P.updateMyPartner({ ...mine, phone: '+225 27 21 35 40 99', name: 'STFA DEMO SA' });
assert.deepEqual(r.requested, ['Raison sociale']);
assert.equal(P.myPartner().phone, '+225 27 21 35 40 99', 'coordonnées appliquées tout de suite');
assert.equal(P.myPartner().name, 'STFA DEMO', 'raison sociale inchangée avant validation');
assert.throws(() => P.updateMyPartner({ ...P.myPartner(), email: 'autre@stfa.ci' }), /déjà en attente/);
assert.throws(() => P.decidePartnerChange(mine.id, true, ''), /non autorisée/, 'le partenaire ne valide pas sa propre demande');
as(OIC);
P.decidePartnerChange(mine.id, true, '');
assert.equal(P.partnerDetail(mine.id).partner.name, 'STFA DEMO SA');
assert.equal(byEmail('partner.admin@demo.oic.ci').partnerName, 'STFA DEMO SA');

// ------------------------------------------------------------------ Partenaire : agents, strictement dans son entreprise
as('partner.admin@demo.oic.ci');
const agent = await U.createCompanyUser({ name: 'Yao Serge', email: 'yao.serge@stfa-demo.ci', role: 'PARTNER_EDITOR' });
assert.equal(agent.statut, 'A_ACTIVER');
await assert.rejects(U.createCompanyUser({ name: 'Intrus', email: 'intrus@stfa-demo.ci', role: 'OIC_ADMIN' }), /non autorisé/, 'rôle hors entreprise refusé');
await assert.rejects(U.createCompanyUser({ name: 'Doublon', email: 'yao.serge@stfa-demo.ci', role: 'PARTNER_EDITOR' }), /déjà utilisée/);
assert.ok(U.listCompanyUsers().every((u) => u.partnerId === mine.id), 'liste cloisonnée');
const foreign = users().find((u) => u.partnerId && u.partnerId !== mine.id);
if (foreign) assert.throws(() => U.setCompanyUserActive(foreign.id, false), /n’appartient pas/, 'autre entreprise refusée');
const transporterUser = byEmail('transporteur@demo.oic.ci');
assert.throws(() => U.setCompanyUserActive(transporterUser.id, false), /n’appartient pas/);
assert.throws(() => U.setCompanyUserActive(byEmail('partner.admin@demo.oic.ci').id, false), /propre compte/);
U.setCompanyUserActive(agent.id, false);
assert.equal(byEmail('yao.serge@stfa-demo.ci').active, false);
await assert.rejects(U.resetCompanyUserAccess(agent.id), /Réactivez/);
U.setCompanyUserActive(agent.id, true);
await U.resetCompanyUserAccess(agent.id);
assert.ok(lastSecretFor('yao.serge@stfa-demo.ci'));
const editor = byEmail('partner.editor@demo.oic.ci');
U.updateCompanyUser(editor.id, { name: editor.name, phone: '', role: 'PARTNER_EDITOR' });
assert.throws(() => U.updateCompanyUser(byEmail('partner.admin@demo.oic.ci').id, { name: 'Aïcha', role: 'PARTNER_EDITOR' }), /propre rôle/);
as('partner.editor@demo.oic.ci');
assert.throws(() => U.listCompanyUsers(), /non autorisée/, 'un agent éditeur ne gère pas les comptes');
assert.throws(() => ACT.agentActivity(), /non autorisée/);

// Activité des agents : uniquement le partenaire de l'utilisateur connecté.
as('partner.admin@demo.oic.ci');
const activity = ACT.agentActivity({ days: 365 });
const myAgents = new Set(users().filter((u) => u.partnerId === mine.id).map((u) => u.id));
assert.ok(activity.rows.every((row) => row.id === 'AUTRE' || myAgents.has(row.id)));
assert.equal(activity.columns.length, 12);
assert.equal(activity.totals.created, readCollection(STORAGE_KEYS.DUT_LIST).filter((d) => d.partnerId === mine.id && !d.canary && Date.parse(d.createdAt) >= Date.now() - 365 * 86400000).length);

// ------------------------------------------------------------------ Transporteur : inscription, validation, activation
writeObject(STORAGE_KEYS.CURRENT_USER, null);
const signup = { name: 'Lagunes Fret', rccm: 'CI-ABJ-2022-B-5050', carteTransporteur: 'CTR-ABJ-2022-5050', email: 'contact@lagunes-fret.ci', phone: '+225 07 50 50 50 50', city: 'Abidjan', contactName: 'Kouassi Ange', accept: 'on' };
assert.throws(() => T.registerTransporter({ ...signup, accept: '' }), /exactitude/);
const { reference } = T.registerTransporter(signup);
assert.ok(reference);
assert.throws(() => T.registerTransporter({ ...signup, email: 'autre@lagunes.ci' }), /RCCM/, 'demande en double refusée');
assert.ok(!byEmail(signup.email), 'aucun compte avant validation');
as('transporteur@demo.oic.ci');
assert.throws(() => T.listApplications(), /non autorisée/);
as(OIC);
const app = T.listApplications().find((a) => a.email === signup.email);
await T.validateApplication(app.id);
assert.equal(T.transporterDetail(app.id).transporter.status, 'ACTIF');
await assert.rejects(T.validateApplication(app.id), /en attente/);
const tCode = lastSecretFor(signup.email);
await A.activateAccount({ email: signup.email, code: tCode, password: 'Lagunes2026', confirm: 'Lagunes2026' });
await auth.login(signup.email, 'Lagunes2026');
assert.ok(auth.getCurrentUser().companyAdmin, 'le responsable administre le compte transporteur');

// Fiche, filiale et utilisateurs du transporteur.
const tr = T.updateMyTransporter({ ...T.myTransporter().transporter, phone: '+225 07 50 50 50 51', carteTransporteur: 'CTR-ABJ-2022-5051' });
assert.deepEqual(tr.requested, ['Carte de transporteur']);
const sub = T.requestSubsidiary({ name: 'Lagunes Fret Bouaké', email: 'bouake@lagunes-fret.ci', phone: '+225 07 50 50 50 52', city: 'Bouaké', contactName: 'Koné Issa' });
assert.equal(sub.parentId, app.id);
assert.equal(sub.rccm, signup.rccm, 'la filiale reprend le RCCM du parent');
const colleague = await U.createCompanyUser({ name: 'Adjoua Rita', email: 'rita@lagunes-fret.ci' });
assert.equal(colleague.role, 'TRANSPORTEUR');
await A.activateAccount({ email: 'rita@lagunes-fret.ci', code: lastSecretFor('rita@lagunes-fret.ci'), password: 'Rita2026x', confirm: 'Rita2026x' });
await auth.login('rita@lagunes-fret.ci', 'Rita2026x');
assert.throws(() => U.listCompanyUsers(), /administrateur/, 'un utilisateur simple ne gère pas les comptes');
assert.throws(() => T.requestSubsidiary({ ...signup }), /administrateur/);

// Déclaration de véhicule : validation OIC, jamais par le déclarant.
await auth.login(signup.email, 'Lagunes2026');
const veh = { immatriculation: 'LF 2026 CI', type: 'Semi-remorque', ptac: 40, capaciteTonnes: 32, cartegrise: 'CG-2026-0001', carteTransport: 'CT-2026-0001', carteTransportExpire: new Date(Date.now() + 200 * 86400000).toISOString().slice(0, 10) };
assert.throws(() => V.declareVehicle({ ...veh, capaciteTonnes: 50 }), /charge utile/);
assert.throws(() => V.declareVehicle({ ...veh, carteTransportExpire: '2020-01-01' }), /échue/);
assert.throws(() => V.declareVehicle({ ...veh, immatriculation: 'AB-1234-CD' }), /déjà/, 'immatriculation existante');
const decl = V.declareVehicle(veh);
assert.throws(() => V.declareVehicle(veh), /déjà/);
assert.ok(!V.myFleet().vehicles.length, 'pas dans la flotte avant validation');
assert.throws(() => V.decideDeclaration(decl.id, true), /non autorisée/);
as(OIC);
V.decideDeclaration(decl.id, true, 'Carte grise vérifiée');
await auth.login(signup.email, 'Lagunes2026');
assert.equal(V.myFleet().vehicles[0].immatriculation, 'LF-2026-CI');

// Suspension du transporteur : plus de connexion.
as(OIC);
T.suspendTransporter(app.id, 'Assurance expirée');
await assert.rejects(auth.login(signup.email, 'Lagunes2026'), /suspendu/);
assert.throws(() => T.suspendTransporter(app.id, 'Encore une fois'), /impossible/);
T.reactivateTransporter(app.id, 'Attestation reçue');

// ------------------------------------------------------------------ Import d'une liste existante
const csv = `${T.IMPORT_COLUMNS.join(';')}
SAVANES TRANSPORT;CI-KRG-2010-B-0101;CTR-KRG-0101;contact@savanes-demo.ci;+225 07 01 01 01 01;Korhogo;Silué Moussa;SV-0001-CI;Camion plateau;26;20;CG-0001;CT-0001;2027-01-31
SAVANES TRANSPORT;CI-KRG-2010-B-0101;;;;;;SV-0002-CI;Citerne;30;25;CG-0002;CT-0002;2027-02-28
DOUBLON PLAQUE;CI-KRG-2011-B-0202;CTR-0202;doublon@demo.ci;+225 07 02 02 02 02;Korhogo;Coulibaly;SV-0001-CI;Citerne;30;25;CG-0003;CT-0003;2027-02-28
LAGUNES FRET;CI-ABJ-2022-B-5050;;;;;;;;;;;;`;
const dry = await T.importTransporters(csv);
assert.equal(dry.applied, false);
assert.deepEqual([dry.summary.transporters, dry.summary.vehicles, dry.summary.rejected], [1, 2, 2]);
assert.ok(!readCollection(STORAGE_KEYS.TRANSPORTERS).some((t) => t.name === 'SAVANES TRANSPORT'), 'analyse sans enregistrement');
const done = await T.importTransporters(csv, { apply: true });
assert.equal(done.summary.transporters, 1);
assert.ok(byEmail('contact@savanes-demo.ci').activationPending, 'compte du transporteur importé à activer');
const again = await T.importTransporters(csv, { apply: true });
assert.equal(again.summary.transporters + again.summary.vehicles, 0, 'réimport : tout est rejeté comme doublon');
as('partner.admin@demo.oic.ci');
await assert.rejects(T.importTransporters(csv), /non autorisée/);

// ------------------------------------------------------------------ Habilitations dans une limite sûre
as('partner.admin@demo.oic.ci');
assert.throws(() => H.habilitationMatrix(), /non autorisée/);
as(OIC);
assert.throws(() => H.setPermission('PARTNER_ADMIN', 'dut.validate', true, 'Essai de délégation'), /externe/);
assert.throws(() => H.setPermission('TRANSPORTEUR', 'control.scan', true, 'Essai de délégation'), /externe/);
assert.throws(() => H.setPermission('PARTNER_EDITOR', 'partners.manage', true, 'Essai de délégation'), /administrateur OIC/);
assert.throws(() => H.setPermission('ANTENNA_AGENT', 'dut.create', true, 'Essai de cumul'), /Séparation/);
assert.throws(() => H.setPermission('OIC_ADMIN', 'admin.manage', false, 'Essai de retrait'), /ne peut pas être retiré/);
assert.throws(() => H.setPermission('CONTROLLER', 'dut.view', true, ''), /motif/);
H.setPermission('CONTROLLER', 'dut.view', true, 'Consultation des DUT au contrôle');
assert.ok(can(byEmail('controle.agent@demo.oic.ci'), 'dut.view'));
// Une habilitation non sûre glissée directement dans le stockage reste sans effet.
writeObject(STORAGE_KEYS.HABILITATIONS, { ...readObject(STORAGE_KEYS.HABILITATIONS, {}), PARTNER_EDITOR: { add: ['dut.validate', 'admin.manage'], remove: [] } });
assert.ok(!can(byEmail('partner.editor@demo.oic.ci'), 'dut.validate') && !can(byEmail('partner.editor@demo.oic.ci'), 'admin.manage'));
H.resetHabilitations('Retour aux droits par défaut');
assert.ok(!can(byEmail('controle.agent@demo.oic.ci'), 'dut.view'));

// ------------------------------------------------------------------ Groupements et export
const groups = H.listGroupements();
assert.ok(['PARTENAIRE', 'TRANSPORTEUR', 'ANTENNE'].every((t) => groups.some((g) => g.type === t)));
assert.ok(H.listGroupements({ status: 'RESILIE' }).some((g) => g.id === np.id));
const csvOut = H.groupementsCsv(groups);
assert.ok(csvOut.startsWith('Type;Nom;RCCM') && csvOut.includes('SAVANES TRANSPORT'));

console.log('Lot d1 : activation, mot de passe oublié, profil, messagerie, partenaires, agents, transporteurs, véhicules, import, habilitations et groupements validés.');
