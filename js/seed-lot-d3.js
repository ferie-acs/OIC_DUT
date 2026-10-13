// Lot d3 : données de démonstration du cycle de vie du DUT et du contrôle.
// Idempotent : chaque étape vérifie l'état avant d'écrire ; relancé, il ne crée aucun doublon.
import { STORAGE_KEYS, ROLES, DEMO_PASSWORD } from './core/constants.js';
import { readCollection, writeCollection, writeObject } from './core/storage.js';
import { uuid, nowIso } from './core/utils.js';
import { DEMO_ACCOUNTS } from './seed.js';

const SECOND_AGENT = { email: 'antenne.agent2@demo.oic.ci', name: 'Brou Adjoua', label: 'Agent Antenne (second agent)' };

const LOCALITIES = [
  ['Abidjan', 'District autonome d’Abidjan', 'Port'],
  ['San-Pédro', 'San-Pédro', 'Port'],
  ['Yamoussoukro', 'District autonome de Yamoussoukro', 'Ville'],
  ['Bouaké', 'Gbêkê', 'Ville'],
  ['Korhogo', 'Poro', 'Ville'],
  ['Man', 'Tonkpi', 'Ville'],
  ['Daloa', 'Haut-Sassandra', 'Ville'],
  ['Ferkessédougou', 'Tchologo', 'Ville'],
  ['Noé', 'Sud-Comoé', 'Poste frontière'],
  ['Pogo', 'Bagoué', 'Poste frontière'],
];

if (!DEMO_ACCOUNTS.some((a) => a.email === SECOND_AGENT.email)) {
  DEMO_ACCOUNTS.push({ email: SECOND_AGENT.email, label: SECOND_AGENT.label, password: DEMO_PASSWORD });
}

export function seedLotD3() {
  const partners = readCollection(STORAGE_KEYS.PARTNERS);
  const stfa = partners.find((p) => p.name === 'STFA DEMO');
  const transcargo = partners.find((p) => p.name === 'TRANSCARGO SARL');
  if (!stfa) return; // démonstration non ensemencée : rien à compléter

  // 1. Référentiels cloisonnés : chaque fiche appartient au partenaire qui l'a enregistrée.
  const transporters = readCollection(STORAGE_KEYS.TRANSPORTERS);
  const byName = (name) => transporters.find((t) => t.name === name);
  let ivoire = byName('IVOIRE LOGISTIQUE SA');
  const abc = byName('ABC TRANSPORT CI');
  const sahel = byName('SAHEL TRANS EXPRESS');
  let changed = false;
  for (const t of transporters) {
    if (!t.ownerPartnerId) { t.ownerPartnerId = t === sahel && transcargo ? transcargo.id : stfa.id; changed = true; }
  }
  if (changed) writeCollection(STORAGE_KEYS.TRANSPORTERS, transporters);
  const ownerOf = (transporterId) => transporters.find((t) => t.id === transporterId)?.ownerPartnerId || stfa.id;

  const vehicles = readCollection(STORAGE_KEYS.VEHICLES);
  changed = false;
  for (const v of vehicles) if (!v.ownerPartnerId) { v.ownerPartnerId = ownerOf(v.transporterId); changed = true; }
  if (ivoire && !vehicles.some((v) => v.immatriculation === 'CI-7788-KL')) {
    vehicles.push({
      id: uuid(), immatriculation: 'CI-7788-KL', transporterId: ivoire.id, ownerPartnerId: stfa.id, type: 'Semi-remorque', capaciteTonnes: 38,
      cartegrise: 'CG-2021-011204', ptac: 42, dateMiseEnCirculation: '2021-05-18', carteTransport: 'CT-ABJ-2025-1290', etat: 'ACTIF', historique: [],
    });
    changed = true;
  }
  if (changed) writeCollection(STORAGE_KEYS.VEHICLES, vehicles);

  const drivers = readCollection(STORAGE_KEYS.DRIVERS);
  changed = false;
  const DRIVER_LINKS = { KOUASSI: abc, OUATTARA: abc, BAMBA: sahel };
  for (const d of drivers) {
    const link = DRIVER_LINKS[d.nom];
    if (!d.transporterId && link) { d.transporterId = link.id; changed = true; }
    if (!d.ownerPartnerId) { d.ownerPartnerId = ownerOf(d.transporterId); changed = true; }
  }
  if (ivoire && !drivers.some((d) => d.permis === 'CI-PL-009120')) {
    drivers.push({
      id: uuid(), nom: 'KONÉ', prenoms: 'Ibrahim', permis: 'CI-PL-009120', dateDelivrancePermis: '2016-03-22', typePiece: 'CNI',
      piece: '00311245780', dateDelivrancePiece: '2022-02-10', nationalite: 'Ivoirienne', transporterId: ivoire.id, ownerPartnerId: stfa.id,
      etat: 'ACTIF', historique: [],
    });
    changed = true;
  }
  if (changed) writeCollection(STORAGE_KEYS.DRIVERS, drivers);

  // 2. Pièce d'identité des conducteurs sur les DUT historiques (recherche au contrôle par pièce).
  const duts = readCollection(STORAGE_KEYS.DUT_LIST);
  changed = false;
  for (const dut of duts) {
    const driver = drivers.find((d) => d.permis && d.permis === dut.general?.driverPermis);
    if (driver && !dut.general.driverPiece) { dut.general.driverPiece = driver.piece; changed = true; }
  }
  if (changed) writeCollection(STORAGE_KEYS.DUT_LIST, duts);

  // 3. Localités (référentiel partagé).
  const localities = readCollection(STORAGE_KEYS.LOCALITIES);
  if (!localities.length) {
    writeCollection(STORAGE_KEYS.LOCALITIES, LOCALITIES.map(([nom, region, type], i) => ({
      id: uuid(), nom, region, pays: 'Côte d’Ivoire', type, code: `LOC-${String(i + 1).padStart(3, '0')}`, etat: 'ACTIF', historique: [],
    })));
  }

  // 4. Stock de références du transporteur de démonstration (acheté et validé : vente hors de ce lot).
  const operations = readCollection(STORAGE_KEYS.OPERATIONS);
  if (abc && !operations.some((o) => o.transporterId === abc.id)) {
    const year = new Date().getFullYear();
    operations.push({
      id: uuid(), code: `OP-T-${year}-00031`, transporterId: abc.id, transporterName: abc.name, partnerName: abc.name, ownerType: 'TRANSPORTEUR',
      year, rangeStart: 5000, rangeEnd: 5019, quantity: 20, used: 0, tarifUnitaire: 2500, status: 'VALIDATED',
      requestedAt: nowIso(), validatedAt: nowIso(), retiredReferences: [],
    });
    writeCollection(STORAGE_KEYS.OPERATIONS, operations);
  }

  // 5. Second agent de la même antenne : la saisie au guichet et la validation restent deux personnes distinctes.
  const users = readCollection(STORAGE_KEYS.USERS);
  const firstAgent = users.find((u) => u.email === 'antenne.agent@demo.oic.ci');
  if (firstAgent && !users.some((u) => u.email === SECOND_AGENT.email)) {
    users.push({
      id: uuid(), email: SECOND_AGENT.email, name: SECOND_AGENT.name, role: ROLES.ANTENNA_AGENT,
      antennaId: firstAgent.antennaId, antennaName: firstAgent.antennaName,
    });
    writeCollection(STORAGE_KEYS.USERS, users);
  }

  writeObject(STORAGE_KEYS.LOT_D3_SEED, 1);
}
