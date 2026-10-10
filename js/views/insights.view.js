import { settings } from '../services/settings.service.js';
import { lineChartSvg } from '../core/charts.js';
import { computeInsights, visibleDuts, documentUrl, insightsCsv } from '../services/insights.service.js';
import { getCurrentUser } from '../core/auth.js';
import { escapeHtml as e, formatNumber as n } from '../core/utils.js';
import { icon } from '../core/icons.js';
import { DUT_STATUS_LABELS } from '../core/constants.js';

export function mountInsights(container) {
  const user = getCurrentUser();
  const section = document.createElement('section');
  section.className = 'ops-section';
  section.setAttribute('aria-label', 'Pilotage opérationnel');
  const anchor = container.querySelector('.dash-grid, .card');
  if (anchor) anchor.before(section); else container.append(section);
  let days = 90;
  function render() {
    const s = computeInsights(visibleDuts(user), days);
    const total = s.total || 1;
    const a=s.validated/total*100,b=a+s.pending/total*100,c=b+s.blocked/total*100;
    section.innerHTML = `
      <div class="ops-heading"><div><h2>Pilotage opérationnel</h2><p>Données de démonstration · indicateurs calculés sur vos dossiers</p></div>
        <div class="ops-tools"><select aria-label="Période des indicateurs"><option value="30" ${days===30?'selected':''}>30 derniers jours</option><option value="90" ${days===90?'selected':''}>90 derniers jours</option><option value="0" ${days===0?'selected':''}>Tout l’historique</option></select><a class="btn btn-secondary btn-sm" download="DUT-synthese-${new Date().toISOString().slice(0,10)}.csv" href="data:text/csv;charset=utf-8,${encodeURIComponent(insightsCsv(s,days))}">${icon('download', {size:15})} Exporter</a></div></div>
      <div class="ops-grid">
        <article class="card"><div class="card-header"><h3>Évolution des documents</h3><span class="badge badge-accent">${n(s.total)} dossiers</span></div>
          <div class="ops-metric"><strong>${n(s.tonnes,1)} <small>t</small></strong><span>sur les DUT actuellement validés</span></div>
          <div class="line-chart-wrap">${lineChartSvg(s.months,{label:'DUT créés par mois'})}</div>
          <div class="volume-labels">${s.months.map(m=>`<span>${e(m.label)}</span>`).join('')}</div><p class="ops-footnote">Créations sur les six derniers mois, dans la période sélectionnée. Les brouillons sont inclus.</p>
        </article>
        <article class="card"><div class="card-header"><h3>Cycle de traitement</h3>${icon('layers')}</div>
          <div class="flow-summary"><div class="flow-donut" style="background:conic-gradient(var(--navy-2) 0% ${a}%,var(--navy-3) ${a}% ${b}%,var(--error) ${b}% ${c}%,var(--surface-sunken) ${c}% 100%)"><div><strong>${s.validationRate}%</strong><small>validés</small></div></div>
          <div class="flow-legend"><div><i class="legend-dot"></i>Validés<b>${s.validated}</b></div><div><i class="legend-dot" style="background:#75a9dc"></i>À valider<b>${s.pending}</b></div><div><i class="legend-dot tone-error"></i>Rejetés / suspendus / retirés<b>${s.blocked}</b></div><div><i class="legend-dot tone-neutral"></i>Brouillons<b>${s.drafts}</b></div></div></div>
          <div class="ops-summary-line"><span>Délai moyen de validation</span><strong>${s.delayHours===null?'—':`${n(s.delayHours,1)} h`}</strong></div><p class="ops-footnote">De la soumission à la validation, pour les DUT actuellement validés avec dates disponibles.</p>
        </article>
        <article class="card"><div class="card-header"><div><h3>${user.role === 'TRANSPORTEUR' ? 'Points de vigilance' : 'À traiter en priorité'}</h3><div class="subtitle">Tous les dossiers actifs · hors filtre de période</div></div><span class="badge ${s.overdue?'badge-warning':'badge-neutral'}">${s.overdue} en attente ≥ ${settings().overdueDays} j</span></div>
          ${s.priority.slice(0,4).map(d=>`<a class="priority-link" href="${documentUrl(user,d)}"><span class="priority-icon">${icon(d.status==='REJETE'?'xCircle':d.status==='SUSPENDU'?'shield':d.status==='EN_EDITION'?'edit':'clock', {size:18})}</span><span><strong>${e(d.general?.transporterName || 'Dossier à compléter')} <span class="badge status-${d.status}">${e(DUT_STATUS_LABELS[d.status])}</span></strong><small>${e(d.general?.immatriculation || 'Véhicule non renseigné')} · ${e(d.trajet?.dechargement?.ville || 'Destination à compléter')} · ${d.status==='TERMINE'?`${d.waitingDays} j d’attente`:d.status==='REJETE'?e(d.rejectionReason || 'Correction demandée'):d.status==='SUSPENDU'?'Vérifier le motif de suspension':'Compléter le dossier'}</small></span>${icon('chevronRight',{size:16})}</a>`).join('') || `<p class="priority-empty">${icon('checkCircle')} Aucun dossier en attente de traitement.</p>`}
        </article>
        <article class="card"><div class="card-header"><h3>Principaux corridors</h3>${icon('map')}</div>
          ${s.corridors.slice(0,4).map(c=>`<div class="corridor"><div class="corridor-label"><strong>${e(c.name)}</strong><span>${n(c.tonnes,1)} t</span></div><div class="corridor-track"><div class="corridor-fill" style="width:${c.tonnes/Math.max(1,s.corridors[0].tonnes)*100}%"></div></div></div>`).join('') || '<p class="priority-empty">Les corridors apparaîtront après validation des DUT.</p>'}
          <p class="ops-footnote">Tonnage déclaré sur les DUT actuellement validés · ${s.corridors.length} corridor(s).</p>
        </article>
      </div>`;
    section.querySelector('select').addEventListener('change',event=>{days=Number(event.target.value);render();});

  }
  render();
}
