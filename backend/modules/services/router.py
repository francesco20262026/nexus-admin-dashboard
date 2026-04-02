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
    name:                     str
    description:              Optional[str]   = None
    category:                 Optional[str]   = None
    price:                    Optional[float] = None
    billing_cycle:            str             = "monthly"  # monthly | quarterly | annual | one_off
    currency:                 str             = "EUR"
    is_active:                bool            = True
    internal_code:            Optional[str]   = None
    standard_duration_months: Optional[int]   = None
    renewal_rule:             str             = "manual"  # auto | manual | none
    visible_in_quotes:        bool            = True
    visible_in_onboarding:    bool            = True
    notes:                    Optional[str]   = None
    template_vars:            Optional[dict]  = None

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
    name:                     Optional[str]   = None
    description:              Optional[str]   = None
    category:                 Optional[str]   = None
    price:                    Optional[float] = None
    billing_cycle:            Optional[str]   = None
    currency:                 Optional[str]   = None
    is_active:                Optional[bool]  = None
    internal_code:            Optional[str]   = None
    standard_duration_months: Optional[int]   = None
    renewal_rule:             Optional[str]   = None
    visible_in_quotes:        Optional[bool]  = None
    visible_in_onboarding:    Optional[bool]  = None
    notes:                    Optional[str]   = None
    template_vars:            Optional[dict]  = None  # per-service contract clause overrides

    @field_validator("billing_cycle")
    @classmethod
    def validate_billing_cycle(cls, v):
        if v is not None and v not in _VALID_BILLING_CYCLES:
            raise ValueError(f"billing_cycle must be one of {sorted(_VALID_BILLING_CYCLES)}")
        return v


class ClientServiceCreate(BaseModel):
    client_id:  Optional[UUID] = None
    onboarding_id: Optional[UUID] = None
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

def _require_catalog_service(service_id: UUID, company_id: Optional[str] = None) -> dict:
    """Fetch a catalog service asserting tenant ownership if company_id is provided. Raises 404 if not found."""
    q = supabase.table("services_catalog").select("*").eq("id", str(service_id))
    if company_id:
        q = q.eq("company_id", company_id)
    res = q.maybe_single().execute()
    if not res or getattr(res, "data", None) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Servizio non trovato in questa azienda")
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
    if not res or getattr(res, "data", None) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Subscription non trovata")
    return res.data


# Columns added by the v2 migration — gracefully skipped if the column doesn't exist yet
_EXTENDED_COLS = {"internal_code", "standard_duration_months", "renewal_rule",
                  "visible_in_quotes", "visible_in_onboarding", "notes"}

_BASE_COLS = {"name", "description", "category", "price", "billing_cycle",
              "currency", "is_active", "template_vars", "company_id"}


def _filter_row(row: dict, extended: bool = True) -> dict:
    """Filter the row to include only allowed columns."""
    allowed = _BASE_COLS | (_EXTENDED_COLS if extended else set())
    return {k: v for k, v in row.items() if k in allowed and v is not None
            or k in {"is_active", "visible_in_quotes", "visible_in_onboarding"}}


def _catalog_insert(row: dict):
    """Insert a catalog row. If extended columns don't exist in DB, retry with base-only."""
    try:
        return supabase.table("services_catalog").insert(row).execute()
    except Exception as e:
        err_msg = str(e)
        if "42703" in err_msg or "column" in err_msg.lower():
            # Extended columns not migrated yet — retry with base columns only
            base_row = {k: v for k, v in row.items() if k in _BASE_COLS | {"company_id"}}
            return supabase.table("services_catalog").insert(base_row).execute()
        raise


def _catalog_update(service_id: str, company_id: Optional[str], updates: dict):
    """Update a catalog row. If extended columns don't exist in DB, retry with base-only."""
    try:
        q = supabase.table("services_catalog").update(updates).eq("id", service_id)
        if company_id:
            q = q.eq("company_id", company_id)
        return q.execute()
    except Exception as e:
        err_msg = str(e)
        if "42703" in err_msg or "column" in err_msg.lower():
            base_updates = {k: v for k, v in updates.items() if k in _BASE_COLS}
            if not base_updates:
                return None
            q = supabase.table("services_catalog").update(base_updates).eq("id", service_id)
            if company_id:
                q = q.eq("company_id", company_id)
            return q.execute()
        raise


# ── Services Catalog ─────────────────────────────────────────

@router.get("/catalog")
async def list_catalog(
    active_only: bool = True,
    user: CurrentUser = Depends(get_current_user),
):
    q = (
        supabase.table("services_catalog")
        .select("*, companies(name)")
    )
    if not user.is_admin:
        company_id = str(user.active_company_id)
        q = q.eq("company_id", company_id)
        
    if active_only:
        q = q.eq("is_active", True)
    res = q.order("name").execute()
    catalog = res.data or []

    # Enrich each service with subscription stats
    if catalog:
        ids = [s["id"] for s in catalog]
        sub_res = (
            supabase.table("client_services")
            .select("service_id, client_id, onboarding_id, status")
            .in_("service_id", ids)
            .execute()
        )
        subs = sub_res.data or []

        from collections import defaultdict
        stats: dict = defaultdict(lambda: {"active_clients_count": 0, "onboarding_linked_count": 0, "total_subscriptions_count": 0})
        seen_clients: dict = defaultdict(set)
        seen_onboarding: dict = defaultdict(set)
        for sub in subs:
            sid = sub["service_id"]
            stats[sid]["total_subscriptions_count"] += 1
            if sub.get("status") == "active" and sub.get("client_id"):
                seen_clients[sid].add(sub["client_id"])
            if sub.get("onboarding_id"):
                seen_onboarding[sid].add(sub["onboarding_id"])
        for sid in stats:
            stats[sid]["active_clients_count"] = len(seen_clients[sid])
            stats[sid]["onboarding_linked_count"] = len(seen_onboarding[sid])

        for s in catalog:
            s.update(stats.get(s["id"], {"active_clients_count": 0, "onboarding_linked_count": 0, "total_subscriptions_count": 0}))

    return catalog


