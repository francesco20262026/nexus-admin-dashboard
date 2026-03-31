import os
import glob
import re

CRM_DIR = r'e:\App\crm'
html_files = glob.glob(os.path.join(CRM_DIR, '*.html'))

for filepath in html_files:
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

    # Remove all select dropdowns with cl-filter-select
    # <select class="form-input cl-filter-select" ...> ... </select>
    content = re.sub(r'<select[^>]*class="[^"]*cl-filter-select[^"]*"[^>]*>[\s\S]*?</select>', '', content)
    
    # Remove all input date filters with cl-filter-select
    # <input class="form-input cl-filter-select" ... type="date" ... />
    # Also handle the <span>→</span> that is typically between date inputs
    # Wait, the structure is:
    # <div style="display:flex;align-items:center;gap:4px;">
    #   <input class="form-input cl-filter-select" id="ctr-date-from" style="max-width:130px;" title="Da" type="date"/>
    #   <span style="color:#9ca3af;font-size:10px;font-weight:700;">→</span>
    #   <input class="form-input cl-filter-select" id="ctr-date-to" style="max-width:130px;" title="A" type="date"/>
    # </div>
    
    # We can just remove the specific flex div container if it holds date filters.
    # Searching for a div that contains a date input with cl-filter-select
    content = re.sub(r'<div[^>]*>\s*<input[^>]*cl-filter-select[^>]*type="date"[^>]*>[\s\S]*?</div>', '', content)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

print(f"Purged all dropdown and date filters from HTML structural components.")
