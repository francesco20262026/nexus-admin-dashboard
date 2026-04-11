/* admin_quotes.js Quotes / Preventivi module (Phase 4) v=24 */
'use strict';
(function () {
  Auth.guard('admin');
  Auth.initUI();

  let ALL = [], filtered = [];
  const saved    = window.SessionState?.load('quotes') || {};
  let pg         = saved.pg  || 1;
  let activeTab  = saved.tab || 'all';
  const PER      = 15;
  let currentSortDir = 'desc';

  const $ = id => document.getElementById(id);
  const list   = $('q-list');
  const search   = $('q-search');
  const fClient  = $('q-filter-client');
  const fChannel = $('q-filter-channel');
  const info   = $('q-info');
  const pag    = $('q-pagination');
  const modal  = $('modal-quote');
  const pipelineBar = $('q-pipeline-bar');

  // ── Cached reference data ─────────────────────────────────
  let _clients  = [];
  let _services = [];

  // ── Page actions ─────────────────────────────────────────
  const act = $('page-actions');
  if (act) act.innerHTML = `
    <button class="btn btn-secondary" id="btn-refresh"><svg style="width:15px;height:15px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/></svg> <span>Aggiorna</span></button>
    <button class="btn-action-icon " id="btn-action-icon-new-quote" title="Nuovo preventivo">
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
</button>`;

  $('btn-refresh')?.addEventListener('click', function() { if(window.UI) UI.toast('Aggiornamento in corso...', 'info'); load(true); });
  $('btn-action-icon-new-quote')?.addEventListener('click', () => openModal(null));

  // ── Status config ─────────────────────────────────────────
  const STATUS_INFO = {
    draft:    { label: 'Bozza',     cls: 'pill-gray'    },
    sent:     { label: 'Inviato',   cls: 'pill-warning' },
    accepted: { label: 'Accettato', cls: 'pill-success' },
    rejected: { label: 'Rifiutato', cls: 'pill-danger'  },
    expired:  { label: 'Scaduto',   cls: 'pill-gray'    },
  };

  // ── Tabs ──────────────────────────────────────────────────
  pipelineBar?.querySelectorAll('.cl-status-pill').forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));
  pipelineBar?.addEventListener('click', e => {
    const b = e.target.closest('.cl-status-pill'); if (!b || b.disabled) return;
    pipelineBar.querySelectorAll('.cl-status-pill').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); activeTab = b.dataset.tab; pg = 1; applyFilters();
  });
  [search, fClient, fChannel].forEach(el => {
    el?.addEventListener('input',  debounce(() => { pg = 1; applyFilters(); }, 200));
    el?.addEventListener('change', () => { pg = 1; applyFilters(); });
  });

  if (window._quotesCmpListener) window.removeEventListener('companyChanged', window._quotesCmpListener);
  window._quotesCmpListener = () => load();
  window.addEventListener('companyChanged', window._quotesCmpListener);
  window._reloadQuotes = load;

  window.selectedIds = new Set();
  
  // ── Load ──────────────────────────────────────────────────
  async function load() {
    window.clearSelection && window.clearSelection();
    if (!list) return;
    list.innerHTML = UI.skeletonCardList(5);
    try {
      const res = await API.Quotes.list({});
      ALL = Array.isArray(res) ? res : (res?.items ?? res?.data ?? []);
      ALL = ALL.map(q => ({ 
        ...q, 
        client_name: q.clients?.name || q.onboarding?.company_name || q.client_name || '',
        supplier_name: q.supplier_company?.name || q.tenant_company?.name || '—'
      }));
      populateClientFilter();
      populateSupplierFilter();
    } catch (e) {
      ALL = [];
      list.innerHTML = UI.errorState('Impossibile caricare i preventivi.', 'window._reloadQuotes()');
    }
    updateKpis();
    applyFilters();
  }

  function populateClientFilter() {
    const fClientEl = document.getElementById('q-filter-client');
    if (!fClientEl) return;
    const prev  = fClientEl.value;
    const names = [...new Set(ALL.map(q => q.client_name).filter(Boolean))].sort();
    fClientEl.innerHTML = `<option value="">Cliente ▼</option>` + names.map(n => `<option value="${n}">${n}</option>`).join('');
    if (prev) fClientEl.value = prev;
  }

  function populateSupplierFilter() {
    const fSupplierEl = document.getElementById('q-filter-supplier');
    if (!fSupplierEl) return;
    const prev  = fSupplierEl.value;
    const names = [...new Set(ALL.map(q => q.supplier_name).filter(Boolean))].sort();
    fSupplierEl.innerHTML = `<option value="">Fornitore ▼</option>` + names.map(n => `<option value="${n}">${n}</option>`).join('');
    if (prev) fSupplierEl.value = prev;
  }

  // ── KPIs ──────────────────────────────────────────────────
  function updateKpis() {
    const set = (id, v) => { const el=$(id); if(el) el.textContent=v; };
    const draft    = ALL.filter(q => q.status === 'draft').length;
    const sent     = ALL.filter(q => q.status === 'sent').length;
    const accepted = ALL.filter(q => q.status === 'accepted').length;
    const rejected = ALL.filter(q => q.status === 'rejected').length;
    const expired  = ALL.filter(q => q.status === 'expired').length;
    const value    = ALL.filter(q => q.status === 'accepted').reduce((s,q) => s + (parseFloat(q.total)||0), 0);
    
    set('kpi-q-all',      ALL.length);
    set('kpi-q-draft',    draft);
    set('kpi-q-sent',     sent);
    set('kpi-q-accepted', accepted);
    set('kpi-q-rejected', rejected);
    set('kpi-q-expired',  expired);
    set('kpi-q-value',    UI.currency(value));
  }

  // ── Filter ────────────────────────────────────────────────
  window.applyFilters = applyFilters;
  
  window.toggleSort = (col) => {
    if (col === 'price') {
      currentSortDir = currentSortDir === 'asc' ? 'desc' : 'asc';
      const el = document.getElementById('sort-icon-price');
      if (el) {
        el.style.transform = currentSortDir === 'desc' ? 'rotate(180deg)' : 'none';
      }
      applyFilters();
    }
  };

  function applyFilters() {
    const q  = (search?.value || '').toLowerCase().trim();
    const fClientEl = document.getElementById('q-filter-client');
    const cl = fClientEl ? fClientEl.value : '';
    const dateFilter = document.getElementById('q-filter-date')?.value || '';
    const statusFilter = document.getElementById('q-filter-status')?.value || '';
    const now = new Date();

    const fSupplierEl = document.getElementById('q-filter-supplier');
    const sup = fSupplierEl ? fSupplierEl.value : '';

    filtered = ALL.filter(item => {
      if (activeTab !== 'all' && item.status !== activeTab) return false;
      if (statusFilter && item.status !== statusFilter) return false;
      if (cl && item.client_name !== cl) return false;
      if (sup && item.supplier_name !== sup) return false;

      if (dateFilter) {
          const cDate = item.created_at ? new Date(item.created_at) : null;
          if (!cDate) return false;
          const diffDays = Math.floor((now - cDate)/(1000*60*60*24));
          if (dateFilter === '7d' && diffDays > 7) return false;
          if (dateFilter === '30d' && diffDays > 30) return false;
          if (dateFilter === 'this_month' && (cDate.getMonth() !== now.getMonth() || cDate.getFullYear() !== now.getFullYear())) return false;
      }
      
      if (q) {
        const hay = [item.title, item.client_name, item.notes].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    // Handle sort by price
    filtered.sort((a, b) => {
      const vA = parseFloat(a.total) || 0;
      const vB = parseFloat(b.total) || 0;
      return currentSortDir === 'desc' ? vB - vA : vA - vB;
    });

    const max = Math.ceil(filtered.length / PER) || 1;
    if (pg > max) pg = max;
    window.SessionState?.save('quotes', { pg, tab: activeTab });
    
    // Update Totals based on filtered rows
    const visibleTotal = filtered.reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0);
    const elValue = document.getElementById('kpi-q-value');
    if (elValue) elValue.textContent = UI.currency(visibleTotal);
    
    // Check if label needs to be updated (Totale in vista)
    const badgeLabel = elValue?.parentNode;
    if (badgeLabel && badgeLabel.childNodes[0] && badgeLabel.childNodes[0].nodeType === 3) {
      badgeLabel.childNodes[0].nodeValue = 'Totale Lista ';
    }

    render();
  }

  // ── Render ────────────────────────────────────────────────
  function render() {
    if (!list) return;
    if (!filtered.length) {
      list.innerHTML = `<div class="list-card">${UI.createEmptyState(null, ALL.length ? 'Nessun preventivo corrisponde ai filtri.' : 'Nessun preventivo presente.')}</div>`;
      if (info) info.textContent = ''; if (pag) pag.innerHTML = ''; return;
    }
    const slice = filtered.slice((pg-1)*PER, pg*PER);
    list.innerHTML = slice.map(q => {
      const si      = STATUS_INFO[q.status] || STATUS_INFO.draft;
      const dateStr = q.valid_until ? `Valido fino: <strong>${UI.date(q.valid_until)}</strong>` : '';
      const acceptedInfo = q.status === 'accepted' && q.accepted_at
        ? `<div class="cl-data-lbl" style="color:var(--success-text,green);">✓ Accettato il ${UI.date(q.accepted_at)}</div>`
        : '';

      const onbStr = q.onboarding_id
        ? `<span style="font-size:11px; font-weight:600; color:var(--brand-500);">Origine: Onboarding</span>`
        : '';
        
      const numberStr = q.number ? `<span style="font-size:12px; font-weight:700; color:var(--brand-600); margin-right:6px;">${q.number}</span>` : '';
      const channelLabel = q.management_channel === 'verbal' ? 'A Voce' : (q.management_channel === 'internal' ? 'Interno' : 'Email');
      const channelStr = `<span style="font-size:11px; padding:2px 6px; border-radius:4px; background:var(--gray-100); color:var(--gray-600);">${channelLabel}</span>`;
      
      const statusPill = `<span class="pill ${si.cls}" style="font-size:11px; padding:2px 8px; border-radius:12px;">${si.label}</span>`;

      // Context-sensitive action buttons
      let actions = '';
      
      // Accetta a voce switch (Show if draft/sent or already accepted)
      if (q.status === 'draft' || q.status === 'sent' || q.status === 'accepted') {
        const isAcc = q.status === 'accepted';
        actions += `
          <div title="${isAcc ? 'Accettato a voce' : 'Accetta a voce'}" style="width:36px; height:20px; border-radius:20px; background:${isAcc?'#34c759':'#e5e5ea'}; position:relative; cursor:${isAcc?'default':'pointer'}; transition:.3s; margin-right:4px;" onclick="event.stopPropagation(); ${isAcc ? '' : `window.acceptVerbalQuote('${q.id}')`}">
            <div style="width:16px; height:16px; background:#fff; border-radius:50%; position:absolute; top:2px; left:2px; transform:${isAcc?'translateX(16px)':'none'}; transition:.3s; box-shadow:0 1px 2px rgba(0,0,0,.2);"></div>
          </div>
        `;
      }

      if (q.status === 'draft' && q.management_channel === 'formal_sent') {
        actions += `<div title="Invia Formale" style="cursor:pointer; font-size:16px; margin-right:4px; opacity:0.8; transition:opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.8" onclick="event.stopPropagation();window.sendQuote('${q.id}')">📤</div>`;
      } else if (q.status === 'sent' && q.management_channel === 'formal_sent') {
        actions += `<div title="Rifiuta" style="cursor:pointer; font-size:16px; margin-right:4px; opacity:0.8; transition:opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.8" onclick="event.stopPropagation();window.rejectQuote('${q.id}')">⛔</div>`;
      }
      
      actions += `<a href="/public_quote.html?token=${q.id}" target="_blank" title="Vedi Anteprima" style="cursor:pointer; font-size:16px; margin-right:4px; opacity:0.8; transition:opacity 0.2s; text-decoration:none;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.8" onclick="event.stopPropagation();">👁️</a>`;
      actions += `<div title="Duplica Preventivo" style="cursor:pointer; font-size:16px; margin-right:4px; opacity:0.8; transition:opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.8" onclick="event.stopPropagation();window.duplicateQuote('${q.id}')">📄</div>`;
      actions += `<div title="Elimina" style="cursor:pointer; font-size:16px; opacity:0.8; transition:opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.8" onclick="window.deleteQuote(event, '${q.id}')">🗑️</div>`;

      const supName = q.supplier_company?.name || q.tenant_company?.name || q.supplier_name || 'Nova CRM';
      let supBadge = 'INT';
      if (supName && supName !== '—') {
        const alias = q.supplier_company?.alias || q.tenant_company?.alias || supName.substring(0,3).toUpperCase();
        supBadge = alias;
      }

      return `<div class="cl-row fade-in" data-id="${q.id}" onclick="window.editQuote('${q.id}')" style="cursor:pointer; display:grid; grid-template-columns: 2.8fr 1.4fr 1.4fr 1.2fr 1fr 1fr 170px; gap: 16px; padding: 10px 24px; min-height: 54px; align-items: center; border-bottom: 1px solid var(--border); transition: background 0.1s;">
        
        <!-- Colonna 1: Cliente -->
        <div class="cl-col cl-col-1" style="min-width:0;">
          <div class="cl-row-identity" style="display:flex; gap:12px; align-items:center; min-width:0;">
            <div class="mac-select-btn" data-id="${q.id}" onclick="window.toggleSelection(event, '${q.id}')" title="Seleziona" style="flex-shrink:0;">
              <div class="mac-checkbox"></div>
            </div>
            
            <div class="avatar cl-row-avatar" style="flex-shrink:0; background:var(--brand-600); color:#fff;">${(q.client_name || q.onboarding?.company_name || 'C').slice(0,2).toUpperCase()}</div>

            <div class="cl-row-identity-body" style="min-width:0;">
              <div class="cl-row-name truncate" style="font-size:14px; font-weight:600; color:var(--gray-900);" title="${(q.client_name || q.onboarding?.company_name || 'Nessun cliente').replace(/"/g, '&quot;')}">${q.client_name || q.onboarding?.company_name || 'Nessun cliente'}</div>
              <div class="cl-row-meta" style="display:flex; gap:8px; align-items:center; margin-top:2px;">
                 ${onbStr ? `<span class="cl-row-chip">${onbStr}</span>` : ''}
              </div>
            </div>
          </div>
        </div>

        <!-- Colonna 2: Fornitore -->
        <div class="cl-col" style="min-width: 0; display:flex; flex-direction:column; justify-content:center; align-items:flex-start;">
          <div title="${supName}" style="font-size:11px;font-weight:700;color:var(--gray-600);background:var(--gray-100);padding:2px 6px;border-radius:4px;cursor:help;">
            ${supBadge}
          </div>
        </div>

        <!-- Colonna 3: Preventivo -->
        <div class="cl-col" style="min-width:0;">
          <a href="/public_quote.html?token=${q.id}" target="_blank" style="text-decoration:none;" title="Clicca per vedere l'anteprima pubblica" onclick="event.stopPropagation();">
            <div style="font-size:13px; font-weight:600; color:var(--brand-600);">${q.number||''}</div>
            ${q.title ? `<div style="font-size:13px; font-weight:500; color:var(--gray-900); margin-top:2px; white-space:normal; word-break:break-word; line-height:1.3;">${q.title}</div>` : ''}
          </a>
        </div>

        <!-- Colonna 4: Date -->
        <div class="cl-col" style="min-width:0;">
          <div class="cl-data-val" style="font-size:13px; color:var(--gray-700);">${dateStr}</div>
          ${acceptedInfo}
        </div>

        <!-- Colonna 5: Importo -->
        <div class="cl-col" style="min-width:0; align-items:flex-start;">
          <div class="cl-data-val" style="font-size:14px; font-weight:700; color:var(--gray-900);">${UI.currency(q.total || 0)}</div>
        </div>

        <!-- Colonna 6: Stato -->
        <div class="cl-col" style="min-width:0; align-items:flex-start;">
          ${statusPill}
        </div>

        <!-- Colonna 7: Azioni -->
        <div class="cl-col cl-col-actions" style="display:flex; flex-direction:row; align-items:center; flex-wrap:wrap; justify-content:flex-end; gap:6px;">
          ${actions}
        </div>
      </div>`;
    }).join('');

    window.updateSelectionUI && window.updateSelectionUI();

    const s=(pg-1)*PER+1, e=Math.min(pg*PER,filtered.length);
    if (info) info.textContent = `${s}–${e} di ${filtered.length}`;
    UI.pagination(pag, null, pg, filtered.length, PER, p => { pg=p; render(); });
  }

  // ── Selection Logic ─────────────────────────────────────────
  window.toggleSelection = (e, id) => {
    e.stopPropagation();
    if (window.selectedIds.has(id)) {
      window.selectedIds.delete(id);
    } else {
      window.selectedIds.add(id);
    }
    window.updateSelectionUI();
  };

  window.toggleSelectAll = () => {
    if (!filtered || filtered.length === 0) return;
    if (window.selectedIds.size === filtered.length) {
      window.selectedIds.clear();
    } else {
      filtered.forEach(r => window.selectedIds.add(r.id));
    }
    window.updateSelectionUI();
  };

  window.clearSelection = () => {
    window.selectedIds.clear();
    window.updateSelectionUI();
  };

  window.updateSelectionUI = () => {
    const listEl = document.getElementById('q-list');
    if (!listEl) return;
    
    // Update individual row checkboxes and backgrounds
    listEl.querySelectorAll('.cl-row').forEach(row => {
      const id = row.getAttribute('data-id');
      const btn = row.querySelector('.mac-row-select');
      if (window.selectedIds.has(id)) {
        if (btn) btn.classList.add('selected');
        row.classList.add('selected');
        row.style.background = 'var(--gray-50)';
      } else {
        if (btn) btn.classList.remove('selected');
        row.classList.remove('selected');
        row.style.background = 'transparent';
      }
    });

    // Update 'Select All' checkbox in header
    const selectAllBtn = document.getElementById('btn-select-all');
    if (selectAllBtn) {
      if (filtered && filtered.length > 0 && window.selectedIds.size === filtered.length) {
        selectAllBtn.classList.add('selected');
      } else {
        selectAllBtn.classList.remove('selected');
      }
    }

    // Toggle Mass Action Bar
    const bar = document.getElementById('mac-mass-action-bar');
    if (bar) {
      if (window.selectedIds.size > 0) {
        document.getElementById('mac-selected-count').textContent = window.selectedIds.size + ' selezionat' + (window.selectedIds.size === 1 ? 'o' : 'i');
        bar.classList.add('visible');
      } else {
        bar.classList.remove('visible');
      }
    }
  };

  window.massDelete = async () => {
    if (!window.selectedIds.size) return;
    if (!await UI.confirm('Sei sicuro di voler eliminare ' + window.selectedIds.size + ' preventivi? Quest\'azione è irreversibile.')) return;
    
    if (window.UI) window.UI.toast('Eliminazione in corso...', 'info');
    try {
      for (let id of window.selectedIds) {
         await API.Quotes.remove(id);
      }
      if (window.UI) window.UI.toast('Eliminazione completata', 'success');
      window.clearSelection();
      load();
    } catch(e) {
      if (window.UI) window.UI.toast('Errore durante l\'eliminazione', 'error');
    }
  };

  window.deleteQuote = async (e, id) => {
    e.stopPropagation();
    if (!await UI.confirm('Sei sicuro di voler eliminare questo preventivo? Quest\'azione è irreversibile.')) return;
    if (window.UI) window.UI.toast('Eliminazione in corso...', 'info');
    try {
      await API.Quotes.remove(id);
      if (window.UI) window.UI.toast('Preventivo eliminato', 'success');
      load();
    } catch(err) {
      if (window.UI) window.UI.toast('Errore durante l\'eliminazione', 'error');
    }
  };

  // ── Modal helpers ─────────────────────────────────────────

  function addLineRow(line = {}) {
    const container = $('q-lines-container');
    if (!container) return;
    const idx = container.querySelectorAll('.q-line-row').length;

    const supplierId = $('q-supplier-company') ? $('q-supplier-company').value : null;
    let filteredSource = _services.filter(s => s.is_active !== false && s.visible_in_quotes !== false);
    filteredSource = filteredSource.filter(s => supplierId ? String(s.company_id) === String(supplierId) : true);

    const serviceOptions = filteredSource.map(s =>
      `<option value="${s.id}" data-price="${s.price||0}" data-name="${s.name||''}">${s.name} - €${s.price||0}</option>`
    ).join('');

    const row = document.createElement('div');
    row.className = 'q-line-row';
    row.style.cssText = 'display:grid;grid-template-columns:2fr 1fr 1fr 1fr auto;gap:6px;align-items:center;margin-bottom:8px;';
    row.innerHTML = `
      <div>
        <select class="form-input q-line-service" style="width:100%;font-size:12px;" title="Seleziona dal Catalogo Servizi">
          <option value="">Seleziona Servizio dal Catalogo (oppure scrivi a mano)</option>${serviceOptions}
        </select>
        <input class="form-input q-line-desc" type="text" placeholder="Descrizione *" value="${line.description||''}" style="margin-top:4px;font-size:12px;"/>
      </div>
      <input class="form-input q-line-qty" type="number" min="0.01" step="0.01" value="${line.quantity||1}" placeholder="Qtà" style="font-size:12px;"/>
      <input class="form-input q-line-price" type="number" min="0" step="0.01" value="${line.unit_price||0}" placeholder="Prezzo" style="font-size:12px;"/>
      <div style="display:flex;align-items:center;gap:4px;">
        <input class="form-input q-line-vat" type="number" min="0" step="1" value="${line.vat_rate !== undefined ? line.vat_rate : 0}" placeholder="IVA %" style="font-size:12px;width:60px;"/>
        <span style="font-size:11px;color:var(--gray-400);">%</span>
      </div>
      <button type="button" class="icon-btn q-remove-line" title="Rimuovi">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/></svg>
      </button>`;

    // Service pick → autofill
    const svcSel = row.querySelector('.q-line-service');
    const descInp= row.querySelector('.q-line-desc');
    const priceInp=row.querySelector('.q-line-price');
    svcSel.addEventListener('change', () => {
      const opt = svcSel.options[svcSel.selectedIndex];
      if (opt.value) {
        descInp.value  = opt.dataset.name;
        priceInp.value = parseFloat(opt.dataset.price) || 0;
      }
      recalcTotals();
    });
    if (line.service_id) svcSel.value = line.service_id;

    // Recalc on any change
    row.querySelectorAll('.q-line-qty,.q-line-price,.q-line-vat').forEach(el =>
      el.addEventListener('input', recalcTotals)
    );
    row.querySelector('.q-remove-line').addEventListener('click', () => {
      row.remove(); recalcTotals();
    });

    container.appendChild(row);
    recalcTotals();
  }

  function recalcTotals() {
    const rows = document.querySelectorAll('.q-line-row');
    let net = 0, vat = 0;
    rows.forEach(row => {
      const qty   = parseFloat(row.querySelector('.q-line-qty')?.value) || 0;
      const price = parseFloat(row.querySelector('.q-line-price')?.value) || 0;
      const vatR  = parseFloat(row.querySelector('.q-line-vat')?.value) || 0;
      const lineNet = qty * price;
      net += lineNet;
      vat += lineNet * vatR / 100;
    });
    const fmt = v => `€ ${v.toFixed(2).replace('.', ',')}`;
    const el = id => document.getElementById(id);
    if (el('q-total-net')) el('q-total-net').textContent = fmt(net);
    if (el('q-total-vat')) el('q-total-vat').textContent = fmt(vat);
    if (el('q-total'))     el('q-total').textContent     = fmt(net + vat);
  }

  function readLines() {
    const rows = document.querySelectorAll('.q-line-row');
    const lines = [];
    rows.forEach(row => {
      const desc  = row.querySelector('.q-line-desc')?.value?.trim();
      const svcId = row.querySelector('.q-line-service')?.value || null;
      const qty   = parseFloat(row.querySelector('.q-line-qty')?.value)   || 1;
      const price = parseFloat(row.querySelector('.q-line-price')?.value)  || 0;
      const parsedVat = parseFloat(row.querySelector('.q-line-vat')?.value);
      const vatR  = isNaN(parsedVat) ? 0 : parsedVat;
      if (!desc) return;
      lines.push({
        service_id:  svcId || undefined,
        description: desc,
        quantity:    qty,
        unit_price:  price,
        vat_rate:    vatR,
      });
    });
    return lines;
  }

  // ── Open modal ────────────────────────────────────────────
  // preset: { onboarding_id, client_id } used when opening from onboarding/client detail
  async function openModal(existingId = null, preset = null) {
    if (!modal) return;

    const isEdit     = !!existingId;
    const titleEl    = $('q-modal-title');
    const editIdEl   = $('q-edit-id');
    const clientSel  = $('q-client');
    const onbSel     = $('q-onboarding-id');
    const container  = $('q-lines-container');

    if (titleEl)  titleEl.textContent = isEdit ? 'Modifica Preventivo' : 'Nuovo Preventivo';
    if (editIdEl) editIdEl.value      = existingId || '';
    if (container) container.innerHTML = '';

    // Reset fields
    ['q-title','q-valid-until','q-notes'].forEach(id => { const el=$(id); if(el) el.value=''; });
    if ($('q-supplier-company')) $('q-supplier-company').value = '';
    if ($('q-management-channel')) $('q-management-channel').value = 'formal_sent';
    recalcTotals();
    modal.classList.add('open');

    try {
      const [clientsRes, servicesRes, onbRes, companiesRes] = await Promise.all([
        API.Clients.list().catch(() => []),
        API.Services.catalog(true, true).catch(() => []),
        API.Onboarding.list().catch(() => []),
        API.Companies.list().catch(() => []),
      ]);
      _clients  = Array.isArray(clientsRes)  ? clientsRes  : (clientsRes?.items  ?? clientsRes?.data  ?? []);
      _services = Array.isArray(servicesRes) ? servicesRes : (servicesRes?.items ?? servicesRes?.data ?? []);
      const onbs    = Array.isArray(onbRes)     ? onbRes     : (onbRes?.items    ?? onbRes?.data    ?? []);
      const comps   = Array.isArray(companiesRes)? companiesRes : (companiesRes?.items ?? companiesRes?.data ?? []);

      const supplierSel = $('q-supplier-company');
      if (supplierSel) {
        supplierSel.innerHTML = '<option value="">(Seleziona Fornitore)</option>' +
          comps.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
      }

      if (clientSel) {
        clientSel.innerHTML = '<option value="">Seleziona cliente</option>' +
          _clients.map(c => `<option value="${c.id}">${c.name || c.email}</option>`).join('');
      }
      if (onbSel) {
        // Show company_name (the prospect name) not reference_name/status
        onbSel.innerHTML = '<option value="">Nessuno</option>' +
          onbs
            .filter(o => !['attivo','abbandonato','annullato','cancelled'].includes(o.status))
            .map(o => {
              const label = o.company_name || o.clients?.name || o.reference_name || o.status;
              return `<option value="${o.id}">${label}</option>`;
            })
            .join('');
      }

      // Load existing quote data for edit
      if (isEdit) {
        const q = await API.Quotes.get(existingId);
        if ($('q-title'))       $('q-title').value       = q.title || '';
        if ($('q-valid-until')) $('q-valid-until').value = q.valid_until || '';
        if ($('q-notes'))       $('q-notes').value       = q.notes || '';
        if (clientSel)          clientSel.value          = q.client_id || '';
        if (onbSel)             onbSel.value             = q.onboarding_id || '';
        if ($('q-supplier-company')) $('q-supplier-company').value = q.supplier_company_id || '';
        if ($('q-management-channel')) $('q-management-channel').value = q.management_channel || 'formal_sent';
        // Load lines
        const lines = q.quote_lines || [];
        lines.forEach(ln => addLineRow(ln));
      } else {
        // Pre-select from preset (e.g., coming from onboarding detail)
        if (preset?.onboarding_id && onbSel)  onbSel.value    = preset.onboarding_id;
        if (preset?.client_id    && clientSel) clientSel.value = preset.client_id;
        // Default: 7 days validity
        const d = new Date(); d.setDate(d.getDate() + 7);
        const el = $('q-valid-until'); if (el) el.value = d.toISOString().split('T')[0];
        // Start with one empty line
        addLineRow();
      }

      // Setup Service Multiselect & Supplier filtering
      const supplierSelNode = $('q-supplier-company');
      const sMulti = $('q-services-multiselect');
      
      const populateServicesMultiSelect = () => {
        if (!sMulti) return;
        const supplierId = supplierSelNode ? supplierSelNode.value : '';
        const filteredServices = _services.filter(s => {
          if (!supplierId) return true;
          return String(s.company_id) === String(supplierId);
        });
        sMulti.innerHTML = filteredServices.map(s =>
          `<option value="${s.id}" data-price="${s.price||0}" data-name="${s.name||''}">${s.name} - €${s.price||0}</option>`
        ).join('');
      };

      if (supplierSelNode && !supplierSelNode.hasListener) {
        supplierSelNode.hasListener = true;
        supplierSelNode.addEventListener('change', populateServicesMultiSelect);
      }
      populateServicesMultiSelect();

      if (sMulti && !sMulti.hasListener) {
        sMulti.hasListener = true;
        sMulti.addEventListener('change', () => {
          const selectedOptions = Array.from(sMulti.selectedOptions);
          selectedOptions.forEach(opt => {
             let hasLine = false;
             document.querySelectorAll('.q-line-service').forEach(sel => {
               if (sel.value === opt.value) hasLine = true;
             });
             if (!hasLine) {
               addLineRow({
                 service_id: opt.value,
                 description: opt.dataset.name,
                 unit_price: parseFloat(opt.dataset.price) || 0
               });
             }
          });
          // Also remove lines for options that were unselected from the multiselect
          document.querySelectorAll('.q-line-row').forEach(row => {
            const rowSvcNode = row.querySelector('.q-line-service');
            if (rowSvcNode && rowSvcNode.value) {
              const isSelected = selectedOptions.some(opt => opt.value === rowSvcNode.value);
              // if it exists in the multiselect options but is NOT selected, remove it
              const optExists = Array.from(sMulti.options).some(o => o.value === rowSvcNode.value);
              if (optExists && !isSelected) {
                row.remove();
                if (typeof recalcTotals === 'function') recalcTotals();
              }
            }
          });
        });
      }

    } catch (e) {
      UI.toast('Errore nel caricamento dei dati', 'error');
    }
  }

  $('btn-add-line')?.addEventListener('click', () => addLineRow());

  $('btn-save-quote')?.addEventListener('click', async () => {
    const clientId     = $('q-client')?.value;
    const onboardingId = $('q-onboarding-id')?.value;
    const title        = $('q-title')?.value?.trim();
    const managementChannel = $('q-management-channel')?.value || 'formal_sent';
    const supplierCompanyId = $('q-supplier-company')?.value || null;

    if ((!clientId && !onboardingId) || !title) { UI.toast('Titolo e (Cliente OPPURE Onboarding) sono obbligatori', 'warning'); return; }

    const lines       = readLines();
    const editId      = $('q-edit-id')?.value || null;
    const validUntil  = $('q-valid-until')?.value || null;
    const notes       = $('q-notes')?.value?.trim() || null;

    const body = {
      client_id:     clientId || undefined,
      onboarding_id: onboardingId || undefined,
      supplier_company_id: supplierCompanyId || undefined,
      management_channel: managementChannel,
      title,
      valid_until:   validUntil || undefined,
      notes:         notes || undefined,
      lines,
    };

    const btn = $('btn-save-quote'); if (btn) btn.disabled = true;
    try {
      if (editId) {
        await API.Quotes.update(editId, body);
        UI.toast('Preventivo aggiornato', 'success');
      } else {
        await API.Quotes.create(body);
        UI.toast('Preventivo creato', 'success');
      }
      modal?.classList.remove('open');
      await load();
    } catch (e) { UI.toast(e?.message || 'Errore', 'error'); }
    finally { if (btn) btn.disabled = false; }
  });

  // ── Row actions ───────────────────────────────────────────

  window.editQuote = id => openModal(id);

  window.sendQuote = async id => {
    // ── Pre-flight check ────────────────────────────────────────
    try {
      const pf = await API.Quotes.preflight(id);

      // Warn if proforma data is incomplete (non-blocking)
      if (!pf.proforma_data_complete && pf.missing_fields?.length) {
        const missingList = pf.missing_fields.join(', ');
        UI.toast(
          `⚠️ Dati mancanti per la proforma: ${missingList}. Il contratto e la proforma NON partiranno in automatico.`,
          'warning',
          8000
        );
      }
    } catch (_) { /* ignore preflight errors */ }

    // Standard confirm before sending
    if (!await UI.confirm('Inviare il preventivo al cliente?')) return;
    // ── Send ────────────────────────────────────────────────────
    try {
      await API.Quotes.send(id);
      ALL = ALL.map(q => q.id===id ? {...q, status:'sent', sent_at:new Date().toISOString()} : q);
      updateKpis(); applyFilters(); UI.toast('Preventivo segnato come inviato','success');
    } catch(e) { UI.toast(e?.message||'Errore','error'); }
  };

  window.acceptQuote = async id => {
    if (!await UI.confirm('Segnare il preventivo come accettato dal cliente? Questo genererà e invierà automaticamente il contratto via email.')) return;
    try {
      const res = await API.Quotes.accept(id);
      ALL = ALL.map(q => q.id===id ? {...q, status:'accepted', accepted_at:new Date().toISOString()} : q);
      const msg = res?.contract_auto_sent
        ? '✓ Preventivo accettato Contratto generato e inviato automaticamente via email!'
        : '✓ Preventivo accettato Contratto creato in bozza. Vai su Contratti per inviarlo.';
      updateKpis(); applyFilters(); UI.toast(msg, 'success');
    } catch(e) { UI.toast(e?.message||'Errore','error'); }
  };

  window.acceptVerbalQuote = async id => {
    if (!await UI.confirm('Segnare il preventivo come accettato verbalmente? Potrai generare o collegare un contratto in seguito dalla pagina di dettaglio.')) return;
    try {
      await API.Quotes.acceptVerbal(id);
      ALL = ALL.map(q => q.id===id ? {...q, status:'accepted', accepted_at:new Date().toISOString()} : q);
      updateKpis(); applyFilters(); UI.toast('✓ Preventivo accettato a voce', 'success');
    } catch(e) { UI.toast(e?.message||'Errore','error'); }
  };

  window.rejectQuote = async id => {
    if (!await UI.confirm('Segnare il preventivo come rifiutato?')) return;
    try {
      await API.Quotes.reject(id);
      ALL = ALL.map(q => q.id===id ? {...q, status:'rejected', rejected_at:new Date().toISOString()} : q);
      updateKpis(); applyFilters(); UI.toast('Preventivo segnato come rifiutato','info');
    } catch(e) { UI.toast(e?.message||'Errore','error'); }
  };

  window.expireQuote = async id => {
    if (!await UI.confirm('Segnare il preventivo come scaduto?')) return;
    try {
      await API.Quotes.expire(id);
      ALL = ALL.map(q => q.id===id ? {...q, status:'expired'} : q);
      updateKpis(); applyFilters(); UI.toast('Preventivo scaduto','info');
    } catch(e) { UI.toast(e?.message||'Errore','error'); }
  };
  
  window.duplicateQuote = async id => {
    if (!await UI.confirm('Vuoi davvero duplicare questo preventivo? Verrà generata una copia esatta in bozza.')) return;
    try {
      await API.Quotes.duplicate(id);
      UI.toast('Preventivo duplicato correttamente.', 'success');
      await load();
    } catch(e) { UI.toast(e?.message || 'Errore. Impossibile duplicare', 'error'); }
  };

  window.onPageReady(async () => {
    await I18n.init('lang-switcher-slot');
    await load();
    // ── URL param support ─────────────────────────────────────
    const params = new URLSearchParams(location.search);
    const hlId   = params.get('highlight');
    if (hlId) {
      const card = document.querySelector(`[data-id="${hlId}"]`);
      if (card) {
        card.style.outline = '2px solid var(--brand-500,#6366f1)';
        card.style.borderRadius = '10px';
        card.style.transition = 'outline 0.3s';
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => { card.style.outline = ''; }, 4000);
      }
    }
    // ?new=1[&onboarding=<id>][&client_id=<id>] opens modal with preset
    if (params.get('new') === '1') {
      const preset = {};
      if (params.get('onboarding')) preset.onboarding_id = params.get('onboarding');
      if (params.get('client_id'))  preset.client_id     = params.get('client_id');
      openModal(null, Object.keys(preset).length ? preset : null);
    }
  });
})();
