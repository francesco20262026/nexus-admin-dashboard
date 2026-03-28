import re

def fix(html_file, script_file):
    with open(html_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    pattern = r'<script src=\"assets/js/admin_clients\.js\?v=68\"></script>\s*<script src=\"assets/js/global_search\.js\"></script>'
    new_script = f'<script src=\"assets/js/{script_file}\"></script>'
    content = re.sub(pattern, new_script, content)
    
    with open(html_file, 'w', encoding='utf-8') as f:
        f.write(content)

fix('e:/App/crm/admin_activities.html', 'admin_activities.js?v=68')
fix('e:/App/crm/admin_calendar.html', 'admin_calendar.js?v=68')
print('Fixed HTML')
