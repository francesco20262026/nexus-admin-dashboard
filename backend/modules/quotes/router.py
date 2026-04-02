"""
modules/quotes/router.py — Quotes / Preventivi module
Phase 4: full quote lifecycle (draft → sent → accepted/rejected/expired)
Quotes belong to a client, optionally to onboarding, carry quote_lines.
"""
import logging
from fastapi import APIRouter, HTTPException, status, Depends, Query
from pydantic import BaseModel, field_validator
from uuid import UUID
from typing import Optional
from datetime import date, datetime, timezone

from auth.middleware import get_current_user, require_admin, CurrentUser
from database import supabase

logger = logging.getLogger(__name__)


async def _auto_compile_and_send_contract(
    contract_id: str, company_id: str, user: "CurrentUser", onboarding_id: Optional[str]
) -> bool:
    """
    Auto-compile the contract template and send it via email as PDF.
    Returns True if sent successfully, False on any failure (never raises).
    Avoids circular import — duplicates the essential logic from contracts/router.py.
    """
    from automation import auto_advance_onboarding

    try:
        contract = (
            supabase.table("contracts")
            .select("*, clients(*), document_templates(content,name), onboarding!contracts_onboarding_id_fkey(email,company_name,reference_name)")
            .eq("id", contract_id)
            .eq("company_id", company_id)
            .maybe_single()
            .execute()
        ).data
        if not contract:
            return False

        tmpl_content = (contract.get("document_templates") or {}).get("content")
        if not tmpl_content:
            logger.warning("_auto_compile_and_send_contract: no template on contract %s", contract_id)
            return False

        client_info = contract.get("clients") or {}
        onb_info = contract.get("onboarding") or {}
        recipient_email = client_info.get("email") or onb_info.get("email")
        if not recipient_email:
            logger.warning("_auto_compile_and_send_contract: no email on contract %s", contract_id)
            return False

        client_name = client_info.get("name") or onb_info.get("company_name") or onb_info.get("reference_name") or "Cliente"

        # Compile: replace {{placeholders}} using company data
        company_res = supabase.table("companies").select("name,vat_number,address,email").eq("id", company_id).maybe_single().execute()
        company = company_res.data or {}
        from datetime import datetime as _dt, timezone as _tz
        today = _dt.now(_tz.utc)
        vars_map = {
            "cliente_nome": client_info.get("name", ""),
            "cliente_email": client_info.get("email", ""),
            "cliente_piva": client_info.get("vat_number", ""),
            "cliente_cf": client_info.get("fiscal_code", ""),
            "cliente_indirizzo": client_info.get("address", ""),
            "cliente_citta": client_info.get("city", ""),
            "cliente_pec": client_info.get("pec", ""),
            "cliente_sdi": client_info.get("sdi_code") or client_info.get("dest_code", ""),
            "fornitore_nome": company.get("name", ""),
            "fornitore_piva": company.get("vat_number", ""),
            "fornitore_indirizzo": company.get("address", ""),
            "fornitore_email": company.get("email", ""),
            "data_oggi": today.strftime("%d/%m/%Y"),
            "anno": str(today.year),
        }
        compiled = tmpl_content
        for k, v in vars_map.items():
            compiled = compiled.replace("{{" + k + "}}", str(v) if v else "")

        supabase.table("contracts").update({
            "compiled_content": compiled,
            "compiled_at": today.isoformat(),
        }).eq("id", contract_id).eq("company_id", company_id).execute()

        # Generate PDF and send
        from core_services.pdf_service import generate_pdf_from_html
        from integrations.email_service import send_templated_email
        from config import settings
        pdf_bytes = generate_pdf_from_html(compiled)
        frontend_url = getattr(settings, "FRONTEND_URL", "https://crm.delocanova.com")
        await send_templated_email(
            company_id=company_id,
            to_email=recipient_email,
            template_type="contract_send",
            lang="it",
            variables={"client_name": client_name, "client_portal_url": frontend_url},
            attachments=[(f"Contratto_{contract_id[:8]}.pdf", pdf_bytes)],
        )

        # Mark contract as sent
        supabase.table("contracts").update({"status": "sent"}).eq("id", contract_id).eq("company_id", company_id).execute()

        auto_advance_onboarding(
            company_id=company_id,
            user_id=str(user.user_id),
            onboarding_id=onboarding_id,
            target_status="contract_sent",
            reason=f"Contratto {contract_id[:8]}… inviato automaticamente dopo accettazione preventivo",
        )

        logger.info("_auto_compile_and_send_contract: contract %s compiled and sent OK", contract_id)
        return True

    except Exception as exc:
        logger.warning("_auto_compile_and_send_contract: failed for %s — %s", contract_id, exc)
        return False

router = APIRouter(prefix="/quotes", tags=["quotes"])

# ── Status sets ───────────────────────────────────────────────
_QUOTE_STATUSES = {"draft", "sent", "accepted", "rejected", "expired"}


# ── Schemas ──────────────────────────────────────────────────

class QuoteLineIn(BaseModel):
    service_id:  Optional[UUID]  = None
    description: str
    quantity:    float           = 1.0
    unit_price:  float           = 0.0
    vat_rate:    float           = 22.0


