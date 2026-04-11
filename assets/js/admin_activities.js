'use strict';

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

let currentFilter = 'all';
let currentPage = 1;

window.onPageReady(() => {
  Auth.guard('admin');
  Auth.initUI();
  document.querySelectorAll('.cl-status-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cl-status-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.tab;
      currentPage = 1;
      loadActivities();
    });
  });

  let optionsLoaded = false;
  document.getElementById('btn-add-activity')?.addEventListener('click', async () => {
    document.getElementById('modal-act-title').textContent = 'Nuova Attività';
    document.getElementById('act-title').value = '';
    document.getElementById('act-body').value = '';
    document.getElementById('act-type').value = 'task';
    document.getElementById('act-status').value = 'pending';
    document.getElementById('act-start').value = '';
    document.getElementById('act-end').value = '';
    document.getElementById('act-save-btn').dataset.id = '';
    
    document.getElementById('act-client-id').value = '';
    document.getElementById('act-onboarding-id').value = '';
    document.getElementById('modal-activity').classList.add('open');

    if (!optionsLoaded) {
      try {
        const [clients, onb] = await Promise.all([
          API.Clients.list(),
          API.Onboarding.list()
        ]);
        const clData = clients.data || clients.items || clients;
        const obData = onb.data || onb.items || onb;
        
        let clHtml = '<option value="">Nessuno</option>';
        clData.forEach(c => {
          clHtml += `<option value="${c.id}">${c.company_name || c.name}</option>`;
        });
        const cSel = document.getElementById('act-client-id');
        if (cSel) cSel.innerHTML = clHtml;

        let obHtml = '<option value="">Nessuno</option>';
        obData.forEach(o => {
          obHtml += `<option value="${o.id}">${o.title || o.company_name || 'Pratica'}</option>`;
        });
        const oSel = document.getElementById('act-onboarding-id');
        if (oSel) oSel.innerHTML = obHtml;
        
        optionsLoaded = true;
      } catch (err) {
        console.error('Failed loading select options', err);
      }
    }
  });

  document.getElementById('act-save-btn')?.addEventListener('click', async (e) => {
    const btn = e.target;
    const title = document.getElementById('act-title').value.trim();
    if (!title) return UI.toast('Il titolo è obbligatorio', 'error');

    let body = {
      title,
      event_type: document.getElementById('act-type').value,
      body: document.getElementById('act-body').value,
      status: document.getElementById('act-status').value,
      scheduled_at: document.getElementById('act-start').value ? new Date(document.getElementById('act-start').value).toISOString() : null,
      end_at: document.getElementById('act-end').value ? new Date(document.getElementById('act-end').value).toISOString() : null,
      metadata: {} 
    };

    const cId = document.getElementById('act-client-id')?.value;
    const oId = document.getElementById('act-onboarding-id')?.value;
    
    // In global activities POST we use /activities which accepts `client_id` and `onboarding_id`?
    // Wait, the API `POST /activities` only takes ActivityCreate schema, our global_router uses _create_activity.
    // I need to be careful: the POST endpoint for global is `POST /activities`.
    // Wait, let's verify if POST /activities accepts client_id and onboarding_id.
    
    const endpointStr = cId ? `/clients/${cId}/activity` : (oId ? `/onboarding/${oId}/activity` : '/activities');

    btn.disabled = true;
    try {
      const id = btn.dataset.id;
      if (id) {
        await window.API.patch(`/activities/${id}`, body);
        UI.toast('Attività aggiornata!');
      } else {
        await window.API.post(endpointStr, body);
        UI.toast('Attività creata!');
      }
      document.getElementById('modal-activity').classList.remove('open');
      loadActivities();
    } catch (err) {
      UI.toast(err.message || 'Errore salvataggio', 'error');
    } finally {
      btn.disabled = false;
    }
  });

  loadActivities();

  setTimeout(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('new') === '1') {
      const btn = document.getElementById('btn-add-activity');
      if (btn) {
        btn.click();
        // The click handler is async and loads clients. Poll for completion.
        let checks = 0;
        const intv = setInterval(() => {
          if (optionsLoaded || checks > 10) {
            clearInterval(intv);
            const client = params.get('client_id');
            const onb = params.get('onboarding_id');
            if (client) document.getElementById('act-client-id').value = client;
            if (onb) document.getElementById('act-onboarding-id').value = onb;
          }
          checks++;
        }, 100);
      }
    }
  }, 200);
});

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

