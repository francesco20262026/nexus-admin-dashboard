import glob
import re

html_files = glob.glob('e:/App/crm/*.html')
matches = 0
for file in html_files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    new_content, count = re.subn(r'\s*<p class="page-subtitle"[^>]*>.*?</p>', '', content, flags=re.DOTALL)
    if count > 0:
        matches += 1
        with open(file, 'w', encoding='utf-8') as f:
            f.write(new_content)

print(f'Removed subtitles from {matches} files.')
