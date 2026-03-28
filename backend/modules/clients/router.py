"""
modules/clients/router.py — CRUD + contacts + Windoc sync
"""
import logging
from fastapi import APIRouter, HTTPException, status, Depends, Query
from pydantic import BaseModel, EmailStr, field_validator
from uuid import UUID
from typing import Optional

from auth.middleware import get_current_user, require_admin, CurrentUser
from database import supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/clients", tags=["clients"])


# ── Schemas ──────────────────────────────────────────────────

# Clients are only REAL/CONVERTED customers — no prospects here
_VALID_CLIENT_STATUSES = {"active", "non_active", "suspended", "insolvent", "ceased"}

class ClientCreate(BaseModel):
    """
    A Client record is created ONLY at conversion from Onboarding.
    company_name (ragione sociale) is the primary identifier.
    """
    company_name: str                       # ragione sociale — REQUIRED at conversion
    name: str = ""                          # referente (opzionale)
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    cap: Optional[str] = None
    province: Optional[str] = None
    vat_number: Optional[str] = None
    tax_code: Optional[str] = None
    pec: Optional[str] = None
    dest_code: Optional[str] = None
    iban: Optional[str] = None
    website: Optional[str] = None
    lang: str = "it"
    status: str = "active"                  # always starts active at conversion
    notes: Optional[str] = None
    onboarding_id: Optional[str] = None    # reference to source onboarding record
    windoc_id: Optional[str] = None        # pre-set when importing from Windoc
    force_create: bool = False              # bypass soft (name/email) duplicate warning
    invite_portal: bool = False             # send portal invite email after creation
    company_id: Optional[str] = None       # override tenant (admin only)

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in _VALID_CLIENT_STATUSES:
            raise ValueError(f"status deve essere uno tra {sorted(_VALID_CLIENT_STATUSES)}")
        return v

class ClientUpdate(BaseModel):
    name: Optional[str] = None
    company_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    cap: Optional[str] = None
    province: Optional[str] = None
    vat_number: Optional[str] = None
    tax_code: Optional[str] = None
    pec: Optional[str] = None
    dest_code: Optional[str] = None
    iban: Optional[str] = None
    website: Optional[str] = None
    lang: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    windoc_id: Optional[str] = None     # stored after Windoc sync; updatable by admin
    company_id: Optional[str] = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v):
        if v is not None and v not in _VALID_CLIENT_STATUSES:
            raise ValueError(f"status must be one of {sorted(_VALID_CLIENT_STATUSES)}")
        return v


class ContactCreate(BaseModel):
    role: str          # billing | admin | signature | other
    name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    is_primary: bool = False
    notes: Optional[str] = None


# ── Helpers ──────────────────────────────────────────────────

def _audit(user: CurrentUser, entity_id: str, action: str,
           old: Optional[dict] = None, new: Optional[dict] = None) -> None:
    """Write an audit log entry. Failures are logged but never bubble up."""
    try:
        supabase.table("audit_logs").insert({
            "company_id":  str(user.active_company_id),
            "user_id":     str(user.user_id),
            "entity_type": "client",
            "entity_id":   entity_id,
            "action":      action,
            "old_values":  old,
            "new_values":  new,
        }).execute()
    except Exception as exc:  # noqa: BLE001
        logger.warning("audit_log write failed: %s", exc)


def _require_client(client_id: UUID, company_id: str) -> dict:
    """
    Fetch a client row, asserting it exists within the given company.
    Raises 404 if not found or belongs to another tenant.
    """
    res = (
        supabase.table("v_clients")
        .select("*")
        .eq("id", str(client_id))
        .eq("company_id", company_id)
        .maybe_single()
        .execute()
    )
    if res is None or not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")
    return res.data


def _check_client_duplicates(
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

    q = supabase.table("clients").select("id,company_name,email,vat_number").eq("company_id", company_id)
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
                f"HARD:\u00c8 gi\u00e0 presente un cliente con la stessa Partita IVA: \"{row['vat_number']}\""
            )
        if force_create:
            continue  # soft checks bypassed by the user's conscious choice
        # Soft blocks: name / email — bypassable via force_create
        if company_name and row.get("company_name") and \
                row["company_name"].strip().lower() == company_name.strip().lower():
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"SOFT:\u00c8 gi\u00e0 presente un cliente con la stessa ragione sociale: \"{row['company_name']}\". Vuoi procedere comunque?"
            )
        if email and row.get("email") and row["email"].strip().lower() == email.strip().lower():
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"SOFT:\u00c8 gi\u00e0 presente un cliente con la stessa email: \"{row['email']}\". Vuoi procedere comunque?"
            )


