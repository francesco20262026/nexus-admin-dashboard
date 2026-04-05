import os, sys, json
sys.path.insert(0, r"e:\App\crm\backend")
from database import supabase

res = supabase.table("invoices").select("id, number, client_id, direction, clients(name, company_name), parsed_data").order("created_at", desc=True).limit(3).execute()
with open(r"e:\App\crm\diag.json", "w", encoding="utf-8") as f:
    json.dump(res.data, f, indent=2)
