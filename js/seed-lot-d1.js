// Lot d1 : données de démonstration des comptes et acteurs. Idempotent : relancé sans doublon.
import { ROLES, ORG_STATUS, DEMO_PASSWORD } from './core/constants.js';
import { uuid, nowIso } from './core/utils.js';
import { partnersStore, transportersStore, vehiclesStore, usersStore, applicationsRepo, declarationsRepo, antennasStore, writeSeedMarker } from './repositories/actors.repository.js';
import { createPendingAccount } from './services/account.service.js';
import { trace } from './services/d1-common.service.js';
import { DEMO_ACCOUNTS } from './seed.js';

export const SECOND_ADMIN_EMAIL = 'oic.superviseur@demo.oic.ci';
export const PENDING_AGENT_EMAIL = 'agent.stfa@demo.oic.ci';
const DEMO_PDF = 'data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgMzAwIDEyMF0vQ29udGVudHMgNCAwIFIvUmVzb3VyY2VzPDwvRm9udDw8L0YxIDUgMCBSPj4+Pj4+ZW5kb2JqCjQgMCBvYmo8PC9MZW5ndGggNjA+PnN0cmVhbQpCVCAvRjEgMTIgVGYgMjAgNjAgVGQgKFBpZWNlIGRlIGRlbW9uc3RyYXRpb24gRFVULU9JQykgVGogRVQKZW5kc3RyZWFtIGVuZG9iago1IDAgb2JqPDwvVHlwZS9Gb250L1N1YnR5cGUvVHlwZTEvQmFzZUZvbnQvSGVsdmV0aWNhPj5lbmRvYmoKdHJhaWxlcjw8L1Jvb3QgMSAwIFI+PgolJUVPRg==';

// Le second administrateur OIC permet de démontrer la séparation saisie / validation.
if (!DEMO_ACCOUNTS.some((a) => a.email === SECOND_ADMIN_EMAIL)) DEMO_ACCOUNTS.push({ email: SECOND_ADMIN_EMAIL, label: 'Admin OIC — second valideur', password: DEMO_PASSWORD });

const days = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const PARTNER_DATA = {
  'STFA DEMO': { rccm: 'CI-ABJ-2012-B-3301', email: 'contact@stfa-demo.ci', phone: '+225 27 21 35 40 50', address: 'Rue des Pêcheurs, Treichville', city: 'Abidjan', contactName: 'Aïcha Koné' },
  'TRANSCARGO SARL': { rccm: 'CI-BKE-2014-B-0775', email: 'direction@transcargo-demo.ci', phone: '+225 27 31 63 11 22', address: 'Quartier Commerce', city: 'Bouaké', contactName: 'Ibrahim Sanogo' },
};
const TRANSPORTER_DATA = {
  'ABC TRANSPORT CI': { email: 'contact@abc-transport-demo.ci', carteTransporteur: 'CTR-ABJ-2015-4521', city: 'Abidjan', address: 'Yopougon', contactName: 'Koffi Roger' },
  'IVOIRE LOGISTIQUE SA': { email: 'contact@ivoire-logistique-demo.ci', carteTransporteur: 'CTR-ABJ-2011-1187', city: 'Abidjan', address: 'Marcory', contactName: 'Diallo Mamadou' },
  'SAHEL TRANS EXPRESS': { email: 'contact@sahel-trans-demo.ci', carteTransporteur: 'CTR-BKE-2018-0932', city: 'Bouaké', address: 'Zone industrielle', contactName: 'Ouédraogo Issa' },
};

