// Statistiques de la plateforme (admin OIC) : filtres communs, alertes, huit domaines en onglets.
import { icon } from '../core/icons.js';
import { escapeHtml as esc, formatDate, formatDateTime, formatNumber } from '../core/utils.js';
import { DUT_STATUS_LABELS } from '../core/constants.js';
import { barChart, lineChart, doughnutChart } from '../core/chartjs.js';
import { computeStatistics, filterOptions } from '../services/statistics.service.js';
import { toCsv } from '../services/supervision.service.js';

const TABS = [['documentaire', 'Documentaire', 'file'], ['logistique', 'Logistique', 'truck'], ['corridors', 'Corridors', 'map'], ['controle', 'Contrôle & sécurité', 'shield'], ['economie', 'Économie', 'layers'], ['acteurs', 'Acteurs', 'users'], ['usage', 'Usage & audit', 'clock'], ['qualite', 'Qualité des données', 'checkCircle']];
const TYPE_LABELS = { NATIONAL: 'National', VERS_INTERNATIONAL: 'Vers l’international', VERS_NATIONAL: 'Vers le national' };
const COMPTE_LABELS = { PROPRE: 'Compte propre', AUTRUI: 'Pour autrui', SOUS_TRAITANCE: 'Sous-traitance' };
const STAGE_LABELS = { PLANNED: 'À préparer', LOADED: 'Chargé', DEPARTED: 'En route', ARRIVED: 'Arrivé', DELIVERED: 'Livré' };
const n = (v, d = 0) => (v == null || Number.isNaN(v) ? '—' : formatNumber(v, d));
const h = (v) => (v == null ? '—' : v < 48 ? `${n(v, 1)} h` : `${n(v / 24, 1)} j`);
const pc = (v) => (v == null ? '—' : `${n(v, 1)} %`);
const fcfa = (v) => (v == null ? '—' : `${n(Math.round(v))} F`);
const kpi = (label, value, hint = '', tone = 'navy') => `<div class="kpi-card st-kpi"><div class="kpi-label">${esc(label)}</div><div class="kpi-value" style="color:var(--sq-${tone}-fg)">${value}</div>${hint ? `<div class="kpi-hint">${hint}</div>` : ''}</div>`;
const chart = (id, title, subtitle = '', total = '') => `<div class="chart-card"><div class="chart-head"><div><h3>${esc(title)}</h3>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>${total !== '' ? `<span class="chart-total"><strong>${total}</strong></span>` : ''}</div><div class="chart-box"><canvas id="${id}" role="img" aria-label="${esc(title)}"></canvas></div></div>`;
const table = (cols, rows, empty = 'Aucune donnée') => rows.length ? `<div class="table-wrap"><table class="data-table st-table"><thead><tr>${cols.map(([l, , cls]) => `<th class="${cls || ''}">${esc(l)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map(([, f, cls]) => `<td class="${cls || ''}">${f(r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : `<p class="sup-empty">${esc(empty)}</p>`;
const pairs = (list, fmt = (v) => n(v)) => list.length ? `<ul class="st-pairs">${list.map((x) => `<li><span>${esc(x.label)}</span><b>${fmt(x.value)}</b></li>`).join('')}</ul>` : '<p class="sup-empty">Aucune donnée</p>';
const card = (title, body, extra = '') => `<div class="card st-card"><div class="card-header"><h3>${esc(title)}</h3>${extra}</div>${body}</div>`;

let charts = [];
const destroyCharts = () => { charts.forEach((c) => c?.destroy()); charts = []; };

export function render(container, params = {}) {
  destroyCharts();
  const opts = filterOptions();
  const state = { tab: TABS.some(([k]) => k === params.tab) ? params.tab : 'documentaire', filters: { from: '', to: '', antennaId: '', partnerId: '', transporterId: '', transportType: '' } };
  try { Object.assign(state.filters, JSON.parse(sessionStorage.getItem('dut_stats_filters') || '{}')); } catch { /* filtres par défaut */ }
  const sel = (id, label, list, current, all) => `<label class="plan-pill ${current ? 'is-set' : ''}"><span>${esc(label)}</span><select class="plan-pill-select" id="${id}"><option value="">${esc(all)}</option>${list.map((o) => `<option value="${esc(o.id)}" ${o.id === current ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select></label>`;
  container.innerHTML = `
    <div class="page-header">
      <div><span class="overline">OIC · Pilotage</span><h1>Statistiques de la plateforme</h1><div class="subtitle">Tous les indicateurs, calculés à partir des données enregistrées. Filtrez par période et par acteur.</div></div>
      <button type="button" class="btn btn-secondary" id="st-export">${icon('download', { size: 15 })} Exporter l’onglet (CSV)</button>
    </div>
    <div class="page-header-rule"></div>
    <div class="st-filters">
      <label class="plan-pill ${state.filters.from ? 'is-set' : ''}"><span>${icon('calendar', { size: 13 })} Du</span><input class="plan-pill-select" type="date" id="st-from" value="${esc(state.filters.from)}"></label>
      <label class="plan-pill ${state.filters.to ? 'is-set' : ''}"><span>${icon('calendar', { size: 13 })} Au</span><input class="plan-pill-select" type="date" id="st-to" value="${esc(state.filters.to)}"></label>
      <div class="plan-nav st-presets"><button type="button" class="plan-nav-btn" data-days="7">7 j</button><button type="button" class="plan-nav-btn" data-days="30">30 j</button><button type="button" class="plan-nav-btn" data-days="90">90 j</button><button type="button" class="plan-nav-btn" data-days="365">12 mois</button><button type="button" class="plan-nav-btn" data-days="0">Tout</button></div>
      ${sel('st-antenna', 'Antenne', opts.antennes, state.filters.antennaId, 'Toutes')}
      ${sel('st-partner', 'Partenaire', opts.partenaires, state.filters.partnerId, 'Tous')}
      ${sel('st-transporter', 'Transporteur', opts.transporteurs, state.filters.transporterId, 'Tous')}
      ${sel('st-type', 'Type de transport', opts.typesTransport.map((k) => ({ id: k, name: TYPE_LABELS[k] })), state.filters.transportType, 'Tous')}
    </div>
    <div class="st-alerts" id="st-alerts"></div>
    <div class="tabs-underline sup-tabs" id="st-tabs">${TABS.map(([k, l, i]) => `<button type="button" class="tab-count-btn ${k === state.tab ? 'active' : ''}" data-tab="${k}">${icon(i, { size: 15 })} ${l}</button>`).join('')}</div>
    <div id="st-body"></div>`;

  let stats = null;
  const draw = () => {
    destroyCharts();
    stats = computeStatistics(state.filters);
    try { sessionStorage.setItem('dut_stats_filters', JSON.stringify(state.filters)); } catch { /* indisponible */ }
    container.querySelector('#st-alerts').innerHTML = stats.alertes.length ? stats.alertes.map((a) => `<span class="st-alert is-${a.niveau}">${icon(a.niveau === 'error' ? 'alertTriangle' : a.niveau === 'warning' ? 'alertCircle' : 'info', { size: 14 })} ${esc(a.texte)}</span>`).join('') : `<span class="st-alert is-ok">${icon('checkCircle', { size: 14 })} Aucune alerte sur la période</span>`;
    container.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.tab));
    const body = container.querySelector('#st-body');
    body.innerHTML = `<p class="st-period">Période : <strong>${formatDate(stats.period.from)}</strong> → <strong>${formatDate(stats.period.to)}</strong> · ${n(stats.documentaire.entonnoir.crees)} DUT dans le périmètre</p>${SECTIONS[state.tab].html(stats)}`;
    SECTIONS[state.tab].charts(stats);
  };
  const bind = (id, key) => container.querySelector(id).addEventListener('change', (e) => { state.filters[key] = e.target.value; e.target.closest('.plan-pill')?.classList.toggle('is-set', !!e.target.value); draw(); });
  bind('#st-from', 'from'); bind('#st-to', 'to'); bind('#st-antenna', 'antennaId'); bind('#st-partner', 'partnerId'); bind('#st-transporter', 'transporterId'); bind('#st-type', 'transportType');
  container.querySelectorAll('[data-days]').forEach((b) => b.addEventListener('click', () => { const d = Number(b.dataset.days); const to = new Date(); const from = new Date(Date.now() - d * 86400000); state.filters.to = d ? to.toISOString().slice(0, 10) : ''; state.filters.from = d ? from.toISOString().slice(0, 10) : ''; container.querySelector('#st-from').value = state.filters.from; container.querySelector('#st-to').value = state.filters.to; container.querySelectorAll('#st-from,#st-to').forEach((i) => i.closest('.plan-pill').classList.toggle('is-set', !!i.value)); draw(); }));
  container.querySelector('#st-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (!b) return; state.tab = b.dataset.tab; draw(); });
  container.querySelector('#st-export').addEventListener('click', () => { const rows = SECTIONS[state.tab].csv(stats); const blob = new Blob([`﻿${toCsv(rows)}`], { type: 'text/csv;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `statistiques-${state.tab}-${stats.period.from}-${stats.period.to}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); });
  draw();
}

const SECTIONS = {
  documentaire: {
    html: (s) => { const d = s.documentaire; return `
      <div class="kpi-grid sup-kpis">${kpi('DUT créés', n(d.entonnoir.crees))}${kpi('Soumis', n(d.entonnoir.soumis), `${pc(d.entonnoir.tauxSoumission)} des créés`)}${kpi('Validés', n(d.entonnoir.valides), `${pc(d.entonnoir.tauxValidation)} des soumis`, 'green')}${kpi('Rejetés', n(d.entonnoir.rejetes), `resoumission réussie ${pc(d.resoumissionReussie)}`, 'rose')}${kpi('Premier passage', pc(d.entonnoir.premierPassage), 'validés sans rejet', 'teal')}${kpi('Brouillons abandonnés', n(d.brouillonsAbandonnes), '> 30 j sans modification', 'amber')}</div>
      <div class="kpi-grid sup-kpis">${kpi('Création → soumission', h(d.delais.creationSoumissionH.mediane), `moyenne ${h(d.delais.creationSoumissionH.moyenne)} · ${pc(d.delais.creationSoumissionH.sous10min)} en < 10 min`)}${kpi('Soumission → validation', h(d.delais.soumissionValidationH.mediane), `max ${h(d.delais.soumissionValidationH.max)} · ${pc(d.delais.soumissionValidationH.sous24h)} sous 24 h · ${pc(d.delais.soumissionValidationH.sous48h)} sous 48 h`)}${kpi('Expirent sous 7 jours', n(d.expirantSous7j), '', 'amber')}${kpi('Expirés jamais contrôlés', n(d.expiresJamaisControles), '', 'rose')}${kpi('Marchandises dangereuses', n(d.dangereuses), `${n(d.temperatureControlee)} sous température`)}</div>
      <div class="dash-grid charts-grid">${chart('st-c1', 'DUT par mois', 'Créés, validés, rejetés')}${chart('st-c2', 'Répartition par statut')}${chart('st-c3', 'Motifs de rejet')}${chart('st-c4', 'Par type de transport')}${chart('st-c5', 'Par compte')}${chart('st-c6', 'Heure de création', 'Pics de saisie')}</div>
      <div class="sup-grid st-two">${card('Par antenne', pairs(d.parAntenne))}${card('Par partenaire', pairs(d.parPartenaire))}</div>`; },
    charts: (s) => { const d = s.documentaire; charts.push(
      barChart('st-c1', d.parMois.map((m) => m.mois), [], { highlight: false, stacked: [{ label: 'Créés', values: d.parMois.map((m) => m.crees), color: '#0E56A4' }, { label: 'Validés', values: d.parMois.map((m) => m.valides), color: '#0C8B41' }, { label: 'Rejetés', values: d.parMois.map((m) => m.rejetes), color: '#E11D2E' }] }),
      doughnutChart('st-c2', Object.keys(d.parStatut).map((k) => DUT_STATUS_LABELS[k] || k), Object.values(d.parStatut)),
      barChart('st-c3', d.motifsRejet.map((x) => x.label), d.motifsRejet.map((x) => x.value), { horizontal: true }),
      doughnutChart('st-c4', Object.keys(d.parTypeTransport).map((k) => TYPE_LABELS[k]), Object.values(d.parTypeTransport)),
      doughnutChart('st-c5', Object.keys(d.parCompte).map((k) => COMPTE_LABELS[k]), Object.values(d.parCompte)),
      barChart('st-c6', d.parHeureCreation.map((_, i) => `${i} h`), d.parHeureCreation, { highlight: true })); },
    csv: (s) => s.documentaire.parMois,
  },
  logistique: {
    html: (s) => { const l = s.logistique; return `
      <div class="kpi-grid sup-kpis">${kpi('Tonnage déclaré', `${n(l.tonnageTotal)} t`, `${n(l.tonnageMoyen, 1)} t par DUT`)}${kpi('Taux de remplissage', l.remplissage.moyen != null ? pc(l.remplissage.moyen * 100) : '—', `${n(l.remplissage.sousCharges)} sous-chargés · ${n(l.remplissage.surcharges)} surchargés`, l.remplissage.surcharges ? 'rose' : 'green')}${kpi('Temps de transit prévu', h(l.transit.medianH), `moyenne ${h(l.transit.moyenH)}`)}${kpi('Départs sous 7 jours', n(l.semaineAVenir), 'charge à venir', 'amber')}${kpi('DUT par véhicule', n(l.rotation.dutParVehicule, 1), `${n(l.rotation.vehiculesDormants90j)} véhicules dormants (90 j)`)}${kpi('Avec suivi déclaré', n(l.suivi.avecSuivi), `${n(l.suivi.enRouteSansNouvelles)} en route sans nouvelles · ${n(l.suivi.livraisonsRetard)} livraisons en retard`, l.suivi.enRouteSansNouvelles ? 'rose' : 'teal')}</div>
      <div class="kpi-grid sup-kpis">${kpi('Incidents', n(l.incidents.total), `${n(l.incidents.urgents)} urgents · ${pc(l.incidents.tauxResolu)} résolus · délai ${h(l.incidents.delaiResolutionH)}`, l.incidents.urgents ? 'rose' : 'navy')}${kpi('Sinistres pour 1 000 DUT', n(l.incidents.pour1000Dut, 1), 'dommages et écarts de quantité', 'amber')}</div>
      <div class="dash-grid charts-grid">${chart('st-l1', 'Tonnage par marchandise', '', `${n(l.tonnageTotal)} t`)}${chart('st-l2', 'Villes de départ')}${chart('st-l3', 'Villes d’arrivée')}${chart('st-l4', 'Départs par jour de semaine')}${chart('st-l5', 'Étapes du suivi')}${chart('st-l6', 'Incidents par type')}</div>
      ${card('Emballages', pairs(l.parEmballage))}`; },
    charts: (s) => { const l = s.logistique, d = s.documentaire; charts.push(
      doughnutChart('st-l1', l.parMarchandise.map((x) => x.label), l.parMarchandise.map((x) => x.value), { unit: 't' }),
      barChart('st-l2', l.villesDepart.map((x) => x.label), l.villesDepart.map((x) => x.value), { horizontal: true }),
      barChart('st-l3', l.villesArrivee.map((x) => x.label), l.villesArrivee.map((x) => x.value), { horizontal: true }),
      barChart('st-l4', d.parJourSemaine.map((x) => x.label), d.parJourSemaine.map((x) => x.value)),
      barChart('st-l5', Object.keys(l.suivi.parEtape).map((k) => STAGE_LABELS[k]), Object.values(l.suivi.parEtape)),
      barChart('st-l6', l.incidents.parType.map((x) => x.label), l.incidents.parType.map((x) => x.value), { horizontal: true })); },
    csv: (s) => s.logistique.parMarchandise,
  },
  corridors: {
    html: (s) => { const c = s.corridors; return `
      <div class="kpi-grid sup-kpis">${kpi('Corridors actifs', n(c.liste.length), `${n(c.nouveaux30j)} nouveaux sur 30 j`)}${kpi('Tonnes-kilomètres', n(c.tkmTotal), 'tonnage × distance à vol d’oiseau')}${kpi('Corridors sans contrôle', n(c.aveugles), 'aucun scan sur la période', c.aveugles ? 'rose' : 'green')}${kpi('Part internationale', pc(c.partInternationale), 'DUT vers ou depuis l’étranger')}</div>
      <div class="dash-grid charts-grid st-charts-2">${chart('st-k1', 'DUT par corridor')}${chart('st-k2', 'Tonnes-kilomètres par corridor', '', `${n(c.tkmTotal)} t·km`)}</div>
      ${card('Fiche des corridors', table([['Corridor', (r) => `<strong>${esc(r.corridor)}</strong>${r.international ? ' <span class="badge badge-accent">Intl</span>' : ''}`], ['DUT', (r) => n(r.duts), 'num'], ['Tonnage', (r) => `${n(r.tonnage)} t`, 'num'], ['Distance', (r) => `${n(r.distanceKm)} km`, 'num'], ['t·km', (r) => n(r.tkm), 'num'], ['Transit prévu', (r) => h(r.transitH), 'num'], ['Taux de contrôle', (r) => pc(r.tauxControle), 'num'], ['Refus', (r) => (r.refus ? `<span class="sup-neg">${r.refus}</span>` : '0'), 'num'], ['Incidents', (r) => n(r.incidents), 'num']], c.liste))}`; },
    charts: (s) => { const c = s.corridors; charts.push(barChart('st-k1', c.liste.map((x) => x.corridor), c.liste.map((x) => x.duts), { horizontal: true, top: 8 }), barChart('st-k2', c.liste.map((x) => x.corridor), c.liste.map((x) => x.tkm), { horizontal: true, top: 8 })); },
    csv: (s) => s.corridors.liste,
  },
  controle: {
    html: (s) => { const c = s.controle; return `
      <div class="kpi-grid sup-kpis">${kpi('Scans', n(c.total), `${pc(c.horsLigne.part)} hors ligne`)}${kpi('Taux de refus', pc(c.tauxRefus), `${pc(c.tauxRefus7j)} sur 7 j`, c.tauxRefus > 10 ? 'rose' : 'green')}${kpi('Faux documents', n(c.fraude.faux), 'signature non reconnue', 'rose')}${kpi('DUT pièges scannés', n(c.fraude.pieges), '', c.fraude.pieges ? 'rose' : 'navy')}${kpi('Voyages impossibles', n(c.fraude.voyagesImpossibles), '', 'amber')}${kpi('Non opposables', n(c.horsLigne.nonOpposables), 'liste trop ancienne', 'amber')}</div>
      <div class="kpi-grid sup-kpis">${kpi('Couverture', pc(c.couverture.tauxValidesControles), `DUT valides contrôlés ≥ 1 fois · ${n(c.couverture.jamaisControles)} jamais contrôlés`, 'teal')}${kpi('Contrôles par DUT', n(c.couverture.controlesParDut, 2), `${n(c.couverture.postesInactifs)} postes sans activité`)}${kpi('Dérogations', n(c.derogations.total), `${pc(c.derogations.ratioRefus)} des refus`, c.derogations.ratioRefus > 20 ? 'rose' : 'violet')}${kpi('Récidive 90 j', n(c.recidive.partenaires.length + c.recidive.vehicules.length), 'partenaires et véhicules à ≥ 2 refus', 'rose')}</div>
      <div class="dash-grid charts-grid">${chart('st-s1', 'Scans par jour', '30 derniers jours')}${chart('st-s2', 'Verdicts')}${chart('st-s3', 'Motifs de refus')}${chart('st-s4', 'Scans par poste')}${chart('st-s5', 'Scans par agent')}${chart('st-s6', 'Scans par heure', 'Pics d’activité')}</div>
      <div class="sup-grid st-two">${card('Dérogations par motif', pairs(c.derogations.parMotif))}${card('Récidive (≥ 2 refus sur 90 j)', pairs([...c.recidive.partenaires, ...c.recidive.vehicules], (v) => `${v} refus`))}</div>
      ${card('Carte des contrôles', `<div id="st-map" class="st-map"></div><p class="text-muted" style="font-size:12px;margin-top:8px">${n(c.points.length)} contrôle(s) géolocalisé(s) · vert = autorisé, orange = partiel, rouge = refus</p>`)}`; },
    charts: (s) => { const c = s.controle; charts.push(
      lineChart('st-s1', c.parJour.map((x) => x.label.slice(5)), c.parJour.map((x) => x.value)),
      doughnutChart('st-s2', ['Vert', 'Orange', 'Rouge', 'Non opposable'], [c.parVerdict.VERT, c.parVerdict.ORANGE, c.parVerdict.ROUGE, c.parVerdict.INCONNU]),
      barChart('st-s3', c.motifsRefus.map((x) => x.label), c.motifsRefus.map((x) => x.value), { horizontal: true }),
      barChart('st-s4', c.parPoste.map((x) => x.label), c.parPoste.map((x) => x.value), { horizontal: true }),
      barChart('st-s5', c.parAgent.map((x) => x.label), c.parAgent.map((x) => x.value), { horizontal: true }),
      barChart('st-s6', c.parHeure.map((_, i) => `${i} h`), c.parHeure));
      const el = document.getElementById('st-map');
      if (el && window.L) {
        const map = window.L.map(el, { scrollWheelZoom: false, attributionControl: false }).setView([7.54, -5.55], 6.5);
        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 12 }).addTo(map);
        const color = { VERT: '#0C8B41', ORANGE: '#F59E0B', ROUGE: '#E11D2E', INCONNU: '#8A93A0' };
        c.points.forEach((p) => window.L.circleMarker([p.lat, p.lng], { radius: 9, color: '#fff', weight: 1.5, fillColor: color[p.verdict] || '#8A93A0', fillOpacity: .55 }).addTo(map));
        charts.push({ destroy: () => map.remove() });
      } },
    csv: (s) => s.controle.parJour,
  },
  economie: {
    html: (s) => { const e = s.economie; return `
      <div class="kpi-grid sup-kpis">${kpi('Recette théorique', fcfa(e.recetteTheorique), 'numéros consommés × tarif unitaire', 'green')}${kpi('Montants facturés (DUT)', fcfa(e.facture.total), `dont TVA ${fcfa(e.facture.tva)} · timbres ${fcfa(e.facture.timbre)}`)}${kpi('Montant moyen par DUT', fcfa(e.facture.moyenParDut), `${fcfa(e.facture.parTonne)} par tonne · ${n(e.facture.parTkm, 2)} F par t·km`)}${kpi('Taux d’utilisation des plages', pc(e.plages.tauxUtilisation), `${n(e.plages.numerosRestants)} numéros restants`, 'teal')}${kpi('Plages', `${n(e.plages.validees)} / ${n(e.plages.demandees)}`, `${n(e.plages.enAttente)} en attente · ${n(e.plages.epuisees)} épuisées · instruction ${h(e.plages.delaiInstructionH)}`)}${kpi('Consommation anormale', n(e.anomalies.length), 'écart ≥ 50 % à la moyenne', e.anomalies.length ? 'rose' : 'navy')}</div>
      <div class="dash-grid charts-grid st-charts-2">${chart('st-e1', 'Recette théorique par mois', '', fcfa(e.recetteTheorique))}${chart('st-e2', 'Recette par partenaire')}</div>
      <div class="sup-grid st-two">${card('Projection d’épuisement des plages', table([['Partenaire', (r) => `<strong>${esc(r.label)}</strong>`], ['Restants', (r) => n(r.restants), 'num'], ['Rythme / jour', (r) => n(r.rythmeJour, 2), 'num'], ['Épuisement', (r) => (r.joursAvantEpuisement == null ? '—' : `<span class="${r.joursAvantEpuisement < 15 ? 'sup-neg' : ''}">${n(r.joursAvantEpuisement)} j</span>`), 'num']], e.projection))}${card('Consommations anormales', table([['Partenaire', (r) => `<strong>${esc(r.label)}</strong>`], ['30 jours', (r) => n(r.consommation30j), 'num'], ['Moyenne mensuelle', (r) => n(r.moyenneMensuelle, 1), 'num'], ['Écart', (r) => `<span class="${r.ecart > 0 ? 'sup-neg' : ''}">${r.ecart > 0 ? '+' : ''}${pc(r.ecart)}</span>`, 'num']], e.anomalies, 'Aucune consommation anormale'))}</div>`; },
    charts: (s) => { const e = s.economie; charts.push(barChart('st-e1', e.recetteParMois.map((m) => m.mois), e.recetteParMois.map((m) => m.value), { unit: 'F', highlight: false }), doughnutChart('st-e2', e.recetteParPartenaire.map((x) => x.label), e.recetteParPartenaire.map((x) => x.value), { unit: 'F' })); },
    csv: (s) => s.economie.projection,
  },
  acteurs: {
    html: (s) => { const a = s.acteurs; return `
      <div class="kpi-grid sup-kpis">${kpi('Partenaires actifs', `${n(a.partenaires.actifs)} / ${n(a.partenaires.total)}`, `${n(a.partenaires.inactifs)} inactifs · ${n(a.partenaires.nouveaux)} nouveaux`)}${kpi('Concentration', pc(a.partenaires.concentrationTop3), 'part des 3 premiers partenaires', 'amber')}${kpi('Transporteurs actifs', `${n(a.transporteurs.actifs)} / ${n(a.transporteurs.total)}`)}${kpi('Véhicules actifs', `${n(a.vehicules.actifs)} / ${n(a.vehicules.total)}`, `${n(a.vehicules.dormants90j)} dormants · ${n(a.vehicules.controlesRouges)} contrôlés en rouge`, a.vehicules.controlesRouges ? 'rose' : 'teal')}${kpi('Chauffeurs', n(a.chauffeurs.total), `${n(a.chauffeurs.permisManquants)} DUT sans n° de permis`)}</div>
      <div class="dash-grid charts-grid">${chart('st-a1', 'DUT par partenaire')}${chart('st-a2', 'Taux de rejet par partenaire', 'en %')}${chart('st-a3', 'DUT par transporteur')}${chart('st-a4', 'DUT par antenne')}${chart('st-a5', 'Chauffeurs les plus actifs')}${chart('st-a6', 'Expéditeurs les plus fréquents')}</div>
      ${card('Destinataires les plus fréquents', pairs(a.tiers.destinataires))}`; },
    charts: (s) => { const a = s.acteurs; charts.push(
      barChart('st-a1', s.documentaire.parPartenaire.map((x) => x.label), s.documentaire.parPartenaire.map((x) => x.value), { horizontal: true }),
      barChart('st-a2', a.partenaires.tauxRejet.map((x) => x.label), a.partenaires.tauxRejet.map((x) => x.value), { horizontal: true, unit: '%' }),
      barChart('st-a3', a.transporteurs.top.map((x) => x.label), a.transporteurs.top.map((x) => x.value), { horizontal: true }),
      barChart('st-a4', a.antennes.map((x) => x.label), a.antennes.map((x) => x.value), { horizontal: true }),
      barChart('st-a5', a.chauffeurs.top.map((x) => x.label), a.chauffeurs.top.map((x) => x.value), { horizontal: true }),
      barChart('st-a6', a.tiers.expediteurs.map((x) => x.label), a.tiers.expediteurs.map((x) => x.value), { horizontal: true })); },
    csv: (s) => s.acteurs.partenaires.tauxRejet,
  },
  usage: {
    html: (s) => { const u = s.usage; return `
      <div class="kpi-grid sup-kpis">${kpi('Utilisateurs', n(u.utilisateurs.total), `${n(u.utilisateurs.actifs7j)} actifs sur 7 j · ${n(u.utilisateurs.actifs30j)} sur 30 j`)}${kpi('Jamais connectés', n(u.utilisateurs.jamaisConnectes), '', u.utilisateurs.jamaisConnectes ? 'amber' : 'green')}${kpi('Impressions', n(u.impressions.total), `${n(u.impressions.reimpressions)} réimpressions`)}${kpi('DUT réimprimés > 3 fois', n(u.impressions.dutPlus3), 'signal à vérifier', u.impressions.dutPlus3 ? 'rose' : 'navy')}</div>
      <div class="dash-grid charts-grid">${chart('st-u1', 'Connexions par jour')}${chart('st-u2', 'Connexions par rôle')}${chart('st-u3', 'Actions par utilisateur')}${chart('st-u4', 'Actions par type')}${chart('st-u5', 'Activité par heure')}${chart('st-u6', 'Motifs de réimpression')}</div>
      ${card('Actions sensibles récentes', table([['Date', (e) => formatDateTime(e.date)], ['Action', (e) => `<strong>${esc(e.label || e.action)}</strong>`], ['DUT', (e) => esc(e.dutNumber || '—')], ['Par', (e) => `${esc(e.userLabel || '—')} <small class="text-muted">${esc(e.role || '')}</small>`], ['Note', (e) => esc(e.note || '')]], u.sensibles, 'Aucune action sensible sur la période'))}`; },
    charts: (s) => { const u = s.usage; charts.push(
      lineChart('st-u1', u.connexionsParJour.map((x) => x.label.slice(5)), u.connexionsParJour.map((x) => x.value)),
      doughnutChart('st-u2', u.connexionsParRole.map((x) => x.label), u.connexionsParRole.map((x) => x.value)),
      barChart('st-u3', u.actionsParUtilisateur.map((x) => x.label), u.actionsParUtilisateur.map((x) => x.value), { horizontal: true }),
      barChart('st-u4', u.actionsParType.map((x) => x.label), u.actionsParType.map((x) => x.value), { horizontal: true }),
      barChart('st-u5', u.parHeure.map((_, i) => `${i} h`), u.parHeure),
      barChart('st-u6', u.impressions.motifs.map((x) => x.label), u.impressions.motifs.map((x) => x.value), { horizontal: true })); },
    csv: (s) => s.usage.sensibles.map((e) => ({ date: e.date, action: e.label || e.action, dut: e.dutNumber || '', par: e.userLabel || '', note: e.note || '' })),
  },
  qualite: {
    html: (s) => { const q = s.qualite; return `
      <div class="kpi-grid sup-kpis">${kpi('Score de complétude', `${n(q.score)} / 100`, 'moyenne des contrôles ci-dessous', q.score >= 90 ? 'green' : q.score >= 70 ? 'amber' : 'rose')}${kpi('DUT avec pièces jointes', pc(q.avecPieces))}${kpi('DUT avec réserves', n(q.reserves), 'prise en charge ou livraison', 'amber')}</div>
      ${card('Contrôles de qualité des données', table([['Contrôle', (r) => `<strong>${esc(r.label)}</strong>`], ['Cas', (r) => n(r.value), 'num'], ['Sur', (r) => n(r.total), 'num'], ['Taux', (r) => `<span class="${r.taux > 10 ? 'sup-neg' : ''}">${pc(r.taux)}</span>`, 'num'], ['', (r) => `<div class="st-bar"><i style="width:${Math.min(100, r.taux)}%"></i></div>`]], q.controles))}`; },
    charts: () => {},
    csv: (s) => s.qualite.controles,
  },
};
