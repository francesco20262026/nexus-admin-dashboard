from bs4 import BeautifulSoup
import io
import re

def process_file(filepath):
    html = io.open(filepath, 'r', encoding='utf-8').read()
    soup = BeautifulSoup(html, 'html.parser')
    
    panoramica = soup.find(id='view-panoramica')
    if not panoramica:
        return
        
    mac_content = panoramica.parent
    
    # 1. Remove all mac-divider
    for divider in panoramica.find_all('div', class_='mac-divider'):
        divider.extract()
        
    # 2. Extract sections
    sections = panoramica.find_all('div', id=re.compile(r'^sec-'))
    
    for sec in sections:
        # We extract it from panoramica
        sec_extracted = sec.extract()
        
        # Determine the view id
        sec_id = sec_extracted.get('id') # e.g. sec-contatti
        view_id = sec_id.replace('sec-', 'view-')
        
        # Create a wrapper tab view
        wrapper = soup.new_tag('div')
        wrapper['id'] = view_id
        wrapper['class'] = ['mac-tab-section']
        wrapper['style'] = 'display: none;'
        wrapper.append(sec_extracted)
        
        # Insert after panoramica
        panoramica.insert_after(wrapper)
        
    # 3. Rename panoramica to view-anagrafica
    panoramica['id'] = 'view-anagrafica'
    panoramica['class'] = ['mac-tab-section', 'active']
    panoramica['style'] = 'display: block;'
    
    # 4. Give view-timeline the mac-tab-section class
    timeline = soup.find(id='view-timeline')
    if timeline:
        timeline['class'] = ['mac-tab-section']
        timeline['style'] = 'display: none;'
        
    # 5. Fix the sidebar links to use onclick switchMainView
    nav_items = soup.find_all('a', class_='mac-nav-item')
    for nav in nav_items:
        nav_id = nav.get('id')
        if nav_id and nav_id.startswith('tab-'):
            tab_name = nav_id.replace('tab-', '')
            nav['onclick'] = f"switchMainView('{tab_name}');return false;"
            
    with io.open(filepath, 'w', encoding='utf-8', newline='\n') as f:
        f.write(str(soup))
    print(f"Processed {filepath}")

process_file('admin_onboarding_detail.html')
process_file('admin_client_detail.html')
