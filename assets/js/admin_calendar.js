'use strict';

(async () => {
  console.log('Admin Calendar JS init starting...');
  // Force Auth
  try { Auth.requireAuth('admin'); } catch(e) {}
  
  const container = document.querySelector('.card');
  if(!container) {
    console.error('No .card found');
    return;
  }
  container.innerHTML = '<div id="calendar" style="min-height: 650px; width: 100%;"></div>';
  
  const TYPE_COLORS = {
    note: { bg: '#e0e7ff', text: '#4338ca' },
    call: { bg: '#e0f2fe', text: '#0369a1' },
    meeting: { bg: '#f3e8ff', text: '#7e22ce' },
    task: { bg: '#d1fae5', text: '#047857' },
    email_sent: { bg: '#fef3c7', text: '#b45309' },
    quote_sent: { bg: '#dbeafe', text: '#1d4ed8' },
    quote_accepted: { bg: '#d1fae5', text: '#047857' },
    quote_rejected: { bg: '#fee2e2', text: '#b91c1c' },
    invoice_issued: { bg: '#ffedd5', text: '#c2410c' }
  };
  
  try {
    const calendarEl = document.getElementById('calendar');
    if (typeof FullCalendar === 'undefined') {
        throw new Error("FullCalendar not loaded by browser!");
    }
    
    // Add Event Modal bindings
    document.getElementById('btn-add-event')?.addEventListener('click', () => {
      document.getElementById('modal-act-title').textContent = 'Nuova Attività';
      document.getElementById('act-title').value = '';
      document.getElementById('act-body').value = '';
      document.getElementById('act-type').value = 'meeting';
      document.getElementById('act-status').value = 'pending';
      document.getElementById('act-start').value = '';
      document.getElementById('act-end').value = '';
      document.getElementById('act-save-btn').dataset.id = '';
      document.getElementById('modal-activity').classList.add('open');
    });

    document.getElementById('act-save-btn')?.addEventListener('click', async (e) => {
      const btn = e.target;
      const title = document.getElementById('act-title').value.trim();
      if (!title) return UI.toast('Il titolo è obbligatorio', 'error');

      const body = {
        title,
        event_type: document.getElementById('act-type').value,
        body: document.getElementById('act-body').value,
        status: document.getElementById('act-status').value,
        scheduled_at: document.getElementById('act-start').value ? new Date(document.getElementById('act-start').value).toISOString() : null,
        end_at: document.getElementById('act-end').value ? new Date(document.getElementById('act-end').value).toISOString() : null,
        metadata: {} 
      };

      btn.disabled = true;
      try {
        const id = btn.dataset.id;
        if (id) {
          await window.API.patch(`/activities/${id}`, body);
          UI.toast('Attività aggiornata!');
        } else {
          await window.API.post('/activities', body);
          UI.toast('Attività creata!');
        }
        document.getElementById('modal-activity').classList.remove('open');
        window.calendarInstance.refetchEvents();
      } catch (err) {
        UI.toast(err.message || 'Errore salvataggio', 'error');
      } finally {
        btn.disabled = false;
      }
    });
    
    const calendar = new FullCalendar.Calendar(calendarEl, {
      initialView: 'dayGridMonth',
      locale: 'it',
      height: 650,
      buttonText: {
        today: 'Oggi',
        month: 'Mese',
        week: 'Settimana',
        day: 'Giorno',
        list: 'Lista'
      },
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek'
      },
      events: async function(fetchInfo, successCallback, failureCallback) {
        try {
          const start = fetchInfo.startStr;
          const end = fetchInfo.endStr;
          // Filter only schedulable event types for the calendar
          const types = 'meeting,call,task';
          const res = await window.API.get(`/activities?page_size=200&event_type=${types}&start_date=${start}&end_date=${end}`);
          
          let data = res.data || [];
          
          const mapped = data.map(ev => {
            const meta = ev.metadata || {};
            const c = TYPE_COLORS[ev.event_type] || { bg: '#f1f5f9', text: '#475569' };
            let url = '';
            if (ev.client_id) url = `admin_client_detail.html?id=${ev.client_id}&v=68`;
            else if (ev.onboarding_id) url = `admin_onboarding_detail.html?id=${ev.onboarding_id}&v=68`;

            let eventTitle = ev.title || ev.event_type;
            if (meta.status === 'completed') eventTitle = `✅ ${eventTitle}`;
            
            return {
                id: ev.id,
                title: eventTitle,
                start: meta.scheduled_at || ev.created_at,
                end: meta.end_at || null,
                allDay: false,
                backgroundColor: c.bg,
                borderColor: c.bg,
                textColor: c.text,
                url: url,
                extendedProps: { type: ev.event_type, rawObj: ev }
            };
          });
          successCallback(mapped);
        } catch(err) {
          console.error(err);
          failureCallback(err);
        }
      },
      eventClick: function(info) {
        if (info.event.url) {
           info.jsEvent.preventDefault();
           window.location.href = info.event.url;
        } else {
           info.jsEvent.preventDefault();
           document.getElementById('modal-act-title').textContent = 'Modifica Attività';
           const raw = info.event.extendedProps.rawObj;
           document.getElementById('act-title').value = raw.title || '';
           document.getElementById('act-body').value = raw.body || '';
           document.getElementById('act-type').value = raw.event_type || 'task';
           document.getElementById('act-status').value = raw.metadata?.status || 'pending';
           if(raw.metadata?.scheduled_at) {
             document.getElementById('act-start').value = new Date(raw.metadata.scheduled_at).toISOString().slice(0, 16);
           } else {
             document.getElementById('act-start').value = '';
           }
           if(raw.metadata?.end_at) {
             document.getElementById('act-end').value = new Date(raw.metadata.end_at).toISOString().slice(0, 16);
           } else {
             document.getElementById('act-end').value = '';
           }
           document.getElementById('act-save-btn').dataset.id = raw.id;
           document.getElementById('modal-activity').classList.add('open');
        }
      }
    });
    
    calendar.render();
    window.calendarInstance = calendar;
    
  } catch (error) {
    console.error('Error loading calendar:', error);
    container.innerHTML = `<div style="text-align:center; color:var(--red-500); padding:40px;">Errore caricamento calendario: ${error.message}</div>`;
  }
})();
