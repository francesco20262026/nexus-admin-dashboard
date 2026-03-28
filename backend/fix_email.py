import glob
import re

for file in glob.glob('modules/*/router.py'):
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    def add_lang(m):
        call_str = m.group(0)
        if 'lang=' not in call_str:
            return call_str.replace('variables=', 'lang="it", variables=')
        return call_str

    new_content = re.sub(r'send_templated_email\([^\)]+?variables=', add_lang, content)
    if new_content != content:
        with open(file, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f'Patched {file}')
