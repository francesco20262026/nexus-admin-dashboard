"""
modules/contracts/router.py — CRUD + Zoho Sign send + status update
"""
import logging
import re
from datetime import date
from fastapi import APIRouter, HTTPException, status, Depends, Query, UploadFile, File, Form
from pydantic import BaseModel, field_validator
from uuid import UUID
from typing import Optional

from auth.middleware import get_current_user, require_admin, CurrentUser
from database import supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/contracts", tags=["contracts"])

# ── Schemas ──────────────────────────────────────────────────

class ContractCreate(BaseModel):
    client_id:    Optional[UUID] = None   # null if creating for a prospect
    onboarding_id: Optional[UUID] = None  # link to onboarding during pre-conversion
    title: str
    template_id: Optional[UUID] = None
    service_id: Optional[UUID] = None   # linked catalog service
    service_ids: list[UUID] = []        # multiple services
    quote_id:   Optional[UUID] = None   # preventivo accettato di origine
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None
    # Origin tracking (added by contract_templates_extend.sql migration)
    origin: str = "direct"                        # 'direct' | 'from_quote' | 'supplier_change'
    source_company_id: Optional[UUID] = None      # old supplier (for supplier_change)
    supplier_company_id: Optional[UUID] = None    # active supplier at creation time


class ContractUpdate(BaseModel):
    title: Optional[str] = None
    client_id: Optional[UUID] = None
    onboarding_id: Optional[UUID] = None
    template_id: Optional[UUID] = None
    service_id: Optional[UUID] = None
    service_ids: Optional[list[UUID]] = None
    status: Optional[str] = None
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None
    origin: Optional[str] = None
    source_company_id: Optional[UUID] = None
    supplier_company_id: Optional[UUID] = None


# ── Helpers ──────────────────────────────────────────────────

def _audit(user: CurrentUser, entity_id: str, action: str,
           old: Optional[dict] = None, new: Optional[dict] = None) -> None:
    """Write an audit log entry. Failures are logged but never bubble up."""
    try:
        supabase.table("audit_logs").insert({
            "company_id":  str(user.active_company_id),
            "user_id":     str(user.user_id),
            "entity_type": "contract",
            "entity_id":   entity_id,
            "action":      action,
            "old_values":  old,
            "new_values":  new,
        }).execute()
    except Exception as exc:
        logger.warning("audit_log write failed for contract %s: %s", entity_id, exc)


def _require_contract(contract_id: UUID, user: CurrentUser, select: str = "*") -> dict:
    """
    Fetch a contract asserting it exists within the given company.
    Raises 404 if not found or belongs to another tenant.
    """
    res = (
        supabase.table("contracts")
        .select(select)
        .eq("id", str(contract_id))
        .eq("company_id", str(user.active_company_id))
        .maybe_single()
        .execute()
    )
    if res and getattr(res, "data", None):
        return res.data

    if user.is_admin:
        res_any = supabase.table("contracts").select(select).eq("id", str(contract_id)).maybe_single().execute()
        if res_any and getattr(res_any, "data", None):
            return res_any.data

    raise HTTPException(status.HTTP_404_NOT_FOUND, "Contract not found")


# ── Document Templates (registered BEFORE /{contract_id} to avoid shadowing) ─

class TemplateCreate(BaseModel):
    name: str
    content: str
    type: str = "contract"
    lang: str = "it"
    is_default: bool = False
    is_active: bool = True
    company_id: Optional[str] = None
    # Governance fields (added by contract_templates_extend.sql migration)
    contract_type: Optional[str] = None           # 'service','maintenance','consulting','other'
    version: Optional[str] = None                 # e.g. '1.0', '2025-v1'
    supplier_company_id: Optional[str] = None     # FK to companies
    notes: Optional[str] = None
    compatible_service_ids: Optional[list] = None # list of UUID strings

class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    content: Optional[str] = None
    is_default: Optional[bool] = None
    is_active: Optional[bool] = None
    contract_type: Optional[str] = None
    version: Optional[str] = None
    supplier_company_id: Optional[str] = None
    notes: Optional[str] = None
    compatible_service_ids: Optional[list] = None

@router.get("/templates/list")
async def list_templates(
    doc_type: Optional[str] = None,
    company_id: Optional[str] = None,
    is_active: Optional[bool] = Query(None),
    contract_type: Optional[str] = Query(None),
    user: CurrentUser = Depends(require_admin),
):
    try:
        q = (
            supabase.table("document_templates")
            .select("id,name,type,lang,content,is_default,is_active,contract_type,version,supplier_company_id,notes,compatible_service_ids,created_at,company_id")
        )
        if company_id:
            q = q.eq("company_id", str(company_id))
        elif not user.is_admin:
            q = q.eq("company_id", str(user.active_company_id))

        if doc_type: q = q.eq("type", doc_type)
        if is_active is not None: q = q.eq("is_active", is_active)
        if contract_type: q = q.eq("contract_type", contract_type)
        res = q.order("name").execute()
        rows = res.data or []
    except Exception as e:
        # Fallback for pre-migration schemas that don't have new columns nor companies FK
        q_fallback = (
            supabase.table("document_templates")
            .select("id,name,type,lang,content,is_default,company_id")
        )
        if company_id:
            q_fallback = q_fallback.eq("company_id", str(company_id))
        elif not user.is_admin:
            q_fallback = q_fallback.eq("company_id", str(user.active_company_id))
            
        if doc_type: q_fallback = q_fallback.eq("type", doc_type)
        res = q_fallback.order("name").execute()
        rows = res.data or []

    for r in rows:
        r.setdefault("is_active", True)
        r.setdefault("contract_type", None)
        r.setdefault("version", None)
        r.setdefault("supplier_company_id", None)
        r.setdefault("notes", None)
        r.setdefault("compatible_service_ids", [])
    return rows

