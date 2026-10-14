// Lot d3 : cycle de vie du DUT et contrôle — services et règles, y compris les refus.
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
const data = new Map();
globalThis.window = { crypto: webcrypto };
globalThis.localStorage = { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };

const { seedDemoData, ensureSignedDemoData } = await import('../js/seed.js');
seedDemoData();
await ensureSignedDemoData();
const { seedLotD3 } = await import('../js/seed-lot-d3.js');
seedLotD3();
const { readCollection, writeObject } = await import('../js/core/storage.js');
const { STORAGE_KEYS } = await import('../js/core/constants.js');

const users = () => readCollection(STORAGE_KEYS.USERS);
const as = (email) => { const u = users().find((x) => x.email === email); assert.ok(u, email); writeObject(STORAGE_KEYS.CURRENT_USER, u); return u; };
const addUser = (u) => { const list = users(); list.push(u); writeObject(STORAGE_KEYS.USERS, list); return u; };
const audits = (action) => readCollection(STORAGE_KEYS.AUDIT_LOGS).filter((a) => a.action === action);

const dutService = await import('../js/services/dut.service.js');
const lifecycle = await import('../js/services/dut-lifecycle.service.js');
const ref = await import('../js/services/referentials.service.js');
const billing = await import('../js/services/dut-billing.service.js');
const road = await import('../js/services/road-control.service.js');
const { findDutById, getAllDuts } = await import('../js/repositories/dut.repository.js');
const { findOperationById, getAllOperations } = await import('../js/repositories/operations.repository.js');
const { visibleDuts } = await import('../js/services/insights.service.js');

// ---------------------------------------------------------------- Amorçage idempotent
{
  const count = () => [STORAGE_KEYS.USERS, STORAGE_KEYS.VEHICLES, STORAGE_KEYS.DRIVERS, STORAGE_KEYS.LOCALITIES, STORAGE_KEYS.OPERATIONS].map((k) => readCollection(k).length).join('/');
  const before = count();
  seedLotD3(); seedLotD3();
  assert.equal(count(), before, 'relancé, l’amorçage ne crée aucun doublon');
  assert.ok(readCollection(STORAGE_KEYS.TRANSPORTERS).every((t) => t.ownerPartnerId), 'chaque transporteur a un partenaire propriétaire');
}

const partners = readCollection(STORAGE_KEYS.PARTNERS);
const stfa = partners.find((p) => p.name === 'STFA DEMO');
const transcargo = partners.find((p) => p.name === 'TRANSCARGO SARL');
const T = Object.fromEntries(readCollection(STORAGE_KEYS.TRANSPORTERS).map((t) => [t.name, t]));
const abc = T['ABC TRANSPORT CI'];
const sahel = T['SAHEL TRANS EXPRESS'];
const ivoire = T['IVOIRE LOGISTIQUE SA'];
const otherAdmin = addUser({ id: 'u-tc', email: 'tc.admin@test', name: 'Admin Transcargo', role: 'PARTNER_ADMIN', partnerId: transcargo.id, partnerName: transcargo.name, antennaId: transcargo.antennaId, antennaName: transcargo.antennaName });
const bouakeAgent = addUser({ id: 'u-bk', email: 'bk.agent@test', name: 'Agent Bouaké', role: 'ANTENNA_AGENT', antennaId: transcargo.antennaId, antennaName: transcargo.antennaName });

