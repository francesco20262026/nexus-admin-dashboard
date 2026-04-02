from database import supabase
import sys

try:
    res = supabase.table("invoices").select("*").limit(0).execute()
    # If the REST API doesn't return columns for empty result, 
    # we can try inserting a dummy row and rolling back, but REST doesn't support rollback easily.
    # Let's just create a dummy invoice and then delete it.
except Exception as e:
    print("Error:", e)

# Actually, the python client `select("*")` on an empty table returns `data: []` without keys.
# Let's just try to insert a fake record with invalid data to see the error message.
try:
    supabase.table("invoices").insert({"id": "00000000-0000-0000-0000-000000000000", "invalid_col": 1}).execute()
except Exception as e:
    print("Error inserting:", e)
