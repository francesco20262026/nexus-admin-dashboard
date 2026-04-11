"""
main.py — FastAPI application entry point.
Responsibility: bootstrap only — app creation, CORS, router registration, scheduler lifespan.
Business routes belong in their respective router modules.
"""
# ── Windows asyncio subprocess fix ───────────────────────────
# On Windows, the default SelectorEventLoop cannot spawn subprocesses
# (used by Playwright for PDF generation). Switch to ProactorEventLoop.
import sys
if sys.platform == "win32":
    import asyncio
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

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
from modules.quotes.router      import router as quotes_router
from modules.users.router       import router as users_router
from modules.companies.router   import router as companies_router
from modules.copilot.router     import router as copilot_router
from modules.categories.router  import router as categories_router
from modules.reports.router     import router as reports_router
from modules.wiki.router        import router as wiki_router
from modules.activity.router    import client_router as activity_client_router
from modules.activity.router    import onboarding_router as activity_onboarding_router
from modules.activity.router    import global_router as activity_global_router
from modules.notifications.router import router as notifications_router
from routers.health    import router as health_router
from routers.jobs      import router as jobs_router
from routers.webhooks  import router as webhooks_router
from routers.ai_agent_router import router as ai_agent_router

logger = logging.getLogger(__name__)

# ── Scheduler ────────────────────────────────────────────────
scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start/stop background scheduler with the app."""
    from jobs.payment_reminders import run_payment_reminders
    from jobs.renewal_alerts    import run_renewal_alerts
    from jobs.dunning_check     import run_dunning_check

    # ── Startup migrations (idempotent DDL additions) ─────────
    try:
        from database import supabase
        supabase.table("documents").select("id,visibility,onboarding_id,contract_id").limit(1).execute()
        supabase.table("users").select("last_login").limit(1).execute()
        logger.info("documents.visibility, onboarding_id, contract_id, and users.last_login columns OK")
    except Exception:
        # Columns might not exist — add them via a raw psycopg2
        try:
            import psycopg2
            from config import settings as _s
            _project = _s.supabase_url.replace("https://", "").split(".")[0]
            _pg_host = f"db.{_project}.supabase.co"
            _conn = psycopg2.connect(host=_pg_host, port=5432, dbname="postgres",
                                     user="postgres", password=_s.supabase_service_key,
                                     connect_timeout=8)
            _cur = _conn.cursor()
            _cur.execute("ALTER TABLE documents ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'internal'")
            _cur.execute("ALTER TABLE documents ADD COLUMN IF NOT EXISTS onboarding_id UUID")
            _cur.execute("ALTER TABLE documents ADD COLUMN IF NOT EXISTS contract_id UUID")
            _cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE")
            _conn.commit()
            _cur.close(); _conn.close()
            logger.info("Startup migration: documents extended with visibility, onboarding_id, contract_id; users extended with last_login")
        except Exception as exc:
            logger.warning("Startup migration failed: %s — "
                           "run manually: ALTER document and users tables accordingly", exc)

    scheduler.add_job(run_payment_reminders, "cron", hour=8, minute=0,  id="payment_reminders")
    scheduler.add_job(run_renewal_alerts,    "cron", hour=8, minute=30, id="renewal_alerts")
    scheduler.add_job(run_dunning_check,     "cron", hour=9, minute=0,  id="dunning_check")
    # Poller manuale: si lancia dal tasto "Sync GDrive" nel CRM (endpoint /invoices/sync-gdrive)
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
    title="Nova CRM API",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan,
    debug=True,
)

# CORS — wildcard in development; restrict to known origins in production
_origins = settings.cors_origins
logger.info(f"CORS origins configured: {_origins}")

from fastapi import Request

@app.middleware("http")
async def catch_exceptions_middleware(request: Request, call_next):
    import traceback
    with open('E:/App/crm/backend/global_error.txt', 'a') as f:
        f.write(f"\\n--- RECEIVED REQUEST {request.method} {request.url} ---\\n")
    try:
        response = await call_next(request)
        with open('E:/App/crm/backend/global_error.txt', 'a') as f:
            f.write(f"--- SUCCESS {response.status_code} ---\\n")
        return response
    except Exception as e:
        with open('E:/App/crm/backend/global_error.txt', 'a') as f:
            f.write(f"\\n--- 500 Error at {request.url} ---\\n")
            traceback.print_exc(file=f)
        raise

from fastapi.responses import JSONResponse

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    import traceback
    tb = traceback.format_exc()
    logger.error("Unhandled exception on %s %s:\n%s", request.method, request.url, tb)
    with open('E:/App/crm/backend/global_error.txt', 'a') as f:
        f.write(f"\\n=== UNHANDLED 500 {request.method} {request.url} ===\\n{tb}\\n")
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {str(exc)}"},
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ──────────────────────────────────────────────────
app.include_router(auth_router,      prefix="/api")
app.include_router(clients_router,   prefix="/api")
app.include_router(invoices_router,  prefix="/api")
app.include_router(services_router,  prefix="/api")
app.include_router(wiki_router,      prefix="/api")
app.include_router(contracts_router, prefix="/api")
app.include_router(documents_router, prefix="/api")
app.include_router(reminders_router, prefix="/api")
app.include_router(renewals_router,  prefix="/api")
app.include_router(dashboard_router, prefix="/api")
app.include_router(settings_router,    prefix="/api")
app.include_router(payments_router,    prefix="/api")
app.include_router(onboarding_router,  prefix="/api")
app.include_router(quotes_router,      prefix="/api")
app.include_router(users_router,       prefix="/api")
app.include_router(companies_router,   prefix="/api")
app.include_router(copilot_router,     prefix="/api")
app.include_router(categories_router,  prefix="/api")
app.include_router(reports_router,     prefix="/api")
app.include_router(activity_client_router,     prefix="/api")
app.include_router(activity_onboarding_router, prefix="/api")
app.include_router(activity_global_router,     prefix="/api")
app.include_router(notifications_router,         prefix="/api")
app.include_router(health_router,    prefix="/api")
app.include_router(jobs_router,      prefix="/api")
app.include_router(ai_agent_router,  prefix="/api/agent")
# Webhooks are NOT under /api — providers call the path directly
app.include_router(webhooks_router)
