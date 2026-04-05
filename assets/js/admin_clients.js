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
  let currentSortCol = 'date';
  let currentSortDir = 'desc';
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

  document.querySelectorAll('.cl-quick-badge').forEach(badge => {
    badge.classList.toggle('active', 
      (activeQuickFilter === '' && badge.dataset.qf === 'all') || 
      (badge.dataset.qf === activeQuickFilter)
    );
  });

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
        invite_portal: $('f-portal')?.checked || false,
        is_supplier: $('f-is-supplier')?.checked || false
      });
      if (created) ALL.unshift(created);
      UI.toast('Cliente creato con successo', 'success');
      modal?.classList.remove('open');
      load(true);
      
      // se l'utente ha creato un fornitore via link veloce, ricarica e manda alla pagina fornitori
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('create_supplier') === 'true' && $('f-is-supplier')?.checked) {
          window.location.href = 'admin_suppliers.html';
      }
      
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
      
      // Auto-open logic for supplier creation
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('create_supplier') === 'true' && !window._supplierModalOpened) {
          window._supplierModalOpened = true; // prevent infinite loops
          setTimeout(() => {
             btnAdd?.click();
             if($('f-is-supplier')) $('f-is-supplier').checked = true;
          }, 300);
      }
      
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
    const insolvent = ALL.filter(c => c.status === 'insolvent').length;
    const windocCount = ALL.filter(c => c.windoc_id).length;

    const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
    set('kpi-cl-all',       ALL.length);
    set('kpi-cl-all-quick', ALL.length);
    set('kpi-cl-active',    active);
    set('kpi-cl-suspended', suspended);
    set('kpi-cl-ceased',    ceased);
    set('kpi-cl-insolvent', insolvent);
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

    const prevSupplier = document.getElementById('cl-filter-supplier')?.value;
    const filterSupplier = document.getElementById('cl-filter-supplier');
    if (filterSupplier) {
      const names = [...new Set(ALL.map(c => {
        const fornitriceLine = _companies?.find(comp => comp.id == c.company_id);
        return fornitriceLine ? fornitriceLine.name : 'Nova CRM';
      }).filter(Boolean))].sort();
      filterSupplier.innerHTML = '<option value="">Fornitore ▼</option>' +
        names.map(n => `<option value="${n}">${n}</option>`).join('');
      if (prevSupplier) filterSupplier.value = prevSupplier;
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
    const filterSupplier = document.getElementById('cl-filter-supplier');
    if (filterSupplier) filterSupplier.value = '';
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

      const fSupplier = document.getElementById('cl-filter-supplier')?.value;
      if (fSupplier) {
        const fornitriceLine = _companies?.find(comp => comp.id == c.company_id);
        const sName = fornitriceLine ? fornitriceLine.name : 'Nova CRM';
        if (sName !== fSupplier) return false;
      }

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

      const filterStatusHeader = document.getElementById('cl-filter-status')?.value || '';
      const filterOpHeader = document.getElementById('cl-filter-operativity')?.value || '';
      const filterActivityHeader = document.getElementById('cl-filter-activity')?.value || '';

      if (filterStatusHeader && c.status !== filterStatusHeader) return false;

      if (filterOpHeader) {
          const servN = c.active_services_count ?? c.services_count ?? 0;
          if (filterOpHeader === 'with_services' && servN <= 0) return false;
          if (filterOpHeader === 'no_services' && servN > 0) return false;
      }
      
      if (filterActivityHeader) {
          const actDate = c.last_activity_at ? new Date(c.last_activity_at) : null;
          if (!actDate) return false;
          const nowMs = Date.now();
          if (filterActivityHeader === '24h' && nowMs - actDate.getTime() > 86400000) return false;
          if (filterActivityHeader === '7d' && nowMs - actDate.getTime() > 7 * 86400000) return false;
          if (filterActivityHeader === '30d' && nowMs - actDate.getTime() > 30 * 86400000) return false;
      }

      if (text) {
        const hay = [c.company_name, c.name, c.email, c.phone, c.city, c.sector, c.vat_number, c.owner_name]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(text)) return false;
      }
      return true;
    });

    // Handle sorting
    filtered.sort((a, b) => {
      let valA, valB;
      if (currentSortCol === 'name') {
        valA = (a.company_name || a.name || '').toLowerCase();
        valB = (b.company_name || b.name || '').toLowerCase();
      } else if (currentSortCol === 'date') {
        valA = new Date(a.last_activity_at || a.updated_at || 0).getTime();
        valB = new Date(b.last_activity_at || b.updated_at || 0).getTime();
      } else {
        valA = a.id; valB = b.id;
      }
      if (valA < valB) return currentSortDir === 'asc' ? -1 : 1;
      if (valA > valB) return currentSortDir === 'asc' ? 1 : -1;
      return 0;
    });

    const maxPage = Math.ceil(filtered.length / PER_PAGE) || 1;
    if (currentPage > maxPage) currentPage = maxPage;
    saveState();
    render();
  }

  window.toggleSort = (col) => {
    if (currentSortCol === col) {
      currentSortDir = currentSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      currentSortCol = col;
      currentSortDir = col === 'date' ? 'desc' : 'asc';
    }
    // Update sort icons visually using transform
    if(document.getElementById('sort-icon-name')) {
      const el = document.getElementById('sort-icon-name');
      el.style.transform = (currentSortCol === 'name' && currentSortDir === 'desc') ? 'rotate(180deg)' : 'none';
      el.style.opacity = currentSortCol === 'name' ? '1' : '0.4';
    }
    if(document.getElementById('sort-icon-date')) {
      const el = document.getElementById('sort-icon-date');
      el.style.transform = (currentSortCol === 'date' && currentSortDir === 'desc') ? 'rotate(180deg)' : 'none';
      el.style.opacity = currentSortCol === 'date' ? '1' : '0.4';
    }
    
    applyFilters();
  };

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
    window.updateSelectionUI();
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
    <div class="cl-row fade-in" onclick="location.href='admin_client_detail.html?id=${cId}'" style="display: grid; grid-template-columns: 1.6fr 1.2fr 1.4fr 1.2fr 1fr 1fr 100px; gap: 16px; padding: 10px 24px; min-height: 54px; align-items: center; border-bottom: 1px solid var(--border); cursor: pointer;">
      
      <!-- 1. Ragione Sociale -->
      <div class="cl-col" style="min-width: 0;">
        <div class="cl-row-identity" style="display:flex; gap:12px; align-items:center; min-width:0;">
          <div class="mac-select-btn" data-id="${cId}" onclick="window.toggleSelection(event, '${cId}')" title="Seleziona" style="flex-shrink:0;">
            <div class="mac-checkbox"></div>
          </div>
          <div class="avatar cl-row-avatar cl-row-avatar-blue" style="flex-shrink:0;">${initials}</div>
          <div class="cl-row-identity-body" style="min-width:0;">
            <div class="cl-row-name truncate" title="${display}" style="display:flex;align-items:center;gap:6px;">
              ${display}
            </div>
            <div class="cl-row-meta" style="flex-wrap:wrap;">
              ${referente ? `<span class="cl-row-chip">${iconUser}${referente}</span>` : ''}
              ${email ? `<a class="cl-row-chip cl-row-link truncate" href="mailto:${email}" onclick="event.stopPropagation()" style="color:#3b82f6; max-width: 150px;">${iconMail}${email}</a>` : ''}
              ${phoneVal ? `<a class="cl-row-chip cl-row-link" href="tel:${phoneVal}" onclick="event.stopPropagation()">${iconPhone}${phoneVal}</a>` : ''}
            </div>
          </div>
        </div>
      </div>

      <!-- 2. Fornitore -->
      <div class="cl-col" style="min-width: 0; display:flex; flex-direction:column; justify-content:center;">
        <div class="cl-data-val truncate" style="color:var(--gray-700); font-weight:500;">${fornitriceName || 'Nova CRM'}</div>
      </div>

      <!-- 3. Dati Base -->
      <div class="cl-col" style="min-width: 0; display:flex; flex-direction:column; justify-content:center;">
        <div class="cl-data-val truncate">${cityVal || ''}</div>
        <div class="cl-data-lbl truncate">${vatNumber ? 'P.IVA '+vatNumber : ''}</div>
        <div style="margin-top:4px; display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
          <span style="font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px;background:${originBg};color:${originColor};">${origin}</span>
          ${c.windoc_id
            ? `<span class="cl-windoc-badge cl-windoc-ok" title="Sincronizzato su Windoc">✓ WD</span>`
            : `<button class="cl-windoc-badge cl-windoc-push" onclick="event.stopPropagation();pushClientWindoc('${cId}')" title="Sincronizza su Windoc">↑ WD</button>`
          }
        </div>
      </div>

      <!-- 3. Stato / KPI -->
      <div class="cl-col" style="min-width: 0; display:flex; flex-direction:column; justify-content:center;">
        <div style="margin-bottom:2px;">${UI.pill(c.status)}</div>
        ${owner ? `<div class="cl-data-lbl truncate" title="${owner}">${iconUser}${owner}</div>` : ''}
      </div>

      <!-- 4. Operatività -->
      <div class="cl-col" style="min-width: 0; display:flex; flex-direction:column; justify-content:center;">
        <div class="cl-mini-kpi">${servicesN} Servizi · ${contractsN} Contratti</div>
        ${invoicesN > 0 ? `<div class="cl-mini-kpi truncate" style="color:var(--warning-600)" title="Ci sono ${invoicesN} fatture aperte da controllare">⚠️ ${invoicesN} Fatt. aperte</div>` : `<div class="cl-mini-kpi truncate" style="color:var(--gray-500)">Nessuna fattura pendente</div>`}
      </div>

      <!-- 5. Attività -->
      <div class="cl-col" style="min-width: 0; display:flex; flex-direction:column; justify-content:center;">
        <div class="cl-data-lbl">Ultima attività</div>
        <div class="cl-data-val truncate">${lastAct ? UI.date(lastAct) : 'Nessuna attività'}</div>
      </div>

      <!-- 6. Azioni -->
      <div class="cl-col cl-col-actions" style="display:flex; flex-direction:row; align-items:center; justify-content:flex-end; gap:12px;">
        <button class="icon-btn-header" style="opacity:0.8;" title="Archivia (Soft)" onclick="event.stopPropagation(); window.deleteClient('${cId}', false)" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.8">
          <span style="font-size:16px; line-height:1;">📦</span>
        </button>
        <button class="icon-btn-header" style="opacity:0.8;" title="Elimina Definitivamente" onclick="event.stopPropagation(); window.deleteClient('${cId}', true)" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.8">
          <span style="font-size:16px; line-height:1;">🗑️</span>
        </button>
      </div>
    </div>`;
  }

  window.deleteClient = async (id, force = false) => {
    if (force) {
      if (!confirm('ATTENZIONE: Stai per eliminare definitivamente questo cliente e tutto il suo storico (preventivi, contratti, log). Procedere?')) return;
    } else {
      if (!confirm('Eliminare (archiviare in cessato) questo cliente?')) return;
    }
    
    try {
      await API.Clients.remove(id, force);
      load(true);
      UI.toast(force ? 'Cliente eliminato definitivamente' : 'Cliente archiviato in cessato', 'info');
    } catch (e) { UI.toast(e.message, 'error'); }
  };
  
  window.changeClientStatus = async (id, currentStatus) => {
    const statuses = ['active', 'suspended', 'ceased', 'non_active', 'insolvent'];
    const msg = "Inserisci il nuovo stato:\n(active, suspended, ceased, non_active, insolvent)";
    const newStatus = prompt(msg, currentStatus);
    if (!newStatus) return;
    if (!statuses.includes(newStatus)) {
        UI.toast('Stato non valido.', 'error');
        return;
    }
    try {
      await API.Clients.update(id, { status: newStatus });
      UI.toast('Stato aggiornato', 'success');
      load(true);
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

  /* ── Selection Logic (State-driven) ─────────────────────── */
  window.selectedIds = new Set();

  window.toggleSelection = (e, id) => {
    e.stopPropagation();
    if (window.selectedIds.has(id)) {
      window.selectedIds.delete(id);
    } else {
      window.selectedIds.add(id);
    }
    window.updateSelectionUI();
  };

  window.toggleSelectAll = () => {
    if (!filtered || filtered.length === 0) return;
    if (window.selectedIds.size === filtered.length) {
      window.selectedIds.clear();
    } else {
      filtered.forEach(c => window.selectedIds.add(c.id));
    }
    window.updateSelectionUI();
  };

  window.clearSelection = () => {
    window.selectedIds.clear();
    window.updateSelectionUI();
  };

  window.updateSelectionUI = () => {
    const btnAll = $('btn-select-all');
    if (btnAll) {
      if (filtered && filtered.length > 0 && window.selectedIds.size === filtered.length) {
        btnAll.classList.add('selected');
      } else {
        btnAll.classList.remove('selected');
      }
    }

    document.querySelectorAll('.cl-row').forEach(row => {
      const sel = row.querySelector('.mac-select-btn[data-id]');
      if (sel) {
        const id = sel.dataset.id;
        if (window.selectedIds.has(id)) {
          sel.classList.add('selected');
          row.classList.add('selected-row');
        } else {
          sel.classList.remove('selected');
          row.classList.remove('selected-row');
        }
      }
    });

    const bar = $('mac-mass-action-bar');
    if (bar) {
      if (window.selectedIds.size > 0) {
        const count = $('mac-selected-count');
        if (count) count.textContent = window.selectedIds.size + ' selezionat' + (window.selectedIds.size === 1 ? 'o' : 'i');
        bar.classList.add('visible');
      } else {
        bar.classList.remove('visible');
      }
    }
  };

  window.massDelete = async (force = false) => {
    if (!window.selectedIds.size) return;
    if (force) {
      if (!confirm(`ATTENZIONE: Eliminare DEFINITIVAMENTE ${window.selectedIds.size} clienti e tutto il loro storico?`)) return;
    } else {
      if (!confirm(`Archiviare ${window.selectedIds.size} clienti in stato cessato?`)) return;
    }
    UI.toast(`Operazione in corso...`, 'info');
    for (const id of window.selectedIds) { try { await API.Clients.remove(id, force); } catch(e){} }
    UI.toast('Operazione completata', 'success');
    window.clearSelection();
    load(true);
  };

  window.massSyncWindoc = async () => {
    if (!confirm(`Sincronizzare ${window.selectedIds.size} clienti su Windoc?`)) return;
    UI.toast(`Sincronizzazione di ${window.selectedIds.size} clienti in corso...`, 'info');
    for (const id of window.selectedIds) { try { await API.Windoc.syncClient(id); } catch(e){} }
    UI.toast('Sincronizzazione completata', 'success');
    window.clearSelection();
    load(true);
  };

  window.onPageReady(async () => {
    load(true);
    // Select all listener is now generic via window.toggleSelectAll onclick
  });

})();
