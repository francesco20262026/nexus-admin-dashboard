"""
modules/invoices/router.py — Invoices, Proforma, Payment tracking
Phase 3: is_proforma, payment_status, payment_method, payment_proof, onboarding_id
"""
import logging
from fastapi import APIRouter, HTTPException, status, Depends, Query
from pydantic import BaseModel, field_validator
from uuid import UUID
from typing import Optional
from datetime import date, datetime, timezone

from auth.middleware import get_current_user, require_admin, CurrentUser
from database import supabase, safe_single
import os
import uuid
import asyncio
from jinja2 import Environment, FileSystemLoader
from utils.windoc_sync import sync_invoice_to_windoc

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/invoices", tags=["invoices"])

# ── Enums ─────────────────────────────────────────────────────
_PAYMENT_METHODS  = {"bonifico", "rid", "carta"}
_PAYMENT_STATUSES = {"not_paid", "proof_uploaded", "under_review", "paid", "cancelled"}
_INVOICE_STATUSES = {"draft", "sent", "paid", "overdue", "cancelled"}


# ── Schemas ──────────────────────────────────────────────────

class InvoiceCreate(BaseModel):
    client_id:      UUID
    onboarding_id:  Optional[UUID]   = None   # link to onboarding workflow
    contract_id:    Optional[UUID]   = None   # link to origin contract
    supplier_company_id: Optional[UUID] = None # emitting company
    is_proforma:    bool             = False
    number:         Optional[str]    = None
    invoice_number: Optional[str]    = None    # frontend alias
    issue_date:     Optional[date]   = None
    due_date:       Optional[date]   = None
    total:          Optional[float]  = None
    total_amount:   Optional[float]  = None    # frontend alias
    amount:         Optional[float]  = None
    vat_amount:     Optional[float]  = None
    currency:       str              = "EUR"
    payment_method: Optional[str]    = None
    description:    Optional[str]    = None
    notes:          Optional[str]    = None

    @field_validator("payment_method")
    @classmethod
    def validate_payment_method(cls, v):
        if v is not None and v not in _PAYMENT_METHODS:
            raise ValueError(f"payment_method must be one of {sorted(_PAYMENT_METHODS)}")
        return v


class InvoiceUpdate(BaseModel):
    payment_method: Optional[str]   = None
    payment_status: Optional[str]   = None
    onboarding_id:  Optional[UUID]  = None
    contract_id:    Optional[UUID]  = None
    supplier_company_id: Optional[UUID] = None
    due_date:       Optional[date]  = None
    notes:          Optional[str]   = None
    number:         Optional[str]   = None

    @field_validator("payment_method")
    @classmethod
    def validate_payment_method(cls, v):
        if v is not None and v not in _PAYMENT_METHODS:
            raise ValueError(f"payment_method must be one of {sorted(_PAYMENT_METHODS)}")
        return v

    @field_validator("payment_status")
    @classmethod
    def validate_payment_status(cls, v):
        if v is not None and v not in _PAYMENT_STATUSES:
            raise ValueError(f"payment_status must be one of {sorted(_PAYMENT_STATUSES)}")
        return v


class InvoiceLineCreate(BaseModel):
    description: str
    quantity:    float           = 1.0
    unit_price:  float
    vat_rate:    float           = 22.0
    service_id:  Optional[UUID] = None


class MarkPaidRequest(BaseModel):
    paid_at:        Optional[date] = None
    method:         Optional[str]  = None
    reference:      Optional[str]  = None
    notes:          Optional[str]  = None


class ReviewPaymentRequest(BaseModel):
    """Admin: moves payment_status from proof_uploaded → under_review or paid."""
    payment_status: str
    notes:          Optional[str] = None

    @field_validator("payment_status")
    @classmethod
    def validate(cls, v):
        allowed = {"under_review", "paid", "not_paid", "cancelled"}
        if v not in allowed:
            raise ValueError(f"payment_status must be one of {sorted(allowed)}")
        return v


class SubmitProofRequest(BaseModel):
    """Client: submits URL/reference to payment proof document."""
    payment_proof_url: str
    payment_method:    Optional[str] = None

    @field_validator("payment_method")
    @classmethod
    def validate_payment_method(cls, v):
        if v is not None and v not in _PAYMENT_METHODS:
            raise ValueError(f"payment_method must be one of {sorted(_PAYMENT_METHODS)}")
        return v


# ── Helpers ──────────────────────────────────────────────────

