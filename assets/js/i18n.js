/* ============================================================
   i18n.js — Nexus CRM Internationalization
   Translation strings live in: assets/locales/{lang}.json
   Usage:
     <span data-i18n="nav.dashboard"></span>
     I18n.t('nav.dashboard')
     I18n.setLang('en')
     await I18n.init('lang-switcher-slot')
   ============================================================ */

const I18n = {

  _lang:  localStorage.getItem('nexus_lang') || 'it',
  _data:  {},
  _ready: false,

  // ── Load locale JSON from disk ─────────────────────────────
  async _load(lang) {
    try {
      const res  = await fetch(`assets/locales/${lang}.json`);
      if (!res.ok) throw new Error(`i18n: failed to load ${lang}.json`);
      return await res.json();
    } catch (e) {
      console.warn(e);
      return {};
    }
  },

  // ── Minimal embedded fallback dictionary (IT) ───────────────
  // Used when JSON load fails (file://, CORS, offline). Keeps
  // the sidebar readable even without a running web server.
  _fallback: {
    'nav.main':        'Principale',
    'nav.management':  'Gestione',
    'nav.finance':     'Finanza',
    'nav.analytics':   'Analisi',
    'nav.system':      'Sistema',
    'nav.dashboard':   'Dashboard',
    'nav.onboarding':  'Onboarding',
    'nav.clients':     'Clienti',
    'nav.services':    'Servizi',
    'nav.contracts':   'Contratti',
    'nav.documents':   'Documenti',
    'nav.invoices':    'Fatture',
    'nav.renewals':    'Rinnovi',
    'nav.reports':     'Report',
    'nav.users':       'Utenti',
    'nav.companies':   'Aziende',
    'nav.settings':    'Impostazioni',
  },

  // ── Resolve a translation key ─────────────────────────────
  t(key) {
    return this._data[key] ?? this._fallback[key] ?? key;
  },


  // ── Apply translations to all data-i18n elements ──────────
  apply() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      const val = this.t(key);
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = val;
      } else {
        el.textContent = val;
      }
    });
    document.documentElement.lang = this._lang;
  },

  // ── Change language, persist, reload UI ───────────────────
  async setLang(lang) {
    if (lang === this._lang && this._ready) return;
    this._lang = lang;
    localStorage.setItem('nexus_lang', lang);
    this._data  = await this._load(lang);
    this._ready = true;
    this.apply();
    if (this._switcherContainerId) this.renderSwitcher(this._switcherContainerId);
    // Sync with backend if logged in (fire-and-forget)
    window.API?.Auth?.updateLang?.(lang).catch(() => {});
  },

  // ── Render the language switcher dropdown ─────────────────
  // Globe SVG + language code (IT/EN). No native <select>.
  // Dropdown is position:absolute — does not push layout.
  _switcherContainerId: null,

  renderSwitcher(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const labels = { it: 'IT', en: 'US' };
    const names  = { it: 'Italiano', en: 'English (US)' };
    const code   = labels[this._lang] || this._lang.toUpperCase();
    const other  = this._lang === 'it' ? 'en' : 'it';

    const globeSVG = `<svg xmlns="http://www.w3.org/2000/svg" fill="none"
      viewBox="0 0 24 24" stroke-width="1.75" stroke="currentColor"
      class="lang-globe" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round"
        d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747
           M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515
           3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582
           m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0
           A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253M3 12a8.954 8.954 0 0 0
           .71 3.527"/>
    </svg>`;

    el.innerHTML = `
      <div class="lang-switcher" id="lang-switcher">
        <button class="lang-trigger" id="lang-trigger"
                onclick="I18n._toggleDropdown()"
                aria-haspopup="listbox" aria-expanded="false"
                title="Language / Lingua">
          ${globeSVG}
          <span class="lang-code">${code}</span>
          <svg class="lang-chevron" xmlns="http://www.w3.org/2000/svg"
               viewBox="0 0 20 20" fill="currentColor" width="12" height="12" aria-hidden="true">
            <path fill-rule="evenodd"
              d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06
                 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
              clip-rule="evenodd"/>
          </svg>
        </button>
        <div class="lang-dropdown" id="lang-dropdown" role="listbox">
          <button class="lang-option${this._lang === 'it' ? ' active' : ''}"
                  onclick="I18n.setLang('it')" role="option">
            <span class="lang-opt-code">IT</span>
            <span class="lang-opt-name">${names.it}</span>
          </button>
          <button class="lang-option${this._lang === 'en' ? ' active' : ''}"
                  onclick="I18n.setLang('en')" role="option">
            <span class="lang-opt-code">EN</span>
            <span class="lang-opt-name">${names.en}</span>
          </button>
        </div>
      </div>`;
  },

  _toggleDropdown() {
    const dd      = document.getElementById('lang-dropdown');
    const trigger = document.getElementById('lang-trigger');
    if (!dd) return;
    const open = dd.classList.toggle('open');
    trigger.setAttribute('aria-expanded', String(open));
    if (open) {
      setTimeout(() => {
        document.addEventListener('click', function close(e) {
          if (!document.getElementById('lang-switcher')?.contains(e.target)) {
            dd.classList.remove('open');
            trigger?.setAttribute('aria-expanded', 'false');
          }
          document.removeEventListener('click', close);
        });
      }, 0);
    }
  },

  // ── Init: load locale, render switcher, apply translations ─
  async init(switcherContainerId) {
    this._switcherContainerId = switcherContainerId || null;
    this._data  = await this._load(this._lang);
    this._ready = true;
    this.apply();
    if (switcherContainerId) this.renderSwitcher(switcherContainerId);
  },
};

window.I18n = I18n;
