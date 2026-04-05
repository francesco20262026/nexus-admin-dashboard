/* admin_documents.js Document archive + visibility management */
'use strict';
(function () {
  Auth.guard('admin');
  Auth.initUI();

  let ALL = [], filtered = [];
  const saved   = window.SessionState?.load('documents') || {};
  let pg        = saved.pg  || 1;
  let activeTab = saved.tab || 'all';
  const PER = 15;

  const $ = id => document.getElementById(id);
  const list    = $('doc-list');
  const tabBar  = $('doc-pipeline-bar');
  const search  = $('doc-search');
  const fType   = $('doc-filter-type');
  const fClient = $('doc-filter-client');
  const info    = $('doc-info');
  const pag     = $('doc-pagination');
  const modal   = $('modal-document');

  // Page actions
  const act = $('page-actions');
  if (act) act.innerHTML = `
    <button class="btn btn-secondary" id="btn-refresh"><svg style="width:15px;height:15px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/></svg> <span>Aggiorna</span></button>
    <button class="btn-action-icon" id="btn-upload-doc" title="Carica documento">
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
</button>`;
  $('btn-refresh')?.addEventListener('click', function() { if(window.UI) UI.toast('Aggiornamento in corso...', 'info'); load(true); });
  $('btn-upload-doc')?.addEventListener('click', () => modal?.classList.add('open'));

  tabBar?.querySelectorAll('.cl-status-pill').forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));
  if (tabBar) tabBar.addEventListener('click', e => {
    const b = e.target.closest('.cl-status-pill'); if (!b) return;
    tabBar.querySelectorAll('.cl-status-pill').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); activeTab = b.dataset.tab; pg = 1; applyFilters();
  });
  [search, fType, fClient].forEach(el => {
    el?.addEventListener('input',  debounce(() => { pg=1; applyFilters(); }, 200));
    el?.addEventListener('change', () => { pg=1; applyFilters(); });
  });

  window.addEventListener('companyChanged', load);
  window._reloadDocuments = load;

  async function load() {
    if (!list) return;
    list.innerHTML = UI.skeletonCardList(5);
    try {
      const res = await API.Documents.list({});
      ALL = Array.isArray(res) ? res : (res?.items ?? res?.data ?? []);
      populateClientFilter();
    } catch (e) {
      ALL = [];
      const errMsg = 'Impossibile caricare i documenti. Controlla la connessione e riprova.';
      list.innerHTML = UI.errorState(errMsg, 'window._reloadDocuments()');
    }
    updateKpis();
    applyFilters();
  }

  function populateClientFilter() {
    if (!fClient) return;
    const prev  = fClient.value;
    const names = [...new Set(ALL.map(d => d.client_name).filter(Boolean))].sort();
    fClient.innerHTML = `<option value="">Tutti i clienti</option>` + names.map(n=>`<option value="${n}">${n}</option>`).join('');
    if (prev) fClient.value = prev;
  }

  function updateKpis() {
    const set = (id,v) => { const el=$(id); if(el) el.textContent=v; };
    set('kpi-doc-total',    ALL.length);
    set('kpi-doc-shared',   ALL.filter(d => d.visibility === 'shared').length);
    set('kpi-doc-internal', ALL.filter(d => !d.visibility || d.visibility === 'internal').length);
  }

  function applyFilters() {
    const q  = (search?.value || '').toLowerCase().trim();
    const cl = fClient?.value || '';

    filtered = ALL.filter(d => {
      if (activeTab === 'shared'   && d.visibility !== 'shared')   return false;
      if (activeTab === 'internal' && d.visibility === 'shared')   return false;
      if (cl && d.client_name !== cl) return false;
      if (q) {
        const hay = [d.name, d.client_name, d.company_name, d.type].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const max = Math.ceil(filtered.length / PER) || 1;
    if (pg > max) pg = max;
    window.SessionState?.save('documents', { pg, tab: activeTab });
    render();
  }

  const TYPE_LABELS = { contract:'Contratto', invoice:'Fattura', report:'Report', identity:'Identità', other:'Altro' };
  const VIS_LABELS  = { shared:'Condiviso', internal:'Interno' };

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
      // Ensure all items on current page are selected
      const allSelected = currentPageIds.length > 0 && currentPageIds.every(id => window.selectedIds.has(id));
      if (allSelected) selectAllBtn.classList.add('selected');
      else selectAllBtn.classList.remove('selected');
    }
  };
  
  window.massDelete = async function() {
    if (window.selectedIds.size === 0) return;
    
    if (!confirm(`Sei sicuro di voler eliminare ${window.selectedIds.size} documenti selezionati?`)) return;
    
    let success = 0;
    try {
      UI.toast(`Eliminazione in corso...`, 'info');
      // Execute deletions sequentially to avoid overloading the API
      for (const id of window.selectedIds) {
        try {
          if (API.Documents && API.Documents.remove) {
             await API.Documents.remove(id);
          } else {
             await API.del(`/documents/${id}`);
          }
          success++;
        } catch (err) {
          console.error(`Error deleting document ${id}:`, err);
        }
      }
      
      if (success > 0) {
        UI.toast(`${success} documenti eliminati.`, 'success');
        window.clearSelection();
        load();
      } else {
        UI.toast("Errore durante l\'eliminazione. Riprova.", 'error');
      }
    } catch (e) {
      UI.toast("Errore durante l\'eliminazione multipla.", 'error');
    }
  };

  function render() {
    if (!list) return;
    if (!filtered.length) {
      list.innerHTML = `<div class="list-card">${UI.createEmptyState(null, ALL.length ? 'Nessun documento corrisponde ai filtri.' : 'Nessun documento in archivio.')}</div>`;
      if (info) info.textContent=''; if (pag) pag.innerHTML=''; return;
    }
    const slice = filtered.slice((pg-1)*PER, pg*PER);
    const TYPE_LABELS = { contract:'Contratto', invoice:'Fattura', report:'Report', identity:'Identità', other:'Altro' };

    list.innerHTML = slice.map(d => {
      const isSelected  = window.selectedIds.has(d.id);
      const typeLabel   = TYPE_LABELS[d.type] || d.type || 'Documento';
      const isShared    = d.visibility === 'shared';
      const visLabel    = isShared ? 'Condiviso' : 'Interno';
      const visColor    = isShared ? '#16a34a' : 'var(--gray-500)';
      const visBg       = isShared ? '#f0fdf4' : '#f3f4f6';
      const dateStr     = d.created_at ? UI.date(d.created_at) : '';

      return `<div class="cl-row fade-in ${isSelected ? 'selected' : ''}" data-id="${d.id}"
        style="display:grid; grid-template-columns:2fr 1.5fr 2fr 120px 110px; align-items:center; gap:16px; padding:14px 24px; border-bottom:1px solid var(--border); transition:background 0.15s; cursor:pointer;"
        onclick="window.openDoc('${d.id}')">

        <!-- Col 1: Cliente -->
        <div class="cl-col-identity" style="min-width:0;">
          <div class="mac-select-btn ${isSelected ? 'selected' : ''}" data-id="${d.id}" onclick="window.toggleSelection(event, '${d.id}')" style="flex-shrink:0;"><div class="mac-checkbox"></div></div>
          <div style="flex:1;min-width:0;">
            ${d.client_name
              ? `<a href="admin_client_detail.html?id=${d.client_id}" onclick="event.stopPropagation();" style="font-size:13px;font-weight:600;color:var(--brand-600);text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;">🏢 ${d.client_name}</a>`
              : `<span style="font-size:13px;color:var(--gray-400);">—</span>`}
          </div>
        </div>

        <!-- Col 2: Fornitore -->
        <div style="min-width:0;">
          <span style="font-size:12px;font-weight:600;color:var(--gray-700);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;">${d.company_name || '—'}</span>
        </div>

        <!-- Col 3: File -->
        <div style="min-width:0;">
          <div style="font-size:13px;font-weight:600;color:var(--gray-900);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${d.name || ''}">${d.name || 'Documento senza nome'}</div>
          <div style="display:flex;gap:6px;align-items:center;margin-top:3px;">
            <span style="font-size:11px;color:var(--gray-500);background:var(--gray-100);padding:1px 6px;border-radius:4px;">📄 ${typeLabel}</span>
            ${dateStr ? `<span style="font-size:11px;color:var(--gray-400);">📅 ${dateStr}</span>` : ''}
          </div>
        </div>

        <!-- Col 4: Stato -->
        <div>
          <span style="display:inline-flex;align-items:center;gap:4px;background:${visBg};color:${visColor};padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;">
            ${isShared ? '📤' : '🔒'} ${visLabel}
          </span>
        </div>

        <!-- Col 5: Azioni -->
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;" onclick="event.stopPropagation();">
          <button class="icon-btn-sm danger" onclick="deleteSingleDoc('${d.id}')" title="Elimina">
            <svg style="width:13px;height:13px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
          ${isShared
            ? `<button style="font-size:10px;padding:3px 8px;border-radius:5px;border:1px solid var(--gray-200);background:var(--gray-50);color:var(--gray-500);cursor:pointer;font-weight:600;" onclick="unshareDoc('${d.id}')" title="Rendi interno">🔒 Interno</button>`
            : `<button style="font-size:10px;padding:3px 8px;border-radius:5px;border:1px solid #bbf7d0;background:#f0fdf4;color:#15803d;cursor:pointer;font-weight:600;" onclick="shareDoc('${d.id}')" title="Condividi col cliente">📤 Condividi</button>`
          }
        </div>
      </div>`;
    }).join('');

    const s=(pg-1)*PER+1, e=Math.min(pg*PER,filtered.length);
    if (info) info.textContent = `${s}–${e} di ${filtered.length}`;
    UI.pagination(pag, null, pg, filtered.length, PER, p => { pg=p; render(); window.updateSelectionUI(); });
    setTimeout(() => { if(window.updateSelectionUI) window.updateSelectionUI(); }, 10);
  }

  // Upload
  $('btn-upload-document')?.addEventListener('click', async () => {
    const file = $('doc-file')?.files?.[0];
    const cid  = $('doc-client')?.value;
    if (!file) { UI.toast('Seleziona un file','warning'); return; }
    if (!cid)  { UI.toast('Seleziona un cliente a cui associare il documento','warning'); return; }
    const btn = $('btn-upload-document'); if (btn) btn.disabled = true;
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('name', $('doc-name')?.value?.trim() || file.name);
      fd.append('type', $('doc-type')?.value || 'other');
      fd.append('visibility', $('doc-visibility')?.value || 'internal');
      const cid = $('doc-client')?.value; if (cid) fd.append('client_id', cid);
      await API.Documents.upload(fd);
      UI.toast('Documento caricato','success'); modal?.classList.remove('open'); await load();
    } catch(e) { UI.toast(e?.message||'Errore upload','error'); }
    finally { if (btn) btn.disabled = false; }
  });

  // Load clients into upload modal
  modal?.addEventListener('transitionend', async () => {
    if (!modal.classList.contains('open')) return;
    const dc = $('doc-client'); if (!dc || dc.options.length > 1) return;
    try {
      const res = await API.Clients.list().catch(()=>[]);
      const cl  = Array.isArray(res) ? res : (res?.items??res?.data??[]);
      dc.innerHTML = '<option value="">Nessun cliente</option>' + cl.map(c=>`<option value="${c.id}">${c.name||c.email}</option>`).join('');
    } catch {}
  });

  // Open document viewer (get signed URL then open in new tab)
  window.openDoc = async function(id) {
    try {
      const res = await API.get(`/documents/${id}/download-url`);
      const url = res?.url;
      if (url) { window.open(url, '_blank'); }
      else { UI.toast('URL documento non disponibile', 'warning'); }
    } catch(e) { UI.toast(e?.message || 'Errore apertura documento', 'error'); }
  };

  // Delete single document
  window.deleteSingleDoc = async function(id) {
    if (!confirm('Eliminare questo documento? L\'azione è irreversibile.')) return;
    try {
      if (API.Documents?.remove) await API.Documents.remove(id);
      else await API.del(`/documents/${id}`);
      ALL = ALL.filter(d => d.id !== id);
      updateKpis(); applyFilters();
      UI.toast('Documento eliminato', 'success');
    } catch(e) { UI.toast(e?.message || 'Errore eliminazione', 'error'); }
  };

  window.shareDoc   = async id => { try { await API.Documents.update(id,{visibility:'shared'}); ALL=ALL.map(d=>d.id===id?{...d,visibility:'shared'}:d); updateKpis(); applyFilters(); UI.toast('Documento condiviso col cliente','success'); } catch(e) { UI.toast(e?.message||'Errore','error'); } };
  window.unshareDoc = async id => { try { await API.Documents.update(id,{visibility:'internal'}); ALL=ALL.map(d=>d.id===id?{...d,visibility:'internal'}:d); updateKpis(); applyFilters(); UI.toast('Documento reso interno','info'); } catch(e) { UI.toast(e?.message||'Errore','error'); } };

  window.onPageReady(async () => {
    await I18n.init('lang-switcher-slot');
    load();
  });
})();