"""
automation.py — Onboarding status auto-advancement helper.

Called by module routers after key business events to automatically
advance the linked onboarding record to the next workflow state.

RULE: automation NEVER blocks manual override. If the auto-advance fails,
it is logged as a warning but does NOT cause the original request to fail.
"""
import logging
from typing import Optional
from database import supabase

logger = logging.getLogger(__name__)

# Map: current onboarding status → what we can auto-advance to
# Only advance if current status is AT or BEFORE the implied step
_ADVANCEMENT_ORDER = [
    'new',
    'quote_draft',
    'quote_sent',
    'quote_accepted',
    'contract_draft',
    'contract_sent',
    'contract_signed',
    'proforma_draft',
    'proforma_issued',
    'waiting_payment',
    'payment_under_review',
    'converted_to_client',
]


def _onboarding_status_rank(s: str) -> int:
    try:
        return _ADVANCEMENT_ORDER.index(s)
    except ValueError:
        return -1


def auto_advance_onboarding(
    company_id: str,
    user_id: str,
    onboarding_id: Optional[str],
    target_status: str,
    reason: str,
) -> None:
    """
    Advance an onboarding record to `target_status` if it is currently
    at an earlier stage. Never advances if already past that stage.
    Never raises — failures are soft-logged.

    Args:
        company_id:    Tenant ID (for RLS safety).
        user_id:       Admin who triggered the event.
        onboarding_id: The onboarding record to update (may be None → no-op).
        target_status: The status to advance to.
        reason:        Human-readable reason for the audit log.
    """
    if not onboarding_id:
        return

    try:
        res = (
            supabase.table("onboarding")
            .select("id, status")
            .eq("id", str(onboarding_id))
            .eq("company_id", company_id)
            .maybe_single()
            .execute()
        )
        if not res.data:
            logger.warning("auto_advance: onboarding %s not found", onboarding_id)
            return

        current = res.data.get("status", "new")

        # Only advance, never retreat
        if _onboarding_status_rank(current) >= _onboarding_status_rank(target_status):
            logger.debug(
                "auto_advance: skip onboarding=%s current=%s target=%s (already at/past target)",
                onboarding_id, current, target_status
            )
            return

        # Block auto-advance into terminal states — those must be done via /convert or /cancel
        if target_status in ("converted_to_client", "abandoned", "cancelled"):
            logger.debug("auto_advance: skip terminal target=%s", target_status)
            return

        supabase.table("onboarding").update(
            {"status": target_status}
        ).eq("id", str(onboarding_id)).eq("company_id", company_id).execute()

        # Write audit log
        try:
            supabase.table("audit_logs").insert({
                "company_id":  company_id,
                "user_id":     user_id,
                "entity_type": "onboarding",
                "entity_id":   str(onboarding_id),
                "action":      "auto_advance",
                "old_values":  {"status": current},
                "new_values":  {"status": target_status, "reason": reason},
            }).execute()
        except Exception as audit_exc:
            logger.warning("auto_advance: audit_log write failed: %s", audit_exc)

        logger.info(
            "auto_advance: onboarding=%s %s → %s (%s)",
            onboarding_id, current, target_status, reason
        )

    except Exception as exc:
        logger.warning(
            "auto_advance: non-blocking error for onboarding=%s: %s",
            onboarding_id, exc
        )


def auto_convert_onboarding_to_client(
    company_id: str,
    user_id: str,
    onboarding_id: str,
    invoice_id: Optional[str] = None,
) -> Optional[str]:
    """
    Convert an onboarding prospect into a real client.

    1. Read the onboarding record.
    2. If onboarding.client_id already set → use it.
    3. Otherwise, create new client row from onboarding fields.
    4. Link client_id back to onboarding.
    5. Advance onboarding status → 'converted_to_client'.

    Returns the client_id (str) or None on failure. Never raises.
    """
    try:
        onb_res = (
            supabase.table("onboarding")
            .select("id, status, client_id, company_name, email, phone, vat_number, pec, dest_code, address, city, reference_name")
            .eq("id", onboarding_id)
            .eq("company_id", company_id)
            .maybe_single()
            .execute()
        )
        if not onb_res.data:
            logger.warning("auto_convert: onboarding %s not found", onboarding_id)
            return None

        onb = onb_res.data
        existing_client_id = onb.get("client_id")

        if existing_client_id:
            client_id = str(existing_client_id)
            logger.info("auto_convert: onboarding %s already has client_id %s", onboarding_id, client_id)
        else:
            new_client = {
                "company_id":    company_id,
                "name":          onb.get("company_name") or onb.get("reference_name") or "Cliente",
                "email":         onb.get("email", ""),
                "phone":         onb.get("phone", ""),
                "vat_number":    onb.get("vat_number", ""),
                "pec":           onb.get("pec", ""),
                "dest_code":     onb.get("dest_code", ""),
                "address":       onb.get("address", ""),
                "city":          onb.get("city", ""),
                "status":        "active",
                "onboarding_id": onboarding_id,
            }
            client_res = supabase.table("clients").insert(new_client).execute()
            if not client_res.data:
                logger.warning("auto_convert: client insert returned no data for onboarding %s", onboarding_id)
                return None

            client_id = str(client_res.data[0]["id"])
            supabase.table("onboarding").update({"client_id": client_id}).eq("id", onboarding_id).eq("company_id", company_id).execute()
            logger.info("auto_convert: created client %s from onboarding %s", client_id, onboarding_id)

        # Advance onboarding status
        supabase.table("onboarding").update({"status": "converted_to_client"}).eq("id", onboarding_id).eq("company_id", company_id).execute()

        # Audit
        try:
            supabase.table("audit_logs").insert({
                "company_id":  company_id,
                "user_id":     user_id,
                "entity_type": "onboarding",
                "entity_id":   onboarding_id,
                "action":      "converted_to_client",
                "old_values":  {"status": onb.get("status")},
                "new_values":  {"status": "converted_to_client", "client_id": client_id, "invoice_id": invoice_id},
            }).execute()
        except Exception as audit_exc:
            logger.warning("auto_convert: audit_log write failed: %s", audit_exc)

        logger.info("auto_convert: onboarding %s → converted_to_client (client=%s)", onboarding_id, client_id)
        return client_id

    except Exception as exc:
        logger.warning("auto_convert: non-blocking error for onboarding=%s: %s", onboarding_id, exc)
        return None
