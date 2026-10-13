import { icon } from '../core/icons.js';
import { escapeHtml, formatDate, formatNumber } from '../core/utils.js';
import { navigate } from '../core/router.js';
import { getCurrentUser } from '../core/auth.js';
import { DUT_STATUS_LABELS } from '../core/constants.js';
import * as dashboardService from '../services/dashboard.service.js';
import { animateCountUps, staggerIn } from '../core/motion.js?v=oic-blue';
// Intégration : synthèse de l'antenne (agents, objectifs, stock, incidents, équipements, remontées).
import { antennaSynthesis } from '../services/synthesis.service.js';
import { kpi as tile, kpis as tiles } from './direction-ui.js';
import { sectionHeading, opsCard, linkList, barList, summaryLines, badge, footnote, num, pct, hours, fcfa } from './synthesis-ui.js';

export function render(container) {
  const user = getCurrentUser();
  const stats = dashboardService.antennaStats(user.antennaId);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <span class="overline">Antenne · ${escapeHtml(user.antennaName)}</span>
        <h1>Tableau de bord</h1>
        <div class="subtitle">${escapeHtml(user.name)}</div>
      </div>
    </div>
    <div class="page-header-rule"></div>

    <div class="kpi-grid">
      ${kpi('DUT à valider', stats.aValider, 'clock', 'amber')}
      ${kpi('Validés aujourd’hui', stats.valideesAujourdhui, 'checkCircle', 'green')}
      ${kpi('Rejetés', stats.rejetes, 'xCircle', 'rose')}
      ${kpi('Partenaires actifs', stats.partenairesActifs, 'users', 'blue')}
      ${kpi('Opérations en attente', stats.operationsEnAttente, 'layers', 'violet')}
    </div>

    <div class="card" style="margin-top:var(--s4);padding:0">
      <div class="card-header" style="padding:var(--s4) var(--s4) 0">
        <div>
          <h3>DUT en attente de validation</h3>
          <div class="subtitle">Cliquez sur une ligne pour ouvrir le détail et valider ou rejeter</div>
        </div>
      </div>
      <div class="table-wrap"><table class="data-table" id="pending-table"></table></div>
    </div>
  `;

  animateCountUps(container);
  staggerIn(container.querySelectorAll('.kpi-card'));

  const table = container.querySelector('#pending-table');
  if (stats.pending.length === 0) {
    table.innerHTML = `<tr><td class="table-empty">${icon('inbox', { size: 32 })}<div>Aucun DUT en attente</div></td></tr>`;
  } else {
    table.innerHTML = `
      <thead><tr><th scope="col">Soumis le</th><th scope="col">Partenaire</th><th scope="col">Transporteur</th><th scope="col">Véhicule</th><th scope="col">État</th><th></th></tr></thead>
      <tbody>
        ${stats.pending.map((d) => `
          <tr data-id="${d.id}">
            <td>${formatDate(d.submittedAt)}</td>
            <td>${escapeHtml(d.partnerName)}</td>
            <td>${escapeHtml(d.general.transporterName || '—')}</td>
            <td>${escapeHtml(d.general.immatriculation || '—')}</td>
            <td><span class="badge status-${d.status}"><span class="badge-dot"></span>${DUT_STATUS_LABELS[d.status]}</span></td>
            <td class="text-right"><span class="link-action">Examiner</span></td>
          </tr>
        `).join('')}
      </tbody>
    `;
    table.querySelector('tbody').addEventListener('click', (e) => {
      const tr = e.target.closest('tr');
      if (tr) navigate(`/antenna/dut/${tr.dataset.id}`);
    });
  }

  // Intégration : la synthèse est montée après les décorations du tableau de bord (courbes des KPI de DUT),
  // qui ne concernent que les indicateurs de documents du haut de page.
  const section = document.createElement('section');
  section.className = 'ops-section syn-section';
  section.setAttribute('aria-label', 'Synthèse de l’antenne');
  container.append(section);
  queueMicrotask(() => renderSynthesis(section, '30j'));
}

function renderSynthesis(section, periodKind) {
  let s;
  try { s = antennaSynthesis({ periodKind }); } catch (err) { section.innerHTML = `<p class="priority-empty">${icon('info')} ${escapeHtml(err.message)}</p>`; return; }
  const t = s.totals;
  const agentsTable = s.agents.length ? `<div class="table-wrap"><table class="data-table sup-table"><thead><tr><th scope="col">Agent</th><th scope="col" class="text-right">Saisis au guichet</th><th scope="col" class="text-right">Validés</th><th scope="col" class="text-right">Rejetés</th><th scope="col" class="text-right">Délai médian</th><th scope="col" class="text-right">Sous 24 h</th></tr></thead><tbody>
    ${s.agents.map((a) => `<tr><td><strong>${escapeHtml(a.name)}</strong></td><td class="text-right">${num(a.saisis)}</td><td class="text-right">${num(a.valides)}</td><td class="text-right">${num(a.rejetes)}</td><td class="text-right">${hours(a.delaiMedianH)}</td><td class="text-right">${pct(a.sous24h)}</td></tr>`).join('')}
    </tbody></table></div>` : `<p class="priority-empty">${icon('info')} Aucun agent actif rattaché à l’antenne.</p>`;
  const o = s.objectifs;
  const objectives = barList(o.lignes.map((l) => ({ label: `${l.label} · ${l.beneficiaire}`, display: `${num(l.actual, 1)} / ${num(l.target, 1)}${l.unit ? ` ${l.unit}` : ''} · ${l.taux == null ? 'sans résultat' : pct(l.taux)}`, ratio: (l.taux || 0) / 100 })), 'Aucun objectif en vigueur pour l’antenne.');
  const st = s.stock;
  section.innerHTML = `
    ${sectionHeading('Synthèse de l’antenne', `${s.antenna.name} · ${s.period.label} · agents, objectifs, stock, incidents, équipements et remontées`, s.period.kind)}
    ${tiles([
      tile('DUT validés par l’antenne', num(t.valides), `${num(t.agents)} agent(s) · ${num(t.saisis)} saisi(s) au guichet`, 'green'),
      tile('Délai de validation', hours(t.delaiMedianH), 'médiane, de la soumission à la validation', 'amber'),
      tile('Atteinte des objectifs', pct(o.taux), `${num(o.atteints)} atteint(s) sur ${num(o.objectifs)}`, 'blue'),
      tile('Numéros disponibles', st ? num(st.disponible) : '—', st ? `${num(st.enAttente)} en attente de validation` : '', 'violet'),
      tile('Incidents ouverts', num(s.incidents.ouverts), `${num(s.incidents.enRetard)} en retard`, s.incidents.enRetard ? 'rose' : 'navy'),
      tile('Équipements en panne', num(s.equipements.enPanne), `${num(s.remontees.enCours)} remontée(s) en cours`, s.equipements.enPanne ? 'amber' : 'teal'),
    ])}
    <div class="ops-grid">
      ${opsCard('Performance des agents', agentsTable, { subtitle: 'DUT saisis au guichet, validés et rejetés sur la période', aside: badge(`${num(t.rejetes)} rejet(s)`, t.rejetes ? 'warning' : 'neutral') })}
      ${opsCard('Objectifs de l’antenne', `${objectives}${footnote(`${num(o.actionsOuvertes)} action(s) corrective(s) en cours, dont ${num(o.actionsEnRetard)} en retard · <a href="#/antenna/actions">Voir les actions</a>`)}`, { aside: `<a href="#/antenna/objectifs">Saisir un résultat</a>` })}
      ${opsCard('Incidents ouverts', linkList(s.incidents.liste.map((i) => ({ href: `/incidents/${i.id}`, icon: i.overdue ? 'alertTriangle' : 'alertCircle', title: `${i.reference} · ${i.title}`, badge: i.overdue ? badge('Délai dépassé', 'error') : badge(i.statusLabel, 'neutral'), detail: `Gravité ${i.severity.toLowerCase()} · ${i.antennaName}` })), 'Aucun incident ouvert pour l’antenne.'), { aside: `<a href="#/incidents">Tous les incidents</a>` })}
      ${opsCard('Stock de numéros', st ? `${summaryLines([['Disponibles', num(st.disponible)], ['Ventes à valider par l’OIC', num(st.enAttente)], ['Vendus aux transporteurs', num(st.vendus)], ['Ventes de la période (TTC)', fcfa(st.ventes.ttc)], ['Encaissements à valider', num(st.ventes.aValider)]])}${footnote(st.firstAvailable ? `Prochain numéro disponible : DUT-CI-${st.year}-${String(st.firstAvailable).padStart(6, '0')}` : 'Aucun numéro disponible : demandez un approvisionnement à l’OIC.')}` : `<p class="priority-empty">${icon('info')} Stock non consultable.</p>`, { aside: `<a href="#/antenna/stock">Vendre une plage</a>` })}
      ${opsCard('Équipements en panne', linkList(s.equipements.liste.map((e) => ({ href: `/equipements/${e.id}`, icon: 'wrench', title: `${e.reference} · ${e.label}`, badge: badge(e.statusLabel, 'warning'), detail: e.type })), 'Aucun équipement en panne.'), { aside: `<a href="#/equipements">Inventaire</a>` })}
      ${opsCard('Remontées en cours', linkList(s.remontees.liste.map((r) => ({ href: `/remontees/${r.id}`, icon: 'megaphone', title: `${r.reference} · ${r.title}`, badge: badge(r.statusLabel, 'neutral'), detail: 'Échange avec le pilotage' })), 'Aucune remontée en cours.'), { aside: `<a href="#/remontees">Toutes les remontées</a>` })}
    </div>`;
  section.querySelector('.syn-period').addEventListener('change', (e) => renderSynthesis(section, e.target.value));
}

function kpi(label, value, iconName, tone) {
  return `
    <div class="kpi-card">
      <div class="kpi-label">${label}<span class="kpi-icon" style="background:var(--sq-${tone}-bg);color:var(--sq-${tone}-fg)">${icon(iconName, { size: 13 })}</span></div>
      <div class="kpi-value" style="color:var(--sq-${tone}-fg)" data-countup="${value}">${formatNumber(value)}</div>
    </div>
  `;
}