// ---------------------------------------------------------------- Référentiels : cloisonnement, désactivation, retrait
{
  as('partner.admin@demo.oic.ci');
  const names = ref.transporters.list().map((t) => t.name);
  assert.ok(names.includes('ABC TRANSPORT CI') && !names.includes('SAHEL TRANS EXPRESS'), 'le partenaire ne voit que ses transporteurs');
  assert.throws(() => ref.transporters.update(sahel.id, { contact: 'x' }), /votre référentiel/, 'pas de modification d’une fiche d’un autre partenaire');
  assert.throws(() => ref.vehicles.deactivate(ref.vehicles.list({ owner: { all: true } }).find((v) => v.transporterId === sahel.id).id), /votre référentiel/);
  assert.throws(() => ref.vehicles.add({ immatriculation: 'ZZ-1', transporterId: sahel.id }), /votre référentiel/, 'véhicule rattaché à un transporteur d’autrui refusé');
  assert.throws(() => ref.vehicles.add({ immatriculation: 'ZZ-1' }), /propriétaire/);

  const added = ref.vehicles.add({ immatriculation: 'CI-1111-TT', transporterId: abc.id, type: 'Plateau' });
  assert.equal(added.ownerPartnerId, stfa.id);
  assert.equal(audits('REF_ADDED').length, 1);
  ref.vehicles.deactivate(added.id, 'Contrôle technique expiré');
  assert.ok(!ref.vehicles.selectable().some((v) => v.id === added.id), 'désactivé : plus proposé à la saisie');
  assert.ok(ref.vehicles.list().some((v) => v.id === added.id), 'désactivé : toujours visible dans le référentiel');
  assert.throws(() => ref.vehicles.deactivate(added.id), /active/);
  ref.vehicles.reactivate(added.id);
  assert.ok(ref.vehicles.selectable().some((v) => v.id === added.id));
  assert.throws(() => ref.vehicles.remove(added.id, ''), /motif/);
  ref.vehicles.remove(added.id, 'Véhicule vendu');
  assert.ok(!ref.vehicles.list().some((v) => v.id === added.id), 'retiré : masqué par défaut');
  const removed = ref.vehicles.list({ includeRemoved: true }).find((v) => v.id === added.id);
  assert.equal(ref.stateOf(removed), 'RETIRE');
  assert.deepEqual(removed.historique.map((h) => h.action), ['CREATION', 'DESACTIVATION', 'REACTIVATION', 'RETRAIT'], 'historique conservé');
  assert.throws(() => ref.vehicles.update(added.id, { type: 'x' }), /retirée/);
  assert.throws(() => ref.vehicles.reactivate(added.id), /désactivée/);
  assert.equal(audits('REF_REMOVED').length, 1);

  // Référentiels partagés : localités et désactivation
  const loc = ref.localities.add({ nom: 'Bondoukou', type: 'Ville', pays: 'Côte d’Ivoire' });
  assert.ok(ref.localities.selectable().some((l) => l.id === loc.id));
  ref.localities.deactivate(loc.id, 'Doublon');
  assert.ok(!ref.localities.selectable().some((l) => l.id === loc.id));
  const cacao = ref.merchandiseTypes.list().find((m) => m.nom === 'Riz');
  ref.merchandiseTypes.deactivate(cacao.id, 'Plus utilisé');
  assert.ok(!ref.merchandiseTypes.selectable().some((m) => m.id === cacao.id));
  ref.merchandiseTypes.reactivate(cacao.id);

  as('tc.admin@test');
  assert.deepEqual(ref.transporters.list().map((t) => t.name), ['SAHEL TRANS EXPRESS'], 'l’autre partenaire ne voit que les siens');
  as('transporteur@demo.oic.ci');
  assert.ok(ref.vehicles.selectable().every((v) => v.transporterId === abc.id), 'le transporteur ne voit que sa flotte');
  assert.ok(ref.drivers.selectable().length >= 2);
  assert.throws(() => ref.vehicles.add({ immatriculation: 'X', transporterId: abc.id }), /habilité/, 'mauvais rôle');
  as('antenne.agent@demo.oic.ci');
  assert.throws(() => ref.localities.add({ nom: 'X' }), /habilité/);
}

