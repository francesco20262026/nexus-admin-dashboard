"""
main.py — FastAPI application entry point.
Responsibility: bootstrap only — app creation, CORS, router registration, scheduler lifespan.
Business routes belong in their respective router modules.
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
import logging

from config import settings
from auth.router          import router as auth_router
from modules.clients.router    import router as clients_router
from modules.invoices.router   import router as invoices_router
from modules.services.router   import router as services_router
from modules.contracts.router  import router as contracts_router
from modules.documents.router  import router as documents_router
from modules.reminders.router  import router as reminders_router
from modules.renewals.router   import router as renewals_router
from modules.dashboard.router  import router as dashboard_router
from modules.settings.router   import router as settings_router
from modules.payments.router   import router as payments_router
from modules.onboarding.router  import router as onboarding_router
from modules.users.router       import router as users_router
from modules.companies.router   import router as companies_router
from routers.health    import router as health_router
from routers.jobs      import router as jobs_router
from routers.webhooks  import router as webhooks_router

logger = logging.getLogger(__name__)

# ── Scheduler ────────────────────────────────────────────────
scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start/stop background scheduler with the app."""
    from jobs.payment_reminders import run_payment_reminders
    from jobs.renewal_alerts    import run_renewal_alerts

    scheduler.add_job(run_payment_reminders, "cron", hour=8, minute=0,  id="payment_reminders")
    scheduler.add_job(run_renewal_alerts,    "cron", hour=8, minute=30, id="renewal_alerts")
    scheduler.start()
    app.state.scheduler = scheduler
    logger.info("Scheduler started")

    # ── PDF subsystem startup probe ───────────────────────────
    # Runs synchronously before the server starts accepting traffic.
    # Surfaces missing WeasyPrint or OS library issues immediately in logs.
    try:
        from core_services.pdf_service import (
            WEASYPRINT_AVAILABLE, WEASYPRINT_ERROR, test_pdf_generation
        )
        if not WEASYPRINT_AVAILABLE:
            logger.critical(
                "PDF subsystem FAILED to load: %s — "
                "contract send-sign will return HTTP 503. "
                "Fix: apt-get install -y libpango-1.0-0 libpangocairo-1.0-0 "
                "libcairo2 libgdk-pixbuf2.0-0 libffi-dev && pip install weasyprint",
                WEASYPRINT_ERROR,
            )
        else:
            try:
                test_pdf_generation()
                logger.info("PDF subsystem OK — WeasyPrint rendering verified")
            except Exception as exc:
                logger.critical(
                    "PDF subsystem DEGRADED — WeasyPrint loaded but rendering failed: %s — "
                    "contract send-sign will return HTTP 503", exc
                )
    except Exception as exc:
        logger.error("PDF health probe raised unexpectedly: %s", exc)

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

# CORS — wildcard in development; restrict to known origins in production
_dev = settings.app_env == "development"
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _dev else settings.cors_origins,
    allow_credentials=False,  # incompatible with wildcard; auth uses Bearer tokens
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
app.include_router(settings_router,    prefix="/api")
app.include_router(payments_router,    prefix="/api")
app.include_router(onboarding_router,  prefix="/api")
app.include_router(users_router,       prefix="/api")
app.include_router(companies_router,   prefix="/api")
app.include_router(health_router,    prefix="/api")
app.include_router(jobs_router,      prefix="/api")
# Webhooks are NOT under /api — providers call the path directly
app.include_router(webhooks_router)
