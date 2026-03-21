/* ============================================================
   auth.js — Nexus CRM auth module
   ============================================================ */

const Auth = {

  // ── Token helpers (delegate to API layer) ──────────────────
  // These delegate to API so there is a single source of truth
  // for the token key. Auth never touches localStorage directly
  // for the token — only API does.
  setToken(t)  { window.API?.setToken(t) || localStorage.setItem('nexus_token', t); },
  clearToken() { window.API?.clearToken() || localStorage.removeItem('nexus_token'); },
  getToken()   { return window.API?.getToken() || localStorage.getItem('nexus_token'); },

  // ── Login ──────────────────────────────────────────────────
  async login(email, password) {
    try {
      const data = await API.post('/auth/login', { email, password });
      API.setToken(data.token);
      const payload = JSON.parse(atob(data.token.split('.')[1]));
      if (payload.active_company_id) {
        localStorage.setItem('nexus_active_company_id',   payload.active_company_id);
        localStorage.setItem('nexus_active_company',      payload.active_company_id);
        localStorage.setItem('nexus_active_company_name', payload.active_company_id);
      }
      // Save the full companies list so the company switcher can render them
      if (Array.isArray(data.companies)) {
        localStorage.setItem('nexus_companies', JSON.stringify(data.companies));
      }
      window.location.href = payload.role === 'admin' ? 'admin_dash.html' : 'client_dash.html';
    } catch (err) {
      const msg = err.code === 'unauthorized'
        ? 'Email o password errati.'
        : (err.message || 'Errore di login.');
      window.showToast?.(msg, 'error');
      throw err;
    }
  },

  // ── Logout ─────────────────────────────────────────────────
  // Clears token AND all company context before redirecting.
  logout() {
    this.clearToken();
    localStorage.removeItem('nexus_active_company_id');
    localStorage.removeItem('nexus_active_company');
    localStorage.removeItem('nexus_active_company_name');
    localStorage.removeItem('nexus_active_company_color');
    localStorage.removeItem('nexus_companies');
    window.location.href = 'login.html';
  },

  // ── JWT payload decoder ───────────────────────────────────
  getPayload() {
    try {
      const token = this.getToken();
      if (!token) return null;
      return JSON.parse(atob(token.split('.')[1]));
    } catch { return null; }
  },

  // ── Route guard ───────────────────────────────────────────
  //
  //   Usage:
  //     Auth.guard()          — any authenticated user
  //     Auth.guard('admin')   — admin only, non-admins → client_dash.html
  //     Auth.guard('client')  — client only, admins → admin_dash.html
  //
  guard(role = '') {
    const token = this.getToken();
    if (!token) { location.href = 'login.html'; return false; }

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));

      // Token expiry check
      if (payload.exp && Date.now() / 1000 > payload.exp) {
        this.logout(); return false;
      }

      // Role enforcement
      if (role === 'admin' && payload.role !== 'admin') {
        location.href = 'client_dash.html'; return false;
      }
      if (role === 'client' && payload.role === 'admin') {
        location.href = 'admin_dash.html'; return false;
      }

      return true;
    } catch {
      this.logout(); return false;
    }
  },

  // ── Company context ───────────────────────────────────────
  getActiveCompany() {
    return localStorage.getItem('nexus_active_company_id')
        || localStorage.getItem('nexus_active_company');
  },

  setActiveCompany(companyId) {
    if (!companyId) return;
    localStorage.setItem('nexus_active_company_id', companyId);
    localStorage.setItem('nexus_active_company', companyId);

    // Attempt backend sync if API is ready
    if (window.API?.Auth?.switchCompany) {
      API.Auth.switchCompany(companyId).then(res => {
        if (res?.token) API.setToken(res.token);
      }).catch(() => {});
    }

    window.dispatchEvent(new CustomEvent('companyChanged', { detail: companyId }));
  },

  onCompanyChange(callback) {
    window.addEventListener('companyChanged', (e) => callback(e.detail));
  },

  // ── Init header / sidebar UI ─────────────────────────────
  //   Step 1: populate instantly from JWT payload (no network, no flash).
  //   Step 2: refresh from API.Auth.me() for accurate server data.
  //
  //   Safe to call even if API is not yet fully ready —
  //   the server refresh is skipped gracefully if API is absent.
  initUI() {
    // Wire logout buttons — prefer data-action attribute, fall back to class
    // Supports: <button data-action="logout">, .logout-btn, #logout-btn
    const logoutEls = [
      ...document.querySelectorAll('[data-action="logout"]'),
      ...document.querySelectorAll('.logout-btn'),
      ...document.querySelectorAll('#logout-btn'),
    ];
    // Deduplicate in case an element matches multiple selectors
    [...new Set(logoutEls)].forEach(btn => {
      btn.addEventListener('click', () => Auth.logout());
    });

    // ── Instant pre-fill from JWT payload ────────────────────
    const payload = this.getPayload();
    if (payload) {
      let display = payload.name || payload.user_metadata?.name
                 || payload.user_metadata?.full_name || payload.email || 'Utente';
      if (display.includes('@')) display = display.split('@')[0];
      if (display.length > 0)   display = display.charAt(0).toUpperCase() + display.slice(1);
      const initials = display ? display.slice(0, 2).toUpperCase() : '??';
      this._applyUI(display, initials);
    }

    // ── Server refresh (async, non-blocking) ─────────────────
    if (!window.API?.Auth?.me) return; // API not ready — skip server refresh

    API.Auth.me().then(profile => {
      let display = profile.name || profile.user_metadata?.name
                 || profile.user_metadata?.full_name || profile.email || 'Utente';
      if (display.includes('@')) display = display.split('@')[0];
      if (display.length > 0)   display = display.charAt(0).toUpperCase() + display.slice(1);
      const initials = display.slice(0, 2).toUpperCase();
      this._applyUI(display, initials);
    }).catch(err => {
      if (err?.code === 'unauthorized') {
        this.logout(); // clears token + company context + redirects
      }
      // Network and other errors are non-fatal for the UI shell
    });
  },

  // ── Internal: fill name/avatar slots ─────────────────────
  _applyUI(display, initials) {
    ['user-name', 'header-name', 'sidebar-name'].forEach(id => {
      const el = document.getElementById(id);
      if (el && display) el.textContent = display;
    });
    ['header-avatar', 'sidebar-avatar'].forEach(id => {
      const el = document.getElementById(id);
      if (el && initials) el.textContent = initials;
    });
  },
};

window.Auth = Auth;
