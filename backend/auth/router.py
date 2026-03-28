"""
auth/router.py — Login, me, switch-company, lang update, invite, forgot-password
All DB lookups use .maybe_single() with explicit guards — no .single() crashes.
"""
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel, EmailStr
from datetime import datetime, timedelta, timezone
from uuid import UUID
import jwt
import logging
import urllib.request
import json

from config import settings
from database import supabase, supabase_service, supabase_auth, safe_single
from auth.middleware import get_current_user, CurrentUser

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Schemas ──────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class ExchangeRequest(BaseModel):
    access_token: str

class SwitchCompanyRequest(BaseModel):
    company_id: UUID

class InviteRequest(BaseModel):
    email: EmailStr
    name: str
    role: str        # 'admin' | 'client'
    client_id: UUID | None = None

class LangUpdateRequest(BaseModel):
    lang: str

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class SetDefaultCompanyRequest(BaseModel):
    company_id: UUID


# ── JWT helper ───────────────────────────────────────────────

def build_token(user_id: str, email: str, active_company_id: str,
                role: str, client_id: str | None,
                company_name: str | None = None,
                onboarding_id: str | None = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {
        "sub":               str(user_id),
        "email":             email,
        "active_company_id": str(active_company_id),
        "company_name":      company_name or str(active_company_id),
        "role":              role,
        "client_id":         str(client_id) if client_id else None,
        "onboarding_id":     str(onboarding_id) if onboarding_id else None,
        "exp":               expire,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


# ── Login ────────────────────────────────────────────────────

@router.post("/login")
async def login(body: LoginRequest):
    # 1. Authenticate with Supabase Auth
    # Use the dedicated auth client so sign_in session does NOT contaminate
    # the shared service client used by all other routers.
    try:
        res = supabase_auth.auth.sign_in_with_password(
            {"email": body.email, "password": body.password}
        )
    except Exception as e:
        logger.warning("Supabase sign_in_with_password failed for %s: %s", body.email, e)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")

    sb_user = res.user
    if not sb_user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")

    user_id = sb_user.id

    # 2. Fetch user record using service client (bypasses RLS after sign_in)
    user_row = safe_single(
        supabase_service.table("users")
        .select("*")
        .eq("id", user_id)
        .maybe_single()
    )
    if not user_row.data:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "Account non trovato nel sistema. Contattare l'amministratore.",
        )

    # 3. Fetch company permissions using service client
    perms = (
        supabase_service.table("user_company_permissions")
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
        onboarding_id=default_perm.get("onboarding_id"),
    )

    company_ids = [p["company_id"] for p in perms.data]
    companies_meta: dict[str, str] = {}
    try:
        meta_res = (
            supabase_service.table("companies")
            .select("id,name")
            .in_("id", company_ids)
            .execute()
        )
        for row in (meta_res.data or []):
            companies_meta[row["id"]] = row.get("name") or row["id"]
        logger.info("login: loaded company names: %s", companies_meta)
    except Exception as exc:
        logger.warning("login: could not load company names: %s", exc)

    # Resolve the active company name to embed it in the JWT
    active_company_name = companies_meta.get(default_perm["company_id"])

    token = build_token(
        user_id=user_id,
        email=sb_user.email,
        active_company_id=default_perm["company_id"],
        role=default_perm["role"],
        client_id=default_perm.get("client_id"),
        company_name=active_company_name,
        onboarding_id=default_perm.get("onboarding_id"),
    )

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


# ── Exchange Token (Magic Link) ──────────────────────────────

@router.post("/exchange")
async def exchange_token(body: ExchangeRequest):
    # Verify the Supabase token via an explicit HTTP call to their /user endpoint
    # This guarantees we respect whatever asymmetric key they use (ES256, RS256)
    try:
        req = urllib.request.Request(
            f"{settings.supabase_url}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {body.access_token}",
                "apikey": settings.supabase_anon_key
            }
        )
        with urllib.request.urlopen(req) as response:
            user_data = json.loads(response.read().decode("utf-8"))
            user_id = user_data.get("id")
            email = user_data.get("email", "")
            
        if not user_id:
            raise ValueError("No user returned")
            
    except urllib.error.HTTPError as e:
        logger.error(f"exchange_token: Supabase /user returned {e.code}: {e.read()}")
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Link scaduto o non valido")
    except Exception as exc:
        logger.error(f"exchange_token: Supabase verification failed: {exc}", exc_info=True)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Link scaduto o non valido")

    # Fetch user
    user_row = safe_single(
        supabase_service.table("users").select("*").eq("id", user_id).maybe_single()
    )
    if not user_row.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account non trovato nel sistema.")

    # Fetch permissions
    perms = supabase_service.table("user_company_permissions").select("*").eq("user_id", user_id).execute()
    if not perms.data:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Nessun accesso a questa azienda.")

    default_perm = next((p for p in perms.data if p.get("is_default")), perms.data[0])

    company_ids = [p["company_id"] for p in perms.data]
    companies_meta: dict[str, str] = {}
    try:
        meta_res = supabase_service.table("companies").select("id,name").in_("id", company_ids).execute()
        for row in (meta_res.data or []):
            companies_meta[row["id"]] = row.get("name") or row["id"]
    except Exception:
        pass

    active_company_name = companies_meta.get(default_perm["company_id"])

    token = build_token(
        user_id=user_id,
        email=email,
        active_company_id=default_perm["company_id"],
        role=default_perm["role"],
        client_id=default_perm.get("client_id"),
        company_name=active_company_name,
        onboarding_id=default_perm.get("onboarding_id"),
    )

    return {
        "token": token,
        "user": user_row.data,
        "companies": [
            {
                "company_id": p["company_id"],
                "name": companies_meta.get(p["company_id"], p["company_id"]),
                "role": p["role"],
            }
            for p in perms.data
        ],
        "active_company_id": default_perm["company_id"],
    }