@router.post("/catalog", status_code=status.HTTP_201_CREATED)
async def create_catalog_service(
    body: ServiceCreate,
    user: CurrentUser = Depends(require_admin),
):
    row = {k: v for k, v in body.model_dump().items() if v is not None}
    row["company_id"] = str(user.active_company_id)
    res = _catalog_insert(row)
    if not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Errore durante la creazione del servizio")
    return res.data[0]


@router.put("/catalog/{service_id}")
async def update_catalog_service(
    service_id: UUID,
    body: ServiceUpdate,
    user: CurrentUser = Depends(require_admin),
):
    _require_catalog_service(service_id, None)  # Admins can edit any service

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nessun campo da aggiornare fornito")

    res = _catalog_update(str(service_id), None, updates)
    if not res or not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Errore durante l'aggiornamento")
    return res.data[0]


@router.delete("/catalog/{service_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_catalog_service(
    service_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    _require_catalog_service(service_id, None)

    # Block deletion if any subscriptions reference this service
    active_subs = (
        supabase.table("client_services")
        .select("id")
        .eq("service_id", str(service_id))
        .execute()
    )
    if active_subs.data:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Impossibile eliminare: {len(active_subs.data)} sottoscrizione/i collegate a questo servizio. "
            "Rimuovi prima le sottoscrizioni.",
        )

    supabase.table("services_catalog").delete().eq("id", str(service_id)).execute()


@router.post("/catalog/{service_id}/duplicate", status_code=status.HTTP_201_CREATED)
async def duplicate_catalog_service(
    service_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    """Duplicate a catalog service entry with a (Copia) suffix."""
    original = _require_catalog_service(service_id, str(user.active_company_id))
    exclude_keys = {"id", "created_at", "updated_at"}
    new_row = {k: v for k, v in original.items() if k not in exclude_keys}
    new_row["name"] = f"{original.get('name', 'Servizio')} (Copia)"
    new_row["is_active"] = False  # start as inactive
    res = supabase.table("services_catalog").insert(new_row).execute()
    if not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Errore durante la duplicazione")
    return res.data[0]


@router.get("/catalog/{service_id}/usages")
async def get_catalog_service_usages(
    service_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    """Return all subscriptions for a specific catalog service, grouped by entity type."""
    company_id = str(user.active_company_id)
    _require_catalog_service(service_id, company_id)

    res = (
        supabase.table("client_services")
        .select("*, clients(id,company_name,name)")
        .eq("service_id", str(service_id))
        .eq("company_id", company_id)
        .order("created_at", desc=True)
        .execute()
    )
    subs = res.data or []
    return {
        "service_id": str(service_id),
        "total": len(subs),
        "subscriptions": subs,
        "active_count": sum(1 for s in subs if s.get("status") == "active"),
        "clients": [s for s in subs if s.get("client_id")],
        "onboarding": [s for s in subs if s.get("onboarding_id") and not s.get("client_id")],
    }


# ── Client Services (subscriptions) ─────────────────────────

@router.get("/subscriptions")
async def list_subscriptions(
    client_id: Optional[UUID] = None,
    onboarding_id: Optional[UUID] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    user: CurrentUser = Depends(get_current_user),
):
    company_id = str(user.active_company_id)
    q = (
        supabase.table("client_services")
        .select("*, clients(name), services_catalog(name,billing_cycle)")
    )
    
    # Clients can only see their own subscriptions
    if not user.is_admin:
        q = q.eq("company_id", company_id)
        if user.client_id:
            or_conds = [f"client_id.eq.{user.client_id}"]
            if user.onboarding_id:
                or_conds.append(f"onboarding_id.eq.{user.onboarding_id}")
            q = q.or_(",".join(or_conds))
        elif user.onboarding_id:
            q = q.eq("onboarding_id", str(user.onboarding_id))
        else:
            return []
    else:
        # Admin filtering
        if client_id:
            q = q.eq("client_id", str(client_id))
        elif onboarding_id:
            q = q.eq("onboarding_id", str(onboarding_id))
        else:
            q = q.eq("company_id", company_id)

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

    if not body.client_id and not body.onboarding_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Richiesto client_id o onboarding_id")

    # Verify client or onboarding exists
    actual_company_id = company_id

    if body.client_id:
        client_check = (
            supabase.table("clients")
            .select("id, company_id")
            .eq("id", str(body.client_id))
        )
        if not user.is_admin:
            client_check = client_check.eq("company_id", company_id)
            
        res = client_check.maybe_single().execute()
        if not res or getattr(res, "data", None) is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Cliente non trovato o permessi insufficienti")
        actual_company_id = res.data["company_id"]
        
    elif body.onboarding_id:
        onb_check = (
            supabase.table("onboarding")
            .select("id, company_id")
            .eq("id", str(body.onboarding_id))
        )
        if not user.is_admin:
            onb_check = onb_check.eq("company_id", company_id)
            
        res = onb_check.maybe_single().execute()
        if not res or getattr(res, "data", None) is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Prospect Onboarding non trovato o permessi insufficienti")
        actual_company_id = res.data["company_id"]

    # Verify service belongs to the user's active company context
    _require_catalog_service(body.service_id, company_id)

    row = {
        **body.model_dump(exclude={"client_id", "onboarding_id"}),
        "company_id": str(actual_company_id),
        "client_id":  str(body.client_id) if body.client_id else None,
        "onboarding_id": str(body.onboarding_id) if body.onboarding_id else None,
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
