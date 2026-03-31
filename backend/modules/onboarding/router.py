"""
modules/onboarding/router.py — Onboarding workflow linked to an existing client

PHASE 2 DOMAIN MODEL:
  - A Client record must already exist before an Onboarding record is created.
  - client_id is MANDATORY in OnboardingCreate.
  - Onboarding is purely a workflow/process tracker — it does NOT create clients.
  - /activate replaces /convert: marks the workflow as complete and sets the client
    lifecycle status to 'active'. Does NOT create any new record.

Workflow states:
  bozza → preventivo_in_preparazione → preventivo_inviato → preventivo_accettato
  → contratto_inviato → contratto_firmato → proforma_emessa → in_attesa_pagamento
  → pagamento_verifica → attivazione_servizio → attivo
  Terminal: abbandonato | annullato
"""
import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, status, Depends, Query
from pydantic import BaseModel, field_validator

from auth.middleware import require_admin, get_current_user, CurrentUser
from database import supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/onboarding", tags=["onboarding"])

# ── Workflow states (new English names per business model) ───
_VALID_STATUSES = {
    "new",
    "quote_draft",
    "quote_sent",
    "quote_accepted",
    "contract_draft",
    "contract_sent",
    "contract_signed",
    "proforma_draft",
    "proforma_issued",
    "waiting_payment",
    "payment_under_review",
    "converted_to_client",
    "cancelled",
    "abandoned"
}
_TERMINAL_STATUSES = {"cancelled", "abandoned"}

_WORKFLOW_ORDER = [
    "new",
    "quote_draft",
    "quote_sent",
    "quote_accepted",
    "contract_draft",
    "contract_sent",
    "contract_signed",
    "proforma_draft",
    "proforma_issued",
    "waiting_payment",
    "payment_under_review",
    "converted_to_client"
]

# ── Schemas ──────────────────────────────────────────────────

class OnboardingCreate(BaseModel):
    """
    Onboarding is standalone — no Client record required upfront.
    Subject identity is stored directly here until conversion.
    client_id is populated only when the subject converts to a Client.
    """
    # Subject identity (inline — no pre-existing Client required)
    company_name:    str                         # ragione sociale — REQUIRED
    email:           str = ""                    # email — REQUIRED BY UI, default for old cache
    phone:           Optional[str] = None
    vat_number:      Optional[str] = None
    pec:             Optional[str] = None
    dest_code:       Optional[str] = None
    address:         Optional[str] = None
    city:            Optional[str] = None
    lead_name:       Optional[str] = None
    iban:            Optional[str] = None
    lang:            Optional[str] = "it"

    # Workflow fields
    status:          str = "new"
    notes:           Optional[str] = None
    reference_name:  Optional[str] = None        # internal assignee
    service_interest: Optional[str] = None
    estimated_value: Optional[float] = None
    priority:        Optional[str] = None        # high | medium | low
    quote_id:        Optional[UUID] = None
    steps_total:     int = 10
    steps_completed: int = 0

    # Tenant: can be passed explicitly to override active_company_id
    company_id:      Optional[str] = None

    # Populated at conversion only — never required at creation
    client_id:       Optional[str] = None

    # Bypass soft duplicate warnings (name/email only — VAT is always hard-blocked)
    force_create:    bool = False

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in _VALID_STATUSES:
            raise ValueError(f"status deve essere uno tra {sorted(_VALID_STATUSES)}")
        return v

    @field_validator("steps_total")
    @classmethod
    def steps_total_positive(cls, v: int) -> int:
        if v < 1:
            raise ValueError("steps_total deve essere >= 1")
        return v

    @field_validator("steps_completed")
    @classmethod
    def steps_completed_non_negative(cls, v: int) -> int:
        if v < 0:
            raise ValueError("steps_completed deve essere >= 0")
        return v


class OnboardingUpdate(BaseModel):
    # Subject fields (updatable)
    company_name:    Optional[str] = None
    email:           Optional[str] = None
    phone:           Optional[str] = None
    vat_number:      Optional[str] = None
    pec:             Optional[str] = None
    dest_code:       Optional[str] = None
    address:         Optional[str] = None
    city:            Optional[str] = None
    lead_name:       Optional[str] = None
    iban:            Optional[str] = None
    lang:            Optional[str] = None

    # Workflow fields
    status:           Optional[str] = None
    notes:            Optional[str] = None
    reference_name:   Optional[str] = None
    service_interest: Optional[str] = None
    estimated_value:  Optional[float] = None
    priority:         Optional[str] = None
    quote_id:         Optional[UUID] = None
    steps_total:      Optional[int] = None
    steps_completed:  Optional[int] = None
    client_id:        Optional[str] = None       # set at conversion
    company_id:       Optional[str] = None       # can be changed by admin

    @field_validator("status")
    @classmethod
    def validate_status(cls, v):
        if v is not None and v not in _VALID_STATUSES:
            raise ValueError(f"status deve essere uno tra {sorted(_VALID_STATUSES)}")
        return v


