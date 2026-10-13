// Lot d4 : équipements et mobilité — inventaire par antenne, fiche, affectation, panne et dépannage.
import { icon } from '../core/icons.js';
import { getCurrentUser } from '../core/auth.js';
import { can } from '../core/permissions.js';
import { navigate } from '../core/router.js';
import { openModal } from '../core/ui.js';
import { formatDate, formatDateTime } from '../core/utils.js';
import * as S from '../services/equipment.service.js';
import { INCIDENT_SEVERITIES } from '../services/incidents.service.js';
import { antennaLabel } from '../services/support-common.service.js';
import { esc, badge, kpis, pageHeader, options, tableCard, wireTable, cell2, identity, timeline, card, field, selectCtl, inputCtl, textareaCtl, attempt, notFound } from './support-ui.js';

const STATUS_BADGE = { EN_SERVICE: 'badge-success', EN_PANNE: 'badge-error', EN_REPARATION: 'badge-warning', REFORME: 'badge-neutral' };
const statusBadge = (e) => badge(STATUS_BADGE[e.status], S.EQUIPMENT_STATUS[e.status]);

export function render(container, params = {}) {
  if (params.id) return renderDetail(container, params.id);
  return renderList(container);
}

function renderList(container) {
  const user = getCurrentUser();
  const national = user.role === 'OIC_ADMIN';
  const rows = S.listEquipment();
  const live = rows.filter((e) => e.status !== 'REFORME');
  const antennaNames = [...new Set(rows.map((e) => e.antennaName))].sort((a, b) => a.localeCompare(b, 'fr'));
  const byAntenna = national ? S.equipmentByAntenna() : [];
  container.innerHTML = `
    ${pageHeader({
      overline: national ? 'OIC · Exploitation' : `Antenne · ${antennaLabel(user.antennaId)}`,
      title: 'Équipements et mobilité',
      subtitle: national
        ? 'Matériel et moyens de mobilité recensés dans les antennes : état, affectation, pannes et dépannages.'
        : 'Le matériel et les moyens de mobilité de votre antenne. Signalez une panne et suivez le dépannage.',
      actions: can(user, 'equipment.manage') ? `<button type="button" class="btn btn-primary" id="btn-new">${icon('plus', { size: 15 })} Recenser un équipement</button>` : '',
    })}
    ${kpis([['Équipements recensés', live.length, 'monitor', 'navy'], ['En service', rows.filter((e) => e.status === 'EN_SERVICE').length, 'checkCircle', 'green'], ['En panne ou en réparation', rows.filter((e) => ['EN_PANNE', 'EN_REPARATION'].includes(e.status)).length, 'wrench', 'rose'], ['Non affectés', live.filter((e) => !e.holder).length, 'users', 'amber'], ['Moyens de mobilité', live.filter((e) => S.MOBILITY_TYPES.includes(e.type)).length, 'truck', 'blue']])}
    ${tableCard({
      title: national ? 'Inventaire national' : 'Inventaire de l’antenne',
      hint: 'Cliquez sur une ligne pour affecter l’équipement, déclarer une panne ou suivre le dépannage.',
      searchPlaceholder: 'N° de série, désignation, agent…',
      filters: `<select class="select" id="f-status" aria-label="Filtrer par état">${options(Object.entries(S.EQUIPMENT_STATUS), '', 'Tous les états')}</select><select class="select" id="f-type" aria-label="Filtrer par type">${options(Object.entries(S.EQUIPMENT_TYPES), '', 'Tous les types')}</select>${national ? `<select class="select" id="f-antenna" aria-label="Filtrer par antenne">${options(antennaNames.map((n) => [n, n]), '', 'Toutes les antennes')}</select>` : ''}`,
      head: ['Équipement', 'Type', 'N° de série', 'Antenne', 'Affecté à', 'État', 'Acquis le'],
    })}
    ${national ? `<section class="card sup-table-card" style="margin-top:var(--s4)"><div class="sup-table-head"><div><h2>Pannes par antenne</h2><p>Antennes ayant du matériel recensé, les plus touchées en premier.</p></div></div><div class="table-wrap"><table class="data-table sup-table"><thead><tr><th scope="col">Antenne</th><th scope="col" class="num">Recensés</th><th scope="col" class="num">En service</th><th scope="col" class="num">En panne / réparation</th><th scope="col" class="num">Non affectés</th><th scope="col" class="num">Réformés</th></tr></thead><tbody>${byAntenna.map((r) => `<tr data-antenna="${esc(r.antennaName)}"><td><strong>${esc(r.antennaName)}</strong></td><td class="num">${r.total}</td><td class="num">${r.inService}</td><td class="num">${r.broken ? `<span class="sup-neg">${r.broken}</span>` : '0'}</td><td class="num">${r.unassigned}</td><td class="num">${r.retired}</td></tr>`).join('')}</tbody></table></div></section>` : ''}`;
  wireTable(container, {
    rows,
    columns: [
      (e) => cell2(e.label, e.reference),
      (e) => esc(S.EQUIPMENT_TYPES[e.type]),
      (e) => `<span class="mono-num d4-nowrap">${esc(e.serialNumber)}</span>`,
      (e) => esc(e.antennaName),
      (e) => (e.holder ? esc(e.holder.name) : '<span class="text-muted">En stock</span>'),
      statusBadge,
      (e) => formatDate(e.acquiredAt),
    ],
    filters: { '#f-status': (e, v) => e.status === v, '#f-type': (e, v) => e.type === v, '#f-antenna': (e, v) => e.antennaName === v },
    haystack: (e) => [e.reference, e.label, e.serialNumber, e.antennaName, e.holder?.name, S.EQUIPMENT_TYPES[e.type]].join(' '),
    open: (id) => navigate(`/equipements/${id}`),
    empty: 'Aucun équipement ne correspond à cette vue.',
  });
  // Clic sur une antenne du tableau des pannes : filtre l'inventaire sur cette antenne.
  container.querySelectorAll('tr[data-antenna]').forEach((tr) => tr.addEventListener('click', () => {
    const select = container.querySelector('#f-antenna');
    select.value = tr.dataset.antenna; select.dispatchEvent(new Event('change'));
    container.querySelector('.sup-table-card').scrollIntoView({ block: 'start' });
  }));
  container.querySelector('#btn-new')?.addEventListener('click', () => {
    const today = new Date().toISOString().slice(0, 10);
    const antennaList = S.manageableAntennas();
    openModal({
      icon: 'monitor', title: 'Recenser un équipement', large: true, confirmLabel: 'Enregistrer',
      text: 'Le numéro de série doit être unique. L’équipement est créé « en service » et non affecté.',
      bodyHtml: `<div class="field-row d4-row">${field('e-type', 'Type', selectCtl('e-type', Object.entries(S.EQUIPMENT_TYPES), 'ORDINATEUR_PORTABLE'), { required: true })}${field('e-antenna', 'Antenne', national ? selectCtl('e-antenna', antennaList.map((a) => [a.id, a.name]), '', 'Choisir…') : `<input class="input" id="e-antenna" readonly value="${esc(antennaLabel(user.antennaId))}">`, { required: true })}</div>${field('e-label', 'Désignation (marque et modèle)', inputCtl('e-label', 'maxlength="80" placeholder="Ex. : HP ProBook 450"'), { required: true })}<div class="field-row d4-row">${field('e-serial', 'Numéro de série', inputCtl('e-serial', 'maxlength="60" placeholder="Inscrit sur l’étiquette du fabricant"'), { required: true })}${field('e-date', 'Date d’acquisition', inputCtl('e-date', `type="date" max="${today}"`), { required: true })}</div>`,
      onConfirm: ({ close, root }) => attempt(() => S.registerEquipment({ type: root.querySelector('#e-type').value, antennaId: national ? root.querySelector('#e-antenna').value : user.antennaId, label: root.querySelector('#e-label').value, serialNumber: root.querySelector('#e-serial').value, acquiredAt: root.querySelector('#e-date').value }), 'Équipement recensé', (item) => { close(); navigate(`/equipements/${item.id}`); }),
    });
  });
}

