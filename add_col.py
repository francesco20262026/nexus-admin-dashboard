import requests

url = "https://api.supabase.com/v1/projects/nbobzshjajgbmprhgxio/query"
headers = {
    "Authorization": "Bearer sbp_0094c6668142732bfcaa79c75ef513546a795006",
    "Content-Type": "application/json"
}
data = {
    "query": "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS total_amount NUMERIC;"
}
resp = requests.post(url, headers=headers, json=data)
print("Status:", resp.status_code)
print("Response:", resp.text)
