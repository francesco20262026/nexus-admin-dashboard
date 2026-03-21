"""
modules/onboarding/router.py — Onboarding / lead pipeline management

Onboarding records represent leads or prospects being onboarded into the CRM.
The convert action is the critical flow: it creates a real clients row and
links it back to the onboarding record atomically (best-effort — no 2-phase commit,
but guarded against double-conversion and cross-tenant access).

Status lifecycle:
  in_progress → blocked → ready → converted

Only records with status="ready" may be converted.
Converted records are immutable (status and client_id are locked).
"""
import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, status, Depends, Query
from pydantic import BaseModel, EmailStr, field_validator

from auth.middleware import require_admin, CurrentUser
from database import supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/onboarding", tags=["onboarding"])

_VALID_STATUSES = {"in_progress", "blocked", "ready", "converted"}


# ── Schemas ──────────────────────────────────────────────────

class OnboardingCreate(BaseModel):
    lead_name:       str
    company_name:    Optional[str]   = None
    email:           Optional[EmailStr] = None
    phone:           Optional[str]   = None
    reference_name:  Optional[str]   = None  # internal assignee
    status:          str             = "in_progress"
    steps_total:     int             = 4
    steps_completed: int             = 0
    notes:           Optional[str]   = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in _VALID_STATUSES:
            raise ValueError(f"status must be one of {sorted(_VALID_STATUSES)}")
        return v

    @field_validator("steps_total")
    @classmethod
    def steps_total_positive(cls, v: int) -> int:
        if v < 1:
            raise ValueError("steps_total must be >= 1")
        return v

    @field_validator("steps_completed")
    @classmethod
    def steps_completed_non_negative(cls, v: int) -> int:
        if v < 0:
            raise ValueError("steps_completed must be >= 0")
        return v


class OnboardingUpdate(BaseModel):
    lead_name:       Optional[str]   = None
    company_name:    Optional[str]   = None
    email:           Optional[EmailStr] = None
    phone:           Optional[str]   = None
    reference_name:  Optional[str]   = None
    status:          Optional[str]   = None
    steps_total:     Optional[int]   = None
    steps_completed: Optional[int]   = None
    notes:           Optional[str]   = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v):
        if v is not None and v not in _VALID_STATUSES:
            raise ValueError(f"status must be one of {sorted(_VALID_STATUSES)}")
        return v


# ── Helper ───────────────────────────────────────────────────

