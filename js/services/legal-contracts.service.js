// Lot d5 : registre des contrats et conventions (partenaires DUT, prestataires), échéances et circuit de validation.
// Circuit : BROUILLON → VISA_JURIDIQUE (soumission) → VALIDATION_DG (visa du service juridique) → EN_VIGUEUR
// (validation finale de la Direction générale, par une autre personne que le rédacteur et que l'auteur du visa).
// Un renvoi, à l'étape du visa ou de la validation finale, ramène le contrat en BROUILLON avec un motif.
import { AUDIT_ACTIONS } from '../core/constants.js';
import { getAllPartners } from '../repositories/partners.repository.js';
import { findAntennaById } from '../repositories/antennas.repository.js';
import { legalContractsRepo } from '../repositories/pilotage.repository.js';
import { compare } from './comparison.service.js';
import { actor, canDo, who, journal, journalOf, today, isIsoDate, daysBetween, text, nextReference, uuid, nowIso } from './pilotage-core.service.js';

export const LEGAL_TYPES = { PARTENARIAT: 'Convention de partenariat DUT', PRESTATION: 'Contrat de prestation', AUTRE: 'Autre engagement' };
export const LEGAL_STATUS_LABELS = { BROUILLON: 'En rédaction', VISA_JURIDIQUE: 'Visa juridique', VALIDATION_DG: 'Validation Direction générale', EN_VIGUEUR: 'En vigueur', ECHU: 'Échu' };
export const ALERT_DAYS = 60;
export const PARTNER_CRITERIA = [['engagements', 'Respect des engagements'], ['qualite', 'Qualité des DUT émis'], ['reactivite', 'Réactivité et échanges']];

function mustGet(id) { const c = legalContractsRepo.find(id); if (!c) throw new Error('Contrat introuvable.'); return c; }

/** Échéance : jours restants et niveau d'alerte (échu, à moins de 60 jours, normal). */
export function expiry(endDate, ref = today()) {
  const daysLeft = daysBetween(ref, endDate);
  return { daysLeft, level: daysLeft < 0 ? 'ECHU' : daysLeft <= ALERT_DAYS ? 'PROCHE' : 'NORMAL' };
}

function decorate(c) {
  const status = c.status === 'EN_VIGUEUR' && c.endDate < today() ? 'ECHU' : c.status;
  return { ...c, status, typeLabel: LEGAL_TYPES[c.type] || c.type, expiry: expiry(c.endDate) };
}

export function listLegalContracts({ status = '', type = '' } = {}) {
  actor('legal.view');
  return legalContractsRepo.all().map(decorate).filter((c) => (!status || c.status === status) && (!type || c.type === type))
    .sort((a, b) => String(a.endDate).localeCompare(String(b.endDate)));
}

export function getLegalContract(id) {
  actor('legal.view');
  const c = decorate(mustGet(id));
  let indicateurs = null;
  if (c.type === 'PARTENARIAT' && c.partnerId) {
    const r = compare('partenaires', [c.partnerId], ['dutCrees', 'dutValides', 'tauxRejet'], { from: c.startDate, to: c.endDate < today() ? c.endDate : today() }).rows[0];
    indicateurs = r ? r.values : null;
  }
  return { ...c, indicateurs, journal: journalOf(id) };
}

export function saveLegalContract(input, id = null) {
  const user = actor('legal.manage');
  const old = id ? mustGet(id) : null;
  if (old && old.status !== 'BROUILLON') throw new Error('Seul un contrat en rédaction peut être modifié.');
  if (!LEGAL_TYPES[input.type]) throw new Error('Choisissez le type de contrat.');
  let partnerId = null, counterparty;
  if (input.type === 'PARTENARIAT') {
    const p = getAllPartners().find((x) => x.id === input.partnerId);
    if (!p) throw new Error('Choisissez le partenaire DUT concerné.');
    partnerId = p.id; counterparty = p.name;
  } else counterparty = text(input.counterparty, 'Cocontractant', { max: 140 });
  const startDate = String(input.startDate || ''), endDate = String(input.endDate || '');
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) throw new Error('Indiquez les dates de début et de fin.');
  if (startDate > endDate) throw new Error('La date de fin doit suivre la date de début.');
  const amount = input.amount === '' || input.amount == null ? null : Number(input.amount);
  if (amount != null && (!Number.isFinite(amount) || amount < 0)) throw new Error('Montant invalide.');
  const antennaIds = [...new Set(input.antennaIds || [])];
  if (antennaIds.some((a) => !findAntennaById(a))) throw new Error('Antenne inconnue dans les sites affectés.');
  const value = {
    ...(old || {}), id: old?.id || uuid(), reference: old?.reference || nextReference('CJ', legalContractsRepo.all()),
    type: input.type, partnerId, counterparty, object: text(input.object, 'Objet', { max: 300 }),
    startDate, endDate, amount, antennaIds, antennaNames: antennaIds.map((a) => findAntennaById(a).name),
    responsibilities: text(input.responsibilities, 'Engagements et responsabilités', { required: false, max: 1200 }),
    status: 'BROUILLON', createdBy: old?.createdBy || who(user), createdAt: old?.createdAt || nowIso(), updatedAt: nowIso(),
    steps: old?.steps || [{ at: nowIso(), by: user.name, label: 'Contrat enregistré' }], evaluations: old?.evaluations || [],
  };
  legalContractsRepo.upsert(value);
  journal(AUDIT_ACTIONS.LEGAL_CONTRACT_SAVED, { entity: 'CONTRAT_JURIDIQUE', entityId: value.id, reference: value.reference, newValue: `${value.counterparty} — ${value.object}` });
  return decorate(value);
}

