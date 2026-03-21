"""
modules/companies/router.py — Multi-tenant companies management
GET    /companies                           — list companies accessible by current user
POST   /companies                           — create new company (admin only)
PUT    /companies/{id}                      — rename/update a company (admin only)
DELETE /companies/{id}                      — delete company if empty (admin only)
GET    /companies/{id}/integrations         — get integration status for a company
PUT    /companies/{id}/integrations/{type}  — save Windoc / Zoho integration for a company
"""
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from typing import Optional
import re
import logging

from database import supabase
from auth.middleware import get_current_user, CurrentUser, require_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/companies", tags=["companies"])


# ── Schemas ──────────────────────────────────────────────────

class CreateCompanyRequest(BaseModel):
    name: str
    slug: Optional[str] = None

class UpdateCompanyRequest(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    default_lang: Optional[str] = None

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
    from_email: str

class IntegrationUpdate(BaseModel):
    config: dict


# ── Helpers ──────────────────────────────────────────────────

def _slugify(name: str) -> str:
    """Convert name to a url-safe slug."""
    s = name.lower().strip()
    s = re.sub(r'[^\w\s-]', '', s)
    s = re.sub(r'[\s_-]+', '-', s)
    s = re.sub(r'^-+|-+$', '', s)
    return s or "company"

def _integration_status(company_ids: list[str]) -> dict[str, dict]:
    """Return integration status map { company_id: { windoc: bool, zoho: bool } }."""
    if not company_ids:
        return {}
    res = (
        supabase.table("integrations")
        .select("company_id, type, is_active")
        .in_("company_id", company_ids)
        .execute()
    )
    status_map: dict[str, dict] = {}
    for row in (res.data or []):
        cid = row["company_id"]
        if cid not in status_map:
            status_map[cid] = {"windoc": False, "zoho": False, "email": False}
        if row["type"] == "windoc" and row["is_active"]:
            status_map[cid]["windoc"] = True
        elif row["type"] == "zoho_sign" and row["is_active"]:
            status_map[cid]["zoho"] = True
        elif row["type"] == "email" and row["is_active"]:
            status_map[cid]["email"] = True
    return status_map


# ── GET /companies ────────────────────────────────────────────

@router.get("")
async def list_companies(user: CurrentUser = Depends(get_current_user)):
    """Return all companies the current user has access to, with integration status."""
    uid = str(user.user_id)
    logger.info("list_companies called: user_id=%s role=%s", uid, user.role)

    perms_res = (
        supabase.table("user_company_permissions")
        .select("company_id, role, is_default")
        .eq("user_id", uid)
        .execute()
    )
    perms = perms_res.data or []
    logger.info("list_companies perms query result: %s rows — %s", len(perms), perms)
    if not perms:
        return []

    company_ids = [p["company_id"] for p in perms]

    comp_res = (
        supabase.table("companies")
        .select("id, name, slug, default_lang, logo_url, created_at")
        .in_("id", company_ids)
        .execute()
    )
    companies = comp_res.data or []

    perm_map = {p["company_id"]: p for p in perms}
    int_map  = _integration_status(company_ids)

    result = []
    for c in companies:
        cid  = c["id"]
        perm = perm_map.get(cid, {})
        ints = int_map.get(cid, {"windoc": False, "zoho": False, "email": False})
        result.append({
            **c,
            "role":             perm.get("role", "operator"),
            "is_default":       perm.get("is_default", False),
            "windoc_active":    ints["windoc"],
            "zoho_active":      ints["zoho"],
            "email_active":     ints["email"],
        })

    return result


# ── POST /companies ───────────────────────────────────────────

@router.post("", status_code=201)
async def create_company(
    body: CreateCompanyRequest,
    user: CurrentUser = Depends(require_admin),
):
    """Create a new company and assign the creator as admin."""
    name = body.name.strip()
    if not name:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Il nome azienda è obbligatorio.")

    slug = body.slug or _slugify(name)

    # Ensure slug is unique
    existing = (
        supabase.table("companies")
        .select("id")
        .eq("slug", slug)
        .maybe_single()
        .execute()
    )
    if existing.data:
        slug = f"{slug}-{str(user.user_id)[:4]}"

    try:
        comp_res = supabase.table("companies").insert({
            "name":         name,
            "slug":         slug,
            "default_lang": "it",
            "settings":     {},
        }).execute()
    except Exception as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Errore creazione azienda: {exc}")

    new_company = comp_res.data[0] if comp_res.data else {}
    new_id = new_company.get("id")

    # Assign creator as admin
    if new_id:
        try:
            supabase.table("user_company_permissions").insert({
                "user_id":    str(user.user_id),
                "company_id": new_id,
                "role":       "admin",
                "is_default": False,
            }).execute()
        except Exception as exc:
            logger.warning("create_company: permission insert failed: %s", exc)

    return new_company


# ── PUT /companies/{id} ───────────────────────────────────────

@router.put("/{company_id}")
async def update_company(
    company_id: str,
    body: UpdateCompanyRequest,
    user: CurrentUser = Depends(require_admin),
):
    """Update company name / slug / lang."""
    updates: dict = {}
    if body.name is not None:
        updates["name"] = body.name.strip()
    if body.slug is not None:
        updates["slug"] = body.slug.strip()
    if body.default_lang is not None:
        if body.default_lang not in ("it", "en"):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Lingua non valida.")
        updates["default_lang"] = body.default_lang

    if not updates:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nessun campo da aggiornare.")

    try:
        res = supabase.table("companies").update(updates).eq("id", company_id).execute()
    except Exception as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Errore aggiornamento: {exc}")

    return res.data[0] if res.data else {"message": "Updated"}


# ── DELETE /companies/{id} ────────────────────────────────────

@router.delete("/{company_id}", status_code=204)
async def delete_company(
    company_id: str,
    user: CurrentUser = Depends(require_admin),
):
    """Delete a company only if it has no clients or data."""
    # Guard: cannot delete active company
    if company_id == str(user.active_company_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Non puoi eliminare l'azienda attiva.")

    # Guard: check clients
    clients = supabase.table("clients").select("id").eq("company_id", company_id).limit(1).execute()
    if clients.data:
        raise HTTPException(status.HTTP_409_CONFLICT, "Impossibile eliminare: l'azienda ha clienti associati.")

    # Delete permissions first
    supabase.table("user_company_permissions").delete().eq("company_id", company_id).execute()
    # Delete integrations
    supabase.table("integrations").delete().eq("company_id", company_id).execute()
    # Delete company
    supabase.table("companies").delete().eq("id", company_id).execute()

    return None


# ── GET /companies/{id}/integrations ─────────────────────────

@router.get("/{company_id}/integrations")
async def get_company_integrations(
    company_id: str,
    user: CurrentUser = Depends(require_admin),
):
    """Return integration status (safe, no secrets) for a specific company."""
    res = (
        supabase.table("integrations")
        .select("type, is_active, last_sync_at")
        .eq("company_id", company_id)
        .execute()
    )
    by_type: dict = {}
    for row in (res.data or []):
        by_type[row["type"]] = {
            "is_active":    row["is_active"],
            "last_sync_at": row.get("last_sync_at"),
        }
    return {
        "windoc":   by_type.get("windoc",    {"is_active": False, "last_sync_at": None}),
        "zoho_sign": by_type.get("zoho_sign", {"is_active": False, "last_sync_at": None}),
        "email":    by_type.get("email",     {"is_active": False, "last_sync_at": None}),
    }


# ── PUT /companies/{id}/integrations/{type} ───────────────────

@router.put("/{company_id}/integrations/{integration_type}")
async def update_company_integration(
    company_id: str,
    integration_type: str,
    body: IntegrationUpdate,
    user: CurrentUser = Depends(require_admin),
):
    """Save an integration config for a specific company (not necessarily the active one)."""
    # Validate config shape per type
    try:
        if integration_type == "windoc":
            valid_config = WindocConfig(**body.config).model_dump()
        elif integration_type == "zoho_sign":
            valid_config = ZohoConfig(**body.config).model_dump()
        elif integration_type in ("smtp", "email"):
            integration_type = "email"
            valid_config = SmtpConfig(**body.config).model_dump()
        else:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Provider non supportato.")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Configurazione non valida: {exc}")

    # Upsert
    existing = (
        supabase.table("integrations")
        .select("id")
        .eq("company_id", company_id)
        .eq("type", integration_type)
        .maybe_single()
        .execute()
    )
    if existing.data:
        supabase.table("integrations").update({
            "config":    valid_config,
            "is_active": True,
        }).eq("id", existing.data["id"]).execute()
    else:
        supabase.table("integrations").insert({
            "company_id": company_id,
            "type":       integration_type,
            "config":     valid_config,
            "is_active":  True,
        }).execute()

    # Audit
    try:
        supabase.table("audit_logs").insert({
            "company_id":  str(user.active_company_id),
            "user_id":     str(user.user_id),
            "entity_type": "integration",
            "action":      f"{integration_type}_configured",
            "new_values":  {"target_company": company_id, "status": "active"},
        }).execute()
    except Exception:
        pass

    return {"message": f"{integration_type} configurato per l'azienda {company_id}"}
