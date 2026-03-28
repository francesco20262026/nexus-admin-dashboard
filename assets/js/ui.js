/* ============================================================
   ui.js — Shared UI helpers for Nova CRM
   ============================================================ */

const UI = {

  // ── Toast notifications ───────────────────────────────────
  toast(message, type = 'info', duration = 3500) {
    window.showToast?.(message, type, duration);
  },

  // ── Status pill / Badge (Design System Standard) ─────────
  pill(status, customLabel) {
    if (!status) return '';
    const s = String(status).toLowerCase();
    const map = {
      active:   { cls: 'pill-active',   lbl: 'Attivo' },
      inactive: { cls: 'pill-inactive', lbl: 'Inattivo' },
      non_active: { cls: 'pill-inactive', lbl: 'Non attivo' },
      suspended:  { cls: 'pill-warning',  lbl: 'Sospeso' },
      insolvent:  { cls: 'pill-danger',   lbl: 'Insolvente' },
      ceased:     { cls: 'pill-gray',     lbl: 'Cessato' },
      draft:    { cls: 'pill-gray',     lbl: 'Bozza' },
      sent:     { cls: 'pill-warning',  lbl: 'Inviato' },
      signed:   { cls: 'pill-success',  lbl: 'Firmato' },
      expired:  { cls: 'pill-danger',   lbl: 'Scaduto' },
      pending_signature: { cls: 'pill-warning', lbl: 'In Attesa Firma' },
      in_progress: { cls: 'pill-warning', lbl: 'In Lavorazione' },
      ready:    { cls: 'pill-success',  lbl: 'Pronto' },
      converted: { cls: 'pill-primary', lbl: 'Convertito' },
      blocked:  { cls: 'pill-danger',   lbl: 'Bloccato' },
      failed:   { cls: 'pill-danger',   lbl: 'Fallito' },
      paid:     { cls: 'pill-success',  lbl: 'Pagato' },
      overdue:  { cls: 'pill-danger',   lbl: 'Scaduto' },
      pending:  { cls: 'pill-warning',  lbl: 'In Attesa' },
      accepted: { cls: 'pill-success',  lbl: 'Accettato' },
      rejected: { cls: 'pill-danger',   lbl: 'Rifiutato' },
      // ── Onboarding workflow states ─────────────────────────
      new:                  { cls: 'pill-new',     lbl: 'Nuovo' },
      quote_sent:           { cls: 'pill-warning',  lbl: 'Preventivo inviato' },
      quote_accepted:       { cls: 'pill-success',  lbl: 'Preventivo accettato' },
      contract_sent:        { cls: 'pill-warning',  lbl: 'Contratto inviato' },
      contract_signed:      { cls: 'pill-success',  lbl: 'Contratto firmato' },
      proforma_issued:      { cls: 'pill-primary',  lbl: 'Proforma emessa' },
      waiting_payment:      { cls: 'pill-warning',  lbl: 'In attesa pagamento' },
      payment_under_review: { cls: 'pill-warning',  lbl: 'Verifica pagamento' },
      converted_to_client:  { cls: 'pill-primary',  lbl: 'Convertito a cliente' },
      abandoned:            { cls: 'pill-danger',   lbl: 'Abbandonato' },
      cancelled:            { cls: 'pill-gray',     lbl: 'Annullato' },
    };
    
    const matched = map[s] || { cls: 'pill-gray', lbl: s.replace(/_/g, ' ') };
    // Priority: explicit customLabel > our map > I18n (fallback only if map has no entry)
    const i18nLabel = !map[s] ? window.I18n?.t(`status.${s}`) : null;
    const finalLbl = customLabel || matched.lbl || i18nLabel || s;

    return `<span class="pill ${matched.cls}">${finalLbl}</span>`;
  },

  // ── Avatar initials ───────────────────────────────────────
  avatar(name, id) {
    const initials = (name || '?').slice(0, 2).toUpperCase();
    const hue = id ? Math.abs(String(id).charCodeAt(0) * 53) % 360 : 120;
    return `<div class="avatar-sm" style="background:hsl(${hue},55%,55%)">${initials}</div>`;
  },

  // ── Format currency ───────────────────────────────────────
  currency(amount, currency = 'EUR') {
    if (amount == null) return '—';
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency }).format(amount);
  },

  // ── Format date ───────────────────────────────────────────
  date(val) {
    if (!val) return '—';
    try { return new Date(val).toLocaleDateString('it-IT'); } catch { return String(val); }
  },

  // ── Component Builders ────────────────────────────────────
  createEmptyState(title, description, iconSvg, actionsHtml = '') {
    const t = title || window.I18n?.t('common.no_data_title') || 'Nessun Risultato';
    const d = description || window.I18n?.t('common.no_data_desc') || 'Sembra non ci sia nulla qui.';
    const icon = iconSvg || `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"/></svg>`;
    return `<div class="empty-state">
      <div class="empty-state-icon">${icon}</div>
      <div class="empty-state-title">${t}</div>
      <div class="empty-state-text">${d}</div>
      ${actionsHtml ? `<div class="empty-state-actions">${actionsHtml}</div>` : ''}
    </div>`;
  },

  // ── Legacy Compatibility ────────────────────────────────────
  empty(message, colspan = 6) {
    const msg = message || window.I18n?.t('common.no_data') || 'Nessun dato trovato.';
    return `<tr><td colspan="${colspan}">${UI.createEmptyState(null, msg)}</td></tr>`;
  },

  errorState(message, retryScript = null) {
    const msg = message || window.I18n?.t('common.error_loading') || 'Errore durante il caricamento dei dati.';
    const btn = retryScript ? `<button class="btn btn-secondary" onclick="${retryScript}">Riprova</button>` : '';
    const icon = `<svg style="color:var(--color-danger)" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`;
    return `<div class="list-card fade-in">
        ${UI.createEmptyState('Attenzione', msg, icon, btn)}
      </div>`;
  },

  // ── Loading row / Skeleton ────────────────────────────────
  loading(colspan = 6) {
    const msg = window.I18n?.t('common.loading') || 'Caricamento…';
    return `<tr><td colspan="${colspan}"><div style="padding:16px;text-align:center;color:var(--gray-500);font-size:13px;">${msg}</div></td></tr>`;
  },

  skeletonCardList(count = 3) {
    const card = `<div class="list-card skeleton-list-card fade-in">
      <div class="list-card-header">
        <div class="skeleton-title skeleton"></div>
        <div class="skeleton-badge skeleton"></div>
      </div>
      <div class="list-card-body">
        <div class="skeleton-text short skeleton"></div>
        <div class="skeleton-text skeleton"></div>
      </div>
    </div>`;
    return Array(Math.max(1, count)).fill(card).join('');
  },

  // ── Pagination renderer ───────────────────────────────────
  pagination(container, infoEl, currentPage, total, perPage, onPageChange) {
    const pages = Math.ceil(total / perPage);
    const start = Math.min((currentPage - 1) * perPage + 1, total);
    const end   = Math.min(currentPage * perPage, total);
    if (infoEl) {
      infoEl.textContent = total
        ? (window.I18n?.t('common.page_info') || `${start}–${end} di ${total}`)
            .replace('{start}', start).replace('{end}', end).replace('{total}', total)
        : (window.I18n?.t('common.no_results') || 'Nessun risultato');
    }
    if (!container) return;
    container.innerHTML = '';
    if (pages <= 1) return;
    const btn = (label, page, disabled, active) => {
      const b = document.createElement('button');
      b.className = 'page-btn' + (active ? ' active' : '');
      b.innerHTML = label; b.disabled = disabled;
      b.onclick = () => onPageChange(page);
      container.appendChild(b);
    };
    btn('«', 1, currentPage === 1, false);
    for (let i = 1; i <= pages; i++) btn(i, i, false, i === currentPage);
    btn('»', pages, currentPage === pages, false);
  },

  // ── Tab counts ─────────────────────────────────────────────
  // Updates each [data-tab] button in tabBar to show "(n)" counts.
  // tabBar   : HTMLElement with child [data-tab] buttons
  // items    : the full data array (before any filtering)
  // keyFn    : (item) => string — returns the tab key for an item
  //            defaults to: r => r.status
  updateTabCounts(tabBar, items, keyFn) {
    if (!tabBar || !Array.isArray(items)) return;
    const fn = keyFn || (r => r.status);
    tabBar.querySelectorAll('[data-tab]').forEach(btn => {
      const tab = btn.dataset.tab;
      // Store original label once
      if (!btn.dataset.label) {
        btn.dataset.label = btn.textContent.replace(/\s*\(\d+\)$/, '').trim();
      }
      const base = btn.dataset.label;
      const count = tab === 'all'
        ? items.length
        : items.filter(x => fn(x) === tab).length;
      btn.textContent = count > 0 ? `${base} (${count})` : base;
    });
  },

  // ── Coming soon placeholder ───────────────────────────────
  comingSoon(title, subtitle) {
    const sub = subtitle || window.I18n?.t('common.coming_soon_sub') || 'Questo modulo sarà disponibile nella prossima fase.';
    return `
      <div class="coming-soon-state">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.2"
             stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round"
          d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626
             1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164
             1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5
             4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25
             3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867
             19.125h.008v.008h-.008v-.008Z"/></svg>
        <div class="coming-soon-title">${title}</div>
        <div class="coming-soon-sub">${sub}</div>
      </div>`;
  },
};

