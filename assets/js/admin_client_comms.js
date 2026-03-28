/**
 * admin_client_comms.js — Comunicazioni cliente: timeline, crea, filtra
 * v1 — 2026-03-28
 */

/* ──────────────────────────────────────────────────────────
   Helpers locali
   ────────────────────────────────────────────────────────── */
function _commsToast(msg, type) {
  if (window.UI?.toast) { UI.toast(msg, type); return; }
  if (window.showToast)  { showToast(msg, type); return; }
  console[type === 'error' ? 'error' : 'log']('[comms]', msg);
}

function _escC(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const CHANNEL_ICONS = {
  email    : '📧',
  sms      : '📱',
  whatsapp : '💬',
  phone    : '📞',
  letter   : '📄',
  portal   : '🌐',
  other    : '📌',
};

const STATUS_LABELS = {
  sent      : 'Inviata',
  failed    : 'Fallita',
  delivered : 'Consegnata',
  opened    : 'Aperta',
};

/* ──────────────────────────────────────────────────────────
   Stato modulo
   ────────────────────────────────────────────────────────── */
let _commsClientId   = null;
let _allComms        = [];
let _commsFilter     = '';

/* ──────────────────────────────────────────────────────────
   Bootstrap
   ────────────────────────────────────────────────────────── */
function initCommsModule(clientId) {
  _commsClientId = clientId;
  loadComms();
}

/* ──────────────────────────────────────────────────────────
   loadComms() — GET /api/clients/{id}/communications
   ────────────────────────────────────────────────────────── */
async function loadComms() {
  if (!_commsClientId) return;
  try {
    const data = await API.get(`/clients/${_commsClientId}/communications`);
    _allComms = Array.isArray(data) ? data : [];
    renderComms();
    updateCommsBadge();
  } catch (e) {
    console.error('[comms] loadComms error', e);
  }
}

/* ──────────────────────────────────────────────────────────
   setCommsFilter(btn, channel)
   ────────────────────────────────────────────────────────── */
function setCommsFilter(btn, channel) {
  _commsFilter = channel;
  document.querySelectorAll('.comms-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderComms();
}

/* ──────────────────────────────────────────────────────────
   renderComms()
   ────────────────────────────────────────────────────────── */
function renderComms() {
  const timeline = document.getElementById('comms-timeline');
  if (!timeline) return;

  const filtered = _commsFilter
    ? _allComms.filter(c => c.channel === _commsFilter)
    : _allComms;

  if (filtered.length === 0) {
    timeline.innerHTML = '<div class="comms-empty">Nessuna comunicazione registrata</div>';
    return;
  }

  timeline.innerHTML = filtered.map(c => _buildCommsItem(c)).join('');
}

/* ──────────────────────────────────────────────────────────
   _buildCommsItem(comm) — HTML per singola riga timeline
   ────────────────────────────────────────────────────────── */
function _buildCommsItem(c) {
  const icon       = CHANNEL_ICONS[c.channel] || '📌';
  const chanCls    = c.channel || 'other';
  const statusLbl  = STATUS_LABELS[c.status]  || c.status || '';
  const dirLbl     = c.direction === 'inbound' ? '← Entrante' : '→ Uscente';
  const isAuto     = !c.sent_by;
  const label      = c.label || c.template_type || 'Comunicazione';

  const dt = new Date(c.sent_at);
  const dateFmt = dt.toLocaleDateString('it-IT', { day:'2-digit', month:'short', year:'numeric' });
  const timeFmt = dt.toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' });

  let refLink = '';
  if (c.reference_type && c.reference_id) {
    const refPages = {
      invoice  : 'admin_invoices.html',
      quote    : 'admin_quotes.html',
      contract : 'admin_contracts.html',
      renewal  : 'admin_renewals.html',
    };
    const page = refPages[c.reference_type];
    if (page) {
      refLink = `<a href="${page}?id=${c.reference_id}" style="font-size:11px;color:#059669;text-decoration:none;font-weight:600;">
        → Vai a ${c.reference_type}</a>`;
    }
  }

  return `
  <div class="comms-item">
    <div class="comms-icon ${_escC(chanCls)}">${icon}</div>
    <div class="comms-body">
      <div class="comms-label">
        ${_escC(label)}
        <span class="comms-badge ${c.status || 'sent'}">${_escC(statusLbl)}</span>
        <span class="comms-badge ${c.direction || 'outbound'}">${dirLbl}</span>
        ${isAuto ? '<span class="comms-badge automated">Automatica</span>' : ''}
      </div>
      ${c.subject ? `<div class="comms-subject">${_escC(c.subject)}</div>` : ''}
      ${c.body_preview ? `<div class="comms-preview">${_escC(c.body_preview.slice(0,120))}</div>` : ''}
      <div class="comms-meta">
        <span>📅 ${dateFmt} ${timeFmt}</span>
        ${refLink}
      </div>
    </div>
  </div>`;
}

/* ──────────────────────────────────────────────────────────
   updateCommsBadge()
   ────────────────────────────────────────────────────────── */
function updateCommsBadge() {
  const badge = document.getElementById('badge-comms');
  if (!badge) return;
  badge.textContent = _allComms.length;
  badge.style.display = _allComms.length > 0 ? '' : 'none';
}

/* ──────────────────────────────────────────────────────────
   openCommsModal() / closeCommsModal()
   ────────────────────────────────────────────────────────── */
function openCommsModal() {
  const now     = new Date();
  const pad     = n => String(n).padStart(2,'0');
  const local   = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;

  document.getElementById('comm-channel').value   = 'email';
  document.getElementById('comm-direction').value = 'outbound';
  document.getElementById('comm-subject').value   = '';
  document.getElementById('comm-body').value      = '';
  document.getElementById('comm-status').value    = 'sent';
  document.getElementById('comm-sent-at').value   = local;

  document.getElementById('modal-add-comm').classList.add('open');
  setTimeout(() => document.getElementById('comm-subject').focus(), 100);
}

function closeCommsModal() {
  document.getElementById('modal-add-comm').classList.remove('open');
}

/* ──────────────────────────────────────────────────────────
   saveComm() — POST /api/clients/{id}/communications
   ────────────────────────────────────────────────────────── */
async function saveComm() {
  const channel   = document.getElementById('comm-channel').value;
  const direction = document.getElementById('comm-direction').value;
  const subject   = document.getElementById('comm-subject').value.trim();
  const body      = document.getElementById('comm-body').value.trim();
  const status    = document.getElementById('comm-status').value;
  const sentAt    = document.getElementById('comm-sent-at').value;

  const payload = {
    channel,
    direction,
    status,
    template_type: 'custom',
  };
  if (subject) payload.subject      = subject;
  if (body)    payload.body_preview = body;
  if (sentAt)  payload.sent_at      = new Date(sentAt).toISOString();

  try {
    await API.post(`/clients/${_commsClientId}/communications`, payload);
    closeCommsModal();
    await loadComms();
    _commsToast('Comunicazione salvata', 'success');
  } catch (e) {
    _commsToast(e.message || 'Errore nel salvataggio', 'error');
    console.error('[comms] saveComm error', e);
  }
}