def _audit(user: CurrentUser, entity_id: str, action: str,
           old: Optional[dict] = None, new: Optional[dict] = None) -> None:
    try:
        supabase.table("audit_logs").insert({
            "company_id":  str(user.active_company_id),
            "user_id":     str(user.user_id),
            "entity_type": "invoice",
            "entity_id":   entity_id,
            "action":      action,
            "old_values":  old,
            "new_values":  new,
        }).execute()
    except Exception as exc:
        logger.warning("audit_log write failed for invoice %s: %s", entity_id, exc)


def _require_invoice(invoice_id: UUID, user: CurrentUser, select: str = "*") -> dict:
    res = (
        supabase.table("invoices")
        .select(select)
        .eq("id", str(invoice_id))
        .eq("company_id", str(user.active_company_id))
        .maybe_single()
        .execute()
    )
    if res and getattr(res, "data", None):
        return res.data

    if user.is_admin:
        res_any = supabase.table("invoices").select(select).eq("id", str(invoice_id)).maybe_single().execute()
        if res_any and getattr(res_any, "data", None):
            return res_any.data

    raise HTTPException(status.HTTP_404_NOT_FOUND, "Fattura non trovata")


# ── List ─────────────────────────────────────────────────────

@router.get("/")
async def list_invoices(
    status_filter:    Optional[str] = Query(None, alias="status"),
    payment_status:   Optional[str] = Query(None),
    is_proforma:      Optional[bool] = Query(None),
    client_id:        Optional[str] = None,
    onboarding_id:    Optional[str] = None,
    supplier_company_id: Optional[str] = None,
    from_date:        Optional[date] = None,
    to_date:          Optional[date] = None,
    page:             int = Query(1, ge=1),
    page_size:        int = Query(50, ge=1, le=200),
    user: CurrentUser = Depends(get_current_user),
):
    q = supabase.table("invoices").select("*, clients(name, email), contracts(id, title), companies!invoices_supplier_company_id_fkey(name)", count="exact")

    if user.is_admin:
        if supplier_company_id:
            q = q.eq("company_id", str(supplier_company_id))
    else:
        q = q.eq("company_id", str(user.active_company_id))

    if not user.is_admin:
        if not user.client_id:
            return {"data": [], "total": 0, "page": page, "page_size": page_size}
        q = q.eq("client_id", str(user.client_id))

    if status_filter:    q = q.eq("status", status_filter)
    if payment_status:   q = q.eq("payment_status", payment_status)
    if is_proforma is not None: q = q.eq("is_proforma", is_proforma)
    if client_id:        q = q.eq("client_id", str(client_id))
    if onboarding_id:    q = q.eq("onboarding_id", str(onboarding_id))
    if from_date:        q = q.gte("due_date", from_date.isoformat())
    if to_date:          q = q.lte("due_date", to_date.isoformat())

    offset = (page - 1) * page_size
    res = q.order("due_date", desc=True).range(offset, offset + page_size - 1).execute()
    return {"data": res.data or [], "total": res.count or 0, "page": page, "page_size": page_size}


# ── Create ────────────────────────────────────────────────────

@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_invoice(
    body: InvoiceCreate,
    lines: list[InvoiceLineCreate] = [],
    user: CurrentUser = Depends(require_admin),
):
    effective_total = body.total or body.total_amount or body.amount
    if effective_total is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            "Importo obbligatorio (campo 'total' o 'total_amount')")

    row = {
        "client_id":      str(body.client_id),
        "company_id":     str(user.active_company_id),
        "onboarding_id":  str(body.onboarding_id) if body.onboarding_id else None,
        "contract_id":    str(body.contract_id) if body.contract_id else None,
        "supplier_company_id": str(body.supplier_company_id) if body.supplier_company_id else None,
        "is_proforma":    body.is_proforma,
        "status":         "draft",
        "payment_status": "not_paid",
        "payment_method": body.payment_method,
        "total":          effective_total,
        "amount":         body.amount,
        "vat_amount":     body.vat_amount,
        "currency":       body.currency,
        "number":         body.number or body.invoice_number,
        "issue_date":     body.issue_date.isoformat() if body.issue_date else None,
        "due_date":       body.due_date.isoformat() if body.due_date else None,
        "notes":          body.notes or body.description,
    }
    res = supabase.table("invoices").insert(row).execute()
    if not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Errore nella creazione")
    inv = res.data[0]

    if lines:
        line_rows = [
            {
                "invoice_id":  inv["id"],
                "description": ln.description,
                "quantity":    ln.quantity,
                "unit_price":  ln.unit_price,
                "vat_rate":    ln.vat_rate,
                "total":       round(ln.quantity * ln.unit_price * (1 + ln.vat_rate / 100.0), 2),
                "service_id":  str(ln.service_id) if ln.service_id else None,
            }
            for ln in lines
        ]
        supabase.table("invoice_lines").insert(line_rows).execute()

    _audit(user, inv["id"], "create", new={
        "is_proforma": inv.get("is_proforma"),
        "total": inv.get("total"),
        "client_id": inv.get("client_id"),
    })

    # Log to Timeline
    from modules.activity.router import log_timeline_event
    doc_type = "Proforma" if inv.get("is_proforma") else "Fattura"
    log_timeline_event(
        company_id=str(user.active_company_id), actor_user_id=str(user.user_id),
        event_type="invoice_issued", title=f"{doc_type} creata in bozza",
        client_id=inv.get("client_id"), onboarding_id=inv.get("onboarding_id"),
        body=inv.get("number") or str(inv["id"])[:8]
    )

    return inv


