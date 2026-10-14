import { icon } from '../core/icons.js';
import { escapeHtml, formatDateTime } from '../core/utils.js';
import { openModal, toast } from '../core/ui.js';
import {
  transporters, vehicles, drivers, thirdParties, merchandiseTypes, packagingTypes,
} from '../services/referentials.service.js';
// Lot d3 : localités, désactivation et retrait des fiches, cloisonnement par partenaire
import { localities, stateOf, REF_STATE_LABELS } from '../services/referentials.service.js';

const TABS = [
  { key: 'transporteurs', label: 'Transporteurs' },
  { key: 'vehicules', label: 'Véhicules' },
  { key: 'conducteurs', label: 'Conducteurs' },
  { key: 'tiers', label: 'Tiers' },
  { key: 'marchandises', label: 'Marchandises' },
  { key: 'emballages', label: 'Emballages' },
  { key: 'localites', label: 'Localités' },
];

const STATE_BADGE = { ACTIF: 'badge-success', INACTIF: 'badge-warning', RETIRE: 'badge-neutral' };

let activeTab = 'transporteurs';
let searchTerm = '';
let showRemoved = false;

export function render(container) {
  const cfg = getConfig();
  container.innerHTML = `
    <div class="page-header">
      <div>
        <span class="overline">Partenaire · Ressources</span>
        <h1>Référentiels</h1>
        <div class="subtitle">Transporteurs, véhicules, conducteurs, tiers et localités. Une fiche désactivée ou retirée n’est plus proposée à la saisie ; son historique est conservé.</div>
      </div>
    </div>
    <div class="page-header-rule"></div>
    <div class="tabs" id="ref-tabs">
      ${TABS.map((t) => `<button type="button" class="tab-btn ${t.key === activeTab ? 'active' : ''}" data-tab="${t.key}">${t.label}</button>`).join('')}
    </div>
    <div class="table-toolbar">
      <div class="search-input">${icon('search', { size: 15 })}<input type="text" id="ref-search" placeholder="Rechercher..." value="${escapeHtml(searchTerm)}"></div>
      <div class="row gap-2 lc-toolbar-end">
        ${cfg.service.owned ? `<label class="checkbox-row lc-inline-check"><input type="checkbox" id="ref-removed" ${showRemoved ? 'checked' : ''}> Afficher les fiches retirées</label>` : ''}
        <button type="button" class="btn btn-primary btn-sm" id="btn-add-ref">${icon('plus', { size: 14 })} Ajouter</button>
      </div>
    </div>
    ${cfg.service.owned ? `<p class="hint lc-scope">${icon('shield', { size: 13 })} Vous ne voyez et ne modifiez que les fiches enregistrées par votre entreprise.</p>` : ''}
    <div class="card" style="padding:0"><div class="table-wrap"><table class="data-table" id="ref-table"></table></div></div>
  `;

  container.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => { activeTab = btn.dataset.tab; searchTerm = ''; render(container); });
  });
  container.querySelector('#ref-search').addEventListener('input', (e) => { searchTerm = e.target.value.toLowerCase(); renderTable(container); });
  container.querySelector('#ref-removed')?.addEventListener('change', (e) => { showRemoved = e.target.checked; renderTable(container); });
  container.querySelector('#btn-add-ref').addEventListener('click', () => openForm(container, null));

  renderTable(container);
}

function transporterOptions() {
  return transporters.selectable().map((t) => ({ value: t.id, label: t.name }));
}