# ── Helpers ──────────────────────────────────────────────────

def _require_onboarding(onboarding_id: UUID, user: CurrentUser) -> dict:
    """Fetch onboarding record asserting tenant ownership. Raises 404 if not found."""
    res = (
        supabase.table("onboarding")
        .select("*")
        .eq("id", str(onboarding_id))
        .eq("company_id", str(user.active_company_id))
        .maybe_single()
        .execute()
    )
    if res and getattr(res, "data", None):
        return res.data
        
    if user.is_admin:
        res_any = supabase.table("onboarding").select("*").eq("id", str(onboarding_id)).maybe_single().execute()
        if res_any and getattr(res_any, "data", None):
            return res_any.data

    raise HTTPException(status.HTTP_404_NOT_FOUND, "Pratica di onboarding non trovata")


def _check_onboarding_duplicates(
    company_id: str,
    company_name: Optional[str] = None,
    email: Optional[str] = None,
    vat_number: Optional[str] = None,
    exclude_id: Optional[str] = None,
    force_create: bool = False,
) -> None:
    """Raise 409 if a duplicate exists. VAT is always hard-blocked; name/email are soft (bypassable)."""
    if not any([company_name, email, vat_number]):
        return

    q = supabase.table("onboarding").select("id,company_name,email,vat_number").eq("company_id", company_id)
    if exclude_id:
        q = q.neq("id", exclude_id)

    res = q.execute()
    existing = res.data or []

    for row in existing:
        # Hard block: same VAT = same legal entity — always blocked
        if vat_number and row.get("vat_number") and \
                row["vat_number"].strip().replace(" ", "") == vat_number.strip().replace(" ", ""):
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"HARD:\u00c8 gi\u00e0 presente una pratica con la stessa Partita IVA: \"{row['vat_number']}\""
            )
        if force_create:
            continue  # soft checks bypassed
        # Soft blocks: name / email — bypassable via force_create
        if company_name and row.get("company_name") and \
                row["company_name"].strip().lower() == company_name.strip().lower():
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"SOFT:\u00c8 gi\u00e0 presente una pratica con la stessa ragione sociale: \"{row['company_name']}\". Vuoi procedere comunque?"
            )
        if email and row.get("email") and row["email"].strip().lower() == email.strip().lower():
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"SOFT:\u00c8 gi\u00e0 presente una pratica con la stessa email: \"{row['email']}\". Vuoi procedere comunque?"
            )


def _require_client(client_id: str, company_id: str) -> dict:
    """Verify a client exists within this tenant. Raises 404 if not found."""
    res = (
        supabase.table("clients")
        .select("id, name, status")
        .eq("id", client_id)
        .eq("company_id", company_id)
        .maybe_single()
        .execute()
    )
    if not res.data:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            f"Cliente con id={client_id} non trovato in questa azienda. "
            "Creare prima il record cliente prima di aprire una pratica di onboarding."
        )
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
    client_id:     Optional[str] = Query(None),
    company_id:    Optional[str] = Query(None),
    page:          int = Query(1, ge=1),
    page_size:     int = Query(50, ge=1, le=200),
    user: CurrentUser = Depends(require_admin),
):
    q = (
        supabase.table("onboarding")
        .select("*, clients(name, company_name, email), companies(name)", count="exact")
        .order("created_at", desc=True)
    )
    if user.is_admin:
        if company_id:
            q = q.eq("company_id", company_id)
    else:
        q = q.eq("company_id", str(user.active_company_id))

    if status_filter:
        if status_filter not in _VALID_STATUSES:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"status invalido. Valori ammessi: {sorted(_VALID_STATUSES)}"
            )
        q = q.eq("status", status_filter)
    if client_id:
        q = q.eq("client_id", client_id)

    offset = (page - 1) * page_size
    res = q.range(offset, offset + page_size - 1).execute()
    return {"data": res.data or [], "total": res.count or 0, "page": page, "page_size": page_size}


