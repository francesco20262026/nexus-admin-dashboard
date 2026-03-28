/* ============================================================
   admin_clients.js — Clients list page logic
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
  const filterOrigin   = $('cl-filter-origin');
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
  filterOrigin?.addEventListener('change',() => { currentPage = 1; applyFilters(); });
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
    // Populate company dropdown for the new client modal
    const companySelect = $('f-company-id');
    if (companySelect && _companies) {
      companySelect.innerHTML = '<option value="">Seleziona fornitrice...</option>' + 
        _companies.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }
    
    // Clear inputs
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
    const name = $('f-name')?.value?.trim();
    const email = $('f-email')?.value?.trim();

    if (!compId) { UI.toast('Seleziona l\'azienda fornitrice', 'warning'); return; }
    if (!name) { UI.toast('Ragione sociale obbligatoria', 'warning'); return; }
    if (!email) { UI.toast('Email contatto obbligatoria', 'warning'); return; }

    btnSaveModal.disabled = true;
    const oldHtml = btnSaveModal.innerHTML;
    btnSaveModal.innerHTML = '<div class="spinner style="width:14px;height:14px;border-width:2px;border-color:#fff transparent #fff transparent;"></div> <span style="margin-left:8px;">Salvataggio...</span>';

    try {
      await API.Clients.create({
        company_id: compId,
        company_name: name,
        vat_number: $('f-vat')?.value?.trim() || null,
        sdi_code: $('f-sdi')?.value?.trim() || null,
        sector: $('f-sector')?.value?.trim() || null,
        name: $('f-referente')?.value?.trim() || null,
        email: email,
        pec: $('f-pec')?.value?.trim() || null,
        phone: $('f-phone')?.value?.trim() || null,
        city: $('f-city')?.value?.trim() || null,
        address: $('f-address')?.value?.trim() || null,
        notes: $('f-notes')?.value?.trim() || null,
        create_portal_user: $('f-portal')?.checked || false
      });
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
      const errMsg = 'Impossibile caricare i clienti. Controlla la connessione e riprova.';
      list.innerHTML = UI.errorState(errMsg, 'window._reloadClients()');
      updateKpis();
      return;
    }

    populateDynamicFilters();
    updateKpis();
    applyFilters();
  }

  /* ── KPI tab counts (no Prospect in Clienti — those live in Onboarding) */
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

  /* ── Populate city and assignee filters from data ─────────────── */
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

  /* ── Quick-filter badge wiring (windoc, etc.) ──────────────────── */
  document.querySelectorAll('.cl-quick-badge').forEach(btn => {
    if (saved.quickFilter && btn.dataset.qf === saved.quickFilter) {
      document.querySelectorAll('.cl-quick-badge').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }
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

  /* ── Reset Filters ──────────────────────────────────────────── */
  $('btn-reset-filters')?.addEventListener('click', () => {
    if (searchEl) searchEl.value = '';
    [filterCity, filterOrigin, filterAssignee, filterInvoices, filterRenewal, filterServices, filterQuotes, filterActivities]
      .forEach(el => { if (el) el.value = ''; });
    activeQuickFilter = '';
    document.querySelectorAll('.cl-quick-badge').forEach(b => b.classList.toggle('active', b.dataset.qf === 'all'));
    currentPage = 1;
    applyFilters();
  });

  /* ── Apply filters ──────────────────────────────────────────── */
  function applyFilters() {
    const text     = (searchEl?.value || '').toLowerCase().trim();
    const city     = filterCity?.value     || '';
    const origin   = filterOrigin?.value   || '';
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
      if (VALID_STATUSES.length && c.status && !VALID_STATUSES.includes(c.status) && activeTab === 'all') return false;
      if (activeTab !== 'all' && c.status !== activeTab) return false;

      if (city && c.city !== city) return false;

      // Origin filter
      if (origin === 'windoc' && !c.windoc_id) return false;
      if (origin === 'manual' && c.windoc_id) return false;

      // Assignee filter
      if (assignee && c.owner_name !== assignee && c.assigned_to_name !== assignee) return false;

      // Invoices filter
      const invCount = c.open_invoices_count || 0;
      if (invoices === 'open' && invCount <= 0) return false;
      if (invoices === 'none' && invCount > 0) return false;

      // Renewal filter
      if (renewal) {
        if (!c.next_renewal_date) return false;
        const renDate = new Date(c.next_renewal_date);
        if (renewal === 'near' && (renDate < now || renDate > in30Days)) return false;
        if (renewal === 'expired' && renDate >= now) return false;
      }

      // Services filter
      const servN = c.active_services_count ?? c.services_count ?? 0;
      if (services === 'yes' && servN <= 0) return false;
      if (services === 'no' && servN > 0) return false;

      // Quotes filter
      const quoN = c.open_quotes_count ?? c.quotes_count ?? 0;
      if (quotes === 'open' && quoN <= 0) return false;
      if (quotes === 'none' && quoN > 0) return false;

      // Activities filter
      const actN = c.planned_activities_count ?? c.activities_count ?? 0;
      if (activities === 'planned' && actN <= 0) return false;
      if (activities === 'none' && actN > 0) return false;

      // Quick filter badge
      if (activeQuickFilter === 'windoc' && !c.windoc_id) return false;
      if (activeQuickFilter === 'no_windoc' && c.windoc_id) return false;

      if (text) {
        const hay = [c.company_name, c.name, c.email, c.phone, c.city, c.sector, c.referente, c.contact_name, c.vat_number, c.owner_name]
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

  /* ── Render list ────────────────────────────────────────────── */
  function render() {
    if (!list) return;

    if (!filtered.length) {
      const msg = ALL.length > 0
        ? I18n.t('common.no_results')    || 'Nessun cliente corrisponde ai filtri.'
        : I18n.t('common.no_data_title') || 'Nessun cliente trovato.';
      list.innerHTML = `<div class="list-card">${UI.createEmptyState(null, msg)}</div>`;
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
  }

  /* ── Render single row — dense 6-column operational layout ──── */
  function renderRow(c) {
    const display  = c.company_name || c.name || '—';
    const initials = display.slice(0, 2).toUpperCase();
    const hue      = Math.abs(((c.id || '').charCodeAt(0) || 0) * 53) % 360;

    const referente   = c.name && c.name !== display ? c.name : (c.referente || c.contact_name || '');
    const email       = c.email  || '';
    const phoneVal    = c.phone  || '';
    const cityVal     = c.city   || '';
    const vatNumber   = c.vat_number || '';
    const origin      = c.windoc_id ? 'Windoc'
                      : c.converted_from_onboarding ? 'Onb.'
                      : 'Manuale';
    const originColor = c.windoc_id ? '#1d4ed8' : c.converted_from_onboarding ? '#7c3aed' : '#6b7280';
    const originBg    = c.windoc_id ? '#eff6ff'  : c.converted_from_onboarding ? '#f3e8ff' : '#f3f4f6';
    const lastAct     = c.last_activity_at || c.updated_at || '';
    const servicesN   = c.active_services_count ?? c.services_count ?? 0;
    const contractsN  = c.active_contracts_count ?? 0;
    const invoicesN   = c.open_invoices_count ?? 0;
    const renewalDate = c.next_renewal_date || null;
    const owner       = c.assigned_to_name || c.owner_name || '';
    const creation    = c.created_at || '';
    const cId = c.id;

    // Helper SVG icons
    const iconUser  = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="11" height="11"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75"/></svg>`;
    const iconMail  = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="11" height="11"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"/></svg>`;
    const iconPhone = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="11" height="11"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 6.75Z"/></svg>`;

    return `
    <div class="cl-row fade-in" onclick="location.href='admin_client_detail.html?id=${cId}'">

      <!-- Colonna 1: Ragione sociale + Contatti -->
      <div class="cl-col cl-col-1">
        <div class="cl-row-identity">
          <div class="avatar cl-row-avatar" style="background:hsl(${hue},48%,52%)">${initials}</div>
          <div class="cl-row-identity-body">
            <div class="cl-row-name" title="${display}">${display}</div>
            <div class="cl-row-meta">
              ${referente ? `<span class="cl-row-chip" title="Referente">${iconUser}${referente}</span>` : ''}
              ${email ? `<a class="cl-row-chip cl-row-link" href="mailto:${email}" onclick="event.stopPropagation()">${iconMail}${email}</a>` : ''}
              ${phoneVal ? `<a class="cl-row-chip cl-row-link" href="tel:${phoneVal}" onclick="event.stopPropagation()">${iconPhone}${phoneVal}</a>` : ''}
            </div>
          </div>
        </div>
      </div>

      <!-- Colonna 2: Città, P.IVA, Origine -->
      <div class="cl-col cl-col-2">
        <div class="cl-data-val">${cityVal || '—'}</div>
        <div class="cl-data-lbl">${vatNumber ? 'P.IVA '+vatNumber : '—'}</div>
        <div style="margin-top:2px;">
          <span style="font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px;background:${originBg};color:${originColor};">${origin}</span>
        </div>
      </div>

      <!-- Colonna 3: Stato, Assegnatario, Data Creazione -->
      <div class="cl-col cl-col-3">
        <div style="margin-bottom:2px;">${UI.pill(c.status)}</div>
        ${owner ? `<div class="cl-data-lbl" style="margin-top:2px;">${iconUser}${owner}</div>` : ''}
        ${creation ? `<div class="cl-data-lbl">${UI.date(creation)}</div>` : ''}
      </div>

      <!-- Colonna 4: Dati operativi (Servizi, Fatture, Rinnovo) -->
      <div class="cl-col cl-col-4">
        <div class="cl-mini-kpi">
          <span class="cl-mini-kpi-val">${servicesN}</span> Servizi · 
          <span class="cl-mini-kpi-val">${contractsN}</span> Contratti
        </div>
        ${invoicesN > 0 ? `<div class="cl-mini-kpi" style="color:var(--warning-600)"><span class="cl-mini-kpi-val">${invoicesN}</span> Fatture aperte</div>` : `<div class="cl-mini-kpi" style="color:var(--gray-400)">Fatture OK</div>`}
        ${renewalDate ? `<div class="cl-mini-kpi" style="color:var(--warning-600)">Scadenza: <span class="cl-mini-kpi-val">${UI.date(renewalDate)}</span></div>` : ''}
      </div>

      <!-- Colonna 5: Ultima attività -->
      <div class="cl-col cl-col-5">
        <div class="cl-data-lbl">Ultima attività</div>
        <div class="cl-data-val">${lastAct ? UI.date(lastAct) : 'Nessuna attività'}</div>
      </div>

      <!-- Colonna 6: Azioni rapide (Portal e Windoc) -->
      <div class="cl-col cl-col-6 cl-col-actions" style="flex-direction:column; align-items:flex-end; gap:4px; justify-content:center;" onclick="event.stopPropagation()">
        ${c.windoc_id
          ? `<span class="cl-windoc-badge cl-windoc-ok" title="Windoc ID: ${c.windoc_id}" onclick="event.stopPropagation()">Windoc ✓</span>`
          : `<button class="cl-windoc-badge cl-windoc-push" title="Invia su Windoc" onclick="event.stopPropagation();pushClientWindoc('${cId}')">↑ Windoc</button>`
        }
        
        <div style="font-size:10px; font-weight:600; display:flex; align-items:center; gap:4px;">
          ${c.portal_first_login_at 
              ? `<span style="color:#059669;" title="Accesso effettuato: ${UI.date(c.portal_first_login_at)}">✓ Accesso effettuato</span>` 
              : (c.portal_invited_at || c.portal_email) 
                  ? `<span style="color:#d97706;" title="Invito inviato">✉ Accesso inviato</span>` 
                  : `<span style="color:#9ca3af;">Nessun accesso</span>`
           }
        </div>
      </div>

    </div>`;
  }

  /* ── Delete ─────────────────────────────────────────────────── */
  window.deleteClient = async (id) => {
    if (!confirm(I18n.t('cl.confirm_delete') || 'Eliminare questo cliente? L\'operazione è irreversibile.')) return;
    try {
      await API.Clients.remove(id);
      ALL = ALL.filter(c => c.id !== id);
      updateKpis();
      applyFilters();
      UI.toast(I18n.t('cl.deleted_ok') || 'Cliente eliminato', 'info');
    } catch (e) {
      UI.toast(e?.message || I18n.t('error.generic'), 'error');
    }
  };

  /* ── Modal: Save new client ─────────────────────────────────── */
  const btnSave = $('modal-save-btn');
  btnSave?.addEventListener('click', async () => {
    const get = id => $(id)?.value?.trim() || '';
    const name    = get('f-name');
    const email   = get('f-email');
    const company = get('f-company-id');
    
    if (!company) {
      UI.toast('Campo obbligatorio: Azienda fornitrice', 'warning');
      return;
    }
    if (!name || !email) {
      UI.toast(I18n.t('cl.form_required') || 'Nome e email sono obbligatori', 'warning');
      return;
    }
    btnSave.disabled = true;
    try {
      const created = await API.Clients.create({
        company_id:   company,
        company_name: name,   // ragione sociale → company_name (master field)
        name:         name,   // keep for backward compat
        email,
        phone:       get('f-phone')   || null,
        city:        get('f-city')    || null,
        address:     get('f-address') || null,
        vat_number:  get('f-vat')     || null,
        dest_code:   get('f-sdi')     || null,
        pec:         get('f-pec')     || null,
        notes:       get('f-notes')   || null,
        invite_portal: $('f-portal')?.checked || false,
      });
      if (created) ALL.unshift(created);
      modal?.classList.remove('open');
      updateKpis();
      populateDynamicFilters();
      applyFilters();
      UI.toast(`${I18n.t('cl.created_ok') || 'Cliente creato'}: ${name}`, 'success');
    } catch (e) {
      const msg = e?.message || '';
      if (msg.startsWith('SOFT:')) {
        // Soft duplicate: ask user to confirm before proceeding
        const clean = msg.replace(/^SOFT:/, '').trim();
        if (confirm(clean)) {
          // Re-submit with force_create to bypass the soft check
          try {
            const created = await API.Clients.create({
              company_id:   company,
              company_name: name,
              name,
              email,
              phone:       get('f-phone')   || null,
              city:        get('f-city')    || null,
              address:     get('f-address') || null,
              vat_number:  get('f-vat')     || null,
              dest_code:   get('f-sdi')     || null,
              pec:         get('f-pec')     || null,
              notes:       get('f-notes')   || null,
              invite_portal: $('f-portal')?.checked || false,
              force_create: true,
            });
            if (created) ALL.unshift(created);
            modal?.classList.remove('open');
            updateKpis(); populateDynamicFilters(); applyFilters();
            UI.toast(`${I18n.t('cl.created_ok') || 'Cliente creato'}: ${name}`, 'success');
          } catch (e2) { UI.toast(e2?.message || I18n.t('error.generic'), 'error'); }
        }
      } else {
        UI.toast(msg.replace(/^HARD:/, '') || I18n.t('error.generic'), 'error');
      }
    } finally {
      btnSave.disabled = false;
    }
  });

  /* ── Init ───────────────────────────────────────────────────── */
  window.onPageReady(async () => {
    await I18n.init('lang-switcher-slot');
    // Preload companies for the modal dropdown
    try {
      const res = await API.Companies.list();
      _companies = Array.isArray(res) ? res : (res?.items ?? res?.data ?? []);
    } catch (_) { _companies = []; }
    load();

    // ── Windoc Import Modal ──────────────────────────────────────
    const btnImportWindoc = $('btn-import-windoc');
    const modalWindoc     = $('modal-windoc-import');
    const contactList     = $('windoc-contact-list');
    const searchInput     = $('windoc-search');
    const btnSearch       = $('btn-windoc-search');
    const btnConfirm      = $('btn-windoc-import-confirm');
    const selectAllCb     = $('windoc-select-all');
    const countEl         = $('windoc-selected-count');

    let _windocContacts = [];

    function _updateImportCount() {
      const selected = contactList?.querySelectorAll('.wdc-cb:checked').length || 0;
      if (countEl) countEl.textContent = selected ? `${selected} selezionati` : '';
      if (btnConfirm) btnConfirm.disabled = selected === 0;
    }

    function _renderContacts(contacts) {
      _windocContacts = contacts;
      if (!contacts.length) {
        contactList.innerHTML = '<div style="padding:32px;text-align:center;color:#9ca3af;">Nessun contatto trovato</div>';
        _updateImportCount();
        return;
      }
      contactList.innerHTML = contacts.map((c, i) => `
        <label class="wdc-row" style="display:flex;align-items:flex-start;gap:12px;padding:12px 14px;border-bottom:1px solid #f3f4f6;cursor:${c.already_imported ? 'default' : 'pointer'};background:${c.already_imported ? '#f9fafb' : '#fff'};transition:background .15s;" onmouseover="this.style.background='${c.already_imported ? '#f9fafb' : '#f0fdf4'}'" onmouseout="this.style.background='${c.already_imported ? '#f9fafb' : '#fff'}'">
          <input type="checkbox" class="wdc-cb" data-idx="${i}" style="margin-top:3px;accent-color:#16a34a;" ${c.already_imported ? 'disabled checked' : ''} />
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:600;color:#111827;display:flex;align-items:center;gap:6px;">
              ${c.company_name || '—'}
              ${c.already_imported ? '<span style="font-size:10px;font-weight:700;background:#dcfce7;color:#16a34a;padding:1px 7px;border-radius:999px;">Già importato</span>' : ''}
            </div>
            <div style="font-size:12px;color:#6b7280;margin-top:2px;display:flex;gap:14px;flex-wrap:wrap;">
              ${c.vat_number ? `<span>P.IVA: ${c.vat_number}</span>` : ''}
              ${c.email ? `<span>✉ ${c.email}</span>` : ''}
              ${c.city ? `<span>📍 ${c.city}${c.province ? ` (${c.province})` : ''}</span>` : ''}
            </div>
          </div>
        </label>`).join('');
      contactList.querySelectorAll('.wdc-cb').forEach(cb => cb.addEventListener('change', _updateImportCount));
      _updateImportCount();
    }

    async function _fetchContacts() {
      if (!contactList) return;
      contactList.innerHTML = '<div style="padding:32px;text-align:center;color:#9ca3af;"><div class="spinner" style="margin:0 auto 8px;"></div>Caricamento dalla rubrica Windoc...</div>';
      if (btnConfirm) btnConfirm.disabled = true;
      try {
        const q = searchInput?.value?.trim() || '';
        const res = await API.Windoc.contacts(q ? { search: q } : {});
        _renderContacts(res.data || []);
      } catch (e) {
        contactList.innerHTML = `<div style="padding:32px;text-align:center;color:#ef4444;"><strong>Errore connessione Windoc</strong><br><span style="font-size:12px;">${e.message || 'Verifica le credenziali API nelle Impostazioni'}</span></div>`;
      }
    }

    btnImportWindoc?.addEventListener('click', () => {
      modalWindoc?.classList.add('open');
      _fetchContacts();
    });

    btnSearch?.addEventListener('click', _fetchContacts);
    searchInput?.addEventListener('keydown', e => { if (e.key === 'Enter') _fetchContacts(); });

    selectAllCb?.addEventListener('change', () => {
      contactList?.querySelectorAll('.wdc-cb:not(:disabled)').forEach(cb => { cb.checked = selectAllCb.checked; });
      _updateImportCount();
    });

    btnConfirm?.addEventListener('click', async () => {
      const selected = [...(contactList?.querySelectorAll('.wdc-cb:checked:not(:disabled)') || [])]
        .map(cb => _windocContacts[+cb.dataset.idx])
        .filter(Boolean);
      if (!selected.length) return;
      btnConfirm.disabled = true;
      btnConfirm.textContent = 'Importazione in corso…';
      try {
        const res = await API.Windoc.importContacts(selected);
        UI.toast(`Importati ${res.created} clienti${res.skipped ? `, ${res.skipped} già presenti` : ''}${res.errors ? `, ${res.errors} errori` : ''}`, res.errors ? 'warning' : 'success');
        modalWindoc?.classList.remove('open');
        load(true);
      } catch (e) {
        UI.toast(e.message || 'Errore durante l\'importazione', 'error');
      } finally {
        btnConfirm.disabled = false;
        btnConfirm.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:15px;height:15px;"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg> Importa selezionati';
      }
    });
  });

  /* ── Push client to Windoc (called from list card) ──────────── */
  window.pushClientWindoc = async (clientId) => {
    try {
      UI.toast('Sincronizzazione su Windoc...', 'info');
      await API.Windoc.syncClient(clientId);
      UI.toast('Cliente sincronizzato su Windoc ✓', 'success');
      load(true);
    } catch (e) {
      UI.toast(e.message || 'Errore sincronizzazione Windoc', 'error');
    }
  };

})();
