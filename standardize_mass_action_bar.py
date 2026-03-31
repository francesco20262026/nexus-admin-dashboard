import os
import glob
import re

CRM_DIR = r'e:\App\crm'

close_btn_html = """
    <button class="mac-mass-action-close" onclick="window.clearSelection()" title="Annulla selezione">
      <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"></path></svg>
    </button>
"""

# Regex to safely find the buttons container and insert the close button after it
# <div class="mac-mass-action-buttons"> ... </div>
# We want to add the close btn immediately after this </div>
r_buttons = re.compile(r'(<div class="mac-mass-action-buttons">[\s\S]*?</div>)(\s*</div>\s*</div>)', re.IGNORECASE)

for html_file in glob.glob(os.path.join(CRM_DIR, '*.html')):
    with open(html_file, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

    changed = False

    # 1. Standardize admin_onboarding classes to match dash.css
    if 'mac-close-btn' in content or 'mac-action-btn' in content:
        content = content.replace('mac-selected-count', 'mac-mass-action-selected')
        content = content.replace('mac-actions', 'mac-mass-action-buttons')
        content = content.replace('mac-action-btn', 'mac-mass-action-btn')
        content = content.replace('mac-close-btn', 'mac-mass-action-close')
        
        # Also fix the count container to have the inner span like other pages
        # <div class="mac-mass-action-selected" id="mac-selected-count">0 selezionati</div> -> <div class="mac-mass-action-selected"><span id="mac-mass-action-count">0</span> selezionati</div>
        content = re.sub(
            r'<div class="mac-mass-action-selected"\s+id="mac-selected-count">\s*0 selezionati\s*</div>',
            r'<div class="mac-mass-action-selected"><span id="mac-mass-action-count">0</span> selezionati</div>',
            content
        )
        
        # Remove Onboarding's inline mass action bar styles to let global dash.css take over
        content = re.sub(r'/\* Mass Actions Bottom Bar \*/[\s\S]*?\.mac-close-btn:hover\s*\{[^}]*\}', '', content)
        content = content.replace('.mac-mass-action-bar {', '') # fallback wipe
        
        changed = True

    # 2. Add the X button if missing
    if 'mac-mass-action-bar' in content and 'mac-mass-action-close' not in content:
        # Before we regex, check if it has mac-mass-action-buttons
        if 'mac-mass-action-buttons' in content:
            new_content = r_buttons.sub(r'\1' + "\n" + close_btn_html + r'\2', content)
            if new_content != content:
                content = new_content
                changed = True
        
    if changed:
        with open(html_file, 'w', encoding='utf-8') as f:
            f.write(content)
            
print("Mass action bar standardized across all HTML modules.")
