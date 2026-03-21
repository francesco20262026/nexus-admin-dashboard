document.write(`
<!-- ==================== HEADER ==================== -->
<header class="header" id="main-header">
  <button class="header-toggle" id="sidebar-toggle" title="Menu">
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"/></svg>
  </button>

  <!-- Search -->
  <div class="header-search">
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"/></svg>
    <input type="text" data-i18n="header.search_admin" placeholder="Cerca clienti, fatture, contratti…" id="global-search"/>
    <span class="search-shortcut">⌘F</span>
  </div>

  <div class="header-actions">
    <div id="lang-switcher-slot"></div>
    <div class="divider-v"></div>

    <!-- Company Selector -->
    <div class="dropdown-wrap">
      <button class="company-selector" data-dropdown-trigger>
        <div class="company-dot" id="company-dot">A</div>
        <span id="company-label">-</span>
        <svg class="company-chevron" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5"/></svg>
      </button>
      <div class="dropdown-menu" style="min-width:220px;">
        <div style="padding:6px 10px 4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--gray-500);" data-i18n="header.switch_company">Cambia azienda</div>
        <div id="company-list">
          <!-- populated dynamically by dash.js from JWT permissions -->
        </div>
        <div class="dropdown-divider"></div>
        <button class="dropdown-item" onclick="location.href='admin_settings.html'">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="15" height="15"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
          <span data-i18n="header.add_company">Aggiungi azienda</span>
        </button>
      </div>
    </div>
    <div class="divider-v"></div>

    <!-- Notifiche -->
    <div class="dropdown-wrap">
      <button class="icon-btn" data-dropdown-trigger title="Notifiche">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"/></svg>
        <span class="notif-dot" id="notif-dot" style="display:none;"></span>
      </button>
      <div class="dropdown-menu notif-panel">
        <div class="notif-panel-header">
          <span class="notif-panel-title" data-i18n="notif.title">Notifiche</span>
          <button class="btn btn-ghost btn-sm" data-i18n="notif.mark_all">Segna tutte come lette</button>
        </div>
        <div class="notif-empty" id="notif-empty" data-i18n="notif.empty">Nessuna notifica recente</div>
      </div>
    </div>

    <!-- Help -->
    <button class="icon-btn" title="Help">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z"/></svg>
    </button>

    <div class="divider-v"></div>

    <!-- Profile -->
    <div class="dropdown-wrap">
      <button class="profile-btn" data-dropdown-trigger>
        <div class="avatar" id="header-avatar">-</div>
        <div class="profile-info">
          <div class="profile-name" id="header-name">-</div>
          <div class="profile-role" id="header-role">Admin</div>
        </div>
        <svg style="width:14px;height:14px;color:var(--gray-400);margin-left:4px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5"/></svg>
      </button>
      <div class="dropdown-menu">
        <button class="dropdown-item"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"/></svg><span data-i18n="common.my_profile">Il mio profilo</span></button>
        <button class="dropdown-item"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/></svg><span data-i18n="common.settings">Impostazioni account</span></button>
        <div class="dropdown-divider"></div>
        <button class="dropdown-item danger" onclick="Auth.logout()"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9"/></svg><span data-i18n="common.sign_out">Esci</span></button>
      </div>
    </div>
  </div>
</header>
`);