# ── Me ───────────────────────────────────────────────────────

@router.get("/me")
async def me(user: CurrentUser = Depends(get_current_user)):
    row = safe_single(
        supabase.table("users")
        .select("*")
        .eq("id", str(user.user_id))
        .maybe_single()
    )
    if not row.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profilo utente non trovato")
        
    # First-login detection — if user was in 'invited' state, activate them
    # and set portal_first_login_at on the linked onboarding record.
    # We do this here (and not just in /login) because setting password via Supabase JS SDK
    # bypasses our /login endpoint but calls /me on the first dashboard load.
    try:
        user_data = row.data
        if not user_data.get("is_active", True):
            supabase_service.table("users").update({
                "is_active": True
            }).eq("id", str(user.user_id)).execute()
            logger.info("me: first-login — activated user %s", user.user_id)
            
            perms = supabase_service.table("user_company_permissions").select("onboarding_id").eq("user_id", str(user.user_id)).execute()
            for perm in (perms.data or []):
                ob_id = perm.get("onboarding_id")
                if ob_id:
                    supabase_service.table("onboarding").update({
                        "portal_first_login_at": datetime.now(timezone.utc).isoformat(),
                    }).eq("id", str(ob_id)).is_("portal_first_login_at", "null").execute()
    except Exception as exc:
        logger.warning("me: first-login update failed (non-critical): %s", exc)

    return row.data


# ── Switch company ────────────────────────────────────────────

@router.post("/switch-company")
async def switch_company(
    body: SwitchCompanyRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Issue a new JWT with the selected company as active."""
    perm = safe_single(
        supabase.table("user_company_permissions")
        .select("*")
        .eq("user_id", str(user.user_id))
        .eq("company_id", str(body.company_id))
        .maybe_single()
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
        res = supabase.auth.admin.invite_user_by_email(
            body.email,
            options={"redirect_to": f"{settings.portal_url}/client_set_password.html"}
        )
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


async def _send_portal_invite(client_id: str, email: str, company_id: str):
    """Internal helper to invite a client to the portal programmatically."""
    try:
        # 1. Ask Supabase Auth to send the invite email
        res = supabase.auth.admin.invite_user_by_email(
            email,
            options={"redirect_to": f"{settings.portal_url}/client_set_password.html"}
        )
        sb_user = res.user
        if not sb_user:
            logger.error("_send_portal_invite: Supabase Auth did not return a user for %s", email)
            return
            
        # 2. Upsert user profile
        try:
            supabase.table("users").upsert({
                "id":    sb_user.id,
                "email": email,
                "name":  email.split("@")[0],  # Default name until they log in and change it
                "lang":  "it",
            }).execute()
        except Exception as e:
            logger.warning("_send_portal_invite: users upsert failed for %s: %s", email, e)
            
        # 3. Assign them the client role and link to the client record
        try:
            supabase.table("user_company_permissions").insert({
                "user_id":    sb_user.id,
                "company_id": company_id,
                "role":       "client",
                "client_id":  client_id,
                "is_default": True,
            }).execute()
        except Exception as e:
            logger.error("_send_portal_invite: permissions insert failed for %s: %s", email, e)
            
    except Exception as exc:
        logger.error("_send_portal_invite: unhandled error inviting %s: %s", email, exc)


# ── Forgot password ───────────────────────────────────────────

@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordRequest):
    """
    Send a password reset link to the given email.
    Always returns 200 to avoid user enumeration (don't reveal if email exists).
    """
    try:
        redirect_to = f"{settings.portal_url}/client_set_password.html"
        supabase.auth.admin.generate_link({
            "type": "recovery",
            "email": body.email,
            "redirect_to": redirect_to,
        })
    except Exception as exc:
        logger.warning("forgot_password: generate_link failed for %s: %s", body.email, exc)

    return {"message": "Se l'account esiste, riceverai un link per reimpostare la password."}


# ── Set default company ───────────────────────────────────────

@router.patch("/me/default-company")
async def set_default_company(
    body: SetDefaultCompanyRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """
    Set the default company for the current user.
    Clears is_default on all other permissions, then sets it on the chosen one.
    """
    try:
        # 1. Clear is_default for all of this user's permissions
        supabase_service.table("user_company_permissions") \
            .update({"is_default": False}) \
            .eq("user_id", str(user.user_id)) \
            .execute()

        # 2. Set is_default=True for the chosen company
        result = supabase_service.table("user_company_permissions") \
            .update({"is_default": True}) \
            .eq("user_id", str(user.user_id)) \
            .eq("company_id", str(body.company_id)) \
            .execute()

        if not result.data:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                "Azienda non trovata tra i permessi dell'utente.",
            )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            f"Errore aggiornamento azienda predefinita: {exc}",
        )

    return {"message": "Azienda predefinita aggiornata.", "company_id": str(body.company_id)}
