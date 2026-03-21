"""
modules/contracts/router.py — CRUD + Zoho Sign send + status update
"""
import logging
from datetime import date
from fastapi import APIRouter, HTTPException, status, Depends, Query
from pydantic import BaseModel, field_validator
from uuid import UUID
from typing import Optional

from auth.middleware import get_current_user, require_admin, CurrentUser
from database import supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/contracts", tags=["contracts"])

# ── Schemas ──────────────────────────────────────────────────

class ContractCreate(BaseModel):
    client_id: UUID
    title: str
    template_id: Optional[UUID] = None
    valid_from: Optional[date] = None   # typed as date — validated by pydantic
    valid_to: Optional[date] = None

class ContractUpdate(BaseModel):
    title: Optional[str] = None
    template_id: Optional[UUID] = None
    status: Optional[str] = None
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None


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


def _require_contract(contract_id: UUID, company_id: str, select: str = "*") -> dict:
    """
    Fetch a contract asserting it exists within the given company.
    Raises 404 if not found or belongs to another tenant.
    """
    res = (
        supabase.table("contracts")
        .select(select)
        .eq("id", str(contract_id))
        .eq("company_id", company_id)
        .maybe_single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contract not found")
    return res.data


# ── Document Templates (registered BEFORE /{contract_id} to avoid shadowing) ─

@router.get("/templates/list")
async def list_templates(
    doc_type: Optional[str] = None,
    user: CurrentUser = Depends(require_admin),
):
    q = (
        supabase.table("document_templates")
        .select("id,name,type,lang,is_default,created_at")
        .eq("company_id", str(user.active_company_id))
    )
    if doc_type:
        q = q.eq("type", doc_type)
    res = q.order("name").execute()
    return res.data or []


# ── List ─────────────────────────────────────────────────────

@router.get("/")
async def list_contracts(
    client_id: Optional[UUID] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: CurrentUser = Depends(get_current_user),
):
    q = (
        supabase.table("contracts")
        .select("*, clients(name,email), document_templates(name,type)", count="exact")
        .eq("company_id", str(user.active_company_id))
    )
    if not user.is_admin:
        if not user.client_id:
            return {"data": [], "total": 0, "page": page, "page_size": page_size}
        q = q.eq("client_id", str(user.client_id))
    if client_id:
        q = q.eq("client_id", str(client_id))
    if status_filter:
        q = q.eq("status", status_filter)

    offset = (page - 1) * page_size
    res = q.order("created_at", desc=True).range(offset, offset + page_size - 1).execute()
    return {"data": res.data or [], "total": res.count or 0, "page": page, "page_size": page_size}


# ── Create ────────────────────────────────────────────────────

@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_contract(
    body: ContractCreate,
    user: CurrentUser = Depends(require_admin),
):
    row = {
        "client_id":   str(body.client_id),
        "title":       body.title,
        "template_id": str(body.template_id) if body.template_id else None,
        "valid_from":  body.valid_from.isoformat() if body.valid_from else None,
        "valid_to":    body.valid_to.isoformat() if body.valid_to else None,
        "company_id":  str(user.active_company_id),
        "status":      "draft",
    }
    res = supabase.table("contracts").insert(row).execute()
    if not res.data:
        logger.error("create_contract: insert returned no data")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Failed to create contract")
    contract = res.data[0]
    _audit(user, contract["id"], "create", new=contract)
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
        str(user.active_company_id),
        select="*, clients(name,email), document_templates(name,content)",
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
    old = _require_contract(contract_id, str(user.active_company_id))

    updates: dict = {}
    if body.title is not None:
        updates["title"] = body.title
    if body.template_id is not None:
        updates["template_id"] = str(body.template_id)
    if body.status is not None:
        updates["status"] = body.status
    if body.valid_from is not None:
        updates["valid_from"] = body.valid_from.isoformat()
    if body.valid_to is not None:
        updates["valid_to"] = body.valid_to.isoformat()

    if not updates:
        return old  # nothing to do

    res = (
        supabase.table("contracts")
        .update(updates)
        .eq("id", str(contract_id))
        .eq("company_id", str(user.active_company_id))   # tenant safety
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Update returned no data")
    _audit(user, str(contract_id), "update", old=old, new=updates)
    return res.data[0]


# ── Delete ────────────────────────────────────────────────────

@router.delete("/{contract_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contract(
    contract_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    old = _require_contract(contract_id, str(user.active_company_id))
    # Block deletion of contracts that are in-flight or signed
    if old.get("status") in ("sent", "signed", "completed"):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot delete a contract with status '{old.get('status')}'. Archive or cancel it first.",
        )
    supabase.table("contracts").delete().eq("id", str(contract_id)).eq("company_id", str(user.active_company_id)).execute()
    _audit(user, str(contract_id), "delete", old=old)


# ── Send for Signature ────────────────────────────────────────

@router.post("/{contract_id}/send-sign")
async def send_for_signature(
    contract_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    """Send contract to Zoho Sign for e-signature."""
    from integrations.zoho_sign import send_contract_for_signature

    contract = _require_contract(
        contract_id,
        str(user.active_company_id),
        select="*, clients(name,email), document_templates(content)",
    )
    if contract.get("status") not in ("draft", "expired"):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Contract cannot be sent: current status is '{contract.get('status')}'",
        )

    try:
        zoho_request_id = await send_contract_for_signature(contract, str(user.active_company_id))
    except RuntimeError as exc:
        # RuntimeError = server-side dependency missing (WeasyPrint / OS libs not installed)
        logger.critical("send_for_signature: PDF engine unavailable contract=%s: %s", contract_id, exc)
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Il motore PDF non è disponibile sul server. "
            "Contattare l'amministratore di sistema. "
            "Diagnostica: GET /api/health/pdf",
        )
    except ValueError as exc:
        # ValueError = PDF rendering failed (bad template content)
        logger.error("send_for_signature: PDF render error contract=%s: %s", contract_id, exc)
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Errore generazione PDF: {exc}")
    except Exception as exc:
        # Everything else = Zoho Sign API / network / config error
        logger.error("send_for_signature: Zoho Sign error contract=%s: %s", contract_id, exc)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Zoho Sign error: {exc}")

    # Persist Zoho reference with tenant safety
    (
        supabase.table("contracts")
        .update({"status": "sent", "zoho_request_id": zoho_request_id})
        .eq("id", str(contract_id))
        .eq("company_id", str(user.active_company_id))
        .execute()
    )
    _audit(user, str(contract_id), "send_sign",
           old={"status": contract.get("status")},
           new={"status": "sent", "zoho_request_id": zoho_request_id})
    return {"message": "Sent for signature", "zoho_request_id": zoho_request_id}


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
