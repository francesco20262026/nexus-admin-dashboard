"use strict";

function getApiBase() {
  const h = location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') return 'http://127.0.0.1:8000/api';
  return 'https://api.delocanova.com/api';
}

const API_BASE = getApiBase();
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');

let currentQuote = null;

function showMessage(msg, type) {
  const banner = document.getElementById('status-message');
  banner.className = 'status-banner ' + type;
  banner.textContent = msg;
}

function formatCurrency(val) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val || 0);
}

function formatDate(isoStr) {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
}

async function loadQuote() {
  if (!token) {
    document.getElementById('loader').style.display = 'none';
    showMessage("Token mancante. Il link non Ã¨ valido.", "error");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/quotes/public/${token}`, {
      method: "GET",
      headers: { "Accept": "application/json" }
    });

    if (!res.ok) {
      document.getElementById('loader').style.display = 'none';
      if (res.status === 404) {
        showMessage("Preventivo non trovato o token non valido.", "error");
      } else {
        const errData = await res.json().catch(() => ({}));
        showMessage(errData.detail || "Errore di connessione.", "error");
      }
      return;
    }

    currentQuote = await res.json();
    renderQuote(currentQuote);

  } catch (err) {
    console.error(err);
    document.getElementById('loader').style.display = 'none';
    showMessage("Impossibile caricare il preventivo (errore di rete).", "error");
  }
}

function renderQuote(q) {
  document.getElementById('loader').style.display = 'none';
  document.getElementById('content-area').style.display = 'block';

  // Company details
  if (q.companies) {
    document.getElementById('supplier-name').textContent = q.companies.name || '-';
    document.getElementById('supplier-contact').textContent = `${q.companies.address || ''} | P.IVA: ${q.companies.vat_number || ''}`;
    
    // Dynamically set logo
    if (q.companies.logo_url) {
      const img = document.getElementById('company-logo');
      if (img) {
        img.src = q.companies.logo_url.startsWith('http') ? q.companies.logo_url : '/' + q.companies.logo_url.replace(/^\//, '');
        img.style.display = 'inline-block';
      }
    }
  }

  // Client Details
  if (q.clients) {
    document.getElementById('client-name').textContent = q.clients.company_name || q.clients.name || '-';
  } else if (q.onboarding) {
    document.getElementById('client-name').textContent = q.onboarding.company_name || q.onboarding.reference_name || '-';
  } else {
    document.getElementById('client-name').textContent = '-';
  }

  // Header meta
  document.getElementById('quote-number').textContent = q.number || q.title || '-';
  document.getElementById('quote-valid').textContent = formatDate(q.valid_until);

  // Status check
  if (q.status === 'expired') {
    showMessage("Questo preventivo Ã¨ scaduto e non Ã¨ piÃ¹ accettabile.", "error");
    document.getElementById('action-box').style.display = 'none';
  } else if (q.status === 'accepted') {
    showMessage(`Questo preventivo Ã¨ giÃ  stato accettato il ${formatDate(q.accepted_at)}.`, "success");
    document.getElementById('action-box').style.display = 'none';
  } else if (q.status === 'rejected') {
    showMessage(`Questo preventivo Ã¨ stato rifiutato il ${formatDate(q.rejected_at)}.`, "error");
    document.getElementById('action-box').style.display = 'none';
  }

  // Lines
  const tbody = document.getElementById('quote-lines');
  tbody.innerHTML = '';
  
  const lines = q.quote_lines || [];
  if (lines.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--gray-500)">Nessun servizio nel preventivo</td></tr>';
  } else {
    lines.forEach(ln => {
      const net = ln.unit_price * ln.quantity;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${ln.description}</td>
        <td style="text-align:right">${ln.quantity}</td>
        <td style="text-align:right">${formatCurrency(ln.unit_price)}</td>
        <td style="text-align:right">${ln.vat_rate}%</td>
        <td style="text-align:right; font-weight:600;">${formatCurrency(net)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Totals
  document.getElementById('tot-net').textContent = formatCurrency(q.total_net);
  document.getElementById('tot-vat').textContent = formatCurrency(q.total_vat);
  document.getElementById('tot-grand').textContent = formatCurrency(q.total);
}

async function acceptQuote() {
  if (!await UI.confirm("Confermi di voler accettare formalmente questo preventivo? Invieremo la notifica di accettazione.")) return;
  
  await doAction('accept', "Preventivo accettato con successo!", "success");
}

async function rejectQuote() {
  if (!await UI.confirm("Sei sicuro di voler rifiutare questo preventivo?")) return;
  
  await doAction('reject', "Hai rifiutato il preventivo.", "error");
}

async function doAction(action, successMsg, msgClass) {
  try {
    const res = await fetch(`${API_BASE}/quotes/public/${token}/${action}`, {
      method: "POST",
      headers: { "Accept": "application/json" }
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.detail || "Errore durante l'operazione. Riprova.");
      return;
    }

    // Success
    document.getElementById('action-box').style.display = 'none';
    showMessage(successMsg, msgClass);
    window.scrollTo({ top: 0, behavior: 'smooth' });

  } catch (err) {
    console.error(err);
    alert("Errore di rete. Verifica la connessione.");
  }
}

// Init
window.addEventListener('DOMContentLoaded', loadQuote);
