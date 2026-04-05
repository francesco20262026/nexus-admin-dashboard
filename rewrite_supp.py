import re

with open(r'e:\App\crm\admin_suppliers.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Update the tabs
tabs_replacement = """    <div id="inv-main-tabs" style="display:flex; gap:24px; position:relative; top:1px;">
      <a href="admin_invoices.html" class="main-tab" style="text-decoration:none; background:none; border:none; border-bottom:2px solid transparent; padding-bottom:12px; font-weight:600; font-size:14px; color:#6b7280; cursor:pointer; transition:all 0.2s;">In Uscita</a>
      <a href="admin_invoices.html#inbound" class="main-tab" style="text-decoration:none; background:none; border:none; border-bottom:2px solid transparent; padding-bottom:12px; font-weight:600; font-size:14px; color:#6b7280; cursor:pointer; transition:all 0.2s;">In Ingresso <span style="font-size:10px;color:var(--gray-400);font-weight:500;">(Acquisti)</span></a>
      <a href="admin_suppliers.html" class="main-tab active" style="text-decoration:none; background:none; border:none; border-bottom:2px solid #0a84ff; padding-bottom:12px; font-weight:600; font-size:14px; color:#111827; cursor:pointer; transition:all 0.2s;">Fornitori</a>
      <a href="admin_categories.html" class="main-tab" style="text-decoration:none; background:none; border:none; border-bottom:2px solid transparent; padding-bottom:12px; font-weight:600; font-size:14px; color:#6b7280; cursor:pointer; transition:all 0.2s;">Categorie</a>
      <a href="#" class="main-tab" style="text-decoration:none; background:none; border:none; border-bottom:2px solid transparent; padding-bottom:12px; font-weight:600; font-size:14px; color:#6b7280; cursor:pointer; transition:all 0.2s;">Report Analitico</a>
    </div>"""

html = re.sub(r'    <div id="inv-main-tabs".*?</div>', tabs_replacement, html, flags=re.DOTALL)

# Find everything from <div class="page-header-actions" down to <script src="assets/js/api.js?v=147"></script>
replacement = """  <div class="page-header-actions" id="page-actions" style="padding-top:10px;">
    <button class="btn btn-primary" onclick="window.location.href='admin_clients.html?create_supplier=true'">
      <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:16px;height:16px"><path d="M12 4.5v15m7.5-7.5h-15" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Nuovo Fornitore
    </button>
  </div>
</div>

<div class="cl-tab-filter-bar" id="supp-pipeline-bar" style="border-top:none; margin-top:20px;">
  <!-- Status pills -->
  <div class="cl-status-pills">
    <button class="cl-status-pill active" data-tab="all">
      Tutti <span class="badge" id="kpi-supp-all">0</span>
    </button>
    <button class="cl-status-pill" data-tab="prospect">
      Prospect <span class="badge" id="kpi-supp-prospect">0</span>
    </button>
    <button class="cl-status-pill" data-tab="active">
      Attivi <span class="badge" id="kpi-supp-active">0</span>
    </button>
  </div>
</div>

<div class="card" style="margin-top:0;">
  <!-- Mac-style Header Row (Modern Grid) -->
  <div class="mac-header-row" style="display: grid; grid-template-columns: 2fr 1fr 1fr 100px; align-items:center; gap:16px; padding: 12px 24px; border-bottom: 1px solid #e5e7eb; background: #f9fafb; font-weight: 600; color: #6b7280; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; border-top-left-radius: 12px; border-top-right-radius: 12px; user-select: none;">
    <div style="display:flex; align-items:center; gap:4px; font-weight:800; min-width:0; flex:1;">
      <span class="truncate">Fornitore</span>
    </div>
    <div style="display:flex; align-items:center; gap:4px; font-weight:800;">
      <span class="truncate">P.IVA</span>
    </div>
    <div style="display:flex; align-items:center; gap:4px; font-weight:800;">
      <span class="truncate">Email C.Fisc</span>
    </div>
    <div style="display:flex; align-items:center; justify-content:center;">
      <span class="truncate">Azioni</span>
    </div>
  </div>

  <div id="supp-list" style="display:flex;flex-direction:column; min-height: 200px;"></div>
</div>

</main>
</div>
<div class="toast-container" id="toast-container"></div>
<script src="assets/js/api.js?v=147"></script>"""

new_html = re.sub(r'  <div class="page-header-actions" id="page-actions" style="padding-top:10px;"></div>.*?<script src="assets/js/api.js\?v=147"></script>', replacement, html, flags=re.DOTALL)

# replace admin_invoices.js link
new_html = new_html.replace('<script src="assets/js/admin_invoices.js?v=147"></script>', '<script src="assets/js/admin_suppliers.js"></script>')

with open(r'e:\App\crm\admin_suppliers.html', 'w', encoding='utf-8') as f:
    f.write(new_html)
