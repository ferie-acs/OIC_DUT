// Graphiques de la Direction générale : historique de démonstration sur les cinq mois précédents.
// Sans cet historique, les courbes mensuelles du tableau de bord n'auraient que deux ou trois points.
// Données cohérentes de bout en bout : chaque mois, chaque partenaire achète une plage (paiement validé en
// caisse), édite ses DUT dans cette plage (numéros entièrement consommés : aucun écart de rapprochement),
// une partie est contrôlée sur la route ; des incidents clos, des pannes réparées et des actions correctives
// complètent l'historique. Idempotent : chaque élément porte un identifiant stable et n'est ajouté qu'une fois ;
// une réinitialisation de la démonstration efface le marqueur.
import { STORAGE_KEYS } from './core/constants.js';
import { readCollection, writeCollection, readObject, writeObject } from './core/storage.js';
import { uuid } from './core/utils.js';
import { amountsFor } from './services/range-pricing.service.js';
import { ensureSignedDemoData } from './seed.js';

export const GRAPHIQUES_DG_SEED_KEY = 'dut_seed_graphiques_direction_v1';

const H = 3600 * 1000;
const PRICE = { unitHT: 2500, tvaRate: 18, stamp: 100 };
// Mois relatifs au mois en cours (5 = il y a cinq mois). Validés par mois (= taille de la plage) et rejetés.
const PLAN = {
  'STFA DEMO': { base: 600, valides: { 5: 10, 4: 11, 3: 10, 2: 6, 1: 5 }, rejetes: { 5: 1, 4: 1, 3: 1, 2: 0, 1: 0 } },
  'TRANSCARGO SARL': { base: 800, valides: { 5: 5, 4: 6, 3: 5, 2: 4, 1: 0 }, rejetes: { 5: 0, 4: 1, 3: 0, 2: 0, 1: 0 } },
};
const DELAYS_H = [5, 18, 26, 9, 31, 14, 22, 40, 7, 20, 12, 28];
const MONTH_FACTOR = { 5: 1.25, 4: 1.1, 3: 0.95, 2: 1.15, 1: 1 };
const REJECTION_REASONS = ['Poids déclaré incohérent avec le véhicule', 'Pièce du chauffeur illisible', 'Destinataire incomplet'];
const CITIES = [['San-Pédro', 'Korhogo'], ['Abidjan', 'Bouaké'], ['Abidjan', 'Yamoussoukro'], ['San-Pédro', 'Abidjan'], ['Bouaké', 'Ferkessédougou']];

/** Début (UTC) du mois situé `k` mois avant le mois en cours, décalé de `day` jours et `hour` heures. */
function monthDate(k, day = 1, hour = 9, minute = 0) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, day, hour, minute));
}
const iso = (d) => d.toISOString();
const plusH = (date, h) => new Date(date.getTime() + h * H);

