"""
jobs/payment_reminders.py — APScheduler job: automatic payment reminders
Runs daily. Finds overdue invoices and sends level-appropriate reminders.
"""
from datetime import datetime, date, timedelta, timezone
import logging

from database import supabase
from integrations.email_service import send_reminder_email

logger = logging.getLogger(__name__)

# Minimum days overdue before each level fires
LEVEL_TRIGGERS = {
    1: 1,   # Level 1: send after 1 day overdue
    2: 8,   # Level 2: send after 8 days overdue
    3: 22,  # Level 3: final notice after 22 days overdue
}
MIN_DAYS_BETWEEN: dict[int, int] = {1: 7, 2: 14, 3: 21}


async def run_payment_reminders():
    """
    Daily job: identify overdue invoices and send reminders.
    Safety rules applied per invoice per level.
    """
    logger.info("Running payment_reminders job")
    today = date.today()

    # Fetch all overdue invoices across all companies
    invoices = (
        supabase.table("invoices")
        .select("id,company_id,due_date,total,number,clients(name,email,lang)")
        .eq("status", "overdue")
        .execute()
    ).data

    for inv in invoices:
        try:
            await _process_invoice_reminders(inv, today)
        except Exception as e:
            logger.error(f"Error processing reminders for invoice {inv['id']}: {e}")


async def _process_invoice_reminders(inv: dict, today: date):
    invoice_id = inv["id"]
    company_id = inv["company_id"]
    due_date = date.fromisoformat(inv["due_date"])
    days_overdue = (today - due_date).days

    # Check existing reminders
    existing = (
        supabase.table("reminders")
        .select("level,sent_at,status")
        .eq("invoice_id", invoice_id)
        .execute()
    ).data
    sent_levels = {r["level"]: r["sent_at"] for r in existing if r["status"] == "sent"}

    for level, trigger_days in LEVEL_TRIGGERS.items():
        if days_overdue < trigger_days:
            continue  # Not overdue enough for this level yet

        if level in sent_levels:
            # Check min days since last send of this level
            days_since = (datetime.now(timezone.utc) - datetime.fromisoformat(
                sent_levels[level].replace("Z", "+00:00")
            )).days
            if days_since < MIN_DAYS_BETWEEN[level]:
                continue  # Too soon to resend at this level
            continue  # Already sent at this level, don't resend

        # Safe to send
        logger.info(f"Sending level {level} reminder for invoice {invoice_id}")
        await send_reminder_email(inv, company_id=company_id, level=level)

        now = datetime.now(timezone.utc).isoformat()
        supabase.table("reminders").upsert({
            "company_id": company_id,
            "invoice_id": invoice_id,
            "level": level,
            "sent_at": now,
            "scheduled_at": now,
            "status": "sent",
        }, on_conflict="invoice_id,level").execute()

        # Only send one level per run to avoid flooding
        break
