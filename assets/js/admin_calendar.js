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
    const res = await API.get('/activities?page_size=200');
    let data = res.data || [];
    
    // Quick count update
    const allCount = document.querySelector('[data-tab="all"] .pipeline-pill-count');
    if (allCount) allCount.textContent = res.total || data.length;
    
    const mapEvents = (events) => events.map(ev => {
        const c = TYPE_COLORS[ev.event_type] || { bg: '#f1f5f9', text: '#475569' };
        let url = '';
        if (ev.client_id) url = `admin_client_detail.html?id=${ev.client_id}&v=68`;
        else if (ev.onboarding_id) url = `admin_onboarding_detail.html?id=${ev.onboarding_id}&v=68`;
        
        return {
            id: ev.id,
            title: (ev.title || ev.event_type),
            start: ev.created_at,
            allDay: false,
            backgroundColor: c.bg,
            borderColor: c.bg,
            textColor: c.text,
            url: url,
            extendedProps: { type: ev.event_type }
        };
    });

    const calendarEvents = mapEvents(data);
    
    const calendarEl = document.getElementById('calendar');
    console.log('Calendar EL:', calendarEl);
    
    if (typeof FullCalendar === 'undefined') {
        throw new Error("FullCalendar not loaded by browser!");
    }
    
    const calendar = new FullCalendar.Calendar(calendarEl, {
      initialView: 'dayGridMonth',
      locale: 'it',
      height: 650,
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek'
      },
      events: calendarEvents,
      eventClick: function(info) {
        if (info.event.url) {
          info.jsEvent.preventDefault();
          window.location.href = info.event.url;
        }
      }
    });
    
    calendar.render();
    console.log('Calendar rendered!');
    
  } catch (error) {
    console.error('Error loading calendar:', error);
    container.innerHTML = `<div style="text-align:center; color:var(--red-500); padding:40px;">Errore caricamento calendario: ${error.message}</div>`;
  }
})();
