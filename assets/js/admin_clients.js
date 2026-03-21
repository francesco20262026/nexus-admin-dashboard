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

  const saved = window.SessionState?.load('clients') || {};
  let currentPage = saved.currentPage || 1;
  let activeTab   = saved.activeTab   || 'all';
  const PER_PAGE  = 15;

  /* ── DOM refs ──────────────────────────────────────────────── */
  const $ = id => document.getElementById(id);
  const list         = $('cl-list');
  const searchEl     = $('cl-search');
  const infoEl       = $('cl-info');
  const paginationEl = $('cl-pagination');
  const filterSector = $('cl-filter-sector');
  const filterCity   = $('cl-filter-city');
  const tabBar       = $('cl-tab-bar');
  const btnRefresh   = $('btn-refresh-clients');
  const btnAdd       = $('btn-add-client');
  const modal        = $('modal-add-client');

  /* ── Restore saved state ────────────────────────────────────── */
  if (searchEl && saved.search) searchEl.value = saved.search;
  tabBar?.querySelectorAll('.filter-tab').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.tab === activeTab)
  );

  function saveState() {
    window.SessionState?.save('clients', {
      activeTab, currentPage,
      search: searchEl?.value || '',
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

  /* ── Filter changes ─────────────────────────────────────────── */
  searchEl?.addEventListener('input',   () => { currentPage = 1; applyFilters(); });

  filterSector?.addEventListener('change', () => { currentPage = 1; applyFilters(); });
  filterCity?.addEventListener('change',   () => { currentPage = 1; applyFilters(); });

  /* ── Refresh ────────────────────────────────────────────────── */
  btnRefresh?.addEventListener('click', () => load(true));
  window.addEventListener('companyChanged', () => load(true));

  /* ── Add client button ──────────────────────────────────────── */
  btnAdd?.addEventListener('click', () => modal?.classList.add('open'));

  /* ── Load ───────────────────────────────────────────────────── */
  window._reloadClients = () => load(true);

  async function load(force = false) {
    if (!list) return;
    list.innerHTML = UI.skeletonCardList(5);

    try {
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

  /* ── KPI cards ──────────────────────────────────────────────── */
  function updateKpis() {
    const now   = new Date();
    const month = now.getMonth();
    const year  = now.getFullYear();

    const active   = ALL.filter(c => c.status === 'active').length;
    const inactive = ALL.filter(c => ['inactive','suspended'].includes(c.status)).length;
    const newMonth = ALL.filter(c => {
      const d = c.created_at ? new Date(c.created_at) : null;
      return d && d.getMonth() === month && d.getFullYear() === year;
    }).length;

    const set = (id, val, meta) => {
      const el = $(id); if (el) el.textContent = val;
      const em = $(id + '-meta'); if (em && meta !== undefined) em.textContent = meta;
    };
    set('kpi-cl-total',     ALL.length, I18n.t('cl.kpi_total_meta')    || 'Clienti registrati');
    set('kpi-cl-active',    active,     I18n.t('cl.kpi_active_meta')   || 'Con servizi attivi');
    set('kpi-cl-inactive',  inactive,   I18n.t('cl.kpi_inactive_meta') || 'Sospesi o inattivi');
    set('kpi-cl-new-month', newMonth,   I18n.t('cl.kpi_new_month_meta')|| 'Nel mese corrente');
  }

  /* ── Populate sector + city filters from data ───────────────── */
  function populateDynamicFilters() {
    const prevSector = filterSector?.value;
    const prevCity   = filterCity?.value;

    const sectors = [...new Set(ALL.map(c => c.sector).filter(Boolean))].sort();
    if (filterSector) {
      filterSector.innerHTML = `<option value="">${I18n.t('cl.all_sectors') || 'Tutti i settori'}</option>` +
        sectors.map(s => `<option value="${s}">${s}</option>`).join('');
      if (prevSector) filterSector.value = prevSector;
    }

    const cities = [...new Set(ALL.map(c => c.city).filter(Boolean))].sort();
    if (filterCity) {
      filterCity.innerHTML = `<option value="">${I18n.t('cl.all_cities') || 'Tutte le città'}</option>` +
        cities.map(c => `<option value="${c}">${c}</option>`).join('');
      if (prevCity) filterCity.value = prevCity;
    }
  }

  /* ── Apply filters ──────────────────────────────────────────── */
  function applyFilters() {
    const text   = (searchEl?.value || '').toLowerCase().trim();
    const sector = filterSector?.value || '';
    const city   = filterCity?.value   || '';

    filtered = ALL.filter(c => {
      // Status filter: driven exclusively by the active tab pill
      if (activeTab !== 'all' && c.status !== activeTab) return false;
      if (sector && c.sector !== sector) return false;
      if (city   && c.city   !== city)   return false;
      if (text) {
        const hay = [c.name, c.email, c.city, c.sector, c.referente, c.contact_name]
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

  /* ── Render single row ──────────────────────────────────────── */
  function renderRow(c) {
    const initials = (c.name || '?').slice(0, 2).toUpperCase();
    const hue      = Math.abs(((c.id || '').charCodeAt(0) || 0) * 53) % 360;

    const referente   = c.referente || c.contact_name || '';
    const email       = c.email     || '';
    const phoneVal    = c.phone     || '';
    const city        = c.city      || '';
    const sector      = c.sector    || '';
    const lastAct     = c.last_activity_at || c.updated_at || '';
    const servicesCount = c.active_services_count ?? c.services_count ?? '';

    return `
    <div class="list-card fade-in" style="cursor:pointer;" onclick="location.href='admin_client_detail.html?id=${c.id}'">
      <div class="list-card-header" style="gap:8px;">
        <div class="list-card-title" style="display:flex;align-items:center;gap:8px;">
          <div class="avatar" style="background:hsl(${hue},48%,52%);width:28px;height:28px;font-size:10px;flex-shrink:0;">${initials}</div>
          <div>
            <div>${c.name || 0}</div>
            ${referente ? `<div style="font-size:12px;color:var(--gray-500);font-weight:400;">${referente}</div>` : ''}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
          ${servicesCount !== '' ? `<span style="font-size:11px;background:var(--brand-50);color:var(--brand-700);padding:2px 8px;border-radius:20px;font-weight:600;">${servicesCount} ${I18n.t('cl.services') || 'servizi'}</span>` : ''}
          ${UI.pill(c.status)}
        </div>
      </div>
      <div class="list-card-body" style="gap:12px;flex-wrap:wrap;">
        ${email ? `<div class="list-card-meta" title="Email">
          <svg style="width:13px;height:13px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"/></svg>
          <span>${email}</span>
        </div>` : ''}
        ${phoneVal ? `<div class="list-card-meta" title="Telefono">
          <svg style="width:13px;height:13px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-2.896-1.596-5.25-3.95-6.847-6.847l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25z"/></svg>
          <span>${phoneVal}</span>
        </div>` : ''}
        ${city ? `<div class="list-card-meta" title="Città">
          <svg style="width:13px;height:13px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"/></svg>
          <span>${city}${sector ? ` · ${sector}` : ''}</span>
        </div>` : (sector ? `<span style="font-size:12px;color:var(--gray-500);">${sector}</span>` : '')}
        ${lastAct ? `<div class="list-card-meta" title="${I18n.t('cl.last_activity') || 'Ultima attività'}">
          <svg style="width:13px;height:13px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
          <span>${UI.date(lastAct)}</span>
        </div>` : ''}
        <div class="row-actions" style="width:100%;justify-content:flex-end;margin-top:4px;" onclick="event.stopPropagation()">
          <a class="btn btn-ghost btn-sm" href="admin_client_detail.html?id=${c.id}" title="${I18n.t('cl.action_detail') || 'Apri scheda'}">
            <svg style="width:13px;height:13px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/></svg>
            <span>${I18n.t('cl.action_detail') || 'Apri scheda'}</span>
          </a>
          <a class="btn btn-secondary btn-sm" href="admin_client_detail.html?id=${c.id}&tab=invoices">
            <span>${I18n.t('nav.invoices') || 'Fatture'}</span>
          </a>
          <button class="btn btn-ghost btn-sm" style="color:var(--color-danger);" onclick="deleteClient('${c.id}')" title="${I18n.t('common.delete') || 'Elimina'}">
            <svg style="width:13px;height:13px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/></svg>
          </button>
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
    const name  = get('f-name');
    const email = get('f-email');
    if (!name || !email) {
      UI.toast(I18n.t('cl.form_required') || 'Nome e email sono obbligatori', 'warning');
      return;
    }
    btnSave.disabled = true;
    try {
      const created = await API.Clients.create({
        name, email,
        phone:       get('f-phone')   || null,
        city:        get('f-city')    || null,
        address:     get('f-address') || null,
        vat_number:  get('f-vat')     || null,
        dest_code:   get('f-sdi')     || null,
        pec:         get('f-pec')     || null,
        sector:      get('f-sector')  || null,
        referente:   get('f-referente') || null,
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
      UI.toast(e?.message || I18n.t('error.generic'), 'error');
    } finally {
      btnSave.disabled = false;
    }
  });

  /* ── Init ───────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', async () => {
    await I18n.init('lang-switcher-slot');
    load();
  });

})();
