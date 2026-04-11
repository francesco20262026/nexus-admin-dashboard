"""
integrations/zoho_sign.py — Zoho Sign API client
Handles sending contracts/documents for e-signature, status polling,
signed PDF download, signing URL retrieval, and webhook processing.

Pure service layer — no router/HTTP/UI concerns.
"""
import json
import logging
import re
from datetime import datetime, timezone
from typing import Optional

import httpx

from database import supabase

logger = logging.getLogger(__name__)

# ── Region-aware base URLs ────────────────────────────────────
# Supported regions: eu, com, in, au, jp
# Configured via integrations.config["region"] — defaults to "eu"
_ZOHO_REGIONS = {
    "eu":  ("https://accounts.zoho.eu/oauth/v2/token",  "https://sign.zoho.eu/api/v1"),
    "com": ("https://accounts.zoho.com/oauth/v2/token", "https://sign.zoho.com/api/v1"),
    "in":  ("https://accounts.zoho.in/oauth/v2/token",  "https://sign.zoho.in/api/v1"),
    "au":  ("https://accounts.zoho.com.au/oauth/v2/token", "https://sign.zoho.com.au/api/v1"),
    "jp":  ("https://accounts.zoho.jp/oauth/v2/token",  "https://sign.zoho.jp/api/v1"),
}

HTTP_TIMEOUT_AUTH   = 15   # seconds for OAuth token refresh
HTTP_TIMEOUT_API    = 20   # seconds for status / URL calls
HTTP_TIMEOUT_UPLOAD = 60   # seconds for multipart PDF upload
HTTP_TIMEOUT_DL     = 45   # seconds for PDF download

BUCKET = "nexus-documents"


# ── Internal helpers ──────────────────────────────────────────

def _region_urls(config: dict) -> tuple[str, str]:
    """Return (accounts_url, api_url) for the configured region."""
    region = (config.get("region") or "eu").lower()
    urls   = _ZOHO_REGIONS.get(region)
    if not urls:
        logger.warning("Unknown Zoho region '%s' — falling back to EU", region)
        urls = _ZOHO_REGIONS["eu"]
    return urls


def _safe_path_segment(s: str) -> str:
    """Strip path separators and special chars — prevents storage path traversal."""
    return re.sub(r"[^\w\-.]", "_", (s or "").strip())[:80]


def _audit(company_id: str, entity_type: str, entity_id: str,
           action: str, new_values: Optional[dict] = None) -> None:
    """Non-blocking audit log write."""
    try:
        supabase.table("audit_logs").insert({
            "company_id":  company_id,
            "entity_type": entity_type,
            "entity_id":   entity_id,
            "action":      action,
            "new_values":  new_values or {},
        }).execute()
    except Exception as exc:
        logger.warning("audit_log write failed action=%s entity=%s: %s", action, entity_id, exc)


# ── Config / Auth ─────────────────────────────────────────────

async def _get_zoho_config(company_id: str) -> dict:
    """Fetch active Zoho Sign OAuth credentials from integrations table."""
    res = (
        supabase.table("integrations")
        .select("config")
        .eq("company_id", company_id)
        .eq("type", "zoho_sign")
        .eq("is_active", True)
        .maybe_single()
    )
    if not res.data:
        raise ValueError(f"Zoho Sign integration not configured for company {company_id}")
    config = res.data.get("config") or {}
    if not config:
        raise ValueError(f"Zoho Sign config is empty for company {company_id}")
    return config


async def _get_access_token(config: dict) -> str:
    """
    Refresh and return an OAuth2 access token for Zoho Sign.
    Raises ValueError with a safe message on any failure — never exposes secrets.
    """
    required = ("refresh_token", "client_id", "client_secret")
    missing  = [k for k in required if not str(config.get(k) or "").strip()]
    if missing:
        raise ValueError(f"Zoho Sign config missing required fields: {', '.join(missing)}")

    accounts_url, _ = _region_urls(config)

    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_AUTH) as http:
        try:
            resp = await http.post(
                accounts_url,
                data={
                    "grant_type":    "refresh_token",
                    "client_id":     config["client_id"],
                    "client_secret": config["client_secret"],
                    "refresh_token": config["refresh_token"],
                },
            )
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.error("Zoho Sign token refresh failed status=%d", exc.response.status_code)
            raise ValueError("Zoho Sign token refresh failed — check credentials")
        except httpx.RequestError as exc:
            logger.error("Zoho Sign token refresh network error: %s", type(exc).__name__)
            raise ValueError("Zoho Sign token refresh network error")

    body = resp.json()
    token = body.get("access_token")
    if not token:
        # Response may contain an error field (e.g. "invalid_code") — log safely
        err = body.get("error", "unknown")
        logger.error("Zoho Sign token response missing access_token, error=%s", err)
        raise ValueError(f"Zoho Sign token error: {err}")
    return token


