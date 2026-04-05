import re

with open(r'e:\App\crm\admin_categories.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Find everything from <div class="page-header-actions" down to <script src="assets/js/api.js?v=147"></script>
replacement = """  <div class="page-header-actions" id="page-actions" style="padding-top:10px;">
    <button class="btn btn-primary" onclick="window.openCategoryModal()">
      <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:16px;height:16px"><path d="M12 4.5v15m7.5-7.5h-15" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Nuova Categoria
    </button>
  </div>
</div>

<div class="card" style="margin-top:20px;">
  <!-- Mac-style Header Row (Modern Grid) -->
  <div class="mac-header-row" style="display: grid; grid-template-columns: 2fr 1fr 100px; align-items:center; gap:16px; padding: 12px 24px; border-bottom: 1px solid #e5e7eb; background: #f9fafb; font-weight: 600; color: #6b7280; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; border-top-left-radius: 12px; border-top-right-radius: 12px; user-select: none;">
    <div style="display:flex; align-items:center; gap:4px; font-weight:800; min-width:0; flex:1;">
      <span class="truncate">Nome Categoria</span>
    </div>
    <div style="display:flex; align-items:center; gap:4px; font-weight:800;">
      <span class="truncate">Colore Etichetta</span>
    </div>
    <div style="display:flex; align-items:center; justify-content:center;">
      <span class="truncate">Azioni</span>
    </div>
  </div>

  <div id="cat-list" style="display:flex;flex-direction:column; min-height: 200px;"></div>
</div>

<!-- Modal Nuova Categoria -->
<div class="modal-overlay" id="modal-category" onclick="if(event.target===this) this.classList.remove('open')">
  <div class="modal onb-form-modal" style="max-width:500px;width:95vw;">
    <div class="modal-header" style="padding:20px 24px 16px;">
      <div style="display:flex;align-items:flex-start;gap:12px;">
        <div style="width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:#dbeafe;color:#2563eb;">
          <svg fill="none" stroke="currentColor" stroke-width="2" style="width:24px;height:24px" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M5.25 14.25h13.5m-13.5 0a3 3 0 0 1-3-3m3 3a3 3 0 1 0 0 6h13.5a3 3 0 1 0 0-6m-16.5-3a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3m-19.5 0a4.5 4.5 0 0 1 .9-2.7L5.737 5.1a3.375 3.375 0 0 1 2.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 0 1 .9 2.7m0 0a3 3 0 0 1-3 3m0 3h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Zm-3-6h.008v.008h-.008v-.008Zm-6 0h.008v.008h-.008v-.008Z" stroke-linecap="round" stroke-linejoin="round"></path></svg>
        </div>
        <div>
          <div class="modal-title" style="font-size:20px;font-weight:800;color:#111827;margin-bottom:2px;">Nuova Categoria</div>
          <div style="font-size:12px;color:#6b7280;">Personalizza l'etichetta e il colore allocato per le tue spese.</div>
        </div>
      </div>
      <button class="icon-btn" onclick="document.getElementById('modal-category').classList.remove('open')">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 18 18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"></path></svg>
      </button>
    </div>
    
    <div class="modal-body" style="padding:20px 24px;">
      <div class="form-group">
        <label class="form-label">Nome Categoria *</label>
        <input class="form-input" id="cat-name" type="text" placeholder="Es. Utenze, Materiale, ecc." />
      </div>
      <div class="form-group" style="margin-top:16px;">
        <label class="form-label">Colore *</label>
        <input class="form-input" id="cat-color" type="color" value="#6B7280" style="padding:4px; height:42px; cursor:pointer;" />
      </div>
    </div>
    <div class="modal-footer" style="padding:16px 24px;display:flex;justify-content:flex-end;gap:12px;border-top:1px solid #e5e7eb;background-color:#f9fafb;border-bottom-left-radius:12px;border-bottom-right-radius:12px;">
      <button class="btn btn-ghost" onclick="document.getElementById('modal-category').classList.remove('open')">Annulla</button>
      <button class="btn btn-primary" onclick="window.saveCategory()">Salva Categoria</button>
    </div>
  </div>
</div>

</main>
</div>
<div class="toast-container" id="toast-container"></div>
<script src="assets/js/api.js?v=147"></script>"""

new_html = re.sub(r'  <div class="page-header-actions" id="page-actions" style="padding-top:10px;"></div>.*?<script src="assets/js/api.js\?v=147"></script>', replacement, html, flags=re.DOTALL)

# replace admin_invoices.js link
new_html = new_html.replace('<script src="assets/js/admin_invoices.js?v=147"></script>', '<script src="assets/js/admin_categories.js"></script>')

with open(r'e:\App\crm\admin_categories.html', 'w', encoding='utf-8') as f:
    f.write(new_html)
