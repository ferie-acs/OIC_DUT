// Lot d5 : petits gabarits partagés par les écrans de pilotage de la Direction générale.
// Ils reprennent à l'identique les classes de la supervision et des statistiques (en-tête, KPI, tableaux, fiches).
import { icon } from '../core/icons.js';
import { iconForLabel } from '../core/card-icons.js';
import { escapeHtml as esc, formatDate, formatDateTime, formatNumber } from '../core/utils.js';
import { openModal, toast } from '../core/ui.js';
import { getCurrentUser } from '../core/auth.js';
import { can } from '../core/permissions.js';

export { esc, icon, formatDate, formatDateTime, formatNumber, toast };

export const allowed = (permission) => can(getCurrentUser(), permission);
export const num = (v, d = 0) => (v == null || Number.isNaN(Number(v)) ? '—' : formatNumber(v, d));
export const withUnit = (v, unit) => (v == null ? '—' : `${num(v, Number.isInteger(Number(v)) ? 0 : 1)}${unit ? ` ${unit}` : ''}`);
export const pct = (v) => (v == null ? '—' : `${num(v, Number.isInteger(Number(v)) ? 0 : 1)} %`);
export const dateOr = (iso) => (iso ? formatDate(iso) : '—');

export function pageHeader({ overline, title, subtitle = '', back = null, badges = '', actions = '' }) {
  return `<div class="page-header">
      <div>${back ? `<a class="sup-back" href="#${esc(back.href)}">${icon('chevronLeft', { size: 14 })} ${esc(back.label)}</a>` : `<span class="overline">${esc(overline)}</span>`}<h1>${esc(title)}</h1>${subtitle ? `<div class="subtitle">${subtitle}</div>` : ''}${badges ? `<div class="sup-badges">${badges}</div>` : ''}</div>
      ${actions ? `<div class="row gap-2 d5-actions">${actions}</div>` : ''}
    </div>
    <div class="page-header-rule"></div>`;
}

export const kpi = (label, value, hint = '', tone = 'navy') => `<div class="kpi-card st-kpi" style="--kpi-tone:var(--sq-${tone}-fg)"><div class="kpi-label"><span>${esc(label)}</span><span class="st-kpi-icon" aria-hidden="true">${icon(iconForLabel(label), { size: 17 })}</span></div><div class="kpi-value" style="color:var(--sq-${tone}-fg)">${value}</div>${hint ? `<div class="kpi-hint">${hint}</div>` : ''}</div>`;
export const kpis = (cards) => `<div class="kpi-grid sup-kpis">${cards.join('')}</div>`;

export const tabs = (items, active) => `<div class="tabs-underline sup-tabs">${items.map(([href, label, ic]) => `<a class="tab-count-btn ${href === active ? 'active' : ''}" href="#${esc(href)}">${icon(ic, { size: 15 })} ${esc(label)}</a>`).join('')}</div>`;

export const badge = (label, tone = 'neutral') => `<span class="badge badge-${tone}"><span class="badge-dot"></span>${esc(label)}</span>`;

export const identity = (pairs) => `<dl class="sup-identity">${pairs.filter(([, v]) => v != null && v !== '').map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`;

export const journalHtml = (entries) => entries.length
  ? `<ul class="sup-journal">${entries.map((e) => `<li><span class="sup-journal-date">${formatDateTime(e.date || e.at)}</span><div><strong>${esc(e.label)}</strong>${e.newValue ? ` · ${esc(e.newValue)}` : ''}<small>${esc(e.userLabel || e.by || '—')}${e.note ? ` — ${esc(e.note)}` : ''}</small></div></li>`).join('')}</ul>`
  : '<p class="sup-empty">Aucune action enregistrée.</p>';

