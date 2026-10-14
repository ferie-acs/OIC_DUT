// Intégration : tableau de bord de la Direction générale (page d'accueil du rôle DIRECTION).
// Synthèse nationale : indicateurs DUT, comparaison des antennes, objectifs et actions en retard (lot d5),
// incidents et équipements (lot d4), ventes, stock et rapprochement (lot d2), partenaires et transporteurs (lot d1),
// documents et contrats à valider (lot d5). Chaque indicateur a sa représentation graphique : courbe mensuelle ou
// répartition dans la tuile, puis graphiques détaillés par thème. Tous les chiffres et toutes les séries viennent
// de direction-charts.service.js (qui s'appuie sur synthesis.service.js) ; la vue ne calcule rien.
import { icon } from '../core/icons.js';
import { escapeHtml as esc, formatDate } from '../core/utils.js';
import { lineChartSvg } from '../core/charts.js';
import { barChart, lineChart, cssColor } from '../core/chartjs.js';
import { iconForLabel } from '../core/card-icons.js';
import { SYNTHESIS_PERIODS } from '../services/synthesis.service.js';
import { directionCharts } from '../services/direction-charts.service.js';
import { pageHeader, bindRowLinks } from './direction-ui.js';
import { opsCard, linkList, badge, footnote, num, pct, hours, fcfa } from './synthesis-ui.js';

let periodKind = '30j';
let charts = [];
const destroyCharts = () => { charts.forEach((c) => c?.destroy()); charts = []; };

// Teintes sémantiques → variables de la charte (aucune couleur propre à cet écran).
const TONE_VARS = { success: '--success', warning: '--warning', error: '--error', muted: '--text-muted', blue: '--navy-2', light: '--navy-label', accent: '--accent', navy: '--navy' };
const toneVar = (tone) => `var(${TONE_VARS[tone] || '--navy-2'})`;
const color = (tone) => cssColor(TONE_VARS[tone] || '--navy-2');

const describe = (title, labels, values, fmt) => `${title} : ${labels.map((l, i) => `${l} ${values[i] == null ? '—' : fmt(values[i])}`).join(', ')}`;

/** Tuile KPI avec courbe d'évolution mensuelle (gabarit des tuiles à courbe du tableau de bord d'antenne). */
function trendTile({ label, value, hint, tone, months, values, fmt, caption }) {
  const series = months.map((m, i) => ({ label: m.label, count: values[i] == null ? 0 : values[i] }));
  return `<div class="kpi-card st-kpi dg-kpi" style="--kpi-tone:var(--sq-${tone}-fg)">
    <div class="kpi-label"><span>${esc(label)}</span><span class="st-kpi-icon" aria-hidden="true">${icon(iconForLabel(label), { size: 17 })}</span></div>
    <div class="kpi-value" style="color:var(--sq-${tone}-fg)">${value}</div>${hint ? `<div class="kpi-hint">${hint}</div>` : ''}
    <div class="dg-kpi-viz">${lineChartSvg(series, { compact: true, label: `${caption}, par mois`, format: fmt })}
      <div class="dg-kpi-caption"><span>${esc(caption)}</span><span>${esc(months[0]?.label || '')} – ${esc(months.at(-1)?.label || '')}</span></div></div>
  </div>`;
}

/** Barre de répartition (parts d'un total) avec sa légende chiffrée. */
function splitBar(comp, empty) {
  if (!comp || !comp.total) return `<p class="dg-split-empty">${esc(empty)}</p>`;
  const parts = comp.parts.filter((p) => p.value > 0);
  return `<div class="dg-split" role="img" aria-label="${esc(comp.parts.map((p) => `${p.label} ${p.value}`).join(', '))}">${parts.map((p) => `<span style="flex:${p.value};background:${toneVar(p.tone)}" title="${esc(`${p.label} : ${p.value} (${num(p.share, 1)} %)`)}"></span>`).join('')}</div>
    <div class="dg-legend">${comp.parts.map((p) => `<span><i style="background:${toneVar(p.tone)}"></i>${esc(p.label)} <b>${num(p.value)}</b></span>`).join('')}</div>`;
}

