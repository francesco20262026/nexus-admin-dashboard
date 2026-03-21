"""
modules/clients/router.py — CRUD + contacts + Windoc sync
"""
import logging
from fastapi import APIRouter, HTTPException, status, Depends, Query
from pydantic import BaseModel, EmailStr
from uuid import UUID
from typing import Optional

from auth.middleware import get_current_user, require_admin, CurrentUser
from database import supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/clients", tags=["clients"])


# ── Schemas ──────────────────────────────────────────────────

class ClientCreate(BaseModel):
    name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    vat_number: Optional[str] = None
    pec: Optional[str] = None
    dest_code: Optional[str] = None
    lang: str = "it"
    status: str = "prospect"
    notes: Optional[str] = None

class ClientUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    vat_number: Optional[str] = None
    pec: Optional[str] = None
    dest_code: Optional[str] = None
    lang: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None

class ContactCreate(BaseModel):
    role: str          # billing | admin | signature | other
    name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    is_primary: bool = False
    notes: Optional[str] = None


# ── Helpers ──────────────────────────────────────────────────

def _audit(user: CurrentUser, entity_id: str, action: str,
           old: Optional[dict] = None, new: Optional[dict] = None) -> None:
    """Write an audit log entry. Failures are logged but never bubble up."""
    try:
        supabase.table("audit_logs").insert({
            "company_id":  str(user.active_company_id),
            "user_id":     str(user.user_id),
            "entity_type": "client",
            "entity_id":   entity_id,
            "action":      action,
            "old_values":  old,
            "new_values":  new,
        }).execute()
    except Exception as exc:  # noqa: BLE001
        logger.warning("audit_log write failed: %s", exc)


