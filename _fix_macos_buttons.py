import re
import os

css_path = r'e:\App\crm\assets\css\dash.css'

with open(css_path, 'r', encoding='utf-8') as f:
    content = f.read()

macos_css = """
/* ============================================================
   APPLE macOS SYSTEM SETTINGS - EXACT CLONE OVERRIDES
   ============================================================ */

/* 1. SIDEBAR ACTIVE ITEM (Solid Blue from macOS screenshot) */
.nav-item.active {
  background: #007aff !important; /* Mac Blue */
  color: #ffffff !important;
  box-shadow: none !important;
  font-weight: 500 !important;
}
.nav-item.active .nav-label {
  color: #ffffff !important;
}

/* 2. BUTTONS (Standard Mac Gray Buttons: "Modifica...", "Aggiungi...") */
.btn-secondary, 
.btn-ghost, 
.filter-bar-btn, 
.quick-action-btn,
.gsearch-footer kbd {
  background: #e5e5ea !important;
  color: #000000 !important;
  border: none !important;
  box-shadow: 0 1px 1px rgba(0,0,0,0.02) !important;
  border-radius: 7px !important;
  font-weight: 500 !important;
}
.btn-secondary:hover, .btn-ghost:hover, .filter-bar-btn:hover, .quick-action-btn:hover {
  background: #d1d1d6 !important;
}

/* Primary Button (macOS Default Action Blue) */
.btn-primary {
  background: #007aff !important;
  color: #ffffff !important;
  border: none !important;
  border-radius: 7px !important;
  font-weight: 500 !important;
  box-shadow: 0 1px 2px rgba(0,0,0,0.1) !important;
}
.btn-primary:hover {
  background: #0069d9 !important;
}

/* 3. SELECTS & FILTERS (Like macOS Dropdowns) */
select.form-input, 
.cl-filter-select, 
select.filter-select {
  background: #e5e5ea !important;
  color: #000000 !important;
  border: none !important;
  border-radius: 7px !important;
  box-shadow: 0 1px 1px rgba(0,0,0,0.02) !important;
  font-weight: 500 !important;
  appearance: none !important;
  -webkit-appearance: none !important;
  /* Double chevron standard icon encoded for macOS feeling */
  background-image: url("data:image/svg+xml;charset=US-ASCII,%3Csvg width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%234b4b4b' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M8 9l4-4 4 4M16 15l-4 4-4-4'/%3E%3C/svg%3E") !important;
  background-repeat: no-repeat !important;
  background-position: right 8px center !important;
  background-size: 14px 14px !important;
  padding-right: 28px !important;
}

/* Input Cerca in Mac style */
.filter-bar-search input,
.cl-filter-search-input,
.header-search input {
  color: #000 !important;
}
.filter-bar-search, .header-search, .cl-filter-search-wrap input.cl-filter-search-input {
  background: #e5e5ea !important;
  border-radius: 7px !important;
  border: none !important;
  box-shadow: inset 0 1px 2px rgba(0,0,0,0.04) !important;
}

/* 4. BACKGROUND E CARD */
body {
  background: #f2f2f7 !important; /* macOS Grouped Background */
}
.card, .stat-card, .table-container, .z-card {
  background: #ffffff !important;
  border-radius: 12px !important;
  border: none !important;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.03) !important;
}
"""

with open(css_path, 'a', encoding='utf-8') as f:
    f.write(macos_css)

html_dir = r'e:\App\crm'
for file in os.listdir(html_dir):
    if file.endswith('.html'):
        filepath = os.path.join(html_dir, file)
        with open(filepath, 'r', encoding='utf-8') as f:
            html_content = f.read()
        
        # Bumping cache v=99 -> v=100
        new_content = re.sub(r'dash\.css\?v=\d+', 'dash.css?v=100', html_content)
        if html_content != new_content:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)

print("Stile MacOS Settings iniettato. Cache HTML v=100.")
