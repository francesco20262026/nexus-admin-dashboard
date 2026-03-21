"""
routers/health.py — Health check endpoints for Nexus CRM.
"""
from fastapi import APIRouter, Request

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_basic(request: Request):
    """Basic liveness check — returns app version and scheduler status."""
    scheduler = getattr(request.app.state, "scheduler", None)
    return {
        "status":    "ok",
        "version":   "1.0.0",
        "scheduler": scheduler.running if scheduler else False,
    }


@router.get("/health/pdf")
async def health_pdf():
    """
    Diagnostic endpoint reporting WeasyPrint engine status.

    Response status field is always one of:
      "ok"       — engine loaded AND rendering smoke-test passed
      "degraded" — engine import succeeded but rendering test raised an error
      "failed"   — engine could not be imported (missing package or OS deps)
    """
    from core_services.pdf_service import (
        WEASYPRINT_AVAILABLE,
        WEASYPRINT_ERROR,
        check_pdf_health,
        test_pdf_generation,
    )

    health = check_pdf_health()

    if not WEASYPRINT_AVAILABLE:
        # Import failed — engine is gone entirely
        health["status"]           = "failed"
        health["rendering_test"]   = "skipped"
        health["fix_instructions"] = (
            "Install WeasyPrint and its OS dependencies:\n"
            "  pip install weasyprint\n"
            "  apt-get install -y libpango-1.0-0 libpangocairo-1.0-0 "
            "libcairo2 libgdk-pixbuf2.0-0 libffi-dev"
        )
        return health

    # Engine available — run the smoke test to verify OS libs are wired
    try:
        pdf_bytes = test_pdf_generation()
        health["status"]         = "ok"
        health["rendering_test"] = "passed"
        health["test_pdf_bytes"] = len(pdf_bytes)
    except Exception as exc:
        health["status"]           = "degraded"
        health["rendering_test"]   = "failed"
        health["rendering_error"]  = str(exc)
        health["fix_instructions"] = (
            "WeasyPrint imported but rendering failed — likely missing OS libraries.\n"
            "Run: apt-get install -y libpango-1.0-0 libpangocairo-1.0-0 "
            "libcairo2 libgdk-pixbuf2.0-0 libffi-dev"
        )

    return health
