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

queries = [
    ("ALTER TABLE client_services ADD COLUMN IF NOT EXISTS onboarding_id UUID REFERENCES onboarding(id) ON DELETE CASCADE;", "add col client_services"),
    ("ALTER TABLE client_services ALTER COLUMN client_id DROP NOT NULL;", "drop not null client_services"),
    
    ("ALTER TABLE quotes ADD COLUMN IF NOT EXISTS onboarding_id UUID REFERENCES onboarding(id) ON DELETE CASCADE;", "add col quotes"),
    ("ALTER TABLE quotes ALTER COLUMN client_id DROP NOT NULL;", "drop not null quotes"),
    
    ("ALTER TABLE documents ADD COLUMN IF NOT EXISTS onboarding_id UUID REFERENCES onboarding(id) ON DELETE CASCADE;", "add col documents"),
    ("ALTER TABLE documents ALTER COLUMN client_id DROP NOT NULL;", "drop not null documents"),
    
    ("ALTER TABLE activities ADD COLUMN IF NOT EXISTS onboarding_id UUID REFERENCES onboarding(id) ON DELETE CASCADE;", "add col activities"),
    ("ALTER TABLE activities ALTER COLUMN client_id DROP NOT NULL;", "drop not null activities"),
    
    ("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS onboarding_id UUID REFERENCES onboarding(id) ON DELETE CASCADE;", "add col contracts"),
    ("ALTER TABLE contracts ALTER COLUMN client_id DROP NOT NULL;", "drop not null contracts")
]

for q, label in queries:
    run_sql(q, label)

print("Migration completed.")