window.UI = UI;

// ── Debounce utility ─────────────────────────────────────────────────
// Usage: el.addEventListener('input', debounce(() => applyFilters(), 200));
window.debounce = function debounce(fn, ms = 200) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
};

window.SessionState = {
  save(pageKey, stateObject) {
    try {
      const activeCo = window.API?.getCompanyId ? window.API.getCompanyId() : 'all';
      const key = `nexus_st_${pageKey}_${activeCo}`;
      sessionStorage.setItem(key, JSON.stringify(stateObject));
    } catch(e) {}
  },
  load(pageKey) {
    try {
      const activeCo = window.API?.getCompanyId ? window.API.getCompanyId() : 'all';
      const key = `nexus_st_${pageKey}_${activeCo}`;
      const data = sessionStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch(e) { return null; }
  }
};

/* ── onPageReady ─────────────────────────────────────────────────────────
   Drop-in replacement for document.addEventListener('DOMContentLoaded', fn).
   Works on:
     - Initial full page load (waits for DOMContentLoaded if not yet fired)
     - SPA navigation via router.js (calls fn() immediately since DOM is ready)

   Usage: window.onPageReady(async () => { ... })
   ─────────────────────────────────────────────────────────────────────── */
window.onPageReady = function (fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn);
  } else {
    fn();
  }
};
