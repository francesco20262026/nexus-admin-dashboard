/* admin_documents.js — Corporate Wiki for Google Drive links */
'use strict';
(function () {
  Auth.guard('admin');
  Auth.initUI();

  let ALL = [], filtered = [];
  const saved   = window.SessionState?.load('wiki_docs') || {};
  let pg        = saved.pg  || 1;
  let activeTab = 'all';
  const PER = 15;

  const $ = id => document.getElementById(id);
  const list    = $('doc-list');
  const tabBar  = $('doc-pipeline-bar');
  const search  = $('doc-search');
  const info    = $('doc-info');
  const pag     = $('doc-pagination');
  const modal   = $('modal-document');

  // Page actions
  const act = $('page-actions');
  if (act) act.innerHTML = `
    <button class="btn btn-secondary" id="btn-gdrive-sync" title="Scansiona GDrive Dropzone">
      <svg style="width:15px;height:15px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" /></svg>
      <span class="hide-mobile">Sync GDrive</span>
    </button>
    <button class="btn btn-secondary" id="btn-refresh"><svg style="width:15px;height:15px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/></svg> <span>Aggiorna</span></button>
    <button class="btn-action-icon" id="btn-upload-doc" title="Aggiungi Documento / Link">
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
</button>`;
  $('btn-refresh')?.addEventListener('click', function() { if(window.UI) UI.toast('Aggiornamento in corso...', 'info'); load(true); });
  $('btn-gdrive-sync')?.addEventListener('click', async () => {
    if (window.UI) UI.toast('Scansione Documenti Aziendali avviata...', 'info');
    try {
      await API.post('/jobs/trigger-documents-poller', {});
      if (window.UI) UI.toast('Scansione completata, aggiorno in 30 secondi...', 'success');
      setTimeout(() => load(true), 30000); 
    } catch(e) {
      if (window.UI) UI.toast('Errore durante l\'avvio della scansione', 'error');
    }
  });
  $('btn-upload-doc')?.addEventListener('click', () => {
    const fileInput = $('wiki-file');
    const fileName = $('wiki-file-name');
    if (fileInput) fileInput.value = '';
    if (fileName) fileName.textContent = 'Nessun file selezionato';
    modal?.classList.add('open');
  });

  tabBar?.querySelectorAll('.cl-status-pill').forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));
  if (tabBar) tabBar.addEventListener('click', e => {
    const b = e.target.closest('.cl-status-pill'); if (!b) return;
    tabBar.querySelectorAll('.cl-status-pill').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); activeTab = b.dataset.tab; pg = 1; applyFilters();
  });
  
  [search].forEach(el => {
    el?.addEventListener('input',  debounce(() => { pg=1; applyFilters(); }, 200));
  });

  if (window._documentsCmpListener) window.removeEventListener('companyChanged', window._documentsCmpListener);
  window._documentsCmpListener = () => load();
  window.addEventListener('companyChanged', window._documentsCmpListener);
  window._reloadDocuments = load;

  async function load() {
    if (!list) return;
    list.innerHTML = UI.skeletonCardList(5);
    try {
      const res = await API.get('/wiki?page=1&page_size=1000');
      ALL = Array.isArray(res) ? res : (res?.items ?? res?.data ?? []);
    } catch (e) {
      ALL = [];
      const errMsg = "Impossibile caricare l'archivio aziendale. Controlla la connessione e riprova.";
      list.innerHTML = UI.errorState(errMsg, 'window._reloadDocuments()');
    }
    
    // Carica fornitori se non già fatto
    if (SUPPLIERS.length === 0) await loadSuppliers();
    
    updateKpis();
    populateSelectFilters();
    applyFilters();
  }

  function populateSelectFilters() {
     const supSet = new Set();
     const typeSet = new Set();
     const dateSet = new Set();

     ALL.forEach(d => {
        const parts = (d.category || '').split('::');
        const s = parts.length > 1 ? parts[0] : 'Interno';
        const t = parts.length > 1 ? parts[1] : (d.category || 'Generale');
        if (s) supSet.add(s);
        if (t) typeSet.add(t);
        let dateStr = d.created_at ? d.created_at.substring(0, 7) : null;
        if (dateStr) dateSet.add(dateStr);
     });

     const sEl = $('doc-filter-supplier');
     const tEl = $('doc-filter-type');
     const dEl = $('doc-filter-date');
     
     if (sEl && Array.from(sEl.options).length === 1) {
         const cur = sEl.value;
         sEl.innerHTML = '<option value="">Fornitore ▼</option>' + Array.from(supSet).sort().map(x => `<option value="${x}">${x}</option>`).join('');
         sEl.value = cur;
     }
     if (tEl && Array.from(tEl.options).length === 1) {
         const cur = tEl.value;
         tEl.innerHTML = '<option value="">Tipo Documento ▼</option>' + Array.from(typeSet).sort().map(x => `<option value="${x}">${x}</option>`).join('');
         tEl.value = cur;
     }
     if (dEl && Array.from(dEl.options).length === 1) {
         const cur = dEl.value;
         dEl.innerHTML = '<option value="">Data Caricamento ▼</option>' + Array.from(dateSet).sort().reverse().map(x => `<option value="${x}">${x.replace('-', '/')}</option>`).join('');
         dEl.value = cur;
     }
  }

  window.filterBySelects = function() {
    pg = 1;
    applyFilters();
  };

  let SUPPLIERS = [];
  async function loadSuppliers() {
    try {
      const res = await API.get('/companies?role=supplier&page_size=1000');
      SUPPLIERS = Array.isArray(res) ? res : (res?.items ?? []);
      const sel = $('doc-supplier-select');
      if (sel) {
        sel.innerHTML = '<option value="">Rilevamento Automatico con IA 🔥</option>' + 
          SUPPLIERS.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
      }
    } catch(e) { console.error('Errore fetch fornitori', e); }
  }

  function updateKpis() {
    const set = (id,v) => { const el=$(id); if(el) el.textContent=v; };
    set('kpi-doc-total',    ALL.length);
    set('kpi-doc-fatture',  ALL.filter(d => (d.category||'').toLowerCase().includes('fattur')).length);
    set('kpi-doc-contratti', ALL.filter(d => (d.category||'').toLowerCase().includes('contratt')).length);
    set('kpi-doc-procedure', ALL.filter(d => (d.category||'').toLowerCase().includes('procedur')).length);
  }

  function applyFilters() {
    const q  = (search?.value || '').toLowerCase().trim();
    
    const selSup = $('doc-filter-supplier')?.value || '';
    const selType = $('doc-filter-type')?.value || '';
    const selDate = $('doc-filter-date')?.value || '';

    filtered = ALL.filter(d => {
      if (activeTab && activeTab !== 'all') {
         if (!(d.category||'').toLowerCase().includes(activeTab.toLowerCase())) return false;
      }
      
      const parts = (d.category || '').split('::');
      const docSupplierRaw = parts.length > 1 ? parts[0] : 'Interno';
      const docType     = parts.length > 1 ? parts[1] : (d.category || 'Generale');
      const dateStr     = d.created_at ? d.created_at.substring(0, 7) : '';

      if (selSup && docSupplierRaw !== selSup) return false;
      if (selType && docType !== selType) return false;
      if (selDate && dateStr !== selDate) return false;

      if (q) {
        const hay = [d.title, d.category, d.raw_text].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const max = Math.ceil(filtered.length / PER) || 1;
    if (pg > max) pg = max;
    window.SessionState?.save('wiki_docs', { pg, tab: activeTab });
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
      // Ensure all items on current page are selected
      const allSelected = currentPageIds.length > 0 && currentPageIds.every(id => window.selectedIds.has(id));
      if (allSelected) selectAllBtn.classList.add('selected');
      else selectAllBtn.classList.remove('selected');
    }
  };
  
  window.massDelete = async function() {
    if (window.selectedIds.size === 0) return;
    if (!await UI.confirm(`Sei sicuro di voler eliminare ${window.selectedIds.size} link selezionati?`)) return;
    
    let success = 0;
    try {
      UI.toast(`Eliminazione in corso...`, 'info');
      for (const id of window.selectedIds) {
        try {
          await API.del(`/wiki/${id}`);
          success++;
        } catch (err) {
          console.error(`Error deleting link ${id}:`, err);
        }
      }
      if (success > 0) {
        UI.toast(`${success} link eliminati.`, 'success');
        window.clearSelection();
        load();
      } else {
        UI.toast("Errore durante l'eliminazione. Riprova.", 'error');
      }
    } catch (e) {
      UI.toast("Errore durante l'eliminazione multipla.", 'error');
    }
  };

  function render() {
    if (!list) return;
    if (!filtered.length) {
      list.innerHTML = `<div class="list-card">${UI.createEmptyState(null, ALL.length ? "Nessun file trovato in questa categoria." : "Archivio vuoto. Premi l'icona in alto a destra per avviare lo Scanner IA.")}</div>`;
      if (info) info.textContent=''; if (pag) pag.innerHTML=''; return;
    }
    const slice = filtered.slice((pg-1)*PER, pg*PER);

    list.innerHTML = slice.map(d => {
      const isSelected  = window.selectedIds.has(d.id);
      const dateStr     = d.created_at ? UI.date(d.created_at) : '';
      
      let finalUrl = d.url;
      if (finalUrl && finalUrl.startsWith('file:///')) {
         finalUrl = (window._resolveApiBase ? window._resolveApiBase() : 'http://127.0.0.1:8000/api') + `/wiki/${d.id}/download?token=${API.getToken()}`;
      }

      // Estrai fornitore e tipo se memorizzati come Fornitore::Tipo
      const parts = (d.category || '').split('::');
      const docSupplierRaw = parts.length > 1 ? parts[0] : 'Interno';
      const docType     = parts.length > 1 ? parts[1] : (d.category || 'Generale');

      let alias = null;
      let matchingSup = window.SUPPLIERS?.find(s => s.name === docSupplierRaw) || SUPPLIERS?.find(s => s.name === docSupplierRaw);
      if (matchingSup && matchingSup.alias) {
          alias = matchingSup.alias;
      }
      
      if (!alias) {
           const upper = docSupplierRaw.toUpperCase();
           if (docSupplierRaw === 'Interno') {
               alias = 'INT';
           } else if (upper.includes('DELOCA')) {
               alias = 'DLC';
           } else if (upper.includes('IT SERVICES')) {
               alias = 'ITS';
           } else {
               alias = docSupplierRaw !== 'Interno' ? docSupplierRaw.substring(0,3).toUpperCase() : 'INT';
           }
      }

      let docSupplierBadge = '';
      if (docSupplierRaw === 'Interno' || !docSupplierRaw) {
         docSupplierBadge = `<div style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;background:var(--gray-100);border:1px solid var(--gray-200);color:var(--gray-700);font-size:12px;font-weight:600;"><svg fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;color:var(--gray-400);" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"></path></svg>INT</div>`;
      } else {
         docSupplierBadge = `<div style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;background:var(--gray-100);border:1px solid var(--gray-200);color:var(--gray-700);font-size:12px;font-weight:600;"><svg fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;color:var(--gray-400);" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"></path></svg>${alias}</div>`;
      }

      return `<div class="cl-row fade-in ${isSelected ? 'selected' : ''}" data-id="${d.id}"
        style="display:grid; grid-template-columns: 2.8fr 1.4fr 1.4fr 1.4fr 80px; align-items:center; gap:16px; padding:14px 24px; border-bottom:1px solid var(--border); transition:background 0.15s; cursor:default;">

        <!-- Col 1: Titolo -->
        <div class="cl-col-identity" style="min-width:0;">
          <div class="mac-select-btn ${isSelected ? 'selected' : ''}" data-id="${d.id}" onclick="window.toggleSelection(event, '${d.id}')" style="flex-shrink:0;"><div class="mac-checkbox"></div></div>
          <div style="flex:1;min-width:0;">
            <a href="${finalUrl}" target="_blank" onclick="event.stopPropagation();" style="font-size:14px;font-weight:600;color:var(--brand-600);text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:6px;">
              <svg style="width:16px;height:16px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
              ${d.title || 'Senza Nome'}
            </a>
          </div>
        </div>

        <!-- Col 2: Fornitore -->
        <div style="min-width:0;">
          ${docSupplierBadge}
        </div>

        <!-- Col 3: Tipo Documento -->
        <div style="min-width:0;">
          <span style="font-size:12px;color:var(--gray-600);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;">${docType}</span>
        </div>

        <!-- Col 4: Data Creazione -->
        <div style="min-width:0;">
          <span style="font-size:12px;color:var(--gray-500);">${dateStr}</span>
        </div>

        <!-- Col 5: Azioni -->
        <div style="display:flex;align-items:center;justify-content:flex-end;gap:5px;" onclick="event.stopPropagation();">
          <div title="Elimina" style="cursor:pointer; font-size:16px; opacity:0.8; transition:opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.8" onclick="deleteSingleDoc('${d.id}')">🗑️</div>
        </div>
      </div>`;
    }).join('');

    const s=(pg-1)*PER+1, e=Math.min(pg*PER,filtered.length);
    if (info) info.textContent = `${s}–${e} di ${filtered.length}`;
    UI.pagination(pag, null, pg, filtered.length, PER, p => { pg=p; render(); window.updateSelectionUI(); });
    setTimeout(() => { if(window.updateSelectionUI) window.updateSelectionUI(); }, 10);
  }

  // Drag and Drop Logic
  const dropzone = $('wiki-dropzone');
  const fileInput = $('wiki-file');
  if (dropzone) {
    dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.style.borderColor = '#2563eb'; dropzone.style.background = '#eff6ff'; });
    dropzone.addEventListener('dragleave', e => { e.preventDefault(); dropzone.style.borderColor = '#d1d5db'; dropzone.style.background = '#f9fafb'; });
    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.style.borderColor = '#d1d5db'; dropzone.style.background = '#f9fafb';
      if (e.dataTransfer.files && e.dataTransfer.files.length) {
        fileInput.files = e.dataTransfer.files;
        $('wiki-file-name').textContent = fileInput.files[0].name;
      }
    });
  }

  // Upload and AI Scan
  $('btn-save-wiki')?.addEventListener('click', async () => {
    const fileInput = $('wiki-file');
    const file = fileInput?.files?.[0];
    if (!file) { UI.toast('Trascina o seleziona un file PDF prima di procedere.','warning'); return; }
    
    const btn = $('btn-save-wiki'); if (btn) btn.disabled = true;
    try {
      UI.toast('Analisi IA in corso...', 'info');
      const formData = new FormData();
      formData.append('file', file);
      
      const supplierSel = $('doc-supplier-select');
      if (supplierSel && supplierSel.value) {
        formData.append('supplier_id', supplierSel.value);
      }
      
      const res = await API.post('/wiki/scan_and_upload', formData);
      UI.toast('Documento archiviato! (' + (res.resolved_category || 'Generale') + ')', 'success'); 
      fileInput.value = '';
      $('wiki-file-name').textContent = 'Nessun file selezionato';
      modal?.classList.remove('open'); 
      await load();
    } catch(e) { 
      UI.toast(e?.message||'Errore caricamento o parsing','error'); 
    }
    finally { if (btn) btn.disabled = false; }
  });

  // Delete single document
  window.deleteSingleDoc = async function(id) {
    if (!await UI.confirm('Rimuovere questo collegamento dalla Wiki?')) return;
    try {
      await API.del(`/wiki/${id}`);
      ALL = ALL.filter(d => d.id !== id);
      updateKpis(); applyFilters();
      UI.toast('Collegamento rimosso', 'success');
    } catch(e) { UI.toast(e?.message || 'Errore eliminazione', 'error'); }
  };

  window.onPageReady(async () => {
    await I18n.init('lang-switcher-slot');
    load();
  });
})();