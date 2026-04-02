import asyncio
import os
import sys

# Aggiungi backend al path
sys.path.append(os.path.join(os.path.dirname(__file__), "backend"))

async def check():
    from database import supabase
    try:
        res = supabase.table("invoices").select("id, contract_id, supplier_company_id").limit(1).execute()
        print("Success:", res.data)
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    asyncio.run(check())