@router.get("/templates/{template_id}")
async def get_template(
    template_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    res = (
        supabase.table("document_templates")
        .select("*")
        .eq("id", str(template_id))
        .maybe_single()
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "Template non trovato")
    return res.data

@router.post("/templates", status_code=201)
async def create_template(
    body: TemplateCreate,
    user: CurrentUser = Depends(require_admin),
):
    target_company = str(body.company_id) if body.company_id else str(user.active_company_id)
    row = {**body.model_dump(exclude={"company_id"}, exclude_unset=True), "company_id": target_company}
    res = supabase.table("document_templates").insert(row).execute()
    if not res.data:
        raise HTTPException(500, "Errore durante la creazione del template")
    return res.data[0]

@router.put("/templates/{template_id}")
async def update_template(
    template_id: UUID,
    body: TemplateUpdate,
    user: CurrentUser = Depends(require_admin),
):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Nessun campo da aggiornare")
    res = (
        supabase.table("document_templates").update(updates)
        .eq("id", str(template_id))
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "Template non trovato")
    return res.data[0]

@router.delete("/templates/{template_id}", status_code=204)
async def delete_template(
    template_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    supabase.table("document_templates").delete().eq(
        "id", str(template_id)
    ).execute()


# ── List ─────────────────────────────────────────────────────

@router.get("/")
async def list_contracts(
    client_id: Optional[UUID] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    origin: Optional[str] = Query(None),
    supplier_company_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: CurrentUser = Depends(get_current_user),
):
    q = supabase.table("contracts").select("*, clients(name,email), document_templates!contracts_template_id_fkey(name,type,contract_type,version), onboarding!contracts_onboarding_id_fkey(company_name,email), companies!contracts_supplier_company_id_fkey(name)", count="exact")
    
    if user.is_admin:
        if supplier_company_id:
            q = q.eq("company_id", str(supplier_company_id))
    else:
        q = q.eq("company_id", str(user.active_company_id))

    if not user.is_admin:
        if not user.client_id:
            return {"data": [], "total": 0, "page": page, "page_size": page_size}
        q = q.eq("client_id", str(user.client_id))
    if client_id:
        q = q.eq("client_id", str(client_id))
    if status_filter:
        q = q.eq("status", status_filter)
    if origin:
        try:
            q = q.eq("origin", origin)
        except Exception:
            pass  # column not yet migrated
    if supplier_company_id:
        try:
            q = q.eq("supplier_company_id", supplier_company_id)
        except Exception:
            pass

    offset = (page - 1) * page_size
    res = q.order("created_at", desc=True).range(offset, offset + page_size - 1).execute()
    rows = res.data or []
    # Backfill origin for pre-migration rows
    for r in rows:
        r.setdefault("origin", "from_quote" if r.get("quote_id") else "direct")
        r.setdefault("supplier_company_id", None)
        r.setdefault("source_company_id", None)
    return {"data": rows, "total": res.count or 0, "page": page, "page_size": page_size}


# ── Create ────────────────────────────────────────────────────

@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_contract(
    body: ContractCreate,
    user: CurrentUser = Depends(require_admin),
):
    try:
        if not body.client_id and not body.onboarding_id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                                "Specificare client_id oppure onboarding_id")

        # If only onboarding_id, fetch client_id from it (if already converted)
        effective_client_id = body.client_id
        if not effective_client_id and body.onboarding_id:
            onb = supabase.table("onboarding").select("client_id").eq(
                "id", str(body.onboarding_id)).maybe_single().execute()
            if onb and getattr(onb, "data", None) and onb.data.get("client_id"):
                effective_client_id = onb.data["client_id"]

        row: dict = {
            "title":      body.title,
            "company_id": str(user.active_company_id),
            "status":     "draft",
        }
        if effective_client_id:
            row["client_id"] = str(effective_client_id)
        if body.onboarding_id:
            row["onboarding_id"] = str(body.onboarding_id)
        if body.template_id:
            row["template_id"] = str(body.template_id)
        if body.quote_id:
            row["quote_id"] = str(body.quote_id)
        if body.valid_from:
            row["valid_from"] = body.valid_from.isoformat()
        if body.valid_to:
            row["valid_to"] = body.valid_to.isoformat()
        
        _origin = body.origin or ("from_quote" if body.quote_id else "direct")
        try:
            row["origin"] = _origin
            if body.source_company_id:
                row["source_company_id"] = str(body.source_company_id)
            if body.supplier_company_id:
                row["supplier_company_id"] = str(body.supplier_company_id)
        except Exception:
            pass

        try:
            res = supabase.table("contracts").insert(row).execute()
        except Exception as exc:
            logger.warning("Insert failed: %s", exc)
            raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Errore db: {exc}")
            
        if not res.data:
            logger.error("create_contract: insert returned no data")
            raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Failed to create contract")
        contract = res.data[0]

        # Link services via contract_services junction table
        s_ids = set(str(sid) for sid in body.service_ids)
        if body.service_id:
            s_ids.add(str(body.service_id))
        if s_ids:
            cs_rows = [{"contract_id": contract["id"], "service_id": sid} for sid in s_ids]
            try:
                supabase.table("contract_services").insert(cs_rows).execute()
            except Exception as exc:
                logger.warning("contract_services insert failed: %s", exc)

        _audit(user, contract["id"], "create", new=contract)
        
        # Log to Timeline
        from modules.activity.router import log_timeline_event
        log_timeline_event(
            company_id=str(user.active_company_id), actor_user_id=str(user.user_id),
            event_type="system", title="Contratto creato in bozza",
            client_id=contract.get("client_id"), onboarding_id=contract.get("onboarding_id"),
            body=body.title
        )

        # Auto-advance onboarding to contract_draft
        if contract.get("onboarding_id") or contract.get("client_id"):
            from automation import auto_advance_onboarding
            oid = contract.get("onboarding_id")
            if not oid and contract.get("client_id"):
                onb_res = supabase.table("onboarding").select("id").eq("client_id", str(contract["client_id"])).eq("status", "quote_accepted").maybe_single().execute()
                if onb_res and getattr(onb_res, "data", None):
                    oid = onb_res.data["id"]
            if oid:
                auto_advance_onboarding(str(user.active_company_id), str(user.user_id), oid, "contract_draft", "Contratto in bozza generato")
                
        return contract

    except Exception as exc:
        import traceback
        traceback.print_exc()
        logger.error(f"FATAL ERROR in create_contract: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail=f"Errore fatale salvataggio contratto: {exc}"
        )



# ── Upload Manual Contract ────────────────────────────────────

@router.post("/upload-signed", status_code=status.HTTP_201_CREATED)
async def upload_manual_contract(
    title: str = Form(...),
    client_id: Optional[UUID] = Form(None),
    onboarding_id: Optional[UUID] = Form(None),
    file: UploadFile = File(...),
    user: CurrentUser = Depends(require_admin),
):
    """
    Manually upload a signed PDF contract without going through Zoho Sign.
    Creates both a Documents reference and a Contracts record in 'signed' status.
    """
    if not client_id and not onboarding_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Specificare client_id oppure onboarding_id")

    company_id = str(user.active_company_id)
    effective_client_id = client_id

    if not effective_client_id and onboarding_id:
        onb = supabase.table("onboarding").select("client_id").eq("id", str(onboarding_id)).maybe_single().execute()
        if getattr(onb, "data", None) and onb.data.get("client_id"):
            effective_client_id = onb.data["client_id"]

    file_bytes = await file.read()
    if len(file_bytes) > 50 * 1024 * 1024:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Il file supera il limite di 50 MB")

    import re
    from datetime import datetime, timezone
    safe_name = re.sub(r"[^\w\-. ]", "_", file.filename.replace("\\", "/").split("/")[-1]) or "contract.pdf"
    ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
    storage_path = f"{company_id}/{effective_client_id or onboarding_id}/{ts}_manual_{safe_name}"

    try:
        supabase.storage.from_("nexus-documents").upload(
            path=storage_path,
            file=file_bytes,
            file_options={"content-type": file.content_type or "application/pdf"},
        )
    except Exception as exc:
        logger.error("Storage upload failed path=%s: %s", storage_path, exc)
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Errore caricamento storage: {exc}")

    # Create Contract record
    now_iso = datetime.now(timezone.utc).isoformat()
    row = {
        "title": title,
        "company_id": company_id,
        "status": "signed",
        "pdf_url": storage_path,
        "signed_at": now_iso,
    }
    if effective_client_id:
        row["client_id"] = str(effective_client_id)
    if onboarding_id:
        row["onboarding_id"] = str(onboarding_id)

    res = supabase.table("contracts").insert(row).execute()
    if not res.data:
        # Cleanup
        try: supabase.storage.from_("nexus-documents").remove([storage_path])
        except Exception: pass
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Impossibile creare il contratto")
    
    contract = res.data[0]
    contract_id = contract["id"]

    # Create Document record
    try:
        supabase.table("documents").insert({
            "company_id": company_id,
            "client_id": str(effective_client_id) if effective_client_id else None,
            "onboarding_id": str(onboarding_id) if (not effective_client_id and onboarding_id) else None,
            "contract_id": contract_id,
            "name": f"{title} (Firmato manualmente)",
            "type": "contract",
            "storage_path": storage_path,
            "status": "signed",
        }).execute()
    except Exception as exc:
        logger.warning("Failed to create document record for manual contract %s: %s", contract_id, exc)

    _audit(user, contract_id, "upload_manual", new={"title": title, "pdf_url": storage_path, "status": "signed"})

    # Log to Timeline
    from modules.activity.router import log_timeline_event
    log_timeline_event(
        company_id=str(user.active_company_id), actor_user_id=str(user.user_id),
        event_type="contract_signed", title="Contratto caricato e firmato",
        client_id=str(effective_client_id) if effective_client_id else None,
        onboarding_id=str(onboarding_id) if onboarding_id else None,
        body=title
    )

    # Auto advance
    if onboarding_id or effective_client_id:
        from automation import auto_advance_onboarding
        oid = onboarding_id
        if not oid and effective_client_id:
            onb_res = supabase.table("onboarding").select("id").eq("client_id", str(effective_client_id)).eq("status", "quote_accepted").maybe_single().execute()
            if onb_res and getattr(onb_res, "data", None): oid = onb_res.data["id"]
        if oid:
            auto_advance_onboarding(company_id, str(user.user_id), oid, "contract_signed", f"Contratto PDF ({title}) caricato manualmente")
            
    # Auto proforma
    try:
        _auto_create_proforma_after_sign(
            contract=contract,
            contract_id=str(contract_id),
            company_id=company_id,
            user_id=str(user.user_id),
            signed_at=now_iso
        )
    except Exception as exc:
        logger.warning("Auto proforma failed for manual contract %s: %s", contract_id, exc)

    return contract


# ── Get ───────────────────────────────────────────────────────

@router.get("/{contract_id}")
async def get_contract(
    contract_id: UUID,
    user: CurrentUser = Depends(get_current_user),
):
    # Enforce non-admin ownership before DB fetch
    if not user.is_admin and not user.client_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN)

    contract = _require_contract(
        contract_id,
        user,
        select="*, clients(name,email), document_templates(name,content), onboarding!contracts_onboarding_id_fkey(company_name,email)",
    )
    if not user.is_admin and str(contract.get("client_id")) != str(user.client_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN)
    return contract


