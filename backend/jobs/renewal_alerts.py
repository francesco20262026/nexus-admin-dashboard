"""
jobs/renewal_alerts.py — APScheduler job: upcoming renewal notifications
Runs daily. Finds services expiring in the next ALERT_DAYS_BEFORE days
and sends alert emails to clients.

Safety principles:
- Only renewals with status="pending" are selected (idempotent filter).
- status is set to "alerted" AFTER a successful send — next run skip naturally.
- Renewal update includes company_id for tenant safety.
- Job-level audit insert is non-blocking.
- Missing client email or config issues skip the renewal, never crash.
"""
import logging
from datetime import date, timedelta, datetime, timezone

from database import supabase
from integrations.email_service import send_templated_email

logger = logging.getLogger(__name__)

ALERT_DAYS_BEFORE = 30   # Alert when renewal is within 30 days


# ── Job entry point ───────────────────────────────────────────

async def run_renewal_alerts(company_id: str | None = None) -> None:
    """
    Daily job: find renewals due within ALERT_DAYS_BEFORE days
    with status="pending" and dispatch alert emails.
    """
    logger.info("renewal_alerts job starting (company_id=%s)", company_id or "all")
    today  = date.today()
    cutoff = today + timedelta(days=ALERT_DAYS_BEFORE)

    q = (
        supabase.table("renewals")
        .select("*, clients(name,email,lang), client_services(*, services_catalog(name))")
        .eq("status", "pending")
        .gte("renewal_date", today.isoformat())
        .lte("renewal_date", cutoff.isoformat())
    )
    if company_id:
        q = q.eq("company_id", company_id)

    try:
        renewals = q.execute().data or []
    except Exception as exc:
        logger.error("renewal_alerts: renewal fetch failed: %s", exc)
        return

    logger.info("renewal_alerts: processing %d renewal(s)", len(renewals))

    sent_count    = 0
    skipped_count = 0
    error_count   = 0

    for renewal in renewals:
        try:
            outcome = await _process_renewal(renewal)
            if outcome == "sent":
                sent_count += 1
            else:
                skipped_count += 1
        except Exception as exc:
            logger.error("renewal_alerts: unhandled error renewal=%s: %s", renewal.get("id"), exc)
            error_count += 1

    logger.info(
        "renewal_alerts job finished — sent=%d skipped=%d errors=%d",
        sent_count, skipped_count, error_count,
    )

    # Non-blocking job-level audit entry
    try:
        supabase.table("audit_logs").insert({
            "company_id":  company_id or "system",
            "entity_type": "job",
            "entity_id":   "renewal_alerts",
            "action":      "execution_completed",
            "new_values":  {
                "sent":    sent_count,
                "skipped": skipped_count,
                "errors":  error_count,
                "date":    today.isoformat(),
            },
        }).execute()
    except Exception as exc:
        logger.warning("renewal_alerts: job audit insert failed: %s", exc)


# ── Per-renewal processing ────────────────────────────────────

async def _process_renewal(renewal: dict) -> str:
    """
    Attempt to send one renewal alert email.
    Returns: "sent" | "skipped"
    """
    renewal_id = renewal.get("id")
    company_id = renewal.get("company_id")

    # Guard: must have company context
    if not renewal_id or not company_id:
        logger.warning("Skipping renewal with missing id or company_id")
        return "skipped"

    # Duplicate guard: already alerted (should be filtered by query but double-check)
    if renewal.get("status") == "alerted":
        logger.debug("Skipping renewal=%s — already alerted", renewal_id)
        return "skipped"

    client     = renewal.get("clients") or {}
    service    = renewal.get("client_services") or {}
    catalog    = service.get("services_catalog") or {}
    to_email   = (client.get("email") or "").strip()

    if not to_email:
        logger.warning("Skipping renewal=%s — client has no email address", renewal_id)
        return "skipped"

    # Parse renewal_date safely for logging
    renewal_date_str = renewal.get("renewal_date", "")
    try:
        renewal_date = date.fromisoformat(renewal_date_str)
        days_until   = (renewal_date - date.today()).days
    except (ValueError, TypeError):
        renewal_date = None
        days_until   = None

    logger.info(
        "Sending renewal alert renewal=%s days_until=%s email=%s",
        renewal_id, days_until, to_email,
    )

    # Attempt email send
    try:
        sent = await send_templated_email(
            to_email=to_email,
            template_type="renewal_alert",
            company_id=company_id,
            lang=client.get("lang", "it"),
            variables={
                "client_name":  client.get("name", ""),
                "service_name": catalog.get("name", ""),
                "renewal_date": renewal_date_str,
            },
        )
    except Exception as exc:
        exc_str = str(exc)
        # Config / credential / template issues — skip this renewal, do not crash
        if any(kw in exc_str.lower() for kw in ("config", "smtp", "credential", "template", "not configured")):
            logger.warning(
                "Skipping renewal=%s — email config issue: %s", renewal_id, exc_str,
            )
            return "skipped"
        # Unexpected / transient error — bubble up so outer loop counts it as error
        raise

    if not sent:
        logger.warning("send_templated_email returned falsy for renewal=%s", renewal_id)
        return "skipped"

    # Mark renewal as alerted — scoped to company for tenant safety
    now = datetime.now(timezone.utc).isoformat()
    try:
        supabase.table("renewals").update({
            "status":        "alerted",
            "alert_sent_at": now,
        }).eq("id", renewal_id).eq("company_id", company_id).execute()
    except Exception as exc:
        # Email was sent — log the DB failure but still count as sent
        logger.error(
            "renewal_alerts: DB update failed after send renewal=%s: %s",
            renewal_id, exc,
        )

    logger.info("Renewal alert sent renewal=%s", renewal_id)
    return "sent"
