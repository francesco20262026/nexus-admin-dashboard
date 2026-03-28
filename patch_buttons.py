import os
import glob
import re

for fpath in glob.glob('assets/js/admin_*.js'):
    with open(fpath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Pattern 1: $('btn-refresh')?.addEventListener('click', load);
    content = re.sub(r'(\$\(\'[a-zA-Z0-9_-]+\'\)\?\.addEventListener\(\'click\', ?)load\);', r"\g<1>function() { if(window.UI) UI.toast('Aggiornamento in corso...', 'info'); load(true); });", content)
    
    # Pattern 2: btnRefresh?.addEventListener('click', load);
    content = re.sub(r'(btnRefresh[a-zA-Z0-9_]*\?\.addEventListener\(\'click\', ?)load\);', r"\g<1>function() { if(window.UI) UI.toast('Aggiornamento in corso...', 'info'); load(true); });", content)

    # Pattern 3: btnRefresh?.addEventListener('click', () => load(true));
    content = re.sub(r"(btnRefresh[a-zA-Z0-9_]*\?\.addEventListener\('click', \(\)) => load\(true\)\);", r"\g<1> => { if(window.UI) UI.toast('Aggiornamento in corso...', 'info'); load(true); });", content)

    # Pattern 4 (without ?): $('btn-refresh').addEventListener('click', load);
    content = re.sub(r'(\$\(\'[a-zA-Z0-9_-]+\'\)\.addEventListener\(\'click\', ?)load\);', r"\g<1>function() { if(window.UI) UI.toast('Aggiornamento in corso...', 'info'); load(true); });", content)


    with open(fpath, 'w', encoding='utf-8') as f:
        f.write(content)

print('Updated refresh button listeners in all files.')
