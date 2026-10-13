// Lot d4 : équipements et moyens de mobilité des antennes. Recensement, affectation à un agent,
// déclaration de panne et suivi du dépannage (avec lien possible vers un incident matériel).
import { AUDIT_ACTIONS } from '../core/constants.js';
import * as repo from '../repositories/equipment.repository.js';
import { actor, canDo, text, oneOf, nextReference, antennaLabel, antennas, users, person, historyEntry, audit, nowIso, uuid } from './support-common.service.js';
import { declareIncident, appendLinkedNote, INCIDENT_SEVERITIES } from './incidents.service.js';

export const EQUIPMENT_TYPES = {
  ORDINATEUR_PORTABLE: 'Ordinateur portable',
  ORDINATEUR_FIXE: 'Ordinateur de bureau',
  IMPRIMANTE: 'Imprimante',
  LECTEUR_QR: 'Lecteur de QR code',
  TABLETTE: 'Tablette',
  TELEPHONE: 'Téléphone mobile',
  RESEAU: 'Routeur ou modem',
  ONDULEUR: 'Onduleur',
  VEHICULE: 'Véhicule de service',
  MOTO: 'Motocyclette',
};

export const MOBILITY_TYPES = ['VEHICULE', 'MOTO'];

export const EQUIPMENT_STATUS = {
  EN_SERVICE: 'En service',
  EN_PANNE: 'En panne',
  EN_REPARATION: 'En réparation',
  REFORME: 'Réformé',
};

export const REPAIR_OUTCOMES = { REPARE: 'Réparé, remis en service', IRREPARABLE: 'Irréparable, à réformer' };

function scopeOk(user, item) {
  if (user.role === 'OIC_ADMIN' || canDo(user, 'equipment.read')) return true; // Intégration : lecture nationale (Direction)
  return user.role === 'ANTENNA_AGENT' && Boolean(user.antennaId) && item.antennaId === user.antennaId;
}

function load(user, id) {
  const item = repo.findById(id);
  if (!item || !scopeOk(user, item)) throw new Error('Équipement introuvable ou hors de votre antenne.');
  return item;
}

function save(item, user, label, note, action) {
  item.history.push(historyEntry(user, label, note));
  item.updatedAt = nowIso();
  repo.upsert(item);
  audit(action, `${item.reference} (${item.serialNumber})`, note || label);
  return item;
}

export function currentFailure(item) {
  return (item.failures || []).find((f) => !f.closedAt) || null;
}

export function listEquipment() {
  const user = actor('equipment.view');
  return repo.getAll().filter((e) => scopeOk(user, e)).sort((a, b) => a.antennaName.localeCompare(b.antennaName, 'fr') || a.reference.localeCompare(b.reference));
}

export function getEquipment(id) {
  return load(actor('equipment.view'), id);
}

/** Antennes que l'utilisateur peut gérer (toutes pour l'OIC, la sienne pour un agent). */
export function manageableAntennas() {
  const user = actor('equipment.view');
  return antennas().filter((a) => user.role === 'OIC_ADMIN' || a.id === user.antennaId);
}

/** Personnes à qui affecter un équipement : comptes de l'antenne et chef d'antenne de l'annuaire. */
export function holdersFor(item) {
  const list = users().filter((u) => u.role === 'ANTENNA_AGENT' && u.antennaId === item.antennaId).map((u) => ({ id: u.id, name: u.name, detail: 'Agent de l’antenne' }));
  const chef = antennas().find((a) => a.id === item.antennaId)?.chef;
  if (chef && !list.some((p) => p.name === chef)) list.push({ id: `chef:${item.antennaId}`, name: chef, detail: 'Chef d’antenne' });
  return list;
}

export function allowedActions(item) {
  const user = actor('equipment.view');
  const manage = canDo(user, 'equipment.manage') && scopeOk(user, item);
  const failure = currentFailure(item);
  return {
    assign: manage && item.status !== 'REFORME',
    declareFailure: canDo(user, 'equipment.manage') && scopeOk(user, item) && item.status === 'EN_SERVICE',
    intervene: manage && Boolean(failure),
    closeRepair: manage && Boolean(failure),
    retire: canDo(user, 'equipment.retire'),
  };
}

