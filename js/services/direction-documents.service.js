// Lot d5 : gestion documentaire de la Direction (dépôt, classement, validation, versions, archivage).
// POC : seules les informations du fichier (nom, taille, type) sont conservées, jamais son contenu.
// Une version est validée ou refusée par une autre personne que celle qui l'a déposée.
import { AUDIT_ACTIONS } from '../core/constants.js';
import { findAntennaById } from '../repositories/antennas.repository.js';
import { directionDocumentsRepo } from '../repositories/pilotage.repository.js';
import { actor, who, journal, journalOf, text, nextReference, uuid, nowIso } from './pilotage-core.service.js';

export const DOCUMENT_CATEGORIES = {
  RAPPORT: 'Rapport d’activité',
  REGISTRE: 'Registre',
  JUSTIFICATIF: 'Pièce justificative',
  CONTRACTUEL: 'Document contractuel',
  NOTE: 'Note de service',
  PROCES_VERBAL: 'Procès-verbal',
};
export const DOCUMENT_STATUS = { EN_VALIDATION: 'EN_VALIDATION', VALIDE: 'VALIDE', REFUSE: 'REFUSE', ARCHIVE: 'ARCHIVE' };
export const DOCUMENT_STATUS_LABELS = { EN_VALIDATION: 'À valider', VALIDE: 'Validé', REFUSE: 'Refusé', ARCHIVE: 'Archivé' };
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_EXT = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'odt', 'ods', 'csv', 'jpg', 'jpeg', 'png', 'txt'];

/** Métadonnées d'un fichier choisi : rien d'autre n'est lu ni stocké. */
export function fileMeta(file) {
  const name = String(file?.name || '').trim();
  if (!name) throw new Error('Choisissez le fichier à déposer.');
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  if (!ALLOWED_EXT.includes(ext)) throw new Error('Format non accepté (PDF, Word, Excel, OpenDocument, CSV, image ou texte).');
  const size = Number(file.size) || 0;
  if (size > MAX_FILE_BYTES) throw new Error('Le fichier dépasse 20 Mo.');
  return { fileName: name.slice(0, 160), fileSize: size, fileType: String(file.type || ext).slice(0, 80) };
}

const current = (doc) => doc.versions[doc.versions.length - 1];
const statusOf = (doc) => (doc.archivedAt ? DOCUMENT_STATUS.ARCHIVE : current(doc).status);

function decorate(doc) {
  return { ...doc, current: current(doc), status: statusOf(doc), categoryLabel: DOCUMENT_CATEGORIES[doc.category] || doc.category };
}

export function listDocuments({ category = '', status = '', query = '', includeArchived = false } = {}) {
  actor('documents.view');
  const q = String(query).trim().toLowerCase();
  return directionDocumentsRepo.all().map(decorate)
    .filter((d) => (includeArchived || status === DOCUMENT_STATUS.ARCHIVE || d.status !== DOCUMENT_STATUS.ARCHIVE)
      && (!category || d.category === category) && (!status || d.status === status)
      && (!q || `${d.reference} ${d.title} ${d.description} ${d.antennaName || ''} ${d.current.fileName}`.toLowerCase().includes(q)))
    .sort((a, b) => String(b.current.at).localeCompare(String(a.current.at)));
}

export function getDocument(id) {
  actor('documents.view');
  const d = directionDocumentsRepo.find(id);
  if (!d) throw new Error('Document introuvable.');
  return { ...decorate(d), journal: journalOf(id) };
}

export function depositDocument(input) {
  const user = actor('documents.manage');
  if (!DOCUMENT_CATEGORIES[input.category]) throw new Error('Choisissez une catégorie de classement.');
  const antenna = input.antennaId ? findAntennaById(input.antennaId) : null;
  if (input.antennaId && !antenna) throw new Error('Antenne inconnue.');
  const meta = fileMeta(input.file);
  const doc = {
    id: uuid(), reference: nextReference('DOC', directionDocumentsRepo.all()),
    title: text(input.title, 'Titre', { max: 160 }), category: input.category,
    antennaId: antenna?.id || null, antennaName: antenna?.name || null,
    description: text(input.description, 'Description', { required: false, max: 600 }),
    createdAt: nowIso(), createdBy: who(user), archivedAt: null,
    versions: [{ n: 1, ...meta, note: 'Dépôt initial', by: user.name, byId: user.id, at: nowIso(), status: DOCUMENT_STATUS.EN_VALIDATION }],
  };
  directionDocumentsRepo.upsert(doc);
  journal(AUDIT_ACTIONS.DOCUMENT_DEPOSITED, { entity: 'DOCUMENT', entityId: doc.id, reference: doc.reference, newValue: `${doc.title} (v1)` });
  return decorate(doc);
}

