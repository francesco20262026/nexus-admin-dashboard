/* ============================================================
   NEXUS ADMIN — main.js
   Vanilla JS — no dependencies
   ============================================================ */

(function () {
  'use strict';

  /* ---- Helpers ---- */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  /* ======================================================
     0. SUPABASE CONFIGURATION
  ====================================================== */
  // Replace these with your actual Supabase project credentials
  const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
  const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
  
  // The 'supabase' object is globally available from the CDN script in index.html
  window.supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

  if (window.supabaseClient) {
    console.log('✅ Supabase initialized successfully!');
    // Example test query you can try later:
    // async function testDb() { const { data } = await window.supabaseClient.from('clients').select('*'); console.log(data); }
  } else {
    console.warn('⚠️ Supabase JS library not loaded. Check index.html script tag.');
  }

  /* ======================================================
     1. SIDEBAR TOGGLE (desktop collapse / mobile overlay)
  ====================================================== */
  const shell = $('#shell');
  const toggleBtn = $('#sidebar-toggle');

  function isMobile() { return window.innerWidth <= 900; }

  on(toggleBtn, 'click', () => {
    if (isMobile()) {
      shell.classList.toggle('mobile-open');
    } else {
      shell.classList.toggle('collapsed');
      localStorage.setItem('sidebar-collapsed', shell.classList.contains('collapsed'));
    }
  });

  // Restore saved collapsed state on desktop
  if (!isMobile() && localStorage.getItem('sidebar-collapsed') === 'true') {
    shell.classList.add('collapsed');
  }

  // Close mobile sidebar when clicking outside
  on(document, 'click', (e) => {
    if (isMobile() && shell.classList.contains('mobile-open')) {
      const sidebar = $('.sidebar');
      if (!sidebar.contains(e.target) && e.target !== toggleBtn) {
        shell.classList.remove('mobile-open');
      }
    }
  });

  /* ======================================================
     2. ACTIVE NAV ITEM
  ====================================================== */
  $$('.nav-item').forEach(item => {
    on(item, 'click', () => {
      $$('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
    });
  });

  /* ======================================================
     3. DROPDOWN MENUS
  ====================================================== */
  function closeAllDropdowns(except) {
    $$('.dropdown-wrap.open').forEach(d => {
      if (d !== except) d.classList.remove('open');
    });
  }

  $$('.dropdown-wrap').forEach(wrap => {
    const trigger = $('[data-dropdown-trigger]', wrap) || wrap.firstElementChild;
    on(trigger, 'click', (e) => {
      e.stopPropagation();
      const isOpen = wrap.classList.contains('open');
      closeAllDropdowns();
      wrap.classList.toggle('open', !isOpen);
    });
  });

  on(document, 'click', () => closeAllDropdowns());

  /* ======================================================
     4. MODALS
  ====================================================== */
  function openModal(id) {
    const overlay = $(`#${id}`);
    if (overlay) {
      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeModal(id) {
    const overlay = $(`#${id}`);
    if (overlay) {
      overlay.classList.remove('open');
      document.body.style.overflow = '';
    }
  }

  // Open triggers
  $$('[data-modal-open]').forEach(btn => {
    on(btn, 'click', () => openModal(btn.dataset.modalOpen));
  });

  // Close triggers
  $$('[data-modal-close]').forEach(btn => {
    on(btn, 'click', () => closeModal(btn.dataset.modalClose));
  });

  // Click overlay to close
  $$('.modal-overlay').forEach(overlay => {
    on(overlay, 'click', (e) => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });

  // ESC key
  on(document, 'keydown', (e) => {
    if (e.key === 'Escape') {
      $$('.modal-overlay.open').forEach(o => closeModal(o.id));
      closeAllDropdowns();
    }
  });

  /* ======================================================
     5. TABS
  ====================================================== */
  $$('.tabs').forEach(tabGroup => {
    $$('.tab-btn', tabGroup).forEach(btn => {
      on(btn, 'click', () => {
        $$('.tab-btn', tabGroup).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const target = btn.dataset.tab;
        if (target) {
          const panel = $(`[data-tab-panel="${target}"]`);
          const allPanels = panel && panel.closest('[data-tabs-container]');
          if (allPanels) {
            $$('[data-tab-panel]', allPanels).forEach(p => p.style.display = 'none');
            panel.style.display = '';
          }
        }
      });
    });
  });

  /* ======================================================
     6. TABLE FILTERS (live search + select filter)
  ====================================================== */
  $$('[data-filter-table]').forEach(container => {
    const tableId = container.dataset.filterTable;
    const table = $(`#${tableId}`);
    if (!table) return;

    const searchInput = $('[data-filter-search]', container);
    const selects = $$('[data-filter-select]', container);

    function applyFilters() {
      const q = searchInput ? searchInput.value.toLowerCase() : '';
      const filterVals = {};
      selects.forEach(s => { filterVals[s.dataset.filterSelect] = s.value; });

      $$('tbody tr', table).forEach(row => {
        const text = row.textContent.toLowerCase();
        let show = text.includes(q);

        selects.forEach(s => {
          const col = s.dataset.filterSelect;
          const val = filterVals[col];
          if (val && val !== 'all') {
            const cell = row.querySelector(`[data-col="${col}"]`);
            if (cell && !cell.textContent.toLowerCase().includes(val.toLowerCase())) {
              show = false;
            }
          }
        });

        row.style.display = show ? '' : 'none';
      });
    }

    on(searchInput, 'input', applyFilters);
    selects.forEach(s => on(s, 'change', applyFilters));
  });

  /* ======================================================
     7. SORTABLE TABLE HEADERS
  ====================================================== */
  $$('th[data-sort]').forEach(th => {
    th.style.cursor = 'pointer';
    th.title = 'Click to sort';
    on(th, 'click', () => {
      const table = th.closest('table');
      const tbody = table.querySelector('tbody');
      const colIndex = [...th.parentElement.children].indexOf(th);
      const asc = th.dataset.sortDir !== 'asc';
      th.dataset.sortDir = asc ? 'asc' : 'desc';

      // Reset all
      $$('th[data-sort]', table).forEach(t => {
        if (t !== th) { t.dataset.sortDir = ''; t.querySelector('.sort-icon') && (t.querySelector('.sort-icon').textContent = ' ↕'); }
      });

      const icon = th.querySelector('.sort-icon');
      if (icon) icon.textContent = asc ? ' ↑' : ' ↓';

      const rows = [...tbody.querySelectorAll('tr')];
      rows.sort((a, b) => {
        const aVal = a.children[colIndex]?.textContent.trim() || '';
        const bVal = b.children[colIndex]?.textContent.trim() || '';
        return asc ? aVal.localeCompare(bVal, undefined, {numeric: true}) : bVal.localeCompare(aVal, undefined, {numeric: true});
      });
      rows.forEach(r => tbody.appendChild(r));
    });
  });

  /* ======================================================
     8. SIMPLE BAR CHART RENDERER
  ====================================================== */
  function renderBarChart(containerId, data, options = {}) {
    const container = $(`#${containerId}`);
    if (!container) return;
    const { color = 'var(--brand-500)', maxVal } = options;
    const max = maxVal || Math.max(...data.map(d => d.value));

    const barsEl = $('.chart-placeholder', container);
    const labelsEl = $('.chart-x-labels', container);
    if (!barsEl || !labelsEl) return;

    barsEl.innerHTML = '';
    labelsEl.innerHTML = '';

    data.forEach(d => {
      const pct = Math.round((d.value / max) * 100);
      const grp = document.createElement('div');
      grp.className = 'chart-bar-group';

      const bar = document.createElement('div');
      bar.className = 'chart-bar';
      bar.style.height = `${pct}%`;
      bar.style.background = d.secondary ? 'var(--gray-200)' : color;
      bar.title = `${d.label}: ${d.value}`;
      grp.appendChild(bar);
      barsEl.appendChild(grp);

      const lbl = document.createElement('div');
      lbl.className = 'chart-x-label';
      lbl.textContent = d.label;
      labelsEl.appendChild(lbl);
    });
  }

  // Dashboard revenue chart data
  renderBarChart('revenue-chart', [
    { label: 'Sep', value: 38000, secondary: true },
    { label: 'Oct', value: 52000, secondary: true },
    { label: 'Nov', value: 44000, secondary: true },
    { label: 'Dec', value: 61000, secondary: true },
    { label: 'Jan', value: 55000, secondary: true },
    { label: 'Feb', value: 67000, secondary: true },
    { label: 'Mar', value: 74000 },
  ]);

  /* ======================================================
     9. COMPANY SELECTOR
  ====================================================== */
  const companyItems = $$('[data-company]');
  const companyLabel = $('#company-label');

  companyItems.forEach(item => {
    on(item, 'click', () => {
      if (companyLabel) companyLabel.textContent = item.dataset.company;
      const dot = $('#company-dot');
      if (dot && item.dataset.color) {
        dot.style.background = item.dataset.color;
        dot.textContent = item.dataset.company[0];
      }
      showToast(`Switched to ${item.dataset.company}`, 'info');
    });
  });

  /* ======================================================
     10. TOAST NOTIFICATIONS
  ====================================================== */
  function showToast(message, type = 'info', duration = 3500) {
    let container = $('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const icons = {
      success: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>`,
      error:   `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"/></svg>`,
      info:    `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"/></svg>`,
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `${icons[type] || icons.info}<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      toast.style.transition = 'opacity .25s ease, transform .25s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // Expose globally so onclick attributes in HTML can call it
  window.showToast = showToast;
  window.openModal = openModal;
  window.closeModal = closeModal;

  /* ======================================================
     11. MARK INVOICE PAID (demo interaction)
  ====================================================== */
  $$('[data-action="mark-paid"]').forEach(btn => {
    on(btn, 'click', () => {
      const row = btn.closest('tr');
      if (!row) return;
      const badge = row.querySelector('.badge');
      if (badge) {
        badge.className = 'badge badge-active';
        badge.textContent = 'Paid';
      }
      btn.remove();
      showToast('Invoice marked as paid', 'success');
    });
  });

})();
