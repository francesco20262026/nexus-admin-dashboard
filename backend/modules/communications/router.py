"""
modules/communications/router.py — Storico comunicazioni cliente
GET /api/clients/{id}/communications
POST /api/clients/{id}/communications
"""
import logging
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from uuid import UUID
from typing import Optional
from datetime import datetime, timezone

from auth.middleware import require_admin, CurrentUser
from database import supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/clients", tags=["communications"])

_TABLE_MISSING_CODE = "PGRST205"

VALID_CHANNELS   = ("email", "sms", "whatsapp", "phone", "letter", "portal", "other")
VALID_DIRECTIONS = ("outbound", "inbound")
VALID_STATUSES   = ("sent", "failed", "delivered", "opened")

TEMPLATE_LABELS = {
    "contract_send":  "Contratto inviato",
    "quote_send":     "Preventivo inviato",
    "reminder_1":     "Promemoria pagamento #1",
    "reminder_2":     "Promemoria pagamento #2",
    "reminder_3":     "Promemoria pagamento #3",
    "renewal_alert":  "Avviso rinnovo servizio",
    "invoice_send":   "Fattura inviata",
    "proforma_send":  "Proforma inviata",
    "welcome":        "Email benvenuto",
    "portal_access":  "Accesso portale clienti",
    "custom":         "Comunicazione manuale",
}


def _is_table_missing(exc) -> bool:
    msg = str(exc)
    return _TABLE_MISSING_CODE in msg or (
        "client_communications" in msg and "schema cache" in msg
    )


class CommunicationCreate(BaseModel):
    channel:        str = "email"
    direction:      str = "outbound"
    subject:        Optional[str] = None
    body_preview:   Optional[str] = None
    template_type:  Optional[str] = None
    reference_type: Optional[str] = None
    reference_id:   Optional[UUID] = None
    status:         str = "sent"
    sent_at:        Optional[datetime] = None


@router.get("/{client_id}/communications")
async def list_communications(
    client_id: UUID,
    channel: Optional[str] = None,
    limit: int = 100,
    user: CurrentUser = Depends(require_admin),
):
    try:
        q = (
            supabase.table("client_communications")
            .select("*")
            .eq("company_id", str(user.active_company_id))
            .eq("client_id",  str(client_id))
            .order("sent_at",  desc=True)
            .limit(limit)
        )
        if channel:
            q = q.eq("channel", channel)

        res = q.execute()
        rows = res.data or []

        for row in rows:
            tpl = row.get("template_type")
            row["label"] = TEMPLATE_LABELS.get(tpl, tpl or "Comunicazione")

        return rows
    except Exception as exc:
        if _is_table_missing(exc):
            logger.warning("client_communications table not found — migration pending")
            return []
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc))


@router.post("/{client_id}/communications", status_code=status.HTTP_201_CREATED)
async def create_communication(
    client_id: UUID,
    body: CommunicationCreate,
    user: CurrentUser = Depends(require_admin),
):
    if body.channel not in VALID_CHANNELS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            f"channel non valido. Valori: {VALID_CHANNELS}")
    if body.direction not in VALID_DIRECTIONS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            f"direction non valida. Valori: {VALID_DIRECTIONS}")
    if body.status not in VALID_STATUSES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            f"status non valido. Valori: {VALID_STATUSES}")

    row = {
        "company_id":    str(user.active_company_id),
        "client_id":     str(client_id),
        "channel":       body.channel,
        "direction":     body.direction,
        "status":        body.status,
        "template_type": body.template_type or "custom",
        "sent_by":       str(user.user_id),
        "sent_at":       (body.sent_at or datetime.now(timezone.utc)).isoformat(),
    }
    if body.subject:        row["subject"]        = body.subject
    if body.body_preview:   row["body_preview"]   = body.body_preview[:500]
    if body.reference_type: row["reference_type"] = body.reference_type
    if body.reference_id:   row["reference_id"]   = str(body.reference_id)

    res = supabase.table("client_communications").insert(row).execute()
    if not res.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Impossibile creare la comunicazione")

    created = res.data[0]
    tpl = created.get("template_type")
    created["label"] = TEMPLATE_LABELS.get(tpl, tpl or "Comunicazione")
    return created
