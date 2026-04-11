/* ============================================================
   auth.js Nova CRM auth module
   ============================================================ */

const Auth = {

  // ── Token helpers (delegate to API layer) ──────────────────
  // These delegate to API so there is a single source of truth
  // for the token key. Auth never touches localStorage directly
  // for the token only API does.
  setToken(t)  { window.API?.setToken(t) || localStorage.setItem('nexus_token', t); },
  clearToken() { window.API?.clearToken() || localStorage.removeItem('nexus_token'); },
  getToken()   { return window.API?.getToken() || localStorage.getItem('nexus_token'); },

  // ── Login ──────────────────────────────────────────────────
  async login(email, password) {
    try {
      const data = await API.post('/auth/login', { email, password });
      API.setToken(data.token);
      const payload = JSON.parse(atob(data.token.split('.')[1]));
      window.location.href = payload.role === 'super_admin' ? 'admin_dash.html' : 'client_dash.html';
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
  //     Auth.guard()          any authenticated user
  //     Auth.guard('admin')   super_admin only, non-admins → client_dash.html
  //     Auth.guard('client')  client only, super_admins → admin_dash.html
  //
  guard(role = '') {
    // 1. Intercept Supabase Magic Link hashes directly
    const hash = window.location.hash;
    if (hash && hash.includes('access_token=')) {
      const hp = new URLSearchParams(hash.replace('#', ''));
      const token = hp.get('access_token');
      if (token) {
        // Clean the URL hash immediately so it doesn't linger
        window.history.replaceState(null, null, window.location.pathname + window.location.search);
        
        // Render a loading state on the body while exchanging the token
        document.body.innerHTML = '<div style="display:flex;height:100vh;align-items:center;justify-content:center;background:#f9fafb;font-family:sans-serif;color:#374151;">Autenticazione in corso...</div>';
        
        // Exchange the Supabase token for our custom JWT
        this._exchangeTokenAndReload(token, role);
        throw new Error("HALT_AUTH"); // Stop execution globally so no API calls happen
      }
    }

    const token = this.getToken();
    if (!token) { location.href = 'login.html'; throw new Error("HALT_AUTH"); }

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));

      // Token expiry check
      if (payload.exp && Date.now() / 1000 > payload.exp) {
        this.logout(); throw new Error("HALT_AUTH");
      }

      // Role enforcement
      if (role === 'admin' && payload.role !== 'super_admin') {
        location.href = 'client_dash.html'; throw new Error("HALT_AUTH");
      }
      if (role === 'client' && payload.role === 'super_admin') {
        location.href = 'admin_dash.html'; throw new Error("HALT_AUTH");
      }

      return true;
    } catch {
      this.logout(); throw new Error("HALT_AUTH");
    }
  },

  async _exchangeTokenAndReload(supabaseToken, requiredRole) {
    try {
      if (!window.API) {
        // Fallback if API is not loaded yet (shouldn't happen but just in case)
        console.error('API non disponibile per l exchange token');
        location.href = 'login.html';
        return;
      }
      const data = await API.post('/auth/exchange', { access_token: supabaseToken });
      
      this.setToken(data.token);
      const payload = JSON.parse(atob(data.token.split('.')[1]));
      this.setToken(data.token);

      // Reload the current page without the hash to let normal execution resume!
      window.location.replace(window.location.pathname + window.location.search);
      
    } catch (err) {
      console.error('Token exchange failed:', err);
      location.href = 'login.html';
    }
  },

  // ── Init header / sidebar UI ─────────────────────────────
  //   Step 1: populate instantly from JWT payload (no network, no flash).
  //   Step 2: refresh from API.Auth.me() for accurate server data.
  //
  //   Safe to call even if API is not yet fully ready
  //   the server refresh is skipped gracefully if API is absent.
  initUI() {
    // Wire logout buttons prefer data-action attribute, fall back to class
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
      const roleStr = payload.role === 'super_admin' ? 'Super Admin' : (payload.role === 'admin' ? 'Admin' : 'Operatore');
      this._applyUI(display, initials, roleStr);
    }

    // ── Server refresh (async, non-blocking) ─────────────────
    if (!window.API?.Auth?.me) return; // API not ready skip server refresh

    API.Auth.me().then(profile => {
      let display = profile.name || profile.user_metadata?.name
                 || profile.user_metadata?.full_name || profile.email || 'Utente';
      if (display.includes('@')) display = display.split('@')[0];
      if (display.length > 0)   display = display.charAt(0).toUpperCase() + display.slice(1);
      const initials = display.slice(0, 2).toUpperCase();
      const currentPayload = this.getPayload() || {};
      const actualRole = currentPayload.role || 'operator';
      const roleStr = actualRole === 'super_admin' ? 'Super Admin' : (actualRole === 'admin' ? 'Admin' : 'Operatore');
      this._applyUI(display, initials, roleStr);
    }).catch(err => {
      if (err?.code === 'unauthorized') {
        this.logout(); // clears token + company context + redirects
      }
      // Network and other errors are non-fatal for the UI shell
    });
  },

  // ── Internal: fill name/avatar slots ─────────────────────
  _applyUI(display, initials, roleStr) {
    ['user-name', 'header-name', 'sidebar-name'].forEach(id => {
      const el = document.getElementById(id);
      if (el && display) el.textContent = display;
    });
    ['header-avatar', 'sidebar-avatar'].forEach(id => {
      const el = document.getElementById(id);
      if (el && initials) el.textContent = initials;
    });
    if (roleStr) {
      const el = document.getElementById('header-role');
      if (el) el.textContent = roleStr;
    }
  },
};

window.Auth = Auth;