export async function seedLotD1() {
  const users = usersStore.getAll();
  if (!users.length) return; // démonstration de base absente : rien à compléter
  const oicAdmin = users.find((u) => u.email === 'oic.admin@demo.oic.ci');
  const stamp = nowIso();

  // Partenaires : état réel et coordonnées complètes.
  const partners = partnersStore.getAll();
  let changed = false;
  for (const p of partners) {
    if (p.status) continue;
    Object.assign(p, PARTNER_DATA[p.name] || {}, { status: ORG_STATUS.ACTIF, validatedAt: p.validatedAt || stamp, hasDut: true });
    changed = true;
  }
  if (!partners.some((p) => p.name === 'LOGISTIQUE DU LITTORAL')) {
    const sp = antennasStore.getAll().find((a) => /SAN/i.test(a.name)) || antennasStore.getAll()[0];
    const littoralId = uuid();
    trace('ORG_CREATED', { actor: oicAdmin, entity: 'PARTNER', entityId: littoralId, entityLabel: 'LOGISTIQUE DU LITTORAL', newValue: ORG_STATUS.EN_ATTENTE });
    partners.push({ id: littoralId, name: 'LOGISTIQUE DU LITTORAL', rccm: 'CI-SPE-2019-B-0412', email: 'direction@littoral-logistique-demo.ci', phone: '+225 34 71 40 12', address: 'Zone portuaire', city: 'San-Pédro', contactName: 'Yéo Clarisse', antennaId: sp?.id, antennaName: sp?.name, status: ORG_STATUS.EN_ATTENTE, createdAt: stamp, createdById: oicAdmin?.id, createdByName: oicAdmin?.name || 'Kouadio Serge', stateHistory: [{ id: uuid(), at: stamp, from: null, to: ORG_STATUS.EN_ATTENTE, by: oicAdmin?.name || 'Kouadio Serge', motif: 'Création de la fiche' }] });
    changed = true;
  }
  if (changed) partnersStore.saveAll(partners);

  // Transporteurs existants : actifs, avec e-mail, RCCM et carte.
  const transporters = transportersStore.getAll();
  changed = false;
  for (const t of transporters) {
    if (t.status) continue;
    Object.assign(t, TRANSPORTER_DATA[t.name] || {}, { status: ORG_STATUS.ACTIF, rccm: t.rccm || t.registre, phone: t.phone || t.contact, portee: t.portee || 'NATIONAL', origin: t.origin || 'HISTORIQUE', documents: t.documents || [], hasDut: true });
    changed = true;
  }
  if (changed) transportersStore.saveAll(transporters);
  const abc = transporters.find((t) => t.name === 'ABC TRANSPORT CI');

  // Comptes : téléphone, administrateur du compte transporteur, second administrateur OIC.
  const list = usersStore.getAll();
  changed = false;
  for (const u of list) {
    if (u.email === 'transporteur@demo.oic.ci' && !u.companyAdmin) { u.companyAdmin = true; changed = true; }
    if (u.email === 'partner.admin@demo.oic.ci' && !u.phone) { u.phone = '+225 07 07 10 20 30'; changed = true; }
  }
  if (!list.some((u) => u.email === SECOND_ADMIN_EMAIL)) { list.push({ id: uuid(), email: SECOND_ADMIN_EMAIL, name: 'Bamba Mariam', role: ROLES.OIC_ADMIN, createdAt: stamp }); changed = true; }
  if (changed) usersStore.saveAll(list);

  // Un agent partenaire créé mais pas encore activé : son lien est dans la boîte de réception simulée.
  const stfa = partnersStore.getAll().find((p) => p.name === 'STFA DEMO');
  if (stfa && !usersStore.getAll().some((u) => u.email === PENDING_AGENT_EMAIL)) {
    await createPendingAccount({ name: 'Konan Marc', email: PENDING_AGENT_EMAIL, phone: '+225 05 44 33 22 11', role: ROLES.PARTNER_EDITOR, partnerId: stfa.id, partnerName: stfa.name, antennaId: stfa.antennaId, antennaName: stfa.antennaName }, { reasonLabel: 'Aïcha Koné vous a créé un compte d’agent éditeur pour « STFA DEMO ».' });
  }

  // Véhicules : échéances (l'une proche) et état validé.
  const vehicles = vehiclesStore.getAll();
  changed = false;
  const ECH = { 'AB-1234-CD': [20, 160, 95], 'CI-5567-YZ': [210, 75, 300], 'BK-9081-EF': [140, -5, 60] };
  for (const v of vehicles) {
    if (v.status) continue;
    const e = ECH[v.immatriculation] || [180, 180, 180];
    Object.assign(v, { status: 'VALIDE', carteTransportExpire: v.carteTransportExpire || days(e[0]), visiteTechniqueExpire: v.visiteTechniqueExpire || days(e[1]), assuranceExpire: v.assuranceExpire || days(e[2]) });
    changed = true;
  }
  if (changed) vehiclesStore.saveAll(vehicles);

  // Demande d'inscription en ligne et déclaration de véhicule en attente de l'OIC.
  if (!applicationsRepo.getAll().some((a) => a.name === 'GBÊKÊ FRET SARL')) {
    applicationsRepo.add({ id: uuid(), name: 'GBÊKÊ FRET SARL', rccm: 'CI-BKE-2021-B-1290', carteTransporteur: 'CTR-BKE-2021-1290', email: 'contact@gbeke-fret-demo.ci', phone: '+225 07 58 12 34 56', address: 'Route de Katiola', city: 'Bouaké', contactName: 'Kouamé Brice', portee: 'NATIONAL', origin: 'AUTO_INSCRIPTION', status: 'EN_ATTENTE', createdAt: stamp, createdById: null, createdByName: 'Kouamé Brice', documents: [{ id: uuid(), type: 'RCCM', fileName: 'rccm-gbeke-fret.pdf', size: 406, dataUrl: DEMO_PDF, uploadedAt: stamp, uploadedBy: 'Kouamé Brice', review: null }] });
  }
  if (abc && !declarationsRepo.getAll().some((d) => d.data?.immatriculation === 'AB-7788-CI')) {
    const author = usersStore.getAll().find((u) => u.email === 'transporteur@demo.oic.ci');
    declarationsRepo.add({ id: uuid(), kind: 'AJOUT', transporterId: abc.id, transporterName: abc.name, vehicleId: null, status: 'EN_ATTENTE', createdAt: stamp, createdBy: author?.name || 'Koffi Roger', createdById: author?.id || null, motif: '', data: { immatriculation: 'AB-7788-CI', type: 'Porte-conteneur', ptac: 40, capaciteTonnes: 32, cartegrise: 'CG-2023-007788', dateMiseEnCirculation: '2023-02-14', carteTransport: 'CT-ABJ-2026-7788', carteTransportExpire: days(330), visiteTechniqueExpire: days(170), assuranceExpire: days(250) } });
  }
  writeSeedMarker(1);
}
