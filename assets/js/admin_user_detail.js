/* admin_user_detail.js — User detail: profile, company+client associations, security */
'use strict';
(function () {
  Auth.guard('admin');
  Auth.initUI();

  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const USER_ID = params.get('id');

  if (!USER_ID) { location.href = 'admin_users.html'; return; }

  let _user = null;
  let _allCompanies = [];
  let _allClients   = [];

  const ROLE_LABELS = { admin: 'Admin', operator: 'Operatore' };
  const STATUS_MAP  = {
    active:   { label: 'Attivo',      color: '#16a34a', bg: '#f0fdf4' },
    inactive: { label: 'Disattivato', color: '#dc2626', bg: '#fef2f2' },
    invited:  { label: 'In attesa',   color: '#d97706', bg: '#fffbeb' },
  };

  // ── Load ─────────────────────────────────────────────────
  async function load() {
    try {
      const u = await API.get(`/users/${USER_ID}`);
      _user = u;
      renderHero(u);
      fillProfile(u);
      renderCompanies(u.companies || []);
    } catch (e) {
      UI.toast(e?.message || 'Errore caricamento utente', 'error');
    }
  }

  function avatarColor(str) {
    const colors = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#ec4899','#06b6d4','#f97316'];
    const idx = [...(str||'?')].reduce((s,c)=>s+c.charCodeAt(0),0) % colors.length;
    return colors[idx];
  }

  function renderHero(u) {
    const initials = (u.name || u.email || '?').split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');
    const color = avatarColor(u.name || u.email);

    const avatarEl = $('user-avatar-lg');
    if (avatarEl) { avatarEl.textContent = initials; avatarEl.style.background = `linear-gradient(135deg,${color},${color}cc)`; }
    const nameEl  = $('usr-detail-name');  if (nameEl)  nameEl.textContent  = u.name || u.email || '—';
    const emailEl = $('usr-detail-email'); if (emailEl) emailEl.textContent = u.email || '';
    const dateEl  = $('usr-detail-since'); if (dateEl)  dateEl.textContent  = u.created_at ? `Registrato il ${UI.date(u.created_at)}` : '';

    const s = STATUS_MAP[u.status] || STATUS_MAP.active;
    const sb = $('usr-detail-status-badge');
    if (sb) sb.innerHTML = `<span style="font-size:12px;font-weight:600;color:${s.color};background:${s.bg};padding:3px 10px;border-radius:20px;">${s.label}</span>`;
  }

  function fillProfile(u) {
    const nameEl = $('usr-edit-name');   if (nameEl)   nameEl.value = u.name || '';
    const statEl = $('usr-edit-status'); if (statEl)   statEl.value = u.status === 'inactive' ? 'inactive' : 'active';
    if (u.status === 'invited') {
      const btn = $('btn-resend-invite'); if (btn) btn.style.display = '';
    }
  }

  // ── Render company + client associations ──────────────────
  // Avatar color palette (same as companies)
  const COMP_COLORS = [
    ['#6366f1','#4338ca'], ['#8b5cf6','#6d28d9'], ['#ec4899','#be185d'],
    ['#f59e0b','#b45309'], ['#10b981','#047857'], ['#06b6d4','#0e7490'],
    ['#3b82f6','#1d4ed8'], ['#ef4444','#b91c1c'],
  ];
  function compColor(name) {
    const idx = [...(name||'?')].reduce((s,c)=>s+c.charCodeAt(0),0) % COMP_COLORS.length;
    return COMP_COLORS[idx];
  }

  function renderCompanies(companies) {
    const list = $('user-companies-list');
    if (!list) return;
    if (!companies.length) {
      list.innerHTML = `<div style="padding:32px 0;text-align:center;color:var(--gray-400);font-size:14px;">
        <div style="font-size:32px;margin-bottom:8px;">🏢</div>
        <div style="font-weight:600;color:var(--gray-600);">Nessuna azienda associata</div>
        <div style="font-size:12px;margin-top:4px;">Usa "Aggiungi azienda" per collegare questo utente.</div>
      </div>`;
      return;
    }
    list.innerHTML = companies.map(c => {
      const ini = (c.company_name || '?').split(' ').filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('');
      const [col1, col2] = compColor(c.company_name);
      return `
        <div class="assoc-row">
          <div class="assoc-avatar" style="background:linear-gradient(135deg,${col1},${col2});">${ini}</div>
          <div class="assoc-info">
            <div class="assoc-name">
              ${c.company_name}
              ${c.is_default ? '<span class="default-pill">Default</span>' : ''}
            </div>
            <div class="assoc-slug">${c.slug || ''}</div>
            ${c.client_id ? `<div class="assoc-client">
              <svg style="width:12px;height:12px;flex-shrink:0;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"/></svg>
              <strong>${c.client_name || 'Cliente collegato'}</strong>${c.client_email ? ' · ' + c.client_email : ''}
            </div>` : ''}
          </div>
          <div class="assoc-controls">
            <select class="form-input" style="width:120px;font-size:13px;padding:5px 8px;" onchange="changeRole('${c.company_id}', this.value)">
              <option value="operator" ${c.role==='operator'?'selected':''}>Operatore</option>
              <option value="admin"    ${c.role==='admin'   ?'selected':''}>Admin</option>
            </select>
            <button class="btn btn-ghost btn-sm" onclick="pickClient('${c.company_id}')" title="Associa cliente" style="padding:5px 8px;white-space:nowrap;">
              👤 Cliente
            </button>
            <button class="icon-btn" style="color:var(--color-danger);" onclick="removeCompany('${c.company_id}','${c.company_name.replace(/'/g,"\\'")}')" title="Rimuovi accesso">
              <svg style="width:15px;height:15px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/></svg>
            </button>
          </div>
        </div>`;
    }).join('');
  }

  // ── Save profile ──────────────────────────────────────────
  $('btn-save-user-profile')?.addEventListener('click', async () => {
    const name   = $('usr-edit-name')?.value?.trim();
    const status = $('usr-edit-status')?.value;
    const btn = $('btn-save-user-profile'); if (btn) btn.disabled = true;
    try {
      await API.patch(`/users/${USER_ID}`, { name: name || undefined, status });
      UI.toast('Profilo aggiornato', 'success');
      load();
    } catch (e) { UI.toast(e?.message || 'Errore', 'error'); }
    finally { if (btn) btn.disabled = false; }
  });

  $('btn-resend-invite')?.addEventListener('click', async () => {
    try { await API.post(`/users/${USER_ID}/resend-invite`, {}); UI.toast('Invito re-inviato', 'success'); }
    catch (e) { UI.toast(e?.message || 'Errore', 'error'); }
  });

  $('btn-reset-password')?.addEventListener('click', async () => {
    if (!confirm('Inviare un link di reset password a questo utente?')) return;
    const btn = $('btn-reset-password'); if (btn) btn.disabled = true;
    try {
      const res = await API.post(`/users/${USER_ID}/reset-password`, {});
      UI.toast(res.message || 'Link di reset inviato', 'success');
    } catch (e) { UI.toast(e?.message || 'Errore invio reset', 'error'); }
    finally { if (btn) btn.disabled = false; }
  });

  // ── Company associations ──────────────────────────────────
  window.changeRole = async (companyId, role) => {
    const c = _user?.companies?.find(x => x.company_id === companyId);
    try {
      await API.post(`/users/${USER_ID}/companies`, {
        company_id: companyId, role,
        client_id: c?.client_id || undefined
      });
      UI.toast('Ruolo aggiornato', 'success');
    } catch (e) { UI.toast(e?.message || 'Errore', 'error'); load(); }
  };

  window.removeCompany = async (companyId, companyName) => {
    if (!confirm(`Rimuovere accesso a "${companyName}"?`)) return;
    try {
      await API.del(`/users/${USER_ID}/companies/${companyId}`);
      UI.toast('Accesso rimosso', 'info');
      load();
    } catch (e) { UI.toast(e?.message || 'Errore', 'error'); }
  };

  // ── Pick client for association ───────────────────────────
  let _pickingCompanyId = null;
  window.pickClient = async (companyId) => {
    _pickingCompanyId = companyId;
    const sel = $('pick-client-sel');
    if (!sel) return;
    sel.innerHTML = '<option value="">Caricamento…</option>';
    $('modal-pick-client')?.classList.add('open');
    try {
      // Always reload to avoid stale cache
      const r = await API.get('/clients?page_size=200');
      _allClients = Array.isArray(r) ? r : (r?.data || r?.items || []);
      sel.innerHTML = '<option value="">-- Nessun cliente --</option>' +
        _allClients.map(cl => `<option value="${cl.id}">${cl.name}${cl.company_name ? ' · '+cl.company_name : ''}</option>`).join('');
      // Preselect current client for this company
      const existing = _user?.companies?.find(x => x.company_id === companyId);
      if (existing?.client_id) sel.value = existing.client_id;
    } catch (e) {
      sel.innerHTML = '<option value="">-- Errore caricamento --</option>';
      UI.toast('Errore caricamento clienti: ' + (e?.message || ''), 'error');
    }
  };


  $('btn-confirm-pick-client')?.addEventListener('click', async () => {
    const clientId = $('pick-client-sel')?.value || null;
    const c = _user?.companies?.find(x => x.company_id === _pickingCompanyId);
    if (!c) return;
    const btn = $('btn-confirm-pick-client'); if (btn) btn.disabled = true;
    try {
      await API.post(`/users/${USER_ID}/companies`, {
        company_id: _pickingCompanyId,
        role: c.role,
        client_id: clientId || undefined
      });
      UI.toast(clientId ? 'Cliente associato' : 'Associazione rimossa', 'success');
      $('modal-pick-client')?.classList.remove('open');
      load();
    } catch (e) { UI.toast(e?.message || 'Errore', 'error'); }
    finally { if (btn) btn.disabled = false; }
  });

  // ── Add company modal ─────────────────────────────────────
  $('btn-add-company-assoc')?.addEventListener('click', async () => {
    const sel = $('assoc-company-sel');
    if (sel && sel.options.length <= 1) {
      try {
        if (!_allCompanies.length) {
          const r = await API.get('/companies');
          _allCompanies = Array.isArray(r) ? r : [];
        }
        sel.innerHTML = _allCompanies.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
      } catch (e) { UI.toast('Errore caricamento aziende', 'error'); return; }
    }
    $('modal-add-company')?.classList.add('open');
  });

  $('btn-confirm-add-company')?.addEventListener('click', async () => {
    const companyId = $('assoc-company-sel')?.value;
    const role      = $('assoc-role-sel')?.value;
    if (!companyId) { UI.toast('Seleziona un\'azienda', 'warning'); return; }
    const btn = $('btn-confirm-add-company'); if (btn) btn.disabled = true;
    try {
      await API.post(`/users/${USER_ID}/companies`, { company_id: companyId, role });
      UI.toast('Azienda aggiunta', 'success');
      $('modal-add-company')?.classList.remove('open');
      load();
    } catch (e) { UI.toast(e?.message || 'Errore', 'error'); }
    finally { if (btn) btn.disabled = false; }
  });

  // ── Init ──────────────────────────────────────────────────
  window.onPageReady(async () => {
    await I18n.init('lang-switcher-slot');
    load();
  });
})();
