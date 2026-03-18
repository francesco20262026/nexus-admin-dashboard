"""
modules/contracts/router.py — CRUD + Zoho Sign send + status update
"""
from fastapi import APIRouter, HTTPException, status, Depends, Query
from pydantic import BaseModel
from uuid import UUID
from typing import Optional

from auth.middleware import get_current_user, require_admin, CurrentUser
from database import supabase

router = APIRouter(prefix="/contracts", tags=["contracts"])


# ── Schemas ──────────────────────────────────────────────────

class ContractCreate(BaseModel):
    client_id: UUID
    title: str
    template_id: Optional[UUID] = None
    valid_from: Optional[str] = None
    valid_to: Optional[str] = None

class ContractUpdate(BaseModel):
    title: Optional[str] = None
    template_id: Optional[UUID] = None
    status: Optional[str] = None
    valid_from: Optional[str] = None
    valid_to: Optional[str] = None


# ── Helpers ──────────────────────────────────────────────────

def _audit(user: CurrentUser, entity_id: str, action: str,
           old: dict = None, new: dict = None):
    supabase.table("audit_logs").insert({
        "company_id": str(user.active_company_id),
        "user_id": str(user.user_id),
        "entity_type": "contract",
        "entity_id": entity_id,
        "action": action,
        "old_values": old,
        "new_values": new,
    }).execute()


# ── Endpoints ────────────────────────────────────────────────

@router.get("/")
async def list_contracts(
    client_id: Optional[UUID] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    user: CurrentUser = Depends(get_current_user),
):
    q = (
        supabase.table("contracts")
        .select("*, clients(name,email), document_templates(name,type)")
        .eq("company_id", str(user.active_company_id))
    )
    if not user.is_admin:
        q = q.eq("client_id", str(user.client_id))
    if client_id:
        q = q.eq("client_id", str(client_id))
    if status_filter:
        q = q.eq("status", status_filter)
    res = q.order("created_at", desc=True).execute()
    return res.data


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_contract(
    body: ContractCreate,
    user: CurrentUser = Depends(require_admin),
):
    row = {
        **body.model_dump(),
        "client_id": str(body.client_id),
        "template_id": str(body.template_id) if body.template_id else None,
        "company_id": str(user.active_company_id),
        "status": "draft",
    }
    res = supabase.table("contracts").insert(row).execute()
    contract = res.data[0]
    _audit(user, contract["id"], "create", new=contract)
    return contract


@router.get("/{contract_id}")
async def get_contract(
    contract_id: UUID,
    user: CurrentUser = Depends(get_current_user),
):
    res = (
        supabase.table("contracts")
        .select("*, clients(name,email), document_templates(name,content)")
        .eq("id", str(contract_id))
        .eq("company_id", str(user.active_company_id))
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if not user.is_admin and res.data["client_id"] != str(user.client_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN)
    return res.data


@router.put("/{contract_id}")
async def update_contract(
    contract_id: UUID,
    body: ContractUpdate,
    user: CurrentUser = Depends(require_admin),
):
    old = (
        supabase.table("contracts").select("*")
        .eq("id", str(contract_id))
        .eq("company_id", str(user.active_company_id))
        .single().execute()
    ).data
    if not old:
        raise HTTPException(status.HTTP_404_NOT_FOUND)

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if "template_id" in updates and updates["template_id"]:
        updates["template_id"] = str(updates["template_id"])
    res = supabase.table("contracts").update(updates).eq("id", str(contract_id)).execute()
    _audit(user, str(contract_id), "update", old=old, new=updates)
    return res.data[0]


@router.delete("/{contract_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contract(
    contract_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    old = (
        supabase.table("contracts").select("*")
        .eq("id", str(contract_id))
        .eq("company_id", str(user.active_company_id))
        .single().execute()
    ).data
    if not old:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    supabase.table("contracts").delete().eq("id", str(contract_id)).execute()
    _audit(user, str(contract_id), "delete", old=old)


@router.post("/{contract_id}/send")
async def send_for_signature(
    contract_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    """Send contract to Zoho Sign for e-signature."""
    from integrations.zoho_sign import send_contract_for_signature

    contract = (
        supabase.table("contracts")
        .select("*, clients(name,email), document_templates(content)")
        .eq("id", str(contract_id))
        .eq("company_id", str(user.active_company_id))
        .single().execute()
    ).data
    if not contract:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if contract["status"] not in ("draft", "expired"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Contract not in sendable state")

    zoho_request_id = await send_contract_for_signature(contract, str(user.active_company_id))

    supabase.table("contracts").update({
        "status": "sent",
        "zoho_request_id": zoho_request_id,
    }).eq("id", str(contract_id)).execute()

    _audit(user, str(contract_id), "send", new={"status": "sent", "zoho_request_id": zoho_request_id})
    return {"message": "Sent for signature", "zoho_request_id": zoho_request_id}


# ── Document Templates ────────────────────────────────────────

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
    return res.data
