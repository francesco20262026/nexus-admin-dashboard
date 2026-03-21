/* ============================================================
   admin_dashboard.js — Dashboard operativo Nexus CRM
   Lingua: italiano per default, i18n-ready
   ============================================================ */
'use strict';

(function () {
  Auth.guard('admin');
  Auth.initUI();

  // ── DOM refs ────────────────────────────────────────────────
  const els = {
    subtitle:         document.getElementById('dash-subtitle'),
    activityList:     document.getElementById('dashboard-activity-list'),
    attentionList:    document.getElementById('attention-list'),
    clientsTbody:     document.getElementById('dash-clients-tbody'),
    invoicesTbody:    document.getElementById('dash-invoices-tbody'),
    invoicesSubtitle: document.getElementById('dash-invoices-subtitle'),
    chartTotal:       document.getElementById('chart-total'),
    chartMeta:        document.getElementById('chart-meta'),
    navBadgeInvoices: document.getElementById('nav-badge-invoices'),

    kpi: {
      clients:          document.getElementById('kpi-clients'),
      clientsMeta:      document.getElementById('kpi-clients-meta'),
      openInvoices:     document.getElementById('kpi-open-invoices'),
      openInvoicesMeta: document.getElementById('kpi-open-invoices-meta'),
      contracts:        document.getElementById('kpi-contracts'),
      contractsMeta:    document.getElementById('kpi-contracts-meta'),
      renewals:         document.getElementById('kpi-renewals'),
      renewalsMeta:     document.getElementById('kpi-renewals-meta'),
    },
  };

  // Optional DOM nodes — warn but do not crash
  [
    ['subtitle', '#dash-subtitle'], ['activityList', '#dashboard-activity-list'],
    ['attentionList', '#attention-list'], ['clientsTbody', '#dash-clients-tbody'],
    ['invoicesTbody', '#dash-invoices-tbody'], ['invoicesSubtitle', '#dash-invoices-subtitle'],
    ['chartTotal', '#chart-total'], ['chartMeta', '#chart-meta'],
    ['navBadgeInvoices', '#nav-badge-invoices'],
  ].forEach(([key, sel]) => {
    if (!els[key]) console.warn(`[admin_dashboard] Optional DOM node missing: ${sel}`);
  });

  // ── Subtitle ────────────────────────────────────────────────
  function renderSubtitle() {
    if (!els.subtitle) return;
    const now     = new Date();
    const date    = now.toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const company = localStorage.getItem('nexus_active_company') || '';
    const dateCap = date.charAt(0).toUpperCase() + date.slice(1);
    els.subtitle.textContent = company ? `${dateCap} — ${company}` : dateCap;
  }

  // ── Skeletons (render instantly before any fetch) ───────────
  function renderSkeletons() {
    const KPI_KEYS = ['clients', 'openInvoices', 'contracts', 'renewals'];
    KPI_KEYS.forEach(k => {
      if (els.kpi[k])       els.kpi[k].innerHTML       = `<div class="skeleton skeleton-kpi-value"></div>`;
      if (els.kpi[k+'Meta']) els.kpi[k+'Meta'].innerHTML = `<div class="skeleton skeleton-text short"></div>`;
    });
    if (els.chartTotal) els.chartTotal.innerHTML = `<div class="skeleton skeleton-title"></div>`;
    if (els.chartMeta)  els.chartMeta.innerHTML  = `<div class="skeleton skeleton-text short"></div>`;
    if (els.activityList) {
      const row = `<div class="activity-item"><div class="skeleton skeleton-avatar"></div><div style="flex:1"><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text short"></div></div></div>`;
      els.activityList.innerHTML = Array(4).fill(row).join('');
    }
    if (els.attentionList) {
      const row = `<div class="activity-item"><div class="skeleton skeleton-avatar" style="width:12px;height:12px;"></div><div style="flex:1"><div class="skeleton skeleton-text short" style="margin:0"></div></div></div>`;
      els.attentionList.innerHTML = Array(3).fill(row).join('');
    }
    const listHtml = `<div class="skeleton-list-card"><div class="skeleton-list-header"><div class="skeleton-title"></div><div class="skeleton-badge"></div></div><div class="skeleton-list-body"><div class="skeleton-text short"></div><div class="skeleton-text"></div></div></div>`;
    if (els.clientsTbody)  els.clientsTbody.innerHTML  = Array(3).fill(listHtml).join('');
    if (els.invoicesTbody) els.invoicesTbody.innerHTML = Array(3).fill(listHtml).join('');
  }

  // ── KPI ─────────────────────────────────────────────────────
  async function loadKpis() {
    let kpis = null;
    try {
      kpis = await API.Dashboard.kpi();
    } catch (e) {
      console.warn('[admin_dashboard] KPI load failed:', e.message);
    }

    const KPI_KEYS = ['clients', 'openInvoices', 'contracts', 'renewals'];

    if (!kpis) {
      // Error state — show 0 + "Non disponibile"
      KPI_KEYS.forEach(k => {
        if (els.kpi[k])        els.kpi[k].innerHTML     = `<span class="fade-in">0</span>`;
        if (els.kpi[k+'Meta']) els.kpi[k+'Meta'].innerHTML = `<span class="fade-in" style="color:var(--gray-400);">Non disponibile</span>`;
      });
      return;
    }

    if (els.kpi.clients) {
      const count = kpis.active_clients ?? kpis.total_clients ?? 0;
      els.kpi.clients.innerHTML = `<span class="fade-in">${count}</span>`;
      const newM = kpis.new_clients_month || 0;
      if (els.kpi.clientsMeta) {
        els.kpi.clientsMeta.innerHTML = newM
          ? `<span class="fade-in"><span style="color:var(--success-text)">+${newM}</span> ${I18n.t('dash.this_month')}</span>`
          : `<span class="fade-in">${I18n.t('dash.kpi_clients_meta')}</span>`;
      }
    }

    if (els.kpi.openInvoices) {
      const open = kpis.unpaid_invoices ?? 0;
      els.kpi.openInvoices.innerHTML = `<span class="fade-in">${open}</span>`;
      if (els.kpi.openInvoicesMeta) {
        const amount = kpis.unpaid_amount;
        els.kpi.openInvoicesMeta.innerHTML = amount != null
          ? `<span class="fade-in"><span style="color:var(--warning-text)">${UI.currency(amount)}</span> ${I18n.t('dash.outstanding')}</span>`
          : `<span class="fade-in">${I18n.t('dash.kpi_invoices_meta')}</span>`;
      }
      // Nav badge — only show if there are open invoices
      if (els.navBadgeInvoices && open > 0) {
        els.navBadgeInvoices.textContent = open;
        els.navBadgeInvoices.style.display = '';
      }
    }

    if (els.kpi.contracts) {
      els.kpi.contracts.innerHTML = `<span class="fade-in">${kpis.contracts_pending_signature ?? 0}</span>`;
      if (els.kpi.contractsMeta) els.kpi.contractsMeta.innerHTML = `<span class="fade-in">${I18n.t('dash.kpi_contracts_meta')}</span>`;
    }

    if (els.kpi.renewals) {
      els.kpi.renewals.innerHTML = `<span class="fade-in">${kpis.renewals_expiring_30d ?? 0}</span>`;
      if (els.kpi.renewalsMeta) els.kpi.renewalsMeta.innerHTML = `<span class="fade-in">${I18n.t('dash.kpi_renewals_meta')}</span>`;
    }
  }

  // ── Revenue chart ───────────────────────────────────────────
  async function loadChart() {
    let chartData = null;
    try {
      chartData = await API.Dashboard.revenueChart(6);
    } catch (e) {
      console.warn('[admin_dashboard] Chart load failed:', e.message);
    }

    if (chartData && chartData.length && window.renderBarChart) {
      const totalRev = chartData.reduce((acc, d) => acc + (d.amount || 0), 0);
      if (els.chartTotal) els.chartTotal.innerHTML = `<span class="fade-in">${UI.currency(totalRev)}</span>`;
      if (els.chartMeta)  els.chartMeta.innerHTML  = `<span class="fade-in">${I18n.t('dash.chart_last6')}</span>`;
      window.renderBarChart('revenue-chart', chartData.map(d => ({
        label: d.month_label,
        value: d.amount,
        secondary: d.secondary || false,
      })));
    } else {
      if (els.chartTotal) els.chartTotal.innerHTML = `<span class="fade-in">0</span>`;
      if (els.chartMeta)  els.chartMeta.innerHTML  = `<span class="fade-in">${I18n.t('dash.chart_no_data')}</span>`;
    }
  }

  // ── Activity ────────────────────────────────────────────────
  async function loadActivity() {
    if (!els.activityList) return;
    let activities = [];
    try {
      activities = await API.Dashboard.activity(8);
    } catch (e) {
      console.warn('[admin_dashboard] Activity load failed:', e.message);
    }

    if (!activities || !activities.length) {
      els.activityList.innerHTML = `<div class="activity-item fade-in"><div class="activity-content"><div class="activity-text" style="color:var(--gray-400);">${I18n.t('common.no_data')}</div></div></div>`;
      return;
    }
    els.activityList.innerHTML = activities.map(renderActivityItem).join('');
  }

  function renderActivityItem(act) {
    const colorMap = { contract: 'blue', invoice: 'green', client: 'brand', document: 'amber', renewal: 'red' };
    const dotColor = colorMap[act.type] || 'amber';
    let clickAttr = '';
    if (act.type === 'invoice'  && act.entity_id) clickAttr = `onclick="location.href='admin_invoices.html?highlight=${act.entity_id}'" style="cursor:pointer;"`;
    if (act.type === 'client'   && act.entity_id) clickAttr = `onclick="location.href='admin_client_detail.html?id=${act.entity_id}'" style="cursor:pointer;"`;
    if (act.type === 'contract' && act.entity_id) clickAttr = `onclick="location.href='admin_contracts.html?highlight=${act.entity_id}'" style="cursor:pointer;"`;
    return `
      <div class="activity-item fade-in" ${clickAttr}>
        <div class="activity-dot ${dotColor}"></div>
        <div class="activity-content">
          <div class="activity-text">${act.description || I18n.t('common.no_data')}</div>
          <div class="activity-time">${act.time_ago || ''}</div>
        </div>
      </div>`;
  }

  // ── Attention — parallel fetch, not sequential awaits ───────
  async function loadAttention() {
    if (!els.attentionList) return;

    const [overdueRes, pendingRes, renewRes] = await Promise.allSettled([
      API.Invoices.list({ status: 'overdue', limit: 3 }),
      API.Contracts.list({ status: 'sent', limit: 3 }),
      API.Renewals.list({ expiring_days: 15, limit: 3 }),
    ]);

    const items = [];

    if (overdueRes.status === 'fulfilled') {
      const overdue = overdueRes.value?.items || overdueRes.value?.data || [];
      overdue.forEach(inv => items.push({
        color: 'red',
        text:  `${I18n.t('dash.overdue_invoice')} <strong>${inv.invoice_number}</strong> — ${UI.currency(inv.total_amount || 0, inv.currency)}`,
        href:  `admin_invoices.html?highlight=${inv.id}`,
      }));
    }

    if (pendingRes.status === 'fulfilled') {
      const pending = pendingRes.value?.items || pendingRes.value?.data || [];
      pending.forEach(c => items.push({
        color: 'blue',
        text:  `${I18n.t('dash.contract_waiting_sign')} — ${c.client_name || c.title || c.id}`,
        href:  `admin_contracts.html?highlight=${c.id}`,
      }));
    }

    if (renewRes.status === 'fulfilled') {
      const ren = renewRes.value?.items || renewRes.value?.data || [];
      ren.forEach(r => items.push({
        color: 'amber',
        text:  `${I18n.t('dash.renewal_expiring')} <strong>${r.client_name || r.service_name || ''}</strong> — ${UI.date(r.renewal_date)}`,
        href:  `admin_renewals.html`,
      }));
    }

    if (!items.length) {
      els.attentionList.innerHTML = `<div class="activity-item fade-in"><div class="activity-content"><div class="activity-text" style="color:var(--gray-400);">${I18n.t('dash.nothing_urgent')}</div></div></div>`;
      return;
    }

    els.attentionList.innerHTML = items.map(it => `
      <div class="activity-item fade-in" onclick="location.href='${it.href}'" style="cursor:pointer;">
        <div class="activity-dot ${it.color}"></div>
        <div class="activity-content">
          <div class="activity-text">${it.text}</div>
        </div>
      </div>`).join('');
  }

  // ── Clienti recenti ─────────────────────────────────────────
  window._retryDashClients = loadClients;
  async function loadClients() {
    if (!els.clientsTbody) return;
    try {
      const res     = await API.Clients.list({ limit: 5 });
      const clients = res?.items || res?.data || [];
      if (!clients.length) {
        els.clientsTbody.innerHTML = `<div class="list-card"><div class="empty-state" style="padding:40px;text-align:center;color:var(--gray-500);">${I18n.t('common.no_data')}</div></div>`;
        return;
      }
      els.clientsTbody.innerHTML = clients.map(c => {
        const pillHtml  = UI.pill(c.status || 'inactive');
        const dateSince = UI.date(c.created_at);
        return `<div class="list-card fade-in">
          <div class="list-card-header">
            <div class="list-card-title">
              <div class="td-avatar" onclick="location.href='admin_client_detail.html?id=${c.id}'" style="cursor:pointer;display:flex;align-items:center;gap:8px;">
                ${UI.avatar(c.name, c.id)}
                <div class="td-main hover-link" style="color:var(--brand-600);font-weight:600;">${c.name}</div>
              </div>
            </div>
            ${pillHtml}
          </div>
          <div class="list-card-body">
            <div class="list-card-meta" title="Email" style="width:100%;">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"/></svg>
              ${c.email || I18n.t('common.no_data')}
            </div>
            <div class="list-card-meta" title="Settore">
              <span data-col="sector" style="font-weight:500;">${c.sector || ''}</span>
            </div>
            <div class="list-card-meta" title="Servizi/Valore">
              Servizi: <span style="font-weight:600;color:var(--gray-900);">${c.services_count ?? 0}</span> —
              Valore: <span style="font-weight:600;color:var(--gray-900);">${UI.currency(c.monthly_value || 0, c.currency)}</span>
            </div>
            <div style="flex-grow:1;"></div>
            <div class="row-actions">
              <button class="btn btn-ghost btn-sm btn-icon" title="Vedi dettaglio" onclick="location.href='admin_client_detail.html?id=${c.id}'">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="14" height="14"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"/></svg>
              </button>
            </div>
          </div>
        </div>`;
      }).join('');
    } catch (e) {
      console.error('[admin_dashboard] loadClients error:', e);
      if (els.clientsTbody) els.clientsTbody.innerHTML = UI.errorState(e.message, 'window._retryDashClients()');
    }
  }

  // ── Fatture aperte ──────────────────────────────────────────
  window._retryDashInvoices = loadInvoices;
  async function loadInvoices() {
    if (!els.invoicesTbody) return;
    try {
      const res      = await API.Invoices.list({ status: 'unpaid', limit: 5 });
      const invoices = res?.items || res?.data || [];
      if (els.invoicesSubtitle) {
        els.invoicesSubtitle.textContent = invoices.length
          ? `${invoices.length} ${I18n.t('dash.open_invoices_count')}`
          : I18n.t('dash.no_open_invoices');
      }
      if (!invoices.length) {
        els.invoicesTbody.innerHTML = `<div class="list-card"><div class="empty-state" style="padding:40px;text-align:center;color:var(--gray-500);">${I18n.t('dash.no_open_invoices')}</div></div>`;
        return;
      }
      els.invoicesTbody.innerHTML = invoices.map(inv => {
        const pillHtml       = UI.pill(inv.status || 'pending');
        const isOverdue      = inv.status === 'overdue';
        const amountFormatted = UI.currency(inv.total_amount || 0, inv.currency);
        const dueDateFormatted = UI.date(inv.due_date);
        const progressPct    = inv.paid_amount && inv.total_amount
          ? Math.round((inv.paid_amount / inv.total_amount) * 100) : 0;
        const progressHtml  = progressPct > 0
          ? `<div style="background:var(--gray-100);border-radius:4px;height:4px;"><div style="background:var(--success-500);width:${progressPct}%;height:4px;border-radius:4px;"></div></div>`
          : '';
        return `<div class="list-card fade-in">
          <div class="list-card-header">
            <div class="list-card-title">Fattura ${inv.invoice_number}</div>
            ${pillHtml}
          </div>
          <div class="list-card-body">
            <div class="list-card-meta" title="Cliente" style="width:100%;">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"/></svg>
              <a href="admin_client_detail.html?id=${inv.client_id}" class="hover-link" style="color:var(--brand-600);font-weight:500;">${inv.client_name || I18n.t('common.no_data')}</a>
            </div>
            <div class="list-card-meta" title="Importo">
              <span style="font-weight:600;color:${isOverdue ? 'var(--error-text)' : 'var(--gray-900)'};">${amountFormatted}</span>
            </div>
            <div class="list-card-meta" title="Scadenza">
              ${dueDateFormatted}
            </div>
            ${progressHtml ? `<div style="flex-grow:1;width:100%;margin-top:8px;">${progressHtml}</div>` : ''}
            <div class="row-actions" style="width:100%;justify-content:flex-end;">
              <button class="btn btn-secondary btn-sm" onclick="location.href='admin_invoices.html?highlight=${inv.id}'">${I18n.t('dash.view_invoice') || 'Vedi'}</button>
            </div>
          </div>
        </div>`;
      }).join('');
    } catch (e) {
      console.error('[admin_dashboard] loadInvoices error:', e);
      if (els.invoicesTbody) els.invoicesTbody.innerHTML = UI.errorState(e.message, 'window._retryDashInvoices()');
    }
  }

  // ── Segna come pagata ───────────────────────────────────────
  window.markPaid = async (id) => {
    try {
      await API.Invoices.markPaid(id);
      window.showToast?.(I18n.t('dash.invoice_paid_ok'), 'success');
      loadInvoices();
      loadKpis();
    } catch (e) {
      console.error('[admin_dashboard] markPaid error:', e);
      window.showToast?.(I18n.t('error.generic'), 'error');
    }
  };

  // ── Dashboard init ──────────────────────────────────────────
  // Rule: render skeleton FIRST (synchronous), then fetch in parallel.
  // This guarantees the page never looks blank or stuck in loading.
  function loadDashboard() {
    renderSubtitle();
    renderSkeletons();

    // All fetches fire in parallel — no sequential blocking
    loadKpis();
    loadChart();
    loadActivity();
    loadAttention();
    loadClients();
    loadInvoices();
  }

  // Company switch — canonical event name
  window.addEventListener('companyChanged', () => {
    renderSubtitle();
    loadDashboard();
  });

  document.addEventListener('DOMContentLoaded', async () => {
    await I18n.init('lang-switcher-slot');
    loadDashboard();
  });

})();
