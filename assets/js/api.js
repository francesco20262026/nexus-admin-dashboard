/* =============================================================
   api.js Nova CRM  |  Pure HTTP transport layer
   v3 final clean version

   CONTRACT
   ────────
   • No showToast      • No location.href      • No DOM access
   • Returns data or throws ApiError
   • Callers own all error display and navigation
   ============================================================= */

'use strict';

// ─── Constants ────────────────────────────────────────────────
// In local dev (localhost/127.0.0.1) use the local backend directly.
// In Replit or production, the API is served from the same origin under /api.
function _resolveApiBase() {
  const h = location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') {
    return 'http://127.0.0.1:8000/api';
  }
  // Production (Separate backend domain)
  return 'https://api.delocanova.com/api';
}
const _API_BASE  = _resolveApiBase();
const _TOKEN_KEY = 'nexus_token';




// ─── Structured error ─────────────────────────────────────────
//
//   thrown by every failure path in this module
//   code: 'network' | 'unauthorized' | 'not_found' | 'server' | 'client'
//
class ApiError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name   = 'ApiError';
    this.code   = code;
    this.status = status; // HTTP status, or null for network errors
  }
}
window.ApiError = ApiError;

// ─── Query-string builder ─────────────────────────────────────
//
//   Merges a params object with an optional company_id.
//   Never mutates the caller's object.
//   Strips null / undefined values before serialising.
//
function _buildQuery(params) {
  const merged = { page_size: 200, ...params };
  const clean = Object.fromEntries(
    Object.entries(merged).filter(([, v]) => v != null)
  );
  return new URLSearchParams(clean).toString();
}

