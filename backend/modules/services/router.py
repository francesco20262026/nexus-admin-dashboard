"""
modules/services/router.py — Services catalog CRUD + client_services management
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

router = APIRouter(prefix="/services", tags=["services"])

_VALID_BILLING_CYCLES = {"monthly", "quarterly", "annual", "one_off"}
_VALID_SUB_STATUSES   = {"active", "suspended", "cancelled"}


# ── Schemas ──────────────────────────────────────────────────

class ServiceCreate(BaseModel):
    name:          str
    description:   Optional[str]   = None
    price:         Optional[float] = None
    billing_cycle: str              # monthly | quarterly | annual | one_off
    currency:      str              = "EUR"
    is_active:     bool             = True
    template_vars: Optional[dict]   = None

    @field_validator("billing_cycle")
    @classmethod
    def validate_billing_cycle(cls, v: str) -> str:
        if v not in _VALID_BILLING_CYCLES:
            raise ValueError(f"billing_cycle must be one of {sorted(_VALID_BILLING_CYCLES)}")
        return v

    @field_validator("price")
    @classmethod
    def price_non_negative(cls, v):
        if v is not None and v < 0:
            raise ValueError("price must be non-negative")
        return v


class ServiceUpdate(BaseModel):
    name:          Optional[str]   = None
    description:   Optional[str]   = None
    price:         Optional[float] = None
    billing_cycle: Optional[str]   = None
    currency:      Optional[str]   = None
    is_active:     Optional[bool]  = None
    template_vars: Optional[dict]  = None  # per-service contract clause overrides

    @field_validator("billing_cycle")
    @classmethod
    def validate_billing_cycle(cls, v):
        if v is not None and v not in _VALID_BILLING_CYCLES:
            raise ValueError(f"billing_cycle must be one of {sorted(_VALID_BILLING_CYCLES)}")
        return v


class ClientServiceCreate(BaseModel):
    client_id:  UUID
    service_id: UUID
    start_date: Optional[date] = None   # typed as date — validated
    end_date:   Optional[date] = None
    price:      Optional[float] = None   # per-client override
    status:     str = "active"
    notes:      Optional[str] = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in _VALID_SUB_STATUSES:
            raise ValueError(f"status must be one of {sorted(_VALID_SUB_STATUSES)}")
        return v


class ClientServiceUpdate(BaseModel):
    start_date: Optional[date] = None
    end_date:   Optional[date] = None
    price:      Optional[float] = None
    status:     Optional[str]   = None
    notes:      Optional[str]   = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v):
        if v is not None and v not in _VALID_SUB_STATUSES:
            raise ValueError(f"status must be one of {sorted(_VALID_SUB_STATUSES)}")
        return v


# ── Helpers ──────────────────────────────────────────────────

def _require_catalog_service(service_id: UUID, company_id: str) -> dict:
    """Fetch a catalog service asserting tenant ownership. Raises 404 if not found."""
    res = (
        supabase.table("services_catalog")
        .select("*")
        .eq("id", str(service_id))
        .eq("company_id", company_id)
        .maybe_single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Servizio non trovato")
    return res.data


def _require_subscription(sub_id: UUID, company_id: str) -> dict:
    """Fetch a subscription asserting tenant ownership. Raises 404 if not found."""
    res = (
        supabase.table("client_services")
        .select("*")
        .eq("id", str(sub_id))
        .eq("company_id", company_id)
        .maybe_single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Subscription non trovata")
    return res.data


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
    return res.data or []


@router.post("/catalog", status_code=status.HTTP_201_CREATED)
async def create_catalog_service(
    body: ServiceCreate,
    user: CurrentUser = Depends(require_admin),
):
    row = {**body.model_dump(), "company_id": str(user.active_company_id)}
    res = supabase.table("services_catalog").insert(row).execute()
    if not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Errore durante la creazione del servizio")
    return res.data[0]


@router.put("/catalog/{service_id}")
async def update_catalog_service(
    service_id: UUID,
    body: ServiceUpdate,
    user: CurrentUser = Depends(require_admin),
):
    _require_catalog_service(service_id, str(user.active_company_id))  # 404 if not found / wrong tenant

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nessun campo da aggiornare fornito")

    res = (
        supabase.table("services_catalog")
        .update(updates)
        .eq("id", str(service_id))
        .eq("company_id", str(user.active_company_id))
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Errore durante l'aggiornamento")
    return res.data[0]


@router.delete("/catalog/{service_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_catalog_service(
    service_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    _require_catalog_service(service_id, str(user.active_company_id))

    # Block deletion if active subscriptions reference this service
    active_subs = (
        supabase.table("client_services")
        .select("id")
        .eq("service_id", str(service_id))
        .eq("company_id", str(user.active_company_id))
        .eq("status", "active")
        .execute()
    )
    if active_subs.data:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Impossibile eliminare: {len(active_subs.data)} subscription attiva/e su questo servizio. "
            "Cancella o sospendi prima le subscription.",
        )

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
    company_id = str(user.active_company_id)
    q = (
        supabase.table("client_services")
        .select("*, clients(name), services_catalog(name,billing_cycle)")
        .eq("company_id", company_id)
    )
    # Clients can only see their own subscriptions
    if not user.is_admin:
        if not user.client_id:
            return []
        q = q.eq("client_id", str(user.client_id))

    elif client_id:
        # Admin filtering by client — verify client belongs to this company first
        client_check = (
            supabase.table("clients")
            .select("id")
            .eq("id", str(client_id))
            .eq("company_id", company_id)
            .maybe_single()
            .execute()
        )
        if not client_check.data:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Cliente non trovato")
        q = q.eq("client_id", str(client_id))

    if status_filter:
        q = q.eq("status", status_filter)

    res = q.order("start_date", desc=True).execute()
    return res.data or []


@router.post("/subscriptions", status_code=status.HTTP_201_CREATED)
async def create_subscription(
    body: ClientServiceCreate,
    user: CurrentUser = Depends(require_admin),
):
    company_id = str(user.active_company_id)

    # Verify client belongs to this company
    client_check = (
        supabase.table("clients")
        .select("id")
        .eq("id", str(body.client_id))
        .eq("company_id", company_id)
        .maybe_single()
        .execute()
    )
    if not client_check.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cliente non trovato o non appartenente a questa azienda")

    # Verify service belongs to this company
    _require_catalog_service(body.service_id, company_id)

    row = {
        **body.model_dump(),
        "company_id": company_id,
        "client_id":  str(body.client_id),
        "service_id": str(body.service_id),
        "start_date": body.start_date.isoformat() if body.start_date else None,
        "end_date":   body.end_date.isoformat() if body.end_date else None,
    }
    res = supabase.table("client_services").insert(row).execute()
    if not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Errore durante la creazione della subscription")
    return res.data[0]


@router.put("/subscriptions/{sub_id}")
async def update_subscription(
    sub_id: UUID,
    body: ClientServiceUpdate,
    user: CurrentUser = Depends(require_admin),
):
    _require_subscription(sub_id, str(user.active_company_id))

    updates: dict = {k: v for k, v in body.model_dump().items() if v is not None}
    # Serialize date objects to ISO strings for Supabase
    for date_field in ("start_date", "end_date"):
        if date_field in updates and hasattr(updates[date_field], "isoformat"):
            updates[date_field] = updates[date_field].isoformat()

    if not updates:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nessun campo da aggiornare fornito")

    res = (
        supabase.table("client_services")
        .update(updates)
        .eq("id", str(sub_id))
        .eq("company_id", str(user.active_company_id))
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Errore durante l'aggiornamento")
    return res.data[0]


@router.delete("/subscriptions/{sub_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subscription(
    sub_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    _require_subscription(sub_id, str(user.active_company_id))
    supabase.table("client_services").delete().eq("id", str(sub_id)).eq(
        "company_id", str(user.active_company_id)
    ).execute()
