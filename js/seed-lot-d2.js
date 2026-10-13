// Lot d2 : données de démonstration (caisse, agents d'antenne, stocks, transferts, paiements, sites).
// Idempotent : chaque élément est repéré par une clé stable et n'est jamais ajouté deux fois.
// Relancé automatiquement après une réinitialisation de la démonstration (sans rechargement de page).
import { ROLES } from './core/constants.js';
import { readObject, writeObject } from './core/storage.js';
import { uuid } from './core/utils.js';
import { getAllUsers, saveUsers } from './repositories/users.repository.js';
import { getAllAntennas, saveAntennas } from './repositories/antennas.repository.js';
import { getAllPartners } from './repositories/partners.repository.js';
import { getAllOperations, saveOperations } from './repositories/operations.repository.js';
import { getAllAllocations, saveAllocations } from './repositories/range-stock.repository.js';
import { getAllPayments, savePayments } from './repositories/payments.repository.js';
import { getAllSites, saveSites } from './repositories/sites.repository.js';
import { getAllDuts } from './repositories/dut.repository.js';
import { transportersRepo } from './repositories/referentials.repository.js';
import { amountsFor, pricing } from './services/range-pricing.service.js';

const MARK = 'dut_lot_d2_seed_v1';
const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
const daysAgo = (n, h = 10) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(h, 15, 0, 0); return d.toISOString(); };
const who = (u) => (u ? { id: u.id, name: u.name, role: u.role } : { id: 'SEED', name: 'Démo', role: 'SYSTEM' });

// Repères indicatifs de localisation (démonstration), à confirmer par la DPESTL.
const SITES = [
  ['PAA-PORT', 'Port autonome d’Abidjan', 'PORT', 'ABIDJAN VRIDI', 'Abidjan', 5.2556, -4.0107, 'Terminaux à conteneurs et quais vraquiers.'],
  ['PASP-PORT', 'Port autonome de San-Pédro', 'PORT', 'SAN PEDRO', 'San-Pédro', 4.7385, -6.6146, 'Exportations de cacao et de bois.'],
  ['NOE-FRT', 'Poste frontière de Noé', 'FRONTIERE', 'NOE', 'Noé', 5.2905, -2.7955, 'Corridor Abidjan – Accra.'],
  ['POGO-FRT', 'Poste frontière de Pogo', 'FRONTIERE', 'POGO', 'Pogo', 10.4402, -5.6311, 'Corridor Abidjan – Bamako.'],
  ['OUAN-FRT', 'Poste frontière de Ouangolodougou', 'FRONTIERE', 'OUANGOLO', 'Ouangolodougou', 9.9692, -5.1494, 'Corridor Abidjan – Ouagadougou.'],
  ['BKE-GARE', 'Gare ferroviaire de Bouaké', 'GARE', 'BOUAKE', 'Bouaké', 7.6939, -5.0311, 'Transbordement rail – route.'],
  ['ABJ-GARE', 'Gare routière d’Adjamé', 'GARE', 'ABIDJAN SIEGE', 'Abidjan', 5.3536, -4.0236, 'Départs interurbains.'],
  ['YOP-ZI', 'Zone industrielle de Yopougon', 'ZONE_INDUSTRIELLE', 'ABIDJAN YOPOUGON', 'Abidjan', 5.3608, -4.0905, 'Industries agroalimentaires et chimiques.'],
  ['VRI-ZI', 'Zone industrielle de Vridi', 'ZONE_INDUSTRIELLE', 'ABIDJAN VRIDI', 'Abidjan', 5.2486, -3.9741, 'Raffinerie et dépôts pétroliers.'],
  ['ABJ-PARC', 'Parc à camions du port d’Abidjan', 'PARC', 'ABIDJAN VRIDI', 'Abidjan', 5.2612, -3.9958, 'Stationnement avant enlèvement.'],
  ['BKE-PARC', 'Parc à camions de Bouaké', 'PARC', 'BOUAKE', 'Bouaké', 7.7212, -5.0175, 'Halte du corridor nord.'],
];

