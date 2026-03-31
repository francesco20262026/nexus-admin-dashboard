import subprocess
import io

data = subprocess.check_output(['git', 'show', 'HEAD:admin_client_detail.html']).decode('utf-8')
parts = data.split('<!-- ==================== MODALS ==================== -->')
if len(parts) > 1:
    modals = '<!-- ==================== MODALS ==================== -->' + parts[1].split('<!-- ==================== SCRIPTS ==================== -->')[0]
    with io.open('e:/App/crm/temp_modals.txt', 'w', encoding='utf-8') as f:
        f.write(modals)
