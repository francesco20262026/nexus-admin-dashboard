import asyncio
import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), "backend"))

async def test():
    from database import supabase
    tables_to_check = ["quotes", "documents", "contracts", "activities", "invoices", "client_services", "audit_logs"]
    
    print("--- SCHEMA AUDIT ---")
    for tbl in tables_to_check:
        try:
            # Dagli un record vuoto per vedere se fallisce sui column names o seleziona limit(1)
            res = supabase.table(tbl).select("*").limit(1).execute()
            if res.data:
                columns = list(res.data[0].keys())
                print(f"Table '{tbl}' has columns: {columns}")
            else:
                # Se è vuota, provo a fare un insert fittizio per vedere lo schema o ottenerlo dal supabase schema api
                print(f"Table '{tbl}' is empty, cannot infer columns from select *.")
        except Exception as e:
            print(f"Table '{tbl}': Error {e}")

if __name__ == "__main__":
    asyncio.run(test())
