/* admin_reports.js Analytics and export */
'use strict';
(function () {
  Auth.guard('admin');
  Auth.initUI();

  const $ = id => document.getElementById(id);

  // Inject page export controls
  const act = $('page-actions');
  if (act) act.innerHTML = `
    <button class="btn btn-secondary" id="btn-refresh"><svg style="width:15px;height:15px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/></svg> <span>Aggiorna</span></button>
    <button class="btn btn-primary" id="btn-export-csv">Esporta CSV</button>`;

  $('btn-refresh')?.addEventListener('click',  load);
  $('rep-period')?.addEventListener('change',  load);
  $('btn-export-csv')?.addEventListener('click', exportCsv);

  if (window._reportsCmpListener) window.removeEventListener('companyChanged', window._reportsCmpListener);
  window._reportsCmpListener = () => load();
  window.addEventListener('companyChanged', window._reportsCmpListener);
  window._reloadReports = load;

  async function load() {
    const period = $('rep-period')?.value || 'month';
    // Zero out KPIs with skeleton while loading
    ['kpi-rep-revenue','kpi-rep-paid','kpi-rep-clients','kpi-rep-renewals'].forEach(id => {
      const el = $(id); if (el) el.innerHTML = '<div class="skeleton-text skeleton" style="width:60px;height:36px;"></div>';
    });
    try {
      const res = await API.get(`/reports/summary?period=${period}`).catch(()=>null);
      const data = res || {};
      const set = (id, v, m) => {
        const el=$(id); if(el) el.textContent = v ?? 0;
        const em=$(id+'-meta'); if(em&&m!==undefined) em.textContent=m;
      };
      set('kpi-rep-revenue', data.total_revenue ? UI.currency(data.total_revenue) : UI.currency(0),     'Ricavi generati');
      set('kpi-rep-paid',    data.paid_invoices  ?? 0,                                      'Fatture pagate');
      set('kpi-rep-clients', data.active_clients ?? 0,                                      'Utenti attivi');
      set('kpi-rep-renewals',data.confirmed_renewals ?? 0,                                  'Nel periodo');

      renderCharts(data);
    } catch (e) {
      console.warn('[admin_reports] load error:', e);
    }
  }

  // Chart instances
  let cRev=null, cInv=null, cCli=null, cRen=null;

  function createCanvas(containerId) {
    const el = document.getElementById(containerId);
    if(!el) return null;
    el.innerHTML = '<canvas style="width:100%;height:100%;"></canvas>';
    return el.querySelector('canvas');
  }

  function renderCharts(data) {
    // Destroy existing charts
    if(cRev) cRev.destroy();
    if(cInv) cInv.destroy();
    if(cCli) cCli.destroy();
    if(cRen) cRen.destroy();
    
    Chart.defaults.font.family = 'Inter, sans-serif';
    Chart.defaults.color = '#6b7280';

    // 1. Revenue Chart
    const revCanvas = createCanvas('chart-revenue');
    if(revCanvas && data.chart_revenue) {
      cRev = new Chart(revCanvas, {
        type: 'bar',
        data: {
          labels: data.chart_revenue.labels || [],
          datasets: [
            { label: 'Incassi', data: data.chart_revenue.outbound || [], backgroundColor: '#10b981', borderRadius: 4 },
            { label: 'Costi', data: data.chart_revenue.inbound || [], backgroundColor: '#ef4444', borderRadius: 4 }
          ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
      });
    }

    // 2. Invoices Chart
    const invCanvas = createCanvas('chart-invoices');
    if(invCanvas && data.chart_invoices) {
      cInv = new Chart(invCanvas, {
        type: 'doughnut',
        data: {
          labels: data.chart_invoices.labels || [],
          datasets: [{ data: data.chart_invoices.data || [], backgroundColor: ['#9ca3af', '#3b82f6', '#10b981', '#ef4444'], borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'right' } } }
      });
    }

    // 3. Clients Chart
    const cliCanvas = createCanvas('chart-clients');
    if(cliCanvas && data.chart_clients) {
      cCli = new Chart(cliCanvas, {
        type: 'line',
        data: {
          labels: data.chart_clients.labels || [],
          datasets: [{ label: 'Clienti', data: data.chart_clients.data || [], borderColor: '#6366f1', backgroundColor: 'rgba(99, 102, 241, 0.1)', fill: true, tension: 0.4 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display:false } }, scales: { y: { beginAtZero:true, ticks:{stepSize:1} } } }
      });
    }

    // 4. Renewals Chart
    const renCanvas = createCanvas('chart-renewals');
    if(renCanvas && data.chart_renewals) {
      cRen = new Chart(renCanvas, {
        type: 'pie',
        data: {
          labels: data.chart_renewals.labels || [],
          datasets: [{ data: data.chart_renewals.data || [], backgroundColor: ['#f59e0b', '#e5e7eb'], borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
      });
    }
  }

  async function exportCsv() {
    const period = $('rep-period')?.value || 'month';
    try {
      const res = await API.get(`/reports/export?period=${period}&format=csv`).catch(()=>null);
      if (res?.url) {
        window.open(res.url,'_blank');
      } else {
        UI.toast('Export non ancora disponibile per questo periodo','info');
      }
    } catch(e) { UI.toast(e?.message||'Errore export','error'); }
  }

  window.onPageReady(async () => {
    await I18n.init('lang-switcher-slot');
    load();
  });
})();
