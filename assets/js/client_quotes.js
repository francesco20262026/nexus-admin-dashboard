/* ============================================================
   client_quotes.js — Client quotes list (Client Portal)
   ============================================================ */
'use strict';
(function () {
  Auth.guard('client');
  Auth.initUI();

  let ALL = [], filtered = [];
  let currentPage = 1;
  const PER_PAGE  = 10;

  const tbody = document.getElementById('quote-tbody');
  const search = document.getElementById('quote-search');
  const fSt    = document.getElementById('quote-filter-status');
  const info   = document.getElementById('quote-info');
  const pNav   = document.getElementById('quote-pagination');

  // ── Status helpers ───────────────────────────────────
  const QUOTE_STATUS = {
    draft:    { label: 'Bozza',    cls: 'pill-gray'    },
    sent:     { label: 'In Attesa',    cls: 'pill-warning' },
    accepted: { label: 'Accettato',cls: 'pill-success' },
    rejected: { label: 'Rifiutato', cls: 'pill-danger'  },
  };

  // ── Stat chips ─────────────────────────────────────────────
  function updateChips() {
    const pending  = ALL.filter(q => q.status === 'sent').length;
    const accepted = ALL.filter(q => q.status === 'accepted').length;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('chip-quotes-total',    ALL.length);
    set('chip-quotes-pending',  pending);
    set('chip-quotes-accepted', accepted);
  }

  // ── Load ───────────────────────────────────────────────────
  window._retryClientQuotes = load;
  async function load() {
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6" class="loading-row">Caricamento preventivi...</td></tr>`;
    let hasError = false;
    try {
      const qReq = API.Quotes ? API.Quotes.list() : API.get('/quotes');
      const res = await qReq;
      ALL = Array.isArray(res) ? res : (res?.items ?? res?.data ?? []);
    } catch (e) {
      hasError = true; ALL = [];
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--error-text,red);padding:20px;">
        Impossibile caricare i preventivi. <a href="#" onclick="window._retryClientQuotes();return false;">Riprova</a>
      </td></tr>`;
    } finally {
      updateChips();
      if (!hasError) applyFilters();
    }
  }

  // ── Filters ────────────────────────────────────────────────
  function applyFilters() {
    const q  = (search?.value || '').toLowerCase().trim();
    const st = fSt?.value || 'all';
    filtered = ALL.filter(i => {
      const matchS = st === 'all' || i.status === st;
      const num = (i.id || '').toLowerCase(); // Fallback identifier
      const matchQ = !q || num.includes(q);
      return matchQ && matchS;
    });
    const maxPage = Math.ceil(filtered.length / PER_PAGE) || 1;
    if (currentPage > maxPage) currentPage = maxPage;
    render();
  }

  if (search) search.addEventListener('input',  () => { currentPage = 1; applyFilters(); });
  if (fSt)    fSt.addEventListener('change',    () => { currentPage = 1; applyFilters(); });

  // ── Render ─────────────────────────────────────────────────
  function render() {
    if (!tbody) return;
    const slice = filtered.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);
    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--gray-400);padding:24px;">Nessun preventivo trovato.</td></tr>`;
      if (info) info.textContent = ''; if (pNav) pNav.innerHTML = ''; return;
    }

    tbody.innerHTML = slice.map(i => {
      const stInfo = QUOTE_STATUS[i.status] || QUOTE_STATUS.draft;
      const numStr = i.id.substring(0,6).toUpperCase();
      const amount = parseFloat(i.total || 0);

      const actionHtml = `<div style="display:flex;justify-content:flex-end;">
          <button class="btn btn-primary btn-sm" onclick="location.href='client_quote_detail.html?id=${i.id}'">Vedi Dettaglio</button>
        </div>`;

      return `<tr>
        <td><span class="fw-600">Preventivo ${numStr}</span></td>
        <td>${UI.date(i.created_at)}</td>
        <td>${i.valid_until ? UI.date(i.valid_until) : ''}</td>
        <td class="text-right fw-600">${UI.currency(amount)}</td>
        <td><span class="pill ${stInfo.cls}">${stInfo.label}</span></td>
        <td><div class="row-actions">${actionHtml}</div></td>
      </tr>`;
    }).join('');

    UI.pagination(pNav, info, currentPage, filtered.length, PER_PAGE, p => { currentPage = p; render(); });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    await I18n.init('lang-switcher-slot');
    load();
  });
})();