function getConfig() {
  switch (activeTab) {
    case 'transporteurs': return {
      service: transporters, columns: ['name', 'registre', 'contact', 'adresse'],
      headers: ['Nom', 'Registre', 'Contact', 'Adresse'],
      fields: [
        { key: 'name', label: 'Nom / raison sociale', required: true },
        { key: 'registre', label: 'Numéro de registre' },
        { key: 'contact', label: 'Contact' },
        { key: 'adresse', label: 'Adresse' },
      ],
    };
    case 'vehicules': return {
      service: vehicles, columns: ['immatriculation', 'transporterId', 'type', 'capaciteTonnes', 'ptac', 'carteTransport'],
      headers: ['Immatriculation', 'Transporteur', 'Type', 'Capacité (t)', 'PTAC (t)', 'Carte de transport'],
      fields: [
        { key: 'immatriculation', label: 'Immatriculation', required: true },
        { key: 'transporterId', label: 'Transporteur propriétaire', required: true, options: transporterOptions },
        { key: 'type', label: 'Type de véhicule' },
        { key: 'capaciteTonnes', label: 'Capacité (tonnes)', type: 'number' },
        { key: 'cartegrise', label: 'Carte grise (numéro)' },
        { key: 'ptac', label: 'PTAC — poids total en charge (tonnes)', type: 'number' },
        { key: 'dateMiseEnCirculation', label: 'Date de mise en circulation', type: 'date' },
        { key: 'carteTransport', label: 'Carte de transport (numéro)' },
      ],
    };
    case 'conducteurs': return {
      service: drivers, columns: ['nom', 'prenoms', 'transporterId', 'permis', 'piece', 'nationalite'],
      headers: ['Nom', 'Prénoms', 'Transporteur', 'Permis', 'Pièce d’identité', 'Nationalité'],
      fields: [
        { key: 'nom', label: 'Nom', required: true },
        { key: 'prenoms', label: 'Prénoms', required: true },
        { key: 'transporterId', label: 'Transporteur employeur', options: () => [{ value: '', label: 'Non précisé' }, ...transporterOptions()] },
        { key: 'permis', label: 'Numéro de permis', required: true },
        { key: 'dateDelivrancePermis', label: 'Date de délivrance du permis', type: 'date' },
        { key: 'typePiece', label: 'Type de pièce', select: ['CNI', 'PASSEPORT', 'CARTE_SEJOUR'] },
        { key: 'piece', label: 'Numéro de pièce d’identité' },
        { key: 'dateDelivrancePiece', label: 'Date de délivrance de la pièce', type: 'date' },
        { key: 'nationalite', label: 'Nationalité' },
      ],
    };
    case 'marchandises': return {
      service: merchandiseTypes, columns: ['nom', 'code'],
      headers: ['Nature de marchandise', 'Code'],
      fields: [
        { key: 'nom', label: 'Nature de marchandise', required: true },
        { key: 'code', label: 'Code référentiel' },
      ],
    };
    case 'emballages': return {
      service: packagingTypes, columns: ['nom', 'code'],
      headers: ['Type d’emballage', 'Code'],
      fields: [
        { key: 'nom', label: 'Type d’emballage', required: true },
        { key: 'code', label: 'Code référentiel' },
      ],
    };
    case 'localites': return {
      service: localities, columns: ['nom', 'type', 'region', 'pays'],
      headers: ['Localité', 'Type', 'Région', 'Pays'],
      fields: [
        { key: 'nom', label: 'Nom de la localité', required: true },
        { key: 'type', label: 'Type', select: ['Ville', 'Port', 'Poste frontière', 'Zone industrielle', 'Autre'] },
        { key: 'region', label: 'Région' },
        { key: 'pays', label: 'Pays', defaultValue: 'Côte d’Ivoire' },
        { key: 'code', label: 'Code référentiel' },
      ],
    };
    default: return {
      service: thirdParties, columns: ['raisonSociale', 'type', 'registre', 'adresse'],
      headers: ['Raison sociale', 'Type', 'Registre', 'Adresse'],
      fields: [
        { key: 'raisonSociale', label: 'Raison sociale', required: true },
        { key: 'type', label: 'Type', select: ['EXPEDITEUR', 'DESTINATAIRE', 'LES_DEUX'] },
        { key: 'registre', label: 'Numéro de registre' },
        { key: 'adresse', label: 'Adresse' },
        { key: 'contact', label: 'Contact' },
      ],
    };
  }
}

