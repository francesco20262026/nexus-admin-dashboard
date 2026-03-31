/* ============================================================
   admin_onboarding_detail.js 360° client hub
   ============================================================ */
'use strict';

(function () {
  Auth.guard('admin');
  Auth.initUI();

  /* ── URL params ─────────────────────────────────────────────── */
  const params   = new URLSearchParams(window.location.search);
  const onboardingId = params.get('id') || params.get('onboarding_id');
  const openTab  = params.get('tab');

  if (!onboardingId) {
    setTimeout(() => { location.href = 'admin_onboarding.html'; }, 800);
    return;
  }

  /* ── DOM ────────────────────────────────────────────────────── */
  const $ = id => document.getElementById(id);

  let ONBOARDING = null;
  let _companies  = [];

  /* ── Tab Routing (SPA) ────────────────────────────────────────── */
  window.switchMainView = function (viewId) {
    // Hide all tabs
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

    // Update Sidebar Navigation state
    document.querySelectorAll('.mac-sidebar .mac-nav-item').forEach(el => el.classList.remove('active'));
    const activeNav = document.getElementById('tab-' + viewId);
    if (activeNav) activeNav.classList.add('active');

    // Lazy load the timeline only when requested
    if (viewId === 'timeline' && !loaded['storico']) {
      if (typeof loadStorico === 'function') loadStorico();
      loaded['storico'] = true;
    }
  };

  /* ── Deep-link quick links from list page ────────────────────── */
  function updateDeepLinks() {
    const safe = encodeURIComponent(onboardingId);
    const el   = $('cd-link-invoices');  if (el)  el.href = `admin_invoices.html?onboarding_id=${safe}`;
    const ec   = $('cd-link-contracts'); if (ec)  ec.href = `admin_contracts.html?onboarding_id=${safe}`;
    const ed   = $('cd-link-docs');      if (ed)  ed.href = `admin_documents.html?onboarding_id=${safe}`;
    const er   = $('cd-link-renewals');  if (er)  er.href = `admin_renewals.html?onboarding_id=${safe}`;
    // Quick-create links with client pre-selected
    const eq   = $('cd-link-new-quote');      if (eq)  eq.href = `admin_quotes.html?new=1&onboarding_id=${safe}`;
    const eqc  = $('cd-link-new-quote-card'); if (eqc) eqc.href = `admin_quotes.html?new=1&onboarding_id=${safe}`;
    const einv = $('cd-link-new-invoice'); if (einv) einv.href = `admin_invoices.html?new=1&onboarding_id=${safe}`;
    const epro = $('cd-link-new-proforma');if (epro) epro.href = `admin_invoices.html?new=1&type=proforma&onboarding_id=${safe}`;
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
    const container = document.getElementById('onb-pipeline-req-container');
    if (!container) return;
    
    const STATES = ['new','quote_draft','quote_sent','quote_accepted','contract_draft','contract_sent','contract_signed','proforma_draft','proforma_issued','payment_under_review'];
    const SLBL   = { new:'Nuova', quote_draft:'Prev. Bozza', quote_sent:'Prev. Inviato', quote_accepted:'Prev. Acc.', contract_draft:'Contr. Bozza', contract_sent:'Contr. Inv.', contract_signed:'Contr. Firmato', proforma_draft:'Proforma Bozza', proforma_issued:'Proforma Emessa', payment_under_review:'Fatturazione' };

    let idx = STATES.indexOf(r.status);
    if (idx < 0) { if (r.status === 'waiting_payment') idx = STATES.indexOf('proforma_issued'); else idx = 0; }
    const progressPct = idx * (100 / (STATES.length - 1));

    const pFields = [
      { label: 'Ragione Sociale', val: r.company_name || r.lead_name },
      { label: 'Partita IVA',     val: r.vat_number },
      { label: 'Email',           val: r.email || r._client_email },
      { label: 'SDI / PEC',       val: r.dest_code || r.codice_destinatario || r.pec },
      { label: 'Indirizzo',       val: r.address || r.indirizzo },
      { label: 'Città',           val: r.city || r.citta },
    ];

    const pipelineHtml = r.status === 'cancelled'
      ? `<div style="display:flex;align-items:center;gap:10px;padding:16px;background:#fff5f5;border:1px solid #fecaca;border-radius:10px;color:#dc2626;font-weight:600;font-size:14px;">
           <svg style="width:18px;height:18px;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
           Pratica annullata
         </div>`
      : `<div class="mac-pipeline-wrap">
           <div class="mac-pipeline-track">
             <div class="mac-pipeline-track-bg"></div>
             <div class="mac-pipeline-progress" style="width:${progressPct}%;"></div>
             ${STATES.map((s,i) => {
               const cls = i < idx ? 'done' : i === idx ? 'active' : '';
               return `<div class="mac-pipeline-step ${cls}">
                 <div class="mac-pipeline-dot"></div>
                 <div class="mac-pipeline-label">${SLBL[s] || s}</div>
               </div>`;
             }).join('')}
           </div>
         </div>`;

    const reqHtml = `
      <div style="display:flex; align-items:center; gap:16px; padding:10px 16px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; margin-top:20px; overflow-x:auto; white-space:nowrap; -webkit-overflow-scrolling: touch;">
        <div style="display:flex; align-items:center; gap:8px; font-weight:600; font-size:12px; color:#64748b; padding-right:16px; border-right:1px solid #e2e8f0; text-transform: uppercase; letter-spacing: 0.05em;">
          <svg style="width:14px;height:14px;color:#94a3b8;" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z"/></svg>
          Requisiti Proforma
        </div>
        <div style="display:flex; align-items:center; gap:20px;">
          ${pFields.map(f => {
            if (f.val) return `<div style="display:flex; align-items:center; gap:6px; font-size:12.5px; font-weight:600; color:#3b82f6;"><svg style="width:16px;height:16px;" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg> ${f.label}</div>`;
            return `<div style="display:flex; align-items:center; gap:6px; font-size:12.5px; font-weight:500; color:#94a3b8;"><svg style="width:14px;height:14px;color:#f87171;" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg> ${f.label}</div>`;
          }).join('')}
        </div>
      </div>
    `;

    container.innerHTML = `<div class="mac-section" style="padding-top:0;padding-bottom:16px;">
      <div style="margin-bottom:16px;font-size:13.5px;font-weight:600;letter-spacing:-0.2px;">Flusso di Lavoro</div>
      ${pipelineHtml}
      ${reqHtml}
    </div><div class="mac-divider" style="margin:0 0 32px;"></div>`;
  }

  function renderHeader() {
    const c = ONBOARDING;
    const displayName = c.company_name || c.lead_name || '';

    // Fornitrice lookup
    const fornitriceLine = _companies.find(comp => comp.id == c.company_id);
    const fornitriceName = fornitriceLine ? fornitriceLine.name : '';

    // ── Backward compat IDs ──────────────────────────────────────
    if ($('cd-status-pill'))  $('cd-status-pill').innerHTML = statusBadge(c.status);
    document.title = `${displayName} Nexus Admin`;

    // ── Sidebar Identity ──────────────────────────────────────────
    const titleEl = $('cd-title');
    const subEl = $('cd-subtitle');

    if (titleEl) {
      // Clear and rebuild to avoid mess
      titleEl.innerHTML = `<div style="font-size:16px; line-height:1.2; margin-bottom:4px;">${displayName}</div>`;
      
      let badgesHtml = '';
      if (fornitriceName) {
        badgesHtml += `<div class="mac-status-pill-complete" style="font-size:10px; padding:2px 8px; margin-top:4px; display:inline-flex;">Fornitrice: ${fornitriceName}</div> `;
      }
      // Add service badge if it's different from the display name
      if (c.service_name && c.service_name !== displayName) {
        badgesHtml += `<div class="mac-status-pill-complete" style="font-size:10px; padding:2px 8px; margin-top:4px; display:inline-flex; background:#f0f9ff; color:#0369a1; border-color:#bae6fd;">Servizio: ${c.service_name}</div>`;
      }
      
      if (badgesHtml) {
        titleEl.innerHTML += `<div style="display:flex; flex-direction:column; align-items:flex-start; gap:2px;">${badgesHtml}</div>`;
      }
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

    // Status pill in sidebar (visible)
    const statusPillVisible = $('cd-status-pill-visible');
    if (statusPillVisible) statusPillVisible.innerHTML = statusBadge(c.status);

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
        pill(createdIcon, createdStr ? `Pratica dal ${createdStr}` : null),
      ].filter(Boolean).join('');
    }
  }

  /* ── ① Anagrafica ───────────────────────────────────────────── */
      const STATUS_LABELS = {
    new:                  { label: 'Nuova',           color: '#0284c7', bg: '#e0f2fe' },
    quote_draft:          { label: 'Prev. Bozza',     color: '#ca8a04', bg: '#fef3c7' },
    quote_sent:           { label: 'Prev. Inviato',   color: '#2563eb', bg: '#dbeafe' },
    quote_accepted:       { label: 'Prev. Accettato', color: '#3b82f6', bg: '#eff6ff' },
    contract_draft:       { label: 'Contr. Bozza',    color: '#ca8a04', bg: '#fef3c7' },
    contract_sent:        { label: 'Contr. Inviato',  color: '#2563eb', bg: '#dbeafe' },
    contract_signed:      { label: 'Contr. Firmato',  color: '#3b82f6', bg: '#eff6ff' },
    proforma_draft:       { label: 'Prof. Bozza',     color: '#ca8a04', bg: '#fef3c7' },
    proforma_issued:      { label: 'Prof. Emessa',    color: '#2563eb', bg: '#dbeafe' },
    payment_under_review: { label: 'Pagam. in rev.',  color: '#9333ea', bg: '#f3e8ff' },
    cancelled:            { label: 'Annullata',       color: '#ef4444', bg: '#fef2f2' },
    blocked:              { label: 'Bloccata',        color: '#ef4444', bg: '#fef2f2' },
  };

  function statusBadge(s) {
    const cfg = STATUS_LABELS[s] || { label: s || '', color: '#6b7280', bg: '#f3f4f6' };
    return `<span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:700;
      color:${cfg.color};background:${cfg.bg};padding:3px 10px;border-radius:20px;">
      <span style="width:6px;height:6px;border-radius:50%;background:${cfg.color};flex-shrink:0;"></span>
      ${cfg.label}</span>`;
  }

  let _editingAnag = false;

  function renderAnagrafica() {
    const c = ONBOARDING;
    if (_editingAnag) { renderAnagForm(); return; }

    const grid = $('cd-anag-grid') || $('cd-anag-list');
    if (!grid) return;

    const f = (label, val, cls = '') => `
      <div class="mac-form-row">
        <div class="mac-form-label">${label}</div>
        <div class="mac-form-value ${cls}">${val || ''}</div>
      </div>`;

    const editPencil = `<button class="btn-action-icon" id="cd-btn-edit-anag" title="Modifica" style="width:28px;height:28px;background:white;border:1px solid #e5e7eb;border-radius:6px;color:#3b82f6;margin-left:auto;"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125"></path></svg></button>`;

    grid.innerHTML = `
      <div class="mac-section-title" style="margin-top:0;">
        <span>Dati Anagrafici</span>
        ${editPencil}
      </div>
      <div class="mac-form-list">
        ${f('Stato Lifecycle', statusBadge(c.status))}
        ${f('Ragione sociale / Lead', c.company_name ? `<strong>${c.company_name}</strong>` : (c.lead_name ? `<strong>${c.lead_name}</strong>` : null))}
        ${f('Nome referente', c.lead_name)}
        ${f('Email', c.email ? `<a href="mailto:${c.email}">${c.email}</a>` : null)}
        ${f('Telefono', c.phone ? `<a href="tel:${c.phone}">${c.phone}</a>` : null)}
        ${f('Lingua', (c.lang || 'it').toUpperCase())}
        ${f('Servizio richiesto', c.service_name || '')}
      </div>

      <div class="mac-section-title" style="margin-top:24px;"><span>Indirizzo e Fatturazione</span></div>
      <div class="mac-form-list">
        ${f('Via / Indirizzo', c.address)}
        ${f('Città', c.city)}
        ${f('CAP', c.cap, 'mono')}
        ${f('Provincia', c.prov, 'mono')}
        ${f('Partita IVA', c.vat_number, 'mono')}
        ${f('Codice Fiscale', c.cf, 'mono')}
        ${f('Codice SDI', c.sdi, 'mono')}
        ${f('PEC', c.pec)}
      </div>

      ${c.notes ? `<div class="mac-section-title" style="margin-top:24px;"><span>Note interne</span></div>
      <div class="mac-form-list">
        <div style="font-size:14.5px;line-height:1.6;color:#86868b;white-space:pre-wrap;padding:12px 16px;">${c.notes}</div>
      </div>` : ''}`;

    const pencilBtn = $('cd-btn-edit-anag');
    if (pencilBtn) pencilBtn.onclick = () => { _editingAnag = true; renderAnagrafica(); };
  }

  function renderAnagForm() {
    const c = ONBOARDING;
    const statusOpts = Object.entries(STATUS_LABELS).map(([v, cfg]) =>
      `<option value="${v}" ${c.status===v?'selected':''}>${cfg.label}</option>`).join('');

    const grid = $('cd-anag-grid') || $('cd-anag-list');
    if (!grid) return;
    const sec = (title) => `<div class="zf-section-hd" style="margin-top:20px;margin-bottom:8px;padding-top:16px;border-top:1px solid #f1f5f9;"><div class="zf-section-title">${title}</div></div>`;

    grid.innerHTML = `
      <div class="mac-form-header" style="justify-content:space-between;margin-top:0;">
        <button id="anag-cancel-btn-top" class="mac-btn-text text-cancel">Annulla</button>
        <button id="anag-save-btn" class="mac-btn-text text-save">Salva</button>
      </div>

      <div class="mac-form-list" style="margin-top:16px;">
        <div class="mac-form-row">
          <label class="mac-form-label">Stato lifecycle</label>
          <select class="mac-form-input" id="anag-status">${statusOpts}</select>
        </div>
      </div>

      <div class="mac-form-section">Dati Azienda</div>
      <div class="mac-form-list">
        <div class="mac-form-row">
          <label class="mac-form-label">Ragione sociale</label>
          <input class="mac-form-input" id="anag-company-name" type="text" value="${c.company_name||''}"/>
        </div>
        <div class="mac-form-row">
          <label class="mac-form-label">Nome contatto</label>
          <input class="mac-form-input" id="anag-lead-name" type="text" value="${c.lead_name||''}"/>
        </div>
        <div class="mac-form-row">
          <label class="mac-form-label">Email</label>
          <input class="mac-form-input" id="anag-email" type="email" value="${c.email||''}"/>
        </div>
        <div class="mac-form-row">
          <label class="mac-form-label">Telefono</label>
          <input class="mac-form-input" id="anag-phone" type="tel" value="${c.phone||''}"/>
        </div>
        <div class="mac-form-row">
          <label class="mac-form-label">Lingua</label>
          <select class="mac-form-input" id="anag-lang">
            <option value="it" ${c.lang==='it'?'selected':''}>Italiano</option>
            <option value="en" ${c.lang==='en'?'selected':''}>English</option>
          </select>
        </div>
      </div>

      <div class="mac-form-section">Dati Fiscali</div>
      <div class="mac-form-list">
        <div class="mac-form-row">
          <label class="mac-form-label">Partita IVA</label>
          <input class="mac-form-input" id="anag-vat" type="text" value="${c.vat_number||''}"/>
        </div>
        <div class="mac-form-row">
          <label class="mac-form-label">PEC</label>
          <input class="mac-form-input" id="anag-pec" type="email" value="${c.pec||''}"/>
        </div>
        <div class="mac-form-row">
          <label class="mac-form-label">Codice SDI</label>
          <input class="mac-form-input" id="anag-sdi" type="text" value="${c.dest_code||''}" maxlength="7"/>
        </div>
        <div class="mac-form-row">
          <label class="mac-form-label">IBAN</label>
          <input class="mac-form-input" id="anag-iban" type="text" value="${c.iban||''}" placeholder="IT..."/>
        </div>
      </div>

      <div class="mac-form-section">Indirizzo</div>
      <div class="mac-form-list">
        <div class="mac-form-row">
          <label class="mac-form-label">Indirizzo</label>
          <input class="mac-form-input" id="anag-address" type="text" value="${c.address||''}"/>
        </div>
        <div class="mac-form-row">
          <label class="mac-form-label">Città</label>
          <input class="mac-form-input" id="anag-city" type="text" value="${c.city||''}"/>
        </div>
      </div>

      <div class="mac-form-section">Note Interne</div>
      <div class="mac-form-list">
        <div class="mac-form-row" style="align-items:flex-start;">
          <textarea class="mac-form-input" id="anag-notes" rows="4" style="text-align:left;height:80px!important;padding-left:0;color:#000;" placeholder="Digita le note...">${c.notes||''}</textarea>
        </div>
      </div>

      `;



    const _cancelAnag = () => { _editingAnag = false; renderAnagrafica(); };
    $('anag-cancel-btn-top').onclick = _cancelAnag;
    $('anag-save-btn').onclick   = async () => {
      const name = $('anag-lead-name')?.value?.trim() || null;
      const payload = {
        lead_name: name,
        company_name: $('anag-company-name')?.value?.trim() || null,
        email:   $('anag-email')?.value?.trim() || null,
        phone:   $('anag-phone')?.value?.trim() || null,
        vat_number: $('anag-vat')?.value?.trim() || null,
        pec:     $('anag-pec')?.value?.trim() || null,
        dest_code: $('anag-sdi')?.value?.trim() || null,
        iban:    $('anag-iban')?.value?.trim() || null,
        address: $('anag-address')?.value?.trim() || null,
        city:    $('anag-city')?.value?.trim() || null,
        lang:    $('anag-lang')?.value || 'it',
        status:  $('anag-status')?.value || 'prospect',
        notes:   $('anag-notes')?.value?.trim() || null,
      };
      // Remove null values
      Object.keys(payload).forEach(k => { if (payload[k] === null) delete payload[k]; });
      try {
        ONBOARDING = await API.Onboarding.update(onboardingId, payload);
        _editingAnag = false;
        renderHeader();
        renderAnagrafica();
        renderPipeline();
        UI.toast('Anagrafica aggiornata', 'success');
      } catch (e) { UI.toast(e?.message || 'Errore', 'error'); }
    };
  }

  /* ── ② Contacts ─────────────────────────────────────────────── */
  async function loadContacts() {
    const el = $('cd-contacts-list');
    if (!el) return;
    el.innerHTML = UI.skeletonCardList(2);
    try {
      const res  = [];
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
        return `<div class="z-contact-row">
          <div class="z-contact-avatar">${initials}</div>
          <div class="z-contact-info">
            <div class="z-contact-name">${ct.name || ''}${ct.is_primary ? '<span style="font-size:10px;font-weight:700;color:#3b82f6;background:#eff6ff;padding:1px 7px;border-radius:20px;margin-left:8px;">Principale</span>' : ''}</div>
            ${ct.role ? `<div class="z-contact-role">${ct.role}</div>` : ''}
            <div class="z-contact-links">
              ${ct.email ? `<a href="mailto:${ct.email}" class="z-contact-link"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"/></svg>${ct.email}</a>` : ''}
              ${ct.phone ? `<a href="tel:${ct.phone}" class="z-contact-link"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 6z"/></svg>${ct.phone}</a>` : ''}
            </div>
          </div>
        </div>`;
      }).join('');
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
          <div class="z-qc-card">
            <div class="z-qc-name">${ct.name || ''}</div>
            ${ct.role ? `<div class="z-qc-role">${ct.role}</div>` : ''}
            <div class="z-qc-links">
              ${ct.email ? `<a href="mailto:${ct.email}" class="z-qc-link"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"/></svg>${ct.email}</a>` : ''}
              ${ct.phone ? `<a href="tel:${ct.phone}" class="z-qc-link"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 6z"/></svg>${ct.phone}</a>` : ''}
            </div>
          </div>`).join('')}
      </div>`;
  }

  /* ── ③ Services ─────────────────────────────────────────────── */
  async function loadServices() {
    const el = $('cd-services-list');
    if (!el) return;
    el.innerHTML = UI.skeletonCardList(2);
    try {
      const res  = [];
      const data = Array.isArray(res) ? res : (res?.data || res?.items || []);
      const chip = $('chip-services');
      if (chip) chip.textContent = data.length;
      const kpi = $('chip-services-kpi');
      if (kpi) kpi.textContent = data.length;
      if (!data.length) {
        el.innerHTML = `<div class="list-card">${UI.createEmptyState(null, I18n.t('cl.no_services') || 'Nessun servizio attivo.')}</div>`;
        return;
      }
      el.innerHTML = data.map(s => `
        <div class="list-card">
          <div class="list-card-header">
            <div class="list-card-title">${s.service_name || s.name || 0}</div>
            ${UI.pill(s.status)}
          </div>
          <div class="list-card-body">
            <div class="list-card-meta">${I18n.t('cl.f_cycle') || 'Ciclo'}: ${s.billing_cycle || 0}</div>
            <div class="list-card-meta">${I18n.t('cl.f_start_date') || 'Inizio'}: ${s.start_date ? UI.date(s.start_date) : 0}</div>
          </div>
        </div>`).join('');
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
      const res  = await API.Contracts?.list({onboarding_id: onboardingId});
      const data = Array.isArray(res) ? res : (res?.data || res?.items || []);
      const active = data.filter(c => ['active','signed'].includes(c.status)).length;
      const chip = $('chip-contracts');
      if (chip) chip.textContent = active;
      const kpi = $('chip-contracts-kpi');
      if (kpi) kpi.textContent = active;
      if (!data.length) {
        el.innerHTML = `<div class="list-card">${UI.createEmptyState(null, I18n.t('cl.no_contracts') || 'Nessun contratto.')}</div>`;
        return;
      }
      el.innerHTML = data.map(c => `
        <div class="list-card">
          <div class="list-card-header">
            <div class="list-card-title">${c.title || I18n.t('nav.contracts') || 'Contratto'}</div>
            ${UI.pill(c.status)}
          </div>
          <div class="list-card-body">
            <div class="list-card-meta">${I18n.t('cl.created_at') || 'Creato'}: ${UI.date(c.created_at)}</div>
            ${c.expires_at ? `<div class="list-card-meta">${I18n.t('cl.expires_at') || 'Scadenza'}: ${UI.date(c.expires_at)}</div>` : ''}
          </div>
        </div>`).join('');
    } catch {
      el.innerHTML = `<div class="list-card">${UI.createEmptyState(null, I18n.t('error.generic') || 'Errore.')}</div>`;
    }
  }

  /* ── ⑤ Documents ────────────────────────────────────────────── */
  async function loadDocuments() {
    const el = $('cd-docs-list');
    if (!el) return;
    el.innerHTML = UI.skeletonCardList(2);
    try {
      const res  = [];
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
            <div class="list-card-title">${d.name || d.filename || 0}</div>
            ${UI.pill(d.status || 'active')}
          </div>
          <div class="list-card-body">
            ${d.size ? `<div class="list-card-meta">${Math.round(d.size/1000)} KB</div>` : ''}
            <div class="list-card-meta">${UI.date(d.created_at || d.uploaded)}</div>
            ${d.download_url ? `<a href="${d.download_url}" target="_blank" class="btn btn-ghost btn-sm" style="margin-top:6px;">${I18n.t('common.download') || 'Scarica'}</a>` : ''}
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
      const res  = await API.Quotes?.list({onboarding_id: onboardingId});
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
        <tbody>${data.map(q => `<tr>
          <td class="z-rt-name">${q.title || q.quote_number || q.number || 'Preventivo'}</td>
          <td class="z-rt-date">${q.created_at ? UI.date(q.created_at) : ''}</td>
          <td class="z-rt-amt">${UI.currency(q.total_amount || q.total || 0, q.currency)}</td>
          <td>${UI.pill(q.status)}</td>
          <td><a href="admin_quotes.html?id=${q.id}" class="z-rt-link">Apri →</a></td>
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
      const res  = await API.Invoices?.list({onboarding_id: onboardingId});
      const data = Array.isArray(res) ? res : (res?.data || res?.items || []);
      const open = data.filter(i => !['paid','cancelled'].includes(i.status)).length;
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
          <th>N° Fattura</th><th>Data</th><th>Scadenza</th><th>Importo</th><th>Stato</th>
        </tr></thead>
        <tbody>${data.map(i => `<tr>
          <td class="z-rt-name">${i.invoice_number || i.number || ''}</td>
          <td class="z-rt-date">${i.issue_date ? UI.date(i.issue_date) : ''}</td>
          <td class="z-rt-date">${i.due_date ? UI.date(i.due_date) : ''}</td>
          <td class="z-rt-amt">${UI.currency(i.total_amount || i.total, i.currency)}</td>
          <td>${UI.pill(i.status)}</td>
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
      const res  = endpoint ? await endpoint(onboardingId) : [];
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
          windoc_id:       ONBOARDING.windoc_id,
          windoc_status:   ONBOARDING.windoc_sync_at ? 'synced' : 'not_configured',
          windoc_last_sent: ONBOARDING.windoc_sync_at,
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
        entityType:  'client',
        entityId:    onboardingId,
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
       await window.API.post(`/onboarding/${onboardingId}/notes`, { content });
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
      await API.Services.subscribe({ onboarding_id: onboardingId, service_id: sId, billing_cycle: $('f-service-cycle')?.value || 'monthly', start_date: $('f-service-start')?.value || null });
      $('modal-add-service').classList.remove('open');
      UI.toast(I18n.t('cl.service_added') || 'Servizio aggiunto', 'success');
      loadServices();
    } catch (e) { UI.toast(e.message || I18n.t('error.generic'), 'error'); }
  });

  /* ── Add Contact Modal ──────────────────────────────────────── */
  $('cd-btn-add-contact')?.addEventListener('click', () => {
    $('modal-add-contact')?.classList.add('open');
  });

  $('modal-contact-save')?.addEventListener('click', async () => {
    const name = $('fc-name')?.value?.trim();
    if (!name) { UI.toast(I18n.t('cl.form_required') || 'Nome obbligatorio', 'warning'); return; }
    try {
      await API.Clients.addContact?.(onboardingId, {
        lead_name: name, role: $('fc-role')?.value?.trim() || null,
        email: $('fc-email')?.value?.trim() || null,
        phone: $('fc-phone')?.value?.trim() || null,
      });
      $('modal-add-contact').classList.remove('open');
      UI.toast(I18n.t('cl.contact_added') || 'Contatto aggiunto', 'success');
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

