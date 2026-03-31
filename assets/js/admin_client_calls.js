/**
 * admin_client_calls.js Chiamate client: carica, crea, aggiorna stato, alert scadute
 * v1 2026-03-28
 */

/* ──────────────────────────────────────────────────────────
   Helpers locali
   ────────────────────────────────────────────────────────── */
function _callToast(msg, type) {
  if (window.UI?.toast) { UI.toast(msg, type); return; }
  if (window.showToast)  { showToast(msg, type); return; }
  console[type === 'error' ? 'error' : 'log']('[calls]', msg);
}

function _escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ──────────────────────────────────────────────────────────
   Stato modulo
   ────────────────────────────────────────────────────────── */
let _callsClientId = null;
let _allCalls      = [];

/* ──────────────────────────────────────────────────────────
   Bootstrap: chiama dopo che clientId è noto
   ────────────────────────────────────────────────────────── */
function initCallsModule(clientId) {
  _callsClientId = clientId;
  loadCalls();
}

/* ──────────────────────────────────────────────────────────
   loadCalls() GET /api/clients/{id}/calls
   ────────────────────────────────────────────────────────── */
async function loadCalls() {
  if (!_callsClientId) return;
  try {
    const data = await API.get(`/clients/${_callsClientId}/calls`);
    _allCalls = Array.isArray(data) ? data : [];
    renderCalls();
    updateCallsBadge();
  } catch (e) {
    console.error('[calls] loadCalls error', e);
  }
}

/* ──────────────────────────────────────────────────────────
   renderCalls() split open vs done, build DOM
   ────────────────────────────────────────────────────────── */
function renderCalls() {
  const now     = new Date();
  const open    = _allCalls.filter(c => c.status === 'scheduled');
  const done    = _allCalls.filter(c => c.status === 'completed');
  const missed  = _allCalls.filter(c => c.status === 'missed');

  const openList = document.getElementById('calls-open-list');
  const doneList = document.getElementById('calls-done-list');
  const cntOpen  = document.getElementById('count-open');
  const cntDone  = document.getElementById('count-done');

  if (!openList || !doneList) return;

  cntOpen.textContent = open.length;
  cntDone.textContent = done.length + missed.length;

  /* Chiamate aperte (scheduled) */
  openList.innerHTML = open.length === 0
    ? '<div class="calls-empty">Nessuna chiamata programmata</div>'
    : open.map(c => _buildCallItem(c, now)).join('');

  /* Completate + mancate */
  const closed = [...done, ...missed].sort((a,b) => new Date(b.scheduled_at) - new Date(a.scheduled_at));
  doneList.innerHTML = closed.length === 0
    ? '<div class="calls-empty">Nessuna chiamata completata</div>'
    : closed.map(c => _buildCallItem(c, now)).join('');
}

/* ──────────────────────────────────────────────────────────
   _buildCallItem(call, now) HTML per singola riga
   ────────────────────────────────────────────────────────── */
function _buildCallItem(c, now) {
  const dt      = new Date(c.scheduled_at);
  const isOver  = c.status === 'scheduled' && dt < now;
  const itemCls = isOver ? 'overdue' : (c.status === 'completed' ? 'done' : '');

  const dateFmt = dt.toLocaleDateString('it-IT', { day:'2-digit', month:'short', year:'numeric' });
  const timeFmt = dt.toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' });

  const badge = {
    scheduled : isOver
      ? '<span class="call-badge overdue">Scaduta</span>'
      : '<span class="call-badge scheduled">Programmata</span>',
    completed : '<span class="call-badge done">Completata</span>',
    missed    : '<span class="call-badge missed">Mancata</span>',
  }[c.status] || '';

  const actions = c.status === 'scheduled'
    ? `<button class="btn btn-primary btn-sm" onclick="markCallDone('${c.id}')">✓ Completata</button>
       <button class="btn btn-secondary btn-sm" onclick="markCallMissed('${c.id}')">Mancata</button>
       <button class="btn btn-ghost btn-sm" onclick="deleteCall('${c.id}')" style="margin-left:auto;color:#dc2626;">Elimina</button>`
    : `<button class="btn btn-ghost btn-sm" onclick="deleteCall('${c.id}')" style="color:#dc2626;">Elimina</button>`;

  return `
  <div class="call-item ${itemCls}" id="call-${c.id}">
    <div class="call-item-title">${_escHtml(c.title)}</div>
    <div class="call-item-meta">
      <span>📅 ${dateFmt} ${timeFmt}</span>
      <span>⏱ ${c.duration_min} min</span>
      ${badge}
    </div>
    ${c.notes ? `<div class="call-item-notes">${_escHtml(c.notes)}</div>` : ''}
    <div class="call-item-actions">${actions}</div>
  </div>`;
}

/* ──────────────────────────────────────────────────────────
   updateCallsBadge() badge nel tab nav
   ────────────────────────────────────────────────────────── */
