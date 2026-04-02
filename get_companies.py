from database import supabase

res = supabase.table("companies").select("id, name").execute()
for c in res.data:
    print(f"Company: {c['name']} (ID: {c['id']})")
