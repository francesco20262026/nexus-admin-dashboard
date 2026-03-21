/* admin_companies.js — Multi-tenant company management */
'use strict';
(function () {
  Auth.guard('admin');
  Auth.initUI();

  let ALL = [];
  let _editingId    = null;
  let _intCompanyId = null;
  let _activeIntTab = 'windoc';

  const $ = id => document.getElementById(id);

  // ── Safe API.Companies shim (backward compat with cached api.js) ──
  function _co() {
    if (API.Companies) return API.Companies;
    return {
      list:            ()               => API.get('/companies'),
      create:          (body)           => API.post('/companies', body),
      update:          (id, body)       => API.put(`/companies/${id}`, body),
      remove:          (id)             => API.del(`/companies/${id}`),
      integrations:    (id)             => API.get(`/companies/${id}/integrations`),
      saveIntegration: (id, type, cfg)  => API.put(`/companies/${id}/integrations/${type}`, { config: cfg }),
    };
  }

  function switchIntTab(tab) {
    _activeIntTab = tab;
    $('int-tab-bar')?.querySelectorAll('[data-int-tab]').forEach(b =>
      b.classList.toggle('active', b.dataset.intTab === tab)
    );
    const fw = $('int-form-windoc'); if (fw) fw.style.display = tab === 'windoc'    ? '' : 'none';
    const fz = $('int-form-zoho');   if (fz) fz.style.display = tab === 'zoho_sign' ? '' : 'none';
  }

  // ── Load ─────────────────────────────────────────────────
  async function load() {
    const list = $('comp-list');
    if (!list) return;
    list.innerHTML = UI.skeletonCardList(3);
    try {
      const res = await _co().list();
      ALL = Array.isArray(res) ? res : [];
    } catch (e) {
      ALL = [];
      list.innerHTML = UI.errorState(e.message, 'window._reloadCompanies()');
      return;
    }
    updateKpis();
    render();
  }

  window._reloadCompanies = load;

  function updateKpis() {
    const total  = ALL.length;
    const windoc = ALL.filter(c => c.windoc_active).length;
    const zoho   = ALL.filter(c => c.zoho_active).length;
    const none   = ALL.filter(c => !c.windoc_active && !c.zoho_active).length;
    const set = (id, v, m) => {
      const el = $(id); if (el) el.textContent = v;
      const em = $(id + '-meta'); if (em && m !== undefined) em.textContent = m;
    };
    set('kpi-comp-total',  total,  'Tenant registrati');
    set('kpi-comp-windoc', windoc, 'Con firma digitale');
    set('kpi-comp-zoho',   zoho,   'Con firma Zoho');
    set('kpi-comp-none',   none,   'Da configurare');
  }

  function render() {
    const list = $('comp-list');
    if (!list) return;
    if (!ALL.length) {
      list.innerHTML = `<div class="list-card">${UI.createEmptyState(null, 'Nessuna azienda trovata. Crea la prima con il pulsante in alto.')}</div>`;
      return;
    }
    const activeId = API.getCompanyId();
    list.innerHTML = ALL.map(c => {
      const isActive   = c.id === activeId;
      const initials   = (c.name || '?').split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');
      const safeName   = (c.name || '').replace(/'/g, "\\'");
      const windocPill = c.windoc_active
        ? `<span style="font-size:11px;font-weight:600;color:var(--color-success);background:#f0fdf4;padding:2px 8px;border-radius:20px;">Windoc ✓</span>`
        : `<span style="font-size:11px;font-weight:600;color:var(--gray-400);background:var(--gray-100);padding:2px 8px;border-radius:20px;">Windoc —</span>`;
      const zohoPill = c.zoho_active
        ? `<span style="font-size:11px;font-weight:600;color:#0ea5e9;background:#f0f9ff;padding:2px 8px;border-radius:20px;">Zoho ✓</span>`
        : `<span style="font-size:11px;font-weight:600;color:var(--gray-400);background:var(--gray-100);padding:2px 8px;border-radius:20px;">Zoho —</span>`;
      return `<div class="list-card fade-in" data-id="${c.id}">
        <div class="list-card-header">
          <div style="display:flex;align-items:center;gap:12px;">
            <div class="avatar" style="width:40px;height:40px;font-size:14px;flex-shrink:0;">${initials}</div>
            <div>
              <div class="list-card-title" style="margin:0;display:flex;align-items:center;gap:8px;">
                ${c.name}
                ${isActive ? '<span style="font-size:11px;color:var(--brand-600);font-weight:600;background:var(--brand-50,#eff6ff);padding:1px 6px;border-radius:10px;">Attiva</span>' : ''}
              </div>
              <div style="font-size:12px;color:var(--gray-500);margin-top:2px;">
                slug: <code style="background:var(--gray-100);padding:1px 5px;border-radius:4px;font-size:11px;">${c.slug}</code>
                &nbsp;·&nbsp; ${c.default_lang?.toUpperCase() || 'IT'}
              </div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end;">${windocPill}${zohoPill}</div>
        </div>
        <div class="list-card-body" style="flex-wrap:wrap;">
          <div class="list-card-meta">
            <svg style="width:13px;height:13px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"/></svg>
            Creata: ${UI.date(c.created_at)}
          </div>
          <div class="row-actions" style="width:100%;justify-content:flex-end;margin-top:4px;">
            <button class="btn btn-secondary btn-sm" onclick="openIntegrationsModal('${c.id}','${safeName}')">
              <svg style="width:13px;height:13px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/></svg>
              Integrazioni
            </button>
            <button class="btn btn-ghost btn-sm" onclick="openCompanyModal('${c.id}','${safeName}','${c.slug}')">Rinomina</button>
            ${!isActive ? `<button class="btn btn-ghost btn-sm" style="color:var(--color-danger);" onclick="deleteCompany('${c.id}','${safeName}')">Elimina</button>` : ''}
          </div>
        </div>
      </div>`;
    }).join('');
  }

  // ── Company modal ─────────────────────────────────────────
  window.openCompanyModal = function(id, name, slug) {
    _editingId = id || null;
    $('modal-comp-title').textContent = id ? 'Rinomina azienda' : 'Nuova azienda';
    const nameEl = $('comp-name'); if (nameEl) nameEl.value = name || '';
    const slugEl = $('comp-slug'); if (slugEl) slugEl.value = slug || '';
    const sg = $('comp-slug-group'); if (sg) sg.style.display = id ? 'none' : '';
    $('modal-company').classList.add('open');
    setTimeout(() => $('comp-name')?.focus(), 100);
  };

  // ── Integrations modal ────────────────────────────────────
  window.openIntegrationsModal = function(companyId, companyName) {
    _intCompanyId = companyId;
    const t = $('modal-int-title'); if (t) t.textContent = `Integrazioni — ${companyName}`;
    ['int-windoc-token-app','int-windoc-token','int-zoho-client-id','int-zoho-client-secret','int-zoho-refresh-token']
      .forEach(id => { const el = $(id); if (el) el.value = ''; });
    switchIntTab('windoc');
    $('modal-integrations').classList.add('open');
  };

  // ── Delete ────────────────────────────────────────────────
  window.deleteCompany = async function(id, name) {
    if (!confirm(`Eliminare l'azienda "${name}"?\n\nQuesta operazione è irreversibile.`)) return;
    try {
      await _co().remove(id);
      UI.toast('Azienda eliminata', 'info');
      await load();
    } catch(e) { UI.toast(e?.message || 'Errore eliminazione', 'error'); }
  };

  // ── Init: everything DOM-dependent here ──────────────────
  document.addEventListener('DOMContentLoaded', async () => {
    await I18n.init('lang-switcher-slot');

    // Page action buttons (rendered by HTML, wired here)
    $('btn-refresh')?.addEventListener('click', load);
    $('btn-new-company')?.addEventListener('click', () => openCompanyModal());

    // Inject page-actions HTML if the slot exists
    const act = $('page-actions');
    if (act && !$('btn-refresh')) {
      act.innerHTML = `
        <button class="btn btn-secondary" id="btn-refresh">
          <svg style="width:15px;height:15px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>
          <span>Aggiorna</span>
        </button>
        <button class="btn btn-primary" id="btn-new-company">
          <svg style="width:15px;height:15px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
          <span>Nuova azienda</span>
        </button>`;
      $('btn-refresh').addEventListener('click', load);
      $('btn-new-company').addEventListener('click', () => openCompanyModal());
    }

    $('int-tab-bar')?.querySelectorAll('[data-int-tab]').forEach(btn =>
      btn.addEventListener('click', () => switchIntTab(btn.dataset.intTab))
    );

    $('btn-save-company')?.addEventListener('click', async () => {
      const name = $('comp-name')?.value?.trim();
      const slug = $('comp-slug')?.value?.trim() || undefined;
      if (!name) { UI.toast('Il nome è obbligatorio', 'warning'); return; }
      const btn = $('btn-save-company');
      if (btn) btn.disabled = true;
      try {
        if (_editingId) {
          await _co().update(_editingId, { name });
          UI.toast('Azienda rinominata', 'success');
        } else {
          await _co().create({ name, slug });
          UI.toast('Azienda creata', 'success');
        }
        $('modal-company').classList.remove('open');
        await load();
      } catch(e) { UI.toast(e?.message || 'Errore', 'error'); }
      finally { if (btn) btn.disabled = false; }
    });

    $('btn-save-integration')?.addEventListener('click', async () => {
      const btn = $('btn-save-integration');
      if (btn) btn.disabled = true;
      try {
        let cfg;
        if (_activeIntTab === 'windoc') {
          const tokenApp = $('int-windoc-token-app')?.value?.trim();
          const token    = $('int-windoc-token')?.value?.trim();
          if (!tokenApp || !token) { UI.toast('Token App e Token sono obbligatori', 'warning'); return; }
          cfg = { token_app: tokenApp, token };
        } else {
          const clientId     = $('int-zoho-client-id')?.value?.trim();
          const clientSecret = $('int-zoho-client-secret')?.value?.trim();
          const refreshToken = $('int-zoho-refresh-token')?.value?.trim();
          const domain       = $('int-zoho-domain')?.value || 'eu';
          if (!clientId || !clientSecret || !refreshToken) { UI.toast('Tutti i campi Zoho sono obbligatori', 'warning'); return; }
          cfg = { client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, domain };
        }
        await _co().saveIntegration(_intCompanyId, _activeIntTab, cfg);
        UI.toast('Integrazione salvata', 'success');
        $('modal-integrations').classList.remove('open');
        await load();
      } catch(e) { UI.toast(e?.message || 'Errore salvataggio', 'error'); }
      finally { if (btn) btn.disabled = false; }
    });

    await load();
  });
})();
