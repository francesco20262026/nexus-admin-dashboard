import sys

# 1. admin_users.js
path = r'e:\App\crm\assets\js\admin_users.js'
with open(path, 'r', encoding='utf-8') as f:
    js = f.read()

checkbox_js = """            <div class="mac-select-btn ${isSelected ? 'selected' : ''}" data-id="${u.id}" onclick="window.toggleSelection(event, '${u.id}')" style="flex-shrink:0;">
              <div class="mac-checkbox"></div>
            </div>"""

if 'class="cl-row-identity"' in js:
    js = js.replace('<div class="cl-row-identity">', f'<div class="cl-row-identity">\n{checkbox_js}')

# Restore logic variables
selection_logic = """
/* -- Selection & Mass Actions (Mac Style) ------------------- */
window.selectedIds = new Set();
window.toggleSelection = function(e, id) {
  e.stopPropagation();
  const btn = e.currentTarget;
  if(window.selectedIds.has(id)) { window.selectedIds.delete(id); btn.classList.remove('selected'); }
  else { window.selectedIds.add(id); btn.classList.add('selected'); }
  window.updateSelectionUI && window.updateSelectionUI();
};
window.toggleSelectAll = function(btn) {
  const isSelected = btn.classList.contains('selected');
  if(isSelected) { window.selectedIds.clear(); btn.classList.remove('selected'); document.querySelectorAll('.cl-list .mac-select-btn').forEach(b => b.classList.remove('selected')); }
  else { filtered.slice((pg-1)*PER, pg*PER).forEach(item => window.selectedIds.add(item.id)); btn.classList.add('selected'); document.querySelectorAll('.cl-list .mac-select-btn').forEach(b => b.classList.add('selected')); }
  window.updateSelectionUI && window.updateSelectionUI();
};
"""
if 'const AVT_COLORS =' in js and 'window.selectedIds' not in js:
    js = js.replace('const AVT_COLORS =', selection_logic + '\nconst AVT_COLORS =')

if 'const isMe = ' in js and 'const isSelected =' not in js:
    js = js.replace('const isMe =', 'const isSelected = window.selectedIds.has(u.id);\n      const isMe =')

if 'return `' in js and '<div class="cl-row fade-in "' in js:
    js = js.replace('<div class="cl-row fade-in "', '<div class="cl-row fade-in ${isSelected ? \'selected\' : \'\'}"')

with open(path, 'w', encoding='utf-8') as f:
    f.write(js)

# 2. admin_companies.js
path_c = r'e:\App\crm\assets\js\admin_companies.js'
with open(path_c, 'r', encoding='utf-8') as f:
    jsc = f.read()

checkbox_c = """            <div class="mac-select-btn ${isSelected ? 'selected' : ''}" data-id="${c.id}" onclick="window.toggleSelection(event, '${c.id}')" style="flex-shrink:0;">
              <div class="mac-checkbox"></div>
            </div>"""

if 'class="cl-row-identity"' in jsc:
    jsc = jsc.replace('<div class="cl-row-identity">', f'<div class="cl-row-identity">\n{checkbox_c}')

if 'const AVT_COLORS =' in jsc and 'window.selectedIds' not in jsc:
    jsc = jsc.replace('const AVT_COLORS =', selection_logic + '\nconst AVT_COLORS =')

if 'const numCtr = ' in jsc and 'const isSelected =' not in jsc:
    jsc = jsc.replace('const numCtr =', 'const isSelected = window.selectedIds.has(c.id);\n      const numCtr =')

if 'return `' in jsc and '<div class="cl-row fade-in "' in jsc:
    jsc = jsc.replace('<div class="cl-row fade-in "', '<div class="cl-row fade-in ${isSelected ? \'selected\' : \'\'}"')

with open(path_c, 'w', encoding='utf-8') as f:
    f.write(jsc)

# HTML Restore for headers
html_paths = [r'e:\App\crm\admin_users.html', r'e:\App\crm\admin_companies.html']
for hp in html_paths:
    with open(hp, 'r', encoding='utf-8') as f:
        html = f.read()
    
    inject_hdr = """      <div class="cl-col-identity" style="display:flex;align-items:center;gap:12px;">
        <div class="mac-select-btn" id="mass-select-all" onclick="window.toggleSelectAll(this)" style="flex-shrink:0;">
          <div class="mac-checkbox"></div>
        </div>"""
    
    if '<div class="cl-col-identity">' in html and 'mass-select-all' not in html:
        html = html.replace('<div class="cl-col-identity">', inject_hdr)
    
    with open(hp, 'w', encoding='utf-8') as f:
        f.write(html)

print("done restoring selects")
