"""
routers/webhooks.py — Inbound webhook handlers.

Extracted from main.py to keep the application bootstrap clean.
Each handler:
  1. Persists the raw event to webhook_events for audit / replay.
  2. Delegates to the integration helper for processing.
  3. Returns a fast 200 {"status": "ok"} so the provider doesn't retry.
"""
import logging
from fastapi import APIRouter, Request

from database import supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


# ── Zoho Sign ─────────────────────────────────────────────────
@router.post("/zoho-sign")
async def webhook_zoho_sign(request: Request):
    """Receive Zoho Sign events (document completed, etc.)."""
    from integrations.zoho_sign import handle_signed_webhook

    payload    = await request.json()
    event_type = payload.get("requests", {}).get("action", "")

    try:
        res = supabase.table("webhook_events").insert({
            "provider":   "zoho_sign",
            "event_type": event_type,
            "payload":    payload,
            "status":     "received",
        }).execute()
        event_id = res.data[0]["id"] if res.data else None
    except Exception:
        logger.exception("Failed to persist zoho_sign webhook event")
        event_id = None

    if event_type == "completed":
        try:
            await handle_signed_webhook(payload)
            if event_id:
                supabase.table("webhook_events").update({"status": "processed"}).eq("id", event_id).execute()
        except Exception:
            logger.exception("Failed to process zoho_sign webhook (event_id=%s)", event_id)
            if event_id:
                supabase.table("webhook_events").update({"status": "failed"}).eq("id", event_id).execute()

    return {"status": "ok"}


# ── Windoc ────────────────────────────────────────────────────
@router.post("/windoc")
async def webhook_windoc(request: Request):
    """Receive Windoc payment update events."""
    from integrations.windoc import sync_invoice_from_windoc

    payload    = await request.json()
    windoc_id  = payload.get("invoice_id")
    company_id = payload.get("company_id")

    try:
        supabase.table("webhook_events").insert({
            "provider":   "windoc",
            "event_type": payload.get("event", "payment_update"),
            "payload":    payload,
            "status":     "received",
        }).execute()
    except Exception:
        logger.exception("Failed to persist windoc webhook event")

    if windoc_id and company_id:
        try:
            await sync_invoice_from_windoc(windoc_id, company_id)
        except Exception:
            logger.exception("Failed to process windoc webhook (invoice_id=%s)", windoc_id)

    return {"status": "ok"}


# ── SendGrid ──────────────────────────────────────────────────
@router.post("/sendgrid")
async def webhook_sendgrid(request: Request):
    """Receive SendGrid bounce / delivery events."""
    raw = await request.json()
    events = raw if isinstance(raw, list) else [raw]

    for event in events:
        event_type = event.get("event", "unknown")
        email      = event.get("email", "")

        try:
            supabase.table("webhook_events").insert({
                "provider":   "sendgrid",
                "event_type": event_type,
                "payload":    event,
                "status":     "received",
            }).execute()
        except Exception:
            logger.exception("Failed to persist sendgrid webhook event")
            continue

        if event_type in ("bounce", "dropped", "deferred"):
            try:
                supabase.table("email_logs").update({
                    "status":        "bounced" if event_type == "bounce" else "failed",
                    "error_message": event.get("reason", event_type),
                }).eq("to_email", email).eq("status", "sent").execute()
            except Exception:
                logger.exception("Failed to update email_logs for %s event (email=%s)", event_type, email)

    return {"status": "ok"}