# ── Update ────────────────────────────────────────────────────

@router.put("/{contract_id}")
async def update_contract(
    contract_id: UUID,
    body: ContractUpdate,
    user: CurrentUser = Depends(require_admin),
):
    old = _require_contract(contract_id, user)

    updates: dict = {}
    if body.title is not None:
        updates["title"] = body.title
    
    # If client/onboarding changed, apply
    if body.client_id is not None or body.onboarding_id is not None:
        updates["client_id"] = str(body.client_id) if body.client_id else None
        updates["onboarding_id"] = str(body.onboarding_id) if body.onboarding_id else None

    if body.template_id is not None:
        updates["template_id"] = str(body.template_id)
    if body.status is not None:
        updates["status"] = body.status
    if body.valid_from is not None:
        updates["valid_from"] = body.valid_from.isoformat()
    if body.valid_to is not None:
        updates["valid_to"] = body.valid_to.isoformat()

    if updates:
        res = (
            supabase.table("contracts")
            .update(updates)
            .eq("id", str(contract_id))
            .eq("company_id", old.get("company_id", str(user.active_company_id)))   # tenant safety
            .execute()
        )
        if not res.data:
            raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Update returned no data")
    
    # Update services if provided
    if body.service_ids is not None:
        s_ids = set(str(sid) for sid in body.service_ids)
        if body.service_id:
            s_ids.add(str(body.service_id))
            
        # Clear old services
        supabase.table("contract_services").delete().eq("contract_id", str(contract_id)).execute()
        
        # Insert new ones
        if s_ids:
            cs_rows = [{"contract_id": str(contract_id), "service_id": sid} for sid in s_ids]
            try:
                supabase.table("contract_services").insert(cs_rows).execute()
            except Exception as exc:
                logger.warning("contract_services update failed: %s", exc)

    _audit(user, str(contract_id), "update", old=old, new=updates)
    
    # Return updated contract
    return _require_contract(contract_id, user)


