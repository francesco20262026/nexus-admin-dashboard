/* ============================================================
   admin_client_detail.js 360° client hub
   ============================================================ */
'use strict';

(function () {
  Auth.guard('admin');
  Auth.initUI();

  /* ── URL params ─────────────────────────────────────────────── */
  const params   = new URLSearchParams(window.location.search);
  const clientId = params.get('id') || params.get('client_id');
  const openTab  = params.get('tab');

  if (!clientId) {
    setTimeout(() => { location.href = 'admin_clients.html'; }, 800);
    return;
  }

  /* ── DOM ────────────────────────────────────────────────────── */
  const $ = id => document.getElementById(id);

  let CLIENT = null;
  let _companies = [];
  let _editingAnag = false;

  /* ── Tab Routing (SPA) ────────────────────────────────────────── */
  window.switchMainView = function (viewId) {
    // Hide all tab sections
    document.querySelectorAll('.mac-tab-section').forEach(el => {
      el.style.display = 'none';
      el.classList.remove('active');
    });
    
    // Show target tab
    const target = document.getElementById('view-' + viewId);
    if (target) {
      target.style.display = '';
      target.classList.add('active');
    }

    // Update horizontal tab bar active state
    document.querySelectorAll('.detail-tab').forEach(el => el.classList.remove('active'));
    const activeTab = document.getElementById('tab-' + viewId);
    if (activeTab) activeTab.classList.add('active');

    // Lazy load the timeline only when requested
    if (viewId === 'timeline' && !loaded['storico']) {
      if (typeof loadStorico === 'function') loadStorico();
      loaded['storico'] = true;
    }
  };


  /* ── Deep-link quick links from list page ────────────────────── */
  function updateDeepLinks() {
    const safe = encodeURIComponent(clientId);
    const el   = $('cd-link-invoices');  if (el)  el.href = `admin_invoices.html?client_id=${safe}`;
    const ec   = $('cd-link-contracts'); if (ec)  ec.href = `admin_contracts.html?client_id=${safe}`;
    const ed   = $('cd-link-docs');      if (ed)  ed.href = `admin_documents.html?client_id=${safe}`;
    const er   = $('cd-link-renewals');  if (er)  er.href = `admin_renewals.html?client_id=${safe}`;
    // Quick-create links with client pre-selected
    const eqc  = $('cd-link-new-quote-card'); if (eqc) eqc.href = `admin_quotes.html?new=1&client_id=${safe}`;
    const btnQ = $('cd-btn-new-quote');       if (btnQ) btnQ.onclick = () => location.href = `admin_quotes.html?new=1&client_id=${safe}`;
    const einv = $('cd-link-new-invoice'); if (einv) einv.href = `admin_invoices.html?new=1&client_id=${safe}`;
    const epro = $('cd-link-new-proforma');if (epro) epro.href = `admin_invoices.html?new=1&type=proforma&client_id=${safe}`;
  }

  /* ── Load main client ────────────────────────────────────────── */
  async function loadClient() {
    try {
      const [client, companies] = await Promise.all([
        API.Clients.get(clientId),
        API.Companies.list()
      ]);
      CLIENT = client;
      _companies = Array.isArray(companies) ? companies : (companies?.items ?? companies?.data ?? []);
      
      if (!CLIENT) throw new Error('not found');
      renderHeader();
      renderAnagrafica();
      updateDeepLinks();
    } catch (e) {
      $('cd-title').textContent = I18n.t('error.not_found') || 'Non trovato';
      UI.toast(e.message, 'error');
    }
  }
  window.refreshClientDetail = loadClient;

  /* ── Header ──────────────────────────────────────────────── */
  function _initials(str) {
    if (!str) return '?';
    const words = str.trim().split(/\s+/);
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }

  function renderHeader() {
    const c = CLIENT;
    const displayName = c.company_name || c.name || '';

    // Fornitrice lookup
    const fornitriceLine = _companies.find(comp => comp.id == c.company_id);
    const fornitriceName = fornitriceLine ? fornitriceLine.name : '';

    // ── Backward compat IDs ──────────────────────────────────────
    if ($('cd-title')) $('cd-title').textContent = displayName;
    if ($('breadcrumb-name')) $('breadcrumb-name').textContent = displayName;
    if ($('cd-status-pill')) $('cd-status-pill').innerHTML = statusBadge(c.status);
    document.title = `${displayName} Nexus Admin`;

    // Modern macOS Identity Stack
    const leftDiv = document.querySelector('.detail-page-header-left');
    if (leftDiv) {
      const avatarEl = leftDiv.querySelector('.detail-avatar');
      if (avatarEl) {
        avatarEl.style.width = '64px';
        avatarEl.style.height = '64px';
        avatarEl.style.fontSize = '24px';
        avatarEl.style.fontWeight = '500';
      }
      
      const identityContainer = leftDiv.children[1];
      if (identityContainer) {
        identityContainer.innerHTML = `
          <div style="display:flex; align-items:center; gap:12px; margin-bottom: 2px;">
            <div style="font-size: 24px; font-weight: 700; letter-spacing: -0.02em; color: #000; line-height: 1.1;" id="cd-title">
              ${displayName}
            </div>
            <div id="cd-status-pill-visible">
              ${statusBadge(c.status)}
            </div>
          </div>
          ${fornitriceName ? `
            <div style="font-size: 14px; font-weight: 500; color: #6e6e73; display:flex; align-items:center; gap: 6px; margin-bottom: 4px;">
              <svg xmlns="http://www.w3.org/2000/svg" style="width:14px;height:14px;color:#86868b;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
              </svg>
              ${fornitriceName}
            </div>` : ''}
          <div id="cd-subtitle" style="font-size: 14px; color: #0066cc; font-weight: 400; margin-bottom: 2px;">
            ${c.email ? `<a href="mailto:${c.email}" style="color:#0066cc;text-decoration:none;">${c.email}</a>` : ''}
          </div>
        `;
      }
    }

    // Dynamic Breadcrumb for Suppliers vs Clients
    if ($('cd-back-link') && $('cd-back-text')) {
      if (c.is_supplier) {
        $('cd-back-link').href = 'admin_suppliers.html';
        $('cd-back-text').textContent = 'Fornitori';
      } else {
        $('cd-back-link').href = 'admin_clients.html';
        $('cd-back-text').textContent = 'Clienti';
      }
    }

    // ── Mac sidebar identity ─────────────────────────────────────
    const av = $('pc-avatar');
    if (av) {
      av.textContent = _initials(c.company_name || c.name);
      av.style.background = 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)';
      av.style.color = '#fff';
    }

    // Mac topbar title
    const topbarLabel = $('mac-topbar-label');
    if (topbarLabel) topbarLabel.textContent = displayName;

    // Info strip: email, phone, city, VAT, created
    const strip = $('cd-info-strip');
    if (strip) {
      const pill = (icon, val, href = null) => {
        if (!val) return '';
        const inner = href ? `<a href="${href}">${val}</a>` : val;
        return `<span class="z-info-pill">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">${icon}</svg>
          ${inner}</span>`;
      };
      const emailIcon = '<path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"/>';
      const phoneIcon = '<path stroke-linecap="round" stroke-linejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 6z"/>';
      const cityIcon  = '<path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"/>';
      const vatIcon   = '<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z"/>';
      const createdIcon = '<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"/>';
      const createdStr = c.created_at
        ? new Date(c.created_at).toLocaleDateString('it-IT', { day:'2-digit', month:'short', year:'numeric' })
        : null;
      strip.innerHTML = [
        pill(emailIcon, c.email, c.email ? `mailto:${c.email}` : null),
        pill(phoneIcon, c.phone, c.phone ? `tel:${c.phone}` : null),
        pill(cityIcon, c.city),
        pill(vatIcon, c.vat_number ? `P.IVA ${c.vat_number}` : null),
        pill(createdIcon, createdStr ? `Cliente dal ${createdStr}` : null),
      ].filter(Boolean).join('');
    }
    
    if (window.renderPortalPipeline) window.renderPortalPipeline();
  }

  /* ── ① Anagrafica ───────────────────────────────────────────── */
  const STATUS_LABELS = {
    prospect:   { label: 'Prospect',   color: '#7c3aed', bg: '#f3e8ff' },
    pre_active: { label: 'Pre-attivo', color: '#d97706', bg: '#fef3c7' },
    active:     { label: 'Attivo',     color: '#3b82f6', bg: '#eff6ff' },
    suspended:  { label: 'Sospeso',    color: '#dc2626', bg: '#fee2e2' },
    ceased:     { label: 'Cessato',    color: '#dc2626', bg: '#fee2e2' },
  };

  function statusBadge(s) {
    const cfg = STATUS_LABELS[s] || { label: s || '', color: '#6b7280', bg: '#f3f4f6' };
    return `<span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:700;
      color:${cfg.color};background:${cfg.bg};padding:3px 10px;border-radius:20px;">
      <span style="width:6px;height:6px;border-radius:50%;background:${cfg.color};flex-shrink:0;"></span>
      ${cfg.label}</span>`;
  }

  function renderAnagrafica() {
    const c = CLIENT;
    const grid = $('cd-anag-grid') || $('cd-anag-list');
    if (!grid) return;

    const f = (label, val, fieldId = null, type = 'text') => {
      let display = '';
      if (_editingAnag && fieldId) {
        if (type === 'textarea') {
          display = `<textarea class="mac-flat-input" id="${fieldId}" style="width:100%; font-size:13px; line-height:1.5; padding:8px; border-radius:6px; min-height:80px; margin:0; resize:vertical;">${val || ''}</textarea>`;
        } else if (type === 'lang') {
          display = `<select class="mac-flat-input" id="${fieldId}" style="width:100%; font-size:13px; padding:4px 8px; margin:0; height:32px;">
                <option value="it" ${val==='it' ? 'selected':''}>IT</option>
                <option value="en" ${val==='en' ? 'selected':''}>EN</option>
                <option value="de" ${val==='de' ? 'selected':''}>DE</option>
                <option value="fr" ${val==='fr' ? 'selected':''}>FR</option>
                <option value="es" ${val==='es' ? 'selected':''}>ES</option>
              </select>`;
        } else {
          display = `<input class="mac-flat-input" id="${fieldId}" type="${type}" value="${(val || '').replace(/"/g, '&quot;')}" style="width:100%; font-size:13px; padding:4px 8px; margin:0; height:32px;"/>`;
        }
      } else {
        if (type === 'textarea') {
          display = val ? `<div style="white-space:pre-wrap; line-height:1.5;">${val}</div>` : `<span class="empty">—</span>`;
        } else {
          const link = type === 'email' && val ? `mailto:${val}` : type === 'tel' && val ? `tel:${val}` : null;
          display = val ? (link ? `<a href="${link}">${val}</a>` : val) : `<span class="empty">—</span>`;
        }
        if (type === 'lang' && val) display = val.toUpperCase();
      }
      return `
        <div class="detail-field">
          <div class="detail-field-label">${label}</div>
          <div class="detail-field-value" style="display:flex; align-items:center;">${display}</div>
        </div>`;
    };

    const editToggle = `
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size:11px; font-weight:600; color:#64748b; text-transform:uppercase;">Modifica</span>
        <label class="mac-switch" title="Abilita/Disabilita Modifica">
          <input type="checkbox" id="anag-edit-toggle" ${_editingAnag ? 'checked' : ''}>
          <span class="mac-slider"></span>
        </label>
      </div>`;

    grid.innerHTML = `
      <div class="detail-section-header" style="flex-wrap: wrap; gap: 16px;">
        <div class="detail-section-label" style="flex:1;">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"/></svg>
          <div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
            <span>Dati Anagrafici</span>
          </div>
        </div>
        ${editToggle}
      </div>

      <div class="detail-section-body">
        <div class="detail-field-grid">
          ${f('Ragione Sociale', c.company_name, 'anag-company-name', 'text')}
          ${f('Alias', c.alias, 'anag-alias', 'text')}
          ${f('Nome Referente', c.name, 'anag-lead-name', 'text')}
          ${f('Email', c.email, 'anag-email', 'email')}
          ${f('Telefono', c.phone, 'anag-phone', 'tel')}
          ${f('Lingua', c.lang, 'anag-lang', 'lang')}
        </div>
      </div>

      <div class="detail-section-header" style="border-top:1px solid #f1f5f9;">
        <div class="detail-section-label">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"/></svg>
          Indirizzo &amp; Fatturazione
        </div>
      </div>
      <div class="detail-section-body">
        <div class="detail-field-grid">
          ${f('Indirizzo', c.address, 'anag-address', 'text')}
          ${f('Città', c.city, 'anag-city', 'text')}
          ${f('Partita IVA', c.vat_number, 'anag-vat', 'text')}
          ${f('IBAN', c.iban, 'anag-iban', 'text')}
          ${f('PEC', c.pec, 'anag-pec', 'email')}
          ${f('Codice SDI', c.dest_code, 'anag-sdi', 'text')}
        </div>
      </div>

      <div class="detail-section-header" style="border-top:1px solid #f1f5f9;">
        <div class="detail-section-label">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z"/></svg>
          Note Interne
        </div>
      </div>
      <div class="detail-section-body">
        ${f('Note', c.notes, 'anag-notes', 'textarea')}
      </div>
    `;

    const toggle = $('anag-edit-toggle');
    if (toggle) {
      toggle.onchange = async (e) => {
        if (e.target.checked) {
          _editingAnag = true;
          renderAnagrafica();
        } else {
          const payload = {
            company_name: $('anag-company-name')?.value?.trim() || null,
            name: $('anag-lead-name')?.value?.trim() || null,
            email: $('anag-email')?.value?.trim() || null,
            phone: $('anag-phone')?.value?.trim() || null,
            vat_number: $('anag-vat')?.value?.trim() || null,
            pec: $('anag-pec')?.value?.trim() || null,
            dest_code: $('anag-sdi')?.value?.trim() || null,
            iban: $('anag-iban')?.value?.trim() || null,
            address: $('anag-address')?.value?.trim() || null,
            city: $('anag-city')?.value?.trim() || null,
            lang: $('anag-lang')?.value || 'it',
            alias: $('anag-alias')?.value?.trim() || null,
            notes: $('anag-notes')?.value?.trim() || null,
          };
          Object.keys(payload).forEach(k => { if (payload[k] === null) delete payload[k]; });

          try {
            toggle.disabled = true;
            UI.toast('Salvataggio in corso...', 'info');
            CLIENT = await API.Clients.update(clientId, payload);
            UI.toast('Anagrafica aggiornata', 'success');
            _editingAnag = false;
            renderHeader();
            renderAnagrafica();
          } catch (err) {
            UI.toast(err?.message || 'Errore', 'error');
            e.target.checked = true;
            toggle.disabled = false;
          }
        }
      };
    }
  }

  function openClientModal() {
    const c = CLIENT;
    const m = $('modal-edit-client');
    if (!m) return;
    
    // Popup logic per Form
    const populateSel = (sel, val) => { if ($(sel)) $(sel).value = val || ''; }
    populateSel('f-edit-company-id', c.company_id);
    populateSel('f-edit-name', c.company_name);
    populateSel('f-edit-alias', c.alias);
    populateSel('f-edit-vat', c.vat_number);
    populateSel('f-edit-sdi', c.dest_code);
    populateSel('f-edit-referente', c.name);
    populateSel('f-edit-email', c.email);
    populateSel('f-edit-pec', c.pec);
    populateSel('f-edit-phone', c.phone);
    populateSel('f-edit-city', c.city);
    populateSel('f-edit-address', c.address);
    populateSel('f-edit-notes', c.notes);
    if ($('f-edit-status')) $('f-edit-status').value = c.status || 'prospect';
    
    // Fill companies drop-down inside the modal
    const selCompany = $('f-edit-company-id');
    if (selCompany) {
        selCompany.innerHTML = `<option value="">Seleziona fornitrice...</option>` +
          _companies.map(co => `<option value="${co.id}">${co.name}</option>`).join('');
        selCompany.value = c.company_id || '';
    }

    m.classList.add('open');
  }

  // Bind modal save globally
  document.addEventListener('DOMContentLoaded', () => {
    $('btn-edit-client-save')?.addEventListener('click', async () => {
      try {
        const payload = {
          company_name: $('f-edit-name')?.value?.trim() || null,
          name: $('f-edit-referente')?.value?.trim() || null,
          company_id: $('f-edit-company-id')?.value || null,
          email: $('f-edit-email')?.value?.trim() || null,
          phone: $('f-edit-phone')?.value?.trim() || null,
          vat_number: $('f-edit-vat')?.value?.trim() || null,
          pec: $('f-edit-pec')?.value?.trim() || null,
          dest_code: $('f-edit-sdi')?.value?.trim() || null,
          alias: $('f-edit-alias')?.value?.trim() || null,
          address: $('f-edit-address')?.value?.trim() || null,
          city: $('f-edit-city')?.value?.trim() || null,
          notes: $('f-edit-notes')?.value?.trim() || null,
          status: $('f-edit-status')?.value || 'prospect'
        };
        // Remove nulls
        Object.keys(payload).forEach(k => { if (payload[k] === null) delete payload[k]; });

        const btn = $('btn-edit-client-save');
        const oldText = btn.textContent;
        btn.textContent = 'Salvataggio...'; btn.disabled = true;

        CLIENT = await API.Clients.update(clientId, payload);
        
        $('modal-edit-client').classList.remove('open');
        UI.toast('Cliente aggiornato con successo', 'success');
        renderHeader();
        renderAnagrafica();
        
        btn.textContent = oldText; btn.disabled = false;
      } catch (e) {
        UI.toast(e.message || 'Errore salvataggio', 'error');
        $('btn-edit-client-save').disabled = false;
        $('btn-edit-client-save').textContent = 'Salva Modifiche';
      }
    });
  });

  /* ── ② Contacts ─────────────────────────────────────────────── */
  async function loadContacts() {
    const el = $('cd-contacts-list');
    if (!el) return;
    el.innerHTML = UI.skeletonCardList(2);
    try {
      const res  = await API.Clients.contacts?.(clientId);
      const data = Array.isArray(res) ? res : (res?.data || res?.items || []);
      const badge = $('badge-contact');
      if (badge) badge.textContent = data.length;
      if (!data.length) {
        el.innerHTML = `<div style="padding:32px 20px;text-align:center;color:var(--gray-400);font-size:13px;">Nessun contatto aggiunto. Usa "Nuovo" per aggiungerne uno.</div>`;
        _renderSidebarContacts([]);
        return;
      }
      el.innerHTML = data.map(ct => {
        const initials = ct.name ? ct.name.trim().split(/\s+/).map(w => w[0]).slice(0,2).join('').toUpperCase() : '?';
        return `<div class="z-contact-row" data-id="${ct.id}" style="cursor:pointer">
          <div class="z-contact-avatar">${initials}</div>
          <div class="z-contact-info">
            <div class="z-contact-name">${ct.name || ''}${ct.is_primary ? '<span style="font-size:10px;font-weight:700;color:#3b82f6;background:#eff6ff;padding:1px 7px;border-radius:20px;margin-left:8px;">Principale</span>' : ''}</div>
            ${ct.role ? `<div class="z-contact-role">${ct.role}</div>` : ''}
            <div class="z-contact-links">
              ${ct.email ? `<a href="mailto:${ct.email}" class="z-contact-link"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"/></svg>${ct.email}</a>` : ''}
              ${ct.phone ? `<a href="tel:${ct.phone}" class="z-contact-link"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 6z"/></svg>${ct.phone}</a>` : ''}
            </div>
          </div>
          <button class="btn btn-ghost btn-xs text-danger" style="margin-left:auto;padding:6px;opacity:0.6;background:none;border:none;cursor:pointer;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6" onclick="window.deleteContact(event, '${ct.id}')" title="Elimina">
            <span style="font-size:16px;line-height:1;">🗑️</span>
          </button>
        </div>`;
      }).join('');
      el.querySelectorAll('.z-contact-row').forEach(row => {
        row.addEventListener('click', () => {
          const ct = data.find(c => c.id === row.dataset.id);
          if (!ct) return;
          window._editingContactId = ct.id;
          $('fc-name').value = ct.name || '';
          $('fc-role').value = ct.role || '';
          $('fc-email').value = ct.email || '';
          $('fc-phone').value = ct.phone || '';
          const titleEl = document.querySelector('#modal-add-contact .modal-title');
          if (titleEl) titleEl.textContent = 'Modifica contatto';
          $('modal-add-contact').classList.add('open');
        });
      });
      _renderSidebarContacts(data);
    } catch {
      el.innerHTML = `<div style="padding:20px;color:var(--gray-500);font-size:13px;">Errore nel caricamento contatti.</div>`;
    }
  }

  function _renderSidebarContacts(data) {
    const el = $('sidebar-quick-contacts');
    if (!el) return;
    if (!data.length) { el.innerHTML = ''; return; }
    const shown = data.slice(0, 3);
    el.innerHTML = `
      <div class="z-sidebar-quick">
        <div class="z-sidebar-quick-title">Contatti</div>
        ${shown.map(ct => `
          <div class="z-qc-card" data-id="${ct.id}" style="cursor:pointer">
            <div class="z-qc-name">${ct.name || ''}</div>
            ${ct.role ? `<div class="z-qc-role">${ct.role}</div>` : ''}
            <div class="z-qc-links">
              ${ct.email ? `<a href="mailto:${ct.email}" class="z-qc-link" onclick="event.stopPropagation()"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"/></svg>${ct.email}</a>` : ''}
              ${ct.phone ? `<a href="tel:${ct.phone}" class="z-qc-link" onclick="event.stopPropagation()"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 6z"/></svg>${ct.phone}</a>` : ''}
            </div>
          </div>`).join('')}
      </div>`;

    el.querySelectorAll('.z-qc-card').forEach(row => {
      row.addEventListener('click', () => {
        const ct = data.find(c => c.id === row.dataset.id);
        if (!ct) return;
        window._editingContactId = ct.id;
        $('fc-name').value = ct.name || '';
        $('fc-role').value = ct.role || '';
        $('fc-email').value = ct.email || '';
        $('fc-phone').value = ct.phone || '';
        const titleEl = document.querySelector('#modal-add-contact .modal-title');
        if (titleEl) titleEl.textContent = 'Modifica contatto';
        $('modal-add-contact').classList.add('open');
      });
    });
  }

  /* ── ③ Services ─────────────────────────────────────────────── */
  async function loadServices() {
    const el = $('cd-services-list');
    if (!el) return;
    el.innerHTML = UI.skeletonCardList(2);
    try {
      const res  = await API.Clients.services(clientId);
      const data = Array.isArray(res) ? res : (res?.data || res?.items || []);
      const chip = $('badge-service');
      if (chip) chip.textContent = data.length;
      const kpi = $('chip-services-kpi');
      if (kpi) kpi.textContent = data.length;
      if (!data.length) {
        el.innerHTML = `<div class="list-card">${UI.createEmptyState(null, I18n.t('cl.no_services') || 'Nessun servizio attivo.')}</div>`;
        return;
      }
      el.innerHTML = `<table class="z-rel-table">
        <thead><tr>
          <th>Servizio</th><th>Ciclo</th><th>Data Inizio</th><th>Stato</th><th></th>
        </tr></thead>
        <tbody>${data.map(s => `<tr class="hover-row" style="cursor:pointer;" onclick="location.href='admin_services.html?id=${s.id}'">
          <td class="z-rt-name">${s.services_catalog?.name || s.service_name || s.name || 'Servizio'}</td>
          <td class="z-rt-date">${s.services_catalog?.billing_cycle || s.billing_cycle || '-'}</td>
          <td class="z-rt-date">${s.start_date ? UI.date(s.start_date) : '-'}</td>
          <td>${UI.pill(s.status)}</td>
          <td>
            <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;">
              <button class="btn btn-ghost btn-xs text-primary" style="padding:4px;opacity:0.6;background:none;border:none;cursor:pointer;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6" onclick="event.stopPropagation(); window.duplicateService(event, '${s.id}')" title="Duplica">
                <span style="font-size:16px;line-height:1;">📄</span>
              </button>
              <button class="btn btn-ghost btn-xs text-danger" style="padding:4px;opacity:0.6;background:none;border:none;cursor:pointer;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6" onclick="event.stopPropagation(); window.deleteService(event, '${s.id}')" title="Elimina">
                <span style="font-size:16px;line-height:1;">🗑️</span>
              </button>
            </div>
          </td>
        </tr>`).join('')}</tbody>
      </table>`;
    } catch {
      el.innerHTML = `<div class="list-card">${UI.createEmptyState(null, I18n.t('error.generic') || 'Errore.')}</div>`;
    }
  }

  /* ── ④ Contracts ────────────────────────────────────────────── */
  async function loadContracts() {
    const el = $('cd-contracts-list');
    if (!el) return;
    el.innerHTML = UI.skeletonCardList(2);
    try {
      const res  = await API.Clients.contracts(clientId);
      const data = Array.isArray(res) ? res : (res?.data || res?.items || []);
      const active = data.filter(c => ['active','signed'].includes(c.status)).length;
      const chip = $('badge-contract');
      if (chip) chip.textContent = active;
      const kpi = $('chip-contracts-kpi');
      if (kpi) kpi.textContent = active;
      if (!data.length) {
        el.innerHTML = `<div class="list-card">${UI.createEmptyState(null, I18n.t('cl.no_contracts') || 'Nessun contratto.')}</div>`;
        return;
      }
      el.innerHTML = `<table class="z-rel-table">
        <thead><tr>
          <th>Titolo Contratto</th><th>Creato</th><th>Scadenza</th><th>Stato</th><th></th>
        </tr></thead>
        <tbody>${data.map(c => {
          let warnObj = "";
          let renewLbl = "";
          if (c.auto_renewal === 'monthly') renewLbl = " 🔁 Mensile";
          else if (c.auto_renewal === 'yearly') renewLbl = " 🔁 Annuale";
          const dTo = c.valid_to || c.expires_at;
          if (dTo && !['draft', 'archived', 'error'].includes(c.status)) {
             const now = new Date();
             const vTo = new Date(dTo);
             const future = new Date(); future.setDate(future.getDate() + 30);
             if (vTo < now) {
               warnObj = `<div style="color:#dc2626; font-size:10px; margin-top:2px; font-weight:600;">${renewLbl ? "Da Rinnovare" + renewLbl : "Scaduto"}</div>`;
             } else if (vTo <= future) {
               warnObj = `<div style="color:#d97706; font-size:10px; margin-top:2px; font-weight:600;">In scadenza${renewLbl}</div>`;
             } else if (renewLbl) {
               warnObj = `<div style="color:var(--brand-600); font-size:10px; margin-top:2px; font-weight:600;">Rinnovo${renewLbl.replace(' 🔁','')} 🔁</div>`;
             }
           }
          const retUrl = encodeURIComponent(window.location.href);
          return `<tr class="hover-row" style="cursor:pointer;" onclick="location.href='admin_contracts.html?id=${c.id}&returnUrl=${retUrl}'">
          <td class="z-rt-name">${c.title || I18n.t('nav.contracts') || 'Contratto'}</td>
          <td class="z-rt-date">${c.created_at ? UI.date(c.created_at) : '-'}</td>
          <td class="z-rt-date">${dTo ? UI.date(dTo) : '-'}${warnObj}</td>
          <td>${UI.pill(c.status)}</td>
              ${(c.pdf_url || c.status === 'signed') ? `
              <button class="btn btn-ghost btn-xs text-primary" style="padding:4px;" onclick="window.downloadContractPDF(event, '${c.id}', false)" title="Visualizza PDF">
                <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:16px;height:16px;"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"></path><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"></path></svg>
              </button>` : ''}
              ${c.status !== 'draft' ? `<button class="btn btn-ghost btn-xs" style="padding:4px;color:var(--brand-600);" onclick="event.stopPropagation(); window.triggerUploadExistingContract('${c.id}')" title="Allega PDF firmato manualmente (sovrascrive o aggiunge PDF)">📎</button>` : ''}
              <button class="btn btn-ghost btn-xs text-danger" style="padding:4px;opacity:0.6;background:none;border:none;cursor:pointer;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6" onclick="event.stopPropagation(); window.deleteContract(event, '${c.id}')" title="Elimina">
                <span style="font-size:16px;line-height:1;">🗑️</span>
              </button>
        </tr>`}).join('')}</tbody>
      </table>`;
    } catch {
      el.innerHTML = `<div class="list-card">${UI.createEmptyState(null, I18n.t('error.generic') || 'Errore.')}</div>`;
    }
  }

  /* ── ⑤ Documents ────────────────────────────────────────────── */
  window.downloadContractPDF = async (event, id, forceDownload=false) => {
    event.stopPropagation();
    const btn = event.currentTarget;
    const txt = btn.innerHTML;
    btn.innerHTML = '...';
    btn.disabled = true;

    // Open synchronously to avoid browser popup blockers for Visualizza
    let newWin = null;
    if (!forceDownload) {
      newWin = window.open('about:blank', '_blank');
    }

    try {
      const res = await API.get(`/contracts/${id}/download-url`);
      if (res && res.url) {
        if (forceDownload) {
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = res.url;
          a.download = 'contratto.pdf';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } else {
          newWin.location.href = res.url;
        }
      } else {
        if (newWin) newWin.close();
        throw new Error('URL non valido');
      }
    } catch(e) {
      if (newWin) newWin.close();
      UI.toast('Impossibile scaricare il contratto', 'error');
    } finally {
      btn.innerHTML = txt;
      btn.disabled = false;
    }
  };

  window.downloadDocument = async (event, id, forceDownload=false) => {
    event.stopPropagation();
    const btn = event.currentTarget;
    const txt = btn.innerHTML;
    btn.innerHTML = '...';
    btn.disabled = true;
    
    // Open synchronously to avoid browser popup blockers for Visualizza
    let newWin = null;
    if (!forceDownload) {
      newWin = window.open('about:blank', '_blank');
    }

    try {
      const res = await API.Documents.download(id);
      if (res && res.url) {
        if (forceDownload) {
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = res.url;
          a.download = 'documento.pdf';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } else {
          newWin.location.href = res.url;
        }
      } else {
        if (newWin) newWin.close();
        throw new Error('URL non valido');
      }
    } catch(e) {
      if (newWin) newWin.close();
      UI.toast('Impossibile scaricare il documento', 'error');
    } finally {
      btn.innerHTML = txt;
      btn.disabled = false;
    }
  };

  async function loadDocuments() {
    const el = $('cd-docs-list');
    if (!el) return;
    el.innerHTML = UI.skeletonCardList(2);
    try {
      const res  = await API.Clients.documents(clientId);
      const data = Array.isArray(res) ? res : (res?.data || res?.items || []);
      const chip = $('badge-doc');
      if (chip) chip.textContent = data.length;
      if (!data.length) {
        el.innerHTML = `<div class="list-card">${UI.createEmptyState(null, I18n.t('cl.no_docs') || 'Nessun documento.')}</div>`;
        return;
      }
      el.innerHTML = data.map(d => `
        <div class="list-card">
          <div class="list-card-header">
            <div style="display:flex;align-items:center;gap:12px;">
              <div class="list-card-title">${d.name || d.filename || 'Documento'}</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <button class="btn btn-ghost btn-xs text-primary" style="padding:4px;" onclick="window.downloadDocument(event, '${d.id}', false)" title="Visualizza">
                <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:16px;height:16px;"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"></path><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"></path></svg>
              </button>
              <button class="btn btn-ghost btn-xs" style="padding:4px;" onclick="window.downloadDocument(event, '${d.id}', true)" title="Scarica">
                <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:16px;height:16px;"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"></path></svg>
              </button>
              <button class="btn btn-ghost btn-xs text-danger" style="padding:4px;opacity:0.6;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6" onclick="window.deleteDocument(event, '${d.id}')" title="Elimina">
                <span style="font-size:16px;line-height:1;">🗑️</span>
              </button>
            </div>
          </div>
          <div class="list-card-body">
            ${d.size ? `<div class="list-card-meta">${Math.round(d.size/1000)} KB</div>` : ''}
            <div class="list-card-meta">${UI.date(d.created_at || d.uploaded)}</div>
          </div>
        </div>`).join('');
    } catch {
      el.innerHTML = `<div class="list-card">${UI.createEmptyState(null, I18n.t('error.generic') || 'Errore.')}</div>`;
    }
  }

  /* ── ⑤.1 Quotes (Preventivi) ────────────────────────────────── */
  async function loadQuotes() {
    const el = $('cd-quotes-list');
    if (!el) return;
    el.innerHTML = UI.skeletonCardList(2);
    try {
      const res  = await API.Clients.quotes(clientId);
      const data = Array.isArray(res) ? res : (res?.data || res?.items || []);
      const chip = $('badge-quote');
      if (chip) chip.textContent = data.length;
      if (!data.length) {
        el.innerHTML = `<div class="list-card">${UI.createEmptyState(null, I18n.t('cl.no_quotes') || 'Nessun preventivo.')}</div>`;
        return;
      }
      el.innerHTML = `<table class="z-rel-table">
        <thead><tr>
          <th>Titolo</th><th>Data</th><th>Importo</th><th>Stato</th><th></th>
        </tr></thead>
        <tbody>${data.map(q => `<tr class="hover-row" style="cursor:pointer;" onclick="location.href='admin_quotes.html?id=${q.id}'">
          <td class="z-rt-name">${q.title || q.quote_number || q.number || 'Preventivo'}</td>
          <td class="z-rt-date">${q.created_at ? UI.date(q.created_at) : ''}</td>
          <td class="z-rt-amt">${UI.currency(q.total_amount || q.total || 0, q.currency)}</td>
          <td>${UI.pill(q.status)}</td>
          <td>
            <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;">
              <button class="btn btn-ghost btn-xs text-primary" style="padding:4px;opacity:0.6;background:none;border:none;cursor:pointer;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6" onclick="event.stopPropagation(); window.duplicateQuote(event, '${q.id}')" title="Duplica">
                <span style="font-size:16px;line-height:1;">📄</span>
              </button>
              <button class="btn btn-ghost btn-xs text-danger" style="padding:4px;opacity:0.6;background:none;border:none;cursor:pointer;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6" onclick="event.stopPropagation(); window.deleteQuote(event, '${q.id}')" title="Elimina">
                <span style="font-size:16px;line-height:1;">🗑️</span>
              </button>
            </div>
          </td>
        </tr>`).join('')}</tbody>
      </table>`;
    } catch {
      el.innerHTML = `<div class="list-card">${UI.createEmptyState(null, I18n.t('error.generic') || 'Errore.')}</div>`;
    }
  }

  /* ── ⑥ Invoices ─────────────────────────────────────────────── */
  async function loadInvoices() {
    const el = $('cd-invoices-list');
    if (!el) return;
    el.innerHTML = UI.skeletonCardList(2);
    try {
      const res  = await API.Clients.invoices(clientId);
      const data = Array.isArray(res) ? res : (res?.data || res?.items || []);
      const open = data.filter(i => !['paid','cancelled'].includes(i.status)).length;
      const chip = $('badge-invoice');
      if (chip) chip.textContent = open;
      const kpi = $('chip-invoices-kpi');
      if (kpi) kpi.textContent = open;
      if (!data.length) {
        el.innerHTML = `<div class="list-card">${UI.createEmptyState(null, I18n.t('cl.no_invoices') || 'Nessuna fattura.')}</div>`;
        return;
      }
      el.innerHTML = `<table class="z-rel-table">
        <thead><tr>
          <th>N° Fattura</th><th>Data</th><th>Scadenza</th><th>Importo</th><th>Stato</th><th></th>
        </tr></thead>
        <tbody>${data.map(i => `<tr class="hover-row" style="cursor:pointer;" onclick="location.href='admin_invoices.html?id=${i.id}'">
          <td class="z-rt-name">${i.invoice_number || i.number || ''}</td>
          <td class="z-rt-date">${i.issue_date ? UI.date(i.issue_date) : ''}</td>
          <td class="z-rt-date">${i.due_date ? UI.date(i.due_date) : ''}</td>
          <td class="z-rt-amt">${UI.currency(i.total_amount || i.total, i.currency)}</td>
          <td>
            <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;">
              ${UI.pill(i.status)}
              <button class="btn btn-ghost btn-xs text-primary" style="padding:4px;opacity:0.6;background:none;border:none;cursor:pointer;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6" onclick="event.stopPropagation(); window.duplicateInvoice(event, '${i.id}')" title="Duplica">
                <span style="font-size:16px;line-height:1;">📄</span>
              </button>
              <button class="btn btn-ghost btn-xs text-danger" style="padding:4px;opacity:0.6;background:none;border:none;cursor:pointer;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6" onclick="event.stopPropagation(); window.deleteInvoice(event, '${i.id}')" title="Elimina">
                <span style="font-size:16px;line-height:1;">🗑️</span>
              </button>
            </div>
          </td>
        </tr>`).join('')}</tbody>
      </table>`;
    } catch {
      el.innerHTML = `<div class="list-card">${UI.createEmptyState(null, I18n.t('error.generic') || 'Errore.')}</div>`;
    }
  }

  /* ── ⑦ Renewals ─────────────────────────────────────────────── */
  async function loadRenewals() {
    const el = $('cd-renewals-list');
    if (!el) return;
    el.innerHTML = UI.skeletonCardList(2);
    try {
      const endpoint = API.Clients.renewals ?? API.Renewals?.listByClient;
      const res  = endpoint ? await endpoint(clientId) : [];
      const data = Array.isArray(res) ? res : (res?.data || res?.items || []);
      const chip = $('chip-renewals');
      if (chip) chip.textContent = data.length;
      const kpi = $('chip-renewals-kpi');
      if (kpi) kpi.textContent = data.length;
      if (!data.length) {
        el.innerHTML = `<div class="list-card">${UI.createEmptyState(null, I18n.t('cl.no_renewals') || 'Nessun rinnovo.')}</div>`;
        return;
      }
      el.innerHTML = data.map(r => `
        <div class="list-card">
          <div class="list-card-header">
            <div class="list-card-title">${r.service_name || r.name || 0}</div>
            ${UI.pill(r.status)}
          </div>
          <div class="list-card-body">
            <div class="list-card-meta">${I18n.t('cl.expires_at') || 'Scadenza'}: ${UI.date(r.renewal_date || r.expires_at)}</div>
            ${r.amount ? `<div class="list-card-meta">${UI.currency(r.amount, r.currency)}</div>` : ''}
          </div>
        </div>`).join('');
    } catch {
      el.innerHTML = `<div class="list-card">${UI.createEmptyState(null, I18n.t('error.generic') || 'Errore.')}</div>`;
    }
  }

  /* ── ⑧ Windoc Sync ──────────────────────────────────────────── */
  async function loadWindoc() {
    const body = $('cd-windoc-body');
    if (!body) return;
    body.innerHTML = `<div class="skeleton-text skeleton" style="height:120px;border-radius:8px;"></div>`;

    try {
      // Try to get windoc status from client data or dedicated endpoint
      let info = null;
      if (API.Clients.windocStatus) {
        info = await API.Clients.windocStatus(clientId);
      }
      if (!info && CLIENT) {
        info = {
          windoc_id:       CLIENT.windoc_id,
          windoc_status:   CLIENT.windoc_sync_at ? 'synced' : 'not_configured',
          windoc_last_sent: CLIENT.windoc_sync_at,
        };
      }

      const windocId   = info?.windoc_id;
      const status     = info?.windoc_status || (windocId ? 'synced' : 'not_configured');
      const lastSent   = info?.windoc_last_sent || info?.last_sent;

      const statusColor = status === 'synced' ? 'success' : status === 'error' ? 'danger' : 'gray';
      const statusLabel = {
        synced:          I18n.t('cl.windoc_synced')    || 'Sincronizzato',
        pending:         I18n.t('cl.windoc_pending')   || 'In attesa',
        error:           I18n.t('cl.windoc_error')     || 'Errore sync',
        not_configured:  I18n.t('cl.windoc_not_cfg')   || 'Non configurato',
      }[status] || status;

      body.innerHTML = `
        <div class="info-grid" style="gap:16px;margin-bottom:20px;">
          <div class="info-field">
            <div class="info-label">${I18n.t('cl.windoc_id') || 'Windoc ID'}</div>
            <div class="info-val" style="font-family:monospace;font-size:13px;">${windocId || ''}</div>
          </div>
          <div class="info-field">
            <div class="info-label">${I18n.t('cl.windoc_status_label') || 'Stato sync'}</div>
            <div class="info-val" style="color:var(--color-${statusColor});font-weight:600;">${statusLabel}</div>
          </div>
          <div class="info-field">
            <div class="info-label">${I18n.t('cl.windoc_last_sent') || 'Ultimo invio'}</div>
            <div class="info-val">${lastSent ? UI.date(lastSent) : ''}</div>
          </div>
          <div class="info-field">
            <div class="info-label">${I18n.t('cl.windoc_anag') || 'Sync anagrafica'}</div>
            <div class="info-val">${info?.anag_synced ? (I18n.t('common.yes') || 'Sì') : (I18n.t('common.no') || 'No')}</div>
          </div>
        </div>
        ${!windocId ? `
          <div style="background:var(--gray-50);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;font-size:13px;color:var(--gray-600);">
            <strong style="color:var(--gray-800);">${I18n.t('cl.windoc_setup_title') || 'Configurazione Windoc'}</strong><br/>
            ${I18n.t('cl.windoc_setup_desc') || 'Inserire il Windoc ID nelle impostazioni di sincronizzazione per abilitare il trasferimento dati.'}
          </div>` : `
          <div id="cd-windoc-edit" style="display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;">
            <div class="form-group" style="flex:1;min-width:180px;margin:0;">
              <label class="form-label">${I18n.t('cl.windoc_id') || 'Windoc ID'}</label>
              <input class="form-input" id="windoc-id-input" type="text" value="${windocId || ''}" placeholder="WD-XXXXX"/>
            </div>
            <button class="btn btn-secondary btn-sm" id="cd-btn-windoc-save">${I18n.t('cl.windoc_save_id') || 'Aggiorna ID'}</button>
          </div>`}`;

      // Bind save ID
      $('cd-btn-windoc-save')?.addEventListener('click', async () => {
        const val = $('windoc-id-input')?.value?.trim();
        if (!val) return;
        try {
          await API.Clients.update(clientId, { windoc_id: val });
          CLIENT.windoc_id = val;
          UI.toast(I18n.t('cl.windoc_id_saved') || 'Windoc ID aggiornato', 'success');
        } catch (e) { UI.toast(e.message, 'error'); }
      });

    } catch (e) {
      body.innerHTML = `<div style="color:var(--color-danger);font-size:13px;">${I18n.t('error.generic') || 'Errore nel caricamento stato Windoc.'}</div>`;
    }
  }

  /* ── ⑨ Storico Attività ──────────────────────────────────────── */
  async function loadStorico() {
    if (window.ActivityTimeline) {
      await ActivityTimeline.init({
        entityType:  'client',
        entityId:    clientId,
        containerId: 'timeline-feed-container',
      });
    } else {
      console.warn('[Storico] ActivityTimeline not loaded');
      const fc = $('timeline-feed-container');
      if (fc) fc.innerHTML = '<p style="color:red;font-size:13px;">Impossibile isolare la timeline. Componente mancante.</p>';
    }
  }

  /* ── Timeline Note Compose ──────────────────────────────────── */
  window.saveTimelineNote = async () => {
    const input = $('timeline-note-body');
    const content = input?.value.trim();
    if (!content) return;
    try {
       await window.API.post(`/clients/${clientId}/notes`, { content });
       window.UI.toast('Aggiornamento registrato', 'success');
       input.value = '';
       // Ricarica sia le note di base che la timeline se è già attiva
       loadNotes();
       if (loaded['storico']) loadStorico();
    } catch(e) {
       window.UI.toast(e.message || 'Errore salvataggio nota', 'error');
    }
  };

  /* ── Windoc action buttons ──────────────────────────────────── */
  $('cd-btn-windoc-sync')?.addEventListener('click', async () => {
    try {
      UI.toast(I18n.t('cl.windoc_syncing') || 'Sincronizzazione in corso…', 'info');
      await API.post(`/clients/${clientId}/sync-windoc`);
      UI.toast(I18n.t('cl.windoc_synced_ok') || 'Sincronizzazione completata', 'success');
      loadWindoc();
    } catch (e) {
      UI.toast(e?.code === 'not_found'
        ? (I18n.t('cl.windoc_no_credentials') || 'Credenziali Windoc non configurate')
        : (I18n.t('cl.windoc_sync_error') || 'Errore durante la sync'),
        'error');
    }
  });

  $('cd-btn-windoc-verify')?.addEventListener('click', async () => {
    // /verify-windoc non è implementato nel backend usa sync-windoc per aggiornare
    UI.toast(I18n.t('cl.windoc_use_sync') || 'Usa il pulsante Sincronizza per aggiornare i dati Windoc.', 'info');
  });

  /* ── Add Service Modal ──────────────────────────────────────── */
  $('cd-btn-add-service')?.addEventListener('click', async () => {
    const sel = $('f-service-id');
    const modal = $('modal-add-service');
    sel.innerHTML = `<option>${I18n.t('common.loading') || 'Caricamento…'}</option>`;
    modal?.classList.add('open');
    try {
      const res  = await API.Services.catalog(true);
      const data = Array.isArray(res) ? res : (res?.data || res?.items || []);
      sel.innerHTML = `<option value="">${I18n.t('cl.select_service') || 'Seleziona servizio'}</option>` +
        data.map(s => `<option value="${s.id}">${s.name} (${UI.currency(s.price_monthly, s.currency)}/mo)</option>`).join('');
      $('f-service-start').value = new Date().toISOString().split('T')[0];
    } catch { sel.innerHTML = `<option value="">${I18n.t('error.generic') || 'Errore'}</option>`; }
  });

  $('modal-service-save')?.addEventListener('click', async () => {
    const sId  = $('f-service-id')?.value;
    if (!sId) { UI.toast(I18n.t('cl.select_service') || 'Seleziona un servizio', 'warning'); return; }
    try {
      await API.Services.subscribe({ client_id: clientId, service_id: sId, billing_cycle: $('f-service-cycle')?.value || 'monthly', start_date: $('f-service-start')?.value || null });
      $('modal-add-service').classList.remove('open');
      UI.toast(I18n.t('cl.service_added') || 'Servizio aggiunto', 'success');
      loadServices();
    } catch (e) { UI.toast(e.message || I18n.t('error.generic'), 'error'); }
  });

  /* ── Add Contact Modal ──────────────────────────────────────── */
  $('cd-btn-add-contact')?.addEventListener('click', () => {
    window._editingContactId = null;
    $('fc-name').value = '';
    $('fc-role').value = '';
    $('fc-email').value = '';
    $('fc-phone').value = '';
    const titleEl = document.querySelector('#modal-add-contact .modal-title');
    if (titleEl) titleEl.textContent = 'Aggiungi contatto';
    $('modal-add-contact')?.classList.add('open');
  });

  $('modal-contact-save')?.addEventListener('click', async () => {
    const name = $('fc-name')?.value?.trim();
    if (!name) { UI.toast(I18n.t('cl.form_required') || 'Nome obbligatorio', 'warning'); return; }
    try {
      const body = {
        name, role: $('fc-role')?.value?.trim() || "",
        email: $('fc-email')?.value?.trim() || null,
        phone: $('fc-phone')?.value?.trim() || null,
      };
      if (window._editingContactId) {
        await API.Clients.updateContact?.(clientId, window._editingContactId, body);
        UI.toast('Contatto aggiornato', 'success');
      } else {
        await API.Clients.addContact?.(clientId, body);
        UI.toast(I18n.t('cl.contact_added') || 'Contatto aggiunto', 'success');
      }
      $('modal-add-contact').classList.remove('open');
      loadContacts();
    } catch (e) { UI.toast(e.message || I18n.t('error.generic'), 'error'); }
  });



  /* ── Add Quote Modal ────────────────────────────────────────── */
  $('cd-btn-new-quote')?.addEventListener('click', () => {
    $('modal-add-quote')?.classList.add('open');
  });

  $('modal-quote-save')?.addEventListener('click', async () => {
    const title = $('fq-title')?.value?.trim();
    if (!title) { UI.toast(I18n.t('cl.form_required') || 'Titolo obbligatorio', 'warning'); return; }
    
    const amount = parseFloat($('fq-amount')?.value) || 0;
    
    const body = {
      client_id: clientId,
      title: title,
      lines: [
        { description: 'Prestazione', quantity: 1, unit_price: amount, vat_rate: 22 }
      ]
    };
    
    try {
      const btn = $('modal-quote-save'); if(btn) btn.disabled = true;
      await API.post('/quotes/', body);
      $('modal-add-quote').classList.remove('open');
      UI.toast('Preventivo creato', 'success');
      loadQuotes();
    } catch (e) {
      UI.toast(e.message || 'Errore durante la creazione del preventivo', 'error');
    } finally {
      const btn = $('modal-quote-save'); if(btn) btn.disabled = false;
    }
  });

  /* ── Add Activity Modal ─────────────────────────────────────── */
  $('cd-btn-add-activity')?.addEventListener('click', () => {
    $('modal-add-activity')?.classList.add('open');
  });

  $('modal-activity-save')?.addEventListener('click', async () => {
    const type = $('fa-type')?.value;
    const desc = $('fa-desc')?.value?.trim();
    if (!desc) { UI.toast('Descrizione obbligatoria', 'warning'); return; }

    const body = {
      client_id: clientId,
      type: type,
      description: desc,
      activity_date: new Date().toISOString()
    };

    try {
      const btn = $('modal-activity-save'); if(btn) btn.disabled = true;
      await API.post(`/clients/${clientId}/activity`, body);
      $('modal-add-activity').classList.remove('open');
      UI.toast('Attività aggiunta', 'success');
      if (typeof loadActivities === 'function') loadActivities();
      else if (typeof window.ActivityTimeline === 'object') window.ActivityTimeline.load(clientId);
    } catch (e) {
      UI.toast(e.message || 'Errore', 'error');
    } finally {
      const btn = $('modal-activity-save'); if(btn) btn.disabled = false;
    }
  });

  /* ── Contract Modal (Upload Signed) ─────────────────────────── */
  $('cd-btn-add-contract')?.addEventListener('click', () => {
    $('modal-upload-contract')?.classList.add('open');
  });

  $('modal-contract-upload-save')?.addEventListener('click', async () => {
    const title = $('fuc-title')?.value?.trim();
    const fileInput = $('fuc-file');
    const file = fileInput?.files?.[0];

    if (!title) { UI.toast('Titolo contratto obbligatorio', 'warning'); return; }
    if (!file) { UI.toast('Seleziona un file PDF', 'warning'); return; }

    const fd = new FormData();
    fd.append('title', title);
    fd.append('client_id', clientId);
    fd.append('file', file);

    try {
      const btn = $('modal-contract-upload-save'); if(btn) btn.disabled = true;
      UI.toast('Caricamento in corso...', 'info');
      await API.Contracts.uploadSigned(fd);
      $('modal-upload-contract').classList.remove('open');
      UI.toast('Contratto caricato con successo', 'success');
      $('fuc-title').value = '';
      if(fileInput) fileInput.value = '';
      if (typeof loadContracts === 'function') loadContracts();
    } catch (e) {
      UI.toast(e.message || 'Errore durante il caricamento del contratto', 'error');
    } finally {
      const btn = $('modal-contract-upload-save'); if(btn) btn.disabled = false;
    }
  });

  /* ── Document Modal (Upload Generic Document) ───────────────── */
  $('cd-btn-add-doc')?.addEventListener('click', () => {
    $('modal-upload-document')?.classList.add('open');
  });

  $('modal-document-upload-save')?.addEventListener('click', async () => {
    const title = $('fud-title')?.value?.trim();
    const docType = $('fud-type')?.value?.trim() || 'other';
    const fileInput = $('fud-file');
    const file = fileInput?.files?.[0];

    if (!file) { UI.toast('Seleziona un file da caricare', 'warning'); return; }

    const fd = new FormData();
    fd.append('file', file);
    fd.append('client_id', clientId);
    if (docType) fd.append('doc_type', docType);
    if (title) fd.append('name', title);
    else fd.append('name', file.name || 'Documento');

    try {
      const btn = $('modal-document-upload-save'); if(btn) btn.disabled = true;
      UI.toast('Caricamento in corso...', 'info');
      await window.API.Documents.upload(fd);
      $('modal-upload-document').classList.remove('open');
      UI.toast('Documento caricato con successo', 'success');
      
      $('fud-title').value = '';
      if(fileInput) fileInput.value = '';
      
      if (typeof loadDocuments === 'function') loadDocuments();
      if (typeof window.ActivityTimeline === 'object') {
        window.ActivityTimeline.init({
          entityType: 'client',
          entityId: clientId,
          containerId: 'timeline-mnt'
        });
      }
    } catch (e) {
      UI.toast(e.message || 'Errore durante il caricamento del documento', 'error');
    } finally {
      const btn = $('modal-document-upload-save'); if(btn) btn.disabled = false;
    }
  });

  /* ── Line-level Deletions ───────────────────────────────────── */
  window.deleteContact = async (event, id) => {
    event.stopPropagation();
    if (!confirm(I18n.t('cl.confirm_delete_contact') || 'Eliminare il contatto?')) return;
    try { await window.API.del(`/clients/${clientId}/contacts/${id}`); UI.toast('Contatto eliminato', 'success'); loadContacts(); }
    catch(e) { UI.toast(e.message, 'error'); }
  };
  window.deleteService = async (event, id) => {
    event.stopPropagation();
    if (!confirm('Eliminare il servizio/abbonamento?')) return;
    try { await window.API.del(`/services/subscriptions/${id}`); UI.toast('Servizio eliminato', 'success'); loadServices(); }
    catch(e) { UI.toast(e.message, 'error'); }
  };
  window.deleteContract = async (event, id) => {
    event.stopPropagation();
    if (!confirm('Eliminare logicamente il contratto?')) return;
    try { await window.API.del(`/contracts/${id}`); UI.toast('Contratto eliminato', 'success'); loadContracts(); }
    catch(e) { UI.toast(e.message, 'error'); }
  };
  window.deleteDocument = async (event, id) => {
    event.stopPropagation();
    if (!confirm('Eliminare il documento definitivamente?')) return;
    try { await window.API.del(`/documents/${id}`); UI.toast('Documento eliminato', 'success'); loadDocuments(); }
    catch(e) { UI.toast(e.message, 'error'); }
  };
  window.deleteQuote = async (event, id) => {
    event.stopPropagation();
    if (!confirm('Eliminare il preventivo?')) return;
    try { await window.API.del(`/quotes/${id}`); UI.toast('Preventivo eliminato', 'success'); loadQuotes(); }
    catch(e) { UI.toast(e.message, 'error'); }
  };
  window.deleteInvoice = async (event, id) => {
    event.stopPropagation();
    if (!confirm('Eliminare la fattura?')) return;
    try { await window.API.del(`/invoices/${id}`); UI.toast('Fattura eliminata', 'success'); loadInvoices(); }
    catch(e) { UI.toast(e.message, 'error'); }
  };

  window.duplicateService = async (event, id) => {
    event.stopPropagation();
    try { await window.API.post(`/services/subscriptions/${id}/duplicate`, {}); UI.toast('Servizio duplicato', 'success'); loadServices(); }
    catch(e) { UI.toast(e.message, 'error'); }
  };
  window.duplicateContract = async (event, id) => {
    event.stopPropagation();
    try { await window.API.post(`/contracts/${id}/duplicate`, {}); UI.toast('Contratto duplicato', 'success'); loadContracts(); }
    catch(e) { UI.toast(e.message, 'error'); }
  };
  window.duplicateQuote = async (event, id) => {
    event.stopPropagation();
    try { await window.API.post(`/quotes/${id}/duplicate`, {}); UI.toast('Preventivo duplicato', 'success'); loadQuotes(); }
    catch(e) { UI.toast(e.message, 'error'); }
  };
  window.duplicateInvoice = async (event, id) => {
    event.stopPropagation();
    try { await window.API.post(`/invoices/${id}/duplicate`, {}); UI.toast('Fattura duplicata', 'success'); loadInvoices(); }
    catch(e) { UI.toast(e.message, 'error'); }
  };

  /* ── Legacy Notes/Calls Handlers ──────────────────────────────────────────────────────── */
  async function loadNotes() {
    const list = $('notes-list-container');
    if (!list) return;
    list.innerHTML = '<p style="color:var(--gray-400);font-size:13px;">Caricamento note...</p>';
    try {
      const notes = await API.get(`/clients/${clientId}/notes`); 
      if (!notes || notes.length === 0) {
        list.innerHTML = '<p style="color:var(--gray-500);font-size:13px;font-style:italic;">Nessuna nota presente.</p>';
        return;
      }
      
      list.innerHTML = notes.map(n => `
        <div class="list-card" style="margin-bottom:12px;padding:16px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
            <div style="font-size:12px;color:var(--gray-500);font-weight:600;">${n.created_by_name || 'Autore sconosciuto'}</div>
            <div style="display:flex;align-items:center;gap:12px;">
              <div style="font-size:11px;color:var(--gray-400);">${UI.date(n.created_at)}</div>
              ${CLIENT && window.User && (window.User.is_admin || false) ? `<button class="btn btn-ghost btn-xs text-danger" onclick="deleteNote('${n.id}')">Elimina</button>` : ''}
            </div>
          </div>
          <div style="font-size:14px;color:var(--gray-800);white-space:pre-wrap;line-height:1.5;">${n.content}</div>
        </div>
      `).join('');
    } catch (e) {
      console.error('Failed to load notes', e);
      list.innerHTML = '<p style="color:var(--danger);font-size:13px;">Errore nel caricamento delle note.</p>';
    }
  }

  window.saveNote = async () => {
    const input = $('note-input');
    const content = input?.value.trim();
    if (!content) return;
    
    document.getElementById('note-save-btn').disabled = true;
    try {
       await API.post(`/clients/${clientId}/notes`, { content });
       UI.toast('Nota salvata', 'success');
       input.value = '';
       loadNotes();
    } catch(e) {
       console.error('Failed to save note', e);
       UI.toast(e.message || 'Errore salvataggio nota', 'error');
    } finally {
       document.getElementById('note-save-btn').disabled = false;
    }
  };

  window.deleteNote = async (noteId) => {
    if(!confirm('Vuoi davvero eliminare questa nota?')) return;
    try {
      await API.del(`/clients/${clientId}/notes/${noteId}`);
      UI.toast('Nota eliminata', 'success');
      loadNotes();
    } catch(e) {
       console.error('Failed to delete note', e);
       UI.toast('Errore eliminazione nota', 'error');
    }
  };


  /* ── Company switch ─────────────────────────────────────────── */
  window.addEventListener('nexusCompanyChanged', () => {
    location.href = 'admin_clients.html';
  });

  /* ── Delete Client / Status Change Danger Zone ──────────────────────────────── */
  window.changeClientStatusFromDetail = () => {
    if (!CLIENT) return;
    
    const dropdown = document.getElementById('mac-custom-statusDropdown');
    const trigger = document.getElementById('mac-dropdown-trigger');
    const triggerValue = document.getElementById('mac-dropdown-value');
    const items = document.querySelectorAll('#mac-status-list .mac-action-item');

    // Initialize state
    const currentStatus = CLIENT.status || 'active';
    
    items.forEach(item => {
      if (item.dataset.value === currentStatus) {
        item.classList.add('selected');
        triggerValue.innerHTML = item.dataset.html;
      } else {
        item.classList.remove('selected');
      }
      
      // Handle option click (Auto-save)
      item.onclick = async (e) => {
        e.stopPropagation();
        const newStatus = item.dataset.value;
        const newHtml = item.dataset.html;
        triggerValue.innerHTML = newHtml;
        
        // Update selection UI
        items.forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        dropdown.classList.remove('open');
        
        document.removeEventListener('click', window._outsideStatusClickListener);
        document.getElementById('modal-change-status').classList.remove('open');

        // Fire API call immediately
        try {
          await window.API.Clients.update(clientId, { status: newStatus });
          window.UI.toast('Stato aggiornato', 'success');
          loadClient();
        } catch (e) {
          window.UI.toast(e.message, 'error');
        }
      };
    });

    // Handle trigger click
    trigger.onclick = (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    };

    // Close dropdown on outside click
    window._outsideStatusClickListener = (e) => {
      if (dropdown && !dropdown.contains(e.target)) {
        dropdown.classList.remove('open');
      }
    };
    
    document.removeEventListener('click', window._outsideStatusClickListener);
    document.addEventListener('click', window._outsideStatusClickListener);

    document.getElementById('modal-change-status').classList.add('open');
  };

  window.deleteClientFromDetail = async (force = false) => {
    if (force) {
      if (!confirm('ATTENZIONE: Eliminare DEFINITIVAMENTE questo cliente?\nL\'operazione è IRREVERSIBILE e rimuoverà tutto lo storico.')) return;
    } else {
      if (!confirm('Archiviare (Soft Delete) questo cliente in stato "cessato"?')) return;
    }
    
    try {
      window.UI.toast('Operazione in corso...', 'info');
      await window.API.Clients.remove(clientId, force);
      window.UI.toast(force ? 'Cliente eliminato definitivamente' : 'Cliente archiviato', 'success');
      setTimeout(() => { location.href = 'admin_clients.html'; }, 1000);
    } catch (e) {
      console.error(e);
      window.UI.toast(e.message || 'Errore durante l\'operazione', 'error');
    }
  };

  /* ── Attiva Portale Cliente ─────────────────────────────────── */
  window.activateClientPortal = async () => {
    const c = CLIENT;
    if (!c) return;
    const email = c.email;
    if (!email) { UI.toast('Email cliente mancante. Aggiornala prima di attivare il portale.', 'warning'); return; }

    const confirmed = await UI.confirm(
      `Inviare l'invito al portale a:\n\n${email}\n\nIl cliente riceverà un'email per impostare la sua password.`
    );
    if (!confirmed) return;

    try {
      await window.API.post('/users/invite', {
        email,
        name: c.company_name || c.name || '',
        role: 'client',
        client_id: clientId,
        company_id: c.company_id || undefined,
      });
      window.UI.toast(`✓ Invito portale inviato a ${email}`, 'success');
    } catch (e) {
      window.UI.toast(e?.message || 'Errore durante l\'invio dell\'invito', 'error');
    } finally {
      if (window.renderPortalPipeline) window.renderPortalPipeline(); // reload pipeline immediately after invite
    }
  };

  // Portal Pipeline visualization in the header
  window.renderPortalPipeline = async () => {
    const act = document.getElementById('portal-pipeline-container');
    if (!act) return;
    const c = CLIENT;
    if (!c) return;

    // Remove legacy portal button if it somehow still exists in page-actions
    const oldBtn = document.getElementById('btn-activate-portal');
    if (oldBtn) oldBtn.remove();
    
    // Determine states
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const hasEmail = !!(c.email && emailRegex.test(c.email));
    
    let hasPortalUser = false;
    let isActiveUser = false;
    let isLogged = false;

    act.innerHTML = `<span style="font-size:12px;color:var(--gray-500);">Verifica stato portale...</span>`;

    try {
      const users = await window.API.Users.list();
      const portalUser = users.find(u => 
        (u.client_ids && u.client_ids.includes(clientId)) ||
        (hasEmail && u.email.toLowerCase() === c.email.toLowerCase())
      );

      if (portalUser) {
        hasPortalUser = true;
        isActiveUser = portalUser.status === 'active';
        isLogged = !!(portalUser.last_sign_in_at || portalUser.last_login);
        
        // No overrides: the client's CRM status remains its true CRM status (e.g. 'active').
        // The portal user status is handled exclusively inside the pipeline logic below.
      }
    } catch(e) {
      console.warn('Could not fetch users list for portal pipeline');
    }

    const nodeState = (isDone, isActive, isError) => {
        if(isError) return { bg: '#fee2e2', color: '#dc2626', textStatus: '#dc2626', border: '#f87171' };
        if(isDone) return { bg: '#10b981', color: '#fff', textStatus: '#111827', border: 'transparent' };
        if(isActive) return { bg: '#eff6ff', color: '#3b82f6', textStatus: '#2563eb', border: '#3b82f6' };
        return { bg: '#f3f4f6', color: '#9ca3af', textStatus: '#9ca3af', border: 'transparent' };
    };

    const s1 = nodeState(hasEmail, true, !hasEmail);
    const s2 = nodeState(isLogged, hasEmail && !isLogged, false);

    let html = `<div style="display:flex; align-items:center; gap:12px; background:#fff; padding:6px 14px; border-radius:12px; border:1px solid #e5e7eb; box-shadow:0 1px 2px rgba(0,0,0,0.05);">`;
    
    // Node 1: Email
    html += `
       <div style="display:flex; align-items:center; gap:8px;">
          <div style="width:20px;height:20px;border-radius:50%;background:${s1.bg};border:1.5px solid ${s1.border};display:flex;align-items:center;justify-content:center;color:${s1.color};">
            ${hasEmail ? `<svg fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>` : `<svg fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>`}
          </div>
          <span style="font-size:12px; font-weight:600; color:${s1.textStatus};">${hasEmail ? 'Dati Validi' : 'Email Assente/Errata'}</span>
       </div>
       <div style="height:2px; width:20px; background:${hasEmail ? '#10b981' : '#e5e7eb'}; border-radius:2px;"></div>
    `;

    // Node 2: Portal
    html += `
       <div style="display:flex; align-items:center; gap:8px;">
          <div style="width:20px;height:20px;border-radius:50%;background:${s2.bg};border:1.5px solid ${s2.border};display:flex;align-items:center;justify-content:center;color:${s2.color};">
            ${isLogged ? `<svg fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>` : `<span style="font-size:11px;font-weight:bold;">2</span>`}
          </div>
          <span style="font-size:12px; font-weight:600; color:${s2.textStatus};">Accesso Portale</span>
       </div>
    `;

    // Action button separator
    html += `<div style="height:18px; width:1px; background:#e5e7eb; margin:0 4px;"></div>`;
    
    // Action button
    if (hasPortalUser && !isLogged) {
        html += `<button class="btn btn-ghost" style="padding:4px 8px; font-size:11px; height:auto; color:var(--brand-600); border: 1px solid var(--brand-100);" onclick="window.activateClientPortal()">Reinvia Invito</button>`;
    } else if (hasPortalUser && isLogged) {
        html += `<button class="btn btn-ghost" style="padding:4px 8px; font-size:11px; height:auto; color:var(--brand-600); border: 1px solid var(--transparent);" disabled>Utente Attivo</button>`;
    } else if (hasEmail) {
        html += `<button class="btn btn-primary" style="padding:4px 12px; font-size:11px; height:auto; border-radius:6px; background:#3b82f6;" onclick="window.activateClientPortal()">Invia Invito</button>`;
    } else {
        html += `<button class="btn" style="padding:4px 12px; font-size:11px; height:auto; border-radius:6px; opacity:0.5; background:#f3f4f6; color:#9ca3af; cursor:not-allowed;" disabled title="Inserisci / Correggi l'email del cliente per inviare l'invito">Invia Invito</button>`;
    }

    html += `</div>`;
    act.innerHTML = html;
  };

  /* ── Init ───────────────────────────────────────────────────── */
  const loaded = {};

  window.onPageReady(async () => {
    await I18n.init('lang-switcher-slot');
    await loadClient();
    
        // Load EVERYTHING in parallel immediately no artificial delays
    Promise.allSettled([
      loadContacts(),
      loadNotes(),
      loadServices(),
      loadContracts(),
      loadQuotes(),
      loadInvoices(),
      loadDocuments(),
    ]).then(() => {
      loaded['contacts'] = loaded['notes'] = loaded['services'] =
      loaded['contracts'] = loaded['quotes'] = loaded['invoices'] =
      loaded['documents'] = true;
      
      // Reveal UI after data is loaded to prevent FOUC skeleton flash
      setTimeout(() => {
        const shell = document.getElementById('shell');
        if (shell) shell.style.opacity = '1';
      }, 50);
    });

    // Calls and Comms modules disabled: replaced by unified Activity menu
    // initCallsModule(clientId);
    // setTimeout(checkOverdueCalls, 1200);
    // initCommsModule(clientId);

    // Timeline will lazy load when view is switched via switchMainView()


  });

  window.triggerUploadExistingContract = function(contractId) {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/pdf';
    inp.style.display = 'none';
    inp.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const fd = new FormData();
      fd.append('file', file);
      
      try {
        UI.toast('Caricamento in corso...', 'info');
        await API.Contracts.uploadSignedExisting(contractId, fd);
        UI.toast('Contratto PDF aggiornato con successo!', 'success');
        if (typeof loadContracts === 'function') loadContracts();
      } catch (err) {
        UI.toast(err.message || 'Errore durante l\'upload', 'error');
      }
    };
    document.body.appendChild(inp);
    inp.click();
    setTimeout(() => document.body.removeChild(inp), 1000);
  };

})();

