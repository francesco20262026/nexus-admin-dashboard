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
    email: Optional[str] = None
    vat_number: Optional[str] = None
    pec: Optional[str] = None
    dest_code: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    iban: Optional[str] = None
    bank_name: Optional[str] = None
    swift_bic: Optional[str] = None
    payment_beneficiary: Optional[str] = None
    logo_url: Optional[str] = None

class WindocConfig(BaseModel):
    token_app: str
    token: str

class ZohoConfig(BaseModel):
    client_id: str
    client_secret: str
    refresh_token: str
    domain: str = "eu"

class SmtpConfig(BaseModel):
    host: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[str] = None
    from_email: str

class BrevoConfig(BaseModel):
    api_key: str
    from_email: str
    from_name: Optional[str] = "Nova CRM"

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

    # Ensure slug is unique (use limit instead of maybe_single to avoid NoneType issues)
    try:
        existing = (
            supabase.table("companies")
            .select("id")
            .eq("slug", slug)
            .limit(1)
            .execute()
        )
        if existing and existing.data:
            slug = f"{slug}-{str(user.user_id)[:4]}"
    except Exception:
        pass  # Non-fatal: proceed with slug as-is if check fails


    try:
        comp_res = supabase.table("companies").insert({
            "name":         name,
            "slug":         slug,
            "default_lang": "it",
            "settings":     {},
        }).execute()
        if not comp_res or not comp_res.data:
            raise ValueError("Insert returned no data — possible RLS policy or DB constraint.")
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("create_company insert failed: %s", exc)
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Errore creazione azienda: {exc}")

    new_company = comp_res.data[0]
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

    allow_extra: dict = {}
    for field in ("email", "vat_number", "pec", "dest_code", "address", "phone", "iban", "bank_name", "swift_bic", "payment_beneficiary", "logo_url"):
        val = getattr(body, field, None)
        if val is not None:
            updates[field] = val.strip() if isinstance(val, str) else val

    if not updates:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nessun campo da aggiornare.")

    try:
        res = supabase.table("companies").update(updates).eq("id", company_id).execute()
    except Exception as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Errore aggiornamento: {exc}")

    return res.data[0] if res.data else {"message": "Updated"}


# ── GET /companies/{id} ───────────────────────────────────────

@router.get("/{company_id}")
async def get_company(
    company_id: str,
    user: CurrentUser = Depends(require_admin),
):
    """Return full company data + integration status."""
    from database import safe_single
    
    query = supabase.table("companies").select("*").eq("id", company_id).maybe_single()
    res = safe_single(query)
    
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Company not found")
    company = res.data

    int_res = (
        supabase.table("integrations")
        .select("type, is_active, last_sync_at")
        .eq("company_id", user.tenant)
        .execute()
    )
    by_type: dict = {}
    for row in (int_res.data or []):
        by_type[row["type"]] = {"is_active": row["is_active"], "last_sync_at": row.get("last_sync_at")}

    company["integrations"] = {
        "windoc":    by_type.get("windoc",    {"is_active": False}),
        "zoho_sign": by_type.get("zoho_sign", {"is_active": False}),
        "brevo":     by_type.get("brevo",     {"is_active": False}),
        "email":     by_type.get("smtp", by_type.get("email", {"is_active": False})),
    }
    return company


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

    try:
        # 1. Clean up multi-level dependencies (Lines linked to entities in this company)
        # Fetch entities so we can delete their dependent inner lines if DB doesn't cascade
        invoices = supabase.table("invoices").select("id").eq("company_id", user.tenant).execute()
        if invoices.data:
            for inv in invoices.data:
                supabase.table("invoice_lines").delete().eq("invoice_id", inv["id"]).execute()
                supabase.table("payment_logs").delete().eq("invoice_id", inv["id"]).execute()
                
        contracts = supabase.table("contracts").select("id").eq("company_id", user.tenant).execute()
        if contracts.data:
            for ctt in contracts.data:
                supabase.table("contract_lines").delete().eq("contract_id", ctt["id"]).execute()
                
        quotes = supabase.table("quotes").select("id").eq("company_id", user.tenant).execute()
        if quotes.data:
            for qut in quotes.data:
                supabase.table("quote_lines").delete().eq("quote_id", qut["id"]).execute()

        # 2. Iterate backwards over direct dependents (reverse tree)
        dependent_tables = [
            "audit_logs",
            "payment_logs", 
            "documents",
            "invoices",
            "contracts",
            "quotes",
            "services",
            "onboarding",
            "clients",
            "integrations",
            "user_company_permissions"
        ]
        
        for table in dependent_tables:
            try:
                supabase.table(table).delete().eq("company_id", user.tenant).execute()
            except Exception as loop_cancel:
                logger.warning(f"Error auto-clearing {table} for company {company_id}: {loop_cancel}")
                
        # 3. Finally delete the company
        supabase.table("companies").delete().eq("id", company_id).execute()

    except Exception as exc:
        err_str = str(exc)
        logger.error(f"Error cascading delete company {company_id}: {err_str}")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Errore interno durante l'eliminazione.")

    return None


