// Lot d5 : données de démonstration du pilotage de la Direction générale. Idempotent : relancé sans doublon.
// Le compte Direction est (re)créé s'il manque, y compris après une réinitialisation de la démonstration.
import { ROLES, STORAGE_KEYS, AUDIT_LABELS } from './core/constants.js';
import { uuid } from './core/utils.js';
import { readCollection, writeCollection } from './core/storage.js';
import { getAllAntennas } from './repositories/antennas.repository.js';
import { getAllPartners } from './repositories/partners.repository.js';
import {
  indicatorsRepo, objectiveContractsRepo, correctiveActionsRepo, agentProfilesRepo, agentEvaluationsRepo,
  directionDocumentsRepo, meetingsRepo, legalContractsRepo, readLotSeedMarker, writeLotSeedMarker,
} from './repositories/pilotage.repository.js';
import { compare } from './services/comparison.service.js';
import { overallScore } from './services/agents.service.js';
import { appendAuditLog } from './repositories/audit.repository.js';

export const DIRECTION_ACCOUNT = { email: 'direction@demo.oic.ci', name: 'Adèle Konan-Ehui' };
const SEED_VERSION = 1;
const DAY = 86400000;
const day = (offset) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
const at = (offset, hour = 9) => { const d = new Date(Date.now() + offset * DAY); d.setHours(hour, 0, 0, 0); return d.toISOString(); };
const by = (u) => ({ id: u?.id || 'SEED', name: u?.name || 'Démonstration', role: u?.role || 'SYSTEM' });

function ensureDirectionAccount() {
  const users = readCollection(STORAGE_KEYS.USERS);
  if (!users.length) return null; // démonstration pas encore ensemencée
  let u = users.find((x) => x.email.toLowerCase() === DIRECTION_ACCOUNT.email);
  if (!u) {
    u = { id: uuid(), email: DIRECTION_ACCOUNT.email, name: DIRECTION_ACCOUNT.name, role: ROLES.DIRECTION, active: true, createdAt: new Date().toISOString() };
    users.push(u);
    writeCollection(STORAGE_KEYS.USERS, users);
  }
  return u;
}

