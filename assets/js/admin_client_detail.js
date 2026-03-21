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

  /* ── Tabs ───────────────────────────────────────────────────── */
  const tabButtons = document.querySelectorAll('.detail-tab');
  const panels     = document.querySelectorAll('.detail-panel');

  function activateTab(name) {
    tabButtons.forEach(b => b.classList.toggle('active', b.dataset.panel === name));
    panels.forEach(p => p.classList.toggle('active', p.id === 'panel-' + name));
  }

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => activateTab(btn.dataset.panel));
  });

  /* ── Deep-link quick links from list page ────────────────────── */
  function updateDeepLinks() {
    const safe = encodeURIComponent(clientId);
    const el   = $('cd-link-invoices');  if (el)  el.href = `admin_invoices.html?client_id=${safe}`;
    const ec   = $('cd-link-contracts'); if (ec)  ec.href = `admin_contracts.html?client_id=${safe}`;
    const ed   = $('cd-link-docs');      if (ed)  ed.href = `admin_documents.html?client_id=${safe}`;
    const er   = $('cd-link-renewals');  if (er)  er.href = `admin_renewals.html?client_id=${safe}`;
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

  /* ── Header ─────────────────────────────────────────────────── */
  function renderHeader() {
    const c = CLIENT;
    $('cd-title').textContent        = c.name || 0;
    $('cd-subtitle').textContent     = c.email || '';
    $('cd-status-pill').innerHTML    = UI.pill(c.status);
    document.title                   = `${c.name} — Nexus Admin`;
  }

  /* ── ① Anagrafica ───────────────────────────────────────────── */
  function renderAnagrafica() {
    const c = CLIENT;
    const fields = [
      { label: I18n.t('cl.f_name')    || 'Ragione sociale',  val: c.name },
      { label: I18n.t('cl.f_vat')     || 'Partita IVA',      val: c.vat_number || c.fiscal_code },
      { label: I18n.t('cl.f_sdi')     || 'Codice SDI',       val: c.dest_code  || c.sdi_code },
      { label: I18n.t('cl.f_sector')  || 'Settore',          val: c.sector },
      { label: I18n.t('cl.f_pec')     || 'PEC',              val: c.pec },
      { label: I18n.t('cl.f_address') || 'Indirizzo',        val: [c.address, c.city].filter(Boolean).join(', ') },
      { label: I18n.t('cl.created_at') || 'Creato il',       val: c.created_at ? UI.date(c.created_at) : 0 },
      { label: I18n.t('cl.status')    || 'Stato',            val: c.status },
    ];

    $('cd-anag-grid').innerHTML = `
      <div class="info-grid">
        ${fields.map(f => `
          <div class="info-field">
            <div class="info-label">${f.label}</div>
            <div class="info-val">${f.val || 0}</div>
          </div>`).join('')}
        ${c.notes ? `<div class="info-field" style="grid-column:1/-1;">
          <div class="info-label">${I18n.t('cl.f_notes') || 'Note'}</div>
          <div class="info-val" style="white-space:pre-wrap;">${c.notes}</div>
        </div>` : ''}
      </div>`;
  }

  /* ── ② Contacts ─────────────────────────────────────────────── */
  async function loadContacts() {
    const el = $('cd-contacts-list');
    if (!el) return;
    el.innerHTML = UI.skeletonCardList(2);
    try {
      const res  = await API.Clients.contacts?.(clientId);
      const data = Array.isArray(res) ? res : (res?.data || res?.items || []);
      if (!data.length) {
        el.innerHTML = `<div class="list-card">${UI.createEmptyState(null, I18n.t('cl.no_contacts') || 'Nessun contatto aggiunto.')}</div>`;
        return;
      }
      el.innerHTML = data.map(ct => `
        <div class="list-card">
          <div class="list-card-header">
            <div class="list-card-title">${ct.name || 0}${ct.role ? ` <span style="font-size:11px;color:var(--gray-500);font-weight:400;">· ${ct.role}</span>` : ''}</div>
          </div>
          <div class="list-card-body">
            ${ct.email ? `<div class="list-card-meta">${ct.email}</div>` : ''}
            ${ct.phone ? `<div class="list-card-meta">${ct.phone}</div>` : ''}
          </div>
        </div>`).join('');
    } catch {
      el.innerHTML = `<div class="list-card">${UI.createEmptyState(null, I18n.t('error.generic') || 'Errore.')}</div>`;
    }
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
      if (!data.length) {
        el.innerHTML = `<div class="list-card">${UI.createEmptyState(null, I18n.t('cl.no_invoices') || 'Nessuna fattura.')}</div>`;
        return;
      }
      el.innerHTML = data.map(i => `
        <div class="list-card">
          <div class="list-card-header">
            <div class="list-card-title">${i.invoice_number || i.number || 0}</div>
            ${UI.pill(i.status)}
          </div>
          <div class="list-card-body">
            <div class="list-card-meta" style="font-weight:700;color:var(--gray-900);">${UI.currency(i.total_amount || i.total, i.currency)}</div>
            <div class="list-card-meta">${UI.date(i.issue_date)} — ${I18n.t('cl.expires_at') || 'Scad.'}: ${UI.date(i.due_date)}</div>
          </div>
        </div>`).join('');
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
          windoc_status:   CLIENT.windoc_sync_status,
          windoc_last_sent: CLIENT.windoc_last_sent,
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
            <div class="info-val" style="font-family:monospace;font-size:13px;">${windocId || 0}</div>
          </div>
          <div class="info-field">
            <div class="info-label">${I18n.t('cl.windoc_status_label') || 'Stato sync'}</div>
            <div class="info-val" style="color:var(--color-${statusColor});font-weight:600;">${statusLabel}</div>
          </div>
          <div class="info-field">
            <div class="info-label">${I18n.t('cl.windoc_last_sent') || 'Ultimo invio'}</div>
            <div class="info-val">${lastSent ? UI.date(lastSent) : 0}</div>
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
    try {
      UI.toast(I18n.t('cl.windoc_verifying') || 'Verifica in corso…', 'info');
      const res = await API.post(`/clients/${clientId}/verify-windoc`);
      UI.toast(res?.ok ? (I18n.t('cl.windoc_ok') || 'Connessione ok') : (I18n.t('cl.windoc_error') || 'Errore'), res?.ok ? 'success' : 'error');
    } catch (e) {
      UI.toast(e?.message || I18n.t('error.generic'), 'error');
    }
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
    UI.toast(I18n.t('common.coming_soon') || 'Modifica cliente — in arrivo', 'info');
  });
  $('cd-btn-edit-anag')?.addEventListener('click', () => {
    UI.toast(I18n.t('common.coming_soon') || 'Modifica anagrafica — in arrivo', 'info');
  });

  /* ── Lazy load tabs on click ────────────────────────────────── */
  const loaded = {};
  const tabLoaders = {
    anagrafica: () => null,  // already loaded with client
    contacts:   loadContacts,
    services:   loadServices,
    contracts:  loadContracts,
    documents:  loadDocuments,
    invoices:   loadInvoices,
    renewals:   loadRenewals,
    windoc:     loadWindoc,
  };

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = btn.dataset.panel;
      if (!loaded[panel] && tabLoaders[panel]) {
        tabLoaders[panel]();
        loaded[panel] = true;
      }
    });
  });

  /* ── Company switch ─────────────────────────────────────────── */
  window.addEventListener('nexusCompanyChanged', () => {
    location.href = 'admin_clients.html';
  });

  /* ── Init ───────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', async () => {
    await I18n.init('lang-switcher-slot');
    await loadClient();

    // Open tab from URL param & preload it
    if (openTab && tabLoaders[openTab]) {
      activateTab(openTab);
      tabLoaders[openTab]();
      loaded[openTab] = true;
    } else {
      // Preload all data for chips without rendering UI
      loadServices();  loaded['services']  = true;
      loadContracts(); loaded['contracts'] = true;
      loadInvoices();  loaded['invoices']  = true;
      loadDocuments(); loaded['documents'] = true;
      loadRenewals();  loaded['renewals']  = true;
    }
  });

})();
