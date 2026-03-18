"""
jobs/renewal_alerts.py — APScheduler job: upcoming renewal notifications
Runs daily. Finds services expiring in the next 30 days and sends alerts.
"""
from datetime import date, timedelta, datetime, timezone
import logging

from database import supabase
from integrations.email_service import send_templated_email

logger = logging.getLogger(__name__)

ALERT_DAYS_BEFORE = 30  # Send alert when renewal is within 30 days


async def run_renewal_alerts():
    """
    Daily job: find renewals due within ALERT_DAYS_BEFORE days
    that haven't been alerted yet and send email notifications.
    """
    logger.info("Running renewal_alerts job")
    today = date.today()
    cutoff = today + timedelta(days=ALERT_DAYS_BEFORE)

    renewals = (
        supabase.table("renewals")
        .select("*, clients(name,email,lang), client_services(*, services_catalog(name))")
        .eq("status", "pending")
        .gte("renewal_date", today.isoformat())
        .lte("renewal_date", cutoff.isoformat())
        .execute()
    ).data

    for renewal in renewals:
        try:
            await _send_renewal_alert(renewal)
        except Exception as e:
            logger.error(f"Error sending renewal alert for {renewal['id']}: {e}")


async def _send_renewal_alert(renewal: dict):
    client = renewal.get("clients") or {}
    service_data = renewal.get("client_services") or {}
    catalog = service_data.get("services_catalog") or {}

    to_email = client.get("email")
    if not to_email:
        return

    sent = await send_templated_email(
        to_email=to_email,
        template_type="renewal_alert",
        company_id=renewal["company_id"],
        lang=client.get("lang", "it"),
        variables={
            "client_name": client.get("name", ""),
            "service_name": catalog.get("name", ""),
            "renewal_date": renewal.get("renewal_date", ""),
        },
    )

    if sent:
        now = datetime.now(timezone.utc).isoformat()
        supabase.table("renewals").update({
            "status": "alerted",
            "alert_sent_at": now,
        }).eq("id", renewal["id"]).execute()
        logger.info(f"Renewal alert sent for renewal {renewal['id']}")
