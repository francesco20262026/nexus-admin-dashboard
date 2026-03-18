"""
modules/clients/router.py — CRUD + contacts + Windoc sync
"""
from fastapi import APIRouter, HTTPException, status, Depends, Query
from pydantic import BaseModel, EmailStr
from uuid import UUID
from typing import Optional

from auth.middleware import get_current_user, require_admin, CurrentUser
from database import supabase

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
           old: dict = None, new: dict = None):
    supabase.table("audit_logs").insert({
        "company_id": str(user.active_company_id),
        "user_id": str(user.user_id),
        "entity_type": "client",
        "entity_id": entity_id,
        "action": action,
        "old_values": old,
        "new_values": new,
    }).execute()


# ── Endpoints ────────────────────────────────────────────────

@router.get("/")
async def list_clients(
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
    user: CurrentUser = Depends(get_current_user),
):
    q = (
        supabase.table("clients")
        .select("*", count="exact")
        .eq("company_id", str(user.active_company_id))
    )
    # Client users can only see their own record via RLS,
    # but we add explicit filter for clarity
    if not user.is_admin:
        q = q.eq("id", str(user.client_id))
    if status_filter:
        q = q.eq("status", status_filter)
    if search:
        q = q.ilike("name", f"%{search}%")

    offset = (page - 1) * page_size
    res = q.order("name").range(offset, offset + page_size - 1).execute()
    return {"data": res.data, "total": res.count, "page": page, "page_size": page_size}


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_client(
    body: ClientCreate,
    user: CurrentUser = Depends(require_admin),
):
    row = {**body.model_dump(), "company_id": str(user.active_company_id)}
    res = supabase.table("clients").insert(row).execute()
    client = res.data[0]
    _audit(user, client["id"], "create", new=client)
    return client


@router.get("/{client_id}")
async def get_client(
    client_id: UUID,
    user: CurrentUser = Depends(get_current_user),
):
    res = (
        supabase.table("clients")
        .select("*")
        .eq("id", str(client_id))
        .eq("company_id", str(user.active_company_id))
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")
    if not user.is_admin and str(user.client_id) != str(client_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN)
    return res.data


@router.put("/{client_id}")
async def update_client(
    client_id: UUID,
    body: ClientUpdate,
    user: CurrentUser = Depends(require_admin),
):
    old = (
        supabase.table("clients").select("*")
        .eq("id", str(client_id))
        .eq("company_id", str(user.active_company_id))
        .single().execute()
    ).data
    if not old:
        raise HTTPException(status.HTTP_404_NOT_FOUND)

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    res = (
        supabase.table("clients").update(updates)
        .eq("id", str(client_id)).execute()
    )
    _audit(user, str(client_id), "update", old=old, new=updates)
    return res.data[0]


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_client(
    client_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    old = (
        supabase.table("clients").select("*")
        .eq("id", str(client_id))
        .eq("company_id", str(user.active_company_id))
        .single().execute()
    ).data
    if not old:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    supabase.table("clients").delete().eq("id", str(client_id)).execute()
    _audit(user, str(client_id), "delete", old=old)


# ── Contacts ─────────────────────────────────────────────────

@router.get("/{client_id}/contacts")
async def list_contacts(
    client_id: UUID,
    user: CurrentUser = Depends(get_current_user),
):
    res = (
        supabase.table("client_contacts").select("*")
        .eq("client_id", str(client_id))
        .execute()
    )
    return res.data


@router.post("/{client_id}/contacts", status_code=status.HTTP_201_CREATED)
async def add_contact(
    client_id: UUID,
    body: ContactCreate,
    user: CurrentUser = Depends(require_admin),
):
    row = {
        **body.model_dump(),
        "client_id": str(client_id),
        "company_id": str(user.active_company_id),
    }
    res = supabase.table("client_contacts").insert(row).execute()
    return res.data[0]


@router.delete("/{client_id}/contacts/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contact(
    client_id: UUID,
    contact_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    supabase.table("client_contacts").delete().eq("id", str(contact_id)).execute()


# ── Related data shortcuts ────────────────────────────────────

@router.get("/{client_id}/services")
async def client_services(client_id: UUID, user: CurrentUser = Depends(get_current_user)):
    res = supabase.table("client_services").select("*, services_catalog(name,billing_cycle)").eq("client_id", str(client_id)).execute()
    return res.data

@router.get("/{client_id}/invoices")
async def client_invoices(client_id: UUID, user: CurrentUser = Depends(get_current_user)):
    res = supabase.table("invoices").select("*").eq("client_id", str(client_id)).eq("company_id", str(user.active_company_id)).order("due_date", desc=True).execute()
    return res.data

@router.get("/{client_id}/contracts")
async def client_contracts(client_id: UUID, user: CurrentUser = Depends(get_current_user)):
    res = supabase.table("contracts").select("*").eq("client_id", str(client_id)).eq("company_id", str(user.active_company_id)).execute()
    return res.data

@router.get("/{client_id}/documents")
async def client_documents(client_id: UUID, user: CurrentUser = Depends(get_current_user)):
    res = supabase.table("documents").select("*").eq("client_id", str(client_id)).eq("company_id", str(user.active_company_id)).execute()
    return res.data