# ── Generate Proforma (PDF) ──────────────────────────────────

@router.post("/proforma/generate/{onboarding_id}", status_code=status.HTTP_201_CREATED)
async def generate_proforma(
    onboarding_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    """
    Genera un PDF Proforma per un onboarding, calcolando i dati completi Cliente/Azienda,
    e salva il PDF nello Storage Supabase.
    """
    try:
        from weasyprint import HTML
    except OSError as e:
        logger.error(f"WeasyPrint errore (GTK+ mancante?): {e}")
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "Librerie grafiche mancanti sul server per la generazione PDF. "
            "Su Windows è necessario installare GTK3 per WeasyPrint."
        )

    # 1. Recupera Onboarding
    q_onb = (
        supabase.table("onboarding")
        .select("*, clients(id, name, address, city, zip_code, province, country, vat_number, pec, dest_code)")
        .eq("id", str(onboarding_id))
        .eq("company_id", str(user.active_company_id))
        .maybe_single()
    )
    onb = safe_single(q_onb).data
    if not onb:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Onboarding non trovato")

    client_data = onb.get("clients", {})
    if not client_data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cliente non associato all'onboarding")

    # 2. Recupera Dati Azienda (per Header e Banca)
    q_comp = supabase.table("companies").select("*").eq("id", str(user.active_company_id)).maybe_single()
    company_data = safe_single(q_comp).data
    if not company_data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dati Azienda non trovati")
    
    # Check campi minimi
    if not company_data.get("vat_number") or not company_data.get("iban"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "L'Azienda deve avere P.IVA e IBAN configurati prima di emettere una proforma.")

    # 3. Numero progressivo Proforma
    year = datetime.now().year
    q_count = (
        supabase.table("invoices")
        .select("id", count="exact")
        .eq("company_id", str(user.active_company_id))
        .eq("is_proforma", True)
        .gte("issue_date", f"{year}-01-01")
        .execute()
    )
    count = q_count.count or 0
    invoice_number = f"{count + 1} del {year}"

    # 4. Prepara righe (mock da Onboarding)
    items = [{
        "code": "SRV",
        "description": onb.get("service_interest") or "Servizio",
        "notes": onb.get("notes") or "",
        "quantity": 1,
        "unit_price": onb.get("estimated_value") or 0.0,
        "total": onb.get("estimated_value") or 0.0
    }]
    total = sum(i["total"] for i in items)

    # 5. Template e Render
    env = Environment(loader=FileSystemLoader("templates"))
    # Fail gracefully se manca il template
    try:
        template = env.get_template("proforma.html")
    except Exception as e:
        logger.error(f"Template proforma mancante: {e}")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Template proforma HTML mancante.")
        
    template_data = {
        "invoice_number": invoice_number,
        "issue_date": datetime.now().strftime("%d/%m/%Y"),
        "company": company_data,
        "company_logo": company_data.get("logo_url") or "",
        "client": client_data,
        "items": items,
        "total": total
    }
    
    html_out = template.render(**template_data)

    # 6. WeasyPrint -> PDF Byte
    try:
        pdf_bytes = HTML(string=html_out).write_pdf()
    except Exception as e:
        logger.error(f"Errore WeasyPrint write_pdf: {e}")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Errore salvataggio PDF con WeasyPrint: {e}")

    # 7. Upload to Supabase
    file_name = f"proforma_{user.active_company_id}_{onboarding_id}_{uuid.uuid4().hex[:8]}.pdf"
    
    try:
        supabase.storage.from_("documents").upload(
            file_name,
            pdf_bytes,
            {"content-type": "application/pdf"}
        )
        file_url = supabase.storage.from_("documents").get_public_url(file_name)
    except Exception as e:
        logger.error(f"Errore caricamento PDF su bucket: {e}")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Impossibile caricare il PDF generato su Supabase Storage.")

    # 8. Record in tabella Invoices
    inv_data = {
        "company_id": str(user.active_company_id),
        "client_id": client_data.get("id"),
        "onboarding_id": str(onboarding_id),
        "is_proforma": True,
        "number": invoice_number,
        "issue_date": datetime.now().strftime("%Y-%m-%d"),
        "due_date": datetime.now().strftime("%Y-%m-%d"),
        "amount": total,
        "vat_amount": 0,
        "total": total,
        "currency": "EUR",
        "status": "sent",  # Sent as placeholder for generic 'emitted'
        "payment_status": "not_paid",
        "document_url": file_url
    }
    
    res_inv = supabase.table("invoices").insert(inv_data).execute()
    
    if res_inv.data:
        new_inv_id = res_inv.data[0]["id"]
        _audit(user, new_inv_id, "proforma_generated", new={"document_url": file_url})
        
        # Log to Timeline
        from modules.activity.router import log_timeline_event
        log_timeline_event(
            company_id=str(user.active_company_id), actor_user_id=str(user.user_id),
            event_type="invoice_issued", title="Proforma PDF generata",
            client_id=client_data.get("id"), onboarding_id=str(onboarding_id),
            body=invoice_number
        )
        
        # 9. Update status on Onboarding (as requested in Phase 3/4 flow)
        supabase.table("onboarding").update({
            "status": "proforma_generated"
        }).eq("id", str(onboarding_id)).execute()
        
        return res_inv.data[0]
    else:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Errore durante il salvataggio del record fattura.")

