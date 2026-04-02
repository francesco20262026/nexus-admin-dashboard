"""
modules/documents/router.py — CRUD + secure download via Supabase Storage signed URL
"""
import logging
import re
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, status, Depends, UploadFile, File, Form, Query
from pydantic import BaseModel
from uuid import UUID
from typing import Optional

from auth.middleware import get_current_user, require_admin, require_client, CurrentUser
from database import supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["documents"])

SIGNED_URL_TTL = 3600   # 1 hour — 60s was too short for real-world use
BUCKET         = "nexus-documents"
MAX_FILE_SIZE  = 50 * 1024 * 1024   # 50 MB


# ── Schemas ──────────────────────────────────────────────────

class DocumentUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    status: Optional[str] = None


# ── Helpers ──────────────────────────────────────────────────

def _safe_filename(filename: str) -> str:
    """Strip path separators and dangerous characters — prevent path traversal."""
    name = re.sub(r"[^\w\-. ]", "_", filename.replace("\\", "/").split("/")[-1])
    return name or "upload"


def _audit(user: CurrentUser, entity_id: str, action: str,
           old: Optional[dict] = None, new: Optional[dict] = None) -> None:
    """Write an audit log entry. Failures are logged but never bubble up."""
    try:
        supabase.table("audit_logs").insert({
            "company_id":  str(user.active_company_id),
            "user_id":     str(user.user_id),
            "entity_type": "document",
            "entity_id":   entity_id,
            "action":      action,
            "old_values":  old,
            "new_values":  new,
        }).execute()
    except Exception as exc:
        logger.warning("audit_log write failed for document %s: %s", entity_id, exc)


def _require_document(document_id: UUID, company_id: str, select: str = "*") -> dict:
    """Fetch a document asserting it exists within the given company. Raises 404 otherwise."""
    res = (
        supabase.table("documents")
        .select(select)
        .eq("id", str(document_id))
        .eq("company_id", company_id)
        .maybe_single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    return res.data


# ── List ─────────────────────────────────────────────────────

@router.get("/")
async def list_documents(
    client_id: Optional[UUID] = None,
    onboarding_id: Optional[UUID] = None,
    contract_id: Optional[UUID] = None,
    doc_status: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: CurrentUser = Depends(get_current_user),
):
    q = (
        supabase.table("documents")
        .select("id,name,type,status,created_at,client_id,onboarding_id,contract_id,clients(name),onboarding(company_name)", count="exact")
        .eq("company_id", str(user.active_company_id))
    )
    if not user.is_admin:
        if user.client_id:
            or_conds = [f"client_id.eq.{user.client_id}"]
            if user.onboarding_id:
                or_conds.append(f"onboarding_id.eq.{user.onboarding_id}")
            q = q.or_(",".join(or_conds))
        elif user.onboarding_id:
            q = q.eq("onboarding_id", str(user.onboarding_id))
        else:
            return {"data": [], "total": 0, "page": page, "page_size": page_size}

    if client_id:
        q = q.eq("client_id", str(client_id))
    if onboarding_id:
        q = q.eq("onboarding_id", str(onboarding_id))
    if contract_id:
        q = q.eq("contract_id", str(contract_id))
    if doc_status:
        q = q.eq("status", doc_status)

    offset = (page - 1) * page_size
    res = q.order("created_at", desc=True).range(offset, offset + page_size - 1).execute()
    return {"data": res.data or [], "total": res.count or 0, "page": page, "page_size": page_size}


# ── Upload ────────────────────────────────────────────────────

@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_document(
    client_id: Optional[UUID] = Form(None),
    onboarding_id: Optional[UUID] = Form(None),
    name: str = Form(...),
    doc_type: Optional[str] = Form(None),
    contract_id: Optional[UUID] = Form(None),
    file: UploadFile = File(...),
    user: CurrentUser = Depends(require_admin),
):
    """Upload a document to Supabase Storage and record metadata."""
    company_id    = str(user.active_company_id)
    
    if not client_id and not onboarding_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Richiesto client_id o onboarding_id")

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File exceeds 50 MB limit")

    # Sanitise filename to prevent path traversal
    safe_name    = _safe_filename(file.filename or "upload")
    # Include microseconds to avoid collisions on rapid re-upload of same filename
    ts           = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
    # Store based on available ID
    entity_id_str = str(client_id) if client_id else str(onboarding_id)
    storage_path = f"{company_id}/{entity_id_str}/{ts}_{safe_name}"

    try:
        supabase.storage.from_(BUCKET).upload(
            path=storage_path,
            file=file_bytes,
            file_options={"content-type": file.content_type or "application/octet-stream"},
        )
    except Exception as exc:
        logger.error("Storage upload failed path=%s: %s", storage_path, exc)
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Upload failed: {exc}")

    row = {
        "company_id":   company_id,
        "client_id":    str(client_id) if client_id else None,
        "onboarding_id": str(onboarding_id) if onboarding_id else None,
        "contract_id":  str(contract_id) if contract_id else None,
        "name":         name,
        "type":         doc_type,
        "storage_path": storage_path,
        "status":       "draft",
    }
    res = supabase.table("documents").insert(row).execute()
    if not res.data:
        # Storage upload succeeded but DB insert failed — attempt cleanup
        try:
            supabase.storage.from_(BUCKET).remove([storage_path])
        except Exception:
            logger.error("Storage cleanup failed after DB insert error: %s", storage_path)
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Failed to save document record")

    doc = res.data[0]
    _audit(user, doc["id"], "upload", new={"name": name, "storage_path": storage_path})
    return doc


# ── Get ───────────────────────────────────────────────────────

@router.get("/{document_id}")
async def get_document(
    document_id: UUID,
    user: CurrentUser = Depends(get_current_user),
):
    if not user.is_admin and not user.client_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN)

    doc = _require_document(document_id, str(user.active_company_id))
    if not user.is_admin and str(doc.get("client_id")) != str(user.client_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN)
    return doc


