import glob
import re

html_files = glob.glob('e:/App/crm/*.html')

button_html = '''<button class="cl-filter-reset-btn" onclick="const row = this.closest('.cl-filter-row'); if(row) { row.querySelectorAll('input:not([type=hidden]), select').forEach(el => { el.value = ''; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); }); }" style="margin-left:auto; display:flex; align-items:center; gap:6px; background:transparent; border:none; color:var(--gray-500); font-size:12px; font-weight:600; cursor:pointer; padding:4px 8px; border-radius:6px; transition:all 0.15s;" onmouseover="this.style.background='#f1f5f9'; this.style.color='#111827';" onmouseout="this.style.background='transparent'; this.style.color='var(--gray-500)';">
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
  Reset
</button>'''

modified = 0

for file in html_files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Cerca la fine della riga dei filtri (</div> che chiude .cl-filter-row)
    # È un po' tricky in regex. Se i filtri terminano con </div></div>
    # Più sicuro iniettarlo prima del first </div> after cl-filter-row IF we capture the outer correctly.
    # Invece uso una semplice ricerca della sotto-stringa e sostituisco "</div>" per .cl-filter-row.
    # Ma dato che `content` concatena tutto, meglio usare un piccolo parser:
    
    parts = content.split('<div class="cl-filter-row">')
    if len(parts) > 1:
        new_content = parts[0]
        for i in range(1, len(parts)):
            # Per ogni occorrenza trovo il primo tag di chiusura div a livello pari a 0 rispetto alla stringa <div
            # Siccome è HTML compresso, potremmo anche matcharlo sapendo che finisce con </div>...
            # Un approccio naive se il div .cl-filter-row è un container con dentro altri elements:
            # Sostituire l'ultimo </div> di questa riga è complesso con regex senza un DOM parser.
            pass
            
    # Approccio bruteforce: cerchiamo la stringa esatta della riga intera in qualche file?
    # Usiamo BeautifulSoup!
    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(content, 'html.parser')
        rows = soup.find_all('div', class_='cl-filter-row')
        changed = False
        for row in rows:
            if not row.find(class_='cl-filter-reset-btn'):
                reset_btn = BeautifulSoup(button_html, 'html.parser')
                row.append(reset_btn)
                changed = True
        
        if changed:
            with open(file, 'w', encoding='utf-8') as f:
                f.write(str(soup))
            modified += 1
            print(f"Updated {file}")
            
    except ImportError:
        print("BeautifulSoup non installato, cerco un altro approccio...")

print(f"Modified {modified} files")
