// Lot d1 : transporteurs — inscription en libre-service, dossier et fiche, entités rattachées,
// validation / suspension par l'OIC, import d'une liste existante (transporteurs et véhicules).
// Une demande d'inscription reste hors du référentiel des transporteurs tant qu'elle n'est pas validée :
// un transporteur non validé n'est donc jamais proposé à la saisie d'un DUT.
import { AUDIT_ACTIONS, ORG_STATUS, ROLES } from '../core/constants.js';
import { nowIso, uuid } from '../core/utils.js';
import { applicationsRepo, transportersStore, vehiclesStore, usersStore, auditStore, declarationsRepo } from '../repositories/actors.repository.js';
import { createPendingAccount } from './account.service.js';
import { sendMessage } from './messaging.service.js';
import { actorWith, trace, text, email as cleanEmail, phone as cleanPhone, rccm as cleanRccm, rccmKey, reason as cleanReason } from './d1-common.service.js';
import { statusOf, transition, assertUnique, requestChanges, cancelChangeRequest, decideChange, orgUsers, pushHistory } from './org-lifecycle.js';
import { cleanVehicle } from './vehicle-declarations.service.js';

export const TRANSPORTER_CFG = {
  entity: 'TRANSPORTER', label: 'Transporteur', store: transportersStore, userKey: 'transporterId', nameKey: 'transporterName', roles: [ROLES.TRANSPORTEUR],
  sensitive: { name: 'Raison sociale', email: 'Adresse e-mail', rccm: 'RCCM', carteTransporteur: 'Carte de transporteur' },
  editable: { phone: 'Téléphone', address: 'Adresse', city: 'Ville', contactName: 'Responsable', portee: 'Portée' },
};
export const PORTEES = { NATIONAL: 'Nationale', INTERNATIONAL: 'Internationale' };
export const DOC_TYPES = { RCCM: 'Registre du commerce (RCCM)', CARTE_TRANSPORTEUR: 'Carte de transporteur', DFE: 'Déclaration fiscale d’existence', ASSURANCE: 'Attestation d’assurance', AUTRE: 'Autre pièce' };
export const MAX_DOC_BYTES = 300 * 1024;
const ORIGINS = { AUTO_INSCRIPTION: 'Inscription en ligne', OIC: 'Saisie OIC', FILIALE: 'Entité rattachée', IMPORT: 'Import de l’existant', HISTORIQUE: 'Données existantes' };
export const originLabel = (o) => ORIGINS[o] || ORIGINS.HISTORIQUE;

function clean(values) {
  const portee = values.portee || 'NATIONAL';
  if (!PORTEES[portee]) throw new Error('Portée inconnue.');
  return {
    name: text(values.name, 'raison sociale', { required: true, max: 120 }).toUpperCase(),
    rccm: cleanRccm(values.rccm),
    carteTransporteur: text(values.carteTransporteur, 'numéro de carte de transporteur', { required: true, max: 40 }).toUpperCase(),
    email: cleanEmail(values.email, 'adresse e-mail de l’entreprise'),
    phone: cleanPhone(values.phone, { required: true }),
    address: text(values.address, 'adresse', { max: 160 }),
    city: text(values.city, 'ville', { required: true, max: 60 }),
    contactName: text(values.contactName, 'nom du responsable', { required: true, max: 100 }),
    portee,
  };
}

/** Anti-doublon sur les transporteurs enregistrés ET les demandes en cours ; une filiale partage le RCCM de son parent. */
function unique(candidate, { excludeId = null, parentId = null } = {}) {
  const pending = applicationsRepo.getAll().filter((a) => a.status === 'EN_ATTENTE');
  assertUnique([...transportersStore.getAll(), ...pending], candidate, { excludeId, allowRccmOf: parentId, label: 'transporteur' });
  if (candidate.email && usersStore.getAll().some((u) => u.email.toLowerCase() === candidate.email && u.transporterId !== excludeId)) throw new Error(`L’adresse ${candidate.email} est déjà utilisée par un compte de la plateforme.`);
}