def _require_onboarding(onboarding_id: UUID, company_id: str) -> dict:
    """
    Fetch an onboarding record asserting tenant ownership.
    Raises 404 if not found or belongs to another company.
    """
    res = (
        supabase.table("onboarding")
        .select("*")
        .eq("id", str(onboarding_id))
        .eq("company_id", company_id)
        .maybe_single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pratica di onboarding non trovata")
    return res.data


def _audit(company_id: str, user_id: str, entity_id: str,
           action: str, new: Optional[dict] = None) -> None:
    """Write audit log entry — failures are non-blocking."""
    try:
        supabase.table("audit_logs").insert({
            "company_id":  company_id,
            "user_id":     user_id,
            "entity_type": "onboarding",
            "entity_id":   entity_id,
            "action":      action,
            "new_values":  new,
        }).execute()
    except Exception as exc:
        logger.warning("audit_log write failed for onboarding %s: %s", entity_id, exc)


# ── List ─────────────────────────────────────────────────────

@router.get("/")
async def list_onboarding(
    status_filter: Optional[str] = Query(None, alias="status"),
    user: CurrentUser = Depends(require_admin),
):
    company_id = str(user.active_company_id)
    q = (
        supabase.table("onboarding")
        .select("*")
        .eq("company_id", company_id)
        .order("created_at", desc=True)
    )
    if status_filter:
        if status_filter not in _VALID_STATUSES:
            raise HTTPException(status.HTTP_400_BAD_REQUEST,
                                f"status invalido. Valori ammessi: {sorted(_VALID_STATUSES)}")
        q = q.eq("status", status_filter)
    res = q.execute()
    return res.data or []


# ── Get ──────────────────────────────────────────────────────

@router.get("/{onboarding_id}")
async def get_onboarding(
    onboarding_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    return _require_onboarding(onboarding_id, str(user.active_company_id))


# ── Create ───────────────────────────────────────────────────

@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_onboarding(
    body: OnboardingCreate,
    user: CurrentUser = Depends(require_admin),
):
    company_id = str(user.active_company_id)
    row = {**body.model_dump(), "company_id": company_id}
    res = supabase.table("onboarding").insert(row).execute()
    if not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR,
                            "Errore durante la creazione della pratica")
    created = res.data[0]
    _audit(company_id, str(user.user_id), created["id"], "create",
           new={"status": created.get("status"), "lead_name": created.get("lead_name")})
    return created


# ── Update ───────────────────────────────────────────────────

@router.put("/{onboarding_id}")
async def update_onboarding(
    onboarding_id: UUID,
    body: OnboardingUpdate,
    user: CurrentUser = Depends(require_admin),
):
    company_id = str(user.active_company_id)
    old = _require_onboarding(onboarding_id, company_id)

    # Converted records are locked
    if old.get("status") == "converted":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Impossibile modificare una pratica già convertita in cliente.",
        )

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    # Prevent manually setting status=converted via update — use /convert instead
    if updates.get("status") == "converted":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Per convertire una pratica usa l'azione /convert, non un aggiornamento diretto.",
        )

    if not updates:
        return old

    res = (
        supabase.table("onboarding")
        .update(updates)
        .eq("id", str(onboarding_id))
        .eq("company_id", company_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Errore durante l'aggiornamento")
    updated = res.data[0]
    _audit(company_id, str(user.user_id), str(onboarding_id), "update",
           new=updates)
    return updated


# ── Delete ───────────────────────────────────────────────────

@router.delete("/{onboarding_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_onboarding(
    onboarding_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    company_id = str(user.active_company_id)
    record = _require_onboarding(onboarding_id, company_id)

    if record.get("status") == "converted":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Impossibile eliminare una pratica già convertita in cliente.",
        )

    supabase.table("onboarding").delete().eq("id", str(onboarding_id)).eq(
        "company_id", company_id
    ).execute()
    _audit(company_id, str(user.user_id), str(onboarding_id), "delete")


# ── Convert to Client ─────────────────────────────────────────

@router.post("/{onboarding_id}/convert")
async def convert_to_client(
    onboarding_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    """
    Convert an onboarding lead into a real client record.

    Safety guarantees:
    - Only status="ready" records can be converted
    - Double-conversion is blocked (status="converted" check)
    - client_id cross-tenant: new client gets company_id from JWT, not from payload
    - If client insert fails, onboarding record is NOT updated (no orphaned state)
    - Audit log written on success
    """
    company_id = str(user.active_company_id)
    lead = _require_onboarding(onboarding_id, company_id)

    # Idempotency: already converted → return existing client
    if lead.get("status") == "converted":
        existing_client_id = lead.get("client_id")
        if existing_client_id:
            return {
                "message": "Pratica già convertita",
                "client_id": existing_client_id,
                "onboarding_id": str(onboarding_id),
            }
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Pratica già contrassegnata come convertita ma senza client_id associato. "
            "Verificare manualmente nel database.",
        )

    if lead.get("status") != "ready":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Impossibile convertire: la pratica è in stato '{lead.get('status')}'. "
            "Portare la pratica allo stato 'ready' prima di convertirla.",
        )

    # 1. Create the client record — uses lead data, company_id from JWT (never from payload)
    client_row = {
        "company_id":   company_id,
        "name":         lead.get("lead_name", ""),
        "email":        lead.get("email"),
        "phone":        lead.get("phone"),
        "company_name": lead.get("company_name"),
        "status":       "active",
        "source":       "onboarding",
    }
    try:
        client_res = supabase.table("clients").insert(client_row).execute()
    except Exception as exc:
        logger.error("convert_to_client: client insert failed for onboarding=%s: %s",
                     onboarding_id, exc)
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            f"Errore durante la creazione del cliente: {exc}",
        )

    if not client_res.data:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "La creazione del cliente non ha restituito dati. Nessuna modifica applicata.",
        )

    new_client = client_res.data[0]
    new_client_id = new_client["id"]

    # 2. Mark onboarding as converted — includes company_id for tenant safety
    try:
        supabase.table("onboarding").update({
            "status":    "converted",
            "client_id": new_client_id,
        }).eq("id", str(onboarding_id)).eq("company_id", company_id).execute()
    except Exception as exc:
        # Client was created — log the inconsistency but don't fail the caller
        logger.error(
            "convert_to_client: client created (id=%s) but onboarding update failed: %s",
            new_client_id, exc,
        )
        # Still return success — client exists, just the onboarding status is stale
        _audit(company_id, str(user.user_id), str(onboarding_id), "convert_partial",
               new={"client_id": new_client_id, "error": str(exc)})
        return {
            "message":        "Cliente creato ma aggiornamento pratica fallito — verificare manualmente",
            "client_id":      new_client_id,
            "onboarding_id":  str(onboarding_id),
            "_warning":       "onboarding status not updated",
        }

    _audit(company_id, str(user.user_id), str(onboarding_id), "convert",
           new={"status": "converted", "client_id": new_client_id})

    logger.info("convert_to_client: onboarding=%s → client=%s", onboarding_id, new_client_id)

    return {
        "message":       "Lead convertito in cliente con successo",
        "client_id":     new_client_id,
        "onboarding_id": str(onboarding_id),
    }
