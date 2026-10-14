// Lot d5 : registre des contrats et conventions — échéances, circuit de validation, évaluation des partenaires.
import { filterOptions } from '../services/statistics.service.js';
import * as L from '../services/legal-contracts.service.js';
import { getCurrentUser } from '../core/auth.js';
import {
  esc, icon, num, pct, formatDate, formatDateTime, kpi, kpis, pageHeader, badge, identity, journalHtml,
  tableCard, plainTable, bindRowLinks, options, field, formModal, run, allowed, notFound,
} from './direction-ui.js';

const TONE = { BROUILLON: 'neutral', VISA_JURIDIQUE: 'warning', VALIDATION_DG: 'warning', EN_VIGUEUR: 'success', ECHU: 'error' };
const CIRCUIT = ['BROUILLON', 'VISA_JURIDIQUE', 'VALIDATION_DG', 'EN_VIGUEUR'];
const statusBadge = (s) => badge(L.LEGAL_STATUS_LABELS[s] || s, TONE[s]);
const expiryHtml = (c) => {
  if (!['EN_VIGUEUR', 'ECHU'].includes(c.status)) return `${formatDate(c.endDate)}`;
  const { daysLeft, level } = c.expiry;
  return `${formatDate(c.endDate)}<small class="${level === 'NORMAL' ? '' : 'sup-neg'}">${daysLeft < 0 ? `échu depuis ${-daysLeft} j` : `dans ${daysLeft} j`}</small>`;
};
const money = (v) => (v == null ? '' : `${num(v)} FCFA`);

export function render(container, params = {}) {
  if (params.id) return renderContract(container, params.id);
  return renderList(container);
}

function contractForm(c, done) {
  const partners = filterOptions().partenaires.map((p) => [p.id, p.name]);
  const antennas = filterOptions().antennes;
  formModal({
    title: c ? 'Modifier le contrat' : 'Enregistrer un contrat', icon: 'handshake', large: true, confirmLabel: 'Enregistrer en rédaction',
    text: 'Circuit : rédaction, visa du service juridique, puis validation finale par la Direction générale.',
    body: `<div class="field-row">${field('Type', `<select class="select" name="type">${options(Object.entries(L.LEGAL_TYPES), c?.type || 'PARTENARIAT')}</select>`, { required: true })}
        <div class="field" data-for="partner"><label>Partenaire DUT <span class="req">*</span></label><select class="select" name="partnerId">${options(partners, c?.partnerId || '', 'Choisir…')}</select></div>
        <div class="field" data-for="other"><label>Cocontractant <span class="req">*</span></label><input class="input" name="counterparty" maxlength="140" value="${esc(c?.type !== 'PARTENARIAT' ? c?.counterparty || '' : '')}"></div></div>
      ${field('Objet', `<input class="input" name="object" maxlength="300" value="${esc(c?.object || '')}">`, { required: true })}
      <div class="field-row">${field('Début', `<input class="input" type="date" name="startDate" value="${esc(c?.startDate || '')}">`, { required: true })}${field('Fin', `<input class="input" type="date" name="endDate" value="${esc(c?.endDate || '')}">`, { required: true })}${field('Montant (FCFA)', `<input class="input" type="number" min="0" name="amount" value="${esc(c?.amount ?? '')}">`)}</div>
      ${field('Engagements et responsabilités', `<textarea class="textarea" name="responsibilities" rows="3">${esc(c?.responsibilities || '')}</textarea>`)}
      <div class="field"><label>Sites affectés</label><div class="d5-checks">${antennas.map((a) => `<label class="checkbox-row"><input type="checkbox" name="antennaIds" value="${esc(a.id)}" ${(c?.antennaIds || []).includes(a.id) ? 'checked' : ''}><span>${esc(a.name)}</span></label>`).join('')}</div></div>`,
    build: (form) => { const sync = () => { const partner = form.elements.type.value === 'PARTENARIAT'; form.querySelector('[data-for=partner]').hidden = !partner; form.querySelector('[data-for=other]').hidden = partner; }; form.elements.type.addEventListener('change', sync); sync(); },
    submit: (v, form) => { const saved = L.saveLegalContract({ ...v, antennaIds: [...form.querySelectorAll('[name=antennaIds]:checked')].map((x) => x.value) }, c?.id || null); done(saved); run(() => {}, 'Contrat enregistré'); },
  });
}

