from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel, EmailStr
from typing import Optional, Any
from uuid import UUID

from database import supabase, safe_single
from auth.middleware import get_current_user, CurrentUser, require_admin

router = APIRouter(prefix="/settings", tags=["settings"])

# ── Schemas ──────────────────────────────────────────────────

class UserSettingsUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    lang: Optional[str] = None

class CompanySettingsUpdate(BaseModel):
    name: Optional[str] = None
    lang: Optional[str] = None

class WindocConfig(BaseModel):
    token_app: str
    # token is optional so the frontend can omit it to preserve the stored value
    token: Optional[str] = None
    base_url: Optional[str] = None

class ZohoConfig(BaseModel):
    client_id: str
    client_secret: str
    refresh_token: str
    domain: str = "eu"

class SmtpConfig(BaseModel):
    from_email: str
    host: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[str] = None

class IntegrationUpdate(BaseModel):
    config: dict

# ── Endpoints ────────────────────────────────────────────────

@router.get("/me")
async def get_my_settings(user: CurrentUser = Depends(get_current_user)):
    """Return the current user's profile settings."""
    res = safe_single(
        supabase.table("users").select("id, name, email, lang")
        .eq("id", str(user.user_id)).maybe_single()
    )
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return res.data

@router.put("/me")
async def update_my_settings(body: UserSettingsUpdate, user: CurrentUser = Depends(get_current_user)):
    """Update current user's profile settings."""
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        return {"message": "No updates provided"}
    res = supabase.table("users").update(updates).eq("id", str(user.user_id)).execute()
    return res.data[0] if res and res.data else {}

@router.get("/company")
async def get_company_settings(user: CurrentUser = Depends(require_admin)):
    """Return the current active company's settings."""
    company_id = str(user.active_company_id)
    # Only select columns that actually exist in the companies table
    res = safe_single(
        supabase.table("companies").select("id, name, slug, default_lang, logo_url, created_at")
        .eq("id", company_id).maybe_single()
    )
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Company not found")
    return res.data

@router.put("/company")
async def update_company_settings(body: CompanySettingsUpdate, user: CurrentUser = Depends(require_admin)):
    """Update the current active company's settings."""
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        return {"message": "No updates provided"}

    db_updates: dict[str, Any] = {}
    if "name" in updates: db_updates["name"] = updates["name"]
    if "lang" in updates:  db_updates["default_lang"] = updates["lang"]

    if db_updates:
        supabase.table("companies").update(db_updates).eq("id", str(user.active_company_id)).execute()
        try:
            supabase.table("audit_logs").insert({
                "company_id": str(user.active_company_id),
                "user_id": str(user.user_id),
                "entity_type": "company",
                "action": "settings_updated",
                "new_values": db_updates
            }).execute()
        except Exception:
            pass  # audit non-fatal

    return {"message": "Company updated successfully"}

@router.get("/integrations")
async def get_integrations_status(user: CurrentUser = Depends(require_admin)):
    """Return integration metadata. token_app is returned (non-secret), token is never exposed."""
    company_id = str(user.active_company_id)
    res = supabase.table("integrations").select("type, is_active, config").eq("company_id", user.tenant).execute()

    result: dict[str, Any] = {
        "windoc": {"configured": False},
        "zoho":   {"configured": False},
        "smtp":   {"configured": False},
    }

    if res and res.data:
        for row in res.data:
            cfg = row.get("config") or {}
            t   = row["type"]
            active = bool(row.get("is_active"))
            if t == "windoc":
                result["windoc"] = {
                    "configured": active and bool(cfg.get("token_app")),
                    "token_app":  cfg.get("token_app", ""),   # safe to expose (app identifier)
                    "base_url":   cfg.get("base_url", ""),
                    # token (secret) is deliberately NOT returned
                    "token": "***" if cfg.get("token") else "",   # sentinel so frontend knows if it's set
                }
            elif t == "zoho_sign":
                result["zoho"] = {"configured": active and bool(cfg.get("client_id"))}
            elif t in ["email", "smtp"]:
                result["smtp"] = {
                    "configured": active,
                    "host": cfg.get("host", ""),
                    "port": cfg.get("port", ""),
                    "username": cfg.get("username", ""),
                    "from_email": cfg.get("from_email", ""),
                }

    return result