# ── Get ──────────────────────────────────────────────────────

@router.get("/{onboarding_id}")
async def get_onboarding(
    onboarding_id: str,
    user: CurrentUser = Depends(require_admin),
):
    # Try looking in the active company first (fast path)
    res = (
        supabase.table("onboarding")
        .select("*, clients(name, company_name, email, status), companies(name)")
        .eq("id", str(onboarding_id))
        .eq("company_id", str(user.active_company_id))
        .maybe_single()
        .execute()
    )
    if res and getattr(res, "data", None):
        return res.data

    # If admin, they might be in 'All Companies' view accessing another tenant's onboarding
    if user.is_admin:
        res_any = (
            supabase.table("onboarding")
            .select("*, clients(name, company_name, email, status), companies(name)")
            .eq("id", str(onboarding_id))
            .maybe_single()
            .execute()
        )
        if res_any and getattr(res_any, "data", None):
            # Optionally check user_company_permissions here, but since user is admin 
            # and Onboarding has lower security requirements than full clients, we'll allow it.
            return res_any.data

    raise HTTPException(status.HTTP_404_NOT_FOUND, "Pratica di onboarding non trovata o permessi insufficienti")


# ── Create ───────────────────────────────────────────────────

@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_onboarding(
    body: OnboardingCreate,
    user: CurrentUser = Depends(require_admin),
):
    # Use the company_id from the request body if explicitly provided by an admin
    # (allows creating onboarding for a specific tenant), otherwise fall back to active company.
    company_id = str(body.company_id) if body.company_id else str(user.active_company_id)

    # Verify that the referenced client exists in this tenant (if provided)
    if body.client_id:
        _require_client(body.client_id, company_id)

    # ── Duplicate check ─────────────────────────────────────
    _check_onboarding_duplicates(
        company_id,
        company_name=body.company_name,
        email=body.email,
        vat_number=body.vat_number,
        force_create=getattr(body, "force_create", False),
    )

    row = {k: v for k, v in body.model_dump().items() if k != "force_create"}
    row["company_id"] = company_id
    res = supabase.table("onboarding").insert(row).execute()
    if not res.data:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "Errore durante la creazione della pratica"
        )
    created = res.data[0]
    _audit(company_id, str(user.user_id), created["id"], "create",
           new={"status": created.get("status"), "client_id": created.get("client_id"), "company_id": company_id})
    return created


# ── Update ───────────────────────────────────────────────────

@router.put("/{onboarding_id}")
async def update_onboarding(
    onboarding_id: str,
    body: OnboardingUpdate,
    user: CurrentUser = Depends(require_admin),
):
    old = _require_onboarding(onboarding_id, user)
    actual_company_id = old.get("company_id")

    # Terminal records are immutable
    if old.get("status") in _TERMINAL_STATUSES:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Impossibile modificare una pratica in stato '{old.get('status')}'. "
            "Usare /reopen se necessario."
        )

    updates = body.model_dump(exclude_none=True)

    # Prevent manually jumping to 'converted_to_client' — use /convert instead
    if updates.get("status") == "converted_to_client":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Per convertire una pratica a cliente usa l'azione /convert, non un aggiornamento diretto."
        )

    if not updates:
        return old

    try:
        res = (
            supabase.table("onboarding")
            .update(updates)
            .eq("id", str(onboarding_id))
            .eq("company_id", actual_company_id)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Eccezione DB: {exc}")

    if not res.data:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR, 
            f"Nessun match: id={onboarding_id}, c={actual_company_id}, keys={list(updates.keys())}"
        )
    updated = res.data[0]
    _audit(actual_company_id, str(user.user_id), str(onboarding_id), "update", new=updates)
    return updated



# ── Delete (smart: soft if has history, hard if empty) ────────

