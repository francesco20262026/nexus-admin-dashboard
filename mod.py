import re

html_file = r'e:\App\crm\admin_onboarding_detail.html'
js_file = r'e:\App\crm\assets\js\admin_onboarding_detail.js'

## 1. Modify HTML
try:
    with open(html_file, 'r', encoding='utf-8') as f:
        html = f.read()

    html = html.replace('<title>Nova CRM — Dettaglio Cliente</title>', '<title>Nova CRM — Dettaglio Pratica Onboarding</title>')
    html = html.replace('class="nav-item active" href="admin_clients.html', 'class="nav-item" href="admin_clients.html')
    html = html.replace('class="nav-item" href="admin_onboarding.html', 'class="nav-item active" href="admin_onboarding.html')
    html = html.replace('Scheda Cliente', 'Scheda Pratica')
    html = html.replace('Dettaglio Cliente', 'Dettaglio Pratica')
    html = html.replace('Tutti i Clienti', 'Tutte le Pratiche')
    html = html.replace('Elimina Cliente', 'Elimina Pratica')
    html = html.replace('deleteClientFromDetail', 'deleteOnboardingFromDetail')
    html = html.replace('assets/js/admin_client_detail.js', 'assets/js/admin_onboarding_detail.js')

    insert_point = '<div id="view-panoramica" class="active">'
    replacement = insert_point + '\n            <div id="onb-pipeline-req-container"></div>\n'
    if '<div id="onb-pipeline-req-container">' not in html:
        html = html.replace(insert_point, replacement)

    with open(html_file, 'w', encoding='utf-8') as f:
        f.write(html)
    print("HTML updated.")
except Exception as e:
    print(f"Error HTML: {e}")