export function seedLotD5() {
  const direction = ensureDirectionAccount();
  if (!direction || readLotSeedMarker()?.version >= SEED_VERSION) return;
  const users = readCollection(STORAGE_KEYS.USERS);
  const admin = users.find((u) => u.email === 'oic.admin@demo.oic.ci');
  const agentUser = users.find((u) => u.email === 'antenne.agent@demo.oic.ci');
  const controller = users.find((u) => u.email === 'controle.agent@demo.oic.ci');
  const antennas = getAllAntennas();
  const find = (re) => antennas.find((a) => re.test(a.name));
  const abj = find(/^ABIDJAN SIEGE$|^ABIDJAN$/) || antennas[0];
  const bke = find(/BOUAK/) || antennas[1];
  const spd = find(/SAN.?P/) || antennas[2];
  const yak = find(/YAMOUSSOUKRO/) || antennas[3];
  const vri = find(/VRIDI/) || antennas[4];
  if (!abj || !bke) return;

  // ----- Indicateurs
  const ind = (code, label, source, unit, better, description) => ({ id: uuid(), code, label, source, unit, better, description, createdAt: at(-100), updatedAt: at(-100), createdBy: by(admin) });
  const indicators = [
    ind('IND-01', 'DUT validés', 'dutValides', '', 'high', 'Nombre de DUT validés par l’antenne sur la période (mesuré sur la plateforme).'),
    ind('IND-02', 'Délai médian de validation', 'delaiValidationH', 'h', 'low', 'Temps médian entre la soumission et la validation d’un DUT.'),
    ind('IND-03', 'Taux de rejet des dossiers', 'tauxRejet', '%', 'low', 'Part des DUT soumis qui ont été rejetés.'),
    ind('IND-04', 'Contrôles routiers réalisés', 'scans', '', 'high', 'Contrôles des DUT du périmètre de l’antenne.'),
    ind('IND-05', 'Séances de sensibilisation des usagers', 'MANUEL', 'séances', 'high', 'Réunions d’information tenues avec les chargeurs et transporteurs.'),
    ind('IND-06', 'Dossiers instruits par l’agent', 'MANUEL', 'dossiers', 'high', 'Dossiers DUT examinés personnellement par l’agent.'),
  ];
  const I = Object.fromEntries(indicators.map((i) => [i.code, i]));

  // ----- Fiches agents
  const profile = (matricule, name, fonction, antenna, responsibilities, user = null, assignedOffset = -400) => ({
    id: uuid(), matricule, name, fonction, antennaId: antenna.id, antennaName: antenna.name, assignedAt: day(assignedOffset), responsibilities,
    phone: '', userId: user?.id || null, active: true, createdAt: at(-90), updatedAt: at(-90), history: [{ at: at(-90), by: admin?.name || 'Démonstration', label: `Fiche créée · affectation ${antenna.name}` }],
  });
  const fatou = profile('OIC-0412', agentUser?.name || 'Fatou Diabaté', 'Agent de validation des DUT', abj, 'Examen et validation des DUT soumis à l’antenne ; accueil des partenaires ; tenue du registre des rejets.', agentUser, -380);
  const agents = [
    fatou,
    profile('OIC-0108', abj.chef?.name || 'Chef d’antenne', 'Chef d’antenne', abj, 'Encadrement de l’antenne, suivi des objectifs, relation avec les partenaires du port.'),
    profile('OIC-0215', bke.chef?.name || 'Chef d’antenne', 'Chef d’antenne', bke, 'Encadrement de l’antenne de Bouaké, suivi des corridors du Nord.'),
    profile('OIC-0533', controller?.name || 'Agent de contrôle', 'Agent de contrôle routier', vri || abj, 'Contrôle des DUT sur les axes de sortie d’Abidjan ; signalement des anomalies.', controller, -200),
  ];

  // ----- Contrat en vigueur, avec résultats mesurés et saisis
  const from = day(-75), to = day(20);
  const measured = (antennaId, key) => compare('antennes', [antennaId], [key], { from, to: day(0) }).rows[0]?.values[key] ?? 0;
  const result = (value, offset, source, user, comment = '') => ({ id: uuid(), value, date: day(offset), comment, source, by: user?.name || 'Démonstration', byId: user?.id || 'SEED', at: at(offset, 16) });
  const line = (indicator, antenna, target, results, agent = null) => ({ id: uuid(), indicatorId: indicator.id, assigneeType: agent ? 'AGENT' : 'ANTENNE', antennaId: antenna.id, agentId: agent?.id || null, assigneeName: agent?.name || antenna.name, target, results });
  const lAbjDelai = line(I['IND-02'], abj, 12, [result(measured(abj.id, 'delaiValidationH'), -3, 'MESURE', admin, 'Valeur mesurée sur la plateforme.')]);
  const lBkeValides = line(I['IND-01'], bke, 8, [result(measured(bke.id, 'dutValides'), -3, 'MESURE', admin, 'Valeur mesurée sur la plateforme.')]);
  const active = {
    id: uuid(), reference: `CO-${new Date().getFullYear()}-001`, title: 'Contrat d’objectifs des antennes — période pilote', periodLabel: 'Période pilote',
    from, to, description: 'Premier contrat d’objectifs du réseau, centré sur la validation des DUT et la sensibilisation des usagers.',
    status: 'VALIDE', createdBy: by(admin), createdAt: at(-80), submittedBy: by(admin), submittedAt: at(-79), validatedBy: by(direction), validatedAt: at(-78), updatedAt: at(-3),
    history: [{ at: at(-80), by: admin?.name, label: 'Contrat créé' }, { at: at(-79), by: admin?.name, label: 'Soumis à validation' }, { at: at(-78), by: direction.name, label: 'Validé et attribué' }],
    lines: [
      line(I['IND-01'], abj, 8, [result(measured(abj.id, 'dutValides'), -3, 'MESURE', admin, 'Valeur mesurée sur la plateforme.')]),
      lAbjDelai,
      line(I['IND-03'], abj, 10, [result(measured(abj.id, 'tauxRejet'), -3, 'MESURE', admin, 'Valeur mesurée sur la plateforme.')]),
      lBkeValides,
      line(I['IND-05'], bke, 4, [result(1, -40, 'SAISIE', agentUser, 'Séance avec les chargeurs de cajou.'), result(3, -6, 'SAISIE', admin, 'Deux séances supplémentaires à Katiola et Béoumi.')]),
      line(I['IND-06'], abj, 15, [result(18, -4, 'SAISIE', admin, 'Relevé du registre de l’antenne.')], fatou),
    ],
  };
  // ----- Contrat soumis, à valider par la Direction
  const pending = {
    id: uuid(), reference: `CO-${new Date().getFullYear()}-002`, title: 'Contrat d’objectifs — extension aux antennes du Sud et du Centre', periodLabel: 'Trimestre suivant',
    from: day(21), to: day(111), description: 'Extension du dispositif à San-Pédro, Yamoussoukro et Bouaké.',
    status: 'SOUMIS', createdBy: by(admin), createdAt: at(-2), submittedBy: by(admin), submittedAt: at(-1), updatedAt: at(-1),
    history: [{ at: at(-2), by: admin?.name, label: 'Contrat créé' }, { at: at(-1), by: admin?.name, label: 'Soumis à validation' }],
    lines: [line(I['IND-01'], spd || bke, 6, []), line(I['IND-02'], spd || bke, 24, []), line(I['IND-01'], yak || bke, 5, []), line(I['IND-05'], bke, 3, [])],
  };

  // ----- Actions correctives rattachées aux écarts
  const actions = [
    { id: uuid(), contractId: active.id, lineId: lAbjDelai.id, antennaId: abj.id, title: 'Renforcer la permanence de validation le matin', description: 'Un second agent valide les dossiers soumis la veille entre 7 h 30 et 9 h.', responsible: abj.chef?.name || 'Chef d’antenne', dueDate: day(-5), status: 'EN_COURS', gapAtCreation: { taux: null, ecart: null }, createdBy: by(direction), createdAt: at(-30),
      updates: [{ at: at(-30), by: direction.name, status: 'A_LANCER', comment: 'Action décidée en comité de pilotage.' }, { at: at(-12), by: agentUser?.name || 'Agent', status: 'EN_COURS', comment: 'Permanence organisée trois matins sur cinq.' }] },
    { id: uuid(), contractId: active.id, lineId: lBkeValides.id, antennaId: bke.id, title: 'Relancer les partenaires sur les dossiers incomplets', description: 'Appel des partenaires dont les DUT restent au statut « Terminé » plus de 48 h.', responsible: bke.chef?.name || 'Chef d’antenne', dueDate: day(20), status: 'A_LANCER', gapAtCreation: { taux: null, ecart: null }, createdBy: by(admin), createdAt: at(-2),
      updates: [{ at: at(-2), by: admin?.name, status: 'A_LANCER', comment: 'Action décidée.' }] },
  ];

  // ----- Évaluations
  const scores = { volume: 4, objectifs: 5, qualite: 4, delais: 3, procedures: 5, integrite: 5 };
  const evaluations = [{ id: uuid(), agentId: fatou.id, period: 'T3 2026', scores, ...overallScore(scores), comment: 'Volume soutenu et dossiers rigoureux ; les délais du matin restent à améliorer.', evaluator: by(direction), at: at(-12) }];

  // ----- Documents (métadonnées seulement)
  const v = (n, fileName, fileSize, note, user, offset, status, decider = null) => ({ n, fileName, fileSize, fileType: fileName.split('.').pop(), note, by: user?.name, byId: user?.id, at: at(offset), status, ...(decider ? { decidedBy: decider.name, decidedById: decider.id, decidedAt: at(offset + 1), decisionNote: '' } : {}) });
  const documents = [
    { id: uuid(), reference: `DOC-${new Date().getFullYear()}-001`, title: 'Rapport d’activité de l’antenne de Bouaké — septembre', category: 'RAPPORT', antennaId: bke.id, antennaName: bke.name, description: 'Volumes traités, rejets et incidents du mois.', createdAt: at(-20), createdBy: by(admin), archivedAt: null,
      versions: [v(1, 'rapport-bouake-septembre.pdf', 482000, 'Dépôt initial', admin, -20, 'VALIDE', direction), v(2, 'rapport-bouake-septembre-v2.pdf', 497000, 'Correction du tableau des rejets', admin, -9, 'VALIDE', direction)] },
    { id: uuid(), reference: `DOC-${new Date().getFullYear()}-002`, title: 'Registre des contrôles routiers — semaine 40', category: 'REGISTRE', antennaId: abj.id, antennaName: abj.name, description: 'Extraction hebdomadaire transmise par la cellule de contrôle.', createdAt: at(-1), createdBy: by(admin), archivedAt: null,
      versions: [v(1, 'registre-controles-s40.xlsx', 61000, 'Dépôt initial', admin, -1, 'EN_VALIDATION')] },
    { id: uuid(), reference: `DOC-${new Date().getFullYear()}-003`, title: 'Note de service — horaires d’ouverture des antennes', category: 'NOTE', antennaId: null, antennaName: null, description: 'Horaires applicables avant la rentrée.', createdAt: at(-120), createdBy: by(direction), archivedAt: at(-15), archivedBy: admin?.name, archiveReason: 'Remplacée par la note du 1er octobre.',
      versions: [v(1, 'note-horaires.pdf', 120000, 'Dépôt initial', direction, -120, 'VALIDE', admin)] },
  ];

  // ----- Réunions et décisions
  const meetings = [
    { id: uuid(), reference: `RE-${new Date().getFullYear()}-001`, title: 'Comité de pilotage des antennes', date: `${day(-10)}T10:00`, place: 'Siège OIC, salle du conseil', participants: [direction.name, admin?.name, abj.chef?.name, bke.chef?.name].filter(Boolean), agenda: '1. Résultats de la période pilote\n2. Délais de validation à Abidjan\n3. Sensibilisation des usagers', status: 'TENUE',
      minutes: 'Le comité constate un délai de validation supérieur à la cible à Abidjan et un volume en retrait à Bouaké. Une permanence matinale est décidée à Abidjan ; Bouaké relancera les partenaires.', attendees: [direction.name, admin?.name, abj.chef?.name].filter(Boolean), heldBy: admin?.name, heldAt: at(-10, 15),
      convocations: [{ at: at(-17), by: admin?.name, count: 4 }], createdBy: by(admin), createdAt: at(-18), updatedAt: at(-10),
      decisions: [
        { id: uuid(), text: 'Diffuser le guide de saisie du DUT à tous les partenaires de Bouaké', responsible: bke.chef?.name || 'Chef d’antenne', dueDate: day(-2), status: 'EN_COURS', createdBy: admin?.name, createdAt: at(-10), updates: [{ at: at(-6), by: admin?.name, status: 'EN_COURS', comment: 'Guide imprimé, diffusion en cours.' }] },
        { id: uuid(), text: 'Présenter un point mensuel des rejets en comité', responsible: admin?.name || 'Admin OIC', dueDate: day(-1), status: 'CLOTUREE', createdBy: admin?.name, createdAt: at(-10), updates: [{ at: at(-3), by: admin?.name, status: 'CLOTUREE', comment: 'Point inscrit à l’ordre du jour permanent.' }] },
      ] },
    { id: uuid(), reference: `RE-${new Date().getFullYear()}-002`, title: 'Revue trimestrielle des contrats d’objectifs', date: `${day(7)}T09:30`, place: 'Siège OIC', participants: [direction.name, admin?.name, spd?.chef?.name, yak?.chef?.name].filter(Boolean), agenda: '1. Bilan de la période pilote\n2. Validation du contrat d’extension', status: 'PLANIFIEE', decisions: [], createdBy: by(admin), createdAt: at(-1), updatedAt: at(-1) },
  ];

  // ----- Registre des contrats et conventions
  const partners = getAllPartners();
  const stfa = partners.find((p) => /STFA/.test(p.name)) || partners[0];
  const transcargo = partners.find((p) => /TRANSCARGO/.test(p.name)) || partners[1];
  const legal = [];
  if (stfa) legal.push({ id: uuid(), reference: `CJ-${new Date().getFullYear()}-001`, type: 'PARTENARIAT', partnerId: stfa.id, counterparty: stfa.name, object: 'Convention d’émission de DUT pour le compte de chargeurs', startDate: day(-325), endDate: day(40), amount: null, antennaIds: [abj.id], antennaNames: [abj.name],
    responsibilities: 'Le partenaire émet les DUT de ses clients sur ses plages de numéros ; l’antenne d’Abidjan valide et accompagne.', status: 'EN_VIGUEUR', createdBy: by(admin), createdAt: at(-340), visaBy: by(admin), visaAt: at(-335), validatedBy: by(direction), validatedAt: at(-330), updatedAt: at(-330),
    steps: [{ at: at(-340), by: admin?.name, label: 'Contrat enregistré' }, { at: at(-338), by: admin?.name, label: 'Soumis au visa juridique' }, { at: at(-335), by: admin?.name, label: 'Visa juridique accordé' }, { at: at(-330), by: direction.name, label: 'Validé par la Direction générale' }],
    evaluations: [{ id: uuid(), period: 'Semestre 1 2026', scores: { engagements: 4, qualite: 3, reactivite: 4 }, note: 3.7, comment: 'Engagements tenus ; taux de rejet à réduire sur les cartes de transport.', by: direction.name, byId: direction.id, at: at(-100) }] });
  if (transcargo) legal.push({ id: uuid(), reference: `CJ-${new Date().getFullYear()}-002`, type: 'PARTENARIAT', partnerId: transcargo.id, counterparty: transcargo.name, object: 'Renouvellement de la convention d’émission de DUT', startDate: day(15), endDate: day(380), amount: null, antennaIds: [bke.id], antennaNames: [bke.name],
    responsibilities: 'Émission des DUT sur les corridors du Nord ; transmission mensuelle des incidents.', status: 'VALIDATION_DG', createdBy: by(admin), createdAt: at(-6), visaBy: by(admin), visaAt: at(-2), updatedAt: at(-2),
    steps: [{ at: at(-6), by: admin?.name, label: 'Contrat enregistré' }, { at: at(-5), by: admin?.name, label: 'Soumis au visa juridique' }, { at: at(-2), by: admin?.name, label: 'Visa juridique accordé' }], evaluations: [] });
  legal.push({ id: uuid(), reference: `CJ-${new Date().getFullYear()}-003`, type: 'PRESTATION', partnerId: null, counterparty: 'Prestataire de maintenance (démonstration)', object: 'Maintenance des terminaux de contrôle routier', startDate: day(30), endDate: day(395), amount: 4800000, antennaIds: [], antennaNames: [],
    responsibilities: 'Intervention sous 48 h ; remplacement des terminaux défectueux.', status: 'BROUILLON', createdBy: by(admin), createdAt: at(-1), updatedAt: at(-1), steps: [{ at: at(-1), by: admin?.name, label: 'Contrat enregistré' }], evaluations: [] });

  // ----- Journal d'audit des objets de démonstration (mêmes champs que les actions réelles)
  const trace = (action, entity, entityId, reference, user, date, extra = {}) => appendAuditLog({ id: uuid(), action, label: AUDIT_LABELS[action] || action, dutId: null, dutNumber: null, entity, entityId, reference, userId: user?.id || 'SEED', userLabel: user?.name || 'Démonstration', role: user?.role || 'SYSTEM', oldValue: null, newValue: null, note: null, date, ...extra });
  [active, pending].forEach((c) => {
    trace('PILOT_CONTRACT_SAVED', 'CONTRAT_OBJECTIFS', c.id, c.reference, admin, c.createdAt, { newValue: c.title });
    trace('PILOT_CONTRACT_SUBMITTED', 'CONTRAT_OBJECTIFS', c.id, c.reference, admin, c.submittedAt);
    if (c.validatedAt) trace('PILOT_CONTRACT_VALIDATED', 'CONTRAT_OBJECTIFS', c.id, c.reference, direction, c.validatedAt);
    c.lines.forEach((l) => l.results.forEach((r) => trace('PILOT_RESULT_RECORDED', 'CONTRAT_OBJECTIFS', c.id, c.reference, users.find((u) => u.id === r.byId) || admin, r.at, { newValue: String(r.value), note: `${l.assigneeName} · ${indicators.find((i) => i.id === l.indicatorId)?.label}` })));
  });
  actions.forEach((a) => trace('PILOT_ACTION_SAVED', 'ACTION_CORRECTIVE', a.id, active.reference, a.createdBy.id === direction.id ? direction : admin, a.createdAt, { newValue: a.title, note: `Responsable : ${a.responsible}` }));
  agents.forEach((g) => trace('AGENT_PROFILE_SAVED', 'AGENT', g.id, g.matricule, admin, g.createdAt, { newValue: g.name, note: g.history[0].label }));
  evaluations.forEach((e) => trace('AGENT_EVALUATED', 'AGENT', e.agentId, fatou.matricule, direction, e.at, { newValue: `${e.note} / 5`, note: e.period }));
  documents.forEach((d) => {
    d.versions.forEach((v) => {
      trace(v.n === 1 ? 'DOCUMENT_DEPOSITED' : 'DOCUMENT_VERSIONED', 'DOCUMENT', d.id, d.reference, users.find((u) => u.id === v.byId) || direction, v.at, { newValue: `v${v.n}`, note: v.n === 1 ? null : v.note });
      if (v.decidedAt) trace('DOCUMENT_VALIDATED', 'DOCUMENT', d.id, d.reference, users.find((u) => u.id === v.decidedById), v.decidedAt, { newValue: `v${v.n}` });
    });
    if (d.archivedAt) trace('DOCUMENT_ARCHIVED', 'DOCUMENT', d.id, d.reference, admin, d.archivedAt, { note: d.archiveReason });
  });
  meetings.forEach((m) => {
    trace('MEETING_SAVED', 'REUNION', m.id, m.reference, admin, m.createdAt, { newValue: m.title });
    (m.convocations || []).forEach((cv) => trace('MEETING_CONVENED', 'REUNION', m.id, m.reference, admin, cv.at, { note: `${cv.count} participant(s) — message simulé, aucun envoi réel` }));
    if (m.heldAt) trace('MEETING_HELD', 'REUNION', m.id, m.reference, admin, m.heldAt);
    m.decisions.forEach((dc) => trace('DECISION_SAVED', 'REUNION', m.id, m.reference, admin, dc.createdAt, { newValue: dc.text, note: `Responsable : ${dc.responsible}` }));
  });
  legal.forEach((c) => c.steps.forEach((st, i) => trace(i === 0 ? 'LEGAL_CONTRACT_SAVED' : 'LEGAL_CONTRACT_STEP', 'CONTRAT_JURIDIQUE', c.id, c.reference, users.find((u) => u.name === st.by) || admin, st.at, { newValue: i === 0 ? `${c.counterparty} — ${c.object}` : st.label })));

  indicatorsRepo.save(indicators);
  agentProfilesRepo.save(agents);
  objectiveContractsRepo.save([active, pending]);
  correctiveActionsRepo.save(actions);
  agentEvaluationsRepo.save(evaluations);
  directionDocumentsRepo.save(documents);
  meetingsRepo.save(meetings);
  legalContractsRepo.save(legal);
  writeLotSeedMarker({ version: SEED_VERSION, at: new Date().toISOString() });
}

/** Amorçage : une fois au démarrage, puis à chaque navigation (après une réinitialisation de la démonstration). */
export function installLotD5Seed() {
  seedLotD5();
  if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('hashchange', seedLotD5);
}
