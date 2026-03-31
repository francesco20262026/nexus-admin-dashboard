/* admin_contracts.js Contracts lifecycle management */
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
  const pipelineBar  = $('ctr-pipeline-bar');
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
    <button class="btn-action-icon " id="btn-action-icon-new-contract" title="Nuovo contratto">
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
</button>`;
  $('btn-refresh')?.addEventListener('click', function() { if(window.UI) UI.toast('Aggiornamento in corso...', 'info'); load(true); });
  $('btn-action-icon-new-contract')?.addEventListener('click', openModal);

  // Restore tab
  pipelineBar?.querySelectorAll('.cl-status-pill').forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));

  // Event listeners
  pipelineBar?.addEventListener('click', e => {
    const b = e.target.closest('.cl-status-pill'); if (!b) return;
    pipelineBar.querySelectorAll('.cl-status-pill').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); activeTab = b.dataset.tab; page = 1; applyFilters();
  });
  [search, fClient, fTpl, fFrom, fTo].forEach(el =>
    el?.addEventListener('change', () => { page = 1; applyFilters(); }));
  search?.addEventListener('input', debounce(() => { page = 1; applyFilters(); }, 200));

  window.addEventListener('companyChanged', load);
  window._reloadContracts = load;

  // ── Load ──────────────────────────────────────────────────────
  async function load() {
    if (!list) return;
    list.innerHTML = UI.skeletonCardList(5);
    try {
      const res = await API.Contracts.list({});
      const raw = Array.isArray(res) ? res : (res?.items ?? res?.data ?? []);
      ALL = raw.map(c => ({
        ...c,
        client_name: c.clients?.name || c.clients?.email || c.onboarding?.company_name || c.onboarding?.email || null,
        template_name: c.document_templates?.name || null
      }));
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
    const set = (id, v) => { const el=$(id); if(el) el.textContent=v; };
    set('kpi-ctr-all',     ALL.length);
    set('kpi-ctr-draft',   ALL.filter(c => c.status === 'draft').length);
    set('kpi-ctr-sent',    ALL.filter(c => c.status === 'sent').length);
    set('kpi-ctr-signing', ALL.filter(c => c.status === 'signing' || c.status === 'sent').length);
    set('kpi-ctr-signed',  ALL.filter(c => c.status === 'signed' || c.status === 'active').length);
    set('kpi-ctr-archived', ALL.filter(c => c.status === 'archived').length);
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
    filtered.slice((page-1)*PER, page*PER).forEach(i => {
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
      const currentPageIds = filtered.slice((page-1)*PER, page*PER).map(i => i.id);
      // Ensure all items on current page are selected
      const allSelected = currentPageIds.length > 0 && currentPageIds.every(id => window.selectedIds.has(id));
      if (allSelected) selectAllBtn.classList.add('selected');
      else selectAllBtn.classList.remove('selected');
    }
  };
  
  window.massDelete = async function() {
    if (window.selectedIds.size === 0) return;
    
    // Filter only drafts or allowed
    const toDeleteIds = [];
    let disallowedCount = 0;
    
    for (const id of window.selectedIds) {
      const contract = ALL.find(c => c.id === id);
      if (contract && contract.status === 'draft') {
        toDeleteIds.push(id);
      } else {
        disallowedCount++;
      }
    }
    
    if (toDeleteIds.length === 0) {
      UI.toast('Solo le bozze possono essere eliminate in massa.', 'warning');
      return;
    }
    
    let msg = `Sei sicuro di voler eliminare ${toDeleteIds.length} bozze?`;
    if (disallowedCount > 0) {
      msg += `\nAlcuni record (${disallowedCount}) sono stati ignorati perché non sono bozze e non possono essere eliminati.`;
    }
    
    if (!confirm(msg)) return;
    
    let success = 0;
    try {
      UI.toast(`Eliminazione di ${toDeleteIds.length} bozze in corso...`, 'info');
      // Execute deletions sequentially to avoid overloading the API
      for (const id of toDeleteIds) {
        try {
          if (API.Contracts.remove) {
             await API.Contracts.remove(id);
          } else {
             await API.del(`/contracts/${id}`);
          }
          success++;
        } catch (err) {
          console.error(`Error deleting contract ${id}:`, err);
        }
      }
      
      if (success > 0) {
        UI.toast(`${success} bozze eliminate con successo.`, 'success');
        window.clearSelection();
        load();
      } else {
        UI.toast("Errore durante l\'eliminazione. Riprova.", 'error');
      }
    } catch (e) {
      UI.toast("Errore durante l\'eliminazione multipla.", 'error');
    }
  };

  // ── Render ────────────────────────────────────────────────────
  function render() {
    if (!list) return;
    if (!filtered.length) {
      list.innerHTML = `<div class="list-card">${UI.createEmptyState(null, ALL.length ? 'Nessun record corrisponde ai filtri.' : 'Nessun contratto presente.')}</div>`;
      if (info) info.textContent = ''; if (pag) pag.innerHTML = ''; return;
    }
    const slice = filtered.slice((page-1)*PER, page*PER);

    list.innerHTML = slice.map(c => {
      const isSelected = window.selectedIds.has(c.id);
      const sentDate   = c.sent_at   ? UI.date(c.sent_at)   : '';
      const signedDate = c.signed_at ? UI.date(c.signed_at) : '';
      const validTo    = c.valid_to  ? UI.date(c.valid_to)  : null;

      return `<div class="cl-row fade-in ${isSelected ? 'selected' : ''}" data-id="${c.id}" style="display:grid; grid-template-columns: 2.5fr 1.5fr 1.5fr 140px; align-items:center; gap:16px; padding:16px 24px; border-bottom:1px solid var(--border); transition:all 0.15s; cursor:pointer;" onclick="document.querySelector('.mac-select-btn', this)?.click()">
        <!-- Colonna 1: Info Base -->
        <div class="cl-col cl-col-1">
          <div class="cl-row-identity">
            <div class="mac-select-btn ${isSelected ? 'selected' : ''}" data-id="${c.id}" onclick="window.toggleSelection(event, '${c.id}')" style="flex-shrink:0;">
              <div class="mac-checkbox"></div>
            </div>
          <div style="flex:1; min-width:0;">
            <div class="cl-row-name" style="font-size:14px; font-weight:600; color:var(--gray-900); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${c.title || 'Contratto senza titolo'}</div>
            <div class="cl-row-meta" style="display:flex; gap:8px; align-items:center; margin-top:2px;">
              <span class="cl-row-chip" style="font-size:12px;"><a href="admin_client_detail.html?id=${c.client_id}" onclick="event.stopPropagation();" style="color:var(--brand-600); text-decoration:none;">🏢 ${c.client_name || 'Sconosciuto'}</a></span>
              ${c.template_name ? `<span class="cl-row-chip" style="font-size:12px; color:var(--gray-500);">📄 ${c.template_name}</span>` : ''}
            </div>
          </div>
        </div>

        </div>
        <!-- Colonna 2: Date Invio/Firma -->
        <div class="cl-col" style="min-width:0;">
          <div style="font-size:12px; color:var(--gray-600);">Inviato: <span style="font-weight:600;">${sentDate}</span></div>
          <div style="font-size:12px; color:var(--gray-600); margin-top:2px;">Firmato: <span style="font-weight:600;">${signedDate}</span></div>
          ${validTo ? `<div style="font-size:12px; color:var(--gray-500); margin-top:2px;">Scade: ${validTo}</div>` : ''}
        </div>

        <!-- Colonna 3: Riepilogo Componenti e Stato -->
        <div class="cl-col" style="min-width:0;">
          <div style="margin-bottom:4px;">${UI.pill(c.status || 'draft')}</div>
          ${c.service_name ? `<div style="font-size:12px; color:var(--gray-500); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${c.service_name.replace(/"/g,'&quot;')}">📦 ${c.service_name}</div>` : ''}
          ${c.quote_id ? `<div style="font-size:12px; margin-top:2px;"><a href="admin_quotes.html?highlight=${c.quote_id}" onclick="event.stopPropagation();" style="color:var(--brand-600); text-decoration:none;">📋 Da preventivo</a></div>` : ''}
        </div>

        <!-- Colonna 4: Azioni -->
        <div class="cl-col cl-col-actions" style="display:flex; flex-direction:row; align-items:center; gap:8px; justify-content:flex-end;">
          <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); viewContract('${c.id}')" title="Visualizza contratto">👁 Visualizza</button>
          ${c.status === 'draft' ? `<button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); editContract('${c.id}')">✏️ Modifica</button>` : ''}
          ${c.status === 'draft' ? `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); sendContract('${c.id}')">Invia per firma</button>` : ''}
          ${(c.status === 'sent' || c.status === 'signing') ? `<button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); checkSignStatus('${c.id}')">Verifica stato</button>` : ''}
          ${(c.status === 'signed' || c.status === 'active') ? `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); archiveContract('${c.id}')">Archivia</button>` : ''}
          ${c.status === 'draft' ? `<button class="btn btn-ghost btn-sm" style="color:#dc2626;" onclick="event.stopPropagation(); deleteContract('${c.id}')" title="Elimina bozza">🗑</button>` : ''}
          <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); downloadContract('${c.id}')" title="Stampa / Scarica PDF">
            <svg style="width:14px;height:14px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>
            <span class="sr-only">Scarica</span>
          </button>
        </div>
      </div>`;
    }).join('');
    const s=(page-1)*PER+1, e=Math.min(page*PER,filtered.length);
    if (info) info.textContent = `${s}–${e} di ${filtered.length}`;
    UI.pagination(pag, null, page, filtered.length, PER, p => { page=p; render(); window.updateSelectionUI(); });
    setTimeout(() => { if(window.updateSelectionUI) window.updateSelectionUI(); }, 10);
  }

  async function openModal(editId = null) {
    // If editId happens to be an Event (from click), reset to null
    if (editId instanceof Event) editId = null;
    
    if (!modal) return;
    const wc = $('w-client'), wt = $('w-template');
    if (wc) wc.innerHTML = '<option value="">Caricamento…</option>';
    if (wt) wt.innerHTML = '<option value="">Caricamento…</option>';
    const wsList = document.getElementById('w-service-list');
    if (wsList) wsList.innerHTML = '<div style="padding:12px;font-size:13px;color:var(--gray-400);">Caricamento servizi…</div>';
    modal.classList.add('open');

    // Load individually so one failure doesn't block the others
    const [clientsRes, tplsRes, srvsRes, onbRes] = await Promise.all([
      API.Clients.list().catch(e => { console.warn('[contracts] clients load error:', e); return null; }),
      API.Contracts.templates().catch(e => { console.warn('[contracts] templates load error:', e); return null; }),
      API.Services.catalog(true).catch(e => { console.warn('[contracts] services load error:', e); return null; }),
      API.Onboarding.list({}).catch(() => null),
    ]);

    // ── Clients (convertiti) ──
    const cl = clientsRes
      ? (Array.isArray(clientsRes) ? clientsRes : (clientsRes.data ?? clientsRes.items ?? []))
      : [];

    // ── Prospect (da onboarding non ancora cancellati) ──
    const onbRaw = onbRes
      ? (Array.isArray(onbRes) ? onbRes : (onbRes.data ?? onbRes.items ?? []))
      : [];
    const prospects = onbRaw
      .filter(o => o.status !== 'cancelled')   // escludi solo i cancellati
      .map(o => ({
        id: `onb:${o.id}`,
        company_name: o.company_name || o.email || '',
        status: 'prospect',
        _isProspect: true,
        _stage: o.status,
      }));


    // Merge, sort alphabetically, clients first then prospects
    const allClients = [...cl, ...prospects].sort((a, b) => {
      const la = String(a.company_name || a.name || '');
      const lb = String(b.company_name || b.name || '');
      return la.localeCompare(lb, 'it');
    });

    if (!allClients.length) {
      UI.toast('Nessun cliente o prospect trovato.', 'warning');
    }
    if (wc) wc.innerHTML = '<option value="">Seleziona cliente</option>' + allClients.map(c => {
      const label = c.company_name || c.name || c.email || '';
      const badge = c._isProspect
        ? ` 🔸 [prospect${c._stage ? ' · ' + c._stage : ''}]`
        : (c.status && c.status !== 'active' ? ` [${c.status}]` : '');
      return `<option value="${c.id}">${label}${badge}</option>`;
    }).join('');


    // ── Templates ──
    const tl = tplsRes
      ? (Array.isArray(tplsRes) ? tplsRes : (tplsRes.data ?? tplsRes.items ?? []))
      : [];
    if (wt) wt.innerHTML = '<option value="">Seleziona template</option>' + tl.map(t => `<option value="${t.id}">${t.name}</option>`).join('');

    // ── Services (checkbox list) ──
    const sl = srvsRes
      ? (Array.isArray(srvsRes) ? srvsRes : (srvsRes.data ?? srvsRes.items ?? []))
      : [];
    if (wsList) {
      if (!sl.length) {
        wsList.innerHTML = '<div style="padding:12px;font-size:13px;color:var(--gray-400);">Nessun servizio disponibile</div>';
      } else {
        wsList.innerHTML = sl.map(s => {
          const price = parseFloat(s.price || s.monthly_price || 0);
          const cycle = s.billing_cycle === 'annual' ? '/anno' : s.billing_cycle === 'quarterly' ? '/trim' : '/mese';
          const priceStr = price > 0 ? `€${price.toFixed(2).replace('.',',')}${cycle}` : '';
          return `<label style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);transition:background .15s" onmouseenter="this.style.background='#f0fdf4'" onmouseleave="this.style.background=''">
            <input type="checkbox" value="${s.id}" data-price="${price}" class="svc-cb" style="width:16px;height:16px;accent-color:var(--brand-600);flex-shrink:0;">
            <span style="font-size:13px;color:var(--gray-900);flex:1;">${s.name}</span>
            ${priceStr ? `<span style="font-size:13px;font-weight:700;color:#16a34a;background:#f0fdf4;padding:2px 8px;border-radius:6px;white-space:nowrap;">${priceStr}</span>` : ''}
          </label>`;
        }).join('');
        const labels = wsList.querySelectorAll('label');
        if (labels.length) labels[labels.length - 1].style.borderBottom = 'none';

        // Live total bar remove previous instance if modal reopened
        document.getElementById('svc-total-bar')?.remove();
        const totalBar = document.createElement('div');
        totalBar.id = 'svc-total-bar';
        totalBar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:0 0 8px 8px;margin-top:-1px;font-size:13px;font-weight:600;color:#15803d;';
        totalBar.innerHTML = '<span>Totale selezionato</span><span id="svc-total-val">€ 0,00</span>';
        wsList.parentElement.insertBefore(totalBar, wsList.nextSibling);

        // Update total on change
        wsList.addEventListener('change', () => {
          const total = Array.from(wsList.querySelectorAll('.svc-cb:checked'))
            .reduce((sum, cb) => sum + parseFloat(cb.dataset.price || 0), 0);
          const tv = document.getElementById('svc-total-val');
          if (tv) tv.textContent = `€ ${total.toFixed(2).replace('.', ',')}`;
        });
      }
    }


    // ── Pre-fill if Editing ──
    const btnSave = $('btn-create-contract');
    if (btnSave) {
      if (editId) {
        btnSave.dataset.editId = editId;
        btnSave.innerHTML = '<svg style="width:15px;height:15px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg> <span>Salva modifiche</span>';
      } else {
        delete btnSave.dataset.editId;
        btnSave.innerHTML = '<svg style="width:15px;height:15px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg> <span>Firma / Genera Documento</span>';
      }
    }

    if (editId) {
      try {
        const ctr = await API.Contracts.get(editId);
        const data = ctr?.data || ctr;
        
        const titleEl = $('w-title'); if (titleEl) titleEl.value = data.title || '';
        
        // Select client/prospect
        if (data.onboarding_id && wc) {
          wc.value = `onb:${data.onboarding_id}`;
        } else if (data.client_id && wc) {
          wc.value = data.client_id;
        }

        if (data.template_id && wt) wt.value = data.template_id;
        if (data.valid_from) { const vf = $('w-valid-from'); if (vf) vf.value = data.valid_from.substring(0, 10); }
        if (data.valid_to)   { const vt = $('w-valid-to');   if (vt) vt.value = data.valid_to.substring(0, 10); }

        // Check services
        if (data.contract_services && data.contract_services.length) {
          const selectedServiceIds = data.contract_services.map(s => s.service_id);
          const cbs = document.querySelectorAll('#w-service-list .svc-cb');
          cbs.forEach(cb => {
            if (selectedServiceIds.includes(cb.value)) {
              cb.checked = true;
            }
          });
          // trigger change to total
          const evt = new Event('change');
          wsList.dispatchEvent(evt);
        }

      } catch (err) {
        console.warn('[contracts] edit load error:', err);
        UI.toast('Errore caricamento dati per modifica', 'error');
      }
    } else {
      $('w-title').value = '';
    }
  }


  $('btn-create-contract')?.addEventListener('click', async () => {
    const editId = $('btn-create-contract').dataset.editId;
    const cid = $('w-client')?.value, tid = $('w-template')?.value;
    if (!cid || !tid) { UI.toast('Cliente e Template sono obbligatori', 'warning'); return; }

    // Prospect: id è onb:<uuid> estraiamo l'onboarding_id
    const isProspect = cid.startsWith('onb:');
    const onboarding_id = isProspect ? cid.replace('onb:', '') : null;
    const client_id     = isProspect ? null : cid;

    const service_ids = Array.from(document.querySelectorAll('#w-service-list .svc-cb:checked')).map(cb => cb.value);

    const btn = $('btn-create-contract'); if (btn) btn.disabled = true;
    try {
      const payload = {
        client_id,
        onboarding_id,
        template_id: tid,
        service_id:  service_ids.length > 0 ? service_ids[0] : null,
        service_ids,
        title:       $('w-title')?.value?.trim() || '',
        valid_from:  $('w-valid-from')?.value || null,
        valid_to:    $('w-valid-to')?.value   || null,
      };
      
      if (editId) {
        await API.Contracts.update(editId, payload);
        UI.toast('Contratto aggiornato', 'success');
      } else {
        await API.Contracts.create(payload);
        UI.toast('Contratto generato', 'success');
      }
      
      modal?.classList.remove('open');
      await load();
    } catch (e) { UI.toast(e?.message || 'Errore salvataggio', 'error'); }
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

  window.editContract = async id => {
    await openModal(id);
  };

  window.deleteContract = async id => {
    if (!confirm('Eliminare questa bozza di contratto? L'operazione non è reversibile.')) return;
    try {
      await API.Contracts.remove(id);
      ALL = ALL.filter(c => c.id !== id);
      updateKpis(); applyFilters();
      UI.toast('Bozza eliminata', 'success');
    } catch(e) { UI.toast(e?.message || 'Errore eliminazione', 'error'); }
  };

  window.viewContract = async id => {
    UI.toast('Generazione anteprima…', 'info');
    try {
      const c = await API.Contracts.compile(id);
      const raw   = c?.compiled_content || c?.data?.compiled_content;
      const title = c?.title || c?.data?.title || 'Contratto';
      if (!raw) { UI.toast('Nessun template associato al contratto', 'warning'); return; }

      // If content is plain text (no HTML tags), auto-structure it
      const isHtml = /<[a-z][\s\S]*>/i.test(raw);
      let body = raw;
      if (!isHtml) {
        // Split on numbered sections like "1. TITOLO" or "ARTICOLO 1 -"
        body = raw
          .replace(/\r\n/g, '\n')
          // Article-level headings: "1. TITOLO" at start or after newline
          .replace(/(^|\n)(\d+\.\s+[A-ZÀÈÌÒÙ][^\n]{0,80})/g, (m, pre, h) =>
            `\n<h2 style="font-size:15px;font-family:Georgia,serif;text-transform:uppercase;border-bottom:1px solid #ddd;padding-bottom:4px;margin:28px 0 10px;">${h.trim()}</h2>\n`)
          // Sub-section like "2.1" or "2.2"
          .replace(/(^|\n)(\d+\.\d+\s+[A-ZÀÈÌÒÙ][^\n]{0,80})/g, (m, pre, h) =>
            `\n<h3 style="font-size:13px;font-weight:700;margin:20px 0 6px;">${h.trim()}</h3>\n`)
          // Convert remaining double newlines to paragraphs
          .split(/\n{2,}/)
          .map(p => p.trim() ? `<p style="margin:0 0 10px;text-align:justify;">${p.replace(/\n/g,' ')}</p>` : '')
          .join('\n');
      }

      const html = `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8">
        <title>${title}</title>
        <style>
          *{box-sizing:border-box}
          body{font-family:Georgia,serif;max-width:210mm;margin:0 auto;padding:20mm 20mm 20mm 20mm;font-size:11pt;line-height:1.7;color:#111;background:#fff}
          h2{font-size:12pt;text-transform:uppercase;border-bottom:1px solid #ccc;padding-bottom:3px;margin:24pt 0 8pt}
          h3{font-size:11pt;font-weight:700;margin:16pt 0 5pt}
          p{margin:0 0 8pt;text-align:justify}
          .cover{text-align:center;margin-bottom:30pt;padding:20pt 0;border-bottom:2pt solid #111}
          .cover h1{font-size:16pt;text-transform:uppercase;letter-spacing:2px;margin:0 0 8pt}
          .cover .subtitle{font-size:10pt;color:#555}
          .no-print{position:fixed;top:16px;right:16px;display:flex;gap:8px;z-index:999}
          @media print{.no-print{display:none}body{padding:15mm}@page{margin:15mm}}
        </style></head>
        <body>
          <div class="no-print">
            <button onclick="window.print()" style="padding:8px 18px;background:#16a34a;color:#fff;border:none;border-radius:8px;font-size:13px;cursor:pointer;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,.15)">🖨 Stampa / PDF</button>
            <button onclick="window.close()" style="padding:8px 14px;background:#f1f5f9;color:#333;border:none;border-radius:8px;font-size:13px;cursor:pointer;">✕</button>
          </div>
          <div class="cover">
            <h1>${title}</h1>
            <div class="subtitle">Generato il ${new Date().toLocaleDateString('it-IT',{day:'2-digit',month:'long',year:'numeric'})}</div>
          </div>
          ${body}
        </body></html>`;

      const w = window.open('', '_blank', 'width=960,height=860');
      if (w) { w.document.write(html); w.document.close(); }
      else UI.toast('Abilita i popup del browser per visualizzare il contratto', 'warning');
    } catch(e) { UI.toast(e?.message || 'Errore generazione anteprima', 'error'); }
  };

  window.downloadContract = id => window.viewContract(id);


  window.onPageReady(async () => {
    await I18n.init('lang-switcher-slot');

    // ── Gestione link da preventivo accettato ─────────────────
    const urlParams = new URLSearchParams(location.search);
    const fromQuoteId  = urlParams.get('quote_id');
    const fromClientId = urlParams.get('client_id');

    if (fromQuoteId) {
      // Apri direttamente il modal pre-compilato con i dati del preventivo
      await load();
      await openModal();

      // Aggiungi hidden input per quote_id se non esiste
      if (!$('w-quote-id') && modal) {
        const inp = document.createElement('input');
        inp.type = 'hidden'; inp.id = 'w-quote-id'; inp.value = fromQuoteId;
        modal.querySelector('.modal-body')?.appendChild(inp);
      }

      // Pre-seleziona il cliente
      if (fromClientId) {
        const wc = $('w-client');
        if (wc) { wc.value = fromClientId; }
      }

      // Banner informativo
      const banner = document.createElement('div');
      banner.style.cssText = 'background:#ede9fe;border:1px solid #c4b5fd;border-radius:8px;padding:10px 14px;font-size:13px;color:#5b21b6;margin-bottom:12px;';
      banner.innerHTML = '📋 <strong>Contratto da preventivo accettato.</strong> Il preventivo viene collegato automaticamente al contratto.';
      modal?.querySelector('.modal-body')?.prepend(banner);
    } else {
      load();
    }
  });
})();