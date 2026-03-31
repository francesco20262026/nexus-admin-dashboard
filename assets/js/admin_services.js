/* ============================================================
   admin_services.js Service catalog + subscription management
   ============================================================ */
'use strict';

(function () {
  Auth.guard('admin');
  Auth.initUI();

  /* ── State ─────────────────────────────────────────────────── */
  let ALL_CATALOG    = [];  // service definitions
  let ALL_SUBS       = [];  // all subscriptions (for KPIs)
  let filtered       = [];

  const saved     = window.SessionState?.load('services') || {};
  let currentPage = saved.currentPage || 1;
  let activeTab   = saved.activeTab   || 'all';
  let editingId   = null;  // null = creating, string = editing
  const PER_PAGE  = 15;

  /* ── DOM refs ───────────────────────────────────────────────── */
  const $ = id => document.getElementById(id);
  const list          = $('srv-list');
  const searchEl      = $('srv-search');
  const infoEl        = $('srv-info');
  const paginationEl  = $('srv-pagination');
  const tabBar        = $('srv-pipeline-bar');
  const btnNew        = $('btn-new-service');
  const btnRefresh    = $('btn-refresh-services');
  const modalSvc      = $('modal-service');
  const modalSubs     = $('modal-subs');
  const btnSave       = $('modal-service-save');

  /* ── Billling cycle labels (via i18n or fallback) ───────────── */
  const CYCLE_LABEL = () => ({
    monthly:   I18n.t('cl.cycle_monthly')   || 'Mensile',
    quarterly: I18n.t('cl.cycle_quarterly') || 'Trimestrale',
    annual:    I18n.t('cl.cycle_annual')    || 'Annuale',
    one_off:   I18n.t('srv.cycle_one_off')  || 'Una tantum',
  });

  /* ── Restore saved state ───────────────────────────────────── */
  if (searchEl && saved.search) searchEl.value = saved.search;
  tabBar?.querySelectorAll('.cl-status-pill').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === activeTab)
  );

  function saveState() {
    window.SessionState?.save('services', {
      activeTab, currentPage,
      search: searchEl?.value || '',
      status: '',
    });
  }

  /* ── Tab clicks ─────────────────────────────────────────────── */
  tabBar?.addEventListener('click', e => {
    const btn = e.target.closest('.cl-status-pill');
    if (!btn) return;
    tabBar.querySelectorAll('.cl-status-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeTab   = btn.dataset.tab;
    currentPage = 1;
    applyFilters();
  });

  /* ── Filter listeners ───────────────────────────────────────── */
  searchEl?.addEventListener('input',    debounce(() => { currentPage = 1; applyFilters(); }, 200));
  
  /* ── Refresh ────────────────────────────────────────────────── */
  btnRefresh?.addEventListener('click', () => { if(window.UI) UI.toast('Aggiornamento in corso...', 'info'); load(true); });
  window.addEventListener('companyChanged', () => load(true));
  window._reloadServices = () => load(true);

  /* ── LOAD ───────────────────────────────────────────────────── */
  async function load() {
    if (!list) return;
    list.innerHTML = UI.skeletonCardList(5);

    try {
      // Load catalog
      const catRes = await API.Services.catalog(false);
      ALL_CATALOG = Array.isArray(catRes) ? catRes : (catRes?.items ?? catRes?.data ?? []);

      // Try loading subscriptions for KPI counts
      try {
        const subRes = await API.Services.subscriptions?.({});
        ALL_SUBS = Array.isArray(subRes) ? subRes : (subRes?.items ?? subRes?.data ?? []);
      } catch { ALL_SUBS = []; }

    } catch (e) {
      console.error('[admin_services] load error:', e);
      list.innerHTML = UI.errorState(e.message, 'window._reloadServices()');
      updateKpis();
      return;
    }

    updateKpis();
    applyFilters();
  }

  /* ── KPI cards ─────────────────────────────────────────────── */
  function updateKpis() {
    const active    = ALL_CATALOG.filter(s => s.status === 'active').length;
    const plans     = ALL_CATALOG.filter(s => s.billing_cycle !== 'one_off').length;

    // Subscriptions KPIs come from subscriptions data
    const activeSubs = ALL_SUBS.filter(s => s.status === 'active').length;

    // Renewals due in next 30 days
    const now   = new Date();
    const d30   = new Date(now.getTime() + 30 * 86400000);
    const renw  = ALL_SUBS.filter(s => {
      const exp = s.renewal_date || s.expires_at || s.end_date;
      if (!exp) return false;
      const d = new Date(exp);
      return d <= d30 && d >= now;
    }).length;

    const set = (id, val, meta) => {
      const el = $(id); if (el) el.textContent = val;
      const em = $(id + '-meta'); if (em && meta !== undefined) em.textContent = meta;
    };
    set('kpi-srv-active',    active,    I18n.t('srv.kpi_active_meta')    || 'Nel catalogo');
    set('kpi-srv-plans',     plans,     I18n.t('srv.kpi_plans_meta')     || 'Ricorrenti');
    set('kpi-srv-subs',      activeSubs || ALL_CATALOG.reduce((acc, s) => acc + (s.active_subscriptions_count || s.client_count || 0), 0),
                                          I18n.t('srv.kpi_subs_meta')    || 'Su tutti i servizi');
    set('kpi-srv-renewals',  renw,      I18n.t('srv.kpi_renewals_meta') || 'Nei prossimi 30 gg');
  }

  /* ── Category filter logic removed ─────────────────────── */

  /* ── Apply filters ──────────────────────────────────────────── */
  function applyFilters() {
    const text   = (searchEl?.value || '').toLowerCase().trim();
    const status = '';
    const cycle  = ''  || '';

    filtered = ALL_CATALOG.filter(s => {
      // Tab overrides status
      if (activeTab === 'active'   && s.status !== 'active')    return false;
      if (activeTab === 'inactive' && s.status !== 'inactive')  return false;
      if (['monthly','quarterly','annual','one_off'].includes(activeTab) && s.billing_cycle !== activeTab) return false;
      if (status && s.status !== status)         return false;
      if (cycle  && s.billing_cycle !== cycle)   return false;
      if (text) {
        const hay = [s.name, s.description, s.category]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(text)) return false;
      }
      return true;
    });

    const maxPage = Math.ceil(filtered.length / PER_PAGE) || 1;
    if (currentPage > maxPage) currentPage = maxPage;
    saveState();
    window.clearSelection && window.clearSelection();
    render();
  }

  /* ── Selection & Mass Actions (Mac Style) ─────────────────── */
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
      if (row) {
        if (isSelected) row.classList.add('selected');
        else row.classList.remove('selected');
      }
    });
    updateSelectionUI();
  };
  
  window.clearSelection = function() {
    window.selectedIds.clear();
    const selectAllBtn = document.getElementById('mass-select-all');
    if (selectAllBtn) selectAllBtn.classList.remove('selected');
    document.querySelectorAll('.mac-select-btn').forEach(cb => cb.checked = false);
    document.querySelectorAll('.cl-row.selected').forEach(r => r.classList.remove('selected'));
    updateSelectionUI();
  };
  
  window.updateSelectionUI = function() {
    const bar = document.getElementById('mac-mass-action-bar');
    const countEl = document.getElementById('mac-mass-action-count');
    const selectAllBtn = document.getElementById('mass-select-all');
    
    if (!bar || !countEl) return;
    
    const count = window.selectedIds.size;
    countEl.textContent = count;
    
    if (count > 0) bar.classList.add('visible');
    else {
      bar.classList.remove('visible');
      if (selectAllBtn) selectAllBtn.classList.remove('selected');
    }
    
    document.querySelectorAll('.cl-row').forEach(row => {
      const id = row.dataset.id;
      const cb = row.querySelector('.mac-select-btn');
      if (window.selectedIds.has(id)) {
        row.classList.add('selected');
        if (cb) cb.classList.add('selected');
      } else {
        row.classList.remove('selected');
        if (cb) cb.classList.remove('selected');
      }
    });

    if (selectAllBtn) {
      const currentPageIds = filtered.slice((currentPage-1)*PER_PAGE, currentPage*PER_PAGE).map(i => i.id);
      const allSelected = currentPageIds.length > 0 && currentPageIds.every(id => window.selectedIds.has(id));
      if (allSelected) selectAllBtn.classList.add('selected');
      else selectAllBtn.classList.remove('selected');
    }
  };
  
  window.massDelete = async function() {
    if (window.selectedIds.size === 0) return;
    if (!confirm(`Sei sicuro di voler eliminare ${window.selectedIds.size} servizi selezionati?`)) return;
    
    let success = 0;
    try {
      UI.toast(`Eliminazione in corso...`, 'info');
      for (const id of window.selectedIds) {
        try {
          await API.Services.remove(id);
          success++;
          ALL_CATALOG = ALL_CATALOG.filter(s => s.id !== id);
        } catch (err) {
          console.error(`Error deleting service ${id}:`, err);
        }
      }
      if (success > 0) {
        UI.toast(`${success} servizi eliminati.`, 'success');
        updateKpis();
        applyFilters();
      } else {
        UI.toast("Errore durante l\'eliminazione. Riprova.", 'error');
      }
    } catch (e) {
      UI.toast("Errore durante l\'eliminazione multipla.", 'error');
    }
  };

  /* ── Render list ────────────────────────────────────────────── */
  function render() {
    if (!list) return;
    if (!filtered.length) {
      const msg = ALL_CATALOG.length > 0
        ? I18n.t('common.no_results')    || 'Nessun servizio corrisponde ai filtri.'
        : I18n.t('srv.empty')            || 'Nessun servizio in catalogo.';
      list.innerHTML = `<div class="list-card">${UI.createEmptyState(null, msg)}</div>`;
      if (infoEl) infoEl.textContent = '';
      if (paginationEl) paginationEl.innerHTML = '';
      return;
    }

    const page = filtered.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);
    const cyMap = CYCLE_LABEL();

    list.innerHTML = page.map(s => {
      const isSelected = window.selectedIds.has(s.id);
      const cycleLabel = cyMap[s.billing_cycle] || s.billing_cycle || 0;
      const price      = UI.currency(s.price || s.price_monthly || 0, s.currency);
      const clientsN   = s.active_subscriptions_count ?? s.client_count ?? s.subscribers_count ?? '';
      const cat        = s.category || '';

      return `
      <div class="cl-row fade-in ${isSelected ? 'selected' : ''}" data-id="${s.id}" style="display:grid; grid-template-columns: 2.5fr 1.5fr 1fr 140px; align-items:center; gap:16px; padding:16px 24px; border-bottom:1px solid var(--border); transition:all 0.15s; cursor:pointer;" onclick="document.querySelector('.mac-select-btn', this)?.click()">
        <!-- Colonna 1: Servizio e Categoria -->
        <div class="cl-col cl-col-1">
          <div class="cl-row-identity">
            <div class="mac-select-btn ${isSelected ? 'selected' : ''}" data-id="${s.id}" onclick="window.toggleSelection(event, '${s.id}')" style="flex-shrink:0;">
              <div class="mac-checkbox"></div>
            </div>
          <div style="flex:1; min-width:0;">
            <div class="cl-row-name" style="font-size:14px; font-weight:600; color:var(--gray-900); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${s.name || ''}">${s.name || ''}</div>
            ${cat ? `<div class="cl-row-meta" style="font-size:12px; color:var(--gray-500); margin-top:2px;">${cat}</div>` : ''}
            ${s.description ? `<div style="font-size:12px; color:var(--gray-400); margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${s.description.replace(/"/g,'&quot;')}">${s.description}</div>` : ''}
          </div>
        </div>

        </div>
        <!-- Colonna 2: Info (Ciclo, Clienti) -->
        <div class="cl-col" style="min-width:0;">
          <div style="font-size:12px; color:var(--gray-600);"><span style="font-weight:600; text-transform:uppercase;">${cycleLabel}</span></div>
          ${clientsN !== '' ? `<div style="font-size:12px; color:var(--gray-600); margin-top:2px;">👥 ${clientsN} ${I18n.t('srv.clients_active') || 'clienti attivi'}</div>` : ''}
        </div>

        <!-- Colonna 3: Prezzo e Stato -->
        <div class="cl-col" style="min-width:0;">
          <div class="cl-data-val" style="font-size:14px; font-weight:700; color:var(--gray-900);">${price}</div>
          <div style="margin-top:4px;">${UI.pill(s.status || 'inactive')}</div>
        </div>

        <!-- Colonna 4: Azioni -->
        <div class="cl-col cl-col-actions" style="display:flex; flex-direction:row; align-items:center; gap:8px; justify-content:flex-end;">
          <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); viewSubscriptions('${s.id}')" title="${I18n.t('srv.action_subs') || 'Sottoscrizioni'}">
            <svg style="width:14px;height:14px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"/></svg>
            <span class="sr-only">Sottoscrizioni</span>
          </button>
          <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); editService('${s.id}')" title="${I18n.t('common.edit') || 'Modifica'}">
            <svg style="width:14px;height:14px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.89 1.12l-2.83.893.893-2.83a4.5 4.5 0 0 1 1.12-1.89l12.75-12.75Z"/></svg>
            <span class="sr-only">Menu</span>
          </button>
          <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); toggleService('${s.id}','${s.status}')">
            ${s.status === 'active' ? (I18n.t('srv.action_deactivate') || 'Disattiva') : (I18n.t('srv.action_activate') || 'Attiva')}
          </button>
          ${(clientsN === 0 || clientsN === '') ? `
          <button class="btn btn-ghost btn-sm" style="color:var(--color-danger);" onclick="event.stopPropagation(); deleteService('${s.id}','${(s.name||'').replace(/'/g,'')}')" title="${I18n.t('common.delete') || 'Elimina'}">
            <svg style="width:14px;height:14px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/></svg>
          </button>` : ''}
        </div>
      </div>`;
    }).join('');

    const start = (currentPage - 1) * PER_PAGE + 1;
    const end   = Math.min(currentPage * PER_PAGE, filtered.length);
    if (infoEl) infoEl.textContent = `${start}–${end} di ${filtered.length}`;
    UI.pagination(paginationEl, null, currentPage, filtered.length, PER_PAGE, p => {
      currentPage = p; saveState(); render(); window.updateSelectionUI();
    });
    setTimeout(() => { if(window.updateSelectionUI) window.updateSelectionUI(); }, 10);
  }

  /* ── Modal: Nuovo / Modifica ─────────────────────────────────── */
  btnNew?.addEventListener('click', () => openServiceModal(null));

  function openServiceModal(serviceObj) {
    editingId = serviceObj ? serviceObj.id : null;
    const title = $('modal-service-title');
    if (title) title.textContent = editingId
      ? (I18n.t('srv.modal_edit') || 'Modifica servizio')
      : (I18n.t('srv.modal_new')  || 'Nuovo servizio');

    $('fs-name').value     = serviceObj?.name        || '';
    $('fs-desc').value     = serviceObj?.description || '';
    $('fs-category').value = serviceObj?.category    || '';
    $('fs-cycle').value    = serviceObj?.billing_cycle || 'monthly';
    $('fs-price').value    = serviceObj?.price ?? serviceObj?.price_monthly ?? '';
    $('fs-currency').value = serviceObj?.currency    || 'EUR';
    $('fs-notes').value    = serviceObj?.notes       || '';

    const tv = serviceObj?.template_vars || {};
    $('fs-clauses').value  = tv.servizio_clausole || '';

    modalSvc?.classList.add('open');
    $('fs-name')?.focus();
  }

  btnSave?.addEventListener('click', async () => {
    const name = $('fs-name')?.value?.trim();
    if (!name) { UI.toast(I18n.t('srv.form_required') || 'Nome servizio obbligatorio', 'warning'); return; }
    const price = parseFloat($('fs-price')?.value);
    if (isNaN(price) || price < 0) { UI.toast(I18n.t('srv.form_price') || 'Prezzo non valido', 'warning'); return; }

    btnSave.disabled = true;
    const tvClauses = $('fs-clauses')?.value?.trim() || '';
    const payload = {
      name,
      description:   $('fs-desc')?.value?.trim()     || null,
      category:      $('fs-category')?.value?.trim() || null,
      billing_cycle: $('fs-cycle')?.value            || 'monthly',
      price,
      currency:      $('fs-currency')?.value         || 'EUR',
      notes:         $('fs-notes')?.value?.trim()    || null,
      status:        'active',
      template_vars: tvClauses ? { servizio_clausole: tvClauses } : null
    };

    try {
      if (editingId) {
        await API.Services.updateService(editingId, payload);
        ALL_CATALOG = ALL_CATALOG.map(s => s.id === editingId ? { ...s, ...payload, id: editingId } : s);
        UI.toast(I18n.t('srv.updated_ok') || 'Servizio aggiornato', 'success');
      } else {
        const created = await API.Services.createService(payload);
        if (created) ALL_CATALOG.unshift(created);
        UI.toast(I18n.t('srv.created_ok') || 'Servizio creato', 'success');
      }
      modalSvc?.classList.remove('open');
      updateKpis();
      applyFilters();
    } catch (e) {
      UI.toast(e?.message || I18n.t('error.generic'), 'error');
    } finally {
      btnSave.disabled = false;
    }
  });

  /* ── Row actions ────────────────────────────────────────────── */
  window.editService = (id) => {
    const svc = ALL_CATALOG.find(s => s.id === id);
    if (svc) openServiceModal(svc);
  };

  window.toggleService = async (id, currentStatus) => {
    const isActive  = currentStatus === 'active';
    const newStatus = isActive ? 'inactive' : 'active';
    const label     = isActive
      ? (I18n.t('srv.action_deactivate') || 'Disattivare')
      : (I18n.t('srv.action_activate')   || 'Attivare');
    if (!confirm(`${label} questo servizio?`)) return;
    try {
      await API.Services.update(id, { status: newStatus });
      ALL_CATALOG = ALL_CATALOG.map(s => s.id === id ? { ...s, status: newStatus } : s);
      updateKpis();
      applyFilters();
      UI.toast(isActive
        ? (I18n.t('srv.deactivated_ok') || 'Servizio disattivato')
        : (I18n.t('srv.activated_ok')   || 'Servizio attivato'), 'success');
    } catch (e) { UI.toast(e?.message || I18n.t('error.generic'), 'error'); }
  };

  window.deleteService = async (id, name) => {
    if (!confirm(`${I18n.t('srv.confirm_delete') || 'Eliminare'} "${name}"?`)) return;
    try {
      await API.Services.remove(id);
      ALL_CATALOG = ALL_CATALOG.filter(s => s.id !== id);
      updateKpis();
      applyFilters();
      UI.toast(I18n.t('srv.deleted_ok') || 'Servizio eliminato', 'info');
    } catch (e) { UI.toast(e?.message || I18n.t('error.generic'), 'error'); }
  };

  /* ── View subscriptions modal ───────────────────────────────── */
  window.viewSubscriptions = async (serviceId) => {
    const svc  = ALL_CATALOG.find(s => s.id === serviceId);
    const body = $('modal-subs-body');
    const name = $('modal-subs-service-name');
    if (name) name.textContent = svc?.name || '';
    if (body) body.innerHTML = UI.skeletonCardList(3);
    modalSubs?.classList.add('open');

    try {
      const res  = await API.Services.subscriptions?.({ service_id: serviceId });
      const subs = Array.isArray(res) ? res : (res?.items ?? res?.data ?? []);

      if (!subs.length) {
        body.innerHTML = `<div style="padding:12px 0;text-align:center;color:var(--gray-500);font-size:14px;">${
          I18n.t('srv.no_subs') || 'Nessuna sottoscrizione attiva per questo servizio.'}</div>`;
        return;
      }

      body.innerHTML = subs.map(sub => {
        const clientName = sub.client_name || sub.client?.name || 0;
        const clientId   = sub.client_id   || sub.client?.id   || '';
        const cycle      = CYCLE_LABEL()[sub.billing_cycle] || sub.billing_cycle || 0;
        return `
          <div class="list-card" style="margin-bottom:8px;">
            <div class="list-card-header">
              <a class="list-card-title link-brand" href="admin_client_detail.html?id=${clientId}">${clientName}</a>
              ${UI.pill(sub.status || 'active')}
            </div>
            <div class="list-card-body">
              <div class="list-card-meta">${cycle}</div>
              ${sub.start_date ? `<div class="list-card-meta">${I18n.t('cl.f_start_date') || 'Inizio'}: ${UI.date(sub.start_date)}</div>` : ''}
              ${sub.renewal_date||sub.expires_at ? `<div class="list-card-meta">${I18n.t('cl.expires_at') || 'Scad.'}: ${UI.date(sub.renewal_date||sub.expires_at)}</div>` : ''}
              ${UI.currency(sub.price || 0, sub.currency) !== '' ? `<div class="list-card-meta" style="font-weight:700;">${UI.currency(sub.price || 0, sub.currency)}</div>` : ''}
            </div>
          </div>`;
      }).join('');
    } catch (e) {
      if (body) body.innerHTML = `<div style="color:var(--color-danger);font-size:13px;">${e?.message || I18n.t('error.generic')}</div>`;
    }
  };

  /* ── Init ───────────────────────────────────────────────────── */
  window.onPageReady(async () => {
    await I18n.init('lang-switcher-slot');
    load();
  });

})();