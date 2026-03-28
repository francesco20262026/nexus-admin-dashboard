/* ============================================================
   client_documents.js — Client documents page
   ============================================================ */
'use strict';
(function () {
  Auth.guard('client');
  Auth.initUI();

  /* ── State ─────────────────────────────────────────────────── */
  let ALL      = [];
  let filtered = [];

  /* ── DOM refs ──────────────────────────────────────────────── */
  const tbody     = document.getElementById('docs-tbody');
  const search    = document.getElementById('docs-search');
  const fSt       = document.getElementById('docs-filter-status');
  const info      = document.getElementById('docs-info');
  const alertBanner = document.getElementById('docs-alert');

  if (!tbody) console.error('[client_documents] Required DOM node missing: #docs-tbody');

  /* ── Status map ─────────────────────────────────────────────── */
  const STATUS = {
    pending:  { label: 'Da firmare', cls: 'pill-pending'  },
    sent:     { label: 'Inviato',    cls: 'pill-warning'  },
    signed:   { label: 'Firmato',    cls: 'pill-active'   },
    expired:  { label: 'Scaduto',    cls: 'pill-inactive' },
    archived: { label: 'Archiviato', cls: 'pill-inactive' },
  };

  function safeDate(raw, opts = {}) {
    if (!raw) return '';
    try { return new Date(raw).toLocaleDateString('it-IT', opts); } catch { return ''; }
  }

  /* ── Load ───────────────────────────────────────────────────── */
  window._retryClientDocs = load;
  async function load() {
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6" class="loading-row">Caricamento documenti...</td></tr>`;
    let hasError = false;

    try {
      const res = await API.Documents.list();
      ALL       = Array.isArray(res) ? res : (res?.items ?? res?.data ?? []);
    } catch (e) {
      hasError = true;
      ALL      = [];
      console.error('[client_documents] load error:', e);
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--error-text);padding:20px;">
        Impossibile caricare i documenti. <a href="#" onclick="window._retryClientDocs();return false;">Riprova</a>
      </td></tr>`;
    } finally {
      updateChips();
      updateAlert();
      if (!hasError) applyFilters();
    }
  }

  /* ── Stat chips ─────────────────────────────────────────────── */
  function updateChips() {
    const pending = ALL.filter(d => d.status === 'pending' || d.status === 'sent').length;
    const signed  = ALL.filter(d => d.status === 'signed').length;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('chip-docs-total',   ALL.length);
    set('chip-docs-pending', pending);
    set('chip-docs-signed',  signed);
  }

  /* ── Pending alert banner ────────────────────────────────────── */
  function updateAlert() {
    if (!alertBanner) return;
    const pending = ALL.filter(d => d.status === 'pending' || d.status === 'sent');
    if (pending.length > 0) {
      const textEl = document.getElementById('docs-alert-text');
      if (textEl) textEl.textContent = `Hai ${pending.length} documento${pending.length > 1 ? 'i' : ''} in attesa di firma.`;
      alertBanner.style.display = 'flex';
    } else {
      alertBanner.style.display = 'none';
    }
  }

  /* ── Filters ────────────────────────────────────────────────── */
  function applyFilters() {
    const q  = (search?.value || '').toLowerCase().trim();
    const st = fSt?.value || 'all';

    filtered = ALL.filter(d => {
      const hay    = `${d.name || ''} ${d.title || ''} ${d.type || ''}`.toLowerCase();
      const matchQ = !q || hay.includes(q);
      const matchS = st === 'all' || d.status === st;
      return matchQ && matchS;
    });

    render();
  }

  if (search) search.addEventListener('input',  applyFilters);
  if (fSt)    fSt.addEventListener('change',    applyFilters);

  /* ── Render ─────────────────────────────────────────────────── */
  const iconPdf = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="14" height="14"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>`;
  const iconSign = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="14" height="14"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"/></svg>`;

  function render() {
    if (!tbody) return;

    if (!filtered.length) {
      const msg = ALL.length > 0 ? 'Nessun documento corrisponde ai filtri.' : 'Nessun documento disponibile.';
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--gray-400);padding:24px;">${msg}</td></tr>`;
      if (info) info.textContent = '';
      return;
    }

    tbody.innerHTML = filtered.map(d => {
      const st      = STATUS[d.status] || { label: d.status || 'N/D', cls: 'pill-inactive' };
      const upStr   = safeDate(d.uploaded || d.created_at);
      const expStr  = safeDate(d.expires || d.valid_to);
      const label   = d.name || d.title || 'Documento';
      const isPending = d.status === 'pending' || d.status === 'sent';

      const actions = isPending
        ? `<div style="display:flex;gap:8px;justify-content:flex-end;">
            <button class="btn btn-secondary btn-sm btn-icon" title="Scarica" onclick="downloadDoc('${d.id}')">${iconPdf}</button>
            <button class="btn btn-primary btn-sm" onclick="signDoc('${d.id}')">
              ${iconSign} Firma
            </button>
           </div>`
        : `<div style="display:flex;justify-content:flex-end;">
            <button class="btn btn-secondary btn-sm" onclick="downloadDoc('${d.id}')" style="display:flex;align-items:center;gap:6px;">
              ${iconPdf} Scarica
            </button>
           </div>`;

      return `<tr>
        <td><div class="td-main">${label}</div></td>
        <td><span style="font-size:11px;font-weight:600;background:var(--gray-100);padding:2px 7px;border-radius:4px;text-transform:uppercase;">${d.type || 'FILE'}</span></td>
        <td>${upStr}</td>
        <td>${expStr}</td>
        <td><span class="pill ${st.cls}">${st.label}</span></td>
        <td><div class="row-actions">${actions}</div></td>
      </tr>`;
    }).join('');

    if (info) info.textContent = `${filtered.length} documento${filtered.length !== 1 ? 'i' : ''}`;
  }

  /* ── Actions ─────────────────────────────────────────────────── */
  window.downloadDoc = async (id) => {
    try {
      const res = await API.Documents.download(id);
      const url = res?.url || res?.download_url;
      if (url) {
        const a = document.createElement('a');
        a.href = url; a.download = res?.name || 'documento'; a.target = '_blank';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      } else {
        // Fallback: try generic download-url endpoint
        const data = await API.get(`/documents/${id}/download-url`);
        if (data?.url) window.open(data.url, '_blank');
        else UI.toast('Download non disponibile', 'info');
      }
    } catch (e) {
      console.error('[client_documents] downloadDoc error:', e);
      UI.toast('Impossibile scaricare il documento', 'error');
    }
  };

  window.signDoc = async (id) => {
    try {
      // Try to get the signing URL from the backend (Zoho Sign integration)
      const res = await API.get(`/documents/${id}/sign-url`);
      if (res?.url) {
        window.open(res.url, '_blank');
      } else if (res?.sign_url) {
        window.open(res.sign_url, '_blank');
      } else {
        UI.toast('Il portale di firma non è ancora disponibile. Contatta il tuo account manager.', 'info');
      }
    } catch (e) {
      console.error('[client_documents] signDoc error:', e);
      // If endpoint doesn't exist yet, show graceful fallback — do not crash
      UI.toast('Il portale di firma non è ancora disponibile. Contatta il tuo account manager.', 'info');
    }
  };

  /* ── Init ──────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', async () => {
    await I18n.init('lang-switcher-slot');
    load();
  });

})();