function renderDetail(container, id) {
  let item;
  try { item = S.getEquipment(id); } catch { return notFound(container, '/equipements', 'Retour aux équipements'); }
  const user = getCurrentUser();
  const allowed = S.allowedActions(item);
  const failure = S.currentFailure(item);
  const pastFailures = [...item.failures].filter((f) => f.closedAt).reverse();
  const failureBlock = (f) => `${identity([['Déclarée', `${formatDateTime(f.declaredAt)} · ${esc(f.declaredBy?.name || '')}`], ['Description', `<span class="preserve-lines">${esc(f.description)}</span>`], ['Incident lié', f.incidentId ? `<a href="#/incidents/${esc(f.incidentId)}">${esc(f.incidentReference)}</a>` : 'Aucun'], ['Issue', f.closedAt ? `${esc(S.REPAIR_OUTCOMES[f.outcome])} · ${formatDateTime(f.closedAt)}<br><small class="text-muted preserve-lines">${esc(f.report)}</small>` : '']])}<hr class="d4-divider">${timeline(f.interventions.map((i) => ({ title: i.technician, at: i.at, by: i.by, note: i.action })), 'Aucune intervention enregistrée.')}`;
  container.innerHTML = `
    ${pageHeader({
      back: ['/equipements', 'Équipements'],
      title: item.label,
      subtitle: `${esc(item.reference)} · ${esc(S.EQUIPMENT_TYPES[item.type])} · n° de série <span class="mono-num">${esc(item.serialNumber)}</span> · ${esc(item.antennaName)}`,
      badges: statusBadge(item),
      actions: [
        allowed.assign && `<button type="button" class="btn btn-secondary" data-act="assign">${icon('users', { size: 15 })} ${item.holder ? 'Changer l’affectation' : 'Affecter'}</button>`,
        allowed.declareFailure && `<button type="button" class="btn btn-primary" data-act="failure">${icon('alertTriangle', { size: 15 })} Déclarer une panne</button>`,
        allowed.intervene && `<button type="button" class="btn btn-secondary" data-act="intervene">${icon('wrench', { size: 15 })} Enregistrer une intervention</button>`,
        allowed.closeRepair && `<button type="button" class="btn btn-primary" data-act="repair">${icon('checkCircle', { size: 15 })} Clore le dépannage</button>`,
      ].filter(Boolean).join(''),
    })}
    <div class="sup-grid">
      <div class="sup-main">
        ${failure ? card('Dépannage en cours', failureBlock(failure), statusBadge(item)) : ''}
        ${card('Dépannages précédents', pastFailures.length ? pastFailures.map(failureBlock).join('<hr class="d4-divider">') : '<p class="text-muted">Aucun dépannage clôturé.</p>')}
        ${card('Historique', timeline([...item.history].reverse().map((h) => ({ title: h.label, at: h.at, by: h.by, note: h.note }))))}
      </div>
      <div class="sup-side">
        ${card('Fiche', identity([['État', statusBadge(item)], ['Type', esc(S.EQUIPMENT_TYPES[item.type])], ['Numéro de série', `<span class="mono-num">${esc(item.serialNumber)}</span>`], ['Antenne', esc(item.antennaName)], ['Date d’acquisition', formatDate(item.acquiredAt)], ['Affecté à', item.holder ? `${esc(item.holder.name)}<br><small class="text-muted">depuis le ${formatDate(item.holder.since)}</small>` : '<span class="text-muted">En stock, non affecté</span>'], ['Réformé le', item.retiredAt ? formatDate(item.retiredAt) : '']]))}
        ${card('Affectations', timeline([...item.assignments].reverse().map((a) => ({ title: a.name, at: a.from, by: a.by, note: a.until ? `Jusqu’au ${formatDate(a.until)}` : 'Affectation en cours', done: !a.until })), 'Jamais affecté.'))}
      </div>
    </div>`;
  const rerender = () => renderDetail(container, id);
  const on = (act, fn) => container.querySelector(`[data-act="${act}"]`)?.addEventListener('click', fn);
  on('assign', () => {
    const holders = S.holdersFor(item);
    openModal({
      icon: 'users', title: 'Affectation de l’équipement', confirmLabel: 'Enregistrer',
      text: `Personnes de l’antenne ${item.antennaName}. Choisissez « En stock » pour retirer l’affectation.`,
      bodyHtml: `${field('h-holder', 'Affecter à', selectCtl('h-holder', holders.map((p) => [p.id, `${p.name} — ${p.detail.toLowerCase()}`]), item.holder?.id || '', 'En stock (aucune personne)'), { required: true })}${field('h-note', 'Observation (facultatif)', textareaCtl('h-note', 'Ex. : remis contre décharge signée', 2))}`,
      onConfirm: ({ close, root }) => attempt(() => S.assignEquipment(id, root.querySelector('#h-holder').value, root.querySelector('#h-note').value), 'Affectation enregistrée', () => { close(); rerender(); }),
    });
  });
  on('failure', () => openModal({
    icon: 'alertTriangle', title: 'Déclarer une panne', confirmLabel: 'Déclarer la panne',
    text: 'L’équipement passe « en panne ». Vous pouvez ouvrir en même temps un incident matériel, suivi par l’OIC.',
    bodyHtml: `${field('f-desc', 'Description de la panne', textareaCtl('f-desc', 'Ce qui ne fonctionne plus, depuis quand, conséquences', 4), { required: true })}${can(user, 'incidents.declare') ? `<label class="checkbox-row d4-check"><input type="checkbox" id="f-incident" checked> Ouvrir aussi un incident matériel</label>${field('f-severity', 'Gravité de l’incident', selectCtl('f-severity', Object.entries(INCIDENT_SEVERITIES).map(([k, v]) => [k, `${v.label} — ${v.hint.toLowerCase()}`]), 'MAJEURE'))}` : ''}`,
    onConfirm: ({ close, root }) => attempt(() => S.declareFailure(id, { description: root.querySelector('#f-desc').value, withIncident: root.querySelector('#f-incident')?.checked, severity: root.querySelector('#f-severity')?.value }), 'Panne déclarée', () => { close(); rerender(); }),
  }));
  on('intervene', () => openModal({
    icon: 'wrench', title: 'Enregistrer une intervention', confirmLabel: 'Enregistrer',
    bodyHtml: `${field('i-tech', 'Intervenant', inputCtl('i-tech', 'maxlength="80" placeholder="Ex. : technicien DSI, garage, prestataire"'), { required: true })}${field('i-action', 'Action menée', textareaCtl('i-action', 'Diagnostic, pièce commandée, réparation…'), { required: true })}`,
    onConfirm: ({ close, root }) => attempt(() => S.addIntervention(id, { technician: root.querySelector('#i-tech').value, action: root.querySelector('#i-action').value }), 'Intervention enregistrée', () => { close(); rerender(); }),
  }));
  on('repair', () => openModal({
    icon: 'checkCircle', title: 'Clore le dépannage', confirmLabel: 'Clore le dépannage',
    text: allowed.retire ? 'Un équipement irréparable est réformé et son affectation est levée.' : 'La réforme d’un équipement irréparable est décidée par l’OIC.',
    bodyHtml: `${field('p-outcome', 'Issue', selectCtl('p-outcome', Object.entries(S.REPAIR_OUTCOMES).filter(([k]) => allowed.retire || k === 'REPARE'), 'REPARE'), { required: true })}${field('p-report', 'Compte rendu', textareaCtl('p-report', 'Ex. : pièce remplacée, équipement testé'), { required: true })}`,
    onConfirm: ({ close, root }) => attempt(() => S.closeRepair(id, { outcome: root.querySelector('#p-outcome').value, report: root.querySelector('#p-report').value }), 'Dépannage clôturé', () => { close(); rerender(); }),
  }));
}