@router.put("/integrations/{integration_type}")
async def update_integration(integration_type: str, body: IntegrationUpdate, user: CurrentUser = Depends(require_admin)):
    """Save raw integration configuration safely filtering arbitrary schemas."""
    company_id = str(user.active_company_id)

    try:
        if integration_type == "windoc":
            cfg = WindocConfig(**body.config)
            # If token is omitted (None / empty), preserve the stored one
            if not cfg.token:
                existing_row = supabase.table("integrations").select("config").eq("company_id", user.tenant).eq("type", "windoc").execute()
                stored_token = (existing_row.data[0]["config"] or {}).get("token") if existing_row and existing_row.data else None
                valid_config = {"token_app": cfg.token_app, "token": stored_token or ""}
            else:
                valid_config = {"token_app": cfg.token_app, "token": cfg.token}
            if cfg.base_url:
                valid_config["base_url"] = cfg.base_url
        elif integration_type == "zoho_sign":
            valid_config = ZohoConfig(**body.config).model_dump()
        elif integration_type in ["smtp", "email", "brevo"]:
            integration_type = "smtp"
            smtp_cfg = SmtpConfig(**body.config)
            # Preserve stored password if omitted
            if not smtp_cfg.password:
                existing_row = supabase.table("integrations").select("config").eq("company_id", user.tenant).eq("type", "smtp").execute()
                stored_pw = (existing_row.data[0]["config"] or {}).get("password") if existing_row and existing_row.data else None
                valid_config = smtp_cfg.model_dump(exclude={"password"})
                valid_config["password"] = stored_pw or ""
            else:
                valid_config = smtp_cfg.model_dump()
        else:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Provider di integrazione non supportato.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Configurazione non valida: {str(e)}")

    existing = supabase.table("integrations").select("id").eq("company_id", user.tenant).eq("type", integration_type).execute()

    if existing and existing.data:
        supabase.table("integrations").update({
            "config": valid_config,
            "is_active": True
        }).eq("id", existing.data[0]["id"]).execute()
    else:
        supabase.table("integrations").insert({
            "company_id": company_id,
            "type": integration_type,
            "config": valid_config,
            "is_active": True
        }).execute()

    try:
        supabase.table("audit_logs").insert({
            "company_id": company_id,
            "user_id": str(user.user_id),
            "entity_type": "integration",
            "action": f"{integration_type}_configured",
            "new_values": {"status": "active"}
        }).execute()
    except Exception:
        pass  # audit non-fatal

    return {"message": f"{integration_type} configurato e validato correttamente."}


@router.post("/integrations/windoc/test")
async def test_windoc_connection(body: dict, user: CurrentUser = Depends(require_admin)):
    """Test Windoc connectivity using provided or stored credentials."""
    import httpx

    company_id = str(user.active_company_id)

    # Use provided values, fall back to stored config
    token_app = body.get("token_app", "").strip()
    token     = body.get("token", "").strip()
    base_url  = body.get("base_url", "").strip()

    if not token_app or not token:
        # Load from stored integration
        row = supabase.table("integrations").select("config").eq("company_id", user.tenant).eq("type", "windoc").execute()
        if row and row.data:
            cfg = row.data[0].get("config") or {}
            token_app = token_app or cfg.get("token_app", "")
            token     = token     or cfg.get("token", "")
            base_url  = base_url  or cfg.get("base_url", "")

    if not token_app or not token:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Credenziali Windoc non configurate.")

    api_base = (base_url or "https://api.windoc.it").rstrip("/")

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                f"{api_base}/rubrica",
                headers={
                    "Authorization": f"Token {token_app}:{token}",
                    "Accept": "application/json",
                },
                params={"page": 1, "per_page": 1},
            )
        if r.status_code == 200:
            return {"message": "Connessione Windoc OK ✓", "status": r.status_code}
        else:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Windoc ha risposto con HTTP {r.status_code}")
    except httpx.TimeoutException:
        raise HTTPException(status.HTTP_504_GATEWAY_TIMEOUT, "Timeout connessione Windoc.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Errore connessione Windoc: {str(e)}")
