// Lot d2 : gestion des antennes (administrateur OIC) — liste, création, fiche complète,
// encadrement pris dans les comptes, ouverture de comptes, désactivation et fermeture.
import { icon } from '../core/icons.js';
import { escapeHtml as esc, formatDate } from '../core/utils.js';
import { navigate } from '../core/router.js';
import { openModal, toast, promptAction } from '../core/ui.js';
import { listAntennas } from '../services/directory.service.js';
import * as A from '../services/antennas-admin.service.js';
import { revokeAntennaStock } from '../services/ranges.service.js';
import { header, kpi, badge, n, formValues, mountMapPicker, isoDay } from './lot-d2-ui.js';

const STATUS_TONE = { ACTIVE: 'success', INACTIVE: 'warning', CLOSED: 'neutral' };
const statusBadge = (s) => badge(STATUS_TONE[s] || 'neutral', A.ANTENNA_STATUS_LABELS[s] || s);
let picker = null;

export function render(container, params = {}) {
  picker?.remove(); picker = null;
  if (params.id) renderForm(container, params.id === 'nouvelle' ? null : params.id);
  else renderList(container);
}

// ------------------------------------------------------------- Liste
function renderList(container) {
  const rows = A.listAntennasAdmin();
  const by = (s) => rows.filter((r) => r.status === s).length;
  container.innerHTML = `
    ${header('OIC · Réseau', 'Gestion des antennes', 'Créez, mettez à jour, désactivez ou fermez une antenne ; affectez son encadrement à partir des comptes utilisateurs.', `<button type="button" class="btn btn-primary" id="ant-new">${icon('plus', { size: 15 })} Nouvelle antenne</button>`)}
    <div class="kpi-grid sup-kpis">
      ${kpi('Antennes ouvertes', n(by('ACTIVE')), `${n(rows.length)} au total`, 'green', 'map')}
      ${kpi('Désactivées', n(by('INACTIVE')), 'temporairement', 'amber', 'power')}
      ${kpi('Fermées', n(by('CLOSED')), 'historique conservé', 'navy', 'archive')}
      ${kpi('Sans chef désigné', n(rows.filter((r) => r.status !== 'CLOSED' && !r.chef).length), 'à affecter', 'rose', 'users')}
    </div>
    <section class="card sup-table-card">
      <div class="sup-table-head"><div><h2>Antennes du réseau</h2><p>Cliquez sur une ligne pour ouvrir la fiche.</p></div>
        <div class="sup-table-tools"><label class="search-input ant-search">${icon('search', { size: 16 })}<input type="search" id="ant-q" placeholder="Rechercher…" autocomplete="off" aria-label="Rechercher une antenne"></label>
        <select class="select" id="ant-status" aria-label="Filtrer par statut"><option value="">Tous les statuts</option>${Object.entries(A.ANTENNA_STATUS_LABELS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select><span class="sup-count" id="ant-count"></span></div></div>
      <div class="table-wrap"><table class="data-table sup-table"><thead><tr><th scope="col">Antenne</th><th scope="col">Chef / adjoint</th><th scope="col" class="num">Comptes</th><th scope="col" class="num">Sites</th><th scope="col" class="num">Stock disponible</th><th scope="col">Statut</th><th></th></tr></thead><tbody id="ant-rows"></tbody></table></div>
    </section>`;
  const tbody = container.querySelector('#ant-rows');
  const draw = () => {
    const q = container.querySelector('#ant-q').value.trim().toLowerCase();
    const st = container.querySelector('#ant-status').value;
    const shown = rows.filter((r) => (!st || r.status === st) && (!q || `${r.name} ${r.code} ${r.city} ${r.chef}`.toLowerCase().includes(q)));
    container.querySelector('#ant-count').textContent = `${shown.length} / ${rows.length}`;
    tbody.innerHTML = shown.length ? shown.map((r) => `<tr data-id="${esc(r.id)}" tabindex="0">
      <td><strong>${esc(r.name)}</strong><small class="d2-sub">${esc(r.code || 'Sans code')} · ${esc(r.city)} · ${esc(r.zone)}</small></td>
      <td>${r.chef ? esc(r.chef) : '<span class="text-muted">Non désigné</span>'}<small class="d2-sub">${r.adjoint ? `Adjoint : ${esc(r.adjoint)}` : 'Adjoint non désigné'}</small></td>
      <td class="num">${n(r.agents)}</td><td class="num">${n(r.sites)}</td><td class="num">${n(r.stock)}</td><td>${statusBadge(r.status)}</td>
      <td class="text-right"><span class="sup-open">${icon('chevronRight', { size: 15 })}</span></td></tr>`).join('') : '<tr><td class="table-empty" colspan="7">Aucune antenne ne correspond.</td></tr>';
  };
  draw();
  container.querySelector('#ant-q').addEventListener('input', draw);
  container.querySelector('#ant-status').addEventListener('change', draw);
  container.querySelector('#ant-new').addEventListener('click', () => navigate('/oic/reseau/antennes/nouvelle'));
  const open = (tr) => navigate(`/oic/reseau/antennes/${tr.dataset.id}`);
  tbody.addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) open(tr); });
  tbody.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const tr = e.target.closest('tr[data-id]'); if (tr) open(tr); } });
}