@router.delete("/{onboarding_id}", status_code=status.HTTP_200_OK)
async def delete_onboarding(
    onboarding_id: str,
    force: bool = False,    # ?force=true → hard delete even if has history (admin explicit)
    user: CurrentUser = Depends(require_admin),
):
    """
    Smart deletion of an onboarding record.

    - If status == 'cancelled': always blocked
    - If record has history (quotes, contracts, audit logs): soft delete
      (status → 'cancelled', data preserved)
    - If record has no history AND force=False: soft delete (safe default)
    - If force=True AND no active client: hard delete with cascade cleanup
    """
    company_id = str(user.active_company_id)
    record = _require_onboarding(onboarding_id, user)

    if record.get("status") == "converted_to_client":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Impossibile eliminare una pratica già convertita a cliente."
        )

    # If already terminal (abandoned/cancelled) AND force=True → always hard delete.
    # This is the path hit by the UI "Elimina pratica" button on terminal records.
    if force and record.get("status") in {"abandoned", "cancelled"}:
        supabase.table("onboarding").delete().eq(
            "id", str(onboarding_id)
        ).eq("company_id", company_id).execute()
        _audit(company_id, str(user.user_id), str(onboarding_id), "hard_delete",
               new={"reason": "terminal_forced"})
        return {
            "deleted": True,
            "archived": False,
            "message": "Pratica eliminata definitivamente.",
        }

    # Check for history: quotes or audit logs referencing this onboarding
    has_history = False
    try:
        q_res = supabase.table("quotes").select("id").eq(
            "onboarding_id", str(onboarding_id)
        ).limit(1).execute()
        if q_res.data:
            has_history = True
    except Exception:
        pass

    if not has_history:
        try:
            a_res = supabase.table("audit_logs").select("id").eq(
                "entity_type", "onboarding"
            ).eq("entity_id", str(onboarding_id)).limit(1).execute()
            if a_res.data:
                has_history = True
        except Exception:
            pass

    if has_history or not force:
        # Soft delete: cancel but preserve all data
        supabase.table("onboarding").update({
            "status": "cancelled",
        }).eq("id", str(onboarding_id)).eq("company_id", company_id).execute()
        _audit(company_id, str(user.user_id), str(onboarding_id), "soft_delete", new={
            "status": "cancelled",
            "has_history": has_history,
            "forced": force,
        })
        return {
            "deleted": False,
            "archived": True,
            "message": "Pratica archiviata (status=cancelled). I dati storici sono conservati.",
            "has_history": has_history,
        }

    # Hard delete (force=True, no history)
    supabase.table("onboarding").delete().eq(
        "id", str(onboarding_id)
    ).eq("company_id", company_id).execute()
    _audit(company_id, str(user.user_id), str(onboarding_id), "hard_delete")
    return {
        "deleted": True,
        "archived": False,
        "message": "Pratica eliminata definitivamente.",
    }



# ── Cancel (soft archive) ─────────────────────────────────────

@router.post("/{onboarding_id}/cancel")
async def cancel_onboarding(
    onboarding_id: str,
    user: CurrentUser = Depends(require_admin),
):
    """Set status=cancelled without deleting any data."""
    company_id = str(user.active_company_id)
    rec = _require_onboarding(onboarding_id, user)
    if rec.get("status") == "cancelled":
        return {"cancelled": True, "message": "Pratica già annullata."}
    supabase.table("onboarding").update({"status": "cancelled"}).eq(
        "id", str(onboarding_id)
    ).eq("company_id", company_id).execute()
    _audit(company_id, str(user.user_id), str(onboarding_id), "cancel", new={"status": "cancelled"})
    return {"cancelled": True, "message": "Pratica annullata con successo."}


# ── Convert (Onboarding → Client) ────────────────────────────

