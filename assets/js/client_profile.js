/* ============================================================
   client_profile.js — Client profile page logic
   ============================================================ */
'use strict';
(function () {
  Auth.guard('client');
  Auth.initUI();

  /* ── DOM refs ──────────────────────────────────────────────── */
  const els = {
    form:    document.getElementById('profile-form'),
    alert:   document.getElementById('billing-alert'),
    error:   document.getElementById('profile-error'),
    content: document.getElementById('profile-content'),
    saveBtn: document.getElementById('save-btn'),
    // Header display
    fn:      document.getElementById('profile-fullname'),
    es:      document.getElementById('profile-email-sub'),
    av:      document.getElementById('profile-avatar-lg'),
    // Inputs
    email:   document.getElementById('p-email'),
    company: document.getElementById('p-company'),
    vat:     document.getElementById('p-vat'),
    tax:     document.getElementById('p-tax'),
    phone:   document.getElementById('p-phone'),
    address: document.getElementById('p-address'),
    city:    document.getElementById('p-city'),
    zip:     document.getElementById('p-zip'),
    pec:     document.getElementById('p-pec'),
    sdi:     document.getElementById('p-sdi'),
    lang:    document.getElementById('p-lang'),
  };

  // Log any missing optional nodes for debugging
  Object.entries(els).forEach(([key, el]) => {
    if (!el) console.warn(`[client_profile] DOM node missing: #${key}`);
  });

  /* ── Helpers ─────────────────────────────────────────────────── */
  const setVal = (el, val) => { if (el) el.value = val ?? ''; };
  const setText = (el, val) => { if (el) el.textContent = val || ''; };

  function showContent() {
    if (els.content) els.content.style.display = 'block';
    if (els.error)   els.error.style.display   = 'none';
  }

  function showError() {
    if (els.content) els.content.style.display = 'none';
    if (els.error)   els.error.style.display   = 'block';
  }

  /* ── Load profile ────────────────────────────────────────────── */
  async function load() {
    // Keep content hidden until data arrives — show loading state
    if (els.content) els.content.style.display = 'none';

    try {
      const p = await API.Auth.me();
      if (!p) throw new Error('Profilo non disponibile');

      // Inputs
      setVal(els.email,   p.email);
      setVal(els.company, p.name || p.company || p.email);
      setVal(els.vat,     p.vat_number);
      setVal(els.tax,     p.tax_code);
      setVal(els.phone,   p.phone);
      setVal(els.address, p.address);
      setVal(els.city,    p.city);
      setVal(els.zip,     p.zip);
      setVal(els.pec,     p.pec);
      setVal(els.sdi,     p.sdi);
      setVal(els.lang,    p.language || 'it');

      // Header block
      const displayName = els.company?.value || p.email || '';
      setText(els.fn, displayName);
      setText(els.es, p.email || '');
      setText(els.av, (displayName || '?').slice(0, 2).toUpperCase());

      showContent();
      checkBillingData();
    } catch (e) {
      console.error('[client_profile] load error:', e);
      showError();
    }
  }

  /* ── Billing completeness alert ─────────────────────────────── */
  function checkBillingData() {
    if (!els.alert) return;
    const hasVat = !!(els.vat?.value.trim());
    const hasTax = !!(els.tax?.value.trim());
    const hasSdi = !!(els.sdi?.value.trim());
    const hasPec = !!(els.pec?.value.trim());
    const incomplete = !(hasVat || hasTax) || !(hasSdi || hasPec);
    els.alert.style.display = incomplete ? 'flex' : 'none';
  }

  /* ── Save / update ───────────────────────────────────────────── */
  els.form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (els.form.checkValidity && !els.form.checkValidity()) {
      els.form.reportValidity?.();
      return;
    }

    const payload = {
      name:       els.company?.value?.trim() || undefined,
      vat_number: els.vat?.value?.trim()     || undefined,
      tax_code:   els.tax?.value?.trim()     || undefined,
      phone:      els.phone?.value?.trim()   || undefined,
      address:    els.address?.value?.trim() || undefined,
      city:       els.city?.value?.trim()    || undefined,
      zip:        els.zip?.value?.trim()     || undefined,
      pec:        els.pec?.value?.trim()     || undefined,
      sdi:        els.sdi?.value?.trim()     || undefined,
      language:   els.lang?.value            || undefined,
    };

    // Strip undefined keys before sending
    Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

    if (els.saveBtn) { els.saveBtn.disabled = true; els.saveBtn.textContent = 'Salvataggio...'; }

    try {
      await API.put('/clients/me', payload);

      // Update header after successful save
      const displayName = els.company?.value || els.email?.value || '';
      setText(els.fn, displayName);
      setText(els.av, (displayName || '?').slice(0, 2).toUpperCase());
      checkBillingData();

      const isIncomplete = els.alert?.style.display !== 'none';
      window.showToast?.(
        isIncomplete ? 'Profilo salvato, ma mancano i dati di fatturazione.' : 'Profilo salvato con successo',
        isIncomplete ? 'warning' : 'success'
      );

      // Sync preferred language if changed
      const newLang = els.lang?.value;
      if (newLang) {
        API.Auth.updateLang(newLang).catch(err => console.warn('[client_profile] updateLang error:', err));
      }
    } catch (err) {
      console.error('[client_profile] save error:', err);
      window.showToast?.(err?.message || 'Errore durante il salvataggio del profilo', 'error');
    } finally {
      if (els.saveBtn) { els.saveBtn.disabled = false; els.saveBtn.textContent = 'Salva Modifiche'; }
    }
  });

  /* ── Live billing alert update on input ─────────────────────── */
  [els.vat, els.tax, els.pec, els.sdi].forEach(el => {
    el?.addEventListener('input', checkBillingData);
  });

  /* ── Init ──────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', async () => {
    await I18n.init('lang-switcher-slot');
    load();
  });

})();