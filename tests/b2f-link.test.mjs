// Passerelle B2F → DUT : origine, validation, idempotence, attente puis application, anomalie.
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
const data = new Map();
globalThis.window = { crypto: webcrypto };
globalThis.localStorage = { getItem: (k) => data.get(k) || null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };

const { writeObject } = await import('../js/core/storage.js');
const user = { id: 'partner', role: 'PARTNER_ADMIN', partnerId: 'p1', partnerName: 'STFA DEMO', name: 'Partenaire test' };
writeObject('dut_users', [user]); writeObject('dut_current_user', user);

const link = await import('../js/services/b2f-link.service.js');
const { findDutById, updateDut } = await import('../js/repositories/dut.repository.js');
const w = await import('../js/services/workspace.service.js');
const B2F = 'http://localhost:8081';

const mission = { v: 1, type: 'b2f.mission', appariementId: 'mr-1', reference: 'MR-2026-0001', donnees: {
  corridor: 'Abidjan → Bouaké', departPrevu: '2026-10-12T08:00:00Z', arriveePrevue: '2026-10-13T18:00:00Z',
  marchandise: 'Cacao', poidsTotalT: 24, transporteurRaisonSociale: 'ABC TRANSPORT CI', affreteurRaisonSociale: 'SOCIETE AFRICAINE DE NEGOCE',
  immatriculation: 'AB-1234-CD', chauffeurNom: 'KOUASSI Jean', chauffeurTelephone: '+225 00 00 00 00' } };
const evt = (id, categorie, valeur, at, observation = '') => ({ v: 1, type: 'b2f.event', id, appariementId: 'mr-1', categorie, valeur, observation, horodatage: at });

// Origine et format
assert.equal(link.receive('http://evil.example', mission).statut, 'refusé');
assert.equal(link.receive(B2F, { ...mission, v: 2 }).statut, 'refusé');
assert.equal(link.receive(B2F, { ...mission, donnees: { ...mission.donnees, corridor: 'x'.repeat(500) } }).statut, 'refusé');
assert.equal(link.receive(B2F, evt('e0', 'etape', 'teleporte', '2026-10-12T09:00:00Z')).statut, 'refusé');
assert.equal(link.receive(B2F, { ...evt('e0', 'etape', 'charge', 'pas une date') }).statut, 'refusé');
assert.equal(link.receive(B2F, { __proto__: null, v: 1 }).statut, 'refusé');

// Mission reçue, données de contact écartées, doublon ignoré
assert.equal(link.receive(B2F, mission).statut, 'en attente');
assert.equal(link.receive(B2F, mission).statut, 'doublon');
assert.equal(link.missions()[0].donnees.chauffeurTelephone, undefined, 'le téléphone (CONTACT) ne doit pas être conservé');
assert.equal(link.pendingMissions().length, 1);

// Événement avant le DUT : conservé en attente
assert.equal(link.receive(B2F, evt('e1', 'etape', 'charge', '2026-10-12T09:00:00Z', 'Chargé au port')).statut, 'en attente');
assert.equal(link.receive(B2F, evt('e1', 'etape', 'charge', '2026-10-12T09:00:00Z')).statut, 'doublon');

// Création du brouillon relié : préremplissage et application de l'attente
const dut = link.createDutFromMission(user, 'mr-1');
assert.deepEqual(dut.source, { plateforme: 'B2F', appariementId: 'mr-1', reference: 'MR-2026-0001' });
assert.equal(dut.general.immatriculation, 'AB-1234-CD');
assert.equal(dut.trajet.chargement.ville, 'Abidjan');
assert.equal(dut.trajet.dechargement.ville, 'Bouaké');
assert.equal(dut.trajet.dateDepart, '2026-10-12');
assert.equal(dut.marchandises[0].poidsTonnes, 24);
assert.equal(dut.expediteur.raisonSociale, 'SOCIETE AFRICAINE DE NEGOCE');
assert.equal(link.pendingMissions().length, 0);
assert.throws(() => link.createDutFromMission(user, 'mr-1'), /déjà relié/);
let record = w.dossier(dut.id);
assert.equal(record.stage, 'LOADED');
assert.equal(record.b2fAnomalie?.etape, 'Chargé', 'première étape déclarée sur un DUT non validé : anomalie signalée');
assert.equal(link.linkedMission(findDutById(dut.id)).reference, 'MR-2026-0001');

// DUT validé, livraison : Arrivé puis Livré, l'étape ne recule jamais
updateDut(dut.id, { status: 'VALIDE' });
assert.equal(link.receive(B2F, evt('e2', 'etape', 'en_route', '2026-10-12T10:00:00Z')).statut, 'appliqué');
assert.equal(link.receive(B2F, evt('e3', 'etape', 'livre', '2026-10-13T17:00:00Z', 'Livré sans réserve')).statut, 'appliqué');
record = w.dossier(dut.id);
assert.equal(record.stage, 'DELIVERED');
assert.ok(record.events.some((e) => e.label === 'Arrivé'), 'l’arrivée est déduite de la livraison');
assert.equal(link.receive(B2F, evt('e4', 'etape', 'a_quai', '2026-10-13T18:00:00Z')).statut, 'appliqué');
assert.equal(w.dossier(dut.id).stage, 'DELIVERED');

// Incident : type DUT correspondant, ouvert, sans changer l'étape
assert.equal(link.receive(B2F, evt('e5', 'incident', 'barrage', '2026-10-12T11:00:00Z', 'Barrage à Tiébissou')).statut, 'appliqué');
record = w.dossier(dut.id);
assert.equal(record.incidents[0].type, 'Barrage');
assert.equal(record.incidents[0].status, 'OPEN');
assert.ok(w.INCIDENT_TYPES.includes('Barrage') && w.INCIDENT_TYPES.includes('Litige au chargement'));

// Lot B : statut du DUT relié, demandé par la Bourse de fret
const reply = link.receive(B2F, { v: 1, type: 'b2f.statut?', appariementId: 'mr-1' });
assert.equal(reply.statut, 'répondu');
assert.deepEqual(reply.reponse, { v: 1, type: 'dut.statut', appariementId: 'mr-1', dut: { statut: 'VALIDE', numero: null } });
assert.equal(link.receive(B2F, { v: 1, type: 'b2f.statut?', appariementId: 'mr-inconnue' }).reponse.dut, null);
assert.equal(link.receive('http://evil.example', { v: 1, type: 'b2f.statut?', appariementId: 'mr-1' }).statut, 'refusé');
assert.equal(link.receive(B2F, { v: 1, type: 'b2f.statut?', appariementId: '../etc' }).statut, 'refusé');

console.log('Passerelle B2F → DUT : origine, validation, idempotence, attente, préremplissage, étapes, incidents et anomalie validés.');