// ─── Main API object ──────────────────────────────────────────
const API = {

  // ─── Tokens ─────────────────────────────────────────────────
  getToken()   { return localStorage.getItem(_TOKEN_KEY); },
  setToken(t)  { localStorage.setItem(_TOKEN_KEY, t); },
  clearToken() { localStorage.removeItem(_TOKEN_KEY); },

  _headers() {
    const h = { 'Content-Type': 'application/json' };
    const t = this.getToken();
    if (t) h['Authorization'] = `Bearer ${t}`;
    return h;
  },

  // ─── Cache ──────────────────────────────────────────────────
  //   Map: { 'GET:<url>': { time: <ms>, data: any } }
  //   Only GET responses are cached.
  _cache:    {},
  _cacheTTL: 2 * 60 * 1000, // 2 minutes

  // Remove entries whose key starts with 'GET:<_API_BASE><prefix>'.
  // Call with no argument to flush everything.
  invalidateCache(prefix) {
    const match = prefix ? ('GET:' + _API_BASE + prefix) : null;
    for (const key of Object.keys(this._cache)) {
      if (!match || key.startsWith(match)) delete this._cache[key];
    }
  },

  // ─── Core request ────────────────────────────────────────────
  //
  //   method       : HTTP verb string
  //   path         : path relative to _API_BASE (leading slash required)
  //   body         : JSON-serialisable object, or null
  //   forceRefresh : skip cache for this GET and refresh the stored entry
  //
  async _request(method, path, body, forceRefresh) {
    const url      = _API_BASE + path;
    const cacheKey = 'GET:' + url;

    // Serve from cache when available and fresh
    if (method === 'GET' && !forceRefresh) {
      const entry = this._cache[cacheKey];
      if (entry && (Date.now() - entry.time < this._cacheTTL)) return entry.data;
    }

    // Invalidate the affected resource namespace on every mutation.
    // Also invalidate /dashboard it aggregates KPIs from all core entities.
    if (method !== 'GET') {
      const ns = path.replace(/^\//, '').split('/')[0]; // e.g. 'clients'
      this.invalidateCache('/' + ns);
      const DASHBOARD_DEPS = ['clients', 'invoices', 'contracts', 'renewals', 'payments', 'documents', 'services', 'onboarding'];
      if (DASHBOARD_DEPS.includes(ns)) this.invalidateCache('/dashboard');
    }

    const opts = { method, headers: this._headers() };
    if (body instanceof FormData) {
      opts.body = body;
      delete opts.headers['Content-Type'];
    } else if (body != null) {
      opts.body = JSON.stringify(body);
    }

    let res;
    try {
      res = await fetch(url, opts);
    } catch (_) {
      throw new ApiError(
        'Impossibile raggiungere il server. Controlla la connessione.',
        'network',
        null
      );
    }

    if (res.status === 401) {
      this.clearToken();
      throw new ApiError('Sessione scaduta. Effettua di nuovo il login.', 'unauthorized', 401);
    }

    if (res.status === 204) return null;

    if (!res.ok) {
      let detail = `Errore ${res.status}`;
      try {
        const b = await res.json();
        if (typeof b.detail === 'string') {
          detail = b.detail;
        } else if (Array.isArray(b.detail) && b.detail.length > 0) {
          // Pydantic validation error: [{loc, msg, type}, ...]
          const _pydanticIt = msg => {
            if (!msg) return msg;
            // Strip Pydantic v2 "Value error, " prefix
            msg = msg.replace(/^Value error,\s*/i, '');
            if (msg === 'Field required')                        return 'Campo obbligatorio mancante';
            if (msg.includes('valid email'))                     return 'Formato email non valido';
            if (msg.includes('valid url'))                       return 'URL non valido';
            if (msg.includes('must be one of'))                  return msg.replace('must be one of', 'deve essere uno tra');
            if (msg.includes('must be'))                         return msg.replace('must be', 'deve essere');
            if (msg.includes('String should have at least'))     return 'Il valore è troppo corto';
            if (msg.includes('status must be'))                  return msg.replace('status must be', 'stato deve essere');
            return msg;
          };
          detail = b.detail.map(e => _pydanticIt(e.msg) || JSON.stringify(e)).join(' | ');
        } else if (b.message) {
          detail = b.message;
        }
      } catch (_) {}
      const code = res.status === 404 ? 'not_found' : res.status >= 500 ? 'server' : 'client';
      throw new ApiError(detail, code, res.status);
    }

    if (res.status === 204) {
      return null;
    }
    const data = await res.json().catch(() => ({}));
    if (method === 'GET') this._cache[cacheKey] = { time: Date.now(), data };
    return data;
  },

  // ─── HTTP verbs ──────────────────────────────────────────────
  get   (path, forceRefresh) { return this._request('GET',    path, null, forceRefresh); },
  post  (path, body)         { return this._request('POST',   path, body); },
  put   (path, body)         { return this._request('PUT',    path, body); },
  patch (path, body)         { return this._request('PATCH',  path, body); },
  del   (path)               { return this._request('DELETE', path); },

  // ─── Multipart upload ────────────────────────────────────────
  async upload(path, formData) {
    const headers = {};
    const t = this.getToken();
    if (t) headers['Authorization'] = `Bearer ${t}`;
    // No Content-Type browser sets it with the correct boundary

    let res;
    try {
      res = await fetch(_API_BASE + path, { method: 'POST', headers, body: formData });
    } catch (_) {
      throw new ApiError("Errore di rete durante l'upload.", 'network', null);
    }

    if (res.status === 401) {
      this.clearToken();
      throw new ApiError('Sessione scaduta.', 'unauthorized', 401);
    }

    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      let detail = `Errore upload ${res.status}`;
      if (typeof b.detail === 'string') {
        detail = b.detail;
      } else if (Array.isArray(b.detail) && b.detail.length > 0) {
        detail = b.detail.map(e => e.msg).join(' | ');
      } else if (b.message) {
        detail = b.message;
      }
      throw new ApiError(detail, 'server', res.status);
    }

    return res.json();
  },

  // ─────────────────────────────────────────────────────────────
  //  NAMESPACED ENDPOINTS
  //  Public interface keep stable.
  //  All list() calls use _buildQuery(params) directly.
  // ─────────────────────────────────────────────────────────────

  Auth: {
    login:         (body)       => API.post('/auth/login', body),
    me:            ()           => API.get('/auth/me'),
    switchCompany: (company_id) => API.post('/auth/switch-company', { company_id }),
    updateLang:    (lang)       => API.put('/auth/me/lang', { lang }),
    invite:        (body)       => API.post('/auth/invite', body),
  },

  Users: {
    list:   (p = {}, f = false) => API.get('/users?' + _buildQuery(p), f),
    invite: (body)     => API.post('/users/invite', body),
    update: (id, body) => API.patch(`/users/${id}`, body),
  },

  Companies: {
    list:            (f = false)      => API.get('/companies', f),
    create:          (body)           => API.post('/companies', body),
    update:          (id, body)       => API.put(`/companies/${id}`, body),
    remove:          (id)             => API.del(`/companies/${id}`),
    delete:          (id)             => API.del(`/companies/${id}`),
    integrations:    (id)             => API.get(`/companies/${id}/integrations`),
    saveIntegration: (id, type, cfg)  => API.put(`/companies/${id}/integrations/${type}`, { config: cfg }),
  },

  Clients: {
    list:          (p = {}, f = false) => API.get('/clients/?' + _buildQuery(p), f),
    get:           (id)       => API.get(`/clients/${id}`),
    create:        (body)     => API.post('/clients/', body),
    update:        (id, body) => API.put(`/clients/${id}`, body),
    remove:        (id, force = false) => API.del(`/clients/${id}${force ? '?force=true' : ''}`),
    delete:        (id, force = false) => API.del(`/clients/${id}${force ? '?force=true' : ''}`),
    contacts:      (id)       => API.get(`/clients/${id}/contacts`),
    addContact:    (id, body) => API.post(`/clients/${id}/contacts`, body),
    updateContact: (id, cid, body) => API.put(`/clients/${id}/contacts/${cid}`, body),
    removeContact: (id, cid)  => API.del(`/clients/${id}/contacts/${cid}`),
    services:      (id)       => API.get(`/clients/${id}/services`),
    invoices:      (id)       => API.get(`/clients/${id}/invoices`),
    contracts:     (id)       => API.get(`/clients/${id}/contracts`),
    documents:     (id)       => API.get(`/clients/${id}/documents`),
    quotes:        (id)       => API.get('/quotes/?' + _buildQuery({ client_id: id })),
  },

  Invoices: {
    list:          (p = {}, f = false) => API.get('/invoices/?' + _buildQuery(p), f),
    get:           (id)            => API.get(`/invoices/${id}`),
    create:        (body)          => API.post('/invoices/', body),
    update:        (id, body)      => API.put(`/invoices/${id}`, body),
    remove:        (id)            => API.del(`/invoices/${id}`),
    delete:        (id)            => API.del(`/invoices/${id}`),
    markPaid:      (id, body = {}) => API.post(`/invoices/${id}/mark-paid`, body),
    reviewPayment: (id, body)      => API.post(`/invoices/${id}/review-payment`, body),
    submitProof:   (id, body)      => API.post(`/invoices/${id}/submit-proof`, body),
    markPending:   (id)            => API.post(`/invoices/${id}/mark-pending-payment`, {}),
    paymentInfo:   (id)            => API.get(`/invoices/${id}/payment-info`),
    overdue:       ()              => API.get('/invoices/overdue?' + _buildQuery({})),
    report:        (p = {})        => API.get('/invoices/report?' + _buildQuery(p)),
    sendReminder:  (id)            => API.post(`/invoices/${id}/send-reminder`, {}),
  },

  Services: {
    catalog:       (activeOnly = true, f = false) => API.get('/services/catalog?' + _buildQuery({ active_only: activeOnly }), f),
    createService: (body)              => API.post('/services/catalog', body),
    updateService: (id, body)          => API.put(`/services/catalog/${id}`, body),
    deleteService: (id)                => API.del(`/services/catalog/${id}`),
    duplicate:     (id)                => API.post(`/services/catalog/${id}/duplicate`, {}),
    usages:        (id)                => API.get(`/services/catalog/${id}/usages`),
    // Aliases standard CRUD
    create:        (body)              => API.post('/services/catalog', body),
    update:        (id, body)          => API.put(`/services/catalog/${id}`, body),
    remove:        (id)                => API.del(`/services/catalog/${id}`),
    subscriptions: (p = {})            => API.get('/services/subscriptions?' + _buildQuery(p)),
    subscribe:     (body)              => API.post('/services/subscriptions', body),
    updateSub:     (id, body)          => API.put(`/services/subscriptions/${id}`, body),
    cancelSub:     (id)                => API.del(`/services/subscriptions/${id}`),
  },

  Contracts: {
    list:      (p = {}, f = false) => API.get('/contracts/?' + _buildQuery(p), f),
    get:       (id)          => API.get(`/contracts/${id}`),
    create:    (body)        => API.post('/contracts/', body),
    update:    (id, body)    => API.put(`/contracts/${id}`, body),
    remove:    (id)          => API.del(`/contracts/${id}`),
    delete:    (id)          => API.del(`/contracts/${id}`),
    send:      (id, body = {}) => API.post(`/contracts/${id}/send-sign`, body),
    compile:   (id)          => API.post(`/contracts/${id}/compile`, {}),
    uploadSigned: (fd)       => API.upload('/contracts/upload-signed', fd),
    uploadSignedExisting: (id, fd) => API.upload(`/contracts/${id}/upload-signed`, fd),
    templates:        (p={}) => API.get('/contracts/templates/list?' + _buildQuery(p)),
    createTemplate:   (body) => API.post('/contracts/templates', body),
    updateTemplate:   (id, body) => API.put(`/contracts/templates/${id}`, body),
    deleteTemplate:   (id)   => API.del(`/contracts/templates/${id}`),
    regenerate:       (id, body) => API.post(`/contracts/${id}/regenerate`, body),
    markSigned:       (id)   => API.post(`/contracts/${id}/mark-signed`, {}),
  },

  Documents: {
    list:     (p = {}, f = false) => API.get('/documents/?' + _buildQuery(p), f),
    get:      (id)       => API.get(`/documents/${id}`),
    update:   (id, body) => API.put(`/documents/${id}`, body),
    remove:   (id)       => API.del(`/documents/${id}`),
    download: (id)       => API.get(`/documents/${id}/download`),
    upload:   (fd)       => API.upload('/documents/upload', fd),
    sign:     (id)       => API.post(`/documents/${id}/sign`, {}),
    audit:    (id)       => API.get(`/documents/${id}/audit`),
  },

  Reminders: {
    list:    (p = {}, f = false) => API.get('/reminders/?' + _buildQuery(p), f),
    send:    (invoiceId, level) => API.post(`/reminders/${invoiceId}/send?` + _buildQuery({ level })),
    history: (invoiceId)        => API.get(`/reminders/${invoiceId}/history`),
  },

  Renewals: {
    list:         (p = {}, f = false) => API.get('/renewals/?' + _buildQuery(p), f),
    create:       (body)     => API.post('/renewals/', body),
    update:       (id, body) => API.put(`/renewals/${id}`, body),
    alert:        (id)       => API.post(`/renewals/${id}/alert`, {}),
    sendReminder: (id)       => API.post(`/renewals/${id}/alert`, {}), // alias backend uses /alert
  },

  Onboarding: {
    list:     (p = {}, forceRefresh = false) => API.get('/onboarding/?' + _buildQuery(p), forceRefresh),
    get:      (id)        => API.get(`/onboarding/${id}`),
    create:   (body)      => API.post('/onboarding/', body),
    update:   (id, body)  => API.put(`/onboarding/${id}`, body),
    remove:   (id, force = false) => API.del(`/onboarding/${id}${force ? '?force=true' : ''}`),
    delete:   (id, force = false) => API.del(`/onboarding/${id}${force ? '?force=true' : ''}`),
    convert:  (id)        => API.post(`/onboarding/${id}/convert`, {}),  // promotes to Client
    cancel:   (id)        => API.post(`/onboarding/${id}/cancel`, {}),
    invite:   (id, body)  => API.post(`/onboarding/${id}/invite`, body),
    markPortalLogin:  ()          => API.post('/onboarding/mark-portal-login', {}),
    contacts: (id)        => API.get(`/onboarding/${id}/contacts`),
    addContact: (id, body)=> API.post(`/onboarding/${id}/contacts`, body),
    updateContact: (id, cid, body) => API.put(`/onboarding/${id}/contacts/${cid}`, body),
    removeContact: (id, cid) => API.del(`/onboarding/${id}/contacts/${cid}`),
  },


  Quotes: {
    list:          (p = {}, f = false) => API.get('/quotes/?' + _buildQuery(p), f),
    get:           (id)         => API.get(`/quotes/${id}`),
    create:        (body)       => API.post('/quotes/', body),
    update:        (id, body)   => API.put(`/quotes/${id}`, body),
    remove:        (id)         => API.del(`/quotes/${id}`),
    delete:        (id)         => API.del(`/quotes/${id}`),
    send:          (id)         => API.post(`/quotes/${id}/send`, {}),
    accept:        (id)         => API.post(`/quotes/${id}/accept`, {}),
    acceptVerbal:  (id)         => API.post(`/quotes/${id}/accept-verbal`, {}),
    reject:        (id)         => API.post(`/quotes/${id}/reject`, {}),
    expire:        (id)         => API.post(`/quotes/${id}/expire`, {}),
    preflight:     (id)         => API.get(`/quotes/${id}/preflight`),
    duplicate:     (id)         => API.post(`/quotes/${id}/duplicate`, {}),
    clientSummary: (clientId)   => API.get(`/quotes/client/${clientId}/summary`),
  },

  Dashboard: {
    kpi:            (f = false)  => API.get('/dashboard/kpi?' + _buildQuery({}), f),
    revenueChart:   (months = 6, f = false) => API.get('/dashboard/revenue-chart?' + _buildQuery({ months }), f),
    activity:       (limit = 20, f = false) => API.get('/dashboard/recent-activity?' + _buildQuery({ limit }), f),
    clientActivity: (limit = 20, f = false) => API.get('/dashboard/client/recent-activity?' + _buildQuery({ limit }), f),
  },

  Settings: {
    // ── User & company profile ──────────────────────────────
    getUser:       (f = false) => API.get('/settings/me', f),
    updateUser:    (body)      => API.put('/settings/me', body),
    getCompany:    (f = false) => API.get('/settings/company', f),
    updateCompany: (body)      => API.put('/settings/company', body),
    // ── Integrations ─────────────────────────────────────────
    // GET  /settings/integrations  → returns { windoc_configured, zoho_configured, email_provider }
    // PUT  /settings/integrations/{type}  → body must be { config: { ...fields } }
    integrations:  ()          => API.get('/settings/integrations'),
    saveIntegration: (type, config) => API.put(`/settings/integrations/${type}`, { config }),
  },

  Payments: {
    list: (p = {}) => API.get('/payments/?' + _buildQuery(p)),
    get:  (id)     => API.get(`/payments/${id}`),
    match:(id)     => API.post(`/payments/${id}/match`, {}),
    logs: (p = {}) => API.get('/payments/logs?' + _buildQuery(p)),
  },

  Windoc: {
    // Cliente → Windoc Rubrica
    syncClient:     (clientId)          => API.post(`/clients/${clientId}/sync-windoc`, {}),
    // Windoc Rubrica → CRM import
    contacts:       (p = {})            => API.get('/clients/windoc/contacts?' + new URLSearchParams(p).toString()),
    importContacts: (items)             => API.post('/clients/windoc/import', { items }),
    // Fattura/Proforma → Windoc
    pushInvoice:    (invoiceId)         => API.post(`/invoices/${invoiceId}/push-windoc`, {}),
    invoiceStatus:  (invoiceId)         => API.get(`/invoices/${invoiceId}/windoc-status`),
  },

  Jobs: {
    triggerPaymentReminders: () => API.post('/jobs/trigger-payment-reminders', {}),
    triggerRenewalAlerts:    () => API.post('/jobs/trigger-renewal-alerts', {}),
  },
};

// ─── Exports ──────────────────────────────────────────────────
window.API = API;

window.URLHelper = {
  getParam: (name) => new URLSearchParams(window.location.search).get(name),
};