// ---------------------------------------------------------------- Facturation et sous-traitance
{
  const f = {
    expediteur: { prixTransport: 100000, accessoires: 10000, complementaires: 0, autres: 0, tva: 18, timbre: 100 },
    destinataire: { prixTransport: 50001, accessoires: 0, complementaires: 0, autres: 0, tva: 18, timbre: 0 },
  };
  const d = billing.billingDetail(f);
  assert.equal(d.expediteur.totalHT, 110000);
  assert.equal(d.expediteur.tvaMontant, 19800);
  assert.equal(d.expediteur.sousTotal, 129800);
  assert.equal(d.expediteur.total, 129900);
  assert.equal(d.destinataire.tvaMontant, 9000, 'TVA arrondie au franc');
  assert.equal(d.destinataire.total, 59001);
  assert.equal(d.totalHT, 160001);
  assert.equal(d.tva, 28800);
  assert.equal(d.timbreTotal, 100);
  assert.equal(d.totalAPercevoir, 188901);
  assert.deepEqual(billing.billingErrors(f, { compte: 'PROPRE' }), []);
  assert.match(billing.billingErrors({ ...f, expediteur: { ...f.expediteur, accessoires: -5 } }, { compte: 'PROPRE' })[0], /négatifs/);
  assert.match(billing.billingErrors({ ...f, destinataire: { ...f.destinataire, tva: 150 } }, { compte: 'PROPRE' })[0], /TVA/);
  assert.ok(billing.billingErrors({ expediteur: { timbre: 100 }, destinataire: {} }, { compte: 'PROPRE' }).some((e) => /prix du transport/.test(e)));
  assert.ok(billing.billingErrors({ ...f, expediteur: { ...f.expediteur, timbre: 50 } }, {}).some((e) => /timbre/.test(e)));
  assert.ok(billing.billingErrors(f, { compte: 'SOUS_TRAITANCE' }).some((e) => /donneur d’ordre/.test(e)));
  assert.deepEqual(billing.billingErrors(f, { compte: 'SOUS_TRAITANCE', donneurOrdre: 'IVOIRE LOGISTIQUE SA' }), []);
  assert.match(billing.accountMention({ compte: 'SOUS_TRAITANCE', donneurOrdre: 'IVOIRE LOGISTIQUE SA' }), /sous-traitance pour le compte de IVOIRE LOGISTIQUE SA/);
  assert.match(billing.accountMention({ compte: 'AUTRUI' }, { raisonSociale: 'AGRO CI' }), /compte d’autrui : AGRO CI/);
  assert.match(billing.accountMention({ compte: 'PROPRE' }), /compte propre/);
}

// Remplit un brouillon par son éditeur (passe par saveDraft, donc par les règles).
function fill(dut, overrides = {}) {
  dutService.saveDraft(dut.id, {
    general: { ...dut.general, immatriculation: 'AB-1234-CD', driverNom: 'KOUASSI', driverPrenoms: 'Jean', driverPermis: 'CI-PL-004521', driverPiece: '00219845102', ...(overrides.general || {}) },
    expediteur: { ...dut.expediteur, raisonSociale: 'SOCIETE AFRICAINE DE NEGOCE' },
    destinataire: { ...dut.destinataire, raisonSociale: 'INDUSTRIES DU NORD' },
    marchandises: [{ id: 'm1', nature: 'Cacao', emballage: 'Sacs', quantite: 100, poidsTonnes: 20, volumeM3: 30, valeur: 1000000, devise: 'FCFA' }],
    facturation: { expediteur: { prixTransport: 350000, accessoires: 0, complementaires: 0, autres: 0, tva: 18, timbre: 100 }, destinataire: { prixTransport: 0, accessoires: 0, complementaires: 0, autres: 0, tva: 18, timbre: 0 } },
    trajet: { ...dut.trajet, chargement: { ...dut.trajet.chargement, ville: 'Abidjan' }, dechargement: { ...dut.trajet.dechargement, ville: 'Bouaké' } },
  });
  return findDutById(dut.id);
}

