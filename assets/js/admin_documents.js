/* admin_documents.js — Document archive + visibility management */
'use strict';
(function () {
  Auth.guard('admin');
  Auth.initUI();

  let ALL = [], filtered = [];
  const saved   = window.SessionState?.load('documents') || {};
  let pg        = saved.pg  || 1;
  let activeTab = saved.tab || 'all';
  const PER = 15;

  const $ = id => document.getElementById(id);
  const list    = $('doc-list');
  const tabBar  = $('doc-tab-bar');
  const search  = $('doc-search');
  const fType   = $('doc-filter-type');
  const fClient = $('doc-filter-client');
  const info    = $('doc-info');
  const pag     = $('doc-pagination');
  const modal   = $('modal-document');

  // Page actions
  const act = $('page-actions');
  if (act) act.innerHTML = `
    <button class="btn btn-secondary" id="btn-refresh"><svg style="width:15px;height:15px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/></svg> <span>Aggiorna</span></button>
    <button class="btn btn-primary" id="btn-upload-doc"><svg style="width:15px;height:15px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg> <span>Carica documento</span></button>`;
  $('btn-refresh')?.addEventListener('click', load);
  $('btn-upload-doc')?.addEventListener('click', () => modal?.classList.add('open'));

  tabBar?.querySelectorAll('.filter-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));
  tabBar?.addEventListener('click', e => {
    const b = e.target.closest('.filter-tab'); if (!b) return;
    tabBar.querySelectorAll('.filter-tab').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); activeTab = b.dataset.tab; pg = 1; applyFilters();
  });
  [search, fType, fClient].forEach(el => {
    el?.addEventListener('input',  () => { pg=1; applyFilters(); });
    el?.addEventListener('change', () => { pg=1; applyFilters(); });
  });

  window.addEventListener('companyChanged', load);
  window._reloadDocuments = load;

  async function load() {
    if (!list) return;
    list.innerHTML = UI.skeletonCardList(5);
    try {
      const res = await API.Documents.list({});
      ALL = Array.isArray(res) ? res : (res?.items ?? res?.data ?? []);
      populateClientFilter();
    } catch (e) {
      ALL = [];
      const errMsg = 'Impossibile caricare i documenti. Controlla la connessione e riprova.';
      list.innerHTML = UI.errorState(errMsg, 'window._reloadDocuments()');
    }
    updateKpis();
    applyFilters();
  }

  function populateClientFilter() {
    if (!fClient) return;
    const prev  = fClient.value;
    const names = [...new Set(ALL.map(d => d.client_name).filter(Boolean))].sort();
    fClient.innerHTML = `<option value="">Tutti i clienti</option>` + names.map(n=>`<option value="${n}">${n}</option>`).join('');
    if (prev) fClient.value = prev;
  }

  function updateKpis() {
    const set = (id,v,m) => { const el=$(id); if(el) el.textContent=v; const em=$(id+'-meta'); if(em&&m!==undefined) em.textContent=m; };
    set('kpi-doc-total',    ALL.length,                                                'In archivio');
    set('kpi-doc-shared',   ALL.filter(d => d.visibility === 'shared').length,         'Col cliente');
    set('kpi-doc-internal', ALL.filter(d => d.visibility === 'internal' || !d.visibility).length, 'Solo admin');
    set('kpi-doc-signing',  ALL.filter(d => d.status === 'signing' || d.status === 'pending_signature').length, 'In attesa firma');
  }

  function applyFilters() {
    const q  = (search?.value || '').toLowerCase().trim();
    const ty = fType?.value   || '';
    const cl = fClient?.value || '';
    const vs = ''    || '';

    filtered = ALL.filter(d => {
      if (activeTab === 'shared'   && d.visibility !== 'shared')   return false;
      if (activeTab === 'internal' && d.visibility !== 'internal' && d.visibility) return false;
      if (activeTab === 'signing'  && d.status !== 'signing' && d.status !== 'pending_signature') return false;
      if (ty && d.type !== ty) return false;
      if (st && d.status !== st) return false;
      if (cl && d.client_name !== cl) return false;
      if (vs && d.visibility !== vs) return false;
      if (q) {
        const hay = [d.name, d.client_name, d.type].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const max = Math.ceil(filtered.length / PER) || 1;
    if (pg > max) pg = max;
    window.SessionState?.save('documents', { pg, tab: activeTab });
    render();
  }

  const TYPE_LABELS = { contract:'Contratto', invoice:'Fattura', report:'Report', identity:'Identità', other:'Altro' };
  const VIS_LABELS  = { shared:'Condiviso', internal:'Interno' };

  function render() {
    if (!list) return;
    if (!filtered.length) {
      list.innerHTML = `<div class="list-card">${UI.createEmptyState(null, ALL.length ? 'Nessun documento corrisponde ai filtri.' : 'Nessun documento in archivio.')}</div>`;
      if (info) info.textContent=''; if (pag) pag.innerHTML=''; return;
    }
    const slice = filtered.slice((pg-1)*PER, pg*PER);
    list.innerHTML = slice.map(d => {
      const visLabel  = VIS_LABELS[d.visibility] || d.visibility || 'Interno';
      const typeLabel = TYPE_LABELS[d.type]      || d.type        || 'Documento';
      const visColor  = d.visibility === 'shared' ? 'var(--color-success)' : 'var(--gray-500)';
      return `<div class="list-card fade-in" data-id="${d.id}">
        <div class="list-card-header">
          <div class="list-card-title">
            <div>${d.name || 'Documento senza nome'}</div>
            <div style="font-size:11px;color:var(--gray-500);margin-top:2px;">${typeLabel}</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:11px;color:${visColor};font-weight:600;">${visLabel}</span>
            ${UI.pill(d.status || 'available')}
          </div>
        </div>
        <div class="list-card-body" style="flex-wrap:wrap;">
          ${d.client_name ? `<div class="list-card-meta"><svg style="width:13px;height:13px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"/></svg><a href="admin_client_detail.html?id=${d.client_id}" style="color:var(--brand-600);">${d.client_name}</a></div>` : ''}
          ${d.uploaded_at ? `<div class="list-card-meta">Upload: ${UI.date(d.uploaded_at)}</div>` : ''}
          ${d.file_size   ? `<div class="list-card-meta">${Math.round(d.file_size/1024)} KB</div>` : ''}
          <div class="row-actions" style="width:100%;justify-content:flex-end;margin-top:4px;">
            ${d.preview_url || d.url ? `<a href="${d.preview_url||d.url}" target="_blank" class="btn btn-ghost btn-sm">Anteprima</a>` : ''}
            ${d.url ? `<a href="${d.url}" target="_blank" class="btn btn-ghost btn-sm" download>Download</a>` : ''}
            ${d.visibility !== 'shared' ? `<button class="btn btn-secondary btn-sm" onclick="shareDoc('${d.id}')">Condividi</button>` : `<button class="btn btn-ghost btn-sm" onclick="unshareDoc('${d.id}')">Rendi interno</button>`}
            ${d.client_id ? `<a href="admin_client_detail.html?id=${d.client_id}" class="btn btn-ghost btn-sm">Apri cliente</a>` : ''}
          </div>
        </div>
      </div>`;
    }).join('');
    const s=(pg-1)*PER+1, e=Math.min(pg*PER,filtered.length);
    if (info) info.textContent = `${s}–${e} di ${filtered.length}`;
    UI.pagination(pag, null, pg, filtered.length, PER, p => { pg=p; render(); });
  }

  // Upload
  $('btn-upload-document')?.addEventListener('click', async () => {
    const file = $('doc-file')?.files?.[0];
    if (!file) { UI.toast('Seleziona un file','warning'); return; }
    const btn = $('btn-upload-document'); if (btn) btn.disabled = true;
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('name', $('doc-name')?.value?.trim() || file.name);
      fd.append('type', $('doc-type')?.value || 'other');
      fd.append('visibility', $('doc-visibility')?.value || 'internal');
      const cid = $('doc-client')?.value; if (cid) fd.append('client_id', cid);
      await API.Documents.upload(fd);
      UI.toast('Documento caricato','success'); modal?.classList.remove('open'); await load();
    } catch(e) { UI.toast(e?.message||'Errore upload','error'); }
    finally { if (btn) btn.disabled = false; }
  });

  // Load clients into upload modal
  modal?.addEventListener('transitionend', async () => {
    if (!modal.classList.contains('open')) return;
    const dc = $('doc-client'); if (!dc || dc.options.length > 1) return;
    try {
      const res = await API.Clients.list().catch(()=>[]);
      const cl  = Array.isArray(res) ? res : (res?.items??res?.data??[]);
      dc.innerHTML = '<option value="">— Nessun cliente —</option>' + cl.map(c=>`<option value="${c.id}">${c.name||c.email}</option>`).join('');
    } catch {}
  });

  window.shareDoc   = async id => { try { await API.Documents.update(id,{visibility:'shared'}); ALL=ALL.map(d=>d.id===id?{...d,visibility:'shared'}:d); updateKpis(); applyFilters(); UI.toast('Condiviso col cliente','success'); } catch(e) { UI.toast(e?.message||'Errore','error'); } };
  window.unshareDoc = async id => { try { await API.Documents.update(id,{visibility:'internal'}); ALL=ALL.map(d=>d.id===id?{...d,visibility:'internal'}:d); updateKpis(); applyFilters(); UI.toast('Reso interno','info'); } catch(e) { UI.toast(e?.message||'Errore','error'); } };

  document.addEventListener('DOMContentLoaded', async () => {
    await I18n.init('lang-switcher-slot');
    load();
  });
})();