function splitTile({ label, value, hint, tone, comp, empty }) {
  return `<div class="kpi-card st-kpi dg-kpi" style="--kpi-tone:var(--sq-${tone}-fg)">
    <div class="kpi-label"><span>${esc(label)}</span><span class="st-kpi-icon" aria-hidden="true">${icon(iconForLabel(label), { size: 17 })}</span></div>
    <div class="kpi-value" style="color:var(--sq-${tone}-fg)">${value}</div>${hint ? `<div class="kpi-hint">${hint}</div>` : ''}
    <div class="dg-kpi-viz">${splitBar(comp, empty)}</div>
  </div>`;
}

/** Carte de graphique (gabarit des statistiques) ; état vide propre si rien à tracer. */
function chartCard(id, title, subtitle, { empty = false, emptyText = 'Aucune donnée sur la période.', foot = '', aria = '', cls = '', total = '' } = {}) {
  const unavailable = !empty && !window.Chart;
  const body = empty || unavailable
    ? `<p class="priority-empty dg-chart-empty">${icon('info')} ${esc(unavailable ? 'Graphique indisponible : la bibliothèque graphique n’a pas pu être chargée.' : emptyText)}</p>`
    : `<canvas id="${id}" role="img" aria-label="${esc(aria || title)}"></canvas>`;
  return `<div class="chart-card ${cls}"><div class="chart-head"><div><h3>${esc(title)}</h3>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>${total !== '' ? `<span class="chart-total"><strong>${total}</strong></span>` : ''}</div><div class="chart-box">${body}</div>${foot}</div>`;
}

const section = (title, subtitle, body, grid = '') => `<section class="ops-section dg-section"><div class="ops-heading"><div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div></div><div class="dash-grid charts-grid ${grid}">${body}</div></section>`;

