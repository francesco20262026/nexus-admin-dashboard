/* ============================================================
   client_invoices.js Client invoices + proforma + payment proof (Phase 3)
   ============================================================ */
'use strict';
(function () {
  Auth.guard('client');
  Auth.initUI();

  let ALL = [], filtered = [];
  let currentPage = 1;
  const PER_PAGE  = 10;
  const todayStr  = new Date().toISOString().split('T')[0];

  const tbody = document.getElementById('inv-tbody');
  const search = document.getElementById('inv-search');
  const fSt    = document.getElementById('inv-filter-status');
  const info   = document.getElementById('inv-info');
  const pNav   = document.getElementById('inv-pagination');

  // ── Payment modal (injected) ────────────────────────────────
  document.body.insertAdjacentHTML('beforeend', `
    <div id="modal-payment" class="modal-overlay" style="display:none;">
      <div class="modal" style="max-width:480px;width:100%;">
        <div class="modal-header" style="padding:20px 24px 16px;border-bottom:1px solid var(--border);">
          <div class="modal-title" id="pay-modal-title">Pagamento</div>
          <button class="icon-btn" onclick="closePayModal()">
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body" id="pay-modal-body" style="padding:20px 24px;"></div>
        <div class="modal-footer" id="pay-modal-footer" style="padding:12px 24px 20px;border-top:1px solid var(--border);display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
          <button class="btn btn-ghost" onclick="closePayModal()">Chiudi</button>
          <button class="btn btn-primary" id="btn-confirm-payment" style="display:none;">Ho effettuato il pagamento</button>
          <button class="btn btn-secondary" id="btn-upload-proof" style="display:none;">📎 Allega contabile</button>
        </div>
      </div>
    </div>
  `);

  window.closePayModal = () => { const m = document.getElementById('modal-payment'); if (m) m.style.display = 'none'; };

  // ── Payment status helpers ───────────────────────────────────
  const PAYMENT_STATUS = {
    not_paid:      { label: 'Da pagare',       cls: 'pill-danger'  },
    proof_uploaded:{ label: 'Prova inviata',   cls: 'pill-warning' },
    under_review:  { label: 'In verifica',     cls: 'pill-warning' },
    paid:          { label: 'Pagata',          cls: 'pill-success' },
    cancelled:     { label: 'Annullata',       cls: 'pill-gray'    },
  };

  function getPaymentStatus(i) {
    const ps = i.payment_status || 'not_paid';
    if (ps !== 'not_paid') return ps;
    if (i.status === 'paid' || i.status === 'cancelled') return i.status;
    if (i.due_date && i.due_date < todayStr) return 'not_paid'; // still not_paid even if overdue
    return 'not_paid';
  }

  // ── Stat chips ─────────────────────────────────────────────
  function updateChips() {
    const open    = ALL.filter(i => getPaymentStatus(i) === 'not_paid').length;
    const pending = ALL.filter(i => ['proof_uploaded','under_review'].includes(getPaymentStatus(i))).length;
    const paid    = ALL.filter(i => getPaymentStatus(i) === 'paid').length;
    const paidAmt = ALL.filter(i => getPaymentStatus(i) === 'paid')
                       .reduce((s, i) => s + (parseFloat(i.total || i.total_amount) || 0), 0);
    const proforma = ALL.filter(i => i.is_proforma).length;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('chip-inv-total',    ALL.length);
    set('chip-inv-open',     open);
    set('chip-inv-overdue',  pending);   // reuse "overdue" chip for "in verifica"
    set('chip-inv-paid',     paid);
    set('chip-inv-amount',   UI.currency(paidAmt));
    set('chip-inv-proforma', proforma);
  }

  // ── Load ───────────────────────────────────────────────────
  window._retryClientInvoices = load;
  async function load() {
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6" class="loading-row">Caricamento fatture...</td></tr>`;
    let hasError = false;
    try {
      const res = await API.Invoices.list();
      ALL = Array.isArray(res) ? res : (res?.items ?? res?.data ?? []);
    } catch (e) {
      hasError = true; ALL = [];
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--error-text,red);padding:20px;">
        Impossibile caricare le fatture. <a href="#" onclick="window._retryClientInvoices();return false;">Riprova</a>
      </td></tr>`;
    } finally {
      updateChips();
      if (!hasError) applyFilters();
    }
  }

  // ── Filters ────────────────────────────────────────────────
  function applyFilters() {
    const q  = (search?.value || '').toLowerCase().trim();
    const st = fSt?.value || 'all';
    filtered = ALL.filter(i => {
      const ps = getPaymentStatus(i);
      const matchS = st === 'all' || ps === st || (st === 'proforma' && i.is_proforma);
      const num = (i.number || '').toLowerCase();
      const matchQ = !q || num.includes(q);
      return matchQ && matchS;
    });
    const maxPage = Math.ceil(filtered.length / PER_PAGE) || 1;
    if (currentPage > maxPage) currentPage = maxPage;
    render();
  }

  if (search) search.addEventListener('input',  () => { currentPage = 1; applyFilters(); });
  if (fSt)    fSt.addEventListener('change',    () => { currentPage = 1; applyFilters(); });

  // ── Render ─────────────────────────────────────────────────
  const iconPdf = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="14" height="14"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>`;

  function render() {
    if (!tbody) return;
    const slice = filtered.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);
    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--gray-400);padding:24px;">Nessuna fattura trovata.</td></tr>`;
      if (info) info.textContent = ''; if (pNav) pNav.innerHTML = ''; return;
    }

    tbody.innerHTML = slice.map(i => {
      const ps     = getPaymentStatus(i);
      const stInfo = PAYMENT_STATUS[ps] || PAYMENT_STATUS.not_paid;
      const numStr = i.number || '';
      const amount = parseFloat(i.total || i.total_amount || 0);
      const isPaid = ps === 'paid' || ps === 'cancelled';
      const proformaTag = i.is_proforma
        ? `<span style="font-size:10px;background:#ede9fe;color:#6d28d9;padding:1px 6px;border-radius:3px;font-weight:700;margin-left:4px;">PRF</span>` : '';

      let actionHtml;
      if (ps === 'proof_uploaded' || ps === 'under_review') {
        actionHtml = `<div style="display:flex;gap:8px;justify-content:flex-end;">
          <span style="font-size:12px;color:var(--gray-500);align-self:center;">Prova inviata in verifica</span>
          <button class="btn btn-secondary btn-sm btn-icon" title="Scarica" onclick="downloadInvoice('${i.id}')">${iconPdf}</button>
        </div>`;
      } else if (!isPaid) {
        actionHtml = `<div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn btn-secondary btn-sm btn-icon" title="Scarica PDF" onclick="downloadInvoice('${i.id}')">${iconPdf}</button>
          <button class="btn btn-secondary btn-sm" onclick="uploadProof('${i.id}')">📎 Allega contabile</button>
          <button class="btn btn-primary btn-sm" onclick="payInvoice('${i.id}')">Paga</button>
        </div>`;
      } else {
        actionHtml = `<div style="display:flex;justify-content:flex-end;">
          <button class="btn btn-secondary btn-sm" onclick="downloadInvoice('${i.id}')" style="display:flex;align-items:center;gap:6px;">${iconPdf} Scarica PDF</button>
        </div>`;
      }

      return `<tr>
        <td><span class="fw-600">${numStr}${proformaTag}</span></td>
        <td>${UI.date(i.issue_date || i.created_at)}</td>
        <td>${i.due_date ? UI.date(i.due_date) : ''}</td>
        <td class="text-right fw-600">${UI.currency(amount)}</td>
        <td><span class="pill ${stInfo.cls}">${stInfo.label}</span></td>
        <td><div class="row-actions">${actionHtml}</div></td>
      </tr>`;
    }).join('');

    UI.pagination(pNav, info, currentPage, filtered.length, PER_PAGE, p => { currentPage = p; render(); });
  }

  // ── Pay flow (bonifico info + "Ho effettuato") ─────────────
  window.payInvoice = async (invoiceId) => {
    const modal      = document.getElementById('modal-payment');
    const body       = document.getElementById('pay-modal-body');
    const titleEl    = document.getElementById('pay-modal-title');
    const btnConfirm = document.getElementById('btn-confirm-payment');
    const btnProof   = document.getElementById('btn-upload-proof');
    if (!modal || !body) return;

    const inv = ALL.find(i => i.id === invoiceId);
    if (titleEl) titleEl.textContent = inv?.is_proforma ? 'Pagamento Proforma' : 'Coordinate di Pagamento';

    modal.style.display    = 'flex';
    body.innerHTML         = '<div class="loading-row">Recupero informazioni...</div>';
    if (btnConfirm) { btnConfirm.style.display = 'none'; btnConfirm.disabled = false; btnConfirm.textContent = 'Ho effettuato il bonifico'; }
    if (btnProof)   { btnProof.style.display = 'none'; }

    try {
      const pInfo = await API.Invoices.paymentInfo(invoiceId);
      const iban  = pInfo?.iban        || '';
      const ref   = pInfo?.reference   || '';
      const ben   = pInfo?.beneficiary || '';
      const amt   = pInfo?.amount      || 0;
      const cur   = pInfo?.currency    || 'EUR';

      body.innerHTML = `
        <div style="background:var(--gray-50,#f9fafb);border-radius:8px;padding:16px;margin-bottom:16px;">
          <div style="color:var(--gray-500);font-size:13px;margin-bottom:3px;">Beneficiario</div>
          <div style="font-weight:600;color:var(--gray-900);font-size:15px;margin-bottom:12px;">${ben}</div>
          <div style="color:var(--gray-500);font-size:13px;margin-bottom:3px;">IBAN</div>
          <div style="font-weight:600;font-family:monospace;font-size:14px;letter-spacing:1px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">
            <span>${iban || '(Non configurato)'}</span>
            ${iban ? `<button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText(${JSON.stringify(iban)}).then(()=>UI.toast('IBAN copiato','success'))" style="padding:4px 8px;">Copia</button>` : ''}
          </div>
          <div style="color:var(--gray-500);font-size:13px;margin-bottom:3px;">Causale (OBBLIGATORIA)</div>
          <div style="font-weight:700;color:var(--brand-600,#4f46e5);font-size:15px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">
            <span>${ref}</span>
            <button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText(${JSON.stringify(ref)}).then(()=>UI.toast('Causale copiata','success'))" style="padding:4px 8px;">Copia</button>
          </div>
          <div style="color:var(--gray-500);font-size:13px;margin-bottom:3px;">Importo</div>
          <div style="font-weight:700;color:var(--gray-900);font-size:20px;">${UI.currency(amt, cur)}</div>
        </div>
        <p style="font-size:13px;color:var(--gray-500);margin:0;">
          Effettua il bonifico con la causale esatta, poi clicca <strong>Ho effettuato</strong> oppure allega la contabile bancaria.
        </p>`;

      if (btnConfirm) {
        btnConfirm.style.display = 'block';
        btnConfirm.onclick = async () => {
          btnConfirm.textContent = 'Segnalo...'; btnConfirm.disabled = true;
          try {
            await API.Invoices.markPending(invoiceId);
            UI.toast('Segnalazione ricevuta. Stato: in verifica.', 'success');
            window.closePayModal();
            ALL = ALL.map(i => i.id === invoiceId ? { ...i, payment_status: 'proof_uploaded' } : i);
            updateChips(); applyFilters();
          } catch (e) {
            UI.toast(e?.message || 'Errore', 'error');
            btnConfirm.textContent = 'Ho effettuato il bonifico'; btnConfirm.disabled = false;
          }
        };
      }
      if (btnProof) {
        btnProof.style.display = 'block';
        btnProof.onclick = () => { window.closePayModal(); uploadProof(invoiceId); };
      }
    } catch (e) {
      body.innerHTML = `<div style="color:var(--error-text,red);padding:20px;text-align:center;">Impossibile recuperare i dati. Riprova.</div>`;
    }
  };

  // ── Proof upload (file input → URL or use Supabase storage later) ─
  window.uploadProof = (invoiceId) => {
    // Dynamically create file input for proof
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*,application/pdf';
    inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.click();
    inp.onchange = async () => {
      const file = inp.files?.[0]; document.body.removeChild(inp);
      if (!file) return;
      UI.toast('Caricamento contabile...', 'info');
      try {
        // Try to upload to Supabase storage if available, otherwise use a placeholder
        let proofUrl = '';
        if (window.supabaseClient) {
          const path    = `payment_proofs/${invoiceId}/${Date.now()}_${file.name}`;
          const { data, error } = await window.supabaseClient.storage.from('nexus-documents').upload(path, file);
          if (error) throw error;
          const { data: urlData } = window.supabaseClient.storage.from('nexus-documents').getPublicUrl(path);
          proofUrl = urlData?.publicUrl || '';
        }
        if (!proofUrl) {
          // Fallback: mark as proof_uploaded without URL (admin contacts manually)
          await API.Invoices.markPending(invoiceId);
        } else {
          await API.Invoices.submitProof(invoiceId, { payment_proof_url: proofUrl, payment_method: 'bonifico' });
        }
        UI.toast('Contabile inviata. Un operatore verificherà a breve.', 'success');
        ALL = ALL.map(i => i.id === invoiceId ? { ...i, payment_status: 'proof_uploaded', payment_proof_url: proofUrl } : i);
        updateChips(); applyFilters();
      } catch (e) {
        UI.toast(e?.message || 'Errore nel caricamento', 'error');
      }
    };
  };

  window.downloadInvoice = async (id) => {
    try {
      const data = await API.get(`/invoices/${id}/download-url`);
      if (data?.url) window.open(data.url, '_blank');
      else UI.toast('Download non ancora disponibile', 'info');
    } catch (e) { UI.toast('Impossibile scaricare la fattura', 'error'); }
  };

  document.addEventListener('DOMContentLoaded', async () => {
    await I18n.init('lang-switcher-slot');
    load();
  });
})();