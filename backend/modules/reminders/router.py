"""
modules/reminders/router.py — Manual reminder management + safety rules
"""
import logging
from fastapi import APIRouter, HTTPException, status, Depends, Query
from uuid import UUID
from typing import Optional
from datetime import datetime, timezone

from auth.middleware import require_admin, CurrentUser
from database import supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reminders", tags=["reminders"])

MIN_DAYS_BETWEEN = {1: 7, 2: 14, 3: 21}


# ── Safety Helpers ────────────────────────────────────────────

def _days_since(dt_str: str) -> int:
    dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
    return (datetime.now(timezone.utc) - dt).days


def _can_send_reminder(invoice_id: str, company_id: str, level: int) -> tuple[bool, str]:
    """Returns (can_send, reason). Enforces all safety rules. Scoped to company."""
    invoice = (
        supabase.table("invoices")
        .select("status")
        .eq("id", invoice_id)
        .eq("company_id", user.tenant)   # tenant guard
        .maybe_single()
    ).data
    if not invoice:
        return False, "invoice_not_found"
    if invoice["status"] == "paid":
        return False, "already_paid"
    if invoice["status"] in ("cancelled", "void"):
        return False, "invoice_cancelled"

    # Check duplicate at same level
    existing = (
        supabase.table("reminders")
        .select("id,sent_at,status")
        .eq("invoice_id", invoice_id)
        .eq("company_id", user.tenant)
        .eq("level", level)
        .execute()
    ).data or []
    if any(r.get("status") == "sent" for r in existing):
        return False, "duplicate_level"

    # Check minimum cooldown since last sent reminder (any level)
    last_sent = (
        supabase.table("reminders")
        .select("sent_at")
        .eq("invoice_id", invoice_id)
        .eq("company_id", user.tenant)
        .eq("status", "sent")
        .order("sent_at", desc=True)
        .limit(1)
        .execute()
    ).data or []
    if last_sent:
        days = _days_since(last_sent[0]["sent_at"])
        min_days = MIN_DAYS_BETWEEN.get(level, 7)
        if days < min_days:
            return False, f"too_soon ({days}d elapsed, need {min_days}d)"

    return True, "ok"


def _audit(user: CurrentUser, entity_id: str, action: str,
           new: Optional[dict] = None) -> None:
    try:
        supabase.table("audit_logs").insert({
            "company_id":  str(user.active_company_id),
            "user_id":     str(user.user_id),
            "entity_type": "reminder",
            "entity_id":   entity_id,
            "action":      action,
            "new_values":  new,
        }).execute()
    except Exception as exc:
        logger.warning("audit_log write failed for reminder %s: %s", entity_id, exc)


# ── Endpoints ─────────────────────────────────────────────────

@router.get("/")
async def list_reminders(
    invoice_id: Optional[UUID] = None,
    reminder_status: Optional[str] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: CurrentUser = Depends(require_admin),
):
    q = (
        supabase.table("reminders")
        .select("*, invoices(number,total,due_date,clients(name,email))", count="exact")
        .eq("company_id", user.tenant)
    )
    if invoice_id:
        q = q.eq("invoice_id", str(invoice_id))
    if reminder_status:
        q = q.eq("status", reminder_status)

    offset = (page - 1) * page_size
    res = q.order("scheduled_at", desc=True).range(offset, offset + page_size - 1).execute()
    return {"data": res.data or [], "total": res.count or 0, "page": page, "page_size": page_size}


