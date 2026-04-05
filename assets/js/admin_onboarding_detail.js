/* ============================================================
   admin_onboarding_detail.js 360° client hub
   ============================================================ */
'use strict';

(function () {
  Auth.guard('admin');
  Auth.initUI();

  /* ── URL params ─────────────────────────────────────────────── */
  const params = new URLSearchParams(window.location.search);
  const onboardingId = params.get('id') || params.get('onboarding_id');
  const openTab = params.get('tab');

  if (!onboardingId) {
    setTimeout(() => { location.href = 'admin_onboarding.html'; }, 800);
    return;
  }

  /* ── DOM ────────────────────────────────────────────────────── */
  const $ = id => document.getElementById(id);

  let ONBOARDING = null;
  let _companies = [];

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
    const safe = encodeURIComponent(onboardingId);
    const el = $('cd-link-invoices'); if (el) el.href = `admin_invoices.html?onboarding_id=${safe}`;
    const ec = $('cd-link-contracts'); if (ec) ec.href = `admin_contracts.html?onboarding_id=${safe}`;
    const ed = $('cd-link-docs'); if (ed) ed.href = `admin_documents.html?onboarding_id=${safe}`;
    const er = $('cd-link-renewals'); if (er) er.href = `admin_renewals.html?onboarding_id=${safe}`;
    // Quick-create links with client pre-selected
    const eqc = $('cd-link-new-quote-card'); if (eqc) eqc.href = `admin_quotes.html?new=1&onboarding=${safe}`;
    const btnQ = $('cd-btn-new-quote'); if (btnQ) btnQ.onclick = () => location.href = `admin_quotes.html?new=1&onboarding=${safe}`;
    const einv = $('cd-link-new-invoice'); if (einv) einv.href = `admin_invoices.html?new=1&onboarding=${safe}`;
    const epro = $('cd-link-new-proforma'); if (epro) epro.href = `admin_invoices.html?new=1&type=proforma&onboarding=${safe}`;
  }

  /* ── Load main client ────────────────────────────────────────── */
  async function loadClient() {
    try {
      const [onboarding, companies] = await Promise.all([
        API.Onboarding.get(onboardingId),
        API.Companies.list()
      ]);
      ONBOARDING = onboarding;
      _companies = Array.isArray(companies) ? companies : (companies?.items ?? companies?.data ?? []);

      if (!ONBOARDING) throw new Error('not found');
      renderHeader();
      renderAnagrafica();
      updateDeepLinks();
      renderPipeline();
    } catch (e) {
      $('cd-title').textContent = I18n.t('error.not_found') || 'Non trovato';
      UI.toast(e.message, 'error');
    }
  }
  window.refreshOnboardingDetail = loadClient;

  /* ── Header ──────────────────────────────────────────────── */
  function _initials(str) {
    if (!str) return '?';
    const words = str.trim().split(/\s+/);
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }


  function renderPipeline() {
    const r = ONBOARDING;
    if (!r) return;

    const STATES = ['new', 'quote_draft', 'quote_sent', 'quote_accepted', 'contract_draft', 'contract_sent', 'contract_signed', 'proforma_draft', 'proforma_issued', 'payment_under_review'];
    const SLBL = { new: 'Nuova', quote_draft: 'Prev. Bozza', quote_sent: 'Prev. Inviato', quote_accepted: 'Prev. Acc.', contract_draft: 'Contr. Bozza', contract_sent: 'Contr. Inv.', contract_signed: 'Contr. Firmato', proforma_draft: 'Proforma Bozza', proforma_issued: 'Proforma Emessa', payment_under_review: 'Fatturazione' };

    let idx = STATES.indexOf(r.status);
    if (idx < 0) { if (r.status === 'waiting_payment') idx = STATES.indexOf('proforma_issued'); else idx = 0; }
    const progressPct = idx * (100 / (STATES.length - 1));

    const pFields = [
      { label: 'Ragione Sociale', val: r.company_name || r.lead_name },
      { label: 'Partita IVA', val: r.vat_number },
      { label: 'Email', val: r.email || r._client_email },
      { label: 'SDI / PEC', val: r.dest_code || r.codice_destinatario || r.pec },
      { label: 'Indirizzo', val: r.address || r.indirizzo },
      { label: 'Città', val: r.city || r.citta },
    ];

    const pipelineHtml = r.status === 'cancelled'
      ? `<div style="display:flex;align-items:center;gap:10px;padding:8px 16px;background:#fff5f5;border:1px solid #fecaca;border-radius:10px;color:#dc2626;font-weight:600;font-size:13px;width:100%;">
           <svg style="width:16px;height:16px;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
           Pratica annullata
         </div>`
      : `<div class="mac-pipeline-wrap" style="width:100%; font-size:10px; margin:0;">
           <div style="font-size:9px;font-weight:700;letter-spacing:0.5px;color:#64748b;text-transform:uppercase;margin-bottom:8px;">Flusso di Lavoro</div>
           <div class="mac-pipeline-track" style="margin-top:0;">
             <div class="mac-pipeline-line" style="top:10px;"></div>
             <div class="mac-pipeline-progress" style="top:10px; height:2px; background:#3b82f6; position:absolute; left:30px; z-index:0; width:${progressPct}%;"></div>
             ${STATES.map((s, i) => {
        const cls = i < idx ? 'done' : i === idx ? 'active' : '';
        return `<div class="mac-pipeline-step ${cls}" onclick="changePipelineStatus('${s}')" style="cursor:pointer;" title="Imposta come ${SLBL[s] || s}">
                 <div class="mac-pipeline-dot" style="width:20px; height:20px; border-width:3px;"></div>
                 <div class="mac-pipeline-label" style="font-size:9px; margin-top:4px; text-align:center;">${SLBL[s] || s}</div>
               </div>`;
      }).join('')}
           </div>
         </div>`;

    const reqHtml = `
      <div style="display:flex; align-items:center; gap:8px; font-size:11px;">
        <div style="font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.05em; padding-right:8px; border-right:1px solid #e2e8f0; display:flex; align-items:center; gap:4px;">
           <svg style="width:14px;height:14px;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z"/></svg>
           Requisiti Proforma
        </div>
        ${pFields.map(f => {
      if (f.val) return `<div style="display:flex; align-items:center; gap:2px; font-weight:600; color:#10b981; background:#d1fae5; padding:2px 6px; border-radius:12px;"><svg style="width:12px;height:12px;" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg> ${f.label}</div>`;
      return `<div style="display:flex; align-items:center; gap:2px; font-weight:600; color:#f97316; background:#ffedd5; padding:2px 6px; border-radius:12px;"><svg style="width:12px;height:12px;" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg> ${f.label}</div>`;
    }).join('')}
      </div>
    `;

    const pipeContainer = document.getElementById('onb-pipeline-header-container');
    if (pipeContainer) pipeContainer.innerHTML = pipelineHtml;

    const reqContainer = document.getElementById('onb-req-inline-container');
    if (reqContainer) reqContainer.innerHTML = reqHtml;
  }

  function renderHeader() {
    const c = ONBOARDING;
    const displayName = c.company_name || c.lead_name || '';

    // Fornitrice lookup
    const fornitriceLine = _companies.find(comp => comp.id == c.company_id);
    const fornitriceName = fornitriceLine ? fornitriceLine.name : '';

    // ── Backward compat IDs ──────────────────────────────────────
    if ($('cd-status-pill')) $('cd-status-pill').innerHTML = statusBadge(c.status);
    document.title = `${displayName} Nexus Admin`;

    // ── Sidebar Identity ──────────────────────────────────────────
    const titleEl = $('cd-title');
    const subEl = $('cd-subtitle');

    if (titleEl) {
      titleEl.innerHTML = `<div style="font-size:16px; line-height:1.2; margin-bottom:4px;">${displayName}</div>`;
    }

    // Status pill visible container -> Now used for Fornitrice and Servizio
    const statusPillVisible = $('cd-status-pill-visible');
    if (statusPillVisible) {
      let badgesHtml = '';
      if (fornitriceName) {
        badgesHtml += `<div style="font-size:12px; color:#64748b; margin-top:2px;">Fornitrice: ${fornitriceName}</div>`;
      }
      if (c.service_name && c.service_name !== displayName) {
        badgesHtml += `<div style="font-size:12px; color:#64748b; margin-top:2px;">Servizio: ${c.service_name}</div>`;
      }
      statusPillVisible.innerHTML = badgesHtml;
    }

    if (subEl) {
      if (c.email) {
        subEl.innerHTML = `<a href="mailto:${c.email}" style="color:#3b82f6; text-decoration:none; font-size:12px; opacity:0.8;">${c.email}</a>`;
      } else {
        subEl.textContent = '';
      }
    }

    // ── Mac sidebar identity ─────────────────────────────────────
    const av = $('pc-avatar');
    if (av) {
      av.textContent = _initials(c.company_name || c.lead_name);
      av.style.background = 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)';
      av.style.color = '#fff';
    }

    // Mac topbar title
    const topbarLabel = $('mac-topbar-label');
    if (topbarLabel) topbarLabel.textContent = displayName;

    // Sidebar subtitle
    if (subEl && c.email) {
      subEl.innerHTML = `<a href="mailto:${c.email}" style="color:#3b82f6;text-decoration:none;">${c.email}</a>`;
    }

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
      const cityIcon = '<path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"/>';
      const vatIcon = '<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z"/>';
      const createdIcon = '<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"/>';
      const createdStr = c.created_at
        ? new Date(c.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
        : null;
      strip.innerHTML = [
        pill(emailIcon, c.email, c.email ? `mailto:${c.email}` : null),
        pill(phoneIcon, c.phone, c.phone ? `tel:${c.phone}` : null),
        pill(cityIcon, c.city),
        pill(vatIcon, c.vat_number ? `P.IVA ${c.vat_number}` : null),
        pill(createdIcon, createdStr ? `Pratica dal ${createdStr}` : null),
      ].filter(Boolean).join('');
    }
  }

  /* ── ① Anagrafica ───────────────────────────────────────────── */
  const STATUS_LABELS = {
    new: { label: 'Nuova', color: '#0284c7', bg: '#e0f2fe' },
    quote_draft: { label: 'Prev. Bozza', color: '#ca8a04', bg: '#fef3c7' },
    quote_sent: { label: 'Prev. Inviato', color: '#2563eb', bg: '#dbeafe' },
    quote_accepted: { label: 'Prev. Accettato', color: '#3b82f6', bg: '#eff6ff' },
    contract_draft: { label: 'Contr. Bozza', color: '#ca8a04', bg: '#fef3c7' },
    contract_sent: { label: 'Contr. Inviato', color: '#2563eb', bg: '#dbeafe' },
    contract_signed: { label: 'Contr. Firmato', color: '#3b82f6', bg: '#eff6ff' },
    proforma_draft: { label: 'Prof. Bozza', color: '#ca8a04', bg: '#fef3c7' },
    proforma_issued: { label: 'Prof. Emessa', color: '#2563eb', bg: '#dbeafe' },
    payment_under_review: { label: 'Pagam. in rev.', color: '#9333ea', bg: '#f3e8ff' },
    cancelled: { label: 'Annullata', color: '#ef4444', bg: '#fef2f2' },
    blocked: { label: 'Bloccata', color: '#ef4444', bg: '#fef2f2' },
  };

  function statusBadge(s) {
    const cfg = STATUS_LABELS[s] || { label: s || '', color: '#6b7280', bg: '#f3f4f6' };
    return `<span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:700;
      color:${cfg.color};background:${cfg.bg};padding:3px 10px;border-radius:20px;">
      <span style="width:6px;height:6px;border-radius:50%;background:${cfg.color};flex-shrink:0;"></span>
      ${cfg.label}</span>`;
  }

  window.changePipelineStatus = async (newStatus) => {
    if (ONBOARDING.status === newStatus) return;
    const label = STATUS_LABELS[newStatus] ? STATUS_LABELS[newStatus].label : newStatus;
    if (!confirm(`Spostare la pratica allo stato "${label}"?`)) return;
    try {
      UI.toast('Aggiornamento stato...', 'info');
      ONBOARDING = await API.Onboarding.update(onboardingId, { status: newStatus });
      UI.toast('Stato aggiornato', 'success');
      renderHeader();
      renderAnagrafica();
      renderPipeline();
    } catch (e) {
      UI.toast(e.message || 'Errore', 'error');
    }
  };

  let _editingAnag = false;

  function renderAnagrafica() {
    const c = ONBOARDING;
    const grid = $('cd-anag-grid') || $('cd-anag-list');
    if (!grid) return;

    const f = (label, val, fieldId, type = "text") => {
      let display;
      if (_editingAnag) {
        if (type === 'textarea') {
          display = `<textarea class="mac-flat-input" id="${fieldId}" rows="3" style="width:100%; font-size:13px; padding:6px; min-height:60px; margin:0; resize:vertical;">${val || ''}</textarea>`;
        } else if (type === 'lang') {
          display = `<select class="mac-flat-input" id="${fieldId}" style="width:100%; font-size:13px; padding:4px 8px; margin:0; height:32px;">
                 <option value="it" ${val === 'it' ? 'selected' : ''}>Italiano</option>
                 <option value="en" ${val === 'en' ? 'selected' : ''}>English</option>
              </select>`;
        } else {
          display = `<input class="mac-flat-input" id="${fieldId}" type="${type}" value="${(val || '').replace(/"/g, '&quot;')}" style="width:100%; font-size:13px; padding:4px 8px; margin:0; height:32px;"/>`;
        }
      } else {
        // Read-only
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
      <!-- Section header -->
      <div class="detail-section-header" style="flex-wrap: wrap; gap: 16px;">
        <div class="detail-section-label" style="flex:1;">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"/></svg>
          <div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
            <span>Dati Anagrafici</span>
            <div id="onb-req-inline-container"></div>
          </div>
        </div>
        ${editToggle}
      </div>

      <div class="detail-section-body">
        <div class="detail-field-grid">
          ${f('Ragione Sociale', c.company_name || c.lead_name, 'anag-company-name', 'text')}
          ${f('Nome Referente', c.lead_name, 'anag-lead-name', 'text')}
          ${f('Email', c.email, 'anag-email', 'email')}
          ${f('Telefono', c.phone, 'anag-phone', 'tel')}
          ${f('Lingua', c.lang, 'anag-lang', 'lang')}
          ${_editingAnag ? '' : f('Servizio Richiesto', c.service_name, 'anag-service', 'text')}
        </div>
      </div>

      <!-- Indirizzo & Fatturazione -->
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
          ${f('Codice SDI', c.dest_code || c.sdi, 'anag-sdi', 'text')}
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

    const pFields = [
      { val: c.company_name || c.lead_name, label: 'Ragione Sociale' },
      { val: c.email, label: 'Email' },
      { val: c.address, label: 'Indirizzo' },
      { val: c.city, label: 'Città' },
      { val: c.vat_number, label: 'Partita IVA' }
    ];
    const missingCount = pFields.filter(f => !f.val).length;
    const btnProforma = $('cd-link-new-proforma');
    if (btnProforma) {
      if (missingCount === 0) {
        btnProforma.disabled = false;
        btnProforma.style.opacity = '1';
        btnProforma.style.cursor = 'pointer';
        btnProforma.title = '';
      } else {
        btnProforma.disabled = true;
        btnProforma.style.opacity = '0.5';
        btnProforma.style.cursor = 'not-allowed';
        btnProforma.title = 'Completa tutti i requisiti (Dati Anagrafici e Indirizzo) per sbloccare';
      }
    }

    const toggle = $('anag-edit-toggle');
    if (toggle) {
      toggle.onchange = async (e) => {
        if (e.target.checked) {
          _editingAnag = true;
          renderAnagrafica();
        } else {
          // Time to save!
          const payload = {
            lead_name: $('anag-lead-name')?.value?.trim() || null,
            company_name: $('anag-company-name')?.value?.trim() || null,
            email: $('anag-email')?.value?.trim() || null,
            phone: $('anag-phone')?.value?.trim() || null,
            vat_number: $('anag-vat')?.value?.trim() || null,
            pec: $('anag-pec')?.value?.trim() || null,
            dest_code: $('anag-sdi')?.value?.trim() || null,
            iban: $('anag-iban')?.value?.trim() || null,
            address: $('anag-address')?.value?.trim() || null,
            city: $('anag-city')?.value?.trim() || null,
            lang: $('anag-lang')?.value || 'it',
            notes: $('anag-notes')?.value?.trim() || null,
          };
          Object.keys(payload).forEach(k => { if (payload[k] === null) delete payload[k]; });

          try {
            toggle.disabled = true;
            UI.toast('Salvataggio in corso...', 'info');
            ONBOARDING = await API.Onboarding.update(onboardingId, payload);
            UI.toast('Anagrafica aggiornata', 'success');
            _editingAnag = false;
            renderHeader();
            renderAnagrafica(); // re-renders as read-only
          } catch (err) {
            UI.toast(err?.message || 'Errore', 'error');
            e.target.checked = true; // revert toggle physically on error
            toggle.disabled = false;
          }
        }
      };
    }

    renderPipeline();
  }



  /* ── ② Contacts ─────────────────────────────────────────────── */
  async function loadContacts() {
    const el = $('cd-contacts-list');
    if (!el) return;
    el.innerHTML = UI.skeletonCardList(2);
    try {
      const res = await API.Onboarding?.contacts(onboardingId);
      const data = Array.isArray(res) ? res : (res?.data || res?.items || []);
      const badge = $('badge-contact');
      if (badge) badge.textContent = data.length;
      if (!data.length) {
        el.innerHTML = `<div style="padding:32px 20px;text-align:center;color:var(--gray-400);font-size:13px;">Nessun contatto aggiunto. Usa "Nuovo" per aggiungerne uno.</div>`;
        _renderSidebarContacts([]);
        return;
      }
      el.innerHTML = data.map(ct => {
        const initials = ct.name ? ct.name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() : '?';
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
      const res = await API.Services.subscriptions({ onboarding_id: onboardingId });
      const data = Array.isArray(res) ? res : (res?.data || res?.items || []);
      const chip = $('chip-services');
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
      const res = await API.Contracts?.list({ onboarding_id: onboardingId });
      const data = Array.isArray(res) ? res : (res?.data || res?.items || []);
      const active = data.filter(c => ['active', 'signed'].includes(c.status)).length;
      const chip = $('chip-contracts');
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
        <tbody>${data.map(c => `<tr class="hover-row" style="cursor:pointer;" onclick="location.href='admin_contracts.html?id=${c.id}'">
          <td class="z-rt-name">${c.title || I18n.t('nav.contracts') || 'Contratto'}</td>
          <td class="z-rt-date">${c.created_at ? UI.date(c.created_at) : '-'}</td>
          <td class="z-rt-date">${c.expires_at ? UI.date(c.expires_at) : '-'}</td>
          <td>${UI.pill(c.status)}</td>
          <td>
            <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;">
              <button class="btn btn-ghost btn-xs text-primary" style="padding:4px;opacity:0.6;background:none;border:none;cursor:pointer;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6" onclick="event.stopPropagation(); window.duplicateContract(event, '${c.id}')" title="Duplica">
                <span style="font-size:16px;line-height:1;">📄</span>
              </button>
              <button class="btn btn-ghost btn-xs text-danger" style="padding:4px;opacity:0.6;background:none;border:none;cursor:pointer;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6" onclick="event.stopPropagation(); window.deleteContract(event, '${c.id}')" title="Elimina">
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

  /* ── ⑤ Documents ────────────────────────────────────────────── */
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
      const res = await API.Documents.list({ onboarding_id: onboardingId });
      const data = Array.isArray(res) ? res : (res?.data || res?.items || []);
      const chip = $('chip-docs');
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
            ${d.size ? `<div class="list-card-meta">${Math.round(d.size / 1000)} KB</div>` : ''}
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
      const res = await API.Quotes?.list({ onboarding_id: onboardingId });
      const data = Array.isArray(res) ? res : (res?.data || res?.items || []);
      const chip = $('chip-quotes');
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
      const res = await API.Invoices?.list({ onboarding_id: onboardingId });
      const data = Array.isArray(res) ? res : (res?.data || res?.items || []);
      const open = data.filter(i => !['paid', 'cancelled'].includes(i.status)).length;
      const chip = $('chip-invoices');
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
      const endpoint = null ?? API.Renewals?.listByClient;
      const res = endpoint ? await endpoint(onboardingId) : [];
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
        info = await API.Clients.windocStatus(onboardingId);
      }
      if (!info && ONBOARDING) {
        info = {
          windoc_id: ONBOARDING.windoc_id,
          windoc_status: ONBOARDING.windoc_sync_at ? 'synced' : 'not_configured',
          windoc_last_sent: ONBOARDING.windoc_sync_at,
        };
      }

      const windocId = info?.windoc_id;
      const status = info?.windoc_status || (windocId ? 'synced' : 'not_configured');
      const lastSent = info?.windoc_last_sent || info?.last_sent;

      const statusColor = status === 'synced' ? 'success' : status === 'error' ? 'danger' : 'gray';
      const statusLabel = {
        synced: I18n.t('cl.windoc_synced') || 'Sincronizzato',
        pending: I18n.t('cl.windoc_pending') || 'In attesa',
        error: I18n.t('cl.windoc_error') || 'Errore sync',
        not_configured: I18n.t('cl.windoc_not_cfg') || 'Non configurato',
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
          await API.Onboarding.update(onboardingId, { windoc_id: val });
          ONBOARDING.windoc_id = val;
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
        entityType: 'onboarding',
        entityId: onboardingId,
        containerId: 'timeline-feed-container',
      });
    } else {
      console.warn('[Storico] ActivityTimeline not loaded');
      const fc = $('timeline-feed-container');
      if (fc) fc.innerHTML = '<p style="color:red;font-size:13px;">Impossibile isolare la timeline. Componente mancante.</p>';
    }
  }
  // Expose to global scope so window.switchMainView can call it
  window.loadStorico = loadStorico;

  /* ── Timeline Note Compose ──────────────────────────────────── */
  window.saveTimelineNote = async () => {
    const input = $('timeline-note-body');
    const content = input?.value.trim();
    if (!content) return;
    try {
      await window.API.post(`/onboarding/${onboardingId}/notes`, { content });
      window.UI.toast('Aggiornamento registrato', 'success');
      input.value = '';
      // Ricarica sia le note di base che la timeline se è già attiva
      loadNotes();
      if (loaded['storico']) loadStorico();
    } catch (e) {
      window.UI.toast(e.message || 'Errore salvataggio nota', 'error');
    }
  };

  /* ── Windoc action buttons ──────────────────────────────────── */
  $('cd-btn-windoc-sync')?.addEventListener('click', async () => {
    try {
      UI.toast(I18n.t('cl.windoc_syncing') || 'Sincronizzazione in corso…', 'info');
      await API.post(`/onboarding/${onboardingId}/sync-windoc`);
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
      const res = await API.Services.catalog(true);
      const data = Array.isArray(res) ? res : (res?.data || res?.items || []);
      sel.innerHTML = `<option value="">${I18n.t('cl.select_service') || 'Seleziona servizio'}</option>` +
        data.map(s => `<option value="${s.id}">${s.name} (${UI.currency(s.price_monthly, s.currency)}/mo)</option>`).join('');
      $('f-service-start').value = new Date().toISOString().split('T')[0];
    } catch { sel.innerHTML = `<option value="">${I18n.t('error.generic') || 'Errore'}</option>`; }
  });

  $('modal-service-save')?.addEventListener('click', async () => {
    const sId = $('f-service-id')?.value;
    if (!sId) { UI.toast(I18n.t('cl.select_service') || 'Seleziona un servizio', 'warning'); return; }
    try {
      await API.Services.subscribe({ onboarding_id: onboardingId, service_id: sId, billing_cycle: $('f-service-cycle')?.value || 'monthly', start_date: $('f-service-start')?.value || null });
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
        name: name, role: $('fc-role')?.value?.trim() || "",
        email: $('fc-email')?.value?.trim() || null,
        phone: $('fc-phone')?.value?.trim() || null,
      };
      if (window._editingContactId) {
        await API.Onboarding.updateContact?.(onboardingId, window._editingContactId, body);
        UI.toast('Contatto aggiornato', 'success');
      } else {
        await API.Onboarding.addContact?.(onboardingId, body);
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
      onboarding_id: onboardingId,
      title: title,
      lines: [
        { description: 'Prestazione', quantity: 1, unit_price: amount, vat_rate: 22 }
      ]
    };

    try {
      const btn = $('modal-quote-save'); if (btn) btn.disabled = true;
      await API.post('/quotes/', body);
      $('modal-add-quote').classList.remove('open');
      UI.toast('Preventivo creato', 'success');
      loadQuotes();
    } catch (e) {
      UI.toast(e.message || 'Errore durante la creazione del preventivo', 'error');
    } finally {
      const btn = $('modal-quote-save'); if (btn) btn.disabled = false;
    }
  });

  /* ── Line-level Deletions ───────────────────────────────────── */
  window.deleteContact = async (event, id) => {
    event.stopPropagation();
    if (!confirm(I18n.t('cl.confirm_delete_contact') || 'Eliminare il contatto?')) return;
    try { await window.API.del(`/onboarding/${onboardingId}/contacts/${id}`); UI.toast('Contatto eliminato', 'success'); loadContacts(); }
    catch(e) { UI.toast(e.message, 'error'); }
  };
  window.deleteService = async (event, id) => {
    event.stopPropagation();
    if (!confirm('Eliminare il servizio/abbonamento?')) return;
    try { await window.API.del(`/services/subscriptions/${id}`); UI.toast('Servizio eliminato', 'success'); loadServices(); loadRenewals(); }
    catch(e) { UI.toast(e.message, 'error'); }
  };
  window.deleteContract = async (event, id) => {
    event.stopPropagation();
    if (!confirm('Eliminare il contratto?')) return;
    try { await window.API.del(`/contracts/${id}`); UI.toast('Contratto eliminato', 'success'); loadContracts(); }
    catch(e) { UI.toast(e.message, 'error'); }
  };
  window.deleteDocument = async (event, id) => {
    event.stopPropagation();
    if (!confirm('Eliminare il documento?')) return;
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
    fd.append('onboarding_id', onboardingId);
    fd.append('file', file);

    try {
      const btn = $('modal-contract-upload-save'); if (btn) btn.disabled = true;
      UI.toast('Caricamento in corso...', 'info');
      await API.Contracts.uploadSigned(fd);
      $('modal-upload-contract').classList.remove('open');
      UI.toast('Contratto caricato con successo', 'success');
      $('fuc-title').value = '';
      if (fileInput) fileInput.value = '';
      if (typeof loadContracts === 'function') loadContracts();
    } catch (e) {
      UI.toast(e.message || 'Errore durante il caricamento del contratto', 'error');
    } finally {
      const btn = $('modal-contract-upload-save'); if (btn) btn.disabled = false;
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
    fd.append('onboarding_id', onboardingId);
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
          entityType: 'onboarding',
          entityId: onboardingId,
          containerId: 'timeline-mnt'
        });
      }
    } catch (e) {
      UI.toast(e.message || 'Errore durante il caricamento del documento', 'error');
    } finally {
      const btn = $('modal-document-upload-save'); if(btn) btn.disabled = false;
    }
  });

  /* ── Notes (Disabled - Replaced by Activity Timeline) ──────────────────────────────────────────────────── */
  async function loadNotes() {
    console.log('[Onboarding] Notes module disabled - transitioning to Activity timeline');
  }

  /* ── Company switch ─────────────────────────────────────────── */
  window.addEventListener('nexusCompanyChanged', () => {
    location.href = 'admin_onboarding.html';
  });

  /* ── Delete Client Danger Zone ──────────────────────────────── */
  window.deleteOnboardingFromDetail = async () => {
    if (!confirm(I18n.t('cl.confirm_delete') || 'Eliminare definitivamente questo cliente?\nL\'operazione è IRREVERSIBILE e rimuoverà anche i contatti collegati.')) return;
    try {
      window.UI.toast('Eliminazione in corso...', 'info');
      await window.API.Onboarding.remove(onboardingId);
      window.UI.toast(I18n.t('cl.deleted_ok') || 'Cliente eliminato con successo', 'success');
      setTimeout(() => { location.href = 'admin_onboarding.html'; }, 1000);
    } catch (e) {
      console.error(e);
      window.UI.toast(I18n.t('error.generic') || 'Errore durante l\'eliminazione', 'error');
    }
  };

  /* ── Init ───────────────────────────────────────────────────── */
  const loaded = {};

  window.onPageReady(async () => {
    await I18n.init('lang-switcher-slot');
    await loadClient();

    // Load EVERYTHING in parallel immediately no artificial delays
    Promise.allSettled([
      loadContacts(),
      loadServices(),
      loadContracts(),
      loadQuotes(),
      loadInvoices(),
      loadDocuments(),
    ]).then(() => {
      loaded['contacts'] = loaded['services'] =
        loaded['contracts'] = loaded['quotes'] = loaded['invoices'] =
        loaded['documents'] = true;

      // Reveal UI after data is loaded to prevent FOUC skeleton flash
      setTimeout(() => {
        const shell = document.getElementById('shell');
        if (shell) shell.style.opacity = '1';
      }, 50);
    });

    // Calls and Comms modules disabled: replaced by unified Activity menu
    // initCallsModule(onboardingId);
    // setTimeout(checkOverdueCalls, 1200);
    // initCommsModule(onboardingId);

    // Timeline will lazy load when view is switched via switchMainView()
  });

})();