function itemsFor(cfg) {
  return cfg.service.owned ? cfg.service.list({ includeRemoved: showRemoved }) : cfg.service.list();
}

function cellValue(item, column) {
  if (column === 'transporterId') return transporters.list({ includeRemoved: true }).find((t) => t.id === item.transporterId)?.name || '—';
  const value = item[column];
  return value === undefined || value === null || value === '' ? '—' : String(value).replaceAll('_', ' ');
}

function renderTable(container) {
  const cfg = getConfig();
  const items = itemsFor(cfg).filter((item) => {
    if (!searchTerm) return true;
    return cfg.columns.some((c) => cellValue(item, c).toLowerCase().includes(searchTerm));
  });
  const table = container.querySelector('#ref-table');

  if (items.length === 0) {
    table.innerHTML = `<tr><td class="table-empty">${icon('inbox', { size: 32 })}<div>Aucun résultat</div></td></tr>`;
    return;
  }

  table.innerHTML = `
    <thead><tr>${cfg.headers.map((h) => `<th scope="col">${h}</th>`).join('')}<th scope="col">État</th><th scope="col" class="text-right">Actions</th></tr></thead>
    <tbody>
      ${items.map((item) => {
        const st = stateOf(item);
        const actions = [
          st !== 'RETIRE' ? `<button type="button" class="btn btn-ghost btn-sm" data-act="edit">${icon('edit', { size: 14 })} Modifier</button>` : '',
          st === 'ACTIF' ? `<button type="button" class="btn btn-ghost btn-sm" data-act="deactivate">${icon('ban', { size: 14 })} Désactiver</button>` : '',
          st === 'INACTIF' ? `<button type="button" class="btn btn-ghost btn-sm" data-act="reactivate">${icon('rotateCcw', { size: 14 })} Réactiver</button>` : '',
          cfg.service.owned && st !== 'RETIRE' ? `<button type="button" class="btn btn-ghost btn-sm" data-act="remove">${icon('trash', { size: 14 })} Retirer</button>` : '',
          (item.historique || []).length ? `<button type="button" class="btn btn-ghost btn-sm" data-act="history">${icon('history', { size: 14 })} Historique</button>` : '',
        ].join('');
        return `
        <tr data-id="${escapeHtml(item.id)}">
          ${cfg.columns.map((c) => `<td>${escapeHtml(cellValue(item, c))}</td>`).join('')}
          <td><span class="badge ${STATE_BADGE[st]}"><span class="badge-dot"></span>${REF_STATE_LABELS[st]}</span></td>
          <td class="text-right"><div class="lc-row-actions">${actions}</div></td>
        </tr>`;
      }).join('')}
    </tbody>
  `;

  table.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.closest('tr').dataset.id;
      const item = itemsFor(cfg).find((i) => i.id === id);
      const act = btn.dataset.act;
      if (act === 'edit') openForm(container, item);
      else if (act === 'history') openHistory(item);
      else if (act === 'reactivate') run(container, () => cfg.service.reactivate(id), 'Fiche réactivée');
      else openStateForm(container, cfg, item, act);
    });
  });
}

function run(container, fn, title) {
  try { fn(); toast({ type: 'success', title }); renderTable(container); }
  catch (err) { toast({ type: 'error', title: 'Action impossible', desc: err.message }); }
}

