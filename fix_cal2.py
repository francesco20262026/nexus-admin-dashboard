import re

html_file = 'e:/App/crm/admin_calendar.html'
with open(html_file, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the placeholder text
old_placeholder = '<div style="color:var(--gray-500);font-size:14px;text-align:center;padding:40px 0;">Inizializzazione calendario in corso... (Libreria necessaria)</div>'
if old_placeholder in content:
    content = content.replace(old_placeholder, '<div id="calendar" style="min-height: 600px;"></div>')
else:
    # Try the default one
    old_placeholder2 = '<div style="color:var(--gray-500);font-size:14px;text-align:center;padding:40px 0;">Nessuna attività da mostrare</div>'
    content = content.replace(old_placeholder2, '<div id="calendar" style="min-height: 600px;"></div>')

with open(html_file, 'w', encoding='utf-8') as f:
    f.write(content)

print('Fixed Calendar DOM')
