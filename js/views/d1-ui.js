// Lot d1 : petits gabarits partagés par les écrans des comptes et acteurs (motifs existants de l'application).
import { icon } from '../core/icons.js';
import { escapeHtml as esc, formatDate, formatDateTime } from '../core/utils.js';
import { ORG_STATUS_LABELS } from '../core/constants.js';
import { openModal, toast } from '../core/ui.js';

export { esc, formatDate, formatDateTime };
const ORG_TONE = { EN_ATTENTE: 'badge-warning', ACTIF: 'badge-success', SUSPENDU: 'badge-error', RESILIE: 'badge-neutral', REFUSE: 'badge-neutral' };
export const orgBadge = (s) => `<span class="badge ${ORG_TONE[s] || 'badge-neutral'}"><span class="badge-dot"></span>${esc(ORG_STATUS_LABELS[s] || s)}</span>`;
const ACCOUNT = { ACTIF: ['badge-success', 'Actif'], A_ACTIVER: ['badge-warning', 'À activer'], INACTIF: ['badge-error', 'Inactif'] };
export const accountBadge = (s) => `<span class="badge ${ACCOUNT[s]?.[0] || 'badge-neutral'}"><span class="badge-dot"></span>${ACCOUNT[s]?.[1] || esc(s)}</span>`;
export const accountState = (u) => (u.active === false ? 'INACTIF' : u.activationPending ? 'A_ACTIVER' : 'ACTIF');

export function pageHeader({ overline, title, subtitle = '', actions = '' }) {
  return `<div class="page-header"><div><span class="overline">${esc(overline)}</span><h1>${esc(title)}</h1>${subtitle ? `<div class="subtitle">${subtitle}</div>` : ''}</div>${actions ? `<div class="row gap-2 d1-actions">${actions}</div>` : ''}</div><div class="page-header-rule"></div>`;
}

export const tabsNav = (items, active) => `<div class="tabs-underline sup-tabs">${items.map(([key, label, href, ic, count]) => `<a class="tab-count-btn ${key === active ? 'active' : ''}" href="${href}">${ic ? icon(ic, { size: 15 }) : ''} ${esc(label)}${count ? ` <span class="badge badge-accent">${count}</span>` : ''}</a>`).join('')}</div>`;

export function kpis(list) {
  const tones = ['navy', 'blue', 'amber', 'green'];
  return `<div class="kpi-grid sup-kpis">${list.map(([label, value, ic], i) => `<div class="kpi-card sup-kpi-card"><div class="kpi-label">${esc(label)}<span class="kpi-icon" style="background:var(--sq-${tones[i % 4]}-bg);color:var(--sq-${tones[i % 4]}-fg)">${icon(ic || 'layers', { size: 13 })}</span></div><div class="kpi-value">${esc(String(value))}</div></div>`).join('')}</div>`;
}

export const identity = (pairs) => `<dl class="sup-identity">${pairs.filter(([, v]) => v != null && v !== '').map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`;

export const journalList = (entries) => entries.length
  ? `<ul class="sup-journal">${entries.map((e) => `<li><span class="sup-journal-date">${formatDateTime(e.date)}</span><div><strong>${esc(e.label || e.action)}</strong><small>${esc(e.userLabel || '—')}${e.note ? ` — ${esc(e.note)}` : ''}</small></div></li>`).join('')}</ul>`
  : '<p class="sup-empty">Aucune action enregistrée.</p>';

export const stateHistory = (list = []) => list.length
  ? `<ul class="sup-journal">${[...list].reverse().map((h) => `<li><span class="sup-journal-date">${formatDateTime(h.at)}</span><div><strong>${esc(ORG_STATUS_LABELS[h.to] || h.to)}</strong><small>${esc(h.by || '—')}${h.motif ? ` — ${esc(h.motif)}` : ''}</small></div></li>`).join('')}</ul>`
  : '<p class="sup-empty">Aucun changement d’état.</p>';

export const empty = (ic, title, text = '') => `<div class="empty-state">${icon(ic, { size: 40 })}<h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}</div>`;

/** Champ de formulaire au gabarit de l'application. */
export function field({ name, label, value = '', type = 'text', required = false, hint = '', options = null, attrs = '', full = false }) {
  const req = required ? ' <span class="req">*</span>' : '';
  const control = options
    ? `<select class="select" name="${name}" ${required ? 'required' : ''} ${attrs}>${options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`
    : type === 'textarea' ? `<textarea class="textarea" name="${name}" rows="3" ${required ? 'required' : ''} ${attrs}>${esc(value)}</textarea>`
      : `<input class="input" name="${name}" type="${type}" value="${esc(value)}" ${required ? 'required' : ''} ${attrs}>`;
  return `<div class="field${full ? ' d1-full' : ''}"><label>${esc(label)}${req}</label>${control}${hint ? `<small class="hint">${esc(hint)}</small>` : ''}</div>`;
}

/** Fenêtre de formulaire : erreurs affichées dans la fenêtre, bouton désactivé pendant l'enregistrement. */
export function formModal({ title, text = '', icon: ic = 'edit', fields, confirmLabel = 'Enregistrer', danger = false, large = false, onSubmit }) {
  return openModal({
    title, text, icon: ic, confirmLabel, danger, large, tone: danger ? 'error' : 'accent',
    bodyHtml: `<form class="workspace-form d1-form" novalidate>${fields}<p class="error-msg hidden" role="alert"></p></form>`,
    onConfirm: async ({ root, close }) => {
      const form = root.querySelector('form');
      const errorBox = form.querySelector('.error-msg');
      if (!form.reportValidity()) return;
      const btn = root.querySelector('[data-action="confirm"]');
      btn.disabled = true;
      try { await onSubmit(Object.fromEntries(new FormData(form)), form); close(); }
      catch (err) { errorBox.textContent = err.message; errorBox.classList.remove('hidden'); }
      finally { btn.disabled = false; }
    },
  });
}

/** Motif obligatoire pour toute décision qui change un état. */
export function reasonModal({ title, text, confirmLabel = 'Confirmer', danger = true, optional = false, onSubmit }) {
  return formModal({ title, text, icon: danger ? 'alertTriangle' : 'checkCircle', danger, confirmLabel, fields: field({ name: 'motif', label: optional ? 'Commentaire (facultatif)' : 'Motif', type: 'textarea', required: !optional, attrs: 'maxlength="300"' }), onSubmit: (v) => onSubmit(v.motif) });
}

export const fail = (err) => toast({ type: 'error', title: err.message });

export function downloadCsv(filename, textContent) {
  const blob = new Blob([`﻿${textContent}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Lecture d'un fichier joint en data URL (pièces du dossier). */
export function readFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) { resolve(null); return; }
    const reader = new FileReader();
    reader.onload = () => resolve({ fileName: file.name, size: file.size, dataUrl: reader.result });
    reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
    reader.readAsDataURL(file);
  });
}

export const simulatedNote = (txt) => `<div class="admin-note d1-sim">${icon('info', { size: 15 })} <span>${esc(txt)}</span></div>`;
