"""
modules/renewals/router.py — Renewal tracking + manual alert + invoice generation
"""
import logging
from fastapi import APIRouter, HTTPException, status, Depends, Query
from pydantic import BaseModel
from uuid import UUID
from typing import Optional
from datetime import datetime, timezone, date, timedelta

from auth.middleware import require_admin, CurrentUser
from database import supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/renewals", tags=["renewals"])


# ── Schemas ──────────────────────────────────────────────────

class RenewalCreate(BaseModel):
    client_id: UUID
    client_service_id: UUID
    renewal_date: date      # typed — validated by pydantic
    notes: Optional[str] = None

class RenewalUpdate(BaseModel):
    renewal_date: Optional[date] = None
    status: Optional[str] = None
    notes: Optional[str] = None


# ── Helpers ──────────────────────────────────────────────────

def _require_renewal(renewal_id: UUID, company_id: str, select: str = "*") -> dict:
    res = (
        supabase.table("renewals")
        .select(select)
        .eq("id", str(renewal_id))
        .eq("company_id", company_id)
        .maybe_single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Renewal not found")
    return res.data


# ── List ─────────────────────────────────────────────────────

@router.get("/")
async def list_renewals(
    renewal_status: Optional[str] = Query(None, alias="status"),
    days_ahead: Optional[int] = Query(None, ge=1, le=365),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: CurrentUser = Depends(require_admin),
):
    q = (
        supabase.table("renewals")
        .select("*, clients(name,email), client_services(*, services_catalog(name))", count="exact")
        .eq("company_id", str(user.active_company_id))
    )
    if renewal_status:
        q = q.eq("status", renewal_status)
    if days_ahead is not None:
        today  = date.today().isoformat()
        cutoff = (date.today() + timedelta(days=days_ahead)).isoformat()
        q = q.gte("renewal_date", today).lte("renewal_date", cutoff)

    offset = (page - 1) * page_size
    res = q.order("renewal_date").range(offset, offset + page_size - 1).execute()
    return {"data": res.data or [], "total": res.count or 0, "page": page, "page_size": page_size}


# ── Create ────────────────────────────────────────────────────

@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_renewal(
    body: RenewalCreate,
    user: CurrentUser = Depends(require_admin),
):
    row = {
        "client_id":         str(body.client_id),
        "client_service_id": str(body.client_service_id),
        "renewal_date":      body.renewal_date.isoformat(),
        "notes":             body.notes,
        "company_id":        str(user.active_company_id),
        "status":            "pending",
    }
    res = supabase.table("renewals").insert(row).execute()
    if not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Failed to create renewal")
    return res.data[0]


# ── Update ────────────────────────────────────────────────────

@router.put("/{renewal_id}")
async def update_renewal(
    renewal_id: UUID,
    body: RenewalUpdate,
    user: CurrentUser = Depends(require_admin),
):
    _require_renewal(renewal_id, str(user.active_company_id), select="id")  # 404 check

    updates: dict = {}
    if body.renewal_date is not None:
        updates["renewal_date"] = body.renewal_date.isoformat()
    if body.status is not None:
        updates["status"] = body.status
        if body.status == "renewed":
            updates["renewed_at"] = datetime.now(timezone.utc).isoformat()
    if body.notes is not None:
        updates["notes"] = body.notes

    if not updates:
        return _require_renewal(renewal_id, str(user.active_company_id))

    res = (
        supabase.table("renewals")
        .update(updates)
        .eq("id", str(renewal_id))
        .eq("company_id", str(user.active_company_id))
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Update returned no data")
    return res.data[0]


# ── Alert ─────────────────────────────────────────────────────

@router.post("/{renewal_id}/alert")
async def send_renewal_alert(
    renewal_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    """Send a renewal alert email to the client."""
    from integrations.email_service import send_templated_email

    renewal = _require_renewal(
        renewal_id,
        str(user.active_company_id),
        select="*, clients(name,email,lang), client_services(*, services_catalog(name))",
    )

    client       = renewal.get("clients") or {}
    client_email = client.get("email", "")
    if not client_email:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Client has no email address")

    service_name = (
        (renewal.get("client_services") or {})
        .get("services_catalog", {})
        .get("name", "")
    )

    try:
        await send_templated_email(
            to_email=client_email,
            template_type="renewal_alert",
            company_id=str(user.active_company_id),
            lang=client.get("lang", "it"),
            variables={
                "client_name":  client.get("name", ""),
                "service_name": service_name,
                "renewal_date": renewal.get("renewal_date", ""),
            },
            client_id=str(renewal.get("client_id")) if renewal.get("client_id") else None,
            reference_type="renewal",
            reference_id=str(renewal_id),
        )
    except Exception as exc:
        logger.error("send_renewal_alert failed renewal=%s: %s", renewal_id, exc)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Email delivery failed: {exc}")

    now = datetime.now(timezone.utc).isoformat()
    supabase.table("renewals").update({
        "status":        "alerted",
        "alert_sent_at": now,
    }).eq("id", str(renewal_id)).eq("company_id", str(user.active_company_id)).execute()

    return {"message": "Renewal alert sent"}


# ── Generate Invoice ──────────────────────────────────────────

@router.post("/{renewal_id}/generate-invoice")
async def generate_invoice_for_renewal(
    renewal_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    """
    Generate a new invoice for a renewal.
    Concurrency-safe: uses optimistic lock on invoice_id IS NULL.
    Direct DB insert (avoids cross-module router imports).
    """
    # 1. Load renewal with service/catalog data — scoped to company
    renewal = _require_renewal(
        renewal_id,
        str(user.active_company_id),
        select="*, client_services(*, services_catalog(*))",
    )

    # 2. Idempotency: already has an invoice
    if renewal.get("invoice_id"):
        return {"message": "Invoice already exists for this renewal", "invoice_id": renewal["invoice_id"]}

    # 3. Price mapping
    client_service = renewal.get("client_services") or {}
    catalog        = client_service.get("services_catalog") or {}
    service_name   = catalog.get("name", "Servizio Rinnovato")
    price          = client_service.get("custom_price")
    if price is None:
        price = catalog.get("base_price", 0.0)

    amount     = round(float(price), 2)
    vat_rate   = 22.0
    vat_amount = round(amount * (vat_rate / 100.0), 2)
    total      = round(amount + vat_amount, 2)
    today      = date.today()
    due_date   = today + timedelta(days=15)

    client_id = renewal.get("client_id")
    if not client_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Renewal has no client_id")

    # 4. Insert invoice directly — no cross-router import
    inv_row = {
        "company_id": str(user.active_company_id),
        "client_id":  str(client_id),
        "issue_date": today.isoformat(),
        "due_date":   due_date.isoformat(),
        "amount":     amount,
        "vat_amount": vat_amount,
        "total":      total,
        "currency":   "EUR",
        "status":     "draft",
        "notes":      f"Fattura generata automaticamente dal rinnovo #{str(renewal_id).split('-')[0]}",
    }
    inv_res = supabase.table("invoices").insert(inv_row).execute()
    if not inv_res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Failed to create invoice for renewal")
    created_inv  = inv_res.data[0]
    new_inv_id   = created_inv["id"]

    # 5. Insert invoice line
    service_id = catalog.get("id")
    line_row   = {
        "invoice_id":  new_inv_id,
        "description": f"Rinnovo: {service_name}",
        "quantity":    1.0,
        "unit_price":  amount,
        "vat_rate":    vat_rate,
        "total":       total,
        "service_id":  str(service_id) if service_id else None,
    }
    try:
        supabase.table("invoice_lines").insert(line_row).execute()
    except Exception as exc:
        logger.warning("invoice_lines insert failed for renewal invoice %s: %s", new_inv_id, exc)

    # 6. Atomic link: update renewal ONLY IF invoice_id IS still null (concurrency guard)
    rel_update = (
        supabase.table("renewals")
        .update({"invoice_id": new_inv_id, "status": "renewed",
                 "renewed_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", str(renewal_id))
        .eq("company_id", str(user.active_company_id))
        .is_("invoice_id", "null")
        .execute()
    )
    if not rel_update.data:
        # Race condition: another request already linked an invoice — roll back this one
        try:
            supabase.table("invoices").delete().eq("id", new_inv_id).execute()
        except Exception as exc:
            logger.error("Rollback of orphaned invoice %s failed: %s", new_inv_id, exc)
        # Return the winner's invoice_id
        current = supabase.table("renewals").select("invoice_id").eq("id", str(renewal_id)).maybe_single().execute()
        winner_id = (current.data or {}).get("invoice_id")
        return {"message": "Invoice already generated concurrently.", "invoice_id": winner_id, "status": "conflict"}

    return {"message": "Invoice successfully generated", "invoice_id": new_inv_id, "invoice": created_inv}