function renderEvent(ev) {
  const meta   = EVENT_ICONS[ev.event_type] || EVENT_ICONS.system;
  const actor  = ev.users?.name || ev.users?.email || 'Sistema';
  
  const displayDate = ev.metadata?.scheduled_at ? ev.metadata.scheduled_at : ev.created_at;
  const timeStr = new Date(displayDate).toLocaleString('it-IT', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  
  const title = ev.title || ev.description || '';
  
  // Link to either client or onboarding
  let linkParams = '';
  if (ev.client_id) linkParams = `admin_client_detail.html?id=${ev.client_id}&v=68`;
  else if (ev.onboarding_id) linkParams = `admin_onboarding_detail.html?id=${ev.onboarding_id}&v=68`;

  let linkHtml = linkParams 
    ? `<a href="${linkParams}" style="font-size:12px;font-weight:600;color:var(--brand-600);text-decoration:none;margin-top:4px;display:inline-block;">Vedi scheda →</a>`
    : '';

  let statusBadge = ev.metadata?.status === 'completed'
    ? `<span style="font-size:11px; font-weight:700; color:#10b981; background:#d1fae5; padding:2px 6px; border-radius:4px; margin-left:8px;">Completato</span>`
    : '';

  return `
    <div class="al-event" data-id="${ev.id}">
      <div class="al-dot" style="color:${meta.color}; border-color:${meta.color}30; background:${meta.color}08;">${meta.icon}</div>
      <div class="al-content">
        <div class="al-header">
          <span class="al-title">${title} ${statusBadge}</span>
          <span style="font-size:12px;color:var(--gray-400);" title="${timeStr}">${_relativeTime(displayDate)}</span>
        </div>
        ${ev.body ? `<div class="al-body">${ev.body.replace(/\n/g, '<br>')}</div>` : ''}
        ${linkHtml}
        <div class="al-meta" style="display:flex;align-items:center;justify-content:space-between;margin-top:12px;">
          <span style="display:flex;align-items:center;gap:4px;">
            <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
            ${actor}
          </span>
          <span class="al-badge" style="color:${meta.color}; background:${meta.color}15;">${meta.label}</span>
        </div>
      </div>
    </div>`;
}

async function loadActivities() {
  const container = document.querySelector('.card');
  container.innerHTML = '<div style="padding:40px 0; text-align:center; color:var(--gray-400); font-size:13px;">Caricamento storico...</div>';

  try {
    let url = `/activities?page=${currentPage}&page_size=50`;
    if (currentFilter && currentFilter !== 'all') {
      url += `&event_type=${currentFilter}`;
    }
    
    const res = await API.get(url);
    const events = res.data || [];
    
    // Update KPI if we are on 'all'
    if (currentFilter === 'all') {
      document.getElementById('kpi-act-all').textContent = res.total || 0;
      // We don't have separate counts for each type from this API easily without polling, 
      // but it's okay, we can just display 0 or count dynamically if we want.
      // Usually pipeline implies counts, but here we just leave them or fetch separately.
    }

    if (!events.length) {
      container.innerHTML = `
        <div style="padding:48px 0; text-align:center;">
          <div style="font-size:32px; margin-bottom:12px; opacity:0.3;">⏳</div>
          <p style="color:var(--gray-500); font-size:14px; margin:0;">Nessuna attività registrata per questo filtro.</p>
        </div>`;
      return;
    }

    container.innerHTML = `
      <div style="padding:24px;">
        <div class="al-events" style="margin:0 auto; max-width: 800px;">
          ${events.map(ev => renderEvent(ev)).join('')}
        </div>
      </div>
    `;

  } catch (error) {
    console.error('Error loading activities:', error);
    container.innerHTML = `<div style="text-align:center; color:var(--red-500); padding:40px;">Errore nel caricamento delle attività: ${error.message || 'Errore sconosciuto'}</div>`;
  }
}
