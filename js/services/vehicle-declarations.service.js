// Lot d1 : déclaration des véhicules par le transporteur (ajout, mise à jour, retrait), soumise à
// la validation de l'OIC. Le véhicule n'entre dans le référentiel qu'une fois la déclaration validée.
import { AUDIT_ACTIONS, ROLES } from '../core/constants.js';
import { nowIso, uuid } from '../core/utils.js';
import { declarationsRepo, vehiclesStore, transportersStore } from '../repositories/actors.repository.js';
import { sendMessage } from './messaging.service.js';
import { actorWith, trace, text, reason as cleanReason } from './d1-common.service.js';
import { statusOf } from './org-lifecycle.js';

export const VEHICLE_TYPES = ['Semi-remorque', 'Camion plateau', 'Camion benne', 'Citerne', 'Porte-conteneur', 'Fourgon', 'Tracteur routier'];
export const KIND_LABELS = { AJOUT: 'Nouveau véhicule', MODIFICATION: 'Mise à jour', RETRAIT: 'Retrait' };
export const DECL_STATUS_LABELS = { EN_ATTENTE: 'En attente OIC', VALIDEE: 'Validée', REFUSEE: 'Refusée' };
export const ECHEANCES = { carteTransportExpire: 'Carte de transport', visiteTechniqueExpire: 'Visite technique', assuranceExpire: 'Assurance' };
const DAY = 86400000;

const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
/** Contrôle des caractéristiques : immatriculation, carte grise, PTAC, carte de transport et échéances. */
export function cleanVehicle(values, { allowPast = false } = {}) {
  const immat = String(values.immatriculation || '').trim().toUpperCase().replace(/\s+/g, '-');
  if (!/^[A-Z0-9]{1,4}(-[A-Z0-9]{1,5}){1,3}$/.test(immat) || immat.length > 14) throw new Error('Immatriculation invalide (ex. AB-1234-CD).');
  const ptac = Number(String(values.ptac ?? '').replace(',', '.'));
  const capacite = Number(String(values.capaciteTonnes ?? '').replace(',', '.'));
  if (!(ptac > 0 && ptac <= 80)) throw new Error('PTAC invalide : entre 1 et 80 tonnes.');
  if (!(capacite > 0) || capacite > ptac) throw new Error('La charge utile doit être positive et ne pas dépasser le PTAC.');
  const data = {
    immatriculation: immat,
    type: text(values.type, 'type de véhicule', { required: true, max: 40 }),
    ptac, capaciteTonnes: capacite,
    cartegrise: text(values.cartegrise, 'numéro de carte grise', { required: true, max: 40 }).toUpperCase(),
    dateMiseEnCirculation: values.dateMiseEnCirculation && isDate(values.dateMiseEnCirculation) ? values.dateMiseEnCirculation : '',
    carteTransport: text(values.carteTransport, 'numéro de carte de transport', { required: true, max: 40 }).toUpperCase(),
  };
  for (const key of Object.keys(ECHEANCES)) {
    const v = String(values[key] || '').trim();
    if (!v) { if (key === 'carteTransportExpire') throw new Error('Indiquez l’échéance de la carte de transport.'); data[key] = ''; continue; }
    if (!isDate(v)) throw new Error(`Date d’échéance invalide : ${ECHEANCES[key]}.`);
    if (!allowPast && Date.parse(v) < Date.now() - DAY) throw new Error(`${ECHEANCES[key]} déjà échue : renouvelez-la avant de déclarer le véhicule.`);
    data[key] = v;
  }
  if (data.dateMiseEnCirculation && Date.parse(data.dateMiseEnCirculation) > Date.now()) throw new Error('La date de mise en circulation ne peut pas être future.');
  return data;
}

/** État des échéances d'un véhicule : échue, proche (30 jours), à jour. */
export function deadlines(vehicle) {
  return Object.entries(ECHEANCES).filter(([k]) => vehicle[k]).map(([k, label]) => {
    const days = Math.floor((Date.parse(vehicle[k]) - Date.now()) / DAY);
    return { key: k, label, date: vehicle[k], days, level: days < 0 ? 'ECHUE' : days <= 30 ? 'PROCHE' : 'OK' };
  });
}

function own() {
  const actor = actorWith('fleet.declare');
  if (actor.role !== ROLES.TRANSPORTEUR || !actor.transporterId) throw new Error('Action réservée aux transporteurs.');
  const t = transportersStore.findById(actor.transporterId);
  if (!t || statusOf(t) !== 'ACTIF') throw new Error('Votre entreprise doit être active pour déclarer des véhicules.');
  return { actor, t };
}

export function myFleet() {
  const { t } = own();
  const decl = declarationsRepo.getAll().filter((d) => d.transporterId === t.id).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return {
    vehicles: vehiclesStore.getAll().filter((v) => v.transporterId === t.id).map((v) => ({ ...v, status: v.status || 'VALIDE', deadlines: deadlines(v), pending: decl.find((d) => d.vehicleId === v.id && d.status === 'EN_ATTENTE') || null })),
    declarations: decl,
  };
}

function plateTaken(immat, exceptVehicleId) {
  if (vehiclesStore.getAll().some((v) => v.immatriculation.toUpperCase() === immat && v.id !== exceptVehicleId && v.status !== 'RETIRE')) return true;
  return declarationsRepo.getAll().some((d) => d.status === 'EN_ATTENTE' && d.data.immatriculation === immat && (!exceptVehicleId || d.vehicleId !== exceptVehicleId));
}

