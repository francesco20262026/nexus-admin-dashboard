/* admin_companies.js Multi-tenant company management Premium UI v2 */
'use strict';
(function () {
  Auth.guard('admin');
  Auth.initUI();

  let ALL = [];
  let _editingId = null;
  let currentFilter = 'all';

  const $ = id => document.getElementById(id);

  async function apiList() {
    // Handle both direct array and pagination wrapper {data:[...], total:N}
    const res = await API.get('/companies');
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res.data)) return res.data;
    if (res && Array.isArray(res.items)) return res.items;
    return [];
  }

  async function apiCreate(body) { return API.post('/companies', body); }
  async function apiUpdate(id, body) { return API.put(`/companies/${id}`, body); }

  // ── Color palette for avatars ─────────────────────────────
  const PALETTES = [
    ['#6366f1','#4338ca'],
    ['#8b5cf6','#6d28d9'],
    ['#ec4899','#be185d'],
    ['#f59e0b','#b45309'],
    ['#10b981','#047857'],
    ['#06b6d4','#0e7490'],
    ['#3b82f6','#1d4ed8'],
    ['#ef4444','#b91c1c'],
  ];
  function pal(name) {
    const idx = [...(name||'?')].reduce((s,c)=>s+c.charCodeAt(0),0) % PALETTES.length;
    return PALETTES[idx];
  }
  function initials(name) {
    return (name||'?').split(' ').filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('');
  }

  // ── Load ─────────────────────────────────────────────────
  async function load() {
    const list = $('comp-list');
    if (!list) return;
    list.innerHTML = skeleton(4);
    try {
      ALL = await apiList();
    } catch (e) {
      list.innerHTML = `<div style="padding:40px 24px;text-align:center;color:var(--color-danger);font-size:14px;">
        Errore: ${e?.message||'Caricamento fallito'} <a href="#" onclick="window._reloadCompanies();return false">Riprova</a></div>`;
      return;
    }
    updateKpis();
    render();
  }
  window._reloadCompanies = load;

  function skeleton(n) {
    return Array(n).fill(0).map((_,i) => `
      <div class="cx-row" style="pointer-events:none;opacity:${1-i*0.15};">
        <div class="cx-logo skeleton"></div>
        <div style="flex:1;min-width:0;">
          <div class="skeleton" style="height:14px;width:${140+i*20}px;border-radius:6px;margin-bottom:8px;"></div>
          <div class="skeleton" style="height:12px;width:80px;border-radius:4px;"></div>
        </div>
        <div class="skeleton" style="height:22px;width:70px;border-radius:20px;"></div>
      </div>`).join('');
  }

  function updateKpis() {
    const s=(id,v,m)=>{ const e=$(`kpi-comp-${id}`); if(e) e.textContent=v; const em=$(`kpi-comp-${id}-meta`); if(em&&m) em.textContent=m; };
    s('total',  ALL.length,        'tenant registrati');
    s('windoc', ALL.filter(c=>c.windoc_active).length, 'con Windoc attivo');
    s('zoho',   ALL.filter(c=>c.zoho_active).length,   'con Zoho Sign');
    s('email',  ALL.filter(c=>c.email_active).length,  'con Brevo Email');
  }

  // ── Selection & Mass Actions (Mac Style) ───────────────────
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
    let currentFiltered = ALL;
    if (currentFilter === 'windoc') currentFiltered = ALL.filter(c => c.windoc_active);
    else if (currentFilter === 'zoho') currentFiltered = ALL.filter(c => c.zoho_active);
    else if (currentFilter === 'email') currentFiltered = ALL.filter(c => c.email_active);

    currentFiltered.forEach(i => {
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
      let currentFiltered = ALL;
      if (currentFilter === 'windoc') currentFiltered = ALL.filter(c => c.windoc_active);
      else if (currentFilter === 'zoho') currentFiltered = ALL.filter(c => c.zoho_active);
      else if (currentFilter === 'email') currentFiltered = ALL.filter(c => c.email_active);

      const currentPageIds = currentFiltered.map(i => i.id);
      const allSelected = currentPageIds.length > 0 && currentPageIds.every(id => window.selectedIds.has(id));
      if (allSelected) selectAllBtn.classList.add('selected');
      else selectAllBtn.classList.remove('selected');
    }
  };
  
  window.massDelete = async function() {
    if (window.selectedIds.size === 0) return;
    if (!confirm(`Sei sicuro di voler eliminare ${window.selectedIds.size} aziende selezionate? L'operazione è IRREVERSIBILE.`)) return;
    
    let success = 0;
    try {
      UI.toast(`Eliminazione in corso...`, 'info');
      for (const id of window.selectedIds) {
        try {
          await API.del(`/companies/${id}`);
          success++;
          ALL = ALL.filter(c => c.id !== id);
        } catch (err) {
          console.error(`Error deleting company ${id}:`, err);
        }
      }
      if (success > 0) {
        UI.toast(`${success} aziende eliminate.`, 'success');
        updateKpis();
        window.clearSelection();
        render();
      } else {
        UI.toast("Errore durante l\'eliminazione. Riprova.", 'error');
      }
    } catch (e) {
      UI.toast("Errore durante l\'eliminazione multipla.", 'error');
    }
  };

  function render() {
    const list = $('comp-list');
    if (!list) return;
    let filtered = ALL;
    if (currentFilter === 'windoc') filtered = ALL.filter(c => c.windoc_active);
    else if (currentFilter === 'zoho') filtered = ALL.filter(c => c.zoho_active);
    else if (currentFilter === 'email') filtered = ALL.filter(c => c.email_active);

    if (!filtered.length) {
      list.innerHTML = `<div style="padding:48px 24px;text-align:center;">
        <div style="font-size:40px;margin-bottom:12px;">🏢</div>
        <div style="font-size:16px;font-weight:600;color:var(--gray-700);margin-bottom:6px;">Nessuna azienda</div>
        <div style="font-size:13px;color:var(--gray-400);">Non ci sono aziende per questo filtro.</div>
      </div>`;
      return;
    }

    const activeId = API.getCompanyId?.() || null;
    list.innerHTML = filtered.map((c,i) => {
      const isSelected = window.selectedIds && window.selectedIds.has(c.id);
      const [c1, c2] = pal(c.name);
      const ini = initials(c.name);
      const isEnabled = c.is_active !== false;
      let avatarHtml = '';
      if (c.logo_url) {
        avatarHtml = `<div style="width:40px;height:40px;flex-shrink:0;display:flex;align-items:center;justify-content:center;border-radius:10px;border:1px solid var(--border);background:#fff;overflow:hidden;padding:4px;"><img src="${c.logo_url}" alt="${ini}" style="width:100%;height:100%;object-fit:contain;" onerror="this.parentNode.innerHTML='<div class=\'avatar\' style=\'background:linear-gradient(135deg,${c1},${c2});width:100%;height:100%;font-size:13px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;border-radius:50%;margin:-4px;\'>${ini}</div>'"></div>`;
      } else {
        avatarHtml = `<div class="avatar" style="background:linear-gradient(135deg,${c1},${c2});width:40px;height:40px;font-size:14px;flex-shrink:0;display:flex;align-items:center;justify-content:center;border-radius:50%;overflow:hidden;"><span style="font-weight:800;color:#fff;letter-spacing:-.5px;">${ini}</span></div>`;
      }

      const badges = [
        c.windoc_active ? `<span class="cx-pill cx-pill-green">Windoc ✓</span>` : '',
        c.zoho_active   ? `<span class="cx-pill cx-pill-blue">Zoho ✓</span>`    : '',
        c.email_active  ? `<span class="cx-pill cx-pill-purple">Brevo ✓</span>` : '',
      ].filter(Boolean).join('') || `<span class="cx-pill cx-pill-gray">Nessuna integrazione</span>`;

      const disabledStyle = isEnabled ? '' : 'opacity:.5;';

      return `<div class="cl-row fade-in" data-id="${c.id}" onclick="window.goDetail('${c.id}')" style="display:grid; grid-template-columns: 2.5fr 2fr 140px; align-items:center; gap:16px; padding:16px 24px; border-bottom:1px solid var(--border); transition:all 0.15s; cursor:pointer; ${disabledStyle}">
        <!-- Colonna 1: Logo e Nome -->
        <div class="cl-col cl-col-1">
          <div class="cl-row-identity">
            <div class="mac-select-btn ${isSelected ? 'selected' : ''}" data-id="${c.id}" onclick="window.toggleSelection(event, '${c.id}')" style="flex-shrink:0;">
              <div class="mac-checkbox"></div>
            </div>
            <div class="mac-select-btn" data-id="${c.id}" onclick="event.stopPropagation(); window.toggleSelection(event, '${c.id}')" style="flex-shrink:0;">
              <div class="mac-checkbox"></div>
            </div>
          ${avatarHtml}
          <div class="cl-row-identity-body" style="min-width:0;">
            <div class="cl-row-name" style="font-size:14px; font-weight:600; color:var(--gray-900); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${c.name}</div>
            <div class="cl-row-meta" style="font-size:12px; color:var(--gray-500); margin-top:2px;">🔗 ${c.slug||''}</div>
          </div>
        </div>

        </div>
        <!-- Colonna 2: Integrazioni -->
        <div class="cl-col" style="min-width:0; display:flex; flex-direction:row; gap:6px; flex-wrap:wrap; align-items:center;">
          ${badges}
        </div>

        <!-- Colonna 3: Stato -->
        <div class="cl-col cl-col-actions" style="display:flex; flex-direction:row; align-items:center; gap:12px; justify-content:flex-end;">
          <label class="mac-switch" title="Abilita/Disabilita Azienda" onclick="event.stopPropagation()">
            <input type="checkbox" onchange="window.toggleCompanyActive('${c.id}', this.checked)" ${isEnabled ? 'checked' : ''}>
            <span class="mac-slider"></span>
          </label>
        </div>
      </div>`;
    }).join('');
    
  }

  
  window.toggleCompanyActive = async (id, isActive) => {
    try {
      await API.patch(`/companies/${id}/set-active`, { is_active: isActive });
      UI.toast(isActive ? 'Azienda attivata' : 'Azienda disabilitata', 'success');
    } catch(e) {
      UI.toast(e.message, 'error');
      // Reload strictly instead of passing e directly
      setTimeout(() => location.reload(), 1000);
    }
  };

  window.goDetail = id => { location.href = `admin_company_detail.html?id=${id}`; };

  // ── openEditModal ──────────────────────────────────────────
  window.openEditModal = function(id, name, slug, isEnabled) {
    _editingId = id;
    const nEl = $('edit-comp-name'); if (nEl) nEl.value = name || '';
    const tog = $('edit-comp-enabled'); if (tog) tog.checked = isEnabled !== false;
    $('modal-edit-company')?.classList.add('open');
    setTimeout(() => $('edit-comp-name')?.focus(), 80);
  };

  window.toggleActive = async function(id, currentlyEnabled) {
    const newVal = !currentlyEnabled;
    try {
      await API.patch(`/companies/${id}/set-active`, { is_active: newVal });
      UI.toast(newVal ? 'Azienda abilitata' : 'Azienda disabilitata', 'success');
      load();
    } catch (e) { UI.toast(e?.message || 'Errore', 'error'); }
  };

  let _pendingDeleteId   = null;
  let _pendingDeleteName = null;

  window.deleteCompany = function(id, name) {
    _pendingDeleteId   = id;
    _pendingDeleteName = name;
    const modal = document.getElementById('modal-delete-company');
    const nameEl = document.getElementById('del-company-name');
    if (nameEl) nameEl.textContent = name;
    if (modal) modal.classList.add('open');
  };

  window.openCompanyModal = function() {
    _editingId = null;
    const nEl=$('comp-name'); if(nEl) nEl.value='';
    const sEl=$('comp-slug'); if(sEl) sEl.value='';
    const sg=$('comp-slug-group'); if(sg) sg.style.display='';
    $('modal-company')?.classList.add('open');
    setTimeout(()=>$('comp-name')?.focus(),80);
  };

  window.onPageReady(async () => {
    await I18n.init('lang-switcher-slot');

    document.querySelectorAll('.cl-status-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.cl-status-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.tab;
        render();
      });
    });

    // Inject action buttons
    const act = $('page-actions');
    if (act) {
      act.innerHTML = `
        <button class="btn btn-secondary" id="btn-refresh">
          <svg style="width:15px;height:15px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>
          Aggiorna
        </button>
        <button class="btn-action-icon " id="btn-action-icon-new-company" title="Nuova azienda">
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
</button>`;
      $('btn-refresh').addEventListener('click', function() { if(window.UI) UI.toast('Aggiornamento in corso...', 'info'); load(true); });
      $('btn-action-icon-new-company').addEventListener('click', () => openCompanyModal());
    }

    $('btn-save-company')?.addEventListener('click', async () => {
      const name = $('comp-name')?.value?.trim();
      const slug = $('comp-slug')?.value?.trim() || undefined;
      if (!name) { UI.toast('Il nome è obbligatorio', 'warning'); return; }
      const btn = $('btn-save-company'); if(btn) btn.disabled=true;
      try {
        if (_editingId) {
          await apiUpdate(_editingId, { name });
          UI.toast('Azienda rinominata', 'success');
        } else {
          await apiCreate({ name, slug });
          UI.toast('Azienda creata', 'success');
        }
        $('modal-company')?.classList.remove('open');
        await load();
      } catch(e) { UI.toast(e?.message||'Errore salvataggio', 'error'); }
      finally { if(btn) btn.disabled=false; }
    });
    // ── Save edit (rename + toggle) ─────────────────────────
    $('btn-save-edit-company')?.addEventListener('click', async () => {
      if (!_editingId) return;
      const name = $('edit-comp-name')?.value?.trim();
      if (!name) { UI.toast('Il nome è obbligatorio', 'warning'); return; }
      const enabled = $('edit-comp-enabled')?.checked !== false;
      const btn = $('btn-save-edit-company'); if (btn) btn.disabled = true;
      try {
        await apiUpdate(_editingId, { name, is_active: enabled });
        $('modal-edit-company')?.classList.remove('open');
        UI.toast('Azienda aggiornata', 'success');
        await load();
      } catch(e) { UI.toast(e?.message || 'Errore salvataggio', 'error'); }
      finally { if (btn) btn.disabled = false; }
    });
    $('edit-btn-delete')?.addEventListener('click', () => {
      const name = $('edit-comp-name')?.value || '?';
      $('modal-edit-company')?.classList.remove('open');
      deleteCompany(_editingId, name);
    });


    // ── Delete confirm modal ────────────────────────────────
    $('del-btn-cancel')?.addEventListener('click', () => {
      $('modal-delete-company').classList.remove('open');
      _pendingDeleteId = _pendingDeleteName = null;
    });
    $('del-btn-confirm')?.addEventListener('click', async () => {
      if (!_pendingDeleteId) return;
      const btn = $('del-btn-confirm');
      if (btn) { btn.disabled = true; btn.textContent = 'Eliminazione…'; }
      try {
        await API.del(`/companies/${_pendingDeleteId}`);
        $('modal-delete-company').classList.remove('open');
        UI.toast(`"${_pendingDeleteName}" eliminata`, 'info');
        _pendingDeleteId = _pendingDeleteName = null;
        await load();
      } catch (e) {
        UI.toast(e?.message || 'Errore eliminazione', 'error');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Elimina definitivamente'; }
      }
    });
    // Close modal on backdrop click
    $('modal-delete-company')?.addEventListener('click', (e) => {
      if (e.target === $('modal-delete-company')) {
        $('modal-delete-company').classList.remove('open');
        _pendingDeleteId = _pendingDeleteName = null;
      }
    });

    await load();
  });

  // Re-render when active company changes (company switcher in header)
  window.addEventListener('nexusCompanyChanged', () => render());
})();