/** Pièce du dossier : métadonnées + contenu (300 Ko au plus, conservé localement pour la démonstration). */
export function cleanDocument(doc) {
  if (!doc || !DOC_TYPES[doc.type]) throw new Error('Choisissez le type de pièce.');
  if (!doc.fileName || !doc.dataUrl) throw new Error('Joignez le fichier de la pièce.');
  if (Number(doc.size) > MAX_DOC_BYTES) throw new Error('Fichier trop volumineux : 300 Ko au maximum dans cette démonstration.');
  if (!/^data:(application\/pdf|image\/(png|jpeg));base64,/.test(doc.dataUrl)) throw new Error('Formats acceptés : PDF, PNG ou JPEG.');
  return { id: uuid(), type: doc.type, fileName: String(doc.fileName).slice(0, 120), size: Number(doc.size) || 0, dataUrl: doc.dataUrl, uploadedAt: nowIso(), review: null };
}

// ------------------------------------------------------------------ Inscription (espace public)
/** Inscription en ligne : la demande attend la validation OIC ; aucun compte n'est créé avant. */
export function registerTransporter(values, documents = []) {
  const v = clean(values);
  if (values.accept !== true && values.accept !== 'on') throw new Error('Confirmez l’exactitude des informations déclarées.');
  unique(v);
  const docs = documents.filter(Boolean).map((d) => ({ ...cleanDocument(d), uploadedBy: v.contactName }));
  const app = { id: uuid(), ...v, origin: 'AUTO_INSCRIPTION', status: 'EN_ATTENTE', documents: docs, createdAt: nowIso(), createdById: null, createdByName: v.contactName };
  applicationsRepo.add(app);
  trace(AUDIT_ACTIONS.ORG_CREATED, { entity: 'TRANSPORTER', entityId: app.id, entityLabel: app.name, newValue: 'EN_ATTENTE', note: 'Inscription en ligne' });
  sendMessage({ channel: 'EMAIL', to: app.email, kind: 'ORG_DECISION', entityId: app.id, subject: 'Votre demande d’inscription DUT est enregistrée', body: `Bonjour ${v.contactName},\nLa demande d’inscription de « ${app.name} » est enregistrée sous la référence ${app.id.slice(0, 8).toUpperCase()}.\nL’OIC va examiner votre dossier. Vous recevrez le lien d’activation de votre compte dès la validation.` });
  return { reference: app.id.slice(0, 8).toUpperCase(), email: app.email };
}

// ------------------------------------------------------------------ Administrateur OIC
export function createTransporterApplication(values) {
  const actor = actorWith('transporters.manage');
  const v = clean(values);
  unique(v);
  const app = { id: uuid(), ...v, origin: 'OIC', status: 'EN_ATTENTE', documents: [], createdAt: nowIso(), createdById: actor.id, createdByName: actor.name };
  applicationsRepo.add(app);
  trace(AUDIT_ACTIONS.ORG_CREATED, { actor, entity: 'TRANSPORTER', entityId: app.id, entityLabel: app.name, newValue: 'EN_ATTENTE', note: 'Saisie OIC' });
  return app;
}

export function listApplications({ status = 'EN_ATTENTE' } = {}) {
  actorWith('transporters.manage');
  return applicationsRepo.getAll().filter((a) => !status || a.status === status).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map((a) => ({ ...a, parentName: a.parentId ? transportersStore.findById(a.parentId)?.name || '' : '' }));
}

/** Validation d'une demande : fiche transporteur active, compte administrateur créé une seule fois avec lien d'activation. */
export async function validateApplication(id) {
  const actor = actorWith('actors.validate');
  const app = applicationsRepo.findById(id);
  if (!app || app.status !== 'EN_ATTENTE') throw new Error('Seule une demande en attente peut être validée.');
  if (app.createdById === actor.id) throw new Error('Un autre administrateur OIC que l’auteur de la saisie doit valider (séparation des tâches).');
  if (transportersStore.findById(id)) throw new Error('Ce transporteur est déjà enregistré.');
  unique(app, { excludeId: id, parentId: app.parentId });
  const transporter = {
    id: app.id, name: app.name, registre: app.rccm, rccm: app.rccm, carteTransporteur: app.carteTransporteur, contact: app.phone, adresse: [app.address, app.city].filter(Boolean).join(', '),
    email: app.email, phone: app.phone, address: app.address, city: app.city, contactName: app.contactName, portee: app.portee, parentId: app.parentId || null,
    documents: app.documents || [], status: ORG_STATUS.ACTIF, origin: app.origin, createdAt: app.createdAt, validatedAt: nowIso(), validatedBy: actor.name, hasDut: true,
  };
  pushHistory(transporter, { from: ORG_STATUS.EN_ATTENTE, to: ORG_STATUS.ACTIF, by: actor.name, byId: actor.id, motif: 'Validation de la demande' });
  transportersStore.add(transporter);
  try {
    const admin = await createPendingAccount({ name: app.contactName, email: app.email, phone: app.phone, role: ROLES.TRANSPORTEUR, transporterId: transporter.id, transporterName: transporter.name, companyAdmin: true }, { actor, reasonLabel: `Votre entreprise « ${transporter.name} » est validée par l’OIC sur la plateforme DUT. Vous en êtes l’administrateur.` });
    transportersStore.replace({ ...transportersStore.findById(transporter.id), adminUserId: admin.id });
  } catch (err) {
    transportersStore.saveAll(transportersStore.getAll().filter((t) => t.id !== transporter.id)); // rien n'est validé à moitié
    throw err;
  }
  applicationsRepo.replace({ ...app, status: 'VALIDEE', decidedAt: nowIso(), decidedBy: actor.name });
  trace(AUDIT_ACTIONS.ORG_VALIDATED, { actor, entity: 'TRANSPORTER', entityId: id, entityLabel: app.name, oldValue: 'EN_ATTENTE', newValue: ORG_STATUS.ACTIF });
  if (app.phone) sendMessage({ channel: 'SMS', to: app.phone, kind: 'ORG_DECISION', entityId: id, subject: 'Transporteur validé', body: `DUT-OIC : ${app.name} est validé. Le lien d’activation de votre compte a été envoyé par courriel.` });
  return transportersStore.findById(id);
}