# ── Request payload builder ───────────────────────────────────

def _build_zoho_request_payload(
    request_name: str,
    client_info: dict,
    entity_type: str,
    entity_id: str,
) -> dict:
    """Build the base JSON payload for a Zoho Sign signature request."""
    recipient_email = client_info.get("email", "")
    if not recipient_email:
        raise ValueError(
            f"Cannot send for signature: client has no email address (entity_type={entity_type}, id={entity_id})"
        )
    return {
        "requests": {
            "request_name": request_name[:100],   # Zoho max length
            "actions": [
                {
                    "action_type":      "SIGN",
                    "recipient_name":   (client_info.get("name") or "Cliente")[:100],
                    "recipient_email":  recipient_email,
                    "signing_order":    0,
                    "verify_recipient": False,
                }
            ],
            "notes":        f"Nexus {entity_type.capitalize()} ID: {entity_id}",
            "is_sequential": True,
        }
    }


# ── Core submission ───────────────────────────────────────────

async def _submit_signature_request(
    company_id: str,
    payload: dict,
    file_name: str,
    file_bytes: bytes,
) -> str:
    """
    Multipart POST to Zoho Sign /requests.
    Returns the Zoho request_id string.
    """
    if not file_bytes:
        raise ValueError("Cannot submit an empty PDF to Zoho Sign")

    config       = await _get_zoho_config(company_id)
    access_token = await _get_access_token(config)
    _, api_url   = _region_urls(config)

    headers = {"Authorization": f"Zoho-oauthtoken {access_token}"}
    form    = {"data": json.dumps(payload)}
    files   = {"file": (_safe_path_segment(file_name), file_bytes, "application/pdf")}

    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_UPLOAD) as http:
        try:
            resp = await http.post(f"{api_url}/requests", headers=headers, data=form, files=files)
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.error("Zoho Sign /requests failed status=%d body=%.200s",
                         exc.response.status_code, exc.response.text)
            raise ValueError(f"Zoho Sign submission failed ({exc.response.status_code})")
        except httpx.RequestError as exc:
            logger.error("Zoho Sign /requests network error: %s", type(exc).__name__)
            raise ValueError("Zoho Sign network error during submission")

    result     = resp.json()
    request_id = (result.get("requests") or {}).get("request_id")
    if not request_id:
        logger.error("Zoho Sign response missing request_id: %.300s", resp.text)
        raise ValueError("Zoho Sign returned no request_id — check response format")
    return request_id


# ── Public: send contract ─────────────────────────────────────

async def send_contract_for_signature(contract: dict, company_id: str) -> str:
    """Generate PDF from contract template and send to Zoho Sign. Returns request_id."""
    client_info = contract.get("clients") or {}
    payload     = _build_zoho_request_payload(
        contract.get("title", "Contratto"),
        client_info,
        "contract",
        contract["id"],
    )
    html_content = (contract.get("document_templates") or {}).get("content", "")
    if not html_content:
        raise ValueError("Contract template has no HTML content to generate a PDF from")

    from core_services.pdf_service import generate_pdf_from_html
    try:
        pdf_bytes = await generate_pdf_from_html(html_content)
    except Exception as exc:
        logger.error("PDF generation failed contract=%s: %s", contract["id"], exc)
        raise ValueError(f"Impossibile generare il PDF dal template del contratto: {exc}")

    return await _submit_signature_request(
        company_id=company_id,
        payload=payload,
        file_name=f"contract_{contract['id']}.pdf",
        file_bytes=pdf_bytes,
    )


