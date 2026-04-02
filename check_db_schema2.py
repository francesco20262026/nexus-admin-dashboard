import os
import sys
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import RealDictCursor

sys.path.append(os.path.join(os.path.dirname(__file__), "backend"))
load_dotenv(os.path.join(os.path.dirname(__file__), "backend", ".env"))

def test():
    conn_str = os.getenv("DATABASE_URL")
    if not conn_str:
        print("No DATABASE_URL found.")
        return
        
    tables_to_check = ["quotes", "documents", "contracts", "activities", "invoices", "client_services", "audit_logs"]
    
    try:
        conn = psycopg2.connect(conn_str)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        print("--- SCHEMA AUDIT VIA INFORMATION_SCHEMA ---")
        for tbl in tables_to_check:
            cur.execute("""
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = %s
                ORDER BY ordinal_position
            """, (tbl,))
            cols = cur.fetchall()
            col_names = [f"{c['column_name']}" for c in cols]
            print(f"Table '{tbl}' has columns: {', '.join(col_names)}")
    except Exception as e:
        print(f"DB Error: {e}")
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    test()