/** Tableau cliquable (supervision) : colonnes [clé, libellé, rendu(r), classe]. */
export function tableCard({ title, intro = '', tools = '', columns, rows, empty = 'Aucun élément.', link = null, id = '' }) {
  return `<section class="card sup-table-card"${id ? ` id="${id}"` : ''}>
      <div class="sup-table-head"><div><h2>${esc(title)}</h2>${intro ? `<p>${intro}</p>` : ''}</div>${tools ? `<div class="sup-table-tools">${tools}</div>` : ''}</div>
      <div class="table-wrap"><table class="data-table sup-table"><thead><tr>${columns.map(([, l, , cls]) => `<th scope="col" class="${cls || ''}">${esc(l)}</th>`).join('')}${link ? '<th></th>' : ''}</tr></thead>
      <tbody>${rows.length ? rows.map((r) => `<tr ${link ? `data-href="${esc(link(r))}" tabindex="0"` : ''}>${columns.map(([k, , fmt, cls]) => `<td class="${cls || ''}">${fmt ? fmt(r) : esc(r[k] ?? '—')}</td>`).join('')}${link ? `<td class="text-right"><span class="sup-open">${icon('chevronRight', { size: 15 })}</span></td>` : ''}</tr>`).join('') : `<tr><td class="table-empty" colspan="${columns.length + (link ? 1 : 0)}">${esc(empty)}</td></tr>`}</tbody></table></div>
    </section>`;
}

/** Simple tableau (cartes de fiche) sans en-tête de carte. */
export function plainTable(columns, rows, empty = 'Aucun élément.') {
  if (!rows.length) return `<p class="sup-empty">${esc(empty)}</p>`;
  return `<div class="table-wrap"><table class="data-table sup-table"><thead><tr>${columns.map(([, l, , cls]) => `<th scope="col" class="${cls || ''}">${esc(l)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${columns.map(([k, , fmt, cls]) => `<td class="${cls || ''}">${fmt ? fmt(r) : esc(r[k] ?? '—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

export function bindRowLinks(root) {
  const go = (tr) => { if (tr?.dataset.href) window.location.hash = tr.dataset.href; };
  root.querySelectorAll('tr[data-href]').forEach((tr) => {
    tr.addEventListener('click', (e) => { if (!e.target.closest('a,button')) go(tr); });
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(tr); });
  });
}

export const options = (items, selected = '', placeholder = null) => `${placeholder != null ? `<option value="">${esc(placeholder)}</option>` : ''}${items.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(selected ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}`;

export const field = (label, control, { required = false, hint = '' } = {}) => `<div class="field"><label>${esc(label)}${required ? ' <span class="req">*</span>' : ''}</label>${control}${hint ? `<span class="hint">${esc(hint)}</span>` : ''}</div>`;

/**
 * Formulaire en modale : `build(form)` peut brancher des événements ; `submit(values, form)` lève une erreur
 * lisible pour un refus, affichée sous le formulaire.
 */
export function formModal({ title, text = '', icon: ic = 'edit', body, confirmLabel = 'Enregistrer', danger = false, large = false, build = null, submit }) {
  const modal = openModal({
    title, text, icon: ic, tone: danger ? 'error' : 'accent', danger, large, confirmLabel,
    bodyHtml: `<form class="workspace-form d5-form" novalidate>${body}<p role="alert" class="error-msg d5-form-error"></p></form>`,
    onConfirm: ({ root, close }) => {
      const form = root.querySelector('form');
      try { submit(Object.fromEntries(new FormData(form)), form); close(); }
      catch (err) { root.querySelector('.d5-form-error').textContent = err.message; }
    },
  });
  const form = modal.root.querySelector('form');
  form.addEventListener('submit', (e) => e.preventDefault());
  if (build) build(form, modal);
  return modal;
}

/** Exécute une action de service et affiche le résultat ; renvoie true si elle a réussi. */
export function run(fn, success) {
  try { fn(); if (success) toast({ type: 'success', title: success }); return true; }
  catch (err) { toast({ type: 'error', title: err.message }); return false; }
}

export function downloadText(filename, text, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([`﻿${text}`], { type });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const notFound = (container, back) => { container.innerHTML = `<div class="empty-state">${icon('alertCircle', { size: 40 })}<h3>Élément introuvable</h3><p>Il a pu être supprimé ou n’est pas dans votre périmètre.</p><a class="btn btn-secondary" href="#${esc(back)}">Retour</a></div>`; };
