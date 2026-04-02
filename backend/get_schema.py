from database import supabase
import sys

try:
    res = supabase.table("invoices").select("*").limit(1).execute()
    if res.data:
        print("Keys:", list(res.data[0].keys()))
    else:
        # If empty, just insert a dummy and rollback? Or just print empty.
        # But we can query a non-existent row and it might return empty list.
        # Actually, Supabase REST API doesn't return columns if there are 0 rows.
        print("Table might be empty, no rows to infer columns.")
except Exception as e:
    print("Error:", e)