// ------------------------------------------------------------- Fiche (création / mise à jour)
const field = (name, label, value = '', { required = false, type = 'text', hint = '', attrs = '' } = {}) => `<label class="field"><span>${esc(label)}${required ? ' <span class="req">*</span>' : ''}</span><input class="input" name="${name}" type="${type}" value="${esc(value ?? '')}" ${required ? 'required' : ''} ${attrs}>${hint ? `<small class="hint">${esc(hint)}</small>` : ''}</label>`;
const section = (iconName, title, text, body, tone = 'navy') => `<section class="card settings-section"><div class="settings-head"><span class="settings-icon" style="background:var(--${tone}-soft);color:var(--${tone === 'navy' ? 'navy-2' : tone})">${icon(iconName, { size: 18 })}</span><div><h2>${esc(title)}</h2><p>${esc(text)}</p></div></div>${body}</section>`;

function renderForm(container, id) {
  const detail = id ? A.antennaDetail(id) : null;
  if (id && !detail) { container.innerHTML = `<div class="empty-state">${icon('alertCircle', { size: 40 })}<h3>Antenne introuvable</h3><a class="btn btn-secondary" href="#/oic/reseau/antennes">Retour</a></div>`; return; }
  const a = detail?.antenna || { code: A.suggestCode(), zone: '', status: 'ACTIVE' };
  const closed = a.status === 'CLOSED';
  const ro = closed ? 'disabled' : '';
  container.innerHTML = `
    <div class="page-header">
      <div><a class="sup-back" href="#/oic/reseau/antennes">${icon('chevronLeft', { size: 14 })} Antennes</a><h1>${esc(id ? a.name : 'Nouvelle antenne')}</h1>
        <div class="subtitle">${id ? `${esc(a.code || 'Sans code')} · ${esc(a.city)} · zone ${esc(a.zone)}` : 'Renseignez l’identité, la position et les contacts ; vous ouvrirez ensuite les comptes de l’antenne.'}</div>
        ${id ? `<div class="sup-badges">${statusBadge(a.status)}${a.source ? '<span class="badge badge-navy">Liste officielle OIC</span>' : ''}</div>` : ''}</div>
      ${id ? `<div class="row gap-2"><a class="btn btn-secondary" href="#/oic/antennas/${esc(id)}">${icon('barChart', { size: 15 })} Activité</a></div>` : ''}
    </div>
    <div class="page-header-rule"></div>
    ${closed ? `<div class="admin-note">Antenne fermée le ${esc(formatDate(a.statusDate || a.closedAt))} : ${esc(a.statusReason || '')}. La fiche est conservée en lecture seule.</div>` : ''}
    <div class="settings-layout">
      <form id="ant-form" class="admin-form settings-form" novalidate>
        ${section('building', 'Identité', 'Nom affiché dans tout le réseau, code interne, ville et zone.', `<div class="settings-grid">
          ${field('name', 'Nom de l’antenne', a.name, { required: true, attrs: `maxlength="60" ${ro}` })}
          ${field('code', 'Code', a.code, { required: true, hint: '2 à 12 lettres, chiffres ou tirets.', attrs: `maxlength="12" ${ro}` })}
          ${field('city', 'Ville', a.city, { required: true, attrs: `maxlength="60" ${ro}` })}
          <label class="field"><span>Zone</span><select class="select" name="zone" ${ro}><option value="">Déduite de la position</option>${A.ZONES.map((z) => `<option ${z === a.zone ? 'selected' : ''}>${z}</option>`).join('')}</select><small class="hint">Sud, Centre, Nord, Ouest ou Est.</small></label>
        </div>`)}
        ${section('mapPin', 'Localisation', 'Cliquez sur la carte pour placer l’antenne, ou saisissez ses coordonnées.', `
          <div class="d2-picker"><div id="ant-picker" class="map-container ant-map d2-picker-map"></div></div>
          <div class="settings-grid">
            ${field('lat', 'Latitude', a.lat, { required: true, hint: 'Entre 4,1 et 10,8.', attrs: `inputmode="decimal" ${ro}` })}
            ${field('lng', 'Longitude', a.lng, { required: true, hint: 'Entre −8,7 et −2,4.', attrs: `inputmode="decimal" ${ro}` })}
            ${field('address', 'Adresse du bureau', a.address === 'Adresse précise non fournie' ? '' : a.address, { attrs: `maxlength="160" placeholder="Quartier, rue, repère" ${ro}` })}
          </div>`, 'success')}
        ${section('phone', 'Contacts et horaires', 'Numéros et horaires communiqués aux partenaires.', `<div class="settings-grid">
          ${field('phone', 'Standard', a.phone, { attrs: `maxlength="60" ${ro}` })}
          ${field('email', 'E-mail de l’antenne', a.email, { type: 'email', attrs: `maxlength="120" placeholder="antenne@oic.ci" ${ro}` })}
          ${field('hours', 'Horaires', a.hours === 'Non renseignés' ? '' : a.hours, { attrs: `maxlength="80" placeholder="Lun.–Ven. 7 h 30 – 16 h 30" ${ro}` })}
          ${id ? field('chefPhone', 'Téléphone du chef', a.chef?.phone, { attrs: `maxlength="60" ${ro}` }) : ''}
          ${id ? field('effectif', 'Effectif total', Number(a.effectif) > 0 ? a.effectif : '', { type: 'number', hint: 'Agents avec ou sans compte.', attrs: `min="0" max="500" ${ro}` }) : ''}
        </div>`, 'warning')}
        <p role="alert" class="error-msg" id="ant-error"></p>
        ${closed ? '' : `<div class="settings-bar"><span class="text-muted">Chaque modification est enregistrée dans le journal d’audit.</span><button class="btn btn-primary" type="submit">${icon('check', { size: 15 })} ${id ? 'Enregistrer la fiche' : 'Créer l’antenne'}</button></div>`}
      </form>
      <aside class="settings-aside">${id ? asideHtml(detail) : createHelp()}</aside>
    </div>`;

  const form = container.querySelector('#ant-form');
  const context = listAntennas().filter((x) => x.id !== id).map((x) => ({ name: x.name, lat: x.lat, lng: x.lng }));
  picker = mountMapPicker(container.querySelector('#ant-picker'), { lat: a.lat, lng: a.lng, context, onPick: (la, ln) => { if (closed) return; form.elements.lat.value = la; form.elements.lng.value = ln; } });
  const syncPicker = () => picker?.setPosition(Number(form.elements.lat.value.replace(',', '.')), Number(form.elements.lng.value.replace(',', '.')));
  form.elements.lat.addEventListener('change', syncPicker); form.elements.lng.addEventListener('change', syncPicker);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const err = container.querySelector('#ant-error'); err.textContent = '';
    try {
      if (id) { A.updateAntenna(id, formValues(form)); toast({ type: 'success', title: 'Fiche de l’antenne enregistrée' }); renderForm(container, id); }
      else { const created = A.createAntenna(formValues(form)); toast({ type: 'success', title: 'Antenne créée', desc: 'Ouvrez maintenant les comptes de l’antenne et désignez son encadrement.' }); navigate(`/oic/reseau/antennes/${created.id}`); }
    } catch (ex) { err.textContent = ex.message; err.scrollIntoView({ block: 'nearest' }); }
  });
  if (id) bindAside(container, detail);
}

