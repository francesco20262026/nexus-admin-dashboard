/* admin_renewals.js Recurring subscription renewal management */
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
  const tabBar  = $('ren-pipeline-bar');
  const search  = $('ren-search');
  const fPeriod = $('ren-filter-period');
  const fClient = $('ren-filter-client');
  const fService= $('ren-filter-service');
  const info    = $('ren-info');
  const pag     = $('ren-pagination');

  const act = $('page-actions');
  if (act) act.innerHTML = `<button class="btn btn-secondary" id="btn-refresh"><svg style="width:15px;height:15px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/></svg> <span>Aggiorna</span></button>`;
  $('btn-refresh')?.addEventListener('click', function() { if(window.UI) UI.toast('Aggiornamento in corso...', 'info'); load(true); });

  // Populate period select
  if (fPeriod) {
    fPeriod.innerHTML = '<option value="">Tutti i periodi</option><option value="7">Prossimi 7 gg</option><option value="30">Prossimi 30 gg</option><option value="60">Prossimi 60 gg</option><option value="90">Prossimi 90 gg</option>';
  }

  tabBar?.querySelectorAll('.cl-status-pill').forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));
  tabBar?.addEventListener('click', e => {
    const b = e.target.closest('.cl-status-pill'); if (!b) return;
    tabBar.querySelectorAll('.cl-status-pill').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); activeTab = b.dataset.tab; pg = 1; applyFilters();
  });
  [search, fPeriod, fClient, fService].forEach(el => {
    el?.addEventListener('input',  debounce(() => { pg=1; applyFilters(); }, 200));
    el?.addEventListener('change', () => { pg=1; applyFilters(); });
  });

  if (window._renewalsCmpListener) window.removeEventListener('companyChanged', window._renewalsCmpListener);
  window._renewalsCmpListener = () => load();
  window.addEventListener('companyChanged', window._renewalsCmpListener);
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
    filtered.slice((pg-1)*PER, pg*PER).forEach(i => {
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
      const currentPageIds = filtered.slice((pg-1)*PER, pg*PER).map(i => i.id);
      const allSelected = currentPageIds.length > 0 && currentPageIds.every(id => window.selectedIds.has(id));
      if (allSelected) selectAllBtn.classList.add('selected');
      else selectAllBtn.classList.remove('selected');
    }
  };
  
  window.massDelete = async function() {
    if (window.selectedIds.size === 0) return;
    if (!await UI.confirm(`Sei sicuro di voler eliminare ${window.selectedIds.size} rinnovi selezionati?`)) return;
    
    let success = 0;
    try {
      UI.toast(`Eliminazione in corso...`, 'info');
      for (const id of window.selectedIds) {
        try {
          await API.del(`/renewals/${id}`);
          success++;
          ALL = ALL.filter(r => r.id !== id);
        } catch (err) {
          console.error(`Error deleting renewal ${id}:`, err);
        }
      }
      if (success > 0) {
        UI.toast(`${success} rinnovi eliminati.`, 'success');
        updateKpis();
        applyFilters();
      } else {
        UI.toast("Errore durante l\'eliminazione. Riprova.", 'error');
      }
    } catch (e) {
      UI.toast("Errore durante l\'eliminazione multipla.", 'error');
    }
  };

  window.massConfirm = async function() {
    if (window.selectedIds.size === 0) return;
    let success = 0;
    try {
      UI.toast(`Conferma in corso...`, 'info');
      for (const id of window.selectedIds) {
        try {
          const ren = ALL.find(r => r.id === id);
          if (ren && ren.status !== 'invoiced' && ren.status !== 'lost') {
            await API.Renewals.update(id, {status:'confirmed'});
            ren.status = 'confirmed';
            success++;
          }
        } catch (err) {}
      }
      if (success > 0) {
        UI.toast(`${success} rinnovi confermati.`, 'success');
        updateKpis();
        applyFilters();
        window.clearSelection();
      }
    } catch (e) { UI.toast('Errore azione multipla.', 'error'); }
  };

  window.massGenInvoice = async function() {
    if (window.selectedIds.size === 0) return;
    let success = 0;
    try {
      UI.toast(`Generazione fatture in corso...`, 'info');
      for (const id of window.selectedIds) {
        try {
          const ren = ALL.find(r => r.id === id);
          if (ren && ren.status !== 'invoiced') {
            const res = await API.post(`/renewals/${id}/generate-invoice`,{});
            ren.status = 'invoiced';
            if(res?.invoice_id) ren.invoice_id = res.invoice_id;
            success++;
          }
        } catch (err) {}
      }
      if (success > 0) {
        UI.toast(`${success} fatture generate.`, 'success');
        updateKpis();
        applyFilters();
        window.clearSelection();
      }
    } catch (e) { UI.toast('Errore azione multipla.', 'error'); }
  };

  function render() {
    if (!list) return;
    if (!filtered.length) {
      list.innerHTML = `<div class="list-card">${UI.createEmptyState(null, ALL.length ? 'Nessun rinnovo corrisponde ai filtri.' : 'Nessun rinnovo presente.')}</div>`;
      if (info) info.textContent=''; if (pag) pag.innerHTML=''; return;
    }
    const now   = new Date().toISOString().split('T')[0];
    const slice = filtered.slice((pg-1)*PER, pg*PER);
    list.innerHTML = slice.map(r => {
      const isSelected = window.selectedIds.has(r.id);
      const isDue   = r.renewal_date && r.renewal_date <= new Date(Date.now()+30*864e5).toISOString().split('T')[0];
      const expired = r.renewal_date && r.renewal_date < now;
      return `<div class="cl-row fade-in ${isSelected ? 'selected' : ''}" data-id="${r.id}" style="display:grid; grid-template-columns: 2.5fr 1.5fr 1fr 180px; align-items:center; gap:16px; padding:16px 24px; border-bottom:1px solid var(--border); transition:all 0.15s; cursor:pointer;" onclick="document.querySelector('.mac-select-btn', this)?.click()">
        <!-- Colonna 1: Cliente e Servizio -->
        <div class="cl-col cl-col-1">
          <div class="cl-row-identity">
            <div class="mac-select-btn ${isSelected ? 'selected' : ''}" data-id="${r.id}" onclick="window.toggleSelection(event, '${r.id}')" style="flex-shrink:0;">
              <div class="mac-checkbox"></div>
            </div>
          <div class="cl-row-identity-body" style="min-width:0;">
            <div class="cl-row-name" style="font-size:14px; font-weight:600; color:var(--gray-900); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              ${r.client_name || ''}
            </div>
            <div class="cl-row-meta" style="font-size:12px; color:var(--gray-500); margin-top:4px;">
              📦 ${r.service_name || 'Servizio sconosciuto'}
            </div>
          </div>
        </div>

        </div>
        <!-- Colonna 2: Rinnovo -->
        <div class="cl-col" style="min-width:0;">
          <div style="font-size:12px; color:var(--gray-600);">
            Data rinnovo: <strong style="color:${expired?'var(--color-danger)':isDue?'var(--color-warning)':'inherit'};">${r.renewal_date ? UI.date(r.renewal_date) : ''}</strong>
          </div>
          ${r.invoice_id ? `<div style="font-size:12px; color:var(--color-success); margin-top:2px; font-weight:600;"><a href="admin_invoices.html?highlight=${r.invoice_id}" style="color:var(--color-success); text-decoration:none;" onclick="event.stopPropagation()">✓ Fattura emessa</a></div>` : ''}
        </div>

        <!-- Colonna 3: Stato -->
        <div class="cl-col" style="min-width:0;">
          <div style="margin-bottom:4px;">${UI.pill(r.status || 'pending')}</div>
        </div>

        <!-- Colonna 4: Azioni -->
        <div class="cl-col cl-col-actions" style="display:flex; flex-direction:row; align-items:center; gap:8px; justify-content:flex-end;">
          ${r.status !== 'invoiced' ? `<button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); genInvoice('${r.id}')">Genera fattura</button>` : ''}
          ${r.status !== 'invoiced' && r.status !== 'lost' ? `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); confirmRenewal('${r.id}')" title="Conferma rinnovo"><svg fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M4.5 12.75l6 6 9-13.5" stroke-linecap="round" stroke-linejoin="round"></path></svg></button>` : ''}
          ${r.status !== 'lost' ? `<button class="btn btn-ghost btn-sm" style="color:var(--color-danger);" onclick="event.stopPropagation(); markLost('${r.id}')" title="Non rinnovato"><svg fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"></path></svg></button>` : ''}
          <a href="admin_client_detail.html?id=${r.client_id}" class="btn btn-secondary btn-sm" title="Apri cliente" onclick="event.stopPropagation()"><svg fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" stroke-linecap="round" stroke-linejoin="round"></path><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" stroke-linecap="round" stroke-linejoin="round"></path></svg></a>
        </div>
      </div>`;
    }).join('');
    const s=(pg-1)*PER+1, e=Math.min(pg*PER,filtered.length);
    if (info) info.textContent = `${s}–${e} di ${filtered.length}`;
    UI.pagination(pag, null, pg, filtered.length, PER, p => { pg=p; render(); window.updateSelectionUI(); });
    setTimeout(() => { if(window.updateSelectionUI) window.updateSelectionUI(); }, 10);
  }

  window.genInvoice = async id => {
    try { const res = await API.post(`/renewals/${id}/generate-invoice`,{}); UI.toast('Fattura generata','success'); ALL=ALL.map(r=>r.id===id?{...r,status:'invoiced',invoice_id:res?.invoice_id}:r); updateKpis(); applyFilters(); }
    catch(e) { UI.toast(e?.message||'Errore','error'); }
  };
  window.confirmRenewal = async id => {
    try { await API.Renewals.update(id, {status:'confirmed'}); ALL=ALL.map(r=>r.id===id?{...r,status:'confirmed'}:r); updateKpis(); applyFilters(); UI.toast('Rinnovo confermato','success'); }
    catch(e) { UI.toast(e?.message||'Errore','error'); }
  };
  window.markLost = async id => {
    if (!await UI.confirm('Segnare come non rinnovato?')) return;
    try { await API.Renewals.update(id, {status:'lost'}); ALL=ALL.map(r=>r.id===id?{...r,status:'lost'}:r); updateKpis(); applyFilters(); UI.toast('Segnato come non rinnovato','info'); }
    catch(e) { UI.toast(e?.message||'Errore','error'); }
  };

  window.onPageReady(async () => {
    await I18n.init('lang-switcher-slot');
    load();
  });
})();