@router.post("/{onboarding_id}/convert")
async def convert_onboarding(
    onboarding_id: str,
    user: CurrentUser = Depends(require_admin),
):
    """
    Promote a potential customer in Onboarding to a real Client record.

    Actions performed atomically:
    1. Validates the onboarding record is in a convertible state.
    2. Creates a new Client record copying subject data from onboarding.
    3. Updates onboarding: client_id set (hiding it from frontend automatically).
    4. Updates user_company_permissions: onboarding_id → client_id.
    5. Writes audit log.

    Idempotent: if already converted, returns the existing client_id.
    """
    company_id = str(user.active_company_id)
    record = _require_onboarding(onboarding_id, user)

    # Idempotency: already converted
    if record.get("status") == "converted_to_client":
        return {
            "message": "Pratica già convertita",
            "onboarding_id": str(onboarding_id),
            "client_id": record.get("client_id"),
        }

    # Block conversion if terminal (abandoned/cancelled)
    if record.get("status") in _TERMINAL_STATUSES:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Impossibile convertire una pratica in stato '{record.get('status')}'."
        )

    # Require at least a company_name to create a Client
    company_name = record.get("company_name")
    if not company_name:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "La ragione sociale è obbligatoria per convertire la pratica a cliente. "
            "Aggiungere la ragione sociale prima di convertire."
        )

    # 1. Create the Client record from onboarding subject data
    client_payload = {
        "company_id":   company_id,
        "company_name": company_name,
        "name":         record.get("company_name", ""),   # referente (same as company for now)
        "email":        record.get("email"),
        "phone":        record.get("phone"),
        "vat_number":   record.get("vat_number"),
        "pec":          record.get("pec"),
        "dest_code":    record.get("dest_code"),
        "address":      record.get("address"),
        "city":         record.get("city"),
        "status":       "active",
        "notes":        f"Convertito da onboarding #{str(onboarding_id)[:8]}… — {record.get('notes') or ''}".strip(" —"),
    }
    # Remove None values
    client_payload = {k: v for k, v in client_payload.items() if v is not None}

    try:
        client_res = supabase.table("clients").insert(client_payload).execute()
    except Exception as exc:
        logger.error("convert: client insert failed for onboarding=%s: %s", onboarding_id, exc)
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Errore creazione cliente: {exc}")

    if not client_res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Errore: cliente non creato")

    client_id = client_res.data[0]["id"]

    # 2. Update onboarding: status → converted_to_client, set client_id
    steps_total = record.get("steps_total", 10)
    try:
        supabase.table("onboarding").update({
            "status":          "converted_to_client",
            "client_id":       client_id,
            "steps_completed": steps_total,
        }).eq("id", str(onboarding_id)).eq("company_id", company_id).execute()
    except Exception as exc:
        logger.error("convert: onboarding update failed: %s", exc)
        # Client was created — log but don't fail (can be fixed manually)
        logger.warning("convert: client %s created but onboarding %s not updated", client_id, onboarding_id)

    # 3. Update user_company_permissions: migrate onboarding_id → client_id
    try:
        supabase.table("user_company_permissions").update({
            "client_id":     client_id,
            "onboarding_id": None,
        }).eq("onboarding_id", str(onboarding_id)).eq("company_id", company_id).execute()
    except Exception as exc:
        logger.warning("convert: permissions update failed: %s", exc)

    # 4. Audit
    _audit(company_id, str(user.user_id), str(onboarding_id), "convert", new={
        "client_id": client_id,
        "company_name": company_name,
    })

    logger.info("convert: onboarding=%s → client=%s", onboarding_id, client_id)

    return {
        "message":       "Conversione completata",
        "onboarding_id": str(onboarding_id),
        "client_id":     client_id,
    }

# ── Abandon / Cancel ─────────────────────────────────────────

