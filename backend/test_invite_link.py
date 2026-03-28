"""
Test: generate_link + fix redirect_to manually (as backend now does)
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from database import supabase
from config import settings
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

def fix_redirect(raw_link: str, correct_redirect: str) -> str:
    parsed = urlparse(raw_link)
    params = parse_qs(parsed.query, keep_blank_values=True)
    params["redirect_to"] = [correct_redirect]
    return urlunparse(parsed._replace(query=urlencode({k: v[0] for k, v in params.items()})))

correct_redirect = f"{settings.portal_url}/client_set_password.html"
print(f"correct_redirect = '{correct_redirect}'")
print()

link_res = supabase.auth.admin.generate_link({"type": "invite", "email": "testdebug999@mailinator.com"})
raw_link = link_res.properties.action_link
fixed_link = fix_redirect(raw_link, correct_redirect)

print(f"raw_link (from Supabase, {len(raw_link)} chars):")
print(f"  ends with: ...{raw_link[-50:]}")
print()
print(f"fixed_link ({len(fixed_link)} chars):")
print(f"  ends with: ...{fixed_link[-70:]}")
print()

checks = [
    ("client_set_password in fixed_link", "client_set_password" in fixed_link),
    ("redirect_to in fixed_link", "redirect_to" in fixed_link),
    ("supabase.co/auth in fixed_link", "supabase.co/auth" in fixed_link),
]
for name, result in checks:
    print(f"  {'✅' if result else '❌'} {name}: {result}")

print()
print("Full fixed_link:")
for i in range(0, len(fixed_link), 100):
    print(f"  [{i:03d}]: {fixed_link[i:i+100]}")
