/* admin_reports.js — Analytics and export */
'use strict';
(function () {
  Auth.guard('admin');
  Auth.initUI();

  const $ = id => document.getElementById(id);

  // Inject page export controls
  const act = $('page-actions');
  if (act) act.innerHTML = `
    <select id="rep-period" class="form-input" style="min-width:150px;">
      <option value="month">Questo mese</option>
      <option value="quarter">Trimestre</option>
      <option value="year">Quest'anno</option>
    </select>
    <button class="btn btn-secondary" id="btn-export-csv">Esporta CSV</button>
    <button class="btn btn-secondary" id="btn-refresh"><svg style="width:15px;height:15px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/></svg> <span>Aggiorna</span></button>`;

  $('btn-refresh')?.addEventListener('click',  load);
  $('rep-period')?.addEventListener('change',  load);
  $('btn-export-csv')?.addEventListener('click', exportCsv);

  window.addEventListener('companyChanged', load);
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
      set('kpi-rep-revenue', data.total_revenue ? UI.currency(data.total_revenue) : 0,     'Periodo selezionato');
      set('kpi-rep-paid',    data.paid_invoices  ?? 0,                                      'Fatture incassate');
      set('kpi-rep-clients', data.active_clients ?? 0,                                      'Clienti attivi');
      set('kpi-rep-renewals',data.confirmed_renewals ?? 0,                                  'Nel periodo');

      // Show chart placeholders with counts if data is empty
      const noData = `<div style="text-align:center;padding:24px;color:var(--gray-400);font-size:13px;">Dati insufficienti per il periodo selezionato</div>`;
      ['chart-revenue','chart-invoices','chart-clients','chart-renewals'].forEach(cid => {
        const el = $(cid); if (el) el.innerHTML = noData;
      });
    } catch (e) {
      console.warn('[admin_reports] load error:', e);
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

  document.addEventListener('DOMContentLoaded', async () => {
    await I18n.init('lang-switcher-slot');
    load();
  });
})();
