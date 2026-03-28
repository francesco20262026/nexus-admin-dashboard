import os, re

dash_content = open('client_dash.html', 'r', encoding='utf-8').read()
sidebar_match = re.search(r'(<aside class=\"sidebar\">.*?</aside>)', dash_content, re.DOTALL)
if not sidebar_match:
    print('Sidebar not found')
    os._exit(1)
correct_sidebar = sidebar_match.group(1)

client_files = ['client_quotes.html', 'client_invoices.html', 'client_documents.html', 'client_contracts.html', 'client_profile.html']
for file in client_files:
    if os.path.exists(file):
        content = open(file, 'r', encoding='utf-8').read()
        existing_sidebar_match = re.search(r'(<aside class=\"sidebar\">.*?</aside>)', content, re.DOTALL)
        if existing_sidebar_match:
            new_content = content[:existing_sidebar_match.start(1)] + correct_sidebar + content[existing_sidebar_match.end(1):]
            open(file, 'w', encoding='utf-8').write(new_content)
            print(f'Updated {file}')
