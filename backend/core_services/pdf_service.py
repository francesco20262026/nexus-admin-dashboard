"""
core_services/pdf_service.py — HTML → PDF rendering via Playwright
Uses a dedicated thread with its own ProactorEventLoop to bypass
the Windows SelectorEventLoop limitation in uvicorn.
"""
import asyncio
import logging
import platform
import sys
import threading
import os

# The Windows Service runs as Local System, so it can't find the Administrator's browser installation.
# Force Playwright to load browsers from the Administrator's AppData directory where 'playwright install' ran.
os.environ["PLAYWRIGHT_BROWSERS_PATH"] = r"C:\Users\administrator.IMPIEGANDO\AppData\Local\ms-playwright"

logger = logging.getLogger(__name__)

# Compatibility shims for main.py health probe
WEASYPRINT_AVAILABLE = True
WEASYPRINT_ERROR = None


def check_pdf_health() -> dict:
    return {
        "status": "ok",
        "engine": "playwright",
        "available": True,
        "error": None,
        "os": platform.system(),
        "os_version": platform.release(),
        "python_version": sys.version,
    }


_EMPTY_FALLBACK_HTML = (
    "<html><head><meta charset='utf-8'></head>"
    "<body style='font-family:sans-serif;color:#555;padding:40px'>"
    "<p><em>Documento vuoto — nessun contenuto disponibile.</em></p>"
    "</body></html>"
)


def _render_pdf_in_own_loop(html: str) -> bytes:
    """
    Run Playwright in a brand-new ProactorEventLoop on its own thread.
    This bypasses uvicorn's SelectorEventLoop which cannot spawn subprocesses on Windows.
    """
    async def _async_render(html: str) -> bytes:
        from playwright.async_api import async_playwright

        # CSS di stampa A4: sovrascrive whitespace e margini web
        PRINT_CSS = """<style>
@page { size: A4; margin: 18mm 18mm 18mm 18mm; }
body {
    font-family: 'Arial', sans-serif !important;
    font-size: 11pt !important;
    line-height: 1.55 !important;
    color: #111 !important;
    white-space: normal !important;
    margin: 0 !important;
    padding: 0 !important;
    max-width: 100% !important;
}
p, div, span, li { white-space: normal !important; }
table { width: 100%; border-collapse: collapse; }
img { max-width: 100%; height: auto; }
</style>"""

        # Inietta print CSS dentro <head> o in cima se non c'è
        if "</head>" in html:
            html = html.replace("</head>", PRINT_CSS + "</head>", 1)
        elif "<body" in html:
            html = html.replace("<body", PRINT_CSS + "<body", 1)
        else:
            html = PRINT_CSS + html

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            await page.set_content(html, wait_until="networkidle")
            pdf_bytes = await page.pdf(
                format="A4",
                print_background=True,
                margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
            )
            await browser.close()
            return pdf_bytes

    # Create a fresh ProactorEventLoop (supports subprocess on Windows)
    if sys.platform == "win32":
        loop = asyncio.ProactorEventLoop()
    else:
        loop = asyncio.new_event_loop()

    try:
        result = loop.run_until_complete(_async_render(html))
    finally:
        loop.close()

    return result


async def generate_pdf_from_html(html_content: str, *, allow_empty: bool = False) -> bytes:
    """
    Render an HTML string into a raw PDF byte stream.
    Runs Playwright in a dedicated thread with its own ProactorEventLoop.
    """
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

    result_holder = {}

    def _thread_target():
        try:
            result_holder["pdf"] = _render_pdf_in_own_loop(content)
        except Exception as exc:
            result_holder["error"] = exc

    t = threading.Thread(target=_thread_target, daemon=True)
    t.start()
    # Wait in a non-blocking way so uvicorn's event loop stays responsive
    await asyncio.to_thread(t.join, 90)  # 90s timeout

    if "error" in result_holder:
        exc = result_holder["error"]
        logger.error("PDF render failed in thread: %s", exc)
        raise ValueError(f"Impossibile renderizzare il PDF dal template fornito: {exc}") from exc

    pdf_bytes = result_holder.get("pdf", b"")
    if not pdf_bytes:
        raise ValueError("Playwright returned an empty byte stream — PDF generation failed silently")

    logger.debug("generate_pdf_from_html: produced %d bytes", len(pdf_bytes))
    return pdf_bytes


async def test_pdf_generation() -> bytes:
    test_html = (
        "<html><head><meta charset='utf-8'></head>"
        "<body><h1>PDF Engine Health Check</h1><p>Sistema Funzionante</p></body></html>"
    )
    return await generate_pdf_from_html(test_html)
