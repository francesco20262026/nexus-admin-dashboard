/* ============================================================
   admin_onboarding.js — Onboarding / Lead pipeline
   Pipeline ONLY for pre-client leads and activation flows.
   NOT for admin users, tenants, or providers.
   ============================================================ */
'use strict';

(function () {
  Auth.guard('admin');
  Auth.initUI();

  /* ── Constants ──────────────────────────────────────────────── */
  const PER_PAGE = 20;

  /* ── State ─────────────────────────────────────────────────── */
  let ALL         = [];
  let filtered    = [];
  let currentPage = 1;
  let activeTab   = 'all';
  let editingId   = null;   // ID of record being edited

  const saved = window.SessionState?.load('onboarding') || {};
  if (saved.activeTab)   activeTab   = saved.activeTab;
  if (saved.currentPage) currentPage = saved.currentPage;

  /* ── DOM refs ──────────────────────────────────────────────── */
  const $ = id => document.getElementById(id);
  const list           = $('onb-list');
  const searchEl       = $('onb-search');
  const infoEl         = $('onb-info');
  const paginationEl   = $('onb-pagination');
  const filterPriority = $('onb-filter-priority');
  const filterAssignee = $('onb-filter-assignee');
  const tabBar         = $('onb-tab-bar');
  const btnRefresh     = $('btn-refresh-onb');
  const btnNew         = $('btn-new-onboarding');

  /* ── Priority helpers ───────────────────────────────────────── */
  const PRIORITY_CONFIG = {
    high:   { cls: 'pill-danger',  lbl: 'Alta' },
    medium: { cls: 'pill-warning', lbl: 'Media' },
    low:    { cls: 'pill-gray',    lbl: 'Bassa' },
  };

  function priorityPill(p) {
    if (!p) return '';
    const c = PRIORITY_CONFIG[p] || { cls: 'pill-gray', lbl: p };
    return `<span class="pill ${c.cls}" style="font-size:10px;">${I18n.t('onb.priority_' + p) || c.lbl}</span>`;
  }

  /* ── Step helpers ───────────────────────────────────────────── */
  const STEPS = ['Contatto', 'Proposta', 'Documenti', 'Verifica', 'Attivazione'];

  function stepBar(r) {
    const total = r.steps_total     || STEPS.length;
    const done  = r.steps_completed || 0;
    const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
    const color = r.status === 'blocked' ? 'var(--color-danger)'
                : pct === 100           ? 'var(--color-success)'
                :                         'var(--color-primary)';
    const label = r.current_step_label || (STEPS[done] ? STEPS[done] : `Step ${done + 1}`);
    return `
      <div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
        <div style="flex:1;height:5px;background:var(--gray-200);border-radius:3px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:${color};border-radius:3px;transition:width .4s;"></div>
        </div>
        <span style="font-size:11px;color:var(--gray-500);white-space:nowrap;">${done}/${total}</span>
      </div>
      <div style="font-size:11px;color:var(--gray-500);margin-top:3px;">
        ${I18n.t('onb.current_step') || 'Step corrente'}: <strong style="color:var(--gray-700);">${label}</strong>
      </div>`;
  }

  /* ── Restore tab ────────────────────────────────────────────── */
  tabBar?.querySelectorAll('.filter-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === activeTab);
  });
  if (saved.search && searchEl) searchEl.value = saved.search;

  /* ── Save state ─────────────────────────────────────────────── */
  function saveState() {
    window.SessionState?.save('onboarding', {
      activeTab,
      currentPage,
      search: searchEl?.value || '',
    });
  }

  /* ── Tab clicks ─────────────────────────────────────────────── */
  tabBar?.addEventListener('click', e => {
    const btn = e.target.closest('.filter-tab');
    if (!btn) return;
    tabBar.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    // Sync the status dropdown
      activeTab   = btn.dataset.tab;
    currentPage = 1;
    applyFilters();
  });

  /* ── Filter change handlers ─────────────────────────────────── */
  searchEl?.addEventListener('input',   () => { currentPage = 1; applyFilters(); });
    filterPriority?.addEventListener('change', () => { currentPage = 1; applyFilters(); });
  filterAssignee?.addEventListener('change', () => { currentPage = 1; applyFilters(); });

  /* ── Refresh + company switch ───────────────────────────────── */
  btnRefresh?.addEventListener('click', () => load(true));
  window.addEventListener('companyChanged', () => load(true));

  /* ── New onboarding ─────────────────────────────────────────── */
  btnNew?.addEventListener('click', () => openForm(null));

  /* ── Load ───────────────────────────────────────────────────── */
  window._reloadOnboarding = () => load(true);

  async function load(force = false) {
    if (!list) return;
    list.innerHTML = UI.skeletonCardList(5);

    try {
      const res = await API.Onboarding.list();
      ALL = Array.isArray(res) ? res : (res?.items ?? res?.data ?? []);
    } catch (e) {
      console.error('[onboarding] load error:', e);
      const errMsg = 'Impossibile caricare la pipeline. Controlla la connessione e riprova.';
      list.innerHTML = UI.errorState(errMsg, 'window._reloadOnboarding()');
      updateKpis();
      return;
    }

    populateAssigneeFilter();
    updateKpis();
    applyFilters();
  }

  /* ── KPI cards ──────────────────────────────────────────────── */
  function updateKpis() {
    const now   = new Date();
    const month = now.getMonth();
    const year  = now.getFullYear();

    const kpiNew       = ALL.filter(r => r.status === 'new').length;
    const kpiProgress  = ALL.filter(r => r.status === 'in_progress').length;
    const kpiBlocked   = ALL.filter(r => r.status === 'blocked').length;
    const kpiConverted = ALL.filter(r => {
      if (r.status !== 'converted') return false;
      const d = r.converted_at ? new Date(r.converted_at) : null;
      return d && d.getMonth() === month && d.getFullYear() === year;
    }).length;

    const set = (id, val, meta) => {
      const el = $(id); if (el) el.textContent = val;
      const em = $(id + '-meta'); if (em && meta) em.textContent = meta;
    };
    set('kpi-onb-new',       kpiNew,       I18n.t('onb.kpi_new_meta') || 'Lead ricevuti');
    set('kpi-onb-progress',  kpiProgress,  I18n.t('onb.kpi_progress_meta') || 'In attivazione');
    set('kpi-onb-blocked',   kpiBlocked,   I18n.t('onb.kpi_blocked_meta') || 'Richiedono attenzione');
    set('kpi-onb-converted', kpiConverted, I18n.t('onb.kpi_converted_meta') || 'Nel mese corrente');
  }

  /* ── Populate assignee filter ─────────────────────────────────── */
  function populateAssigneeFilter() {
    if (!filterAssignee) return;
    const names = [...new Set(ALL.map(r => r.assigned_to).filter(Boolean))];
    // Keep first option (all)
    filterAssignee.innerHTML = `<option value="">${I18n.t('onb.filter_all_assignee') || 'Tutti gli assegnatari'}</option>` +
      names.map(n => `<option value="${n}">${n}</option>`).join('');
  }

  /* ── Apply filters ──────────────────────────────────────────── */
  function applyFilters() {
    const text     = (searchEl?.value || '').toLowerCase().trim();
    const priority = filterPriority?.value || '';
    const assignee = filterAssignee?.value || '';

    filtered = ALL.filter(r => {
      if (activeTab !== 'all' && r.status !== activeTab) return false;
      if (priority && r.priority    !== priority) return false;
      if (assignee && r.assigned_to !== assignee) return false;
      if (text) {
        const hay = [r.lead_name, r.company_name, r.email, r.reference_name, r.service_interest]
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
        ? I18n.t('common.no_results') || 'Nessuna pratica corrisponde ai filtri.'
        : I18n.t('onb.empty')         || 'Nessuna pratica di onboarding trovata.';
      list.innerHTML = `<div class="list-card">${UI.createEmptyState(null, msg)}</div>`;
      if (infoEl) infoEl.textContent = '';
      if (paginationEl) paginationEl.innerHTML = '';
      return;
    }

    const page = filtered.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

    list.innerHTML = page.map(r => renderRow(r)).join('');

    // Info
    const start = (currentPage - 1) * PER_PAGE + 1;
    const end   = Math.min(currentPage * PER_PAGE, filtered.length);
    if (infoEl) infoEl.textContent = `${start}–${end} di ${filtered.length}`;

    // Pagination
    UI.pagination(paginationEl, null, currentPage, filtered.length, PER_PAGE, p => {
      currentPage = p; saveState(); render();
    });
  }

  /* ── Render single row ──────────────────────────────────────── */
  function renderRow(r) {
    const companyLine  = r.company_name || r.lead_name || 0;
    const refLine      = r.lead_name !== r.company_name ? r.lead_name : '';
    const service      = r.service_interest || r.service || '';
    const assignedTo   = r.assigned_to || '';
    const lastActivity = r.last_activity_at || r.updated_at || r.created_at;
    const blocked      = r.status === 'blocked';
    const converted    = r.status === 'converted';

    // Actions
    const actions = [
      `<button class="btn btn-ghost btn-sm" onclick="onbOpenDetail('${r.id}')" title="${I18n.t('onb.action_view') || 'Apri dettaglio'}">
        <svg style="width:14px;height:14px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/></svg>
      </button>`,
      `<button class="btn btn-ghost btn-sm" onclick="onbEdit('${r.id}')" title="${I18n.t('onb.action_edit') || 'Modifica'}">
        <svg style="width:14px;height:14px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125"/></svg>
      </button>`,
    ];

    if (!converted && !blocked) {
      actions.push(
        `<button class="btn btn-ghost btn-sm" onclick="onbAdvanceStep('${r.id}')" title="${I18n.t('onb.action_advance') || 'Avanza step'}">
          <svg style="width:14px;height:14px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5"/></svg>
        </button>`
      );
    }

    if (!blocked && !converted) {
      actions.push(
        `<button class="btn btn-ghost btn-sm" style="color:var(--color-danger);" onclick="onbMarkBlocked('${r.id}')" title="${I18n.t('onb.action_block') || 'Segna bloccato'}">
          <svg style="width:14px;height:14px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636"/></svg>
        </button>`
      );
    }

    if (r.status === 'ready') {
      actions.push(
        `<button class="btn btn-primary btn-sm" onclick="onbConvert('${r.id}')">${I18n.t('onb.action_convert') || 'Converti in cliente'}</button>`
      );
    }
    if (converted && r.client_id) {
      actions.push(
        `<a class="btn btn-secondary btn-sm" href="admin_client_detail.html?id=${r.client_id}">${I18n.t('onb.view_client') || 'Vedi cliente'}</a>`
      );
    }

    return `
    <div class="list-card fade-in onb-row" data-id="${r.id}" style="cursor:default;${blocked ? 'border-left:3px solid var(--color-danger);' : ''}">
      <!-- Top row: azienda + pill + priority -->
      <div class="list-card-header" style="gap:8px;">
        <div style="display:flex;flex-direction:column;min-width:0;">
          <div class="list-card-title" style="cursor:pointer;" onclick="onbOpenDetail('${r.id}')">${companyLine}</div>
          ${refLine ? `<div style="font-size:12px;color:var(--gray-500);">${refLine}</div>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
          ${priorityPill(r.priority)}
          ${UI.pill(r.status)}
        </div>
      </div>
      <!-- Meta row -->
      <div class="list-card-body" style="gap:12px;flex-wrap:wrap;">
        <!-- Servizio -->
        ${service ? `
        <div class="list-card-meta" title="${I18n.t('onb.field_service') || 'Servizio'}">
          <svg style="width:13px;height:13px;color:var(--gray-400);" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/></svg>
          <span>${service}</span>
        </div>` : ''}
        <!-- Ultima attività -->
        ${lastActivity ? `
        <div class="list-card-meta" title="${I18n.t('onb.last_activity') || 'Ultima attività'}">
          <svg style="width:13px;height:13px;color:var(--gray-400);" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
          <span>${UI.date(lastActivity)}</span>
        </div>` : ''}
        <!-- Assegnatario -->
        ${assignedTo ? `
        <div class="list-card-meta" title="${I18n.t('onb.assigned_to') || 'Assegnato a'}">
          <svg style="width:13px;height:13px;color:var(--gray-400);" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"/></svg>
          <span>${assignedTo}</span>
        </div>` : ''}
        <!-- Progress bar -->
        <div style="width:100%;">${stepBar(r)}</div>
        <!-- Actions -->
        <div class="row-actions" style="width:100%;justify-content:flex-end;">${actions.join('')}</div>
      </div>
    </div>`;
  }

  /* ── Detail panel ───────────────────────────────────────────── */
  window.onbOpenDetail = async (id) => {
    const overlay = $('onb-detail-overlay');
    const body    = $('onb-detail-body');
    const footer  = $('onb-detail-footer');
    if (!overlay) return;

    // Show immediately with local data while fetching
    let r = ALL.find(x => x.id === id);
    if (!r) return;

    $('onb-detail-title').textContent   = r.company_name || r.lead_name || 0;
    $('onb-detail-company').textContent = r.lead_name || r.email || '';
    $('onb-detail-status-pill').innerHTML = UI.pill(r.status);
    overlay.classList.add('open');
    body.innerHTML = `<div style="padding:20px 0;text-align:center;color:var(--gray-400);">${I18n.t('common.loading') || 'Caricamento…'}</div>`;
    footer.innerHTML = '';

    // Try to fetch fresh detail from API
    try {
      const detail = await API.Onboarding.get(id);
      if (detail) r = detail;
    } catch (_) {}

    // Render detail body
    body.innerHTML = renderDetailBody(r);

    // Footer actions
    const footerBtns = [
      `<button class="btn btn-ghost" onclick="closeOnbDetail()" data-i18n="modal.close">${I18n.t('modal.close') || 'Chiudi'}</button>`,
      `<button class="btn btn-secondary" onclick="closeOnbDetail();onbEdit('${r.id}')">${I18n.t('onb.action_edit') || 'Modifica'}</button>`,
    ];
    if (!['blocked','converted'].includes(r.status)) {
      footerBtns.push(`<button class="btn btn-secondary" onclick="closeOnbDetail();onbAdvanceStep('${r.id}')">${I18n.t('onb.action_advance') || 'Avanza step'}</button>`);
      footerBtns.push(`<button class="btn btn-danger" onclick="closeOnbDetail();onbMarkBlocked('${r.id}')">${I18n.t('onb.action_block') || 'Segna bloccato'}</button>`);
    }
    if (r.status === 'ready') {
      footerBtns.push(`<button class="btn btn-primary" onclick="closeOnbDetail();onbConvert('${r.id}')">${I18n.t('onb.action_convert') || 'Converti in cliente'}</button>`);
    }
    if (r.status === 'converted' && r.client_id) {
      footerBtns.push(`<a class="btn btn-primary" href="admin_client_detail.html?id=${r.client_id}">${I18n.t('onb.view_client') || 'Vedi cliente'}</a>`);
    }
    footer.innerHTML = footerBtns.join('');
  };

  function renderDetailBody(r) {
    const row = (label, value) => value
      ? `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);">
           <span style="font-size:13px;color:var(--gray-500);">${label}</span>
           <span style="font-size:13px;font-weight:500;color:var(--gray-800);text-align:right;max-width:60%;">${value}</span>
         </div>`
      : '';

    const section = (title) =>
      `<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--gray-400);margin:18px 0 4px;">${title}</div>`;

    return `
      ${section(I18n.t('onb.detail_base') || 'Dati base')}
      ${row(I18n.t('onb.field_company')     || 'Azienda',         r.company_name)}
      ${row(I18n.t('onb.field_lead_name')   || 'Referente',       r.lead_name)}
      ${row(I18n.t('onb.field_email')       || 'Email',           r.email ? `<a href="mailto:${r.email}">${r.email}</a>` : '')}
      ${row(I18n.t('onb.field_phone')       || 'Telefono',        r.phone)}
      ${row(I18n.t('onb.field_priority')    || 'Priorità',        priorityPill(r.priority))}
      ${row(I18n.t('onb.assigned_to')       || 'Assegnato a',     r.assigned_to)}

      ${section(I18n.t('onb.detail_process') || 'Stato processo')}
      ${row(I18n.t('tbl.status')             || 'Stato',           UI.pill(r.status))}
      ${row(I18n.t('onb.current_step')       || 'Step corrente',   r.current_step_label || (STEPS[r.steps_completed || 0] ?? 0))}
      <div style="padding:10px 0;">${stepBar(r)}</div>

      ${section(I18n.t('onb.detail_service') || 'Servizio / Proposta')}
      ${row(I18n.t('onb.field_service')      || 'Servizio di interesse', r.service_interest || r.service)}
      ${row(I18n.t('onb.field_proposal')     || 'Proposta commerciale',  r.proposal_ref)}
      ${row(I18n.t('onb.field_value')        || 'Valore stimato',        r.estimated_value ? UI.currency(r.estimated_value) : '')}

      ${section(I18n.t('onb.detail_docs') || 'Documenti richiesti')}
      <div style="font-size:13px;color:var(--gray-600);padding:6px 0;">
        ${renderDocsList(r.documents_required)}
      </div>

      ${r.admin_notes || r.preliminary_sync ? `
        ${section(I18n.t('onb.detail_admin') || 'Note / Sync preliminare')}
        ${row(I18n.t('onb.field_notes')      || 'Note', r.admin_notes)}
        ${row(I18n.t('onb.preliminary_sync') || 'Sync preliminare', r.preliminary_sync)}
      ` : ''}

      ${row(I18n.t('onb.created_at')  || 'Creato il',           r.created_at  ? UI.date(r.created_at)  : '')}
      ${row(I18n.t('onb.updated_at')  || 'Aggiornato il',       r.updated_at  ? UI.date(r.updated_at)  : '')}
      ${r.converted_at ? row(I18n.t('onb.converted_at') || 'Convertito il', UI.date(r.converted_at)) : ''}
    `;
  }

  function renderDocsList(docs) {
    if (!docs || !docs.length) return `<em style="color:var(--gray-400);">${I18n.t('onb.no_docs') || 'Nessun documento richiesto'}</em>`;
    if (typeof docs === 'string') {
      try { docs = JSON.parse(docs); } catch { return `<span>${docs}</span>`; }
    }
    return docs.map(d => {
      const name     = typeof d === 'string' ? d : (d.label || d.name || 0);
      const received = typeof d === 'object' && d.received;
      const icon = received
        ? `<svg style="width:13px;height:13px;color:var(--color-success);" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>`
        : `<svg style="width:13px;height:13px;color:var(--gray-400);" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>`;
      return `<div style="display:flex;align-items:center;gap:6px;padding:3px 0;">${icon}<span>${name}</span></div>`;
    }).join('');
  }

  window.closeOnbDetail = () => $('onb-detail-overlay')?.classList.remove('open');

  /* ── Actions ─────────────────────────────────────────────────── */

  // Advance step
  window.onbAdvanceStep = async (id) => {
    const r = ALL.find(x => x.id === id);
    if (!r) return;
    const done  = (r.steps_completed || 0) + 1;
    const total = r.steps_total || STEPS.length;
    const newStatus = done >= total ? 'ready' : (r.status === 'new' ? 'in_progress' : r.status);
    try {
      await API.Onboarding.update(id, { steps_completed: done, status: newStatus });
      ALL = ALL.map(x => x.id === id ? { ...x, steps_completed: done, status: newStatus } : x);
      updateKpis();
      applyFilters();
      UI.toast(I18n.t('onb.step_advanced') || 'Step avanzato con successo', 'success');
    } catch (e) {
      UI.toast(e?.message || I18n.t('error.generic'), 'error');
    }
  };

  // Mark blocked
  window.onbMarkBlocked = async (id) => {
    if (!confirm(I18n.t('onb.confirm_block') || 'Segnare questa pratica come bloccata?')) return;
    try {
      await API.Onboarding.update(id, { status: 'blocked' });
      ALL = ALL.map(x => x.id === id ? { ...x, status: 'blocked' } : x);
      updateKpis();
      applyFilters();
      UI.toast(I18n.t('onb.blocked_ok') || 'Pratica segnata come bloccata', 'warning');
    } catch (e) {
      UI.toast(e?.message || I18n.t('error.generic'), 'error');
    }
  };

  // Convert to client
  window.onbConvert = async (id) => {
    if (!confirm(I18n.t('onb.confirm_convert') || 'Convertire questo lead in cliente attivo?\nViene creato il record anagrafico ufficiale.')) return;
    try {
      const res = await API.Onboarding.convert(id);
      const clientId = res?.client_id || res?.id || null;
      ALL = ALL.map(x => x.id === id ? { ...x, status: 'converted', converted_at: new Date().toISOString(), client_id: clientId } : x);
      updateKpis();
      applyFilters();
      UI.toast(I18n.t('onb.converted_ok') || 'Lead convertito in cliente con successo', 'success');
      if (clientId) setTimeout(() => { location.href = `admin_client_detail.html?id=${clientId}`; }, 800);
    } catch (e) {
      UI.toast(e?.message || I18n.t('error.generic'), 'error');
    }
  };

  /* ── Form: new / edit ───────────────────────────────────────── */
  window.onbEdit = (id) => openForm(id);

  function openForm(id) {
    editingId = id;
    const r   = id ? ALL.find(x => x.id === id) : null;

    $('onb-form-title').textContent = r
      ? (I18n.t('onb.edit') || 'Modifica Onboarding')
      : (I18n.t('onb.new')  || 'Nuovo Onboarding');

    // Fill form
    const set = (elId, val) => { const el = $(elId); if (el) el.value = val || ''; };
    set('onb-f-lead-name', r?.lead_name);
    set('onb-f-company',   r?.company_name);
    set('onb-f-email',     r?.email);
    set('onb-f-phone',     r?.phone);
    set('onb-f-service',   r?.service_interest || r?.service);
    set('onb-f-priority',  r?.priority || 'medium');
    set('onb-f-notes',     r?.admin_notes || r?.notes);

    $('onb-form-overlay')?.classList.add('open');
  }

  window.closeOnbForm = () => {
    $('onb-form-overlay')?.classList.remove('open');
    editingId = null;
  };

  $('onb-form-save')?.addEventListener('click', async () => {
    const get = id => $(id)?.value?.trim() || '';
    const leadName = get('onb-f-lead-name');
    const company  = get('onb-f-company');
    const email    = get('onb-f-email');

    if (!leadName || !company || !email) {
      UI.toast(I18n.t('onb.form_required') || 'Compilare i campi obbligatori (Nome, Azienda, Email)', 'warning');
      return;
    }

    const body = {
      lead_name:        leadName,
      company_name:     company,
      email,
      phone:            get('onb-f-phone'),
      service_interest: get('onb-f-service'),
      priority:         get('onb-f-priority') || 'medium',
      admin_notes:      get('onb-f-notes'),
    };

    const saveBtn = $('onb-form-save');
    if (saveBtn) saveBtn.disabled = true;

    try {
      if (editingId) {
        const updated = await API.Onboarding.update(editingId, body);
        ALL = ALL.map(x => x.id === editingId ? { ...x, ...body, ...(updated || {}) } : x);
        UI.toast(I18n.t('onb.updated_ok') || 'Pratica aggiornata', 'success');
      } else {
        const created = await API.Onboarding.create(body);
        if (created) ALL.unshift(created);
        UI.toast(I18n.t('onb.created_ok') || 'Onboarding creato con successo', 'success');
      }
      closeOnbForm();
      updateKpis();
      applyFilters();
    } catch (e) {
      UI.toast(e?.message || I18n.t('error.generic'), 'error');
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  });

  /* ── Init ──────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', async () => {
    await I18n.init('lang-switcher-slot');
    load();
  });

})();
