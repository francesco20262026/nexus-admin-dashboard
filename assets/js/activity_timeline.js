/* ============================================================
   activity_timeline.js Reusable CRM Activity Timeline Component
   ============================================================ */
'use strict';

window.ActivityTimeline = (function () {

  const EVENT_ICONS = {
    note:              { icon: '📝', label: 'Nota',              color: '#6366f1' },
    call:              { icon: '📞', label: 'Chiamata',          color: '#0ea5e9' },
    meeting:           { icon: '🤝', label: 'Riunione',          color: '#8b5cf6' },
    task:              { icon: '✅', label: 'Task',              color: '#10b981' },
    email_sent:        { icon: '✉️',  label: 'Email inviata',    color: '#f59e0b' },
    quote_sent:        { icon: '📄', label: 'Preventivo inviato', color: '#3b82f6' },
    quote_accepted:    { icon: '✅', label: 'Preventivo accettato', color: '#10b981' },
    quote_rejected:    { icon: '❌', label: 'Preventivo rifiutato', color: '#ef4444' },
    invoice_issued:    { icon: '🧾', label: 'Fattura emessa',    color: '#f97316' },
    stage_changed:     { icon: '🔄', label: 'Stato aggiornato', color: '#8b5cf6' },
    lead_created:      { icon: '🌱', label: 'Lead creato',       color: '#10b981' },
    contract_signed:   { icon: '📝', label: 'Contratto',        color: '#0ea5e9' },
    document_uploaded: { icon: '📎', label: 'Documento',        color: '#64748b' },
    system:            { icon: '⚙️',  label: 'Sistema',          color: '#64748b' },
  };

  const MANUAL_EVENT_TYPES = ['note'];

  function _relativeTime(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);
    if (mins  < 1)   return 'adesso';
    if (mins  < 60)  return `${mins} min fa`;
    if (hours < 24)  return `${hours}h fa`;
    if (days  < 7)   return `${days}g fa`;
    return new Date(dateStr).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function _fmtScheduled(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleString('it-IT', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  function _groupByDate(events) {
    const groups = new Map();
    events.forEach(ev => {
      const d   = new Date(ev.created_at);
      const key = d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(ev);
    });
    return groups;
  }

  function _renderEvent(ev) {
    const meta  = EVENT_ICONS[ev.event_type] || EVENT_ICONS.system;
    const actor = ev.users?.name || ev.users?.email || 'Sistema';
    const d     = new Date(ev.created_at);
    const timeStr = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    const dateStr = d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const rawTitle = ev.title || ev.description || '';
    const displayTitle = rawTitle && rawTitle !== meta.label
      ? `${meta.label} <span class="al-item-subtitle">${rawTitle}</span>`
      : meta.label;
    const scheduledBadge = ev.scheduled_at
      ? `<div class="al-scheduled-badge">📅 ${_fmtScheduled(ev.scheduled_at)}</div>`
      : '';
    const inviteBtn = ev.scheduled_at
      ? `<button class="al-invite-btn" data-id="${ev.id}" title="Invia invito calendario">✉️ Invia invito</button>`
      : '';
    return `
      <div class="al-item" data-id="${ev.id}">
        <div class="al-item-time-col">${timeStr}</div>
        <div class="al-item-line-col">
          <div class="al-item-dot" style="color:${meta.color};border-color:${meta.color}50;background:${meta.color}12;">${meta.icon}</div>
        </div>
        <div class="al-item-content">
          <div class="al-item-title">${displayTitle}</div>
          ${ev.body ? `<div class="al-item-body">${ev.body.replace(/\n/g, '<br>')}</div>` : ''}
          <div class="al-item-meta">da ${actor} · ${dateStr}</div>
          ${scheduledBadge}
          ${inviteBtn}
        </div>
      </div>`;
  }

  function _renderTypeButtons(activeType) {
    return MANUAL_EVENT_TYPES.map(t => {
      const m = EVENT_ICONS[t];
      return `<button type="button" class="al-type-btn ${activeType === t ? 'active' : ''}" data-type="${t}">${m.icon} ${m.label}</button>`;
    }).join('');
  }

  function _renderFilterDropdown(activeFilter) {
    const options = [
      ['', 'Tutte le attività'],
      ...Object.entries(EVENT_ICONS).map(([k, v]) => [k, v.label])
    ];
    return `
      <select id="al-filter-select" class="al-native-select">
        ${options.map(([val, label]) => `<option value="${val}" ${activeFilter === val ? 'selected' : ''}>${label}</option>`).join('')}
      </select>
    `;
  }

  async function _load(cfg, page = 1, filter = '') {
    const endpoint = cfg.entityType === 'client'
      ? `/clients/${cfg.entityId}/activity`
      : `/onboarding/${cfg.entityId}/activity`;

    const params = new URLSearchParams({ page, page_size: 30 });
    if (filter) params.set('event_type', filter);

    return API.get(`${endpoint}?${params}`);
  }

  async function _save(cfg, eventType, title, body, scheduledAt, assignedTo, inviteClient) {
    const endpoint = cfg.entityType === 'client'
      ? `/clients/${cfg.entityId}/activity`
      : `/onboarding/${cfg.entityId}/activity`;
    const payload = { event_type: eventType, title };
    if (body)        payload.body = body;
    if (scheduledAt) payload.scheduled_at = scheduledAt;
    if (assignedTo)  payload.assigned_to = assignedTo;
    if (inviteClient) payload.invite_client = true;
    return API.post(endpoint, payload);
  }

  async function _sendInvite(activityId) {
    return API.post(`/activities/${activityId}/invite`, {});
  }

  async function init(cfg) {
    const container = document.getElementById(cfg.containerId);
    if (!container) return;

    let currentFilter = '';
    let currentPage   = 1;
    let selectedAddType = 'note';
    let showSchedule = false; // toggle scheduling panel

    // Load admin/operator users list for assignee dropdown (exclude client-role users)
    let adminUsers = [];
    try {
      const res = await API.get('/users');
      const all = Array.isArray(res) ? res : (res.data || []);
      // Exclude only client-role accounts; include admin, operator, member, super_admin
      adminUsers = all.filter(u => u.role !== 'client');
    } catch (_) {}

    async function render() {
      container.innerHTML = `
        <div class="al-container">
          <div class="al-body-area">
            ${renderStorico()}
          </div>
        </div>
      `;
      attachEvents();
      await loadList();
    }

    function _adminOptions() {
      if (!adminUsers.length) return '<option value="">Nessun admin</option>';
      return '<option value="">Nessun assegnatario</option>' +
        adminUsers.map(u => `<option value="${u.id}">${u.name || u.email}</option>`).join('');
    }

    function renderStorico() {
      return `
        <!-- Quick Add Box REMOVED as per request to be read-only timeline -->
        
        <!-- Header & Filters -->
        <div class="al-header-row">
          <div class="al-title-text">
            Cronologia della sequenza temporale
          </div>
          ${_renderFilterDropdown(currentFilter)}
        </div>
        
        <!-- List Container -->
        <div id="al-list">
          <div style="padding:40px 0; text-align:center; color:var(--gray-400); font-size:13px;">Caricamento storico...</div>
        </div>
        <div id="al-pagination" style="margin-top:24px;"></div>
      `;
    }

    function attachEvents() {
      // Schedule toggle
      const toggleBtn = document.getElementById('al-schedule-toggle');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
          showSchedule = !showSchedule;
          const panel = document.getElementById('al-schedule-panel');
          if (panel) panel.style.display = showSchedule ? 'grid' : 'none';
          toggleBtn.textContent = `📅 ${showSchedule ? 'Nascondi pianificazione' : 'Pianifica data e assegnatario'}`;
          toggleBtn.classList.toggle('open', showSchedule);
        });
      }

      // Quick Add Type Selector
      container.querySelectorAll('.al-type-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          selectedAddType = btn.dataset.type;
          document.getElementById('al-type-selector').innerHTML = _renderTypeButtons(selectedAddType);
          attachEvents();
        });
      });

      // Filter Select
      const filterSelect = document.getElementById('al-filter-select');
      if (filterSelect) {
        filterSelect.addEventListener('change', (e) => {
          currentFilter = e.target.value;
          currentPage = 1;
          loadList();
        });
      }

      // Save Button
      const saveBtn = document.getElementById('al-save-btn');
      if (saveBtn) {
        saveBtn.addEventListener('click', handleSave);
      }
    }

    async function handleSave() {
      const titleInput     = document.getElementById('al-quick-title');
      const bodyInput      = document.getElementById('al-quick-body');
      const scheduledInput = document.getElementById('al-scheduled-at');
      const assignedInput  = document.getElementById('al-assigned-to');
      const inviteClient   = document.getElementById('al-invite-client');
      const title = titleInput.value.trim();
      const body  = bodyInput.value.trim();
      
      if (!title) {
        UI.toast('Il titolo è obbligatorio', 'error');
        titleInput.focus();
        return;
      }
      
      const scheduledAt = scheduledInput?.value || null;
      const assignedTo  = assignedInput?.value  || null;
      const doInvite    = inviteClient?.checked  || false;

      const saveBtn = document.getElementById('al-save-btn');
      try {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;margin-right:6px;"></span> Salvataggio...';
        
        await _save(cfg, selectedAddType, title, body || undefined, scheduledAt, assignedTo, doInvite);
        
        UI.toast('Attività aggiunta' + (scheduledAt ? ' e pianificata nel calendario' : ''), 'success');
        titleInput.value = '';
        bodyInput.value = '';
        if (scheduledInput) scheduledInput.value = '';
        if (assignedInput)  assignedInput.value = '';
        if (inviteClient)   inviteClient.checked = false;
        currentPage = 1;
        loadList();
      } catch (e) {
        UI.toast(e.message || 'Errore nel salvataggio', 'error');
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Aggiungi';
      }
    }

    async function loadList() {
      const listEl = document.getElementById('al-list');
      const pageEl = document.getElementById('al-pagination');
      if (!listEl) return;
      
      listEl.innerHTML = '<div style="padding:40px 0; text-align:center; color:var(--gray-400); font-size:13px;">Caricamento storico...</div>';
      
      try {
        const res = await _load(cfg, currentPage, currentFilter);
        let events = res.data || [];
        
        // Removed strict filtering so that the timeline acts as a complete
        // audit trail for everything that happens, including automated events.
        // events = events.filter(ev => !['call', 'meeting', 'task', 'email', 'email_sent'].includes(ev.event_type));
        
        if (!events.length) {
          listEl.innerHTML = `
            <div style="padding:48px 0; text-align:center;">
              <div style="font-size:32px; margin-bottom:12px; opacity:0.3;">⏳</div>
              <p style="color:var(--gray-500); font-size:14px; margin:0;">Nessuna attività registrata per questo filtro.</p>
            </div>`;
          if (pageEl) pageEl.innerHTML = '';
          return;
        }
        
        const groups = _groupByDate(events);
        let html = '';
        for (const [date, evs] of groups) {
          html += `<div class="al-date-header"><span>${date}</span></div>`;
          html += `<div class="al-date-group">${evs.map(_renderEvent).join('')}</div>`;
        }
        listEl.innerHTML = html;

        // Attach invite buttons
        listEl.querySelectorAll('.al-invite-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            btn.disabled = true;
            btn.textContent = '⏳ Invio...';
            try {
              await _sendInvite(btn.dataset.id);
              UI.toast('Invito calendario inviato', 'success');
              btn.textContent = '✓ Inviato';
            } catch (e) {
              UI.toast(e.message || 'Errore invio invito', 'error');
              btn.disabled = false;
              btn.textContent = '✉️ Invia invito';
            }
          });
        });

        // Pagination
        const totalPages = Math.ceil((res.total || 0) / 30);
        if (pageEl && totalPages > 1) {
          pageEl.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border); padding-top:16px;">
              <button class="btn btn-ghost btn-sm" id="al-prev" ${currentPage <= 1 ? 'disabled' : ''}>← Precedente</button>
              <span style="font-size:12px; color:var(--gray-500);">Pagina ${currentPage} di ${totalPages}</span>
              <button class="btn btn-ghost btn-sm" id="al-next" ${currentPage >= totalPages ? 'disabled' : ''}>Successiva →</button>
            </div>`;
          document.getElementById('al-prev')?.addEventListener('click', () => { currentPage--; loadList(); });
          document.getElementById('al-next')?.addEventListener('click', () => { currentPage++; loadList(); });
        } else if (pageEl) {
          pageEl.innerHTML = '';
        }
      } catch (e) {
        console.error('[ActivityTimeline] load error:', e);
        listEl.innerHTML = '<div style="padding:24px; text-align:center; color:var(--red-500); font-size:13px; background:var(--red-50); border-radius:8px;">Impossibile recuperare le attività.</div>';
      }
    }

    await render();
  }

  return { init };

})();