function dutsAndPlages(state) {
  const { duts, ops, payments, controls } = state;
  const has = (list, id) => list.some((x) => x.id === id);
  let changed = false;
  Object.entries(PLAN).forEach(([partnerName, plan], p) => {
    const template = duts.find((d) => d.partnerName === partnerName && d.status === 'VALIDE' && !d.canary && d.dutNumber);
    if (!template) return;
    const payTemplate = payments.find((x) => x.partnerId === template.partnerId && x.status === 'VALIDE') || payments.find((x) => x.status === 'VALIDE');
    let next = plan.base;
    [5, 4, 3, 2, 1].forEach((k) => {
      const valides = plan.valides[k], rejetes = plan.rejetes[k];
      if (!valides && !rejetes) return;
      const acquired = monthDate(k, 2, 9, 30);
      const year = acquired.getUTCFullYear();
      const opId = `dg-op-${p}-${k}`;
      const rangeStart = next; next += valides;
      if (valides && !has(ops, opId)) {
        ops.push({ id: opId, code: `OP-${year}-${String(700 + p * 10 + k).padStart(5, '0')}`, partnerId: template.partnerId, partnerName, year, rangeStart, rangeEnd: rangeStart + valides - 1, quantity: valides, used: valides, tarifUnitaire: PRICE.unitHT, status: 'VALIDATED', requestedAt: iso(monthDate(k, 1, 10)), validatedAt: iso(acquired), commentaire: 'Plage mensuelle (historique de démonstration).' });
        const a = amountsFor(valides, PRICE);
        payments.push({
          id: `dg-pay-${p}-${k}`, ref: `PAY-${year}-${String(700 + p * 10 + k).padStart(5, '0')}`, kind: 'PLAGE', operationId: opId, operationCode: `OP-${year}-${String(700 + p * 10 + k).padStart(5, '0')}`,
          clientType: 'PARTENAIRE', partnerId: template.partnerId, transporterId: null, partnerName, antennaId: null, antennaName: 'Attribution directe (siège OIC)',
          quantity: a.quantity, unitHT: a.unitHT, tvaRate: a.tvaRate, ht: a.ht, tva: a.tva, stamp: a.stamp, ttc: a.ttc, status: 'VALIDE', createdAt: iso(acquired),
          history: [{ at: iso(acquired), by: 'Système', text: 'Créance créée' }], method: k % 2 ? 'GUICHET' : 'MOBILE_MONEY', receiptNo: `RC-SIEGE-${String(500 + p * 10 + k).padStart(6, '0')}`,
          recordedAt: iso(plusH(acquired, 26)), recordedBy: payTemplate?.recordedBy || null, validatedAt: iso(plusH(acquired, 50)), validatedBy: payTemplate?.validatedBy || null,
        });
        changed = true;
      }
      const total = valides + rejetes;
      let numbered = 0;
      for (let i = 0; i < total; i += 1) {
        const id = `dg-dut-${p}-${k}-${i}`;
        const rejected = rejetes > 0 && i === Math.floor(total / 2);
        const created = monthDate(k, 3 + Math.floor((i * 24) / total), 8 + (i % 3), 10 + ((i * 7) % 45));
        const submitted = plusH(created, 20 + (i % 5));
        const decided = plusH(submitted, Math.round(DELAYS_H[(i + k + p) % DELAYS_H.length] * MONTH_FACTOR[k]));
        if (!has(duts, id)) {
          const [from, to] = CITIES[(i + k) % CITIES.length];
          const day = iso(created).slice(0, 10);
          const base = JSON.parse(JSON.stringify(template));
          const dut = {
            ...base, id, version: 1, createdAt: iso(created), updatedAt: iso(decided), submittedAt: iso(submitted),
            general: { ...base.general, dateEmission: day },
            marchandises: (base.marchandises || []).map((m) => ({ ...m, id: `${id}-m`, quantite: 80 + ((i * 13) % 60), poidsTonnes: 10 + ((i * 3) % 18) })),
            trajet: { ...base.trajet, chargement: { ...base.trajet.chargement, ville: from, datePrevue: day }, dechargement: { ...base.trajet.dechargement, ville: to, datePrevue: day }, dateDepart: day, dateArrivee: day },
            pdfVersions: [], suspendedAt: null, withdrawnAt: null, qrSigned: null,
          };
          if (rejected) Object.assign(dut, { status: 'REJETE', dutNumber: null, qrToken: null, operationId: null, validatedAt: null, validatedBy: null, rejectedAt: iso(decided), rejectedBy: template.validatedBy, rejectionReason: REJECTION_REASONS[(k + p) % REJECTION_REASONS.length] });
          else Object.assign(dut, { status: 'VALIDE', dutNumber: `DUT-CI-${year}-${String(rangeStart + numbered).padStart(6, '0')}`, qrToken: uuid(), operationId: opId, validatedAt: iso(decided), validatedBy: template.validatedBy, rejectedAt: null, rejectedBy: null, rejectionReason: null });
          duts.push(dut);
          changed = true;
        }
        if (!rejected) {
          const dut = duts.find((d) => d.id === id);
          const ctlId = `dg-ctl-${p}-${k}-${i}`;
          const scanned = plusH(decided, 30 + (i % 4) * 12);
          if (i % 2 === 0 && scanned.getTime() < Date.now() && !has(controls, ctlId)) {
            controls.push({ id: ctlId, token: dut.qrToken, dutId: dut.id, dutNumber: dut.dutNumber, agentId: 'SEED', agentLabel: 'Traoré Aminata', result: 'VALID', date: iso(scanned), lat: null, lng: null });
            changed = true;
          }
          numbered += 1;
        }
      }
    });
  });
  return changed;
}