class QuoteCreate(BaseModel):
    client_id:           Optional[UUID]    = None
    onboarding_id:       Optional[UUID]    = None
    supplier_company_id: Optional[UUID]    = None
    management_channel:  str               = "formal_sent"
    title:               str
    valid_until:         Optional[date]    = None
    notes:               Optional[str]     = None
    currency:            str               = "EUR"
    lines:               list[QuoteLineIn] = []

    @field_validator("management_channel")
    @classmethod
    def validate_channel(cls, v):
        allowed = {"formal_sent", "verbal", "internal"}
        if v not in allowed:
            raise ValueError(f"management_channel must be one of {allowed}")
        return v


class QuoteUpdate(BaseModel):
    title:               Optional[str]   = None
    onboarding_id:       Optional[UUID]  = None
    supplier_company_id: Optional[UUID]  = None
    management_channel:  Optional[str]   = None
    valid_until:         Optional[date]  = None
    notes:               Optional[str]   = None
    currency:            Optional[str]   = None
    lines:               Optional[list[QuoteLineIn]] = None

    @field_validator("management_channel")
    @classmethod
    def validate_channel(cls, v):
        if v is not None and v not in {"formal_sent", "verbal", "internal"}:
            raise ValueError("management_channel errato")
        return v


# ── Helpers ──────────────────────────────────────────────────

