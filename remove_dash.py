import os
import glob

CRM_DIR = r'e:\App\crm'
html_files = glob.glob(os.path.join(CRM_DIR, '*.html'))
js_files = glob.glob(os.path.join(CRM_DIR, 'assets', 'js', '*.js'))

for filepath in html_files + js_files:
    # Read with explicit error handling to skip BOM or weird encodings safely
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except UnicodeDecodeError:
        # Fallback to python's default reading for UTF-16
        with open(filepath, 'r', encoding='utf-16') as f:
            content = f.read()

    if '—' in content:
        content = content.replace("'—'", "''")
        content = content.replace('"—"', '""')
        content = content.replace("`—`", "``")
        content = content.replace('— ', '')
        content = content.replace(' —', '')
        content = content.replace('—', '')
        
        # Write back in utf-8
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)

print(f"Eradicated all em-dash symbols.")
