from fastapi.testclient import TestClient
from main import app
from auth.middleware import get_current_user, CurrentUser
from uuid import UUID

def override_get_current_user():
    return CurrentUser(
        user_id=UUID("d380611d-4d59-48c4-b767-bbb97f29624b"),
        active_company_id=UUID("7cef5536-ced1-41ab-857c-f469c78247f1"),
        role="admin",
        client_id=None,
        email="admin@nexus.com"
    )

app.dependency_overrides[get_current_user] = override_get_current_user

client = TestClient(app)
response = client.get("/api/clients?is_supplier=true&company_id=7cef5536-ced1-41ab-857c-f469c78247f1")
print("STATUS:", response.status_code)
print("DATA LENGTH:", len(response.json().get("data", [])))
print("DATA:", [c.get("company_name") for c in response.json().get("data", [])])
