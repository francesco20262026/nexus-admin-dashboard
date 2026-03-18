"""
modules/documents/router.py — CRUD + secure download via Supabase Storage signed URL
"""
from fastapi import APIRouter, HTTPException, status, Depends, UploadFile, File, Form
from pydantic import BaseModel
from uuid import UUID
from typing import Optional

from auth.middleware import get_current_user, require_admin, CurrentUser
from database import supabase

router = APIRouter(prefix="/documents", tags=["documents"])

SIGNED_URL_TTL = 60  # seconds


# ── Schemas ──────────────────────────────────────────────────

class DocumentUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    status: Optional[str] = None


# ── Endpoints ────────────────────────────────────────────────

@router.get("/")
async def list_documents(
    client_id: Optional[UUID] = None,
    contract_id: Optional[UUID] = None,
    doc_status: Optional[str] = None,
    user: CurrentUser = Depends(get_current_user),
):
    q = (
        supabase.table("documents")
        .select("id,name,type,status,created_at,client_id,contract_id,clients(name)")
        .eq("company_id", str(user.active_company_id))
    )
    if not user.is_admin:
        q = q.eq("client_id", str(user.client_id))
    if client_id:
        q = q.eq("client_id", str(client_id))
    if contract_id:
        q = q.eq("contract_id", str(contract_id))
    if doc_status:
        q = q.eq("status", doc_status)
    res = q.order("created_at", desc=True).execute()
    return res.data


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_document(
    client_id: UUID = Form(...),
    name: str = Form(...),
    doc_type: Optional[str] = Form(None),
    contract_id: Optional[UUID] = Form(None),
    file: UploadFile = File(...),
    user: CurrentUser = Depends(require_admin),
):
    """Upload a document to Supabase Storage and record metadata."""
    company_id = str(user.active_company_id)
    client_id_str = str(client_id)

    # Path: {company_id}/{client_id}/{filename}
    storage_path = f"{company_id}/{client_id_str}/{file.filename}"
    file_bytes = await file.read()

    try:
        supabase.storage.from_("nexus-documents").upload(
            path=storage_path,
            file=file_bytes,
            file_options={"content-type": file.content_type or "application/octet-stream"},
        )
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Upload failed: {e}")

    row = {
        "company_id": company_id,
        "client_id": client_id_str,
        "contract_id": str(contract_id) if contract_id else None,
        "name": name,
        "type": doc_type,
        "storage_path": storage_path,
        "status": "draft",
    }
    res = supabase.table("documents").insert(row).execute()
    return res.data[0]


@router.get("/{document_id}")
async def get_document(
    document_id: UUID,
    user: CurrentUser = Depends(get_current_user),
):
    res = (
        supabase.table("documents")
        .select("*")
        .eq("id", str(document_id))
        .eq("company_id", str(user.active_company_id))
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if not user.is_admin and res.data["client_id"] != str(user.client_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN)
    return res.data


@router.put("/{document_id}")
async def update_document(
    document_id: UUID,
    body: DocumentUpdate,
    user: CurrentUser = Depends(require_admin),
):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    res = (
        supabase.table("documents")
        .update(updates)
        .eq("id", str(document_id))
        .eq("company_id", str(user.active_company_id))
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    return res.data[0]


@router.get("/{document_id}/download")
async def download_document(
    document_id: UUID,
    user: CurrentUser = Depends(get_current_user),
):
    """
    Generate a short-lived signed URL for secure document download.
    The URL expires after SIGNED_URL_TTL seconds.
    storage_path is NEVER exposed — only the temporary signed URL is returned.
    """
    doc = (
        supabase.table("documents")
        .select("storage_path,client_id,company_id,name")
        .eq("id", str(document_id))
        .eq("company_id", str(user.active_company_id))
        .single()
        .execute()
    ).data
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if not user.is_admin and doc["client_id"] != str(user.client_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN)

    try:
        signed = supabase.storage.from_("nexus-documents").create_signed_url(
            path=doc["storage_path"],
            expires_in=SIGNED_URL_TTL,
        )
        return {"url": signed["signedURL"], "expires_in": SIGNED_URL_TTL, "name": doc["name"]}
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Could not generate URL: {e}")


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    doc = (
        supabase.table("documents")
        .select("storage_path")
        .eq("id", str(document_id))
        .eq("company_id", str(user.active_company_id))
        .single()
        .execute()
    ).data
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND)

    # Remove from Storage
    supabase.storage.from_("nexus-documents").remove([doc["storage_path"]])
    # Remove DB record
    supabase.table("documents").delete().eq("id", str(document_id)).execute()
