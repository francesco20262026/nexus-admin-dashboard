/* ============================================================
   admin_client_detail.js — 360° client hub
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

  /* ── View Toggles (Panoramica vs Timeline) ──────────────────── */
  window.switchMainView = function (viewId) {
    $('btn-view-pan')?.classList.toggle('active', viewId === 'panoramica');
    $('btn-view-time')?.classList.toggle('active', viewId === 'timeline');
    
    $('view-panoramica')?.classList.toggle('active', viewId === 'panoramica');
    $('view-timeline')?.classList.toggle('active', viewId === 'timeline');

    // Sidebar Elenco Correlato
    const sidebarList = $('elenco-correlato');
    if (sidebarList) {
      if (viewId === 'panoramica') {
        sidebarList.style.opacity = '1';
        sidebarList.style.pointerEvents = 'auto';
      } else {
        sidebarList.style.opacity = '0.4';
        sidebarList.style.pointerEvents = 'none';
      }
    }

    // Lazy load the timeline only when requested
    if (viewId === 'timeline' && !loaded['storico']) {
      loadStorico();
      loaded['storico'] = true;
    }
  };

  /* ── ScrollSpy for Elenco Correlato ─────────────────────────── */
  function initScrollSpy() {
    const sections = document.querySelectorAll('.z-card[id^="card-"]');
    const navItems = document.querySelectorAll('.z-nav-item[href^="#card-"]');
    
    if (!sections.length || !navItems.length) return;

    const observer = new IntersectionObserver((entries) => {
      let activeSection = null;
      entries.forEach(entry => {
        if (entry.isIntersecting && entry.intersectionRatio > 0.3) {
          activeSection = entry.target.id;
        }
      });

      if (activeSection) {
        navItems.forEach(item => {
          if (item.getAttribute('href') === '#' + activeSection) item.classList.add('active');
          else item.classList.remove('active');
        });
      }
    }, { root: null, rootMargin: '-10% 0px -70% 0px', threshold: [0.1, 0.5, 1.0] });

    sections.forEach(sec => observer.observe(sec));
  }

  /* ── Deep-link quick links from list page ────────────────────── */
  function updateDeepLinks() {
    const safe = encodeURIComponent(clientId);
    const el   = $('cd-link-invoices');  if (el)  el.href = `admin_invoices.html?client_id=${safe}`;
    const ec   = $('cd-link-contracts'); if (ec)  ec.href = `admin_contracts.html?client_id=${safe}`;
    const ed   = $('cd-link-docs');      if (ed)  ed.href = `admin_documents.html?client_id=${safe}`;
    const er   = $('cd-link-renewals');  if (er)  er.href = `admin_renewals.html?client_id=${safe}`;
    // Quick-create links with client pre-selected
    const eq   = $('cd-link-new-quote');      if (eq)  eq.href = `admin_quotes.html?new=1&client_id=${safe}`;
    const eqc  = $('cd-link-new-quote-card'); if (eqc) eqc.href = `admin_quotes.html?new=1&client_id=${safe}`;
    const einv = $('cd-link-new-invoice'); if (einv) einv.href = `admin_invoices.html?new=1&client_id=${safe}`;
    const epro = $('cd-link-new-proforma');if (epro) epro.href = `admin_invoices.html?new=1&type=proforma&client_id=${safe}`;
  }

  /* ── Load main client ────────────────────────────────────────── */
  async function loadClient() {
    try {
      CLIENT = await API.Clients.get(clientId);
      if (!CLIENT) throw new Error('not found');
      renderHeader();
      renderAnagrafica();
      updateDeepLinks();
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

  function renderHeader() {
    const c = CLIENT;
    // Name, title, breadcrumb
    const displayName = c.company_name || c.name || '—';
    if ($('cd-title'))        $('cd-title').textContent = displayName;
    if ($('breadcrumb-name')) $('breadcrumb-name').textContent = displayName;
    if ($('cd-status-pill'))  $('cd-status-pill').innerHTML = statusBadge(c.status);
    document.title = `${displayName} — Nexus Admin`;

    // subtitle: show "Nome contatto" if company is set, else nothing
    if ($('cd-subtitle')) {
      if (c.company_name && c.name && c.company_name !== c.name) {
        $('cd-subtitle').textContent = `Referente: ${c.name}`;
      } else {
        $('cd-subtitle').textContent = c.email || '';
      }
    }

    // Initials avatar (color based on first letter)
    const av = $('pc-avatar');
    if (av) {
      av.textContent = _initials(c.company_name || c.name);
      const colors = ['#4f46e5','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4'];
      const idx = ((c.company_name || c.name || 'X').charCodeAt(0)) % colors.length;
      av.style.background = `linear-gradient(135deg, ${colors[idx]} 0%, ${colors[(idx+2)%colors.length]} 100%)`;
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
        pill(createdIcon, createdStr ? `Cliente dal ${createdStr}` : null),
      ].filter(Boolean).join('');
    }
  }

  /* ── ① Anagrafica ───────────────────────────────────────────── */
  const STATUS_LABELS = {
    prospect:   { label: 'Prospect',   color: '#7c3aed', bg: '#f3e8ff' },
    pre_active: { label: 'Pre-attivo', color: '#d97706', bg: '#fef3c7' },
    active:     { label: 'Attivo',     color: '#059669', bg: '#d1fae5' },
    suspended:  { label: 'Sospeso',    color: '#dc2626', bg: '#fee2e2' },
    ceased:     { label: 'Cessato',    color: '#6b7280', bg: '#f3f4f6' },
  };

  function statusBadge(s) {
    const cfg = STATUS_LABELS[s] || { label: s || '—', color: '#6b7280', bg: '#f3f4f6' };
    return `<span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:700;
      color:${cfg.color};background:${cfg.bg};padding:3px 10px;border-radius:20px;">
      <span style="width:6px;height:6px;border-radius:50%;background:${cfg.color};flex-shrink:0;"></span>
      ${cfg.label}</span>`;
  }

  let _editingAnag = false;

  function renderAnagrafica() {
    const c = CLIENT;
    if (_editingAnag) { renderAnagForm(); return; }

    const grid = $('cd-anag-grid') || $('cd-anag-list');
    if (!grid) return;

    const f = (label, val, cls = '') => `
      <div class="zf-row">
        <div class="zf-lbl">${label}</div>
        <div class="zf-val ${cls}">${val || '—'}</div>
      </div>`;

    const editPencil = `<button class="zf-edit-link" onclick="document.getElementById('cd-btn-edit').click()">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:11px;height:11px;"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z"/></svg>
      Modifica</button>`;

    grid.innerHTML = `
      <div class="zf-section">
        <div class="zf-section-hd">
          <div class="zf-section-title">Informazioni Principali</div>
          ${editPencil}
        </div>
        <div class="zf-cols">
          <div>
            ${f('Stato', statusBadge(c.status))}
            ${f('Ragione sociale', c.company_name ? `<strong>${c.company_name}</strong>` : null)}
            ${f('Nome contatto', c.name)}
            ${f('Email', c.email ? `<a href="mailto:${c.email}">${c.email}</a>` : null)}
            ${f('Telefono', c.phone ? `<a href="tel:${c.phone}">${c.phone}</a>` : null)}
            ${f('Lingua', (c.lang || 'it').toUpperCase())}
          </div>
          <div>
            ${f('Partita IVA', c.vat_number, 'mono')}
            ${f('Codice SDI', c.dest_code, 'mono')}
            ${f('PEC', c.pec)}
            ${f('IBAN', c.iban, 'mono')}
            ${f('Cliente dal', c.created_at ? UI.date(c.created_at) : null)}
          </div>
        </div>
      </div>

      <div class="zf-section">
        <div class="zf-section-hd">
          <div class="zf-section-title">Indirizzo</div>
        </div>
        <div class="zf-cols">
          <div>
            ${f('Via / Indirizzo', c.address)}
            ${f('Città', c.city)}
          </div>
          <div></div>
        </div>
      </div>

      ${c.notes ? `<div class="zf-section">
        <div class="zf-section-hd">
          <div class="zf-section-title">Note interne</div>
        </div>
        <div style="font-size:13.5px;line-height:1.6;color:var(--gray-700);white-space:pre-wrap;padding:2px 0;">${c.notes}</div>
      </div>` : ''}`;
  }

  function renderAnagForm() {
    const c = CLIENT;
    const statusOpts = Object.entries(STATUS_LABELS).map(([v, cfg]) =>
      `<option value="${v}" ${c.status===v?'selected':''}>${cfg.label}</option>`).join('');

    const grid = $('cd-anag-grid') || $('cd-anag-list');
    if (!grid) return;
    const sec = (title) => `<div class="zf-section-hd" style="margin-top:20px;margin-bottom:8px;padding-top:16px;border-top:1px solid #f1f5f9;"><div class="zf-section-title">${title}</div></div>`;

    grid.innerHTML = `
      <div class="zf-section-hd" style="margin-bottom:12px;"><div class="zf-section-title">Modifica anagrafica</div></div>
      <div class="form-grid" style="gap:14px;">
        <div class="form-group form-grid--full">
          <label class="form-label">Stato lifecycle</label>
          <select class="form-input" id="anag-status">${statusOpts}</select>
        </div>
      </div>

      ${sec('Dati Azienda')}
      <div class="form-grid" style="gap:14px;">
        <div class="form-group">
          <label class="form-label">Ragione sociale</label>
          <input class="form-input" id="anag-company-name" type="text" value="${c.company_name||''}"/>
        </div>
        <div class="form-group">
          <label class="form-label">Nome contatto *</label>
          <input class="form-input" id="anag-name" type="text" value="${c.name||''}"/>
        </div>
        <div class="form-group">
          <label class="form-label">Email</label>
          <input class="form-input" id="anag-email" type="email" value="${c.email||''}"/>
        </div>
        <div class="form-group">
          <label class="form-label">Telefono</label>
          <input class="form-input" id="anag-phone" type="tel" value="${c.phone||''}"/>
        </div>
        <div class="form-group">
          <label class="form-label">Lingua</label>
          <select class="form-input" id="anag-lang">
            <option value="it" ${c.lang==='it'?'selected':''}>Italiano</option>
            <option value="en" ${c.lang==='en'?'selected':''}>English</option>
          </select>
        </div>
      </div>

      ${sec('Dati Fiscali')}
      <div class="form-grid" style="gap:14px;">
        <div class="form-group">
          <label class="form-label">Partita IVA</label>
          <input class="form-input" id="anag-vat" type="text" value="${c.vat_number||''}" style="font-family:monospace;"/>
        </div>
        <div class="form-group">
          <label class="form-label">PEC</label>
          <input class="form-input" id="anag-pec" type="email" value="${c.pec||''}"/>
        </div>
        <div class="form-group">
          <label class="form-label">Codice SDI</label>
          <input class="form-input" id="anag-sdi" type="text" value="${c.dest_code||''}" maxlength="7" style="font-family:monospace;"/>
        </div>
        <div class="form-group">
          <label class="form-label">IBAN</label>
          <input class="form-input" id="anag-iban" type="text" value="${c.iban||''}" placeholder="IT60X0542811101000000123456" style="font-family:monospace;"/>
        </div>
      </div>

      ${sec('Indirizzo')}
      <div class="form-grid" style="gap:14px;">
        <div class="form-group">
          <label class="form-label">Indirizzo</label>
          <input class="form-input" id="anag-address" type="text" value="${c.address||''}"/>
        </div>
        <div class="form-group">
          <label class="form-label">Città</label>
          <input class="form-input" id="anag-city" type="text" value="${c.city||''}"/>
        </div>
      </div>

      ${sec('Note interne')}
      <div class="form-group" style="margin-top:4px;">
        <textarea class="form-input" id="anag-notes" rows="3" placeholder="Note visibili solo agli admin...">${c.notes||''}</textarea>
      </div>

      <div style="display:flex;gap:8px;margin-top:20px;padding-top:16px;border-top:1px solid #f1f5f9;">
        <button class="btn btn-primary" id="anag-save-btn">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:14px;height:14px;margin-right:4px;"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
          Salva modifiche
        </button>
        <button class="btn btn-ghost" id="anag-cancel-btn">Annulla</button>
      </div>`;

    $('anag-cancel-btn').onclick = () => { _editingAnag = false; renderAnagrafica(); };
    $('anag-save-btn').onclick   = async () => {
      const name = $('anag-name')?.value?.trim();
      if (!name) { UI.toast('Nome obbligatorio', 'warning'); return; }
      const payload = {
        name,
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
        CLIENT = await API.Clients.update(clientId, payload);
        _editingAnag = false;
        renderHeader();
        renderAnagrafica();
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
        return `<div class="z-contact-row">
          <div class="z-contact-avatar">${initials}</div>
          <div class="z-contact-info">
            <div class="z-contact-name">${ct.name || '—'}${ct.is_primary ? '<span style="font-size:10px;font-weight:700;color:#059669;background:#d1fae5;padding:1px 7px;border-radius:20px;margin-left:8px;">Principale</span>' : ''}</div>
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
            <div class="z-qc-name">${ct.name || '—'}</div>
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
      const res  = await API.Clients.services(clientId);
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
      const res  = await API.Clients.contracts(clientId);
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
      const res  = await API.Clients.documents(clientId);
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
      const res  = await API.Clients.quotes(clientId);
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
          <td class="z-rt-date">${q.created_at ? UI.date(q.created_at) : '—'}</td>
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
      const res  = await API.Clients.invoices(clientId);
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
          <td class="z-rt-name">${i.invoice_number || i.number || '—'}</td>
          <td class="z-rt-date">${i.issue_date ? UI.date(i.issue_date) : '—'}</td>
          <td class="z-rt-date">${i.due_date ? UI.date(i.due_date) : '—'}</td>
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
            <div class="info-val" style="font-family:monospace;font-size:13px;">${windocId || '—'}</div>
          </div>
          <div class="info-field">
            <div class="info-label">${I18n.t('cl.windoc_status_label') || 'Stato sync'}</div>
            <div class="info-val" style="color:var(--color-${statusColor});font-weight:600;">${statusLabel}</div>
          </div>
          <div class="info-field">
            <div class="info-label">${I18n.t('cl.windoc_last_sent') || 'Ultimo invio'}</div>
            <div class="info-val">${lastSent ? UI.date(lastSent) : '—'}</div>
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
    // /verify-windoc non è implementato nel backend — usa sync-windoc per aggiornare
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
      sel.innerHTML = `<option value="">${I18n.t('cl.select_service') || '— Seleziona servizio —'}</option>` +
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
    $('modal-add-contact')?.classList.add('open');
  });

  $('modal-contact-save')?.addEventListener('click', async () => {
    const name = $('fc-name')?.value?.trim();
    if (!name) { UI.toast(I18n.t('cl.form_required') || 'Nome obbligatorio', 'warning'); return; }
    try {
      await API.Clients.addContact?.(clientId, {
        name, role: $('fc-role')?.value?.trim() || null,
        email: $('fc-email')?.value?.trim() || null,
        phone: $('fc-phone')?.value?.trim() || null,
      });
      $('modal-add-contact').classList.remove('open');
      UI.toast(I18n.t('cl.contact_added') || 'Contatto aggiunto', 'success');
      loadContacts();
    } catch (e) { UI.toast(e.message || I18n.t('error.generic'), 'error'); }
  });

  /* ── Edit button (top header) ───────────────────────────────── */
  $('cd-btn-edit')?.addEventListener('click', () => {
    _editingAnag = true;
    switchMainView('panoramica');
    renderAnagForm();
  });
  $('cd-btn-edit-anag')?.addEventListener('click', () => {
    _editingAnag = true;
    renderAnagForm();
  });

  /* ── Notes ──────────────────────────────────────────────────── */
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

  /* ── Delete Client Danger Zone ──────────────────────────────── */
  window.deleteClientFromDetail = async () => {
    if (!confirm(I18n.t('cl.confirm_delete') || 'Eliminare definitivamente questo cliente?\nL\'operazione è IRREVERSIBILE e rimuoverà anche i contatti collegati.')) return;
    try {
      window.UI.toast('Eliminazione in corso...', 'info');
      await window.API.Clients.remove(clientId);
      window.UI.toast(I18n.t('cl.deleted_ok') || 'Cliente eliminato con successo', 'success');
      setTimeout(() => { location.href = 'admin_clients.html'; }, 1000);
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
    
    // Smooth scrolling bindings per sidebar sidebar anchor clicks
    document.querySelectorAll('.z-nav-item').forEach(anchor => {
      anchor.addEventListener('click', function(e) {
        e.preventDefault();
        const targetId = this.getAttribute('href').substring(1);
        const targetSection = document.getElementById(targetId);
        if (targetSection) {
          // Add a slight offset below the fixed header
          const offset = 80;
          const rect = targetSection.getBoundingClientRect();
          const top = rect.top + window.scrollY - offset;
          window.scrollTo({ top: top, behavior: 'smooth' });
        }
      });
    });

    // Run scrolling spy
    initScrollSpy();

    // Load EVERYTHING immediately in the background since they are stacked sequentially
    setTimeout(() => { loadContacts();  loaded['contacts']  = true; }, 50);
    setTimeout(() => { loadNotes();     loaded['notes']     = true; }, 100);
    setTimeout(() => { loadServices();  loaded['services']  = true; }, 150);
    setTimeout(() => { loadContracts(); loaded['contracts'] = true; }, 200);
    setTimeout(() => { loadQuotes();    loaded['quotes']    = true; }, 250);
    setTimeout(() => { loadInvoices();  loaded['invoices']  = true; }, 300);
    setTimeout(() => { loadDocuments(); loaded['documents'] = true; }, 350);

    // Timeline will lazy load when view is switched via switchMainView()
  });

})();

