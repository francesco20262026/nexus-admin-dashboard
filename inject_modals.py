import io

html_path = 'e:/App/crm/admin_client_detail.html'
modals_path = 'e:/App/crm/temp_modals.txt'

html = io.open(html_path, 'r', encoding='utf-8').read()
modals = io.open(modals_path, 'r', encoding='utf-8').read()

if '<!-- ==================== MODALS ==================== -->' not in html:
    html = html.replace('<!-- ==================== SCRIPTS ==================== -->', modals + '\n<!-- ==================== SCRIPTS ==================== -->')
    with io.open(html_path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(html)