// ---------------------------------------------------------------- Brouillon : la mise à jour générique est fermée
let partnerDut;
{
  const partner = as('partner.admin@demo.oic.ci');
  partnerDut = dutService.createDraft(partner);
  dutService.saveDraft(partnerDut.id, { status: 'VALIDE', dutNumber: 'DUT-CI-2026-999999', partnerId: transcargo.id, general: { ...partnerDut.general, transporterId: abc.id, transporterName: abc.name } });
  let stored = findDutById(partnerDut.id);
  assert.equal(stored.status, 'EN_EDITION', 'le statut ne passe pas par la mise à jour du brouillon');
  assert.equal(stored.dutNumber, null);
  assert.equal(stored.partnerId, stfa.id);
  as('tc.admin@test');
  assert.throws(() => dutService.saveDraft(partnerDut.id, { general: {} }), /éditeur/, 'autre entreprise');
  as('controle.agent@demo.oic.ci');
  assert.throws(() => dutService.saveDraft(partnerDut.id, { general: {} }), /éditeur/, 'mauvais rôle');
  as('partner.admin@demo.oic.ci');
  stored = fill(partnerDut, { general: { transporterId: abc.id, transporterName: abc.name } });
  // Fiche désactivée : soumission refusée tant qu'elle n'est pas réactivée.
  const veh = ref.vehicles.list().find((v) => v.immatriculation === 'AB-1234-CD');
  ref.vehicles.deactivate(veh.id, 'Test');
  assert.throws(() => dutService.submit(partnerDut.id), /véhicule choisi est désactivé/);
  ref.vehicles.reactivate(veh.id);
  dutService.submit(partnerDut.id);
  assert.throws(() => dutService.saveDraft(partnerDut.id, { general: {} }), /en édition/, 'un DUT soumis ne se modifie plus');
}

// ---------------------------------------------------------------- Guichet : saisie par l'antenne, validation par un autre agent
{
  const agent = as('antenne.agent@demo.oic.ci');
  assert.throws(() => lifecycle.createCounterDraft(agent, { usagerType: 'PARTENAIRE', usagerId: stfa.id }), /dépose la demande/);
  const counter = lifecycle.createCounterDraft(agent, { usagerType: 'PARTENAIRE', usagerId: stfa.id, deposantNom: 'KONAN Paul', deposantPiece: 'CNI 001' });
  assert.equal(counter.partnerId, stfa.id);
  assert.equal(counter.antennaId, agent.antennaId);
  assert.equal(counter.guichet.agentId, agent.id);
  assert.equal(audits('DUT_COUNTER_CREATED').length, 1);
  as('partner.admin@demo.oic.ci');
  assert.throws(() => dutService.saveDraft(counter.id, { general: {} }), /éditeur/, 'le partenaire ne modifie pas une saisie du guichet');
  as('antenne.agent@demo.oic.ci');
  fill(counter, { general: { transporterId: abc.id, transporterName: abc.name } });
  dutService.submit(counter.id);
  const opBefore = findOperationById(findDutById(counter.id).operationId).used;
  await assert.rejects(() => dutService.validate(counter.id), /autre agent/, 'la personne qui saisit ne valide pas');
  as('antenne.agent2@demo.oic.ci');
  const validated = await dutService.validate(counter.id);
  assert.equal(validated.status, 'VALIDE');
  assert.equal(findOperationById(validated.operationId).used, opBefore + 1, 'numéro pris sur la plage du partenaire usager');
  as('transporteur@demo.oic.ci');
  assert.throws(() => lifecycle.createCounterDraft(users().find((u) => u.role === 'TRANSPORTEUR'), { usagerType: 'PARTENAIRE', usagerId: stfa.id, deposantNom: 'x', deposantPiece: 'y' }), /Permission refusée/);
}

