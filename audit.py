import os, hashlib

def info(p):
    if not os.path.exists(p): return 'MISSING'
    s = os.path.getsize(p)
    with open(p,'rb') as f: h = hashlib.md5(f.read()).hexdigest()[:6]
    return f'{s}b[{h}]'

bases = {'C1': r'E:\App\crm - Copy', 'C2': r'E:\App\crm - Copy (2)', 'C3': r'E:\App\crm - Copy (3)', 'CUR': r'E:\App\crm'}
files = [
    'assets/css/dash.css',
    'assets/css/mac_detail.css',
    'admin_client_detail.html',
    'admin_onboarding_detail.html',
    'assets/js/admin_client_detail.js',
    'assets/js/admin_onboarding_detail.js',
    'assets/js/admin_clients.js',
    'admin_clients.html',
    'admin_contracts.html',
    'assets/js/admin_contracts.js',
]

lines = []
for f in files:
    row = f.split('/')[-1].ljust(28)
    for k,b in bases.items():
        row += f'  {k}:{info(os.path.join(b, f))}'
    lines.append(row)

out = '\n'.join(lines)
print(out)
with open(r'E:\App\crm\audit_result.txt', 'w') as fp:
    fp.write(out)
print('\nWritten to audit_result.txt')
