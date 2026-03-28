"""
server.py — Nexus CRM unified entry point for Replit.
Serves the static frontend and mounts the FastAPI backend under /api.
Runs on 0.0.0.0:5000.
"""
import os
import sys
import logging

# Add backend directory to Python path so backend modules can be imported
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from apscheduler.schedulers.asyncio import AsyncIOScheduler
import uvicorn

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        from jobs.payment_reminders import run_payment_reminders
        from jobs.renewal_alerts import run_renewal_alerts

        scheduler.add_job(run_payment_reminders, "cron", hour=8, minute=0, id="payment_reminders")
        scheduler.add_job(run_renewal_alerts, "cron", hour=8, minute=30, id="renewal_alerts")
        scheduler.start()
        app.state.scheduler = scheduler
        logger.info("Scheduler started")
    except Exception as e:
        logger.warning("Scheduler could not start: %s", e)

    try:
        from core_services.pdf_service import WEASYPRINT_AVAILABLE, WEASYPRINT_ERROR
        if not WEASYPRINT_AVAILABLE:
            logger.warning("PDF subsystem unavailable: %s", WEASYPRINT_ERROR)
        else:
            logger.info("PDF subsystem OK")
    except Exception as e:
        logger.warning("PDF health probe error: %s", e)

    yield

    try:
        scheduler.shutdown()
        logger.info("Scheduler stopped")
    except Exception:
        pass


app = FastAPI(
    title="Nexus CRM",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount backend API routers
try:
    from auth.router import router as auth_router
    from modules.clients.router import router as clients_router
    from modules.invoices.router import router as invoices_router
    from modules.services.router import router as services_router
    from modules.contracts.router import router as contracts_router
    from modules.documents.router import router as documents_router
    from modules.reminders.router import router as reminders_router
    from modules.renewals.router import router as renewals_router
    from modules.dashboard.router import router as dashboard_router
    from modules.settings.router import router as settings_router
    from modules.payments.router import router as payments_router
    from modules.onboarding.router import router as onboarding_router
    from modules.quotes.router import router as quotes_router
    from modules.users.router import router as users_router
    from modules.companies.router import router as companies_router
    from modules.activity.router import client_router as activity_client_router
    from modules.activity.router import onboarding_router as activity_onboarding_router
    from modules.activity.router import global_router as activity_global_router
    from routers.health import router as health_router
    from routers.jobs import router as jobs_router
    from routers.webhooks import router as webhooks_router

    app.include_router(auth_router, prefix="/api")
    app.include_router(clients_router, prefix="/api")
    app.include_router(invoices_router, prefix="/api")
    app.include_router(services_router, prefix="/api")
    app.include_router(contracts_router, prefix="/api")
    app.include_router(documents_router, prefix="/api")
    app.include_router(reminders_router, prefix="/api")
    app.include_router(renewals_router, prefix="/api")
    app.include_router(dashboard_router, prefix="/api")
    app.include_router(settings_router, prefix="/api")
    app.include_router(payments_router, prefix="/api")
    app.include_router(onboarding_router, prefix="/api")
    app.include_router(quotes_router, prefix="/api")
    app.include_router(users_router, prefix="/api")
    app.include_router(companies_router, prefix="/api")
    app.include_router(activity_client_router, prefix="/api")
    app.include_router(activity_onboarding_router, prefix="/api")
    app.include_router(activity_global_router, prefix="/api")
    app.include_router(health_router, prefix="/api")
    app.include_router(jobs_router, prefix="/api")
    app.include_router(webhooks_router)

    logger.info("All API routers mounted successfully")
except Exception as e:
    logger.error("Failed to mount API routers: %s", e)
    raise

# Serve static assets
app.mount("/assets", StaticFiles(directory="assets"), name="assets")
app.mount("/components", StaticFiles(directory="components"), name="components")


@app.get("/")
async def serve_index():
    return FileResponse("index.html")


@app.get("/{page:path}")
async def serve_page(page: str):
    html_file = f"{page}" if page.endswith(".html") else f"{page}.html"
    if os.path.isfile(html_file):
        return FileResponse(html_file)
    if os.path.isfile(page):
        return FileResponse(page)
    return FileResponse("index.html")


if __name__ == "__main__":
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=5000,
        reload=False,
        log_level="info",
    )
