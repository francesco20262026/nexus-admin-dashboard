"""
modules/reminders/router.py — Manual reminder management + safety rules
"""
from fastapi import APIRouter, HTTPException, status, Depends, Query
from uuid import UUID
from typing import Optional
from datetime import datetime, timezone

from auth.middleware import get_current_user, require_admin, CurrentUser
from database import supabase

router = APIRouter(prefix="/reminders", tags=["reminders"])

MIN_DAYS_BETWEEN = {1: 7, 2: 14, 3: 21}


# ── Safety check ─────────────────────────────────────────────

def _days_since(dt_str: str) -> int:
    dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
    return (datetime.now(timezone.utc) - dt).days


def _can_send_reminder(invoice_id: str, level: int) -> tuple[bool, str]:
    """Returns (can_send, reason). Enforces all safety rules."""
    invoice = (
        supabase.table("invoices")
        .select("status")
        .eq("id", invoice_id)
        .single()
        .execute()
    ).data
    if not invoice:
        return False, "invoice_not_found"
    if invoice["status"] == "paid":
        return False, "already_paid"
    if invoice["status"] == "cancelled":
        return False, "invoice_cancelled"

    # Check duplicate at same level (UNIQUE constraint would also catch it)
    existing = (
        supabase.table("reminders")
        .select("id,sent_at,status")
        .eq("invoice_id", invoice_id)
        .eq("level", level)
        .execute()
    ).data
    if existing and existing[0]["status"] == "sent":
        return False, "duplicate_level"

    # Check minimum days since last reminder (any level)
    last_sent = (
        supabase.table("reminders")
        .select("sent_at")
        .eq("invoice_id", invoice_id)
        .eq("status", "sent")
        .order("sent_at", desc=True)
        .limit(1)
        .execute()
    ).data
    if last_sent:
        days = _days_since(last_sent[0]["sent_at"])
        min_days = MIN_DAYS_BETWEEN.get(level, 7)
        if days < min_days:
            return False, f"too_soon ({days}d elapsed, need {min_days}d)"

    return True, "ok"


# ── Endpoints ────────────────────────────────────────────────

@router.get("/")
async def list_reminders(
    invoice_id: Optional[UUID] = None,
    reminder_status: Optional[str] = Query(None, alias="status"),
    user: CurrentUser = Depends(require_admin),
):
    q = (
        supabase.table("reminders")
        .select("*, invoices(number,total,due_date,clients(name,email))")
        .eq("company_id", str(user.active_company_id))
    )
    if invoice_id:
        q = q.eq("invoice_id", str(invoice_id))
    if reminder_status:
        q = q.eq("status", reminder_status)
    res = q.order("scheduled_at", desc=True).execute()
    return res.data


@router.post("/{invoice_id}/send")
async def send_reminder(
    invoice_id: UUID,
    level: int = Query(..., ge=1, le=3),
    user: CurrentUser = Depends(require_admin),
):
    """Manually send a reminder with all safety rules applied."""
    from integrations.email_service import send_reminder_email

    can_send, reason = _can_send_reminder(str(invoice_id), level)
    if not can_send:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Cannot send reminder: {reason}")

    inv = (
        supabase.table("invoices")
        .select("*, clients(name,email,lang)")
        .eq("id", str(invoice_id))
        .eq("company_id", str(user.active_company_id))
        .single()
        .execute()
    ).data
    if not inv:
        raise HTTPException(status.HTTP_404_NOT_FOUND)

    now = datetime.now(timezone.utc).isoformat()

    await send_reminder_email(inv, company_id=str(user.active_company_id), level=level)

    # Upsert reminder record
    supabase.table("reminders").upsert({
        "company_id": str(user.active_company_id),
        "invoice_id": str(invoice_id),
        "level": level,
        "sent_at": now,
        "status": "sent",
        "scheduled_at": now,
    }, on_conflict="invoice_id,level").execute()

    return {"message": f"Reminder level {level} sent", "invoice_id": str(invoice_id)}


@router.get("/{invoice_id}/history")
async def reminder_history(
    invoice_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    res = (
        supabase.table("reminders")
        .select("*")
        .eq("invoice_id", str(invoice_id))
        .order("level")
        .execute()
    )
    return res.data