/** Déclaration : nouveau véhicule (vehicleId vide), mise à jour ou retrait d'un véhicule de sa flotte. */
export function declareVehicle(values, { vehicleId = null, kind = vehicleId ? 'MODIFICATION' : 'AJOUT', motif = '' } = {}) {
  const { actor, t } = own();
  let vehicle = null;
  if (vehicleId) {
    vehicle = vehiclesStore.findById(vehicleId);
    if (!vehicle || vehicle.transporterId !== t.id) throw new Error('Ce véhicule n’appartient pas à votre flotte.');
    if (vehicle.status === 'RETIRE') throw new Error('Ce véhicule est retiré de la flotte.');
    if (declarationsRepo.getAll().some((d) => d.vehicleId === vehicleId && d.status === 'EN_ATTENTE')) throw new Error('Une déclaration est déjà en attente pour ce véhicule.');
  }
  const data = kind === 'RETRAIT' ? { immatriculation: vehicle.immatriculation } : cleanVehicle(values);
  if (kind !== 'RETRAIT' && plateTaken(data.immatriculation, vehicleId)) throw new Error(`Le véhicule ${data.immatriculation} est déjà enregistré ou déclaré.`);
  const decl = { id: uuid(), kind, transporterId: t.id, transporterName: t.name, vehicleId, data, motif: kind === 'RETRAIT' ? cleanReason(motif) : '', status: 'EN_ATTENTE', createdAt: nowIso(), createdBy: actor.name, createdById: actor.id };
  declarationsRepo.add(decl);
  trace(AUDIT_ACTIONS.VEHICLE_DECLARED, { actor, entity: 'VEHICLE', entityId: t.id, entityLabel: data.immatriculation, note: `${KIND_LABELS[kind]} — ${data.immatriculation}` });
  return decl;
}

export function cancelDeclaration(id) {
  const { actor, t } = own();
  const d = declarationsRepo.findById(id);
  if (!d || d.transporterId !== t.id || d.status !== 'EN_ATTENTE') throw new Error('Déclaration introuvable ou déjà traitée.');
  declarationsRepo.saveAll(declarationsRepo.getAll().filter((x) => x.id !== id));
  trace(AUDIT_ACTIONS.VEHICLE_REFUSED, { actor, entity: 'VEHICLE', entityId: t.id, entityLabel: d.data.immatriculation, note: 'Déclaration annulée par le transporteur' });
}

// ------------------------------------------------------------------ OIC
export function pendingDeclarations() {
  actorWith('transporters.manage');
  return declarationsRepo.getAll().filter((d) => d.status === 'EN_ATTENTE').sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .map((d) => ({ ...d, current: d.vehicleId ? vehiclesStore.findById(d.vehicleId) : null }));
}

export function decideDeclaration(id, approve, motif = '') {
  const actor = actorWith('actors.validate');
  const d = declarationsRepo.findById(id);
  if (!d || d.status !== 'EN_ATTENTE') throw new Error('Déclaration introuvable ou déjà traitée.');
  if (d.createdById === actor.id) throw new Error('La personne qui a déclaré ne peut pas valider.');
  const why = approve ? String(motif || '').trim() : cleanReason(motif);
  if (approve) {
    if (d.kind !== 'RETRAIT' && vehiclesStore.getAll().some((v) => v.immatriculation.toUpperCase() === d.data.immatriculation && v.id !== d.vehicleId && v.status !== 'RETIRE')) throw new Error('Immatriculation déjà enregistrée entre-temps : refusez la déclaration.');
    const t = transportersStore.findById(d.transporterId);
    if (!t || statusOf(t) !== 'ACTIF') throw new Error('Le transporteur n’est plus actif.');
    if (d.kind === 'AJOUT') vehiclesStore.add({ id: uuid(), ...d.data, transporterId: d.transporterId, status: 'VALIDE', validatedAt: nowIso(), validatedBy: actor.name, declarationId: d.id });
    else {
      const v = vehiclesStore.findById(d.vehicleId);
      if (!v) throw new Error('Véhicule introuvable.');
      if (d.kind === 'RETRAIT') vehiclesStore.replace({ ...v, status: 'RETIRE', retiredAt: nowIso(), retiredBy: actor.name });
      else vehiclesStore.replace({ ...v, ...d.data, status: 'VALIDE', validatedAt: nowIso(), validatedBy: actor.name });
    }
  }
  declarationsRepo.replace({ ...d, status: approve ? 'VALIDEE' : 'REFUSEE', decidedAt: nowIso(), decidedBy: actor.name, decisionMotif: why });
  trace(approve ? AUDIT_ACTIONS.VEHICLE_VALIDATED : AUDIT_ACTIONS.VEHICLE_REFUSED, { actor, entity: 'VEHICLE', entityId: d.transporterId, entityLabel: d.data.immatriculation, note: `${KIND_LABELS[d.kind]} — ${d.data.immatriculation}${why ? ` — ${why}` : ''}` });
  const t = transportersStore.findById(d.transporterId);
  if (t?.email) sendMessage({ channel: 'EMAIL', to: t.email, kind: 'VEHICLE', entityId: t.id, subject: `Véhicule ${d.data.immatriculation} : déclaration ${approve ? 'validée' : 'refusée'}`, body: `Bonjour,\nVotre déclaration « ${KIND_LABELS[d.kind]} » pour le véhicule ${d.data.immatriculation} a été ${approve ? 'validée' : 'refusée'} par l’OIC.${why ? `\nMotif : ${why}` : ''}` });
  return declarationsRepo.findById(id);
}
