/* ============================================================
   NEXUS ADMIN dash.js
   Shared app-shell behaviour for all admin and client pages.
   Vanilla JS no dependencies
   ============================================================ */

(function () {
  'use strict';

  /* ──────────────────────────────────────────────────────────
     Helpers
  ────────────────────────────────────────────────────────── */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  /* ──────────────────────────────────────────────────────────
     1. SIDEBAR TOGGLE  (desktop collapse / mobile overlay)
  ────────────────────────────────────────────────────────── */
  const shell     = $('#shell');
  const toggleBtn = $('#sidebar-toggle');

  function isMobile() { return window.innerWidth <= 900; }

  // All shell / sidebar operations are guarded both elements
  // are optional depending on the page layout.
  on(toggleBtn, 'click', () => {
    if (!shell) return;
    if (isMobile()) {
      shell.classList.toggle('mobile-open');
    } else {
      shell.classList.toggle('collapsed');
      localStorage.setItem('sidebar-collapsed', shell.classList.contains('collapsed'));
    }
  });

  if (shell && !isMobile() && localStorage.getItem('sidebar-collapsed') === 'true') {
    shell.classList.add('collapsed');
  }

  // Close mobile sidebar when clicking outside
  on(document, 'click', (e) => {
    if (!shell || !isMobile() || !shell.classList.contains('mobile-open')) return;
    const sidebar = $('.sidebar');
    if (sidebar && !sidebar.contains(e.target) && e.target !== toggleBtn) {
      shell.classList.remove('mobile-open');
    }
  });

  /* ──────────────────────────────────────────────────────────
     2. ACTIVE NAV ITEM  set on page load by matching URL
  ────────────────────────────────────────────────────────── */
  (function setActiveNavItem() {
    // Extract just the filename from the current URL (e.g. "admin_calendar.html")
    const currentFile = window.location.pathname.split('/').pop().split('?')[0] || 'admin_dash.html';

    $$('.nav-item').forEach(item => {
      const href = (item.getAttribute('href') || '').split('?')[0].split('/').pop();
      // Exact match avoids false positives like admin_calendar matching admin_clients
      if (href && href === currentFile) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  })();


  /* ──────────────────────────────────────────────────────────
     3. DROPDOWN MENUS
  ────────────────────────────────────────────────────────── */
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

  /* ──────────────────────────────────────────────────────────
     4. MODALS
  ────────────────────────────────────────────────────────── */
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

  $$('[data-modal-open]').forEach(btn => {
    on(btn, 'click', () => openModal(btn.dataset.modalOpen));
  });

  $$('[data-modal-close]').forEach(btn => {
    on(btn, 'click', () => closeModal(btn.dataset.modalClose));
  });



  on(document, 'keydown', (e) => {
    if (e.key === 'Escape') {
      $$('.modal-overlay.open').forEach(o => closeModal(o.id));
      closeAllDropdowns();
    }
  });

  /* ──────────────────────────────────────────────────────────
     5. TABS
  ────────────────────────────────────────────────────────── */
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

  /* ──────────────────────────────────────────────────────────
     6. TABLE FILTERS  (live search + select filter)
  ────────────────────────────────────────────────────────── */
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

  /* ──────────────────────────────────────────────────────────
     7. SORTABLE TABLE HEADERS
  ────────────────────────────────────────────────────────── */
  $$('th[data-sort]').forEach(th => {
    th.style.cursor = 'pointer';
    th.title = 'Ordina';
    on(th, 'click', () => {
      const table = th.closest('table');
      const tbody = table?.querySelector('tbody');
      if (!tbody) return;
      const colIndex = [...th.parentElement.children].indexOf(th);
      const asc = th.dataset.sortDir !== 'asc';
      th.dataset.sortDir = asc ? 'asc' : 'desc';

      $$('th[data-sort]', table).forEach(t => {
        if (t !== th) {
          t.dataset.sortDir = '';
          const icon = t.querySelector('.sort-icon');
          if (icon) icon.textContent = ' ↕';
        }
      });

      const icon = th.querySelector('.sort-icon');
      if (icon) icon.textContent = asc ? ' ↑' : ' ↓';

      const rows = [...tbody.querySelectorAll('tr')];
      rows.sort((a, b) => {
        const aVal = a.children[colIndex]?.textContent.trim() || '';
        const bVal = b.children[colIndex]?.textContent.trim() || '';
        return asc
          ? aVal.localeCompare(bVal, undefined, { numeric: true })
          : bVal.localeCompare(aVal, undefined, { numeric: true });
      });
      rows.forEach(r => tbody.appendChild(r));
    });
  });

  /* ──────────────────────────────────────────────────────────
     8. BAR CHART RENDERER
  ────────────────────────────────────────────────────────── */
  function renderBarChart(containerId, data, options = {}) {
    const container = $(`#${containerId}`);
    if (!container) return;
    const { color = 'var(--brand-500)', maxVal } = options;
    const max = maxVal || Math.max(...data.map(d => d.value));

    const barsEl   = $('.chart-placeholder', container);
    const labelsEl = $('.chart-x-labels', container);
    if (!barsEl || !labelsEl) return;

    barsEl.innerHTML   = '';
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

  window.renderBarChart = renderBarChart;

  


  /* ──────────────────────────────────────────────────────────
     10. TOAST NOTIFICATIONS
  ────────────────────────────────────────────────────────── */
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
      warning: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/></svg>`,
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

  window.showToast  = showToast;
  window.openModal  = openModal;
  window.closeModal = closeModal;

  /* ──────────────────────────────────────────────────────────
     11. FILTER TABS unified quick-filter tab wiring
     Dispatches 'filterchange' so each page's JS can listen.
     Sets window._activeFilter for imperative access.
  ────────────────────────────────────────────────────────── */
  document.addEventListener('click', function (e) {
    const tab = e.target.closest('.filter-tab');
    if (!tab) return;
    const container = tab.closest('.filter-tabs');
    if (!container) return;
    container.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const filterValue = tab.dataset.filter || 'all';
    // QUI SI DOVREBBE GESTIRE IL FILTRO SE NECESSARIO
  }); // <--- CHIUSURA MANCANTE AGGIUNTA

  /* ──────────────────────────────────────────────────────────
     12. DYNAMIC SELECT WIDTH FOR FILTERS
  ────────────────────────────────────────────────────────── */
  function updateSelectWidth(select) {
    let span = document.getElementById('select-width-measurer');
    if (!span) {
      span = document.createElement('span');
      span.id = 'select-width-measurer';
      span.style.cssText = 'visibility:hidden;position:absolute;white-space:pre;z-index:-1;';
      document.body.appendChild(span);
    }
    const computed = window.getComputedStyle(select);
    span.style.fontFamily = computed.fontFamily;
    span.style.fontSize = computed.fontSize;
    span.style.fontWeight = computed.fontWeight;
    span.style.letterSpacing = computed.letterSpacing;
    span.style.textTransform = computed.textTransform;
    
    const text = select.options[select.selectedIndex]?.text || '';
    span.textContent = text;
    
    // 46px = 12px padding-left + 34px padding-right (per icona svg) + piccolo buffer di 4px
    const textWidth = span.getBoundingClientRect().width;
    select.style.width = (Math.ceil(textWidth) + 50) + 'px';
  }

  document.addEventListener('change', e => {
    if (e.target.matches('select.cl-filter-select')) {
      updateSelectWidth(e.target);
    }
  });

  // Run on load, after short delay, and definitively when fonts are loaded
  window.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('select.cl-filter-select').forEach(updateSelectWidth);
    
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        document.querySelectorAll('select.cl-filter-select').forEach(updateSelectWidth);
      });
    } else {
      setTimeout(() => {
        document.querySelectorAll('select.cl-filter-select').forEach(updateSelectWidth);
      }, 500);
    }
  });

  /* ──────────────────────────────────────────────────────────
     13. AI COPILOT LAUNCHER
  ────────────────────────────────────────────────────────── */
  window.addEventListener('DOMContentLoaded', () => {
    // Only load the Copilot if the user is authenticated and navigating the admin dashboard
    if (localStorage.getItem('nexus_token')) {
      const coScript = document.createElement('script');
      coScript.src = 'assets/js/copilot.js';
      document.body.appendChild(coScript);
    }
  });

})();