function step(c, user, status, label, extra = {}, note = null) {
  const next = { ...c, ...extra, status, updatedAt: nowIso(), steps: [...(c.steps || []), { at: nowIso(), by: user.name, byId: user.id, label, note }] };
  legalContractsRepo.upsert(next);
  journal(AUDIT_ACTIONS.LEGAL_CONTRACT_STEP, { entity: 'CONTRAT_JURIDIQUE', entityId: c.id, reference: c.reference, oldValue: c.status, newValue: status, note });
  return decorate(next);
}

export function submitLegalContract(id) {
  const user = actor('legal.manage');
  const c = mustGet(id);
  if (c.status !== 'BROUILLON') throw new Error('Seul un contrat en rédaction peut être soumis.');
  return step(c, user, 'VISA_JURIDIQUE', 'Soumis au visa juridique');
}

export function giveLegalVisa(id, note = '') {
  const user = actor('legal.visa');
  const c = mustGet(id);
  if (c.status !== 'VISA_JURIDIQUE') throw new Error('Ce contrat n’attend pas de visa juridique.');
  return step(c, user, 'VALIDATION_DG', 'Visa juridique accordé', { visaBy: who(user), visaAt: nowIso() }, text(note, 'Observation', { required: false, max: 400 }) || null);
}

export function validateLegalContract(id) {
  const user = actor('legal.validate_final');
  const c = mustGet(id);
  if (c.status !== 'VALIDATION_DG') throw new Error('Ce contrat n’attend pas la validation de la Direction générale.');
  if (c.createdBy?.id === user.id || c.visaBy?.id === user.id) throw new Error('La validation finale revient à une autre personne que le rédacteur et l’auteur du visa.');
  return step(c, user, 'EN_VIGUEUR', 'Validé par la Direction générale', { validatedBy: who(user), validatedAt: nowIso() });
}

export function returnLegalContract(id, reason) {
  const user = actor('legal.visa', 'legal.validate_final');
  const c = mustGet(id);
  const allowed = (c.status === 'VISA_JURIDIQUE' && canDo('legal.visa')) || (c.status === 'VALIDATION_DG' && canDo('legal.validate_final'));
  if (!allowed) throw new Error('Vous ne pouvez pas renvoyer ce contrat à cette étape.');
  const motif = text(reason, 'Motif du renvoi', { max: 400 });
  const saved = step(c, user, 'BROUILLON', 'Renvoyé en rédaction', {}, motif);
  journal(AUDIT_ACTIONS.LEGAL_CONTRACT_REJECTED, { entity: 'CONTRAT_JURIDIQUE', entityId: id, reference: c.reference, note: motif });
  return saved;
}

export function evaluatePartner(id, input) {
  const user = actor('partners.evaluate');
  const c = decorate(mustGet(id));
  if (c.type !== 'PARTENARIAT') throw new Error('L’évaluation concerne les conventions de partenariat.');
  if (c.status !== 'EN_VIGUEUR') throw new Error('Seule une convention en vigueur peut être évaluée.');
  const period = text(input.period, 'Période évaluée', { max: 40 });
  if ((c.evaluations || []).some((e) => e.period.toLowerCase() === period.toLowerCase())) throw new Error('Ce partenaire a déjà été évalué pour cette période.');
  const scores = Object.fromEntries(PARTNER_CRITERIA.map(([k]) => [k, Number(input.scores?.[k])]));
  if (Object.values(scores).some((v) => !Number.isInteger(v) || v < 1 || v > 5)) throw new Error('Notez chaque critère de 1 à 5.');
  const note = Math.round((Object.values(scores).reduce((s, v) => s + v, 0) / PARTNER_CRITERIA.length) * 10) / 10;
  const evaluation = { id: uuid(), period, scores, note, comment: text(input.comment, 'Observations', { min: 10, max: 1000 }), by: user.name, byId: user.id, at: nowIso() };
  legalContractsRepo.upsert({ ...mustGet(id), evaluations: [...(c.evaluations || []), evaluation] });
  journal(AUDIT_ACTIONS.PARTNER_EVALUATED, { entity: 'CONTRAT_JURIDIQUE', entityId: id, reference: c.reference, newValue: `${note} / 5`, note: `${c.counterparty} · ${period}` });
  return evaluation;
}

/** Contrats en vigueur échus ou arrivant à échéance sous 60 jours (exposé au tableau de bord de la Direction). */
export function expiringLegalContracts() {
  return listLegalContracts().filter((c) => ['EN_VIGUEUR', 'ECHU'].includes(c.status) && c.expiry.level !== 'NORMAL');
}

/** Contrats en attente d'une décision (visa ou validation finale). */
export function legalContractsAwaiting() {
  return listLegalContracts().filter((c) => ['VISA_JURIDIQUE', 'VALIDATION_DG'].includes(c.status));
}