# ── Public: send document ─────────────────────────────────────

async def send_document_for_signature(document: dict, company_id: str) -> str:
    """Download uploaded PDF from Storage and send to Zoho Sign. Returns request_id."""
    client_info  = document.get("clients") or {}
    payload      = _build_zoho_request_payload(
        document.get("name", "Documento"),
        client_info,
        "document",
        document["id"],
    )
    storage_path = document.get("storage_path")
    if not storage_path:
        raise ValueError("Document has no associated file in storage")

    try:
        file_bytes = supabase.storage.from_(BUCKET).download(storage_path)
    except Exception as exc:
        logger.error("Storage download failed path=%s: %s", storage_path, exc)
        raise ValueError(f"Impossibile scaricare il file dallo storage: {exc}")

    if not file_bytes:
        raise ValueError("Downloaded file is empty — cannot send to Zoho Sign")

    return await _submit_signature_request(
        company_id=company_id,
        payload=payload,
        file_name=f"doc_{document['id']}.pdf",
        file_bytes=file_bytes,
    )


# ── Public: get request status ────────────────────────────────

async def get_request_status(request_id: str, company_id: str) -> dict:
    """Fetch current status of a Zoho Sign signature request."""
    config       = await _get_zoho_config(company_id)
    access_token = await _get_access_token(config)
    _, api_url   = _region_urls(config)

    headers = {"Authorization": f"Zoho-oauthtoken {access_token}"}

    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_API) as http:
        try:
            resp = await http.get(f"{api_url}/requests/{request_id}", headers=headers)
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.error("Zoho Sign status check failed req=%s status=%d", request_id, exc.response.status_code)
            raise ValueError(f"Zoho Sign status check failed ({exc.response.status_code})")
        except httpx.RequestError as exc:
            raise ValueError(f"Zoho Sign network error: {type(exc).__name__}")

    return resp.json().get("requests", {})


# ── Public: get signing URL ───────────────────────────────────

async def get_signing_url(request_id: str, company_id: str) -> str:
    """
    Retrieve the embedded signing URL for the first signer action.
    Used by the client portal Sign Now button.
    """
    config       = await _get_zoho_config(company_id)
    access_token = await _get_access_token(config)
    _, api_url   = _region_urls(config)

    headers = {"Authorization": f"Zoho-oauthtoken {access_token}"}

    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_API) as http:
        try:
            resp = await http.get(
                f"{api_url}/requests/{request_id}/actions/embeddedlink",
                headers=headers,
            )
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.error("Zoho Sign sign URL failed req=%s status=%d", request_id, exc.response.status_code)
            raise ValueError(f"Zoho Sign signing URL unavailable ({exc.response.status_code})")
        except httpx.RequestError as exc:
            raise ValueError(f"Zoho Sign network error: {type(exc).__name__}")

    body     = resp.json()
    sign_url = (
        body.get("sign_url")
        or (body.get("requests", {}).get("actions") or [{}])[0].get("sign_link")
        or ""
    )
    if not sign_url:
        logger.error("Zoho Sign embedded link response had no sign_url: %.300s", resp.text)
        raise ValueError("Zoho Sign did not return a signing URL")
    return sign_url


# ── Public: download signed PDF ───────────────────────────────

async def download_signed_pdf(request_id: str, company_id: str) -> bytes:
    """Download the finalized signed PDF from Zoho Sign."""
    config       = await _get_zoho_config(company_id)
    access_token = await _get_access_token(config)
    _, api_url   = _region_urls(config)

    headers = {"Authorization": f"Zoho-oauthtoken {access_token}"}

    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_DL) as http:
        try:
            resp = await http.get(f"{api_url}/requests/{request_id}/pdf", headers=headers)
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.error("Zoho Sign PDF download failed req=%s status=%d", request_id, exc.response.status_code)
            raise ValueError(f"Signed PDF download failed ({exc.response.status_code})")
        except httpx.RequestError as exc:
            raise ValueError(f"Zoho Sign network error during PDF download: {type(exc).__name__}")

    if not resp.content:
        raise ValueError("Zoho Sign returned an empty PDF")
    return resp.content


# ── Public: webhook handler ───────────────────────────────────

