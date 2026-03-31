import glob
import re

html_files = glob.glob('e:/App/crm/*.html')
for file in html_files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Aggiorna la cache
    content = re.sub(r'v=140', 'v=141', content)

    # Aggiorna type='text' in type='search'
    content = re.sub(r'<input\s+type=[\"\']text[\"\']\s+id=[\"\']globalSearchInput[\"\']', '<input type=\"search\" id=\"globalSearchInput\"', content)
    content = re.sub(r'<input\s+type=[\"\']text[\"\']\s+class=[\"\']cl-filter-search-input', '<input type=\"search\" class=\"cl-filter-search-input', content)

    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)

with open('e:/App/crm/components/header.js', 'r', encoding='utf-8') as f:
    js_content = f.read()
js_content = re.sub(r'<input type=\"text\" id=\"globalSearchInput\"', '<input type=\"search\" id=\"globalSearchInput\"', js_content)
with open('e:/App/crm/components/header.js', 'w', encoding='utf-8') as f:
    f.write(js_content)

print(f'Updated {len(html_files)} files to v=141')
