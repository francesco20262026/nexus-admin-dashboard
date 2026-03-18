"""
modules/services/router.py — Services catalog CRUD + client_services management
"""
from fastapi import APIRouter, HTTPException, status, Depends, Query
from pydantic import BaseModel
from uuid import UUID
from typing import Optional

from auth.middleware import get_current_user, require_admin, CurrentUser
from database import supabase

router = APIRouter(prefix="/services", tags=["services"])


# ── Schemas ──────────────────────────────────────────────────

class ServiceCreate(BaseModel):
    name: str
    description: Optional[str] = None
    price: Optional[float] = None
    billing_cycle: str  # monthly | quarterly | annual | one_off
    currency: str = "EUR"
    is_active: bool = True

class ServiceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    billing_cycle: Optional[str] = None
    currency: Optional[str] = None
    is_active: Optional[bool] = None

class ClientServiceCreate(BaseModel):
    client_id: UUID
    service_id: UUID
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    price: Optional[float] = None  # overrides catalog price if set
    status: str = "active"
    notes: Optional[str] = None

class ClientServiceUpdate(BaseModel):
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    price: Optional[float] = None
    status: Optional[str] = None
    notes: Optional[str] = None


# ── Services Catalog ─────────────────────────────────────────

@router.get("/catalog")
async def list_catalog(
    active_only: bool = True,
    user: CurrentUser = Depends(get_current_user),
):
    q = (
        supabase.table("services_catalog")
        .select("*")
        .eq("company_id", str(user.active_company_id))
    )
    if active_only:
        q = q.eq("is_active", True)
    res = q.order("name").execute()
    return res.data


@router.post("/catalog", status_code=status.HTTP_201_CREATED)
async def create_catalog_service(
    body: ServiceCreate,
    user: CurrentUser = Depends(require_admin),
):
    row = {**body.model_dump(), "company_id": str(user.active_company_id)}
    res = supabase.table("services_catalog").insert(row).execute()
    return res.data[0]


@router.put("/catalog/{service_id}")
async def update_catalog_service(
    service_id: UUID,
    body: ServiceUpdate,
    user: CurrentUser = Depends(require_admin),
):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    res = (
        supabase.table("services_catalog")
        .update(updates)
        .eq("id", str(service_id))
        .eq("company_id", str(user.active_company_id))
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found")
    return res.data[0]


@router.delete("/catalog/{service_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_catalog_service(
    service_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    supabase.table("services_catalog").delete().eq("id", str(service_id)).eq(
        "company_id", str(user.active_company_id)
    ).execute()


# ── Client Services (subscriptions) ─────────────────────────

@router.get("/subscriptions")
async def list_subscriptions(
    client_id: Optional[UUID] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    user: CurrentUser = Depends(get_current_user),
):
    q = (
        supabase.table("client_services")
        .select("*, clients(name), services_catalog(name,billing_cycle)")
        .eq("company_id", str(user.active_company_id))
    )
    if not user.is_admin:
        q = q.eq("client_id", str(user.client_id))
    if client_id:
        q = q.eq("client_id", str(client_id))
    if status_filter:
        q = q.eq("status", status_filter)
    res = q.order("start_date", desc=True).execute()
    return res.data


@router.post("/subscriptions", status_code=status.HTTP_201_CREATED)
async def create_subscription(
    body: ClientServiceCreate,
    user: CurrentUser = Depends(require_admin),
):
    row = {**body.model_dump(), "company_id": str(user.active_company_id),
           "client_id": str(body.client_id), "service_id": str(body.service_id)}
    res = supabase.table("client_services").insert(row).execute()
    return res.data[0]


@router.put("/subscriptions/{sub_id}")
async def update_subscription(
    sub_id: UUID,
    body: ClientServiceUpdate,
    user: CurrentUser = Depends(require_admin),
):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    res = (
        supabase.table("client_services")
        .update(updates)
        .eq("id", str(sub_id))
        .eq("company_id", str(user.active_company_id))
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    return res.data[0]


@router.delete("/subscriptions/{sub_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subscription(
    sub_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    supabase.table("client_services").delete().eq("id", str(sub_id)).eq(
        "company_id", str(user.active_company_id)
    ).execute()