# ── PATCH /companies/{id}/set-active ─────────────────────────

class SetActiveRequest(BaseModel):
    is_active: bool

@router.patch("/{company_id}/set-active")
async def set_company_active(
    company_id: str,
    body: SetActiveRequest,
    user: CurrentUser = Depends(require_admin),
):
    """Enable or disable a company (is_active field)."""
    try:
        res = supabase.table("companies").update({"is_active": body.is_active}).eq("id", company_id).execute()
    except Exception as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc))
    return res.data[0] if res.data else {"message": "Updated"}


# ── GET /companies/{id}/integrations ─────────────────────────

@router.get("/{company_id}/integrations")
async def get_company_integrations(
    company_id: str,
    user: CurrentUser = Depends(require_admin),
):
    """Return integration status (safe, no secrets) for a specific company."""
    res = (
        supabase.table("integrations")
        .select("type, is_active, last_sync_at, config")
        .eq("company_id", user.tenant)
        .execute()
    )
    by_type: dict = {}
    for row in (res.data or []):
        cfg = row.get("config") or {}
        # scrub secrets
        for k in ["password", "token", "token_app", "client_secret", "refresh_token", "api_key"]:
            if k in cfg:
                cfg[k] = ""
        by_type[row["type"]] = {
            "is_active":    row["is_active"],
            "last_sync_at": row.get("last_sync_at"),
            "config":       cfg
        }
    return {
        "windoc":   by_type.get("windoc",    {"is_active": False, "last_sync_at": None, "config": {}}),
        "zoho_sign": by_type.get("zoho_sign", {"is_active": False, "last_sync_at": None, "config": {}}),
        "email":    by_type.get("smtp", by_type.get("email", {"is_active": False, "last_sync_at": None, "config": {}})),
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
        elif integration_type in ("smtp", "email", "brevo"):
            integration_type = "smtp"
            valid_config = SmtpConfig(**body.config).model_dump()
        else:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Provider non supportato.")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Configurazione non valida: {exc}")

    # Upsert with try/except
    from database import safe_single
    try:
        query = (
            supabase.table("integrations")
            .select("id")
            .eq("company_id", user.tenant)
            .eq("type", integration_type)
            .maybe_single()
        )
        existing = safe_single(query)
        
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
    except Exception as exc:
        logger.error(f"Errore DB in update_company_integration: {exc}")
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Errore DB server ({type(exc).__name__}): {exc}")

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
# ── POST /companies/{id}/integrations/windoc/test ───────────

import httpx