/** Reclassement (titre, catégorie, antenne, description) : ne crée pas de version, reste tracé. */
export function classifyDocument(id, input) {
  actor('documents.manage');
  const d = directionDocumentsRepo.find(id);
  if (!d) throw new Error('Document introuvable.');
  if (d.archivedAt) throw new Error('Un document archivé ne peut plus être modifié.');
  if (!DOCUMENT_CATEGORIES[input.category]) throw new Error('Choisissez une catégorie de classement.');
  const antenna = input.antennaId ? findAntennaById(input.antennaId) : null;
  const next = { ...d, title: text(input.title, 'Titre', { max: 160 }), category: input.category, antennaId: antenna?.id || null, antennaName: antenna?.name || null, description: text(input.description, 'Description', { required: false, max: 600 }) };
  directionDocumentsRepo.upsert(next);
  journal(AUDIT_ACTIONS.DOCUMENT_CLASSIFIED, { entity: 'DOCUMENT', entityId: id, reference: d.reference, oldValue: DOCUMENT_CATEGORIES[d.category], newValue: DOCUMENT_CATEGORIES[next.category] });
  return decorate(next);
}

export function addVersion(id, input) {
  const user = actor('documents.manage');
  const d = directionDocumentsRepo.find(id);
  if (!d) throw new Error('Document introuvable.');
  if (d.archivedAt) throw new Error('Un document archivé ne peut plus être mis à jour.');
  if (current(d).status === DOCUMENT_STATUS.EN_VALIDATION) throw new Error('La version actuelle attend encore sa validation.');
  const meta = fileMeta(input.file);
  const note = text(input.note, 'Objet de la mise à jour', { max: 300 });
  const version = { n: current(d).n + 1, ...meta, note, by: user.name, byId: user.id, at: nowIso(), status: DOCUMENT_STATUS.EN_VALIDATION };
  const next = { ...d, versions: [...d.versions, version] };
  directionDocumentsRepo.upsert(next);
  journal(AUDIT_ACTIONS.DOCUMENT_VERSIONED, { entity: 'DOCUMENT', entityId: id, reference: d.reference, newValue: `v${version.n}`, note });
  return decorate(next);
}

function decide(id, status, reason) {
  const user = actor('documents.validate');
  const d = directionDocumentsRepo.find(id);
  if (!d) throw new Error('Document introuvable.');
  const v = current(d);
  if (d.archivedAt || v.status !== DOCUMENT_STATUS.EN_VALIDATION) throw new Error('Ce document n’est pas en attente de validation.');
  if (v.byId === user.id) throw new Error('Un document est validé par une autre personne que celle qui l’a déposé.');
  const decisionNote = status === DOCUMENT_STATUS.REFUSE ? text(reason, 'Motif du refus', { max: 400 }) : text(reason, 'Observation', { required: false, max: 400 });
  const next = { ...d, versions: d.versions.map((x) => (x.n === v.n ? { ...x, status, decidedBy: user.name, decidedById: user.id, decidedAt: nowIso(), decisionNote } : x)) };
  directionDocumentsRepo.upsert(next);
  journal(status === DOCUMENT_STATUS.VALIDE ? AUDIT_ACTIONS.DOCUMENT_VALIDATED : AUDIT_ACTIONS.DOCUMENT_REJECTED, { entity: 'DOCUMENT', entityId: id, reference: d.reference, newValue: `v${v.n}`, note: decisionNote || null });
  return decorate(next);
}

export const validateDocument = (id, note = '') => decide(id, DOCUMENT_STATUS.VALIDE, note);
export const rejectDocument = (id, reason) => decide(id, DOCUMENT_STATUS.REFUSE, reason);

export function archiveDocument(id, reason) {
  const user = actor('documents.manage');
  const d = directionDocumentsRepo.find(id);
  if (!d) throw new Error('Document introuvable.');
  if (d.archivedAt) throw new Error('Ce document est déjà archivé.');
  if (current(d).status === DOCUMENT_STATUS.EN_VALIDATION) throw new Error('Validez ou refusez la version en attente avant d’archiver.');
  const motif = text(reason, 'Motif d’archivage', { max: 300 });
  const next = { ...d, archivedAt: nowIso(), archivedBy: user.name, archiveReason: motif };
  directionDocumentsRepo.upsert(next);
  journal(AUDIT_ACTIONS.DOCUMENT_ARCHIVED, { entity: 'DOCUMENT', entityId: id, reference: d.reference, note: motif });
  return decorate(next);
}

/** Documents dont la version courante attend une validation (exposé au tableau de bord de la Direction). */
export function documentsToValidate() {
  return listDocuments({ status: DOCUMENT_STATUS.EN_VALIDATION });
}
