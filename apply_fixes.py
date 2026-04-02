import sys
import re

# 1. Append .mac-switch to dash.css
css_path = r'e:\App\crm\assets\css\dash.css'
with open(css_path, 'r', encoding='utf-8') as f:
    dash_css = f.read()

switch_css = """
/* Mac Switch injected */
.mac-switch {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
  flex-shrink: 0;
}
.mac-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}
.mac-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #cbd5e1;
  transition: .2s;
  border-radius: 20px;
  box-shadow: inset 0 1px 2px rgba(0,0,0,0.1);
}
.mac-slider:before {
  position: absolute;
  content: "";
  height: 16px;
  width: 16px;
  left: 2px;
  bottom: 2px;
  background-color: white;
  transition: .2s;
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(0,0,0,0.3);
}
.mac-switch input:checked + .mac-slider {
  background-color: #10b981;
}
.mac-switch input:checked + .mac-slider:before {
  transform: translateX(16px);
}
.mac-switch input:disabled + .mac-slider {
  opacity: 0.5;
  cursor: not-allowed;
}
"""
if ".mac-switch" not in dash_css:
    dash_css += "\n" + switch_css
    with open(css_path, 'w', encoding='utf-8') as f:
        f.write(dash_css)

# 2. Fix admin_companies.js
comp_path = r'e:\App\crm\assets\js\admin_companies.js'
with open(comp_path, 'r', encoding='utf-8') as f:
    comp_js = f.read()

# Erase the trash can button
trash_btn = """<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); window.deleteCompany('${c.id}', \\`${(c.name||'').replace(/`/g, '\\\\\\`')}\\`)" title="Elimina" style="color:var(--color-danger); padding:4px;">
            <svg style="width:16px;height:16px;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"></path></svg>
          </button>"""
comp_js = comp_js.replace(trash_btn, "")
comp_js = comp_js.replace(trash_btn.replace('\\n', '\\r\\n'), "")
with open(comp_path, 'w', encoding='utf-8') as f:
    f.write(comp_js)

# 3. Fix admin_users.js
user_path = r'e:\App\crm\assets\js\admin_users.js'
with open(user_path, 'r', encoding='utf-8') as f:
    user_js = f.read()

old_pill = """          <span class="tag-pill" style="color:${st.dot}; border-color:${st.dot}50; background:${st.bg};">
            ${st.label}
          </span>"""

new_switch = """          <label class="mac-switch" title="Abilita/Disabilita Utente" onclick="event.stopPropagation()">
            <input type="checkbox" onchange="window.toggleUserActive('${u.id}', this.checked)" ${u.status === 'active' ? 'checked' : ''}>
            <span class="mac-slider"></span>
          </label>"""

user_js = user_js.replace(old_pill, new_switch)
user_js = user_js.replace(old_pill.replace('\\n', '\\r\\n'), new_switch)

if "window.toggleUserActive" not in user_js:
    func = """
  window.toggleUserActive = async (id, isActive) => {
    if (isActive) await window.reactivateUser(id);
    else await window.deactivateUser(id);
  };
"""
    user_js = user_js.replace("window.onPageReady", func + "\n  window.onPageReady")

with open(user_path, 'w', encoding='utf-8') as f:
    f.write(user_js)

print("Done updates")