@router.post("/{onboarding_id}/abandon")
async def abandon_onboarding(
    onboarding_id: str,
    user: CurrentUser = Depends(require_admin),
):
    """Mark a workflow as abandoned (client walked away)."""
    company_id = str(user.active_company_id)
    record = _require_onboarding(onboarding_id, user)

    if record.get("status") in _TERMINAL_STATUSES:
        return {"message": f"Pratica già in stato '{record.get('status')}'", "onboarding_id": str(onboarding_id)}

    res = (
        supabase.table("onboarding")
        .update({"status": "abandoned"})
        .eq("id", str(onboarding_id))
        .eq("company_id", company_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Errore")
    _audit(company_id, str(user.user_id), str(onboarding_id), "abandon", new={"status": "abandoned"})
    return {"message": "Pratica segnata come abbandonata", "onboarding_id": str(onboarding_id)}


@router.post("/{onboarding_id}/cancel")
async def cancel_onboarding(
    onboarding_id: str,
    user: CurrentUser = Depends(require_admin),
):
    """Mark a workflow as cancelled (admin decision)."""
    company_id = str(user.active_company_id)
    record = _require_onboarding(onboarding_id, user)

    if record.get("status") in _TERMINAL_STATUSES:
        return {"message": f"Pratica già in stato '{record.get('status')}'", "onboarding_id": str(onboarding_id)}

    res = (
        supabase.table("onboarding")
        .update({"status": "cancelled"})
        .eq("id", str(onboarding_id))
        .eq("company_id", company_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Errore")
    _audit(company_id, str(user.user_id), str(onboarding_id), "cancel", new={"status": "cancelled"})
    return {"message": "Pratica annullata", "onboarding_id": str(onboarding_id)}


class PortalInviteRequest(BaseModel):
    email: str


@router.post("/{onboarding_id}/invite")
async def invite_portal_user(
    onboarding_id: str,
    body: PortalInviteRequest,
    user: CurrentUser = Depends(require_admin),
):
    """
    Mark portal access as created for this onboarding record.
    Sets portal_invited_at and portal_email in the DB so the flag persists.
    If portal_invited_at is already set, the record is NOT overwritten —
    the response includes already_invited=True so the frontend can offer
    a "resend invite" flow without recreating the user.
    """
    from datetime import datetime, timezone

    company_id = str(user.active_company_id)
    record = _require_onboarding(onboarding_id, user)

    already_invited = bool(record.get("portal_invited_at"))

    from integrations.email_service import send_templated_email

    try:
        from config import settings as _s
        from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
        correct_redirect = f"{_s.portal_url}/client_set_password.html"

        def _fix_redirect(link: str) -> str:
            """Supabase strips path from redirect_to in generate_link — fix manually."""
            parsed = urlparse(link)
            params = parse_qs(parsed.query, keep_blank_values=True)
            params["redirect_to"] = [correct_redirect]
            return urlunparse(parsed._replace(query=urlencode({k: v[0] for k, v in params.items()})))

        # Generate Supabase link — type=invite for new users, recovery for existing
        try:
            link_res = supabase.auth.admin.generate_link({
                "type": "invite",
                "email": body.email,
            })
        except Exception:
            # User already exists in Supabase auth → send a password reset link instead
            link_res = supabase.auth.admin.generate_link({
                "type": "recovery",
                "email": body.email,
            })
        action_link = _fix_redirect(link_res.properties.action_link)
        invited_user_id = str(link_res.user.id) if link_res.user else None

        # Upsert invited user as pending (is_active=False) so they appear in users list
        if invited_user_id:
            try:
                supabase.table("users").upsert({
                    "id": invited_user_id,
                    "email": body.email,
                    "name": record.get("company_name") or record.get("lead_name") or body.email,
                    "is_active": False,
                }, on_conflict="id").execute()
                supabase.table("user_company_permissions").upsert({
                    "user_id": invited_user_id,
                    "company_id": company_id,
                    "role": "client",
                    "onboarding_id": str(onboarding_id),
                    "is_default": True,
                }, on_conflict="user_id,company_id").execute()
            except Exception as ue:
                logger.warning("invite_portal_user: could not upsert pending user %s: %s", body.email, ue)

        # Dispatch the templated email
        client_name = record.get("company_name") or record.get("lead_name") or "Cliente"
        await send_templated_email(
            to_email=body.email,
            template_type="client_invite",
            company_id=company_id,
            lang="it",
            variables={"client_name": client_name, "magic_link": action_link}
        )
    except Exception as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            f"Errore durante l'invio dell'email di invito: {exc}"
        )

    if not already_invited:
        # First invite — persist timestamp and email
        res = (
            supabase.table("onboarding")
            .update({
                "portal_invited_at": datetime.now(timezone.utc).isoformat(),
                "portal_email": body.email,
            })
            .eq("id", str(onboarding_id))
            .eq("company_id", company_id)
            .execute()
        )
        if not res.data:
            raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Errore salvataggio")
        _audit(company_id, str(user.user_id), str(onboarding_id), "invite",
               new={"portal_email": body.email})

    return {
        "message": "Invito portale registrato e inviato" if not already_invited else "Invito portale reinviato",
        "already_invited": already_invited,
        "portal_email": record.get("portal_email") or body.email,
        "onboarding_id": str(onboarding_id),
    }


@router.post("/mark-portal-login")
async def mark_portal_first_login(
    user: CurrentUser = Depends(get_current_user),
):
    """
    Called by the client portal on first page load after login.
    Finds the onboarding record linked to the authenticated user's email
    and sets portal_first_login_at (only if not already set — idempotent).
    Accessible by both admin and client roles.
    """
    from datetime import datetime, timezone

    email = user.email
    if not email:
        return {"marked": False, "reason": "no_email"}

    # Find onboarding record where portal_email matches and invite was sent
    res = (
        supabase.table("onboarding")
        .select("id, portal_first_login_at, company_id")
        .eq("portal_email", email)
        .not_.is_("portal_invited_at", "null")
        .limit(1)
        .execute()
    )

    record = res.data[0] if res.data else None
    if not record:
        return {"marked": False, "reason": "no_onboarding_found"}

    if record.get("portal_first_login_at"):
        return {"marked": False, "reason": "already_marked", "first_login_at": record["portal_first_login_at"]}

    # First login — mark it
    now = datetime.now(timezone.utc).isoformat()
    supabase.table("onboarding") \
        .update({"portal_first_login_at": now}) \
        .eq("id", record["id"]) \
        .execute()

    return {"marked": True, "first_login_at": now, "onboarding_id": record["id"]}