function updateCallsBadge() {
  const badge = document.getElementById('badge-call');
  if (!badge) return;
  const open = _allCalls.filter(c => c.status === 'scheduled').length;
  badge.textContent = open;
  badge.style.display = open > 0 ? '' : 'none';
}

/* ──────────────────────────────────────────────────────────
   openCallModal() / closeCallModal()
   ────────────────────────────────────────────────────────── */
function openCallModal() {
  /* Arrotonda al prossimo quarto d'ora */
  const now     = new Date();
  const rounded = new Date(Math.ceil(now.getTime() / (15 * 60000)) * (15 * 60000));
  /* Converti in formato locale datetime-local (YYYY-MM-DDTHH:mm) */
  const pad = n => String(n).padStart(2, '0');
  const local = `${rounded.getFullYear()}-${pad(rounded.getMonth()+1)}-${pad(rounded.getDate())}T${pad(rounded.getHours())}:${pad(rounded.getMinutes())}`;

  document.getElementById('call-title').value        = '';
  document.getElementById('call-scheduled-at').value = local;
  document.getElementById('call-duration').value     = '30';
  document.getElementById('call-notes').value        = '';

  document.getElementById('modal-add-call').classList.add('open');
  setTimeout(() => document.getElementById('call-title').focus(), 100);
}

function closeCallModal() {
  document.getElementById('modal-add-call').classList.remove('open');
}

/* ──────────────────────────────────────────────────────────
   saveCall() POST /api/clients/{id}/calls
   ────────────────────────────────────────────────────────── */
async function saveCall() {
  const title = document.getElementById('call-title').value.trim();
  const sched = document.getElementById('call-scheduled-at').value;
  const dur   = parseInt(document.getElementById('call-duration').value, 10);
  const notes = document.getElementById('call-notes').value.trim();

  if (!title) { _callToast('Inserisci un titolo per la chiamata', 'error'); return; }
  if (!sched) { _callToast('Seleziona data e ora',                'error'); return; }

  const body = {
    title,
    scheduled_at : new Date(sched).toISOString(),
    duration_min : dur,
  };
  if (notes) body.notes = notes;

  try {
    await API.post(`/clients/${_callsClientId}/calls`, body);
    closeCallModal();
    await loadCalls();
    _callToast('Chiamata programmata', 'success');
  } catch (e) {
    _callToast(e.message || 'Errore nel salvataggio', 'error');
    console.error('[calls] saveCall error', e);
  }
}

/* ──────────────────────────────────────────────────────────
   markCallDone / markCallMissed
   ────────────────────────────────────────────────────────── */
async function markCallDone(id) {
  await _patchCall(id, { status: 'completed' }, 'Chiamata completata');
}

async function markCallMissed(id) {
  await _patchCall(id, { status: 'missed' }, 'Chiamata segnata come mancata');
}

async function _patchCall(id, patch, successMsg) {
  try {
    await API.patch(`/clients/calls/${id}`, patch);
    await loadCalls();
    _callToast(successMsg, 'success');
  } catch (e) {
    _callToast(e.message || 'Errore aggiornamento chiamata', 'error');
    console.error('[calls] patchCall error', e);
  }
}

/* ──────────────────────────────────────────────────────────
   deleteCall(id)
   ────────────────────────────────────────────────────────── */
async function deleteCall(id) {
  if (!confirm('Eliminare questa chiamata?')) return;
  try {
    await API.del(`/clients/calls/${id}`);
    await loadCalls();
    _callToast('Chiamata eliminata', 'success');
  } catch (e) {
    _callToast(e.message || 'Errore eliminazione', 'error');
  }
}

/* ──────────────────────────────────────────────────────────
   checkOverdueCalls() mostra alert popup se ci sono scadute
   ────────────────────────────────────────────────────────── */
async function checkOverdueCalls() {
  if (!_callsClientId) return;
  try {
    const overdue = await API.get(`/clients/${_callsClientId}/calls/overdue`);
    if (!Array.isArray(overdue) || overdue.length === 0) return;

    const list = document.getElementById('alert-overdue-list');
    const now  = new Date();

    list.innerHTML = overdue.map(c => {
      const dt   = new Date(c.scheduled_at);
      const diff = Math.floor((now - dt) / 60000);
      const ago  = diff < 60
        ? `${diff} min fa`
        : diff < 1440
          ? `${Math.floor(diff / 60)} ore fa`
          : `${Math.floor(diff / 1440)} giorni fa`;
      return `<div class="calls-alert-row"><strong>${ago}</strong> ${_escHtml(c.title)}</div>`;
    }).join('');

    document.getElementById('alert-overdue-calls').classList.add('open');
  } catch (e) {
    console.warn('[calls] checkOverdueCalls error', e);
  }
}

function dismissOverdueAlert() {
  document.getElementById('alert-overdue-calls').classList.remove('open');
}