def _resolve_onboarding_id(quote: dict, company_id: str) -> Optional[str]:
    """
    Returns the onboarding_id to use for auto_advance.
    Priority: quote.onboarding_id → lookup by client_id (active onboarding).
    """
    if quote.get("onboarding_id"):
        return str(quote["onboarding_id"])
    if quote.get("client_id"):
        try:
            res = (
                supabase.table("onboarding")
                .select("id")
                .eq("company_id", company_id)
                .eq("client_id", str(quote["client_id"]))
                .not_.in_("status", ["converted_to_client", "abandoned", "cancelled"])
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            if res.data:
                return str(res.data[0]["id"])
        except Exception as exc:
            logger.warning("_resolve_onboarding_id lookup failed: %s", exc)
    return None


def _audit(user: CurrentUser, entity_id: str, action: str,
           old: Optional[dict] = None, new: Optional[dict] = None) -> None:
    try:
        supabase.table("audit_logs").insert({
            "company_id":  str(user.active_company_id),
            "user_id":     str(user.user_id),
            "entity_type": "quote",
            "entity_id":   entity_id,
            "action":      action,
            "old_values":  old,
            "new_values":  new,
        }).execute()
    except Exception as exc:
        logger.warning("audit_log write failed for quote %s: %s", entity_id, exc)


def _require_quote(quote_id: UUID, user: CurrentUser, select: str = "*") -> dict:
    res = (
        supabase.table("quotes")
        .select(select)
        .eq("id", str(quote_id))
        .eq("company_id", str(user.active_company_id))
        .maybe_single()
        .execute()
    )
    if res and getattr(res, "data", None):
        return res.data

    if user.is_admin:
        res_any = supabase.table("quotes").select(select).eq("id", str(quote_id)).maybe_single().execute()
        if res_any and getattr(res_any, "data", None):
            return res_any.data

    raise HTTPException(status.HTTP_404_NOT_FOUND, "Preventivo non trovato")


def _compute_totals(lines: list[QuoteLineIn]) -> tuple[float, float, float]:
    """Returns (total_net, total_vat, total)."""
    net = 0.0
    vat = 0.0
    for ln in lines:
        line_net = round(ln.quantity * ln.unit_price, 2)
        line_vat = round(line_net * ln.vat_rate / 100.0, 2)
        net += line_net
        vat += line_vat
    return round(net, 2), round(vat, 2), round(net + vat, 2)


def _upsert_lines(quote_id: str, lines: list[QuoteLineIn]) -> None:
    """Delete existing lines and insert new ones."""
    supabase.table("quote_lines").delete().eq("quote_id", quote_id).execute()
    if not lines:
        return
    rows = []
    for ln in lines:
        line_net   = round(ln.quantity * ln.unit_price, 2)
        line_total = round(line_net * (1 + ln.vat_rate / 100.0), 2)
        rows.append({
            "quote_id":    quote_id,
            "service_id":  str(ln.service_id) if ln.service_id else None,
            "description": ln.description,
            "quantity":    ln.quantity,
            "unit_price":  ln.unit_price,
            "vat_rate":    ln.vat_rate,
            "line_total":  line_total,
        })
    supabase.table("quote_lines").insert(rows).execute()


# ── List ─────────────────────────────────────────────────────

@router.get("/")
async def list_quotes(
    status_filter:        Optional[str] = Query(None, alias="status"),
    client_id:            Optional[str] = None,
    onboarding_id:        Optional[str] = None,
    supplier_company_id:  Optional[str] = None,
    management_channel:   Optional[str] = None,
    page:                 int           = Query(1, ge=1),
    page_size:            int           = Query(50, ge=1, le=200),
    user: CurrentUser = Depends(get_current_user),
):
    q = supabase.table("quotes").select("*, clients(name, email), onboarding!quotes_onboarding_id_fkey(company_name, reference_name), supplier_company:companies!quotes_supplier_company_id_fkey(name), tenant_company:companies!quotes_company_id_fkey(name)", count="exact")

    if user.is_admin:
        if supplier_company_id:
            q = q.eq("company_id", str(supplier_company_id))
    else:
        q = q.eq("company_id", str(user.active_company_id))
    if not user.is_admin:
        if not user.client_id and not user.onboarding_id:
            return {"data": [], "total": 0, "page": page, "page_size": page_size}
        or_conds = []
        if user.client_id:
            or_conds.append(f"client_id.eq.{user.client_id}")
        if user.onboarding_id:
            or_conds.append(f"onboarding_id.eq.{user.onboarding_id}")
        
        q = q.or_(",".join(or_conds))


    if status_filter:         q = q.eq("status", status_filter)
    if client_id:             q = q.eq("client_id", str(client_id))
    if onboarding_id:         q = q.eq("onboarding_id", str(onboarding_id))
    if supplier_company_id:   q = q.eq("supplier_company_id", str(supplier_company_id))
    if management_channel:    q = q.eq("management_channel", str(management_channel))

    offset = (page - 1) * page_size
    res = q.order("created_at", desc=True).range(offset, offset + page_size - 1).execute()
    return {"data": res.data or [], "total": res.count or 0, "page": page, "page_size": page_size}


# ── Get ───────────────────────────────────────────────────────

@router.get("/{quote_id}")
async def get_quote(quote_id: UUID, user: CurrentUser = Depends(get_current_user)):
    q = supabase.table("quotes").select("*, quote_lines(*), clients(name, email)").eq("id", str(quote_id))
    if not user.is_admin:
        q = q.eq("company_id", str(user.active_company_id))

    res = q.maybe_single().execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    
    quote = res.data
    
    # Ownership verification for non-admins
    if not user.is_admin:
        is_client_owner = user.client_id and str(quote.get("client_id")) == str(user.client_id)
        is_onboarding_owner = user.onboarding_id and str(quote.get("onboarding_id")) == str(user.onboarding_id)
        if not (is_client_owner or is_onboarding_owner):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Non hai accesso a questo preventivo")
            
    return quote


# ── Create ────────────────────────────────────────────────────

@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_quote(
    body: QuoteCreate,
    user: CurrentUser = Depends(require_admin),
):
    # Determine the company_id for this quote
    # Priority: 1. explicit supplier 2. onboarding's company 3. client's company 4. active session
    company_id = str(user.active_company_id)
    if body.supplier_company_id:
        company_id = str(body.supplier_company_id)
    elif body.onboarding_id:
        try:
            ores = supabase.table("onboarding").select("company_id").eq("id", str(body.onboarding_id)).execute()
            if ores.data and ores.data[0].get("company_id"):
                company_id = ores.data[0]["company_id"]
        except Exception:
            pass
    elif body.client_id:
        try:
            cres = supabase.table("clients").select("company_id").eq("id", str(body.client_id)).execute()
            if cres.data and cres.data[0].get("company_id"):
                company_id = cres.data[0]["company_id"]
        except Exception:
            pass

    # Generazione numero preventivo progressivo
    year = datetime.now(timezone.utc).year
    q_count = supabase.table("quotes").select("id", count="exact").eq("company_id", company_id).gte("created_at", f"{year}-01-01").execute()
    count = q_count.count or 0
    quote_number = f"PREV-{year}-{(count + 1):03d}"

    total_net, total_vat, total = _compute_totals(body.lines)
    row = {
        "company_id":          company_id,
        "client_id":           str(body.client_id) if body.client_id else None,
        "onboarding_id":       str(body.onboarding_id) if body.onboarding_id else None,
        "supplier_company_id": str(body.supplier_company_id) if body.supplier_company_id else None,
        "management_channel":  body.management_channel,
        "number":              quote_number,
        "created_by":          str(user.user_id),
        "title":               body.title,
        "status":              "draft",
        "valid_until":         body.valid_until.isoformat() if body.valid_until else None,
        "notes":               body.notes,
        "currency":            body.currency,
        "total_net":           total_net,
        "total_vat":           total_vat,
        "total":               total,
    }
    res = supabase.table("quotes").insert(row).execute()
    if not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Errore nella creazione")
    quote = res.data[0]
    _upsert_lines(quote["id"], body.lines)
    _audit(user, quote["id"], "create", new={"title": quote["title"], "client_id": quote["client_id"], "total": total})
    
    # Auto-advance onboarding to quote_draft (= "Preventivo in lavorazione")
    oid = quote.get("onboarding_id")
    if not oid and quote.get("client_id"):
        # Try to find linked onboarding via client record
        try:
            cres = supabase.table("clients").select("onboarding_id").eq("id", quote["client_id"]).execute()
            if cres.data and cres.data[0].get("onboarding_id"):
                oid = cres.data[0]["onboarding_id"]
        except Exception:
            pass
    if oid:
        try:
            from automation import auto_advance_onboarding
            auto_advance_onboarding(str(user.active_company_id), str(user.user_id), str(oid), "quote_draft", "Preventivo in bozza generato")
        except Exception as e:
            logger.warning(f"auto_advance on quote_draft failed: {e}")
            
    return quote


@router.post("/{quote_id}/duplicate", status_code=status.HTTP_201_CREATED)
async def duplicate_quote(quote_id: UUID, user: CurrentUser = Depends(require_admin)):
    """Duplica un preventivo esistente creandone uno nuovo in bozza."""
    q_full = _require_quote(quote_id, user, select="*, quote_lines(*)")
    
    company_id = q_full.get("company_id") or str(user.active_company_id)
    year = datetime.now(timezone.utc).year
    q_count = supabase.table("quotes").select("id", count="exact").eq("company_id", company_id).gte("created_at", f"{year}-01-01").execute()
    count = q_count.count or 0
    quote_number = f"PREV-{year}-{(count + 1):03d}"
    
    exclude_keys = {"id", "created_at", "updated_at", "accepted_at", "rejected_at", "sent_at", "expired_at", "quote_lines"}
    new_quote_data = {k: v for k, v in q_full.items() if k not in exclude_keys}
    
    new_quote_data["status"] = "draft"
    new_quote_data["number"] = quote_number
    new_quote_data["title"] = f"{new_quote_data.get('title', 'Preventivo')} (Copia)"
    
    res = supabase.table("quotes").insert(new_quote_data).execute()
    if not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Impossibile duplicare il preventivo")
        
    new_quote = res.data[0]
    
    old_lines = q_full.get("quote_lines", [])
    if old_lines:
        line_exclude = {"id", "created_at", "quote_id"}
        new_lines = []
        for line in old_lines:
            new_line = {k: v for k, v in line.items() if k not in line_exclude}
            new_line["quote_id"] = new_quote["id"]
            new_lines.append(new_line)
        supabase.table("quote_lines").insert(new_lines).execute()
        
    from modules.activity.router import log_timeline_event
    log_timeline_event(
        company_id=company_id, actor_user_id=str(user.user_id),
        event_type="system", title="Preventivo duplicato",
        client_id=new_quote.get("client_id"), onboarding_id=new_quote.get("onboarding_id"),
        body=f"Copia del preventivo {str(quote_id)[:8]}"
    )
    
    return new_quote


# ── Update ────────────────────────────────────────────────────

@router.put("/{quote_id}")
async def update_quote(
    quote_id: UUID,
    body: QuoteUpdate,
    user: CurrentUser = Depends(require_admin),
):
    old = _require_quote(quote_id, user, select="status,title,total,company_id")
    if old["status"] in {"accepted", "rejected", "expired"}:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"Non è possibile modificare un preventivo nello stato '{old['status']}'")

    updates: dict = {}
    if body.title is not None:         updates["title"]         = body.title
    if body.notes is not None:         updates["notes"]         = body.notes
    if body.currency is not None:             updates["currency"]             = body.currency
    if body.valid_until is not None:          updates["valid_until"]          = body.valid_until.isoformat()
    if body.onboarding_id is not None:        updates["onboarding_id"]        = str(body.onboarding_id)
    if body.supplier_company_id is not None:  updates["supplier_company_id"]  = str(body.supplier_company_id)
    if body.management_channel is not None:   updates["management_channel"]   = body.management_channel

    if body.lines is not None:
        net, vat, tot = _compute_totals(body.lines)
        updates.update({"total_net": net, "total_vat": vat, "total": tot})
        _upsert_lines(str(quote_id), body.lines)

    if updates:
        res = (
            supabase.table("quotes")
            .update(updates)
            .eq("id", str(quote_id))
            .eq("company_id", old.get("company_id", str(user.active_company_id)))
            .execute()
        )
        if not res.data:
            raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Errore aggiornamento")
        _audit(user, str(quote_id), "update", old=old, new=updates)
        return res.data[0]

    return old