# ── Delete ────────────────────────────────────────────────────

@router.delete("/{contract_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contract(
    contract_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    old = _require_contract(contract_id, user)
    # Block deletion of contracts that are in-flight or signed
    if old.get("status") in ("sent", "signed", "completed"):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot delete a contract with status '{old.get('status')}'. Archive or cancel it first.",
        )
    try:
        supabase.table("contract_services").delete().eq("contract_id", str(contract_id)).execute()
    except Exception as e:
        logger.warning(f"Could not delete contract_services: {e}")

    supabase.table("contracts").delete().eq("id", str(contract_id)).eq("company_id", old.get("company_id", str(user.active_company_id))).execute()
    _audit(user, str(contract_id), "delete", old=old)


# ── Compile (fill template with real data) ────────────────────

@router.post("/{contract_id}/compile")
async def compile_contract(
    contract_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    """
    Merges the linked document template with client, service and company data.
    Result is saved as compiled_content on the contract and returned.
    Placeholders: {{cliente_*}}, {{servizio_*}}, {{fornitore_*}}, {{data_*}},
    plus any key present in service.template_vars.
    """
    from datetime import datetime, timezone

    company_id = str(user.active_company_id)
    contract = _require_contract(
        contract_id, user,
        select="*, clients(*), document_templates!contracts_template_id_fkey(content,name,supplier_company_id)"
    )

    tmpl_content = (contract.get("document_templates") or {}).get("content")
    if not tmpl_content:
        raise HTTPException(400, "Nessun template associato al contratto. Seleziona un template prima di compilare.")

    # ── Gather substitution values ───────────────────────────
    client = contract.get("clients") or {}

    # Fallback: if no client yet (prospect), read from onboarding
    if not client and contract.get("onboarding_id"):
        onb_res = (
            supabase.table("onboarding")
            .select("company_name,reference_name,email,vat_number,fiscal_code,pec,dest_code,address,city,phone")
            .eq("id", str(contract["onboarding_id"]))
            .maybe_single()
            .execute()
        )
        if onb_res and getattr(onb_res, "data", None):
            o = onb_res.data
            client = {
                "name":        o.get("company_name", ""),
                "email":       o.get("email", ""),
                "vat_number":  o.get("vat_number", ""),
                "address":     o.get("address", ""),
                "city":        o.get("city", ""),
                "pec":         o.get("pec", ""),
                "sdi_code":    o.get("dest_code", ""),
                "tax_code":    o.get("fiscal_code") or o.get("vat_number", ""),
            }

    # Determine effective supplier company
    supplier_id = contract.get("supplier_company_id")
    if not supplier_id:
        supplier_id = (contract.get("document_templates") or {}).get("supplier_company_id")
    if not supplier_id:
        supplier_id = company_id  # fallback to current tenant

    company_res = (
        supabase.table("companies").select("name,vat_number,address,email")
        .eq("id", str(supplier_id)).maybe_single().execute()
    )
    company = getattr(company_res, "data", None) or {}

    # ── Fetch and Aggregate Multiple Services ───────────────
    cs_res = supabase.table("contract_services").select("service_id").eq("contract_id", str(contract_id)).execute()
    s_ids = [r["service_id"] for r in (cs_res.data or [])]
    if contract.get("service_id") and contract.get("service_id") not in s_ids:
        s_ids.append(contract.get("service_id"))

    services = []
    if s_ids:
        srv_res = supabase.table("services_catalog").select("*").in_("id", s_ids).execute()
        services = srv_res.data or []

    quote_data = None
    if contract.get("quote_id"):
        q_res = supabase.table("quotes").select("total_net, total").eq("id", contract.get("quote_id")).maybe_single().execute()
        quote_data = getattr(q_res, "data", None)

    srv_names = ", ".join(s.get("name", "") for s in services if s.get("name"))
    
    _descs = []
    for s in services:
        if s.get("description"):
            # Use <br> for newlines within the aggregated description string
            _descs.append(str(s["description"]).replace("\n", "<br>"))
    srv_descs = "<br><br>".join(_descs)
    
    if quote_data:
        # Prezzo negoziato nel preventivo (netto)
        srv_price = f"€ {float(quote_data.get('total_net') or 0):.2f}"
    else:
        # Somma di listino dal catalogo
        try:
            total_price = sum(float(s.get("price") or 0) for s in services)
            srv_price = f"€ {total_price:.2f}" if services else ""
        except ValueError:
            srv_price = ""

    # Aggregate periodicita
    srv_cycles_map = {"monthly":"Mensile","annual":"Annuale","quarterly":"Trimestrale","one_off":"Una tantum"}
    srv_cycles = ", ".join(sorted(set(srv_cycles_map.get(s.get("billing_cycle", ""), s.get("billing_cycle", "")) for s in services if s.get("billing_cycle"))))

    # Aggregate clausole in template_vars
    srv_clausole_list = []
    # Altri template_vars liberi
    other_service_vars = {}
    for s in services:
        tv = s.get("template_vars") or {}
        if isinstance(tv, dict):
            if tv.get("servizio_clausole"):
                srv_clausole_list.append(str(tv.get("servizio_clausole")))
            for k, v in tv.items():
                if k != "servizio_clausole":
                    other_service_vars[k] = v

    srv_clausole = "<br><br>".join(str(c).replace("\n", "<br>") for c in srv_clausole_list)

    # Build `tabella_servizi` HTML (one line to avoid whitespace gaps in pre-wrap)
    html_table = ""
    if services:
        html_table = '<table style="width:100%; border-collapse:collapse; margin:20px 0; font-family:sans-serif;">'
        html_table += '<thead style="background-color:#f8fafc; border-bottom:2px solid #e2e8f0;">'
        html_table += '<tr><th style="padding:12px; text-align:left; color:#475569; font-size:14px;">Servizio</th>'
        html_table += '<th style="padding:12px; text-align:left; color:#475569; font-size:14px;">Descrizione</th>'
        html_table += '<th style="padding:12px; text-align:right; color:#475569; font-size:14px;">Prezzo</th>'
        html_table += '<th style="padding:12px; text-align:right; color:#475569; font-size:14px;">Ciclo</th></tr></thead><tbody>'
        for s in services:
            s_name = s.get("name", "")
            s_desc = str(s.get("description", "")).replace("\n", "<br>")
            s_price = f"€ {float(s.get('price') or 0):.2f}"
            s_cycle = srv_cycles_map.get(s.get("billing_cycle", ""), s.get("billing_cycle", ""))
            html_table += f'<tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:12px; vertical-align:top; font-weight:bold; color:#0f172a;">{s_name}</td>'
            html_table += f'<td style="padding:12px; vertical-align:top; color:#334155; font-size:13px;">{s_desc}</td>'
            html_table += f'<td style="padding:12px; vertical-align:top; text-align:right; font-weight:500;">{s_price}</td>'
            html_table += f'<td style="padding:12px; vertical-align:top; text-align:right; color:#64748b; font-size:13px;">{s_cycle}</td></tr>'
        html_table += "</tbody></table>"

    # New structural var for multi-service readability (name \n description)
    srv_elenco_items = []
    for s in services:
        name = s.get("name", "").upper()
        desc = str(s.get("description", ""))
        srv_elenco_items.append(f"• {name}\n{desc}")
    srv_elenco = "\n\n".join(srv_elenco_items)

    today = datetime.now(timezone.utc)
    vars_map: dict = {
        # Cliente
        "cliente_nome":       client.get("name", ""),
        "cliente_email":      client.get("email", ""),
        "cliente_piva":       client.get("vat_number") or client.get("vat") or client.get("vat_no", ""),
        "cliente_cf":         client.get("tax_code") or client.get("fiscal_code") or client.get("cf", ""),
        "cliente_indirizzo":  client.get("address", ""),
        "cliente_citta":      client.get("city", ""),
        "cliente_pec":        client.get("pec", ""),
        "cliente_sdi":        client.get("sdi_code") or client.get("dest_code", ""),
        # Servizio Aggregato
        "servizio_nome":        srv_names,
        "servizio_descrizione": srv_descs,
        "servizio_prezzo":      srv_price,
        "servizio_periodicita": srv_cycles,
        "servizio_ciclo":       srv_cycles,   # alias — same value, different template naming
        "servizio_clausole":    srv_clausole,
        "servizi_elenco":       srv_elenco,    # NEW: Structured Name + Description list
        "tabella_servizi":      html_table,
        # Fornitore (nostra azienda)
        "fornitore_nome":      company.get("name", ""),
        "fornitore_piva":      company.get("vat_number") or company.get("vat", ""),
        "fornitore_cf":        company.get("tax_code") or company.get("fiscal_code", ""),
        "fornitore_indirizzo": company.get("address", ""),
        "fornitore_citta":     company.get("city", ""),
        "fornitore_cap":       company.get("zip_code", ""),
        "fornitore_email":     company.get("email", ""),
        # Date
        "data_oggi":          today.strftime("%d/%m/%Y"),
        "data_inizio":        (contract.get("valid_from") or "")[:10].replace("-", "/") or "",
        "data_fine":          (contract.get("valid_to")   or "")[:10].replace("-", "/") or "",
        "anno":               str(today.year),
    }

    # Extend with other custom template_vars from services
    vars_map.update({k: str(v) for k, v in other_service_vars.items()})

    # ── Replace all {{key}} placeholders ────────────────────
    compiled = tmpl_content
    for key, value in vars_map.items():
        compiled = compiled.replace("{{" + key + "}}", str(value) if value is not None else "")
    # Note: line break and space preservation is handled by the frontend CSS (white‑space: pre‑wrap)


    # ── Final adjustments for PDF Engine compatibility ──────
    # If the template is not full HTML, wrap it to ensure pre-wrap layout
    if "<html>" not in compiled.lower():
        compiled = f"""<style>
            body {{ font-family: sans-serif; font-size: 13px; line-height: 1.6; color: #111; white-space: pre-wrap; margin: 40px; }}
            table {{ white-space: normal; }} /* Tables should not pre-wrap cell content by default */
        </style>
        <div class="contract-wrapper">{compiled}</div>"""

    # ── Persist snapshot ─────────────────────────────────────
    now_iso = today.isoformat()
    supabase.table("contracts").update({
        "compiled_content": compiled,
        "compiled_at": now_iso,
    }).eq("id", str(contract_id)).eq("company_id", company_id).execute()

    _audit(user, str(contract_id), "compile", new={"compiled_at": now_iso})
    return {"compiled_content": compiled, "compiled_at": now_iso}


@router.post("/{contract_id}/send-sign")
async def send_for_signature(
    contract_id: UUID,
    payload: Optional[dict] = None,
    user: CurrentUser = Depends(require_admin),
):
    """Send contract via Email with PDF attachment or via Zoho Sign."""
    from core_services.pdf_service import generate_pdf_from_html
    from integrations.email_service import send_templated_email
    from config import settings

    contract = _require_contract(
        contract_id,
        user,
        select="*, clients(name,email), document_templates(content), onboarding!contracts_onboarding_id_fkey(email, company_name, reference_name, fiscal_code, vat_number)",
    )
    if contract.get("status") not in ("draft", "expired"):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Contract cannot be sent: current status is '{contract.get('status')}'",
        )

    html_content = (contract.get("document_templates") or {}).get("content", "")
    if not html_content:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Il contratto non ha un template associato. Selezionane uno.")
    
    # Check client email
    client_info = contract.get("clients") or {}
    onb_info = contract.get("onboarding") or {}
    recipient_email = client_info.get("email") or onb_info.get("email")
    
    if not recipient_email:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Il cliente non ha un indirizzo email configurato.")

    client_name = client_info.get("name") or onb_info.get("company_name") or onb_info.get("reference_name") or "Cliente"

    try:
        # Genera il PDF
        pdf_bytes = generate_pdf_from_html(contract.get("compiled_content") or html_content)
    except Exception as exc:
        logger.error("send_for_signature: PDF render error contract=%s: %s", contract_id, exc)
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Errore generazione PDF: {exc}")

    try:
        frontend_url = getattr(settings, "FRONTEND_URL", "https://crm.delocanova.com")
        
        req_method = "zoho"
        if payload and isinstance(payload, dict):
            req_method = payload.get("method", "zoho")
            
        zoho_configured = getattr(settings, "zoho_client_id", None) and getattr(settings, "zoho_client_secret", None)
        
        # Check if Zoho Sign is configured
        if zoho_configured and req_method == "zoho":
            from integrations.zoho_sign_service import zoho_sign_service
            file_name = f"Contratto_{contract_id}.pdf"
            logger.info("Sending contract %s via Zoho Sign", contract_id)
            zoho_resp = await zoho_sign_service.send_document_for_signature(
                pdf_bytes=pdf_bytes,
                file_name=file_name,
                client_name=client_name,
                client_email=recipient_email
            )
            
            # Zoho creates a request. Try to extract request ID
            request_id = None
            if zoho_resp.get("requests") and isinstance(zoho_resp["requests"], dict):
                request_id = zoho_resp["requests"].get("request_id")
            
            # Here we could store request_id if the DB schema supports it 
            # (requires adding zoho_request_id to contracts table)
            if request_id:
                try: # Best effort, handle gracefully if column doesn't exist yet
                    supabase.table("contracts").update({"zoho_request_id": request_id}).eq("id", str(contract_id)).execute()
                except Exception:
                    pass
        else:
            # Fallback a email standard con allegato
            logger.info("Sending contract %s via Brevo Email (Zoho not configured)", contract_id)
            await send_templated_email(
                company_id=str(user.active_company_id),
                to_email=recipient_email,
                template_type="contract_send",
                lang="it",
                variables={
                    "client_name": client_name,
                    "client_portal_url": frontend_url
                },
                attachments=[(f"Contratto_{contract_id}.pdf", pdf_bytes)],
                client_id=str(contract.get("client_id")) if contract.get("client_id") else None,
                reference_type="contract",
                reference_id=str(contract_id),
            )
    except Exception as exc:
        logger.error("send_for_signature: Sending failed contract=%s: %s", contract_id, exc)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Errore invio firma: {exc}")

    # Persist sent status
    (
        supabase.table("contracts")
        .update({"status": "sent"})
        .eq("id", str(contract_id))
        .eq("company_id", str(user.active_company_id))
        .execute()
    )
    _audit(user, str(contract_id), "send_sign",
           old={"status": contract.get("status")},
           new={"status": "sent"})

    # Log to Timeline
    from modules.activity.router import log_timeline_event
    log_timeline_event(
        company_id=str(user.active_company_id), actor_user_id=str(user.user_id),
        event_type="email_sent", title="Contratto inviato via email",
        client_id=contract.get("client_id"), onboarding_id=contract.get("onboarding_id"),
        body=f"Inviato a {recipient_email}"
    )

    # Auto-advance onboarding (non-blocking)
    from automation import auto_advance_onboarding
    auto_advance_onboarding(
        company_id=str(user.active_company_id),
        user_id=str(user.user_id),
        onboarding_id=contract.get("onboarding_id"),
        target_status="contract_sent",
        reason=f"Contratto {str(contract_id)[:8]}… inviato via email",
    )

    return {"message": "Contratto inviato con successo via Email"}


