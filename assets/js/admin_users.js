/* admin_users.js Internal users & permissions management */
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
  const tabBar  = $('usr-pipeline-bar');
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
    <button class="btn-action-icon " id="btn-action-icon-invite" title="Invita utente">
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
</button>`;
  $('btn-refresh')?.addEventListener('click', function() { if(window.UI) UI.toast('Aggiornamento in corso...', 'info'); load(true); });
  $('btn-action-icon-invite')?.addEventListener('click',  openModal);

  tabBar?.querySelectorAll('.cl-status-pill').forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));
  if (tabBar) tabBar.addEventListener('click', e => {
    const b = e.target.closest('.cl-status-pill'); if (!b) return;
    tabBar.querySelectorAll('.cl-status-pill').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); activeTab = b.dataset.tab; pg = 1; applyFilters();
  });
  [search, fComp].forEach(el => {
    el?.addEventListener('input',  debounce(() => { pg=1; applyFilters(); }, 200));
    el?.addEventListener('change', () => { pg=1; applyFilters(); });
  });

  if (window._usersCmpListener) window.removeEventListener('companyChanged', window._usersCmpListener);
  window._usersCmpListener = () => load();
  window.addEventListener('companyChanged', window._usersCmpListener);
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

  async function populateCompanyFilter() {
    if (!fComp) return;
    const prev = fComp.value;
    try {
      const res = await API.get('/companies');
      const companies = Array.isArray(res) ? res : (res?.data || res?.items || []);
      fComp.innerHTML = '<option value="">Tutte le aziende</option>' +
        companies.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
      if (prev) fComp.value = prev;
    } catch (_) {
      // fallback: derive from loaded users
      const names = [...new Set(ALL.map(u => u.company_name || u.tenant_name).filter(Boolean))].sort();
      fComp.innerHTML = '<option value="">Tutte le aziende</option>' +
        names.map(n => `<option value="${n}">${n}</option>`).join('');
    }
  }

  function updateKpis() {
    const set = (id,v,m) => { const el=$(id); if(el) el.textContent=v; const em=$(id+'-meta'); if(em&&m!==undefined) em.textContent=m; };
    set('kpi-usr-total',    ALL.length,                                                           'Registrati');
    set('kpi-usr-admin',    ALL.filter(u => u.role === 'admin'    || u.role === 'super_admin').length, 'Con accesso pieno');
    set('kpi-usr-operator', ALL.filter(u => ['operator', 'member', 'client'].includes(u.role)).length, 'Accesso limitato');
    set('kpi-usr-inactive', ALL.filter(u => u.status === 'invited' || u.status === 'inactive').length, 'Inviti in attesa');
  }

  function applyFilters() {
    const q  = (search?.value || '').toLowerCase().trim();
    const ro = ''   || '';
    const st = '';

    filtered = ALL.filter(u => {
      if (activeTab === 'admin'    && u.role   !== 'admin'    && u.role   !== 'super_admin') return false;
      if (activeTab === 'operator' && !['operator', 'member', 'client'].includes(u.role)) return false;
      if (activeTab === 'invited'  && u.status !== 'invited') return false;
      if (activeTab === 'inactive' && u.status !== 'inactive') return false;
      if (ro && u.role   !== ro) return false;
      if (st && u.status !== st) return false;
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

  /* ── Selection & Mass Actions (Mac Style) ─────────────────── */
  window.selectedIds = new Set();
  
  window.toggleSelection = function(e, id) {
    e.stopPropagation();
    const btn = e.currentTarget;
    btn.classList.toggle('selected');
    if (btn.classList.contains('selected')) window.selectedIds.add(id);
    else window.selectedIds.delete(id);
    updateSelectionUI();
  };
  
  window.toggleSelectAll = function(el) {
    const isSelected = el.classList.toggle('selected');
    filtered.slice((pg-1)*PER, pg*PER).forEach(i => {
      if (isSelected) window.selectedIds.add(i.id);
      else window.selectedIds.delete(i.id);
    });
    
    document.querySelectorAll('.mac-select-btn').forEach(cb => {
      if (isSelected) cb.classList.add('selected'); else cb.classList.remove('selected');
      const row = cb.closest('.cl-row');
      if (row) {
        if (isSelected) row.classList.add('selected');
        else row.classList.remove('selected');
      }
    });
    updateSelectionUI();
  };
  
  window.clearSelection = function() {
    window.selectedIds.clear();
    const selectAllBtn = document.getElementById('mass-select-all');
    if (selectAllBtn) selectAllBtn.classList.remove('selected');
    document.querySelectorAll('.mac-select-btn').forEach(cb => cb.checked = false);
    document.querySelectorAll('.cl-row.selected').forEach(r => r.classList.remove('selected'));
    updateSelectionUI();
  };
  
  window.updateSelectionUI = function() {
    const bar = document.getElementById('mac-mass-action-bar');
    const countEl = document.getElementById('mac-mass-action-count');
    const selectAllBtn = document.getElementById('mass-select-all');
    
    if (!bar || !countEl) return;
    
    const count = window.selectedIds.size;
    countEl.textContent = count;
    
    if (count > 0) bar.classList.add('visible');
    else {
      bar.classList.remove('visible');
      if (selectAllBtn) selectAllBtn.classList.remove('selected');
    }
    
    document.querySelectorAll('.cl-row').forEach(row => {
      const id = row.dataset.id;
      const cb = row.querySelector('.mac-select-btn');
      if (window.selectedIds.has(id)) {
        row.classList.add('selected');
        if (cb) cb.classList.add('selected');
      } else {
        row.classList.remove('selected');
        if (cb) cb.classList.remove('selected');
      }
    });

    if (selectAllBtn) {
      const currentPageIds = filtered.slice((pg-1)*PER, pg*PER).map(i => i.id);
      const allSelected = currentPageIds.length > 0 && currentPageIds.every(id => window.selectedIds.has(id));
      if (allSelected) selectAllBtn.classList.add('selected');
      else selectAllBtn.classList.remove('selected');
    }
  };
  
  window.massDelete = async function() {
    if (window.selectedIds.size === 0) return;
    if (!await UI.confirm(`Sei sicuro di voler eliminare ${window.selectedIds.size} utenti selezionati?`)) return;
    
    let success = 0;
    try {
      UI.toast(`Eliminazione in corso...`, 'info');
      for (const id of window.selectedIds) {
        try {
          await API.del(`/users/${id}`);
          success++;
          ALL = ALL.filter(u => u.id !== id);
        } catch (err) {
          console.error(`Error deleting user ${id}:`, err);
        }
      }
      if (success > 0) {
        UI.toast(`${success} utenti eliminati.`, 'success');
        updateKpis();
        applyFilters();
      } else {
        UI.toast("Errore durante l\'eliminazione. Riprova.", 'error');
      }
    } catch (e) {
      UI.toast("Errore durante l\'eliminazione multipla.", 'error');
    }
  };

  const ROLE_LABELS  = { super_admin:'Super Admin', admin:'Admin', client:'Cliente', operator:'Operatore', member:'Membro', viewer:'Viewer' };
  const STATUS_COLORS = { active:'var(--color-success)', invited:'var(--color-warning)', inactive:'var(--gray-400)' };

  // Avatar colors palette
  const AVT_COLORS = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#06b6d4','#3b82f6','#ef4444','#f97316'];
  function avtColor(str) {
    return AVT_COLORS[[...(str||'?')].reduce((s,c)=>s+c.charCodeAt(0),0) % AVT_COLORS.length];
  }

  function render() {
    if (!list) return;
    if (!filtered.length) {
      list.innerHTML = `<div style="padding:48px 24px;text-align:center;">
        <div style="font-size:36px;margin-bottom:12px;">👤</div>
        <div style="font-size:15px;font-weight:600;color:var(--gray-700);margin-bottom:5px;">${ALL.length ? 'Nessun risultato' : 'Nessun utente'}</div>
        <div style="font-size:13px;color:var(--gray-400);">${ALL.length ? 'Prova ad eliminare i filtri.' : 'Invita il primo utente.'}</div>
      </div>`;
      if (info) info.textContent=''; if (pag) pag.innerHTML=''; return;
    }
    const slice = filtered.slice((pg-1)*PER, pg*PER);
    list.innerHTML = slice.map((u,i) => {
      
      const ini  = (u.name||u.email||'?').split(' ').filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('');
      const col  = avtColor(u.name||u.email);
      const isSelected = window.selectedIds && window.selectedIds.has(u.id);
      const role = ROLE_LABELS[u.role] || u.role || 'Utente';
      const isMe = u.id === Auth.user?.id;

      const STATUS = {
        active:   { label:'Attivo',    dot:'#22c55e', bg:'#f0fdf4' },
        invited:  { label:'In attesa', dot:'#f59e0b', bg:'#fffbeb' },
        inactive: { label:'Inattivo',  dot:'#94a3b8', bg:'#f1f5f9' },
      };
      const st = STATUS[u.status] || STATUS.active;

      return `<div class="cl-row fade-in" data-id="${u.id}" style="display:grid; grid-template-columns: 2.5fr 1.5fr 100px 100px 100px 100px; align-items:center; gap:16px; padding:10px 24px; border-bottom:1px solid var(--border); transition:all 0.15s; cursor:pointer;" onclick="location.href='admin_user_detail.html?id=${u.id}'">
        <!-- Colonna 1: Avatar e Nome -->
        <div class="cl-col cl-col-1">
          <div class="cl-row-identity">
            <div class="mac-select-btn ${isSelected ? 'selected' : ''}" data-id="${u.id}" onclick="window.toggleSelection(event, '${u.id}')" style="flex-shrink:0;">
              <div class="mac-checkbox"></div>
            </div>

          <div class="avatar" style="background:linear-gradient(135deg,${col},${col}bb);width:40px;height:40px;font-size:14px;flex-shrink:0;display:flex;align-items:center;justify-content:center;border-radius:50%;color:#fff;font-weight:800;">${ini}</div>
          <div class="cl-row-identity-body" style="min-width:0;">
            <div class="cl-row-name" style="font-size:14px; font-weight:600; color:var(--gray-900); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              ${u.name || u.email || ''}
              ${isMe ? '<span class="tag-pill" style="margin-left:8px;font-size:10px;padding:2px 6px;">Tu</span>' : ''}
            </div>
            <div class="cl-row-meta" style="font-size:12px; color:var(--gray-500); margin-top:2px;">
              ${u.email || ''}
            </div>
          </div>
        </div>

        </div>
        <!-- Colonna 2: Azienda Cliente -->
        <div class="cl-col" style="min-width:0;">
          <div style="font-size:13px; color:var(--gray-700); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${u.client_name || '-'}</div>
        </div>
        <!-- Colonna 3: Fornitore -->
        <div class="cl-col" style="min-width:0;">
          ${u.role === 'super_admin' ? 
            `<div style="font-size:11px; font-weight:800; color:var(--gray-700); background:var(--gray-200); border:1px solid var(--border); padding:2px 8px; border-radius:20px; display:inline-block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">ALL</div>` : 
            `<div style="font-size:11px; font-weight:800; color:var(--gray-700); background:var(--gray-100); border:1px solid var(--border); padding:2px 8px; border-radius:20px; display:inline-block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${u.company_alias || (u.company_name ? u.company_name.substring(0,3).toUpperCase() : '-')}</div>`
          }
        </div>
        <!-- Colonna 4: Ruolo -->
        <div class="cl-col" style="min-width:0;">
          <div style="font-size:13px; color:var(--gray-700);">${role}</div>
        </div>
        <!-- Colonna 5: Stato -->
        <div class="cl-col" style="min-width:0;">
          <div style="font-size:13px; color:${u.status === 'active' ? 'var(--color-success)' : 'var(--gray-400)'}; font-weight:600;">${u.status === 'active' ? 'Attivo' : 'Disattivo'}</div>
        </div>
        <!-- Colonna 6: Azioni -->
        <div class="cl-col cl-col-actions" style="display:flex; flex-direction:row; align-items:center; gap:12px; justify-content:flex-end;">
          <label class="mac-switch" title="Abilita/Disabilita Utente" onclick="event.stopPropagation()">
            <input type="checkbox" onchange="window.toggleUserActive('${u.id}', this.checked)" ${u.status === 'active' ? 'checked' : ''}>
            <span class="mac-slider"></span>
          </label>
          <button class="btn-action-icon" title="Reset Password" style="outline:none;border:none;background:transparent;cursor:pointer;color:var(--gray-500);display:flex;align-items:center;" onmouseover="this.style.color='#2563eb'" onmouseout="this.style.color='var(--gray-500)'" onclick="event.stopPropagation(); window.resetUserPassword('${u.id}')">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" style="width:16px;height:16px">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
            </svg>
          </button>
        </div>
      </div>`;
    }).join('');
    const s=(pg-1)*PER+1, e=Math.min(pg*PER,filtered.length);
    if (info) info.textContent = `${s}–${e} di ${filtered.length} utenti`;
    UI.pagination(pag, null, pg, filtered.length, PER, p => { pg=p; render(); window.updateSelectionUI(); });
    
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
    const role = prompt('Nuovo ruolo (super_admin / client):', currentRole); if (!role) return;
    try { await API.Users.update(id, {role}); ALL=ALL.map(u=>u.id===id?{...u,role}:u); updateKpis(); applyFilters(); UI.toast('Ruolo aggiornato','success'); }
    catch(e) { UI.toast(e?.message||'Errore','error'); }
  };
  window.resetUserPassword = async id => {
    try { 
      UI.toast('Invio link di reset in corso...', 'info');
      await API.post(`/users/${id}/reset-password`); 
      UI.toast('Link di reset inviato', 'success'); 
    }
    catch(e) { UI.toast(e?.message || 'Errore reset password', 'error'); }
  };
  window.deactivateUser = async id => {
    try { 
      await API.Users.update(id, {status:'inactive'}); 
      ALL=ALL.map(u=>u.id===id?{...u,status:'inactive'}:u); 
      updateKpis(); applyFilters(); 
      UI.toast('L\'accesso al gestionale è stato interrotto per questo utente.','info'); 
    }
    catch(e) { UI.toast(e?.message||'Errore','error'); }
  };
  window.reactivateUser = async id => {
    try { await API.Users.update(id, {status:'active'}); ALL=ALL.map(u=>u.id===id?{...u,status:'active'}:u); updateKpis(); applyFilters(); UI.toast('Utente riattivato','success'); }
    catch(e) { UI.toast(e?.message||'Errore','error'); }
  };

  window.toggleUserActive = async (id, isActive) => {
    if (isActive) await window.reactivateUser(id);
    else await window.deactivateUser(id);
  };

  window.onPageReady(async () => {
    await I18n.init('lang-switcher-slot');
    load();
  });
})();
