/**
 * global_search.js — CRM-wide search
 * Searches across: clients, invoices, contracts, onboarding
 * Shows a live dropdown with results grouped by category.
 * Navigate on click → destination page with ?q= param for auto-fill.
 */
(function () {
  'use strict';

  const DEBOUNCE_MS = 280;
  const MIN_CHARS   = 2;
  const MAX_PER_CAT = 4;

  // ── Category definitions ──────────────────────────────────────────
  const CATEGORIES = [
    {
      key:      'clients',
      label:    'Clienti',
      endpoint: '/clients/',
      page:     'admin_clients.html',
      icon:     `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"/></svg>`,
      title:    r => r.company_name || r.name || '—',
      sub:      r => [r.city, r.sector].filter(Boolean).join(' · '),
      badge:    r => r.status || '',
    },
    {
      key:      'invoices',
      label:    'Fatture',
      endpoint: '/invoices/',
      page:     'admin_invoices.html',
      icon:     `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg>`,
      title:    r => r.invoice_number ? `Fattura #${r.invoice_number}` : (r.number ? `Fattura #${r.number}` : 'Fattura'),
      sub:      r => [r.client_name, r.amount ? `€ ${Number(r.amount).toLocaleString('it-IT')}` : null].filter(Boolean).join(' · '),
      badge:    r => r.status || '',
    },
    {
      key:      'contracts',
      label:    'Contratti',
      endpoint: '/contracts/',
      page:     'admin_contracts.html',
      icon:     `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z"/></svg>`,
      title:    r => r.title || r.name || 'Contratto',
      sub:      r => [r.client_name, r.service_name].filter(Boolean).join(' · '),
      badge:    r => r.status || '',
    },
    {
      key:      'onboarding',
      label:    'Onboarding',
      endpoint: '/onboarding/',
      page:     'admin_onboarding.html',
      icon:     `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z"/></svg>`,
      title:    r => r.company_name || r.lead_name || r.name || '—',
      sub:      r => [r.referent, r.assigned_to_name].filter(Boolean).join(' · '),
      badge:    r => r.status || '',
    },
  ];

  // ── State ─────────────────────────────────────────────────────────
  let timer    = null;
  let lastQ    = '';
  let dropdown = null;
  let inputEl  = null;

  // ── Init ──────────────────────────────────────────────────────────
  function init() {
    inputEl = document.getElementById('global-search');
    if (!inputEl) return;

    // Wrap header-search for positioning
    const wrap = inputEl.closest('.header-search');
    if (wrap) wrap.classList.add('gsearch-wrap');

    // Create dropdown
    dropdown = document.createElement('div');
    dropdown.id        = 'gsearch-dropdown';
    dropdown.className = 'gsearch-dropdown';
    dropdown.setAttribute('role', 'listbox');
    (wrap || inputEl.parentElement).appendChild(dropdown);

    // Events
    inputEl.addEventListener('input', onInput);
    inputEl.addEventListener('keydown', onKeydown);
    document.addEventListener('click', onOutsideClick);
    inputEl.addEventListener('focus', () => {
      if (inputEl.value.trim().length >= MIN_CHARS) openDropdown();
    });
  }

  function onInput() {
    const q = inputEl.value.trim();
    clearTimeout(timer);
    if (q.length < MIN_CHARS) { close(); return; }
    timer = setTimeout(() => runSearch(q), DEBOUNCE_MS);
  }

  function onKeydown(e) {
    if (e.key === 'Escape') { close(); inputEl.blur(); }
  }

  function onOutsideClick(e) {
    if (!dropdown) return;
    if (!dropdown.contains(e.target) && e.target !== inputEl) close();
  }

  // ── Search ────────────────────────────────────────────────────────
  async function runSearch(q) {
    if (q === lastQ) return;
    lastQ = q;

    showLoading();

    // Parallel API calls
    const results = await Promise.allSettled(
      CATEGORIES.map(cat =>
        API.get(`${cat.endpoint}?search=${encodeURIComponent(q)}&limit=${MAX_PER_CAT}&company_id=${API.getCompanyId() || ''}`)
          .then(res => ({
            cat,
            items: Array.isArray(res) ? res : (res?.items ?? res?.data ?? []),
          }))
          .catch(() => ({ cat, items: [] }))
      )
    );

    render(q, results);
  }

  // ── Render ────────────────────────────────────────────────────────
  function render(q, results) {
    let html   = '';
    let total  = 0;

    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      const { cat, items } = r.value;
      if (!items.length) continue;

      html += `<div class="gsearch-section">
        <div class="gsearch-section-label">${cat.label}</div>`;

      for (const item of items.slice(0, MAX_PER_CAT)) {
        const title = cat.title(item) || '—';
        const sub   = cat.sub(item)   || '';
        const badge = cat.badge(item) || '';
        const href  = `${cat.page}?q=${encodeURIComponent(q)}`;

        html += `
        <a class="gsearch-item" href="${href}" tabindex="0">
          <div class="gsearch-item-icon">${cat.icon}</div>
          <div class="gsearch-item-body">
            <div class="gsearch-item-title">${hl(title, q)}</div>
            ${sub ? `<div class="gsearch-item-sub">${sub}</div>` : ''}
          </div>
          ${badge ? `<span class="gsearch-item-badge">${badge}</span>` : ''}
        </a>`;
        total++;
      }

      html += '</div>';
    }

    if (!total) {
      html = `<div class="gsearch-empty">Nessun risultato per "<strong>${escHtml(q)}</strong>"</div>`;
    }

    html += `<div class="gsearch-footer">
      Premi <kbd>↵</kbd> per aprire il primo risultato &nbsp;·&nbsp; <kbd>Esc</kbd> per chiudere
    </div>`;

    dropdown.innerHTML = html;
    openDropdown();
  }

  // ── Helpers ───────────────────────────────────────────────────────
  function hl(text, q) {
    if (!text || !q) return escHtml(text);
    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escHtml(text).replace(
      new RegExp(safe, 'gi'),
      m => `<mark class="gsearch-hl">${m}</mark>`
    );
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showLoading() {
    dropdown.innerHTML = '<div class="gsearch-loading">Ricerca…</div>';
    openDropdown();
  }

  function openDropdown() {
    dropdown.classList.add('open');
  }

  function close() {
    if (dropdown) {
      dropdown.classList.remove('open');
      dropdown.innerHTML = '';
    }
    lastQ = '';
    clearTimeout(timer);
  }

  // ── Auto-fill on destination page ─────────────────────────────────
  // If a page is loaded with ?q=, auto-fill its local search and trigger input
  function autoFillFromURL() {
    const q = new URLSearchParams(window.location.search).get('q');
    if (!q) return;
    // Try common local search IDs
    const ids = ['onb-search','cl-search','inv-search','ctr-search',
                 'doc-search','ren-search','svc-search','usr-search'];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) {
        el.value = q;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.focus();
        break;
      }
    }
  }

  // ── Bootstrap ─────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { init(); autoFillFromURL(); });
  } else {
    init();
    autoFillFromURL();
  }

  // Expose for external use
  window._globalSearchClose = close;
})();
