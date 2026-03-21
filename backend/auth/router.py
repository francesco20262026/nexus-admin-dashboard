"""
auth/router.py — Login, me, switch-company, lang update, invite
All DB lookups use .maybe_single() with explicit guards — no .single() crashes.
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
        "sub":               str(user_id),
        "email":             email,
        "active_company_id": str(active_company_id),
        "role":              role,
        "client_id":         str(client_id) if client_id else None,
        "exp":               expire,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


# ── Login ────────────────────────────────────────────────────

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

    # 2. Fetch user record — .maybe_single() so a missing row returns None cleanly
    user_row = (
        supabase.table("users")
        .select("*")
        .eq("id", user_id)
        .maybe_single()
        .execute()
    )
    if not user_row.data:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "Account non trovato nel sistema. Contattare l'amministratore.",
        )

    # 3. Fetch company permissions
    perms = (
        supabase.table("user_company_permissions")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )
    if not perms.data:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Nessuna azienda associata a questo account. Contattare l'amministratore.",
        )

    default_perm = next((p for p in perms.data if p.get("is_default")), perms.data[0])

    token = build_token(
        user_id=user_id,
        email=sb_user.email,
        active_company_id=default_perm["company_id"],
        role=default_perm["role"],
        client_id=default_perm.get("client_id"),
    )

    # 4. Enrich companies list with real company names
    company_ids = [p["company_id"] for p in perms.data]
    companies_meta: dict[str, str] = {}
    try:
        meta_res = (
            supabase.table("companies")
            .select("id,name")
            .in_("id", company_ids)
            .execute()
        )
        for row in (meta_res.data or []):
            companies_meta[row["id"]] = row.get("name", row["id"])
    except Exception as exc:
        logger.warning("login: could not load company names: %s", exc)

    return {
        "token":             token,
        "user":              user_row.data,
        "companies": [
            {
                "company_id": p["company_id"],
                "name":       companies_meta.get(p["company_id"], p["company_id"]),
                "role":       p["role"],
            }
            for p in perms.data
        ],
        "active_company_id": default_perm["company_id"],
    }


# ── Me ───────────────────────────────────────────────────────

@router.get("/me")
async def me(user: CurrentUser = Depends(get_current_user)):
    row = (
        supabase.table("users")
        .select("*")
        .eq("id", str(user.user_id))
        .maybe_single()
        .execute()
    )
    if not row.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profilo utente non trovato")
    return row.data


# ── Switch company ────────────────────────────────────────────

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
        .maybe_single()
        .execute()
    )
    if not perm.data:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Nessun accesso a questa azienda.",
        )

    p     = perm.data
    token = build_token(
        user_id=str(user.user_id),
        email=user.email,
        active_company_id=str(body.company_id),
        role=p["role"],
        client_id=p.get("client_id"),
    )

    # Audit log — non-blocking
    try:
        supabase.table("audit_logs").insert({
            "company_id":  str(body.company_id),
            "user_id":     str(user.user_id),
            "entity_type": "session",
            "action":      "switch_company",
            "new_values":  {"company_id": str(body.company_id)},
        }).execute()
    except Exception:
        pass   # audit failure must not block login flow

    return {"token": token, "active_company_id": str(body.company_id), "role": p["role"]}


# ── Language update ───────────────────────────────────────────

@router.put("/me/lang")
async def update_lang(
    body: LangUpdateRequest,
    user: CurrentUser = Depends(get_current_user),
):
    if body.lang not in ("it", "en"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Lingua non supportata. Valori ammessi: it, en")
    try:
        supabase.table("users").update({"lang": body.lang}).eq("id", str(user.user_id)).execute()
    except Exception as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Errore aggiornamento lingua: {exc}")
    return {"lang": body.lang}


# ── Invite ────────────────────────────────────────────────────

@router.post("/invite")
async def invite_user(
    body: InviteRequest,
    user: CurrentUser = Depends(get_current_user),
):
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo gli amministratori possono inviare inviti.")

    if body.role not in ("admin", "client"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ruolo non valido. Valori ammessi: admin, client")

    # 1. Create Supabase Auth user (sends invitation email)
    try:
        res     = supabase.auth.admin.invite_user_by_email(body.email)
        sb_user = res.user
        if not sb_user:
            raise ValueError("Supabase returned no user")
    except Exception as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            f"Impossibile inviare l'invito via email: {exc}",
        )

    # 2. Upsert users row — non-fatal if it already exists
    try:
        supabase.table("users").upsert({
            "id":    sb_user.id,
            "email": body.email,
            "name":  body.name,
            "lang":  "it",
        }).execute()
    except Exception as exc:
        # Log but don't abort — user was already created in Supabase Auth
        import logging
        logging.getLogger(__name__).warning(
            "invite_user: users upsert failed for %s: %s", body.email, exc
        )

    # 3. Create permission
    try:
        supabase.table("user_company_permissions").insert({
            "user_id":    sb_user.id,
            "company_id": str(user.active_company_id),
            "role":       body.role,
            "client_id":  str(body.client_id) if body.client_id else None,
            "is_default": True,
        }).execute()
    except Exception as exc:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            f"Invito creato ma errore nell'assegnazione dei permessi: {exc}",
        )

    return {"message": "Invitation sent", "email": body.email}
