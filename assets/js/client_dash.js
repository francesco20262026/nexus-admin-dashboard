/* ============================================================
   client_dash.js — Client dashboard page logic
   ============================================================ */
'use strict';
(function () {
  Auth.guard('client');
  Auth.initUI();

  /* ── Icon SVG map ───────────────────────────────────────────── */
  const ICONS = {
    receipt:  `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z"/></svg>`,
    contract: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg>`,
    doc:      `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"/></svg>`,
    paid:     `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>`,
    renewal:  `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>`,
  };

  /* ── Helpers ─────────────────────────────────────────────────── */
  const set   = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const html  = (id, val) => { const el = document.getElementById(id); if (el) el.innerHTML  = val; };
  const get   = (id)      => document.getElementById(id);
  const empty = (col, msg) => `<tr><td colspan="${col}" style="text-align:center;color:var(--gray-400);padding:20px;">${msg}</td></tr>`;

  function safeDate(raw, opts = {}) {
    if (!raw) return '';
    try { return new Date(raw).toLocaleDateString('it-IT', opts); } catch { return ''; }
  }

  /* ── Identity block ──────────────────────────────────────────── */
  function renderIdentity() {
    let user = {};
    try { user = JSON.parse(localStorage.getItem('nexus_auth_user')) || {}; } catch { /* ignore */ }
    const name     = user.user_metadata?.name || user.name || user.email?.split('@')[0] || 'Cliente';
    const initials = name.slice(0, 2).toUpperCase();

    set('dash-client-name',   name);
    set('dash-client-avatar', initials);
    set('dash-date', new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }));
  }

  /* ── Quotes widget ───────────────────────────────────────────── */
  async function loadQuotes() {
    const quoteBody = get('dash-client-quotes');
    if (quoteBody) quoteBody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:var(--gray-400);padding:20px;">Caricamento...</td></tr>`;

    try {
      // Assuming API.Quotes.list exists or we fallback to API.get('/quotes')
      const req = API.Quotes ? API.Quotes.list({ status: 'sent' }) : API.get('/quotes?status=sent');
      const res = await req;
      const quotes = Array.isArray(res) ? res : (res?.items ?? res?.data ?? []);

      const pending = quotes.filter(q => q.status === 'sent');
      const total = pending.reduce((s, q) => s + parseFloat(q.total || 0), 0);

      set('chip-quotes', pending.length);
      set('dash-quotes-subtitle', `${pending.length} preventiv${pending.length === 1 ? 'o' : 'i'} in attesa`);
      set('dash-quotes-total', pending.length > 0 ? UI.currency(total) + ' da confermare' : '');

      if (!quoteBody) return;
      if (!pending.length) {
        quoteBody.innerHTML = empty(3, 'Nessun preventivo in attesa. ✨');
        return;
      }

      quoteBody.innerHTML = pending.slice(0, 3).map(q => {
        const titleStr = 'Preventivo'; // or q.number if we had it
        const dateStr  = safeDate(q.created_at, { day: '2-digit', month: 'short', year: 'numeric' });
        const amtStr   = UI.currency(parseFloat(q.total || 0));

        return `<tr>
          <td>
            <a href="client_quote_detail.html?id=${q.id}" class="link-brand" style="text-decoration:none;">
              <div class="td-main">${titleStr} ${q.id.substring(0,6).toUpperCase()}</div>
            </a>
            ${dateStr ? `<div class="td-sub">Ricevuto ${dateStr}</div>` : ''}
          </td>
          <td><strong>${amtStr}</strong></td>
          <td><span class="badge badge-warning">Da Valutare</span></td>
        </tr>`;
      }).join('');
    } catch (e) {
      console.error('[client_dash] loadQuotes error:', e);
      set('chip-quotes', '0');
      if (quoteBody) quoteBody.innerHTML = empty(3, 'Impossibile caricare i preventivi.');
    }
  }

  /* ── Invoices widget ─────────────────────────────────────────── */
  async function loadInvoices() {
    const invBody = get('dash-client-invoices');
    if (invBody) invBody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--gray-400);padding:20px;">Caricamento...</td></tr>`;

    try {
      const res      = await API.Invoices.list({ status: 'unpaid' });
      const invoices = Array.isArray(res) ? res : (res?.items ?? res?.data ?? []);

      const todayStr = new Date().toISOString().split('T')[0];
      const overdue  = invoices.filter(i => i.due_date && i.due_date < todayStr);
      const total    = invoices.reduce((s, i) => s + parseFloat(i.total_amount || i.total || 0), 0);

      set('chip-unpaid',       invoices.length);
      set('chip-overdue',      overdue.length);
      set('dash-inv-subtitle', `${invoices.length} fattur${invoices.length === 1 ? 'a' : 'e'} in sospeso`);
      set('dash-inv-total',    invoices.length > 0 ? UI.currency(total) + ' in sospeso' : '');

      if (!invBody) return;
      if (!invoices.length) {
        invBody.innerHTML = empty(4, 'Nessuna fattura da pagare! ✨');
        return;
      }

      invBody.innerHTML = invoices.slice(0, 3).map(i => {
        const isOverdue = i.due_date && i.due_date < todayStr;
        const numStr    = i.number || i.invoice_number || '';
        const issueStr  = safeDate(i.issue_date || i.created_at, { day: '2-digit', month: 'short', year: 'numeric' });
        const dueStr    = i.due_date ? safeDate(i.due_date, { day: '2-digit', month: 'short', year: 'numeric' }) : '';
        const amtStr    = UI.currency(parseFloat(i.total_amount || i.total || 0));

        return `<tr>
          <td>
            <a href="client_invoices.html" class="link-brand" style="text-decoration:none;">
              <div class="td-main">${numStr}</div>
            </a>
            ${issueStr ? `<div class="td-sub">Emessa ${issueStr}</div>` : ''}
          </td>
          <td><strong>${amtStr}</strong></td>
          <td>${dueStr}</td>
          <td><span class="badge ${isOverdue ? 'badge-danger' : 'badge-unpaid'}">${isOverdue ? 'Scaduta' : 'Da pagare'}</span></td>
        </tr>`;
      }).join('');
    } catch (e) {
      console.error('[client_dash] loadInvoices error:', e);
      set('chip-unpaid',  '0');
      set('chip-overdue', '0');
      if (invBody) invBody.innerHTML = empty(4, 'Impossibile caricare le fatture.');
    }
  }

  /* ── Contracts widget ────────────────────────────────────────── */
  async function loadContracts() {
    const ctrBody = get('dash-client-contracts');
    if (ctrBody) ctrBody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--gray-400);padding:20px;">Caricamento...</td></tr>`;

    try {
      const res       = await API.Contracts.list({ status: 'active' });
      const contracts = Array.isArray(res) ? res : (res?.items ?? res?.data ?? []);

      set('chip-contracts',      contracts.length);
      set('dash-contracts-count', `${contracts.length} contr${contracts.length === 1 ? 'atto attivo' : 'atti attivi'}`);

      if (!ctrBody) return;
      if (!contracts.length) {
        ctrBody.innerHTML = empty(4, 'Nessun contratto attivo');
        return;
      }

      ctrBody.innerHTML = contracts.slice(0, 3).map(c => {
        const endStr = c.valid_to || c.end_date;
        const valStr = c.value || c.contract_value;
        return `<tr>
          <td>
            <a href="client_contracts.html" class="link-brand" style="text-decoration:none;">
              <div class="td-main">${c.title || c.number || 'Contratto'}</div>
            </a>
            <div class="td-sub">${c.type || 'Agreement'}</div>
          </td>
          <td>${valStr ? UI.currency(parseFloat(valStr)) + '/yr' : ''}</td>
          <td>${endStr ? safeDate(endStr, { month: 'short', year: 'numeric' }) : ''}</td>
          <td><span class="badge badge-active">Attivo</span></td>
        </tr>`;
      }).join('');
    } catch (e) {
      console.error('[client_dash] loadContracts error:', e);
      set('chip-contracts', '0');
      if (ctrBody) ctrBody.innerHTML = empty(4, 'Impossibile caricare i contratti.');
    }
  }

  /* ── Documents widget ────────────────────────────────────────── */
  async function loadDocuments() {
    const docBody = get('dash-client-docs');
    if (docBody) docBody.innerHTML = '<div style="padding:20px;text-align:center;color:var(--gray-400);">Caricamento...</div>';

    try {
      const res  = await API.Documents.list();
      const docs = Array.isArray(res) ? res : (res?.items ?? res?.data ?? []);

      set('chip-docs', docs.length);

      if (!docBody) return;
      if (!docs.length) {
        docBody.innerHTML = '<div style="padding:20px;text-align:center;color:var(--gray-400);">Nessun documento recente</div>';
        return;
      }

      docBody.innerHTML = docs.slice(0, 3).map(d => {
        const dtStr  = safeDate(d.uploaded || d.created_at, { day: '2-digit', month: 'short', year: 'numeric' });
        const docId  = d.id || '';
        return `<div class="doc-item">
          <div class="doc-icon doc-icon--info">${ICONS.doc}</div>
          <div style="flex:1;">
            <a href="client_documents.html" class="link-brand" style="text-decoration:none;">
              <div class="doc-name">${d.name || d.title || 'Documento'}</div>
            </a>
            ${dtStr ? `<div class="doc-meta">Caricato il ${dtStr}</div>` : ''}
          </div>
          <div class="doc-actions">
            <button class="btn btn-secondary btn-sm btn-icon" title="Download" onclick="downloadClientDoc('${docId}')">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="14" height="14"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>
            </button>
          </div>
        </div>`;
      }).join('');
    } catch (e) {
      console.error('[client_dash] loadDocuments error:', e);
      set('chip-docs', '0');
      if (docBody) docBody.innerHTML = '<div style="padding:20px;text-align:center;color:var(--gray-400);">Impossibile caricare i documenti.</div>';
    }
  }

  /* ── Document download ───────────────────────────────────────── */
  window.downloadClientDoc = async (id) => {
    if (!id) return;
    try {
      const data = await API.get(`/documents/${id}/download-url`);
      if (data?.url) window.open(data.url, '_blank');
      else window.showToast?.('Download non disponibile', 'info');
    } catch (e) {
      console.error('[client_dash] downloadClientDoc error:', e);
      window.showToast?.('Impossibile scaricare il documento', 'error');
    }
  };

  /* ── Activity timeline ───────────────────────────────────────── */
  async function renderTimeline() {
    const container = get('client-timeline');
    if (!container) return;
    container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--gray-500);">Caricamento attività...</div>';

    try {
      const res  = await API.Dashboard.clientActivity();
      const logs = Array.isArray(res) ? res : (res?.items ?? res?.data ?? []);

      if (!logs.length) {
        container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--gray-500);">Nessuna attività recente.</div>';
        return;
      }

      container.innerHTML = logs.map((log, i) => {
        const isLast  = i === logs.length - 1;
        const t       = log.entity_type || '';
        const meta    = log.metadata    || {};
        const s       = log.new_values?.status || '';

        let icon        = 'doc';
        let color       = 'info';
        let title       = 'Attività';
        let description = '';

        if (t === 'invoice') {
          icon        = s === 'paid' ? 'paid' : 'receipt';
          color       = s === 'paid' ? 'success' : (s === 'overdue' ? 'danger' : 'brand');
          title       = `${meta.number || 'Fattura'} ${s === 'paid' ? 'saldata' : 'emessa'}`;
          description = meta.total ? UI.currency(parseFloat(meta.total)) : '';
        } else if (t === 'contract') {
          icon        = 'contract';
          color       = s === 'signed' ? 'success' : 'brand';
          title       = `Contratto ${meta.title || ''} ${s === 'signed' ? 'firmato' : 'inviato'}`.trim();
          description = s === 'signed' ? 'Il contratto è attivo' : 'In attesa di firma';
        } else if (t === 'document') {
          icon        = 'doc';
          color       = 'info';
          title       = `Documento ${meta.name || ''}`.trim();
          description = 'Il tuo account manager ha condiviso un documento';
        } else if (t === 'renewal') {
          icon        = 'renewal';
          color       = 'warning';
          title       = 'Rinnovo registrato';
          description = meta.service_name || '';
        }

        const dateLabel = safeDate(log.created_at, { day: '2-digit', month: 'short', year: 'numeric' });

        return `<div class="timeline-item${isLast ? ' timeline-item--last' : ''}">
          <div class="timeline-line"></div>
          <div class="timeline-dot timeline-dot--${color}">${ICONS[icon] || ICONS.doc}</div>
          <div class="timeline-content">
            <div class="timeline-title">${title}</div>
            ${description ? `<div class="timeline-desc">${description}</div>` : ''}
            <div class="timeline-date">${dateLabel}</div>
          </div>
        </div>`;
      }).join('');
    } catch (e) {
      console.error('[client_dash] renderTimeline error:', e);
      container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--error-text);">Impossibile caricare la cronologia.</div>';
    }
  }

  /* ── Init ────────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', async () => {
    await I18n.init('lang-switcher-slot');
    renderIdentity();
    // All widgets in parallel — one failing doesn't block the others
    Promise.allSettled([
      loadQuotes(),
      loadInvoices(),
      loadContracts(),
      loadDocuments(),
      renderTimeline(),
      // Silent first-login tracker — marks portal_first_login_at in onboarding DB
      API.Onboarding?.markPortalLogin?.().catch(() => {}),
    ]);
  });

})();