# ── Update ────────────────────────────────────────────────────

@router.put("/{document_id}")
async def update_document(
    document_id: UUID,
    body: DocumentUpdate,
    user: CurrentUser = Depends(require_admin),
):
    old = _require_document(document_id, str(user.active_company_id), select="name,type,status")

    updates = body.model_dump(exclude_none=True)
    if not updates:
        return old

    res = (
        supabase.table("documents")
        .update(updates)
        .eq("id", str(document_id))
        .eq("company_id", str(user.active_company_id))
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Update returned no data")
    _audit(user, str(document_id), "update", old=old, new=updates)
    return res.data[0]


# ── Download signed URL ───────────────────────────────────────

@router.get("/{document_id}/download")
@router.get("/{document_id}/download-url")   # alias used by client JS
async def download_document(
    document_id: UUID,
    user: CurrentUser = Depends(get_current_user),
):
    """
    Generate a short-lived signed URL for secure document download.
    storage_path is NEVER exposed — only the temporary signed URL is returned.
    """
    if not user.is_admin and not user.client_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN)

    doc = _require_document(document_id, str(user.active_company_id), select="storage_path,client_id,name")
    if not user.is_admin and str(doc.get("client_id")) != str(user.client_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN)

    storage_path = doc.get("storage_path")
    if not storage_path:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No file associated with this document")

    try:
        signed = supabase.storage.from_(BUCKET).create_signed_url(
            path=storage_path,
            expires_in=SIGNED_URL_TTL,
        )
        # API may return signedURL or signedUrl depending on supabase-py version
        url = signed.get("signedURL") or signed.get("signedUrl") or signed.get("url")
        if not url:
            raise ValueError(f"Unexpected signed URL response: {signed}")
        return {"url": url, "expires_in": SIGNED_URL_TTL, "name": doc.get("name")}
    except Exception as exc:
        logger.error("Signed URL generation failed document=%s: %s", document_id, exc)
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Could not generate download URL")


# ── Delete ────────────────────────────────────────────────────

@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    doc = _require_document(document_id, str(user.active_company_id), select="storage_path,status,name")

    # Remove from Storage first (non-blocking on error — DB record is the source of truth)
    storage_path = doc.get("storage_path")
    if storage_path:
        try:
            supabase.storage.from_(BUCKET).remove([storage_path])
        except Exception as exc:
            logger.warning("Storage remove failed path=%s (proceeding with DB delete): %s", storage_path, exc)

    supabase.table("documents").delete().eq("id", str(document_id)).eq("company_id", str(user.active_company_id)).execute()
    _audit(user, str(document_id), "delete", old={"name": doc.get("name"), "storage_path": storage_path})


# ── Internal sign ─────────────────────────────────────────────