## 2. Modify JS
try:
    with open(js_file, 'r', encoding='utf-8') as f:
        js = f.read()

    js = js.replace('clientId', 'onboardingId')
    js = js.replace('CLIENT', 'ONBOARDING')
    js = js.replace('client_id', 'onboarding_id')
    js = js.replace('client_detail.js', 'onboarding_detail.js')
    js = js.replace('admin_clients.html', 'admin_onboarding.html')

    js = js.replace('API.Clients.get', 'API.Onboarding.get')
    js = js.replace('API.Clients.update', 'API.Onboarding.update')
    js = js.replace('API.Clients.remove', 'API.Onboarding.remove')

    js = js.replace('API.Clients.contacts?.(onboardingId)', 'async () => []')
    js = js.replace('API.Clients.services(onboardingId)', 'async () => []')
    js = js.replace('API.Clients.quotes(onboardingId)', 'API.Quotes?.list({onboarding_id: onboardingId})')
    js = js.replace('API.Clients.invoices(onboardingId)', 'API.Invoices?.list({onboarding_id: onboardingId})')
    js = js.replace('API.Clients.contracts(onboardingId)', 'API.Contracts?.list({onboarding_id: onboardingId})')
    js = js.replace('API.Clients.documents(onboardingId)', 'async () => []')
    js = js.replace('API.Clients.renewals', 'null')

    js = js.replace('/clients/', '/onboarding/')

    js = js.replace('c.name', 'c.lead_name')
    js = js.replace('anag-name', 'anag-lead-name')
    js = js.replace('name,', 'lead_name: name,')
    js = js.replace('deleteClientFromDetail', 'deleteOnboardingFromDetail')
    js = js.replace('Cliente dal', 'Pratica dal')

    pipeline_code = """
  function renderPipeline() {
    const r = ONBOARDING;
    if (!r) return;
    const container = document.getElementById('onb-pipeline-req-container');
    if (!container) return;
    
    const STATES = ['new','quote_draft','quote_sent','quote_accepted','contract_draft','contract_sent','contract_signed','proforma_draft','proforma_issued','payment_under_review'];
    const SLBL   = { new:'Nuova', quote_draft:'Prev. Bozza', quote_sent:'Prev. Inviato', quote_accepted:'Prev. Acc.', contract_draft:'Contr. Bozza', contract_sent:'Contr. Inv.', contract_signed:'Contr. Firmato', proforma_draft:'Proforma Bozza', proforma_issued:'Proforma Emessa', payment_under_review:'Fatturazione' };

    let idx = STATES.indexOf(r.status);
    if (idx < 0) { if (r.status === 'waiting_payment') idx = STATES.indexOf('proforma_issued'); else idx = 0; }
    const progressPct = idx * (100 / (STATES.length - 1));

    const pFields = [
      { label: 'Ragione Sociale', val: r.company_name || r.lead_name },
      { label: 'Partita IVA',     val: r.vat_number },
      { label: 'Email',           val: r.email || r._client_email },
      { label: 'SDI / PEC',       val: r.dest_code || r.codice_destinatario || r.pec },
      { label: 'Indirizzo',       val: r.address || r.indirizzo },
      { label: 'Città',           val: r.city || r.citta },
    ];

    const pipelineHtml = r.status === 'cancelled'
      ? `<div style="display:flex;align-items:center;gap:10px;padding:16px;background:#fff5f5;border:1px solid #fecaca;border-radius:10px;color:#dc2626;font-weight:600;font-size:14px;">
           <svg style="width:18px;height:18px;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
           Pratica annullata
         </div>`
      : `<div class="mac-pipeline-wrap">
           <div class="mac-pipeline-track">
             <div class="mac-pipeline-track-bg"></div>
             <div class="mac-pipeline-progress" style="width:${progressPct}%;"></div>
             ${STATES.map((s,i) => {
               const cls = i < idx ? 'done' : i === idx ? 'active' : '';
               return \`<div class="mac-pipeline-step ${cls}">
                 <div class="mac-pipeline-dot"></div>
                 <div class="mac-pipeline-label">${SLBL[s] || s}</div>
               </div>\`;
             }).join('')}
           </div>
         </div>`;

    const reqHtml = `
      <div class="mac-req-wrap" style="margin-top:16px;">
        <div class="mac-req-header" style="display:flex;align-items:center;gap:8px;font-weight:600;font-size:13px;padding:12px 14px;border-bottom:1px solid #f1f5f9;">
          <svg style="width:18px;height:18px;color:#6b7280;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z"/></svg>
          Requisiti Anagrafica per Conversione Proforma
        </div>
        <div class="mac-req-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:6px;padding:12px 14px;">
          ${pFields.map(f => {
            if (f.val) return \`<div class="mac-req-item ok" style="font-size:12px;display:flex;align-items:center;gap:6px;color:#059669;"><svg style="width:14px;height:14px;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg> ${f.label}</div>\`;
            return \`<div class="mac-req-item err" style="font-size:12px;display:flex;align-items:center;gap:6px;color:#dc2626;"><svg style="width:14px;height:14px;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg> Manca ${f.label}</div>\`;
          }).join('')}
        </div>
      </div>
    `;

    container.innerHTML = \`<div class="mac-section" style="padding-top:0;padding-bottom:16px;">
      <div style="margin-bottom:16px;font-size:13.5px;font-weight:600;letter-spacing:-0.2px;">Flusso di Lavoro</div>
      ${pipelineHtml}
      ${reqHtml}
    </div><div class="mac-divider" style="margin:0 0 32px;"></div>\`;
  }
"""

    if 'renderPipeline' not in js:
        js = js.replace('function renderHeader() {', pipeline_code + '\n  function renderHeader() {')
    if 'renderPipeline()' not in js:
        js = js.replace('renderAnagrafica();', 'renderAnagrafica();\n      renderPipeline();\n')

    status_labels_onb = """  const STATUS_LABELS = {
    new:                  { label: 'Nuova',           color: '#0284c7', bg: '#e0f2fe' },
    quote_draft:          { label: 'Prev. Bozza',     color: '#ca8a04', bg: '#fef3c7' },
    quote_sent:           { label: 'Prev. Inviato',   color: '#2563eb', bg: '#dbeafe' },
    quote_accepted:       { label: 'Prev. Accettato', color: '#16a34a', bg: '#dcfce7' },
    contract_draft:       { label: 'Contr. Bozza',    color: '#ca8a04', bg: '#fef3c7' },
    contract_sent:        { label: 'Contr. Inviato',  color: '#2563eb', bg: '#dbeafe' },
    contract_signed:      { label: 'Contr. Firmato',  color: '#16a34a', bg: '#dcfce7' },
    proforma_draft:       { label: 'Prof. Bozza',     color: '#ca8a04', bg: '#fef3c7' },
    proforma_issued:      { label: 'Prof. Emessa',    color: '#2563eb', bg: '#dbeafe' },
    payment_under_review: { label: 'Pagam. in rev.',  color: '#9333ea', bg: '#f3e8ff' },
    cancelled:            { label: 'Annullata',       color: '#dc2626', bg: '#fee2e2' },
    blocked:              { label: 'Bloccata',        color: '#dc2626', bg: '#fee2e2' },
  };"""

    js = re.sub(
        r'const STATUS_LABELS = \{.*?\};',
        status_labels_onb,
        js,
        flags=re.DOTALL
    )

    with open(js_file, 'w', encoding='utf-8') as f:
        f.write(js)
    print("JS updated.")
except Exception as e:
    print(f"Error JS: {e}")