# ── List / Search ────────────────────────────────────────────

@router.get("/")
async def list_clients(
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: CurrentUser = Depends(get_current_user),
):
    q = (
        supabase.table("v_clients")
        .select("*", count="exact")
        .eq("company_id", str(user.active_company_id))
    )
    # Non-admin clients see only their own record (double-enforced alongside RLS)
    if not user.is_admin:
        if not user.client_id:
            return {"data": [], "total": 0, "page": page, "page_size": page_size}
        q = q.eq("id", str(user.client_id))
    if status_filter:
        q = q.eq("status", status_filter)
    if search:
        q = q.ilike("name", f"%{search}%")

    offset = (page - 1) * page_size
    res = q.order("name").range(offset, offset + page_size - 1).execute()
    return {"data": res.data or [], "total": res.count or 0, "page": page, "page_size": page_size}


# ── Create ────────────────────────────────────────────────────

@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_client(
    body: ClientCreate,
    user: CurrentUser = Depends(require_admin),
):
    # Use body.company_id if provided by admin, otherwise fallback to active
    company_tmp = body.company_id or user.active_company_id
    if not company_tmp:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Seleziona un'azienda per creare il cliente."
        )
    company_id = str(company_tmp)

    # ── Duplicate check ───────────────────────────────────────
    _check_client_duplicates(
        company_id,
        company_name=body.company_name,
        email=str(body.email) if body.email else None,
        vat_number=body.vat_number,
        force_create=body.force_create,
    )

    row = {k: v for k, v in body.model_dump().items()
           if k not in ('force_create', 'invite_portal')}
    row["company_id"] = company_id
    # Strip None values before insert to avoid DB type errors
    row = {k: v for k, v in row.items() if v is not None or k in ('name', 'company_name', 'lang', 'status')}
    res = supabase.table("clients").insert(row).execute()
    if not res.data:
        logger.error("create_client: no data returned from insert")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Failed to create client")
    client = res.data[0]
    _audit(user, client["id"], "create", new=client)

    # Optionally send portal invite email
    if body.invite_portal and client.get("email"):
        try:
            from auth.router import _send_portal_invite  # noqa: PLC0415
            import asyncio
            asyncio.create_task(_send_portal_invite(
                client_id=client["id"],
                email=client["email"],
                company_id=company_id,
            ))
        except Exception as exc:
            logger.warning("invite_portal: failed to send invite for client %s: %s", client["id"], exc)

    return client


# ── Get ───────────────────────────────────────────────────────

@router.get("/me")
async def get_own_client_profile(user: CurrentUser = Depends(get_current_user)):
    """Client-portal: fetch the authenticated client's own record."""
    if user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin users do not have a client profile")
    if not user.client_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No client record linked to this user")
    return _require_client(user.client_id, str(user.active_company_id))