def _require_client(client_id: UUID, company_id: str) -> dict:
    """
    Fetch a client row, asserting it exists within the given company.
    Raises 404 if not found or belongs to another tenant.
    """
    res = (
        supabase.table("clients")
        .select("*")
        .eq("id", str(client_id))
        .eq("company_id", company_id)
        .maybe_single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")
    return res.data


# ── List / Search ────────────────────────────────────────────

@router.get("/")
async def list_clients(
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: CurrentUser = Depends(get_current_user),
):
    q = (
        supabase.table("clients")
        .select("*", count="exact")
        .eq("company_id", str(user.active_company_id))
    )
    # Non-admin clients see only their own record (double-enforced alongside RLS)
    if not user.is_admin:
        if not user.client_id:
            return {"data": [], "total": 0, "page": page, "page_size": page_size}
        q = q.eq("id", str(user.client_id))
    if status_filter:
        q = q.eq("status", status_filter)
    if search:
        q = q.ilike("name", f"%{search}%")

    offset = (page - 1) * page_size
    res = q.order("name").range(offset, offset + page_size - 1).execute()
    return {"data": res.data or [], "total": res.count or 0, "page": page, "page_size": page_size}


# ── Create ────────────────────────────────────────────────────

@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_client(
    body: ClientCreate,
    user: CurrentUser = Depends(require_admin),
):
    row = {**body.model_dump(), "company_id": str(user.active_company_id)}
    res = supabase.table("clients").insert(row).execute()
    if not res.data:
        logger.error("create_client: no data returned from insert")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Failed to create client")
    client = res.data[0]
    _audit(user, client["id"], "create", new=client)
    return client


# ── Get ───────────────────────────────────────────────────────

@router.get("/me")
async def get_own_client_profile(user: CurrentUser = Depends(get_current_user)):
    """Client-portal: fetch the authenticated client's own record."""
    if user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin users do not have a client profile")
    if not user.client_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No client record linked to this user")
    return _require_client(user.client_id, str(user.active_company_id))


@router.put("/me")
async def update_own_client_profile(
    body: ClientUpdate,
    user: CurrentUser = Depends(get_current_user),
):
    """Client-portal: update the authenticated client's own record."""
    if user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Use the admin update endpoint instead")
    if not user.client_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No client record linked to this user")

    old = _require_client(user.client_id, str(user.active_company_id))
    updates = body.model_dump(exclude_none=True)
    if not updates:
        return old  # nothing to do

    res = (
        supabase.table("clients")
        .update(updates)
        .eq("id", str(user.client_id))
        .eq("company_id", str(user.active_company_id))
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Update returned no data")
    _audit(user, str(user.client_id), "update", old=old, new=updates)
    return res.data[0]


@router.get("/{client_id}")
async def get_client(
    client_id: UUID,
    user: CurrentUser = Depends(get_current_user),
):
    # For non-admin users, enforce they can only access their own record
    if not user.is_admin:
        if not user.client_id or str(user.client_id) != str(client_id):
            raise HTTPException(status.HTTP_403_FORBIDDEN)
    return _require_client(client_id, str(user.active_company_id))


# ── Update ────────────────────────────────────────────────────

@router.put("/{client_id}")
async def update_client(
    client_id: UUID,
    body: ClientUpdate,
    user: CurrentUser = Depends(require_admin),
):
    old = _require_client(client_id, str(user.active_company_id))

    updates = body.model_dump(exclude_none=True)
    if not updates:
        return old  # nothing to do

    res = (
        supabase.table("clients")
        .update(updates)
        .eq("id", str(client_id))
        .eq("company_id", str(user.active_company_id))  # tenant safety: double-filter
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Update returned no data")
    _audit(user, str(client_id), "update", old=old, new=updates)
    return res.data[0]


# ── Delete ────────────────────────────────────────────────────

@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_client(
    client_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    old = _require_client(client_id, str(user.active_company_id))
    supabase.table("clients").delete().eq("id", str(client_id)).eq("company_id", str(user.active_company_id)).execute()
    _audit(user, str(client_id), "delete", old=old)


# ── Contacts ─────────────────────────────────────────────────

@router.get("/{client_id}/contacts")
async def list_contacts(
    client_id: UUID,
    user: CurrentUser = Depends(get_current_user),
):
    # Verify the parent client is accessible to this user/tenant first
    _require_client(client_id, str(user.active_company_id))

    res = (
        supabase.table("client_contacts")
        .select("*")
        .eq("client_id", str(client_id))
        .eq("company_id", str(user.active_company_id))  # tenant safety
        .order("is_primary", desc=True)
        .execute()
    )
    return res.data or []


@router.post("/{client_id}/contacts", status_code=status.HTTP_201_CREATED)
async def add_contact(
    client_id: UUID,
    body: ContactCreate,
    user: CurrentUser = Depends(require_admin),
):
    # Verify the parent client belongs to this tenant
    _require_client(client_id, str(user.active_company_id))

    row = {
        **body.model_dump(),
        "client_id":  str(client_id),
        "company_id": str(user.active_company_id),
    }
    res = supabase.table("client_contacts").insert(row).execute()
    if not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Failed to create contact")
    return res.data[0]


@router.delete("/{client_id}/contacts/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contact(
    client_id: UUID,
    contact_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    existing = (
        supabase.table("client_contacts")
        .select("id")
        .eq("id", str(contact_id))
        .eq("client_id", str(client_id))
        .eq("company_id", str(user.active_company_id))
        .maybe_single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contact not found")
    supabase.table("client_contacts").delete().eq("id", str(contact_id)).eq("company_id", str(user.active_company_id)).execute()


# ── Related data shortcuts ────────────────────────────────────

@router.get("/{client_id}/services")
async def client_services(
    client_id: UUID,
    user: CurrentUser = Depends(get_current_user),
):
    _require_client(client_id, str(user.active_company_id))
    res = (
        supabase.table("client_services")
        .select("*, services_catalog(name,billing_cycle)")
        .eq("client_id", str(client_id))
        .eq("company_id", str(user.active_company_id))
        .execute()
    )
    return res.data or []


@router.get("/{client_id}/invoices")
async def client_invoices(
    client_id: UUID,
    user: CurrentUser = Depends(get_current_user),
):
    _require_client(client_id, str(user.active_company_id))
    res = (
        supabase.table("invoices")
        .select("*")
        .eq("client_id", str(client_id))
        .eq("company_id", str(user.active_company_id))
        .order("due_date", desc=True)
        .execute()
    )
    return res.data or []


@router.get("/{client_id}/contracts")
async def client_contracts(
    client_id: UUID,
    user: CurrentUser = Depends(get_current_user),
):
    _require_client(client_id, str(user.active_company_id))
    res = (
        supabase.table("contracts")
        .select("*")
        .eq("client_id", str(client_id))
        .eq("company_id", str(user.active_company_id))
        .execute()
    )
    return res.data or []


@router.get("/{client_id}/documents")
async def client_documents(
    client_id: UUID,
    user: CurrentUser = Depends(get_current_user),
):
    _require_client(client_id, str(user.active_company_id))
    res = (
        supabase.table("documents")
        .select("*")
        .eq("client_id", str(client_id))
        .eq("company_id", str(user.active_company_id))
        .execute()
    )
    return res.data or []


# ── Integrations ─────────────────────────────────────────────

@router.post("/{client_id}/sync-windoc")
async def sync_client_windoc(
    client_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    """Sync a Nexus client to WindDoc Rubrica."""
    _require_client(client_id, str(user.active_company_id))
    from integrations.windoc import sync_client_to_windoc
    try:
        data = await sync_client_to_windoc(str(client_id), str(user.active_company_id))
        return {"success": True, "windoc_data": data}
    except Exception as exc:
        logger.error("sync_client_windoc failed for client_id=%s: %s", client_id, exc)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))
