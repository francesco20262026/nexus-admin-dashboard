import os
import requests
import json

headers = {
    "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ib2J6c2hqYWpnYm1wcmhneGlvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc1NTcyNiwiZXhwIjoyMDg5MzMxNzI2fQ.e45N1ozPzenkl1GbxUbyViq4GN3_6G7yoj1S5MOiOoc",
    "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ib2J6c2hqYWpnYm1wcmhneGlvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc1NTcyNiwiZXhwIjoyMDg5MzMxNzI2fQ.e45N1ozPzenkl1GbxUbyViq4GN3_6G7yoj1S5MOiOoc",
    "Content-Type": "application/json"
}

data = { "onboarding_id": "4b50caff-e9a9-43c3-88bc-467a731d7986" }

for t in ["activities", "documents", "contracts"]:
    url = f"https://nbobzshjajgbmprhgxio.supabase.co/rest/v1/{t}"
    res = requests.post(url, headers=headers, json=data)
    print(t, res.status_code, res.text)
