/* ============================================================
   client_invoices.js — Client invoices page
   ============================================================ */
'use strict';
(function () {
  Auth.guard('client');
  Auth.initUI();

  /* ── State ─────────────────────────────────────────────────── */
  let ALL      = [];
  let filtered = [];
  let currentPage = 1;
  const PER_PAGE  = 10;
  const todayStr  = new Date().toISOString().split('T')[0];

  /* ── DOM refs ──────────────────────────────────────────────── */
  const tbody = document.getElementById('inv-tbody');
  const search = document.getElementById('inv-search');
  const fSt    = document.getElementById('inv-filter-status');
  const info   = document.getElementById('inv-info');
  const pNav   = document.getElementById('inv-pagination');

  if (!tbody) console.error('[client_invoices] Required DOM node missing: #inv-tbody');

  /* ── Payment modal (injected dynamically) ───────────────────── */
  document.body.insertAdjacentHTML('beforeend', `
    <div id="modal-payment" class="modal" style="display:none;">
      <div class="modal-content" style="max-width:450px;">
        <div class="modal-header">
          <h2 class="modal-title">Coordinate Bancarie</h2>
          <button class="btn btn-ghost btn-icon" id="btn-close-payment-modal">
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body" id="payment-modal-body">
          <div class="loading-row">Caricamento...</div>
        </div>
        <div class="modal-footer" style="display:flex;justify-content:space-between;align-items:center;">
          <button class="btn btn-secondary" id="btn-close-payment-modal-2">Chiudi</button>
          <button class="btn btn-primary" id="btn-confirm-payment" style="display:none;">Ho effettuato il pagamento</button>
        </div>
      </div>
    </div>
  `);

  // Wire close buttons after injection
  const closeModal = () => { const m = document.getElementById('modal-payment'); if (m) m.style.display = 'none'; };
  document.getElementById('btn-close-payment-modal')?.addEventListener('click', closeModal);
  document.getElementById('btn-close-payment-modal-2')?.addEventListener('click', closeModal);
  document.getElementById('modal-payment')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-payment')) closeModal();
  });

  /* ── Status helpers ─────────────────────────────────────────── */
  function getInvoiceStatus(i) {
    if (i.status === 'paid' || i.status === 'cancelled' || i.status === 'pending_verification') return i.status;
    if (i.due_date && i.due_date < todayStr) return 'overdue';
    return 'unpaid';
  }

  const STATUS_MAP = {
    unpaid:               { label: 'Da pagare',   cls: 'pill-danger'   },
    pending_verification: { label: 'In verifica', cls: 'pill-warning'  },
    paid:                 { label: 'Pagata',       cls: 'pill-success'  },
    overdue:              { label: 'Scaduta',      cls: 'pill-danger'   },
    cancelled:            { label: 'Annullata',    cls: 'pill-gray'     },
  };

  /* ── Stat chips ─────────────────────────────────────────────── */
  function updateChips() {
    const open    = ALL.filter(i => getInvoiceStatus(i) === 'unpaid').length;
    const overdue = ALL.filter(i => getInvoiceStatus(i) === 'overdue').length;
    const paid    = ALL.filter(i => getInvoiceStatus(i) === 'paid').length;
    const paidAmt = ALL.filter(i => getInvoiceStatus(i) === 'paid')
                       .reduce((s, i) => s + (parseFloat(i.total || i.total_amount) || 0), 0);

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('chip-inv-total',   ALL.length);
    set('chip-inv-open',    open);
    set('chip-inv-overdue', overdue);
    set('chip-inv-paid',    paid);
    set('chip-inv-amount',  UI.currency(paidAmt));
  }

  /* ── Load ───────────────────────────────────────────────────── */
  window._retryClientInvoices = load;
  async function load() {
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6" class="loading-row">Caricamento fatture...</td></tr>`;
    let hasError = false;

    try {
      const res  = await API.Invoices.list();
      ALL        = Array.isArray(res) ? res : (res?.items ?? res?.data ?? []);
    } catch (e) {
      hasError = true;
      ALL      = [];
      console.error('[client_invoices] load error:', e);
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--error-text);padding:20px;">
        Impossibile caricare le fatture. <a href="#" onclick="window._retryClientInvoices();return false;">Riprova</a>
      </td></tr>`;
    } finally {
      updateChips();
      if (!hasError) applyFilters();
    }
  }

  /* ── Filters ────────────────────────────────────────────────── */
  function applyFilters() {
    const q  = (search?.value || '').toLowerCase().trim();
    const st = fSt?.value || 'all';

    filtered = ALL.filter(i => {
      const num    = (i.number || i.invoice_number || '').toLowerCase();
      const matchQ = !q || num.includes(q);
      const matchS = st === 'all' || getInvoiceStatus(i) === st;
      return matchQ && matchS;
    });

    const maxPage = Math.ceil(filtered.length / PER_PAGE) || 1;
    if (currentPage > maxPage) currentPage = maxPage;
    render();
  }

  if (search) search.addEventListener('input',  () => { currentPage = 1; applyFilters(); });
  if (fSt)    fSt.addEventListener('change',    () => { currentPage = 1; applyFilters(); });

  /* ── Render ─────────────────────────────────────────────────── */
  const iconPdf = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="14" height="14"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>`;

  function render() {
    if (!tbody) return;

    const slice = filtered.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--gray-400);padding:24px;">Nessuna fattura trovata.</td></tr>`;
      if (info) info.textContent = '';
      if (pNav) pNav.innerHTML   = '';
      return;
    }

    tbody.innerHTML = slice.map(i => {
      const invoiceStatus = getInvoiceStatus(i);
      const st            = STATUS_MAP[invoiceStatus] || STATUS_MAP.unpaid;
      const numStr        = i.number || i.invoice_number || '';
      const amount        = parseFloat(i.total || i.total_amount || 0);
      const isPayable     = invoiceStatus !== 'paid' && invoiceStatus !== 'cancelled';

      const actionHtml = isPayable
        ? `<div style="display:flex;gap:8px;justify-content:flex-end;">
            <button class="btn btn-secondary btn-sm btn-icon" title="Scarica PDF" onclick="downloadInvoice('${i.id}')">${iconPdf}</button>
            <button class="btn btn-primary btn-sm" onclick="payInvoice('${i.id}')">Paga Ora</button>
           </div>`
        : `<div style="display:flex;justify-content:flex-end;">
            <button class="btn btn-secondary btn-sm" onclick="downloadInvoice('${i.id}')" style="display:flex;align-items:center;gap:6px;">${iconPdf} Scarica PDF</button>
           </div>`;

      return `<tr>
        <td><span class="fw-600">${numStr}</span></td>
        <td>${UI.date(i.issue_date || i.created_at)}</td>
        <td>${i.due_date ? UI.date(i.due_date) : ''}</td>
        <td class="text-right fw-600">${UI.currency(amount)}</td>
        <td><span class="pill ${st.cls}">${st.label}</span></td>
        <td><div class="row-actions">${actionHtml}</div></td>
      </tr>`;
    }).join('');

    UI.pagination(pNav, info, currentPage, filtered.length, PER_PAGE, p => { currentPage = p; render(); });
  }

  /* ── Actions ─────────────────────────────────────────────────── */
  window.downloadInvoice = async (id) => {
    if (!id) return;
    try {
      const data = await API.get(`/invoices/${id}/download-url`);
      if (data?.url) window.open(data.url, '_blank');
      else window.showToast?.('Download non ancora disponibile', 'info');
    } catch (e) {
      console.error('[client_invoices] downloadInvoice error:', e);
      window.showToast?.('Impossibile scaricare la fattura', 'error');
    }
  };

  window.payInvoice = async (invoiceId) => {
    const modal      = document.getElementById('modal-payment');
    const body       = document.getElementById('payment-modal-body');
    const btnApprove = document.getElementById('btn-confirm-payment');

    if (!modal || !body || !btnApprove) return;

    modal.style.display    = 'flex';
    body.innerHTML         = '<div class="loading-row">Recupero informazioni...</div>';
    btnApprove.style.display = 'none';
    btnApprove.disabled      = false;
    btnApprove.textContent   = 'Ho effettuato il pagamento';

    try {
      const pInfo = await API.get(`/invoices/${invoiceId}/payment-info`);

      const iban  = pInfo?.iban        || '';
      const ref   = pInfo?.reference   || '';
      const ben   = pInfo?.beneficiary || '';
      const amt   = pInfo?.amount      || 0;
      const cur   = pInfo?.currency    || 'EUR';

      body.innerHTML = `
        <div style="background:var(--gray-50);border-radius:8px;padding:16px;margin-bottom:20px;">
          <div style="color:var(--gray-500);font-size:13px;margin-bottom:4px;">Beneficiario</div>
          <div style="font-weight:600;color:var(--gray-900);font-size:15px;margin-bottom:12px;">${ben}</div>

          <div style="color:var(--gray-500);font-size:13px;margin-bottom:4px;">IBAN</div>
          <div style="font-weight:600;font-family:monospace;color:var(--gray-900);font-size:15px;letter-spacing:1px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">
            <span>${iban}</span>
            <button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText(${JSON.stringify(iban)}).then(()=>window.showToast?.('IBAN copiato','success'))" style="padding:4px 8px;">Copia</button>
          </div>

          <div style="color:var(--gray-500);font-size:13px;margin-bottom:4px;">Causale (OBBLIGATORIA)</div>
          <div style="font-weight:600;color:var(--brand-600);font-size:15px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">
            <span>${ref}</span>
            <button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText(${JSON.stringify(ref)}).then(()=>window.showToast?.('Causale copiata','success'))" style="padding:4px 8px;">Copia</button>
          </div>

          <div style="color:var(--gray-500);font-size:13px;margin-bottom:4px;">Importo</div>
          <div style="font-weight:700;color:var(--gray-900);font-size:20px;">${UI.currency(amt, cur)}</div>
        </div>
        <p style="font-size:13px;color:var(--gray-500);margin:0;">
          Effettua il bonifico con la causale esatta. Clicca il pulsante per segnalarci l'avvenuto pagamento — lo stato diventerà <strong>In verifica</strong>.
        </p>`;

      btnApprove.style.display = 'block';
      // Replace onclick every call to bind correct invoiceId
      btnApprove.onclick = async () => {
        btnApprove.textContent = 'Segnalo...';
        btnApprove.disabled    = true;
        try {
          await API.post(`/invoices/${invoiceId}/mark-pending-payment`);
          window.showToast?.('Segnalazione ricevuta. Lo stato è ora "In verifica".', 'success');
          closeModal();
          // Optimistic local update
          ALL = ALL.map(i => i.id === invoiceId ? { ...i, status: 'pending_verification' } : i);
          updateChips();
          applyFilters();
        } catch (e) {
          console.error('[client_invoices] mark-pending error:', e);
          window.showToast?.(e?.message || 'Errore durante la segnalazione', 'error');
          btnApprove.textContent = 'Ho effettuato il pagamento';
          btnApprove.disabled    = false;
        }
      };
    } catch (e) {
      console.error('[client_invoices] payInvoice info error:', e);
      body.innerHTML = `<div style="color:var(--error-text);padding:20px;text-align:center;">
        Impossibile recuperare i dati di pagamento. Riprova più tardi.
      </div>`;
    }
  };

  /* ── Init ──────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', async () => {
    await I18n.init('lang-switcher-slot');
    load();
  });

})();