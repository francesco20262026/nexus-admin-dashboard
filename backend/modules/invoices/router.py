"""
modules/invoices/router.py — CRUD, mark-paid, overdue report, payment flow
"""
import logging
from fastapi import APIRouter, HTTPException, status, Depends, Query
from pydantic import BaseModel
from uuid import UUID
from typing import Optional
from datetime import date, datetime, timezone

from auth.middleware import get_current_user, require_admin, CurrentUser
from database import supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/invoices", tags=["invoices"])


# ── Schemas ──────────────────────────────────────────────────

class InvoiceCreate(BaseModel):
    client_id: UUID
    number: Optional[str] = None
    issue_date: Optional[date] = None
    due_date: Optional[date] = None
    total: float   # required — an invoice must have an amount
    amount: Optional[float] = None      # pre-tax subtotal, optional
    vat_amount: Optional[float] = None
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
           old: Optional[dict] = None, new: Optional[dict] = None) -> None:
    """Write an audit log entry. Failures are logged but never bubble up."""
    try:
        supabase.table("audit_logs").insert({
            "company_id":  str(user.active_company_id),
            "user_id":     str(user.user_id),
            "entity_type": "invoice",
            "entity_id":   entity_id,
            "action":      action,
            "old_values":  old,
            "new_values":  new,
        }).execute()
    except Exception as exc:
        logger.warning("audit_log write failed for invoice %s: %s", entity_id, exc)


def _require_invoice(invoice_id: UUID, company_id: str, select: str = "*") -> dict:
    """
    Fetch an invoice asserting it exists within the given company.
    Raises 404 if not found or belongs to another tenant.
    """
    res = (
        supabase.table("invoices")
        .select(select)
        .eq("id", str(invoice_id))
        .eq("company_id", company_id)
        .maybe_single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    return res.data


# ── List ─────────────────────────────────────────────────────

@router.get("/")
async def list_invoices(
    status_filter: Optional[str] = Query(None, alias="status"),
    client_id: Optional[UUID] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: CurrentUser = Depends(get_current_user),
):
    q = (
        supabase.table("invoices")
        .select("*, clients(name,email)", count="exact")
        .eq("company_id", str(user.active_company_id))
    )
    # Non-admin: restrict to own invoices
    if not user.is_admin:
        if not user.client_id:
            return {"data": [], "total": 0, "page": page, "page_size": page_size}
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
    return {"data": res.data or [], "total": res.count or 0, "page": page, "page_size": page_size}


# ── Create ────────────────────────────────────────────────────

@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_invoice(
    body: InvoiceCreate,
    lines: list[InvoiceLineCreate] = [],
    user: CurrentUser = Depends(require_admin),
):
    row = {
        **body.model_dump(),
        "client_id":  str(body.client_id),
        "company_id": str(user.active_company_id),
        "status":     "draft",
    }
    res = supabase.table("invoices").insert(row).execute()
    if not res.data:
        logger.error("create_invoice: insert returned no data")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Failed to create invoice")
    inv = res.data[0]

    if lines:
        line_rows = [
            {
                "invoice_id":  inv["id"],
                "description": ln.description,
                "quantity":    ln.quantity,
                "unit_price":  ln.unit_price,
                "vat_rate":    ln.vat_rate,
                "total":       round(ln.quantity * ln.unit_price * (1 + ln.vat_rate / 100.0), 2),
                "service_id":  str(ln.service_id) if ln.service_id else None,
            }
            for ln in lines
        ]
        supabase.table("invoice_lines").insert(line_rows).execute()

    _audit(user, inv["id"], "create", new=inv)
    return inv


# ── Overdue (before /{invoice_id} to avoid route shadowing) ───

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
    return res.data or []


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

    rows = q.execute().data or []
    summary = {"total_invoiced": 0.0, "total_paid": 0.0, "total_overdue": 0.0, "count": len(rows)}
    for r in rows:
        t = float(r.get("total") or 0)
        summary["total_invoiced"] += t
        if r.get("status") == "paid":
            summary["total_paid"] += t
        elif r.get("status") in ("overdue", "unpaid"):
            summary["total_overdue"] += t
    return summary


# ── Get ───────────────────────────────────────────────────────

@router.get("/{invoice_id}")
async def get_invoice(invoice_id: UUID, user: CurrentUser = Depends(get_current_user)):
    # Enforce ownership before fetch for non-admin clients
    if not user.is_admin and not user.client_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN)

    res = (
        supabase.table("invoices")
        .select("*, invoice_lines(*), clients(name,email)")
        .eq("id", str(invoice_id))
        .eq("company_id", str(user.active_company_id))
        .maybe_single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if not user.is_admin and str(user.client_id) != str(res.data.get("client_id")):
        raise HTTPException(status.HTTP_403_FORBIDDEN)
    return res.data


# ── Mark Paid ─────────────────────────────────────────────────

@router.post("/{invoice_id}/mark-paid")
async def mark_paid(
    invoice_id: UUID,
    body: MarkPaidRequest,
    user: CurrentUser = Depends(require_admin),
):
    # Fetch current state for audit and amount before updating
    old = _require_invoice(invoice_id, str(user.active_company_id), select="status,total,currency")

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

    # Log payment — failure must not roll back the mark-paid response
    try:
        supabase.table("payment_logs").insert({
            "invoice_id": str(invoice_id),
            "company_id": str(user.active_company_id),
            "amount":     old.get("total"),
            "currency":   old.get("currency", "EUR"),
            "paid_at":    paid_at,
            "method":     body.method,
            "reference":  body.reference,
            "notes":      body.notes,
            "created_by": str(user.user_id),
        }).execute()
    except Exception as exc:
        logger.warning("payment_logs insert failed for invoice %s: %s", invoice_id, exc)

    _audit(user, str(invoice_id), "mark_paid",
           old={"status": old.get("status")},
           new={"status": "paid", "paid_at": paid_at})
    return res.data[0]


# ── Send Reminder ─────────────────────────────────────────────

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
        .eq("company_id", str(user.active_company_id))  # tenant guard
        .maybe_single()
        .execute()
    ).data
    if not inv:
        raise HTTPException(status.HTTP_404_NOT_FOUND)

    await send_reminder_email(inv, company_id=str(user.active_company_id), level=1)
    _audit(user, str(invoice_id), "reminder_sent")
    return {"message": "Reminder sent"}