// Incidents clos des mois précédents : [mois, jour, catégorie, gravité, antenne, titre, heures jusqu'à la résolution, équipement].
const INCIDENTS = [
  [5, 6, 'RESEAU', 'MAJEURE', 'BOUAKE', 'Connexion internet instable à l’antenne', 9, null],
  [5, 19, 'APPLICATIF', 'MINEURE', 'ABIDJAN SIEGE', 'Message d’erreur à l’ajout d’une pièce jointe', 30, null],
  [4, 4, 'MATERIEL', 'MAJEURE', 'YAMOUSSOUKRO', 'Panne : imprimante de l’antenne', 20, 'EQ-0011'],
  [4, 12, 'PERFORMANCE', 'MINEURE', 'ABIDJAN SIEGE', 'Lenteur à l’ouverture de la liste des DUT', 50, null],
  [4, 23, 'PROCEDURE', 'MINEURE', 'SAN PEDRO', 'Partenaire sans plage active au guichet', 80, null],
  [3, 8, 'RESEAU', 'CRITIQUE', 'ABIDJAN VRIDI', 'Coupure générale du réseau de l’antenne', 6, null],
  [3, 15, 'MATERIEL', 'MAJEURE', 'ABIDJAN SIEGE', 'Panne : lecteur de QR code du guichet', 18, 'EQ-0004'],
  [3, 26, 'APPLICATIF', 'MAJEURE', 'BOUAKE', 'Erreur à la génération du PDF du DUT', 30, null],
  [2, 5, 'MATERIEL', 'MAJEURE', 'BOUAKE', 'Panne : ordinateur portable de l’agent', 22, 'EQ-0007'],
  [2, 18, 'PERFORMANCE', 'MINEURE', 'KORHOGO', 'Lenteur sur la validation d’un DUT', 40, null],
  [1, 7, 'MATERIEL', 'MINEURE', 'ABIDJAN SIEGE', 'Panne : onduleur du guichet', 60, 'EQ-0005'],
  [1, 11, 'APPLICATIF', 'CRITIQUE', 'Niveau national', 'Connexion impossible pour les partenaires', 3, null],
];
const TEAMS = { RESEAU: 'RESEAU', APPLICATIF: 'SUPPORT', MATERIEL: 'MATERIEL', PERFORMANCE: 'SUPPORT', PROCEDURE: 'OPERATIONS' };
const SLA_H = { CRITIQUE: 4, MAJEURE: 24, MINEURE: 72 };

function incidentsAndFailures(state) {
  const { incidents, equipment, antennas, users } = state;
  const admin = users.find((u) => u.email === 'oic.admin@demo.oic.ci');
  if (!admin) return false;
  let changed = false;
  let max = incidents.reduce((n, i) => Math.max(n, Number(String(i.reference || '').split('-').pop()) || 0), 0);
  const assignee = { id: admin.id, name: admin.name, role: admin.role };
  INCIDENTS.forEach(([k, day, category, severity, antennaName, title, hours, eqRef], n) => {
    const id = `dg-inc-${n}`;
    if (incidents.some((i) => i.id === id)) return;
    const antenna = antennas.find((a) => a.name === antennaName) || null;
    const item = eqRef ? equipment.find((e) => e.reference?.endsWith(eqRef.slice(3))) : null;
    const declared = monthDate(k, day, 8, 40);
    const resolved = plusH(declared, hours), closed = plusH(resolved, 3);
    const late = hours > SLA_H[severity];
    const reference = `INC-${declared.getUTCFullYear()}-${String((max += 1)).padStart(4, '0')}`;
    const by = { id: 'SEED', name: antenna ? `Agent de l’antenne ${antenna.name}` : 'Support de la plateforme', role: 'ANTENNA_AGENT', partnerId: null, partnerName: null, antennaId: antenna?.id || null };
    const step = (at, who, label, note = '') => ({ id: `${id}-${label.length}-${at.getTime()}`, at: iso(at), byId: 'SEED', by: who, role: who === by.name ? 'ANTENNA_AGENT' : admin.role, label, note });
    incidents.push({
      id, reference, category, severity, declaredSeverity: severity, impact: antenna ? 'ANTENNE' : 'RESEAU', status: 'CLOS', title,
      description: `${title}. Signalé par l’antenne et traité par la DSI (historique de démonstration).`,
      antennaId: antenna?.id || null, antennaName: antenna?.name || 'Niveau national', attachments: [], performance: null, equipmentId: item?.id || null,
      declaredBy: by, declaredAt: iso(declared), assignee, team: TEAMS[category], cause: 'Cause identifiée lors du diagnostic.', solution: 'Correction appliquée et vérifiée avec l’antenne.',
      history: [step(declared, by.name, 'Incident déclaré'), step(plusH(declared, 0.5), admin.name, 'Incident attribué'), step(resolved, admin.name, 'Résolution proposée'), step(closed, admin.name, 'Solution vérifiée, incident clos', late ? 'Résolu hors du délai cible' : 'Résolu dans le délai cible')],
      qualifiedAt: iso(plusH(declared, 0.5)), assignedAt: iso(plusH(declared, 0.5)), resolvedAt: iso(resolved), closedAt: iso(closed), deadlineAlertAt: late ? iso(plusH(declared, SLA_H[severity])) : null, updatedAt: iso(closed),
    });
    changed = true;
    if (item && !item.failures.some((f) => f.id === `${id}-panne`)) {
      item.failures.unshift({ id: `${id}-panne`, declaredAt: iso(declared), declaredBy: by, description: title, incidentId: id, incidentReference: reference, interventions: [{ at: iso(plusH(declared, hours / 2)), by: admin.name, technician: 'Maintenance DSI', action: 'Diagnostic et remplacement de la pièce défectueuse.' }], closedAt: iso(resolved), outcome: 'REPARE', report: 'Équipement réparé et remis en service.', closedBy: admin.name });
      item.history.push({ id: `${id}-h1`, at: iso(declared), byId: 'SEED', by: by.name, role: 'ANTENNA_AGENT', label: 'Panne déclarée', note: `${title} · incident ${reference} ouvert` });
      item.history.push({ id: `${id}-h2`, at: iso(resolved), byId: 'SEED', by: admin.name, role: admin.role, label: 'Dépannage terminé, équipement remis en service', note: 'Équipement réparé et remis en service.' });
      item.history.sort((a, b) => String(a.at).localeCompare(String(b.at)));
    }
  });
  return changed;
}

