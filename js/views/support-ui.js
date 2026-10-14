// Lot d4 : fragments d'interface communs (calqués sur l'écran Supervision : en-tête, KPI, tableau, fiche).
import { icon } from '../core/icons.js';
import { escapeHtml as esc, formatDateTime } from '../core/utils.js';
import { toast } from '../core/ui.js';

export { esc };

export const badge = (cls, label, dot = true) => `<span class="badge ${cls}">${dot ? '<span class="badge-dot"></span>' : ''}${esc(label)}</span>`;

const TONES = ['navy', 'blue', 'amber', 'green', 'rose', 'violet'];
export function kpis(items) {
  return `<div class="kpi-grid sup-kpis">${items.map(([label, value, iconName, tone], i) => {
    const t = tone || TONES[i % 4];
    return `<div class="kpi-card sup-kpi-card"><div class="kpi-label">${esc(label)}<span class="kpi-icon" style="background:var(--sq-${t}-bg);color:var(--sq-${t}-fg)">${icon(iconName, { size: 13 })}</span></div><div class="kpi-value">${esc(String(value))}</div></div>`;
  }).join('')}</div>`;
}

export function pageHeader({ overline, title, subtitle = '', actions = '', back = null, badges = '' }) {
  return `<div class="page-header"><div>${back ? `<a class="sup-back" href="#${back[0]}">${icon('chevronLeft', { size: 14 })} ${esc(back[1])}</a>` : `<span class="overline">${esc(overline)}</span>`}<h1>${esc(title)}</h1>${subtitle ? `<div class="subtitle">${subtitle}</div>` : ''}${badges ? `<div class="sup-badges">${badges}</div>` : ''}</div>${actions ? `<div class="row gap-2 d4-actions">${actions}</div>` : ''}</div><div class="page-header-rule"></div>`;
}

export const options = (entries, value = '', placeholder = null) => `${placeholder !== null ? `<option value="">${esc(placeholder)}</option>` : ''}${entries.map(([id, label]) => `<option value="${esc(id)}" ${id === value ? 'selected' : ''}>${esc(label)}</option>`).join('')}`;

/** Carte tableau : titre, outils (recherche + listes de filtre), corps rempli par `draw`. */
export function tableCard({ title, hint, filters = '', searchPlaceholder = 'Rechercher…', head }) {
  return `<section class="card sup-table-card"><div class="sup-table-head"><div><h2>${esc(title)}</h2><p>${esc(hint)}</p></div><div class="sup-table-tools d4-tools"><label class="search-input ant-search">${icon('search', { size: 16 })}<input type="search" data-role="query" placeholder="${esc(searchPlaceholder)}" aria-label="${esc(searchPlaceholder)}" autocomplete="off"></label>${filters}<span class="sup-count" data-role="count"></span></div></div><div class="table-wrap"><table class="data-table sup-table"><thead><tr>${head.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}<th></th></tr></thead><tbody data-role="rows"></tbody></table></div></section>`;
}

const normalize = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Branche recherche + filtres + clic sur ligne d'une carte tableau. */
export function wireTable(container, { rows, columns, filters = {}, haystack, open, empty = 'Aucun élément.' }) {
  const tbody = container.querySelector('[data-role="rows"]');
  const queryInput = container.querySelector('[data-role="query"]');
  const draw = () => {
    const q = normalize(queryInput.value).trim();
    const active = Object.entries(filters).map(([sel, test]) => [container.querySelector(sel)?.value || '', test]);
    const shown = rows.filter((r) => (!q || normalize(haystack(r)).includes(q)) && active.every(([v, test]) => !v || test(r, v)));
    container.querySelector('[data-role="count"]').textContent = `${shown.length} / ${rows.length}`;
    tbody.innerHTML = shown.length
      ? shown.map((r) => `<tr data-id="${esc(r.id)}" tabindex="0">${columns.map((c) => `<td>${c(r)}</td>`).join('')}<td class="text-right"><span class="sup-open">${icon('chevronRight', { size: 15 })}</span></td></tr>`).join('')
      : `<tr><td class="table-empty" colspan="${columns.length + 1}">${esc(empty)}</td></tr>`;
  };
  queryInput.addEventListener('input', draw);
  Object.keys(filters).forEach((sel) => container.querySelector(sel)?.addEventListener('change', draw));
  tbody.addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) open(tr.dataset.id); });
  tbody.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const tr = e.target.closest('tr[data-id]'); if (tr) open(tr.dataset.id); } });
  draw();
}

export const cell2 = (main, sub = '') => `<strong>${esc(main)}</strong>${sub ? `<small class="d4-sub">${esc(sub)}</small>` : ''}`;

export function identity(pairs) {
  return `<dl class="sup-identity">${pairs.filter(([, v]) => v != null && v !== '').map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
}

/** Historique ou fil de messages, au format de la frise existante. */
export function timeline(items, empty = 'Aucun élément.') {
  if (!items.length) return `<p class="text-muted">${esc(empty)}</p>`;
  return `<div class="timeline">${items.map((e) => `<div class="timeline-item"><span class="timeline-dot ${e.done === false ? '' : 'done'}"></span><div class="timeline-content"><strong>${esc(e.title)}</strong><div class="meta">${formatDateTime(e.at)}${e.by ? ` · ${esc(e.by)}` : ''}</div>${e.note ? `<p class="note preserve-lines">${esc(e.note)}</p>` : ''}</div></div>`).join('')}</div>`;
}

export const card = (title, body, extra = '') => `<div class="card"><div class="card-header"><h3>${esc(title)}</h3>${extra}</div>${body}</div>`;

/** Champs de formulaire pour les fenêtres modales (classes de forms.css). */
export const field = (id, label, control, { required = false, hint = '' } = {}) => `<div class="field"><label for="${id}">${esc(label)}${required ? ' <span class="req">*</span>' : ''}</label>${control}${hint ? `<small class="hint">${esc(hint)}</small>` : ''}</div>`;
export const selectCtl = (id, entries, value = '', placeholder = null) => `<select class="select" id="${id}">${options(entries, value, placeholder)}</select>`;
export const inputCtl = (id, attrs = '') => `<input class="input" id="${id}" ${attrs}>`;
export const textareaCtl = (id, placeholder = '', rows = 3) => `<textarea class="textarea" id="${id}" rows="${rows}" placeholder="${esc(placeholder)}"></textarea>`;

/** Exécute une action de service et affiche le résultat (succès ou motif du refus). */
export function attempt(fn, success, after) {
  try {
    const result = fn();
    if (success) toast({ type: 'success', title: success });
    after?.(result);
    return true;
  } catch (err) {
    toast({ type: 'error', title: 'Action impossible', desc: err.message });
    return false;
  }
}

export function hoursLabel(h) {
  const abs = Math.abs(h);
  if (abs < 1) return 'moins d’une heure';
  if (abs < 48) return `${Math.floor(abs)} h`;
  return `${Math.floor(abs / 24)} j`;
}

export function secondsLabel(s) {
  if (!s) return '—';
  if (s < 60) return `${s} s`;
  return s % 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s` : `${s / 60} min`;
}

export function notFound(container, back, label) {
  container.innerHTML = `<div class="empty-state">${icon('alertCircle', { size: 40 })}<h3>Élément introuvable</h3><p>Il n’existe pas ou il est hors de votre périmètre.</p><a class="btn btn-secondary" href="#${back}">${esc(label)}</a></div>`;
}
