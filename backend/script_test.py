import urllib.request, json

def login():
    req = urllib.request.Request('http://127.0.0.1:8000/api/auth/token', method='POST')
    req.add_header('Content-Type', 'application/x-www-form-urlencoded')
    data = 'username=francesco%40delocanova.com&password=nexus2026'
    res = urllib.request.urlopen(req, data=data.encode())
    return json.loads(res.read().decode())['access_token']

def list_clients(token, cid):
    url = f"http://127.0.0.1:8000/api/clients?company_id={cid}" if cid else "http://127.0.0.1:8000/api/clients"
    req = urllib.request.Request(url)
    req.add_header('Authorization', f'Bearer {token}')
    try:
        res = urllib.request.urlopen(req).read().decode()
        print('SUCCESS:', len(json.loads(res).get('data',[])))
    except Exception as e:
        print('ERROR:', e.code, e.read().decode())

t = login()
print('Testing without company_id (__all__)')
list_clients(t, None)