# ── Overdue ───────────────────────────────────────────────────

@router.get("/overdue")
async def get_overdue(user: CurrentUser = Depends(require_admin)):
    res = (
        supabase.table("invoices")
        .select("*, clients(name,email)")
        .eq("company_id", str(user.active_company_id))
        .eq("status", "overdue")
        .order("due_date")
        .execute()
    )
    return res.data or []


@router.get("/report")
async def payment_report(
    from_date: Optional[date] = None,
    to_date:   Optional[date] = None,
    user: CurrentUser = Depends(require_admin),
):
    q = (
        supabase.table("invoices")
        .select("status,payment_status,is_proforma,total,currency")
        .eq("company_id", str(user.active_company_id))
    )
    if from_date: q = q.gte("issue_date", from_date.isoformat())
    if to_date:   q = q.lte("issue_date", to_date.isoformat())

    rows = q.execute().data or []
    summary = {
        "total_invoiced": 0.0, "total_paid": 0.0,
        "total_overdue": 0.0,  "total_proforma": 0.0,
        "awaiting_payment": 0.0, "count": len(rows),
    }
    for r in rows:
        t = float(r.get("total") or 0)
        if r.get("is_proforma"):
            summary["total_proforma"] += t
        else:
            summary["total_invoiced"] += t
        ps = r.get("payment_status", "not_paid")
        if ps == "paid":
            summary["total_paid"] += t
        elif ps in ("not_paid", "proof_uploaded", "under_review"):
            summary["awaiting_payment"] += t
        if r.get("status") in ("overdue",):
            summary["total_overdue"] += t
    return summary


# ── Get ───────────────────────────────────────────────────────

