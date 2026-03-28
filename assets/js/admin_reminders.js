/* ============================================================
   admin_reminders.js — Reminders & Notification Control
   ============================================================ */
'use strict';
(function () {
  Auth.guard('admin');
  Auth.initUI();

  /* ── State ─────────────────────────────────────────────────── */
  let ALL      = [];
  let filtered = [];

  const savedState    = window.SessionState?.load('reminders') || {};
  let activeTabFilter = savedState.activeTabFilter || 'all';
  const PER_PAGE      = 20;
  let currentPage     = savedState.currentPage || 1;

  // Optional URL context
  const urlClientId = window.URLHelper?.getParam('client_id') || null;

  /* ── DOM refs ──────────────────────────────────────────────── */
  const tbody      = document.getElementById('reminders-tbody');
  const search     = document.getElementById('rem-search');
  const fType      = document.getElementById('rem-filter-type');
  const fStatus    = document.getElementById('rem-filter-status');
  const remInfo    = document.getElementById('rem-info');
  const btnRefresh = document.getElementById('btn-refresh-reminders');

  if (!tbody)   console.error('[admin_reminders] Required DOM node missing: #reminders-tbody');
  if (!search)  console.warn('[admin_reminders]  Optional DOM node missing: #rem-search');
  if (!fType)   console.warn('[admin_reminders]  Optional DOM node missing: #rem-filter-type');
  if (!fStatus) console.warn('[admin_reminders]  Optional DOM node missing: #rem-filter-status');
  if (!remInfo) console.warn('[admin_reminders]  Optional DOM node missing: #rem-info');

  // Restore saved filter state
  if (search  && savedState.search)  search.value  = savedState.search;
  if (fType   && savedState.fType)   fType.value   = savedState.fType;
  if (fStatus && savedState.fStatus) fStatus.value = savedState.fStatus;

  // Restore active tab highlight
  if (activeTabFilter !== 'all') {
    document.querySelectorAll('#filter-tabs .filter-tab').forEach(btn =>
      btn.classList.toggle('active', btn.dataset.filter === activeTabFilter)
    );
  }

  function saveCurrentState() {
    window.SessionState?.save('reminders', {
      currentPage,
      activeTabFilter,
      search:  search?.value  || '',
      fType:   fType?.value   || 'all',
      fStatus: fStatus?.value || 'all',
    });
  }

  /* ── Company switch ─────────────────────────────────────────── */
  window.addEventListener('companyChanged', () => load());

  /* ── Load ───────────────────────────────────────────────────── */
  window._retryReminders = load;
  async function load() {
    if (!tbody) return;
    tbody.innerHTML = UI.skeletonCardList(5);
    let hasError = false;

    try {
      const payload = urlClientId ? { client_id: urlClientId } : {};
      const res     = await API.Reminders.list(payload);
      ALL           = Array.isArray(res) ? res : (res?.items ?? res?.data ?? []);
    } catch (e) {
      hasError = true;
      ALL      = [];
      console.error('[admin_reminders] load error:', e);
      tbody.innerHTML = UI.errorState(e.message, 'window._retryReminders()');
    } finally {
      updateChips();
      if (!hasError) applyFilters();
    }
  }

  /* ── Stat chips ─────────────────────────────────────────────── */
  function updateChips() {
    const pending  = ALL.filter(r => r.status === 'pending').length;
    const sent     = ALL.filter(r => r.status === 'sent').length;
    const failed   = ALL.filter(r => r.status === 'failed' || r.status === 'bounced').length;
    const skipped  = ALL.filter(r => r.status === 'skipped').length;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('chip-rem-total',   ALL.length);
    set('chip-rem-pending', pending);
    set('chip-rem-sent',    sent);
    set('chip-rem-failed',  failed);
    set('chip-rem-skipped', skipped);
  }

  /* ── Filter tabs ───────────────────────────────────────────── */
  document.querySelectorAll('#filter-tabs .filter-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#filter-tabs .filter-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTabFilter = btn.dataset.filter || 'all';
      currentPage = 1;
      applyFilters();
    });
  });

  /* ── Search + selects ──────────────────────────────────────── */
  if (search)  search.addEventListener('input',  () => { currentPage = 1; applyFilters(); });
  if (fStatus) fStatus.addEventListener('change', () => { currentPage = 1; applyFilters(); });
  if (fType)   fType.addEventListener('change',   () => { currentPage = 1; applyFilters(); });

  /* ── Refresh button ─────────────────────────────────────────── */
  btnRefresh?.addEventListener('click', function() { if(window.UI) UI.toast('Aggiornamento in corso...', 'info'); load(true); });

  /* ── Apply filters (local, no re-fetch) ─────────────────────── */
  function applyFilters() {
    const text  = (search?.value || '').toLowerCase().trim();
    // Prefer select values when set, otherwise active tab
    const stVal = (fStatus?.value && fStatus.value !== 'all') ? fStatus.value : activeTabFilter;
    const tyVal = fType?.value || 'all';

    filtered = ALL.filter(r => {
      if (text) {
        const haystack = `${r.title || ''} ${r.client_name || ''} ${r.contact_email || ''}`.toLowerCase();
        if (!haystack.includes(text)) return false;
      }
      if (stVal !== 'all' && r.status !== stVal) return false;
      if (tyVal !== 'all' && r.type  !== tyVal)  return false;
      return true;
    });

    const maxPage = Math.ceil(filtered.length / PER_PAGE) || 1;
    if (currentPage > maxPage) currentPage = maxPage;
    saveCurrentState();
    render();
  }

  /* ── Render ─────────────────────────────────────────────────── */
  function render() {
    if (!tbody) return;

    if (!filtered.length) {
      const msg = ALL.length > 0
        ? I18n.t('common.no_results') || 'Nessun promemoria corrisponde ai filtri.'
        : 'Nessun promemoria trovato.<br>I promemoria appariranno automaticamente al verificarsi delle scadenze.';
      tbody.innerHTML = `<div class="list-card">${UI.createEmptyState(null, msg)}</div>`;
      if (remInfo) remInfo.textContent = '';
      return;
    }

    const page = filtered.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

    tbody.innerHTML = page.map(r => {
      const typeLabels = { invoice: 'Fattura', renewal: 'Rinnovo', custom: 'Custom' };
      const tyLbl = typeLabels[r.type] || r.type || 'Sconosciuto';
      const lvl   = r.level ? `(Liv. ${r.level})` : '';

      // Date — safe fallback to empty string instead of 0
      const dtRaw = r.scheduled_at || r.sent_at || r.created_at;
      const dt    = dtRaw ? new Date(dtRaw).toLocaleString('it-IT') : '';
      const dlRes = r.delivery_result
        ? `<div style="font-size:11px;color:var(--gray-500);margin-top:4px;">${r.delivery_result}</div>`
        : '';

      // Related entity links — use href directly, no onclick+preventDefault
      const relClient = r.client_id || r.client_name
        ? `<a href="admin_client_detail.html?id=${r.client_id || ''}" class="hover-link" style="color:var(--brand-600);">${r.client_name || 'Cliente'}</a>`
        : `<span style="color:var(--gray-400);font-size:12px;">N/A</span>`;

      let relRef = '';
      if (r.type === 'invoice' && (r.invoice_id || r.invoice_number)) {
        const invTarget = r.invoice_id ? `admin_invoices.html?highlight=${r.invoice_id}` : 'admin_invoices.html';
        relRef = `<a href="${invTarget}" class="hover-link" style="color:var(--gray-700);font-weight:600;">🧾 Fattura ${r.invoice_number || (r.invoice_id || '').substring(0, 8)}</a>`;
      } else if (r.type === 'renewal' && r.renewal_id) {
        relRef = `<a href="admin_renewals.html?highlight=${r.renewal_id}" class="hover-link" style="color:var(--gray-700);font-weight:600;">🔄 Rinnovo ${r.renewal_id.substring(0, 8)}</a>`;
      }

      // Email contact — only show if present
      const emailLine = r.contact_email
        ? ` <span style="color:var(--gray-500);font-size:11px;">— ${r.contact_email}</span>`
        : '';

      const actions = [];
      actions.push(`<button class="btn btn-ghost btn-sm btn-icon" title="Vedi dettagli" onclick="viewReminder('${r.id}')">
        <svg style="width:14px;height:14px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/></svg>
      </button>`);

      if (r.status === 'failed' || r.status === 'bounced') {
        actions.push(`<button class="btn btn-secondary btn-sm" onclick="retrySend('${r.id}')">Riprova</button>`);
      }

      return `<div class="list-card fade-in" data-id="${r.id}">
        <div class="list-card-header">
          <div class="list-card-title">${tyLbl} ${lvl}</div>
          ${UI.pill(r.status)}
        </div>
        <div class="list-card-body">
          <div class="list-card-meta" title="Cliente" style="width:100%;">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"/></svg>
            ${relClient}${emailLine}
          </div>
          ${relRef ? `<div class="list-card-meta" title="Riferimento">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.5-1.5H9"/></svg>
            ${relRef}
          </div>` : ''}
          <div class="list-card-meta" title="Data/Ora">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
            ${dt}${dlRes}
          </div>
          <div style="flex-grow:1;"></div>
          <div class="row-actions">${actions.join('')}</div>
        </div>
      </div>`;
    }).join('');

    if (remInfo) remInfo.textContent = `${filtered.length} log trovati`;
  }

  /* ── Actions ─────────────────────────────────────────────────  */
  window.viewReminder = (id) => {
    const rem = ALL.find(r => r.id === id);
    if (!rem) return;
    // Show a summary toast with key fields — full preview modal is future work
    const info = [
      rem.title || '',
      rem.contact_email ? `→ ${rem.contact_email}` : '',
      rem.delivery_result || '',
    ].filter(Boolean).join(' | ');
    window.showToast?.(info || `Promemoria #${id.substring(0, 8)}`, 'info');
  };

  window.retrySend = async (id) => {
    if (!confirm("Tentare nuovamente l'invio di questo promemoria?")) return;
    try {
      window.showToast?.('Invio in corso...', 'info');
      const res = await API.post(`/reminders/${id}/retry`);
      window.showToast?.(res?.message || 'Promemoria inviato con successo', 'success');
      // Optimistic local update to 'pending' — full status will resolve on next load
      ALL = ALL.map(r => r.id === id ? { ...r, status: 'pending' } : r);
      updateChips();
      applyFilters();
    } catch (e) {
      console.error('[admin_reminders] retrySend error:', e);
      window.showToast?.(e?.message || I18n.t('error.generic'), 'error');
    }
  };

  /* ── Init ──────────────────────────────────────────────────── */
  window.onPageReady(async () => {
    await I18n.init('lang-switcher-slot');
    load();
  });

})();