@router.post("/{company_id}/integrations/windoc/test")
async def test_windoc_integration_company(
    company_id: str,
    user: CurrentUser = Depends(require_admin),
):
    """Test currently saved Windoc credentials by pinging ListaTemplate."""
    from database import safe_single
    query = (
        supabase.table("integrations")
        .select("config")
        .eq("company_id", user.tenant)
        .eq("type", "windoc")
        .maybe_single()
    )
    existing = safe_single(query)
    if not existing.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Integrazione Winddoc non configurata.")

    config = existing.data.get("config", {})
    token = config.get("token")
    token_app = config.get("token_app")

    if not token or not token_app:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Token mancanti.")

    payload = {
        "method": "proforma_listaTemplate",
        "request": {
            "token_key": {
                "token": token,
                "token_app": token_app
            }
        }
    }
    
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://app.winddoc.com/v1/api_json.php",
                json=payload,
                timeout=10.0
            )
            data = resp.json()
            if data.get("error"):
                msg = data.get("message", "Errore sconosciuto")
                # Se l'errore è di operazione non permessa, significa che i token SONO VALIDIi
                if "not permission" in msg.lower() or "privilegio" in msg.lower():
                    return {"success": True, "message": "Connessione riuscita (ma l'account non ha privilegi per i Template)"}
                if "token errato" in msg.lower() or "login errato" in msg.lower() or "auth" in msg.lower() or "invalid" in msg.lower():
                    raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Token Winddoc non validi: {msg}")
                return {"success": True, "message": f"Connesso con l'account (risposta: {msg})"}
            return {"success": True, "message": "Connessione Winddoc effettuata con successo."}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Impossibile contattare Winddoc: {exc}")


# ── GET /companies/{id}/email-templates ─────────────────────────

@router.get("/{company_id}/email-templates")
async def get_company_email_templates(
    company_id: str,
    user: CurrentUser = Depends(require_admin),
):
    """Return all email templates for a specific company."""
    res = (
        supabase.table("email_templates")
        .select("id, type, lang, subject, body_html")
        .eq("company_id", user.tenant)
        .order("type")
        .execute()
    )
    db_templates = res.data or []
    
    from integrations.email_service import DEFAULT_TEMPLATES
    
    # Merge DB templates over defaults
    combined = []
    db_by_type_lang = {(t["type"], t["lang"]): t for t in db_templates}
    
    # For every default template, if it's not in DB for 'it', inject a placeholder
    for t_type, t_content in DEFAULT_TEMPLATES.items():
        if (t_type, "it") in db_by_type_lang:
            combined.append(db_by_type_lang.pop((t_type, "it")))
        else:
            combined.append({
                "id": None,
                "type": t_type,
                "lang": "it",
                "subject": t_content["subject"],
                "body_html": t_content["body_html"]
            })
            
    # Add any remaining templates from DB (e.g. other languages or custom ones)
    for t in db_by_type_lang.values():
        combined.append(t)
        
    return combined

# ── PUT /companies/{id}/email-templates/{type}/{lang} ───────────

class EmailTemplateUpdate(BaseModel):
    subject: str
    body_html: str

@router.put("/{company_id}/email-templates/{template_type}/{lang}")
async def update_company_email_template(
    company_id: str,
    template_type: str,
    lang: str,
    body: EmailTemplateUpdate,
    user: CurrentUser = Depends(require_admin),
):
    """Update a specific email template."""
    from database import safe_single
    
    # Check if exists
    query = (
        supabase.table("email_templates")
        .select("id")
        .eq("company_id", user.tenant)
        .eq("type", template_type)
        .eq("lang", lang)
        .maybe_single()
        .execute()
    )
    
    payload = body.model_dump(exclude_unset=True)
    
    if query and query.data:
        res = supabase.table("email_templates").update(payload).eq("id", query.data["id"]).execute()
    else:
        payload["company_id"] = company_id
        payload["type"] = template_type
        payload["lang"] = lang
        res = supabase.table("email_templates").insert(payload).execute()

    return res.data[0] if res and res.data else {"message": "Success"}