function openStateForm(container, cfg, item, act) {
  const remove = act === 'remove';
  openModal({
    icon: remove ? 'trash' : 'ban', tone: remove ? 'error' : 'accent', danger: remove,
    title: remove ? 'Retirer cette fiche ?' : 'Désactiver cette fiche ?',
    confirmLabel: remove ? 'Retirer' : 'Désactiver',
    bodyHtml: `
      <p class="ta-hint">${remove
        ? 'Le retrait est définitif : la fiche n’est plus proposée à la saisie et ne peut plus être modifiée. Les DUT qui la mentionnent restent inchangés et son historique est conservé.'
        : 'La fiche n’est plus proposée à la saisie tant qu’elle n’est pas réactivée. Les DUT existants restent inchangés.'}</p>
      <div class="field">
        <label for="ref-motif">Motif${remove ? ' <span class="req">*</span>' : ''}</label>
        <textarea class="textarea" id="ref-motif" rows="3" maxlength="300"></textarea>
      </div>
      <p class="ta-error" role="alert"></p>`,
    onConfirm: ({ root, close }) => {
      try {
        const motif = root.querySelector('#ref-motif').value;
        if (remove) cfg.service.remove(item.id, motif); else cfg.service.deactivate(item.id, motif);
        close();
        toast({ type: 'success', title: remove ? 'Fiche retirée' : 'Fiche désactivée' });
        renderTable(container);
      } catch (err) { root.querySelector('.ta-error').textContent = err.message; }
    },
  });
}

const HISTORY_LABELS = { CREATION: 'Création', MODIFICATION: 'Modification', DESACTIVATION: 'Désactivation', REACTIVATION: 'Réactivation', RETRAIT: 'Retrait' };

function openHistory(item) {
  openModal({
    icon: 'history', title: 'Historique de la fiche', confirmLabel: 'Fermer', hideCancel: true, large: true,
    bodyHtml: `<ul class="dd-modal-list">${[...(item.historique || [])].reverse().map((h) => `
      <li><span class="dd-modal-icon" aria-hidden="true">${icon('clock', { size: 16 })}</span>
      <div><strong>${escapeHtml(HISTORY_LABELS[h.action] || h.action)}</strong><small>${formatDateTime(h.at)} · ${escapeHtml(h.by)}${h.motif ? ` · ${escapeHtml(h.motif)}` : ''}</small></div></li>`).join('')}</ul>`,
  });
}

function openForm(container, item) {
  const cfg = getConfig();
  const isEdit = !!item;
  openModal({
    icon: isEdit ? 'edit' : 'plus',
    title: isEdit ? 'Modifier la fiche' : 'Ajouter une fiche',
    confirmLabel: isEdit ? 'Enregistrer' : 'Ajouter',
    bodyHtml: cfg.fields.map((f) => {
      const current = item?.[f.key] ?? (isEdit ? '' : f.defaultValue ?? '');
      const options = f.options ? f.options() : f.select ? f.select.map((v) => ({ value: v, label: v.replaceAll('_', ' ') })) : null;
      return `
      <div class="field">
        <label for="ref-field-${f.key}">${f.label}${f.required ? ' <span class="req">*</span>' : ''}</label>
        ${options ? `
          <div class="select-wrap">
            <select class="select" id="ref-field-${f.key}">
              ${options.map((opt) => `<option value="${escapeHtml(opt.value)}" ${current === opt.value ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`).join('')}
            </select>
            ${icon('chevronDown', { size: 14 })}
          </div>
        ` : `<input class="input" type="${f.type || 'text'}" id="ref-field-${f.key}" value="${escapeHtml(current)}">`}
      </div>`;
    }).join('') + '<p class="ta-error" role="alert"></p>',
    onConfirm: ({ close, root }) => {
      const data = {};
      let missing = false;
      cfg.fields.forEach((f) => {
        const val = root.querySelector(`#ref-field-${f.key}`).value;
        if (f.required && !val) missing = true;
        data[f.key] = f.type === 'number' ? Number(val) || 0 : val;
      });
      if (missing) { toast({ type: 'error', title: 'Champs obligatoires manquants' }); return; }
      try {
        if (isEdit) cfg.service.update(item.id, data);
        else cfg.service.add(data);
      } catch (err) { root.querySelector('.ta-error').textContent = err.message; return; }
      toast({ type: 'success', title: isEdit ? 'Fiche modifiée' : 'Fiche ajoutée' });
      close();
      renderTable(container);
    },
  });
}