# ── Auto-Proforma helper ──────────────────────────────────────

_REQUIRED_PROFORMA_FIELDS = {"vat_number", "address", "city"}  # pec OR dest_code checked separately below

def _auto_create_proforma_after_sign(
    contract: dict, contract_id: str, company_id: str, user_id: str, signed_at: str
) -> None:
    """
    Auto-create a proforma invoice after a contract is signed.
    Only runs if all required proforma fields are present on the client or onboarding.
    Advances onboarding status to proforma_draft/proforma_issued.
    Non-blocking — caller should catch any exceptions.
    """
    from automation import auto_advance_onboarding
    from datetime import datetime, timezone

    # Resolve data source: client first, then onboarding
    client_data: dict = {}
    if contract.get("client_id"):
        c_res = supabase.table("clients").select(
            "id,name,email,vat_number,pec,dest_code,address,city"
        ).eq("id", str(contract["client_id"])).maybe_single().execute()
        client_data = getattr(c_res, "data", None) or {}

    onb_data: dict = {}
    if contract.get("onboarding_id"):
        o_res = supabase.table("onboarding").select(
            "id,company_name,reference_name,email,vat_number,pec,dest_code,address,city"
        ).eq("id", str(contract["onboarding_id"])).maybe_single().execute()
        onb_data = getattr(o_res, "data", None) or {}

    source = client_data or onb_data
    missing = [f for f in _REQUIRED_PROFORMA_FIELDS if not source.get(f)]
    # PEC or dest_code — at least one is required (OR logic)
    has_pec = bool(source.get("pec"))
    has_sdi = bool(source.get("dest_code") or source.get("sdi_code"))
    if not has_pec and not has_sdi:
        missing.append("pec_or_dest_code")
    if missing:
        logger.warning(
            "_auto_create_proforma: skipping — missing fields %s on contract %s",
            missing, contract_id
        )
        return  # Admin must create proforma manually

    # Fetch quote amount from linked quote (if any)
    total_net, total_vat, total = 0.0, 0.0, 0.0
    if contract.get("quote_id"):
        q_res = supabase.table("quotes").select("total_net,total_vat,total").eq(
            "id", str(contract["quote_id"])
        ).maybe_single().execute()
        if q_res and getattr(q_res, "data", None):
            total_net = float(q_res.data.get("total_net") or 0)
            total_vat = float(q_res.data.get("total_vat") or 0)
            total     = float(q_res.data.get("total") or 0)

    client_id  = client_data.get("id") or contract.get("client_id")
    client_name = client_data.get("name") or onb_data.get("company_name") or onb_data.get("reference_name") or "Cliente"

    proforma_row = {
        "company_id":    company_id,
        "client_id":     str(client_id) if client_id else None,
        "onboarding_id": str(contract["onboarding_id"]) if contract.get("onboarding_id") else None,
        "contract_id":   contract_id,
        "supplier_company_id": str(contract["supplier_company_id"]) if contract.get("supplier_company_id") else None,
        "is_proforma":   True,
        "status":        "draft",
        "payment_status": "not_paid",
        "notes":         f"Proforma automatica per {client_name} — contratto {contract_id[:8]}…",
        "total_net":     total_net,
        "total_vat":     total_vat,
        "total":         total,
        "currency":      "EUR",
        "issue_date":    datetime.now(timezone.utc).date().isoformat(),
    }
    pf_res = supabase.table("invoices").insert(proforma_row).execute()
    if not pf_res.data:
        logger.warning("_auto_create_proforma: insert returned no data for contract %s", contract_id)
        return

    pf_id = pf_res.data[0]["id"]
    logger.info("_auto_create_proforma: created proforma %s for contract %s", pf_id, contract_id)

    # Advance onboarding status
    auto_advance_onboarding(
        company_id=company_id,
        user_id=user_id,
        onboarding_id=contract.get("onboarding_id"),
        target_status="proforma_draft",
        reason=f"Proforma {str(pf_id)[:8]}… generata automaticamente dopo firma contratto",
    )


