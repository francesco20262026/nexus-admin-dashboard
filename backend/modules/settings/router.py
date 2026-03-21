from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel, EmailStr
from typing import Optional, Any
from uuid import UUID

from database import supabase
from auth.middleware import get_current_user, CurrentUser, require_admin

router = APIRouter(prefix="/settings", tags=["settings"])

# ── Schemas ──────────────────────────────────────────────────

class UserSettingsUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    lang: Optional[str] = None

class CompanySettingsUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    lang: Optional[str] = None

class WindocConfig(BaseModel):
    token_app: str
    token: str

class ZohoConfig(BaseModel):
    client_id: str
    client_secret: str
    refresh_token: str
    domain: str = "eu"

class SmtpConfig(BaseModel):
    host: str
    port: int
    username: str
    password: str
    from_email: EmailStr

class IntegrationUpdate(BaseModel):
    config: dict

# ── Endpoints ────────────────────────────────────────────────

@router.get("/me")
async def get_my_settings(user: CurrentUser = Depends(get_current_user)):
    """Return the current user's profile settings."""
    res = supabase.table("users").select("id, name, email, lang").eq("id", str(user.user_id)).single().execute()
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
    return res.data[0] if res.data else {}

@router.get("/company")
async def get_company_settings(user: CurrentUser = Depends(require_admin)):
    """Return the current active company's settings."""
    company_id = str(user.active_company_id)
    # Select available safe schema fields. If 'lang' doesn't exist, we don't mock it.
    res = supabase.table("companies").select("id, name, email, domain").eq("id", company_id).single().execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Company not found")
    
    return res.data

@router.put("/company")
async def update_company_settings(body: CompanySettingsUpdate, user: CurrentUser = Depends(require_admin)):
    """Update the current active company's settings."""
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        return {"message": "No updates provided"}
    
    # Do not directly save lang back if companies doesn't enforce it, but we map allowed fields
    db_updates: dict[str, Any] = {}
    if "name" in updates: db_updates["name"] = updates["name"]
    if "email" in updates: db_updates["email"] = updates["email"]
    
    if db_updates:
        res = supabase.table("companies").update(db_updates).eq("id", str(user.active_company_id)).execute()
        
        # Log action
        supabase.table("audit_logs").insert({
            "company_id": str(user.active_company_id),
            "user_id": str(user.user_id),
            "entity_type": "company",
            "action": "settings_updated",
            "new_values": db_updates
        }).execute()

    return {"message": "Company updated successfully"}

@router.get("/integrations")
async def get_integrations_status(user: CurrentUser = Depends(require_admin)):
    """Return safe metadata for configured integrations (no secrets)."""
    company_id = str(user.active_company_id)
    res = supabase.table("integrations").select("type, is_active").eq("company_id", company_id).execute()
    
    # Default status map
    statuses = {
        "windoc_configured": False,
        "zoho_configured": False,
        "email_provider": "none"
    }

    if res.data:
        for row in res.data:
            if row["type"] == "windoc" and row["is_active"]:
                statuses["windoc_configured"] = True
            elif row["type"] == "zoho_sign" and row["is_active"]:
                statuses["zoho_configured"] = True
            elif row["type"] == "email" and row["is_active"]:
                statuses["email_provider"] = "configured" # Or extract provider name from metadata if needed

    return statuses

@router.put("/integrations/{integration_type}")
async def update_integration(integration_type: str, body: IntegrationUpdate, user: CurrentUser = Depends(require_admin)):
    """Save raw integration configuration safely filtering arbitrary schemas."""
    company_id = str(user.active_company_id)
    
    # Validation Whitelist
    try:
        if integration_type == "windoc":
            valid_config = WindocConfig(**body.config).model_dump()
        elif integration_type == "zoho_sign":
            valid_config = ZohoConfig(**body.config).model_dump()
        elif integration_type in ["smtp", "email"]:
            integration_type = "email"
            valid_config = SmtpConfig(**body.config).model_dump()
        else:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Provider di integrazione non supportato.")
    except Exception as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Configurazione non valida: {str(e)}")

    existing = supabase.table("integrations").select("id").eq("company_id", company_id).eq("type", integration_type).execute()

    if existing.data:
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

    supabase.table("audit_logs").insert({
        "company_id": company_id,
        "user_id": str(user.user_id),
        "entity_type": "integration",
        "action": f"{integration_type}_configured",
        "new_values": {"status": "active"}
    }).execute()

    return {"message": f"{integration_type} configurato e validato correttamente."}

