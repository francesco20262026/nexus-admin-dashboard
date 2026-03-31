/**
 * search_bar.js Canonical shared search + filter logic
 * Include in all admin list pages.
 *
 * Usage:
 *   <!-- After your list JS -->
 *   <script src="assets/js/search_bar.js"></script>
 *   <script>
 *     SearchBar.init({
 *       inputId: 'cl-search',          // ID of the search input
 *       resetId: 'cl-btn-reset',       // ID of the Reset button
 *       onSearch: (query) => { ... },  // callback when user types
 *       onReset:  () => { ... },       // callback when reset pressed
 *     });
 *   </script>
 */
(function (global) {
  'use strict';

  const SearchBar = {
    /**
     * Initialize a search bar.
     * @param {Object} opts
     * @param {string}   opts.inputId    - ID of the <input> search field
     * @param {string}   [opts.resetId]  - ID of the Reset button
     * @param {Function} opts.onSearch   - called with trimmed query string (debounced 220ms)
     * @param {Function} [opts.onReset]  - called when reset is triggered
     * @param {number}   [opts.debounce] - debounce delay in ms (default 220)
     */
    init(opts) {
      const input = document.getElementById(opts.inputId);
      if (!input) return;

      const delay = opts.debounce ?? 220;
      let timer = null;

      // Clear on ESC
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          input.value = '';
          clearTimeout(timer);
          if (opts.onSearch) opts.onSearch('');
          if (opts.onReset) opts.onReset();
        }
      });

      // Debounced search on input
      input.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          const q = input.value.trim();
          if (opts.onSearch) opts.onSearch(q);
        }, delay);
      });

      // Reset button
      if (opts.resetId) {
        const resetBtn = document.getElementById(opts.resetId);
        if (resetBtn) {
          resetBtn.addEventListener('click', () => {
            input.value = '';
            clearTimeout(timer);
            if (opts.onSearch) opts.onSearch('');
            if (opts.onReset) opts.onReset();
          });
        }
      }
    },

    /**
     * Utility: client-side filter of an array by a query string.
     * Checks all string values in each object using toLowerCase includes.
     * @param {Array}  rows  - array of objects
     * @param {string} query - search query
     * @param {Array}  [fields] - optional list of field names to check (defaults to all)
     * @returns {Array} filtered rows
     */
    filter(rows, query, fields) {
      if (!query) return rows;
      const q = query.toLowerCase();
      return rows.filter((row) => {
        const keys = fields || Object.keys(row);
        return keys.some((k) => {
          const v = row[k];
          return v != null && String(v).toLowerCase().includes(q);
        });
      });
    },

    /**
     * Utility: simple client-side sort toggle on a column header.
     * Toggles data-sort attribute on the header element between 'asc' and 'desc'.
     * @param {HTMLElement} headerEl  - the column header element clicked
     * @param {Function}    compareFn - (a, b, dir) => number; dir is 'asc' or 'desc'
     * @param {Function}    renderFn  - called with sorted rows once sorted
     * @param {Array}       rows      - current rows array
     * @returns {string} new direction ('asc' or 'desc')
     */
    toggleSort(headerEl, compareFn, renderFn, rows) {
      const current = headerEl.dataset.sort || 'none';
      // Clear other headers in the same row
      const row = headerEl.closest('.cl-col-header-row');
      if (row) {
        row.querySelectorAll('.cl-col-header').forEach((h) => {
          h.dataset.sort = 'none';
          h.classList.remove('sort-asc', 'sort-desc');
        });
      }
      const next = current === 'asc' ? 'desc' : 'asc';
      headerEl.dataset.sort = next;
      headerEl.classList.add(next === 'asc' ? 'sort-asc' : 'sort-desc');

      const sorted = [...rows].sort((a, b) => compareFn(a, b, next));
      renderFn(sorted);
      return next;
    },
  };

  global.SearchBar = SearchBar;
})(window);
