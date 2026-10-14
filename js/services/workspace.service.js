import { settings } from '../services/settings.service.js';
import { readObject, writeObject } from '../core/storage.js';
import { getCurrentUser } from '../core/auth.js';
import { visibleDuts } from './insights.service.js';
import { blankDut, validateForSubmit } from './dut.service.js';
import { addDut } from '../repositories/dut.repository.js';
import { uuid, nowIso } from '../core/utils.js';

export const LOCAL_KEY = 'dut_workspace_v1';
export const STAGES = { PLANNED: 'À préparer', LOADED: 'Chargé', DEPARTED: 'En route', ARRIVED: 'Arrivé', DELIVERED: 'Livré' };
export const INCIDENT_TYPES = ['Retard', 'Panne', 'Barrage', 'Litige au chargement', 'Marchandise endommagée', 'Écart de quantité', 'Autre'];
export function accessibleDut(id) {
  const dut = visibleDuts(getCurrentUser()).find(d => d.id === id);
  if (!dut) throw new Error('Ce dossier ne fait pas partie de votre périmètre.');
  return dut;
}
export function canContribute(user = getCurrentUser()) {
  return ['PARTNER_ADMIN', 'PARTNER_EDITOR', 'TRANSPORTEUR', 'ANTENNA_AGENT', 'OIC_ADMIN'].includes(user?.role);
}
export function dossier(id) {
  accessibleDut(id);
  return readObject(LOCAL_KEY, {})[id] || { stage: 'PLANNED', events: [], incidents: [], files: [], checks: {} };
}
function mutate(id, fn) {
  accessibleDut(id);
  if (!canContribute()) throw new Error('Action non autorisée.');
  const all = readObject(LOCAL_KEY, {});
  const record = all[id] || { stage: 'PLANNED', events: [], incidents: [], files: [], checks: {} };
  fn(record);
  record.updatedAt = nowIso();
  all[id] = record;
  writeObject(LOCAL_KEY, all);
  return record;
}
function event(record, label, note = '') {
  record.events.unshift({ id: uuid(), label, note, at: nowIso(), author: getCurrentUser().name });
}
export function advanceTransport(id, stage, note = '') {
  const dut = accessibleDut(id);
  if (dut.status !== 'VALIDE') throw new Error('Un DUT valide est requis pour avancer le transport.');
  return mutate(id, record => {
    const order = Object.keys(STAGES);
    if (order.indexOf(stage) !== order.indexOf(record.stage) + 1) throw new Error('Respectez l’ordre des étapes du transport.');
    record.stage = stage;
    event(record, STAGES[stage], String(note).trim().slice(0, 1000));
  });
}
export function addIncident(id, { type, severity, description, assignee }) {
  if (!INCIDENT_TYPES.includes(type) || !['NORMAL', 'URGENT'].includes(severity)) throw new Error('Type ou priorité invalide.');
  if (!description?.trim() || !assignee?.trim()) throw new Error('Précisez les faits et le responsable du suivi.');
  return mutate(id, record => {
    record.incidents.unshift({ id: uuid(), type, severity, description: description.trim().slice(0, 2000), assignee: assignee.trim().slice(0, 100), status: 'OPEN', createdAt: nowIso(), author: getCurrentUser().name });
    event(record, 'Incident signalé', type);
  });
}
export function resolveIncident(id, incidentId, resolution) {
  if (!resolution?.trim()) throw new Error('Précisez la résolution de l’incident.');
  return mutate(id, record => {
    const item = record.incidents.find(i => i.id === incidentId);
    if (!item || item.status !== 'OPEN') throw new Error('Cet incident est déjà résolu ou introuvable.');
    Object.assign(item, { status: 'RESOLVED', resolution: resolution.trim().slice(0, 2000), resolvedAt: nowIso(), resolvedBy: getCurrentUser().name });
    event(record, 'Incident résolu', `${item.type} : ${item.resolution}`);
  });
}
export function setCheck(id, key, checked) {
  if (!['transport', 'registration', 'license', 'cargo'].includes(key)) throw new Error('Vérification inconnue.');
  return mutate(id, record => { record.checks[key] = Boolean(checked); event(record, 'Checklist mise à jour', key); });
}
export function checklist(dut) {
  return validateForSubmit(dut);
}
export function duplicateDut(id) {
  const source = accessibleDut(id);
  const user = getCurrentUser();
  if (!['PARTNER_ADMIN', 'PARTNER_EDITOR'].includes(user.role)) throw new Error('La duplication est réservée au partenaire.');
  const copy = blankDut(user);
  for (const key of ['general', 'expediteur', 'destinataire', 'marchandises', 'facturation', 'trajet', 'dangereuse', 'temperatureControlee']) copy[key] = structuredClone(source[key]);
  copy.general.dateEmission = new Date().toISOString().slice(0, 10);
  Object.assign(copy.trajet, { dateDepart: '', heureDepart: '', dateArrivee: '', heureArrivee: '' });
  copy.trajet.chargement.datePrevue = ''; copy.trajet.dechargement.datePrevue = '';
  copy.duplicatedFrom = source.id;
  addDut(copy);
  return copy;
}
export async function attachFile(id, file, category = 'Autre') {
  accessibleDut(id);
  if (!file || !['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) throw new Error('Choisissez un PDF, une image JPEG ou PNG.');
  if (file.size > 300 * 1024) throw new Error('La taille maximale est de 300 Ko par fichier pour ce POC local.');
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Lecture du fichier impossible.')); reader.readAsDataURL(file);
  });
  return mutate(id, record => {
    const all = readObject(LOCAL_KEY, {});
    const used = Object.values(all).reduce((n, r) => n + (r.files || []).reduce((s, f) => s + f.size, 0), 0);
    if (used + file.size > 1500 * 1024) throw new Error('La capacité locale des pièces jointes (1,5 Mo) est atteinte. Supprimez un fichier avant de réessayer.');
    record.files.unshift({ id: uuid(), name: file.name, type: file.type, size: file.size, category, data, at: nowIso(), author: getCurrentUser().name });
    event(record, 'Pièce jointe enregistrée', file.name);
  });
}
export function removeFile(id, fileId) {
  return mutate(id, record => {
    const file = record.files.find(f => f.id === fileId);
    if (!file) throw new Error('Pièce introuvable.');
    record.files = record.files.filter(f => f.id !== fileId);
    event(record, 'Pièce jointe supprimée', file.name);
  });
}
export function getActions(user = getCurrentUser()) {
  const all = readObject(LOCAL_KEY, {});
  const rows = [];
  const partner = ['PARTNER_ADMIN', 'PARTNER_EDITOR'].includes(user?.role);
  for (const dut of visibleDuts(user)) {
    const record = all[dut.id];
    const push = (label, category, urgent = false) => rows.push({ dut, label, category, urgent });
    if (partner && dut.status === 'EN_EDITION') push('Compléter le brouillon', 'DOCUMENT');
    if (partner && dut.status === 'REJETE') push('Corriger le dossier retourné', 'DOCUMENT', true);
    if (['OIC_ADMIN', 'ANTENNA_AGENT'].includes(user?.role) && dut.status === 'TERMINE') push('Dossier en attente de validation', 'DOCUMENT', (Date.now() - Date.parse(dut.submittedAt || dut.createdAt)) >= settings().overdueDays * 86400000);
    if (dut.status === 'SUSPENDU') push('DUT suspendu : suivi requis', 'DOCUMENT', true);
    if (dut.status === 'VALIDE' && record?.stage !== 'DELIVERED') push(record?.stage === 'ARRIVED' ? 'Confirmer la livraison' : 'Mettre à jour le transport', 'TRANSPORT');
    for (const incident of record?.incidents || []) if (incident.status === 'OPEN') push(`${incident.type} · ${incident.assignee}`, 'INCIDENT', incident.severity === 'URGENT');
  }
  return rows.sort((a, b) => Number(b.urgent) - Number(a.urgent));
}

export function saveSchedule(id, { start, end }) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(start || '') || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(end || '') || !Number.isFinite(Date.parse(start)) || !(Date.parse(end) > Date.parse(start))) throw new Error('Renseignez un départ et une arrivée postérieure au départ.');
  return mutate(id, record => {
    record.schedule = { start, end };
    event(record, 'Planning prévisionnel mis à jour', `${start} → ${end}`);
  });
}
