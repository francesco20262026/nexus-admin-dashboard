"""
modules/activity/router.py — Unified Activity Log API
"""
import logging
from fastapi import APIRouter, HTTPException, status, Depends, Query
from pydantic import BaseModel
from uuid import UUID
from typing import Optional

from auth.middleware import get_current_user, require_admin, CurrentUser, apply_cid
from database import supabase

logger = logging.getLogger(__name__)

client_router     = APIRouter(prefix="/clients",    tags=["activity"])
onboarding_router = APIRouter(prefix="/onboarding", tags=["activity"])
global_router     = APIRouter(prefix="/activities", tags=["activity"])

VALID_EVENT_TYPES = {
    "note", "call", "meeting", "task", "email_sent",
    "quote_sent", "quote_accepted", "quote_rejected", "quote_opened",
    "invoice_issued", "stage_changed", "lead_created",
    "contract_signed", "document_uploaded", "system",
    "first_login", "status_changed", "service_activated"
}


class ActivityCreate(BaseModel):
    event_type: str = "note"
    title: str
    body: Optional[str] = None
    metadata: Optional[dict] = None


def _list_activity(user: CurrentUser, *, client_id: str = None, onboarding_id: str = None,
                   event_type: str = None, page: int = 1, page_size: int = 50) -> dict:
    
    # Doppio lookup se cerchi per client_id
    ob_ids = []
    if client_id:
        q_ob = supabase.table("quotes").select("onboarding_id").eq("client_id", client_id).execute()
        ob_ids = [q["onboarding_id"] for q in (q_ob.data or []) if q.get("onboarding_id")]

    # Se non c'è una multi-query complessa facciamo il giro pulito
    q = supabase.table("activity_log").select("*, users(name, email)", count="exact")
    
    if user.is_admin:
        q = q.eq("company_id", getattr(user, 'tenant', str(user.active_company_id)))
    else:
        q = q.eq("company_id", getattr(user, 'tenant', str(user.active_company_id)))
        
    if event_type: 
        q = q.eq("event_type", event_type)

    if client_id and ob_ids:
        # Se dobbiamo fondere storici
        q = q.or_(f"client_id.eq.{client_id},onboarding_id.in.({','.join(ob_ids)})")
    elif client_id:
        q = q.eq("client_id", client_id)
    elif onboarding_id:
        q = q.eq("onboarding_id", onboarding_id)

    q = q.order("created_at", desc=True)
    offset = (page - 1) * page_size
    res = q.range(offset, offset + page_size - 1).execute()
    return {"data": res.data or [], "total": res.count or 0, "page": page, "page_size": page_size}


def _create_activity(company_id: str, user_id: str, body: ActivityCreate,
                     *, client_id: str = None, onboarding_id: str = None) -> dict:
    if body.event_type not in VALID_EVENT_TYPES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            f"event_type non valido. Valori ammessi: {sorted(VALID_EVENT_TYPES)}")

    row = {
        "company_id":    company_id,
        "actor_user_id": user_id,
        "event_type":    body.event_type,
        "title":         body.title,
        "body":          body.body,
        "metadata":      body.metadata,
        "client_id":     client_id,
        "onboarding_id": onboarding_id,
    }
    res = supabase.table("activity_log").insert(row).execute()
    if not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Impossibile creare l'attivita")
    return res.data[0]

def log_timeline_event(
    company_id: str,
    user_id: str = None,
    event_type: str = "system",
    title: str = "",
    client_id: Optional[str] = None,
    onboarding_id: Optional[str] = None,
    body: Optional[str] = None,
    metadata: Optional[dict] = None,
    *,
    actor_user_id: Optional[str] = None,
) -> None:
    """Safely log a timeline event without raising HTTP exceptions if it fails.
    Accepts both user_id (positional) and actor_user_id (keyword) for compatibility."""
    resolved_user_id = actor_user_id or user_id
    try:
        activity_body = ActivityCreate(
            event_type=event_type,
            title=title,
            body=body,
            metadata=metadata
        )
        _create_activity(company_id, resolved_user_id, activity_body, client_id=client_id, onboarding_id=onboarding_id)
    except Exception as exc:
        import traceback
        with open("timeline_error_debug.txt", "w") as f:
            f.write(traceback.format_exc())
        logger.warning(f"Failed to log timeline event ({event_type}): {exc}")

# ── Client endpoints ──────────────────────────────────────────

@client_router.get("/{client_id}/activity")
async def list_client_activity(
    client_id: UUID,
    event_type: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: CurrentUser = Depends(require_admin),
):
    return _list_activity(user, client_id=str(client_id),
                          event_type=event_type, page=page, page_size=page_size)


@client_router.post("/{client_id}/activity", status_code=status.HTTP_201_CREATED)
async def create_client_activity(
    client_id: UUID,
    body: ActivityCreate,
    user: CurrentUser = Depends(require_admin),
):
    return _create_activity(str(user.active_company_id), str(user.user_id), body,
                            client_id=str(client_id))


# ── Onboarding endpoints ──────────────────────────────────────

@onboarding_router.get("/{onboarding_id}/activity")
async def list_onboarding_activity(
    onboarding_id: UUID,
    event_type: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: CurrentUser = Depends(require_admin),
):
    return _list_activity(user, onboarding_id=str(onboarding_id),
                          event_type=event_type, page=page, page_size=page_size)


@onboarding_router.post("/{onboarding_id}/activity", status_code=status.HTTP_201_CREATED)
async def create_onboarding_activity(
    onboarding_id: UUID,
    body: ActivityCreate,
    user: CurrentUser = Depends(require_admin),
):
    return _create_activity(str(user.active_company_id), str(user.user_id), body,
                            onboarding_id=str(onboarding_id))


# ── Global endpoints ──────────────────────────────────────────

@global_router.get("")
async def list_global_activity(
    event_type: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: CurrentUser = Depends(require_admin),
):
    return _list_activity(user, event_type=event_type, page=page, page_size=page_size)
