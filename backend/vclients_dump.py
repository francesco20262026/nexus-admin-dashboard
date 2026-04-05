import sys
import os
import json
sys.path.append('e:\\App\\crm\\backend')
from database import supabase

try:
    r = supabase.table('v_clients').select('*').limit(1).execute()
    cols = list(r.data[0].keys()) if r.data else []
    with open('e:\\App\\crm\\backend\\vclients_cols.txt', 'w') as f:
        f.write(json.dumps(cols))
except Exception as e:
    with open('e:\\App\\crm\\backend\\vclients_cols.txt', 'w') as f:
        f.write(str(e))