export function registerEquipment(input = {}) {
  const user = actor('equipment.manage');
  // Cloisonnement : un agent d'antenne ne recense que le matériel de sa propre antenne.
  const antennaId = input.antennaId || (user.role === 'OIC_ADMIN' ? null : user.antennaId);
  if (user.role !== 'OIC_ADMIN' && antennaId !== user.antennaId) throw new Error('Vous ne pouvez recenser que le matériel de votre antenne.');
  if (!antennaId || !antennas().some((a) => a.id === antennaId)) throw new Error('Choisissez l’antenne de rattachement.');
  const serialNumber = text(input.serialNumber, { label: 'Le numéro de série', max: 60, min: 3 }).toUpperCase();
  if (repo.getAll().some((e) => e.serialNumber === serialNumber)) throw new Error('Ce numéro de série est déjà recensé.');
  const acquiredAt = String(input.acquiredAt || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(acquiredAt) || Number.isNaN(new Date(acquiredAt).getTime())) throw new Error('Indiquez la date d’acquisition.');
  if (acquiredAt > nowIso().slice(0, 10)) throw new Error('La date d’acquisition ne peut pas être dans le futur.');
  const item = {
    id: uuid(),
    reference: nextReference(repo.getAll(), 'EQ'),
    type: oneOf(input.type, EQUIPMENT_TYPES, 'Type'),
    label: text(input.label, { label: 'La désignation', max: 80, min: 2 }),
    serialNumber,
    antennaId,
    antennaName: antennaLabel(antennaId),
    acquiredAt,
    status: 'EN_SERVICE',
    holder: null,
    assignments: [],
    failures: [],
    history: [],
    createdAt: nowIso(),
  };
  return save(item, user, 'Équipement recensé', `${EQUIPMENT_TYPES[item.type]} · ${item.label} · ${item.antennaName}`, AUDIT_ACTIONS.EQUIPMENT_REGISTERED);
}

/** Affecte à une personne de l'antenne, ou remet en stock si `holderId` est vide. */
export function assignEquipment(id, holderId, note = '') {
  const user = actor('equipment.manage');
  const item = load(user, id);
  if (item.status === 'REFORME') throw new Error('Un équipement réformé ne peut plus être affecté.');
  const now = nowIso();
  const previous = item.holder;
  if (previous) {
    const open = item.assignments.find((a) => !a.until);
    if (open) open.until = now;
  }
  if (!holderId) {
    if (!previous) throw new Error('Cet équipement n’est affecté à personne.');
    item.holder = null;
    return save(item, user, 'Affectation retirée, équipement en stock', [`Auparavant : ${previous.name}`, text(note, { required: false, max: 300 })].filter(Boolean).join(' · '), AUDIT_ACTIONS.EQUIPMENT_ASSIGNED);
  }
  const target = holdersFor(item).find((p) => p.id === holderId);
  if (!target) throw new Error('Choisissez un agent de l’antenne de rattachement.');
  if (previous?.id === target.id) throw new Error('L’équipement est déjà affecté à cette personne.');
  item.holder = { id: target.id, name: target.name, since: now };
  item.assignments.push({ holderId: target.id, name: target.name, from: now, until: null, by: user.name });
  return save(item, user, previous ? 'Équipement réaffecté' : 'Équipement affecté', [target.name, previous ? `auparavant : ${previous.name}` : '', text(note, { required: false, max: 300 })].filter(Boolean).join(' · '), AUDIT_ACTIONS.EQUIPMENT_ASSIGNED);
}

export function declareFailure(id, input = {}) {
  const user = actor('equipment.view');
  const item = load(user, id);
  if (item.status !== 'EN_SERVICE') throw new Error('Une panne est déjà en cours de traitement pour cet équipement, ou il est réformé.');
  const description = text(input.description, { label: 'La description de la panne', max: 1000, min: 10 });
  const failure = { id: uuid(), declaredAt: nowIso(), declaredBy: person(user), description, incidentId: null, incidentReference: null, interventions: [], closedAt: null, outcome: null, report: '' };
  if (input.withIncident) {
    if (!canDo(user, 'incidents.declare')) throw new Error('Votre rôle ne permet pas de déclarer un incident.');
    const incident = declareIncident({
      category: 'MATERIEL',
      severity: INCIDENT_SEVERITIES[input.severity] ? input.severity : 'MAJEURE',
      antennaId: item.antennaId,
      title: `Panne : ${EQUIPMENT_TYPES[item.type].toLowerCase()} ${item.label}`.slice(0, 120),
      description: `${description}\nÉquipement ${item.reference}, numéro de série ${item.serialNumber}.`,
      equipmentId: item.id,
    });
    failure.incidentId = incident.id;
    failure.incidentReference = incident.reference;
  }
  item.failures.push(failure);
  item.status = 'EN_PANNE';
  return save(item, user, 'Panne déclarée', [description, failure.incidentReference ? `incident ${failure.incidentReference} ouvert` : ''].filter(Boolean).join(' · '), AUDIT_ACTIONS.EQUIPMENT_FAILURE);
}