function renderList(container) {
  const state = { status: '' };
  const draw = () => {
    const all = L.listLegalContracts();
    const list = all.filter((c) => !state.status || c.status === state.status);
    container.innerHTML = `${pageHeader({ overline: 'Direction générale · Juridique', title: 'Contrats et conventions', subtitle: 'Registre des conventions avec les partenaires DUT et des contrats de prestation : échéances, circuit de validation et évaluation des partenaires.',
        actions: allowed('legal.manage') ? `<button type="button" class="btn btn-primary" id="lc-new">${icon('plus', { size: 15 })} Enregistrer un contrat</button>` : '' })}
      ${kpis([
        kpi('En vigueur', num(all.filter((c) => c.status === 'EN_VIGUEUR').length), 'validés par la Direction générale', 'green'),
        kpi('Dans le circuit de validation', num(all.filter((c) => ['VISA_JURIDIQUE', 'VALIDATION_DG'].includes(c.status)).length), `${num(all.filter((c) => c.status === 'VALIDATION_DG').length)} à valider par la Direction`, 'amber'),
        kpi('Échéance sous 60 jours', num(all.filter((c) => c.status === 'EN_VIGUEUR' && c.expiry.level === 'PROCHE').length), 'à renouveler ou clore', 'rose'),
        kpi('Échus', num(all.filter((c) => c.status === 'ECHU').length), 'à clore ou à renouveler', 'navy'),
      ])}
      ${tableCard({ title: 'Registre', intro: 'Trié par date de fin. Cliquez sur un contrat pour suivre son circuit.', rows: list, empty: 'Aucun contrat.', link: (c) => `/direction/contrats/${c.id}`,
        tools: `<label class="plan-pill ${state.status ? 'is-set' : ''}"><span>État</span><select class="plan-pill-select" id="lc-status">${options(Object.entries(L.LEGAL_STATUS_LABELS), state.status, 'Tous')}</select></label>`,
        columns: [
          ['counterparty', 'Cocontractant', (c) => `<strong>${esc(c.counterparty)}</strong><small>${esc(c.reference)} · ${esc(c.typeLabel)}</small>`],
          ['object', 'Objet', (c) => esc(c.object)], ['sites', 'Sites', (c) => esc((c.antennaNames || []).join(', ') || '—')],
          ['endDate', 'Échéance', expiryHtml], ['status', 'État', (c) => statusBadge(c.status)],
        ] })}`;
    container.querySelector('#lc-status').addEventListener('change', (e) => { state.status = e.target.value; draw(); });
    container.querySelector('#lc-new')?.addEventListener('click', () => contractForm(null, (c) => { window.location.hash = `/direction/contrats/${c.id}`; }));
    bindRowLinks(container);
  };
  draw();
}

