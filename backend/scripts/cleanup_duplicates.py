import asyncio
from supabase import create_client
import os
from collections import defaultdict
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
supabaseUrl = os.environ.get('SUPABASE_URL')
supabaseKey = os.environ.get('SUPABASE_SERVICE_KEY')
if not supabaseUrl or not supabaseKey:
    print('Missing supabase credentials in backend/.env')
    exit(1)

supabase = create_client(supabaseUrl, supabaseKey)

def cleanup():
    # Fetch all inbound invoices
    res = supabase.table('invoices').select('id, number, total, client_id, created_at').eq('direction', 'inbound').execute()
    data = res.data
    
    # Group by (client_id, number, total)
    groups = defaultdict(list)
    for inv in data:
        if inv['number'] and inv['client_id']:
            key = (inv['client_id'], inv['number'], inv['total'])
            groups[key].append(inv)
            
    deleted_count = 0
    for key, invoices in groups.items():
        if len(invoices) > 1:
            # Sort by created_at ascending so we keep the first one
            invoices.sort(key=lambda x: x['created_at'])
            to_delete = invoices[1:] # keep the first one
            for inv in to_delete:
                print(f"Deleting duplicate invoice {inv['id']} (Number: {inv['number']}, Total: {inv['total']})")
                supabase.table('invoices').delete().eq('id', inv['id']).execute()
                deleted_count += 1
                
    print(f'Done. Deleted {deleted_count} duplicates.')

if __name__ == "__main__":
    cleanup()
