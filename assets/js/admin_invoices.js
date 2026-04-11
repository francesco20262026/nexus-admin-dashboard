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
  let activeDirection = requestedTab === 'inbound' ? 'inbound' : (requestedTab === 'report' ? 'report' : (saved.dir || 'outbound'));
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
    <button class="btn btn-secondary" id="btn-gdrive-sync" style="display:none;white-space:nowrap;"><svg style="width:15px;height:15px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" /></svg> <span class="hide-mobile">Sync GDrive</span></button>
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
  
  $('btn-windoc-sync')?.addEventListener('click', () => {
    const curYear = new Date().getFullYear();
    const years = [curYear, curYear - 1, curYear - 2].map(y => `<option value="${y}">${y}</option>`).join('');
    const months = [['','Tutti i mesi'],['1','Gennaio'],['2','Febbraio'],['3','Marzo'],['4','Aprile'],['5','Maggio'],['6','Giugno'],['7','Luglio'],['8','Agosto'],['9','Settembre'],['10','Ottobre'],['11','Novembre'],['12','Dicembre']].map(([v,l]) => `<option value="${v}">${l}</option>`).join('');
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(4px);z-index:9000;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `
      <div style="background:#1c1c1e;border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:28px 32px;width:360px;box-shadow:0 24px 64px rgba(0,0,0,.6);font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;">
          <span style="font-size:22px;">🔄</span>
          <div>
            <div style="font-size:15px;font-weight:700;color:#f5f5f7;">Importa Acquisti da Windoc</div>
            <div style="font-size:12px;color:#8e8e93;margin-top:2px;">Seleziona il periodo da sincronizzare</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px;">
          <div>
            <label style="font-size:11px;font-weight:600;color:#8e8e93;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:6px;">Anno</label>
            <select id="wd-sync-anno" style="width:100%;background:#2c2c2e;color:#f5f5f7;border:1px solid rgba(255,255,255,.15);border-radius:8px;padding:9px 12px;font-size:14px;cursor:pointer;">${years}</select>
          </div>
          <div>
            <label style="font-size:11px;font-weight:600;color:#8e8e93;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:6px;">Mese</label>
            <select id="wd-sync-mese" style="width:100%;background:#2c2c2e;color:#f5f5f7;border:1px solid rgba(255,255,255,.15);border-radius:8px;padding:9px 12px;font-size:14px;cursor:pointer;">${months}</select>
          </div>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button id="wd-sync-cancel" style="padding:9px 20px;border-radius:8px;border:1px solid rgba(255,255,255,.15);background:transparent;color:#8e8e93;font-size:14px;font-weight:500;cursor:pointer;">Annulla</button>
          <button id="wd-sync-confirm" style="padding:9px 22px;border-radius:8px;border:none;background:#0a84ff;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">Importa</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    document.getElementById('wd-sync-cancel').onclick = close;
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.getElementById('wd-sync-confirm').onclick = async () => {
      const anno = document.getElementById('wd-sync-anno').value;
      const mese = document.getElementById('wd-sync-mese').value;
      close();
      UI.toast('Sincronizzazione acquisti Windoc in corso...', 'info');
      try {
        const res = await API.post('/invoices/sync-inbound-windoc', { anno, mese });
        UI.toast(`✅ Importate ${res.imported ?? 0} fatture da Windoc!`, 'success');
        setTimeout(() => { load(true); }, 1200);
      } catch (err) { console.error(err); UI.toast('Errore sync Windoc: ' + (err.message || ''), 'error'); }
    };
  });

  window.pushInvoiceWindoc = async function(id) {
    if (!await UI.confirm('Inviare questa fattura a Windoc?')) return;
    try {
      UI.toast('Invio a Windoc in corso...', 'info');
      const res = await API.post(`/invoices/${id}/windoc-push`, {});
      const wdNum = res?.data?.numero_documento || res?.data?.numero || '';
      UI.toast('✅ Fattura inviata a Windoc' + (wdNum ? ` — N° ${wdNum}` : ''), 'success');
      // Update local record so badge switches immediately
      const inv = ALL.find(i => i.id === id);
      if (inv) { inv.windoc_id = String(res?.data?.id || 'synced'); applyFilters(); }
    } catch (err) {
      UI.toast('Errore invio Windoc: ' + (err.message || ''), 'error');
    }
  };

  $('btn-gdrive-sync')?.addEventListener('click', async function() {
     const btn = this;
     btn.disabled = true;
     if (window.UI) UI.toast('Scansione GDrive avviata...', 'info');
     try {
       await API.post('/invoices/sync-gdrive', {});
       if (window.UI) UI.toast('Scansione avviata in background. Aggiorno tra 20 secondi...', 'success');
       setTimeout(() => { load(true); btn.disabled = false; }, 20000);
     } catch(e) {
       console.error('GDrive sync error:', e);
       if (window.UI) UI.toast('Errore sync GDrive: ' + (e.message || ''), 'error');
       btn.disabled = false;
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
      
      // If it's a real hyperlink, let the browser navigate normally
      if (b.tagName === 'A' || b.getAttribute('href')) return;
      
      mainTabs.querySelectorAll('.main-tab').forEach(x => {
        if (x.tagName !== 'A' && !x.getAttribute('href')) {
          x.classList.remove('active');
          x.style.borderBottomColor = 'transparent';
          x.style.color = '#6b7280';
        }
      });
      b.classList.add('active'); 
      b.style.borderBottomColor = '#0a84ff';
      b.style.color = '#111827';
      activeDirection = b.dataset.direction; 
      pg = 1; 
      
      const btnPF = $('btn-new-proforma'), btnFT = $('btn-action-icon-new-invoice');
      const btnSync = $('btn-windoc-sync'), btnPdf = $('btn-upload-pdf'), btnGdrive = $('btn-gdrive-sync');

      if (activeDirection === 'inbound') {
         if (btnPF) btnPF.style.display = 'none';
         if (btnFT) btnFT.style.display = 'inline-flex';
         if (btnGdrive) btnGdrive.style.display = 'inline-flex';
         if (btnSync) btnSync.style.display = 'none';
         if (btnPdf) btnPdf.style.display = 'inline-flex';
      } else {
         if (btnPF) btnPF.style.display = 'inline-flex';
         if (btnFT) btnFT.style.display = 'inline-flex';
         if (btnGdrive) btnGdrive.style.display = 'none';
         if (btnSync) btnSync.style.display = 'none';
         if (btnPdf) btnPdf.style.display = 'none';
      }
      load(true);
    });
    
    // trigger initial buttons layout
    if (activeDirection === 'outbound') {
        if ($('btn-new-proforma')) $('btn-new-proforma').style.display = 'inline-flex';
        if ($('btn-action-icon-new-invoice')) $('btn-action-icon-new-invoice').style.display = 'inline-flex';
    } else if (activeDirection === 'inbound') {
        if ($('btn-gdrive-sync')) $('btn-gdrive-sync').style.display = 'inline-flex';
        if ($('btn-windoc-sync')) $('btn-windoc-sync').style.display = 'none';
        if ($('btn-upload-pdf')) $('btn-upload-pdf').style.display = 'inline-flex';
        if ($('btn-action-icon-new-invoice')) $('btn-action-icon-new-invoice').style.display = 'inline-flex';
    }
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

  if (window._invoicesCmpListener) window.removeEventListener('companyChanged', window._invoicesCmpListener);
  window._invoicesCmpListener = () => load();
  window.addEventListener('companyChanged', window._invoicesCmpListener);
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
    } else {
      if(servSect) servSect.style.display = 'block';
      if(servList) servList.innerHTML = '<div style="font-size:13px;color:#6b7280;text-align:center;">Caricamento servizi...</div>';
    }
    
    // Carica contratti (per questo cliente o globale se non selezionato)
    const contSelect = $('inv-contract-id');
    if (contSelect) {
      const p = cid ? { client_id: cid } : {};
      API.Contracts.list(p).then(res => {
         const arr = Array.isArray(res) ? res : (res.data || res.items || []);
         contSelect.innerHTML = '<option value="">Nessun contratto</option>' + arr.map(c => `<option value="${c.id}">${c.title || c.number || (c.document_templates && c.document_templates.name) || (c.onboarding && c.onboarding.company_name) || c.id.substring(0,8)}</option>`).join('');
      }).catch(e => {
         console.error('Errore caricamento contratti:', e);
         contSelect.innerHTML = '<option value="">Nessun contratto</option>';
      });
    }

    // Preseleziona fornitore basato su company_id del cliente
    const supSelect = $('inv-supplier-creation');
    if (cid && supSelect) {
      API.Clients.get(cid).then(res => {
         if (res && res.company_id) supSelect.value = res.company_id;
      }).catch(e => console.error('Errore preselezione fornitore', e));
    } else if (supSelect) {
      supSelect.value = '';
    }

    // Carica preventivi
    const quoteSelect = $('inv-quote-id');
    if (quoteSelect) {
      const p = cid ? { client_id: cid } : {};
      API.Quotes.list(p).then(res => {
         const arr = Array.isArray(res) ? res : (res.data || res.items || []);
         quoteSelect.innerHTML = '<option value="">Nessun preventivo</option>' + arr.map(q => `<option value="${q.id}">${q.number||''} ${q.title||''}</option>`).join('');
      }).catch(e => quoteSelect.innerHTML = '<option value="">Nessun preventivo</option>');
    }

    if (!cid) return; // Fine early return per servizi se cid vuoto

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

  $('inv-onboarding-id')?.addEventListener('change', async (e) => {
    const oid = e.target.value;
    if (!oid) return; // Se vuoto, non fare nulla (lascia i valori del cliente se ci sono)

    // Carica contratti per questo onboarding
    const contSelect = $('inv-contract-id');
    if (contSelect) {
      // Nota: list_contracts API bypassa onboarding_id se non è filterato backend-side, ma passiamo comunque il param 
      // tramite array/object o fetch nativa.
      API.Contracts.list({ onboarding_id: oid }).then(res => {
         const arr = Array.isArray(res) ? res : (res.data || res.items || []);
         contSelect.innerHTML = '<option value="">Nessun contratto</option>' + arr.map(c => `<option value="${c.id}">${c.title || c.number || (c.document_templates && c.document_templates.name) || (c.onboarding && c.onboarding.company_name) || c.id.substring(0,8)}</option>`).join('');
      }).catch(e => contSelect.innerHTML = '<option value="">Nessun contratto</option>');
    }

    // Preseleziona fornitore e cliente basato su onboarding
    const supSelect = $('inv-supplier-creation');
    API.Onboarding.get(oid).then(res => {
       if (res) {
          if (res.company_id && supSelect) {
             supSelect.value = res.company_id;
          }
          if (res.client_id) {
             const cSel = $('inv-client');
             if (cSel && (!cSel.value || cSel.value === '')) cSel.value = res.client_id;
          }
       }
    }).catch(e => console.error('Errore preselezione fornitore/cliente da onboarding', e));

    // Carica preventivi
    const quoteSelect = $('inv-quote-id');
    if (quoteSelect) {
      API.Quotes.list({ onboarding_id: oid }).then(res => {
         const arr = Array.isArray(res) ? res : (res.data || res.items || []);
         quoteSelect.innerHTML = '<option value="">Nessun preventivo</option>' + arr.map(q => `<option value="${q.id}">${q.number||''} ${q.title||''}</option>`).join('');
      }).catch(e => quoteSelect.innerHTML = '<option value="">Nessun preventivo</option>');
    }
  });

  $('inv-quote-id')?.addEventListener('change', async (e) => {
    const quoteId = e.target.value;
    if (!quoteId) return;
    try {
      const quote = await API.Quotes.get(quoteId);
      if (!quote) return;
      
      const amtEl = $('inv-amount');
      const qTotal = quote.total_amount ?? quote.total ?? quote.amount ?? 0;
      if (amtEl && qTotal !== undefined) {
         amtEl.value = Number(qTotal).toFixed(2);
      }
      
      const descEl = $('inv-desc');
      if (descEl) descEl.value = 'Rif. preventivo ' + (quote.number ? quote.number + ' ' : '') + (quote.title || '');
      
      if (quote.client_id) {
          const cSel = $('inv-client');
          if (cSel) cSel.value = quote.client_id;
      }
      if (quote.onboarding_id) {
          const oSel = $('inv-onboarding-id');
          if (oSel) oSel.value = quote.onboarding_id;
      }
      if (quote.supplier_company_id) {
          const sSel = $('inv-supplier-creation');
          if (sSel) sSel.value = quote.supplier_company_id;
      }

      const contractSel = $('inv-contract-id');
      if (contractSel) {
        let contracts = await API.Contracts.list({ quote_id: quoteId }).catch(() => []);
        contracts = Array.isArray(contracts) ? contracts : (contracts.data || contracts.items || []);
        
        if (contracts.length > 0) {
          const c = contracts[0];
          if (!Array.from(contractSel.options).find(opt => opt.value === c.id)) {
            contractSel.add(new Option(`Contratto (rif. ${c.number || c.title || (c.document_templates && c.document_templates.name) || c.id.substring(0,8)})`, c.id));
          }
          contractSel.value = c.id;
        } else {
           // Create missing contract automatically
           const newContract = await API.Contracts.create({
              quote_id: quoteId,
              client_id: quote.client_id || $('inv-client')?.value || null,
              onboarding_id: quote.onboarding_id || $('inv-onboarding-id')?.value || null,
              supplier_company_id: quote.supplier_company_id || $('inv-supplier-creation')?.value || null,
              title: 'Contratto da ' + (quote.number || 'Prev'),
              status: 'active',
              total: quote.total,
           }).catch(err => { console.warn('Errore auto-creazione contratto', err); return null; });
           
           if (newContract && newContract.id) {
              contractSel.add(new Option(`Nuovo Contratto (${newContract.title || newContract.id.substring(0,6)})`, newContract.id));
              contractSel.value = newContract.id;
              UI.toast('Contratto generato automaticamente!', 'success');
           }
        }
      }
    } catch(err) {
      console.error(err);
    }
  });

  async function load() {
    if (!list) return;
    list.innerHTML = UI.skeletonCardList(5);
    if (listPF) listPF.innerHTML = '';
    if (listFT) listFT.innerHTML = '';
    if (secPF) secPF.style.display = 'none';
    if (secFT) secFT.style.display = 'none';
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
        client_name:   i.clients?.alias || i.clients?.company_name || i.clients?.name || i.client_name || '',
        supplier_name: i.direction === 'inbound' 
                         ? (i.clients?.alias || i.clients?.company_name || i.clients?.name || i.parsed_data?.supplier_name || i.supplier_name || '') 
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
      fCategory.innerHTML = `<option value="">Tutte le categorie</option><option value="EMPTY">Senza Categoria</option>` + names.map(n => `<option value="${n}">${n}</option>`).join('');
      if (prev) fCategory.value = prev;
    }
    
    // Also populate mass action dropdown using ALL_CATEGORIES fetched from API
    const massSel = document.getElementById('mac-mass-action-category');
    if (massSel && ALL_CATEGORIES && ALL_CATEGORIES.length > 0) {
      const massPrev = massSel.value;
      massSel.innerHTML = `<option value="" style="color:black;">Cambia Categoria</option>` + ALL_CATEGORIES.map(c => `<option style="color:black;" value="${c.id}">${c.name}</option>`).join('');
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
    
    set('kpi-inv-to_invoice',   ALL.filter(i => i.is_proforma && !ALL.some(inv => inv.proforma_id === i.id && !inv.is_proforma)).length);
    set('kpi-inv-sync_failed',  ALL.filter(i => i.windoc_sync_status === 'error').length);
    set('kpi-inv-windoc',       ALL.filter(i => i.windoc_id != null).length);
  }

  window.applyFilters = applyFilters;
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
      
      if (activeTab === 'to_invoice') {
         if (!i.is_proforma) return false;
         const childFattura = ALL.find(inv => inv.proforma_id === i.id && !inv.is_proforma);
         if (childFattura) return false; 
      }
      if (activeTab === 'sync_failed'    && i.windoc_sync_status !== 'error') return false;
      if (activeTab === 'windoc'         && !i.windoc_id) return false;
      
      const matchName = activeDirection === 'inbound' ? i.supplier_name : i.client_name;
      if (cl  && matchName !== cl) return false;
      
      if (cat === 'EMPTY') {
          if (i.invoice_categories?.name) return false;
      } else if (cat) {
          if ((i.invoice_categories?.name || '') !== cat) return false;
      }
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
      if (window.selectedIds.has(id)) {
        window.selectedIds.delete(id);
      } else {
        window.selectedIds.add(id);
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
    if (!await UI.confirm(`Sei sicuro di voler eliminare ${window.selectedIds.size} fatture selezionate? Questa operazione è puramente documentale e non eliminerà il file fiscale nel cassetto.`)) return;
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
    if (catId === '') return; // placeholder, not selected yet
    if (window.selectedIds.size === 0) {
      const sel = $('mac-mass-action-category');
      if (sel) sel.value = '';
      return;
    }
    const isRemove = catId === 'NONE';
    const catName = isRemove ? 'Nessuna' : (ALL_CATEGORIES.find(c => c.id === catId)?.name || 'selezionata');
    const msg = isRemove
      ? `Rimuovere la categoria da ${window.selectedIds.size} documenti?`
      : `Spostare ${window.selectedIds.size} documenti nella categoria "${catName}"?`;
    if (!await UI.confirm(msg)) {
      const sel = $('mac-mass-action-category');
      if (sel) sel.value = '';
      return;
    }
    let success = 0;
    if (window.UI) UI.toast('Aggiornamento categoria in corso...', 'info');
    for (const id of window.selectedIds) {
      try {
        await API.put(`/invoices/${id}`, { category_id: isRemove ? null : catId });
        success++;
      } catch (e) { console.warn(e); }
    }
    if (success > 0) {
      if (window.UI) UI.toast(`${success} documenti aggiornati!`, 'success');
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
    if(!await UI.confirm('Vuoi duplicare questo record?')) return;
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
     // Optimistic update UI immediately
     const idx = ALL.findIndex(i => i.id === id);
     if (idx > -1) ALL[idx].payment_status = status;
     applyFilters();
     try {
       await API.put(`/invoices/${id}`, { payment_status: status });
       UI.toast('Stato aggiornato', 'success');
     } catch(err) {
       // Revert on failure
       if (idx > -1) ALL[idx].payment_status = !isPaid ? 'paid' : 'not_paid';
       applyFilters();
       UI.toast('Errore: ' + (err.message||''), 'error');
     }
  };

  window.deleteInvoice = async function(id) {
    if(!await UI.confirm('Eliminare definitivamente il record?')) return;
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

  const GRID = 'minmax(130px, 1.5fr) 60px 80px minmax(90px, 1.2fr) 75px 75px 110px 60px minmax(80px, 1fr) 80px 55px 80px 180px';

  function renderRow(i) {
    try {
      const isSelected = window.massSelected?.has(i.id);
      const ps     = i.payment_status || 'not_paid';
      const psInfo = PAYMENT_STATUS[ps] || PAYMENT_STATUS.not_paid;
      const pmLabel = i.payment_method ? `<span style="font-size:10px;color:var(--gray-400);">· ${PAYMENT_METHOD_LABEL[i.payment_method]||i.payment_method}</span>` : '';
      let pfBadge = i.is_proforma
        ? `<span style="font-size:11px;background:#ede9fe;color:#6d28d9;padding:3px 8px;border-radius:4px;font-weight:800;letter-spacing:0.5px;display:inline-block;">PROFORMA</span>`
        : `<span style="font-size:11px;background:#e0f2fe;color:#0369a1;padding:3px 8px;border-radius:4px;font-weight:800;letter-spacing:0.5px;display:inline-block;">FATTURA</span>`;

      if (i.status === 'processing') {
        pfBadge += `<span style="font-size:10px;background:#fffbeb;color:#d97706;padding:2px 6px;border-radius:4px;font-weight:700;">⚙️ IN ELB.</span>`;
      }
      const overdueStyle = i.due_date && new Date(i.due_date) < new Date() && ps !== 'paid' ? 'color:#ef4444;font-weight:700;' : '';
      const proofBadge = ps === 'proof_uploaded' ? `<span style="font-size:10px;background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:4px;font-weight:700;">📎 Prova</span>` : '';

      let primaryName, primarySub, secondaryName;
      
      // For inbound invoices (Acquisti), the external entity is the Supplier
      if (activeDirection === 'inbound') {
        primaryName   = i.clients?.alias || i.clients?.company_name || i.clients?.name || i.parsed_data?.supplier_name || i.supplier_name || 'Fornitore Sconosciuto';
        primarySub    = ''; // Or parsed_data email if exists
        secondaryName = i.companies?.name || 'Azienda Interna';
      } else {
        // For outbound invoices (Vendite), the external entity is the Client
        primaryName   = i.clients?.alias || i.clients?.company_name || i.clients?.name || i.client_name || 'Cliente Sconosciuto';
        primarySub    = i.clients?.email || '';
        secondaryName = i.companies?.name || 'Azienda Interna';
      }

      let secondaryBadge = 'INT';
      if (secondaryName) {
        if (secondaryName.toUpperCase().includes('IT SERVICES')) secondaryBadge = 'ITS';
        else if (secondaryName.toUpperCase().includes('DELOCA')) secondaryBadge = 'DLC';
        else secondaryBadge = secondaryName.substring(0, 3).toUpperCase();
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
        <div style="min-width:0; display:flex; align-items:center;">
          <div title="${secondaryName}" style="font-size:11px;font-weight:700;color:var(--gray-600);background:var(--gray-100);padding:2px 6px;border-radius:4px;cursor:help;">${secondaryBadge}</div>
        </div>

        <!-- NEW 2.5) Origine -->
        <div style="min-width:0;">
          <div style="display:flex;flex-direction:column;gap:3px;">
            ${i.contracts?.title ? `<span style="font-size:10px;color:#6366f1;font-weight:700;" title="${i.contracts.title}" class="truncate">Contr: ${i.contracts.title}</span>` : ''}
            ${i.quotes?.number ? `<span style="font-size:10px;color:#0891b2;font-weight:700;" class="truncate">Prev: #${i.quotes.number}</span>` : ''}
            ${!i.contracts?.title && !i.quotes?.number ? `<span style="font-size:10px;color:var(--gray-400);font-weight:600;">(Manuale)</span>` : ''}
          </div>
        </div>

        <!-- 3) Numero / Tipo -->
        <div style="min-width:0;">
          <div style="margin-bottom:4px;">
            ${pfBadge}
          </div>
          <div style="font-size:12px;font-weight:700;color:var(--gray-900);">${i.number ? `N. ${i.number}` : 'Da assegnare'}</div>
          
          ${(function(){
              if (i.is_proforma) {
                  const childFattura = ALL.find(inv => inv.proforma_id === i.id && !inv.is_proforma);
                  if (childFattura) {
                      return `<div style="margin-top:6px;" onclick="event.stopPropagation();window.location.href='admin_invoice_detail.html?id=${childFattura.id}'"><span style="font-size:11px;color:#0d9488;background:#ccfbf1;padding:2px 6px;border-radius:4px;font-weight:700;cursor:pointer;">🔗 Fatturata con #${childFattura.number || childFattura.windoc_number || '?'}</span></div>`;
                  }
              } else if (i.proforma_id) {
                  const parentProforma = ALL.find(inv => inv.id === i.proforma_id);
                  if (parentProforma) {
                      return `<div style="margin-top:6px;" onclick="event.stopPropagation();window.location.href='admin_invoice_detail.html?id=${parentProforma.id}'"><span style="font-size:11px;color:#c026d3;background:#fae8ff;padding:2px 6px;border-radius:4px;font-weight:700;cursor:pointer;">↳ Da proforma #${parentProforma.number || '?'}</span></div>`;
                  }
              }
              return '';
          })()}
        </div>

        <!-- 3.5) Emissione -->
        <div style="min-width:0;">
          <div style="font-size:13px;color:var(--gray-900);font-weight:600;">${i.issue_date ? UI.date(i.issue_date) : '-'}</div>
        </div>

        <!-- 4) Scadenza -->
        <div style="min-width:0;">
          <div style="font-size:13px;color:var(--gray-900);font-weight:600;${overdueStyle}">${i.due_date ? UI.date(i.due_date) : '-'}</div>
        </div>

        <!-- 5) Stato -->
        <div style="display:flex;flex-direction:column;gap:4px;">
          <div><span class="pill ${psInfo.cls}">${psInfo.label}</span></div>
          <div style="font-size:10px;display:flex;gap:4px;flex-wrap:wrap;align-items:center;">${pmLabel}${proofBadge}</div>
        </div>

        <!-- NEW 5.5) SYNC WINDDOC -->
        <div style="min-width:0;">
          <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-start;">
          ${(function(){
              if (activeDirection === 'inbound') return '<span style="color:#9ca3af;font-size:11px;">-</span>';
              if (i.windoc_id) {
                  return `<span style="font-size:10px;background:#d1fae5;color:#065f46;padding:2px 6px;border-radius:4px;font-weight:800;letter-spacing:0.5px;">OK WD</span>`;
              }
              if (i.windoc_sync_status === 'error') {
                  return `<span style="font-size:10px;background:#fee2e2;color:#b91c1c;padding:2px 6px;border-radius:4px;font-weight:800;">ERRORE</span>
                          <button onclick="event.stopPropagation();window.pushInvoiceWindoc('${i.id}')" style="font-size:9px;background:#fff;border:1px solid #fecaca;color:#dc2626;border-radius:4px;padding:2px 4px;cursor:pointer;font-weight:700;">↻ RIPROVA</button>`;
              }
              if (i.windoc_sync_status === 'pending' || i.windoc_sync_status === 'processing') {
                  return `<span style="font-size:10px;background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:4px;font-weight:800;">IN CORSO</span>`;
              }
              if (!i.is_proforma) {
                  return `<button onclick="event.stopPropagation();window.pushInvoiceWindoc('${i.id}')" title="Sincronizza" style="font-size:10px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:4px;padding:2px 6px;cursor:pointer;font-weight:800;">↑ INVIA WD</button>`;
              }
              return '<span style="color:#9ca3af;font-size:11px;">-</span>';
          })()}
          </div>
        </div>

        <!-- 5.5) Categoria -->
        <div class="mac-cat-row-wrap" onclick="event.stopPropagation()">
          ${i.invoice_categories ? `<span class="mac-cat-dot" style="background:${i.invoice_categories.color||'#6b7280'};"></span>` : '<span class="mac-cat-dot" style="background:#e5e7eb;"></span>'}
          <select class="mac-cat-row-select" onchange="window.updateInvoiceCategory('${i.id}', this.value || null)">
            <option value="" ${!i.category_id ? 'selected' : ''}>— nessuna —</option>
            ${ALL_CATEGORIES.map(c => `<option value="${c.id}" ${i.category_id === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
          </select>
        </div>


        <!-- 6) Importo -->
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
          <span style="font-size:13px;font-weight:700;color:var(--gray-900);">${UI.currency(i.parsed_data?.totals?.taxable_amount || i.total || i.amount || 0)}</span>
        </div>
        
        <!-- 7) IVA -->
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
          <span style="font-size:13px;font-weight:600;color:var(--gray-600);">${UI.currency(i.parsed_data?.totals?.vat_amount || i.vat_amount || 0)}</span>
        </div>

        <!-- 8) Totale -->
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
          <span style="font-size:13px;font-weight:700;color:var(--gray-900);">${UI.currency(i.total || i.amount || 0)}</span>
        </div>

        <!-- 9) Azioni -->
        <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;" onclick="event.stopPropagation()">
          ${(i.pdf_path || i.windoc_link) ? `
          <a href="${i.pdf_path || i.windoc_link}" target="_blank" onclick="event.stopPropagation();" title="Scarica o Apri PDF" style="font-size:11px;background:#e0f2fe;color:#0ea5e9;border:1px solid #bae6fd;border-radius:4px;padding:3px 8px;text-decoration:none;font-weight:700;">
            Apri PDF
          </a>` : ''}

          ${(i.windoc_link) ? `
          <a href="${i.windoc_link}" target="_blank" onclick="event.stopPropagation();" title="Apri su WindDoc" style="font-size:11px;background:#f8fafc;color:#475569;border:1px solid #cbd5e1;border-radius:4px;padding:3px 8px;text-decoration:none;font-weight:700;">
            Apri WindDoc
          </a>` : ''}

          <!-- Genera Fattura Action -->
          ${(i.is_proforma && ps !== 'paid' && i.status !== 'generazione_in_corso') ? `
          <div style="display:flex; flex-direction:column; gap:4px; justify-content:center;">
             <button onclick="event.stopPropagation(); window.togglePaymentStatus('${i.id}', true)" title="Segna il pagamento come ricevuto ma NON generare fattura" style="font-size:10px;background:#f3f4f6;color:#374151;border:1px solid #d1d5db;border-radius:4px;padding:4px 8px;cursor:pointer;font-weight:600;white-space:nowrap;">
               Solo pagamento
             </button>
             <button onclick="event.stopPropagation(); window.confirmAndSync('${i.id}', this)" title="Conferma Pagamento e Genera Fattura WindDoc in automatico" style="font-size:11px;background:#10b981;color:white;border:none;border-radius:4px;padding:5px 8px;cursor:pointer;font-weight:700;white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,0.1);">
               ⚡ PAGA E FATTURA
             </button>
          </div>
          ` : ''}

          <!-- Switch Pagamento se non ci sono bottoni di pagamento evidenti -->
          ${(ps === 'paid' || (!i.is_proforma && ps !== 'paid')) ? `
          <label class="mac-switch" title="${ps==='paid' ? 'Segna non pagata' : 'Segna pagata'}" onclick="event.stopPropagation()">
            <input type="checkbox" ${ps==='paid' ? 'checked' : ''} onchange="window.togglePaymentStatus('${i.id}', this.checked)">
            <span class="mac-slider"></span>
          </label>
          ` : ''}
          
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
    if ($('inv-abbuono')) $('inv-abbuono').value = '';
    if (dsc) dsc.value = '';
    if ($('inv-number')) $('inv-number').value = '';
    if ($('inv-issue-date')) $('inv-issue-date').value = '';
    
    // Pulizia lista servizi
    const servSect = $('inv-services-section');
    const servList = $('inv-client-services-list');
    if(servSect) servSect.style.display = 'none';
    if(servList) servList.innerHTML = '<div style="font-size:13px;color:#6b7280;text-align:center;">Seleziona un cliente per caricare i servizi.</div>';

    const linesContainer = $('inv-lines-container');
    if (linesContainer) linesContainer.innerHTML = '';

    if (cl)  cl.innerHTML  = '<option value="">Caricamento…</option>';
    if (onb) onb.innerHTML = '<option value="">Nessuno</option>';
    const supp = $('inv-supplier-creation');
    if (supp) supp.innerHTML = '<option value="">(Stessa azienda attuale)</option>';
    const cont = $('inv-contract-id');
    if (cont) cont.innerHTML = '<option value="">Nessun contratto</option>';

    modal.classList.add('open');
    try {
      const [clientsRes, onbRes, compRes, wdDict] = await Promise.all([
        API.Clients.list(activeDirection === 'inbound' ? { is_supplier: true } : { status: 'active' }).catch(() => []),
        API.Onboarding.list().catch(() => []),
        API.get('/companies').catch(() => []).then(r => r.data || r || []), 
        API.get('/invoices/windoc-dictionary').catch(() => null)
      ]);
      const clients = Array.isArray(clientsRes) ? clientsRes : (clientsRes?.items ?? clientsRes?.data ?? []);
      const onbs    = Array.isArray(onbRes)     ? onbRes     : (onbRes?.items    ?? onbRes?.data    ?? []);
      const comps   = Array.isArray(compRes)    ? compRes    : [];
      
      // Popolamento dinamico metodi di pagamento da Windoc
      if (wdDict && wdDict.pagamenti_lista && $('inv-payment-method')) {
          const pmSel = $('inv-payment-method');
          const currentMethod = pmSel.value;
          pmSel.innerHTML = '<option value="">Non specificato</option>' + 
                            wdDict.pagamenti_lista.map(p => `<option value="${p.id_metodo_pagamento}">${p.nome}</option>`).join('');
          if (currentMethod) pmSel.value = currentMethod;
      }
      
      // Salva imposte per le righe fattura
      if (wdDict && wdDict.imposte_lista) {
          window.WdImposte = wdDict.imposte_lista;
      } else {
          window.WdImposte = null;
      }

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
             // CHANGE: we allow the user to select the internal emitting company manually for Proforma/Fattura
             supp.disabled = false;
             supp.style.backgroundColor = '';
             supp.innerHTML = '<option value="">Seleziona azienda fornitrice...</option>' + comps.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
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

      const qSel = $('inv-quote-id'); if (qSel) qSel.innerHTML = '<option value="">Nessuno</option>';
      const cSel = $('inv-contract-id'); if (cSel) cSel.innerHTML = '<option value="">Nessuno</option>';

      if (preset?.client_id && cl) cl.value = preset.client_id; 
      if (cl) cl.dispatchEvent(new Event('change'));
      
      if (preset?.onboarding_id && onb) onb.value = preset.onboarding_id;

      // Aggiungi riga di default solo se non stiamo precompilando (es. nuovo documento)
      // e DOPO aver scaricato WdImposte così ha le tendine corrette
      if (!preset || Object.keys(preset).length === 0) {
         if (window.addInvoiceLine && linesContainer && linesContainer.children.length === 0) {
             window.addInvoiceLine();
         }
      }

      const due = $('inv-due');
      if (due) { const d = new Date(); d.setDate(d.getDate() + 30); due.value = d.toISOString().split('T')[0]; }
      const nxt = $('inv-recurrence-next');
      if (nxt) { const d = new Date(); d.setDate(d.getDate() + 30); nxt.value = d.toISOString().split('T')[0]; }
      const issue = $('inv-issue-date');
      if (issue && !issue.value) { issue.value = new Date().toISOString().split('T')[0]; }
      
      const numLabel = $('inv-number')?.closest('.form-group')?.querySelector('label');
      if (isProforma) {
          if (numLabel) numLabel.innerHTML = 'Numero Proforma';
          if ($('inv-number')) {
              $('inv-number').placeholder = 'Assegnazione automatica';
              $('inv-number').readOnly = true;
              $('inv-number').style.backgroundColor = '#f9fafb';
          }
      } else {
          if (numLabel) numLabel.innerHTML = 'Numero Fattura';
          if ($('inv-number')) {
              $('inv-number').placeholder = 'Es. FATT-123';
              $('inv-number').readOnly = false;
              $('inv-number').style.backgroundColor = '';
          }
      }
      
      // I dropdown (quote-id, contract-id, supplier-creation) vengono inizializzati prima
      // o popolati dal listener 'change' di inv-client, quindi NON sovrascriverli qui!
    } catch (e) { UI.toast('Errore caricamento dati modal', 'error'); }
  }

  window.addInvoiceLine = (desc = '', qty = 1, price = 0, vat = '', sconto = 0, centro_ricavo = '') => {
    const container = $('inv-lines-container');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'inv-line-row';
    div.style = 'display:flex; gap:8px; align-items:center; background:#f9fafb; padding:8px; border-radius:8px; border:1px solid #e5e7eb; overflow-x: auto;';
    
    // Select IVA Dinamica
    let ivaOptions = '<option value="">Nessuna</option>';
    if (window.WdImposte) {
       ivaOptions += window.WdImposte.map(i => `<option value="${i.id_aliquota}">${i.nome} (${i.valore}%)</option>`).join('');
    } else {
       ivaOptions += `<option value="22" ${vat=='22'?'selected':''}>22%</option>
                      <option value="10" ${vat=='10'?'selected':''}>10%</option>
                      <option value="4" ${vat=='4'?'selected':''}>4%</option>
                      <option value="0" ${vat=='0'?'selected':''}>0%</option>`;
    }

    div.innerHTML = `
      <input type="text" class="form-input l-desc" placeholder="Es. Servizio web..." value="${desc}" title="Descrizione" style="flex:1; min-width:200px;" onchange="window.calcInvoiceTotal()">
      <input type="text" class="form-input l-rc" placeholder="Opzionale..." title="Centro Ricavo (Opzionale)" value="${centro_ricavo}" style="width:100px; min-width:100px;">
      <input type="number" class="form-input l-qty" placeholder="1" title="Quantità" value="${qty}" style="width:70px; min-width:70px;" min="0.1" step="0.1" onchange="window.calcInvoiceTotal()">
      <input type="number" class="form-input l-price" placeholder="0.00" title="Prezzo unitario" value="${price}" style="width:90px; min-width:90px;" min="0" step="0.01" onchange="window.calcInvoiceTotal()">
      <input type="number" class="form-input l-discount" placeholder="0.00" title="Sconto riga in €" value="${sconto}" style="width:90px; min-width:90px;" min="0" step="0.01" onchange="window.calcInvoiceTotal()">
      <select class="form-input l-vat" title="Aliquota IVA" style="width:200px; min-width:200px; text-overflow: ellipsis;" onchange="window.calcInvoiceTotal()">
        ${ivaOptions}
      </select>
      <button type="button" class="btn btn-ghost" style="color:#ef4444; padding:4px;" onclick="this.parentElement.remove(); window.calcInvoiceTotal();" title="Rimuovi">✕</button>
    `;
    container.appendChild(div);
  };

  window.calcInvoiceTotal = () => {
    let tot = 0;
    // Somma i servizi (checkbox abbonamenti attivi) se visibili
    const serviceIds = Array.from(document.querySelectorAll('.inv-service-cb:checked'));
    serviceIds.forEach(cb => {
      const p = parseFloat(cb.dataset.price || 0);
      tot += p;
    });
    // Somma righe dinamiche
    const lines = document.querySelectorAll('.inv-line-row');
    lines.forEach(row => {
      const q = parseFloat(row.querySelector('.l-qty').value) || 0;
      const p = parseFloat(row.querySelector('.l-price').value) || 0;
      const d = parseFloat(row.querySelector('.l-discount').value) || 0;
      let rigaTot = (q * p) - d;
      if (rigaTot < 0) rigaTot = 0;
      tot += rigaTot;
    });
    
    // Abbuono totale (aggiunto in HTML successivamente)
    const abbEl = $('inv-abbuono');
    if (abbEl) {
       const abbNum = parseFloat(abbEl.value) || 0;
       tot -= abbNum;
       if (tot < 0) tot = 0;
    }
    
    const amtEl = $('inv-amount');
    if (amtEl) amtEl.value = tot.toFixed(2);
  };

  $('btn-save-invoice')?.addEventListener('click', async () => {
    const cid = $('inv-client')?.value, amt = parseFloat($('inv-amount')?.value), due = $('inv-due')?.value;
    const oid = $('inv-onboarding-id')?.value;
    if ((!cid && !oid) || isNaN(amt) || !due) {
        UI.toast('Cliente (o Onboarding), Importo e Scadenza sono obbligatori', 'warning');
        if (!cid && !oid && $('inv-client')) {
            $('inv-client').style.border = '2px solid #ef4444';
            $('inv-client').scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => $('inv-client').style.border = '', 3000);
        }
        return;
    }
    const isProforma  = $('inv-is-proforma')?.value === '1';
    const method      = $('inv-payment-method')?.value || null;
    const contractId   = $('inv-contract-id')?.value || null;
    const quoteId      = $('inv-quote-id')?.value || null;
    const supCompId    = $('inv-supplier-creation')?.value || null;
    const btn = $('btn-save-invoice'); if (btn) btn.disabled = true;
    
    // Raccolta Dati Servizi/Ricorrenza
    const serviceIds = Array.from(document.querySelectorAll('.inv-service-cb:checked')).map(cb => cb.value);
    const recToggle  = $('inv-is-recurring')?.checked;
    
    // Costruzione array lines dinamiche
    const invoiceLines = [];
    document.querySelectorAll('.inv-line-row').forEach(row => {
      const desc = row.querySelector('.l-desc').value.trim();
      const rc   = row.querySelector('.l-rc').value.trim() || null;
      const qty = parseFloat(row.querySelector('.l-qty').value) || 0;
      const price = parseFloat(row.querySelector('.l-price').value) || 0;
      const discount = parseFloat(row.querySelector('.l-discount').value) || 0;
      const vat = row.querySelector('.l-vat').value; 
      
      let rigaTot = (qty * price) - discount;
      if (rigaTot < 0) rigaTot = 0;
      
      if (desc && qty > 0) {
         invoiceLines.push({ 
           description: desc, 
           revenue_center: rc,
           quantity: qty, 
           unit_price: price, 
           discount: discount,
           vat_rate: vat // In Windoc sarà id_aliquota (stringa) o numerico
         });
      }
    });

    if (activeDirection === 'inbound' && !supCompId) {
        UI.toast('Seleziona l\'Azienda Ricevente', 'warning');
        if (btn) btn.disabled = false;
        return;
    }
    
    // Payload Base
    const payload = {
      client_id:    cid || null,
      direction:    activeDirection === 'inbound' ? 'inbound' : 'outbound',
      total:        amt, 
      amount:       amt, 
      total_amount: amt,
      abbuono:      parseFloat($('inv-abbuono')?.value) || 0.0,

      due_date:     due,
      number:       $('inv-number')?.value?.trim() || null,
      issue_date:   $('inv-issue-date')?.value || null,
      notes:        $('inv-desc')?.value?.trim() || null,
      is_proforma:  isProforma,
      payment_method:  method || null,
      onboarding_id:   oid || null,
      contract_id:     contractId || null,
      quote_id:        quoteId || null,
      supplier_company_id: activeDirection === 'inbound' ? null : (supCompId || null),
      company_id:      activeDirection === 'inbound' ? (supCompId || null) : (supCompId || window.SessionState?.company_id || null),
      service_ids:     serviceIds.length ? serviceIds : null
    };

    // Estensione Payload Abbonamento / Ricorrenza
    if (recToggle && isProforma) {
      payload.is_recurring = true;
      payload.recurrence_frequency = $('inv-recurrence-freq')?.value || 'monthly';
      payload.next_recurrence_date = $('inv-recurrence-next')?.value || due;
      payload.auto_send = ($('inv-recurrence-mode')?.value === 'auto');
    }

    try {
      await API.Invoices.create({ body: payload, lines: invoiceLines });
      UI.toast(isProforma ? 'Proforma (e ricorrenza) creata' : 'Fattura creata', 'success');
      modal?.classList.remove('open');
      await load();
    } catch (e) { UI.toast(e?.message || 'Errore', 'error'); }
    finally { if (btn) btn.disabled = false; }
  });

  // Auto-popolamento righe fattura / proforma al cambio contratto
  $('inv-contract-id')?.addEventListener('change', async function() {
      const contractId = this.value;
      const linesContainer = $('inv-lines-container');
      if (!contractId || !linesContainer || typeof window.addInvoiceLine !== 'function') return;
      
      try {
         // Recuperiamo la lista dei contratti. Se esiste l'endpoint singolo sarebbe meglio,
         // ma per sicurezza riutilizziamo la query generale (già filtrata se possibile).
         const res = await API.get('/contracts');
         const ctrs = res?.data || res || [];
         const ctr = ctrs.find(c => c.id === contractId);
         
         if (ctr && ctr.contract_services && ctr.contract_services.length > 0) {
             linesContainer.innerHTML = ''; // Rimuove eventuali righe "vuote" o vecchie
             ctr.contract_services.forEach(s => {
                 const cat = s.services_catalog || {};
                 const name = cat.name || '';
                 const price = parseFloat(cat.price) || 0;
                 // (desc, qty, price, vat, sconto, centro_ricavo)
                 // Lasciamo l'IVA vuota così il default di addInvoiceLine la lascerà '0' o come predefinita.
                 window.addInvoiceLine(name, 1, price, '', 0, ''); 
             });
             // Dopo aver aggiunto tutte le righe, ricalcola i totali
             if (typeof window.calcInvoiceTotal === 'function') {
                 window.calcInvoiceTotal();
             }
         }
      } catch(e) {
         console.warn('Impossibile auto-popolare proforma dal contratto:', e);
      }
  });

  // ── Row actions ────────────────────────────────────────────
  window.markPaid = async id => {
    if (!await UI.confirm('Segnare come pagata?')) return;
    try {
      await API.Invoices.markPaid(id);
      ALL = ALL.map(i => i.id===id ? {...i, status:'paid', payment_status:'paid', paid_at:new Date().toISOString()} : i);
      updateKpis(); applyFilters(); UI.toast('Fattura segnata come pagata','success');
    } catch(e) { UI.toast(e?.message||'Errore','error'); }
  };

  window.reviewPayment = async (id, newStatus) => {
    const labels = { paid: 'confermare il pagamento', under_review: 'spostare in verifica', not_paid: 'riportare a non pagata' };
    if (!await UI.confirm(`Vuoi ${labels[newStatus]||newStatus}?`)) return;
    try {
      await API.Invoices.reviewPayment(id, { payment_status: newStatus });
      ALL = ALL.map(i => i.id===id ? {...i, payment_status: newStatus, ...(newStatus==='paid'?{status:'paid',paid_at:new Date().toISOString()}:{})} : i);
      updateKpis(); applyFilters(); UI.toast('Stato pagamento aggiornato','success');
    } catch(e) { UI.toast(e?.message||'Errore','error'); }
  };

  const syncingItems = new Set();
  
  window.confirmAndSync = async (id, btnEl) => {
    if (syncingItems.has(id)) return;
    if (!await UI.confirm('Vuoi confermare il pagamento e generare SUDITO la fattura reale su Windoc?')) return;
    
    syncingItems.add(id);
    if (btnEl) btnEl.disabled = true;
    
    try {
      UI.toast('Conferma e generazione fattura in corso...', 'info');
      const res = await API.post(`/invoices/${id}/confirm-and-sync`, { payment_status: 'paid' });
      const wd = res.windoc || {};
      if (wd.success) {
        UI.toast('Fattura Windoc generata e agganciata con successo!', 'success');
      } else {
        UI.toast('Pagamento confermato, ma fallito Windoc: ' + (wd.message||wd.error||'Sconosciuto'), 'warning');
      }
      await load();
    } catch(e) { 
      UI.toast(e?.message||"Errore durante l'operazione", 'error'); 
    } finally {
      syncingItems.delete(id);
      if (btnEl) btnEl.disabled = false;
    }
  };

  window.sendReminder = async id => {
    try { await API.Invoices.sendReminder(id); UI.toast('Sollecito inviato','success'); }
    catch(e) { UI.toast(e?.message||'Errore','error'); }
  };

  window.syncWindoc = async id => {
    try { await API.post(`/invoices/${id}/push-windoc`,{}); UI.toast('Sync Windoc avviata','info'); await load(); }
    catch(e) { UI.toast(e?.message||'Errore Windoc','error'); }
  };

  window.syncGdrive = async btn => {
    try {
      const orig = btn.innerHTML;
      btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Sync...`;
      btn.disabled = true;
      const res = await API.post('/invoices/sync-gdrive', {});
      UI.toast(res.message || 'Sincronizzazione GDrive avviata', 'info');
      setTimeout(async () => {
         await load();
         btn.innerHTML = orig;
         btn.disabled = false;
      }, 3000);
    } catch(e) {
      UI.toast(e?.message || 'Errore Sync GDrive', 'error');
      btn.innerHTML = 'G-Drive Sync'
      btn.disabled = false;
    }
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
