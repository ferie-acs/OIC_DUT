// Intégration : gabarits communs aux deux tableaux de bord de synthèse (antenne, Direction générale).
// Ils reprennent les classes existantes : section « Pilotage opérationnel » (ops-*), liste prioritaire
// (priority-link), barres des corridors (corridor-*), lignes de synthèse (ops-summary-line), tuiles KPI de la supervision.
import { icon } from '../core/icons.js';
import { escapeHtml as esc, formatNumber } from '../core/utils.js';
import { SYNTHESIS_PERIODS } from '../services/synthesis.service.js';

export const num = (v, d = 0) => (v == null || Number.isNaN(Number(v)) ? '—' : formatNumber(v, d));
export const pct = (v) => (v == null ? '—' : `${num(v, Number.isInteger(Number(v)) ? 0 : 1)} %`);
export const hours = (v) => (v == null ? '—' : `${num(v, 1)} h`);
export const fcfa = (v) => (v == null ? '—' : `${num(v)} F`);

/** En-tête de section avec sélecteur de période (même gabarit que « Pilotage opérationnel »). */
export function sectionHeading(title, subtitle, periodKind, extra = '') {
  return `<div class="ops-heading"><div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div>
    <div class="ops-tools"><select class="syn-period" aria-label="Période des indicateurs">${Object.entries(SYNTHESIS_PERIODS).map(([k, l]) => `<option value="${k}" ${k === periodKind ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>${extra}</div></div>`;
}

/** Carte de la grille opérationnelle : titre, sous-titre facultatif, badge ou lien à droite. */
export function opsCard(title, body, { subtitle = '', aside = '', cls = '' } = {}) {
  return `<article class="card ${cls}"><div class="card-header"><div><h3>${esc(title)}</h3>${subtitle ? `<div class="subtitle">${esc(subtitle)}</div>` : ''}</div>${aside}</div>${body}</article>`;
}

/** Liste de liens (gabarit « À traiter en priorité »). items : { href, icon, title, badge, detail }. */
export function linkList(items, empty) {
  if (!items.length) return `<p class="priority-empty">${icon('checkCircle')} ${esc(empty)}</p>`;
  return items.map((it) => `<a class="priority-link" href="#${esc(it.href)}"><span class="priority-icon">${icon(it.icon, { size: 18 })}</span><span><strong>${esc(it.title)}${it.badge ? ` ${it.badge}` : ''}</strong><small>${esc(it.detail || '')}</small></span>${icon('chevronRight', { size: 16 })}</a>`).join('');
}

/** Barres horizontales (gabarit « Principaux corridors »). rows : { label, value, display, ratio (0..1) }. */
export function barList(rows, empty) {
  if (!rows.length) return `<p class="priority-empty">${icon('info')} ${esc(empty)}</p>`;
  return `<div class="corridor-list">${rows.map((r) => `<div class="corridor"><div class="corridor-label"><strong>${esc(r.label)}</strong><span>${esc(r.display)}</span></div><div class="corridor-track"><div class="corridor-fill" style="width:${Math.max(0, Math.min(1, r.ratio || 0)) * 100}%"></div></div></div>`).join('')}</div>`;
}

/** Lignes « libellé · valeur » (gabarit de la carte « Cycle de traitement »). */
export function summaryLines(pairs) {
  return pairs.map(([label, value]) => `<div class="ops-summary-line"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
}

export const badge = (label, tone = 'neutral') => `<span class="badge badge-${tone}">${esc(label)}</span>`;
export const footnote = (html) => `<p class="ops-footnote">${html}</p>`;

export const ATTAINMENT_TONES = { ATTEINT: 'success', PROCHE: 'warning', NON_ATTEINT: 'error', SANS_RESULTAT: 'neutral' };
export const ATTAINMENT_LABELS = { ATTEINT: 'Atteint', PROCHE: 'Proche', NON_ATTEINT: 'Non atteint', SANS_RESULTAT: 'Sans résultat' };
