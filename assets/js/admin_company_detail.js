/* admin_company_detail.js Company detail: dati, integrazioni, template */
'use strict';
(function () {
  Auth.guard('admin');
  Auth.initUI();

  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const COMPANY_ID = params.get('id');

  if (!COMPANY_ID) { location.href = 'admin_companies.html'; return; }

  let _company = null;
  let _activeTab = 'dati';

  // ── Tabs ──────────────────────────────────────────────────
  document.querySelectorAll('.detail-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.detail-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      _activeTab = btn.dataset.tab;
      $(`tab-${_activeTab}`)?.classList.add('active');
      if (_activeTab === 'template-contratti') loadCtTemplates();
      if (_activeTab === 'template-email') loadEtTemplates();
    });
  });

  const btnRefresh = $('btn-refresh');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      UI.toast('Aggiornamento in corso...', 'info');
      load();
    });
  }

  // ── Load company data ─────────────────────────────────────
  async function load() {
    try {
      const c = await API.get(`/companies/${COMPANY_ID}`);
      _company = c;
      renderHeader(c);
      fillDati(c);
      fillIntegrationStatus(c.integrations || {});
    } catch (e) {
      UI.toast(e?.message || 'Errore caricamento azienda', 'error');
    }
  }

  function renderHeader(c) {
    const nameEl = $('page-company-name');
    if (nameEl) nameEl.textContent = c.name || 'Azienda';
    const slugEl = $('page-company-slug');
    if (slugEl) slugEl.textContent = `slug: ${c.slug || ''} · lingua: ${(c.default_lang || 'it').toUpperCase()}`;
  }

  function fillDati(c) {
    const f = (id, val) => { const el = $(id); if (el) el.value = val || ''; };
    f('d-name',        c.name);
    f('d-vat',         c.vat_number);
    f('d-email',       c.email);
    f('d-phone',       c.phone);
    f('d-address',     c.address);
    f('d-bank',        c.bank_name);
    f('d-iban',        c.iban);
    f('d-swift',       c.swift_bic);
    f('d-beneficiary', c.payment_beneficiary);
    f('d-logo',        c.logo_url);
    if (c.logo_url) previewLogo(c.logo_url);
    const lang = $('d-lang'); if (lang) lang.value = c.default_lang || 'it';
  }

  window.previewLogo = function(url) {
    const prev = $('logo-preview');
    if (!prev) return;
    if (url && url.startsWith('http')) {
      prev.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:contain;" onerror="this.parentNode.innerHTML='?'"/>`;
    } else {
      const initials = (_company?.name||'?').split(' ').slice(0,2).map(w=>w[0]?.toUpperCase()||'').join('');
      prev.textContent = initials || '?';
    }
  };

  function fillIntegrationStatus(ints) {
    const setBar = (prefix, data) => {
      const bar    = $(`${prefix}-status-bar`);
      const badge  = $(`${prefix}-badge`);
      const text   = $(`${prefix}-status-text`);
      const active = data?.is_active;
      if (bar)   { bar.classList.toggle('active',  active); bar.classList.toggle('inactive', !active); }
      if (badge) { badge.classList.toggle('on', active); badge.classList.toggle('off', !active); }
      if (text)  { text.textContent = active ? '✓ Integrazione attiva' : 'Non configurato'; }
    };
    setBar('brevo',  ints.email); // we reuse the UI ids "brevo" but map them to the "email" integration
    setBar('windoc', ints.windoc);
    setBar('zoho',   ints.zoho_sign);

    if (ints.email && ints.email.config) {
      const cfg = ints.email.config;
      const f = (id, val) => { const el = $(id); if (el) el.value = val || ''; };
      f('brevo-email', cfg.from_email);
      f('smtp-host',   cfg.host);
      f('smtp-port',   cfg.port);
      f('smtp-user',   cfg.username);
    }
  }

  // ── Save Dati ─────────────────────────────────────────────
  $('btn-save-dati')?.addEventListener('click', async () => {
    const name = $('d-name')?.value?.trim();
    if (!name) { UI.toast('Il nome è obbligatorio', 'warning'); return; }
    const btn = $('btn-save-dati'); if (btn) btn.disabled = true;
    try {
      await API.put(`/companies/${COMPANY_ID}`, {
        name,
        default_lang:        $('d-lang')?.value,
        vat_number:          $('d-vat')?.value?.trim() || null,
        email:               $('d-email')?.value?.trim() || null,
        phone:               $('d-phone')?.value?.trim() || null,
        address:             $('d-address')?.value?.trim() || null,
        bank_name:           $('d-bank')?.value?.trim() || null,
        iban:                $('d-iban')?.value?.trim() || null,
        swift_bic:           $('d-swift')?.value?.trim() || null,
        payment_beneficiary: $('d-beneficiary')?.value?.trim() || null,
        logo_url:            $('d-logo')?.value?.trim() || null,
      });
      UI.toast('Dati azienda salvati', 'success');
      load();
    } catch (e) { UI.toast(e?.message || 'Errore', 'error'); }
    finally { if (btn) btn.disabled = false; }
  });

  // ── Save SMTP Email Mittente ──────────────────────────────
  $('btn-save-brevo')?.addEventListener('click', async () => {
    const email = $('brevo-email')?.value?.trim();
    if (!email) { UI.toast('Email mittente personalizzata obbligatoria', 'warning'); return; }
    const btn = $('btn-save-brevo'); if (btn) btn.disabled = true;
    try {
      await API.put(`/companies/${COMPANY_ID}/integrations/smtp`, {
        config: { 
          from_email: email, 
          host: $('smtp-host')?.value?.trim() || null, 
          port: parseInt($('smtp-port')?.value) || null,
          username: $('smtp-user')?.value?.trim() || null,
          password: $('smtp-pass')?.value || null
        }
      });
      UI.toast('Configurazione Email salvata', 'success');
      load();
    } catch (e) { UI.toast(e?.message || 'Errore salvataggio SMTP', 'error'); }
    finally { if (btn) btn.disabled = false; }
  });

  // ── Save Windoc ───────────────────────────────────────────
  $('btn-save-windoc')?.addEventListener('click', async () => {
    const tokenApp = $('wd-token-app')?.value?.trim();
    const token    = $('wd-token')?.value?.trim();
    if (!tokenApp || !token) { UI.toast('Token App e Token sono obbligatori', 'warning'); return; }
    const btn = $('btn-save-windoc'); if (btn) btn.disabled = true;
    try {
      await API.put(`/companies/${COMPANY_ID}/integrations/windoc`, {
        config: { token_app: tokenApp, token }
      });
      UI.toast('Windoc configurato', 'success');
      load();
    } catch (e) { UI.toast(e?.message || 'Errore', 'error'); }
    finally { if (btn) btn.disabled = false; }
  });

  $('btn-test-windoc')?.addEventListener('click', async () => {
    const btn = $('btn-test-windoc'); if (btn) btn.disabled = true;
    try {
      UI.toast('Test connessione in corso...', 'info');
      const res = await API.post(`/companies/${COMPANY_ID}/integrations/windoc/test`, {});
      if (res && res.success) {
        UI.toast(res.message || 'Connessione Winddoc OK', 'success');
      }
    } catch (e) {
      if (e.message && e.message.includes("Token mancanti")) {
        UI.toast('Salva i token prima di testare la connessione.', 'warning');
      } else {
        UI.toast(e?.message || 'Errore durante il test di connessione', 'error');
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  // ── Save Zoho ─────────────────────────────────────────────
  $('btn-save-zoho')?.addEventListener('click', async () => {
    const clientId = $('zoho-client-id')?.value?.trim();
    const secret   = $('zoho-secret')?.value?.trim();
    const refresh  = $('zoho-refresh')?.value?.trim();
    if (!clientId || !secret || !refresh) { UI.toast('Tutti i campi Zoho sono obbligatori', 'warning'); return; }
    const btn = $('btn-save-zoho'); if (btn) btn.disabled = true;
    try {
      await API.put(`/companies/${COMPANY_ID}/integrations/zoho_sign`, {
        config: { client_id: clientId, client_secret: secret, refresh_token: refresh, domain: $('zoho-domain')?.value || 'eu' }
      });
      UI.toast('Zoho Sign configurato', 'success');
      load();
    } catch (e) { UI.toast(e?.message || 'Errore', 'error'); }
    finally { if (btn) btn.disabled = false; }
  });

  // ── Template sub-tabs ────────────────────────────────────────
  window.showSubTab = (name) => {
    ['contratti','email'].forEach(n => {
      const el = $('subtab-' + n); if (el) el.style.display = n === name ? '' : 'none';
      const btn = $('subtab-btn-' + n); if (btn) btn.classList.toggle('active', n === name);
    });
    if (name === 'email') loadEtTemplates();
    if (name === 'contratti') loadCtTemplates();
  };

  // ── Contract Templates ────────────────────────────────────────
  let _ctId = null;

  async function loadTemplates() {
    await loadCtTemplates();
    await loadEtTemplates();
  }

  async function loadCtTemplates() {
    const list = $('ct-company-list'); if (!list) return;
    list.innerHTML = '<div class="skeleton-text skeleton" style="height:48px;border-radius:8px;"></div>';
    try {
      const tpls = await API.Contracts.templates({ doc_type: 'contract', company_id: COMPANY_ID }).catch(() => []);
      if (!tpls.length) {
        list.innerHTML = '<p style="color:var(--gray-400);font-size:13px;padding:8px 0;">Nessun template contratto. Clicca &quot;+ Nuovo template&quot; per iniziare.</p>';
        return;
      }
      list.innerHTML = tpls.map(t => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
          <div>
            <div style="font-weight:600;font-size:14px;">📄 ${t.name}</div>
            <div style="font-size:11px;color:var(--gray-500);">Creato: ${t.created_at ? new Date(t.created_at).toLocaleDateString('it-IT') : ''}${t.is_default ? ' · <span style="color:#059669;">✓ Default</span>' : ''}</div>
          </div>
          <div style="display:flex;gap:6px;">
            <button class="btn btn-ghost btn-sm" onclick="openCtForm('${t.id}')">Modifica</button>
            <button class="btn btn-ghost btn-sm" style="color:#ef4444;" onclick="deleteCtTemplate('${t.id}','${(t.name||'').replace(/'/g, '\\u0027')}')">Elimina</button>
          </div>
        </div>`).join('');
    } catch(e) { console.warn('[company-detail] templates:', e); }
  }

  window.openCtForm = async (id) => {
    _ctId = id || null;
    $('ct-company-modal-title').textContent = id ? 'Modifica template' : 'Nuovo template contratto';
    $('ct-co-name').value    = '';
    $('ct-co-content').value = '';
    if (id) {
      try {
        const full = await API.get('/contracts/templates/' + id).catch(() => null);
        if (full) {
          $('ct-co-name').value    = full.name    || '';
          $('ct-co-content').value = full.content || '';
        }
      } catch {}
    }
    const modal = $('ct-company-modal');
    if (modal) { modal.style.display = 'flex'; }
  };

  window.closeCtForm = () => {
    const modal = $('ct-company-modal');
    if (modal) modal.style.display = 'none';
    _ctId = null;
  };

  window.saveCtTemplate = async () => {
    const name    = $('ct-co-name')?.value?.trim();
    const content = $('ct-co-content')?.value || '';
    if (!name)    { UI.toast('Inserisci il nome del template', 'warning'); return; }
    if (!content) { UI.toast('Il testo del contratto è vuoto', 'warning'); return; }
    const btn = $('ct-co-save-btn'); if (btn) btn.disabled = true;
    try {
      if (_ctId) {
        await API.Contracts.updateTemplate(_ctId, { name, content });
        UI.toast('Template aggiornato', 'success');
      } else {
        await API.Contracts.createTemplate({ name, content, type: 'contract', company_id: COMPANY_ID });
        UI.toast('Template creato', 'success');
      }
      closeCtForm();
      loadCtTemplates();
    } catch(e) { UI.toast(e?.message || 'Errore salvataggio', 'error'); }
    finally { if (btn) btn.disabled = false; }
  };

  window.deleteCtTemplate = async (id, name) => {
    if (!confirm('Eliminare il template "' + name + '"?')) return;
    try {
      await API.Contracts.deleteTemplate(id);
      UI.toast('Template eliminato', 'success');
      loadCtTemplates();
    } catch(e) { UI.toast(e?.message || 'Errore', 'error'); }
  };

  window.ctInsertVar = (key) => {
    const ta = $('ct-co-content');
    if (!ta) return;
    const tag = '{{' + key + '}}';
    const s = ta.selectionStart, e2 = ta.selectionEnd;
    ta.value = ta.value.substring(0, s) + tag + ta.value.substring(e2);
    ta.selectionStart = ta.selectionEnd = s + tag.length;
    ta.focus();
  };

  // ── Email Templates ──────────────────────────────────────────

  let _etList = [];

  const ET_LABELS = {
    'quote': 'Preventivo CRM',
    'contract': 'Firma Contratto',
    'proforma': 'Emissione Fattura',
    'invite': 'Invito Piattaforma',
    'reset_pw': 'Reset Password'
  };

  async function loadEtTemplates() {
    const list = $('et-company-list'); if (!list) return;
    list.innerHTML = '<div class="skeleton-text skeleton" style="height:48px;border-radius:8px;"></div>';
    try {
      _etList = await API.get(`/companies/${COMPANY_ID}/email-templates`, true);
      if (!_etList || !_etList.length) {
        list.innerHTML = '<p style="color:var(--gray-400);font-size:13px;padding:8px 0;">Nessun template email configurato nel database.</p>';
        return;
      }
      list.innerHTML = _etList.map(t => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border);">
          <div>
            <div style="font-weight:600;font-size:14px;display:flex;align-items:center;gap:6px;">
              ✉️ ${ET_LABELS[t.type] || t.type} 
              <span style="font-size:10px;background:var(--gray-100);color:var(--gray-600);border-radius:4px;padding:2px 6px;text-transform:uppercase;">${t.lang}</span>
            </div>
            <div style="font-size:11px;color:var(--gray-500);margin-top:2px;">Oggetto: ${t.subject || ''}</div>
          </div>
          <div style="display:flex;gap:6px;">
            <button class="btn btn-ghost btn-sm" onclick="openEtForm('${t.type}', '${t.lang}')">🖍️ Modifica</button>
          </div>
        </div>`).join('');
    } catch(e) { UI.toast(e?.message || 'Errore di rete', 'error'); }
  }

  window.openEtForm = (type, lang) => {
    const t = _etList.find(x => x.type === type && x.lang === lang);
    if (!t) return;
    
    $('et-modal-title').textContent = 'Modifica ' + (ET_LABELS[type] || type);
    $('et-type').value = type;
    $('et-lang').value = lang;
    $('et-subject').value = t.subject || '';
    $('et-content-html').value = t.body_html || '';
    $('et-content-text').value = t.body_text || '';
    
    const modal = $('et-modal');
    if (modal) { modal.style.display = 'flex'; }
  };

  window.closeEtForm = () => {
    const modal = $('et-modal');
    if (modal) modal.style.display = 'none';
  };

  window.etInsertVar = (key) => {
    const ta = $('et-content-html');
    if (!ta) return;
    const tag = '{' + key + '}';
    const s = ta.selectionStart, e2 = ta.selectionEnd;
    ta.value = ta.value.substring(0, s) + tag + ta.value.substring(e2);
    ta.selectionStart = ta.selectionEnd = s + tag.length;
    ta.focus();
  };

  window.saveEtTemplate = async () => {
    const type    = $('et-type')?.value;
    const lang    = $('et-lang')?.value;
    const subject = $('et-subject')?.value?.trim();
    const html    = $('et-content-html')?.value || '';
    const text    = $('et-content-text')?.value || '';
    
    if (!subject) { UI.toast('Oggetto obbligatorio', 'warning'); return; }
    if (!html) { UI.toast('Corpo HTML obbligatorio', 'warning'); return; }
    
    const btn = $('et-save-btn'); if (btn) btn.disabled = true;
    try {
      await API.put(`/companies/${COMPANY_ID}/email-templates/${type}/${lang}`, {
        subject: subject,
        body_html: html,
        body_text: text
      });
      UI.toast('Template Email salvato con successo', 'success');
      closeEtForm();
      loadEtTemplates();
    } catch(e) { UI.toast(e?.message || 'Errore salvataggio Email Template', 'error'); }
    finally { if (btn) btn.disabled = false; }
  };

  // ── Eliminazione Azienda (Danger Zone) ────────────────────
  $('edit-btn-delete')?.addEventListener('click', () => {
    const modal = $('modal-delete-company');
    const nameEl = $('del-company-name');
    if (nameEl && _company) nameEl.textContent = _company.name;
    if (modal) modal.classList.add('open');
  });

  $('del-btn-cancel')?.addEventListener('click', () => {
    $('modal-delete-company')?.classList.remove('open');
  });

  $('del-btn-confirm')?.addEventListener('click', async () => {
    const btn = $('del-btn-confirm');
    if (btn) btn.disabled = true;
    try {
      await API.del(`/companies/${COMPANY_ID}`);
      UI.toast(`Azienda eliminata definitivamente`, 'success');
      setTimeout(() => location.href = 'admin_companies.html', 1500);
    } catch (e) {
      UI.toast(e?.message || "Errore durante l'eliminazione", 'error');
    } finally {
      if (btn) btn.disabled = false;
      $('modal-delete-company')?.classList.remove('open');
    }
  });

  // ── Init ──────────────────────────────────────────────────
  window.onPageReady(async () => {
    await I18n.init('lang-switcher-slot');
    $('btn-reload-detail')?.addEventListener('click', function() { if(window.UI) UI.toast('Aggiornamento in corso...', 'info'); load(true); });
    load();
  });
})();
