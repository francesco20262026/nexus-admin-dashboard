"""
modules/calls/router.py — Chiamate clienti: scheduling, CRUD, alert scadute
"""
import logging
from fastapi import APIRouter, HTTPException, status, Depends, Query
from pydantic import BaseModel
from uuid import UUID
from typing import Optional
from datetime import datetime, timezone

from auth.middleware import require_admin, CurrentUser
from database import supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/clients", tags=["calls"])


class CallCreate(BaseModel):
    title: str
    scheduled_at: datetime
    duration_min: int = 15
    notes: Optional[str] = None


class CallUpdate(BaseModel):
    title: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    duration_min: Optional[int] = None
    notes: Optional[str] = None
    status: Optional[str] = None


@router.get("/{client_id}/calls")
async def list_calls(
    client_id: UUID,
    status: Optional[str] = None,
    user: CurrentUser = Depends(require_admin),
):
    q = (
        supabase.table("client_calls")
        .select("*")
        .eq("company_id", str(user.active_company_id))
        .eq("client_id", str(client_id))
        .order("scheduled_at", desc=False)
    )
    if status:
        q = q.eq("status", status)
    res = q.execute()
    return res.data or []


@router.get("/{client_id}/calls/overdue")
async def overdue_calls(
    client_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    now = datetime.now(timezone.utc).isoformat()
    res = (
        supabase.table("client_calls")
        .select("*")
        .eq("company_id", str(user.active_company_id))
        .eq("client_id", str(client_id))
        .eq("status", "scheduled")
        .lt("scheduled_at", now)
        .order("scheduled_at", desc=False)
        .execute()
    )
    return res.data or []


@router.post("/{client_id}/calls", status_code=status.HTTP_201_CREATED)
async def create_call(
    client_id: UUID,
    body: CallCreate,
    user: CurrentUser = Depends(require_admin),
):
    row = {
        "company_id":   str(user.active_company_id),
        "client_id":    str(client_id),
        "title":        body.title,
        "scheduled_at": body.scheduled_at.isoformat(),
        "duration_min": body.duration_min,
        "notes":        body.notes,
        "status":       "scheduled",
        "created_by":   str(user.user_id),
    }
    res = supabase.table("client_calls").insert(row).execute()
    if not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Impossibile creare la chiamata")
    return res.data[0]


@router.patch("/calls/{call_id}")
async def update_call(
    call_id: UUID,
    body: CallUpdate,
    user: CurrentUser = Depends(require_admin),
):
    patch = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if "scheduled_at" in patch:
        patch["scheduled_at"] = patch["scheduled_at"].isoformat()
    if "status" in patch and patch["status"] not in ("scheduled", "completed", "missed"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "status non valido")
    patch["updated_at"] = datetime.now(timezone.utc).isoformat()

    res = (
        supabase.table("client_calls")
        .update(patch)
        .eq("id", str(call_id))
        .eq("company_id", str(user.active_company_id))
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chiamata non trovata")
    return res.data[0]


@router.delete("/calls/{call_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_call(
    call_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    res = (
        supabase.table("client_calls")
        .delete()
        .eq("id", str(call_id))
        .eq("company_id", str(user.active_company_id))
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chiamata non trovata")