@router.post("/{document_id}/sign")
async def sign_document(
    document_id: UUID,
    user: CurrentUser = Depends(require_client),
):
    """Client signs the document internally (without Zoho Sign)."""
    doc = _require_document(document_id, str(user.active_company_id), select="id,client_id,status")

    if str(doc.get("client_id")) != str(user.client_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN)
    if doc.get("status") == "signed":
        return doc  # idempotent

    now = datetime.now(timezone.utc).isoformat()
    res = (
        supabase.table("documents")
        .update({"status": "signed", "signed_at": now})
        .eq("id", str(document_id))
        .eq("company_id", str(user.active_company_id))   # tenant safety
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Sign update returned no data")

    _audit(user, str(document_id), "signed",
           old={"status": doc.get("status")},
           new={"status": "signed", "signed_at": now})
    return res.data[0]


# ── Sign URL (Zoho — for client portal) ──────────────────────

@router.get("/{document_id}/sign-url")
async def get_document_sign_url(
    document_id: UUID,
    user: CurrentUser = Depends(get_current_user),
):
    """Return the Zoho Sign URL so the client can sign the document directly."""
    from integrations.zoho_sign import get_signing_url

    doc = _require_document(document_id, str(user.active_company_id), select="client_id,zoho_request_id,status")
    if not user.is_admin and str(doc.get("client_id")) != str(user.client_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN)

    if doc.get("status") not in ("sent", "pending"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Document is not awaiting signature")

    req_id = doc.get("zoho_request_id")
    if not req_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Document not yet sent to Zoho Sign")

    try:
        sign_url = await get_signing_url(req_id, str(user.active_company_id))
        return {"url": sign_url, "sign_url": sign_url}
    except Exception as exc:
        logger.error("get_document_sign_url failed req_id=%s: %s", req_id, exc)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Zoho Sign error: {exc}")


# ── Audit trail ───────────────────────────────────────────────

@router.get("/{document_id}/audit")
async def get_document_audit_trail(
    document_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    """Return the chronological audit log for a specific document."""
    # Verify document belongs to tenant before exposing its audit trail
    _require_document(document_id, str(user.active_company_id), select="id")
    res = (
        supabase.table("audit_logs")
        .select("id,action,old_values,new_values,created_at,users(name)")
        .eq("company_id", str(user.active_company_id))
        .eq("entity_type", "document")
        .eq("entity_id", str(document_id))
        .order("created_at", desc=False)
        .execute()
    )
    return res.data or []


# ── Send to Zoho Sign ─────────────────────────────────────────

@router.post("/{document_id}/send-sign")
async def send_document_for_signature_api(
    document_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    """Orchestrate sending a local PDF document to Zoho Sign."""
    from integrations.zoho_sign import send_document_for_signature

    doc = _require_document(
        document_id,
        str(user.active_company_id),
        select="*, clients(name,email)",
    )
    if doc.get("status") not in ("draft", "pending"):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Document cannot be sent: current status is '{doc.get('status')}'",
        )

    try:
        zoho_request_id = await send_document_for_signature(doc, str(user.active_company_id))
    except Exception as exc:
        logger.error("send_document_for_signature_api failed document=%s: %s", document_id, exc)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Zoho Sign error: {exc}")

    supabase.table("documents").update({
        "status": "sent",
        "zoho_request_id": zoho_request_id,
    }).eq("id", str(document_id)).eq("company_id", str(user.active_company_id)).execute()

    _audit(user, str(document_id), "send_sign",
           old={"status": doc.get("status")},
           new={"status": "sent", "zoho_request_id": zoho_request_id})

    return {"message": "Sent for signature", "zoho_request_id": zoho_request_id}


@router.get("/{document_id}/sign-status")
async def get_document_sign_status(
    document_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    """Observe current remote state of signature from Zoho Sign."""
    from integrations.zoho_sign import get_request_status

    doc = _require_document(document_id, str(user.active_company_id), select="zoho_request_id")
    req_id = doc.get("zoho_request_id")
    if not req_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Document not sent to Zoho Sign")
    try:
        data = await get_request_status(req_id, str(user.active_company_id))
        return {"success": True, "zoho_data": data}
    except Exception as exc:
        logger.error("get_document_sign_status failed req_id=%s: %s", req_id, exc)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Zoho Sign error: {exc}")