@router.put("/me")
async def update_own_client_profile(
    body: ClientUpdate,
    user: CurrentUser = Depends(get_current_user),
):
    """Client-portal: update the authenticated client's own record."""
    if user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Use the admin update endpoint instead")
    if not user.client_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No client record linked to this user")

    old = _require_client(user.client_id, str(user.active_company_id))
    updates = body.model_dump(exclude_none=True)
    if not updates:
        return old  # nothing to do

    res = (
        supabase.table("clients")
        .update(updates)
        .eq("id", str(user.client_id))
        .eq("company_id", str(user.active_company_id))
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Update returned no data")
    _audit(user, str(user.client_id), "update", old=old, new=updates)
    return res.data[0]


# ── Windoc Import ─────────────────────────────────────────────
# NOTE: These routes MUST be defined BEFORE /{client_id} to avoid FastAPI
# trying to parse 'windoc' as a UUID for the client_id parameter.

class WindocImportItem(BaseModel):
    windoc_id: str
    company_name: str
    vat_number: Optional[str] = None
    tax_code: Optional[str] = None
    email: Optional[str] = None
    pec: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    cap: Optional[str] = None
    province: Optional[str] = None
    dest_code: Optional[str] = None


class WindocImportBody(BaseModel):
    items: list[WindocImportItem]


@router.get("/windoc/contacts")
async def list_windoc_contacts(
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    user: CurrentUser = Depends(require_admin),
):
    """Fetch contacts from WindDoc via contatti_lista for import preview."""
    from integrations.windoc import search_windoc_rubrica

    if not user.active_company_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Seleziona un'azienda attiva per visualizzare la rubrica Windoc."
        )

    company_id = str(user.active_company_id)
    try:
        data = await search_windoc_rubrica(search or "", company_id, page)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))
    except Exception as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Windoc connection error: {exc}")

    # contatti_lista returns { success, pagina_corrente, numero_pagine, lista: [...] }
    raw = data.get("lista") or []

    # Mark already-imported windoc_ids
    existing = supabase.table("clients") \
        .select("windoc_id") \
        .eq("company_id", company_id) \
        .not_.is_("windoc_id", "null") \
        .execute()
    imported_ids = {str(r["windoc_id"]) for r in (existing.data or [])}

    contacts = []
    for c in raw:
        windoc_id   = str(c.get("id_contatto") or c.get("id") or "")
        name_parts  = f"{c.get('nome','') or ''} {c.get('cognome','') or ''}".strip()
        contacts.append({
            "windoc_id":    windoc_id,
            "company_name": c.get("ragione_sociale") or name_parts or "",
            "vat_number":   c.get("partita_iva") or "",
            "tax_code":     c.get("codice_fiscale") or "",
            "email":        c.get("email") or "",
            "pec":          c.get("email_pec") or c.get("pec") or "",
            "phone":        c.get("telefono") or "",
            "address":      c.get("indirizzo_via") or c.get("indirizzo") or "",
            "city":         c.get("indirizzo_citta") or c.get("citta") or "",
            "cap":          c.get("indirizzo_cap") or c.get("cap") or "",
            "province":     c.get("indirizzo_provincia") or c.get("provincia") or "",
            "dest_code":    c.get("codice_destinatario") or "",
            "already_imported": windoc_id in imported_ids,
        })

    return {
        "data":        contacts,
        "total":       data.get("numero_pagine", 1) * 50 if isinstance(data, dict) else len(contacts),
        "total_pages": data.get("numero_pagine", 1) if isinstance(data, dict) else 1,
        "page":        page,
    }



@router.post("/windoc/import", status_code=status.HTTP_201_CREATED)
async def import_clients_from_windoc(
    body: WindocImportBody,
    user: CurrentUser = Depends(require_admin),
):
    """Bulk-import selected WindDoc contacts as local Clients."""
    if not user.active_company_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Seleziona un'azienda attiva per effettuare l'importazione."
        )

    company_id = str(user.active_company_id)
    created_ok  = []
    skipped     = []
    errors      = []

    for item in body.items:
        # Skip already-imported contacts
        existing = supabase.table("clients") \
            .select("id") \
            .eq("company_id", company_id) \
            .eq("windoc_id", item.windoc_id) \
            .maybe_single() \
            .execute()
        if existing and existing.data:
            skipped.append({"windoc_id": item.windoc_id, "reason": "already_imported"})
            continue

        row = {
            "company_id":   company_id,
            "company_name": item.company_name,
            "name":         item.company_name,
            "email":        item.email or None,
            "pec":          item.pec or None,
            "phone":        item.phone or None,
            "address":      item.address or None,
            "city":         item.city or None,
            "vat_number":   item.vat_number or None,
            "dest_code":    item.dest_code or None,
            "windoc_id":    item.windoc_id,
            "status":       "active",
            "lang":         "it",
        }
        row = {k: v for k, v in row.items() if v is not None}
        try:
            res = supabase.table("clients").insert(row).execute()
            if res.data:
                cli = res.data[0]
                _audit(user, str(cli["id"]), "windoc_import", new=cli)
                created_ok.append({"windoc_id": item.windoc_id, "client_id": cli["id"]})
            else:
                errors.append({"windoc_id": item.windoc_id, "error": "insert returned no data"})
        except Exception as exc:
            errors.append({"windoc_id": item.windoc_id, "error": str(exc)})

    return {
        "created": len(created_ok),
        "skipped": len(skipped),
        "errors":  len(errors),
        "details": {"created": created_ok, "skipped": skipped, "errors": errors},
    }






@router.get("/{client_id}")
async def get_client(
    client_id: UUID,
    user: CurrentUser = Depends(get_current_user),
):
    # For non-admin users, enforce they can only access their own record
    if not user.is_admin:
        if not user.client_id or str(user.client_id) != str(client_id):
            raise HTTPException(status.HTTP_403_FORBIDDEN)
    return _require_client(client_id, str(user.active_company_id))


