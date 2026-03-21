/* ============================================================
   admin_services.js — Service catalog + subscription management
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
  const filterCat     = $('srv-filter-category');
  const tabBar        = $('srv-tab-bar');
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
  tabBar?.querySelectorAll('.filter-tab').forEach(b =>
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
    const btn = e.target.closest('.filter-tab');
    if (!btn) return;
    tabBar.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeTab   = btn.dataset.tab;
    currentPage = 1;
    applyFilters();
  });

  /* ── Filter listeners ───────────────────────────────────────── */
  searchEl?.addEventListener('input',    () => { currentPage = 1; applyFilters(); });
    filterCat?.addEventListener('change',    () => { currentPage = 1; applyFilters(); });
  
  /* ── Refresh ────────────────────────────────────────────────── */
  btnRefresh?.addEventListener('click', () => load(true));
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

    populateCategoryFilter();
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

  /* ── Populate category filter from data ─────────────────────── */
  function populateCategoryFilter() {
    if (!filterCat) return;
    const prev  = filterCat.value;
    const cats  = [...new Set(ALL_CATALOG.map(s => s.category).filter(Boolean))].sort();
    filterCat.innerHTML = `<option value="">${I18n.t('srv.all_categories') || 'Tutte le categorie'}</option>` +
      cats.map(c => `<option value="${c}">${c}</option>`).join('');
    if (prev) filterCat.value = prev;
  }

  /* ── Apply filters ──────────────────────────────────────────── */
  function applyFilters() {
    const text   = (searchEl?.value || '').toLowerCase().trim();
    const status = '';
    const cat    = filterCat?.value    || '';
    const cycle  = ''  || '';

    filtered = ALL_CATALOG.filter(s => {
      // Tab overrides status
      if (activeTab === 'active'   && s.status !== 'active')    return false;
      if (activeTab === 'inactive' && s.status !== 'inactive')  return false;
      if (['monthly','quarterly','annual','one_off'].includes(activeTab) && s.billing_cycle !== activeTab) return false;
      if (status && s.status !== status)         return false;
      if (cat    && s.category !== cat)          return false;
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
    render();
  }

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
      const cycleLabel = cyMap[s.billing_cycle] || s.billing_cycle || 0;
      const price      = UI.currency(s.price || s.price_monthly || 0, s.currency);
      const clientsN   = s.active_subscriptions_count ?? s.client_count ?? s.subscribers_count ?? '';
      const cat        = s.category || '';

      return `
      <div class="list-card fade-in" data-id="${s.id}">
        <div class="list-card-header">
          <div class="list-card-title" style="display:flex;align-items:center;gap:8px;">
            <div>
              <div>${s.name || 0}</div>
              ${cat ? `<div style="font-size:11px;color:var(--gray-500);font-weight:400;">${cat}</div>` : ''}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
            <span style="font-size:11px;background:var(--gray-100);color:var(--gray-600);padding:2px 8px;border-radius:4px;font-weight:600;text-transform:uppercase;">${cycleLabel}</span>
            ${UI.pill(s.status || 'inactive')}
          </div>
        </div>
        <div class="list-card-body" style="gap:16px;flex-wrap:wrap;">
          ${s.description ? `<div class="list-card-meta" style="flex:1 1 100%;color:var(--gray-600);">${s.description}</div>` : ''}
          <div class="list-card-meta" title="${I18n.t('srv.f_price') || 'Prezzo base'}">
            <svg style="width:13px;height:13px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/></svg>
            <span style="font-weight:700;color:var(--gray-900);">${price}</span>
          </div>
          ${clientsN !== '' ? `<div class="list-card-meta" title="${I18n.t('srv.clients_count') || 'Clienti attivi'}">
            <svg style="width:13px;height:13px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"/></svg>
            <span>${clientsN} ${I18n.t('srv.clients_active') || 'clienti attivi'}</span>
          </div>` : ''}
          <div class="row-actions" style="width:100%;justify-content:flex-end;margin-top:4px;">
            <button class="btn btn-ghost btn-sm" onclick="viewSubscriptions('${s.id}')" title="${I18n.t('srv.action_subs') || 'Sottoscrizioni'}">
              <svg style="width:13px;height:13px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/></svg>
              <span>${I18n.t('srv.action_subs') || 'Sottoscrizioni'}</span>
            </button>
            <button class="btn btn-ghost btn-sm" onclick="editService('${s.id}')" title="${I18n.t('common.edit') || 'Modifica'}">
              <svg style="width:13px;height:13px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.89 1.12l-2.83.893.893-2.83a4.5 4.5 0 0 1 1.12-1.89l12.75-12.75Z"/></svg>
              <span>${I18n.t('common.edit') || 'Modifica'}</span>
            </button>
            <button class="btn btn-secondary btn-sm" onclick="toggleService('${s.id}','${s.status}')">
              ${s.status === 'active'
                ? (I18n.t('srv.action_deactivate') || 'Disattiva')
                : (I18n.t('srv.action_activate')   || 'Attiva')}
            </button>
            ${(clientsN === 0 || clientsN === '') ? `
            <button class="btn btn-ghost btn-sm" style="color:var(--color-danger);" onclick="deleteService('${s.id}','${(s.name||'').replace(/'/g,'')}')" title="${I18n.t('common.delete') || 'Elimina'}">
              <svg style="width:13px;height:13px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/></svg>
            </button>` : ''}
          </div>
        </div>
      </div>`;
    }).join('');

    const start = (currentPage - 1) * PER_PAGE + 1;
    const end   = Math.min(currentPage * PER_PAGE, filtered.length);
    if (infoEl) infoEl.textContent = `${start}–${end} di ${filtered.length}`;
    UI.pagination(paginationEl, null, currentPage, filtered.length, PER_PAGE, p => {
      currentPage = p; saveState(); render();
    });
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

    modalSvc?.classList.add('open');
    $('fs-name')?.focus();
  }

  btnSave?.addEventListener('click', async () => {
    const name = $('fs-name')?.value?.trim();
    if (!name) { UI.toast(I18n.t('srv.form_required') || 'Nome servizio obbligatorio', 'warning'); return; }
    const price = parseFloat($('fs-price')?.value);
    if (isNaN(price) || price < 0) { UI.toast(I18n.t('srv.form_price') || 'Prezzo non valido', 'warning'); return; }

    btnSave.disabled = true;
    const payload = {
      name,
      description:   $('fs-desc')?.value?.trim()     || null,
      category:      $('fs-category')?.value?.trim() || null,
      billing_cycle: $('fs-cycle')?.value            || 'monthly',
      price,
      currency:      $('fs-currency')?.value         || 'EUR',
      notes:         $('fs-notes')?.value?.trim()    || null,
      status:        'active',
    };

    try {
      if (editingId) {
        await API.Services.update(editingId, payload);
        ALL_CATALOG = ALL_CATALOG.map(s => s.id === editingId ? { ...s, ...payload, id: editingId } : s);
        UI.toast(I18n.t('srv.updated_ok') || 'Servizio aggiornato', 'success');
      } else {
        const created = await API.Services.create(payload);
        if (created) ALL_CATALOG.unshift(created);
        UI.toast(I18n.t('srv.created_ok') || 'Servizio creato', 'success');
      }
      modalSvc?.classList.remove('open');
      populateCategoryFilter();
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
      populateCategoryFilter();
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
  document.addEventListener('DOMContentLoaded', async () => {
    await I18n.init('lang-switcher-slot');
    load();
  });

})();