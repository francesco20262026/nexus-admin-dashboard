/* ============================================================
   admin_services.js  Service Catalog v2 — catalog management
   ============================================================ */
'use strict';

(function () {
  Auth.guard('admin');
  Auth.initUI();

  /* ── State ─────────────────────────────────────────────────── */
  let ALL_CATALOG = [];
  let filtered    = [];

  const saved     = window.SessionState?.load('services') || {};
  let currentPage = saved.currentPage || 1;
  let activeTab   = saved.activeTab   || 'all';
  let editingId   = null;
  const PER_PAGE  = 20;

  /* ── DOM refs ───────────────────────────────────────────────── */
  const $ = id => document.getElementById(id);
  const list         = $('srv-list');
  const searchEl     = $('srv-search');
  const infoEl       = $('srv-info');
  const paginationEl = $('srv-pagination');
  const tabBar       = $('srv-pipeline-bar');
  const btnNew       = $('btn-new-service');
  const btnRefresh   = $('btn-refresh-services');
  const modalSvc     = $('modal-service');
  const btnSave      = $('modal-service-save');

  /* ── Billing cycle labels ───────────────────────────────────── */
  const CYCLE_LABEL = () => ({
    monthly:   'Mensile',
    quarterly: 'Trimestrale',
    annual:    'Annuale',
    one_off:   'Una tantum',
  });

  const CYCLE_BADGE_COLOR = {
    monthly:   '#e0e7ff',
    quarterly: '#fef3c7',
    annual:    '#d1fae5',
    one_off:   '#fce7f3',
  };
  const CYCLE_TEXT_COLOR = {
    monthly:   '#4338ca',
    quarterly: '#b45309',
    annual:    '#065f46',
    one_off:   '#be185d',
  };

  /* ── Restore saved state ───────────────────────────────────── */
  if (searchEl && saved.search) searchEl.value = saved.search;
  tabBar?.querySelectorAll('.cl-status-pill').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === activeTab)
  );

  function saveState() {
    window.SessionState?.save('services', { activeTab, currentPage, search: searchEl?.value || '' });
  }

  /* ── Tab clicks ─────────────────────────────────────────────── */
  tabBar?.addEventListener('click', e => {
    const btn = e.target.closest('.cl-status-pill');
    if (!btn) return;
    tabBar.querySelectorAll('.cl-status-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeTab = btn.dataset.tab;
    currentPage = 1;
    applyFilters();
  });

  /* ── Filter listeners ─────────────────────────────────────── */
  searchEl?.addEventListener('input', debounce(() => { currentPage = 1; applyFilters(); }, 200));

  /* ── Refresh ─────────────────────────────────────────────── */
  btnRefresh?.addEventListener('click', () => load(true));
  window.addEventListener('companyChanged', () => load(true));
  let _companies = [];

  window._reloadServices = () => load(true);

  async function load() {
    if (!list) return;
    list.innerHTML = UI.skeletonCardList(5);
    try {
      try {
        const compRes = await API.Companies.list();
        _companies = Array.isArray(compRes) ? compRes : (compRes?.data || []);
      } catch(e) {}

      const catRes = await API.Services.catalog(false);
      let catData = Array.isArray(catRes) ? catRes : (catRes?.items ?? catRes?.data ?? []);
      // Map supplier company from joined data
      ALL_CATALOG = catData.map(s => ({ ...s, supplier_name: s.companies?.name || '—' }));
      populateSupplierFilter();
    } catch (e) {
      console.error('[admin_services] load error:', e);
      list.innerHTML = UI.errorState(e.message, 'window._reloadServices()');
      updateKpis();
      return;
    }
    updateKpis();
    applyFilters();
  }

  function populateSupplierFilter() {
    const filterEl = document.getElementById('srv-filter-supplier');
    if (!filterEl) return;
    const prev = filterEl.value;
    const names = [...new Set(ALL_CATALOG.map(s => s.supplier_name).filter(Boolean))].sort();
    filterEl.innerHTML = `<option value="">Fornitore ▼</option>` + names.map(n => `<option value="${n}">${n}</option>`).join('');
    if (prev) filterEl.value = prev;
  }

  /* ── KPIs (tab badges) ────────────────────────────────────── */
  function updateKpis() {
    const total    = ALL_CATALOG.length;
    const active   = ALL_CATALOG.filter(s => s.is_active !== false && s.status !== 'inactive').length;
    const inactive = total - active;
    const monthly  = ALL_CATALOG.filter(s => s.billing_cycle === 'monthly').length;
    const annual   = ALL_CATALOG.filter(s => s.billing_cycle === 'annual').length;
    const one_off  = ALL_CATALOG.filter(s => s.billing_cycle === 'one_off').length;
    const withClients = ALL_CATALOG.filter(s => (s.active_clients_count || 0) > 0).length;
    const noUsages    = ALL_CATALOG.filter(s => (s.total_subscriptions_count || 0) === 0).length;

    const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
    set('kpi-srv-total',        total);
    set('kpi-srv-active',       active);
    set('kpi-srv-inactive',     inactive);
    set('kpi-srv-monthly',      monthly);
    set('kpi-srv-annual',       annual);
    set('kpi-srv-one_off',       one_off);
    set('kpi-srv-with_clients', withClients);
    set('kpi-srv-no_usages',    noUsages);
  }

  function applyFilters() {
    const text = (searchEl?.value || '').toLowerCase().trim();
    const supEl = document.getElementById('srv-filter-supplier');
    const supFilter = supEl ? supEl.value : '';
    const stateEl = document.getElementById('srv-filter-status');
    const stateFilter = stateEl ? stateEl.value : '';
    const cycleEl = document.getElementById('srv-filter-cycle');
    const cycleFilter = cycleEl ? cycleEl.value : '';

    filtered = ALL_CATALOG.filter(s => {
      const isActive = s.is_active !== false && s.status !== 'inactive';
      
      // Main filters
      if (activeTab === 'active'       && !isActive) return false;
      if (activeTab === 'inactive'     && isActive)  return false;
      if (['monthly','quarterly','annual','one_off'].includes(activeTab) && s.billing_cycle !== activeTab) return false;
      if (activeTab === 'with_clients' && (s.active_clients_count || 0) === 0) return false;
      if (activeTab === 'no_usages'    && (s.total_subscriptions_count || 0) > 0) return false;
      
      // Header dropdown filters
      if (supFilter && s.supplier_name !== supFilter) return false;
      if (stateFilter === 'active' && !isActive) return false;
      if (stateFilter === 'inactive' && isActive) return false;
      if (cycleFilter && s.billing_cycle !== cycleFilter) return false;

      // Text search
      if (text) {
        const hay = [s.name, s.description, s.category, s.internal_code, s.supplier_name]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(text)) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      const vA = (a.name || '').toLowerCase();
      const vB = (b.name || '').toLowerCase();
      if (window.currentSortDir === 'desc') return vB.localeCompare(vA);
      return vA.localeCompare(vB);
    });

    const maxPage = Math.ceil(filtered.length / PER_PAGE) || 1;
    if (currentPage > maxPage) currentPage = maxPage;
    saveState();
    window.clearSelection && window.clearSelection();
    render();
  }

  window.toggleSort = () => {
    window.currentSortDir = window.currentSortDir === 'desc' ? 'asc' : 'desc';
    const icon = document.getElementById('sort-icon-name');
    if (icon) {
      icon.style.transform = window.currentSortDir === 'desc' ? 'rotate(180deg)' : 'none';
    }
    applyFilters();
  };

  /* ── Selection helpers ────────────────────────────────────── */
  window.selectedIds = new Set();

  window.toggleSelection = function(e, id) {
    e.stopPropagation();
    const btn = e.currentTarget;
    btn.classList.toggle('selected');
    if (btn.classList.contains('selected')) window.selectedIds.add(id);
    else window.selectedIds.delete(id);
    updateSelectionUI();
  };

  window.toggleSelectAll = function(el) {
    const isSelected = el.classList.toggle('selected');
    filtered.slice((currentPage-1)*PER_PAGE, currentPage*PER_PAGE).forEach(i => {
      if (isSelected) window.selectedIds.add(i.id);
      else window.selectedIds.delete(i.id);
    });
    document.querySelectorAll('.mac-select-btn').forEach(cb => {
      if (isSelected) cb.classList.add('selected'); else cb.classList.remove('selected');
      const row = cb.closest('.cl-row');
      if (row) { if (isSelected) row.classList.add('selected'); else row.classList.remove('selected'); }
    });
    updateSelectionUI();
  };

  window.clearSelection = function() {
    window.selectedIds.clear();
    document.getElementById('mass-select-all')?.classList.remove('selected');
    document.querySelectorAll('.mac-select-btn').forEach(cb => cb.classList.remove('selected'));
    document.querySelectorAll('.cl-row.selected').forEach(r => r.classList.remove('selected'));
    updateSelectionUI();
  };

  window.updateSelectionUI = function() {
    const bar = $('mac-mass-action-bar');
    const countEl = $('mac-mass-action-count');
    const selectAllBtn = $('mass-select-all');
    if (!bar || !countEl) return;
    const count = window.selectedIds.size;
    countEl.textContent = count;
    if (count > 0) bar.classList.add('visible');
    else { bar.classList.remove('visible'); if (selectAllBtn) selectAllBtn.classList.remove('selected'); }
    document.querySelectorAll('.cl-row').forEach(row => {
      const id = row.dataset.id;
      const cb = row.querySelector('.mac-select-btn');
      if (window.selectedIds.has(id)) { row.classList.add('selected'); if (cb) cb.classList.add('selected'); }
      else { row.classList.remove('selected'); if (cb) cb.classList.remove('selected'); }
    });
    if (selectAllBtn) {
      const pageIds = filtered.slice((currentPage-1)*PER_PAGE, currentPage*PER_PAGE).map(i => i.id);
      selectAllBtn.classList.toggle('selected', pageIds.length > 0 && pageIds.every(id => window.selectedIds.has(id)));
    }
  };

  window.massDelete = async function() {
    if (window.selectedIds.size === 0) return;
    if (!confirm(`Eliminare ${window.selectedIds.size} servizi selezionati? I servizi in uso non verranno eliminati.`)) return;
    let success = 0;
    UI.toast('Eliminazione in corso...', 'info');
    for (const id of window.selectedIds) {
      try {
        await API.Services.remove(id);
        success++;
        ALL_CATALOG = ALL_CATALOG.filter(s => s.id !== id);
      } catch (err) { console.warn(`Skip ${id}:`, err.message); }
    }
    if (success > 0) {
      UI.toast(`${success} servizi eliminati.`, 'success');
      updateKpis(); applyFilters();
    } else {
      UI.toast('Nessun servizio eliminato. Verifica che non abbiano sottoscrizioni attive.', 'warning');
    }
    window.clearSelection();
  };

  /* ── RENDER ─────────────────────────────────────────────────── */
  function render() {
    if (!list) return;
    if (!filtered.length) {
      const msg = ALL_CATALOG.length > 0
        ? 'Nessun servizio corrisponde ai filtri.'
        : 'Nessun servizio in catalogo. Crea il primo servizio!';
      list.innerHTML = `<div class="list-card">${UI.createEmptyState(null, msg)}</div>`;
      if (infoEl) infoEl.textContent = '';
      if (paginationEl) paginationEl.innerHTML = '';
      return;
    }

    const page   = filtered.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);
    const cyMap  = CYCLE_LABEL();

    // 6 columns: [1.5fr minmax(200px, 1.2fr) 1fr 1fr 110px 140px]
    const GRID = '1.5fr minmax(180px, 1.2fr) 1fr 1.2fr 110px 140px';

    list.innerHTML = page.map(s => {
      const isSelected   = window.selectedIds.has(s.id);
      const isActive     = s.is_active !== false && s.status !== 'inactive';
      const cycleLabel   = cyMap[s.billing_cycle] || s.billing_cycle || '';
      const cycleBg      = CYCLE_BADGE_COLOR[s.billing_cycle] || '#f3f4f6';
      const cycleTxt     = CYCLE_TEXT_COLOR[s.billing_cycle]  || '#374151';
      const price        = UI.currency(s.price || 0, s.currency || 'EUR');
      const clients      = s.active_clients_count       ?? 0;
      const onboarding   = s.onboarding_linked_count    ?? 0;
      const totalSubs    = s.total_subscriptions_count  ?? 0;
      const cat          = s.category || '';
      const code         = s.internal_code ? `<span style="font-size:10px;background:#f3f4f6;color:#6b7280;padding:1px 5px;border-radius:4px;margin-left:4px;">${s.internal_code}</span>` : '';
      const visQuotes    = s.visible_in_quotes !== false;
      const supplierName = s.supplier_name || '—';

      const utilizziHtml = (clients + onboarding) > 0
        ? `<div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${clients    > 0 ? `<span style="font-size:12px;color:#065f46;background:#d1fae5;padding:2px 7px;border-radius:20px;">👥 ${clients}</span>` : ''}
            ${onboarding > 0 ? `<span style="font-size:12px;color:#b45309;background:#fef3c7;padding:2px 7px;border-radius:20px;">🚀 ${onboarding}</span>` : ''}
           </div>`
        : `<span style="font-size:12px;color:var(--gray-400);">Nessun utilizzo</span>`;

      const canDelete = totalSubs === 0;

      return `
      <div class="cl-row fade-in ${isSelected ? 'selected' : ''}" data-id="${s.id}"
        style="display:grid;grid-template-columns:${GRID};align-items:center;gap:12px;padding:12px 24px;border-bottom:1px solid var(--border);cursor:pointer;transition:background .1s;"
        onclick="window.editService('${s.id}')">

        <!-- Col 1: Identity -->
        <div style="display:flex;align-items:flex-start;gap:10px;min-width:0;">
          <div class="mac-select-btn ${isSelected ? 'selected' : ''}" data-id="${s.id}"
            onclick="window.toggleSelection(event,'${s.id}')" style="flex-shrink:0; margin-top:2px;">
            <div class="mac-checkbox"></div>
          </div>
          <div style="min-width:0;">
            <div style="font-size:13px;font-weight:600;color:#111827;line-height:1.2;" title="${s.name || ''}">${s.name || ''}${code}</div>
            ${cat ? `<div style="font-size:11px;color:var(--gray-500);margin-top:2px;">${cat}</div>` : ''}
          </div>
        </div>

        <!-- Col 2: Fornitore -->
        <div style="font-size:13px;font-weight:500;color:#374151;" class="truncate" title="${supplierName}">
          ${supplierName}
        </div>

        <!-- Col 3: Info & Ciclo -->
        <div>
          <span style="font-size:11px;font-weight:700;background:${cycleBg};color:${cycleTxt};padding:3px 8px;border-radius:20px;">${cycleLabel}</span>
        </div>

        <!-- Col 4: Prezzo / Utilizzi -->
        <div style="display:flex; flex-direction:column; gap:2px;">
          <span style="font-size:13px;font-weight:700;color:#111827;">${price}</span>
          ${utilizziHtml}
        </div>

        <!-- Col 5: Stato -->
        <div>${UI.pill(isActive ? 'active' : 'inactive')}</div>

        <!-- Col 6: Azioni (Mac style) -->
        <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;" onclick="event.stopPropagation()">
            <!-- Toggle active (Mac Switch style) -->
            <div title="${isActive ? 'Disattiva' : 'Attiva'}" style="width:36px; height:20px; border-radius:20px; background:${isActive?'#34c759':'#e5e5ea'}; position:relative; cursor:pointer; transition:.3s; margin-right:4px;" onclick="event.stopPropagation(); window.toggleService('${s.id}', ${isActive})">
              <div style="width:16px; height:16px; background:#fff; border-radius:50%; position:absolute; top:2px; left:2px; transform:${isActive?'translateX(16px)':'none'}; transition:.3s; box-shadow:0 1px 2px rgba(0,0,0,.2);"></div>
            </div>
            
            <!-- Azioni come in Quotes (div on hover) -->
            <div title="Duplica Servizio" style="cursor:pointer; font-size:16px; margin-right:4px; opacity:0.8; transition:opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.8" onclick="event.stopPropagation();window.duplicateService('${s.id}','${(s.name||'').replace(/'/g,'')}')">📄</div>
            
            ${canDelete ? `
            <div title="Elimina" style="cursor:pointer; font-size:16px; opacity:0.8; transition:opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.8" onclick="window.deleteService('${s.id}','${(s.name||'').replace(/'/g,'')}')">🗑️</div>` : ''}
        </div>
      </div>`;
    }).join('');

    const start = (currentPage - 1) * PER_PAGE + 1;
    const end   = Math.min(currentPage * PER_PAGE, filtered.length);
    if (infoEl) infoEl.textContent = `${start}–${end} di ${filtered.length}`;
    UI.pagination(paginationEl, null, currentPage, filtered.length, PER_PAGE, p => {
      currentPage = p; saveState(); render(); window.updateSelectionUI();
    });
    setTimeout(() => { if (window.updateSelectionUI) window.updateSelectionUI(); }, 10);
  }

  /* ── Modal: Nuovo / Modifica ──────────────────────────────── */
  btnNew?.addEventListener('click', () => openServiceModal(null));

  function openServiceModal(svc) {
    editingId = svc ? svc.id : null;
    const title = $('modal-service-title');
    if (title) title.textContent = editingId ? 'Modifica servizio' : 'Nuovo servizio';

    const setVal = (id, val) => { const el=$(id); if(el) el.value = val; };
    setVal('fs-name',          svc?.name              || '');
    setVal('fs-desc',          svc?.description       || '');
    setVal('fs-category',      svc?.category          || '');
    setVal('fs-internal-code', svc?.internal_code     || '');
    setVal('fs-cycle',         svc?.billing_cycle     || 'monthly');
    setVal('fs-renewal-rule',  svc?.renewal_rule      || 'manual');
    setVal('fs-price',         svc?.price ?? svc?.price_monthly ?? '');
    setVal('fs-currency',      svc?.currency          || 'EUR');
    setVal('fs-duration',      svc?.standard_duration_months || '');
    setVal('fs-notes',         svc?.notes             || '');

    const compSel = $('fs-company-id');
    if (compSel) {
      compSel.innerHTML = '<option value="">(Seleziona Fornitore)</option>' +
         _companies.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
      compSel.value = svc?.company_id || '';
    }

    const tv = svc?.template_vars || {};
    $('fs-clauses').value     = tv.servizio_clausole   || '';

    const vq = $('fs-visible-quotes');
    const vo = $('fs-visible-onboarding');
    if (vq) vq.checked = svc ? (svc.visible_in_quotes !== false) : true;
    if (vo) vo.checked = svc ? (svc.visible_in_onboarding !== false) : true;

    modalSvc?.classList.add('open');
    $('fs-name')?.focus();
  }

  btnSave?.addEventListener('click', async () => {
    const name = $('fs-name')?.value?.trim();
    if (!name) { UI.toast('Nome servizio obbligatorio', 'warning'); return; }
    const price = parseFloat($('fs-price')?.value);
    if (isNaN(price) || price < 0) { UI.toast('Prezzo non valido', 'warning'); return; }

    btnSave.disabled = true;
    const tvClauses = $('fs-clauses')?.value?.trim() || '';
    const payload = {
      name,
      description:              $('fs-desc')?.value?.trim()          || null,
      category:                 $('fs-category')?.value?.trim()      || null,
      internal_code:            $('fs-internal-code')?.value?.trim() || null,
      company_id:               $('fs-company-id')?.value            || null,
      billing_cycle:            $('fs-cycle')?.value                 || 'monthly',
      renewal_rule:             $('fs-renewal-rule')?.value          || 'manual',
      price,
      currency:                 $('fs-currency')?.value              || 'EUR',
      standard_duration_months: parseInt($('fs-duration')?.value) || null,
      visible_in_quotes:        $('fs-visible-quotes')?.checked      ?? true,
      visible_in_onboarding:    $('fs-visible-onboarding')?.checked  ?? true,
      notes:                    $('fs-notes')?.value?.trim()         || null,
      is_active:                true,
      template_vars:            tvClauses ? { servizio_clausole: tvClauses } : null,
    };
    // remove null standard_duration_months if empty
    if (!payload.standard_duration_months) delete payload.standard_duration_months;

    try {
      if (editingId) {
        await API.Services.updateService(editingId, payload);
        ALL_CATALOG = ALL_CATALOG.map(s => s.id === editingId ? { ...s, ...payload, id: editingId } : s);
        UI.toast('Servizio aggiornato', 'success');
      } else {
        const created = await API.Services.createService(payload);
        if (created) ALL_CATALOG.unshift({ ...created, active_clients_count: 0, onboarding_linked_count: 0, total_subscriptions_count: 0 });
        UI.toast('Servizio creato', 'success');
      }
      modalSvc?.classList.remove('open');
      updateKpis();
      applyFilters();
    } catch (e) {
      UI.toast(e?.message || 'Errore durante il salvataggio', 'error');
    } finally {
      btnSave.disabled = false;
    }
  });

  /* ── Row Actions ─────────────────────────────────────────── */
  window.editService = (id) => {
    const svc = ALL_CATALOG.find(s => s.id === id);
    if (svc) openServiceModal(svc);
  };

  window.toggleService = async (id, isCurrentlyActive) => {
    const newActive = !isCurrentlyActive;
    const label = isCurrentlyActive ? 'Disattivare' : 'Attivare';
    if (!confirm(`${label} questo servizio?`)) return;
    try {
      await API.Services.updateService(id, { is_active: newActive });
      ALL_CATALOG = ALL_CATALOG.map(s => s.id === id ? { ...s, is_active: newActive } : s);
      updateKpis();
      applyFilters();
      UI.toast(isCurrentlyActive ? 'Servizio disattivato' : 'Servizio attivato', 'success');
    } catch (e) { UI.toast(e?.message || 'Errore', 'error'); }
  };

  window.duplicateService = async (id, name) => {
    if (!confirm(`Duplicare "${name}"? Verrà creata una copia inattiva.`)) return;
    try {
      UI.toast('Duplicazione in corso...', 'info');
      const created = await API.Services.duplicate(id);
      if (created) ALL_CATALOG.unshift({ ...created, active_clients_count: 0, onboarding_linked_count: 0, total_subscriptions_count: 0 });
      updateKpis();
      applyFilters();
      UI.toast(`"${created?.name}" creato come bozza inattiva.`, 'success');
    } catch (e) { UI.toast(e?.message || 'Errore duplicazione', 'error'); }
  };

  window.deleteService = async (id, name) => {
    if (!confirm(`Eliminare definitivamente "${name}"? L'operazione non è reversibile.`)) return;
    try {
      await API.Services.remove(id);
      ALL_CATALOG = ALL_CATALOG.filter(s => s.id !== id);
      updateKpis();
      applyFilters();
      UI.toast('Servizio eliminato', 'info');
    } catch (e) { UI.toast(e?.message || 'Impossibile eliminare. Verifica le sottoscrizioni.', 'error'); }
  };

  /* ── Usage Drawer (slide-in panel) ──────────────────────── */
  window.openUsageDrawer = async (serviceId) => {
    const svc     = ALL_CATALOG.find(s => s.id === serviceId);
    const drawer  = $('usage-drawer');
    const overlay = $('usage-drawer-overlay');
    const body    = $('drawer-body');
    const title   = $('drawer-title');
    const subtitle = $('drawer-subtitle');

    if (!drawer) return;

    if (title)    title.textContent = svc?.name || 'Utilizzi';
    if (subtitle) subtitle.textContent = svc?.category || '';
    if (body)     body.innerHTML = UI.skeletonCardList(3);

    // KPI bar
    const setKpi = (id, v) => { const el = $(id); if (el) el.textContent = v; };
    setKpi('drawer-kpi-clients',    svc?.active_clients_count    ?? '…');
    setKpi('drawer-kpi-onboarding', svc?.onboarding_linked_count ?? '…');
    setKpi('drawer-kpi-total',      svc?.total_subscriptions_count ?? '…');

    // Show drawer
    if (overlay) overlay.style.display = 'block';
    if (drawer)  drawer.style.transform = 'translateX(0)';

    try {
      const data = await API.Services.usages(serviceId);
      const subs = data?.subscriptions || [];

      setKpi('drawer-kpi-clients',    data?.active_count  ?? 0);
      setKpi('drawer-kpi-onboarding', (data?.onboarding||[]).length);
      setKpi('drawer-kpi-total',      data?.total ?? 0);

      if (!subs.length) {
        body.innerHTML = `<div style="padding:32px 0;text-align:center;color:var(--gray-400);">
          <div style="font-size:32px;margin-bottom:8px;">📭</div>
          <div style="font-size:14px;">Nessun utilizzo trovato per questo servizio.</div>
        </div>`;
        return;
      }

      const CYCLE = CYCLE_LABEL();
      body.innerHTML = `
        <div style="font-size:11px;font-weight:700;color:var(--gray-500);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;">Sottoscrizioni (${subs.length})</div>
        ${subs.map(sub => {
          const clientName = sub.clients?.company_name || sub.clients?.name || sub.client_name || 'Cliente';
          const clientId   = sub.client_id || '';
          const onbId      = sub.onboarding_id || '';
          const dest       = clientId
            ? `<a href="admin_client_detail.html?id=${clientId}" style="font-weight:600;color:var(--brand-600);text-decoration:none;">${clientName}</a>`
            : onbId
              ? `<a href="admin_onboarding_detail.html?id=${onbId}" style="font-weight:600;color:#b45309;text-decoration:none;">🚀 Onboarding</a>`
              : 'N/A';

          return `<div style="background:#f9fafb;border-radius:8px;padding:12px 14px;margin-bottom:8px;border:1px solid var(--border);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
              ${dest}
              ${UI.pill(sub.status || 'active')}
            </div>
            <div style="font-size:11px;color:var(--gray-500);display:flex;gap:12px;">
              <span>${CYCLE[sub.billing_cycle] || sub.billing_cycle || ''}</span>
              ${sub.start_date ? `<span>dal ${UI.date(sub.start_date)}</span>` : ''}
              ${sub.price != null ? `<span style="font-weight:700;color:#111;">${UI.currency(sub.price, sub.currency)}</span>` : ''}
            </div>
          </div>`;
        }).join('')}`;
    } catch (e) {
      if (body) body.innerHTML = `<div style="color:var(--color-danger);font-size:13px;padding:16px 0;">${e?.message || 'Errore nel caricamento utilizzi'}</div>`;
    }
  };

  window.closeUsageDrawer = () => {
    const drawer  = $('usage-drawer');
    const overlay = $('usage-drawer-overlay');
    if (drawer)  drawer.style.transform = 'translateX(100%)';
    if (overlay) setTimeout(() => overlay.style.display = 'none', 300);
  };

  /* ── Init ───────────────────────────────────────────────────── */
  window.onPageReady(async () => {
    await I18n.init('lang-switcher-slot');
    load();
  });

})();