// Actions correctives déjà menées : [mois de création, statut, titre, responsable].
const ACTIONS = [
  [4, 'REALISEE', 'Former les nouveaux agents à la vérification des pièces', 'Fatou Diabaté'],
  [3, 'REALISEE', 'Afficher au guichet la liste des pièces exigées', 'Konan Yao'],
  [2, 'ABANDONNEE', 'Ouvrir le guichet le samedi matin', 'Kouassi Kouamé'],
  [1, 'EN_COURS', 'Réduire le délai de validation des dossiers du soir', 'Fatou Diabaté'],
];

function correctiveActions(state) {
  const { actions, contracts } = state;
  const contract = contracts.find((c) => c.status === 'VALIDE' && c.lines?.length);
  if (!contract) return false;
  let changed = false;
  ACTIONS.forEach(([k, status, title, responsible], n) => {
    const id = `dg-act-${n}`;
    if (actions.some((a) => a.id === id)) return;
    const line = contract.lines[n % contract.lines.length];
    const created = monthDate(k, 10, 9);
    const due = status === 'EN_COURS' ? new Date(Date.now() + 20 * 24 * H) : monthDate(k - 1, 10, 9);
    const closed = status === 'EN_COURS' ? null : monthDate(k - 1, 5, 9);
    actions.push({
      id, contractId: contract.id, lineId: line.id, antennaId: line.assignee?.antennaId || null, title, description: `${title} (historique de démonstration).`, responsible,
      dueDate: iso(due).slice(0, 10), status, gapAtCreation: { taux: null, ecart: null }, createdBy: { id: 'SEED', name: 'Direction générale', role: 'DIRECTION' }, createdAt: iso(created),
      updatedAt: iso(closed || created), closedAt: closed ? iso(closed) : null,
      updates: [{ at: iso(created), by: 'Direction générale', status: 'A_LANCER', comment: 'Action décidée en comité de pilotage.' }, ...(closed ? [{ at: iso(closed), by: responsible, status, comment: status === 'REALISEE' ? 'Action menée à son terme.' : 'Action remplacée par une autre mesure.' }] : [{ at: iso(plusH(created, 72)), by: responsible, status, comment: 'Action lancée.' }])],
    });
    changed = true;
  });
  return changed;
}

export async function seedGraphiquesDirection() {
  if (readObject(GRAPHIQUES_DG_SEED_KEY, false)) return false;
  const state = {
    duts: readCollection(STORAGE_KEYS.DUT_LIST), ops: readCollection(STORAGE_KEYS.OPERATIONS), payments: readCollection(STORAGE_KEYS.PAYMENTS),
    controls: readCollection(STORAGE_KEYS.CONTROL_LOGS), incidents: readCollection(STORAGE_KEYS.PLATFORM_INCIDENTS), equipment: readCollection(STORAGE_KEYS.EQUIPMENT),
    actions: readCollection(STORAGE_KEYS.PILOT_ACTIONS), contracts: readCollection(STORAGE_KEYS.PILOT_CONTRACTS), antennas: readCollection(STORAGE_KEYS.ANTENNAS), users: readCollection(STORAGE_KEYS.USERS),
  };
  if (!state.duts.length || !state.users.length) return false;
  if (dutsAndPlages(state)) {
    writeCollection(STORAGE_KEYS.DUT_LIST, state.duts); writeCollection(STORAGE_KEYS.OPERATIONS, state.ops);
    writeCollection(STORAGE_KEYS.PAYMENTS, state.payments); writeCollection(STORAGE_KEYS.CONTROL_LOGS, state.controls);
  }
  if (incidentsAndFailures(state)) { writeCollection(STORAGE_KEYS.PLATFORM_INCIDENTS, state.incidents); writeCollection(STORAGE_KEYS.EQUIPMENT, state.equipment); }
  if (correctiveActions(state)) writeCollection(STORAGE_KEYS.PILOT_ACTIONS, state.actions);
  writeObject(GRAPHIQUES_DG_SEED_KEY, true);
  // Les DUT validés de l'historique reçoivent leur charge signée comme les autres DUT de démonstration.
  try { await ensureSignedDemoData(); } catch { /* signature indisponible hors contexte sécurisé : le contrôle l'indiquera */ }
  return true;
}
