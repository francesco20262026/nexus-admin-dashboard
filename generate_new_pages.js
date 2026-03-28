const fs = require('fs');
const path = require('path');

const dir = 'e:/App/crm';
const templatePath = path.join(dir, 'admin_clients.html');
const templateHTML = fs.readFileSync(templatePath, 'utf8');

// 1. Create admin_activities.html
const activitiesMain = `
<main class="main">
  <div class="page-header">
    <div>
      <h1 class="page-title">Attività</h1>
      <p class="page-subtitle">Gestione dei task, chiamate ed email in sospeso</p>
    </div>
    <div class="page-header-actions">
      <button class="btn btn-primary" id="btn-add-activity">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:15px;height:15px;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
        <span>Nuova attività</span>
      </button>
    </div>
  </div>

  <div class="onb-pipeline-bar" id="act-pipeline-bar" style="margin-top:24px; margin-bottom:24px;">
    <button class="pipeline-pill active" data-tab="all" data-color="all">
      <div class="pipeline-pill-title">Tutte</div>
      <div class="pipeline-pill-count">0</div>
    </button>
    <button class="pipeline-pill" data-tab="todo" data-color="new">
      <div class="pipeline-pill-title">Da fare</div>
      <div class="pipeline-pill-count">0</div>
    </button>
    <button class="pipeline-pill" data-tab="inprogress" data-color="proforma">
      <div class="pipeline-pill-title">In corso</div>
      <div class="pipeline-pill-count">0</div>
    </button>
    <button class="pipeline-pill" data-tab="completed" data-color="verifica">
      <div class="pipeline-pill-title">Completate</div>
      <div class="pipeline-pill-count">0</div>
    </button>
    <button class="pipeline-pill" data-tab="overdue" data-color="alert">
      <div class="pipeline-pill-title">Scadute</div>
      <div class="pipeline-pill-count">0</div>
    </button>
  </div>

  <div class="card" style="padding:24px;">
    <div style="color:var(--gray-500);font-size:14px;text-align:center;padding:40px 0;">Nessuna attività da mostrare</div>
  </div>
</main>
`;
const activitiesHTML = templateHTML.replace(/<main class="main">[\s\S]*?<\/main>/, activitiesMain).replace(/<title>.*?<\/title>/, '<title>Nova CRM — Attività</title>');
fs.writeFileSync(path.join(dir, 'admin_activities.html'), activitiesHTML);

// 2. Create admin_calendar.html
const calendarMain = `
<main class="main">
  <div class="page-header">
    <div>
      <h1 class="page-title">Calendario</h1>
      <p class="page-subtitle">Pianificazione globale degli eventi e appuntamenti</p>
    </div>
    <div class="page-header-actions">
      <button class="btn btn-primary" id="btn-add-event">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:15px;height:15px;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
        <span>Nuovo evento</span>
      </button>
    </div>
  </div>

  <div class="card" style="padding:24px;min-height:500px;display:flex;align-items:center;justify-content:center;">
    <div id="calendar-root" style="color:var(--gray-400);font-size:14px;">Inizializzazione calendario in corso... (Libreria necessaria)</div>
  </div>
</main>
`;
const calendarHTML = templateHTML.replace(/<main class="main">[\s\S]*?<\/main>/, calendarMain).replace(/<title>.*?<\/title>/, '<title>Nova CRM — Calendario</title>');
fs.writeFileSync(path.join(dir, 'admin_calendar.html'), calendarHTML);

// 3. Update the global sidebar across all admin_*.html files
const injection = `    <div class="nav-section-label">Strumenti</div>
    <a class="nav-item" href="admin_calendar.html">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5m-9-6h.008v.008H12v-.008ZM12 15h.008v.008H12V15Zm0 2.25h.008v.008H12v-.008ZM9.75 15h.008v.008H9.75V15Zm0 2.25h.008v.008H9.75v-.008ZM7.5 15h.008v.008H7.5V15Zm0 2.25h.008v.008H7.5v-.008Zm6.75-4.5h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V15Zm0 2.25h.008v.008h-.008v-.008Zm2.25-4.5h.008v.008H16.5v-.008Zm0 2.25h.008v.008H16.5V15Z"/></svg>
      <span class="nav-label">Calendario</span>
    </a>
    <a class="nav-item" href="admin_activities.html">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M10.125 2.25h-4.5c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125v-9M10.125 2.25h.375a9 9 0 0 1 9 9v.375M10.125 2.25A3.375 3.375 0 0 1 13.5 5.625v1.5c0 .621.504 1.125 1.125 1.125h1.5a3.375 3.375 0 0 1 3.375 3.375M9 15l2.25 2.25L15 12"/></svg>
      <span class="nav-label">Attività</span>
    </a>

    <div class="nav-section-label">Analisi</div>`;

const files = fs.readdirSync(dir).filter(f => f.startsWith('admin_') && f.endsWith('.html'));

files.forEach(f => {
  let content = fs.readFileSync(path.join(dir, f), 'utf-8');
  if(content.includes('<div class="nav-section-label">Analisi</div>') && !content.includes('<div class="nav-section-label">Strumenti</div>')) {
    content = content.replace(/<div class="nav-section-label">(data-i18n=".*?")?>Analisi<\/div>/g, injection);
    content = content.replace(/<div class="nav-section-label" data-i18n="nav.analytics">Analisi<\/div>/g, injection);
    // simpler replace
    if (content.includes('nav.analytics">Analisi</div>')) {
        content = content.replace(/<div class="nav-section-label" data-i18n="nav.analytics">Analisi<\/div>/, injection);
    } else {
        content = content.replace(/<div class="nav-section-label">Analisi<\/div>/, injection);
    }
    fs.writeFileSync(path.join(dir, f), content);
    console.log('Updated ' + f);
  }
});
console.log('Update completed.');