function createHelp() {
  return `<section class="card settings-help"><div class="card-header"><h3>Après la création</h3></div><ul class="settings-help-list">
    <li>${icon('userPlus', { size: 14 })}<span><b>Ouvrir les comptes</b> : chef d’antenne et agents reçoivent un mot de passe initial, affiché une seule fois.</span></li>
    <li>${icon('users', { size: 14 })}<span><b>Désigner l’encadrement</b> : le chef et l’adjoint sont choisis parmi les comptes de l’antenne.</span></li>
    <li>${icon('layers', { size: 14 })}<span><b>Approvisionner le stock</b> : depuis « Stock et transferts », l’OIC attribue une plage de numéros à l’antenne.</span></li>
    <li>${icon('mapPin', { size: 14 })}<span><b>Rattacher des sites</b> : ports, frontières, gares ou parcs suivis par l’antenne.</span></li></ul></section>`;
}

function asideHtml({ antenna: a, agents, allAgents, checks }) {
  const closed = a.status === 'CLOSED';
  const others = allAgents.filter((u) => u.antennaId !== a.id);
  const options = (sel) => `<option value="">Aucun</option>${agents.map((u) => `<option value="${esc(u.id)}" ${u.id === sel ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}`;
  const targets = listAntennas().filter((x) => x.id !== a.id && (x.status || 'ACTIVE') === 'ACTIVE');
  const history = (a.statusHistory || []).slice(-4).reverse();
  return `
    <section class="card"><div class="card-header"><h3>Encadrement</h3></div>
      <form id="staff-form" class="admin-form">
        <label class="field">Chef d’antenne<select class="select" name="chefUserId" ${closed ? 'disabled' : ''}>${options(a.chef?.userId)}</select></label>
        ${!a.chef?.userId && a.chef?.name ? `<p class="hint">Saisie libre actuelle : ${esc(a.chef.name)}. Choisissez un compte pour la remplacer.</p>` : ''}
        <label class="field">Adjoint<select class="select" name="adjointUserId" ${closed ? 'disabled' : ''}>${options(a.adjoint?.userId)}</select></label>
        ${closed ? '' : `<button class="btn btn-secondary btn-block" type="submit">${icon('check', { size: 15 })} Enregistrer l’encadrement</button>`}
      </form></section>
    <section class="card"><div class="card-header"><h3>Comptes de l’antenne</h3><span class="text-muted">${agents.length}</span></div>
      ${agents.length ? `<ul class="sup-list">${agents.map((u) => `<li><span>${esc(u.name)}<small>${esc(u.email)}</small></span><b>${u.id === a.chef?.userId ? 'Chef' : u.id === a.adjoint?.userId ? 'Adjoint' : 'Agent'}</b></li>`).join('')}</ul>` : '<p class="sup-empty">Aucun compte rattaché.</p>'}
      ${closed ? '' : `<div class="d2-stack-actions"><button type="button" class="btn btn-secondary btn-sm" id="acc-open">${icon('userPlus', { size: 14 })} Ouvrir un compte</button>${others.length ? `<button type="button" class="btn btn-ghost btn-sm" id="acc-attach">${icon('arrowLeftRight', { size: 14 })} Rattacher un agent existant</button>` : ''}</div>`}
    </section>
    <section class="card"><div class="card-header"><h3>Statut</h3>${statusBadge(a.status)}</div>
      ${history.length ? `<ul class="sup-list">${history.map((h) => `<li><span>${esc(A.ANTENNA_STATUS_LABELS[h.status] || h.status)}<small>${esc(h.reason || '')}</small></span><b>${esc(formatDate(h.date || h.at))}</b></li>`).join('')}</ul>` : ''}
      ${closed ? '' : `
        <p class="hint d2-gap">Avant fermeture, les agents et le stock de numéros doivent être réaffectés ou repris.</p>
        ${checks.blocking.length ? `<div class="d2-checks">${checks.blocking.map((b) => `<span class="st-alert is-warning">${icon('alertCircle', { size: 14 })} ${esc(b.label)}</span>`).join('')}</div>` : '<span class="st-alert is-ok">' + icon('checkCircle', { size: 14 }) + ' Aucun obstacle à la fermeture</span>'}
        ${checks.warnings.map((w) => `<p class="hint">${esc(w.label)} · ${esc(w.action)}</p>`).join('')}
        <div class="d2-stack-actions">
          ${checks.blocking.some((b) => b.code === 'AGENTS') && targets.length ? `<button type="button" class="btn btn-secondary btn-sm" id="st-move">${icon('users', { size: 14 })} Réaffecter les agents</button>` : ''}
          ${checks.blocking.some((b) => b.code === 'STOCK') ? `<button type="button" class="btn btn-secondary btn-sm" id="st-stock">${icon('undo2', { size: 14 })} Reprendre le stock</button>` : ''}
          ${a.status === 'ACTIVE' ? `<button type="button" class="btn btn-secondary btn-sm" data-status="INACTIVE">${icon('power', { size: 14 })} Désactiver</button>` : ''}
          ${a.status === 'INACTIVE' ? `<button type="button" class="btn btn-secondary btn-sm" data-status="ACTIVE">${icon('refresh', { size: 14 })} Réactiver</button>` : ''}
          <button type="button" class="btn btn-danger btn-sm" data-status="CLOSED" ${checks.canClose ? '' : 'disabled title="Levez d’abord les obstacles ci-dessus"'}>${icon('archive', { size: 14 })} Fermer l’antenne</button>
        </div>`}
    </section>`;
}

function bindAside(container, { antenna: a, allAgents }) {
  const rerender = () => renderForm(container, a.id);
  container.querySelector('#staff-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    try { A.assignStaff(a.id, formValues(e.target)); toast({ type: 'success', title: 'Encadrement enregistré' }); rerender(); }
    catch (ex) { toast({ type: 'error', title: 'Affectation impossible', desc: ex.message }); }
  });
  container.querySelector('#acc-open')?.addEventListener('click', () => openModal({
    icon: 'userPlus', title: 'Ouvrir un compte d’antenne', text: a.name, confirmLabel: 'Ouvrir le compte',
    bodyHtml: `<form class="admin-form" id="acc-form"><label class="field">Nom complet<input class="input" name="name" required maxlength="100"></label><label class="field">Adresse e-mail<input class="input" name="email" type="email" required maxlength="160"></label><label class="checkbox-row"><input type="checkbox" name="asChef" ${a.chef?.userId ? '' : 'checked'}> Désigner ce compte comme chef d’antenne</label><p role="alert" class="error-msg" id="acc-error"></p></form>`,
    onConfirm: async ({ root, close }) => {
      const f = root.querySelector('#acc-form'); if (!f.reportValidity()) return;
      const btn = root.querySelector('[data-action="confirm"]'); btn.disabled = true;
      try {
        const v = formValues(f);
        const { code } = await A.openAntennaAccount(a.id, { name: v.name, email: v.email, asChef: !!v.asChef });
        close(); rerender();
        openModal({ icon: 'shield', title: 'Compte ouvert', text: 'Transmettez ce mot de passe initial au titulaire. Il ne sera plus affiché après fermeture.', bodyHtml: `<label class="field">Mot de passe initial<input class="input" readonly value="${esc(code)}"></label>`, hideCancel: true, confirmLabel: 'Fermer' });
      } catch (ex) { root.querySelector('#acc-error').textContent = ex.message; } finally { btn.disabled = false; }
    },
  }));
  container.querySelector('#acc-attach')?.addEventListener('click', () => {
    const others = allAgents.filter((u) => u.antennaId !== a.id);
    openModal({
      icon: 'arrowLeftRight', title: 'Rattacher un agent existant', text: `Le compte quittera son antenne actuelle et rejoindra ${a.name}. Sa session en cours sera fermée.`, confirmLabel: 'Rattacher',
      bodyHtml: `<label class="field">Compte d’agent<select class="select" id="att-user">${others.map((u) => `<option value="${esc(u.id)}">${esc(u.name)} · ${esc(u.antennaName || '')}</option>`).join('')}</select></label><p role="alert" class="error-msg" id="att-error"></p>`,
      onConfirm: async ({ root, close }) => {
        try { await A.attachAgent(a.id, root.querySelector('#att-user').value); close(); toast({ type: 'success', title: 'Agent rattaché' }); rerender(); }
        catch (ex) { root.querySelector('#att-error').textContent = ex.message; }
      },
    });
  });
  container.querySelector('#st-move')?.addEventListener('click', () => {
    const targets = listAntennas().filter((x) => x.id !== a.id && (x.status || 'ACTIVE') === 'ACTIVE');
    openModal({
      icon: 'users', title: 'Réaffecter les agents', text: 'Tous les comptes d’agent de cette antenne rejoindront l’antenne choisie.', confirmLabel: 'Réaffecter',
      bodyHtml: `<label class="field">Antenne d’accueil<select class="select" id="mv-target">${targets.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select></label><p role="alert" class="error-msg" id="mv-error"></p>`,
      onConfirm: async ({ root, close }) => {
        try { const moved = await A.reassignAgents(a.id, root.querySelector('#mv-target').value); close(); toast({ type: 'success', title: `${moved} agent(s) réaffecté(s)` }); rerender(); }
        catch (ex) { root.querySelector('#mv-error').textContent = ex.message; }
      },
    });
  });
  container.querySelector('#st-stock')?.addEventListener('click', () => promptAction({
    title: 'Reprendre le stock de l’antenne', text: 'Les numéros non vendus seront retirés ; les plages déjà vendues restent aux partenaires.', label: 'Motif de la reprise', confirmLabel: 'Reprendre', danger: true,
    onConfirm: (reason) => { try { const done = revokeAntennaStock(a.id, reason); toast({ type: 'success', title: `${done.length} stock(s) repris` }); rerender(); } catch (ex) { toast({ type: 'error', title: 'Reprise impossible', desc: ex.message }); } },
  }));
  container.querySelectorAll('[data-status]').forEach((btn) => btn.addEventListener('click', () => {
    const status = btn.dataset.status;
    const titles = { INACTIVE: 'Désactiver l’antenne', ACTIVE: 'Réactiver l’antenne', CLOSED: 'Fermer définitivement l’antenne' };
    const texts = { INACTIVE: 'L’antenne ne pourra plus vendre de plages ni recevoir de stock. Ses comptes restent actifs.', ACTIVE: 'L’antenne reprend toutes ses activités.', CLOSED: 'La fermeture est définitive. L’antenne disparaît de la carte ; son historique est conservé.' };
    openModal({
      icon: status === 'ACTIVE' ? 'refresh' : status === 'CLOSED' ? 'archive' : 'power', tone: status === 'CLOSED' ? 'error' : 'accent', danger: status === 'CLOSED',
      title: titles[status], text: texts[status], confirmLabel: titles[status].split(' ')[0],
      bodyHtml: `<form class="admin-form" id="status-form"><label class="field"><span>Motif <span class="req">*</span></span><textarea class="textarea" name="reason" rows="3" required maxlength="300"></textarea></label><label class="field"><span>Date d’effet <span class="req">*</span></span><input class="input" type="date" name="date" required value="${isoDay()}"></label><p role="alert" class="error-msg" id="status-error"></p></form>`,
      onConfirm: ({ root, close }) => {
        const f = root.querySelector('#status-form'); if (!f.reportValidity()) return;
        try { A.setAntennaStatus(a.id, { status, ...formValues(f) }); close(); toast({ type: 'success', title: `Antenne ${A.ANTENNA_STATUS_LABELS[status].toLowerCase()}` }); rerender(); }
        catch (ex) { root.querySelector('#status-error').textContent = ex.message; }
      },
    });
  }));
}
