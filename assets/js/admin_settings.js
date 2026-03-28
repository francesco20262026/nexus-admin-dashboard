/* admin_settings.js — Application settings management */
'use strict';
(function () {
  Auth.guard('admin');
  Auth.initUI();

  const $ = id => document.getElementById(id);

  // ── Inject settings tabs into page-actions ───────────────────
  const act = $('page-actions');
  if (act) act.innerHTML = `<button class="btn btn-secondary" id="btn-refresh-settings">Aggiorna</button>`;
  $('btn-refresh-settings')?.addEventListener('click', function() { if(window.UI) UI.toast('Aggiornamento in corso...', 'info'); load(true); });

  // Remove KPI grid (settings has no KPIs)
  const kpiGrid = $('kpi-grid');
  if (kpiGrid) kpiGrid.style.display = 'none';

  window.addEventListener('companyChanged', load);

  async function load() {
    await Promise.all([
      loadCompanyProfile(),
      loadIntegrations(),
      loadEmailTemplates(),
      loadContractTemplates(),
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
      const res = await API.get('/settings/integrations', true).catch(()=>null);
      if (!res) return;

      // ── Windoc ──────────────────────────────────────────────
      const wd = res.windoc || {};
      if ($('set-windoc-url'))       $('set-windoc-url').value       = wd.base_url  || '';
      if ($('set-windoc-token-app')) $('set-windoc-token-app').value = wd.token_app || '';
      // token: show placeholder if already set, leave empty otherwise
      const tokenInput = $('set-windoc-token');
      if (tokenInput) {
        tokenInput.value = '';
        tokenInput.placeholder = wd.token ? '● ● ● invariato se vuoto ● ● ●' : 'Inserisci token';
      }
      const badge = $('set-windoc-badge');
      if (badge) {
        const ok = wd.configured;
        badge.textContent      = ok ? 'Configurato ✓' : 'Non configurato';
        badge.style.background = ok ? 'var(--color-success-bg,#dcfce7)' : 'var(--gray-100)';
        badge.style.color      = ok ? 'var(--color-success,#16a34a)'    : 'var(--gray-500)';
      }

      // ── SMTP ─────────────────────────────────────────────────
      const smtp = res.smtp || {};
      if ($('set-smtp-host'))  $('set-smtp-host').value  = smtp.host       || '';
      if ($('set-smtp-port'))  $('set-smtp-port').value  = smtp.port       || '';
      if ($('set-smtp-user'))  $('set-smtp-user').value  = smtp.username   || '';
      if ($('set-smtp-from'))  $('set-smtp-from').value  = smtp.from_email || '';

      // ── Zoho Sign ─────────────────────────────────────────────
      const zoho  = res.zoho || {};
      const zBadge = $('set-zoho-badge');
      if (zBadge) {
        const ok = zoho.configured;
        zBadge.textContent      = ok ? 'Connesso' : 'Non connesso';
        zBadge.style.color      = ok ? 'var(--color-success,#16a34a)' : 'var(--gray-500)';
      }
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
      await API.put('/settings/company', {
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
        base_url:  $('set-windoc-url')?.value,
        token_app: $('set-windoc-token-app')?.value,
        token:     $('set-windoc-token')?.value,
      });
      UI.toast(r?.message || 'Windoc: connessione OK', 'success');
    } catch(e) { UI.toast(e?.message||'Connessione fallita','error'); }
  });

  $('btn-save-windoc')?.addEventListener('click', async () => {
    const tokenApp = $('set-windoc-token-app')?.value?.trim();
    const token    = $('set-windoc-token')?.value?.trim();
    if (!tokenApp) { UI.toast('token_app è obbligatorio', 'warning'); return; }
    const config = {
      base_url:  $('set-windoc-url')?.value?.trim() || undefined,
      token_app: tokenApp,
    };
    // token: invia solo se compilato (non sovrascrivere se lasciato vuoto)
    if (token) config.token = token;
    try {
      await API.Settings.saveIntegration('windoc', config);
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
      await API.Settings.saveIntegration('smtp', {
        host: $('set-smtp-host')?.value, port: $('set-smtp-port')?.value,
        user: $('set-smtp-user')?.value, password: $('set-smtp-pass')?.value||undefined,
        from_email: $('set-smtp-from')?.value,
      });
      UI.toast('Configurazione SMTP salvata', 'success');
    } catch(e) { UI.toast(e?.message||'Errore','error'); }
  });

  // ── Contract Templates ────────────────────────────────────────
  let _ctEditingId = null;

  async function loadContractTemplates() {
    const el = document.getElementById('ct-list'); if (!el) return;
    try {
      const tpls = await API.Contracts.templates({ doc_type: 'contract' }).catch(() => []);
      if (!tpls.length) {
        el.innerHTML = '<p style="color:var(--gray-400);font-size:13px;padding:8px 0;">Nessun template. Clicca &quot;+ Nuovo template&quot; per iniziare.</p>';
        return;
      }
      el.innerHTML = tpls.map(t => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
          <div>
            <div style="font-weight:600;font-size:14px;">${t.name}</div>
            <div style="font-size:11px;color:var(--gray-400);">Creato: ${t.created_at ? new Date(t.created_at).toLocaleDateString('it-IT') : '—'}</div>
          </div>
          <div style="display:flex;gap:6px;">
            <button class="btn btn-ghost btn-sm" onclick="openContractTemplateForm('${t.id}')">Modifica</button>
            <button class="btn btn-ghost btn-sm" style="color:#ef4444;" onclick="deleteContractTemplate('${t.id}','${(t.name||'').replace(/'/g,String.fromCharCode(92,39))}')">Elimina</button>
          </div>
        </div>`).join('');
    } catch(e) { console.warn('[settings] contract templates:', e); }
  }

  window.openContractTemplateForm = async (id) => {
    _ctEditingId = id || null;
    document.getElementById('ct-modal-title').textContent = id ? 'Modifica template' : 'Nuovo template';
    document.getElementById('ct-name').value    = '';
    document.getElementById('ct-content').value = '';
    if (id) {
      try {
        const full = await API.get('/contracts/templates/' + id).catch(() => null);
        if (full) {
          document.getElementById('ct-name').value    = full.name    || '';
          document.getElementById('ct-content').value = full.content || '';
        }
      } catch {}
    }
    document.getElementById('ct-modal-overlay').classList.add('open');
  };

  window.closeContractTemplateForm = () => {
    document.getElementById('ct-modal-overlay').classList.remove('open');
    _ctEditingId = null;
  };

  window.saveContractTemplate = async () => {
    const name    = document.getElementById('ct-name')?.value?.trim();
    const content = document.getElementById('ct-content')?.value || '';
    if (!name)    { UI.toast('Inserisci il nome del template', 'warning'); return; }
    if (!content) { UI.toast('Il testo del contratto è vuoto', 'warning'); return; }
    const btn = document.getElementById('ct-save-btn');
    if (btn) btn.disabled = true;
    try {
      if (_ctEditingId) {
        await API.Contracts.updateTemplate(_ctEditingId, { name, content });
        UI.toast('Template aggiornato', 'success');
      } else {
        await API.Contracts.createTemplate({ name, content, type: 'contract' });
        UI.toast('Template creato', 'success');
      }
      closeContractTemplateForm();
      loadContractTemplates();
    } catch(e) { UI.toast(e?.message || 'Errore salvataggio', 'error'); }
    finally { if (btn) btn.disabled = false; }
  };

  window.deleteContractTemplate = async (id, name) => {
    if (!confirm('Eliminare il template "' + name + '"?')) return;
    try {
      await API.Contracts.deleteTemplate(id);
      UI.toast('Template eliminato', 'success');
      loadContractTemplates();
    } catch(e) { UI.toast(e?.message || 'Errore', 'error'); }
  };

  window.insertVar = (key) => {
    const ta = document.getElementById('ct-content');
    if (!ta) return;
    const tag = '{{' + key + '}}';
    const s = ta.selectionStart, e2 = ta.selectionEnd;
    ta.value = ta.value.substring(0, s) + tag + ta.value.substring(e2);
    ta.selectionStart = ta.selectionEnd = s + tag.length;
    ta.focus();
  };

  window.editEmailTemplate    = id => { alert('Editor template ' + id + ' — da implementare'); };
  window.previewEmailTemplate = id => { window.open('/admin/email-template-preview/' + id, '_blank'); };

  window.onPageReady(async () => {
    await I18n.init('lang-switcher-slot');
    load();
    loadContractTemplates();
  });
})();