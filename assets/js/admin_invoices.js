/* admin_invoices.js — Invoices financial management */
'use strict';
(function () {
  Auth.guard('admin');
  Auth.initUI();

  let ALL = [], filtered = [];
  const saved   = window.SessionState?.load('invoices') || {};
  let pg        = saved.pg  || 1;
  let activeTab = saved.tab || 'all';
  const PER = 15;

  const $ = id => document.getElementById(id);
  const list    = $('inv-list');
  const tabBar  = $('inv-tab-bar');
  const search  = $('inv-search');
  const fClient = $('inv-filter-client');
  const fFrom   = $('inv-date-from');
  const fTo     = $('inv-date-to');
  const info    = $('inv-info');
  const pag     = $('inv-pagination');
  const modal   = $('modal-invoice');

  // Inject page actions
  const act = $('page-actions');
  if (act) act.innerHTML = `
    <button class="btn btn-secondary" id="btn-refresh"><svg style="width:15px;height:15px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/></svg> <span>Aggiorna</span></button>
    <button class="btn btn-primary" id="btn-new-invoice"><svg style="width:15px;height:15px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg> <span>Nuova fattura</span></button>`;
  $('btn-refresh')?.addEventListener('click', load);
  $('btn-new-invoice')?.addEventListener('click', openModal);

  tabBar?.querySelectorAll('.filter-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));
  tabBar?.addEventListener('click', e => {
    const b = e.target.closest('.filter-tab'); if (!b) return;
    tabBar.querySelectorAll('.filter-tab').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); activeTab = b.dataset.tab; pg = 1; applyFilters();
  });
  [search, fClient, fFrom, fTo].forEach(el => {
    el?.addEventListener('input',  () => { pg = 1; applyFilters(); });
    el?.addEventListener('change', () => { pg = 1; applyFilters(); });
  });

  window.addEventListener('companyChanged', load);
  window._reloadInvoices = load;

  async function load() {
    if (!list) return;
    list.innerHTML = UI.skeletonCardList(5);
    try {
      const res = await API.Invoices.list({});
      ALL = Array.isArray(res) ? res : (res?.items ?? res?.data ?? []);
      populateClientFilter();
    } catch (e) {
      ALL = [];
      const errMsg = 'Impossibile caricare le fatture. Controlla la connessione e riprova.';
      list.innerHTML = UI.errorState(errMsg, 'window._reloadInvoices()');
    }
    updateKpis();
    applyFilters();
  }

  function populateClientFilter() {
    if (!fClient) return;
    const prev  = fClient.value;
    const names = [...new Set(ALL.map(i => i.client_name).filter(Boolean))].sort();
    fClient.innerHTML = `<option value="">Tutti i clienti</option>` + names.map(n => `<option value="${n}">${n}</option>`).join('');
    if (prev) fClient.value = prev;
  }

  function updateKpis() {
    const set = (id, v, m) => { const el=$(id); if(el) el.textContent=v; const em=$(id+'-meta'); if(em&&m!==undefined) em.textContent=m; };
    const now = new Date().toISOString().split('T')[0];
    set('kpi-inv-total',   ALL.length,                                              'In totale');
    set('kpi-inv-open',    ALL.filter(i => i.status === 'open'   || i.status === 'sent').length,   'Da incassare');
    set('kpi-inv-overdue', ALL.filter(i => (i.status === 'open' || i.status === 'sent') && i.due_date < now).length, 'Scadute');
    set('kpi-inv-paid',    ALL.filter(i => i.status === 'paid').length,             'Incassate');
  }

  function applyFilters() {
    const q  = (search?.value || '').toLowerCase().trim();
    const cl = fClient?.value || '';
    const df = fFrom?.value   || '';
    const dt = fTo?.value     || '';
    const now = new Date().toISOString().split('T')[0];

    filtered = ALL.filter(i => {
      if (activeTab === 'open'    && i.status !== 'open'  && i.status !== 'sent') return false;
      if (activeTab === 'overdue' && !((i.status === 'open' || i.status === 'sent') && i.due_date < now)) return false;
      if (activeTab === 'paid'    && i.status !== 'paid')   return false;
      if (activeTab === 'draft'   && i.status !== 'draft')  return false;
      if (st && i.status !== st) return false;
      if (cl && i.client_name !== cl) return false;
      if (df && i.issue_date && i.issue_date < df) return false;
      if (dt && i.issue_date && i.issue_date > dt) return false;
      if (q) {
        const hay = [i.number, i.client_name, i.description].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const max = Math.ceil(filtered.length / PER) || 1;
    if (pg > max) pg = max;
    window.SessionState?.save('invoices', { pg, tab: activeTab });
    render();
  }

  function render() {
    if (!list) return;
    if (!filtered.length) {
      list.innerHTML = `<div class="list-card">${UI.createEmptyState(null, ALL.length ? 'Nessuna fattura corrisponde ai filtri.' : 'Nessuna fattura presente.')}</div>`;
      if (info) info.textContent = ''; if (pag) pag.innerHTML = ''; return;
    }
    const now   = new Date().toISOString().split('T')[0];
    const slice = filtered.slice((pg-1)*PER, pg*PER);
    list.innerHTML = slice.map(i => {
      const isOverdue   = (i.status === 'open' || i.status === 'sent') && i.due_date < now;
      const displaySt   = isOverdue ? 'overdue' : (i.status || 'open');
      const windocBadge = i.windoc_id ? `<span style="font-size:10px;background:var(--gray-100);color:var(--gray-600);padding:2px 6px;border-radius:4px;font-weight:600;">W ${i.windoc_sync_status||'sync'}</span>` : '';
      return `<div class="list-card fade-in" data-id="${i.id}">
        <div class="list-card-header">
          <div class="list-card-title">
            <div>${i.number ? `#${i.number}` : 'Fattura'} — ${i.client_name || 0}</div>
            ${i.description ? `<div style="font-size:11px;color:var(--gray-500);margin-top:2px;">${i.description}</div>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:6px;">${windocBadge}${UI.pill(displaySt)}</div>
        </div>
        <div class="list-card-body" style="flex-wrap:wrap;">
          <div class="list-card-meta" style="font-size:16px;font-weight:700;color:var(--gray-900);">${UI.currency(i.amount || i.total_amount || 0)}</div>
          <div class="list-card-meta">Scadenza: <strong style="color:${isOverdue?'var(--color-danger)':'inherit'};">${i.due_date ? UI.date(i.due_date) : 0}</strong></div>
          ${i.paid_at ? `<div class="list-card-meta">Pagata: ${UI.date(i.paid_at)}</div>` : ''}
          <div class="row-actions" style="width:100%;justify-content:flex-end;margin-top:4px;">
            ${i.status !== 'paid' ? `<button class="btn btn-secondary btn-sm" onclick="markPaid('${i.id}')">Segna pagata</button>` : ''}
            ${(i.status === 'open' || i.status === 'sent') ? `<button class="btn btn-ghost btn-sm" onclick="sendReminder('${i.id}')">Invia sollecito</button>` : ''}
            ${!i.windoc_id ? `<button class="btn btn-ghost btn-sm" onclick="syncWindoc('${i.id}')">Sync Windoc</button>` : `<button class="btn btn-ghost btn-sm" onclick="checkWindoc('${i.id}')">Verifica Windoc</button>`}
            <a href="admin_invoice_detail.html?id=${i.id}" class="btn btn-ghost btn-sm" title="Dettaglio">
              <svg style="width:13px;height:13px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/></svg>
            </a>
          </div>
        </div>
      </div>`;
    }).join('');
    const s=(pg-1)*PER+1, e=Math.min(pg*PER,filtered.length);
    if (info) info.textContent = `${s}–${e} di ${filtered.length}`;
    UI.pagination(pag, null, pg, filtered.length, PER, p => { pg=p; render(); });
  }

  // ── Modal ─────────────────────────────────────────────────────
  async function openModal() {
    if (!modal) return;
    const cl = $('inv-client');
    if (cl) cl.innerHTML = '<option value="">Caricamento…</option>';
    modal.classList.add('open');
    try {
      const res = await API.Clients.list().catch(()=>[]);
      const clients = Array.isArray(res) ? res : (res?.items ?? res?.data ?? []);
      if (cl) cl.innerHTML = '<option value="">— Seleziona cliente —</option>' + clients.map(c=>`<option value="${c.id}">${c.name||c.email}</option>`).join('');
      const due = $('inv-due'); if (due) { const d=new Date(); d.setDate(d.getDate()+30); due.value=d.toISOString().split('T')[0]; }
    } catch (e) { UI.toast('Errore caricamento clienti','error'); }
  }

  $('btn-save-invoice')?.addEventListener('click', async () => {
    const cid = $('inv-client')?.value, amt = parseFloat($('inv-amount')?.value), due = $('inv-due')?.value;
    if (!cid || isNaN(amt) || !due) { UI.toast('Cliente, importo e scadenza sono obbligatori','warning'); return; }
    const btn = $('btn-save-invoice'); if (btn) btn.disabled = true;
    try {
      await API.Invoices.create({ client_id: cid, amount: amt, due_date: due, description: $('inv-desc')?.value?.trim()||null });
      UI.toast('Fattura creata','success'); modal?.classList.remove('open'); await load();
    } catch(e) { UI.toast(e?.message||'Errore','error'); }
    finally { if (btn) btn.disabled = false; }
  });

  // ── Row actions ────────────────────────────────────────────────
  window.markPaid    = async id => {
    if (!confirm('Segnare questa fattura come pagata?')) return;
    try { await API.Invoices.update(id,{status:'paid',paid_at:new Date().toISOString()}); ALL=ALL.map(i=>i.id===id?{...i,status:'paid',paid_at:new Date().toISOString()}:i); updateKpis(); applyFilters(); UI.toast('Fattura segnata come pagata','success'); }
    catch(e) { UI.toast(e?.message||'Errore','error'); }
  };
  window.sendReminder = async id => {
    try { await API.post(`/invoices/${id}/reminder`,{}); UI.toast('Sollecito inviato','success'); }
    catch(e) { UI.toast(e?.message||'Errore','error'); }
  };
  window.syncWindoc = async id => {
    try { await API.post(`/invoices/${id}/windoc-sync`,{}); UI.toast('Sync Windoc avviata','info'); await load(); }
    catch(e) { UI.toast(e?.message||'Errore Windoc','error'); }
  };
  window.checkWindoc = async id => {
    try { const r=await API.get(`/invoices/${id}/windoc-status`); UI.toast(`Windoc: ${r?.status||'verificato'}`, 'info'); }
    catch(e) { UI.toast(e?.message||'Errore Windoc','error'); }
  };

  document.addEventListener('DOMContentLoaded', async () => {
    await I18n.init('lang-switcher-slot');
    load();
  });
})();
