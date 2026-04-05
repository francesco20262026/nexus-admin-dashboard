/* admin_contracts.js — Dual-view: Contracts + Templates
   v2 rewrite with origin tracking, template governance, regen drawer */
'use strict';

(function () {
  Auth.guard('admin');
  Auth.initUI();

  // ─── State ───────────────────────────────────────────────────
  const saved = window.SessionState?.load('contracts') || {};
  let activeView    = saved.activeView || 'contracts'; // 'contracts' | 'templates'
  let ALL_CTR       = [], filteredCtr = [];
  let ALL_TPL       = [], filteredTpl = [];
  let activeTabCtr  = saved.activeTabCtr || 'all';
  let activeTabTpl  = saved.activeTabTpl || 'all';
  let pageCtr       = saved.pageCtr || 1, pageTpl = saved.pageTpl || 1;
  const PER         = 20;

  function saveState() {
    window.SessionState?.save('contracts', {
      activeView, activeTabCtr, activeTabTpl, pageCtr, pageTpl
    });
  }

  const $ = id => document.getElementById(id);

  // ─── View Toggle ─────────────────────────────────────────────
  document.getElementById('view-toggle')?.addEventListener('click', e => {
    const btn = e.target.closest('.ctr-view-btn');
    if (!btn) return;
    const v = btn.dataset.view;
    if (v === activeView) return;
    activeView = v;
    document.querySelectorAll('.ctr-view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === v));
    renderPageActions();
    renderPills();
    renderGridHeader();
    if (v === 'contracts') {
      if (!ALL_CTR.length) window.loadContracts();
      else applyFiltersCtr();
    } else {
      if (!ALL_TPL.length) window.loadTemplates();
      else applyFiltersTpl();
    }
  });

  // ─── Page Actions (CTA buttons top-right) ────────────────────
  function renderPageActions() {
    const actDiv = $('page-actions');
    if (!actDiv) return;
    if (activeView === 'contracts') {
      actDiv.innerHTML = `
        <button class="btn btn-secondary" id="btn-refresh" onclick="loadContracts(true)">
          <svg style="width:15px;height:15px;" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>
          Aggiorna
        </button>
        <button class="btn-action-icon" id="btn-new-contract" onclick="openContractModal()">
          <svg fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
        </button>`;
    } else {
      actDiv.innerHTML = `
        <button class="btn btn-secondary" id="btn-refresh" onclick="loadTemplates(true)">
          <svg style="width:15px;height:15px;" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>
          Aggiorna
        </button>
        <button class="btn-action-icon" id="btn-new-template" onclick="openTemplateModal()">
          <svg fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
        </button>`;
    }
  }

  // ─── Pills ────────────────────────────────────────────────────
  const CTR_TABS = [
    { tab:'all',      label:'Tutti' },
    { tab:'draft',    label:'Bozze' },
    { tab:'sent',     label:'Inviati / In firma' },
    { tab:'signed',   label:'Firmati' },
    { tab:'archived', label:'Archiviati' },
    { tab:'error',    label:'Errore' },
  ];
  const TPL_TABS = [
    { tab:'all',     label:'Tutti' },
    { tab:'active',  label:'Attivi' },
    { tab:'inactive',label:'Inattivi' },
    { tab:'service', label:'Servizi', typeFilter:true },
    { tab:'maintenance',label:'Manutenzione', typeFilter:true },
    { tab:'consulting',label:'Consulenza', typeFilter:true },
  ];

  function renderPills() {
    const pills = $('ctr-pills'); if (!pills) return;
    const tabs = activeView === 'contracts' ? CTR_TABS : TPL_TABS;
    const active = activeView === 'contracts' ? activeTabCtr : activeTabTpl;
    pills.innerHTML = tabs.map(t =>
      `<button class="cl-status-pill ${t.tab === active ? 'active':''}" data-tab="${t.tab}">${t.label}</button>`
    ).join('');
    pills.querySelectorAll('.cl-status-pill').forEach(b => b.addEventListener('click', () => {
      const t = b.dataset.tab;
      if (activeView === 'contracts') { activeTabCtr = t; pageCtr = 1; }
      else { activeTabTpl = t; pageTpl = 1; }
      renderPills();
      if (activeView === 'contracts') applyFiltersCtr();
      else applyFiltersTpl();
    }));
  }

  // ─── Grid Headers ─────────────────────────────────────────────
  function renderGridHeader() {
    const el = $('ctr-grid-header'); if (!el) return;
    if (activeView === 'contracts') {
      el.className = 'mac-header-row ctr-row-header';
      el.style.cssText = 'display: grid; align-items:center; padding: 12px 24px; border-bottom: 1px solid var(--border); background: #f9fafb; font-weight: 600; color: #6b7280; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; border-top-left-radius: 12px; border-top-right-radius: 12px; user-select: none;';
      el.innerHTML = `
        <div class="cl-col-identity">
          <div class="mac-select-btn" id="mass-select-all" onclick="window.toggleSelectAll(this)" style="flex-shrink:0;"><div class="mac-checkbox"></div></div>
          <div>Cliente / Prospect</div>
        </div>
        <div style="display:flex;align-items:center;">
          <select class="mac-header-select cl-col-header" id="ctr-filter-supplier" title="Filtra per fornitore" style="appearance:none;background:transparent;border:none;color:inherit;font:inherit;text-transform:uppercase;cursor:pointer;outline:none;padding-right:12px;width:100%;text-overflow:ellipsis;" onchange="window.filterBySelects()">
            <option value="">Fornitore ▼</option>
          </select>
        </div>
        <div style="display:flex;align-items:center;"><div>Titolo Contratto</div></div>
        <div style="display:flex;align-items:center;">
          <select class="mac-header-select cl-col-header" id="ctr-filter-origin" title="Filtra per origine" style="appearance:none;background:transparent;border:none;color:inherit;font:inherit;text-transform:uppercase;cursor:pointer;outline:none;padding-right:12px;width:100%;text-overflow:ellipsis;" onchange="window.filterBySelects()">
            <option value="">Origine ▼</option>
            <option value="direct">Diretto</option>
            <option value="from_quote">Da preventivo</option>
            <option value="supplier_change">Cambio fornitore</option>
          </select>
        </div>
        <div style="display:flex;align-items:center;"><div>Template</div></div>
        <div style="display:flex;align-items:center;"><div>Date</div></div>
        <div style="display:flex;align-items:center;">
          <select class="mac-header-select cl-col-header" id="ctr-filter-status" title="Filtra per stato" style="appearance:none;background:transparent;border:none;color:inherit;font:inherit;text-transform:uppercase;cursor:pointer;outline:none;padding-right:12px;max-width:150px;text-overflow:ellipsis;" onchange="window.filterBySelects()">
            <option value="">Stato ▼</option>
            <option value="draft">Bozza</option>
            <option value="sent">Inviato/In Firma</option>
            <option value="signed">Firmato</option>
            <option value="archived">Archiviato</option>
          </select>
        </div>
        <div style="display:flex;align-items:center;justify-content:flex-end;"><div>Azioni</div></div>`;
    } else {
      el.className = 'mac-header-row tpl-row';
      el.style.cssText = 'display: grid; align-items:center; padding: 12px 24px; border-bottom: 1px solid var(--border); background: #f9fafb; font-weight: 600; color: #6b7280; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; border-top-left-radius: 12px; border-top-right-radius: 12px; user-select: none;';
      el.innerHTML = `
        <div class="cl-col-identity">
          <div class="mac-select-btn" id="mass-select-all" onclick="window.toggleSelectAll(this)" style="flex-shrink:0;"><div class="mac-checkbox"></div></div>
          <div onclick="window.toggleSort()" style="cursor:pointer;display:flex;align-items:center;" title="Ordina per nome">
            Nome Template
            <svg id="sort-icon-name" fill="none" height="14" stroke="currentColor" stroke-width="2" viewbox="0 0 24 24" width="14" style="transition:transform 0.2s;margin-left:6px;"><path d="M8 9l4-4 4 4m0 6l-4 4-4-4" stroke-linecap="round" stroke-linejoin="round"></path></svg>
          </div>
        </div>
        <div style="display:flex;align-items:center;">
          <select class="mac-header-select cl-col-header" id="tpl-filter-type" title="Filtra per tipo" style="appearance:none;background:transparent;border:none;color:inherit;font:inherit;text-transform:uppercase;cursor:pointer;outline:none;padding-right:12px;max-width:150px;text-overflow:ellipsis;" onchange="window.filterBySelects()">
            <option value="">Tipo ▼</option>
            <option value="service">Servizi</option>
            <option value="maintenance">Manutenzione</option>
            <option value="consulting">Consulenza</option>
            <option value="other">Altro</option>
          </select>
        </div>
        <div style="display:flex;align-items:center;"><div>Versione</div></div>
        <div style="display:flex;align-items:center;"><div>Lingua</div></div>
        <div style="display:flex;align-items:center;">
          <select class="mac-header-select cl-col-header" id="tpl-filter-status" title="Filtra per stato" style="appearance:none;background:transparent;border:none;color:inherit;font:inherit;text-transform:uppercase;cursor:pointer;outline:none;padding-right:12px;max-width:150px;text-overflow:ellipsis;" onchange="window.filterBySelects()">
            <option value="">Stato ▼</option>
            <option value="active">Attivo</option>
            <option value="inactive">Inattivo</option>
          </select>
        </div>
        <div style="display:flex;align-items:center;"><div>Predefinito</div></div>
        <div style="display:flex;align-items:center;justify-content:flex-end;"><div>Azioni</div></div>`;
    }
    
    // Restore preserved filters if applicable
    if (activeView === 'contracts') {
       if ($('ctr-filter-origin')) $('ctr-filter-origin').value = activeTabCtr === 'all' ? '' : (['from_quote','supplier_change','direct'].includes(activeTabCtr) ? activeTabCtr : '');
       if ($('ctr-filter-status')) $('ctr-filter-status').value = activeTabCtr === 'all' ? '' : (!['from_quote','supplier_change','direct'].includes(activeTabCtr) ? activeTabCtr : '');
       populateSupplierFilterCtr();
    } else {
       if ($('tpl-filter-type')) $('tpl-filter-type').value = activeTabTpl === 'all' ? '' : (['service','maintenance','consulting','other'].includes(activeTabTpl) ? activeTabTpl : '');
       if ($('tpl-filter-status')) $('tpl-filter-status').value = activeTabTpl === 'all' ? '' : (!['service','maintenance','consulting','other'].includes(activeTabTpl) ? activeTabTpl : '');
    }
  }

  function populateSupplierFilterCtr() {
    const el = $('ctr-filter-supplier');
    if (!el) return;
    const prev = el.value;
    const names = [...new Set(ALL_CTR.map(c => c.supplier_name).filter(Boolean))].sort();
    el.innerHTML = `<option value="">Fornitore ▼</option>` + names.map(n => `<option value="${n}">${n}</option>`).join('');
    if (prev) el.value = prev;
  }

  window.filterBySelects = () => {
    if (activeView === 'contracts') {
       const o = $('ctr-filter-origin')?.value;
       const s = $('ctr-filter-status')?.value;
       // activeTabCtr is mostly for pill sync, we just re-run filter
       activeTabCtr = o || s || 'all'; 
       applyFiltersCtr();
    } else {
       const ty = $('tpl-filter-type')?.value;
       const st = $('tpl-filter-status')?.value;
       activeTabTpl = ty || st || 'all';
       applyFiltersTpl();
    }
  };

  // ─── Load Contracts ───────────────────────────────────────────
  window.loadContracts = async function(force = false) {
    const list = $('ctr-list'); if (!list) return;
    if (activeView === 'contracts') list.innerHTML = '<div style="padding:32px 24px;">' + UI.skeletonCardList(5) + '</div>';
    try {
      const res = await API.Contracts.list({}, force);
      const raw = Array.isArray(res) ? res : (res?.data ?? []);
      ALL_CTR = raw.map(c => ({
        ...c,
        client_name:   c.clients?.name || c.clients?.email || c.onboarding?.company_name || c.onboarding?.email || '—',
        template_name: c.document_templates?.name || '—',
        supplier_name: c.companies?.name || '—',
        origin:        c.origin || (c.quote_id ? 'from_quote' : 'direct'),
      }));
    } catch (e) {
      ALL_CTR = [];
      if (activeView === 'contracts') list.innerHTML = `<div class="ctr-empty">${UI.errorState('Impossibile caricare i contratti.', "window.loadContracts(true)")}</div>`;
    }
    pageCtr = 1;
    applyFiltersCtr();
  };

  function applyFiltersCtr() {
    const q = ($('ctr-search')?.value || '').toLowerCase().trim();
    const origin = $('ctr-filter-origin')?.value || '';
    const status = $('ctr-filter-status')?.value || '';
    const supplier = $('ctr-filter-supplier')?.value || '';

    filteredCtr = ALL_CTR.filter(c => {
      // 1. Check Pills (Status only now)
      const tab = activeTabCtr;
      if (tab !== 'all') {
        if (tab === 'sent') {
          // Sent groups sent and signing
          if (c.status !== 'sent' && c.status !== 'signing') return false;
        } else {
          if (c.status !== tab) return false;
        }
      }

      // 2. Check Selects
      if (origin && c.origin !== origin) return false;
      if (supplier && c.supplier_name !== supplier) return false;
      if (status) {
         if (status === 'sent') {
            if (c.status !== 'signing' && c.status !== 'sent') return false;
         } else {
            if (c.status !== status) return false;
         }
      }
      if (q) {
        const hay = [c.title, c.client_name, c.template_name, c.origin, c.supplier_name].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const max = Math.ceil(filteredCtr.length / PER) || 1;
    if (pageCtr > max) pageCtr = max;
    saveState();
    renderContracts();
  }

  function renderContracts() {
    if (activeView !== 'contracts') return;
    const list = $('ctr-list'), pag = $('ctr-pagination'); if (!list) return;
    if (!filteredCtr.length) {
      list.innerHTML = `<div class="ctr-empty">${UI.createEmptyState(null, ALL_CTR.length ? 'Nessun record corrisponde ai filtri.' : 'Nessun contratto. Creane uno con il pulsante +')}</div>`;
      if (pag) pag.innerHTML = ''; return;
    }
    const slice = filteredCtr.slice((pageCtr-1)*PER, pageCtr*PER);
    list.innerHTML = slice.map(c => {
      const originBadge = originTag(c.origin);
      const sent   = c.sent_at   ? UI.date(c.sent_at)   : '';
      const signed = c.signed_at ? UI.date(c.signed_at) : '';
      const totype = c.document_templates?.contract_type ? `<span style="font-size:11px;color:var(--gray-400);">${contractTypeLabel(c.document_templates.contract_type)}</span>` : '';
      return `<div class="ctr-grid-row ctr-row fade-in" style="cursor:pointer;" onclick="editContract('${c.id}')" data-id="${c.id}">
        <div class="cl-col-identity">
          <div class="mac-select-btn" onclick="window.toggleSelection(event, '${c.id}', 'contracts')" style="flex-shrink:0;"><div class="mac-checkbox"></div></div>
          <div style="min-width:0;">
            <div style="font-size:14px;font-weight:600;color:var(--gray-900);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
               <a href="admin_client_detail.html?id=${c.client_id||''}" style="color:var(--brand-600);text-decoration:none;" onclick="event.stopPropagation()">🏢 ${escHtml(c.client_name)}</a>
            </div>
          </div>
        </div>
        <div>
          <span style="font-size:12px; font-weight:600; color:var(--gray-700);">${escHtml(c.supplier_name)}</span>
        </div>
        <div style="min-width:0;">
          <div style="font-size:13px;font-weight:600;color:var(--gray-900);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escHtml(c.title||'')}">${c.title || 'Contratto senza titolo'}</div>
        </div>
        <div>${originBadge}</div>
        <div style="min-width:0;">
          <div style="font-size:12px;font-weight:600;color:var(--gray-700);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(c.template_name)}</div>
          ${totype}
        </div>
        <div style="font-size:12px;color:var(--gray-600);">
          ${sent ? `<div>Inv: <b>${sent}</b></div>` : ''}
          ${signed ? `<div>Firm: <b>${signed}</b></div>` : ''}
          ${(c.valid_to && !c.onboarding_id) ? `<div style="color:var(--gray-400);">Scade: ${UI.date(c.valid_to)}</div>` : ''}
          ${!sent && !signed && !c.valid_to ? `<div style="color:var(--gray-300);">—</div>` : ''}
        </div>
        <div>${UI.pill(c.status || 'draft')}</div>
        <div class="row-actions">
          <button class="icon-btn-sm" onclick="event.stopPropagation(); viewContract('${c.id}')" title="Anteprima">👁</button>
          ${c.status === 'draft' ? `<button class="icon-btn-sm" onclick="event.stopPropagation(); sendContract('${c.id}')" title="Invia per firma" style="background:#f0fdf4;color:#15803d;border-color:#bbf7d0;">📤</button>` : ''}
          ${(c.status === 'sent'||c.status === 'signing') ? `<button class="icon-btn-sm" onclick="event.stopPropagation(); markSignedContract('${c.id}')" title="Segna come firmato">✅</button>` : ''}
          ${(c.status === 'signed'||c.status === 'active') ? `<button class="icon-btn-sm" onclick="event.stopPropagation(); openRegenDrawer('${c.id}')" title="Rigenera (cambio fornitore)">🔄</button>` : ''}
          ${(c.status === 'signed'||c.status === 'active') ? `<button class="icon-btn-sm" onclick="event.stopPropagation(); archiveContract('${c.id}')" title="Archivia">📦</button>` : ''}
          ${c.status === 'draft' ? `<button class="icon-btn-sm danger" onclick="event.stopPropagation(); deleteContract('${c.id}')" title="Elimina bozza">🗑</button>` : ''}
        </div>
      </div>`;
    }).join('');
    UI.pagination(pag, null, pageCtr, filteredCtr.length, PER, p => { pageCtr=p; renderContracts(); });
    setTimeout(updateSelectionUI, 10);
  }

  // ─── Load Templates ───────────────────────────────────────────
  window.loadTemplates = async function(force = false) {
    const list = $('ctr-list'); if (!list) return;
    if (activeView === 'templates') list.innerHTML = '<div style="padding:32px 24px;">' + UI.skeletonCardList(4) + '</div>';
    try {
      const res = await API.Contracts.templates({}, force);
      ALL_TPL = Array.isArray(res) ? res : (res?.data ?? []);
    } catch (e) {
      ALL_TPL = [];
      if (activeView === 'templates') list.innerHTML = `<div class="ctr-empty">${UI.errorState('Impossibile caricare i template.', "window.loadTemplates(true)")}</div>`;
    }
    pageTpl = 1;
    applyFiltersTpl();
  };

  function applyFiltersTpl() {
    const q = ($('ctr-search')?.value || '').toLowerCase().trim();
    const type = $('tpl-filter-type')?.value || '';
    const status = $('tpl-filter-status')?.value || '';

    filteredTpl = ALL_TPL.filter(t => {
      const tab = activeTabTpl;
      if (tab === 'active'   && !t.is_active) return false;
      if (tab === 'inactive' && t.is_active)  return false;
      if (['service','maintenance','consulting','other'].includes(tab) && t.contract_type !== tab) return false;

      if (status === 'active' && !t.is_active) return false;
      if (status === 'inactive' && t.is_active)  return false;
      if (type && t.contract_type !== type) return false;
      if (q) {
        const hay = [t.name, t.contract_type, t.version, t.lang].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const max = Math.ceil(filteredTpl.length / PER) || 1;
    if (pageTpl > max) pageTpl = max;
    saveState();
    renderTemplates();
  }

  function renderTemplates() {
    if (activeView !== 'templates') return;
    const list = $('ctr-list'), pag = $('ctr-pagination'); if (!list) return;
    if (!filteredTpl.length) {
      list.innerHTML = `<div class="ctr-empty">${UI.createEmptyState(null, ALL_TPL.length ? 'Nessun template corrisponde ai filtri.' : 'Nessun template. Creane uno con il pulsante +')}</div>`;
      if (pag) pag.innerHTML = ''; return;
    }
    const slice = filteredTpl.slice((pageTpl-1)*PER, pageTpl*PER);
    list.innerHTML = slice.map(t => {
      const typeLabel = contractTypeLabel(t.contract_type);
      const statusBadge = t.is_active
        ? `<span style="display:inline-flex;align-items:center;gap:4px;background:#f0fdf4;color:#15803d;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:600;">✓ Attivo</span>`
        : `<span style="display:inline-flex;align-items:center;gap:4px;background:#f3f4f6;color:#9ca3af;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:600;">Inattivo</span>`;
      return `<div class="ctr-grid-row tpl-row fade-in ${!t.is_active ? 'inactive':''}" style="cursor:pointer;" onclick="editTemplate('${t.id}')" data-id="${t.id}">
        <div class="cl-col-identity">
          <div class="mac-select-btn" onclick="window.toggleSelection(event, '${t.id}', 'templates')" style="flex-shrink:0;"><div class="mac-checkbox"></div></div>
          <div style="min-width:0;">
            <div style="font-size:14px;font-weight:600;color:var(--gray-900);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escHtml(t.name)}">${escHtml(t.name)}</div>
            ${t.notes ? `<div style="font-size:11px;color:var(--gray-400);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escHtml(t.notes)}">${escHtml(t.notes)}</div>` : ''}
          </div>
        </div>
        <div style="font-size:12px;color:var(--gray-600);">${typeLabel || '—'}</div>
        <div style="font-size:12px;color:var(--gray-600);">${escHtml(t.version || '—')}</div>
        <div style="font-size:12px;color:var(--gray-600);">${(t.lang||'').toUpperCase() || '—'}</div>
        <div>${statusBadge}</div>
        <div>${t.is_default ? `<span style="font-size:11px;font-weight:700;color:#d97706;">★ Predefinito</span>` : '—'}</div>
        <div class="row-actions">
          <button class="icon-btn-sm" onclick="event.stopPropagation(); duplicateTemplate('${t.id}')" title="Duplica">📋</button>
          <button class="icon-btn-sm" onclick="event.stopPropagation(); toggleTemplateActive('${t.id}', ${!t.is_active})" title="${t.is_active ? 'Disattiva' : 'Attiva'}" style="${t.is_active ? 'color:#d97706' : 'color:#15803d'}">${t.is_active ? '⏸' : '▶'}</button>
          <button class="icon-btn-sm danger" onclick="event.stopPropagation(); deleteTemplate('${t.id}')" title="Elimina">🗑</button>
        </div>
      </div>`;
    }).join('');
    UI.pagination(pag, null, pageTpl, filteredTpl.length, PER, p => { pageTpl=p; renderTemplates(); });
    setTimeout(updateSelectionUI, 10);
  }

  // ─── Selection Logic ──────────────────────────────────────────
  window.selectedIds = new Set();
  let currentSelectionType = null; // 'contracts' or 'templates'

  window.toggleSelection = (e, id, type) => {
    e.stopPropagation();
    if (currentSelectionType && currentSelectionType !== type) {
       window.selectedIds.clear();
    }
    currentSelectionType = type;
    if (window.selectedIds.has(id)) {
      window.selectedIds.delete(id);
    } else {
      window.selectedIds.add(id);
    }
    updateSelectionUI();
  };

  window.toggleSelectAll = (btn) => {
    const isSelected = btn.classList.contains('selected');
    window.selectedIds.clear();
    if (!isSelected) {
      if (activeView === 'contracts') {
         filteredCtr.forEach(c => window.selectedIds.add(c.id));
         currentSelectionType = 'contracts';
      } else {
         filteredTpl.forEach(t => window.selectedIds.add(t.id));
         currentSelectionType = 'templates';
      }
    }
    updateSelectionUI();
  };

  window.clearSelection = () => {
    window.selectedIds.clear();
    currentSelectionType = null;
    updateSelectionUI();
  };

  function updateSelectionUI() {
    const list = $('ctr-list');
    if (!list) return;

    list.querySelectorAll('.ctr-grid-row').forEach(row => {
      const id = row.dataset.id;
      const btn = row.querySelector('.mac-select-btn');
      if (window.selectedIds.has(id)) {
        row.classList.add('selected');
        if (btn) btn.classList.add('selected');
      } else {
        row.classList.remove('selected');
        if (btn) btn.classList.remove('selected');
      }
    });

    const massSelectAll = $('mass-select-all');
    if (massSelectAll) {
      const allList = activeView === 'contracts' ? filteredCtr : filteredTpl;
      if (allList.length > 0 && window.selectedIds.size === allList.length) {
        massSelectAll.classList.add('selected');
      } else {
        massSelectAll.classList.remove('selected');
      }
    }

    const bar = $('mac-mass-action-bar');
    const cnt = $('mac-selected-count');
    if (bar && cnt) {
      if (window.selectedIds.size > 0) {
        cnt.textContent = `${window.selectedIds.size} selezionat${window.selectedIds.size === 1 ? 'o' : 'i'}`;
        bar.classList.add('visible');
      } else {
        bar.classList.remove('visible');
      }
    }
  }

  window.massDelete = async () => {
    if (!window.selectedIds.size) return;
    if (!confirm(`Sei sicuro di voler eliminare ${window.selectedIds.size} element${window.selectedIds.size === 1 ? 'o' : 'i'}?`)) return;
    try {
      const list = Array.from(window.selectedIds);
      if (currentSelectionType === 'contracts') {
        await Promise.all(list.map(id => API.Contracts.delete(id)));
        loadContracts(true);
      } else {
        await Promise.all(list.map(id => API.Contracts.deleteTemplate(id)));
        loadTemplates(true);
      }
      clearSelection();
      UI.toast(`Eliminazione completata limitatamente agli elementi non protetti.`);
    } catch (e) {
      UI.toast(e?.message || 'Errore durante l\'eliminazione. Alcuni elementi potrebbero essere protetti.', 'error');
    }
  };

  // ─── Search listener (shared) ─────────────────────────────────
  $('ctr-search')?.addEventListener('input', debounce(() => {
    if (activeView === 'contracts') applyFiltersCtr();
    else applyFiltersTpl();
  }, 200));

  // ─── Contract modal ───────────────────────────────────────────
  window.openContractModal = async function(editId = null, prefill = {}) {
    if (editId instanceof Event) editId = null;
    const modal = $('modal-contract'); if (!modal) return;
    const wc = $('w-client'), wt = $('w-template'), wsList = $('w-service-list');
    const wOrigin = $('w-origin'), wSup = $('w-supplier');

    $('modal-ctr-title').textContent = editId ? 'Modifica contratto' : 'Nuovo contratto';
    $('btn-save-contract').querySelector('span').textContent = editId ? 'Salva modifiche' : 'Genera contratto';
    $('btn-save-contract').dataset.editId = editId || '';
    $('ctr-modal-banner').innerHTML = prefill.bannerHtml || '';

    if (wc) wc.innerHTML = '<option value="">Caricamento…</option>';
    if (wt) wt.innerHTML = '<option value="">Caricamento…</option>';
    modal.classList.add('open');

    const [clientsRes, tplsRes, srvsRes, onbRes, compsRes] = await Promise.all([
      API.Clients.list().catch(() => null),
      API.Contracts.templates({ is_active: true }).catch(() => null),
      API.Services.catalog(true, true).catch(() => null),
      API.Onboarding.list({}).catch(() => null),
      API.Companies.list().catch(() => null),
    ]);

    // Clients
    const cl = Array.isArray(clientsRes) ? clientsRes : (clientsRes?.data ?? clientsRes?.items ?? []);
    const onbRaw = Array.isArray(onbRes) ? onbRes : (onbRes?.data ?? onbRes?.items ?? []);
    const prospects = onbRaw.filter(o => o.status !== 'cancelled').map(o => ({
      id: `onb:${o.id}`, company_name: o.company_name || o.email || '', _isProspect: true, _stage: o.status,
    }));
    const allClients = [...cl, ...prospects].sort((a,b) => String(a.company_name||a.name||'').localeCompare(String(b.company_name||b.name||''), 'it'));
    if (wc) wc.innerHTML = '<option value="">Seleziona cliente / prospect</option>' + allClients.map(c => {
      const label = c.company_name || c.name || c.email || '';
      const badge = c._isProspect ? ` 🔸 [prospect${c._stage ? '·'+c._stage:''}]` : '';
      return `<option value="${c.id}">${escHtml(label)}${badge}</option>`;
    }).join('');

    // Templates
    const tl = Array.isArray(tplsRes) ? tplsRes : (tplsRes?.data ?? []);
    if (wt) wt.innerHTML = '<option value="">Seleziona template…</option>' + tl.map(t =>
      `<option value="${t.id}">${escHtml(t.name)}${t.version ? ' v'+t.version : ''}</option>`
    ).join('');

    // Suppliers (Aziende fornitrici)
    const cps = Array.isArray(compsRes) ? compsRes : (compsRes?.data ?? compsRes?.items ?? []);
    if (wSup) {
      wSup.innerHTML = '<option value="">Tutte le aziende fornitrici</option>' + cps.map(c => 
        `<option value="${c.id}">${escHtml(c.name)}</option>`
      ).join('');
    }

    // Services
    window._services = Array.isArray(srvsRes) ? srvsRes : (srvsRes?.data ?? srvsRes?.items ?? []);

    
    function renderSvc(supId) {
       if (!wsList) return;
       let filtered = window._services.filter(s => s.is_active !== false);
       if (supId) filtered = filtered.filter(s => String(s.company_id) === String(supId));
       
       const checkedIds = Array.from(wsList.querySelectorAll('.svc-cb:checked')).map(cb => cb.value);
       
       if (!filtered.length) {
         wsList.innerHTML = '<div style="padding:12px;font-size:13px;color:var(--gray-400);">Nessun servizio disponibile per questo fornitore</div>';
       } else {
         wsList.innerHTML = filtered.map(s => {
           const price = parseFloat(s.price || s.monthly_price || 0);
           const cycle = s.billing_cycle === 'annual' ? '/anno' : s.billing_cycle === 'quarterly' ? '/trim' : '/mese';
           const priceStr = price > 0 ? `€${price.toFixed(2)}${cycle}` : '';
           const chk = checkedIds.includes(String(s.id)) ? 'checked' : '';
           return `<label style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);transition:background .15s" onmouseenter="this.style.background='#f0fdf4'" onmouseleave="this.style.background=''">
             <input type="checkbox" value="${s.id}" data-price="${price}" class="svc-cb" style="width:16px;height:16px;accent-color:var(--brand-600);flex-shrink:0;" ${chk}>
             <span style="font-size:13px;flex:1;">${escHtml(s.name)}</span>
             ${priceStr ? `<span style="font-size:13px;font-weight:700;color:#16a34a;background:#f0fdf4;padding:2px 8px;border-radius:6px;">${priceStr}</span>` : ''}
           </label>`;
         }).join('');
       }
       
       document.getElementById('svc-total-bar')?.remove();
       if (filtered.length) {
         const totalBar = document.createElement('div');
         totalBar.id = 'svc-total-bar';
         totalBar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:0 0 8px 8px;font-size:13px;font-weight:600;color:#15803d;';
         totalBar.innerHTML = '<span>Totale selezionato</span><span id="svc-total-val">€ 0,00</span>';
         wsList.parentElement?.insertBefore(totalBar, wsList.nextSibling);
       }
       wsList.dispatchEvent(new Event('change'));
    }

    if (wsList && !wsList.hasCbListener) {
       wsList.hasCbListener = true;
       wsList.addEventListener('change', () => {
         const total = Array.from(wsList.querySelectorAll('.svc-cb:checked')).reduce((sum, cb) => sum + parseFloat(cb.dataset.price||0), 0);
         const tv = document.getElementById('svc-total-val');
         if (tv) tv.textContent = `€ ${total.toFixed(2)}`;
       });
    }

    if (wSup && !wSup.hasListener) {
      wSup.hasListener = true;
      wSup.addEventListener('change', () => renderSvc(wSup.value));
    }
    
    // Initial render of all services before prefilling
    renderSvc('');

    // Prefill
    if (prefill.client_id && wc) wc.value = prefill.client_id;
    if (prefill.origin && wOrigin) wOrigin.value = prefill.origin;
    if (!editId) { const ti = $('w-title'); if(ti) ti.value=''; return; }

    // Edit mode
    try {
      const ctr = await API.Contracts.get(editId);
      const d = ctr?.data || ctr;
      const ti = $('w-title'); if(ti) ti.value = d.title || '';
      if (d.onboarding_id && wc) wc.value = `onb:${d.onboarding_id}`;
      else if (d.client_id && wc) wc.value = d.client_id;
      if (d.template_id && wt) wt.value = d.template_id;
      if (d.origin && wOrigin) wOrigin.value = d.origin;
      if (d.supplier_company_id && wSup) {
        wSup.value = d.supplier_company_id;
        renderSvc(d.supplier_company_id);
      }
      if (d.valid_from) { const vf=$('w-valid-from'); if(vf) vf.value=d.valid_from.substring(0,10); }
      if (d.valid_to)   { const vt=$('w-valid-to');   if(vt) vt.value=d.valid_to.substring(0,10); }
      if (d.contract_services?.length) {
        const ids = d.contract_services.map(s => s.service_id);
        wsList?.querySelectorAll('.svc-cb').forEach(cb => { if(ids.includes(cb.value)) cb.checked = true; });
        wsList?.dispatchEvent(new Event('change'));
      }
    } catch(err) { UI.toast('Errore caricamento dati', 'error'); }
  };

  $('btn-save-contract')?.addEventListener('click', async () => {
    const btn = $('btn-save-contract');
    const editId = btn.dataset.editId || '';
    const cid = $('w-client')?.value, tid = $('w-template')?.value;
    const origin = $('w-origin')?.value || 'direct';
    if (!cid || !tid) { UI.toast('Cliente e Template sono obbligatori', 'warning'); return; }

    const isProspect = cid.startsWith('onb:');
    const onboarding_id = isProspect ? cid.replace('onb:', '') : null;
    const client_id     = isProspect ? null : cid;
    const service_ids = Array.from(document.querySelectorAll('#w-service-list .svc-cb:checked')).map(cb => cb.value);

    btn.disabled = true;
    try {
      const payload = {
        client_id, onboarding_id,
        supplier_company_id: $('w-supplier')?.value || null,
        template_id: tid,
        service_ids,
        service_id: service_ids[0] || null,
        title:      $('w-title')?.value?.trim() || '',
        valid_from: $('w-valid-from')?.value || null,
        valid_to:   $('w-valid-to')?.value   || null,
        origin,
      };
      if ($('w-quote-id')) payload.quote_id = $('w-quote-id').value;

      if (editId) {
        await API.Contracts.update(editId, payload);
        UI.toast('Contratto aggiornato', 'success');
      } else {
        await API.Contracts.create(payload);
        UI.toast('Contratto generato', 'success');
      }
      $('modal-contract').classList.remove('open');
      await loadContracts(true);
    } catch(e) { UI.toast(e?.message || 'Errore salvataggio', 'error'); }
    finally { btn.disabled = false; }
  });

  // ─── Template modal ───────────────────────────────────────────
  window.openTemplateModal = async function(editId = null) {
    const modal = $('modal-template'); if (!modal) return;
    $('modal-tpl-title').textContent = editId ? 'Modifica template' : 'Nuovo template';
    $('btn-save-tpl-label').textContent = editId ? 'Salva modifiche' : 'Crea template';
    $('btn-save-template').dataset.editId = editId || '';
    if (!editId) {
      ['t-name','t-content','t-version','t-notes'].forEach(id => { const el=$(id); if(el) el.value=''; });
      const ta=$('t-active'); if(ta) ta.checked=true;
      const td=$('t-default'); if(td) td.checked=false;
      const tt=$('t-type'); if(tt) tt.value='';
      const tl=$('t-lang'); if(tl) tl.value='it';
      const ts=$('t-supplier'); if(ts) ts.value='';
    }
    modal.classList.add('open');
    // Populate supplier dropdown
    const tSup = $('t-supplier');
    if (tSup && tSup.options.length <= 1) {
      try {
        const compsRes = await API.Companies.list().catch(() => null);
        const cps = Array.isArray(compsRes) ? compsRes : (compsRes?.data ?? compsRes?.items ?? []);
        tSup.innerHTML = '<option value="">– Nessuna (template globale) –</option>' +
          cps.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('');
      } catch(e) { /* ignore */ }
    }
  };

  window.editTemplate = async function(id) {
    try {
      const t = await API.Contracts.templates();
      const data = (Array.isArray(t) ? t : (t?.data??[])).find(x => x.id === id);
      if (!data) { UI.toast('Template non trovato', 'error'); return; }
      openTemplateModal(id);
      setTimeout(() => {
        const setVal = (elId, val) => { const el=$(elId); if(el && val!=null) el.value=val; };
        setVal('t-supplier', data.supplier_company_id || '');
        setVal('t-name', data.name);
        setVal('t-content', data.content);
        setVal('t-type', data.contract_type || '');
        setVal('t-version', data.version || '');
        setVal('t-lang', data.lang || 'it');
        setVal('t-notes', data.notes || '');
        const ta=$('t-active'); if(ta) ta.checked = data.is_active !== false;
        const td=$('t-default'); if(td) td.checked = !!data.is_default;
      }, 50);
    } catch(e) { UI.toast('Errore caricamento template', 'error'); }
  };

  window.duplicateTemplate = async function(id) {
    try {
      const tList = await API.Contracts.templates();
      const data = (Array.isArray(tList) ? tList : (tList?.data??[])).find(x => x.id === id);
      if (!data) return;
      openTemplateModal(null);
      setTimeout(() => {
        const setVal = (elId, val) => { const el=$(elId); if(el && val!=null) el.value=val; };
        setVal('t-supplier', data.supplier_company_id || '');
        setVal('t-name', data.name + ' (Copia)');
        setVal('t-content', data.content);
        setVal('t-type', data.contract_type || '');
        setVal('t-version', data.version || '');
        setVal('t-lang', data.lang || 'it');
        setVal('t-notes', data.notes || '');
        const ta=$('t-active'); if(ta) ta.checked = data.is_active !== false;
        const td=$('t-default'); if(td) td.checked = !!data.is_default;
      }, 50);
    } catch(e) { UI.toast('Errore duplicazione', 'error'); }
  };

  window.toggleTemplateActive = async function(id, newState) {
    try {
      await API.Contracts.updateTemplate(id, { is_active: newState });
      UI.toast(newState ? 'Template attivato' : 'Template disattivato', 'success');
      await loadTemplates(true);
    } catch(e) { UI.toast(e?.message||'Errore', 'error'); }
  };

  window.deleteTemplate = async function(id) {
    if (!confirm('Eliminare questo template? I contratti già creati restano invariati.')) return;
    try {
      await API.Contracts.deleteTemplate(id);
      ALL_TPL = ALL_TPL.filter(t => t.id !== id);
      UI.toast('Template eliminato', 'success');
      applyFiltersTpl();
    } catch(e) { UI.toast(e?.message||'Errore eliminazione', 'error'); }
  };

  /** Insert dynamic variable into textarea */
  window.ctInsertVar = function(varName) {
    const ta = document.getElementById('t-content');
    if(!ta) return;
    const ins = `{{${varName}}}`;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = ta.value;
    ta.value = text.substring(0, start) + ins + text.substring(end);
    ta.selectionStart = ta.selectionEnd = start + ins.length;
    ta.focus();
  };

  $('btn-save-template')?.addEventListener('click', async () => {
    const btn = $('btn-save-template');
    const name = $('t-name')?.value?.trim();
    const content = $('t-content')?.value?.trim();
    if (!name) { UI.toast('Il nome del template è obbligatorio', 'warning'); return; }

    const editId = btn.dataset.editId || '';
    const payload = {
      name,
      content: content || '',
      type: 'contract',
      lang: $('t-lang')?.value || 'it',
      is_active: $('t-active')?.checked !== false,
      is_default: $('t-default')?.checked || false,
      contract_type: $('t-type')?.value || null,
      version: $('t-version')?.value?.trim() || null,
      notes: $('t-notes')?.value?.trim() || null,
      supplier_company_id: $('t-supplier')?.value || null,
    };

    btn.disabled = true;
    try {
      if (editId) {
        await API.Contracts.updateTemplate(editId, payload);
        UI.toast('Template aggiornato', 'success');
      } else {
        await API.Contracts.createTemplate(payload);
        UI.toast('Template creato', 'success');
      }
      $('modal-template').classList.remove('open');
      await loadTemplates(true);
    } catch(e) { UI.toast(e?.message||'Errore salvataggio', 'error'); }
    finally { btn.disabled = false; }
  });

  // ─── Regen Drawer ─────────────────────────────────────────────
  window.openRegenDrawer = async function(contractId) {
    const c = ALL_CTR.find(x => x.id === contractId);
    $('regen-contract-id').value = contractId;
    $('regen-contract-info').innerHTML = c ? `<b>${escHtml(c.title||'Contratto')}</b><br><span style="font-size:12px;">${escHtml(c.client_name)}</span>` : 'Contratto selezionato';
    $('regen-title').value = '';

    // Load active templates
    const rtpl = $('regen-template');
    if (rtpl) {
      rtpl.innerHTML = '<option value="">Caricamento…</option>';
      try {
        const tpls = await API.Contracts.templates({ is_active: true });
        const list = Array.isArray(tpls) ? tpls : (tpls?.data ?? []);
        rtpl.innerHTML = '<option value="">Seleziona template…</option>' +
          list.map(t => `<option value="${t.id}">${escHtml(t.name)}${t.version ? ' v'+t.version : ''}</option>`).join('');
      } catch(e) { rtpl.innerHTML = '<option value="">Errore caricamento</option>'; }
    }

    $('regen-drawer').classList.add('open');
    $('regen-overlay').classList.add('open');
  };

  window.closeRegenDrawer = function() {
    $('regen-drawer')?.classList.remove('open');
    $('regen-overlay')?.classList.remove('open');
  };

  $('btn-regen-confirm')?.addEventListener('click', async () => {
    const contractId = $('regen-contract-id')?.value;
    const tplId      = $('regen-template')?.value;
    if (!contractId || !tplId) { UI.toast('Seleziona un template', 'warning'); return; }

    const btn = $('btn-regen-confirm');
    btn.disabled = true;
    try {
      const payload = { template_id: tplId };
      const title = $('regen-title')?.value?.trim();
      if (title) payload.title = title;
      await API.Contracts.regenerate(contractId, payload);
      UI.toast('Contratto rigenerato con successo', 'success');
      closeRegenDrawer();
      await loadContracts(true);
    } catch(e) { UI.toast(e?.message||'Errore rigenerazione', 'error'); }
    finally { btn.disabled = false; }
  });

  // ─── Contract row actions ──────────────────────────────────────
  window.viewContract = async function(id) {
    UI.toast('Generazione anteprima…', 'info');
    try {
      const c = await API.Contracts.compile(id);
      const raw   = c?.compiled_content || c?.data?.compiled_content;
      const title = c?.title || c?.data?.title || 'Contratto';
      if (!raw) { UI.toast('Nessun template associato al contratto', 'warning'); return; }

      let body = raw;
      // Note: Newlines and spaces are preserved via CSS white-space: pre-wrap
      const html = `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><title>${escHtml(title)}</title>
        <style>*{box-sizing:border-box}body{font-family:Georgia,serif;max-width:210mm;margin:0 auto;padding:20mm;font-size:11pt;line-height:1.7;color:#111;background:#fff;white-space:pre-wrap;}
        table{white-space:normal;}h2{font-size:12pt;text-transform:uppercase;border-bottom:1px solid #ccc;padding-bottom:3px;margin:24pt 0 8pt}p{margin:0 0 8pt;text-align:justify}
        .no-print{position:fixed;top:16px;right:16px;display:flex;gap:8px;z-index:999}@media print{.no-print{display:none}body{padding:15mm}}</style></head>
        <body><div class="no-print">
          <button onclick="window.print()" style="padding:8px 18px;background:#16a34a;color:#fff;border:none;border-radius:8px;font-size:13px;cursor:pointer;font-weight:600;">🖨 Stampa / PDF</button>
          <button onclick="window.close()" style="padding:8px 14px;background:#f1f5f9;color:#333;border:none;border-radius:8px;font-size:13px;cursor:pointer;">✕</button>
        </div>
        <div style="text-align:center;margin-bottom:30pt;padding:20pt 0;border-bottom:2pt solid #111;">
          <h1 style="font-size:16pt;text-transform:uppercase;letter-spacing:2px;margin:0 0 8pt">${escHtml(title)}</h1>
          <div style="font-size:10pt;color:#555;">Generato il ${new Date().toLocaleDateString('it-IT',{day:'2-digit',month:'long',year:'numeric'})}</div>
        </div>${body}</body></html>`;
      const w = window.open('', '_blank', 'width=960,height=860');
      if (w) { w.document.write(html); w.document.close(); }
      else UI.toast('Abilita i popup del browser per visualizzare il contratto', 'warning');
    } catch(e) { UI.toast(e?.message||'Errore generazione anteprima', 'error'); }
  };

  window.editContract = id => openContractModal(id);

  window.sendContract = async function(id) {
    const res = await Swal.fire({
      html: `
        <div style="display:flex; flex-direction:column; align-items:center; text-align:center;">
          <div style="width:48px;height:48px;background:#e0e7ff;color:#4f46e5;border-radius:12px;display:flex;align-items:center;justify-content:center;margin-bottom:16px;">
            <svg fill="none" stroke="currentColor" stroke-width="2" width="24" height="24" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"></path></svg>
          </div>
          <h3 style="font-size:18px; font-weight:700; color:#111; margin:0 0 8px;">Invia Contratto</h3>
          <p style="font-size:13px; color:#555; margin:0; line-height:1.5;">Seleziona la modalità di firma. La modalità digitale automatizza la fatturazione.</p>
        </div>
      `,
      showCancelButton: true,
      showDenyButton: true,
      confirmButtonText: 'Firma Digitale (Zoho)',
      denyButtonText: 'Email Classica (PDF)',
      cancelButtonText: 'Annulla',
      buttonsStyling: false,
      customClass: {
        popup: 'swal-mac-popup',
        actions: 'swal-mac-actions',
        confirmButton: 'swal-mac-btn swal-mac-btn-primary',
        denyButton: 'swal-mac-btn swal-mac-btn-secondary',
        cancelButton: 'swal-mac-btn swal-mac-btn-cancel'
      },
      width: 420,
      padding: '24px 20px 24px',
      showCloseButton: false,
      focusConfirm: false
    });

    if (res.isDismissed) return;
    const method = res.isConfirmed ? 'zoho' : 'email';

    try {
      await API.Contracts.send(id, { method });
      ALL_CTR = ALL_CTR.map(c => c.id===id ? {...c, status:'sent'} : c);
      UI.toast(method === 'zoho' ? 'Contratto inviato tramite Zoho Sign' : 'Contratto inviato via Email', 'success');
      applyFiltersCtr();
    } catch(e) { UI.toast(e?.message||'Errore invio', 'error'); }
  };

  window.markSignedContract = async function(id) {
    if (!confirm('Segnare il contratto come firmato manualmente?')) return;
    try {
      await API.Contracts.markSigned(id);
      ALL_CTR = ALL_CTR.map(c => c.id===id ? {...c, status:'signed'} : c);
      UI.toast('Contratto firmato', 'success');
      applyFiltersCtr();
    } catch(e) { UI.toast(e?.message||'Errore', 'error'); }
  };

  window.archiveContract = async function(id) {
    if (!confirm('Archiviare questo contratto?')) return;
    try {
      await API.Contracts.update(id, {status:'archived'});
      ALL_CTR = ALL_CTR.map(c => c.id===id ? {...c, status:'archived'} : c);
      UI.toast('Archiviato', 'success');
      applyFiltersCtr();
    } catch(e) { UI.toast(e?.message||'Errore', 'error'); }
  };

  window.deleteContract = async function(id) {
    if (!confirm('Eliminare questa bozza? L\'operazione non è reversibile.')) return;
    try {
      await API.Contracts.remove(id);
      ALL_CTR = ALL_CTR.filter(c => c.id !== id);
      UI.toast('Bozza eliminata', 'success');
      applyFiltersCtr();
    } catch(e) { UI.toast(e?.message||'Errore eliminazione', 'error'); }
  };

  // ─── Helpers ──────────────────────────────────────────────────
  function originTag(origin) {
    switch (origin) {
      case 'from_quote':      return `<span class="origin-badge origin-quote">📋 Da preventivo</span>`;
      case 'supplier_change': return `<span class="origin-badge origin-supplier">🔄 Cambio fornitore</span>`;
      default:                return `<span class="origin-badge origin-direct">👤 Diretto</span>`;
    }
  }

  function contractTypeLabel(t) {
    return { service:'Servizi', maintenance:'Manutenzione', consulting:'Consulenza', other:'Altro' }[t] || '';
  }

  function escHtml(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function debounce(fn, ms) {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }

  // ─── Init ─────────────────────────────────────────────────────
  window.onPageReady(async () => {
    await I18n.init('lang-switcher-slot');
    document.querySelectorAll('.ctr-view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === activeView));
    renderPageActions();
    renderPills();
    renderGridHeader();

    // Handle ?quote_id= deep-link from accepted quote
    const params = new URLSearchParams(location.search);
    const fromQuoteId  = params.get('quote_id');
    const fromClientId = params.get('client_id');

    if (activeView === 'contracts') {
      await loadContracts();
    } else {
      await loadTemplates();
    }

    if (fromQuoteId) {
      const prefill = { origin: 'from_quote', client_id: fromClientId || undefined };
      prefill.bannerHtml = '<div style="background:#ede9fe;border:1px solid #c4b5fd;border-radius:8px;padding:10px 14px;font-size:13px;color:#5b21b6;margin-bottom:12px;">📋 <strong>Contratto da preventivo accettato.</strong> Il preventivo viene collegato automaticamente.</div>';
      await openContractModal(null, prefill);
      if (!$('w-quote-id') && $('modal-contract')) {
        const inp = document.createElement('input');
        inp.type='hidden'; inp.id='w-quote-id'; inp.value=fromQuoteId;
        $('modal-contract').querySelector('.modal-body')?.appendChild(inp);
      }
    }

    window.addEventListener('companyChanged', () => {
      loadContracts(true);
      if (activeView === 'templates') loadTemplates(true);
    });
  });

})();