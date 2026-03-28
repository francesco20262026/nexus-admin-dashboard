import os, re
d = 'e:/App/crm/assets/js'
for f in os.listdir(d):
    if not f.endswith('.js'): continue
    p = os.path.join(d, f)
    with open(p, 'r', encoding='utf-8') as file:
        c = file.read()
    c = re.sub(r'(<div class="cl-col cl-col-actions" style="flex-shrink:0; display:flex;) (align-items:center;) (gap:\d+px; )?(justify-content:flex-end;">)', r'\1 flex-direction:row; \2 \3\4', c)
    with open(p, 'w', encoding='utf-8') as file:
        file.write(c)
print("Done")