// ---------------------------------------------------------------- Transporteur : édition, règlement par référence, validation
let transporterDut;
{
  const tUser = as('transporteur@demo.oic.ci');
  transporterDut = dutService.createDraft(tUser);
  assert.equal(transporterDut.editeur.type, 'TRANSPORTEUR');
  assert.equal(transporterDut.general.transporterId, abc.id);
  fill(transporterDut, { general: { transporterId: sahel.id, transporterName: 'AUTRE' } });
  assert.equal(findDutById(transporterDut.id).general.transporterId, abc.id, 'le transporteur éditeur ne peut pas être remplacé');
  assert.equal(findDutById(transporterDut.id).general.transporterName, abc.name);
  assert.throws(() => dutService.submit(transporterDut.id), /Réglez/, 'pas de soumission sans règlement');
  const stock = lifecycle.referenceStock(abc.id);
  assert.equal(stock.available, 20);
  const partnerOps = getAllOperations().filter((o) => o.partnerId).map((o) => o.used).join(',');
  const antenna = readCollection(STORAGE_KEYS.ANTENNAS)[0];
  assert.throws(() => lifecycle.payAndSubmit(transporterDut.id, { reference: stock.next, antennaId: '' }), /antenne/);
  assert.throws(() => lifecycle.payAndSubmit(transporterDut.id, { reference: 'DUT-CI-2026-001000', antennaId: antenna.id }), /n’appartient pas/);
  as('partner.admin@demo.oic.ci');
  assert.throws(() => lifecycle.payAndSubmit(transporterDut.id, { reference: stock.next, antennaId: antenna.id }), /ne pouvez pas/, 'autre acteur');
  as('transporteur@demo.oic.ci');
  const paid = lifecycle.payAndSubmit(transporterDut.id, { reference: stock.next.toLowerCase(), antennaId: antenna.id });
  assert.equal(paid.status, 'TERMINE');
  assert.equal(paid.payment.reference, stock.next);
  assert.equal(paid.payment.simule, true);
  assert.equal(lifecycle.referenceStock(abc.id).available, 19, 'une référence débitée du stock');
  assert.throws(() => lifecycle.payAndSubmit(transporterDut.id, { reference: stock.next, antennaId: antenna.id }), /ne pouvez pas|déjà|en édition/);
  assert.equal(audits('DUT_REFERENCE_PAID').length, 1);
  as('antenne.agent@demo.oic.ci');
  const v = await dutService.validate(transporterDut.id);
  assert.equal(v.dutNumber, stock.next, 'le numéro du DUT est la référence réglée');
  assert.equal(lifecycle.referenceStock(abc.id).available, 19, 'aucune autre référence consommée à la validation');
  assert.equal(getAllOperations().filter((o) => o.partnerId).map((o) => o.used).join(','), partnerOps, 'aucune plage partenaire touchée');
  as('transporteur@demo.oic.ci');
  assert.throws(() => dutService.saveDraft(transporterDut.id, { general: {} }), /validé/, 'un DUT validé ne se modifie plus');

  // Guichet pour un usager transporteur : réglé au guichet avec son stock.
  const agent = as('antenne.agent@demo.oic.ci');
  assert.ok(lifecycle.counterUsagers().transporteurs.some((t) => t.id === abc.id));
  const c2 = lifecycle.createCounterDraft(agent, { usagerType: 'TRANSPORTEUR', usagerId: abc.id, deposantNom: 'KOFFI Roger', deposantPiece: 'CNI 002' });
  fill(c2);
  const paid2 = lifecycle.payAndSubmit(c2.id, { reference: lifecycle.referenceStock(abc.id).next });
  assert.equal(paid2.antennaId, agent.antennaId);
  assert.equal(lifecycle.referenceStock(abc.id).available, 18);
}

