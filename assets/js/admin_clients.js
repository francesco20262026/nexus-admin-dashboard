/* ============================================================
   admin_clients.js Clients list page logic (RESTORED & ENHANCED)
   ============================================================ */
'use strict';

(function () {
  Auth.guard('admin');
  Auth.initUI();

  /* ── State ─────────────────────────────────────────────────── */
  let ALL      = [];
  let filtered = [];
  let _companies = null;

  const saved = window.SessionState?.load('clients') || {};
  let currentPage   = saved.currentPage   || 1;
  let activeTab     = saved.activeTab     || 'all';
  let activeQuickFilter = saved.quickFilter || '';
  const PER_PAGE  = 20;

  /* ── DOM refs ──────────────────────────────────────────────── */
  const $ = id => document.getElementById(id);
  const list         = $('cl-list');
  const searchEl     = $('cl-search');
  const infoEl       = $('cl-info');
  const paginationEl = $('cl-pagination');
  const filterCity     = $('cl-filter-city');
  const filterAssignee = $('cl-filter-assignee');
  const filterInvoices = $('cl-filter-invoices');
  const filterRenewal  = $('cl-filter-renewal');
  const filterServices = $('cl-filter-services');
  const filterQuotes   = $('cl-filter-quotes');
  const filterActivities = $('cl-filter-activities');
  const pipelineBar  = $('cl-pipeline-bar');
  const btnRefresh   = $('btn-refresh-clients');
  const btnAdd       = $('btn-add-client');
  const modal        = $('modal-add-client');

  /* ── Restore saved state ────────────────────────────────────── */
  if (searchEl && saved.search) searchEl.value = saved.search;
  pipelineBar?.querySelectorAll('.cl-status-pill').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.tab === activeTab)
  );

  function saveState() {
    window.SessionState?.save('clients', {
      activeTab, currentPage, quickFilter: activeQuickFilter,
      search: searchEl?.value || '',
    });
  }

  /* ── Tab clicks ─────────────────────────────────────────────── */
  pipelineBar?.addEventListener('click', e => {
    const btn = e.target.closest('.cl-status-pill');
    if (!btn) return;
    pipelineBar.querySelectorAll('.cl-status-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeTab   = btn.dataset.tab;
    currentPage = 1;
    applyFilters();
  });

  /* ── Filter changes ─────────────────────────────────────────── */
  searchEl?.addEventListener('input',   debounce(() => { currentPage = 1; applyFilters(); }, 200));
  filterCity?.addEventListener('change',() => { currentPage = 1; applyFilters(); });
  filterAssignee?.addEventListener('change',() => { currentPage = 1; applyFilters(); });
  filterInvoices?.addEventListener('change',() => { currentPage = 1; applyFilters(); });
  filterRenewal?.addEventListener('change',() => { currentPage = 1; applyFilters(); });
  filterServices?.addEventListener('change',() => { currentPage = 1; applyFilters(); });
  filterQuotes?.addEventListener('change',() => { currentPage = 1; applyFilters(); });
  filterActivities?.addEventListener('change',() => { currentPage = 1; applyFilters(); });

  /* ── Refresh ────────────────────────────────────────────────── */
  btnRefresh?.addEventListener('click', () => { if(window.UI) UI.toast('Aggiornamento in corso...', 'info'); load(true); });
  window.addEventListener('companyChanged', () => load(true));

  /* ── Add client button ──────────────────────────────────────── */
  btnAdd?.addEventListener('click', () => {
    const companySelect = $('f-company-id');
    if (companySelect && _companies) {
      companySelect.innerHTML = '<option value="">Seleziona fornitrice...</option>' + 
        _companies.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }
    ['f-name','f-vat','f-sdi','f-sector','f-referente','f-email','f-pec','f-phone','f-city','f-address','f-notes'].forEach(id => {
      const el = $(id); if(el) el.value = '';
    });
    $('f-portal').checked = false;
    modal?.classList.add('open');
  });

  /* ── Save client button ─────────────────────────────────────── */
  const btnSaveModal = $('modal-save-btn');
  btnSaveModal?.addEventListener('click', async () => {
    const compId = $('f-company-id')?.value;
    const name   = $('f-name')?.value?.trim();
    const email  = $('f-email')?.value?.trim();
    const referente = $('f-referente')?.value?.trim();

    if (!compId) { UI.toast('Seleziona l\'azienda fornitrice', 'warning'); return; }
    if (!name) { UI.toast('Ragione sociale obbligatoria', 'warning'); return; }
    if (!email) { UI.toast('Email contatto obbligatoria', 'warning'); return; }

    btnSaveModal.disabled = true;
    const oldHtml = btnSaveModal.innerHTML;
    btnSaveModal.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px;"></div> <span style="margin-left:8px;">Salvataggio...</span>';

    try {
      const created = await API.Clients.create({
        company_id: compId,
        company_name: name,
        vat_number: $('f-vat')?.value?.trim() || null,
        dest_code:  $('f-sdi')?.value?.trim() || null,
        sector:     $('f-sector')?.value?.trim() || null,
        name:       referente || name, // User's requested fix
        email:      email,
        pec:        $('f-pec')?.value?.trim() || null,
        phone:      $('f-phone')?.value?.trim() || null,
        city:       $('f-city')?.value?.trim() || null,
        address:    $('f-address')?.value?.trim() || null,
        notes:      $('f-notes')?.value?.trim() || null,
        invite_portal: $('f-portal')?.checked || false
      });
      if (created) ALL.unshift(created);
      UI.toast('Cliente creato con successo', 'success');
      modal?.classList.remove('open');
      load(true);
    } catch (e) {
      UI.toast(e.message || 'Errore durante la creazione', 'error');
    } finally {
      btnSaveModal.disabled = false;
      btnSaveModal.innerHTML = oldHtml;
    }
  });

  /* ── Load ───────────────────────────────────────────────────── */
  window._reloadClients = () => load(true);

  async function load(force = false) {
    if (!list) return;
    list.innerHTML = UI.skeletonCardList(5);
    try {
      if (!_companies) {
        try {
          const compRes = await API.Companies.list();
          _companies = Array.isArray(compRes) ? compRes : (compRes?.data || []);
        } catch(e) { console.warn('No companies', e); }
      }
      const res = await API.Clients.list();
      ALL = Array.isArray(res) ? res : (res?.items ?? res?.data ?? []);
    } catch (e) {
      console.error('[admin_clients] load error:', e);
      const errMsg = 'Impossibile caricare i clienti.';
      list.innerHTML = UI.errorState(errMsg, 'window._reloadClients()');
      updateKpis();
      return;
    }
    populateDynamicFilters();
    updateKpis();
    applyFilters();
  }

  function updateKpis() {
    const active    = ALL.filter(c => c.status === 'active').length;
    const suspended = ALL.filter(c => c.status === 'suspended').length;
    const ceased    = ALL.filter(c => c.status === 'ceased').length;
    const windocCount = ALL.filter(c => c.windoc_id).length;

    const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
    set('kpi-cl-all',       ALL.length);
    set('kpi-cl-all-quick', ALL.length);
    set('kpi-cl-active',    active);
    set('kpi-cl-suspended', suspended);
    set('kpi-cl-ceased',    ceased);
    set('kpi-cl-windoc',    windocCount);
    set('kpi-cl-nowindoc',  ALL.length - windocCount);
  }

  function populateDynamicFilters() {
    const prevCity     = filterCity?.value;
    const prevAssignee = filterAssignee?.value;

    const cities = [...new Set(ALL.map(c => c.city).filter(Boolean))].sort();
    if (filterCity) {
      filterCity.innerHTML = `<option value="">Tutte le città</option>` +
        cities.map(c => `<option value="${c}">${c}</option>`).join('');
      if (prevCity) filterCity.value = prevCity;
    }

    const assignees = [...new Set(ALL.map(c => c.owner_name || c.assigned_to_name).filter(Boolean))].sort();
    if (filterAssignee) {
      filterAssignee.innerHTML = `<option value="">Tutti gli assegnatari</option>` +
        assignees.map(a => `<option value="${a}">${a}</option>`).join('');
      if (prevAssignee) filterAssignee.value = prevAssignee;
    }
  }

  document.querySelectorAll('.cl-quick-badge').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.qf;
      if (val === 'all') {
        activeQuickFilter = '';
        document.querySelectorAll('.cl-quick-badge').forEach(b => b.classList.toggle('active', b.dataset.qf === 'all'));
      } else {
        const already = activeQuickFilter === val;
        document.querySelectorAll('.cl-quick-badge').forEach(b => b.classList.remove('active'));
        activeQuickFilter = already ? '' : val;
        if (!already) btn.classList.add('active');
        else document.querySelector('.cl-quick-badge[data-qf="all"]')?.classList.add('active');
      }
      currentPage = 1;
      applyFilters();
    });
  });

  $('btn-reset-filters')?.addEventListener('click', () => {
    if (searchEl) searchEl.value = '';
    [filterCity, filterAssignee, filterInvoices, filterRenewal, filterServices, filterQuotes, filterActivities]
      .forEach(el => { if (el) el.value = ''; });
    activeQuickFilter = '';
    document.querySelectorAll('.cl-quick-badge').forEach(b => b.classList.toggle('active', b.dataset.qf === 'all'));
    currentPage = 1;
    applyFilters();
  });

  function applyFilters() {
    const text     = (searchEl?.value || '').toLowerCase().trim();
    const city     = filterCity?.value     || '';
    const assignee = filterAssignee?.value || '';
    const invoices = filterInvoices?.value || '';
    const renewal  = filterRenewal?.value  || '';
    const services = filterServices?.value || '';
    const quotes   = filterQuotes?.value   || '';
    const activities = filterActivities?.value || '';

    const VALID_STATUSES = ['active','suspended','ceased','non_active','insolvent'];
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 86400000);

    filtered = ALL.filter(c => {
      if (activeTab !== 'all' && c.status !== activeTab) return false;
      if (city && c.city !== city) return false;
      if (assignee && c.owner_name !== assignee && c.assigned_to_name !== assignee) return false;

      const invCount = c.open_invoices_count || 0;
      if (invoices === 'open' && invCount <= 0) return false;
      if (invoices === 'none' && invCount > 0) return false;

      if (renewal) {
        if (!c.next_renewal_date) return false;
        const renDate = new Date(c.next_renewal_date);
        if (renewal === 'near' && (renDate < now || renDate > in30Days)) return false;
        if (renewal === 'expired' && renDate >= now) return false;
      }

      const servN = c.active_services_count ?? c.services_count ?? 0;
      if (services === 'yes' && servN <= 0) return false;
      if (services === 'no' && servN > 0) return false;

      if (activeQuickFilter === 'windoc' && !c.windoc_id) return false;
      if (activeQuickFilter === 'no_windoc' && c.windoc_id) return false;

      if (text) {
        const hay = [c.company_name, c.name, c.email, c.phone, c.city, c.sector, c.vat_number, c.owner_name]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(text)) return false;
      }
      return true;
    });

    const maxPage = Math.ceil(filtered.length / PER_PAGE) || 1;
    if (currentPage > maxPage) currentPage = maxPage;
    saveState();
    render();
  }

  function render() {
    if (!list) return;
    if (!filtered.length) {
      list.innerHTML = `<div class="list-card">${UI.createEmptyState(null, 'Nessun cliente trovato.')}</div>`;
      if (infoEl) infoEl.textContent = '';
      if (paginationEl) paginationEl.innerHTML = '';
      return;
    }
    const page = filtered.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);
    list.innerHTML = page.map(c => renderRow(c)).join('');
    const start = (currentPage - 1) * PER_PAGE + 1;
    const end   = Math.min(currentPage * PER_PAGE, filtered.length);
    if (infoEl) infoEl.textContent = `${start}–${end} di ${filtered.length}`;
    UI.pagination(paginationEl, null, currentPage, filtered.length, PER_PAGE, p => {
      currentPage = p; saveState(); render();
    });
    window.toggleMassBar();
  }

  function renderRow(c) {
    const display  = c.company_name || c.name || '';
    const initials = display.slice(0, 2).toUpperCase();
    const cId      = c.id;

    // Lookup fornitrice name
    const fornitriceLine = _companies?.find(comp => comp.id == c.company_id);
    const fornitriceName = fornitriceLine ? fornitriceLine.name : '';

    const referente   = c.name && c.name !== display ? c.name : (c.referente || '');
    const email       = c.email  || '';
    const phoneVal    = c.phone  || '';
    const cityVal     = c.city   || '';
    const vatNumber   = c.vat_number || '';
    const origin      = c.windoc_id ? 'Windoc' : c.converted_from_onboarding ? 'Onb.' : 'Manuale';
    const originColor = c.windoc_id ? '#1d4ed8' : c.converted_from_onboarding ? '#7c3aed' : '#6b7280';
    const originBg    = c.windoc_id ? '#eff6ff'  : c.converted_from_onboarding ? '#f3e8ff' : '#f3f4f6';
    const lastAct     = c.last_activity_at || c.updated_at || '';
    const servicesN   = c.active_services_count ?? c.services_count ?? 0;
    const contractsN  = c.active_contracts_count ?? 0;
    const invoicesN   = c.open_invoices_count ?? 0;
    const renewalDate = c.next_renewal_date || null;
    const owner       = c.assigned_to_name || c.owner_name || '';

    const iconUser  = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="11" height="11"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75"/></svg>`;
    const iconMail  = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="11" height="11"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"/></svg>`;
    const iconPhone = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="11" height="11"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 6.75Z"/></svg>`;

    return `
    <div class="cl-row fade-in" onclick="location.href='admin_client_detail.html?id=${cId}'">
      <div class="cl-col cl-col-1">
        <div class="cl-row-identity">
          <div class="mac-select-btn" data-id="${cId}" onclick="window.toggleSelection(event, '${cId}')" title="Seleziona" style="flex-shrink:0;">
            <div class="mac-checkbox"></div>
          </div>
          <div class="avatar cl-row-avatar cl-row-avatar-blue">${initials}</div>
          <div class="cl-row-identity-body">
            <div class="cl-row-name" title="${display}" style="display:flex;align-items:center;gap:6px;">
              ${display}
              ${fornitriceName ? `<span class="cl-row-badge-fornitrice">${fornitriceName}</span>` : ''}
            </div>
            <div class="cl-row-meta">
              ${referente ? `<span class="cl-row-chip">${iconUser}${referente}</span>` : ''}
              ${email ? `<a class="cl-row-chip cl-row-link" href="mailto:${email}" onclick="event.stopPropagation()" style="color:#3b82f6;">${iconMail}${email}</a>` : ''}
              ${phoneVal ? `<a class="cl-row-chip cl-row-link" href="tel:${phoneVal}" onclick="event.stopPropagation()">${iconPhone}${phoneVal}</a>` : ''}
            </div>
          </div>
        </div>
      </div>

      <div class="cl-col cl-col-2">
        <div class="cl-data-val">${cityVal || ''}</div>
        <div class="cl-data-lbl">${vatNumber ? 'P.IVA '+vatNumber : ''}</div>
        <div style="margin-top:2px;"><span style="font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px;background:${originBg};color:${originColor};">${origin}</span></div>
      </div>

      <div class="cl-col cl-col-3">
        <div style="margin-bottom:2px;">${UI.pill(c.status)}</div>
        ${owner ? `<div class="cl-data-lbl">${iconUser}${owner}</div>` : ''}
      </div>

      <div class="cl-col cl-col-4">
        <div class="cl-mini-kpi">${servicesN} Servizi · ${contractsN} Contratti</div>
        ${invoicesN > 0 ? `<div class="cl-mini-kpi" style="color:var(--warning-600)">${invoicesN} Fatture aperte</div>` : `<div class="cl-mini-kpi" style="color:var(--gray-400)">Fatture OK</div>`}
      </div>

      <div class="cl-col cl-col-5">
        <div class="cl-data-lbl">Ultima attività</div>
        <div class="cl-data-val">${lastAct ? UI.date(lastAct) : 'Nessuna attività'}</div>
      </div>

      <div class="cl-col cl-col-6 cl-col-actions" onclick="event.stopPropagation()">
        ${c.windoc_id
          ? `<span class="cl-windoc-badge cl-windoc-ok">Windoc ✓</span>`
          : `<button class="cl-windoc-badge cl-windoc-push" onclick="event.stopPropagation();pushClientWindoc('${cId}')">↑ Windoc</button>`
        }
      </div>
    </div>`;
  }

  window.deleteClient = async (id) => {
    if (!confirm('Eliminare questo cliente?')) return;
    try {
      await API.Clients.remove(id);
      load(true);
      UI.toast('Cliente eliminato', 'info');
    } catch (e) { UI.toast(e.message, 'error'); }
  };

  window.pushClientWindoc = async (clientId) => {
    try {
      UI.toast('Sincronizzazione su Windoc...', 'info');
      await API.Windoc.syncClient(clientId);
      UI.toast('Sincronizzato ✓', 'success');
      load(true);
    } catch (e) { UI.toast(e.message, 'error'); }
  };

  /* ── Mass Actions ─────────────────────────────────────────── */
  window.toggleSelection = (e, id) => {
    e.stopPropagation();
    e.currentTarget.classList.toggle('selected');
    window.toggleMassBar();
  };

  window.toggleSelectAll = () => {
    const btn = $('btn-select-all');
    if (!btn) return;
    btn.classList.toggle('selected');
    const isSel = btn.classList.contains('selected');
    document.querySelectorAll('.mac-select-btn[data-id]').forEach(b => {
      if (isSel) b.classList.add('selected');
      else b.classList.remove('selected');
    });
    window.toggleMassBar();
  };

  window.toggleMassBar = () => {
    const bar = $('mass-action-bar');
    if (!bar) return;
    
    const selectedBtns = document.querySelectorAll('.mac-select-btn.selected[data-id]');
    let checked = selectedBtns.length;
    
    document.querySelectorAll('.mac-select-btn[data-id]').forEach(btn => {
      const row = btn.closest('.cl-row');
      if (btn.classList.contains('selected')) {
        if (row) row.classList.add('selected-row');
      } else {
        if (row) row.classList.remove('selected-row');
      }
    });

    bar.style.display = checked > 0 ? 'flex' : 'none';
    const count = $('mass-count');
    if (count) count.textContent = `${checked} selezionati`;
    
    const selectAllBtn = $('btn-select-all');
    const allBtns = document.querySelectorAll('.mac-select-btn[data-id]');
    if (selectAllBtn && allBtns.length > 0) {
      if (checked === allBtns.length) selectAllBtn.classList.add('selected');
      else selectAllBtn.classList.remove('selected');
    }
  };

  window.massDelete = async () => {
    const ids = [...document.querySelectorAll('.mac-select-btn.selected[data-id]')].map(b => b.dataset.id);
    if (!ids.length || !confirm(`Eliminare ${ids.length} clienti?`)) return;
    UI.toast(`Eliminazione in corso...`, 'info');
    for (const id of ids) { try { await API.Clients.remove(id); } catch(e){} }
    UI.toast('Operazione completata', 'success');
    load(true);
  };

  window.massSyncWindoc = async () => {
    const ids = [...document.querySelectorAll('.mac-select-btn.selected[data-id]')].map(b => b.dataset.id);
    if (!ids.length) return;
    UI.toast(`Sincronizzazione in corso...`, 'info');
    for (const id of ids) { try { await API.Windoc.syncClient(id); } catch(e){} }
    UI.toast('Sincronizzazione completata', 'success');
    load(true);
  };

  window.onPageReady(async () => {
    // Select all listener is now generic via window.toggleSelectAll onclick
  });

})();
