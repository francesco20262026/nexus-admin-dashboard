import os
import re
import glob

html_files = glob.glob('admin_*.html')

for file in html_files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Bump version
    content = re.sub(r'\?v=\d+', '?v=88', content)

    # Make sure list containers have class="cl-list"
    # Find <div id="something-list"> and replace with <div id="something-list" class="cl-list">
    content = re.sub(r'<div\s+id="([a-zA-Z0-9_-]+-list)"\s*>', r'<div id="\1" class="cl-list">', content)
    
    # Handle cases where comp-list is used
    content = re.sub(r'<div\s+id="comp-list"\s*>', r'<div id="comp-list" class="cl-list">', content)

    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)

print(f"Updated {len(html_files)} HTML files.")