// ---------------------------------------------------------------- Transbordement
{
  const tUser = as('transporteur@demo.oic.ci');
  const before = findDutById(transporterDut.id);
  const opts = lifecycle.transshipOptions(tUser);
  const newVeh = opts.vehicules.find((v) => v.immatriculation === 'CI-5567-YZ');
  const newDrv = opts.conducteurs.find((d) => d.nom === 'OUATTARA');
  const base = { transporterId: abc.id, vehicleId: newVeh.id, driverId: newDrv.id, lieu: 'Yamoussoukro', date: new Date().toISOString().slice(0, 10), heure: '08:30', motif: 'PANNE' };
  const kouassi = opts.conducteurs.find((d) => d.nom === 'KOUASSI');
  const oldVeh = opts.vehicules.find((v) => v.immatriculation === 'AB-1234-CD');
  await assert.rejects(() => lifecycle.transship(transporterDut.id, { ...base, vehicleId: oldVeh.id, driverId: kouassi.id }), /Aucun changement/);
  await assert.rejects(() => lifecycle.transship(transporterDut.id, { ...base, lieu: '' }), /lieu/);
  await assert.rejects(() => lifecycle.transship(transporterDut.id, { ...base, motif: '' }), /motif/);
  await assert.rejects(() => lifecycle.transship(transporterDut.id, { ...base, motif: 'AUTRE' }), /Précisez/);
  await assert.rejects(() => lifecycle.transship(transporterDut.id, { ...base, date: '2000-01-01' }), /précéder/);
  as('tc.admin@test');
  await assert.rejects(() => lifecycle.transship(transporterDut.id, base), /Seul/, 'autre entreprise');
  as('transporteur@demo.oic.ci');
  await assert.rejects(() => lifecycle.transship(partnerDut.id, base), /Seul/, 'DUT non validé');
  const after = await lifecycle.transship(transporterDut.id, base);
  assert.equal(after.general.immatriculation, 'CI-5567-YZ');
  assert.equal(after.general.driverNom, 'OUATTARA');
  assert.notEqual(after.qrToken, before.qrToken, 'nouveau document');
  assert.equal(after.dutNumber, before.dutNumber);
  assert.equal(after.status, 'VALIDE');
  assert.equal(after.transbordements.length, 1);
  assert.equal(after.transbordements[0].avant.immatriculation, 'AB-1234-CD', 'le DUT d’origine garde la trace');
  assert.equal(after.transbordements[0].priseEnCharge.lieu, 'Yamoussoukro');
  assert.equal(after.replacedTokens[0].token, before.qrToken);
  assert.equal(audits('DUT_TRANSSHIPPED').length, 1);

  // Au contrôle : ancien QR refusé, nouveau QR valide.
  as('controle.agent@demo.oic.ci');
  const { verifyScan } = await import('../js/services/control.service.js');
  const { buildSignedUri } = await import('../js/services/qr.service.js');
  const oldScan = await verifyScan(buildSignedUri(before.qrSigned));
  assert.equal(oldScan.verdict.level, 'ROUGE');
  assert.ok(oldScan.verdict.findings.some((f) => f.code === 'DOCUMENT_REMPLACE'));
  const newScan = await verifyScan(buildSignedUri(after.qrSigned));
  assert.equal(newScan.verdict.level, 'VERT');
  const R = await import('../js/services/revocation.service.js');
  as('oic.admin@demo.oic.ci');
  assert.ok(R.sync().entries.some((e) => e.uid === before.qrToken && e.status === 'REMPLACE'), 'ancien QR dans la liste de révocation');

  // Le partenaire change de transporteur : l'ancien transporteur garde l'accès au DUT.
  const partner = as('partner.admin@demo.oic.ci');
  const pOpts = lifecycle.transshipOptions(partner);
  const counterDut = getAllDuts().find((d) => d.guichet?.usagerType === 'PARTENAIRE' && d.status === 'VALIDE');
  await lifecycle.transship(counterDut.id, {
    transporterId: ivoire.id, vehicleId: pOpts.vehicules.find((v) => v.transporterId === ivoire.id).id,
    driverId: pOpts.conducteurs.find((d) => d.nom === 'KONÉ').id, lieu: 'Toumodi', date: base.date, motif: 'CHANGEMENT_TRANSPORTEUR',
  });
  assert.equal(findDutById(counterDut.id).general.transporterName, 'IVOIRE LOGISTIQUE SA');
  const tu = users().find((u) => u.role === 'TRANSPORTEUR');
  assert.ok(dutService.listForTransporter(tu.transporterId).some((d) => d.id === counterDut.id));
  assert.ok(visibleDuts(tu).some((d) => d.id === counterDut.id));
}