# ── Integrations ─────────────────────────────────────────────

@router.post("/{invoice_id}/push-windoc")
async def push_invoice_windoc(
    invoice_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    _require_invoice(invoice_id, str(user.active_company_id), select="id")
    from integrations.windoc import push_invoice_to_windoc
    try:
        data = await push_invoice_to_windoc(str(invoice_id), str(user.active_company_id))
        return {"success": True, "windoc_data": data}
    except Exception as exc:
        logger.error("push_invoice_windoc failed invoice=%s: %s", invoice_id, exc)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))


@router.get("/{invoice_id}/windoc-status")
async def get_invoice_windoc_status(
    invoice_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    inv = _require_invoice(invoice_id, str(user.active_company_id), select="windoc_id")
    windoc_id = inv.get("windoc_id")
    if not windoc_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Fattura non ancora sincronizzata su WindDoc")
    from integrations.windoc import get_invoice_status
    try:
        data = await get_invoice_status(windoc_id, str(user.active_company_id))
        return {"success": True, "windoc_data": data}
    except Exception as exc:
        logger.error("get_invoice_windoc_status failed windoc_id=%s: %s", windoc_id, exc)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))


# ── Payments (Client Flow) ────────────────────────────────────

@router.get("/{invoice_id}/payment-info")
async def get_payment_info(
    invoice_id: UUID,
    user: CurrentUser = Depends(get_current_user),
):
    """Returns banking instructions for a specific invoice."""
    inv = _require_invoice(
        invoice_id,
        str(user.active_company_id),
        select="id,total,currency,client_id,number,company_id",
    )

    if not user.is_admin and str(user.client_id) != str(inv.get("client_id")):
        raise HTTPException(status.HTTP_403_FORBIDDEN)

    # Fetch company banking details
    comp_res = (
        supabase.table("companies")
        .select("name,iban,payment_beneficiary")
        .eq("id", str(inv["company_id"]))
        .maybe_single()
        .execute()
    )
    comp = comp_res.data or {}
    company_name = comp.get("payment_beneficiary") or comp.get("name") or "L'Azienda"
    iban = comp.get("iban") or ""

    # Deterministic reference for bank-transfer matching
    short_id  = str(invoice_id).split("-")[0].upper()
    reference = inv.get("payment_reference") or f"INV-{short_id}"

    # Persist reference for reconciliation (non-blocking)
    if not inv.get("payment_reference"):
        try:
            supabase.table("invoices").update({"payment_reference": reference}).eq("id", str(invoice_id)).eq("company_id", str(user.active_company_id)).execute()
        except Exception as exc:
            logger.warning("Failed to persist payment_reference for invoice %s: %s", invoice_id, exc)

    return {
        "amount":          inv.get("total"),
        "currency":        inv.get("currency") or "EUR",
        "iban":            iban,
        "beneficiary":     company_name,
        "reference":       reference,
        "invoice_number":  inv.get("number") or reference,
        "iban_configured": bool(iban),  # let the UI know if IBAN is missing
    }


@router.post("/{invoice_id}/mark-pending-payment")
async def mark_pending_payment(
    invoice_id: UUID,
    user: CurrentUser = Depends(get_current_user),
):
    """Client declares they have issued the bank transfer."""
    inv = _require_invoice(
        invoice_id,
        str(user.active_company_id),
        select="client_id,status",
    )

    if not user.is_admin and str(user.client_id) != str(inv.get("client_id")):
        raise HTTPException(status.HTTP_403_FORBIDDEN)

    if inv.get("status") == "paid":
        return {"message": "Already paid"}

    if inv.get("status") == "pending_verification":
        return {"message": "Already pending verification"}

    supabase.table("invoices").update({"status": "pending_verification"}).eq("id", str(invoice_id)).eq("company_id", str(user.active_company_id)).execute()

    _audit(user, str(invoice_id), "payment_declared",
           old={"status": inv.get("status")},
           new={"status": "pending_verification"})

    return {"message": "Payment declaration received. Awaiting admin bank confirmation."}
