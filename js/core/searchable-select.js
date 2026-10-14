// Lot d0 : recherche intégrée à toutes les listes de choix.
//
// Amélioration progressive, globale et idempotente des <select> natifs :
// - le <select> reste dans le DOM (même id, name, value, événements « change », required, étiquette),
//   masqué visuellement mais toujours lu par le code des vues, FormData et les tests ;
// - à côté, un déclencheur affiche le libellé choisi ; il ouvre un panneau avec, en tête,
//   un champ « Rechercher… » puis la liste filtrée (casse et accents ignorés) ;
// - clavier complet, motif ARIA combobox / listbox, synchronisation avec la valeur native.
// Un observateur posé à l'amorçage améliore tout <select> inséré (pages, modales, filtres).
// Les listes de choix non natives (comptes de démonstration) reçoivent le même champ de recherche.
import { icon } from './icons.js';
import { escapeHtml } from './utils.js';

/* ===== Fonctions pures (testées sans navigateur) ===== */

/** Texte comparable : minuscules, sans accents, apostrophes et espaces unifiés. */
export function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[’‘`´]/g, "'")
    .replace(/[\s ]+/g, ' ')
    .trim();
}

/** Vrai si chaque mot de la recherche figure dans le libellé (ordre libre). */
export function matchesQuery(label, query) {
  const q = normalizeText(query);
  if (!q) return true;
  const text = normalizeText(label);
  return q.split(' ').every((word) => text.includes(word));
}

/** Filtre une liste d'entrées { label, … } ; les groupes { label, options: [...] } gardent leurs options correspondantes. */
export function filterOptions(entries, query) {
  const out = [];
  for (const entry of entries) {
    if (Array.isArray(entry.options)) {
      const options = entry.options.filter((o) => matchesQuery(o.label, query));
      if (options.length) out.push({ ...entry, options });
    } else if (matchesQuery(entry.label, query)) out.push(entry);
  }
  return out;
}

/* ===== Lecture du <select> natif ===== */

const optionLabel = (o) => (o.label || o.textContent || '').replace(/\s+/g, ' ').trim();

function readEntries(select) {
  const entries = [];
  const toEntry = (o, groupDisabled = false) => ({
    index: o.index, value: o.value, label: optionLabel(o), selected: o.selected, disabled: o.disabled || groupDisabled,
  });
  for (const child of select.children) {
    if (child.tagName === 'OPTGROUP') {
      const options = [...child.children].filter((o) => o.tagName === 'OPTION' && !o.hidden).map((o) => toEntry(o, child.disabled));
      entries.push({ label: (child.label || '').trim(), options });
    } else if (child.tagName === 'OPTION' && !child.hidden) entries.push(toEntry(child));
  }
  return entries;
}

function nameOf(select) {
  const aria = select.getAttribute('aria-label');
  if (aria) return aria.trim();
  const ids = (select.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
  const byIds = ids.map((id) => document.getElementById(id)?.textContent || '').join(' ').trim();
  if (byIds) return byIds.replace(/\s+/g, ' ');
  const texts = [...(select.labels || [])].map((label) => {
    const clone = label.cloneNode(true);
    clone.querySelectorAll('select, .ss, .req, input, textarea, button, svg').forEach((n) => n.remove());
    return clone.textContent;
  });
  return texts.join(' ').replace(/\s+/g, ' ').replace(/\*\s*$/, '').trim() || select.getAttribute('title') || 'Liste de choix';
}

/* ===== Composant ===== */

const instances = new Map();
let sequence = 0;
let openInstance = null;
const PROTO = typeof HTMLSelectElement !== 'undefined' ? HTMLSelectElement.prototype : null;
const NATIVE_CLASSES = ['select', 'input', 'plan-pill-select'];

class SearchableSelect {
  constructor(select) {
    this.select = select;
    this.n = ++sequence;
    this.query = '';
    this.activeIndex = -1;
    this.validating = false;
    this.saved = { tabindex: select.getAttribute('tabindex'), ariaHidden: select.getAttribute('aria-hidden') };

    // Élément neutre (aucune règle existante du type « .plan-pill>span » ne s'y applique).
    this.wrapper = document.createElement('liste-choix');
    this.wrapper.className = 'ss';
    select.before(this.wrapper);
    this.wrapper.append(select);

    this.trigger = document.createElement('button');
    this.trigger.type = 'button';
    this.trigger.id = `ss-trigger-${this.n}`;
    this.trigger.setAttribute('role', 'combobox');
    this.trigger.setAttribute('aria-haspopup', 'listbox');
    this.trigger.setAttribute('aria-expanded', 'false');
    this.trigger.setAttribute('aria-controls', `ss-list-${this.n}`);
    this.trigger.innerHTML = `<span class="ss-value"></span>${icon('chevronDown', { size: 14, cls: 'ss-chevron' })}`;
    this.wrapper.append(this.trigger);

    select.setAttribute('tabindex', '-1');
    select.setAttribute('aria-hidden', 'true');
    this.interceptValue();
    this.bind();
    this.refresh();
  }

  /** Une valeur posée par programme (select.value = …, selectedIndex) met le déclencheur à jour. */
  interceptValue() {
    if (!PROTO) return;
    const self = this;
    for (const prop of ['value', 'selectedIndex']) {
      const desc = Object.getOwnPropertyDescriptor(PROTO, prop);
      if (!desc?.set) continue;
      Object.defineProperty(this.select, prop, {
        configurable: true, enumerable: true,
        get() { return desc.get.call(this); },
        set(v) { desc.set.call(this, v); self.schedule(); },
      });
    }
  }

  bind() {
    const { select, trigger } = this;
    this.listeners = [];
    const on = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); this.listeners.push([target, type, fn, opts]); };

    on(trigger, 'click', () => (this.isOpen() ? this.close() : this.open()));
    on(trigger, 'keydown', (e) => this.onTriggerKey(e));
    // Le select masqué ne garde jamais le focus, sauf pendant le message de validation du navigateur.
    on(select, 'invalid', () => { this.validating = true; });
    on(select, 'blur', () => { this.validating = false; });
    on(select, 'focus', () => { if (!this.validating) trigger.focus({ preventScroll: true }); });
    on(select, 'keydown', (e) => this.onTriggerKey(e));
    on(select, 'change', () => this.refresh());
    on(select, 'input', () => this.refresh());
    for (const label of select.labels || []) {
      on(label, 'click', (e) => {
        if (this.wrapper.contains(e.target) && e.target !== select) return;
        e.preventDefault();
        if (label.contains(this.wrapper)) { if (this.isOpen()) this.close(); else this.open(); } else trigger.focus();
      });
    }
    if (select.form) on(select.form, 'reset', () => setTimeout(() => this.refresh()));

    this.observer = new MutationObserver(() => this.schedule());
    this.observer.observe(select, {
      childList: true, subtree: true, characterData: true, attributes: true,
      attributeFilter: ['disabled', 'label', 'selected', 'hidden', 'multiple', 'class', 'aria-label', 'title', 'value'],
    });
  }

  schedule() {
    if (this.pending) return;
    this.pending = true;
    queueMicrotask(() => { this.pending = false; if (this.select.isConnected) this.refresh(); });
  }

  isOpen() { return openInstance === this; }

  refresh() {
    const { select, trigger } = this;
    const classes = [...select.classList].filter((c) => c !== 'ss');
    if (!classes.some((c) => NATIVE_CLASSES.includes(c))) classes.push('select');
    trigger.className = ['ss-trigger', ...classes].join(' ');
    this.wrapper.classList.toggle('ss-multiple', select.multiple);
    const disabled = select.disabled || select.matches(':disabled');
    trigger.disabled = disabled;
    if (disabled && this.isOpen()) this.close({ focus: false });
    const chosen = [...select.selectedOptions].map(optionLabel);
    const text = select.multiple
      ? (chosen.length ? (chosen.length > 2 ? `${chosen.length} éléments choisis` : chosen.join(', ')) : 'Aucun élément choisi')
      : (chosen[0] ?? '');
    trigger.querySelector('.ss-value').textContent = text || ' ';
    trigger.setAttribute('aria-label', nameOf(select));
    if (select.required) trigger.setAttribute('aria-required', 'true'); else trigger.removeAttribute('aria-required');
    const title = select.getAttribute('title');
    if (title) trigger.title = title; else trigger.removeAttribute('title');
    if (this.isOpen()) this.renderList();
  }

  /* ----- Panneau ----- */

  buildPanel() {
    const name = escapeHtml(nameOf(this.select));
    const panel = document.createElement('div');
    panel.className = 'ss-panel';
    panel.id = `ss-panel-${this.n}`;
    panel.innerHTML = `
      <div class="ss-search">${icon('search', { size: 16 })}<input class="ss-search-input" type="text" inputmode="search" placeholder="Rechercher…" autocomplete="off" autocapitalize="off" spellcheck="false" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="ss-list-${this.n}" aria-label="Rechercher dans la liste ${name}"></div>
      <ul class="ss-list" role="listbox" id="ss-list-${this.n}" aria-label="${name}"${this.select.multiple ? ' aria-multiselectable="true"' : ''}></ul>
      <p class="ss-empty" role="status" hidden>Aucun résultat</p>`;
    this.input = panel.querySelector('.ss-search-input');
    this.list = panel.querySelector('.ss-list');
    this.empty = panel.querySelector('.ss-empty');
    // Le focus reste dans le champ de recherche pendant un clic dans la liste.
    panel.addEventListener('mousedown', (e) => { if (e.target !== this.input) e.preventDefault(); });
    panel.addEventListener('click', (e) => {
      const opt = e.target.closest('.ss-option');
      if (opt && !opt.hasAttribute('aria-disabled')) this.choose(Number(opt.dataset.index));
    });
    panel.addEventListener('mousemove', (e) => {
      const opt = e.target.closest('.ss-option:not([aria-disabled])');
      if (opt && Number(opt.dataset.index) !== this.activeIndex) this.setActive(opt, false);
    });
    this.input.addEventListener('input', () => { this.query = this.input.value; this.renderList(true); });
    this.input.addEventListener('keydown', (e) => this.onSearchKey(e));
    this.panel = panel;
  }

  renderList(resetActive = false) {
    const { select } = this;
    const entries = filterOptions(readEntries(select), this.query);
    const optionHtml = (o) => `<li class="ss-option" role="option" id="ss-opt-${this.n}-${o.index}" data-index="${o.index}" aria-selected="${o.selected}"${o.disabled ? ' aria-disabled="true"' : ''}>${icon('check', { size: 16, cls: 'ss-check' })}<span class="ss-option-text">${escapeHtml(o.label) || '&nbsp;'}</span></li>`;
    this.list.innerHTML = entries.map((entry, g) => (Array.isArray(entry.options)
      ? `<li class="ss-group" role="presentation"><div class="ss-group-label" id="ss-grp-${this.n}-${g}" role="presentation">${escapeHtml(entry.label)}</div><ul role="group" aria-labelledby="ss-grp-${this.n}-${g}">${entry.options.map(optionHtml).join('')}</ul></li>`
      : optionHtml(entry))).join('');
    const count = this.list.querySelectorAll('.ss-option').length;
    this.empty.hidden = count > 0;
    this.list.hidden = count === 0;
    const enabled = this.enabledOptions();
    let target = null;
    if (!resetActive) target = enabled.find((o) => Number(o.dataset.index) === this.activeIndex);
    if (!target && !resetActive) target = enabled.find((o) => o.getAttribute('aria-selected') === 'true');
    if (!target) target = enabled[0] || null;
    this.setActive(target);
  }

  enabledOptions() { return [...this.list.querySelectorAll('.ss-option:not([aria-disabled])')]; }

  setActive(el, scroll = true) {
    this.list.querySelectorAll('.ss-option.is-active').forEach((o) => o.classList.remove('is-active'));
    if (!el) { this.activeIndex = -1; this.input.removeAttribute('aria-activedescendant'); return; }
    el.classList.add('is-active');
    this.activeIndex = Number(el.dataset.index);
    this.input.setAttribute('aria-activedescendant', el.id);
    if (scroll) el.scrollIntoView({ block: 'nearest' });
  }

  moveActive(step, absolute = null) {
    const enabled = this.enabledOptions();
    if (!enabled.length) return;
    let i = enabled.findIndex((o) => Number(o.dataset.index) === this.activeIndex);
    if (absolute === 'first') i = 0;
    else if (absolute === 'last') i = enabled.length - 1;
    else i = i < 0 ? (step > 0 ? 0 : enabled.length - 1) : Math.max(0, Math.min(enabled.length - 1, i + step));
    this.setActive(enabled[i]);
  }

  open(initialQuery = '', focusOn = null) {
    if (this.trigger.disabled) return;
    if (openInstance && openInstance !== this) openInstance.close({ focus: false });
    if (!this.panel) this.buildPanel();
    this.query = initialQuery;
    this.input.value = initialQuery;
    this.activeIndex = -1;
    document.body.append(this.panel);
    openInstance = this;
    this.trigger.setAttribute('aria-expanded', 'true');
    this.wrapper.classList.add('is-open');
    this.renderList(!!initialQuery);
    if (focusOn) this.moveActive(0, focusOn);
    this.position();
    this.input.focus({ preventScroll: true });
    const hostLabel = this.wrapper.closest('label');
    this.docListeners = [
      [document, 'pointerdown', (e) => { if (!this.panel.contains(e.target) && !this.wrapper.contains(e.target) && !hostLabel?.contains(e.target)) this.close({ focus: false }); }, true],
      [window, 'resize', () => this.position()],
      [document, 'scroll', (e) => { if (!this.panel.contains(e.target)) this.position(); }, true],
      [document, 'focusin', (e) => { if (!this.panel.contains(e.target) && e.target !== this.trigger) this.close({ focus: false }); }],
    ];
    if (window.visualViewport) this.docListeners.push([window.visualViewport, 'resize', () => this.position()]);
    this.docListeners.forEach(([t, type, fn, opts]) => t.addEventListener(type, fn, opts));
  }

  close({ focus = true } = {}) {
    if (!this.isOpen()) return;
    openInstance = null;
    this.docListeners?.forEach(([t, type, fn, opts]) => t.removeEventListener(type, fn, opts));
    this.docListeners = null;
    this.panel.remove();
    this.trigger.setAttribute('aria-expanded', 'false');
    this.wrapper.classList.remove('is-open');
    if (focus && this.trigger.isConnected) this.trigger.focus({ preventScroll: true });
  }

  /** Panneau en position fixe sous (ou au-dessus de) la liste, toujours contenu dans l'écran. */
  position() {
    if (!this.isOpen()) return;
    const anchor = this.wrapper.closest('.plan-pill') || this.trigger;
    const r = anchor.getBoundingClientRect();
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = window.visualViewport?.height || window.innerHeight;
    const margin = 8, gap = 6;
    const width = Math.min(Math.max(r.width, 240), vw - margin * 2);
    const left = Math.min(Math.max(r.left, margin), vw - width - margin);
    const below = vh - r.bottom - gap - margin;
    const above = r.top - gap - margin;
    const style = this.panel.style;
    style.left = `${Math.round(left)}px`;
    style.width = `${Math.round(width)}px`;
    if (below >= 240 || below >= above) {
      style.top = `${Math.round(r.bottom + gap)}px`; style.bottom = 'auto';
      style.maxHeight = `${Math.max(120, Math.min(360, below))}px`;
    } else {
      style.top = 'auto'; style.bottom = `${Math.round(vh - r.top + gap)}px`;
      style.maxHeight = `${Math.max(120, Math.min(360, above))}px`;
    }
  }

  choose(index) {
    const { select } = this;
    const option = select.options[index];
    if (!option || option.disabled || option.parentElement?.disabled) return;
    if (select.multiple) {
      option.selected = !option.selected;
      this.fire();
      this.refresh();
      return;
    }
    const native = Object.getOwnPropertyDescriptor(PROTO, 'selectedIndex');
    const changed = native.get.call(select) !== index;
    if (changed) { native.set.call(select, index); this.refresh(); }
    this.close();
    if (changed) this.fire();
  }

  fire() {
    this.select.dispatchEvent(new Event('input', { bubbles: true }));
    this.select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /* ----- Clavier ----- */

  onTriggerKey(e) {
    if (this.trigger.disabled || e.ctrlKey || e.metaKey) return;
    const k = e.key;
    if (['ArrowDown', 'ArrowUp', 'Enter', ' ', 'F4'].includes(k)) { e.preventDefault(); this.open(); return; }
    if (k === 'Home' || k === 'End') { e.preventDefault(); this.open('', k === 'Home' ? 'first' : 'last'); return; }
    if (k.length === 1 && !e.altKey && k.trim()) { e.preventDefault(); this.open(k); }
  }

  onSearchKey(e) {
    const k = e.key;
    if (k === 'ArrowDown' && e.altKey) { e.preventDefault(); return; }
    if (k === 'ArrowUp' && e.altKey) { e.preventDefault(); if (this.activeIndex >= 0) this.choose(this.activeIndex); else this.close(); return; }
    const moves = { ArrowDown: [1], ArrowUp: [-1], PageDown: [10], PageUp: [-10], Home: [0, 'first'], End: [0, 'last'] };
    if (moves[k]) { e.preventDefault(); this.moveActive(...moves[k]); return; }
    if (k === 'Enter') { e.preventDefault(); if (this.activeIndex >= 0) this.choose(this.activeIndex); return; }
    if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); return; }
    if (k === 'Tab') { this.close(); }
  }

  destroy() {
    this.close({ focus: false });
    this.observer?.disconnect();
    this.listeners.forEach(([t, type, fn, opts]) => t.removeEventListener(type, fn, opts));
    delete this.select.value; delete this.select.selectedIndex;
    const { tabindex, ariaHidden } = this.saved;
    if (tabindex === null) this.select.removeAttribute('tabindex'); else this.select.setAttribute('tabindex', tabindex);
    if (ariaHidden === null) this.select.removeAttribute('aria-hidden'); else this.select.setAttribute('aria-hidden', ariaHidden);
    instances.delete(this.select);
  }
}

/** Améliore un <select> (sans effet s'il l'est déjà ou s'il porte data-native-select). */
export function enhanceSelect(select) {
  if (!PROTO || !(select instanceof HTMLSelectElement)) return null;
  if (instances.has(select)) return instances.get(select);
  if (!select.isConnected || select.closest('[data-native-select]')) return null;
  const instance = new SearchableSelect(select);
  instances.set(select, instance);
  return instance;
}

/* ===== Listes de choix non natives : même champ de recherche en tête ===== */

const CHOICE_LISTS = [
  { container: 'details.auth-demo-accounts', items: '.demo-account-btn', after: '.demo-hint', label: 'Rechercher un compte de démonstration' },
];
const enhancedLists = new WeakSet();

function enhanceChoiceList(container, { items, after, label }) {
  if (enhancedLists.has(container)) return;
  enhancedLists.add(container);
  const box = document.createElement('div');
  box.className = 'ss-search ss-search-inline';
  box.innerHTML = `${icon('search', { size: 16 })}<input class="ss-search-input" type="text" inputmode="search" placeholder="Rechercher…" autocomplete="off" spellcheck="false" aria-label="${escapeHtml(label)}">`;
  const empty = document.createElement('p');
  empty.className = 'ss-empty';
  empty.setAttribute('role', 'status');
  empty.hidden = true;
  empty.textContent = 'Aucun résultat';
  const anchor = container.querySelector(after) || container.querySelector('summary');
  anchor.after(box);
  const input = box.querySelector('input');
  const visible = () => [...container.querySelectorAll(items)].filter((b) => !b.hidden);
  input.addEventListener('input', () => {
    const all = [...container.querySelectorAll(items)];
    all.forEach((b) => { b.hidden = !matchesQuery(b.textContent, input.value); });
    const last = all[all.length - 1];
    if (last && empty.previousElementSibling !== last) last.after(empty);
    empty.hidden = visible().length > 0;
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); visible()[0]?.focus(); }
    if (e.key === 'Enter') { e.preventDefault(); visible()[0]?.click(); }
    if (e.key === 'Escape' && input.value) { e.preventDefault(); input.value = ''; input.dispatchEvent(new Event('input')); }
  });
  container.addEventListener('keydown', (e) => {
    const btn = e.target.closest?.(items);
    if (!btn || !['ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const list = visible();
    const i = list.indexOf(btn) + (e.key === 'ArrowDown' ? 1 : -1);
    if (i < 0) input.focus(); else list[Math.min(i, list.length - 1)].focus();
  });
}

/** Améliore toutes les listes de choix contenues dans `root` (ou `root` lui-même). */
export function enhanceAll(root = document) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  if (root.tagName === 'SELECT') { enhanceSelect(root); return; }
  root.querySelectorAll('select').forEach(enhanceSelect);
  for (const cfg of CHOICE_LISTS) {
    if (root.matches?.(cfg.container)) enhanceChoiceList(root, cfg);
    root.querySelectorAll(cfg.container).forEach((c) => enhanceChoiceList(c, cfg));
  }
}

let watching = false;

/** Observe le document : toute liste insérée (page, modale, filtre) est améliorée une seule fois. */
export function watchSelects(root = document.documentElement) {
  if (watching || !root || typeof MutationObserver === 'undefined') return;
  watching = true;
  new MutationObserver((records) => {
    let removed = false;
    for (const record of records) {
      for (const node of record.addedNodes) if (node.nodeType === 1) enhanceAll(node);
      if (record.removedNodes.length) removed = true;
    }
    if (removed) for (const [select, instance] of instances) if (!select.isConnected) instance.destroy();
  }).observe(root, { childList: true, subtree: true });
  enhanceAll(root);
}

// Installation automatique dans le navigateur (une seule ligne d'import dans js/app.js).
if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') watchSelects(document.documentElement);