# ── Mark Signed (manual — when Zoho Sign not in use) ─────────

@router.post("/{contract_id}/mark-signed")
async def mark_contract_signed(
    contract_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    """
    Admin manually marks a contract as signed.
    Works as fallback when Zoho Sign webhook is not configured.
    Auto-advances linked onboarding to contract_signed.
    """
    from automation import auto_advance_onboarding
    from datetime import datetime, timezone

    contract = _require_contract(contract_id, user)
    if contract.get("status") == "signed":
        return {"message": "Contratto già firmato", "status": "signed"}

    if contract.get("status") not in ("sent", "draft"):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Impossibile segnare come firmato un contratto in stato '{contract.get('status')}'.",
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    supabase.table("contracts").update({
        "status": "signed",
        "signed_at": now_iso,
    }).eq("id", str(contract_id)).eq("company_id", str(user.active_company_id)).execute()

    _audit(user, str(contract_id), "mark_signed",
           old={"status": contract.get("status")},
           new={"status": "signed", "signed_at": now_iso})

    # Log to Timeline
    from modules.activity.router import log_timeline_event
    log_timeline_event(
        company_id=str(user.active_company_id), actor_user_id=str(user.user_id),
        event_type="contract_signed", title="Contratto firmato",
        client_id=contract.get("client_id"), onboarding_id=contract.get("onboarding_id"),
        body=contract.get("title", "")
    )

    # Auto-advance onboarding
    auto_advance_onboarding(
        company_id=str(user.active_company_id),
        user_id=str(user.user_id),
        onboarding_id=contract.get("onboarding_id"),
        target_status="contract_signed",
        reason=f"Contratto {str(contract_id)[:8]}… firmato manualmente",
    )

    # ── Auto-generate Proforma if required fields are complete ─────────────
    try:
        _auto_create_proforma_after_sign(
            contract=contract,
            contract_id=str(contract_id),
            company_id=str(user.active_company_id),
            user_id=str(user.user_id),
            signed_at=now_iso,
        )
    except Exception as pf_exc:
        logger.warning("mark_contract_signed: auto_proforma failed for %s: %s", contract_id, pf_exc)

    return {"message": "Contratto segnato come firmato", "status": "signed", "signed_at": now_iso}


# ── Regenerate (supplier change) ──────────────────────────────

class RegenerateRequest(BaseModel):
    template_id: UUID
    source_company_id: Optional[UUID] = None  # old supplier
    supplier_company_id: Optional[UUID] = None  # new supplier
    title: Optional[str] = None

@router.post("/{contract_id}/regenerate", status_code=status.HTTP_201_CREATED)
async def regenerate_contract(
    contract_id: UUID,
    body: RegenerateRequest,
    user: CurrentUser = Depends(require_admin),
):
    """
    Creates a new contract for the same client, using a different template
    (typically from a new supplier company). The original contract is
    automatically archived. origin is set to 'supplier_change'.
    """
    old = _require_contract(contract_id, str(user.active_company_id))

    # Archive the old contract
    supabase.table("contracts").update({"status": "archived"}).eq(
        "id", str(contract_id)
    ).eq("company_id", str(user.active_company_id)).execute()
    _audit(user, str(contract_id), "archived_for_regeneration", new={"status": "archived"})

    # Build new contract row
    new_title = body.title or f"{old.get('title', 'Contratto')} (Nuovo fornitore)"
    new_row: dict = {
        "title":       new_title,
        "company_id":  str(user.active_company_id),
        "status":      "draft",
        "template_id": str(body.template_id),
    }
    for col in ("client_id", "onboarding_id", "quote_id"):
        if old.get(col):
            new_row[col] = str(old[col])

    # Origin tracking (graceful — columns may not exist yet)
    try:
        new_row["origin"] = "supplier_change"
        new_row["source_company_id"] = str(body.source_company_id or old.get("supplier_company_id") or "")
        if body.supplier_company_id:
            new_row["supplier_company_id"] = str(body.supplier_company_id)
    except Exception:
        pass

    res = supabase.table("contracts").insert(new_row).execute()
    if not res.data:
        for k in ("origin", "source_company_id", "supplier_company_id"):
            new_row.pop(k, None)
        res = supabase.table("contracts").insert(new_row).execute()
    if not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Impossibile creare il contratto rigenerato")
    new_contract = res.data[0]

    # Copy services from old contract
    cs_res = supabase.table("contract_services").select("service_id").eq(
        "contract_id", str(contract_id)
    ).execute()
    if cs_res.data:
        new_cs = [{"contract_id": new_contract["id"], "service_id": r["service_id"]} for r in cs_res.data]
        try:
            supabase.table("contract_services").insert(new_cs).execute()
        except Exception as exc:
            logger.warning("regenerate: contract_services copy failed: %s", exc)

    _audit(user, new_contract["id"], "create", new={"origin": "supplier_change", "regenerated_from": str(contract_id)})
    return new_contract





# ── Sign Status ───────────────────────────────────────────────

@router.get("/{contract_id}/sign-status")
async def get_contract_sign_status(
    contract_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    """Fetch current remote state of signature request from Zoho Sign."""
    from integrations.zoho_sign import get_request_status

    contract = _require_contract(contract_id, str(user.active_company_id), select="zoho_request_id,status")
    req_id = contract.get("zoho_request_id")
    if not req_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Contract not yet sent to Zoho Sign")
    try:
        data = await get_request_status(req_id, str(user.active_company_id))
        return {"success": True, "zoho_data": data}
    except Exception as exc:
        logger.error("get_contract_sign_status failed req_id=%s: %s", req_id, exc)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Zoho Sign error: {exc}")


# ── Client: download / sign-url ───────────────────────────────

@router.get("/{contract_id}/download-url")
async def get_contract_download_url(
    contract_id: UUID,
    user: CurrentUser = Depends(get_current_user),
):
    """Return a short-lived download URL for the contract PDF."""
    contract = _require_contract(contract_id, str(user.active_company_id), select="client_id,pdf_url,zoho_request_id,status")
    if not user.is_admin and str(contract.get("client_id")) != str(user.client_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN)

    url = contract.get("pdf_url")
    if not url:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "PDF not yet generated for this contract")
    return {"url": url, "name": "contratto.pdf"}


@router.get("/{contract_id}/sign-url")
async def get_contract_sign_url(
    contract_id: UUID,
    user: CurrentUser = Depends(get_current_user),
):
    """Return the Zoho Sign URL for the client to sign the contract."""
    from integrations.zoho_sign import get_signing_url

    contract = _require_contract(contract_id, str(user.active_company_id), select="client_id,zoho_request_id,status")
    if not user.is_admin and str(contract.get("client_id")) != str(user.client_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN)

    if contract.get("status") not in ("sent",):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Contract is not awaiting signature")

    req_id = contract.get("zoho_request_id")
    if not req_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Contract not yet sent to Zoho Sign")

    try:
        sign_url = await get_signing_url(req_id, str(user.active_company_id))
        return {"url": sign_url, "sign_url": sign_url}
    except Exception as exc:
        logger.error("get_contract_sign_url failed req_id=%s: %s", req_id, exc)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Zoho Sign error: {exc}")


# ── Webhook: Zoho Sign ────────────────────────────────────────

from fastapi import Request

@router.post("/webhook/zoho-sign")
async def zoho_sign_webhook(request: Request):
    """
    Webhook target for Zoho Sign to notify when a document is signed or declined.
    """
    try:
        raw_body = await request.body()
        secret = getattr(settings, "zoho_webhook_secret", None)
        if secret:
            signature = request.headers.get("X-ZS-WEBHOOK-SIGNATURE")
            if not signature:
                logger.warning("Zoho Webhook missing signature")
                return {"status": "error", "message": "Missing Signature"}
            
            import hmac
            import hashlib
            expected_sig = hmac.new(secret.encode('utf-8'), raw_body, hashlib.sha256).hexdigest()
            if not hmac.compare_digest(signature, expected_sig):
                logger.warning("Zoho Webhook invalid signature")
                return {"status": "error", "message": "Invalid Signature"}

        content_type = request.headers.get('Content-Type', '')
        if 'application/x-www-form-urlencoded' in content_type or 'multipart/form-data' in content_type:
            form = await request.form()
            payload_str = form.get("requests")
            import json
            data = json.loads(payload_str) if payload_str else {}
        else:
            try:
                data = await request.json()
            except Exception:
                data = {}
            if "requests" in data:
                data = data["requests"]

        logger.info(f"Zoho Sign Webhook received data: {data}")
        request_id = data.get("request_id")
        request_status = data.get("request_status")

        if not request_id or not request_status:
            return {"status": "ok", "message": "Ignored missing payload"}

        # Find the contract
        c_res = supabase.table("contracts").select("*").eq("zoho_request_id", request_id).maybe_single().execute()
        contract = getattr(c_res, "data", None)
        
        if not contract:
            return {"status": "ok", "message": "Contract not found"}

        contract_id = contract["id"]
        company_id = contract["company_id"]

        if request_status.lower() == "completed" and contract.get("status") != "signed":
            from datetime import datetime, timezone
            now_iso = datetime.now(timezone.utc).isoformat()
            
            # update
            supabase.table("contracts").update({"status": "signed", "signed_at": now_iso}).eq("id", contract_id).execute()

            # timeline
            from modules.activity.router import log_timeline_event
            log_timeline_event(
                company_id=company_id, actor_user_id=None,
                event_type="contract_signed", title="Contratto firmato (Zoho)",
                client_id=contract.get("client_id"), onboarding_id=contract.get("onboarding_id"),
                body=f"Firmato automaticamente tramite Webhook. (ReqID: {request_id})"
            )

            # Auto Proforma (re-using manual logic)
            try:
                _auto_create_proforma_after_sign(
                    contract=contract, contract_id=str(contract_id),
                    company_id=company_id, user_id=contract.get("user_id", "system"),
                    signed_at=now_iso,
                )
            except Exception as pf_exc:
                logger.error("zoho_sign_webhook auto proforma failed: %s", pf_exc)

        elif request_status.lower() in ("declined", "expired", "recalled"):
            supabase.table("contracts").update({"status": "error"}).eq("id", contract_id).execute()

        return {"status": "success"}
    except Exception as e:
        logger.error(f"Zoho Webhook Error: {e}")
        return {"status": "error", "message": str(e)}
