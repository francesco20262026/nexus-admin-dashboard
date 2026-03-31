/* ============================================================
   admin_onboarding.js Onboarding / Lead pipeline
   Pipeline ONLY for pre-client leads and activation flows.
   NOT for admin users, tenants, or providers.
   ============================================================ */
'use strict';

(function () {
  Auth.guard('admin');
  Auth.initUI();

  /* ── Constants ──────────────────────────────────────────────── */
  const PER_PAGE = 20;

  window.selectedIds = new Set();
  
  /* ── State ─────────────────────────────────────────────────── */
  let ALL         = [];
  let filtered    = [];
  let currentPage = 1;
  let activeTab   = 'all';
  let editingId   = null;   // ID of record being edited

  window.onbInjectRecord = (r) => {
    const idx = ALL.findIndex(x => x.id === r.id);
    if (idx > -1) ALL[idx] = r;
    else ALL.push(r);
  };

  window.currentSortDir = 'asc';
  window.toggleSort = () => {
    window.currentSortDir = window.currentSortDir === 'asc' ? 'desc' : 'asc';
    const icon = document.getElementById('sort-icon-prospect');
    if (icon) icon.style.transform = window.currentSortDir === 'asc' ? 'none' : 'rotate(180deg)';
    applyFilters();
  };

  // ── Select caches (loaded once at startup) ──────────────────────
  let _companies  = null;   // [{id, name, ...}]
  let _services   = null;   // [{id, name, ...}]
  let _users      = null;   // [{id, full_name, email, ...}]

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
const filterDateFrom = $('onb-filter-date-from');
const filterDateTo   = $('onb-filter-date-to');
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

  /* ── Status map (shared between list rows, detail header, stepper) ── */
  /* Colors match the pipeline card top-borders above the list */
  const STATUS_MAP = {
    new:                   { color: '#3b82f6', lbl: 'Nuovo' },
    quote_draft:           { color: '#8b5cf6', lbl: 'Prev. bozza' },
    quote_sent:            { color: '#8b5cf6', lbl: 'Preventivo inv.' },
    quote_accepted:        { color: '#8b5cf6', lbl: 'Prev. accettato' },
    contract_draft:        { color: '#0ea5e9', lbl: 'Contratto bozza' },
    contract_sent:         { color: '#0ea5e9', lbl: 'Contratto inv.' },
    contract_signed:       { color: '#0ea5e9', lbl: 'Contr. firmato' },
    proforma_draft:        { label: 'Proforma bozza',   color: '#2563eb', bg: '#eff6ff', icon: '📄' },
    proforma_issued:       { color: '#f59e0b', lbl: 'Proforma emessa' },
    payment_under_review:  { color: '#3b82f6', lbl: 'In verifica' },
    cancelled:             { color: '#ef4444', lbl: 'Annullata' },
    converted:             { label: 'Convertito',        color: '#1d4ed8', bg: '#dbeafe', icon: '✅' },
  };

  function statusPill(status) {
    const m = STATUS_MAP[status] || { color: '#9ca3af', lbl: status };
    return `<span style="display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;letter-spacing:.03em;background:${m.color};color:#fff;white-space:nowrap;">${m.lbl}</span>`;
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
  tabBar?.querySelectorAll('.cl-status-pill').forEach(btn => {
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

  /* ── Tab clicks (old tab bar) ──────────────────────────────── */
  tabBar?.addEventListener('click', e => {
    const btn = e.target.closest('.cl-status-pill');
    if (!btn) return;
    tabBar.querySelectorAll('.cl-status-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeTab   = btn.dataset.tab;
    currentPage = 1;
    applyFilters();
  });

  /* ── Pipeline bar click (filter by status) ──────────────────── */
  document.getElementById('onb-pipeline-bar')?.addEventListener('click', e => {
    const btn = e.target.closest('.cl-status-pill');
    if (!btn) return;
    document.querySelectorAll('#onb-pipeline-bar .cl-status-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeTab   = btn.dataset.tab || 'all';
    currentPage = 1;
    applyFilters();
  });

  /* ── Filter change handlers ─────────────────────────────────── */
  searchEl?.addEventListener('input',   debounce(() => { currentPage = 1; applyFilters(); }, 200));
  filterPriority?.addEventListener('change', () => { currentPage = 1; applyFilters(); });
  document.getElementById('onb-filter-status')?.addEventListener('change', () => { currentPage = 1; applyFilters(); });
filterDateFrom?.addEventListener('change', () => { currentPage = 1; applyFilters(); });
filterDateTo?.addEventListener('change',   () => { currentPage = 1; applyFilters(); });
  filterAssignee?.addEventListener('change', () => { currentPage = 1; applyFilters(); });

  /* ── Refresh + company switch ───────────────────────────────── */
  btnRefresh?.addEventListener('click', () => { if(window.UI) UI.toast('Aggiornamento in corso...', 'info'); load(true); });
  window.addEventListener('companyChanged', () => load(true));

  /* ── New onboarding ─────────────────────────────────────────── */
  btnNew?.addEventListener('click', () => openForm(null));

  /* ── Load ───────────────────────────────────────────────────── */
  window._reloadOnboarding = () => load(true);

  /* ── Preload form selects (once per session) ────────────────── */
  async function loadFormSelects() {
    try {
      if (!_companies) {
        const res = await API.Companies.list();
        _companies = Array.isArray(res) ? res : (res?.items ?? res?.data ?? []);
      }
    } catch(e) { _companies = _companies || []; }

    try {
      if (!_services) {
        const res = await API.Services.catalog(true);
        _services = Array.isArray(res) ? res : (res?.items ?? res?.data ?? []);
      }
    } catch(e) { _services = _services || []; }

    try {
      if (!_users) {
        const res = await API.Users.list();
        _users = Array.isArray(res) ? res : (res?.items ?? res?.users ?? res?.data ?? []);
      }
    } catch(e) { _users = _users || []; }
  }

  async function load(force = false) {
    // Always load form selects for the edit modals
    await loadFormSelects();

    if (!list) return;
    list.innerHTML = UI.skeletonCardList(5);

    try {
      const res = await API.Onboarding.list({}, force);
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

    // Attach Reset filter button
    const btnReset = document.getElementById('btn-reset-filters');
    if (btnReset && !btnReset.hasListener) {
      btnReset.hasListener = true;
      btnReset.addEventListener('click', () => {
        if (searchEl) searchEl.value = '';
        if (filterPriority) filterPriority.value = '';
        if (filterDateFrom) filterDateFrom.value = '';
        if (filterDateTo) filterDateTo.value = '';
        if (filterAssignee) filterAssignee.value = '';
        currentPage = 1;
        applyFilters();
      });
    }

    applyFilters();
  }

  /* ── Selection Logic ────────────────────────────────────────── */
  window.toggleSelection = (e, id) => {
    e.stopPropagation();
    if (window.selectedIds.has(id)) {
      window.selectedIds.delete(id);
    } else {
      window.selectedIds.add(id);
    }
    updateSelectionUI();
  };

  window.toggleSelectAll = () => {
    if (!filtered || filtered.length === 0) return;
    if (window.selectedIds.size === filtered.length) {
      window.selectedIds.clear();
    } else {
      filtered.forEach(r => window.selectedIds.add(r.id));
    }
    updateSelectionUI();
  };

  window.clearSelection = () => {
    window.selectedIds.clear();
    updateSelectionUI();
  };

  window.updateSelectionUI = () => {
    const btnAll = document.getElementById('btn-select-all');
    if (btnAll) {
      if (filtered && filtered.length > 0 && window.selectedIds.size === filtered.length) {
        btnAll.classList.add('selected');
      } else {
        btnAll.classList.remove('selected');
      }
    }

    document.querySelectorAll('.cl-row').forEach(row => {
      const sel = row.querySelector('.mac-row-select');
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

    const bar = document.getElementById('mac-mass-action-bar');
    if (bar) {
      if (window.selectedIds.size > 0) {
        document.getElementById('mac-selected-count').textContent = window.selectedIds.size + ' selezionat' + (window.selectedIds.size === 1 ? 'o' : 'i');
        bar.classList.add('visible');
      } else {
        bar.classList.remove('visible');
      }
    }
  };

  window.massAssign = async () => {
    if (!window.selectedIds.size) return;
    const a = prompt("Inserisci il nome dell'assegnatario per i " + window.selectedIds.size + " elementi selezionati:");
    if (!a && a !== "") return; // cancelled
    
    if (window.UI) window.UI.toast('Assegnazione in corso...', 'info');
    try {
      for (let id of window.selectedIds) {
         await API.Onboarding.update(id, { assigned_to: a });
      }
      if (window.UI) window.UI.toast('Assegnazione completata', 'success');
      window.clearSelection();
      if (window._reloadOnboarding) window._reloadOnboarding();
    } catch(e) {
      if (window.UI) window.UI.toast('Errore durante l\'assegnazione', 'error');
    }
  };

  window.massDelete = async () => {
    if (!window.selectedIds.size) return;
    if (!confirm('Sei sicuro di voler eliminare ' + window.selectedIds.size + ' elementi? Quest\'azione è irreversibile.')) return;
    
    if (window.UI) window.UI.toast('Eliminazione in corso...', 'info');
    try {
      for (let id of window.selectedIds) {
         await API.Onboarding.delete(id);
      }
      if (window.UI) window.UI.toast('Eliminazione completata', 'success');
      window.clearSelection();
      if (window._reloadOnboarding) window._reloadOnboarding();
    } catch(e) {
      if (window.UI) window.UI.toast('Errore durante l\'eliminazione', 'error');
    }
  };

  /* ── KPI cards + Pipeline pill counts ───────────────────────── */
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

    /* ── Pipeline pill counts (from ALL, grouped by status) ── */
    const cnt = s => ALL.filter(r => r.status === s).length;

    const ppSet = (id, val) => { const el = $(id); if (el) el.textContent = val; };
    const totalActive = ALL.filter(r => r.status !== 'cancelled').length;
    ppSet('pp-all', totalActive);

    const qDraft = cnt('quote_draft'), qSent = cnt('quote_sent'), qAcc = cnt('quote_accepted');
    const cDraft = cnt('contract_draft'), cSent = cnt('contract_sent'), cSign = cnt('contract_signed');

    try {
      const ppAllSub = $('pp-all-sub');
      if (ppAllSub && typeof cnt === 'function') {
        const parts = [];
        if (cnt('new') > 0) parts.push(cnt('new') + ' nuovi');
        const qSum = qDraft + qSent + qAcc;
        if (qSum > 0) parts.push(qSum + ' prev.');
        const cSum = cDraft + cSent + cSign;
        if (cSum > 0) parts.push(cSum + ' contr.');
        ppAllSub.textContent = parts.join(' \u00b7 ');
      }
    } catch(_) {}
    
    ppSet('pp-new', cnt('new'));
    
    // Preventivo
    ppSet('pp-quote_sent', qDraft + qSent + qAcc);
    const ppQSub = $('pp-quote_sub');
    if (ppQSub) {
      let qParts = [];
      if (qDraft > 0) qParts.push(`${qDraft} in bozza`);
      if (qSent > 0)  qParts.push(`${qSent} inviati`);
      if (qAcc > 0)   qParts.push(`${qAcc} accettati`);
      ppQSub.textContent = qParts.join(' · ');
    }
    
    // Contratto
    ppSet('pp-contract_sent', cDraft + cSent + cSign);
    const ppCSub = $('pp-contract_sub');
    if (ppCSub) {
      let cParts = [];
      if (cDraft > 0) cParts.push(`${cDraft} in bozza`);
      if (cSent > 0)  cParts.push(`${cSent} inviati`);
      if (cSign > 0)  cParts.push(`${cSign} firmati`);
      ppCSub.textContent = cParts.join(' · ');
    }

    ppSet('pp-proforma_issued', cnt('proforma_draft') + cnt('proforma_issued'));
    ppSet('pp-payment_under_review',  cnt('payment_under_review'));
    ppSet('pp-cancelled',             cnt('cancelled'));
  }

  /* ── Populate assignee filter ─────────────────────────────────── */
  function populateAssigneeFilter() {
    // Filter bar dropdown (may be null if removed from HTML)
    if (filterAssignee) {
      const names = [...new Set(ALL.map(r => r.assigned_to).filter(Boolean))];
      filterAssignee.innerHTML = '<option value="">Tutti gli assegnatari</option>' +
        names.map(n => `<option value="${n}">${n}</option>`).join('');
    }
  }

  /* ── Apply filters ──────────────────────────────────────────── */
  function applyFilters() {
    const text     = (searchEl?.value || '').toLowerCase().trim();
    const priority = filterPriority?.value || '';
    const assignee = filterAssignee?.value || '';
    const dFrom    = filterDateFrom?.value ? new Date(filterDateFrom.value) : null;
    const dTo      = filterDateTo?.value ? new Date(filterDateTo.value) : null;
    if (dTo) dTo.setHours(23, 59, 59, 999);

    filtered = ALL.filter(r => {
      // Multi-status tab groups
      const TAB_MAP = {
        quote_sent:      ['quote_draft', 'quote_sent', 'quote_accepted'],
        contract_sent:   ['contract_draft', 'contract_sent', 'contract_signed'],
        proforma_issued: ['proforma_draft', 'proforma_issued']
      };
      if (activeTab !== 'all') {
        const group = TAB_MAP[activeTab];
        if (group ? !group.includes(r.status) : r.status !== activeTab) return false;
      }
      if (priority && r.priority    !== priority) return false;
      if (assignee && r.assigned_to !== assignee) return false;
      
      const cDate = r.created_at ? new Date(r.created_at) : null;
      if (dFrom && (!cDate || cDate < dFrom)) return false;
      if (dTo   && (!cDate || cDate > dTo)) return false;
      if (text) {
        const hay = [r.lead_name, r.company_name, r.email, r.reference_name, r.service_interest]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(text)) return false;
      }
      return true;
    });

    const filterStatus = document.getElementById('onb-filter-status');
    if (filterStatus && filterStatus.value) {
      filtered = filtered.filter(r => r.status === filterStatus.value);
    }

    filtered.sort((a, b) => {
      const vA = (a.company_name || a.lead_name || '').toLowerCase();
      const vB = (b.company_name || b.lead_name || '').toLowerCase();
      if (window.currentSortDir === 'desc') {
        return vB.localeCompare(vA);
      }
      return vA.localeCompare(vB);
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
        ? (I18n.t('common.no_results') || 'Nessuna pratica corrisponde ai filtri.')
        : (I18n.t('onb.empty')         || 'Nessuna pratica di onboarding trovata.');
      list.innerHTML = `<div class="cl-empty">${UI.createEmptyState(null, msg)}</div>`;
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

    updateSelectionUI();
  }

  /* ── Render single row ──────────────────────────────────────── */
  function renderRow(r) {
    const companyLine  = r.company_name || r.lead_name || 'Nessun nome';
    const email        = r.email || r._client_email || r.phone || 'Senza contatti';
    const sm           = STATUS_MAP[r.status] || { color: '#9ca3af', lbl: r.status };
    const avatarInitial = companyLine.charAt(0).toUpperCase();

    const priMap = {
      high:   ['#fee2e2','#dc2626','Alta'],
      medium: ['#fef3c7','#d97706','Media'],
      low:    ['#f3f4f6','#6b7280','Bassa']
    };
    const [pbg, pco, plbl] = priMap[r.priority] || ['#f3f4f6','#6b7280','&mdash;'];
    
    const assignee = r.assigned_to 
      ? `<div style="font-size:11px;color:var(--gray-500);display:flex;align-items:center;gap:4px;"><svg style="width:12px;height:12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>${r.assigned_to}</div>` 
      : '';

    return `
    <div class="cl-row" onclick="onbOpenDetail('${r.id}')" style="grid-template-columns: 2.5fr 1.5fr 1.5fr 1fr 1fr 80px; gap: 24px; padding: 10px 24px; min-height: 54px;">
      
      <!-- Soggetto -->
      <div class="cl-col cl-col-1" style="flex-direction: row; align-items: center; gap: 12px;">
        <div class="mac-row-select mac-select-btn" data-id="${r.id}" onclick="window.toggleSelection(event, '${r.id}')" title="Seleziona" >
          <div class="mac-checkbox"></div>
        </div>
        <div class="cl-row-identity">
          <div class="avatar cl-row-avatar" style="background:${sm.color}; color:#ffffff;">${avatarInitial}</div>
          <div class="cl-row-identity-body">
            <div class="cl-row-name truncate" title="${companyLine}">${companyLine}</div>
          </div>
        </div>
      </div>

      <!-- Riferimenti -->
      <div class="cl-col" style="align-items:flex-start; justify-content:center;">
        ${email !== 'Senza contatti' ? `<div class="cl-data-val truncate"><a href="mailto:${email}" onclick="event.stopPropagation()" style="color:#3b82f6;">${email}</a></div>` : '<div class="cl-data-lbl">Nessun riferimento</div>'}
        ${r.phone ? `<div class="cl-data-lbl truncate">${r.phone}</div>` : ''}
      </div>

      <!-- Assegnazione e Dati -->
      <div class="cl-col" style="justify-content:center;">
        ${assignee}
        ${r.vat_number ? `<div class="cl-data-lbl truncate">P.IVA: ${r.vat_number}</div>` : ''}
      </div>

      <!-- Stato Lifecycle -->
      <div class="cl-col" style="justify-content:center; align-items:flex-start;">
        ${statusPill(r.status)}
      </div>

      <!-- Priorità -->
      <div class="cl-col" style="justify-content:center; align-items:flex-start;">
        <span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:12px;font-size:11px;font-weight:600;background:${pbg};color:${pco};">
          ${plbl}
        </span>
      </div>

      <!-- Azioni -->
      <div class="cl-col cl-col-actions" style="display:flex; justify-content:flex-end;">
        <div class="cl-row-actions">
          <button class="btn btn-ghost" style="padding:4px 8px;font-size:12px;height:30px;" onclick="event.stopPropagation(); onbOpenDetail('${r.id}')">
            Apri
          </button>
        </div>
      </div>

    </div>`;
  }
  /* ── Detail panel ───────────────────────────────────────────── */
  window.closeOnbDetail = () => {
    const overlay = $('onb-detail-overlay');
    if (overlay) overlay.classList.remove('open');
    window.onbSelectedId = null;
  };

  window.onbOpenDetail = async (id) => {
    window.location.href = `admin_onboarding_detail.html?id=${id}&cb=${Date.now()}`;
  };
  window.renderOnbDetailHeader = (r) => {
    // Backward compat hidden elements
    const cdTitle = document.getElementById('cd-title');
    const cdSubtitle = document.getElementById('cd-subtitle');

    const displayName  = r.company_name || r._client_name || r.lead_name || '\u2014';
    const displayEmail = r.email || r._client_email || '';
    const displayPhone = r.phone || '';

    if (cdTitle)    cdTitle.textContent = displayName;
    if (cdSubtitle) cdSubtitle.textContent = displayEmail;

    function proformaReady(rec) {
      return !!((rec.company_name || rec.lead_name) && rec.vat_number && (rec.email || rec._client_email) && (rec.dest_code || rec.codice_destinatario || rec.pec) && (rec.address || rec.indirizzo) && (rec.city || rec.citta));
    }
    function proformaMissing(rec) {
      const m = [];
      if (!(rec.company_name || rec.lead_name)) m.push('Ragione Sociale');
      if (!rec.vat_number)                      m.push('Partita IVA');
      if (!(rec.email || rec._client_email))    m.push('Email');
      if (!(rec.dest_code || rec.codice_destinatario || rec.pec)) m.push('SDI o PEC');
      if (!(rec.address || rec.indirizzo))      m.push('Indirizzo');
      if (!(rec.city || rec.citta))             m.push('Città');
      return m;
    }

    const quoteLink   = `admin_quotes.html?new=1&onboarding=${r.id}${r.client_id ? '&client_id=' + r.client_id : ''}`;
    const invoiceLink = `admin_invoices.html?new=1&type=proforma&onboarding=${r.id}${r.client_id ? '&client_id=' + r.client_id : ''}`;
    const canProforma = proformaReady(r);
    const _missing    = canProforma ? [] : proformaMissing(r);
    const _missingTip = canProforma ? '' : 'Dati mancanti: ' + _missing.join(', ');
    const _sm = STATUS_MAP[r.status] || { color: '#6b7280', lbl: r.status };

    // ── Avatar & identity ────────────────────────────────────────
    const avatarInitials = displayName.replace(/[^A-Za-z\u00C0-\u00FF\s]/g,'').trim().split(/\s+/).map(w=>w[0]||'').slice(0,2).join('').toUpperCase() || '??';
    const macAvatar = document.getElementById('onb-mac-avatar');
    const macName   = document.getElementById('onb-mac-name');
    const macSub    = document.getElementById('onb-mac-sub');
    const macStatus = document.getElementById('onb-mac-status');

    if (macAvatar) macAvatar.textContent = avatarInitials;
    if (macName)   macName.textContent   = displayName;
    if (macSub)    macSub.innerHTML = displayEmail
      ? `<a href="mailto:${displayEmail}" style="color:#3b82f6;text-decoration:none;">${displayEmail}</a>`
      : (displayPhone || '');
    if (macStatus) macStatus.innerHTML = `<span class="mac-sb-status" style="background:${_sm.color}22;color:${_sm.color};">${_sm.lbl}</span>`;

    // ── Topbar ───────────────────────────────────────────────────
    const topbarTitle = document.getElementById('onb-mac-topbar-title');
    if (topbarTitle) topbarTitle.textContent = displayName;

    // ── Sidebar body ─────────────────────────────────────────────
    const sidebarBody = document.getElementById('onb-mac-sidebar-body');
    const pill = (lbl, val) => val ? `
      <div style="padding:8px 10px;border-radius:6px;">
        <div style="font-size:10.5px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px;">${lbl}</div>
        <div style="font-size:13px;color:#1d1d1f;font-weight:500;">${String(val).replace(/</g,'&lt;')}</div>
      </div>` : '';

    if (sidebarBody) sidebarBody.innerHTML = `
      <div class="mac-nav-section-label">Dati Fiscali</div>
      ${pill('Partita IVA', r.vat_number)}
      ${pill('SDI / PEC', r.dest_code || r.codice_destinatario || r.pec)}
      ${pill('Cod. Fiscale', r.fiscal_code || r.codice_fiscale)}
      <div class="mac-sb-divider"></div>
      <div class="mac-nav-section-label">Contatti</div>
      ${pill('Telefono', r.phone || r.lead_phone)}
      ${pill('Servizio', r.service_interest || r.service)}
      <div class="mac-sb-divider"></div>
      <div class="mac-nav-section-label">Sede</div>
      ${pill('Indirizzo', r.address || r.indirizzo)}
      ${pill('Città', (r.city || r.citta || '') + (r.province ? ' (' + r.province + ')' : ''))}
      <div class="mac-sb-divider"></div>
      <div class="mac-nav-section-label">Sistema</div>
      ${pill('Studio', r.companies?.name || r.supplier_name || r.tenant_name)}
      ${pill('Assegnato a', r.reference_name || r.assigned_to)}
      ${pill('Creato il', r.created_at ? new Date(r.created_at).toLocaleDateString('it-IT') : null)}
    `;

    // ── Sidebar actions ──────────────────────────────────────────
    const sidebarActions = document.getElementById('onb-mac-sidebar-actions');
    let actionHtml = '';
    if (r.status === 'cancelled') {
      actionHtml = `
        <div style="font-size:11px;font-weight:700;color:#dc2626;text-align:center;padding:4px;letter-spacing:.04em;">PRATICA ANNULLATA</div>
        <button class="mac-sb-btn mac-sb-btn-danger" onclick="onbDelete('${r.id}')">Elimina Definitivamente</button>`;
    } else {
      actionHtml = `
        <button class="mac-sb-btn mac-sb-btn-secondary" onclick="onbEdit('${r.id}')">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z"/></svg>
          Modifica Pratica
        </button>
        ${r.portal_first_login_at
          ? `<button class="mac-sb-btn mac-sb-btn-secondary" disabled style="color:#059669;border-color:#a7f3d0;">&#10003; Portale Attivo</button>`
          : `<button class="mac-sb-btn ${r.portal_invited_at ? 'mac-sb-btn-secondary' : 'mac-sb-btn-primary'}" onclick="onbInviteUser('${r.id}')">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"/></svg>
              ${r.portal_invited_at ? 'Re-invia Invito' : 'Invia Accesso Portale'}
             </button>`}
        ${r.status === 'payment_under_review'
          ? `<button class="mac-sb-btn mac-sb-btn-green-to-blue" onclick="onbConvert('${r.id}')">Converti a Cliente</button>` : ''}
        <button class="mac-sb-btn mac-sb-btn-danger" onclick="onbCancel('${r.id}')">Annulla Pratica</button>
      `;
    }
    if (sidebarActions) sidebarActions.innerHTML = actionHtml;

    // ── Topbar quick actions ─────────────────────────────────────
    const topbarActions = document.getElementById('onb-mac-topbar-actions');
    if (topbarActions && r.status !== 'cancelled') {
      topbarActions.innerHTML = `
        <button class="mac-topbar-btn mac-topbar-btn-secondary" onclick="window.location.href='${quoteLink}'">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg>
          Crea Preventivo
        </button>
        ${canProforma
          ? `<button class="mac-topbar-btn mac-topbar-btn-primary" onclick="window.location.href='${invoiceLink}'">
               <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg>
               Nuova Proforma
             </button>`
          : `<button class="mac-topbar-btn mac-topbar-btn-primary" disabled style="opacity:0.4;cursor:not-allowed;" title="${_missingTip}">
               Proforma (dati mancanti)
             </button>`}
      `;
    }
  };


  window.renderDetailBody = function(r) {
    function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    const STATES = ['new','quote_draft','quote_sent','quote_accepted','contract_draft','contract_sent','contract_signed','proforma_draft','proforma_issued','payment_under_review'];
    const SLBL   = { new:'Nuova', quote_draft:'Prev. Bozza', quote_sent:'Prev. Inviato', quote_accepted:'Prev. Acc.', contract_draft:'Contr. Bozza', contract_sent:'Contr. Inv.', contract_signed:'Contr. Firmato', proforma_draft:'Proforma Bozza', proforma_issued:'Proforma Emessa', payment_under_review:'Fatturazione' };

    let idx = STATES.indexOf(r.status);
    if (idx < 0) { if (r.status === 'waiting_payment') idx = STATES.indexOf('proforma_issued'); else idx = 0; }
    const progressPct = idx * (100 / (STATES.length - 1));

    const pFields = [
      { label: 'Ragione Sociale', val: r.company_name || r.lead_name },
      { label: 'Partita IVA',     val: r.vat_number },
      { label: 'Email',           val: r.email || r._client_email },
      { label: 'SDI / PEC',       val: r.dest_code || r.codice_destinatario || r.pec },
      { label: 'Indirizzo',       val: r.address || r.indirizzo },
      { label: 'Città',           val: r.city || r.citta },
    ];
    const allReady = pFields.every(f => !!f.val);

    const pipelineHtml = r.status === 'cancelled'
      ? `<div style="display:flex;align-items:center;gap:10px;padding:16px;background:#fff5f5;border:1px solid #fecaca;border-radius:10px;color:#dc2626;font-weight:600;font-size:14px;">
           <svg style="width:18px;height:18px;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
           Pratica annullata
         </div>`
      : `<div class="mac-pipeline-wrap">
           <div class="mac-pipeline-track">
             <div class="mac-pipeline-track-bg"></div>
             <div class="mac-pipeline-progress" style="width:${progressPct}%;"></div>
             ${STATES.map((s,i) => {
               const cls = i < idx ? 'done' : i === idx ? 'active' : '';
               return `<div class="mac-pipeline-step ${cls}">
                 <div class="mac-pipeline-dot"></div>
                 <div class="mac-pipeline-label">${SLBL[s]||s}</div>
               </div>`;
             }).join('')}
           </div>
         </div>`;

    const macContent = document.getElementById('onb-mac-content');
    if (!macContent) return '';

    macContent.innerHTML = `
      <div class="mac-section">
        <div class="mac-section-title">Flusso di Lavoro</div>
        ${pipelineHtml}
      </div>

      <div class="mac-divider"></div>

      <div class="mac-section">
        <div class="mac-section-title">
          <span>Requisiti Anagrafica (Proforma)</span>
          ${allReady
            ? `<span class="mac-status-pill-complete" style="font-size:11.5px;font-weight:600;padding:3px 10px;border-radius:12px;text-transform:none;letter-spacing:0;">Completa</span>`
            : `<span style="font-size:11.5px;font-weight:600;color:#d97706;background:#fef3c7;padding:3px 10px;border-radius:12px;text-transform:none;letter-spacing:0;">Dati mancanti</span>`}
        </div>
        <div class="mac-chk-grid">
          ${pFields.map(f => `
            <div class="mac-chk-item ${f.val ? 'ok' : 'miss'}">
              ${f.val
                ? '<svg style="color:#3b82f6;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>'
                : '<svg style="color:#d1d5db;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>'}
              ${f.label}
            </div>`).join('')}
        </div>
      </div>

      <div class="mac-divider"></div>

      <div class="mac-section" style="padding-bottom:0;">
        <div class="mac-section-title">Storico Attività</div>
        <div class="mac-activity-wrap" id="activity-onb-container">
          <div class="mac-empty">Caricamento storico\u2026</div>
        </div>
      </div>
    `;

    return ''; // DOM injected directly
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

  // Advance pipeline step - DEPRECATED (Moved to automated flows)
  window.onbAdvanceStep = async (id) => {
    UI.toast('Avanzamento manuale disabilitato. Gestisci lo stato creando i documenti relativi (Preventivo, Contratto, ecc).', 'info');
  };

  // Status badge dropdown DEPRECATED (Moved to automated flows)
  window.onbShowStatusMenu = (id, triggerEl) => {
    UI.toast('Modifica manuale disabilitata. Gestisci lo stato creando i documenti (Preventivo, Contratto, ecc).', 'info');
  };

  // Jump directly to a specific status by clicking a future stepper stage - DEPRECATED
  window.onbGoToStep = async (id, targetStatus) => {
    UI.toast('Avanzamento manuale disabilitato. Gestisci lo stato tramite i documenti corrispondenti.', 'info');
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

  // ── Cancel practice ──────────────────────────────────────────
  window.onbCancel = async (id) => {
    if (!confirm('Annullare questa pratica? L\'operazione non può essere annullata.')) return;
    try {
      await API.Onboarding.cancel(id);
      ALL = ALL.map(x => x.id === id ? { ...x, status: 'cancelled' } : x);
      updateKpis(); applyFilters();
      UI.toast('Pratica annullata', 'warning');
      // Re-render the entire detail panel (header buttons + body)
      window.onbOpenDetail(id);
    } catch (e) { UI.toast(e?.message || 'Errore durante annullamento', 'error'); }
  };

  // ── Delete practice ────────────────────────────────────────────
  window.onbDelete = async (id) => {
    if (!confirm('Eliminare definitivamente questa pratica? Tutti i dati verranno rimossi.')) return;
    try {
      // force=true required for cancelled records (backend hard-deletes only with force)
      await API.Onboarding.remove(id, true);
      ALL = ALL.filter(x => x.id !== id);
      window.onbSelectedId = null;
      updateKpis(); applyFilters();
      const wrap = $('onb-detail-wrap');
      const empty = $('onb-detail-empty');
      if (wrap) wrap.style.display = 'none';
      if (empty) { empty.style.display = ''; }
      UI.toast('Pratica eliminata', 'success');
    } catch (e) { UI.toast(e?.message || 'Errore durante eliminazione', 'error'); }
  };

  // ── Invite user to portal ──────────────────────────────────────
  window.onbInviteUser = (id) => {
    const r = ALL.find(x => x.id === id);
    if (!r) return;
    const email = r.email || r._client_email || '';
    const overlay = $('onb-portal-invite-overlay');
    if (overlay) {
      const emailEl = $('portal-invite-email');
      const nameEl  = $('portal-invite-name');
      if (emailEl) emailEl.value = email;
      if (nameEl)  nameEl.textContent = r.company_name || r.lead_name || '';
      window._portalInviteId = id;
      overlay.classList.add('open');
    } else {
      // Fallback: quick confirm
      if (!email) { UI.toast('Email mancante - inserisci un email prima di inviare l\'invito', 'warning'); return; }
      if (confirm(`Inviare invito portale a: ${email}?`)) {
        UI.toast(`Invito inviato a ${email}`, 'success');
      }
    }
  };

  window.closePortalInvite = () => {
    $('onb-portal-invite-overlay')?.classList.remove('open');
    window._portalInviteId = null;
  };

  $('portal-invite-send')?.addEventListener('click', async () => {
    const id    = window._portalInviteId;
    const email = $('portal-invite-email')?.value?.trim();
    if (!email) { UI.toast('Inserisci un indirizzo email', 'warning'); return;  }
    try {
      const res = await API.Onboarding.invite(id, { email });
      const alreadyInvited = res?.already_invited;
      // Persist portal flag in local state (DB is source of truth via API)
      ALL = ALL.map(x => x.id === id
        ? { ...x, portal_invited_at: x.portal_invited_at || new Date().toISOString(), portal_email: res?.portal_email || email }
        : x);
      UI.toast(
        alreadyInvited
          ? `Reinvito portale inviato a ${email}`
          : `Accesso portale creato per ${email}`,
        'success'
      );
      closePortalInvite();
      if (window.onbSelectedId === id) window.onbOpenDetail(id);
    } catch (e) { UI.toast(e?.message || 'Errore invio invito', 'error'); }
  });

  /* ── Form: new / edit ───────────────────────────────────────── */
  window.onbEdit = (id) => openForm(id);

  function openForm(id) {
    editingId = id;
    const r   = id ? ALL.find(x => x.id === id) : null;

    const titleEl = $('onb-form-title');
    const subEl   = $('onb-form-header-sub');
    const iconEl  = $('onb-form-header-icon');
    const statWrp = $('onb-f-status-wrapper');

    if (r) {
      // MODIFICA (Ambra)
      if (titleEl) titleEl.textContent = 'Modifica pratica';
      if (subEl) {
        subEl.textContent   = r.company_name || r._client_name || '';
        subEl.style.textTransform = 'uppercase';
      }
      if (iconEl) {
        iconEl.style.background = '#fef3c7'; // ambra chiaro
        iconEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="#d97706" style="width:20px;height:20px;"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125"/></svg>`;
      }
      if (statWrp) statWrp.style.display = 'block';
    } else {
      // NUOVO (Blue/Gray like Clients)
      if (titleEl) titleEl.textContent = 'Nuova pratica';
      if (subEl) {
        subEl.textContent   = 'Inserisci i dati del potenziale cliente';
        subEl.style.textTransform = 'none';
      }
      if (iconEl) {
        iconEl.style.background = '#eff6ff'; // blue chiaro
        iconEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="#3b82f6" style="width:20px;height:20px;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>`;
      }
      if (statWrp) statWrp.style.display = 'none';
    }

    // Fill form
    const set = (elId, val) => { const el = $(elId); if (el) el.value = val || ''; };
    // Section 1 Soggetto
    set('onb-f-company',     r?.company_name);
    set('onb-f-lead-name',   r?.lead_name || r?._contact_name);
    set('onb-f-email',       r?.email);
    set('onb-f-phone',       r?.phone || r?.lead_phone);
    // Section 2 Dati fiscali
    set('onb-f-vat',         r?.vat_number);
    set('onb-f-fiscal-code', r?.fiscal_code || r?.codice_fiscale);
    set('onb-f-sdi',         r?.dest_code || r?.sdi_code || r?.codice_sdi || r?.codice_destinatario);
    set('onb-f-pec',         r?.pec);
    set('onb-f-address',     r?.address || r?.indirizzo);
    set('onb-f-cap',         r?.cap || r?.postal_code);
    set('onb-f-city',        r?.city || r?.citta);
    set('onb-f-province',    r?.province || r?.provincia);
    // Section 3 Pipeline
    set('onb-f-priority',    r?.priority || 'medium');
    set('onb-f-status',      r?.status || 'new');
    set('onb-f-notes',       r?.admin_notes || r?.notes);

    // ── Populate company supplier select ────────────────────────────
    const supplierSel = $('onb-f-supplier');
    if (supplierSel && _companies) {
      const cur = r?.company_id || r?.companies?.id || '';
      supplierSel.innerHTML = '<option value="">Seleziona fornitrice...</option>' +
        _companies.map(c => {
          const cid  = c.id || c.company_id || '';
          const cname = c.name || c.company_name || cid;
          return `<option value="${cid}" ${cid === cur ? 'selected' : ''}>${cname}</option>`;
        }).join('');
    } else if (supplierSel) {
      set('onb-f-supplier', r?.company_id || '');
    }

    // ── Populate service select ─────────────────────────────────────
    const serviceSel = $('onb-f-service');
    if (serviceSel && _services) {
      const cur = r?.service_interest || r?.service || '';
      serviceSel.innerHTML = '<option value="">Servizio richiesto...</option>' +
        _services.map(s => {
          const sname = s.name || s.service_name || s.id || '';
          return `<option value="${sname}" ${sname === cur ? 'selected' : ''}>${sname}</option>`;
        }).join('');
    } else if (serviceSel) {
      set('onb-f-service', r?.service_interest || '');
    }

    // ── Populate assignee select ────────────────────────────────────
    const assigneeSel = $('onb-f-assignee');
    if (assigneeSel && _users && _users.length > 0) {
      const cur = r?.assigned_to || '';
      assigneeSel.innerHTML = '<option value="">Nessuno</option>' +
        _users.map(u => {
          const uname = u.full_name || u.name || u.email || u.username || u.id || '';
          return `<option value="${uname}" ${uname === cur ? 'selected' : ''}>${uname}</option>`;
        }).join('');
    } else if (assigneeSel) {
      set('onb-f-assignee', r?.assigned_to || '');
    }

    const overlay = $('onb-form-overlay');
    if (overlay) overlay.classList.add('open');
    else console.warn("[onboarding] Modal overlay non trovato: onb-form-overlay");
  }

  window.closeOnbForm = () => {
    $('onb-form-overlay')?.classList.remove('open');
    editingId = null;
  };

  $('onb-form-save')?.addEventListener('click', async () => {
    const get = id => $(id)?.value?.trim() || '';
    const company  = get('onb-f-company');
    const email    = get('onb-f-email');
    const leadName = get('onb-f-lead-name') || company;

    const supplier = get('onb-f-supplier');

    if (!company) {
      UI.toast('Campo obbligatorio: Ragione Sociale', 'warning'); return;
    }
    if (!email) {
      UI.toast('Campo obbligatorio: Email', 'warning'); return;
    }
    if (!supplier) {
      UI.toast('Campo obbligatorio: Azienda fornitrice', 'warning'); return;
    }

    const body = {
      // Soggetto
      lead_name:            leadName,
      company_name:         company,
      email,
      phone:                get('onb-f-phone') || null,
      // Dati fiscali
      vat_number:           get('onb-f-vat') || null,
      fiscal_code:          get('onb-f-fiscal-code') || null,
      dest_code:            get('onb-f-sdi') || null,
      pec:                  get('onb-f-pec') || null,
      address:              get('onb-f-address') || null,
      cap:                  get('onb-f-cap') || null,
      city:                 get('onb-f-city') || null,
      province:             get('onb-f-province') || null,
      // Pipeline
      service_interest:     get('onb-f-service') || null,
      company_id:           get('onb-f-supplier') || null,
      priority:             get('onb-f-priority') || 'medium',
      ...(editingId ? { status: get('onb-f-status') || 'new' } : {}),
      reference_name:       get('onb-f-assignee') || null,
      notes:                get('onb-f-notes') || null,
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
      // Refresh detail panel so both list row AND header badge reflect the new state
      if (editingId && window.onbSelectedId === editingId) {
        window.onbOpenDetail(editingId);
      }
    } catch (e) {
      const msg = e?.message || '';
      if (!editingId && msg.startsWith('SOFT:')) {
        const clean = msg.replace(/^SOFT:/, '').trim();
        if (confirm(clean)) {
          try {
            const created = await API.Onboarding.create({ ...body, force_create: true });
            if (created) ALL.unshift(created);
            UI.toast(I18n.t('onb.created_ok') || 'Onboarding creato con successo', 'success');
            closeOnbForm(); updateKpis(); applyFilters();
          } catch (e2) { UI.toast(e2?.message?.replace(/^HARD:/, '') || I18n.t('error.generic'), 'error'); }
        }
      } else {
        UI.toast(msg.replace(/^(SOFT:|HARD:)/, '') || I18n.t('error.generic'), 'error');
      }
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  });

  /* ── Init ──────────────────────────────────────────────────── */
  window.onPageReady(async () => {
    await I18n.init('lang-switcher-slot');
    load();
  });

})();
