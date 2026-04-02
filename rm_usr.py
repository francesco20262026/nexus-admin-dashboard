import sys
import re

# 1. Update admin_users.html
html_path = r'e:\App\crm\admin_users.html'
with open(html_path, 'r', encoding='utf-8') as f:
    html = f.read()

select_all_header = """      <div class="cl-col-header" style="flex:0 0 40px; padding-left:24px;">
        <div class="mac-select-btn" id="mass-select-all" onclick="window.toggleSelectAll(this)" title="Seleziona tutti in pagina">
          <div class="mac-checkbox"></div>
        </div>
      </div>"""
html = html.replace(select_all_header, "")
html = html.replace(select_all_header.replace('\n', '\r\n'), "")

# remove mac-mass-action-bar completely
pattern = re.compile(r'<!-- Mass Action Bar \(Mac Style\) -->.*?</div>\s*</div>\s*</div>', re.DOTALL)
html = pattern.sub('', html)

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(html)

# 2. Update admin_users.js
js_path = r'e:\App\crm\assets\js\admin_users.js'
with open(js_path, 'r', encoding='utf-8') as f:
    js = f.read()

row_checkbox = """            <div class="mac-select-btn ${isSelected ? 'selected' : ''}" data-id="${u.id}" onclick="window.toggleSelection(event, '${u.id}')" style="flex-shrink:0;">
              <div class="mac-checkbox"></div>
            </div>"""
js = js.replace(row_checkbox, "")
js = js.replace(row_checkbox.replace('\n', '\r\n'), "")

js = js.replace(' ${isSelected ? \'selected\' : \'\'}', '')

pattern2 = re.compile(r'/\* -- Selection & Mass Actions \(Mac Style\) ------------------- \*/.*?const AVT_COLORS =', re.DOTALL)
js = pattern2.sub('const AVT_COLORS =', js)

js = js.replace('const isSelected = window.selectedIds.has(u.id);', '')
js = js.replace('setTimeout(() => { if(window.updateSelectionUI) window.updateSelectionUI(); }, 10);', '')
js = js.replace('window.clearSelection && window.clearSelection();', '')

with open(js_path, 'w', encoding='utf-8') as f:
    f.write(js)

print("users mass action removed")
