"""
main.py — FastAPI application entry point
Includes all routers, webhooks, APScheduler jobs, and CORS.
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
import logging

from config import settings
from auth.router import router as auth_router
from modules.clients.router import router as clients_router
from modules.invoices.router import router as invoices_router
from modules.services.router import router as services_router
from modules.contracts.router import router as contracts_router
from modules.documents.router import router as documents_router
from modules.reminders.router import router as reminders_router
from modules.renewals.router import router as renewals_router
from modules.dashboard.router import router as dashboard_router

logger = logging.getLogger(__name__)

# ── APScheduler ──────────────────────────────────────────────
scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start/stop background scheduler with the app."""
    from jobs.payment_reminders import run_payment_reminders
    from jobs.renewal_alerts import run_renewal_alerts

    scheduler.add_job(run_payment_reminders, "cron", hour=8, minute=0, id="payment_reminders")
    scheduler.add_job(run_renewal_alerts,    "cron", hour=8, minute=30, id="renewal_alerts")
    scheduler.start()
    logger.info("Scheduler started")
    yield
    scheduler.shutdown()
    logger.info("Scheduler stopped")


# ── App ──────────────────────────────────────────────────────
app = FastAPI(
    title="Nexus CRM API",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ──────────────────────────────────────────────────
app.include_router(auth_router,      prefix="/api")
app.include_router(clients_router,   prefix="/api")
app.include_router(invoices_router,  prefix="/api")
app.include_router(services_router,  prefix="/api")
app.include_router(contracts_router, prefix="/api")
app.include_router(documents_router, prefix="/api")
app.include_router(reminders_router, prefix="/api")
app.include_router(renewals_router,  prefix="/api")
app.include_router(dashboard_router, prefix="/api")


# ── Webhooks ─────────────────────────────────────────────────

@app.post("/webhooks/zoho-sign", tags=["webhooks"])
async def webhook_zoho_sign(request: Request):
    """Receive Zoho Sign events (document completed, etc.)."""
    from integrations.zoho_sign import handle_signed_webhook
    from database import supabase

    payload = await request.json()
    event_type = payload.get("requests", {}).get("action", "")

    # Log raw event
    supabase.table("webhook_events").insert({
        "provider": "zoho_sign",
        "event_type": event_type,
        "payload": payload,
        "status": "received",
    }).execute()

    if event_type == "completed":
        await handle_signed_webhook(payload)
        supabase.table("webhook_events").update({"status": "processed"}).eq(
            "event_type", event_type
        ).execute()

    return {"status": "ok"}


@app.post("/webhooks/windoc", tags=["webhooks"])
async def webhook_windoc(request: Request):
    """Receive Windoc payment update events."""
    from integrations.windoc import sync_invoice_from_windoc
    from database import supabase

    payload = await request.json()
    windoc_id = payload.get("invoice_id")
    company_id = payload.get("company_id")

    supabase.table("webhook_events").insert({
        "provider": "windoc",
        "event_type": payload.get("event", "payment_update"),
        "payload": payload,
        "status": "received",
    }).execute()

    if windoc_id and company_id:
        await sync_invoice_from_windoc(windoc_id, company_id)

    return {"status": "ok"}


@app.post("/webhooks/sendgrid", tags=["webhooks"])
async def webhook_sendgrid(request: Request):
    """Receive SendGrid bounce / delivery events."""
    from database import supabase

    events = await request.json()
    if not isinstance(events, list):
        events = [events]

    for event in events:
        event_type = event.get("event", "unknown")
        email = event.get("email", "")

        supabase.table("webhook_events").insert({
            "provider": "sendgrid",
            "event_type": event_type,
            "payload": event,
            "status": "received",
        }).execute()

        # Update email_log if bounce or failed delivery
        if event_type in ("bounce", "dropped", "deferred"):
            supabase.table("email_logs").update({
                "status": "bounced" if event_type == "bounce" else "failed",
                "error_message": event.get("reason", event_type),
            }).eq("to_email", email).eq("status", "sent").execute()

    return {"status": "ok"}


# ── Health ────────────────────────────────────────────────────

@app.get("/api/health", tags=["health"])
async def health():
    return {
        "status": "ok",
        "version": "1.0.0",
        "scheduler": scheduler.running,
    }