# ── Update ────────────────────────────────────────────────────

@router.put("/{client_id}")
async def update_client(
    client_id: UUID,
    body: ClientUpdate,
    user: CurrentUser = Depends(require_admin),
):
    old = _require_client(client_id, str(user.active_company_id))

    updates = body.model_dump(exclude_none=True)
    if not updates:
        return old  # nothing to do

    # If the user is an admin moving the client to another tenant
    if "company_id" in updates:
        updates["company_id"] = str(updates["company_id"])

    res = (
        supabase.table("clients")
        .update(updates)
        .eq("id", str(client_id))
        .eq("company_id", str(user.active_company_id))  # tenant safety
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Update returned no data")
    _audit(user, str(client_id), "update", old=old, new=updates)
    return res.data[0]



# ── Delete / Cease ────────────────────────────────────────────

@router.delete("/{client_id}", status_code=status.HTTP_200_OK)
async def delete_client(
    client_id: UUID,
    force: bool = False,    # ?force=true → hard delete (admin explicit, blocked if unpaid invoices)
    user: CurrentUser = Depends(require_admin),
):
    """
    Safe client deletion.

    - Blocked if client has unpaid invoices (always — regardless of force).
    - Default (force=False): soft delete → status='ceased', data preserved.
    - force=True + no unpaid invoices: hard delete with warning.
    """
    company_id = str(user.active_company_id)
    old = _require_client(client_id, company_id)

    # Always block if there are unpaid invoices
    try:
        unpaid = supabase.table("invoices").select("id").eq(
            "client_id", str(client_id)
        ).eq("company_id", company_id).in_("status", ["sent", "overdue"]).limit(1).execute()
        if unpaid.data:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Impossibile eliminare un cliente con fatture non pagate. "
                "Saldare o annullare le fatture aperte prima di procedere."
            )
    except HTTPException:
        raise
    except Exception:
        pass  # DB check failed — allow to proceed (don't block on check errors)

    if not force:
        # Soft delete: cease the client
        supabase.table("clients").update({"status": "ceased"}).eq(
            "id", str(client_id)
        ).eq("company_id", company_id).execute()
        _audit(user, str(client_id), "soft_delete", old={"status": old.get("status")}, new={"status": "ceased"})
        return {
            "deleted": False,
            "archived": True,
            "message": "Cliente cessato (status=ceased). I dati storici sono conservati.",
        }

    # Hard delete (force=True, no unpaid invoices)
    supabase.table("clients").delete().eq("id", str(client_id)).eq("company_id", company_id).execute()
    _audit(user, str(client_id), "hard_delete", old=old)
    return {
        "deleted": True,
        "archived": False,
        "message": "Cliente eliminato definitivamente.",
    }


@router.post("/{client_id}/cease")
async def cease_client(
    client_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    """
    Explicitly cease a client (soft delete alias, user-friendly).
    Sets status → 'ceased'. Blocked if unpaid invoices exist.
    """
    company_id = str(user.active_company_id)
    old = _require_client(client_id, company_id)

    if old.get("status") == "ceased":
        return {"message": "Cliente già cessato", "status": "ceased"}

    try:
        unpaid = supabase.table("invoices").select("id").eq(
            "client_id", str(client_id)
        ).eq("company_id", company_id).in_("status", ["sent", "overdue"]).limit(1).execute()
        if unpaid.data:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Impossibile cessare un cliente con fatture non pagate."
            )
    except HTTPException:
        raise
    except Exception:
        pass

    supabase.table("clients").update({"status": "ceased"}).eq(
        "id", str(client_id)
    ).eq("company_id", company_id).execute()
    _audit(user, str(client_id), "cease", old={"status": old.get("status")}, new={"status": "ceased"})
    return {"message": "Cliente cessato con successo", "status": "ceased"}



# ── Contacts ─────────────────────────────────────────────────

@router.get("/{client_id}/contacts")
async def list_contacts(
    client_id: UUID,
    user: CurrentUser = Depends(get_current_user),
):
    # Verify the parent client is accessible to this user/tenant first
    _require_client(client_id, str(user.active_company_id))

    res = (
        supabase.table("client_contacts")
        .select("*")
        .eq("client_id", str(client_id))
        .eq("company_id", str(user.active_company_id))  # tenant safety
        .order("is_primary", desc=True)
        .execute()
    )
    return res.data or []