export function render(container) {
  destroyCharts();
  let d;
  try { d = directionCharts({ periodKind }); } catch (err) {
    container.innerHTML = `${pageHeader({ overline: 'Direction générale · Pilotage', title: 'Tableau de bord' })}<p class="priority-empty">${icon('info')} ${esc(err.message)}</p>`;
    return;
  }
  const s = d.synthese;
  const n = s.national, o = s.objectifs, inc = s.incidents, eq = s.equipements, v = s.validations, rec = s.rapprochement, ve = s.ventes;
  const t = d.tendances, mois = d.mois, a = d.antennes;
  const moisLabels = mois.map((m) => m.label), moisTitres = mois.map((m) => m.title);
  const span = `${mois[0]?.title || ''} à ${mois.at(-1)?.title || ''}`;
  const periode = d.periode;
  const sumAll = (list) => list.reduce((x, y) => x + (Number(y) || 0), 0);

  const chip = (count, label, href, level) => (count ? `<a class="st-alert is-${level}" href="#${href}">${icon(level === 'error' ? 'alertTriangle' : level === 'warning' ? 'alertCircle' : 'info', { size: 14 })} ${num(count)} ${esc(label)}</a>` : '');
  const chips = [
    chip(v.contratsObjectifs, 'contrat(s) d’objectifs à valider', '/direction/objectifs', 'info'),
    chip(v.documents, 'document(s) à valider', '/direction/documents', 'info'),
    chip(v.contratsJuridiques, 'contrat(s) ou convention(s) à valider', '/direction/contrats', 'info'),
    chip(o.actionsEnRetard, 'action(s) corrective(s) en retard', '/direction/actions', 'error'),
    chip(inc.enRetard, 'incident(s) hors délai', '/incidents', 'error'),
    chip(v.decisionsEnRetard, 'décision(s) de réunion en retard', '/direction/reunions', 'warning'),
    chip(v.contratsEcheance, 'contrat(s) à échéance', '/direction/contrats', 'warning'),
  ].join('');

  const antennaRows = s.antennes.slice(0, 8).map((x) => `<tr data-href="/direction/antennes" tabindex="0">
      <td><strong>${esc(x.name)}</strong></td>
      <td class="text-right">${num(x.dutValides)}</td>
      <td class="text-right">${pct(x.tauxRejet)}</td>
      <td class="text-right">${hours(x.delaiValidationH)}</td>
      <td class="text-right">${pct(x.objectifs)}</td>
      <td class="text-right">${num(x.incidentsOuverts)}${x.incidentsEnRetard ? `<small class="text-muted"> dont ${num(x.incidentsEnRetard)} hors délai</small>` : ''}</td></tr>`).join('');
  const comparison = s.antennes.length
    ? `<div class="table-wrap"><table class="data-table sup-table"><thead><tr><th scope="col">Antenne</th><th scope="col" class="text-right">DUT validés</th><th scope="col" class="text-right">Taux de rejet</th><th scope="col" class="text-right">Délai médian</th><th scope="col" class="text-right">Objectifs</th><th scope="col" class="text-right">Incidents</th></tr></thead><tbody>${antennaRows}</tbody></table></div>${footnote(`${num(s.antennesActives)} antenne(s) active(s) sur ${num(s.antennesTotal)} · classement par DUT validés ; pannes et évolutions détaillées dans le suivi des antennes.`)}`
    : `<p class="priority-empty">${icon('info')} Aucune activité d’antenne sur la période.</p>`;

  const fmtN = (x) => num(x), fmtPct = (x) => pct(x), fmtH = (x) => hours(x), fmtF = (x) => fcfa(x);
  const incTotals = d.incidents.series.map((x) => sumAll(x.values));
  const stockTotal = d.stock ? sumAll(d.stock.map((x) => x.value)) : 0;
  const recRows = d.rapprochement?.partenaires || [];
  const actionsTotal = sumAll(d.actions.parEtat.map((x) => x.total));
  const groupTotal = sumAll(d.groupements.series.flatMap((x) => x.values));

  container.innerHTML = `
    ${pageHeader({
      overline: 'Direction générale · Pilotage',
      title: 'Tableau de bord',
      subtitle: `Vue nationale du réseau sur ${esc(periode)} : documents de transport, antennes, objectifs, exploitation, recettes et partenaires.`,
      actions: `<select class="select" id="dg-period" aria-label="Période des indicateurs">${Object.entries(SYNTHESIS_PERIODS).map(([k, l]) => `<option value="${k}" ${k === s.period.kind ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select><a class="btn btn-secondary" href="#/direction/antennes">${icon('barChart', { size: 15 })} Suivi des antennes</a>`,
    })}
    <div class="st-alerts">${chips || `<span class="st-alert is-ok">${icon('checkCircle', { size: 14 })} Aucun point d’attention</span>`}</div>
    <div class="kpi-grid sup-kpis dg-kpis">
      ${trendTile({ label: 'DUT édités', value: num(n.dutCrees), hint: `du ${formatDate(s.period.from)} au ${formatDate(s.period.to)}`, tone: 'navy', months: mois, values: t.dutCrees, fmt: fmtN, caption: 'DUT édités' })}
      ${trendTile({ label: 'DUT validés', value: num(n.dutValides), hint: `${pct(n.validesSous24h)} validés sous 24 h`, tone: 'green', months: mois, values: t.dutValides, fmt: fmtN, caption: 'DUT validés' })}
      ${trendTile({ label: 'Taux de rejet', value: pct(n.tauxRejet), hint: `${num(n.dutRejetes)} DUT rejeté(s)`, tone: 'rose', months: mois, values: t.tauxRejet, fmt: fmtPct, caption: 'Taux de rejet' })}
      ${trendTile({ label: 'Délai de validation', value: hours(n.delaiValidationH), hint: 'médiane nationale', tone: 'amber', months: mois, values: t.delaiValidationH, fmt: fmtH, caption: 'Délai médian' })}
      ${trendTile({ label: 'Contrôles', value: num(n.scans), hint: 'DUT contrôlés sur la route', tone: 'teal', months: mois, values: t.scans, fmt: fmtN, caption: 'Contrôles routiers' })}
      ${trendTile({ label: 'Antennes actives', value: `${num(s.antennesActives)} / ${num(s.antennesTotal)}`, hint: 'au moins un DUT sur la période', tone: 'blue', months: mois, values: t.antennesActives, fmt: fmtN, caption: 'Antennes actives' })}
    </div>
    <div class="kpi-grid sup-kpis dg-kpis">
      ${splitTile({ label: 'Atteinte des objectifs', value: pct(o.tauxNational), hint: `${num(o.parAntenne.length)} antenne(s) sous contrat`, tone: 'blue', comp: d.objectifs, empty: 'Aucun objectif en vigueur.' })}
      ${splitTile({ label: 'Actions en retard', value: num(o.actionsEnRetard), hint: 'actions correctives non closes', tone: o.actionsEnRetard ? 'rose' : 'teal', comp: d.actions.repartition, empty: 'Aucune action corrective.' })}
      ${trendTile({ label: 'Incidents ouverts', value: num(inc.ouverts), hint: `${num(inc.enRetard)} hors délai · ${num(inc.critiques)} critique(s)`, tone: inc.enRetard ? 'rose' : 'navy', months: mois, values: t.incidentsDeclares, fmt: fmtN, caption: 'Incidents déclarés' })}
      ${trendTile({ label: 'Équipements en panne', value: num(eq.enPanne), hint: `sur ${num(eq.total)} recensé(s)`, tone: eq.enPanne ? 'amber' : 'teal', months: mois, values: t.pannes, fmt: fmtN, caption: 'Pannes déclarées' })}
      ${ve && t.ventesTTC ? trendTile({ label: 'Ventes de références', value: fcfa(ve.ttc), hint: `${num(ve.quantite)} numéro(s) · TTC`, tone: 'violet', months: mois, values: t.ventesTTC, fmt: fmtF, caption: 'Ventes TTC' }) : splitTile({ label: 'Ventes de références', value: '—', hint: '', tone: 'violet', comp: null, empty: 'Ventes non consultables.' })}
      ${splitTile({ label: 'Écarts de rapprochement', value: rec ? num(rec.ecartsOuverts) : '—', hint: rec ? `${num(rec.partenairesConcernes)} partenaire(s) concerné(s)` : '', tone: rec?.ecartsOuverts ? 'amber' : 'teal', comp: d.rapprochement?.repartition, empty: rec ? 'Aucun écart sur la période.' : 'Rapprochement non consultable.' })}
    </div>

    ${section('Activité du réseau', `Évolution mensuelle, de ${span}. Le mois en cours est partiel.`, `
      ${chartCard('dg-c-duts', 'DUT édités, validés et rejetés', 'Par mois de création du DUT', { empty: !sumAll(t.dutCrees), aria: describe('DUT édités par mois', moisTitres, t.dutCrees, fmtN) })}
      ${chartCard('dg-c-scans', 'Contrôles routiers', 'DUT contrôlés sur la route, par mois', { empty: !sumAll(t.scans), aria: describe('Contrôles par mois', moisTitres, t.scans, fmtN) })}
      ${chartCard('dg-c-delai', 'Délai médian de validation', 'De la soumission à la validation, en heures', { empty: t.delaiValidationH.every((x) => x == null), aria: describe('Délai médian par mois', moisTitres, t.delaiValidationH, fmtH) })}`)}

    ${section('Comparaison des antennes', `Antennes actives sur ${periode}, du ${formatDate(s.period.from)} au ${formatDate(s.period.to)}.`, `
      ${chartCard('dg-c-ant-valides', 'DUT validés par antenne', 'La plus forte en orange', { empty: !a.dutValides.length, emptyText: 'Aucun DUT sur la période.', aria: describe('DUT validés par antenne', a.dutValides.map((x) => x.name), a.dutValides.map((x) => x.value), fmtN) })}
      ${chartCard('dg-c-ant-rejet', 'Taux de rejet par antenne', 'Part des DUT soumis qui ont été rejetés', { empty: !a.tauxRejet.length, emptyText: 'Aucun DUT soumis sur la période.', aria: describe('Taux de rejet par antenne', a.tauxRejet.map((x) => x.name), a.tauxRejet.map((x) => x.value), fmtPct) })}
      ${chartCard('dg-c-ant-delai', 'Délai médian de validation par antenne', 'En heures, de la soumission à la validation', { empty: !a.delaiValidationH.length, emptyText: 'Aucune validation sur la période.', aria: describe('Délai médian par antenne', a.delaiValidationH.map((x) => x.name), a.delaiValidationH.map((x) => x.value), fmtH) })}
      ${chartCard('dg-c-ant-obj', 'Atteinte des objectifs par antenne', `Contrats en vigueur · repère : cible ${a.cibleObjectifs} %`, { empty: !a.objectifs.length, emptyText: 'Aucun contrat d’objectifs en vigueur.', aria: describe('Atteinte des objectifs par antenne', a.objectifs.map((x) => x.name), a.objectifs.map((x) => x.value), fmtPct) })}
      ${opsCard('Classement des antennes', comparison, { subtitle: 'Antennes actives ou concernées par un objectif, un incident ou une panne', aside: `<a href="#/direction/antennes">Classement complet</a>`, cls: 'dg-span-2' })}`)}

    ${section('Exploitation', `Incidents de la plateforme, parc d’équipements et actions correctives.`, `
      ${chartCard('dg-c-inc-mois', 'Incidents déclarés et clos', `Par mois, de ${span}`, { empty: !sumAll(t.incidentsDeclares) && !sumAll(t.incidentsClos), aria: describe('Incidents déclarés par mois', moisTitres, t.incidentsDeclares, fmtN) })}
      ${chartCard('dg-c-inc-etat', 'Incidents par état et par gravité', `Incidents déclarés sur ${periode}`, { empty: !d.incidents.total, emptyText: 'Aucun incident déclaré sur la période.', total: num(d.incidents.total), aria: `Incidents déclarés sur la période par gravité : ${d.incidents.series.map((x, i) => `${x.label} ${incTotals[i]}`).join(', ')}` })}
      ${chartCard('dg-c-parc', 'État du parc d’équipements', 'Situation du jour, toutes antennes', { empty: !eq.total, emptyText: 'Aucun équipement recensé.', total: num(eq.total), aria: describe('Équipements par état', d.equipements.map((x) => x.label), d.equipements.map((x) => x.value), fmtN) })}
      ${chartCard('dg-c-actions', 'Actions correctives par état', 'Situation du jour · en rouge, échéance dépassée', { empty: !actionsTotal, emptyText: 'Aucune action corrective.', total: num(actionsTotal), aria: describe('Actions correctives par état', d.actions.parEtat.map((x) => x.label), d.actions.parEtat.map((x) => x.total), fmtN) })}`, 'dg-grid-2')}

    ${section('Recettes, partenaires et décisions', 'Ventes de références, stock de numéros, rapprochement, groupements et validations en attente.', `
      ${t.ventesTTC ? chartCard('dg-c-ventes', 'Ventes de références', `Montant vendu TTC et montant encaissé et validé en caisse, par mois · paiements simulés`, { empty: !sumAll(t.ventesTTC), cls: 'dg-span-2', aria: describe('Ventes TTC par mois', moisTitres, t.ventesTTC, fmtF), foot: footnote('<a href="#/caisse/ventes">Rapport des ventes</a> · <a href="#/rapprochement">Rapprochement</a>') }) : chartCard('dg-c-ventes', 'Ventes de références', '', { empty: true, emptyText: 'Ventes non consultables.', cls: 'dg-span-2' })}
      ${chartCard('dg-c-stock', 'Numéros de DUT par état', 'Stock national, situation du jour', { empty: !stockTotal, emptyText: d.stock ? 'Aucun numéro en stock.' : 'Stock non consultable.', total: num(stockTotal), aria: d.stock ? describe('Numéros par état', d.stock.map((x) => x.label), d.stock.map((x) => x.value), fmtN) : '' })}
      ${chartCard('dg-c-ecarts', 'Écarts de rapprochement par partenaire', `Écarts relevés sur ${periode}`, { empty: !recRows.length, emptyText: rec ? 'Aucun écart sur la période.' : 'Rapprochement non consultable.', aria: `Écarts par partenaire : ${recRows.map((r) => `${r.name} ${r.bloquants} bloquant(s), ${r.aExaminer} à examiner, ${r.justifies} justifié(s)`).join(' ; ')}` })}
      ${chartCard('dg-c-groupements', 'Partenaires et transporteurs par état', 'Situation du jour', { empty: !groupTotal, emptyText: 'Aucun groupement enregistré.', total: num(groupTotal), aria: `Groupements par état : ${d.groupements.series.map((x) => `${x.label} ${x.values.join(' et ')}`).join(', ')}`, foot: s.groupements.suspendus.length ? footnote(`Suspendus : ${s.groupements.suspendus.map((x) => `${esc(x.name)} (${esc(x.type.toLowerCase())})`).join(', ')}`) : '' })}
      ${chartCard('dg-c-validations', 'Validations en attente', 'Dossiers qui attendent une décision, par type', { empty: !sumAll(d.validations.map((x) => x.value)), emptyText: 'Aucun dossier en attente.', aria: describe('Validations en attente', d.validations.map((x) => x.label), d.validations.map((x) => x.value), fmtN), foot: footnote('<a href="#/direction/objectifs">Contrats d’objectifs</a> · <a href="#/direction/documents">Documents</a> · <a href="#/direction/contrats">Contrats et conventions</a>') })}`)}

    <section class="ops-section dg-section" aria-label="À traiter">
      <div class="ops-heading"><div><h2>À traiter</h2><p>Incidents ouverts et actions correctives en retard, du plus urgent au plus récent.</p></div></div>
      <div class="ops-grid">
        ${opsCard('Incidents ouverts', linkList(inc.liste.map((i) => ({ href: `/incidents/${i.id}`, icon: i.overdue ? 'alertTriangle' : 'alertCircle', title: `${i.reference} · ${i.title}`, badge: i.overdue ? badge('Délai dépassé', 'error') : badge(i.statusLabel, 'neutral'), detail: `Gravité ${i.severity.toLowerCase()} · ${i.antennaName}` })), 'Aucun incident ouvert.'), { aside: `<a href="#/incidents">Tous les incidents</a>` })}
        ${opsCard('Actions correctives en retard', `${linkList(o.actionsListe.map((x) => ({ href: '/direction/actions', icon: 'clock', title: x.title, badge: badge(`échéance ${formatDate(x.dueDate)}`, 'error'), detail: `${x.responsible} · ${x.antennaName}` })), 'Aucune action corrective en retard.')}${footnote(`${num(o.contratsAValider)} contrat(s) d’objectifs en attente de validation.`)}`, { aside: `<a href="#/direction/actions">Toutes les actions</a>` })}
      </div>
    </section>`;

  bindRowLinks(container);
  container.querySelector('#dg-period').addEventListener('change', (e) => { periodKind = e.target.value; render(container); });
  if (!window.Chart) return;

  const el = (id) => container.querySelector(`#${id}`);
  const draw = (id, fn) => { if (el(id)) charts.push(fn(el(id))); };
  const names = (list) => list.map((x) => x.name);
  const vals = (list) => list.map((x) => x.value);

  draw('dg-c-duts', (c) => lineChart(c, moisLabels, [
    { label: 'Édités', values: t.dutCrees, color: color('blue') },
    { label: 'Validés', values: t.dutValides, color: color('success'), pointStyle: 'rect' },
    { label: 'Rejetés', values: t.dutRejetes, color: color('error'), pointStyle: 'triangle' },
  ], { titles: moisTitres }));
  draw('dg-c-scans', (c) => barChart(c, moisLabels, t.scans, { highlight: false, values: true, rotate: false, titles: moisTitres }));
  draw('dg-c-delai', (c) => lineChart(c, moisLabels, [{ label: 'Délai médian', values: t.delaiValidationH, color: color('blue') }], { unit: 'h', titles: moisTitres }));

  draw('dg-c-ant-valides', (c) => barChart(c, names(a.dutValides), vals(a.dutValides), { horizontal: true, values: true }));
  draw('dg-c-ant-rejet', (c) => barChart(c, names(a.tauxRejet), vals(a.tauxRejet), { horizontal: true, unit: '%', values: true, highlight: false }));
  draw('dg-c-ant-delai', (c) => barChart(c, names(a.delaiValidationH), vals(a.delaiValidationH), { horizontal: true, unit: 'h', values: true, highlight: false }));
  draw('dg-c-ant-obj', (c) => barChart(c, names(a.objectifs), vals(a.objectifs), { horizontal: true, unit: '%', values: true, highlight: false, max: 100, target: { value: a.cibleObjectifs, label: `Cible ${a.cibleObjectifs} %` } }));

  draw('dg-c-inc-mois', (c) => lineChart(c, moisLabels, [
    { label: 'Déclarés', values: t.incidentsDeclares, color: color('blue') },
    { label: 'Clos', values: t.incidentsClos, color: color('success'), pointStyle: 'rect' },
  ], { titles: moisTitres }));
  draw('dg-c-inc-etat', (c) => barChart(c, d.incidents.etatsCourts, [], { horizontal: true, highlight: false, titles: d.incidents.etats, stacked: d.incidents.series.map((x) => ({ label: x.label, values: x.values, color: color({ CRITIQUE: 'error', MAJEURE: 'accent', MINEURE: 'blue' }[x.key]) })) }));
  const eqTones = { EN_SERVICE: 'success', EN_REPARATION: 'warning', EN_PANNE: 'error', REFORME: 'muted' };
  const eqList = ['EN_SERVICE', 'EN_REPARATION', 'EN_PANNE', 'REFORME'].map((k) => d.equipements.find((x) => x.key === k)).filter(Boolean);
  draw('dg-c-parc', (c) => barChart(c, eqList.map((x) => x.label), eqList.map((x) => x.value), { horizontal: true, values: true, colors: eqList.map((x) => color(eqTones[x.key])) }));
  draw('dg-c-actions', (c) => barChart(c, d.actions.parEtat.map((x) => x.label), [], { horizontal: true, highlight: false, stacked: [
    { label: 'Sans retard', values: d.actions.parEtat.map((x) => x.dansLesDelais), color: color('blue') },
    { label: 'En retard', values: d.actions.parEtat.map((x) => x.enRetard), color: color('error') },
  ] }));

  draw('dg-c-ventes', (c) => barChart(c, moisLabels, [], { unit: 'F', grouped: true, highlight: false, rotate: false, titles: moisTitres, stacked: [
    { label: 'Vendu TTC', values: t.ventesTTC, color: color('blue') },
    { label: 'Encaissé et validé', values: t.encaisseValide, color: color('success') },
  ] }));
  if (d.stock) draw('dg-c-stock', (c) => barChart(c, d.stock.map((x) => x.short || x.label), d.stock.map((x) => x.value), { horizontal: true, values: true, titles: d.stock.map((x) => x.label), colors: d.stock.map((x) => color(x.tone)) }));
  draw('dg-c-ecarts', (c) => barChart(c, names(recRows), [], { horizontal: true, highlight: false, labelMax: 18, stacked: [
    { label: 'Bloquants', values: recRows.map((r) => r.bloquants), color: color('error') },
    { label: 'À examiner', values: recRows.map((r) => r.aExaminer), color: color('warning') },
    { label: 'Justifiés', values: recRows.map((r) => r.justifies), color: color('success') },
  ] }));
  draw('dg-c-groupements', (c) => barChart(c, d.groupements.categoriesCourtes, [], { horizontal: true, highlight: false, titles: d.groupements.categories, stacked: d.groupements.series.map((x) => ({ label: x.label, values: x.values, color: color(x.tone) })) }));
  draw('dg-c-validations', (c) => barChart(c, d.validations.map((x) => x.short), d.validations.map((x) => x.value), { horizontal: true, values: true, highlight: false, titles: d.validations.map((x) => x.label) }));
}