export function addIntervention(id, input = {}) {
  const user = actor('equipment.manage');
  const item = load(user, id);
  const failure = currentFailure(item);
  if (!failure) throw new Error('Aucune panne en cours pour cet équipement.');
  const entry = { at: nowIso(), by: user.name, technician: text(input.technician, { label: 'L’intervenant', max: 80, min: 2 }), action: text(input.action, { label: 'L’action menée', max: 600, min: 5 }) };
  failure.interventions.push(entry);
  item.status = 'EN_REPARATION';
  return save(item, user, 'Intervention enregistrée', `${entry.technician} : ${entry.action}`, AUDIT_ACTIONS.EQUIPMENT_INTERVENTION);
}

export function closeRepair(id, input = {}) {
  const user = actor('equipment.manage');
  const item = load(user, id);
  const failure = currentFailure(item);
  if (!failure) throw new Error('Aucune panne en cours pour cet équipement.');
  const outcome = oneOf(input.outcome, REPAIR_OUTCOMES, 'Issue du dépannage');
  // Réformer un bien est une décision de l'OIC, pas de l'antenne.
  if (outcome === 'IRREPARABLE' && !canDo(user, 'equipment.retire')) throw new Error('La réforme d’un équipement est décidée par l’OIC. Enregistrez une intervention pour signaler qu’il est irréparable.');
  const report = text(input.report, { label: 'Le compte rendu', max: 800, min: 5 });
  Object.assign(failure, { closedAt: nowIso(), outcome, report, closedBy: user.name });
  if (outcome === 'REPARE') item.status = 'EN_SERVICE';
  else {
    item.status = 'REFORME';
    item.retiredAt = failure.closedAt;
    if (item.holder) { const open = item.assignments.find((a) => !a.until); if (open) open.until = failure.closedAt; item.holder = null; }
  }
  if (failure.incidentId) appendLinkedNote(failure.incidentId, user, outcome === 'REPARE' ? 'Équipement réparé' : 'Équipement réformé', `${item.reference} : ${report}`);
  return save(item, user, outcome === 'REPARE' ? 'Dépannage terminé, équipement remis en service' : 'Équipement réformé', report, outcome === 'REPARE' ? AUDIT_ACTIONS.EQUIPMENT_REPAIRED : AUDIT_ACTIONS.EQUIPMENT_RETIRED);
}

// Pour les tableaux de bord (après fusion) : le tableau appelant contrôle le droit d'accès.
export function brokenEquipment({ antennaId = null } = {}) {
  return repo.getAll().filter((e) => ['EN_PANNE', 'EN_REPARATION'].includes(e.status) && (!antennaId || e.antennaId === antennaId));
}

export function equipmentByAntenna() {
  const rows = new Map();
  for (const e of repo.getAll()) {
    const row = rows.get(e.antennaId) || { antennaId: e.antennaId, antennaName: e.antennaName, total: 0, inService: 0, broken: 0, retired: 0, unassigned: 0, mobility: 0 };
    row.total += 1;
    if (e.status === 'EN_SERVICE') row.inService += 1;
    if (['EN_PANNE', 'EN_REPARATION'].includes(e.status)) row.broken += 1;
    if (e.status === 'REFORME') row.retired += 1;
    if (e.status !== 'REFORME' && !e.holder) row.unassigned += 1;
    if (MOBILITY_TYPES.includes(e.type)) row.mobility += 1;
    rows.set(e.antennaId, row);
  }
  return [...rows.values()].sort((a, b) => b.broken - a.broken || a.antennaName.localeCompare(b.antennaName, 'fr'));
}
