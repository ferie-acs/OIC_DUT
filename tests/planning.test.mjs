import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
const store=new Map();globalThis.window={crypto:webcrypto};globalThis.localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};
const {writeObject,readObject}=await import('../js/core/storage.js');
const {blankDut}=await import('../js/services/dut.service.js');
const {addDut,findDutById}=await import('../js/repositories/dut.repository.js');
const {planningRows,saveSchedule,overlaps}=await import('../js/services/planning.service.js');
const user={id:'p',name:'Test',role:'PARTNER_ADMIN',partnerId:'p1'};setPersona(user);
const d=blankDut(user);d.general.immatriculation='AA-123';addDut(d);
assert.equal(planningRows()[0].valid,false);
assert.throws(()=>saveSchedule(d.id,{start:'2026-09-21T10:00',end:'2026-09-21T09:00'}),/postérieure/);
saveSchedule(d.id,{start:'2026-09-21T10:00',end:'2026-09-22T09:00'});
assert.equal(planningRows()[0].valid,true);assert.equal(readObject('dut_workspace_v1')[d.id].schedule.start,'2026-09-21T10:00');assert.equal(findDutById(d.id).trajet.dateDepart,'');
const b=blankDut(user);b.general.immatriculation='aa-123';addDut(b);saveSchedule(b.id,{start:'2026-09-21T12:00',end:'2026-09-22T10:00'});
let rows=planningRows();assert.ok(overlaps(rows[0],rows[1]));
saveSchedule(b.id,{start:'2026-09-22T09:00',end:'2026-09-22T10:00'});rows=planningRows();assert.equal(overlaps(rows[0],rows[1]),false);
setPersona({...user,partnerId:'p2'});assert.equal(planningRows().length,0);assert.throws(()=>saveSchedule(d.id,{start:'2026-09-21T10:00',end:'2026-09-22T10:00'}),/périmètre/);
console.log('Planning : dates, persistance, conflits, document inchangé et périmètres vérifiés.');
const {addPlanningExamples,demoRows,savePlanningSchedule}=await import('../js/services/planning.service.js');
setPersona(user);
const beforeDuts=localStorage.getItem('dut_list');
assert.equal(addPlanningExamples(new Date('2026-09-21T09:00:00Z')),10);assert.equal(addPlanningExamples(),0);assert.equal(demoRows().length,10);assert.equal(localStorage.getItem('dut_list'),beforeDuts);
const sample=demoRows()[0];savePlanningSchedule(sample.dut.id,{start:'2026-09-20T08:00',end:'2026-09-21T17:00'});assert.equal(demoRows()[0].start,'2026-09-20T08:00');
assert.throws(()=>savePlanningSchedule(sample.dut.id,{start:'x',end:'y'}),/postérieure/);
setPersona({...user,partnerId:'p2'});assert.equal(demoRows().length,0);assert.throws(()=>savePlanningSchedule(sample.dut.id,{start:'2026-09-20T08:00',end:'2026-09-21T17:00'}),/périmètre/);
console.log('Exemples : ajout unique, isolation des DUT, persistance et périmètres validés.');

function setPersona(user){writeObject('dut_users',[user]);writeObject('dut_current_user',user);}

// --- Carte des trajets : villes et tracé ---
const { findCity, routePoints } = await import('../js/data/cities.js');
assert.equal(findCity('Yamoussoukro').lat.toFixed(1), '6.8');
assert.ok(findCity('san pedro'), 'accents et tirets ignorés');
assert.ok(findCity('BOUAKÉ'), 'casse ignorée');
assert.equal(findCity('Ville inconnue'), null);
const pts = routePoints(findCity('Abidjan'), findCity('Korhogo'), 12);
assert.equal(pts.length, 13, 'n segments = n+1 points');
assert.deepEqual(pts[0], [findCity('Abidjan').lat, findCity('Abidjan').lng]);
assert.deepEqual(pts[12], [findCity('Korhogo').lat, findCity('Korhogo').lng]);
assert.ok(pts[6][1] !== (findCity('Abidjan').lng + findCity('Korhogo').lng) / 2, 'le tracé est courbé, pas une droite');
console.log('Carte des trajets : villes retrouvées sans accents, tracé courbé de n+1 points.');

// --- Page planning : durée lisible et recherche multicritère ---
{
  globalThis.document ??= { createElement: () => ({ style: {} }) };
  const { durationText, matchesFilters } = await import('../js/views/planning.view.js');
  assert.equal(durationText('2026-10-06T08:00', '2026-10-08T17:00'), '2 j 9 h');
  assert.equal(durationText('2026-10-06T08:00', '2026-10-06T17:00'), '9 h');
  assert.equal(durationText('2026-10-06T08:00', '2026-10-07T08:00'), '1 j');
  assert.equal(durationText('2026-10-06T08:00', '2026-10-06T07:00'), '—');
  const row = (over = {}) => ({ dut: { dutNumber: 'DUT-CI-2026-000410', status: 'VALIDE', general: { immatriculation: 'CI-5567-YZ', transporterName: 'IVOIRE LOGISTIQUE SA' }, trajet: { chargement: { ville: 'San-Pédro' }, dechargement: { ville: 'Abidjan' } }, ...over.dut }, record: { stage: over.stage || 'PLANNED' } });
  const none = { query: '', status: 'ALL', from: '', to: '', carrier: '' };
  assert.ok(matchesFilters(row(), none));
  assert.ok(matchesFilters(row(), { ...none, query: 'san pedro' }), 'texte libre sans accents');
  assert.ok(matchesFilters(row(), { ...none, query: '5567' }), 'plaque partielle');
  assert.ok(!matchesFilters(row(), { ...none, query: 'bouake' }));
  assert.ok(matchesFilters(row(), { ...none, from: 'san pedro', to: 'abidjan' }));
  assert.ok(!matchesFilters(row(), { ...none, from: 'abidjan' }));
  assert.ok(matchesFilters(row(), { ...none, status: 'blue' }));
  assert.ok(matchesFilters(row({ stage: 'DEPARTED' }), { ...none, status: 'green' }));
  assert.ok(!matchesFilters(row({ stage: 'DEPARTED' }), { ...none, status: 'blue' }));
  assert.ok(matchesFilters(row(), { ...none, carrier: 'IVOIRE LOGISTIQUE SA' }));
  assert.ok(!matchesFilters(row(), { ...none, carrier: 'AUTRE' }));
  console.log('Planning : durées lisibles, filtres combinables (texte, statut, villes, transporteur).');
}
