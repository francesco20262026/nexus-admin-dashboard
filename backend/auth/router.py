"""
auth/router.py — Login, me, switch-company, invite
"""
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel, EmailStr
from datetime import datetime, timedelta, timezone
from uuid import UUID
import jwt

from config import settings
from database import supabase
from auth.middleware import get_current_user, CurrentUser

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Schemas ──────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class SwitchCompanyRequest(BaseModel):
    company_id: UUID

class InviteRequest(BaseModel):
    email: EmailStr
    name: str
    role: str        # 'admin' | 'client'
    client_id: UUID | None = None

class LangUpdateRequest(BaseModel):
    lang: str


# ── JWT helper ───────────────────────────────────────────────

def build_token(user_id: str, email: str, active_company_id: str,
                role: str, client_id: str | None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {
        "sub": str(user_id),
        "email": email,
        "active_company_id": str(active_company_id),
        "role": role,
        "client_id": str(client_id) if client_id else None,
        "exp": expire,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


# ── Endpoints ────────────────────────────────────────────────

@router.post("/login")
async def login(body: LoginRequest):
    # 1. Authenticate with Supabase Auth
    try:
        res = supabase.auth.sign_in_with_password(
            {"email": body.email, "password": body.password}
        )
    except Exception:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")

    sb_user = res.user
    if not sb_user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")

    user_id = sb_user.id

    # 2. Fetch user record
    user_row = supabase.table("users").select("*").eq("id", user_id).single().execute()
    if not user_row.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    # 3. Fetch permissions (find default company)
    perms = (
        supabase.table("user_company_permissions")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )
    if not perms.data:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No company access")

    default_perm = next((p for p in perms.data if p["is_default"]), perms.data[0])

    token = build_token(
        user_id=user_id,
        email=sb_user.email,
        active_company_id=default_perm["company_id"],
        role=default_perm["role"],
        client_id=default_perm.get("client_id"),
    )

    return {
        "token": token,
        "user": user_row.data,
        "companies": [{"company_id": p["company_id"], "role": p["role"]} for p in perms.data],
        "active_company_id": default_perm["company_id"],
    }


@router.get("/me")
async def me(user: CurrentUser = Depends(get_current_user)):
    row = supabase.table("users").select("*").eq("id", str(user.user_id)).single().execute()
    return row.data


@router.post("/switch-company")
async def switch_company(
    body: SwitchCompanyRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Issue a new JWT with the selected company as active."""
    perm = (
        supabase.table("user_company_permissions")
        .select("*")
        .eq("user_id", str(user.user_id))
        .eq("company_id", str(body.company_id))
        .single()
        .execute()
    )
    if not perm.data:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No access to this company")

    p = perm.data
    token = build_token(
        user_id=str(user.user_id),
        email=user.email,
        active_company_id=str(body.company_id),
        role=p["role"],
        client_id=p.get("client_id"),
    )

    # Audit log
    supabase.table("audit_logs").insert({
        "company_id": str(body.company_id),
        "user_id": str(user.user_id),
        "entity_type": "session",
        "action": "switch_company",
        "new_values": {"company_id": str(body.company_id)},
    }).execute()

    return {"token": token, "active_company_id": str(body.company_id), "role": p["role"]}


@router.put("/me/lang")
async def update_lang(
    body: LangUpdateRequest,
    user: CurrentUser = Depends(get_current_user),
):
    if body.lang not in ("it", "en"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unsupported language")
    supabase.table("users").update({"lang": body.lang}).eq("id", str(user.user_id)).execute()
    return {"lang": body.lang}


@router.post("/invite")
async def invite_user(
    body: InviteRequest,
    user: CurrentUser = Depends(get_current_user),
):
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin only")

    # 1. Create Supabase Auth user (sends invitation email)
    res = supabase.auth.admin.invite_user_by_email(body.email)
    sb_user = res.user

    # 2. Upsert users row
    supabase.table("users").upsert({
        "id": sb_user.id,
        "email": body.email,
        "name": body.name,
        "lang": "it",
    }).execute()

    # 3. Create permission
    supabase.table("user_company_permissions").insert({
        "user_id": sb_user.id,
        "company_id": str(user.active_company_id),
        "role": body.role,
        "client_id": str(body.client_id) if body.client_id else None,
        "is_default": True,
    }).execute()

    return {"message": "Invitation sent", "email": body.email}
