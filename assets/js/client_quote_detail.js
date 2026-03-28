/* ============================================================
   client_quote_detail.js — Client Quote view/accept logic
   ============================================================ */
'use strict';
(function () {
  Auth.guard('client');
  Auth.initUI();

  const urlParams = new URLSearchParams(window.location.search);
  const quoteId   = urlParams.get('id');

  const titleEl   = document.getElementById('qd-title');
  const statusEl  = document.getElementById('qd-status');
  const container = document.getElementById('quo-container');

  const STATUSES = {
    draft:    { label: 'Bozza',    color: 'var(--gray-500)' },
    sent:     { label: 'In Attesa di Risposta', color: 'var(--warning-600)' },
    accepted: { label: 'Accettato', color: 'var(--success-600)' },
    rejected: { label: 'Rifiutato', color: 'var(--danger-600)' }
  };

  async function loadQuote() {
    if (!quoteId) {
      container.innerHTML = '<div style="text-align:center;padding:40px;color:red;">ID preventivo mancante.</div>';
      return;
    }
    try {
      // Assuming API.Quotes.get(id) or API.get(/quotes/id)
      const qReq = API.Quotes ? API.Quotes.get(quoteId) : API.get(`/quotes/${quoteId}`);
      const quote = await qReq;
      
      if (!quote) throw new Error('Preventivo non trovato');

      const st = STATUSES[quote.status] || STATUSES.draft;
      const numStr = quote.id.substring(0,6).toUpperCase();
      
      titleEl.textContent = `Preventivo ${numStr}`;
      statusEl.innerHTML  = `<span style="color:${st.color};font-weight:600;">${st.label}</span>`;

      // Build items table
      let itemsHtml = '';
      const lines = quote.quote_lines || quote.items || [];
      if (lines.length > 0) {
        itemsHtml = `
          <table class="q-table">
            <thead>
              <tr>
                <th>Prodotto/Servizio</th>
                <th style="text-align:right;">Quantità</th>
                <th style="text-align:right;">Prezzo Un.</th>
                <th style="text-align:right;">Totale</th>
              </tr>
            </thead>
            <tbody>
              ${lines.map(it => `
                <tr>
                  <td>
                    <strong>${it.name || 'Servizio'}</strong>
                    ${it.description ? `<div style="font-size:12px;color:var(--gray-500);margin-top:2px;">${it.description}</div>` : ''}
                  </td>
                  <td style="text-align:right;">${it.quantity || 1}</td>
                  <td style="text-align:right;">${UI.currency(it.unit_price || 0)}</td>
                  <td style="text-align:right;"><strong>${UI.currency((it.quantity||1)*(it.unit_price||0))}</strong></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      } else {
        itemsHtml = '<p style="color:var(--gray-500);text-align:center;padding:20px;">Dettaglio voci non disponibile in questa vista.</p>';
      }

      // Notes block
      const notesHtml = quote.notes ? `<div style="background:var(--gray-50);padding:15px;border-radius:6px;font-size:13px;color:var(--gray-700);margin-bottom:20px;"><strong>Note:</strong><br/>${quote.notes.replace(/\\n/g, '<br/>')}</div>` : '';

      // Actions block
      let actionsHtml = '';
      if (quote.status === 'sent') {
        actionsHtml = `
          <div class="acceptance-box">
            <h3 style="margin-top:0;margin-bottom:8px;font-size:18px;">Procedi con l'accettazione</h3>
            <p style="color:var(--gray-500);font-size:14px;margin-bottom:0;">Confermando, accetti formalmente le condizioni dell'offerta. Il sistema ti guiderà automaticamente alla firma dei contratti o all'inizio dei lavori.</p>
            <div class="btn-group">
              <button class="btn btn-ghost" onclick="window.rejectQuote('${quote.id}')">Rifiuta Offerta</button>
              <button class="btn btn-primary" onclick="window.acceptQuote('${quote.id}')" style="box-shadow:0 4px 12px rgba(10,150,105,0.3);">Accetta Preventivo</button>
            </div>
          </div>
        `;
      } else if (quote.status === 'accepted') {
        actionsHtml = `
          <div class="acceptance-box" style="background:#f0fdf4;border-color:#bbf7d0;">
            <svg style="color:#16a34a;width:40px;height:40px;margin:0 auto 10px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
            <h3 style="margin:0 0 4px;color:#166534;font-size:18px;">Preventivo Accettato</h3>
            <p style="color:#15803d;font-size:14px;margin:0;">Grazie! Il nostro team si metterà in contatto con te a breve.</p>
          </div>
        `;
      }

      // Build Document
      container.innerHTML = `
        <div class="quote-header-info">
          <div>
            <div class="q-meta">Data Emissione</div>
            <div class="q-val">${UI.date(quote.created_at)}</div>
          </div>
          <div style="text-align:right;">
            <div class="q-meta">Valido Fino Al</div>
            <div class="q-val">${quote.valid_until ? UI.date(quote.valid_until) : 'N/A'}</div>
          </div>
        </div>

        ${itemsHtml}
        
        <div class="q-totals">
          <div class="q-tot-row">
            <span>Imponibile</span>
            <span>${UI.currency(quote.total_net || quote.total || 0)}</span>
          </div>
          <div class="q-tot-row grand">
            <span>Totale da Pagare</span>
            <span>${UI.currency(quote.total || 0)}</span>
          </div>
        </div>

        ${notesHtml}
        ${actionsHtml}
      `;

    } catch (e) {
      console.error('[client_quote_detail] loadQuote error:', e);
      container.innerHTML = '<div style="text-align:center;padding:40px;color:red;">Impossibile recuperare i dati del preventivo. Riprova più tardi.</div>';
    }
  }

  window.acceptQuote = async (id) => {
    if (!confirm('Sei sicuro di voler accettare questo preventivo?')) return;
    try {
      UI.toast('Elaborazione in corso...', 'info');
      await API.post(`/quotes/${id}/accept`);
      UI.toast('Preventivo accettato con successo!', 'success');
      loadQuote(); // Reload to show green box
    } catch (e) {
      UI.toast(e.message || 'Errore durante l\\\'accettazione', 'error');
    }
  };

  window.rejectQuote = async (id) => {
    if (!confirm('Sei sicuro di voler rifiutare questo preventivo?')) return;
    try {
      UI.toast('Elaborazione in corso...', 'info');
      await API.post(`/quotes/${id}/reject`);
      UI.toast('Preventivo rifiutato.', 'info');
      loadQuote();
    } catch (e) {
      UI.toast(e.message || 'Errore durante il rifiuto', 'error');
    }
  };

  document.addEventListener('DOMContentLoaded', async () => {
    loadQuote();
  });

})();
