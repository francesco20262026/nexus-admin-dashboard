import glob, re, os

svg_cal = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5m-9-6h.008v.008H12v-.008ZM12 15h.008v.008H12V15Zm0 2.25h.008v.008H12v-.008ZM9.75 15h.008v.008H9.75V15Zm0 2.25h.008v.008H9.75v-.008ZM7.5 15h.008v.008H7.5V15Zm0 2.25h.008v.008H7.5v-.008Zm6.75-4.5h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V15Zm0 2.25h.008v.008h-.008v-.008Zm2.25-4.5h.008v.008H16.5v-.008Zm0 2.25h.008v.008H16.5V15Z"/></svg>'
svg_act = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M10.125 2.25h-4.5c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125v-9M10.125 2.25h.375a9 9 0 0 1 9 9v.375M10.125 2.25A3.375 3.375 0 0 1 13.5 5.625v1.5c0 .621.504 1.125 1.125 1.125h1.5a3.375 3.375 0 0 1 3.375 3.375M9 15l2.25 2.25L15 12"/></svg>'

tools_block = f'''    <div class="nav-section-label" data-i18n="nav.tools">Strumenti</div>
    <a class="nav-item" href="admin_calendar.html?v=68">
      {svg_cal}
      <span class="nav-label" data-i18n="nav.calendar">Calendario</span>
    </a>
    <a class="nav-item" href="admin_activities.html?v=68">
      {svg_act}
      <span class="nav-label" data-i18n="nav.activities">Attività</span>
    </a>
'''

def fix_sidebar(f):
    try:
        with open(f, 'r', encoding='utf-8') as file:
            content = file.read()
    except Exception as e:
        print(f'Error reading {f} - {e}')
        return

    # Check if this is an admin page with a sidebar
    if '<aside class="sidebar">' not in content:
        return

    # 1. Clean up existing scattered links to avoid duplicates
    content = re.sub(r'<div class="nav-section-label"[^>]*>Strumenti</div>\s*<a class="nav-item" href="admin_calendar\.html.*?</svg>\s*<span class="nav-label"[^>]*>Calendario</span>\s*</a>\s*<a class="nav-item" href="admin_activities\.html.*?</svg>\s*<span class="nav-label"[^>]*>Attività</span>\s*</a>', '', content, flags=re.DOTALL)
    
    # Just in case they are completely standalone
    content = re.sub(r'<div class="nav-section-label"[^>]*>Strumenti</div>', '', content)
    content = re.sub(r'<a class="nav-item" href="admin_calendar\.html.*?</a>', '', content, flags=re.DOTALL)
    content = re.sub(r'<a class="nav-item" href="admin_activities\.html.*?</a>', '', content, flags=re.DOTALL)

    # 2. Inject it cleanly right before <div class="nav-section-label" data-i18n="nav.analytics">
    target = '<div class="nav-section-label" data-i18n="nav.analytics">Analisi</div>'
    target2 = '<div class="nav-section-label" data-i18n="nav.system">Sistema</div>'

    if target in content:
        content = content.replace(target, tools_block + target)
    elif target2 in content:
        content = content.replace(target2, tools_block + target2)
    else:
        # Fallback, inject right before </nav>
        content = re.sub(r'(</nav>)', tools_block + r'\1', content)

    # Re-apply active class if we are on the page itself
    filename = os.path.basename(f)
    if 'calendar.html' in filename:
        content = content.replace('href="admin_calendar.html?v=68"', 'class="active" href="admin_calendar.html?v=68"')
    elif 'activities.html' in filename:
        content = content.replace('href="admin_activities.html?v=68"', 'class="active" href="admin_activities.html?v=68"')

    with open(f, 'w', encoding='utf-8') as file:
        file.write(content)
    print(f'Patched {filename}')

for p in glob.glob('e:/App/crm/admin_*.html'):
    fix_sidebar(p)
