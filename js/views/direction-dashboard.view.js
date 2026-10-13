// Intégration : tableau de bord de la Direction générale (page d'accueil du rôle DIRECTION).
// Synthèse nationale : indicateurs DUT, comparaison des antennes, objectifs et actions en retard (lot d5),
// incidents et équipements (lot d4), ventes, stock et rapprochement (lot d2), partenaires et transporteurs (lot d1),
// documents et contrats à valider (lot d5). Les chiffres viennent de synthesis.service.js ; la vue ne calcule rien.
import { icon } from '../core/icons.js';
import { escapeHtml as esc, formatDate } from '../core/utils.js';
import { directionSynthesis, SYNTHESIS_PERIODS } from '../services/synthesis.service.js';
import { pageHeader, kpi as tile, kpis as tiles, bindRowLinks } from './direction-ui.js';
import { opsCard, linkList, summaryLines, badge, footnote, num, pct, hours, fcfa } from './synthesis-ui.js';

let periodKind = '30j';

export function render(container) {
  let s;
  try { s = directionSynthesis({ periodKind }); } catch (err) {
    container.innerHTML = `${pageHeader({ overline: 'Direction générale · Pilotage', title: 'Tableau de bord' })}<p class="priority-empty">${icon('info')} ${esc(err.message)}</p>`;
    return;
  }
  const n = s.national, o = s.objectifs, inc = s.incidents, eq = s.equipements, v = s.validations, g = s.groupements, rec = s.rapprochement, ve = s.ventes;
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

  const antennaRows = s.antennes.slice(0, 8).map((a) => `<tr data-href="/direction/antennes" tabindex="0">
      <td><strong>${esc(a.name)}</strong></td>
      <td class="text-right">${num(a.dutValides)}</td>
      <td class="text-right">${pct(a.tauxRejet)}</td>
      <td class="text-right">${hours(a.delaiValidationH)}</td>
      <td class="text-right">${pct(a.objectifs)}</td>
      <td class="text-right">${num(a.incidentsOuverts)}${a.incidentsEnRetard ? `<small class="text-muted"> dont ${num(a.incidentsEnRetard)} hors délai</small>` : ''}</td></tr>`).join('');
  const comparison = s.antennes.length
    ? `<div class="table-wrap"><table class="data-table sup-table"><thead><tr><th scope="col">Antenne</th><th scope="col" class="text-right">DUT validés</th><th scope="col" class="text-right">Taux de rejet</th><th scope="col" class="text-right">Délai médian</th><th scope="col" class="text-right">Objectifs</th><th scope="col" class="text-right">Incidents</th></tr></thead><tbody>${antennaRows}</tbody></table></div>${footnote(`${num(s.antennesActives)} antenne(s) active(s) sur ${num(s.antennesTotal)} · classement par DUT validés ; pannes et évolutions détaillées dans le suivi des antennes.`)}`
    : `<p class="priority-empty">${icon('info')} Aucune activité d’antenne sur la période.</p>`;

  container.innerHTML = `
    ${pageHeader({
      overline: 'Direction générale · Pilotage',
      title: 'Tableau de bord',
      subtitle: `Vue nationale du réseau sur ${esc(s.period.label.toLowerCase())} : documents de transport, antennes, objectifs, exploitation, recettes et partenaires.`,
      actions: `<select class="select" id="dg-period" aria-label="Période des indicateurs">${Object.entries(SYNTHESIS_PERIODS).map(([k, l]) => `<option value="${k}" ${k === s.period.kind ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select><a class="btn btn-secondary" href="#/direction/antennes">${icon('barChart', { size: 15 })} Suivi des antennes</a>`,
    })}
    <div class="st-alerts">${chips || `<span class="st-alert is-ok">${icon('checkCircle', { size: 14 })} Aucun point d’attention</span>`}</div>
    ${tiles([
      tile('DUT édités', num(n.dutCrees), `du ${formatDate(s.period.from)} au ${formatDate(s.period.to)}`, 'navy'),
      tile('DUT validés', num(n.dutValides), `${pct(n.validesSous24h)} validés sous 24 h`, 'green'),
      tile('Taux de rejet', pct(n.tauxRejet), `${num(n.dutRejetes)} DUT rejeté(s)`, 'rose'),
      tile('Délai de validation', hours(n.delaiValidationH), 'médiane nationale', 'amber'),
      tile('Contrôles', num(n.scans), 'DUT contrôlés sur la route', 'teal'),
      tile('Antennes actives', `${num(s.antennesActives)} / ${num(s.antennesTotal)}`, 'au moins un DUT sur la période', 'blue'),
    ])}
    ${tiles([
      tile('Atteinte des objectifs', pct(o.tauxNational), `${num(o.parAntenne.length)} antenne(s) sous contrat`, 'blue'),
      tile('Actions en retard', num(o.actionsEnRetard), 'actions correctives non closes', o.actionsEnRetard ? 'rose' : 'teal'),
      tile('Incidents ouverts', num(inc.ouverts), `${num(inc.enRetard)} hors délai · ${num(inc.critiques)} critique(s)`, inc.enRetard ? 'rose' : 'navy'),
      tile('Équipements en panne', num(eq.enPanne), `sur ${num(eq.total)} recensé(s)`, eq.enPanne ? 'amber' : 'teal'),
      tile('Ventes de références', ve ? fcfa(ve.ttc) : '—', ve ? `${num(ve.quantite)} numéro(s) · TTC` : '', 'violet'),
      tile('Écarts de rapprochement', rec ? num(rec.ecartsOuverts) : '—', rec ? `${num(rec.partenairesConcernes)} partenaire(s) concerné(s)` : '', rec?.ecartsOuverts ? 'amber' : 'teal'),
    ])}
    <section class="ops-section" aria-label="Synthèse nationale">
      <div class="ops-grid">
        ${opsCard('Comparaison des antennes', comparison, { subtitle: 'Antennes actives ou concernées par un objectif, un incident ou une panne', aside: `<a href="#/direction/antennes">Classement complet</a>` })}
        ${opsCard('Validations en attente', `${summaryLines([['Contrats d’objectifs à valider', num(v.contratsObjectifs)], ['Documents à valider', num(v.documents)], ['Contrats et conventions à valider', num(v.contratsJuridiques)], ['Contrats en circuit de validation', num(v.contratsEnCircuit)], ['Contrats à échéance sous 60 jours', num(v.contratsEcheance)], ['Décisions de réunion en retard', num(v.decisionsEnRetard)]])}${footnote('<a href="#/direction/objectifs">Contrats d’objectifs</a> · <a href="#/direction/documents">Documents</a> · <a href="#/direction/contrats">Contrats et conventions</a>')}`, { aside: badge(`${num(v.contratsObjectifs + v.documents + v.contratsJuridiques)} à valider`, v.contratsObjectifs + v.documents + v.contratsJuridiques ? 'warning' : 'neutral') })}
        ${opsCard('Incidents et équipements', `${linkList(inc.liste.map((i) => ({ href: `/incidents/${i.id}`, icon: i.overdue ? 'alertTriangle' : 'alertCircle', title: `${i.reference} · ${i.title}`, badge: i.overdue ? badge('Délai dépassé', 'error') : badge(i.statusLabel, 'neutral'), detail: `Gravité ${i.severity.toLowerCase()} · ${i.antennaName}` })), 'Aucun incident ouvert.')}${summaryLines([['Équipements recensés', num(eq.total)], ['En service', num(eq.enService)], ['En panne ou en réparation', num(eq.enPanne)], ['Réformés', num(eq.reformes)]])}`, { aside: `<a href="#/incidents">Tous les incidents</a>` })}
        ${opsCard('Actions correctives en retard', `${linkList(o.actionsListe.map((a) => ({ href: '/direction/actions', icon: 'clock', title: a.title, badge: badge(`échéance ${formatDate(a.dueDate)}`, 'error'), detail: `${a.responsible} · ${a.antennaName}` })), 'Aucune action corrective en retard.')}${footnote(`${num(o.contratsAValider)} contrat(s) d’objectifs en attente de validation.`)}`, { aside: `<a href="#/direction/actions">Toutes les actions</a>` })}
        ${opsCard('Ventes et rapprochement', ve ? `${summaryLines([['Ventes de références', `${num(ve.ventes)} vente(s) · ${num(ve.quantite)} numéro(s)`], ['Montant TTC (HT + TVA + timbre)', fcfa(ve.ttc)], ['Encaissé et validé', fcfa(ve.encaisseValide)], ['Numéros disponibles (national)', num(ve.stock.disponible)], ['Numéros en attente de validation', num(ve.stock.attente)], ['Écarts de rapprochement non justifiés', rec ? num(rec.ecartsOuverts) : '—']])}${footnote('<a href="#/caisse/ventes">Rapport des ventes</a> · <a href="#/rapprochement">Rapprochement</a> · paiements simulés dans cette démonstration')}` : `<p class="priority-empty">${icon('info')} Ventes non consultables.</p>`)}
        ${opsCard('Partenaires et transporteurs', `${summaryLines([['Partenaires habilités actifs', num(g.partenaires.actifs)], ['Partenaires suspendus', num(g.partenaires.suspendus)], ['Partenaires en attente de validation', num(g.partenaires.enAttente)], ['Transporteurs actifs', num(g.transporteurs.actifs)], ['Transporteurs suspendus', num(g.transporteurs.suspendus)], ['Inscriptions de transporteurs à examiner', num(g.transporteurs.inscriptions)]])}${g.suspendus.length ? footnote(`Suspendus : ${g.suspendus.map((x) => `${esc(x.name)} (${esc(x.type.toLowerCase())})`).join(', ')}`) : footnote('Aucun groupement suspendu.')}`, { aside: badge(`${num(g.partenaires.total + g.transporteurs.total)} groupement(s)`, 'neutral') })}
      </div>
    </section>`;
  bindRowLinks(container);
  container.querySelector('#dg-period').addEventListener('change', (e) => { periodKind = e.target.value; render(container); });
}
