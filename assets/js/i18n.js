/* i18n.js — Italian only. Language switcher removed. */
const I18n = {
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
    'nav.quotes':      'Preventivi',
    'nav.reminders':   'Promemoria',
  },

  /* t() returns the Italian string or null.
     Callers use:  I18n.t('key') || 'Testo italiano'
     The fallback literal is always Italian, so null is safe. */
  t(key) {
    return this._fallback[key] ?? null;
  },

  /* Apply translations to data-i18n elements (nav sidebar labels). */
  apply() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const val = this.t(el.dataset.i18n);
      if (!val) return;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.placeholder = val;
      else el.textContent = val;
    });
    document.documentElement.lang = 'it';
  },

  /* init — just apply translations, no switcher, no fetch */
  async init(_ignored) {
    this.apply();
  },

  /* setLang — no-op, kept for backwards compatibility */
  async setLang() {},
};

window.I18n = I18n;