@router.post("/{invoice_id}/send")
async def send_reminder(
    invoice_id: UUID,
    level: int = Query(..., ge=1, le=3),
    user: CurrentUser = Depends(require_admin),
):
    """Manually send a reminder with all safety rules applied."""
    from integrations.email_service import send_reminder_email

    can_send, reason = _can_send_reminder(str(invoice_id), str(user.active_company_id), level)
    if not can_send:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Cannot send reminder: {reason}")

    inv = (
        supabase.table("invoices")
        .select("*, clients(name,email,lang)")
        .eq("id", str(invoice_id))
        .eq("company_id", user.tenant)
        .maybe_single()
    ).data
    if not inv:
        raise HTTPException(status.HTTP_404_NOT_FOUND)

    now = datetime.now(timezone.utc).isoformat()
    await send_reminder_email(inv, company_id=str(user.active_company_id), level=level)

    supabase.table("reminders").upsert({
        "company_id":   str(user.active_company_id),
        "invoice_id":   str(invoice_id),
        "level":        level,
        "sent_at":      now,
        "status":       "sent",
        "scheduled_at": now,
    }, on_conflict="invoice_id,level").execute()

    _audit(user, str(invoice_id), f"reminder_sent_level_{level}",
           new={"level": level, "sent_at": now})

    return {"message": f"Reminder level {level} sent", "invoice_id": str(invoice_id)}


@router.get("/{invoice_id}/history")
async def reminder_history(
    invoice_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    # Verify invoice belongs to this tenant before returning reminder history
    inv_check = (
        supabase.table("invoices")
        .select("id")
        .eq("id", str(invoice_id))
        .eq("company_id", user.tenant)
        .maybe_single()
    )
    if not inv_check.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")

    res = (
        supabase.table("reminders")
        .select("*")
        .eq("invoice_id", str(invoice_id))
        .eq("company_id", user.tenant)   # tenant guard
        .order("level")
        .execute()
    )
    return res.data or []


@router.post("/{reminder_id}/retry")
async def retry_reminder(
    reminder_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    """Retry a failed/bounced reminder, enforcing invoice state rules."""
    from integrations.email_service import send_reminder_email

    # 1. Load reminder — scoped to company
    rem = (
        supabase.table("reminders")
        .select("*")
        .eq("id", str(reminder_id))
        .eq("company_id", user.tenant)
        .maybe_single()
    ).data
    if not rem:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reminder not found")

    # 2. Type gate — only invoice reminders are retryable
    if rem.get("type", "invoice") != "invoice":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Solo i promemoria fattura sono supportati per il rinvio manuale.",
        )

    invoice_id = rem.get("invoice_id")
    if not invoice_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nessuna fattura collegata.")

    # 3. Load invoice — scoped to company
    inv = (
        supabase.table("invoices")
        .select("*, clients(name,email,lang)")
        .eq("id", invoice_id)
        .eq("company_id", user.tenant)
        .maybe_single()
    ).data
    if not inv:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fattura originale inesistente o cancellata.")

    # 4. Skip if invoice is already resolved
    if inv.get("status") in ("paid", "cancelled", "void"):
        inv_status = inv["status"]
        supabase.table("reminders").update({
            "status":          "skipped",
            "delivery_result": f"Fattura già {inv_status}",
        }).eq("id", str(reminder_id)).eq("company_id", user.tenant).execute()
        return {"message": f"Retry annullato: la fattura è già {inv_status}.", "status": "skipped"}

    # 5. Send
    level = rem.get("level") or 1
    try:
        success = await send_reminder_email(inv, company_id=str(user.active_company_id), level=level)
    except Exception as exc:
        logger.error("send_reminder_email failed reminder=%s: %s", reminder_id, exc)
        success = False

    # 6. Persist result
    now = datetime.now(timezone.utc).isoformat()
    new_status      = "sent" if success else "failed"
    delivery_result = "Retry manuale eseguito" if success else "Errore SMTP durante retry"

    supabase.table("reminders").update({
        "status":          new_status,
        "sent_at":         now if success else None,
        "delivery_result": delivery_result,
    }).eq("id", str(reminder_id)).eq("company_id", user.tenant).execute()

    _audit(user, str(reminder_id), "retry_dispatched",
           new={"status": new_status, "invoice_id": invoice_id})

    if not success:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "Invio fallito. Controlla le configurazioni SMTP / Provider.",
        )

    return {"message": "Promemoria reinviato con successo", "status": new_status}