// ---------------------------------------------------------------- Annulation : motif, auteur, numéro retiré
{
  const target = findDutById(transporterDut.id);
  as('transporteur@demo.oic.ci');
  assert.throws(() => dutService.withdraw(target.id, 'x'), /Permission refusée/, 'mauvais rôle');
  as('bk.agent@test');
  assert.throws(() => dutService.withdraw(target.id, 'x'), /votre antenne/, 'autre antenne');
  as('oic.admin@demo.oic.ci');
  assert.throws(() => dutService.withdraw(target.id, '  '), /motif/);
  const w = dutService.withdraw(target.id, 'Transport abandonné');
  assert.equal(w.status, 'RETIRE');
  assert.equal(w.withdrawnBy, 'Kouadio Serge');
  assert.equal(w.withdrawalReason, 'Transport abandonné');
  assert.ok(w.withdrawnAt);
  const op = findOperationById(w.operationId);
  assert.ok(op.retiredReferences.some((r) => r.reference === w.dutNumber), 'numéro retiré, tracé sur le stock');
  assert.equal(op.used, 2, 'le numéro n’est pas rendu au stock');
  assert.ok(audits('DUT_WITHDRAWN').some((a) => a.dutId === w.id && a.note === 'Transport abandonné'));
  assert.ok(audits('REFERENCE_RETIRED').some((a) => a.dutId === w.id));
  assert.throws(() => dutService.withdraw(target.id, 'encore'), /validé ou suspendu/);
  assert.throws(() => dutService.suspend(target.id, 'x'), /validé/);
  assert.equal(lifecycle.referenceStock(abc.id).retired.length, 1);
  as('antenne.agent@demo.oic.ci');
  const other = getAllDuts().find((d) => d.status === 'VALIDE' && d.antennaId === users().find((u) => u.email === 'antenne.agent@demo.oic.ci').antennaId && !d.canary);
  assert.equal(dutService.withdraw(other.id, 'Erreur de saisie constatée').status, 'RETIRE', 'l’antenne annule les DUT de son ressort');
}

// ---------------------------------------------------------------- Contrôle et archivage par l'antenne
{
  const agent = as('antenne.agent@demo.oic.ci');
  const pending = lifecycle.toArchive(agent);
  assert.ok(pending.length > 0 && pending.every((d) => d.antennaId === agent.antennaId && d.dutNumber));
  const target = pending[0];
  const all = { donnees: true, facture: true, pieces: true, exemplaire: true };
  assert.throws(() => lifecycle.archiveDut(target.id, { resultat: 'CONFORME', verifications: { donnees: true } }), /points de contrôle/);
  assert.throws(() => lifecycle.archiveDut(target.id, { resultat: 'RESERVES', verifications: all }), /réserves/);
  as('bk.agent@test');
  assert.throws(() => lifecycle.archiveDut(target.id, { resultat: 'CONFORME', verifications: all }), /votre antenne/);
  as('partner.admin@demo.oic.ci');
  assert.throws(() => lifecycle.archiveDut(target.id, { resultat: 'CONFORME', verifications: all }), /Permission refusée/);
  as('antenne.agent@demo.oic.ci');
  assert.throws(() => lifecycle.archiveDut(partnerDut.id, { resultat: 'CONFORME', verifications: all }), /numéroté/, 'DUT non édité');
  const a1 = lifecycle.archiveDut(target.id, { resultat: 'CONFORME', verifications: all, classeur: 'Classeur A' });
  assert.match(a1.cote, /^ARC-ABI-\d{4}-0001$/);
  const a2 = lifecycle.archiveDut(pending[1].id, { resultat: 'RESERVES', observation: 'Exemplaire destinataire manquant', verifications: all });
  assert.match(a2.cote, /-0002$/);
  assert.throws(() => lifecycle.archiveDut(target.id, { resultat: 'CONFORME', verifications: all }), /déjà archivé/);
  assert.equal(lifecycle.toArchive(agent).length, pending.length - 2);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(lifecycle.listArchives(agent, { from: today, to: today }).length, 2);
  assert.equal(lifecycle.listArchives(agent, { from: '2000-01-01', to: '2000-12-31' }).length, 0, 'filtre par période');
  assert.equal(audits('DUT_ARCHIVED').length, 2);
  as('bk.agent@test');
  assert.equal(lifecycle.listArchives(users().find((u) => u.id === 'u-bk')).length, 0, 'une antenne ne voit que ses archives');
  const oic = as('oic.admin@demo.oic.ci');
  assert.equal(lifecycle.listArchives(oic).length, 2);
  as('controle.agent@demo.oic.ci');
  assert.equal(lifecycle.listArchives(users().find((u) => u.role === 'CONTROLLER')).length, 0);
}

