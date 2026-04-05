/* admin_invoices.js Invoices + Proforma + Payment tracking (Phase 3) v=24 */
'use strict';
(function () {
  Auth.guard('admin');
  Auth.initUI();
  window.massSelected = new Set();

  let ALL = [], filtered = [];
  let ALL_CATEGORIES = [];
  const urlParams = new URLSearchParams(location.search);
  const requestedTab = urlParams.get('tab');
  
  const saved   = window.SessionState?.load('invoices') || {};
  let pg        = saved.pg  || 1;
  let activeTab = saved.tab || 'all';
  let activeDirection = requestedTab === 'inbound' ? 'inbound' : (saved.dir || 'outbound');
  const PER = 15;

  const $ = id => document.getElementById(id);
  const list     = $('inv-list');
  const listPF   = $('inv-list-proforma');
  const listFT   = $('inv-list-fatture');
  const secPF    = $('inv-section-proforma');
  const secFT    = $('inv-section-fatture');
  const pipelineBar  = $('inv-pipeline-bar');
  const search   = $('inv-search');
  const fClient  = $('inv-filter-client');
  const fCategory= $('inv-filter-category');
  const fMese    = $('inv-filter-mese');
  const fAnno    = $('inv-filter-anno');
  const fStatusCol = $('inv-col-status-filter');
  const info     = $('inv-info');
  const pag      = $('inv-pagination');
  const modal    = $('modal-invoice');

  // Sort state
  let sortKey = 'due_date', sortDir = 1; // 1=asc,-1=desc

  // Page actions
  const act = $('page-actions');
  if (act) act.innerHTML = `
    <button class="btn btn-secondary" id="btn-refresh"><svg style="width:15px;height:15px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/></svg> <span class="hide-mobile">Aggiorna</span></button>
    <button class="btn btn-secondary" id="btn-windoc-sync" style="display:none;"><svg style="width:15px;height:15px;" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg> <span class="hide-mobile">Sync Windoc</span></button>
    <button class="btn btn-secondary" id="btn-gdrive-sync" style="display:none;"><svg style="width:15px;height:15px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" /></svg> <span class="hide-mobile">Sync GDrive</span></button>
    <button class="btn btn-secondary" id="btn-upload-pdf" style="display:none;"><svg style="width:15px;height:15px;" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg> <span class="hide-mobile">Carica PDF</span></button>
    <button class="btn btn-secondary" id="btn-new-proforma" style="display:none;"><svg style="width:15px;height:15px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12"/></svg> <span class="hide-mobile">Nuova proforma</span></button>
    <button class="btn-action-icon" id="btn-action-icon-new-invoice" title="Nuova fattura" style="display:none;">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
    </button>
    <input type="file" id="pdf-upload-input" accept="application/pdf" multiple style="display:none;">
  `;

  $('btn-refresh')?.addEventListener('click', function() { if(window.UI) UI.toast('Aggiornamento in corso...', 'info'); load(true); });
  $('btn-action-icon-new-invoice')?.addEventListener('click', () => openModal(false));
  $('btn-new-proforma')?.addEventListener('click', () => openModal(true));
  
  $('btn-windoc-sync')?.addEventListener('click', async () => {
     if (!confirm('Vuoi forzare la sincronizzazione (Acquisti) globale da Winddoc?')) return;
     if (window.UI) UI.toast('Sincronizzazione in corso...', 'info');
     try {
       await API.post('/invoices/sync-inbound-windoc', {});
       if (window.UI) UI.toast('Sincronizzazione completata!', 'success');
       load(true);
     } catch (err) {
       console.error(err);
       if (window.UI) UI.toast('Errore: ' + (err.message || 'Sincronizzazione fallita'), 'error');
     }
  });

  $('btn-gdrive-sync')?.addEventListener('click', async () => {
     if (window.UI) UI.toast('Scansione cartelle GDrive avviata...', 'info');
     try {
       await API.post('/jobs/trigger-gdrive-poller', {});
       if (window.UI) UI.toast('Scansione completata, aggiorno in 30 secondi...', 'success');
       setTimeout(() => load(true), 30000); // Wait for background poller to process the files
     } catch(e) {
       if (window.UI) UI.toast('Errore durante l\'avvio dello script poller', 'error');
     }
  });

  $('btn-upload-pdf')?.addEventListener('click', () => $('pdf-upload-input').click());
  $('pdf-upload-input')?.addEventListener('change', async (e) => {
     const files = e.target.files;
     if (!files || files.length === 0) return;
     if (window.UI) UI.toast(`Avvio caricamento di ${files.length} documenti in coda A.I...`, 'info');
     try {
       const fd = new FormData();
       for (let i = 0; i < files.length; i++) {
         fd.append('files', files[i]);
       }
       const res = await API.post('/invoices/parse-pdf-batch', fd);
       if (window.UI) UI.toast(`${res.queued} documenti messi in coda per l'analisi! Elaborazione in background.`, 'success');
       setTimeout(() => load(true), 1500);
     } catch (err) {
       console.error(err);
       if (window.UI) UI.toast('Errore di accodamento: ' + (err.message || 'Elaborazione fallita'), 'error');
     } finally {
       e.target.value = '';
     }
  });

  // Payment status labels
  const PAYMENT_STATUS = {
    not_paid:      { label: 'Non pagata',      cls: 'pill-danger'  },
    proof_uploaded:{ label: 'Prova inviata',   cls: 'pill-warning' },
    under_review:  { label: 'In verifica',     cls: 'pill-warning' },
    paid:          { label: 'Pagata',          cls: 'pill-success' },
    cancelled:     { label: 'Annullata',       cls: 'pill-gray'    },
  };

  const PAYMENT_METHOD_LABEL = { bonifico: 'Bonifico', rid: 'RID', carta: 'Carta' };

  // Main direction tabs logic
  const mainTabs = $('inv-main-tabs');
  if (mainTabs) {
    mainTabs.querySelectorAll('.main-tab').forEach(b => {
      const isActive = b.dataset.direction === activeDirection;
      b.classList.toggle('active', isActive);
      b.style.borderBottomColor = isActive ? '#0a84ff' : 'transparent';
      b.style.color = isActive ? '#111827' : '#6b7280';
    });
    mainTabs.addEventListener('click', e => {
      const b = e.target.closest('.main-tab'); if (!b) return;
      mainTabs.querySelectorAll('.main-tab').forEach(x => {
        x.classList.remove('active');
        x.style.borderBottomColor = 'transparent';
        x.style.color = '#6b7280';
      });
      b.classList.add('active'); 
      b.style.borderBottomColor = '#0a84ff';
      b.style.color = '#111827';
      activeDirection = b.dataset.direction; 
      pg = 1; 
      
      const btnPF = $('btn-new-proforma'), btnFT = $('btn-action-icon-new-invoice');
      const btnSync = $('btn-windoc-sync'), btnPdf = $('btn-upload-pdf'), btnGdrive = $('btn-gdrive-sync');

      if (activeDirection === 'report') {
         if (btnPF) btnPF.style.display = 'none';
         if (btnFT) btnFT.style.display = 'none';
         if (btnGdrive) btnGdrive.style.display = 'none';
         if (btnSync) btnSync.style.display = 'none';
         if (btnPdf) btnPdf.style.display = 'none';

         if (pipelineBar) pipelineBar.style.display = 'none';
         const filters = list.closest('.card');
         if (filters) filters.style.display = 'none';
         if (secPF) secPF.style.display = 'none';
         if (secFT) secFT.style.display = 'none';
         list.innerHTML = `<div class="list-card"><div style="padding:40px;position:relative;height:500px;width:100%"><canvas id="invoicesChart"></canvas></div></div>`;
         list.style.display = 'block';
         if (pag) pag.innerHTML = '';
         if (info) info.innerHTML = '';
         renderReport();
      } else {
         if (pipelineBar) pipelineBar.style.display = 'flex';
         const filters = list.closest('.card');
         if (filters) filters.style.display = 'block';
         list.style.display = 'flex';
         
         if (activeDirection === 'inbound') {
            if (btnPF) btnPF.style.display = 'none';
            if (btnFT) btnFT.style.display = 'inline-flex';
            if (btnGdrive) btnGdrive.style.display = 'inline-flex';
            if (btnSync) btnSync.style.display = 'inline-flex';
            if (btnPdf) btnPdf.style.display = 'inline-flex';
         } else {
            if (btnPF) btnPF.style.display = 'inline-flex';
            if (btnFT) btnFT.style.display = 'inline-flex';
            if (btnGdrive) btnGdrive.style.display = 'none';
            if (btnSync) btnSync.style.display = 'none';
            if (btnPdf) btnPdf.style.display = 'none';
         }
         load(true);
      }
    });
    
    // trigger initial buttons layout
    if (activeDirection === 'outbound') {
        if ($('btn-new-proforma')) $('btn-new-proforma').style.display = 'inline-flex';
        if ($('btn-action-icon-new-invoice')) $('btn-action-icon-new-invoice').style.display = 'inline-flex';
    } else if (activeDirection === 'inbound') {
        if ($('btn-gdrive-sync')) $('btn-gdrive-sync').style.display = 'inline-flex';
        if ($('btn-windoc-sync')) $('btn-windoc-sync').style.display = 'inline-flex';
        if ($('btn-upload-pdf')) $('btn-upload-pdf').style.display = 'inline-flex';
        if ($('btn-action-icon-new-invoice')) $('btn-action-icon-new-invoice').style.display = 'inline-flex';
    }
  }

  async function renderReport() {
      // Inietta libreria chart.js se non presente
      if (!window.Chart) {
          await new Promise(r => {
             const s = document.createElement('script');
             s.src = 'https://cdn.jsdelivr.net/npm/chart.js';
             s.onload = r;
             document.head.appendChild(s);
          });
      }
      
      const ctx = $('invoicesChart');
      if (!ctx) return;
      try {
          const res = await API.get('/invoices/report/chart');
          const mm = res.months || [];
          const labels = mm.map(m => `Mese ${m.month}`);
          const revenues = mm.map(m => m.revenues);
          const costs = mm.map(m => m.costs);
          
          new Chart(ctx, {
            type: 'bar',
            data: {
              labels,
              datasets: [
                {
                  label: 'Ricavi (Outbound)',
                  data: revenues,
                  backgroundColor: 'rgba(10, 132, 255, 0.7)',
                  borderRadius: 4
                },
                {
                  label: 'Costi (Inbound)',
                  data: costs,
                  backgroundColor: 'rgba(239, 68, 68, 0.7)',
                  borderRadius: 4
                }
              ]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              scales: {
                y: { beginAtZero: true }
              }
            }
          });
      } catch (err) {}
  }

  pipelineBar?.querySelectorAll('.cl-status-pill').forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));
  pipelineBar?.addEventListener('click', e => {
    const b = e.target.closest('.cl-status-pill'); if (!b) return;
    pipelineBar.querySelectorAll('.cl-status-pill').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); activeTab = b.dataset.tab; pg = 1; applyFilters();
  });
  [search, fClient, fCategory, fMese, fAnno].forEach(el => {
    el?.addEventListener('input',  debounce(() => { pg = 1; applyFilters(); }, 200));
    el?.addEventListener('change', () => { pg = 1; applyFilters(); });
  });
  fStatusCol?.addEventListener('change', () => { pg = 1; applyFilters(); });

  // Column sort
  document.querySelectorAll('.inv-col-hdr[data-sort]').forEach(h => {
    h.style.cursor = 'pointer';
    h.style.display = 'flex';
    h.style.alignItems = 'center';
    h.style.gap = '4px';
    h.style.userSelect = 'none';
    h.style.fontSize = '10px';
    h.style.fontWeight = '800';
    h.style.color = 'var(--gray-500)';
    h.style.textTransform = 'uppercase';
    h.style.letterSpacing = '.4px';
    h.addEventListener('click', () => {
      if (sortKey === h.dataset.sort) sortDir *= -1;
      else { sortKey = h.dataset.sort; sortDir = 1; }
      applyFilters();
    });
  });

  window.addEventListener('companyChanged', load);
  window._reloadInvoices = load;

  /* ── Eventi Modale (Servizi e Ricorrenza) ───────────────────── */
  $('inv-is-recurring')?.addEventListener('change', (e) => {
    const f = $('inv-recurrence-fields');
    if (f) f.style.display = e.target.checked ? 'grid' : 'none';
    const recSect = $('inv-recurrence-section');
    if (recSect) recSect.style.background = e.target.checked ? '#fefce8' : 'transparent';
  });

  $('inv-client')?.addEventListener('change', async (e) => {
    const cid = e.target.value;
    const servSect = $('inv-services-section');
    const servList = $('inv-client-services-list');
    
    // Mostriamo la sezione Servizi solo se c'è un cliente e stiamo creando Proforma
    // (per comodità lasciamo sempre la possibilità di legare servizi anche a Fatture)
    if (!cid) {
      if(servSect) servSect.style.display = 'none';
      if(servList) servList.innerHTML = '<div style="font-size:13px;color:#6b7280;text-align:center;">Seleziona un cliente per caricare i servizi.</div>';
      return;
    }
    
    if(servSect) servSect.style.display = 'block';
    if(servList) servList.innerHTML = '<div style="font-size:13px;color:#6b7280;text-align:center;">Caricamento servizi...</div>';
    
    // Carica contratti per questo cliente
    const contSelect = $('inv-contract-id');
    if (contSelect) {
      API.get(`/contracts?client_id=${cid}`).then(res => {
         const arr = res.data || res.items || [];
         contSelect.innerHTML = '<option value="">Nessun contratto</option>' + arr.map(c => `<option value="${c.id}">${c.title}</option>`).join('');
      }).catch(e => contSelect.innerHTML = '<option value="">Nessun contratto</option>');
    }

    // Carica fornitore basato su company_id del cliente
    const supSelect = $('inv-supplier-creation');
    if (supSelect) {
      supabaseClient.from('clients').select('*, companies(*)').eq('id', cid).single().then(res => {
         if (res.data && res.data.companies) {
            supSelect.innerHTML = `<option value="${res.data.companies.id}">${res.data.companies.name}</option>`;
         } else {
            supSelect.innerHTML = `<option value="">Nessun fornitore associato al cliente</option>`;
         }
      }).catch(e => supSelect.innerHTML = '<option value="">Errore fornitore</option>');
    }

    // Carica preventivi
    const quoteSelect = $('inv-quote-id');
    if (quoteSelect) {
      supabaseClient.from('quotes').select('id, number, title').eq('client_id', cid).order('created_at', {ascending:false}).then(res => {
         const arr = res.data || [];
         quoteSelect.innerHTML = '<option value="">Nessun preventivo</option>' + arr.map(q => `<option value="${q.id}">${q.number||''} ${q.title||''}</option>`).join('');
      }).catch(e => quoteSelect.innerHTML = '<option value="">Nessun preventivo</option>');
    }

    try {
      const res = await API.Services.subscriptions({ client_id: cid });
      let subs = Array.isArray(res) ? res : (res?.items || res?.data || []);
      subs = subs.filter(s => s.status === 'active' || !s.status); // only active
      
      if (!subs.length) {
         if(servList) servList.innerHTML = '<div style="font-size:13px;color:#6b7280;text-align:center;">Nessun servizio attivo trovato per questo cliente.</div>';
         return;
      }
      
      servList.innerHTML = subs.map(s => {
        const price = s.price || s.price_amount || s.amount || 0;
        const name  = s.service_name || s.name || s.description || 'Servizio (senza nome)';
        return `<label style="display:flex;align-items:center;gap:12px;cursor:pointer;background:#fff;padding:8px;border:1px solid #e5e7eb;border-radius:6px;transition:border-color 0.2s;">
          <input type="checkbox" class="inv-service-cb" value="${s.id}" data-price="${price}" style="width:16px;height:16px;accent-color:var(--brand);margin:0;cursor:pointer;">
          <div style="display:flex;flex-direction:column;flex:1;">
            <div style="font-size:13px;font-weight:600;color:var(--gray-900);">${name}</div>
            <div style="font-size:11px;color:var(--gray-500);">${price > 0 ? UI.currency(price) : 'Gratuito'}</div>
          </div>
        </label>`;
      }).join('');
      
      servList.querySelectorAll('.inv-service-cb').forEach(cb => {
        cb.addEventListener('change', () => {
          let tot = 0;
          servList.querySelectorAll('.inv-service-cb:checked').forEach(c => tot += parseFloat(c.dataset.price) || 0);
          const amt = $('inv-amount');
          if (amt) amt.value = tot > 0 ? tot.toFixed(2) : '';
        });
      });
    } catch (err) {
      if(servList) servList.innerHTML = '<div style="font-size:13px;color:#ef4444;text-align:center;">Errore durante il caricamento dei servizi.</div>';
    }
  });

  async function load() {
    if (!list) return;
    list.innerHTML = UI.skeletonCardList(5);
    if (listPF) listPF.innerHTML = '';
    if (listFT) listFT.innerHTML = '';
    if (secPF) secPF.style.display = 'none';
    if (secFT) secFT.style.display = 'none';
    if (activeDirection === 'report') {
       // if stuck on report view somehow, shortcircuit
       return;
    }
    try {
      if (!ALL_CATEGORIES.length) {
         const cr = await API.get('/categories');
         ALL_CATEGORIES = Array.isArray(cr) ? cr : (cr?.data || cr?.items || []);
      }
    } catch(e) {}

    try {
      const res = await API.Invoices.list({ direction: activeDirection });
      ALL = Array.isArray(res) ? res : (res?.items ?? res?.data ?? []);
      // Flatten client and supplier names from joins
      ALL = ALL.map(i => ({
        ...i,
        client_name:   i.clients?.name || i.client_name || '',
        supplier_name: i.direction === 'inbound' 
                         ? (i.supplier_company?.name || i.parsed_data?.supplier_name || i.supplier_name || '') 
                         : (i.companies?.name || i.supplier_name || ''),
      }));
      populateClientFilter();
      populateCategoryFilter();
      populateYearFilter();
    } catch (e) {
      ALL = [];
      list.innerHTML = UI.errorState('Impossibile caricare le fatture.', 'window._reloadInvoices()');
    }
    
    // Dynamic column titles
    const colId = document.getElementById('inv-col-identity-hdr');
    const colOpp= document.getElementById('inv-col-opposite-hdr');
    if (colId && colOpp) {
       if (activeDirection === 'inbound') {
           colId.textContent = 'Fornitore';
           colOpp.textContent = 'Intestatario';
       } else {
           colId.textContent = 'Cliente';
           colOpp.textContent = 'Emittente';
       }
    }

    updateKpis();
    applyFilters();
  }

  function populateClientFilter() {
    if (!fClient) return;
    const prev  = fClient.value;
    
    // For inbound, we filter by supplier. For outbound, by client.
    const propName = activeDirection === 'inbound' ? 'supplier_name' : 'client_name';
    const names = [...new Set(ALL.map(i => i[propName]).filter(Boolean))].sort();
    
    const defaultLabel = activeDirection === 'inbound' ? 'Tutti i fornitori' : 'Tutti i clienti';
    fClient.innerHTML = `<option value="">${defaultLabel}</option>` + names.map(n => `<option value="${n}">${n}</option>`).join('');
    
    if (prev) fClient.value = prev;
  }

  function populateCategoryFilter() {
    if (fCategory) {
      const prev  = fCategory.value;
      const names = [...new Set(ALL.map(i => i.invoice_categories?.name || '').filter(Boolean))].sort();
      fCategory.innerHTML = `<option value="">Tutte le categorie</option>` + names.map(n => `<option value="${n}">${n}</option>`).join('');
      if (prev) fCategory.value = prev;
    }
    
    // Also populate mass action dropdown using ALL_CATEGORIES fetched from API
    const massSel = document.getElementById('mac-mass-action-category');
    if (massSel && ALL_CATEGORIES && ALL_CATEGORIES.length > 0) {
      const massPrev = massSel.value;
      massSel.innerHTML = `<option value="" style="color:black;">Cambia Categoria...</option>` + ALL_CATEGORIES.map(c => `<option style="color:black;" value="${c.id}">${c.name}</option>`).join('');
      massSel.value = massPrev;
    }
  }

  function populateYearFilter() {
    if (!fAnno) return;
    const prev = fAnno.value;
    const years = [...new Set(ALL.map(i => {
      const d = i.created_at || i.due_date;
      return d ? d.split('-')[0] : null;
    }).filter(Boolean))].sort((a,b)=>b-a);
    fAnno.innerHTML = `<option value="">Tutti gli anni</option>` + years.map(y => `<option value="${y}">${y}</option>`).join('');
    if (prev) fAnno.value = prev;
  }

  function updateKpis() {
    const set = (id, v) => { const el=$(id); if(el) el.textContent=v; };
    set('kpi-inv-all',          ALL.length);
    set('kpi-inv-proforma',     ALL.filter(i => i.is_proforma).length);
    set('kpi-inv-invoices',     ALL.filter(i => !i.is_proforma).length);
    set('kpi-inv-not_paid',     ALL.filter(i => i.payment_status === 'not_paid').length);
    set('kpi-inv-proof_uploaded', ALL.filter(i => i.payment_status === 'proof_uploaded').length);
    set('kpi-inv-under_review', ALL.filter(i => i.payment_status === 'under_review').length);
    set('kpi-inv-paid',         ALL.filter(i => i.payment_status === 'paid').length);
  }

  function applyFilters() {
    const q   = (search?.value || '').toLowerCase().trim();
    const cl  = fClient?.value   || '';
    const cat = fCategory?.value || '';
    const mese= fMese?.value     || '';
    const anno= fAnno?.value     || '';
    const stF = fStatusCol?.value || '';

    filtered = ALL.filter(i => {
      if (activeTab === 'proforma'       && !i.is_proforma)                                return false;
      if (activeTab === 'invoices'       && i.is_proforma)                                 return false;
      if (activeTab === 'not_paid'       && i.payment_status !== 'not_paid')               return false;
      if (activeTab === 'proof_uploaded' && i.payment_status !== 'proof_uploaded')         return false;
      if (activeTab === 'under_review'   && i.payment_status !== 'under_review')           return false;
      if (activeTab === 'paid'           && i.payment_status !== 'paid')                   return false;
      
      const matchName = activeDirection === 'inbound' ? i.supplier_name : i.client_name;
      if (cl  && matchName !== cl) return false;
      
      if (cat && (i.invoice_categories?.name || '') !== cat) return false;
      if (stF && i.payment_status !== stF) return false;
      if (q) {
        const hay = [i.number, i.client_name, i.supplier_name, i.notes, i.payment_method].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      
      let matchDate = true;
      const dateStr = i.created_at || i.due_date || ''; // fallback date
      if (mese || anno) {
         if (dateStr) {
             const [y, m] = dateStr.split('-');
             if (mese && m !== mese) matchDate = false;
             if (anno && y !== anno) matchDate = false;
         } else {
             matchDate = false;
         }
      }
      return matchDate;
    });

    // Sort
    filtered.sort((a, b) => {
      let av = a[sortKey] ?? '', bv = b[sortKey] ?? '';
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      return av < bv ? -sortDir : av > bv ? sortDir : 0;
    });

    const max = Math.ceil(filtered.length / PER) || 1;
    if (pg > max) pg = max;
    window.SessionState?.save('invoices', { pg, tab: activeTab, dir: activeDirection });
    render();
  }

  // ── Selection & Mass Actions (Mac Style) ───────────────────
  window.selectedIds = new Set();
  
  window.toggleSelection = function(e, id) {
    e.stopPropagation(); // Evita di far scattare l'onclick della riga
    if (e.target.checked) {
      window.selectedIds.add(id);
    } else {
      window.selectedIds.delete(id);
    }
    updateSelectionUI();
  };
  
  window.toggleSelectAll = function(el) {
    const isSelected = el.classList.toggle('selected');
    filtered.slice((pg-1)*PER, pg*PER).forEach(i => {
      if (isSelected) window.selectedIds.add(i.id);
      else window.selectedIds.delete(i.id);
    });
    
    // Aggiorna le checkbox individuali
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
    
    if (count > 0) {
      bar.classList.add('visible');
    } else {
      bar.classList.remove('visible');
      if (selectAllBtn) selectAllBtn.classList.remove('selected');
    }
    
    // Sincronizza lo stato visivo delle righe
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

    // Aggiorna lo stato del select all
    if (selectAllBtn) {
      const currentPageIds = filtered.slice((pg-1)*PER, pg*PER).map(i => i.id);
      const allSelected = currentPageIds.length > 0 && currentPageIds.every(id => window.selectedIds.has(id));
      if (allSelected) selectAllBtn.classList.add('selected');
      else selectAllBtn.classList.remove('selected');
    }
  };
  
  window.massDelete = async function() {
    if (window.selectedIds.size === 0) return;
    if (!confirm(`Sei sicuro di voler eliminare ${window.selectedIds.size} fatture selezionate? Questa operazione è puramente documentale e non eliminerà il file fiscale nel cassetto.`)) return;
    let success = 0;
    if (window.UI) UI.toast('Eliminazione in corso...', 'info');
    for (const id of window.selectedIds) {
      try {
        await API.Invoices.delete(id);
        success++;
      } catch (e) {
        console.error('Error delete', id, e);
      }
    }
    if (success > 0) {
      if (window.UI) UI.toast(`${success} fatture eliminate.`, 'success');
      load(true);
      window.clearSelection();
    }
  };

  window.massCategory = async function(catId) {
    if (!catId) return;
    if (window.selectedIds.size === 0) {
      const sel = $('mac-mass-action-category');
      if (sel) sel.value = '';
      return;
    }
    const catName = ALL_CATEGORIES.find(c => c.id === catId)?.name || 'selezionata';
    if (!confirm(`Spostare ${window.selectedIds.size} documenti nella categoria "${catName}"?`)) {
      const sel = $('mac-mass-action-category');
      if (sel) sel.value = '';
      return;
    }
    let success = 0;
    if (window.UI) UI.toast('Aggiornamento categoria in corso...', 'info');
    for (const id of window.selectedIds) {
      try {
        await API.put(`/invoices/${id}`, { category_id: catId });
        success++;
      } catch (e) { console.warn(e); }
    }
    if (success > 0) {
      if (window.UI) UI.toast(`${success} documenti aggiornati con successo!`, 'success');
      load(true);
      window.clearSelection();
    }
    const sel = document.getElementById('mac-mass-action-category');
    if (sel) sel.value = '';
  };

  window.updateInvoiceCategory = async function(id, catId) {
    try {
      if(window.UI) UI.toast('Aggiornamento categoria...', 'info');
      await API.put(`/invoices/${id}`, { category_id: catId || null });
      if(window.UI) UI.toast('Categoria aggiornata', 'success');
      load(true);
    } catch(err) {
      if(window.UI) UI.toast('Errore: ' + (err.message||''), 'error');
      load(true);
    }
  };

  window.duplicateInvoice = async function(id) {
    if(!confirm('Vuoi duplicare questo record?')) return;
    try {
      UI.toast('Duplicazione in corso...', 'info');
      // Re-trigger auth validation and proceed
      const res = await API.post(`/invoices/${id}/duplicate`, {});
      UI.toast('Duplicato con successo. Reindirizzamento...', 'success');
      setTimeout(() => {
         window.location.href = `admin_invoice_detail.html?id=${res.id || res.invoice_id || res.data?.id || ''}`;
      }, 800);
    } catch(err) {
      UI.toast("Errore durante la duplicazione: " + (err.message || ''), 'error');
    }
  };

  window.togglePaymentStatus = async function(id, isPaid) {
     const status = isPaid ? 'paid' : 'not_paid';
     try {
       UI.toast('Aggiornamento stato...', 'info');
       await API.put(`/invoices/${id}`, { payment_status: status });
       UI.toast('Stato aggiornato', 'success');
       load(true);
     } catch(err) {
       UI.toast('Errore: ' + (err.message||''), 'error');
       load(true); // reload to visually reset switch on failure
     }
  };

  window.deleteInvoice = async function(id) {
    if(!confirm('Eliminare definitivamente il record?')) return;
    try {
      UI.toast('Eliminazione in corso...', 'info');
      if (API.Invoices && API.Invoices.delete) {
        await API.Invoices.delete(id);
      } else if (API.Invoices && API.Invoices.remove) {
        await API.Invoices.remove(id);
      } else {
        await API.del(`/invoices/${id}`);
      }
      UI.toast('Record eliminato', 'success');
      load();
    } catch (err) {
      UI.toast('Errore: ' + (err.message || ''), 'error');
    }
  };

  const GRID = '2fr 1fr 1.4fr 1fr 140px 1fr 90px 70px 90px 120px';

  function renderRow(i) {
    try {
      const isSelected = window.massSelected?.has(i.id);
      const ps     = i.payment_status || 'not_paid';
      const psInfo = PAYMENT_STATUS[ps] || PAYMENT_STATUS.not_paid;
      const pmLabel = i.payment_method ? `<span style="font-size:10px;color:var(--gray-400);">· ${PAYMENT_METHOD_LABEL[i.payment_method]||i.payment_method}</span>` : '';
      let pfBadge = i.is_proforma
        ? `<span style="font-size:10px;background:#ede9fe;color:#6d28d9;padding:2px 6px;border-radius:4px;font-weight:700;">PROFORMA</span>`
        : `<span style="font-size:10px;background:var(--gray-100);color:var(--gray-600);padding:2px 6px;border-radius:4px;font-weight:700;">FATTURA</span>`;

      if (i.status === 'processing') {
        pfBadge = `<span style="font-size:10px;background:#fffbeb;color:#d97706;padding:2px 6px;border-radius:4px;font-weight:700;">⚙️ IN ELABORAZIONE</span>`;
      }
      const overdueStyle = i.due_date && new Date(i.due_date) < new Date() && ps !== 'paid' ? 'color:#ef4444;font-weight:700;' : '';
      const windocBadge = i.windoc_id
        ? `<span style="font-size:10px;color:#059669;font-weight:600;">✅ Windoc</span>`
        : ``;
      const proofBadge = ps === 'proof_uploaded' ? `<span style="font-size:10px;background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:4px;font-weight:700;">📎 Prova</span>` : '';

      let primaryName, primarySub, secondaryName;
      
      // For inbound invoices (Acquisti), the external entity is the Supplier
      if (activeDirection === 'inbound') {
        primaryName   = i.supplier_company?.name || i.parsed_data?.supplier_name || i.supplier_name || 'Fornitore Sconosciuto';
        primarySub    = ''; // Or parsed_data email if exists
        secondaryName = i.companies?.name || 'Azienda Interna';
      } else {
        // For outbound invoices (Vendite), the external entity is the Client
        primaryName   = i.clients?.alias || i.clients?.company_name || i.clients?.name || i.client_name || 'Cliente Sconosciuto';
        primarySub    = i.clients?.email || '';
        secondaryName = i.companies?.name || 'Azienda Interna';
      }

      return `<div class="cl-row fade-in ${isSelected ? 'selected' : ''}" data-id="${i.id}"
        onclick="if(event.target.closest('button,.mac-select-btn,a,select')) return; window.location.href='admin_invoice_detail.html?id=${i.id}';"
        style="display:grid; grid-template-columns:${GRID}; align-items:center; gap:16px; padding:14px 24px; border-bottom:1px solid var(--border); cursor:pointer; transition:background .15s;">

        <!-- 1) Entity (Cliente/Fornitore) -->
        <div class="cl-col-identity" style="display:flex;gap:12px;align-items:center;min-width:0;">
          <div class="mac-select-btn ${isSelected?'selected':''}" data-id="${i.id}" onclick="window.toggleSelection(event,'${i.id}')" style="flex-shrink:0;">
            <div class="mac-checkbox"></div>
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:700;color:var(--gray-900);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${primaryName}</div>
            ${primarySub ? `<div style="font-size:11px;color:var(--gray-500);margin-top:2px;" class="truncate">${primarySub}</div>` : ''}
          </div>
        </div>

        <!-- 2) Emittente / Controparte -->
        <div style="min-width:0;">
          <div style="font-size:12px;font-weight:600;color:var(--gray-700);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${secondaryName}</div>
        </div>

        <!-- 3) Numero / Tipo -->
        <div style="min-width:0;">
          <div style="font-size:12px;font-weight:600;color:var(--gray-800);">${i.number ? `#${i.number}` : 'Da assegnare'}</div>
          <div style="margin-top:3px;display:flex;flex-wrap:wrap;gap:3px;">
            ${pfBadge}
            ${i.contracts?.title ? `<span style="font-size:10px;color:#6366f1;font-weight:600;">📄 ${i.contracts.title}</span>` : ''}
            ${i.quotes?.number ? `<span style="font-size:10px;color:#0891b2;font-weight:600;">🧾 Prev. #${i.quotes.number}</span>` : ''}
          </div>
        </div>

        <!-- 4) Scadenza -->
        <div style="min-width:0;">
          <div style="font-size:12px;color:var(--gray-500);">Ems: <span style="font-weight:600;">${i.issue_date ? UI.date(i.issue_date) : ''}</span></div>
          <div style="font-size:12px;color:var(--gray-500);margin-top:2px;">Scad: <span style="font-weight:600;${overdueStyle}">${i.due_date ? UI.date(i.due_date) : ''}</span></div>
        </div>

        <!-- 5) Stato -->
        <div style="display:flex;flex-direction:column;gap:4px;">
          <div><span class="pill ${psInfo.cls}">${psInfo.label}</span></div>
          <div style="font-size:10px;display:flex;gap:4px;flex-wrap:wrap;align-items:center;">${pmLabel}${proofBadge}${windocBadge}</div>
        </div>

        <!-- 5.5) Categoria -->
        <div style="min-width:0;" onclick="event.stopPropagation()">
          <select style="font-size:12px; font-weight:600; color:${i.invoice_categories?.color || 'var(--gray-600)'}; border:none; background:transparent; cursor:pointer;" onchange="window.updateInvoiceCategory('${i.id}', this.value)">
            <option value="" style="color:var(--gray-600);">-</option>
            ${ALL_CATEGORIES.map(c => `<option value="${c.id}" ${i.category_id === c.id ? 'selected' : ''} style="color:${c.color||'black'};">${c.name}</option>`).join('')}
          </select>
        </div>

        <!-- 6) Importo -->
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
          <span style="font-size:13px;font-weight:700;color:var(--gray-900);">${UI.currency(i.parsed_data?.totals?.taxable_amount || i.total || i.amount || 0)}</span>
        </div>
        
        <!-- 7) IVA -->
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
          <span style="font-size:13px;font-weight:600;color:var(--gray-600);">${i.parsed_data?.totals?.vat_amount != null ? UI.currency(i.parsed_data.totals.vat_amount) : '-'}</span>
        </div>

        <!-- 8) Totale -->
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
          <span style="font-size:13px;font-weight:700;color:var(--gray-900);">${UI.currency(i.total || i.amount || 0)}</span>
        </div>

        <!-- 9) Azioni -->
        <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;" onclick="event.stopPropagation()">
          <!-- Switch Pagamento -->
          <div title="${ps==='paid' ? 'Segna non pagata' : 'Segna pagata'}" style="width:36px; height:20px; border-radius:20px; background:${ps==='paid'?'#34c759':'#e5e5ea'}; position:relative; cursor:pointer; transition:.3s; margin-right:4px;" onclick="event.stopPropagation(); window.togglePaymentStatus('${i.id}', ${ps!=='paid'})">
            <div style="width:16px; height:16px; background:#fff; border-radius:50%; position:absolute; top:2px; left:2px; transform:${ps==='paid'?'translateX(16px)':'none'}; transition:.3s; box-shadow:0 1px 2px rgba(0,0,0,.2);"></div>
          </div>
          
          <!-- Duplica -->
          <div title="Duplica" style="cursor:pointer; font-size:16px; margin-right:4px; opacity:0.8; transition:opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.8" onclick="event.stopPropagation(); window.duplicateInvoice('${i.id}')">
            📄
          </div>
          
          <!-- Elimina -->
          <div title="Elimina" style="cursor:pointer; font-size:16px; opacity:0.8; transition:opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.8" onclick="event.stopPropagation(); window.deleteInvoice('${i.id}')">
            🗑️
          </div>
        </div>
      </div>`;
    } catch (e) {
      console.error("Error rendering row:", i, e);
      return `<div style="padding:10px; color:red; grid-column:1/-1;">Errore: ${e.message}<br><pre style="font-size:10px;">${e.stack}</pre></div>`;
    }
  }

  function render() {
    if (!list) return;
    if (!filtered.length) {
      list.innerHTML = `<div class="list-card">${UI.createEmptyState(null, ALL.length ? 'Nessun record corrisponde ai filtri.' : 'Nessuna fattura presente.')}</div>`;
      if (secPF) secPF.style.display = 'none';
      if (secFT) secFT.style.display = 'none';
      if (info) info.textContent = ''; if (pag) pag.innerHTML = ''; return;
    }
    list.innerHTML = '';

    const slice = filtered.slice((pg-1)*PER, pg*PER);
    const pfRows = slice.filter(i => i.is_proforma);
    const ftRows = slice.filter(i => !i.is_proforma);

    if (pfRows.length) {
      if (secPF) { secPF.style.display = ''; const c = $('inv-section-proforma-count'); if(c) c.textContent = `${pfRows.length} record`; }
      if (listPF) listPF.innerHTML = pfRows.map(renderRow).join('');
    } else {
      if (secPF) secPF.style.display = 'none';
    }

    if (ftRows.length) {
      if (secFT) { secFT.style.display = ''; const c = $('inv-section-fatture-count'); if(c) c.textContent = `${ftRows.length} record`; }
      if (listFT) listFT.innerHTML = ftRows.map(renderRow).join('');
    } else {
      if (secFT) secFT.style.display = 'none';
    }

    const s=(pg-1)*PER+1, e=Math.min(pg*PER,filtered.length);
    if (info) info.textContent = `${s}–${e} di ${filtered.length}`;
    UI.pagination(pag, null, pg, filtered.length, PER, p => { pg=p; render(); window.updateSelectionUI(); });
    setTimeout(() => { if(window.updateSelectionUI) window.updateSelectionUI(); }, 10);
  }

  // ── Modal ──────────────────────────────────────────────────
  // preset: { client_id, onboarding_id } used when opening from other modules
  async function openModal(isProforma = false, preset = null) {
    if (!modal) return;
    const titleEl = $('inv-modal-title');
    if (titleEl) titleEl.textContent = isProforma ? 'Nuova Proforma' : 'Nuova Fattura';
    // Reset state modale serv+ricorrenze
    const recToggle = $('inv-is-recurring');
    if (recToggle) { recToggle.checked = false; recToggle.dispatchEvent(new Event('change')); }
    const pfFlag = $('inv-is-proforma');
    
    // Mostriamo la sezione ricorrenze solo se is_proforma = 1 (La ricorrenza è tipicamente un contratto/proforma)
    const recSect = $('inv-recurrence-section');
    if (recSect) recSect.style.display = isProforma ? 'block' : 'none';

    if (pfFlag) pfFlag.value = isProforma ? '1' : '0';
    const cl  = $('inv-client');
    const onb = $('inv-onboarding-id');
    const amt = $('inv-amount');
    const dsc = $('inv-desc');
    const nxt = $('inv-recurrence-next');
    
    if (amt) amt.value = '';
    if (dsc) dsc.value = '';
    if ($('inv-number')) $('inv-number').value = '';
    if ($('inv-issue-date')) $('inv-issue-date').value = '';
    
    // Pulizia lista servizi
    const servSect = $('inv-services-section');
    const servList = $('inv-client-services-list');
    if(servSect) servSect.style.display = 'none';
    if(servList) servList.innerHTML = '<div style="font-size:13px;color:#6b7280;text-align:center;">Seleziona un cliente per caricare i servizi.</div>';

    if (cl)  cl.innerHTML  = '<option value="">Caricamento…</option>';
    if (onb) onb.innerHTML = '<option value="">Nessuno</option>';
    const supp = $('inv-supplier-creation');
    if (supp) supp.innerHTML = '<option value="">(Stessa azienda attuale)</option>';
    const cont = $('inv-contract-id');
    if (cont) cont.innerHTML = '<option value="">Nessun contratto</option>';

    modal.classList.add('open');
    try {
      const [clientsRes, onbRes, compRes] = await Promise.all([
        API.Clients.list(activeDirection === 'inbound' ? { is_supplier: true } : { status: 'active' }).catch(() => []),
        API.Onboarding.list().catch(() => []),
        API.get('/companies/mine').catch(() => []).then(r => r.data || r || []), // Fallback to try fetch companies
      ]);
      const clients = Array.isArray(clientsRes) ? clientsRes : (clientsRes?.items ?? clientsRes?.data ?? []);
      const onbs    = Array.isArray(onbRes)     ? onbRes     : (onbRes?.items    ?? onbRes?.data    ?? []);
      const comps   = Array.isArray(compRes)    ? compRes    : [];

      if (activeDirection === 'inbound') {
         const lbl1 = cl.closest('.form-group').querySelector('label');
         if (lbl1) lbl1.innerHTML = 'Fornitore Emittente *';
         const lbl2 = supp.closest('.form-group').querySelector('label');
         if (lbl2) lbl2.innerHTML = 'Azienda Ricevente *';
         const subLbl = supp.closest('.form-group').querySelector('div');
         if (subLbl) subLbl.innerHTML = 'Seleziona l\'azienda interna che sta subendo la fattura.';
         if (supp) {
             supp.disabled = false;
             supp.style.backgroundColor = '';
             supp.innerHTML = '<option value="">Seleziona azienda ricevente...</option>' + comps.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
         }
      } else {
         const lbl1 = cl.closest('.form-group').querySelector('label');
         if (lbl1) lbl1.innerHTML = 'Cliente *';
         const lbl2 = supp.closest('.form-group').querySelector('label');
         if (lbl2) lbl2.innerHTML = 'Azienda Fornitrice';
         const subLbl = supp.closest('.form-group').querySelector('div');
         if (subLbl) subLbl.innerHTML = 'Dato recuperato in automatico dalla scheda Cliente o Prospect.';
         if (supp) {
             supp.disabled = true;
             supp.style.backgroundColor = '#f9fafb';
             supp.innerHTML = '<option value="">(Stessa azienda attuale)</option>' + comps.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
         }
      }

      if (cl) cl.innerHTML = '<option value="">' + (activeDirection === 'inbound' ? 'Seleziona fornitore...' : 'Seleziona cliente...') + '</option>' +
        clients.map(c => `<option value="${c.id}">${c.company_name || c.name || c.email}</option>`).join('');

      if (onb) {
        onb.innerHTML = '<option value="">Nessuno</option>' +
          onbs
            .filter(o => !['attivo','abbandonato','annullato','cancelled'].includes(o.status))
            .map(o => {
              const label = o.company_name || o.clients?.name || o.reference_name || o.status;
              return `<option value="${o.id}">${label}</option>`;
            })
            .join('');
      }

      if (preset?.client_id && cl) { cl.value = preset.client_id; cl.dispatchEvent(new Event('change')); }
      if (preset?.onboarding_id && onb) onb.value = preset.onboarding_id;

      const due = $('inv-due');
      if (due) { const d = new Date(); d.setDate(d.getDate() + 30); due.value = d.toISOString().split('T')[0]; }
      const nxt = $('inv-recurrence-next');
      if (nxt) { const d = new Date(); d.setDate(d.getDate() + 30); nxt.value = d.toISOString().split('T')[0]; }
      
      const qSel = $('inv-quote-id'); if (qSel) qSel.innerHTML = '<option value="">Nessuno</option>';
      const cSel = $('inv-contract-id'); if (cSel) cSel.innerHTML = '<option value="">Nessuno</option>';
      const sSel = $('inv-supplier-creation'); if (sSel) sSel.innerHTML = '<option value="">Assegnata in base al cliente...</option>';
    } catch (e) { UI.toast('Errore caricamento dati modal', 'error'); }
  }

  $('btn-save-invoice')?.addEventListener('click', async () => {
    const cid = $('inv-client')?.value, amt = parseFloat($('inv-amount')?.value), due = $('inv-due')?.value;
    if (!cid || isNaN(amt) || !due) { UI.toast('Cliente, importo e scadenza sono obbligatori', 'warning'); return; }
    const isProforma  = $('inv-is-proforma')?.value === '1';
    const method      = $('inv-payment-method')?.value || null;
    const onboardingId = $('inv-onboarding-id')?.value || null;
    const contractId   = $('inv-contract-id')?.value || null;
    const quoteId      = $('inv-quote-id')?.value || null;
    const supCompId    = $('inv-supplier-creation')?.value || null;
    const btn = $('btn-save-invoice'); if (btn) btn.disabled = true;
    
    // Raccolta Dati Servizi/Ricorrenza
    const serviceIds = Array.from(document.querySelectorAll('.inv-service-cb:checked')).map(cb => cb.value);
    const recToggle  = $('inv-is-recurring')?.checked;
    
    if (activeDirection === 'inbound' && !supCompId) {
        UI.toast('Seleziona l\'Azienda Ricevente', 'warning');
        return;
    }
    
    // Payload Base
    const payload = {
      client_id:    cid,
      direction:    activeDirection === 'inbound' ? 'inbound' : 'outbound',
      total:        amt, 
      amount:       amt, 
      total_amount: amt,
      due_date:     due,
      number:       $('inv-number')?.value?.trim() || null,
      issue_date:   $('inv-issue-date')?.value || null,
      notes:        $('inv-desc')?.value?.trim() || null,
      is_proforma:  isProforma,
      payment_method:  method      || undefined,
      onboarding_id:   onboardingId || undefined,
      contract_id:     contractId || undefined,
      quote_id:        quoteId || undefined,
      supplier_company_id: activeDirection === 'inbound' ? undefined : (supCompId || undefined),
      company_id:      activeDirection === 'inbound' ? supCompId : (supCompId || window.SessionState?.company_id || undefined),
      service_ids:     serviceIds.length ? serviceIds : undefined
    };

    // Estensione Payload Abbonamento / Ricorrenza
    if (recToggle && isProforma) {
      payload.is_recurring = true;
      payload.recurrence_frequency = $('inv-recurrence-freq')?.value || 'monthly';
      payload.next_recurrence_date = $('inv-recurrence-next')?.value || due;
      payload.auto_send = ($('inv-recurrence-mode')?.value === 'auto');
    }

    try {
      await API.Invoices.create({ body: payload, lines: [] });
      UI.toast(isProforma ? 'Proforma (e ricorrenza) creata' : 'Fattura creata', 'success');
      modal?.classList.remove('open');
      await load();
    } catch (e) { UI.toast(e?.message || 'Errore', 'error'); }
    finally { if (btn) btn.disabled = false; }
  });

  // ── Row actions ────────────────────────────────────────────
  window.markPaid = async id => {
    if (!confirm('Segnare come pagata?')) return;
    try {
      await API.Invoices.markPaid(id);
      ALL = ALL.map(i => i.id===id ? {...i, status:'paid', payment_status:'paid', paid_at:new Date().toISOString()} : i);
      updateKpis(); applyFilters(); UI.toast('Fattura segnata come pagata','success');
    } catch(e) { UI.toast(e?.message||'Errore','error'); }
  };

  window.reviewPayment = async (id, newStatus) => {
    const labels = { paid: 'confermare il pagamento', under_review: 'spostare in verifica', not_paid: 'riportare a non pagata' };
    if (!confirm(`Vuoi ${labels[newStatus]||newStatus}?`)) return;
    try {
      await API.Invoices.reviewPayment(id, { payment_status: newStatus });
      ALL = ALL.map(i => i.id===id ? {...i, payment_status: newStatus, ...(newStatus==='paid'?{status:'paid',paid_at:new Date().toISOString()}:{})} : i);
      updateKpis(); applyFilters(); UI.toast('Stato pagamento aggiornato','success');
    } catch(e) { UI.toast(e?.message||'Errore','error'); }
  };

  window.confirmAndSync = async id => {
    if (!confirm('Vuoi confermare il pagamento e generare la fattura Windoc in un clic?')) return;
    try {
      UI.toast('Conferma e sincronizzazione in corso...', 'info');
      const res = await API.post(`/invoices/${id}/confirm-and-sync`, { payment_status: 'paid' });
      const wd = res.windoc || {};
      if (wd.success) {
        UI.toast('Fattura Windoc generata con successo!', 'success');
      } else {
        UI.toast('Pagamento confermato, ma errore Windoc: ' + (wd.message||'Sconosciuto'), 'warning');
      }
      await load();
    } catch(e) { UI.toast(e?.message||"Errore durante l'operazione", 'error'); }
  };

  window.sendReminder = async id => {
    try { await API.Invoices.sendReminder(id); UI.toast('Sollecito inviato','success'); }
    catch(e) { UI.toast(e?.message||'Errore','error'); }
  };

  window.syncWindoc = async id => {
    try { await API.post(`/invoices/${id}/push-windoc`,{}); UI.toast('Sync Windoc avviata','info'); await load(); }
    catch(e) { UI.toast(e?.message||'Errore Windoc','error'); }
  };

  window.onPageReady(async () => {
    await I18n.init('lang-switcher-slot');
    load();
    // URL param support: ?new=1[&type=proforma][&client_id=<id>][&onboarding=<id>]
    const params = new URLSearchParams(location.search);
    if (params.get('new') === '1') {
      const isProforma = params.get('type') === 'proforma';
      const preset = {};
      if (params.get('client_id'))  preset.client_id     = params.get('client_id');
      if (params.get('onboarding')) preset.onboarding_id = params.get('onboarding');
      openModal(isProforma, Object.keys(preset).length ? preset : null);
    }
  });
})();