function renderContract(container, id) {
  let c;
  try { c = L.getLegalContract(id); } catch { return notFound(container, '/direction/contrats'); }
  const me = getCurrentUser(), refresh = () => renderContract(container, id);
  const acts = [];
  if (c.status === 'BROUILLON' && allowed('legal.manage')) acts.push(`<button type="button" class="btn btn-secondary" data-do="edit">${icon('edit', { size: 15 })} Modifier</button>`, `<button type="button" class="btn btn-primary" data-do="submit">${icon('upload', { size: 15 })} Soumettre au visa juridique</button>`);
  if (c.status === 'VISA_JURIDIQUE' && allowed('legal.visa')) acts.push(`<button type="button" class="btn btn-secondary" data-do="return">${icon('xCircle', { size: 15 })} Renvoyer</button>`, `<button type="button" class="btn btn-primary" data-do="visa">${icon('checkCircle', { size: 15 })} Donner le visa juridique</button>`);
  const blocked = c.createdBy?.id === me.id || c.visaBy?.id === me.id;
  if (c.status === 'VALIDATION_DG' && allowed('legal.validate_final')) acts.push(`<button type="button" class="btn btn-secondary" data-do="return">${icon('xCircle', { size: 15 })} Renvoyer</button>`, blocked ? '' : `<button type="button" class="btn btn-primary" data-do="validate">${icon('checkCircle', { size: 15 })} Valider le contrat</button>`);
  if (c.status === 'EN_VIGUEUR' && c.type === 'PARTENARIAT' && allowed('partners.evaluate')) acts.push(`<button type="button" class="btn btn-primary" data-do="evaluate">${icon('checkCircle', { size: 15 })} Évaluer le partenaire</button>`);
  const reached = CIRCUIT.indexOf(c.status === 'ECHU' ? 'EN_VIGUEUR' : c.status);
  container.innerHTML = `${pageHeader({ back: { href: '/direction/contrats', label: 'Contrats et conventions' }, title: c.counterparty, subtitle: `${esc(c.reference)} · ${esc(c.typeLabel)} · ${esc(c.object)}`, badges: statusBadge(c.status), actions: acts.join('') })}
    ${['EN_VIGUEUR', 'ECHU'].includes(c.status) && c.expiry.level !== 'NORMAL' ? `<div class="st-alerts"><span class="st-alert is-${c.expiry.level === 'ECHU' ? 'error' : 'warning'}">${icon('alertTriangle', { size: 14 })} ${c.expiry.level === 'ECHU' ? `Contrat échu depuis le ${formatDate(c.endDate)}` : `Échéance le ${formatDate(c.endDate)}, dans ${c.expiry.daysLeft} jour(s) : préparez le renouvellement ou la clôture.`}</span></div>` : ''}
    ${c.status === 'VALIDATION_DG' && allowed('legal.validate_final') && blocked ? `<div class="st-alerts"><span class="st-alert is-info">${icon('info', { size: 14 })} Vous avez rédigé ou visé ce contrat : la validation finale revient à une autre personne.</span></div>` : ''}
    ${c.indicateurs ? kpis([kpi('DUT émis sur la période', num(c.indicateurs.dutCrees), `depuis le ${formatDate(c.startDate)}`), kpi('DUT validés', num(c.indicateurs.dutValides), '', 'green'), kpi('Taux de rejet', pct(c.indicateurs.tauxRejet), 'mesuré sur la plateforme', 'rose'), kpi('Note moyenne', c.evaluations?.length ? `${num(c.evaluations.reduce((s, e) => s + e.note, 0) / c.evaluations.length, 1)} / 5` : '—', `${num(c.evaluations?.length || 0)} évaluation(s)`, 'navy')]) : ''}
    <div class="sup-grid">
      <div class="sup-main">
        <div class="card"><div class="card-header"><h3>Circuit de validation</h3></div>
          <div class="timeline">${CIRCUIT.map((s, i) => { const st = (c.steps || []).slice().reverse().find((x) => (s === 'BROUILLON' ? /enregistré|Renvoyé/.test(x.label) : s === 'VISA_JURIDIQUE' ? /Soumis/.test(x.label) : s === 'VALIDATION_DG' ? /Visa/.test(x.label) : /Direction générale/.test(x.label))); return `<div class="timeline-item"><span class="timeline-dot ${i <= reached ? 'done' : ''}"></span><div class="timeline-content"><strong>${esc(L.LEGAL_STATUS_LABELS[s])}</strong><div class="meta">${i <= reached && st ? `${esc(st.by)} · ${formatDateTime(st.at)}` : i === reached + 1 ? 'Étape suivante' : 'À venir'}</div>${st?.note && i <= reached ? `<div class="note">${esc(st.note)}</div>` : ''}</div></div>`; }).join('')}</div></div>
        ${c.type === 'PARTENARIAT' ? `<div class="card"><div class="card-header"><h3>Évaluations du partenaire</h3><span class="text-muted">Notes de 1 à 5</span></div>${plainTable([
          ['period', 'Période', (e) => `<strong>${esc(e.period)}</strong><small>${formatDate(e.at)}</small>`],
          ...L.PARTNER_CRITERIA.map(([k, l]) => [k, l, (e) => num(e.scores[k]), 'num']),
          ['note', 'Note', (e) => badge(`${num(e.note, 1)} / 5`, e.note >= 4 ? 'success' : e.note >= 3 ? 'info' : 'warning'), 'num'],
          ['comment', 'Observations', (e) => `${esc(e.comment)}<small>${esc(e.by)}</small>`],
        ], c.evaluations || [], 'Aucune évaluation pour le moment.')}</div>` : ''}
        <div class="card"><div class="card-header"><h3>Journal</h3></div>${journalHtml(c.journal.length ? c.journal : (c.steps || []).slice().reverse().map((s) => ({ at: s.at, label: s.label, by: s.by, note: s.note })))}</div>
      </div>
      <aside class="sup-side">
        <div class="card"><div class="card-header"><h3>Contrat</h3></div>${identity([
          ['Référence', esc(c.reference)], ['Type', esc(c.typeLabel)], ['Cocontractant', `<strong>${esc(c.counterparty)}</strong>`], ['Objet', esc(c.object)],
          ['Durée', `du ${formatDate(c.startDate)} au ${formatDate(c.endDate)}`], ['Montant', money(c.amount)], ['Sites affectés', esc((c.antennaNames || []).join(', '))],
          ['Engagements et responsabilités', esc(c.responsibilities || '')], ['Rédigé par', `${esc(c.createdBy?.name || '—')} · ${formatDate(c.createdAt)}`],
          ['Visa juridique', c.visaBy ? `${esc(c.visaBy.name)} · ${formatDate(c.visaAt)}` : ''], ['Validation finale', c.validatedBy ? `<strong>${esc(c.validatedBy.name)}</strong> · ${formatDate(c.validatedAt)}` : ''],
        ])}</div>
      </aside>
    </div>`;
  container.querySelectorAll('[data-do]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.do;
    if (k === 'edit') contractForm(c, refresh);
    if (k === 'submit' && run(() => L.submitLegalContract(id), 'Contrat soumis au visa juridique')) refresh();
    if (k === 'visa') formModal({ title: 'Donner le visa juridique', icon: 'checkCircle', confirmLabel: 'Viser', body: field('Observation', '<textarea class="textarea" name="note" rows="2"></textarea>'), submit: (v) => { L.giveLegalVisa(id, v.note); refresh(); } });
    if (k === 'validate') formModal({ title: 'Valider ce contrat ?', icon: 'checkCircle', confirmLabel: 'Valider', text: 'Le contrat entrera en vigueur à sa date de début. Cette validation est définitive.', body: '', submit: () => { L.validateLegalContract(id); refresh(); } });
    if (k === 'return') formModal({ title: 'Renvoyer en rédaction', icon: 'xCircle', danger: true, confirmLabel: 'Renvoyer', body: field('Motif du renvoi', '<textarea class="textarea" name="reason" rows="3"></textarea>', { required: true }), submit: (v) => { L.returnLegalContract(id, v.reason); refresh(); } });
    if (k === 'evaluate') formModal({ title: `Évaluer ${c.counterparty}`, icon: 'checkCircle', large: true, confirmLabel: 'Enregistrer l’évaluation',
      text: c.indicateurs ? `Repères mesurés : ${num(c.indicateurs.dutCrees)} DUT émis, taux de rejet ${pct(c.indicateurs.tauxRejet)}.` : '',
      body: `${field('Période évaluée', '<input class="input" name="period" maxlength="40" placeholder="Ex. Semestre 2 2026">', { required: true })}<div class="field-row">${L.PARTNER_CRITERIA.map(([k2, l]) => field(l, `<select class="select" name="score_${k2}">${options([1, 2, 3, 4, 5].map((n) => [n, String(n)]), '3')}</select>`, { required: true })).join('')}</div>${field('Observations', '<textarea class="textarea" name="comment" rows="3"></textarea>', { required: true, hint: '10 caractères au minimum.' })}`,
      submit: (v) => { L.evaluatePartner(id, { period: v.period, comment: v.comment, scores: Object.fromEntries(L.PARTNER_CRITERIA.map(([k2]) => [k2, Number(v[`score_${k2}`])])) }); refresh(); } });
  }));
}
