import io
client_html = io.open('admin_client_detail.html', 'r', encoding='utf-8').read()
onboarding_html = io.open('admin_onboarding_detail.html', 'r', encoding='utf-8').read()

start_modals = client_html.find('<!-- Modal Nuova Chiamata -->')
end_modals = client_html.find('<!-- ==================== SCRIPTS ==================== -->')
modals_content = client_html[start_modals:end_modals]

if 'Modal Nuova Chiamata' not in onboarding_html:
    onboarding_html = onboarding_html.replace('<!-- ==================== SCRIPTS ==================== -->', modals_content + '\n<!-- ==================== SCRIPTS ==================== -->')

# Now add the scripts
if 'admin_client_calls.js' not in onboarding_html:
    scripts = '<script src="assets/js/admin_client_calls.js?v=152"></script>\n<script src="assets/js/admin_client_comms.js?v=152"></script>\n<script src="assets/js/admin_onboarding_detail.js'
    onboarding_html = onboarding_html.replace('<script src="assets/js/admin_onboarding_detail.js', scripts)

with io.open('admin_onboarding_detail.html', 'w', encoding='utf-8', newline='\n') as f:
    f.write(onboarding_html)

print("Injected modals and scripts successfully.")