@router.post("/{client_id}/contacts", status_code=status.HTTP_201_CREATED)
async def add_contact(
    client_id: UUID,
    body: ContactCreate,
    user: CurrentUser = Depends(require_admin),
):
    # Verify the parent client belongs to this tenant
    _require_client(client_id, str(user.active_company_id))

    row = {
        **body.model_dump(),
        "client_id":  str(client_id),
        "company_id": str(user.active_company_id),
    }
    res = supabase.table("client_contacts").insert(row).execute()
    if not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Failed to create contact")
    return res.data[0]


@router.delete("/{client_id}/contacts/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contact(
    client_id: UUID,
    contact_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    existing = (
        supabase.table("client_contacts")
        .select("id")
        .eq("id", str(contact_id))
        .eq("client_id", str(client_id))
        .eq("company_id", str(user.active_company_id))
        .maybe_single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contact not found")
    supabase.table("client_contacts").delete().eq("id", str(contact_id)).eq("company_id", str(user.active_company_id)).execute()


# ── Related data shortcuts ────────────────────────────────────

@router.get("/{client_id}/services")
async def client_services(
    client_id: UUID,
    user: CurrentUser = Depends(get_current_user),
):
    _require_client(client_id, str(user.active_company_id))
    res = (
        supabase.table("client_services")
        .select("*, services_catalog(name,billing_cycle)")
        .eq("client_id", str(client_id))
        .eq("company_id", str(user.active_company_id))
        .execute()
    )
    return res.data or []


@router.get("/{client_id}/invoices")
async def client_invoices(
    client_id: UUID,
    user: CurrentUser = Depends(get_current_user),
):
    _require_client(client_id, str(user.active_company_id))
    res = (
        supabase.table("invoices")
        .select("*")
        .eq("client_id", str(client_id))
        .eq("company_id", str(user.active_company_id))
        .order("due_date", desc=True)
        .execute()
    )
    return res.data or []


@router.get("/{client_id}/contracts")
async def client_contracts(
    client_id: UUID,
    user: CurrentUser = Depends(get_current_user),
):
    _require_client(client_id, str(user.active_company_id))
    res = (
        supabase.table("contracts")
        .select("*")
        .eq("client_id", str(client_id))
        .eq("company_id", str(user.active_company_id))
        .execute()
    )
    return res.data or []


@router.get("/{client_id}/documents")
async def client_documents(
    client_id: UUID,
    user: CurrentUser = Depends(get_current_user),
):
    _require_client(client_id, str(user.active_company_id))
    res = (
        supabase.table("documents")
        .select("*")
        .eq("client_id", str(client_id))
        .eq("company_id", str(user.active_company_id))
        .execute()
    )
    return res.data or []


# ── Integrations ─────────────────────────────────────────────

@router.post("/{client_id}/sync-windoc")
async def sync_client_windoc(
    client_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    """Sync a Nexus client to WindDoc Rubrica."""
    _require_client(client_id, str(user.active_company_id))
    from integrations.windoc import sync_client_to_windoc
    import asyncio
    try:
        data = await asyncio.to_thread(sync_client_to_windoc, str(client_id), str(user.active_company_id))
        return {"success": True, "windoc_data": data}
    except Exception as exc:
        logger.error("sync_client_windoc failed for client_id=%s: %s", client_id, exc)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))


# ── Notes ────────────────────────────────────────────────────

class NoteCreate(BaseModel):
    content: str

@router.get("/{client_id}/notes")
async def list_notes(
    client_id: UUID,
    user: CurrentUser = Depends(get_current_user),
):
    _require_client(client_id, str(user.active_company_id))
    res = (
        supabase.table("client_notes")
        .select("*")
        .eq("client_id", str(client_id))
        .order("created_at", desc=True)
        .execute()
    )
    return res.data or []

@router.post("/{client_id}/notes", status_code=status.HTTP_201_CREATED)
async def create_note(
    client_id: UUID,
    body: NoteCreate,
    user: CurrentUser = Depends(get_current_user),
):
    _require_client(client_id, str(user.active_company_id))
    row = {
        "client_id": str(client_id),
        "content": body.content,
    }
    res = supabase.table("client_notes").insert(row).execute()
    if not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Failed to create note")
    return res.data[0]

@router.delete("/{client_id}/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(
    client_id: UUID,
    note_id: UUID,
    user: CurrentUser = Depends(require_admin), # Only admins delete notes for now
):
    _require_client(client_id, str(user.active_company_id))
    supabase.table("client_notes").delete().eq("id", str(note_id)).eq("client_id", str(client_id)).execute()