async def handle_signed_webhook(payload: dict) -> None:
    """
    Process a Zoho Sign 'completed' webhook event.
    Downloads the signed PDF, uploads to Storage, updates entity status.
    Fully idempotent — skips already-signed entities.
    Each entity is processed independently so one failure does not skip others.
    """
    request_id = (payload.get("requests") or {}).get("request_id")
    if not request_id:
        logger.warning("handle_signed_webhook: missing request_id in payload")
        return

    now = datetime.now(timezone.utc).isoformat()

    # ── Contracts ─────────────────────────────────────────────
    c_res = (
        supabase.table("contracts")
        .select("id,company_id,client_id,title,status")
        .eq("zoho_request_id", request_id)
        .execute()
    )
    for contract in (c_res.data or []):
        if contract.get("status") == "signed":
            continue   # idempotent

        cid        = contract["id"]
        company_id = contract["company_id"]
        client_id  = contract.get("client_id", "unknown")

        try:
            pdf_bytes = await download_signed_pdf(request_id, company_id)
        except Exception as exc:
            logger.error("Webhook: PDF download failed contract=%s: %s", cid, exc)
            continue

        safe_title = _safe_path_segment(contract.get("title", "contract"))
        new_path   = f"{company_id}/{client_id}/{safe_title}_signed_{request_id}.pdf"

        try:
            supabase.storage.from_(BUCKET).upload(
                path=new_path,
                file=pdf_bytes,
                file_options={"content-type": "application/pdf"},
            )
        except Exception as exc:
            logger.error("Webhook: storage upload failed contract=%s path=%s: %s", cid, new_path, exc)
            # Do not abort — still update contract status even if storage fails
            new_path = None

        try:
            if new_path:
                supabase.table("documents").insert({
                    "company_id":   company_id,
                    "client_id":    client_id,
                    "contract_id":  cid,
                    "name":         f"{contract.get('title', 'Contratto')} (Firmato)",
                    "type":         "contract",
                    "storage_path": new_path,
                    "status":       "signed",
                }).execute()
        except Exception as exc:
            logger.warning("Webhook: document record insert failed contract=%s: %s", cid, exc)

        try:
            update_payload = {"status": "signed", "signed_at": now}
            if new_path:
                update_payload["pdf_url"] = new_path
            supabase.table("contracts").update(update_payload).eq("id", cid).eq("company_id", company_id).execute()
        except Exception as exc:
            logger.error("Webhook: contract status update failed contract=%s: %s", cid, exc)
            continue

        _audit(company_id, "contract", cid, "webhook_signed", {"status": "signed", "signed_at": now})

    if c_res.data:
        return   # All matched contracts handled — do not also check documents

    # ── Standalone Documents ──────────────────────────────────
    d_res = (
        supabase.table("documents")
        .select("id,company_id,client_id,name,status")
        .eq("zoho_request_id", request_id)
        .execute()
    )
    for doc in (d_res.data or []):
        if doc.get("status") == "signed":
            continue

        did        = doc["id"]
        company_id = doc["company_id"]
        client_id  = doc.get("client_id", "unknown")

        try:
            pdf_bytes = await download_signed_pdf(request_id, company_id)
        except Exception as exc:
            logger.error("Webhook: PDF download failed document=%s: %s", did, exc)
            continue

        safe_name = _safe_path_segment(doc.get("name", "document"))
        new_path  = f"{company_id}/{client_id}/{safe_name}_signed_{request_id}.pdf"

        try:
            supabase.storage.from_(BUCKET).upload(
                path=new_path,
                file=pdf_bytes,
                file_options={"content-type": "application/pdf"},
            )
        except Exception as exc:
            logger.error("Webhook: storage upload failed document=%s path=%s: %s", did, new_path, exc)
            new_path = None

        try:
            update_doc = {"status": "signed"}
            if new_path:
                update_doc["storage_path"] = new_path
            supabase.table("documents").update(update_doc).eq("id", did).eq("company_id", company_id).execute()
        except Exception as exc:
            logger.error("Webhook: document status update failed document=%s: %s", did, exc)
            continue

        _audit(company_id, "document", did, "webhook_signed",
               {"status": "signed", "storage_path": new_path})
