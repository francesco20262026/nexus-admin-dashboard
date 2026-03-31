import re
import os

css_path = r'e:\App\crm\assets\css\dash.css'
with open(css_path, 'r', encoding='utf-8') as f:
    css_content = f.read()

# Trovo .cl-filter-select e vi aggiungo vertical-align, box-sizing, line-height.
# Trovo .cl-filter-search-input e faccio lo stesso.

alignments = """
  box-sizing: border-box !important;
  vertical-align: middle !important;
  line-height: normal !important;
"""

# I'll just append these lines explicitly into the definitions of .cl-filter-select and .cl-filter-search-input 
# if they are not there already.

if "box-sizing: border-box !important;" not in css_content.split('.cl-filter-select')[1][:500]:
    css_content = re.sub(
        r'(\.cl-filter-select\s*\{[^}]*?)height: 28px !important;',
        r'\1height: 30px !important;\n  box-sizing: border-box !important;\n  vertical-align: middle !important;\n  line-height: 1.4 !important;\n  padding: 0 24px 0 8px !important;',
        css_content,
        flags=re.DOTALL
    )

    css_content = re.sub(
        r'(\.cl-filter-search-input\s*\{[^}]*?)height: 28px !important;',
        r'\1height: 30px !important;\n  box-sizing: border-box !important;\n  vertical-align: middle !important;\n  line-height: 1.4 !important;\n  padding: 0 12px 0 28px !important;',
        css_content,
        flags=re.DOTALL
    )
    
    # And for input[type="date"] because it needs to reset padding:
    css_content = re.sub(
        r'(input\[type="date"\]\.cl-filter-select.*?)padding: 4px 12px 4px 8px !important;',
        r'\1padding: 0 12px 0 8px !important;',
        css_content,
        flags=re.DOTALL
    )

    with open(css_path, 'w', encoding='utf-8') as f:
        f.write(css_content)
    print("Alignment CSS applied.")
else:
    print("Alignment CSS already present!")

html_dir = r'e:\App\crm'
for file in os.listdir(html_dir):
    if file.endswith('.html'):
        filepath = os.path.join(html_dir, file)
        with open(filepath, 'r', encoding='utf-8') as f:
            c = f.read()
            c2 = re.sub(r'\?v=\d+', '?v=111', c)
            if c2 != c:
                with open(filepath, 'w', encoding='utf-8') as fs:
                    fs.write(c2)
print("v=111")
