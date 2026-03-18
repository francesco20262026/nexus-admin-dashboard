"""
modules/renewals/router.py — Renewal tracking + manual alert
"""
from fastapi import APIRouter, HTTPException, status, Depends, Query
from pydantic import BaseModel
from uuid import UUID
from typing import Optional
from datetime import datetime, timezone

from auth.middleware import get_current_user, require_admin, CurrentUser
from database import supabase

router = APIRouter(prefix="/renewals", tags=["renewals"])


# ── Schemas ──────────────────────────────────────────────────

class RenewalCreate(BaseModel):
    client_id: UUID
    client_service_id: UUID
    renewal_date: str  # ISO date
    notes: Optional[str] = None

class RenewalUpdate(BaseModel):
    renewal_date: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


# ── Endpoints ────────────────────────────────────────────────

@router.get("/")
async def list_renewals(
    renewal_status: Optional[str] = Query(None, alias="status"),
    days_ahead: Optional[int] = Query(None, description="Filter renewals due within N days"),
    user: CurrentUser = Depends(require_admin),
):
    from datetime import date, timedelta

    q = (
        supabase.table("renewals")
        .select("*, clients(name,email), client_services(*, services_catalog(name))")
        .eq("company_id", str(user.active_company_id))
    )
    if renewal_status:
        q = q.eq("status", renewal_status)
    if days_ahead is not None:
        cutoff = (date.today() + timedelta(days=days_ahead)).isoformat()
        today = date.today().isoformat()
        q = q.gte("renewal_date", today).lte("renewal_date", cutoff)
    res = q.order("renewal_date").execute()
    return res.data


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_renewal(
    body: RenewalCreate,
    user: CurrentUser = Depends(require_admin),
):
    row = {
        **body.model_dump(),
        "company_id": str(user.active_company_id),
        "client_id": str(body.client_id),
        "client_service_id": str(body.client_service_id),
        "status": "pending",
    }
    res = supabase.table("renewals").insert(row).execute()
    return res.data[0]


@router.put("/{renewal_id}")
async def update_renewal(
    renewal_id: UUID,
    body: RenewalUpdate,
    user: CurrentUser = Depends(require_admin),
):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if body.status == "renewed":
        updates["renewed_at"] = datetime.now(timezone.utc).isoformat()
    res = (
        supabase.table("renewals")
        .update(updates)
        .eq("id", str(renewal_id))
        .eq("company_id", str(user.active_company_id))
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    return res.data[0]


@router.post("/{renewal_id}/alert")
async def send_renewal_alert(
    renewal_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    """Send a renewal alert email to the client."""
    from integrations.email_service import send_templated_email

    renewal = (
        supabase.table("renewals")
        .select("*, clients(name,email,lang), client_services(*, services_catalog(name))")
        .eq("id", str(renewal_id))
        .eq("company_id", str(user.active_company_id))
        .single()
        .execute()
    ).data
    if not renewal:
        raise HTTPException(status.HTTP_404_NOT_FOUND)

    client = renewal.get("clients") or {}
    service_name = (renewal.get("client_services") or {}).get("services_catalog", {}).get("name", "")

    await send_templated_email(
        to_email=client.get("email", ""),
        template_type="renewal_alert",
        company_id=str(user.active_company_id),
        lang=client.get("lang", "it"),
        variables={
            "client_name": client.get("name", ""),
            "service_name": service_name,
            "renewal_date": renewal.get("renewal_date", ""),
        },
    )

    now = datetime.now(timezone.utc).isoformat()
    supabase.table("renewals").update({
        "status": "alerted",
        "alert_sent_at": now,
    }).eq("id", str(renewal_id)).execute()

    return {"message": "Renewal alert sent"}