# ── Status transitions ────────────────────────────────────────

def _transition(quote_id: UUID, user: CurrentUser,
                allowed_from: set, new_status: str,
                timestamp_field: Optional[str] = None) -> dict:
    old = _require_quote(quote_id, user, select="status,title,total,company_id")
    if old["status"] not in allowed_from:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"Transizione non consentita da '{old['status']}' a '{new_status}'")
    updates: dict = {"status": new_status}
    if timestamp_field:
        updates[timestamp_field] = datetime.now(timezone.utc).isoformat()
    res = (
        supabase.table("quotes")
        .update(updates)
        .eq("id", str(quote_id))
        .eq("company_id", old.get("company_id", str(user.active_company_id)))
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Errore aggiornamento stato")
    _audit(user, str(quote_id), "update",
           old={"status": old["status"]}, new={"status": new_status})
    return res.data[0]


# ── Pre-flight check before sending a quote ─────────────────

@router.get("/{quote_id}/preflight")
async def preflight_quote(
    quote_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    """
    Checks whether key preconditions are met before sending the quote.
    Returns:
      - user_invited: True if the client email already has a portal user account
      - proforma_data_complete: True if all required fields for auto-proforma are present
      - missing_fields: list of field names that are missing
      - warnings: human-readable warning messages
    """
    q = _require_quote(quote_id, user,
                       select="client_id, onboarding_id")

    warnings: list[str] = []
    missing_fields: list[str] = []
    user_invited = False
    proforma_data_complete = True

    # ── 1. Resolve email from client or onboarding ────────────
    email = None
    client_data = None
    onboarding_data = None

    if q.get("client_id"):
        c_res = supabase.table("clients").select("email,name,vat_number,pec,dest_code,address,city") \
            .eq("id", str(q["client_id"])).maybe_single().execute()
        client_data = c_res.data or {}
        email = client_data.get("email")

    if q.get("onboarding_id"):
        o_res = supabase.table("onboarding").select("email,company_name,vat_number,pec,dest_code,address,city") \
            .eq("id", str(q["onboarding_id"])).maybe_single().execute()
        onboarding_data = o_res.data or {}
        email = email or onboarding_data.get("email")

    # ── 2. Check if user is already invited ───────────────────
    if email:
        try:
            # Check if a user with this email exists in users table
            u_res = supabase.table("users").select("id").eq("email", email).maybe_single().execute()
            user_invited = bool(u_res.data)
        except Exception:
            user_invited = False
    else:
        warnings.append("Nessuna email trovata per il cliente/prospect.")

    if not user_invited:
        warnings.append(
            "L'utente cliente non è ancora stato invitato al portale. "
            "Inviando il preventivo verrà creato automaticamente l'accesso. "
            "Puoi anche inviare prima l'invito dall'onboarding."
        )

    # ── 3. Check proforma required fields ────────────────────
    source = client_data or onboarding_data or {}

    # Always-required individual fields
    for field, label in [("vat_number", "Partita IVA"), ("address", "Indirizzo"), ("city", "Città")]:
        if not source.get(field):
            missing_fields.append(label)

    # PEC or dest_code — at least one is required
    has_pec = bool(source.get("pec"))
    has_sdi = bool(source.get("dest_code") or source.get("sdi_code"))
    if not has_pec and not has_sdi:
        missing_fields.append("PEC o Codice SDI (almeno uno)")

    if missing_fields:
        proforma_data_complete = False
        warnings.append(
            f"Dati obbligatori per la proforma mancanti: {', '.join(missing_fields)}. "
            "Il contratto non partirà in automatico dopo l'accettazione e la proforma non sarà generata automaticamente dopo la firma."
        )

    return {
        "user_invited": user_invited,
        "proforma_data_complete": proforma_data_complete,
        "missing_fields": missing_fields,
        "warnings": warnings,
    }

async def _trigger_contract_on_quote_acceptance(quote_id: UUID, user: CurrentUser, q: dict) -> bool:
    """Helper used to auto-generate and optionally send contracts and update onboarding when Quotes are accepted"""
    client_id = q.get("client_id")
    onboarding_id = _resolve_onboarding_id(q, str(q.get("company_id", user.active_company_id)))
    # Allow contract generation for both clients and prospects
    if not client_id and not onboarding_id:
        return False
        
    res_check = supabase.table("contracts").select("id").eq("quote_id", str(quote_id)).execute()
    if res_check.data:
        return False

    q_full = _require_quote(quote_id, user, select="*, quote_lines(service_id)")
    quote_company = str(q_full["company_id"])
    
    row = {
        "company_id": quote_company,
        "quote_id":   str(quote_id),
        "title":      f"Contratto (da {q_full.get('title', 'Preventivo')})",
        "status":     "draft",
    }
    if client_id:
        row["client_id"] = str(client_id)
    if onboarding_id:
        row["onboarding_id"] = str(onboarding_id)

    tpl_res = supabase.table("document_templates").select("id").eq("company_id", quote_company).eq("type", "contract").limit(1).execute()
    if tpl_res.data:
        row["template_id"] = tpl_res.data[0]["id"]
        
    ctr_res = supabase.table("contracts").insert(row).execute()
    if ctr_res.data:
        ctr = ctr_res.data[0]
        s_ids = {str(ln["service_id"]) for ln in q_full.get("quote_lines", []) if ln.get("service_id")}
        if s_ids:
            cs_rows = [{"contract_id": ctr["id"], "service_id": sid} for sid in s_ids]
            supabase.table("contract_services").insert(cs_rows).execute()

        from modules.activity.router import log_timeline_event
        log_timeline_event(
            company_id=quote_company, actor_user_id=str(user.user_id),
            event_type="system", title="Contratto in bozza generato",
            client_id=str(client_id) if client_id else None, 
            onboarding_id=str(onboarding_id) if onboarding_id else None,
            body=f"Generato automaticamente da accettazione preventivo."
        )

        if onboarding_id:
            from automation import auto_advance_onboarding
            auto_advance_onboarding(quote_company, str(user.user_id), str(onboarding_id), "contract_draft", f"Contratto auto-generato da preventivo {str(quote_id)[:8]}…")

        try:
            return await _auto_compile_and_send_contract(ctr["id"], quote_company, user, onboarding_id)
        except Exception as ctr_exc:
            logger.warning("accept_quote auto-send failed for %s: %s", ctr["id"], ctr_exc)
            
    return False

@router.post("/{quote_id}/accept")
async def accept_quote(quote_id: UUID, user: CurrentUser = Depends(get_current_user)):
    """sent → accepted; auto-advances linked onboarding to quote_accepted, auto-generates contract"""
    # Verify client ownership
    q_check = _require_quote(quote_id, user, select="status,client_id,onboarding_id")
    if not user.is_admin:
        is_client_owner = user.client_id and str(q_check.get("client_id")) == str(user.client_id)
        is_onboarding_owner = user.onboarding_id and str(q_check.get("onboarding_id")) == str(user.onboarding_id)
        if not (is_client_owner or is_onboarding_owner):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Non hai accesso a questo preventivo")

    from automation import auto_advance_onboarding
    q = _transition(quote_id, user, {"sent", "draft"}, "accepted", "accepted_at")

    # Log to Timeline
    from modules.activity.router import log_timeline_event
    log_timeline_event(
        company_id=str(q.get("company_id", user.active_company_id)),
        actor_user_id=str(user.user_id),
        event_type="quote_accepted",
        title=f"Preventivo accettato",
        client_id=q.get("client_id"),
        onboarding_id=q.get("onboarding_id"),
        body=f"Il preventivo è stato accettato."
    )

    # Auto-advance linked onboarding (non-blocking) — resolve even if onboarding_id not on quote
    onboarding_id = _resolve_onboarding_id(q, str(q.get("company_id", user.active_company_id)))
    auto_advance_onboarding(
        company_id=str(q.get("company_id", user.active_company_id)),
        user_id=str(user.user_id),
        onboarding_id=onboarding_id,
        target_status="quote_accepted",
        reason=f"Preventivo {str(quote_id)[:8]}… accettato",
    )

    # ── Auto-generate Contract ─────────────────────────────────
    contract_auto_sent = await _trigger_contract_on_quote_acceptance(quote_id, user, q)

    contract_msg = "Contratto inviato automaticamente." if contract_auto_sent else "Contratto creato in bozza — invialo manualmente."
    return {
        "message": f"Preventivo accettato. {contract_msg}",
        "status": q.get("status"),
        "accepted_at": q.get("accepted_at"),
        "contract_auto_sent": contract_auto_sent,
    }


@router.post("/{quote_id}/send")
async def send_quote_notify(quote_id: UUID, user: CurrentUser = Depends(require_admin)):
    """draft → sent; send email via Brevo and auto-advance linked onboarding"""
    from automation import auto_advance_onboarding
    from integrations.email_service import send_templated_email
    from config import settings

    q_full = _require_quote(quote_id, user, select="*, clients(id, name, email), onboarding!quotes_onboarding_id_fkey(id, email, company_name, reference_name)")
    if q_full["status"] != "draft":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Impossibile inviare: il preventivo è nello stato '{q_full['status']}'")

    client_info = q_full.get("clients") or {}
    onb_info = q_full.get("onboarding") or {}
    recipient_email = client_info.get("email") or onb_info.get("email")
    
    if not recipient_email:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Il cliente non ha un indirizzo email configurato.")
        
    client_name = client_info.get("name") or onb_info.get("company_name") or onb_info.get("reference_name") or "Cliente"
    
    # Fetch quote items to summarize services
    services_summary = "<ul style='margin-top: 5px; margin-bottom: 10px; padding-left: 20px;'>"
    try:
        items_res = supabase.table("quote_items").select("name").eq("quote_id", str(quote_id)).execute()
        if items_res.data:
            for item in items_res.data:
                services_summary += f"<li>{item.get('name', 'Servizio/Prodotto')}</li>"
        else:
            services_summary += "<li>Vedi dettaglio nel portale</li>"
    except Exception as exc:
        logger.warning(f"Failed to fetch quote_items for quote {quote_id}: {exc}")
        services_summary += "<li>Vedi dettaglio nel portale</li>"
    services_summary += "</ul>"


    try:
        frontend_url = getattr(settings, "FRONTEND_URL", "https://crm.delocanova.com")
        
        # --- PUBLIC URL GENERATION ---
        action_link = f"{frontend_url}/public_quote.html?token={quote_id}"
        # ----------------------------

        await send_templated_email(
            company_id=str(q_full.get("company_id", user.active_company_id)),
            to_email=recipient_email,
            template_type="quote_send",
            lang="it",
            variables={
                "client_name": client_name,
                "quote_number": str(q_full.get("id"))[:8].upper(),
                "quote_date": datetime.now(timezone.utc).strftime("%d/%m/%Y"),
                "expiry_date": date.fromisoformat(q_full["valid_until"]).strftime("%d/%m/%Y") if q_full.get("valid_until") else "N/A",
                "total_amount": f"{q_full.get('total', 0.0):.2f}",
                "services_summary": services_summary,
                "client_portal_url": action_link
            },
            client_id=str(q_full["client_id"]) if q_full.get("client_id") else None,
            reference_type="quote",
            reference_id=str(quote_id),
        )
    except Exception as exc:
        logger.error("send_quote_notify: Email sending failed quote=%s: %s", quote_id, exc)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Errore invio email preventivo: {exc}")

    q = _transition(quote_id, user, {"draft"}, "sent", "sent_at")
    
    # Log to Timeline
    from modules.activity.router import log_timeline_event
    log_timeline_event(
        company_id=str(q.get("company_id", user.active_company_id)), actor_user_id=str(user.user_id),
        event_type="quote_sent", title=f"Preventivo inviato via email",
        client_id=q.get("client_id"), onboarding_id=q.get("onboarding_id"),
        body=f"Inviato a {recipient_email}"
    )
    
    onboarding_id = _resolve_onboarding_id(q, str(q.get("company_id", user.active_company_id)))
    auto_advance_onboarding(
        company_id=str(q.get("company_id", user.active_company_id)),
        user_id=str(user.user_id),
        onboarding_id=onboarding_id,
        trigger_event="quote_sent",
        reason=f"Preventivo {str(quote_id)[:8]}… inviato via email",
    )
    return {"message": "Preventivo inviato con successo", "status": q.get("status"), "sent_at": q.get("sent_at")}



@router.post("/{quote_id}/reject")
async def reject_quote(quote_id: UUID, user: CurrentUser = Depends(get_current_user)):
    """sent → rejected"""
    # Verify client ownership
    q = _require_quote(quote_id, user, select="status,client_id,onboarding_id")
    if not user.is_admin:
        is_client_owner = user.client_id and str(q.get("client_id")) == str(user.client_id)
        is_onboarding_owner = user.onboarding_id and str(q.get("onboarding_id")) == str(user.onboarding_id)
        if not (is_client_owner or is_onboarding_owner):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Non hai accesso a questo preventivo")

    q = _transition(quote_id, user, {"sent"}, "rejected", "rejected_at")

    # Log to Timeline
    from modules.activity.router import log_timeline_event
    log_timeline_event(
        company_id=str(q.get("company_id", user.active_company_id)), actor_user_id=str(user.user_id),
        event_type="quote_rejected", title=f"Preventivo rifiutato",
        client_id=q.get("client_id"), onboarding_id=q.get("onboarding_id")
    )

    return {"message": "Preventivo rifiutato", "status": q.get("status")}


@router.post("/{quote_id}/accept-verbal")
async def accept_verbal_quote(quote_id: UUID, user: CurrentUser = Depends(require_admin)):
    # Force management_channel to verbal
    old = _require_quote(quote_id, user, select="company_id")
    supabase.table("quotes").update({
        "management_channel": "verbal"
    }).eq("id", str(quote_id)).eq("company_id", str(old.get("company_id", user.active_company_id))).execute()

    q = _transition(quote_id, user, {"draft", "sent"}, "accepted", "accepted_at")
    
    # Timeline
    from modules.activity.router import log_timeline_event
    log_timeline_event(
        company_id=str(q.get("company_id", user.active_company_id)), actor_user_id=str(user.user_id),
        event_type="quote_accepted", title="Preventivo accettato (Gestione a voce)",
        client_id=q.get("client_id"), onboarding_id=q.get("onboarding_id"),
        body=f"Il preventivo {q.get('number') or q.get('title')} è stato confermato verbalmente."
    )
    
    # Auto-advance
    onbid = _resolve_onboarding_id(q, str(q.get("company_id", user.active_company_id)))
    if onbid:
        from automation import auto_advance_onboarding
        auto_advance_onboarding(str(q.get("company_id", user.active_company_id)), str(user.user_id), onbid, "quote_accepted", "Preventivo accettato verbalmente")
        
    contract_auto_sent = await _trigger_contract_on_quote_acceptance(quote_id, user, q)
    contract_msg = "Contratto inviato automaticamente." if contract_auto_sent else "Contratto creato in bozza — invialo manualmente."

    return {"message": f"Preventivo accettato verbalmente. {contract_msg}", "status": "accepted"}


@router.post("/{quote_id}/expire")
async def expire_quote(quote_id: UUID, user: CurrentUser = Depends(require_admin)):
    """draft | sent → expired"""
    q = _transition(quote_id, user, {"draft", "sent"}, "expired", "expired_at")
    return {"message": "Preventivo scaduto", "status": q.get("status")}

@router.delete("/{quote_id}")
async def delete_quote(quote_id: UUID, user: CurrentUser = Depends(require_admin)):
    """Elimina un preventivo e, se non ne restano altri attivi, retrocede lo stato della pratica."""
    try:
        q = _require_quote(quote_id, user)
        onboarding_id = q.get("onboarding_id")
        client_id = q.get("client_id")
        company_id = q.get("company_id")

        # 1. Delete lines first
        supabase.table("quote_lines").delete().eq("quote_id", str(quote_id)).execute()
        
        # 2. Delete the quote itself
        supabase.table("quotes").delete().eq("id", str(quote_id)).eq("company_id", company_id).execute()

        # 3. Check if onboarding still has other active quotes → if not, revert status
        if onboarding_id:
            remaining = (
                supabase.table("quotes")
                .select("id")
                .eq("onboarding_id", str(onboarding_id))
                .eq("company_id", company_id)
                .in_("status", ["draft", "sent"])
                .execute()
            )
            if not remaining.data:
                # No active quotes left → revert to "quote" (Preventivo in lavorazione)
                onb = supabase.table("onboarding").select("status").eq("id", str(onboarding_id)).single().execute()
                if onb.data and onb.data.get("status") == "quote_sent":
                    supabase.table("onboarding").update({"status": "quote"}).eq("id", str(onboarding_id)).execute()
                    logger.info(f"Onboarding {onboarding_id} reverted to 'quote' after quote deletion")

        return {"message": "Preventivo eliminato"}
    except Exception as e:
        logger.error(f"Error deleting quote {quote_id} - {str(e)}", exc_info=True)
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Errore interno: {str(e)}")




# ── Summary for dashboard / onboarding ───────────────────────

@router.get("/client/{client_id}/summary")
async def client_quotes_summary(client_id: UUID, user: CurrentUser = Depends(require_admin)):
    res = (
        supabase.table("quotes")
        .select("id,title,status,total,currency,valid_until,created_at")
        .eq("company_id", str(user.active_company_id))
        .eq("client_id", str(client_id))
        .order("created_at", desc=True)
        .execute()
    )
    return res.data or []


# ── Public Endpoints (No Auth) ───────────────────────────────────

@router.get("/public/{token}")
async def get_public_quote(token: UUID):
    """Fetch quote details for the public tokenless acceptance page."""
    res = (
        supabase.table("quotes")
        .select("*, quote_lines(*), companies!quotes_company_id_fkey(name, address, vat_number, logo_url), clients(name, company_name), onboarding!quotes_onboarding_id_fkey(company_name, reference_name)")
        .eq("id", str(token))
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Preventivo non trovato")
        
    return res.data


@router.post("/public/{token}/accept")
async def accept_public_quote(token: UUID):
    """Mark a quote as accepted from the public page."""
    from datetime import datetime, timezone
    
    res = supabase.table("quotes").select("*").eq("id", str(token)).single().execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Preventivo non trovato")
    q = res.data
    
    if q["status"] not in ["sent", "draft"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Questo preventivo non può più essere accettato.")
        
    now = datetime.now(timezone.utc).isoformat()
    
    update_res = supabase.table("quotes").update({
        "status": "accepted",
        "accepted_at": now,
        "management_channel": "client_portal"
    }).eq("id", str(token)).execute()
    
    if not update_res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Errore salvataggio")
        
    # Log to Timeline
    from modules.activity.router import log_timeline_event
    log_timeline_event(
        company_id=q.get("company_id"), 
        actor_user_id=None,
        event_type="quote_accepted", 
        title="Preventivo accettato online",
        client_id=q.get("client_id"), 
        onboarding_id=q.get("onboarding_id"),
        body=f"Il preventivo {q.get('number') or q.get('title')} è stato accettato online via link pubblico."
    )
    
    # Auto-advance onboarding if linked
    onbid = q.get("onboarding_id") or None
    if not onbid and q.get("client_id"):
        cres = supabase.table("clients").select("onboarding_id").eq("id", q["client_id"]).execute()
        if cres.data and cres.data[0].get("onboarding_id"):
            onbid = cres.data[0]["onboarding_id"]
            
    if onbid:
        from automation import auto_advance_onboarding
        admin = supabase.table("users").select("id").limit(1).execute()
        system_user = admin.data[0]["id"] if admin.data else None
        if system_user:
            try:
                auto_advance_onboarding(
                    q["company_id"], system_user, str(onbid), 
                    "quote_accepted", "Preventivo accettato online dal prospect"
                )
            except Exception as e:
                logger.error(f"Auto-advance failed on public quote: {e}")

    return {"message": "Preventivo accettato"}


@router.post("/public/{token}/reject")
async def reject_public_quote(token: UUID):
    """Mark a quote as rejected from the public page."""
    from datetime import datetime, timezone
    
    res = supabase.table("quotes").select("*").eq("id", str(token)).single().execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Preventivo non trovato")
    q = res.data
    
    if q["status"] not in ["sent", "draft"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Questo preventivo non può più essere rifiutato.")
        
    now = datetime.now(timezone.utc).isoformat()
    
    update_res = supabase.table("quotes").update({
        "status": "rejected",
        "rejected_at": now
    }).eq("id", str(token)).execute()
    
    from modules.activity.router import log_timeline_event
    log_timeline_event(
        company_id=q.get("company_id"), 
        actor_user_id=None,
        event_type="quote_rejected", 
        title="Preventivo rifiutato online",
        client_id=q.get("client_id"), 
        onboarding_id=q.get("onboarding_id"),
        body=f"Il preventivo {q.get('number') or q.get('title')} è stato declinato dal cliente tramite link pubblico."
    )
    
    return {"message": "Preventivo rifiutato"}
