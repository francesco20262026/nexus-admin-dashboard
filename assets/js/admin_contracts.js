/* admin_contracts.js — Contracts lifecycle management */
'use strict';
(function () {
  Auth.guard('admin');
  Auth.initUI();

  let ALL = [], filtered = [];
  const saved   = window.SessionState?.load('contracts') || {};
  let page      = saved.page || 1;
  let activeTab = saved.tab  || 'all';
  const PER     = 15;

  const $ = id => document.getElementById(id);
  const list    = $('ctr-list');
  const tabBar  = $('ctr-tab-bar');
  const search  = $('ctr-search');
  const fClient = $('ctr-filter-client');
  const fTpl    = $('ctr-filter-template');
  const fFrom   = $('ctr-date-from');
  const fTo     = $('ctr-date-to');
  const info    = $('ctr-info');
  const pag     = $('ctr-pagination');
  const modal   = $('modal-contract');

  // Page header actions
  const actDiv = $('page-actions');
  if (actDiv) actDiv.innerHTML = `
    <button class="btn btn-secondary" id="btn-refresh"><svg style="width:15px;height:15px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/></svg> <span>Aggiorna</span></button>
    <button class="btn btn-primary" id="btn-new-contract"><svg style="width:15px;height:15px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg> <span>Nuovo contratto</span></button>`;
  $('btn-refresh')?.addEventListener('click', load);
  $('btn-new-contract')?.addEventListener('click', openModal);

  // Restore tab
  tabBar?.querySelectorAll('.filter-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));

  // Event listeners
  tabBar?.addEventListener('click', e => {
    const b = e.target.closest('.filter-tab'); if (!b) return;
    tabBar.querySelectorAll('.filter-tab').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); activeTab = b.dataset.tab; page = 1; applyFilters();
  });
  [search, fClient, fTpl, fFrom, fTo].forEach(el =>
    el?.addEventListener('change', () => { page = 1; applyFilters(); }));
  search?.addEventListener('input', () => { page = 1; applyFilters(); });

  window.addEventListener('companyChanged', load);
  window._reloadContracts = load;

  // ── Load ──────────────────────────────────────────────────────
  async function load() {
    if (!list) return;
    list.innerHTML = UI.skeletonCardList(5);
    try {
      const res = await API.Contracts.list({});
      ALL = Array.isArray(res) ? res : (res?.items ?? res?.data ?? []);
      populateClientFilter();
      populateTemplateFilter();
    } catch (e) {
      ALL = [];
      const errMsg = 'Impossibile caricare i contratti. Controlla la connessione e riprova.';
      list.innerHTML = UI.errorState(errMsg, 'window._reloadContracts()');
    }
    updateKpis();
    applyFilters();
  }

  function populateClientFilter() {
    if (!fClient) return;
    const prev = fClient.value;
    const names = [...new Set(ALL.map(c => c.client_name).filter(Boolean))].sort();
    fClient.innerHTML = `<option value="">Tutti i clienti</option>` +
      names.map(n => `<option value="${n}">${n}</option>`).join('');
    if (prev) fClient.value = prev;
  }

  function populateTemplateFilter() {
    if (!fTpl) return;
    const prev = fTpl.value;
    const tpls = [...new Set(ALL.map(c => c.template_name).filter(Boolean))].sort();
    fTpl.innerHTML = `<option value="">Tutti i template</option>` +
      tpls.map(t => `<option value="${t}">${t}</option>`).join('');
    if (prev) fTpl.value = prev;
  }

  // ── KPIs ──────────────────────────────────────────────────────
  function updateKpis() {
    const set = (id, v, m) => { const el=$(id); if(el) el.textContent=v; const em=$(id+'-meta'); if(em&&m!==undefined) em.textContent=m; };
    set('kpi-ctr-draft',   ALL.filter(c => c.status === 'draft').length,   'Da inviare');
    set('kpi-ctr-sent',    ALL.filter(c => c.status === 'sent').length,    'Inviati al cliente');
    set('kpi-ctr-signing', ALL.filter(c => c.status === 'signing' || c.status === 'sent').length, 'In attesa firma');
    set('kpi-ctr-signed',  ALL.filter(c => c.status === 'signed' || c.status === 'active').length, 'Completati');
  }

  // ── Filters ───────────────────────────────────────────────────
  function applyFilters() {
    const q   = (search?.value || '').toLowerCase().trim();
    const cl  = fClient?.value || '';
    const tp  = fTpl?.value    || '';
    const df  = fFrom?.value   || '';
    const dt  = fTo?.value     || '';

    filtered = ALL.filter(c => {
      if (activeTab !== 'all') {
        if (activeTab === 'signing' && c.status !== 'signing' && c.status !== 'sent') return false;
        else if (activeTab !== 'signing' && c.status !== activeTab) return false;
      }
      if (activeTab !== 'all' && c.status !== activeTab) return false;
      if (cl && c.client_name !== cl) return false;
      if (tp && c.template_name !== tp) return false;
      if (df && c.created_at && c.created_at < df) return false;
      if (dt && c.created_at && c.created_at > dt) return false;
      if (q) {
        const hay = [c.title, c.client_name, c.template_name].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const max = Math.ceil(filtered.length / PER) || 1;
    if (page > max) page = max;
    window.SessionState?.save('contracts', { page, tab: activeTab });
    render();
  }

  // ── Render ────────────────────────────────────────────────────
  function render() {
    if (!list) return;
    if (!filtered.length) {
      list.innerHTML = `<div class="list-card">${UI.createEmptyState(null, ALL.length ? 'Nessun contratto corrisponde ai filtri.' : 'Nessun contratto presente.')}</div>`;
      if (info) info.textContent = '';
      if (pag)  pag.innerHTML   = '';
      return;
    }
    const slice = filtered.slice((page-1)*PER, page*PER);
    list.innerHTML = slice.map(c => {
      const sentDate   = c.sent_at    ? UI.date(c.sent_at)   : 0;
      const signedDate = c.signed_at  ? UI.date(c.signed_at) : 0;
      const validTo    = c.valid_to   ? UI.date(c.valid_to)  : '';
      return `<div class="list-card fade-in" data-id="${c.id}">
        <div class="list-card-header">
          <div class="list-card-title">
            <div>${c.title || 'Contratto senza titolo'}</div>
            ${c.template_name ? `<div style="font-size:11px;color:var(--gray-500);margin-top:2px;">Template: ${c.template_name}</div>` : ''}
          </div>
          ${UI.pill(c.status || 'draft')}
        </div>
        <div class="list-card-body" style="flex-wrap:wrap;gap:12px;">
          <div class="list-card-meta">
            <svg style="width:13px;height:13px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"/></svg>
            <a href="admin_client_detail.html?id=${c.client_id}" style="color:var(--brand-600);">${c.client_name || 0}</a>
          </div>
          ${c.service_name ? `<div class="list-card-meta"><svg style="width:13px;height:13px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"/></svg>${c.service_name}</div>` : ''}
          <div class="list-card-meta" title="Data invio"><svg style="width:13px;height:13px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"/></svg>Inviato: ${sentDate}</div>
          <div class="list-card-meta" title="Data firma"><svg style="width:13px;height:13px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>Firmato: ${signedDate}</div>
          ${validTo ? `<div class="list-card-meta">Validità fino: ${validTo}</div>` : ''}
          <div class="row-actions" style="width:100%;justify-content:flex-end;margin-top:4px;">
            ${c.status === 'draft' ? `<button class="btn btn-secondary btn-sm" onclick="sendContract('${c.id}')">Invia per firma</button>` : ''}
            ${(c.status === 'sent' || c.status === 'signing') ? `<button class="btn btn-secondary btn-sm" onclick="checkSignStatus('${c.id}')">Verifica stato</button>` : ''}
            ${(c.status === 'signed' || c.status === 'active') ? `<button class="btn btn-ghost btn-sm" onclick="archiveContract('${c.id}')">Archivia</button>` : ''}
            <button class="btn btn-ghost btn-sm" onclick="downloadContract('${c.id}')" title="Scarica">
              <svg style="width:13px;height:13px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>
            </button>
          </div>
        </div>
      </div>`;
    }).join('');
    const s=(page-1)*PER+1, e=Math.min(page*PER,filtered.length);
    if (info) info.textContent = `${s}–${e} di ${filtered.length}`;
    UI.pagination(pag, null, page, filtered.length, PER, p => { page=p; render(); });
  }

  // ── Modal ─────────────────────────────────────────────────────
  async function openModal() {
    if (!modal) return;
    const wc = $('w-client'), wt = $('w-template'), ws = $('w-service');
    if (wc) wc.innerHTML = '<option value="">Caricamento…</option>';
    if (wt) wt.innerHTML = '<option value="">Caricamento…</option>';
    modal.classList.add('open');
    try {
      const [clients, tpls, srvs] = await Promise.all([
        API.Clients.list().catch(()=>[]),
        API.Contracts.templates().catch(()=>[]),
        API.Services.catalog(false).catch(()=>[]),
      ]);
      const cl = Array.isArray(clients) ? clients : (clients?.items ?? clients?.data ?? []);
      const tl = Array.isArray(tpls)    ? tpls    : (tpls?.items    ?? tpls?.data    ?? []);
      const sl = Array.isArray(srvs)    ? srvs    : (srvs?.items    ?? srvs?.data    ?? []);
      if (wc) wc.innerHTML = '<option value="">— Seleziona cliente —</option>' + cl.map(c=>`<option value="${c.id}">${c.name||c.email}</option>`).join('');
      if (wt) wt.innerHTML = '<option value="">— Seleziona template —</option>' + tl.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
      if (ws) ws.innerHTML = '<option value="">— Nessun servizio —</option>'   + sl.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
      const now = new Date();
      const vf = $('w-valid-from'); if (vf) vf.value = now.toISOString().split('T')[0];
      const vt = $('w-valid-to');   now.setFullYear(now.getFullYear()+1); if (vt) vt.value = now.toISOString().split('T')[0];
    } catch (e) { UI.toast('Errore caricamento dati', 'error'); modal.classList.remove('open'); }
  }

  $('btn-create-contract')?.addEventListener('click', async () => {
    const cid = $('w-client')?.value, tid = $('w-template')?.value;
    if (!cid || !tid) { UI.toast('Cliente e Template sono obbligatori', 'warning'); return; }
    const btn = $('btn-create-contract'); if (btn) btn.disabled = true;
    try {
      await API.Contracts.create({
        client_id: cid, template_id: tid,
        service_id: $('w-service')?.value || null,
        title: $('w-title')?.value?.trim() || null,
        valid_from: $('w-valid-from')?.value || null,
        valid_to:   $('w-valid-to')?.value   || null,
      });
      UI.toast('Contratto generato', 'success');
      modal?.classList.remove('open');
      await load();
    } catch (e) { UI.toast(e?.message || 'Errore generazione', 'error'); }
    finally { if (btn) btn.disabled = false; }
  });

  // ── Row actions ────────────────────────────────────────────────
  window.sendContract = async id => {
    try { await API.Contracts.send(id); ALL=ALL.map(c=>c.id===id?{...c,status:'sent'}:c); updateKpis(); applyFilters(); UI.toast('Inviato per firma','success'); }
    catch(e) { UI.toast(e?.message||'Errore invio','error'); }
  };
  window.checkSignStatus = async id => {
    try {
      const res = await API.get(`/contracts/${id}/sign-status`);
      const st  = res?.zoho_data?.request_status || res?.status || 'Sconosciuto';
      UI.toast(`Stato firma: ${st}`, 'info');
      if (/complet|sign/i.test(st)) { ALL=ALL.map(c=>c.id===id?{...c,status:'signed'}:c); updateKpis(); applyFilters(); }
    } catch(e) { UI.toast(e?.message||'Errore verifica','error'); }
  };
  window.archiveContract = async id => {
    if (!confirm('Archiviare questo contratto?')) return;
    try { await API.Contracts.update(id,{status:'archived'}); ALL=ALL.map(c=>c.id===id?{...c,status:'archived'}:c); updateKpis(); applyFilters(); UI.toast('Archiviato','success'); }
    catch(e) { UI.toast(e?.message||'Errore','error'); }
  };
  window.downloadContract = async id => {
    try { const d = await API.get(`/contracts/${id}/download-url`); if (d?.url) window.open(d.url,'_blank'); else UI.toast('PDF non disponibile','info'); }
    catch(e) { UI.toast('Errore download','error'); }
  };

  document.addEventListener('DOMContentLoaded', async () => {
    await I18n.init('lang-switcher-slot');
    load();
  });
})();