@router.get("/{invoice_id}")
async def get_invoice(invoice_id: UUID, user: CurrentUser = Depends(get_current_user)):
    if not user.is_admin and not user.client_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN)

    res = (
        supabase.table("invoices")
        .select("*, invoice_lines(*), clients(name,email)")
        .eq("id", str(invoice_id))
        .eq("company_id", str(user.active_company_id))
        .maybe_single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if not user.is_admin and str(user.client_id) != str(res.data.get("client_id")):
        raise HTTPException(status.HTTP_403_FORBIDDEN)
    return res.data


# ── Update (admin) ────────────────────────────────────────────

@router.put("/{invoice_id}")
async def update_invoice(
    invoice_id: UUID,
    body: InvoiceUpdate,
    user: CurrentUser = Depends(require_admin),
):
    old = _require_invoice(invoice_id, user, select="status,payment_status")
    updates = body.model_dump(exclude_none=True)
    if not updates:
        return old
    if "onboarding_id" in updates and updates["onboarding_id"]:
        updates["onboarding_id"] = str(updates["onboarding_id"])
    if "contract_id" in updates and updates["contract_id"]:
        updates["contract_id"] = str(updates["contract_id"])
    if "supplier_company_id" in updates and updates["supplier_company_id"]:
        updates["supplier_company_id"] = str(updates["supplier_company_id"])

    res = (
        supabase.table("invoices")
        .update(updates)
        .eq("id", str(invoice_id))
        .eq("company_id", str(user.active_company_id))
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Errore aggiornamento")
    _audit(user, str(invoice_id), "update", old=old, new=updates)
    return res.data[0]


# ── Mark Paid (admin) ─────────────────────────────────────────

@router.post("/{invoice_id}/mark-paid")
async def mark_paid(
    invoice_id: UUID,
    body: MarkPaidRequest,
    user: CurrentUser = Depends(require_admin),
):
    old = _require_invoice(invoice_id, user, select="status,payment_status,total,currency")
    paid_at = body.paid_at.isoformat() if body.paid_at else datetime.now(timezone.utc).isoformat()

    res = (
        supabase.table("invoices")
        .update({"status": "paid", "paid_at": paid_at, "payment_status": "paid"})
        .eq("id", str(invoice_id))
        .eq("company_id", str(user.active_company_id))
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND)

    try:
        supabase.table("payment_logs").insert({
            "invoice_id": str(invoice_id),
            "company_id": str(user.active_company_id),
            "amount":     old.get("total"),
            "currency":   old.get("currency", "EUR"),
            "paid_at":    paid_at,
            "method":     body.method,
            "reference":  body.reference,
            "notes":      body.notes,
            "created_by": str(user.user_id),
        }).execute()
    except Exception as exc:
        logger.warning("payment_logs insert failed for invoice %s: %s", invoice_id, exc)

    _audit(user, str(invoice_id), "mark_paid",
           old={"status": old.get("status"), "payment_status": old.get("payment_status")},
           new={"status": "paid", "payment_status": "paid", "paid_at": paid_at})
           
    # Sincronizza automaticamente con Winddoc se è una Proforma pagata
    inv_full = _require_invoice(invoice_id, user, select="is_proforma,onboarding_id,client_id")
    
    # Log to Timeline
    from modules.activity.router import log_timeline_event
    log_timeline_event(
        company_id=str(user.active_company_id), actor_user_id=str(user.user_id),
        event_type="payment_confirmed", title="Pagamento registrato manualmente",
        client_id=inv_full.get("client_id"), onboarding_id=inv_full.get("onboarding_id"),
        body=f"Importo: {old.get('total')} {old.get('currency', 'EUR')}"
    )

    is_proforma = inv_full.get("is_proforma", False)
    if is_proforma:
        # Sync invoice to Windoc (background, non-blocking)
        asyncio.create_task(sync_invoice_to_windoc(supabase, str(invoice_id), str(user.active_company_id)))

        # Auto-convert onboarding → client (non-blocking)
        try:
            from automation import auto_convert_onboarding_to_client
            onboarding_id = inv_full.get("onboarding_id")
            if not onboarding_id and inv_full.get("client_id"):
                # Try to find the linked onboarding from client_id
                onb_res = supabase.table("onboarding").select("id").eq("client_id", str(inv_full["client_id"])).not_.in_("status", ["converted_to_client", "abandoned"]).order("created_at", desc=True).limit(1).execute()
                if onb_res.data:
                    onboarding_id = onb_res.data[0]["id"]
            if onboarding_id:
                auto_convert_onboarding_to_client(
                    company_id=str(user.active_company_id),
                    user_id=str(user.user_id),
                    onboarding_id=str(onboarding_id),
                    invoice_id=str(invoice_id),
                )
        except Exception as conv_exc:
            logger.warning("mark_paid: auto_convert_onboarding failed for invoice %s: %s", invoice_id, conv_exc)

    return res.data[0]

# ── Sync Winddoc (esplicito dal frontend) ────────────────────

@router.post("/{invoice_id}/windoc-sync")
async def manual_sync_windoc(
    invoice_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    """
    Forza la sincronizzazione della fattura con Winddoc (es. per fatture già pagate).
    Restituisce i dati della fattura remota o solleva errore se manca config/fallisce.
    """
    res = await sync_invoice_to_windoc(supabase, str(invoice_id), str(user.active_company_id))
    if not res.get("success"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, res.get("error") or "Errore di sincro Winddoc.")
    return res


# ── Review Payment (admin) ────────────────────────────────────

@router.post("/{invoice_id}/review-payment")
async def review_payment(
    invoice_id: UUID,
    body: ReviewPaymentRequest,
    user: CurrentUser = Depends(require_admin),
):
    """
    Admin moves payment_status forward:
    proof_uploaded → under_review → paid (or back to not_paid / cancelled)
    When set to 'paid', also marks invoice status as 'paid'.
    """
    old = _require_invoice(invoice_id, user, select="payment_status,status,total,currency")

    updates: dict = {"payment_status": body.payment_status}
    if body.payment_status == "paid":
        updates["status"] = "paid"
        updates["paid_at"] = datetime.now(timezone.utc).isoformat()

    res = (
        supabase.table("invoices")
        .update(updates)
        .eq("id", str(invoice_id))
        .eq("company_id", str(user.active_company_id))
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Errore aggiornamento")

    # Write payment_log on confirmation
    if body.payment_status == "paid":
        try:
            supabase.table("payment_logs").insert({
                "invoice_id": str(invoice_id),
                "company_id": str(user.active_company_id),
                "amount":     old.get("total"),
                "currency":   old.get("currency", "EUR"),
                "paid_at":    updates["paid_at"],
                "notes":      body.notes,
                "created_by": str(user.user_id),
            }).execute()
        except Exception as exc:
            logger.warning("payment_logs insert failed: %s", exc)

    _audit(user, str(invoice_id), "update",
           old={"payment_status": old.get("payment_status")},
           new=updates)

    # Note: paid → conversion must be manual via /convert (intentional — admin review required)
    
    # Sincronizza automaticamente con Winddoc se diventa pagata
    if body.payment_status == "paid":
        # Check se è proforma
        pr_chk = supabase.table("invoices").select("is_proforma").eq("id", str(invoice_id)).maybe_single().execute()
        if pr_chk.data and pr_chk.data.get("is_proforma"):
            asyncio.create_task(sync_invoice_to_windoc(supabase, str(invoice_id), str(user.active_company_id)))

    # Auto-advance onboarding based on payment state
    from automation import auto_advance_onboarding
    onb_res = supabase.table("invoices").select("onboarding_id").eq("id", str(invoice_id)).maybe_single().execute()
    onboarding_id = (onb_res.data or {}).get("onboarding_id")

    if body.payment_status == "under_review":
        auto_advance_onboarding(
            company_id=str(user.active_company_id),
            user_id=str(user.user_id),
            onboarding_id=onboarding_id,
            target_status="payment_under_review",
            reason=f"Pagamento in verifica su fattura {str(invoice_id)[:8]}…",
        )
    # Note: paid → conversion must be manual via /convert (intentional — admin review required)

    return res.data[0]


@router.post("/{invoice_id}/confirm-and-sync")
async def confirm_payment_and_sync(
    invoice_id: UUID,
    body: ReviewPaymentRequest,
    user: CurrentUser = Depends(require_admin),
):
    """
    Sincrono: Conferma il pagamento (imposta su 'paid') e chiama SUBITO Windoc.
    Se Windoc fallisce, il pagamento RESTA confermato ma la fattura non ha windoc_id.
    L'utente potrà riprovare la sync.
    Restituisce lo stato dell'operazione Windoc affinché la UI lo mostri subito.
    """
    if body.payment_status != "paid":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Questo endpoint è solo per la conferma del pagamento (paid).")
        
    old = _require_invoice(invoice_id, user, select="payment_status,status,total,currency,is_proforma,client_id,onboarding_id")

    # 1. Segna come pagata
    updates = {
        "payment_status": "paid",
        "status": "paid",
        "paid_at": datetime.now(timezone.utc).isoformat()
    }
    
    res = (
        supabase.table("invoices")
        .update(updates)
        .eq("id", str(invoice_id))
        .eq("company_id", str(user.active_company_id))
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Errore aggiornamento stato pagamento")

    # Scrivi log pagamento
    try:
        supabase.table("payment_logs").insert({
            "invoice_id": str(invoice_id),
            "company_id": str(user.active_company_id),
            "amount":     old.get("total"),
            "currency":   old.get("currency", "EUR"),
            "paid_at":    updates["paid_at"],
            "notes":      body.notes,
            "created_by": str(user.user_id),
        }).execute()
    except Exception as exc:
        logger.warning("payment_logs insert failed: %s", exc)

    _audit(user, str(invoice_id), "payment_confirmed",
           old={"payment_status": old.get("payment_status")},
           new=updates)

    # Log to Timeline
    from modules.activity.router import log_timeline_event
    log_timeline_event(
        company_id=str(user.active_company_id), actor_user_id=str(user.user_id),
        event_type="payment_confirmed", title="Pagamento confermato (e sincronizzato automaticamente con Windoc se Proforma)",
        client_id=old.get("client_id"), onboarding_id=old.get("onboarding_id"),
        body=f"Importo: {old.get('total')} {old.get('currency', 'EUR')}"
    )

    # 2. Sincronizza con Windoc in modo sincrono se proforma
    windoc_res = {"success": False, "message": "Non è una proforma"}
    if old.get("is_proforma"):
        windoc_res = await sync_invoice_to_windoc(supabase, str(invoice_id), str(user.active_company_id))

    return {
        "invoice": res.data[0],
        "windoc": windoc_res
    }

# ── Submit Payment Proof (client or admin) ────────────────────

@router.post("/{invoice_id}/submit-proof")
async def submit_payment_proof(
    invoice_id: UUID,
    body: SubmitProofRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """
    Client uploads/references payment proof.
    Sets payment_status → 'proof_uploaded'.
    Admin can also call this to attach a proof reference.
    """
    inv = _require_invoice(invoice_id, user,
                           select="client_id,onboarding_id,payment_status,status")

    if not user.is_admin and str(user.client_id) != str(inv.get("client_id")):
        raise HTTPException(status.HTTP_403_FORBIDDEN)

    if inv.get("payment_status") == "paid":
        return {"message": "Fattura già pagata", "payment_status": "paid"}

    updates: dict = {
        "payment_status":             "proof_uploaded",
        "payment_proof_url":          body.payment_proof_url,
        "payment_proof_uploaded_at":  datetime.now(timezone.utc).isoformat(),
    }
    if body.payment_method:
        updates["payment_method"] = body.payment_method

    res = (
        supabase.table("invoices")
        .update(updates)
        .eq("id", str(invoice_id))
        .eq("company_id", str(user.active_company_id))
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Errore aggiornamento")

    _audit(user, str(invoice_id), "update",
           old={"payment_status": inv.get("payment_status")},
           new={"payment_status": "proof_uploaded"})
           
    # Log to Timeline
    from modules.activity.router import log_timeline_event
    log_timeline_event(
        company_id=str(user.active_company_id), actor_user_id=str(user.user_id),
        event_type="payment_proof_uploaded", title="Ricevuta di pagamento allegata / caricata al portale",
        client_id=inv.get("client_id"), onboarding_id=inv.get("onboarding_id")
    )
    return {
        "message": "Prova di pagamento registrata. Un operatore verificherà a breve.",
        "payment_status": "proof_uploaded",
    }


# ── Mark Pending (client self-declare, no file) ───────────────

@router.post("/{invoice_id}/mark-pending-payment")
async def mark_pending_payment(
    invoice_id: UUID,
    user: CurrentUser = Depends(get_current_user),
):
    """Client declares they sent the bank transfer (no file attached)."""
    inv = _require_invoice(invoice_id, str(user.active_company_id),
                           select="client_id,onboarding_id,payment_status")

    if not user.is_admin and str(user.client_id) != str(inv.get("client_id")):
        raise HTTPException(status.HTTP_403_FORBIDDEN)

    if inv.get("payment_status") in {"paid", "under_review", "proof_uploaded"}:
        return {"message": f"Stato attuale: {inv.get('payment_status')}", "payment_status": inv.get("payment_status")}

    res = (
        supabase.table("invoices")
        .update({"payment_status": "proof_uploaded"})
        .eq("id", str(invoice_id))
        .eq("company_id", str(user.active_company_id))
        .execute()
    )
    _audit(user, str(invoice_id), "update",
           old={"payment_status": inv.get("payment_status")},
           new={"payment_status": "proof_uploaded"})

    # Log to Timeline
    from modules.activity.router import log_timeline_event
    log_timeline_event(
        company_id=str(user.active_company_id), actor_user_id=str(user.user_id),
        event_type="payment_proof_uploaded", title="Il cliente ha dichiarato di aver pagato",
        client_id=inv.get("client_id"), onboarding_id=inv.get("onboarding_id")
    )

    return {"message": "Segnalato pagamento. In attesa di verifica.", "payment_status": "proof_uploaded"}


# ── Payment Info (client) ─────────────────────────────────────

@router.get("/{invoice_id}/payment-info")
async def get_payment_info(
    invoice_id: UUID,
    user: CurrentUser = Depends(get_current_user),
):
    inv = _require_invoice(invoice_id, str(user.active_company_id),
                           select="id,total,currency,client_id,number,company_id,payment_method,payment_status,is_proforma,payment_reference")

    if not user.is_admin and str(user.client_id) != str(inv.get("client_id")):
        raise HTTPException(status.HTTP_403_FORBIDDEN)

    comp_res = (
        supabase.table("companies")
        .select("name,settings")
        .eq("id", str(inv["company_id"]))
        .maybe_single()
        .execute()
    )
    comp     = comp_res.data or {}
    settings = comp.get("settings") or {}
    iban     = settings.get("iban") or ""

    short_id  = str(invoice_id).split("-")[0].upper()
    reference = inv.get("payment_reference") or f"{'PRF' if inv.get('is_proforma') else 'INV'}-{short_id}"

    if not inv.get("payment_reference"):
        try:
            supabase.table("invoices").update({"payment_reference": reference}).eq("id", str(invoice_id)).eq("company_id", str(inv["company_id"])).execute()
        except Exception as exc:
            logger.warning("Failed to persist payment_reference for invoice %s: %s", invoice_id, exc)

    return {
        "amount":           inv.get("total"),
        "currency":         inv.get("currency") or "EUR",
        "iban":             iban,
        "beneficiary":      comp.get("name") or "",
        "reference":        reference,
        "invoice_number":   inv.get("number") or reference,
        "is_proforma":      inv.get("is_proforma", False),
        "payment_method":   inv.get("payment_method"),
        "payment_status":   inv.get("payment_status", "not_paid"),
        "iban_configured":  bool(iban),
    }


# ── Send Reminder ─────────────────────────────────────────────

@router.post("/{invoice_id}/send-reminder")
async def send_manual_reminder(
    invoice_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    from integrations.email_service import send_reminder_email
    inv = (
        supabase.table("invoices")
        .select("*, clients(name,email,lang)")
        .eq("id", str(invoice_id))
        .eq("company_id", str(user.active_company_id))
        .maybe_single()
        .execute()
    ).data
    if not inv:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    await send_reminder_email(inv, company_id=str(user.active_company_id), level=1)
    _audit(user, str(invoice_id), "send")
    return {"message": "Reminder sent"}


# ── Windoc integrations ───────────────────────────────────────

@router.post("/{invoice_id}/push-windoc")
async def push_invoice_windoc(invoice_id: UUID, user: CurrentUser = Depends(require_admin)):
    _require_invoice(invoice_id, str(user.active_company_id), select="id")
    from integrations.windoc import push_invoice_to_windoc
    try:
        data = await push_invoice_to_windoc(str(invoice_id), str(user.active_company_id))
        return {"success": True, "windoc_data": data}
    except Exception as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))


@router.get("/{invoice_id}/windoc-status")
async def get_invoice_windoc_status(invoice_id: UUID, user: CurrentUser = Depends(require_admin)):
    inv = _require_invoice(invoice_id, str(user.active_company_id), select="windoc_id")
    if not inv.get("windoc_id"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Fattura non ancora sincronizzata su WindDoc")
    from integrations.windoc import get_invoice_status
    try:
        data = await get_invoice_status(inv["windoc_id"], str(user.active_company_id))
        return {"success": True, "windoc_data": data}
    except Exception as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))

# ── Delete ────────────────────────────────────────────────────

@router.delete("/{invoice_id}")
async def delete_invoice(
    invoice_id: UUID,
    user: CurrentUser = Depends(require_admin),
):
    """
    Elimina una fattura o proforma e opzionalmente le righe collegate se on-delete-cascade non è impostato.
    """
    old = _require_invoice(invoice_id, str(user.active_company_id), select="id,number,status")
    
    # Try deleting invoice lines first just in case
    supabase.table("invoice_lines").delete().eq("invoice_id", str(invoice_id)).execute()
    
    res = (
        supabase.table("invoices")
        .delete()
        .eq("id", str(invoice_id))
        .eq("company_id", str(user.active_company_id))
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Errore eliminazione")
        
    _audit(user, str(invoice_id), "delete", old=old)
    return {"message": "Fattura eliminata con successo"}
