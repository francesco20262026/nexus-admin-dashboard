import psycopg2

conn = psycopg2.connect("postgresql://postgres.nbobzshjajgbmprhgxio:SupabaseAdmin123!@aws-0-eu-central-1.pooler.supabase.com:5432/postgres")
cur = conn.cursor()
cur.execute("SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c WHERE conname = 'client_services_check'")
res = cur.fetchone()
print("Constraint def:", res)
