/* ============================================================
   client_contracts.js — Client contracts page
   ============================================================ */
'use strict';
(function () {
  Auth.guard('client');
  Auth.initUI();

  /* ── State ─────────────────────────────────────────────────── */
  let ALL      = [];
  let filtered = [];

  /* ── DOM refs ──────────────────────────────────────────────── */
  const tbody       = document.getElementById('ctr-tbody');
  const search      = document.getElementById('ctr-search');
  const fSt         = document.getElementById('ctr-filter-status');
  const info        = document.getElementById('ctr-info');
  const alertBanner = document.getElementById('ctr-alert');

  if (!tbody) console.error('[client_contracts] Required DOM node missing: #ctr-tbody');

  /* ── Status helpers ─────────────────────────────────────────── */
  function getContractStatus(c) {
    if (c.status === 'signed' || c.status === 'completed') return 'signed';
    if (c.status === 'active')                             return 'active';
    if (c.status === 'expired' || c.status === 'cancelled') return 'expired';
    return 'pending';
  }

  const STATUS = {
    pending: { label: 'Da firmare', cls: 'pill-pending'  },
    active:  { label: 'Attivo',     cls: 'pill-active'   },
    signed:  { label: 'Firmato',    cls: 'pill-active'   },
    expired: { label: 'Scaduto',    cls: 'pill-inactive' },
  };

  function safeDate(raw) {
    if (!raw) return '';
    try { return new Date(raw).toLocaleDateString('it-IT'); } catch { return ''; }
  }

  /* ── Load ───────────────────────────────────────────────────── */
  window._retryClientContracts = load;
  async function load() {
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6" class="loading-row">Caricamento contratti...</td></tr>`;
    let hasError = false;

    try {
      const res = await API.Contracts.list();
      ALL       = Array.isArray(res) ? res : (res?.items ?? res?.data ?? []);
    } catch (e) {
      hasError = true;
      ALL      = [];
      console.error('[client_contracts] load error:', e);
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--error-text);padding:20px;">
        Impossibile caricare i contratti. <a href="#" onclick="window._retryClientContracts();return false;">Riprova</a>
      </td></tr>`;
    } finally {
      updateChips();
      updateAlert();
      if (!hasError) applyFilters();
    }
  }

  /* ── Stat chips ─────────────────────────────────────────────── */
  function updateChips() {
    const pending   = ALL.filter(c => getContractStatus(c) === 'pending').length;
    const active    = ALL.filter(c => c.status === 'active').length;
    const completed = ALL.filter(c => c.status === 'signed' || c.status === 'completed').length;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('chip-ctr-total',     ALL.length);
    set('chip-ctr-pending',   pending);
    set('chip-ctr-active',    active);
    set('chip-ctr-completed', completed);
  }

  /* ── Pending alert banner ────────────────────────────────────── */
  function updateAlert() {
    if (!alertBanner) return;
    const pending = ALL.filter(c => getContractStatus(c) === 'pending');
    if (pending.length > 0) {
      const textEl = document.getElementById('ctr-alert-text');
      if (textEl) textEl.textContent = `Hai ${pending.length} contratt${pending.length > 1 ? 'i' : 'o'} in attesa di firma / approvazione.`;
      alertBanner.style.display = 'flex';
    } else {
      alertBanner.style.display = 'none';
    }
  }

  /* ── Filters ────────────────────────────────────────────────── */
  function applyFilters() {
    const q  = (search?.value || '').toLowerCase().trim();
    const st = fSt?.value || 'all';

    filtered = ALL.filter(c => {
      const hay    = `${c.title || ''} ${c.number || ''} ${c.type || ''}`.toLowerCase();
      const matchQ = !q || hay.includes(q);
      const matchS = st === 'all' || getContractStatus(c) === st;
      return matchQ && matchS;
    });

    render();
  }

  if (search) search.addEventListener('input',  applyFilters);
  if (fSt)    fSt.addEventListener('change',    applyFilters);

  /* ── Render ─────────────────────────────────────────────────── */
  const iconPdf  = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="14" height="14"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>`;
  const iconSign = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="14" height="14"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"/></svg>`;

  function render() {
    if (!tbody) return;

    if (!filtered.length) {
      const msg = ALL.length > 0 ? 'Nessun contratto corrisponde ai filtri.' : 'Nessun contratto disponibile.';
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--gray-400);padding:24px;">${msg}</td></tr>`;
      if (info) info.textContent = '';
      return;
    }

    tbody.innerHTML = filtered.map(c => {
      const cStatus   = getContractStatus(c);
      const st        = STATUS[cStatus] || STATUS.pending;
      const valFrom   = safeDate(c.start_date || c.valid_from);
      const valTo     = safeDate(c.end_date   || c.valid_to);
      const signedStr = safeDate(c.signed_at);
      const isPending = cStatus === 'pending';

      const actions = isPending
        ? `<div style="display:flex;gap:8px;justify-content:flex-end;">
            <button class="btn btn-secondary btn-sm btn-icon" title="Scarica PDF" onclick="downloadContract('${c.id}')">${iconPdf}</button>
            <button class="btn btn-primary btn-sm" onclick="signContract('${c.id}')" style="display:flex;align-items:center;gap:6px;">${iconSign} Firma Ora</button>
           </div>`
        : `<div style="display:flex;justify-content:flex-end;">
            <button class="btn btn-secondary btn-sm" onclick="downloadContract('${c.id}')" style="display:flex;align-items:center;gap:6px;">${iconPdf} Scarica PDF</button>
           </div>`;

      return `<tr>
        <td>
          <div class="td-main">${c.title || c.number || 'Contratto'}</div>
          <div class="td-sub">${c.type || 'Agreement'}</div>
        </td>
        <td>${valFrom}</td>
        <td>${valTo}</td>
        <td>${signedStr}</td>
        <td><span class="pill ${st.cls}">${st.label}</span></td>
        <td><div class="row-actions">${actions}</div></td>
      </tr>`;
    }).join('');

    if (info) info.textContent = `${filtered.length} contratt${filtered.length !== 1 ? 'i' : 'o'}`;
  }

  /* ── Actions ─────────────────────────────────────────────────── */
  window.downloadContract = async (id) => {
    try {
      // Try dedicated download endpoint first
      const res = await API.get(`/contracts/${id}/download-url`);
      const url = res?.url || res?.download_url;
      if (url) {
        const a = document.createElement('a');
        a.href = url; a.download = res?.name || 'contratto'; a.target = '_blank';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      } else {
        window.showToast?.('Download non ancora disponibile', 'info');
      }
    } catch (e) {
      console.error('[client_contracts] downloadContract error:', e);
      window.showToast?.('Impossibile scaricare il contratto', 'error');
    }
  };

  window.signContract = async (id) => {
    try {
      const res = await API.get(`/contracts/${id}/sign-url`);
      const url = res?.url || res?.sign_url;
      if (url) {
        window.open(url, '_blank');
      } else {
        window.showToast?.('Il portale di firma non è ancora disponibile. Contatta il tuo account manager.', 'info');
      }
    } catch (e) {
      console.error('[client_contracts] signContract error:', e);
      // Graceful fallback — do not crash or hang the page
      window.showToast?.('Il portale di firma non è ancora disponibile. Contatta il tuo account manager.', 'info');
    }
  };

  /* ── Init ──────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', async () => {
    await I18n.init('lang-switcher-slot');
    load();
  });

})();