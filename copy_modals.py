import re

with open('e:/App/crm/admin_onboarding.html', 'r', encoding='utf-8') as f:
    text = f.read()

m = re.search(r'(<!-- ======= NEW / EDIT ONBOARDING MODAL ======= -->.*?)<div class="toast-container" id="toast-container"></div>', text, re.DOTALL)
if m:
    modals = m.group(1)
    with open('e:/App/crm/admin_onboarding_detail.html', 'r', encoding='utf-8') as f:
        html = f.read()
    html = html.replace('<div id="toast-container" class="toast-container"></div>', modals + '\n<div id="toast-container" class="toast-container"></div>')
    with open('e:/App/crm/admin_onboarding_detail.html', 'w', encoding='utf-8') as f:
        f.write(html)
    print('Done.')
else:
    print('Could not find modals.')
