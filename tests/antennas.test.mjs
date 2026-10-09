import assert from 'node:assert/strict';
import {officialAntennas,mergeAntennaDirectory} from '../js/data/antennas.js';
assert.equal(officialAntennas.length,23);
assert.equal(new Set(officialAntennas.map(a=>a.name)).size,23);
assert.equal(officialAntennas.find(a=>a.name==='NOE').phone,'08 41 81 79 / 74 68 21 16');
const old=[{id:'linked-abidjan',name:'ABIDJAN'},{id:'linked-bouake',name:'BOUAKÉ'},{id:'linked-sanpedro',name:'SAN-PÉDRO'},{id:'linked-yam',name:'YAMOUSSOUKRO'}];
const updated=mergeAntennaDirectory(old);assert.equal(updated.length,23);assert.equal(updated.find(a=>a.name==='ABIDJAN SIEGE').id,'linked-abidjan');assert.equal(updated.find(a=>a.name==='BOUAKE').id,'linked-bouake');assert.equal(updated.find(a=>a.name==='SAN PEDRO').id,'linked-sanpedro');assert.deepEqual(mergeAntennaDirectory(updated),updated);
assert.equal(mergeAntennaDirectory([...old,{id:'custom',name:'Personnalisée'}]).length,24);
assert.ok(updated.every(a=>Number.isFinite(a.lat)&&Number.isFinite(a.lng)&&a.phone));
console.log('23 antennes : contacts, identifiants existants, absence de doublons et migration répétable validés.');

// Zones géographiques indicatives de la carte des antennes.
{
  globalThis.document ??= { createElement: () => ({ style: {} }) };
  const { zoneOf } = await import('../js/views/antennas-map.view.js');
  assert.equal(zoneOf({ lat: 5.2893, lng: -4.0072 }), 'Sud', 'Abidjan');
  assert.equal(zoneOf({ lat: 9.458, lng: -5.629 }), 'Nord', 'Korhogo');
  assert.equal(zoneOf({ lat: 7.412, lng: -7.554 }), 'Ouest', 'Man');
  assert.equal(zoneOf({ lat: 8.04, lng: -2.8 }), 'Est', 'Bondoukou');
  assert.equal(zoneOf({ lat: 6.827, lng: -5.289 }), 'Centre', 'Yamoussoukro');
  console.log('Antennes : zones Sud / Nord / Ouest / Est / Centre déduites de la position.');
}
