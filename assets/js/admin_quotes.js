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

  const $ = id => document.getElementById(id);
  const list   = $('q-list');
  const pipelineBar = $('q-pipeline-bar');
  const search = $('q-search');
  const fClient= $('q-filter-client');
  const info   = $('q-info');
  const pag    = $('q-pagination');
  const modal  = $('modal-quote');

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
  [search, fClient].forEach(el => {
    el?.addEventListener('input',  debounce(() => { pg = 1; applyFilters(); }, 200));
    el?.addEventListener('change', () => { pg = 1; applyFilters(); });
  });

  window.addEventListener('companyChanged', load);
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
      ALL = ALL.map(q => ({ ...q, client_name: q.clients?.name || q.client_name || '' }));
      populateClientFilter();
    } catch (e) {
      ALL = [];
      list.innerHTML = UI.errorState('Impossibile caricare i preventivi.', 'window._reloadQuotes()');
    }
    updateKpis();
    applyFilters();
  }

  function populateClientFilter() {
    if (!fClient) return;
    const prev  = fClient.value;
    const names = [...new Set(ALL.map(q => q.client_name).filter(Boolean))].sort();
    fClient.innerHTML = `<option value="">Tutti i clienti</option>` + names.map(n => `<option value="${n}">${n}</option>`).join('');
    if (prev) fClient.value = prev;
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
  function applyFilters() {
    const q  = (search?.value || '').toLowerCase().trim();
    const cl = fClient?.value || '';
    filtered = ALL.filter(item => {
      if (activeTab !== 'all' && item.status !== activeTab) return false;
      if (cl && item.client_name !== cl) return false;
      if (q) {
        const hay = [item.title, item.client_name, item.notes].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const max = Math.ceil(filtered.length / PER) || 1;
    if (pg > max) pg = max;
    window.SessionState?.save('quotes', { pg, tab: activeTab });
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
        ? `<span style="font-size:11px; font-weight:600; color:var(--brand-500);">Onboarding #${q.onboarding_id.slice(0,5)}</span>`
        : '';
      
      const statusPill = `<span class="pill ${si.cls}" style="font-size:11px; padding:2px 8px; border-radius:12px;">${si.label}</span>`;

      // Context-sensitive action buttons
      let actions = '';
      if (q.status === 'draft') {
        actions = `<button class="btn btn-primary" style="font-size:12px;padding:5px 12px;" onclick="event.stopPropagation();window.sendQuote('${q.id}')">📤 Invia</button>`;
      } else if (q.status === 'sent') {
        actions = `
          <button class="btn btn-primary" style="font-size:12px;padding:5px 12px;background:#16a34a;border:none;" onclick="event.stopPropagation();window.acceptQuote('${q.id}')">✓ Accetta</button>
          <button class="btn btn-ghost btn-ghost-danger" style="font-size:12px;padding:5px 12px;line-height:1;" onclick="event.stopPropagation();window.rejectQuote('${q.id}')">✗ Rifiuta</button>`;
      }

      return `<div class="cl-row fade-in" data-id="${q.id}" onclick="window.editQuote('${q.id}')" style="cursor:pointer; display:grid; grid-template-columns: 2.5fr 1.5fr 1fr 140px; align-items:center; gap:24px; padding:16px 24px; border-bottom:1px solid var(--border); transition:background 0.1s;">
        
        <!-- Colonna 1: Titolo e Cliente -->
        <div class="cl-col cl-col-1">
          <div class="cl-row-identity">
            <div class="mac-select-btn" data-id="${q.id}" onclick="window.toggleSelection(event, '${q.id}')" title="Seleziona" style="flex-shrink:0;">
              <div class="mac-checkbox"></div>
            </div>
            <div class="cl-row-identity-body" style="padding-left:0; min-width:0;">
              <div class="cl-row-name" style="font-size:14px; font-weight:600; color:var(--gray-900); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${q.title}</div>
              <div class="cl-row-meta" style="display:flex; gap:8px; align-items:center; margin-top:2px;">
                <span class="cl-row-chip" style="font-size:12px; color:var(--gray-500);">🏢 ${q.client_name || ''}</span>
                ${onbStr ? `<span class="cl-row-chip">${onbStr}</span>` : ''}
              </div>
            </div>
          </div>
        </div>

        <!-- Colonna 2: Date -->
        <div class="cl-col" style="min-width:0;">
          <div class="cl-data-val" style="font-size:13px; color:var(--gray-700);">${dateStr}</div>
          ${acceptedInfo}
        </div>

        <!-- Colonna 3: Importo e Stato -->
        <div class="cl-col" style="min-width:0;">
          <div class="cl-data-val" style="font-size:14px; font-weight:700; color:var(--gray-900);">${UI.currency(q.total || 0)}</div>
          <div style="margin-top:2px;">${statusPill}</div>
        </div>

        <!-- Colonna 4: Azioni -->
        <div class="cl-col cl-col-actions" style="display:flex; flex-direction:row; align-items:center; gap:8px; justify-content:flex-end;">
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
        document.getElementById('mac-mass-count').textContent = window.selectedIds.size;
        bar.style.display = 'flex';
      } else {
        bar.style.display = 'none';
      }
    }
  };

  window.massDelete = async () => {
    if (!window.selectedIds.size) return;
    if (!confirm('Sei sicuro di voler eliminare ' + window.selectedIds.size + ' preventivi? Quest\'azione è irreversibile.')) return;
    
    if (window.UI) window.UI.toast('Eliminazione in corso...', 'info');
    try {
      for (let id of window.selectedIds) {
         await API.Quotes.delete(id);
      }
      if (window.UI) window.UI.toast('Eliminazione completata', 'success');
      window.clearSelection();
      load();
    } catch(e) {
      if (window.UI) window.UI.toast('Errore durante l\'eliminazione', 'error');
    }
  };

  // ── Modal helpers ─────────────────────────────────────────

  function addLineRow(line = {}) {
    const container = $('q-lines-container');
    if (!container) return;
    const idx = container.querySelectorAll('.q-line-row').length;

    const serviceOptions = _services.map(s =>
      `<option value="${s.id}" data-price="${s.price||0}" data-name="${s.name||''}">${s.name}</option>`
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
    recalcTotals();
    modal.classList.add('open');

    try {
      const [clientsRes, servicesRes, onbRes] = await Promise.all([
        API.Clients.list().catch(() => []),
        API.Services.catalog(true).catch(() => []),
        API.Onboarding.list().catch(() => []),
      ]);
      _clients  = Array.isArray(clientsRes)  ? clientsRes  : (clientsRes?.items  ?? clientsRes?.data  ?? []);
      _services = Array.isArray(servicesRes) ? servicesRes : (servicesRes?.items ?? servicesRes?.data ?? []);
      const onbs    = Array.isArray(onbRes)     ? onbRes     : (onbRes?.items    ?? onbRes?.data    ?? []);

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
        // Load lines
        const lines = q.quote_lines || [];
        lines.forEach(ln => addLineRow(ln));
      } else {
        // Pre-select from preset (e.g., coming from onboarding detail)
        if (preset?.onboarding_id && onbSel)  onbSel.value    = preset.onboarding_id;
        if (preset?.client_id    && clientSel) clientSel.value = preset.client_id;
        // Default: 30 days validity
        const d = new Date(); d.setDate(d.getDate() + 30);
        const el = $('q-valid-until'); if (el) el.value = d.toISOString().split('T')[0];
        // Start with one empty line
        addLineRow();
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
    if ((!clientId && !onboardingId) || !title) { UI.toast('Titolo e (Cliente OPPURE Onboarding) sono obbligatori', 'warning'); return; }

    const lines       = readLines();
    const editId      = $('q-edit-id')?.value || null;
    const validUntil  = $('q-valid-until')?.value || null;
    const notes       = $('q-notes')?.value?.trim() || null;

    const body = {
      client_id:     clientId || undefined,
      onboarding_id: onboardingId || undefined,
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

      // 1. Warn if proforma data is incomplete (non-blocking, but very visible)
      if (!pf.proforma_data_complete && pf.missing_fields?.length) {
        const missingList = pf.missing_fields.join(', ');
        UI.toast(
          `⚠️ Dati mancanti per la proforma: ${missingList}. Il contratto e la proforma NON partiranno in automatico.`,
          'warning',
          8000
        );
      }

      // 2. If user not yet invited, ask if we should proceed anyway
      if (!pf.user_invited) {
        const goAhead = confirm(
          '⚠️ L\'utente cliente non è ancora stato invitato al portale.\n\n' +
          'Inviando il preventivo verrà creato automaticamente il suo accesso.\n\n' +
          'Vuoi procedere con l\'invio del preventivo?'
        );
        if (!goAhead) return;
      } else {
        // Standard confirm
        if (!confirm('Inviare il preventivo al cliente?')) return;
      }
    } catch (_) {
      // If preflight fails, fall back to normal confirm (never block send)
      if (!confirm('Segnare il preventivo come inviato al cliente?')) return;
    }
    // ── Send ────────────────────────────────────────────────────
    try {
      await API.Quotes.send(id);
      ALL = ALL.map(q => q.id===id ? {...q, status:'sent', sent_at:new Date().toISOString()} : q);
      updateKpis(); applyFilters(); UI.toast('Preventivo segnato come inviato','success');
    } catch(e) { UI.toast(e?.message||'Errore','error'); }
  };

  window.acceptQuote = async id => {
    if (!confirm('Segnare il preventivo come accettato dal cliente? Questo genererà e invierà automaticamente il contratto via email.')) return;
    try {
      const res = await API.Quotes.accept(id);
      ALL = ALL.map(q => q.id===id ? {...q, status:'accepted', accepted_at:new Date().toISOString()} : q);
      const msg = res?.contract_auto_sent
        ? '✓ Preventivo accettato Contratto generato e inviato automaticamente via email!'
        : '✓ Preventivo accettato Contratto creato in bozza. Vai su Contratti per inviarlo.';
      updateKpis(); applyFilters(); UI.toast(msg, 'success');
    } catch(e) { UI.toast(e?.message||'Errore','error'); }
  };

  window.rejectQuote = async id => {
    if (!confirm('Segnare il preventivo come rifiutato?')) return;
    try {
      await API.Quotes.reject(id);
      ALL = ALL.map(q => q.id===id ? {...q, status:'rejected', rejected_at:new Date().toISOString()} : q);
      updateKpis(); applyFilters(); UI.toast('Preventivo segnato come rifiutato','info');
    } catch(e) { UI.toast(e?.message||'Errore','error'); }
  };

  window.expireQuote = async id => {
    if (!confirm('Segnare il preventivo come scaduto?')) return;
    try {
      await API.Quotes.expire(id);
      ALL = ALL.map(q => q.id===id ? {...q, status:'expired'} : q);
      updateKpis(); applyFilters(); UI.toast('Preventivo scaduto','info');
    } catch(e) { UI.toast(e?.message||'Errore','error'); }
  };

  window.deleteQuote = async id => {
    if (!confirm('Eliminare definitivamente questo preventivo in bozza?')) return;
    try {
      await API.Quotes.remove(id);
      ALL = ALL.filter(q => q.id !== id);
      updateKpis(); applyFilters(); UI.toast('Preventivo eliminato','success');
    } catch(e) { UI.toast(e?.message||'Errore','error'); }
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
