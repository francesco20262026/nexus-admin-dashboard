/* admin_renewals.js — Recurring subscription renewal management */
'use strict';
(function () {
  Auth.guard('admin');
  Auth.initUI();

  let ALL = [], filtered = [];
  const saved   = window.SessionState?.load('renewals') || {};
  let pg        = saved.pg  || 1;
  let activeTab = saved.tab || 'all';
  const PER = 15;

  const $ = id => document.getElementById(id);
  const list    = $('ren-list');
  const tabBar  = $('ren-tab-bar');
  const search  = $('ren-search');
  const fPeriod = $('ren-filter-period');
  const fClient = $('ren-filter-client');
  const fService= $('ren-filter-service');
  const info    = $('ren-info');
  const pag     = $('ren-pagination');

  const act = $('page-actions');
  if (act) act.innerHTML = `<button class="btn btn-secondary" id="btn-refresh"><svg style="width:15px;height:15px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/></svg> <span>Aggiorna</span></button>`;
  $('btn-refresh')?.addEventListener('click', load);

  // Populate period select
  if (fPeriod) {
    fPeriod.innerHTML = '<option value="">Tutti i periodi</option><option value="7">Prossimi 7 gg</option><option value="30">Prossimi 30 gg</option><option value="60">Prossimi 60 gg</option><option value="90">Prossimi 90 gg</option>';
  }

  tabBar?.querySelectorAll('.filter-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));
  tabBar?.addEventListener('click', e => {
    const b = e.target.closest('.filter-tab'); if (!b) return;
    tabBar.querySelectorAll('.filter-tab').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); activeTab = b.dataset.tab; pg = 1; applyFilters();
  });
  [search, fPeriod, fClient, fService].forEach(el => {
    el?.addEventListener('input',  () => { pg=1; applyFilters(); });
    el?.addEventListener('change', () => { pg=1; applyFilters(); });
  });

  window.addEventListener('companyChanged', load);
  window._reloadRenewals = load;

  async function load() {
    if (!list) return;
    list.innerHTML = UI.skeletonCardList(5);
    try {
      const res = await API.Renewals?.list({}) || await API.get('/renewals');
      ALL = Array.isArray(res) ? res : (res?.items ?? res?.data ?? []);
      populateDynamicFilters();
    } catch (e) {
      ALL = [];
      const errMsg = 'Impossibile caricare i rinnovi. Controlla la connessione e riprova.';
      list.innerHTML = UI.errorState(errMsg, 'window._reloadRenewals()');
    }
    updateKpis();
    applyFilters();
  }

  function populateDynamicFilters() {
    const now = new Date().toISOString().split('T')[0];
    const d30 = new Date(Date.now()+30*864e5).toISOString().split('T')[0];

    ['client_name','service_name'].forEach((field, idx) => {
      const el = idx===0 ? fClient : fService;
      if (!el) return;
      const prev = el.value;
      const vals = [...new Set(ALL.map(r=>r[field]).filter(Boolean))].sort();
      const label = idx===0 ? 'Tutti i clienti' : 'Tutti i servizi';
      el.innerHTML = `<option value="">${label}</option>` + vals.map(v=>`<option value="${v}">${v}</option>`).join('');
      if (prev) el.value = prev;
    });
  }

  function updateKpis() {
    const now = new Date().toISOString().split('T')[0];
    const d30 = new Date(Date.now()+30*864e5).toISOString().split('T')[0];
    const set = (id,v,m) => { const el=$(id); if(el) el.textContent=v; const em=$(id+'-meta'); if(em&&m!==undefined) em.textContent=m; };
    set('kpi-ren-due',      ALL.filter(r => r.renewal_date >= now && r.renewal_date <= d30 && r.status !== 'invoiced').length, 'Entro 30 gg');
    set('kpi-ren-pending',  ALL.filter(r => r.status === 'pending' || r.status === 'due').length,  'In attesa');
    set('kpi-ren-invoiced', ALL.filter(r => r.status === 'invoiced').length,                         'Fattura emessa');
    set('kpi-ren-lost',     ALL.filter(r => r.status === 'lost' || r.status === 'cancelled').length, 'Non rinnovati');
  }

  function applyFilters() {
    const q   = (search?.value || '').toLowerCase().trim();
    const per = parseInt(fPeriod?.value) || 0;
    const cl  = fClient?.value  || '';
    const sv  = fService?.value || '';
    const now = new Date().toISOString().split('T')[0];

    filtered = ALL.filter(r => {
      if (activeTab === 'due_soon'  && !(r.renewal_date >= now && r.status !== 'invoiced' && r.status !== 'lost')) return false;
      if (activeTab === 'pending'   && r.status !== 'pending' && r.status !== 'due') return false;
      if (activeTab === 'invoiced'  && r.status !== 'invoiced') return false;
      if (activeTab === 'lost'      && r.status !== 'lost' && r.status !== 'cancelled') return false;
      if (st && r.status !== st) return false;
      if (cl && r.client_name !== cl) return false;
      if (sv && r.service_name !== sv) return false;
      if (per && r.renewal_date) {
        const cutoff = new Date(Date.now()+per*864e5).toISOString().split('T')[0];
        if (r.renewal_date > cutoff) return false;
      }
      if (q) {
        const hay = [r.client_name, r.service_name].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const max = Math.ceil(filtered.length / PER) || 1;
    if (pg > max) pg = max;
    window.SessionState?.save('renewals', { pg, tab: activeTab });
    render();
  }

  function render() {
    if (!list) return;
    if (!filtered.length) {
      list.innerHTML = `<div class="list-card">${UI.createEmptyState(null, ALL.length ? 'Nessun rinnovo corrisponde ai filtri.' : 'Nessun rinnovo presente.')}</div>`;
      if (info) info.textContent=''; if (pag) pag.innerHTML=''; return;
    }
    const now   = new Date().toISOString().split('T')[0];
    const slice = filtered.slice((pg-1)*PER, pg*PER);
    list.innerHTML = slice.map(r => {
      const isDue   = r.renewal_date && r.renewal_date <= new Date(Date.now()+30*864e5).toISOString().split('T')[0];
      const expired = r.renewal_date && r.renewal_date < now;
      return `<div class="list-card fade-in" data-id="${r.id}">
        <div class="list-card-header">
          <div class="list-card-title">
            <div>${r.client_name || 0}</div>
            <div style="font-size:11px;color:var(--gray-500);margin-top:2px;">${r.service_name || ''}</div>
          </div>
          ${UI.pill(r.status || 'pending')}
        </div>
        <div class="list-card-body" style="flex-wrap:wrap;">
          <div class="list-card-meta">
            <svg style="width:13px;height:13px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"/></svg>
            Rinnovo: <strong style="color:${expired?'var(--color-danger)':isDue?'var(--color-warning)':'inherit'};">${r.renewal_date ? UI.date(r.renewal_date) : 0}</strong>
          </div>
          ${r.invoice_id ? `<div class="list-card-meta" style="color:var(--color-success);"><svg style="width:13px;height:13px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg><a href="admin_invoices.html?id=${r.invoice_id}" style="color:var(--color-success);">Fattura generata</a></div>` : ''}
          <div class="row-actions" style="width:100%;justify-content:flex-end;margin-top:4px;">
            ${r.status !== 'invoiced' ? `<button class="btn btn-secondary btn-sm" onclick="genInvoice('${r.id}')">Genera fattura</button>` : ''}
            ${r.status !== 'invoiced' && r.status !== 'lost' ? `<button class="btn btn-ghost btn-sm" onclick="confirmRenewal('${r.id}')">Conferma rinnovo</button>` : ''}
            ${r.status !== 'lost' ? `<button class="btn btn-ghost btn-sm" style="color:var(--color-danger);" onclick="markLost('${r.id}')">Segna non rinnovato</button>` : ''}
            <a href="admin_client_detail.html?id=${r.client_id}" class="btn btn-ghost btn-sm">Apri cliente</a>
          </div>
        </div>
      </div>`;
    }).join('');
    const s=(pg-1)*PER+1, e=Math.min(pg*PER,filtered.length);
    if (info) info.textContent = `${s}–${e} di ${filtered.length}`;
    UI.pagination(pag, null, pg, filtered.length, PER, p => { pg=p; render(); });
  }

  window.genInvoice = async id => {
    try { const res = await API.post(`/renewals/${id}/generate-invoice`,{}); UI.toast('Fattura generata','success'); ALL=ALL.map(r=>r.id===id?{...r,status:'invoiced',invoice_id:res?.invoice_id}:r); updateKpis(); applyFilters(); }
    catch(e) { UI.toast(e?.message||'Errore','error'); }
  };
  window.confirmRenewal = async id => {
    try { await API.patch(`/renewals/${id}`,{status:'confirmed'}); ALL=ALL.map(r=>r.id===id?{...r,status:'confirmed'}:r); updateKpis(); applyFilters(); UI.toast('Rinnovo confermato','success'); }
    catch(e) { UI.toast(e?.message||'Errore','error'); }
  };
  window.markLost = async id => {
    if (!confirm('Segnare come non rinnovato?')) return;
    try { await API.patch(`/renewals/${id}`,{status:'lost'}); ALL=ALL.map(r=>r.id===id?{...r,status:'lost'}:r); updateKpis(); applyFilters(); UI.toast('Segnato come non rinnovato','info'); }
    catch(e) { UI.toast(e?.message||'Errore','error'); }
  };

  document.addEventListener('DOMContentLoaded', async () => {
    await I18n.init('lang-switcher-slot');
    load();
  });
})();