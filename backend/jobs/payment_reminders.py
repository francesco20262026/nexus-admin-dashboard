"""
jobs/payment_reminders.py — APScheduler job: automatic payment reminders
Runs daily. Finds overdue invoices and sends level-appropriate reminders.

Safety principles:
- Each invoice processed independently — one failure does not abort the run.
- Only ONE reminder level fires per invoice per run (no flooding).
- Reminders table upsert is attempted AFTER email send — if upsert fails the
  reminder is recorded as failed so the next run can retry safely.
- Job-level audit insert is non-blocking — failure is logged but does not crash.
- Missing email config raises directly; other exceptions are logged and counted.
"""
import logging
from datetime import datetime, date, timedelta, timezone

from database import supabase
from integrations.email_service import send_reminder_email

logger = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────

# Minimum days overdue before each level is eligible to fire
LEVEL_TRIGGERS: dict[int, int] = {
    1: 1,    # Level 1: fire 1 day after due date
    2: 8,    # Level 2: fire 8 days after due date
    3: 22,   # Level 3: final notice after 22 days
}

# Minimum days that must pass before the same level can be re-triggered
# (only relevant if the upsert failed on a prior run and the level is retried)
MIN_DAYS_BETWEEN: dict[int, int] = {1: 7, 2: 14, 3: 21}


# ── Job entry point ───────────────────────────────────────────

async def run_payment_reminders(company_id: str | None = None) -> None:
    """
    Daily job: identify overdue invoices and send level-appropriate reminders.
    Optionally scoped to a single company_id (useful for testing and reruns).
    """
    logger.info("payment_reminders job starting (company_id=%s)", company_id or "all")
    today = date.today()

    # Fetch overdue invoices — include status so we can double-check at processing time
    q = (
        supabase.table("invoices")
        .select("id,company_id,status,due_date,total,number,clients(name,email,lang)")
        .eq("status", "overdue")
    )
    if company_id:
        q = q.eq("company_id", company_id)

    try:
        invoices = q.execute().data or []
    except Exception as exc:
        logger.error("payment_reminders: invoice fetch failed: %s", exc)
        return

    logger.info("payment_reminders: processing %d invoice(s)", len(invoices))

    sent_count    = 0
    skipped_count = 0
    error_count   = 0

    for inv in invoices:
        try:
            outcome = await _process_invoice(inv, today)
            if outcome == "sent":
                sent_count += 1
            else:
                skipped_count += 1
        except Exception as exc:
            logger.error("payment_reminders: unhandled error invoice=%s: %s", inv.get("id"), exc)
            error_count += 1

    logger.info(
        "payment_reminders job finished — sent=%d skipped=%d errors=%d",
        sent_count, skipped_count, error_count,
    )

    # Non-blocking job-level audit entry
    try:
        supabase.table("audit_logs").insert({
            "company_id":  company_id or "system",
            "entity_type": "job",
            "entity_id":   "payment_reminders",
            "action":      "execution_completed",
            "new_values":  {
                "sent":    sent_count,
                "skipped": skipped_count,
                "errors":  error_count,
                "date":    today.isoformat(),
            },
        }).execute()
    except Exception as exc:
        logger.warning("payment_reminders: job audit insert failed: %s", exc)


# ── Per-invoice processing ────────────────────────────────────

async def _process_invoice(inv: dict, today: date) -> str:
    """
    Evaluate and possibly send one reminder for a single overdue invoice.
    Returns: "sent" | "skipped"
    """
    invoice_id = inv["id"]
    company_id = inv["company_id"]

    # Double-check status — invoice may have been paid since the batch was fetched
    if inv.get("status") == "paid":
        logger.debug("Skipping invoice=%s — already paid", invoice_id)
        return "skipped"

    # Parse due_date safely
    try:
        due_date = date.fromisoformat(inv["due_date"])
    except (KeyError, ValueError, TypeError) as exc:
        logger.warning("Skipping invoice=%s — invalid due_date: %s", invoice_id, exc)
        return "skipped"

    days_overdue = (today - due_date).days
    if days_overdue <= 0:
        return "skipped"   # Not actually overdue

    # Fetch existing sent reminders scoped to company
    try:
        existing_res = (
            supabase.table("reminders")
            .select("level,sent_at,status")
            .eq("invoice_id", invoice_id)
            .eq("company_id", company_id)   # tenant safety
            .execute()
        )
        existing = existing_res.data or []
    except Exception as exc:
        logger.warning("Skipping invoice=%s — reminders fetch failed: %s", invoice_id, exc)
        return "skipped"

    # Build a map of levels that have already been successfully sent
    sent_levels: dict[int, str] = {
        r["level"]: r["sent_at"]
        for r in existing
        if r.get("status") == "sent" and r.get("sent_at")
    }

    # Evaluate each level in order — send at most one per run
    for level, trigger_days in sorted(LEVEL_TRIGGERS.items()):
        if days_overdue < trigger_days:
            continue   # Too early for this level

        if level in sent_levels:
            # This level was already sent — verify cooldown and then skip.
            # We never re-send the same level once successfully delivered.
            try:
                sent_dt = datetime.fromisoformat(sent_levels[level].replace("Z", "+00:00"))
                days_since = (datetime.now(timezone.utc) - sent_dt).days
            except Exception:
                days_since = 9999   # Unknown — treat as long ago but still skip

            if days_since < MIN_DAYS_BETWEEN[level]:
                logger.debug(
                    "Skipping invoice=%s level=%d — cooldown (%dd elapsed, need %dd)",
                    invoice_id, level, days_since, MIN_DAYS_BETWEEN[level],
                )
            # Either way: level already sent — do not resend
            continue

        # ── Level is eligible — attempt send ──────────────────
        logger.info("Sending level=%d reminder invoice=%s days_overdue=%d", level, invoice_id, days_overdue)

        send_status  = "sent"
        send_error   = None
        email_failed = False

        try:
            await send_reminder_email(inv, company_id=company_id, level=level)
        except Exception as exc:
            exc_str = str(exc)
            # Config / SMTP errors: skip this invoice for this run (not a code bug)
            if any(kw in exc_str.lower() for kw in ("config", "smtp", "email", "credential", "not configured")):
                logger.warning(
                    "Skipping reminder invoice=%s level=%d — email config issue: %s",
                    invoice_id, level, exc_str,
                )
                return "skipped"
            # Transient / unexpected error: log and mark as failed so it can be retried
            logger.error("send_reminder_email failed invoice=%s level=%d: %s", invoice_id, level, exc)
            send_status  = "failed"
            send_error   = exc_str[:200]
            email_failed = True

        # ── Persist reminder record (always, whether sent or failed)
        now = datetime.now(timezone.utc).isoformat()
        try:
            supabase.table("reminders").upsert({
                "company_id":      company_id,
                "invoice_id":      invoice_id,
                "level":           level,
                "sent_at":         now if not email_failed else None,
                "scheduled_at":    now,
                "status":          send_status,
                "delivery_result": send_error,
            }, on_conflict="invoice_id,level").execute()
        except Exception as exc:
            logger.error(
                "reminder upsert failed invoice=%s level=%d (email was %s): %s",
                invoice_id, level, send_status, exc,
            )

        # Only fire one level per run regardless of outcome
        return "sent" if not email_failed else "skipped"

    return "skipped"
