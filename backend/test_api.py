import os
from dotenv import load_dotenv
load_dotenv()
from database import supabase

try:
    res = supabase.table('onboarding').select('*, clients(name, company_name, email)', count='exact').limit(1).execute()
    print("SUCCESS")
    print(res.data)
except Exception as e:
    import traceback
    traceback.print_exc()
