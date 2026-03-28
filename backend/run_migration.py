"""
Phase 3 Migration — invoices table
Adds: is_proforma, payment_method, payment_status, payment_proof_url, onboarding_id
"""
import urllib.request, json

PROJECT_REF  = 'nbobzshjajgbmprhgxio'
ACCESS_TOKEN = 'sbp_0094c6668142732bfcaa79c75ef513546a795006'
URL = f'https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query'
HEADERS = {
    'Authorization': f'Bearer {ACCESS_TOKEN}',
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 Chrome/122.0',
    'Accept': 'application/json',
}

def run_sql(sql, label=''):
    data = json.dumps({'query': sql}).encode()
    req = urllib.request.Request(URL, data=data, headers=HEADERS, method='POST')
    try:
        with urllib.request.urlopen(req) as r:
            result = json.loads(r.read().decode())
            print(f'  OK  {label}')
            return result
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f'  ERR {label}: {body[:300]}')
        return None

print('=== Phase 3 Migration — invoices table ===')
print()

# 1. is_proforma flag
run_sql('ALTER TABLE invoices ADD COLUMN IF NOT EXISTS is_proforma BOOLEAN NOT NULL DEFAULT false',
        'is_proforma BOOLEAN')

# 2. onboarding_id — optional link to onboarding workflow
run_sql('ALTER TABLE invoices ADD COLUMN IF NOT EXISTS onboarding_id UUID REFERENCES onboarding(id) ON DELETE SET NULL',
        'onboarding_id FK → onboarding')

# 3. payment_method enum
run_sql("""ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_method TEXT
          CHECK (payment_method IN ('bonifico','rid','carta'))""",
        'payment_method (bonifico|rid|carta)')

# 4. payment_status — separate from invoice lifecycle status
run_sql("""ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'not_paid'
          CHECK (payment_status IN ('not_paid','proof_uploaded','under_review','paid','cancelled'))""",
        'payment_status (5 states)')

# 5. payment_proof_url — reference to uploaded proof document
run_sql('ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_proof_url TEXT',
        'payment_proof_url')

# 6. payment_proof_uploaded_at — timestamp when proof was submitted
run_sql('ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_proof_uploaded_at TIMESTAMPTZ',
        'payment_proof_uploaded_at')

# 7. payment_reference — already may exist (used in mark-pending), ensure it's there
run_sql('ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_reference TEXT',
        'payment_reference')

# 8. Sync payment_status with existing paid invoices (idempotent)
run_sql("UPDATE invoices SET payment_status = 'paid' WHERE status = 'paid' AND payment_status = 'not_paid'",
        'sync existing paid → payment_status=paid')

# 9. payment_logs: add company_id if missing (it was missing in 001_init.sql)
run_sql('ALTER TABLE payment_logs ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE',
        'payment_logs.company_id')
run_sql('ALTER TABLE payment_logs ADD COLUMN IF NOT EXISTS currency TEXT',
        'payment_logs.currency')

# 10. Index for fast proforma lookup
run_sql('CREATE INDEX IF NOT EXISTS idx_invoices_proforma ON invoices(company_id, is_proforma)',
        'idx_invoices_proforma')

# 11. Index for payment_status
run_sql('CREATE INDEX IF NOT EXISTS idx_invoices_payment_status ON invoices(company_id, payment_status)',
        'idx_invoices_payment_status')

# Verify
print()
print('=== Verify Phase 3 columns on invoices ===')
rows = run_sql(
    "SELECT column_name, data_type FROM information_schema.columns "
    "WHERE table_name='invoices' ORDER BY ordinal_position"
)
required = {'is_proforma','onboarding_id','payment_method','payment_status','payment_proof_url','payment_reference'}
if rows:
    present = {r['column_name'] for r in rows}
    for f in required:
        print(f"  [{'OK' if f in present else 'MISSING'}] {f}")

print()
print('Done.')
