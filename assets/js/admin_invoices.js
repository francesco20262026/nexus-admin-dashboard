/* admin_invoices.js Invoices + Proforma + Payment tracking (Phase 3) v=24 */
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
  const pipelineBar  = $('inv-pipeline-bar');
  const search  = $('inv-search');
  const fClient = $('inv-filter-client');
  const fFrom   = $('inv-date-from');
  const fTo     = $('inv-date-to');
  const info    = $('inv-info');
  const pag     = $('inv-pagination');
  const modal   = $('modal-invoice');

  // Page actions
  const act = $('page-actions');
  if (act) act.innerHTML = `
    <button class="btn btn-secondary" id="btn-refresh"><svg style="width:15px;height:15px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/></svg> <span>Aggiorna</span></button>
    <button class="btn btn-secondary" id="btn-new-proforma"><svg style="width:15px;height:15px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12"/></svg> <span>Nuova proforma</span></button>
    <button class="btn-action-icon " id="btn-action-icon-new-invoice" title="Nuova fattura">
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
</button>`;

  $('btn-refresh')?.addEventListener('click', function() { if(window.UI) UI.toast('Aggiornamento in corso...', 'info'); load(true); });
  $('btn-new-invoice')?.addEventListener('click',  () => openModal(false));
  $('btn-new-proforma')?.addEventListener('click', () => openModal(true));

  // Payment status labels
  const PAYMENT_STATUS = {
    not_paid:      { label: 'Non pagata',      cls: 'pill-danger'  },
    proof_uploaded:{ label: 'Prova inviata',   cls: 'pill-warning' },
    under_review:  { label: 'In verifica',     cls: 'pill-warning' },
    paid:          { label: 'Pagata',          cls: 'pill-success' },
    cancelled:     { label: 'Annullata',       cls: 'pill-gray'    },
  };

  const PAYMENT_METHOD_LABEL = { bonifico: 'Bonifico', rid: 'RID', carta: 'Carta' };

  pipelineBar?.querySelectorAll('.cl-status-pill').forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));
  pipelineBar?.addEventListener('click', e => {
    const b = e.target.closest('.cl-status-pill'); if (!b) return;
    pipelineBar.querySelectorAll('.cl-status-pill').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); activeTab = b.dataset.tab; pg = 1; applyFilters();
  });
  [search, fClient, fFrom, fTo].forEach(el => {
    el?.addEventListener('input',  debounce(() => { pg = 1; applyFilters(); }, 200));
    el?.addEventListener('change', () => { pg = 1; applyFilters(); });
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
    try {
      const res = await API.Invoices.list({});
      ALL = Array.isArray(res) ? res : (res?.items ?? res?.data ?? []);
      // Flatten client name from join
      ALL = ALL.map(i => ({ ...i, client_name: i.clients?.name || i.client_name || '' }));
      populateClientFilter();
    } catch (e) {
      ALL = [];
      list.innerHTML = UI.errorState('Impossibile caricare le fatture.', 'window._reloadInvoices()');
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
    const set = (id, v) => { const el=$(id); if(el) el.textContent=v; };
    set('kpi-inv-all',            ALL.length);
    set('kpi-inv-proforma',       ALL.filter(i => i.is_proforma).length);
    set('kpi-inv-invoices',       ALL.filter(i => !i.is_proforma).length);
    set('kpi-inv-not_paid',       ALL.filter(i => i.payment_status === 'not_paid').length);
    set('kpi-inv-proof_uploaded', ALL.filter(i => i.payment_status === 'proof_uploaded').length);
    set('kpi-inv-under_review',   ALL.filter(i => i.payment_status === 'under_review').length);
    set('kpi-inv-paid',           ALL.filter(i => i.payment_status === 'paid').length);
  }

  function applyFilters() {
    const q  = (search?.value || '').toLowerCase().trim();
    const cl = fClient?.value || '';
    const df = fFrom?.value   || '';
    const dt = fTo?.value     || '';

    filtered = ALL.filter(i => {
      if (activeTab === 'proforma'       && !i.is_proforma)                                return false;
      if (activeTab === 'invoices'       && i.is_proforma)                                 return false;
      if (activeTab === 'not_paid'       && i.payment_status !== 'not_paid')               return false;
      if (activeTab === 'proof_uploaded' && i.payment_status !== 'proof_uploaded')         return false;
      if (activeTab === 'under_review'   && i.payment_status !== 'under_review')           return false;
      if (activeTab === 'paid'           && i.payment_status !== 'paid')                   return false;
      if (cl && i.client_name !== cl) return false;
      if (df && i.issue_date && i.issue_date < df) return false;
      if (dt && i.issue_date && i.issue_date > dt) return false;
      if (q) {
        const hay = [i.number, i.client_name, i.notes, i.payment_method].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const max = Math.ceil(filtered.length / PER) || 1;
    if (pg > max) pg = max;
    window.SessionState?.save('invoices', { pg, tab: activeTab });
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
    if (!confirm(`Sei sicuro di voler eliminare ${window.selectedIds.size} record? Questa operazione non può essere annullata.`)) {
      return;
    }
    
    const count = window.selectedIds.size;
    let success = 0;
    
    try {
      UI.toast(`Eliminazione di ${count} record in corso...`, 'info');
      // Execute deletions sequentially to avoid overloading the API
      for (const id of window.selectedIds) {
        try {
          // Assume the backend supports API.Invoices.delete
          if (API.Invoices.delete) {
            await API.Invoices.delete(id);
          } else if (API.Invoices.remove) {
            await API.Invoices.remove(id);
          } else {
             await API.del(`/invoices/${id}`);
          }
          success++;
        } catch (err) {
          console.error(`Error deleting invoice ${id}:`, err);
        }
      }
      
      if (success > 0) {
        UI.toast(`${success} record eliminati con successo.`, 'success');
        window.clearSelection();
        load(); // Ricarica la lista per riflettere le cancellazioni
      } else {
        UI.toast("Errore durante l\'eliminazione. Riprova.", 'error');
      }
    } catch (e) {
      UI.toast("Errore durante l\'eliminazione multipla.", 'error');
    }
  };


  function render() {
    if (!list) return;
    
    // Prima di un nuovo render, preserviamo lo stato della selezione se navighiamo
    // Ma solitamente il clearSelection viene gestito via UI o tenuto memorizzato.
    
    if (!filtered.length) {
      list.innerHTML = `<div class="list-card">${UI.createEmptyState(null, ALL.length ? 'Nessun record corrisponde ai filtri.' : 'Nessuna fattura presente.')}</div>`;
      if (info) info.textContent = ''; if (pag) pag.innerHTML = ''; return;
    }
    const slice = filtered.slice((pg-1)*PER, pg*PER);
    list.innerHTML = slice.map(i => {
      const isSelected = window.selectedIds.has(i.id);
      const ps      = i.payment_status || 'not_paid';
      const psInfo  = PAYMENT_STATUS[ps] || PAYMENT_STATUS.not_paid;
      const pfLabel = i.is_proforma ? `<span style="font-size:10px;background:var(--brand-100,#ede9fe);color:var(--brand-700,#6d28d9);padding:2px 7px;border-radius:4px;font-weight:700;letter-spacing:.3px;">PROFORMA</span>` : '';
      const pmLabel = i.payment_method ? `<span style="font-size:11px;color:var(--gray-500);">· ${PAYMENT_METHOD_LABEL[i.payment_method]||i.payment_method}</span>` : '';
      const windocBadge = i.windoc_id ? `<span style="font-size:10px;background:var(--gray-100);color:var(--gray-600);padding:2px 6px;border-radius:4px;font-weight:600;">W</span>` : '';
      const proofBadge = ps === 'proof_uploaded' ? `<span style="font-size:10px;background:#fef3c7;color:#92400e;padding:2px 7px;border-radius:4px;font-weight:700;">📎 Prova inviata</span>` : '';

      const statusPill = `<span class="pill ${psInfo.cls}">${psInfo.label}</span>`;

      return `<div class="cl-row fade-in ${isSelected ? 'selected' : ''}" data-id="${i.id}" onclick="window.location.href='admin_invoice_detail.html?id=${i.id}';" style="display:grid; grid-template-columns: 2.5fr 1.5fr 1.5fr 140px; align-items:center; gap:16px; padding:16px 24px; border-bottom:1px solid var(--border); transition:all 0.15s; cursor:pointer;">
        <!-- Colonna 1: Info e Cliente -->
        <div class="cl-col cl-col-1">
          <div class="cl-row-identity">
            <div class="mac-select-btn ${isSelected ? 'selected' : ''}" data-id="${i.id}" onclick="window.toggleSelection(event, '${i.id}')" style="flex-shrink:0;">
              <div class="mac-checkbox"></div>
            </div>
          <div style="flex:1; min-width:0;">
            <div class="cl-row-name" style="font-size:14px; font-weight:600; color:var(--gray-900); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              ${i.number ? `#${i.number}` : (i.is_proforma ? 'Proforma' : 'Fattura')} ${i.client_name || ''}
            </div>
            <div class="cl-row-meta" style="display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin-top:4px;">
              ${pfLabel}
              ${windocBadge}
              ${proofBadge}
              ${i.payment_proof_url ? `<span style="font-size:11px;color:var(--brand-600); font-weight:600;">📎 Prova allegata</span>` : ''}
            </div>
          </div>
        </div>

        </div>
        <!-- Colonna 2: Date Scadenza e Pagamento -->
        <div class="cl-col" style="min-width:0;">
          <div style="font-size:12px; color:var(--gray-600);">Scadenza: <span style="font-weight:600;">${i.due_date ? UI.date(i.due_date) : ''}</span></div>
          ${i.paid_at ? `<div style="font-size:12px; color:var(--gray-600); margin-top:2px;">Pagata: <span style="font-weight:600;">${UI.date(i.paid_at)}</span></div>` : ''}
        </div>

        <!-- Colonna 3: Stato e Metodo Pagamento -->
        <div class="cl-col" style="min-width:0;">
          <div style="margin-bottom:4px;">${statusPill}</div>
          ${pmLabel ? `<div style="font-size:12px; color:var(--gray-500);">${pmLabel}</div>` : ''}
        </div>

        <!-- Colonna 4: Importo Totale -->
        <div class="cl-col cl-col-actions" style="display:flex; flex-direction:row; align-items:center; justify-content:flex-end;">
          <span class="tag-pill" style="font-size:14px; font-weight:700;">${UI.currency(i.total || i.amount || 0)}</span>
        </div>
      </div>`;
    }).join('');
    const s=(pg-1)*PER+1, e=Math.min(pg*PER,filtered.length);
    if (info) info.textContent = `${s}–${e} di ${filtered.length}`;
    UI.pagination(pag, null, pg, filtered.length, PER, p => { pg=p; render(); window.updateSelectionUI(); });
    // Aggiorna la UI della selezione ad ogni render (es. se navighiamo pagina)
    // ritardato di poco per permettere al DOM di aggiornarsi
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
    
    // Pulizia lista servizi
    const servSect = $('inv-services-section');
    const servList = $('inv-client-services-list');
    if(servSect) servSect.style.display = 'none';
    if(servList) servList.innerHTML = '<div style="font-size:13px;color:#6b7280;text-align:center;">Seleziona un cliente per caricare i servizi.</div>';

    if (cl)  cl.innerHTML  = '<option value="">Caricamento…</option>';
    if (onb) onb.innerHTML = '<option value="">Nessuno</option>';
    modal.classList.add('open');
    try {
      const [clientsRes, onbRes] = await Promise.all([
        API.Clients.list().catch(() => []),
        API.Onboarding.list().catch(() => []),
      ]);
      const clients = Array.isArray(clientsRes) ? clientsRes : (clientsRes?.items ?? clientsRes?.data ?? []);
      const onbs    = Array.isArray(onbRes)     ? onbRes     : (onbRes?.items    ?? onbRes?.data    ?? []);

      if (cl) cl.innerHTML = '<option value="">Seleziona cliente</option>' +
        clients.map(c => `<option value="${c.id}">${c.name || c.email}</option>`).join('');

      if (onb) {
        // Show company_name (the prospect name) not reference_name/status
        onb.innerHTML = '<option value="">Nessuno</option>' +
          onbs
            .filter(o => !['attivo','abbandonato','annullato','cancelled'].includes(o.status))
            .map(o => {
              const label = o.company_name || o.clients?.name || o.reference_name || o.status;
              return `<option value="${o.id}">${label}</option>`;
            })
            .join('');
      }

      // Pre-select from preset if provided
      if (preset?.client_id     && cl) { cl.value  = preset.client_id; cl.dispatchEvent(new Event('change')); }
      if (preset?.onboarding_id && onb) onb.value = preset.onboarding_id;

      const due = $('inv-due');
      if (due) { const d = new Date(); d.setDate(d.getDate() + 30); due.value = d.toISOString().split('T')[0]; }
      if (nxt) { const d = new Date(); d.setDate(d.getDate() + 30); nxt.value = d.toISOString().split('T')[0]; }
    } catch (e) { UI.toast('Errore caricamento dati modal', 'error'); }
  }

  $('btn-save-invoice')?.addEventListener('click', async () => {
    const cid = $('inv-client')?.value, amt = parseFloat($('inv-amount')?.value), due = $('inv-due')?.value;
    if (!cid || isNaN(amt) || !due) { UI.toast('Cliente, importo e scadenza sono obbligatori', 'warning'); return; }
    const isProforma  = $('inv-is-proforma')?.value === '1';
    const method      = $('inv-payment-method')?.value || null;
    const onboardingId = $('inv-onboarding-id')?.value || null;
    const btn = $('btn-save-invoice'); if (btn) btn.disabled = true;
    
    // Raccolta Dati Servizi/Ricorrenza
    const serviceIds = Array.from(document.querySelectorAll('.inv-service-cb:checked')).map(cb => cb.value);
    const recToggle  = $('inv-is-recurring')?.checked;
    
    // Payload Base
    const payload = {
      client_id:    cid,
      total:        amt, 
      amount:       amt, 
      total_amount: amt,
      due_date:     due,
      notes:        $('inv-desc')?.value?.trim() || null,
      is_proforma:  isProforma,
      payment_method:  method      || undefined,
      onboarding_id:   onboardingId || undefined,
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
      await API.Invoices.create(payload);
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