export function refuseApplication(id, motif) {
  const actor = actorWith('actors.validate');
  const why = cleanReason(motif);
  const app = applicationsRepo.findById(id);
  if (!app || app.status !== 'EN_ATTENTE') throw new Error('Seule une demande en attente peut être refusée.');
  applicationsRepo.replace({ ...app, status: 'REFUSEE', decidedAt: nowIso(), decidedBy: actor.name, motif: why });
  trace(AUDIT_ACTIONS.ORG_REFUSED, { actor, entity: 'TRANSPORTER', entityId: id, entityLabel: app.name, note: why });
  sendMessage({ channel: 'EMAIL', to: app.email, kind: 'ORG_DECISION', entityId: id, subject: 'Votre demande d’inscription DUT', body: `Bonjour,\nLa demande d’inscription de « ${app.name} » n’a pas été retenue par l’OIC.\nMotif : ${why}` });
  return true;
}

export function listTransporters({ status = '', query = '' } = {}) {
  actorWith('transporters.manage');
  const q = query.trim().toLowerCase();
  const vehicles = vehiclesStore.getAll(); const users = usersStore.getAll(); const decl = declarationsRepo.getAll();
  const all = transportersStore.getAll();
  return all.map((t) => ({
    ...t, status: statusOf(t), originLabel: originLabel(t.origin), rccm: t.rccm || t.registre || '',
    vehicules: vehicles.filter((v) => v.transporterId === t.id && v.status !== 'RETIRE').length,
    comptes: users.filter((u) => u.transporterId === t.id).length,
    aValider: decl.filter((d) => d.transporterId === t.id && d.status === 'EN_ATTENTE').length + (t.changeRequest?.status === 'EN_ATTENTE' ? 1 : 0),
    parentName: t.parentId ? all.find((x) => x.id === t.parentId)?.name || '' : '',
  })).filter((t) => (!status || t.status === status) && (!q || `${t.name} ${t.rccm} ${t.email || ''} ${t.city || ''}`.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

export function transporterDetail(id) {
  actorWith('transporters.manage');
  return detail(id);
}
function detail(id) {
  const t = transportersStore.findById(id);
  if (!t) return null;
  const parent = t.parentId ? transportersStore.findById(t.parentId) : null;
  return {
    transporter: { ...t, status: statusOf(t), rccm: t.rccm || t.registre || '', originLabel: originLabel(t.origin) },
    parent: parent ? { id: parent.id, name: parent.name } : null,
    documents: [...(t.documents || []), ...((parent?.documents || []).map((d) => ({ ...d, inherited: true })))],
    filiales: [
      ...transportersStore.getAll().filter((x) => x.parentId === id).map((x) => ({ id: x.id, name: x.name, city: x.city, status: statusOf(x) })),
      ...applicationsRepo.getAll().filter((a) => a.parentId === id && a.status !== 'VALIDEE').map((a) => ({ id: a.id, name: a.name, city: a.city, status: a.status === 'REFUSEE' ? ORG_STATUS.REFUSE : ORG_STATUS.EN_ATTENTE, application: true })),
    ],
    vehicules: vehiclesStore.getAll().filter((v) => v.transporterId === id),
    declarations: declarationsRepo.getAll().filter((d) => d.transporterId === id).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    comptes: orgUsers(TRANSPORTER_CFG, id).map(({ credential, activation, reset, ...u }) => u),
    journal: auditStore.getAll().filter((e) => e.entityId === id && ['TRANSPORTER', 'VEHICLE'].includes(e.entity)).sort((a, b) => Date.parse(b.date) - Date.parse(a.date)),
  };
}

export const suspendTransporter = (id, motif) => transition(TRANSPORTER_CFG, id, 'suspend', motif, actorWith('actors.validate'));
export const reactivateTransporter = (id, motif) => transition(TRANSPORTER_CFG, id, 'reactivate', motif, actorWith('actors.validate'));
export const decideTransporterChange = (id, approve, motif) => decideChange(TRANSPORTER_CFG, id, approve, motif, actorWith('actors.validate'), { uniqueCheck: (c, excludeId) => unique(c, { excludeId, parentId: transportersStore.findById(excludeId)?.parentId || null }) });

export function reviewDocument(transporterId, docId, conforme, note = '') {
  const actor = actorWith('actors.validate');
  const t = transportersStore.findById(transporterId);
  const doc = t?.documents?.find((d) => d.id === docId);
  if (!doc) throw new Error('Pièce introuvable.');
  if (!conforme) cleanReason(note);
  doc.review = { status: conforme ? 'CONFORME' : 'NON_CONFORME', by: actor.name, at: nowIso(), note: String(note || '').trim() };
  transportersStore.replace(t);
  trace(AUDIT_ACTIONS.ORG_DOCUMENT_REVIEWED, { actor, entity: 'TRANSPORTER', entityId: t.id, entityLabel: t.name, note: `${DOC_TYPES[doc.type]} : ${conforme ? 'conforme' : `non conforme — ${doc.review.note}`}` });
  if (!conforme && t.email) sendMessage({ channel: 'EMAIL', to: t.email, kind: 'ORG_CHANGE', entityId: t.id, subject: 'Pièce de dossier à remplacer', body: `Bonjour,\nLa pièce « ${DOC_TYPES[doc.type]} » (${doc.fileName}) n’est pas conforme.\nMotif : ${doc.review.note}\nDéposez une nouvelle pièce depuis la fiche de votre entreprise.` });
  return doc;
}

// ------------------------------------------------------------------ Transporteur connecté
function own() {
  const actor = actorWith('company.profile');
  if (actor.role !== ROLES.TRANSPORTEUR || !actor.transporterId) throw new Error('Action réservée aux transporteurs.');
  const t = transportersStore.findById(actor.transporterId);
  if (!t) throw new Error('Fiche transporteur introuvable.');
  return { actor, t };
}
export function myTransporter() { const { actor, t } = own(); return { ...detail(t.id), canManage: actor.companyAdmin === true }; }

export function updateMyTransporter(values) {
  const { actor, t } = own();
  if (!actor.companyAdmin) throw new Error('Seul l’administrateur du compte transporteur modifie la fiche.');
  const v = clean({ ...values, rccm: t.parentId ? (t.rccm || t.registre) : values.rccm });
  unique(v, { excludeId: t.id, parentId: t.parentId });
  const result = requestChanges(TRANSPORTER_CFG, t, v, actor);
  const fresh = transportersStore.findById(t.id);
  transportersStore.replace({ ...fresh, contact: fresh.phone, adresse: [fresh.address, fresh.city].filter(Boolean).join(', ') });
  return result;
}
export function cancelMyTransporterChange() { const { actor, t } = own(); return cancelChangeRequest(TRANSPORTER_CFG, t, actor); }

export function addMyDocument(doc) {
  const { actor, t } = own();
  const clean = { ...cleanDocument(doc), uploadedBy: actor.name };
  t.documents = [...(t.documents || []), clean];
  transportersStore.replace(t);
  trace(AUDIT_ACTIONS.ORG_DOCUMENT_ADDED, { actor, entity: 'TRANSPORTER', entityId: t.id, entityLabel: t.name, note: `${DOC_TYPES[clean.type]} — ${clean.fileName}` });
  return clean;
}

/** Entité rattachée (filiale) : hérite du RCCM, de la carte et des pièces du parent ; en attente de validation OIC. */
export function requestSubsidiary(values) {
  const { actor, t } = own();
  if (!actor.companyAdmin) throw new Error('Seul l’administrateur du compte transporteur crée une entité rattachée.');
  if (t.parentId) throw new Error('Une entité rattachée ne peut pas créer elle-même d’entité rattachée.');
  const v = clean({ ...values, rccm: t.rccm || t.registre, carteTransporteur: t.carteTransporteur || 'HERITEE', portee: values.portee || t.portee || 'NATIONAL' });
  unique(v, { parentId: t.id });
  const app = { id: uuid(), ...v, parentId: t.id, origin: 'FILIALE', status: 'EN_ATTENTE', documents: [], createdAt: nowIso(), createdById: actor.id, createdByName: actor.name };
  applicationsRepo.add(app);
  trace(AUDIT_ACTIONS.ORG_CREATED, { actor, entity: 'TRANSPORTER', entityId: t.id, entityLabel: t.name, note: `Entité rattachée demandée : ${app.name}` });
  sendMessage({ channel: 'EMAIL', to: app.email, kind: 'ORG_DECISION', entityId: app.id, subject: 'Demande d’entité rattachée enregistrée', body: `Bonjour ${app.contactName},\nLa création de « ${app.name} », rattachée à « ${t.name} », est en attente de validation par l’OIC.` });
  return app;
}

// ------------------------------------------------------------------ Import d'une liste existante
export const IMPORT_COLUMNS = ['raison_sociale', 'rccm', 'carte_transporteur', 'email', 'telephone', 'ville', 'responsable', 'immatriculation', 'type_vehicule', 'ptac', 'capacite', 'carte_grise', 'carte_transport', 'echeance_carte_transport'];
export const IMPORT_TEMPLATE = `${IMPORT_COLUMNS.join(';')}\nTRANS IVOIRE EXPRESS;CI-ABJ-2016-B-7781;CT-2016-7781;contact@trans-ivoire.ci;+225 07 11 22 33 44;Abidjan;KONAN Paul;AA-1001-CI;Semi-remorque;44;40;CG-2021-1001;CT-ABJ-2026-1001;2027-06-30\nTRANS IVOIRE EXPRESS;CI-ABJ-2016-B-7781;;;;;;AA-1002-CI;Camion plateau;26;22;CG-2022-1002;CT-ABJ-2026-1002;2027-03-31\n`;

function parseCsv(textValue) {
  const lines = String(textValue || '').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) throw new Error('Le fichier est vide.');
  const sep = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
  const split = (line) => { const out = []; let cur = '', q = false; for (let i = 0; i < line.length; i += 1) { const c = line[i]; if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i += 1; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === sep) { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out.map((s) => s.trim()); };
  const header = split(lines[0]).map((h) => h.toLowerCase());
  const missing = ['raison_sociale', 'rccm'].filter((c) => !header.includes(c));
  if (missing.length) throw new Error(`Colonnes obligatoires absentes : ${missing.join(', ')}. Utilisez le modèle proposé.`);
  if (lines.length > 501) throw new Error('500 lignes au maximum par import.');
  return lines.slice(1).map((l, i) => { const cells = split(l); return { line: i + 2, values: Object.fromEntries(header.map((h, k) => [h, cells[k] || ''])) }; });
}

/**
 * Analyse (sans rien enregistrer) puis, si `apply`, enregistre. Rapport ligne par ligne.
 * Doublons rejetés : transporteur déjà présent (RCCM ou e-mail) quand la ligne veut le créer avec d'autres
 * données, immatriculation déjà connue. Les véhicules d'un transporteur déjà présent lui sont rattachés.
 */
export async function importTransporters(csvText, { apply = false } = {}) {
  const actor = actorWith('transporters.manage');
  if (apply) actorWith('actors.validate');
  const rows = parseCsv(csvText);
  const existing = transportersStore.getAll();
  const pendingApps = applicationsRepo.getAll().filter((a) => a.status === 'EN_ATTENTE');
  const knownPlates = new Set(vehiclesStore.getAll().map((v) => v.immatriculation.toUpperCase()));
  const pendingPlates = new Set(declarationsRepo.getAll().filter((d) => d.status === 'EN_ATTENTE').map((d) => d.data.immatriculation));
  const created = new Map(); // rccmKey -> transporteur à créer
  const report = [];
  const newVehicles = [];
  for (const { line, values } of rows) {
    const key = rccmKey(values.rccm);
    const entry = { line, name: values.raison_sociale, rccm: values.rccm, immatriculation: values.immatriculation || '', result: '', ok: false };
    try {
      if (!key) throw new Error('RCCM manquant.');
      let target = created.get(key) || existing.find((t) => rccmKey(t.rccm || t.registre) === key) || null;
      const isNew = !target;
      if (pendingApps.some((a) => rccmKey(a.rccm) === key && !a.parentId)) throw new Error('Une demande d’inscription est déjà en cours pour ce RCCM.');
      if (isNew) {
        const v = clean({ name: values.raison_sociale, rccm: values.rccm, carteTransporteur: values.carte_transporteur, email: values.email, phone: values.telephone, city: values.ville, contactName: values.responsable || values.raison_sociale, portee: 'NATIONAL' });
        if (existing.some((t) => String(t.email || '').toLowerCase() === v.email) || [...created.values()].some((t) => t.email === v.email) || usersStore.getAll().some((u) => u.email.toLowerCase() === v.email)) throw new Error(`Doublon : l’adresse ${v.email} est déjà utilisée.`);
        target = { id: uuid(), ...v, registre: v.rccm, contact: v.phone, adresse: v.city, documents: [], status: ORG_STATUS.ACTIF, origin: 'IMPORT', createdAt: nowIso(), validatedAt: nowIso(), validatedBy: actor.name, hasDut: true, isNew: true };
        created.set(key, target);
        entry.result = 'Transporteur créé';
      } else if (values.email && String(target.email || '').toLowerCase() && String(target.email).toLowerCase() !== values.email.trim().toLowerCase() && !target.isNew) {
        entry.result = 'Transporteur déjà enregistré (données de la ligne ignorées)';
      } else entry.result = target.isNew ? 'Transporteur repris de la ligne précédente' : 'Transporteur déjà enregistré';
      if (values.immatriculation) {
        const data = cleanVehicle({ immatriculation: values.immatriculation, type: values.type_vehicule, ptac: values.ptac, capaciteTonnes: values.capacite || values.ptac, cartegrise: values.carte_grise, carteTransport: values.carte_transport, carteTransportExpire: values.echeance_carte_transport }, { allowPast: true });
        if (knownPlates.has(data.immatriculation) || pendingPlates.has(data.immatriculation)) throw new Error(`Doublon : le véhicule ${data.immatriculation} est déjà enregistré.`);
        knownPlates.add(data.immatriculation);
        newVehicles.push({ id: uuid(), ...data, transporterId: target.id, status: 'VALIDE', origin: 'IMPORT', validatedAt: nowIso(), validatedBy: actor.name });
        entry.result += ` · véhicule ${data.immatriculation} ajouté`;
      } else if (!isNew) throw new Error('Doublon : transporteur déjà enregistré et aucun véhicule à ajouter.');
      entry.ok = true;
    } catch (err) {
      entry.result = err.message; entry.ok = false;
      // Une ligne rejetée ne doit pas laisser un transporteur créé à moitié.
      if (created.get(key)?.isNew && !report.some((r) => r.ok && rccmKey(r.rccm) === key)) created.delete(key);
    }
    report.push(entry);
  }
  const summary = { lines: rows.length, transporters: created.size, vehicles: newVehicles.length, rejected: report.filter((r) => !r.ok).length };
  if (apply && (created.size || newVehicles.length)) {
    const list = transportersStore.getAll();
    for (const t of created.values()) { const { isNew, ...rest } = t; pushHistory(rest, { from: null, to: ORG_STATUS.ACTIF, by: actor.name, byId: actor.id, motif: 'Reprise de l’existant (import)' }); list.push(rest); }
    transportersStore.saveAll(list);
    vehiclesStore.saveAll([...vehiclesStore.getAll(), ...newVehicles]);
    for (const t of created.values()) {
      try { await createPendingAccount({ name: t.contactName, email: t.email, phone: t.phone, role: ROLES.TRANSPORTEUR, transporterId: t.id, transporterName: t.name, companyAdmin: true }, { actor, reasonLabel: `Votre entreprise « ${t.name} » est reprise sur la nouvelle plateforme DUT de l’OIC.` }); } catch (err) { report.push({ line: '—', name: t.name, rccm: t.rccm, result: `Compte non créé : ${err.message}`, ok: false }); }
    }
    trace(AUDIT_ACTIONS.TRANSPORTERS_IMPORTED, { actor, entity: 'TRANSPORTER', note: `${summary.transporters} transporteur(s), ${summary.vehicles} véhicule(s), ${summary.rejected} ligne(s) rejetée(s) sur ${summary.lines}` });
  }
  return { applied: apply, summary, report };
}
