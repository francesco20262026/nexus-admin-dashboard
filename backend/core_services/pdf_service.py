"""
core_services/pdf_service.py — HTML → PDF rendering via WeasyPrint
Pure service layer — no HTTP, no router concerns.

WeasyPrint requires native OS libraries (pango, cairo, libffi, gdk-pixbuf).
If they are missing the module will still import but fail on first render.
check_pdf_health() and test_pdf_generation() exist for startup/health probes.
"""
import logging
import platform
import sys

logger = logging.getLogger(__name__)

# ── Runtime dependency probe ──────────────────────────────────
# Performed once at import time so startup logs surface any issues immediately.

WEASYPRINT_AVAILABLE: bool = False
WEASYPRINT_ERROR: str | None = None

try:
    from weasyprint import HTML as _WeasyHTML   # noqa: N814
    WEASYPRINT_AVAILABLE = True
    logger.info("WeasyPrint loaded successfully")
except ImportError as exc:
    WEASYPRINT_ERROR = f"ImportError: {exc} — install weasyprint (pip install weasyprint)"
    logger.error("WeasyPrint not installed. PDF generation will fail. %s", WEASYPRINT_ERROR)
except OSError as exc:
    WEASYPRINT_ERROR = (
        f"OSError: {exc} — missing OS libraries. "
        "Install: pango, cairo, libffi, gdk-pixbuf "
        "(e.g. apt-get install -y libpango-1.0-0 libpangocairo-1.0-0 libcairo2 libgdk-pixbuf2.0-0)"
    )
    logger.error("WeasyPrint OS dependency missing. %s", WEASYPRINT_ERROR)
except Exception as exc:                        # pragma: no cover
    WEASYPRINT_ERROR = f"Unexpected load error: {exc}"
    logger.error("WeasyPrint failed to load unexpectedly. %s", WEASYPRINT_ERROR)


# ── Health helper ─────────────────────────────────────────────

def check_pdf_health() -> dict:
    """
    Return the current status of the PDF subsystem.
    Suitable for use in /health endpoints and startup probes.
    """
    return {
        "status":               "ok" if WEASYPRINT_AVAILABLE else "degraded",
        "engine":               "weasyprint",
        "available":            WEASYPRINT_AVAILABLE,
        "error":                WEASYPRINT_ERROR,
        "os":                   platform.system(),
        "os_version":           platform.release(),
        "python_version":       sys.version,
    }


# ── Smoke test ────────────────────────────────────────────────

def test_pdf_generation() -> bytes:
    """
    Render a minimal HTML document to bytes to verify all OS deps are wired.
    Raises RuntimeError if engine unavailable, ValueError if render itself fails.
    Intended for startup/health checks — not for production rendering paths.
    """
    if not WEASYPRINT_AVAILABLE:
        raise RuntimeError(f"PDF engine unavailable: {WEASYPRINT_ERROR}")

    test_html = (
        "<html><head><meta charset='utf-8'></head>"
        "<body><h1>PDF Engine Health Check</h1><p>Sistema Funzionante</p></body></html>"
    )
    try:
        return _WeasyHTML(string=test_html).write_pdf()
    except Exception as exc:
        logger.error("test_pdf_generation render failed: %s", exc)
        raise ValueError(f"PDF smoke test failed — check OS dependencies: {exc}") from exc


# ── Main rendering function ───────────────────────────────────

_EMPTY_FALLBACK_HTML = (
    "<html><head><meta charset='utf-8'></head>"
    "<body style='font-family:sans-serif;color:#555;padding:40px'>"
    "<p><em>Documento vuoto — nessun contenuto disponibile.</em></p>"
    "</body></html>"
)


def generate_pdf_from_html(html_content: str, *, allow_empty: bool = False) -> bytes:
    """
    Render an HTML string into a raw PDF byte stream using WeasyPrint.

    Args:
        html_content:  Raw HTML string (may include inline styles).
        allow_empty:   If True, render a placeholder page on empty input instead
                       of raising ValueError. Defaults to False (strict mode).

    Raises:
        RuntimeError:  WeasyPrint or its OS dependencies are not available.
        ValueError:    html_content is empty and allow_empty=False,
                       OR WeasyPrint raised an error during rendering.
    """
    if not WEASYPRINT_AVAILABLE:
        logger.error("PDF generation blocked — engine missing: %s", WEASYPRINT_ERROR)
        raise RuntimeError(
            "Il motore PDF (WeasyPrint) o le sue dipendenze di sistema "
            "(pango/cairo/libffi) non sono disponibili sul server."
        )

    content = (html_content or "").strip()

    if not content:
        if allow_empty:
            logger.warning("generate_pdf_from_html: received empty HTML — rendering placeholder page")
            content = _EMPTY_FALLBACK_HTML
        else:
            raise ValueError(
                "Impossibile generare il PDF: il contenuto HTML fornito è vuoto. "
                "Verifica che il template del documento sia configurato correttamente."
            )

    try:
        pdf_bytes = _WeasyHTML(string=content).write_pdf()
    except Exception as exc:
        logger.error("WeasyPrint render failed: %s", exc)
        raise ValueError(
            f"Impossibile renderizzare il PDF dal template fornito: {exc}"
        ) from exc

    if not pdf_bytes:
        raise ValueError("WeasyPrint returned an empty byte stream — PDF generation failed silently")

    logger.debug("generate_pdf_from_html: produced %d bytes", len(pdf_bytes))
    return pdf_bytes
