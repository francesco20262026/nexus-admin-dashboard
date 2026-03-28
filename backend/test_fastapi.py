import os
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

# We need to bypass auth or use a token.
# Because require_admin is a dependency, we can override it!
from auth.middleware import require_admin
from pydantic import BaseModel

class DummyUser:
    user_id = "00000000-0000-0000-0000-000000000000"
    active_company_id = "15a52e6b-36a1-4b00-9496-6a277e9492ea"
    email = "test@test.com"
    role = "admin"

app.dependency_overrides[require_admin] = lambda: DummyUser()

response = client.get("/api/onboarding/")
print(response.status_code)
print(response.json())