// ---------------------------------------------------------------- Contrôle sur route : recherche par conducteur et historique
{
  const ctrl = as('controle.agent@demo.oic.ci');
  assert.throws(() => road.searchByDriver('NOM', 'ko'), /3 lettres/);
  assert.throws(() => road.searchByDriver('PERMIS', '12'), /complet/);
  assert.throws(() => road.searchByDriver('AUTRE', 'kouassi'), /critère/);
  const byName = road.searchByDriver('NOM', 'kouassi');
  assert.ok(byName.total > 0 && byName.results.every((r) => r.dut.dutNumber && ['VALIDE', 'SUSPENDU', 'RETIRE'].includes(r.dut.status)), 'seuls les DUT édités');
  assert.ok(!byName.results.some((r) => r.dut.status === 'EN_EDITION'));
  const byPermis = road.searchByDriver('PERMIS', 'ci pl 007743');
  assert.ok(byPermis.results.some((r) => r.dut.id === transporterDut.id), 'conducteur de transbordement retrouvé par son permis');
  const byOldDriver = road.searchByDriver('PIECE', '00219845102');
  const hit = byOldDriver.results.find((r) => r.dut.id === transporterDut.id);
  assert.equal(hit.matchedOn, 'transbordement', 'l’ancien conducteur apparaît comme remplacé');
  assert.equal(road.searchByDriver('PERMIS', 'CI-PL-000000').total, 0);
  const { getAllControlSearches } = await import('../js/repositories/control-searches.repository.js');
  assert.equal(getAllControlSearches().length, 4, 'chaque recherche est journalisée');
  assert.equal(audits('CONTROL_DRIVER_SEARCH').length, 4);
  const history = road.myControls(ctrl);
  assert.equal(history.filter((h) => h.type === 'RECHERCHE').length, 4);
  assert.ok(history.filter((h) => h.type === 'SCAN').length >= 2, 'scans de l’agent inclus');
  assert.ok(history.every((h, i) => i === 0 || Date.parse(history[i - 1].date) >= Date.parse(h.date)), 'du plus récent au plus ancien');
  assert.equal(road.myControls(ctrl, { from: '2000-01-01', to: '2000-01-02' }).length, 0);
  assert.equal(road.searchVerdict([]), 'INCONNU');
  assert.equal(road.searchVerdict(['VALIDE']), 'VERT');
  assert.equal(road.searchVerdict(['RETIRE']), 'ROUGE');
  assert.equal(road.searchVerdict(['VALIDE', 'SUSPENDU']), 'ORANGE');
  as('partner.admin@demo.oic.ci');
  assert.throws(() => road.searchByDriver('NOM', 'kouassi'), /Permission refusée/, 'mauvais rôle');
  assert.throws(() => road.myControls(users().find((u) => u.email === 'partner.admin@demo.oic.ci')), /Permission refusée/);
}

console.log('Lot d3 : référentiels cloisonnés, facture détaillée, brouillon verrouillé, guichet, règlement par référence, transbordement, annulation, archivage, recherche conducteur : OK');
