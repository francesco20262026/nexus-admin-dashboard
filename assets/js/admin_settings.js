/* admin_settings.js — Application settings management */
'use strict';
(function () {
  Auth.guard('admin');
  Auth.initUI();

  const $ = id => document.getElementById(id);

  // ── Inject settings tabs into page-actions ───────────────────
  const act = $('page-actions');
  if (act) act.innerHTML = `<button class="btn btn-secondary" id="btn-refresh-settings">Aggiorna</button>`;
  $('btn-refresh-settings')?.addEventListener('click', load);

  // Remove KPI grid (settings has no KPIs)
  const kpiGrid = $('kpi-grid');
  if (kpiGrid) kpiGrid.style.display = 'none';

  window.addEventListener('companyChanged', load);

  async function load() {
    await Promise.all([
      loadCompanyProfile(),
      loadIntegrations(),
      loadEmailTemplates(),
    ]);
  }

  // ── Company Profile ────────────────────────────────────────────
  async function loadCompanyProfile() {
    try {
      const res = await API.get('/settings/company').catch(()=>null);
      if (!res) return;
      const f = name => $(name);
      if (f('set-company-name'))  f('set-company-name').value  = res.name  || '';
      if (f('set-company-vat'))   f('set-company-vat').value   = res.vat   || '';
      if (f('set-company-email')) f('set-company-email').value = res.email || '';
      if (f('set-company-phone')) f('set-company-phone').value = res.phone || '';
      if (f('set-company-addr'))  f('set-company-addr').value  = res.address || '';
    } catch (e) { console.warn('[settings] company:', e); }
  }

  async function loadIntegrations() {
    try {
      const res = await API.get('/settings/integrations').catch(()=>null);
      if (!res) return;
      // Windoc
      const wd = res.windoc || {};
      if ($('set-windoc-url'))      $('set-windoc-url').value      = wd.base_url   || '';
      if ($('set-windoc-user'))     $('set-windoc-user').value     = wd.username   || '';
      if ($('set-windoc-status'))   $('set-windoc-status').textContent = wd.connected ? 'Connesso' : 'Non connesso';
      if ($('set-windoc-badge'))    $('set-windoc-badge').className = `stat-badge ${wd.connected ? 'stat-badge--success' : 'stat-badge--danger'}`;
      // Zoho Sign
      const zs = res.zoho || {};
      if ($('set-zoho-status'))     $('set-zoho-status').textContent = zs.connected ? 'Connesso' : 'Non connesso';
      if ($('set-zoho-badge'))      $('set-zoho-badge').className    = `stat-badge ${zs.connected ? 'stat-badge--success' : 'stat-badge--danger'}`;
      // SMTP
      const smtp = res.smtp || {};
      if ($('set-smtp-host'))       $('set-smtp-host').value  = smtp.host  || '';
      if ($('set-smtp-port'))       $('set-smtp-port').value  = smtp.port  || '';
      if ($('set-smtp-user'))       $('set-smtp-user').value  = smtp.user  || '';
      if ($('set-smtp-from'))       $('set-smtp-from').value  = smtp.from_email || '';
    } catch (e) { console.warn('[settings] integrations:', e); }
  }

  async function loadEmailTemplates() {
    const el = $('set-templates-list'); if (!el) return;
    try {
      const res = await API.get('/settings/email-templates').catch(()=>[]);
      const tpls = Array.isArray(res) ? res : (res?.items ?? []);
      if (!tpls.length) { el.innerHTML = '<p style="color:var(--gray-400);font-size:13px;padding:8px 0;">Nessun template configurato.</p>'; return; }
      el.innerHTML = tpls.map(t => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);">
          <div>
            <div style="font-weight:600;font-size:13px;">${t.name}</div>
            <div style="font-size:11px;color:var(--gray-500);">${t.subject || ''}</div>
          </div>
          <div style="display:flex;gap:6px;">
            <button class="btn btn-ghost btn-sm" onclick="editEmailTemplate('${t.id}')">Modifica</button>
            <button class="btn btn-ghost btn-sm" onclick="previewEmailTemplate('${t.id}')">Anteprima</button>
          </div>
        </div>`).join('');
    } catch (e) { console.warn('[settings] templates:', e); }
  }

  // Save handlers
  $('btn-save-company')?.addEventListener('click', async () => {
    const btn = $('btn-save-company'); if (btn) btn.disabled = true;
    try {
      await API.patch('/settings/company', {
        name:    $('set-company-name')?.value?.trim(),
        vat:     $('set-company-vat')?.value?.trim(),
        email:   $('set-company-email')?.value?.trim(),
        phone:   $('set-company-phone')?.value?.trim(),
        address: $('set-company-addr')?.value?.trim(),
      });
      UI.toast('Profilo aziendale aggiornato', 'success');
    } catch(e) { UI.toast(e?.message||'Errore salvataggio','error'); }
    finally { if (btn) btn.disabled = false; }
  });

  $('btn-test-windoc')?.addEventListener('click', async () => {
    try {
      const r = await API.post('/settings/integrations/windoc/test', {
        base_url: $('set-windoc-url')?.value,
        username: $('set-windoc-user')?.value,
        password: $('set-windoc-pass')?.value,
      });
      UI.toast(r?.message || 'Windoc: connessione OK', 'success');
    } catch(e) { UI.toast(e?.message||'Connessione fallita','error'); }
  });

  $('btn-save-windoc')?.addEventListener('click', async () => {
    try {
      await API.patch('/settings/integrations/windoc', {
        base_url: $('set-windoc-url')?.value,
        username: $('set-windoc-user')?.value,
        password: $('set-windoc-pass')?.value || undefined,
      });
      UI.toast('Configurazione Windoc salvata', 'success');
    } catch(e) { UI.toast(e?.message||'Errore','error'); }
  });

  $('btn-test-smtp')?.addEventListener('click', async () => {
    try {
      await API.post('/settings/integrations/smtp/test', {
        host: $('set-smtp-host')?.value, port: $('set-smtp-port')?.value,
        user: $('set-smtp-user')?.value, from_email: $('set-smtp-from')?.value,
      });
      UI.toast('SMTP: invio di prova OK', 'success');
    } catch(e) { UI.toast(e?.message||'Test SMTP fallito','error'); }
  });

  $('btn-save-smtp')?.addEventListener('click', async () => {
    try {
      await API.patch('/settings/integrations/smtp', {
        host: $('set-smtp-host')?.value, port: $('set-smtp-port')?.value,
        user: $('set-smtp-user')?.value, password: $('set-smtp-pass')?.value||undefined,
        from_email: $('set-smtp-from')?.value,
      });
      UI.toast('Configurazione SMTP salvata', 'success');
    } catch(e) { UI.toast(e?.message||'Errore','error'); }
  });

  window.editEmailTemplate    = id => { alert(`Editor template ${id} — da implementare`); };
  window.previewEmailTemplate = id => { window.open(`/admin/email-template-preview/${id}`, '_blank'); };

  document.addEventListener('DOMContentLoaded', async () => {
    await I18n.init('lang-switcher-slot');
    load();
  });
})();