export function seedLotD2() {
  if (typeof window !== 'undefined' && !seedLotD2.watching) {
    seedLotD2.watching = true;
    // Après « Réinitialiser le POC », la démonstration est régénérée sans recharger la page.
    window.addEventListener('hashchange', () => { if (!readObject(MARK, null)) seedLotD2(); });
  }
  if (readObject(MARK, null)) return;
  const antennas = getAllAntennas();
  const partners = getAllPartners();
  if (!antennas.length || !partners.length) return;
  const byName = (n) => antennas.find((a) => norm(a.directoryName || a.name) === norm(n));
  const siege = byName('ABIDJAN SIEGE') || antennas[0];
  const bouake = byName('BOUAKE');
  const stfa = partners.find((p) => p.name === 'STFA DEMO') || partners[0];
  const transcargo = partners.find((p) => p.name === 'TRANSCARGO SARL') || partners[1] || partners[0];

  // ---- Comptes : caisse et agents d'antenne supplémentaires.
  const users = getAllUsers();
  const addUser = (u) => { if (!users.some((x) => x.email === u.email)) users.push({ id: uuid(), active: true, createdAt: daysAgo(30), ...u }); };
  addUser({ email: 'caisse@demo.oic.ci', name: 'Akissi Brou', role: ROLES.CASHIER });
  if (bouake) addUser({ email: 'agent.bouake@demo.oic.ci', name: 'Konan Yao', role: ROLES.ANTENNA_AGENT, antennaId: bouake.id, antennaName: bouake.name });
  const yop = byName('ABIDJAN YOPOUGON');
  if (yop) addUser({ email: 'agent.yopougon@demo.oic.ci', name: 'Mariam Ouattara', role: ROLES.ANTENNA_AGENT, antennaId: yop.id, antennaName: yop.name });
  if (siege) addUser({ email: 'agent2.siege@demo.oic.ci', name: 'Ibrahim Soro', role: ROLES.ANTENNA_AGENT, antennaId: siege.id, antennaName: siege.name });
  saveUsers(users);
  const cashier = users.find((u) => u.email === 'caisse@demo.oic.ci');
  const oic = users.find((u) => u.role === ROLES.OIC_ADMIN);
  const agent = users.find((u) => u.email === 'antenne.agent@demo.oic.ci');
  const agentBke = users.find((u) => u.email === 'agent.bouake@demo.oic.ci');
  const partnerAdmin = users.find((u) => u.email === 'partner.admin@demo.oic.ci');

  // ---- Antennes : codes et encadrement pris dans les comptes (Bouaké).
  antennas.forEach((a, i) => { if (!a.code) a.code = `OIC-${String(i + 1).padStart(3, '0')}`; if (!a.status) a.status = 'ACTIVE'; });
  if (bouake && agentBke && !bouake.chef?.userId) Object.assign(bouake, { chef: { userId: agentBke.id, name: agentBke.name, email: agentBke.email, phone: bouake.chef?.phone || '' }, managed: true });
  saveAntennas(antennas);

  // ---- Stocks d'antenne (au-delà de toutes les plages et numéros existants).
  const year = new Date().getFullYear();
  const ops = getAllOperations();
  const allocs = getAllAllocations();
  const maxUsed = () => Math.max(0, ...ops.filter((o) => Number(o.year) === year && o.rangeEnd != null).map((o) => Number(o.rangeEnd)), ...allocs.filter((a) => a.year === year).map((a) => a.rangeEnd),
    ...getAllDuts().map((d) => d.dutNumber?.match(/^DUT-CI-(\d{4})-(\d+)$/)).filter((m) => m && Number(m[1]) === year).map((m) => Number(m[2])));
  const addAlloc = (code, antenna, qty, days) => {
    let a = allocs.find((x) => x.code === code);
    if (!a && antenna) { const s = maxUsed() + 1; a = { id: uuid(), code, antennaId: antenna.id, antennaName: antenna.name, year, rangeStart: s, rangeEnd: s + qty - 1, quantity: qty, status: 'ACTIVE', createdAt: daysAgo(days), createdBy: oic?.name || 'Démo' }; allocs.push(a); }
    return a;
  };
  const allocSiege = addAlloc(`AF-${year}-00101`, siege, 500, 20);
  addAlloc(`AF-${year}-00102`, bouake, 300, 18);
  saveAllocations(allocs);

  // ---- Ventes au guichet par l'antenne du siège à des transporteurs : une validée, une en attente de validation OIC.
  //      Même forme que le stock de références du lot d3 : `transporterId`, sans `partnerId`.
  const pr = pricing();
  const payments = getAllPayments();
  const transporters = transportersRepo.getAll();
  const abc = transporters.find((t) => t.name === 'ABC TRANSPORT CI') || transporters[0];
  const ivoire = transporters.find((t) => t.name === 'IVOIRE LOGISTIQUE SA') || transporters[1] || transporters[0];
  const addTransfer = (codeTr, client, offset, qty, days, validated, receipt) => {
    if (!allocSiege || !client || ops.some((o) => o.code === codeTr)) return null;
    const amounts = amountsFor(qty, pr);
    const op = {
      id: uuid(), code: codeTr, kind: 'TRANSFER', ownerType: 'TRANSPORTEUR', transporterId: client.id, transporterName: client.name, partnerName: client.name,
      antennaId: siege.id, antennaName: siege.name, stockId: allocSiege.id, retiredReferences: [],
      year, rangeStart: allocSiege.rangeStart + offset, rangeEnd: allocSiege.rangeStart + offset + qty - 1, quantity: qty, used: 0, tarifUnitaire: pr.unitHT, montantTotal: amounts.ht, amounts,
      receiptNo: receipt, commentaire: '', status: validated ? 'VALIDATED' : 'TRANSFER_PENDING', requestedAt: daysAgo(days), requestedBy: agent?.name || 'Démo', requestedById: agent?.id || 'SEED',
      validatedAt: validated ? daysAgo(days - 1) : null, decidedBy: validated ? oic?.name : undefined,
    };
    ops.push(op);
    payments.push({
      id: uuid(), ref: `PAY-${year}-${codeTr.slice(-5)}`, kind: 'PLAGE', operationId: op.id, operationCode: op.code, clientType: 'TRANSPORTEUR', partnerId: null, transporterId: client.id, partnerName: client.name,
      antennaId: siege.id, antennaName: siege.name, ...amounts, status: validated ? 'VALIDE' : 'ENCAISSE', method: 'GUICHET', receiptNo: receipt,
      createdAt: daysAgo(days), recordedAt: daysAgo(days), recordedBy: who(agent), validatedAt: validated ? daysAgo(days - 1) : null, validatedBy: validated ? who(cashier) : null,
      history: [{ at: daysAgo(days), by: agent?.name || 'Démo', text: `Encaissé au guichet · reçu ${receipt}` }, ...(validated ? [{ at: daysAgo(days - 1), by: cashier?.name || 'Démo', text: 'Paiement validé' }] : [])],
    });
    return op;
  };
  addTransfer(`TR-${year}-00201`, abc, 0, 50, 12, true, 'RC-ABJ-004512');
  addTransfer(`TR-${year}-00202`, ivoire, 50, 20, 1, false, 'RC-ABJ-004538');

  // ---- Créances des plages historiques : STFA réglée et validée, TRANSCARGO à encaisser.
  const addDue = (op, status, days) => {
    if (!op || payments.some((p) => p.operationId === op.id)) return;
    const amounts = amountsFor(op.quantity, { ...pr, unitHT: Number(op.tarifUnitaire) || pr.unitHT });
    const p = { id: uuid(), ref: `PAY-${year}-${op.code.slice(-5)}`, kind: 'PLAGE', operationId: op.id, operationCode: op.code, clientType: 'PARTENAIRE', partnerId: op.partnerId, transporterId: null, partnerName: op.partnerName, antennaId: null, antennaName: 'Attribution directe (siège OIC)', ...amounts, status: 'A_ENCAISSER', createdAt: op.validatedAt || daysAgo(days), history: [{ at: op.validatedAt || daysAgo(days), by: 'Système', text: 'Créance créée' }] };
    if (status === 'VALIDE') Object.assign(p, { status, method: 'GUICHET', receiptNo: 'RC-SIEGE-000871', recordedAt: daysAgo(days), recordedBy: who(cashier), validatedAt: daysAgo(days - 1), validatedBy: who(oic) });
    payments.push(p);
  };
  addDue(ops.find((o) => o.code === 'OP-2026-00021'), 'VALIDE', 36);
  addDue(ops.find((o) => o.code === 'OP-2026-00014'), 'A_ENCAISSER', 50);

  // ---- Une demande de plage en attente (modifiable ou annulable par le partenaire).
  if (stfa && !ops.some((o) => o.code === `OP-${year}-00230`)) {
    ops.push({ id: uuid(), code: `OP-${year}-00230`, partnerId: stfa.id, partnerName: stfa.name, year, rangeStart: null, rangeEnd: null, quantity: 200, used: 0, tarifUnitaire: pr.unitHT, montantTotal: 200 * pr.unitHT, commentaire: 'Campagne cacao : prévision de 200 transports.', status: 'PENDING', requestedAt: daysAgo(2), validatedAt: null, requestedBy: partnerAdmin?.name });
  }
  saveOperations(ops);

  // ---- Frais DUT à l'unité encaissés à Bouaké, à valider par la caisse.
  const feesDuts = getAllDuts().filter((d) => d.partnerId === transcargo.id && d.dutNumber && !d.canary).slice(0, 2);
  if (feesDuts.length && !payments.some((p) => p.kind === 'FRAIS_DUT')) {
    payments.push({ id: uuid(), ref: `PAY-${year}-00305`, kind: 'FRAIS_DUT', clientType: 'PARTENAIRE', transporterId: null, dutIds: feesDuts.map((d) => d.id), dutNumbers: feesDuts.map((d) => d.dutNumber), partnerId: transcargo.id, partnerName: transcargo.name, antennaId: bouake?.id || null, antennaName: bouake?.name || '', ...amountsFor(feesDuts.length, pr), status: 'ENCAISSE', method: 'GUICHET', receiptNo: 'RC-BKE-000219', createdAt: daysAgo(3), recordedAt: daysAgo(3), recordedBy: who(agentBke), history: [{ at: daysAgo(3), by: agentBke?.name || 'Démo', text: `Frais de ${feesDuts.length} DUT encaissés au guichet` }] });
  }
  savePayments(payments);

  // ---- Référentiel des sites.
  const sites = getAllSites();
  SITES.forEach(([code, name, type, antennaName, city, lat, lng, description]) => {
    const a = byName(antennaName);
    if (!a || sites.some((s) => s.code === code)) return;
    sites.push({ id: uuid(), code, name, type, antennaId: a.id, antennaName: a.name, city, lat, lng, description, status: 'ACTIVE', createdAt: daysAgo(25), createdBy: oic?.name || 'Démo', demoLocation: true });
  });
  saveSites(sites);
  writeObject(MARK, { version: 1, at: new Date().toISOString() });
}

