"""
modules/invoices/router.py — CRUD, mark-paid, overdue report
"""
from fastapi import APIRouter, HTTPException, status, Depends, Query
from pydantic import BaseModel
from uuid import UUID
from typing import Optional
from datetime import date

from auth.middleware import get_current_user, require_admin, CurrentUser
from database import supabase

router = APIRouter(prefix="/invoices", tags=["invoices"])


# ── Schemas ──────────────────────────────────────────────────

class InvoiceCreate(BaseModel):
    client_id: UUID
    number: Optional[str] = None
    issue_date: Optional[date] = None
    due_date: Optional[date] = None
    amount: Optional[float] = None
    vat_amount: Optional[float] = None
    total: Optional[float] = None
    currency: str = "EUR"
    notes: Optional[str] = None

class InvoiceLineCreate(BaseModel):
    description: str
    quantity: float = 1.0
    unit_price: float
    vat_rate: float = 22.0
    service_id: Optional[UUID] = None

class MarkPaidRequest(BaseModel):
    paid_at: Optional[date] = None
    method: Optional[str] = None
    reference: Optional[str] = None
    notes: Optional[str] = None


# ── Helpers ──────────────────────────────────────────────────

def _audit(user: CurrentUser, entity_id: str, action: str,
           old: dict = None, new: dict = None):
    supabase.table("audit_logs").insert({
        "company_id": str(user.active_company_id),
        "user_id": str(user.user_id),
        "entity_type": "invoice",
        "entity_id": entity_id,
        "action": action,
        "old_values": old,
        "new_values": new,
    }).execute()


# ── Endpoints ────────────────────────────────────────────────

@router.get("/")
async def list_invoices(
    status_filter: Optional[str] = Query(None, alias="status"),
    client_id: Optional[UUID] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    page: int = 1,
    page_size: int = 50,
    user: CurrentUser = Depends(get_current_user),
):
    q = (
        supabase.table("invoices")
        .select("*, clients(name,email)", count="exact")
        .eq("company_id", str(user.active_company_id))
    )
    if not user.is_admin:
        q = q.eq("client_id", str(user.client_id))
    if status_filter:
        q = q.eq("status", status_filter)
    if client_id:
        q = q.eq("client_id", str(client_id))
    if from_date:
        q = q.gte("due_date", from_date.isoformat())
    if to_date:
        q = q.lte("due_date", to_date.isoformat())

    offset = (page - 1) * page_size
    res = q.order("due_date", desc=True).range(offset, offset + page_size - 1).execute()
    return {"data": res.data, "total": res.count, "page": page, "page_size": page_size}


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_invoice(
    body: InvoiceCreate,
    lines: list[InvoiceLineCreate] = [],
    user: CurrentUser = Depends(require_admin),
):
    row = {
        **body.model_dump(),
        "client_id": str(body.client_id),
        "company_id": str(user.active_company_id),
        "status": "draft",
    }
    res = supabase.table("invoices").insert(row).execute()
    inv = res.data[0]

    # Insert lines
    if lines:
        line_rows = [
            {
                "invoice_id": inv["id"],
                "description": l.description,
                "quantity": l.quantity,
                "unit_price": l.unit_price,
                "vat_rate": l.vat_rate,
                "total": round(l.quantity * l.unit_price * (1 + l.vat_rate / 100), 2),
                "service_id": str(l.service_id) if l.service_id else None,
            }
            for l in lines
        ]
        supabase.table("invoice_lines").insert(line_rows).execute()

    _audit(user, inv["id"], "create", new=inv)
    return inv


@router.get("/overdue")
async def get_overdue(user: CurrentUser = Depends(require_admin)):
    res = (
        supabase.table("invoices")
        .select("*, clients(name,email)")
        .eq("company_id", str(user.active_company_id))
        .eq("status", "overdue")
        .order("due_date")
        .execute()
    )
    return res.data


@router.get("/report")
async def payment_report(
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    user: CurrentUser = Depends(require_admin),
):
    """Summary: total invoiced, total paid, total overdue."""
    q = (
        supabase.table("invoices")
        .select("status,total,currency")
        .eq("company_id", str(user.active_company_id))
    )
    if from_date:
        q = q.gte("issue_date", from_date.isoformat())
    if to_date:
        q = q.lte("issue_date", to_date.isoformat())

    rows = q.execute().data
    summary = {"total_invoiced": 0.0, "total_paid": 0.0, "total_overdue": 0.0, "count": len(rows)}
    for r in rows:
        t = float(r.get("total") or 0)
        summary["total_invoiced"] += t
        if r["status"] == "paid":
            summary["total_paid"] += t
        elif r["status"] == "overdue":
            summary["total_overdue"] += t
    return summary


@router.get("/{invoice_id}")
async def get_invoice(invoice_id: UUID, user: CurrentUser = Depends(get_current_user)):
    res = (
        supabase.table("invoices")
        .select("*, invoice_lines(*), clients(name,email)")
        .eq("id", str(invoice_id))
        .eq("company_id", str(user.active_company_id))
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if not user.is_admin and str(user.client_id) != res.data["client_id"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN)
    return res.data


@router.post("/{invoice_id}/mark-paid")
async def mark_paid(
    invoice_id: UUID,
    body: MarkPaidRequest,
    user: CurrentUser = Depends(require_admin),
):
    from datetime import datetime, timezone
    paid_at = body.paid_at.isoformat() if body.paid_at else datetime.now(timezone.utc).isoformat()

    res = (
        supabase.table("invoices")
        .update({"status": "paid", "paid_at": paid_at})
        .eq("id", str(invoice_id))
        .eq("company_id", str(user.active_company_id))
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND)

    # Log payment
    supabase.table("payment_logs").insert({
        "invoice_id": str(invoice_id),
        "amount": res.data[0].get("total"),
        "paid_at": paid_at,
        "method": body.method,
        "reference": body.reference,
        "notes": body.notes,
        "created_by": str(user.user_id),
    }).execute()

    _audit(user, str(invoice_id), "update",
           old={"status": "sent"}, new={"status": "paid", "paid_at": paid_at})
    return res.data[0]


@router.post("/{invoice_id}/send-reminder")
async def send_manual_reminder(
    invoice_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    """Manually trigger a reminder email for an overdue invoice."""
    from integrations.email_service import send_reminder_email
    inv = (
        supabase.table("invoices")
        .select("*, clients(name,email,lang)")
        .eq("id", str(invoice_id))
        .single().execute()
    ).data
    if not inv:
        raise HTTPException(status.HTTP_404_NOT_FOUND)

    await send_reminder_email(inv, company_id=str(user.active_company_id), level=1)
    return {"message": "Reminder sent"}
