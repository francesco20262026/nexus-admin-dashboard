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
    proforma_draft:        { color: '#f59e0b', lbl: 'Proforma bozza' },
    proforma_issued:       { color: '#f59e0b', lbl: 'Proforma emessa' },
    payment_under_review:  { color: '#10b981', lbl: 'In verifica' },
    cancelled:             { color: '#ef4444', lbl: 'Annullata' },
    converted:             { color: '#64748b', lbl: 'Convertito' },
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

    await loadFormSelects();
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
    <div class="cl-row" onclick="onbOpenDetail('${r.id}')">
      
      <!-- Soggetto -->
      <div class="cl-col cl-col-1">
        <div class="cl-row-identity">
          <div class="avatar cl-row-avatar" style="background:${sm.color}">${avatarInitial}</div>
          <div class="cl-row-identity-body">
            <div class="cl-row-name truncate" title="${companyLine}">${companyLine}</div>
            <div class="cl-row-meta truncate" title="ID: ${r.id.split('-')[0]}">
              <span class="cl-row-chip">ID: ${r.id.split('-')[0]}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Riferimenti -->
      <div class="cl-col" style="align-items:flex-start;">
        ${email !== 'Senza contatti' ? `<div class="cl-data-val truncate" style="color:var(--brand-600);"><a href="mailto:${email}" onclick="event.stopPropagation()">${email}</a></div>` : '<div class="cl-data-lbl">Nessun riferimento</div>'}
        ${r.phone ? `<div class="cl-data-lbl truncate">${r.phone}</div>` : ''}
      </div>

      <!-- Assegnazione e Dati -->
      <div class="cl-col">
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
      <div class="cl-col cl-col-actions">
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
    const body       = $('onb-detail-body');
    const overlay    = $('onb-detail-overlay');
    const header     = $('onb-detail-header');
    if (!body || !overlay) return;

    let r = ALL.find(x => x.id === id);
    if (!r) return;

    window.onbSelectedId = id;

    const displayName  = r.company_name || r._client_name || '&mdash;';
    const displayEmail = r.email || r._client_email || '';
    const displayPhone = r.phone || '';

    const emailSvg = '<svg style="width:13px;height:13px;flex-shrink:0;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"/></svg>';
    const phoneSvg = '<svg style="width:13px;height:13px;flex-shrink:0;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 6.75Z"/></svg>';
    const subParts = [];
    if (displayEmail) subParts.push(`${emailSvg} <a href="mailto:${displayEmail}" style="color:#059669;font-weight:500;">${displayEmail}</a>`);
    if (displayPhone) subParts.push(`${phoneSvg} <span>${displayPhone}</span>`);

    if (header) header.innerHTML = `
      <div class="onb-detail-header-info">
        <div class="onb-detail-company-name" style="font-size: 18px; font-weight: 700; color: var(--gray-900);">${displayName}</div>
        <div class="onb-detail-company-sub" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap; font-size: 13px; color: var(--gray-600); margin-top:4px;">
          ${subParts.length ? subParts.join('') : '<span style="color:#d1d5db;font-style:italic;font-size:12px;">Nessun contatto</span>'}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">
        <div id="onb-hdr-btns" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;"></div>
      </div>`;

    // Open Modal
    overlay.classList.add('open');

    body.innerHTML = '<div style="padding:40px 0;text-align:center;color:#9ca3af;font-size:14px;">Caricamento dettagli pratica...</div>';

    try {
      const detail = await API.Onboarding.get(id);
      if (detail) {
        r = { ...r, ...detail };
        // Keep ALL in sync with fresh API data so list row matches header
        ALL = ALL.map(x => x.id === id ? { ...x, ...detail } : x);
      }
    } catch (_) {}

    body.innerHTML = renderDetailBody(r);

    // ── Init Activity Timeline for onboarding ────────────────────
    setTimeout(() => {
      if (window.ActivityTimeline) {
        ActivityTimeline.init({
          entityType:  'onboarding',
          entityId:    id,
          containerId: 'activity-onb-container',
        });
      }
    }, 0);

    function proformaReady(rec) {
      return !!(
        (rec.company_name || rec.lead_name)
        && rec.vat_number
        && (rec.email || rec._client_email)
        && (rec.dest_code || rec.codice_destinatario || rec.pec)
        && (rec.address || rec.indirizzo)
        && (rec.city || rec.citta)
      );
    }
    function proformaMissing(rec) {
      const m = [];
      if (!(rec.company_name || rec.lead_name)) m.push('Ragione Sociale');
      if (!rec.vat_number)                      m.push('Partita IVA');
      if (!(rec.email || rec._client_email))    m.push('Email');
      if (!(rec.dest_code || rec.codice_destinatario || rec.pec)) m.push('SDI o PEC (almeno uno)');
      if (!(rec.address || rec.indirizzo))      m.push('Indirizzo');
      if (!(rec.city || rec.citta))             m.push('Città');
      return m;
    }

    const quoteLink   = `admin_quotes.html?new=1&onboarding=${r.id}${r.client_id ? '&client_id=' + r.client_id : ''}`;
    const invoiceLink = `admin_invoices.html?new=1&type=proforma&onboarding=${r.id}${r.client_id ? '&client_id=' + r.client_id : ''}`;

    const ico16 = path => `<svg style="width:15px;height:15px;flex-shrink:0;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">${path}</svg>`;
    const SVG = {
      quote:   ico16('<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/>'),
      proforma:ico16('<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/>'),
      next:    ico16('<path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5"/>'),
      convert: ico16('<path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"/>'),
      edit:    ico16('<path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125"/>'),
      user:    ico16('<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"/>'),
      cancel:  ico16('<path stroke-linecap="round" stroke-linejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>'),
      trash:   ico16('<path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/>'),
      warn:    ico16('<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/>'),
    };

    const canProforma = proformaReady(r);
    const editBtn     = `<button class="btn btn-secondary btn-sm" onclick="onbEdit('${r.id}')">${SVG.edit} Modifica</button>`;
    const _missing     = canProforma ? [] : proformaMissing(r);
    const _missingTip  = canProforma ? '' : 'Dati mancanti: ' + _missing.join(', ');
    const proformaBtn = canProforma
      ? `<button class="btn btn-indigo btn-sm" onclick="window.location.href='${invoiceLink}'">${SVG.proforma} Nuova proforma</button>`
      : `<button class="btn btn-indigo btn-sm" disabled style="opacity:.4;cursor:not-allowed;" title="${_missingTip}">${SVG.warn} Nuova proforma</button>`;
    const portalBtn   = `<button class="btn btn-teal btn-sm" onclick="onbInviteUser('${r.id}')">${SVG.user} Accesso portale</button>`;
    const quoteBtn    = `<button class="btn btn-primary btn-sm" onclick="window.location.href='${quoteLink}'">${SVG.quote} Crea preventivo</button>`;
    const advanceBtn  = `<button class="btn btn-primary btn-sm" onclick="onbAdvanceStep('${r.id}')">${SVG.next} Avanza stato</button>`;
    const convertBtn  = `<button class="btn btn-success btn-sm" onclick="onbConvert('${r.id}')">${SVG.convert} Converti a cliente</button>`;

    // Status badge — clickable dropdown for non-cancelled records
    const _sm = STATUS_MAP[r.status] || { color: '#6b7280', lbl: r.status };
    const statusBadge = r.status === 'cancelled'
      ? `<span style="display:inline-flex;align-items:center;padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700;background:${_sm.color};color:#fff;">${_sm.lbl}</span>`
      : `<span style="display:inline-flex;align-items:center;padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700;letter-spacing:.02em;background:${_sm.color};color:#fff;border:none;">
        ${_sm.lbl}
      </span>`;

    if (r.status === 'cancelled') {
      const _hdrB1 = $('onb-hdr-btns');
      if (_hdrB1) _hdrB1.innerHTML = editBtn + ` <button class="btn btn-danger btn-sm" onclick="onbDelete('${r.id}')">${SVG.trash} Elimina definitivamente</button>` + ' ' + statusBadge;
    } else {
      const cancelBtn2 = `<button class="btn btn-ghost btn-sm" style="color:#dc2626;border-color:#fecaca;" onclick="onbCancel('${r.id}')">${SVG.cancel} Annulla pratica</button>`;
      // TOP BAR — workflow document actions (always visible)
      const _hdrB2 = $('onb-hdr-btns');
      if (_hdrB2) _hdrB2.innerHTML = [
        quoteBtn,
        proformaBtn,
        `<button class="btn btn-ghost btn-sm" style="color:#dc2626;border-color:#fecaca;" onclick="onbCancel('${r.id}')">${SVG.cancel} Annulla pratica</button>`,
        statusBadge
      ].join(' ');
    }
  };

  function renderDetailBody(r) {
    function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    // Azienda fornitrice — populated by JOIN companies(name) in the API
    const supplierName = r.companies?.name || r.supplier_name || r.tenant_name || null;

    const displayName  = r.company_name || r._client_name || '&mdash;';
    const displayEmail = r.email || r._client_email || '';

    const pFields = [
      { label: 'Ragione Sociale', val: r.company_name || r.lead_name },
      { label: 'Partita IVA',     val: r.vat_number },
      { label: 'Email',           val: r.email || r._client_email },
      { label: 'SDI / PEC',       val: r.dest_code || r.codice_destinatario || r.pec },
      { label: 'Indirizzo',       val: r.address || r.indirizzo },
      { label: 'Citta',           val: r.city || r.citta },
    ];
    const allReady = pFields.every(f => !!f.val);
    const proformaWidget = `<div class="onb-proforma-check ${allReady ? 'ready' : 'incomplete'}">
      <span style="font-weight:700;flex-shrink:0;">Proforma:</span>
      ${pFields.map(f => `<span class="onb-check-item ${f.val ? 'ok' : 'missing'}">${f.val ? '&#10003;' : '&#10007;'} ${f.label}</span>`).join('')}
      <span style="margin-left:auto;font-size:11px;">${allReady ? "Pronta per l'emissione" : 'Dati mancanti &mdash; modifica pratica'}</span>
    </div>`;

    const STATES = ['new', 'quote_draft', 'quote_sent','quote_accepted', 'contract_draft', 'contract_sent','contract_signed', 'proforma_draft', 'proforma_issued','payment_under_review'];
    const SLBL   = { new:'Nuovo', quote_draft:'Prev.Bozza', quote_sent:'Prev.Inv.', quote_accepted:'Prev.Acc.', contract_draft:'Contr.Bozza', contract_sent:'Contr.Inv.', contract_signed:'Contr.Firm.', proforma_draft:'Proforma Bozza', proforma_issued:'Proforma Inv.', payment_under_review:'Verifica' };
    const NEXT_STATE = { new:'quote_draft', quote_draft:'quote_sent', quote_sent:'quote_accepted', quote_accepted:'contract_draft', contract_draft:'contract_sent', contract_sent:'contract_signed', contract_signed:'proforma_draft', proforma_draft:'proforma_issued', proforma_issued:'payment_under_review' };
    let idx = STATES.indexOf(r.status);
    if (idx < 0) {
      if (r.status === 'waiting_payment') idx = STATES.indexOf('proforma_issued');
      else idx = 0;
    }
    const chk = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="#fff" style="width:11px;height:11px;"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>';
    const stepperHtml = r.status === 'cancelled'
      ? `<div style="display:inline-flex;gap:6px;align-items:center;padding:6px 12px;background:#fef2f2;border-radius:8px;font-size:12px;color:#dc2626;font-weight:600;">&#10007; Pratica annullata</div>`
      : `<div class="onb-workflow-steps">${STATES.map((s,i) => {
          const isFuture = i > idx;
          const clickAttr = isFuture ? `onclick="onbGoToStep('${r.id}','${s}')" title="Vai a: ${SLBL[s]}"` : '';
          return `<div class="onb-step ${i < idx ? 'done' : i === idx ? 'active' : ''}" ${isFuture ? 'style="cursor:pointer;opacity:.7;" ' + clickAttr : ''}>
            <div class="onb-step-dot">${i < idx ? chk : ''}</div>
            <div class="onb-step-label">${SLBL[s]||s}</div>
          </div>`;
        }).join('')}</div>`;

    // Workflow action buttons
    const isLast = r.status === 'payment_under_review';
    let actionsHtml = '';
    if (r.status !== 'cancelled') {
      actionsHtml += `
        <button class="btn btn-secondary btn-sm" style="width:100%;justify-content:center;" onclick="onbEdit('${r.id}')">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125"/></svg>
          Modifica Pratica
        </button>
      `;
      if (r.portal_first_login_at) {
        actionsHtml += `<button class="btn btn-success btn-sm" disabled title="Primo accesso: ${new Date(r.portal_first_login_at).toLocaleDateString('it-IT')}" style="width:100%;justify-content:center;">✓ Invito accettato</button>`;
      } else if (r.portal_invited_at) {
        actionsHtml += `<button class="btn btn-secondary btn-sm" style="width:100%;justify-content:center;" onclick="onbInviteUser('${r.id}')" title="Clicca per reinviare">Invito inviato</button>`;
      } else {
        actionsHtml += `<button class="btn btn-primary btn-sm" style="width:100%;justify-content:center;" onclick="onbInviteUser('${r.id}')">Invia Invito Portale</button>`;
      }
      if (isLast) {
        actionsHtml += `<button class="btn btn-success btn-sm" style="width:100%;justify-content:center;margin-top:8px;" onclick="onbConvert('${r.id}')">Converti a cliente</button>`;
      }
    }

    const field = (lbl, val, full=false) => `
      <div class="profile-info-row" style="${full?'grid-column:1/-1;':''}margin-bottom:8px;">
        <span class="profile-info-lbl">${lbl}</span>
        <span class="profile-info-val">${val ? esc(String(val)) : '<span style="color:#d1d5db;">&mdash;</span>'}</span>
      </div>`;
    const fieldHtml = (lbl, html, full=false) => `
      <div class="profile-info-row" style="${full?'grid-column:1/-1;':''}margin-bottom:8px;">
        <span class="profile-info-lbl">${lbl}</span>
        <span class="profile-info-val">${html}</span>
      </div>`;

    const vatHtml = r.vat_number ? esc(r.vat_number) : '<span style="color:#ef4444;font-size:11px;">&#9888; Mancante</span>';
    const emailHtml = displayEmail ? `<a href="mailto:${esc(displayEmail)}" style="color:var(--brand-600);">${esc(displayEmail)}</a>` : '&mdash;';
    const createdAt = r.created_at ? new Date(r.created_at).toLocaleDateString('it-IT') : null;


    const dangerZoneHtml = r.status === 'cancelled' ? `
      <div style="margin-top:24px;padding:16px;border:1px solid #fecaca;border-radius:var(--radius-lg);background:#fff5f5;text-align:left;">
        <div style="font-size:12px;font-weight:700;color:#dc2626;margin-bottom:6px;">Pratica Annullata</div>
        <p style="font-size:12px;color:#9ca3af;margin:0 0 12px;line-height:1.4;">L'eliminazione definitiva rimuoverà tutti i dati.</p>
        <button class="btn btn-ghost-danger btn-sm" style="width:100%;justify-content:center;" onclick="onbDelete('${r.id}')">Elimina definitivamente</button>
      </div>
    ` : '';



    const cName = esc(r.company_name || r.lead_name || 'Senza Nome');
    const initials = cName.substring(0,2).toUpperCase();

    // The status pill colors
    let stBg = '#f3f4f6', stCol = '#374151';
    if(r.status === 'new') { stBg='#dbeafe'; stCol='#1e40af'; }
    else if(r.status.includes('quote')) { stBg='#ede9fe'; stCol='#5b21b6'; }
    else if(r.status.includes('contract')) { stBg='#e0f2fe'; stCol='#0369a1'; }
    else if(r.status.includes('proforma')) { stBg='#ffedd5'; stCol='#9a3412'; }
    else if(r.status === 'payment_under_review') { stBg='#fef08a'; stCol='#854d0e'; }
    else if(r.status === 'cancelled') { stBg='#fee2e2'; stCol='#991b1b'; }

    return `
      <style>
        .onb-proforma-widget { padding:16px; border-radius:var(--radius-lg); font-size:13px; display:flex; align-items:center; gap:12px; border: 1px solid var(--border); background: var(--surface); color: var(--gray-800); font-weight: 500;}
        .onb-proforma-widget.incomplete { border-left: 4px solid #ef4444; }
        .onb-proforma-widget.ready { border-left: 4px solid #10b981; }
        .onb-check-item { display:inline-flex; align-items:center; gap:4px; padding:3px 8px; border-radius:4px; font-weight:600; font-size:11px; }
        .onb-check-item.ok { color:#10b981; background:#f0fdf4; }
        .onb-check-item.missing { color:#ef4444; background:#fef2f2; }
      </style>

      <div class="detail-layout" style="margin-top:0;">
        <!-- LEFT PROFILE COLUMN -->
        <div class="profile-col">
          <div class="profile-card">
            <div class="profile-avatar-large">${initials}</div>
            <h1 class="profile-name">${cName}</h1>
            <div class="profile-subtitle">${emailHtml}</div>
            <span class="profile-status" style="background:${stBg};color:${stCol};">${SLBL[r.status]||r.status}</span>
            
            <div class="profile-actions">
              ${actionsHtml}
            </div>

            <div class="profile-info-list" style="margin-top:16px;">
              ${field('Servizio Richiesto', r.service_interest || r.service, true)}
              ${field('Partita IVA', vatHtml)}
              ${field('Codice Fiscale', r.fiscal_code || r.codice_fiscale)}
              ${field('Telefono', r.phone || r.lead_phone)}
              ${field('Assegnato a', r.reference_name || r.assigned_to)}
              ${field('Data Creazione', createdAt)}
              ${field('Codice SDI', r.dest_code || r.codice_destinatario)}
              ${field('PEC', r.pec)}
              ${field('Indirizzo', r.address || r.indirizzo, true)}
              ${field('Città', r.city || r.citta)}
              ${field('Provincia', r.province || r.provincia)}
            </div>
            
            ${r.admin_notes || r.notes ? `
            <div class="profile-info-list" style="border-top:1px dashed var(--border);">
              <div class="profile-info-row">
                <span class="profile-info-lbl">Note Interne</span>
                <span class="profile-info-val" style="color:var(--gray-600);font-size:12px;line-height:1.5;">${esc(r.admin_notes || r.notes)}</span>
              </div>
            </div>` : ''}

            ${dangerZoneHtml}
          </div>
        </div>

        <!-- RIGHT DATA COLUMN -->
        <div class="data-col">
          <!-- Stepper Box -->
          <div class="card" style="padding:24px;border:1px solid var(--border);border-radius:var(--radius-lg);box-shadow:0 1px 3px rgba(0,0,0,0.02);margin-bottom:16px;">
            <div style="font-size:16px;font-weight:700;color:var(--gray-900);margin-bottom:16px;">Stato Pratica</div>
            ${stepperHtml}
          </div>
          
          <!-- Proforma readiness -->
          <div class="onb-proforma-widget ${allReady ? 'ready' : 'incomplete'}" style="margin-bottom:16px;">
            <span style="font-weight:700;flex-shrink:0;">Info Proforma:</span>
            <div style="display:flex; gap:6px; flex-wrap:wrap; flex:1;">
              ${pFields.map(f => `<span class="onb-check-item ${f.val ? 'ok' : 'missing'}">${f.val ? '✓' : '✗'} ${f.label}</span>`).join('')}
            </div>
          </div>

          <!-- Timeline -->
          <div class="card" style="border:1px solid var(--border);border-radius:var(--radius-lg);box-shadow:0 1px 3px rgba(0,0,0,0.02);overflow:hidden;">
            <div class="card-header" style="background:#fdfdfd;border-bottom:1px solid var(--border);">
              <h2 class="card-title">🕓 Storico Attività</h2>
            </div>
            <div style="padding:24px;" id="activity-onb-container">
              Caricamento...
            </div>
          </div>

        </div>
      </div>
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

  // Status badge dropdown — DEPRECATED (Moved to automated flows)
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
      // NUOVO (Verde)
      if (titleEl) titleEl.textContent = 'Nuova pratica';
      if (subEl) {
        subEl.textContent   = 'Inserisci i dati del potenziale cliente';
        subEl.style.textTransform = 'none';
      }
      if (iconEl) {
        iconEl.style.background = '#d1fae5'; // verde chiaro
        iconEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="#059669" style="width:20px;height:20px;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>`;
      }
      if (statWrp) statWrp.style.display = 'none';
    }

    // Fill form
    const set = (elId, val) => { const el = $(elId); if (el) el.value = val || ''; };
    // Section 1 — Soggetto
    set('onb-f-company',     r?.company_name);
    set('onb-f-lead-name',   r?.lead_name || r?._contact_name);
    set('onb-f-email',       r?.email);
    set('onb-f-phone',       r?.phone || r?.lead_phone);
    // Section 2 — Dati fiscali
    set('onb-f-vat',         r?.vat_number);
    set('onb-f-fiscal-code', r?.fiscal_code || r?.codice_fiscale);
    set('onb-f-sdi',         r?.dest_code || r?.sdi_code || r?.codice_sdi || r?.codice_destinatario);
    set('onb-f-pec',         r?.pec);
    set('onb-f-address',     r?.address || r?.indirizzo);
    set('onb-f-cap',         r?.cap || r?.postal_code);
    set('onb-f-city',        r?.city || r?.citta);
    set('onb-f-province',    r?.province || r?.provincia);
    // Section 3 — Pipeline
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
