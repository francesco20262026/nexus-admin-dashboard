/* admin_users.js — Internal users & permissions management */
'use strict';
(function () {
  Auth.guard('admin');
  Auth.initUI();

  let ALL = [], filtered = [];
  const saved   = window.SessionState?.load('users') || {};
  let pg        = saved.pg  || 1;
  let activeTab = saved.tab || 'all';
  const PER = 20;

  const $ = id => document.getElementById(id);
  const list    = $('usr-list');
  const tabBar  = $('usr-tab-bar');
  const search  = $('usr-search');
  const fComp   = $('usr-filter-company');
  const info    = $('usr-info');
  const pag     = $('usr-pagination');
  const modal   = $('modal-user');

  // Page actions
  const act = $('page-actions');
  if (act) act.innerHTML = `
    <button class="btn btn-secondary" id="btn-refresh">
      <svg style="width:15px;height:15px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>
      <span>Aggiorna</span>
    </button>
    <button class="btn btn-primary" id="btn-invite">
      <svg style="width:15px;height:15px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
      <span>Invita utente</span>
    </button>`;
  $('btn-refresh')?.addEventListener('click', load);
  $('btn-invite')?.addEventListener('click',  openModal);

  tabBar?.querySelectorAll('.filter-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));
  tabBar?.addEventListener('click', e => {
    const b = e.target.closest('.filter-tab'); if (!b) return;
    tabBar.querySelectorAll('.filter-tab').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); activeTab = b.dataset.tab; pg = 1; applyFilters();
  });
  [search, fComp].forEach(el => {
    el?.addEventListener('input',  () => { pg=1; applyFilters(); });
    el?.addEventListener('change', () => { pg=1; applyFilters(); });
  });

  window.addEventListener('companyChanged', load);
  window._reloadUsers = load;

  async function load() {
    if (!list) return;
    list.innerHTML = UI.skeletonCardList(4);
    try {
      const res = await API.Users.list();
      ALL = Array.isArray(res) ? res : (res?.items ?? res?.data ?? []);
      populateCompanyFilter();
    } catch (e) {
      ALL = [];
      list.innerHTML = UI.errorState(e.message, 'window._reloadUsers()');
    }
    updateKpis();
    applyFilters();
  }

  function populateCompanyFilter() {
    if (!fComp) return;
    const prev  = fComp.value;
    const names = [...new Set(ALL.map(u => u.company_name || u.tenant_name).filter(Boolean))].sort();
    fComp.innerHTML = '<option value="">Tutte le aziende</option>' + names.map(n=>`<option value="${n}">${n}</option>`).join('');
    if (prev) fComp.value = prev;
  }

  function updateKpis() {
    const set = (id,v,m) => { const el=$(id); if(el) el.textContent=v; const em=$(id+'-meta'); if(em&&m!==undefined) em.textContent=m; };
    set('kpi-usr-total',    ALL.length,                                                           'Registrati');
    set('kpi-usr-admin',    ALL.filter(u => u.role === 'admin'    || u.role === 'super_admin').length, 'Con accesso pieno');
    set('kpi-usr-operator', ALL.filter(u => u.role === 'operator' || u.role === 'member').length, 'Accesso limitato');
    set('kpi-usr-inactive', ALL.filter(u => u.status === 'invited' || u.status === 'inactive').length, 'Inviti in attesa');
  }

  function applyFilters() {
    const q  = (search?.value || '').toLowerCase().trim();
    const ro = ''   || '';
    const st = '';
    const co = fComp?.value   || '';

    filtered = ALL.filter(u => {
      if (activeTab === 'admin'    && u.role   !== 'admin'    && u.role   !== 'super_admin') return false;
      if (activeTab === 'operator' && u.role   !== 'operator' && u.role   !== 'member')      return false;
      if (activeTab === 'invited'  && u.status !== 'invited') return false;
      if (activeTab === 'inactive' && u.status !== 'inactive') return false;
      if (ro && u.role   !== ro) return false;
      if (st && u.status !== st) return false;
      if (co && (u.company_name || u.tenant_name) !== co) return false;
      if (q) {
        const hay = [u.name, u.email, u.company_name, u.tenant_name].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const max = Math.ceil(filtered.length / PER) || 1;
    if (pg > max) pg = max;
    window.SessionState?.save('users', { pg, tab: activeTab });
    render();
  }

  const ROLE_LABELS  = { admin:'Admin', super_admin:'Super Admin', operator:'Operatore', member:'Membro', viewer:'Viewer' };
  const STATUS_COLORS = { active:'var(--color-success)', invited:'var(--color-warning)', inactive:'var(--gray-400)' };

  function render() {
    if (!list) return;
    if (!filtered.length) {
      list.innerHTML = `<div class="list-card">${UI.createEmptyState(null, ALL.length ? 'Nessun utente corrisponde ai filtri.' : 'Nessun utente registrato.')}</div>`;
      if (info) info.textContent=''; if (pag) pag.innerHTML=''; return;
    }
    const slice = filtered.slice((pg-1)*PER, pg*PER);
    list.innerHTML = slice.map(u => {
      const initials = (u.name||u.email||'?').split(' ').slice(0,2).map(w=>w[0]?.toUpperCase()||'').join('');
      const roleLabel  = ROLE_LABELS[u.role] || u.role || 'Utente';
      const statusColor = STATUS_COLORS[u.status] || 'var(--gray-400)';
      const isCurrentUser = u.id === Auth.user?.id;
      return `<div class="list-card fade-in" data-id="${u.id}">
        <div class="list-card-header">
          <div style="display:flex;align-items:center;gap:12px;">
            <div class="avatar" style="width:36px;height:36px;font-size:13px;flex-shrink:0;">${initials}</div>
            <div class="list-card-title" style="margin:0;">
              <div>${u.name || 0} ${isCurrentUser ? '<span style="font-size:11px;color:var(--brand-600);font-weight:600;">(tu)</span>' : ''}</div>
              <div style="font-size:12px;color:var(--gray-500);margin-top:2px;">${u.email || 0}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:12px;font-weight:600;color:${statusColor};">
              ${u.status === 'active' ? 'Attivo' : u.status === 'invited' ? 'In attesa invito' : 'Inattivo'}
            </span>
            ${UI.pill(roleLabel, 'info')}
          </div>
        </div>
        <div class="list-card-body" style="flex-wrap:wrap;">
          ${u.company_name || u.tenant_name ? `<div class="list-card-meta"><svg style="width:13px;height:13px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"/></svg>${u.company_name || u.tenant_name}</div>` : ''}
          ${u.last_login ? `<div class="list-card-meta">Ultimo accesso: ${UI.date(u.last_login)}</div>` : ''}
          <div class="row-actions" style="width:100%;justify-content:flex-end;margin-top:4px;">
            ${u.status === 'invited' ? `<button class="btn btn-ghost btn-sm" onclick="resendInvite('${u.id}')">Re-invia invito</button>` : ''}
            ${!isCurrentUser ? `<button class="btn btn-ghost btn-sm" onclick="changeRole('${u.id}','${u.role}')">Cambia ruolo</button>` : ''}
            ${u.status === 'active' && !isCurrentUser ? `<button class="btn btn-ghost btn-sm" style="color:var(--color-danger);" onclick="deactivateUser('${u.id}')">Disattiva</button>` : ''}
            ${u.status === 'inactive' ? `<button class="btn btn-secondary btn-sm" onclick="reactivateUser('${u.id}')">Riattiva</button>` : ''}
          </div>
        </div>
      </div>`;
    }).join('');
    const s=(pg-1)*PER+1, e=Math.min(pg*PER,filtered.length);
    if (info) info.textContent = `${s}–${e} di ${filtered.length}`;
    UI.pagination(pag, null, pg, filtered.length, PER, p => { pg=p; render(); });
  }

  // Modal
  async function openModal() {
    if (!modal) return;
    modal.classList.add('open');
    const sel = $('usr-company-assign'); if (!sel || sel.options.length > 1) return;
    try {
      const list = await API.Companies.list();
      sel.innerHTML = '<option value="">Tutte le aziende</option>' + list.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
    } catch {}
  }

  $('btn-invite-user')?.addEventListener('click', async () => {
    const name  = $('usr-name')?.value?.trim();
    const email = $('usr-email')?.value?.trim();
    const role  = $('usr-role')?.value;
    if (!email || !role) { UI.toast('Email e ruolo sono obbligatori', 'warning'); return; }
    const btn = $('btn-invite-user'); if (btn) btn.disabled = true;
    try {
      await API.Users.invite({ name, email, role, company_id: $('usr-company-assign')?.value || undefined });
      UI.toast('Invito inviato', 'success'); modal?.classList.remove('open'); await load();
    } catch(e) { UI.toast(e?.message || 'Errore invito', 'error'); }
    finally { if (btn) btn.disabled = false; }
  });

  // Row actions
  window.resendInvite   = async id => { try { await API.post(`/users/${id}/resend-invite`,{}); UI.toast('Invito re-inviato','success'); } catch(e) { UI.toast(e?.message||'Errore','error'); } };
  window.changeRole     = async (id, currentRole) => {
    const role = prompt('Nuovo ruolo (admin / operator):', currentRole); if (!role) return;
    try { await API.Users.update(id, {role}); ALL=ALL.map(u=>u.id===id?{...u,role}:u); updateKpis(); applyFilters(); UI.toast('Ruolo aggiornato','success'); }
    catch(e) { UI.toast(e?.message||'Errore','error'); }
  };
  window.deactivateUser = async id => {
    if (!confirm('Disattivare questo utente?')) return;
    try { await API.Users.update(id, {status:'inactive'}); ALL=ALL.map(u=>u.id===id?{...u,status:'inactive'}:u); updateKpis(); applyFilters(); UI.toast('Utente disattivato','info'); }
    catch(e) { UI.toast(e?.message||'Errore','error'); }
  };
  window.reactivateUser = async id => {
    try { await API.Users.update(id, {status:'active'}); ALL=ALL.map(u=>u.id===id?{...u,status:'active'}:u); updateKpis(); applyFilters(); UI.toast('Utente riattivato','success'); }
    catch(e) { UI.toast(e?.message||'Errore','error'); }
  };

  document.addEventListener('DOMContentLoaded', async () => {
    await I18n.init('lang-switcher-slot');
    load();
  });
})();
