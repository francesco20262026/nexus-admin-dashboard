"""
integrations/windoc.py — Windoc REST API client
Bridge between Nexus CRM and WindDoc using Token App + Token authentication.
This module is a pure service/integration layer — no HTTP, no router concerns.
"""
import logging
from datetime import datetime, timezone

import httpx

from database import supabase

logger = logging.getLogger(__name__)

WINDDOC_API_URL = "https://api.winddoc.com/v1"
HTTP_TIMEOUT    = 20   # seconds — single consistent value


# ── Config / Auth ─────────────────────────────────────────────

async def _get_windoc_config(company_id: str) -> dict:
    """Fetch active Windoc credentials from integrations table."""
    res = (
        supabase.table("integrations")
        .select("config")
        .eq("company_id", company_id)
        .eq("type", "windoc")
        .eq("is_active", True)
        .maybe_single()
        .execute()
    )
    if not res.data:
        raise ValueError(f"Windoc integration non configurata per l'azienda {company_id}")
    return res.data["config"] or {}


def _get_headers(config: dict) -> dict:
    token_app = config.get("token_app", "").strip()
    token     = config.get("token", "").strip()
    if not token_app or not token:
        raise ValueError("Token applicazione o Token utente WindDoc mancanti dalla configurazione")
    return {
        "Authorization": f"Token {token_app}:{token}",
        "Content-Type":  "application/json",
        "Accept":        "application/json",
    }


def _update_last_sync(company_id: str) -> None:
    """Non-blocking update of last_sync_at on the integration row."""
    try:
        supabase.table("integrations").update({
            "last_sync_at": datetime.now(timezone.utc).isoformat(),
        }).eq("company_id", company_id).eq("type", "windoc").execute()
    except Exception as exc:
        logger.warning("Failed to update windoc last_sync_at for company %s: %s", company_id, exc)


def _audit(company_id: str, entity_id: str, action: str, new_values: dict) -> None:
    """Non-blocking audit log write."""
    try:
        supabase.table("audit_logs").insert({
            "company_id":  company_id,
            "entity_type": "invoice",
            "entity_id":   entity_id,
            "action":      action,
            "new_values":  new_values,
        }).execute()
    except Exception as exc:
        logger.warning("audit_log write failed for windoc action %s entity %s: %s", action, entity_id, exc)


# ── Clients (Rubrica) ─────────────────────────────────────────

def map_nexus_client_to_windoc_payload(nexus_client: dict) -> dict:
    """Map local Client model to WindDoc Rubrica API payload."""
    name = (nexus_client.get("name") or "").strip()
    if not name:
        raise ValueError("Il cliente deve avere una Ragione Sociale (nome) valida.")
    return {
        "ragione_sociale":      name,
        "partita_iva":          nexus_client.get("vat_number") or "",
        "codice_fiscale":       nexus_client.get("tax_code") or "",
        "email":                nexus_client.get("email") or "",
        "pec":                  nexus_client.get("pec") or "",
        "codice_destinatario":  nexus_client.get("dest_code") or "",
        "indirizzo":            nexus_client.get("address") or "",
        "citta":                nexus_client.get("city") or "",
    }


async def sync_client_to_windoc(nexus_client_id: str, company_id: str) -> dict:
    """Create or update a client in WindDoc Rubrica. Returns the Windoc response dict."""
    config  = await _get_windoc_config(company_id)
    headers = _get_headers(config)

    # Fetch Nexus client — scoped to company
    res = (
        supabase.table("clients")
        .select("*")
        .eq("id", nexus_client_id)
        .eq("company_id", company_id)
        .maybe_single()
        .execute()
    )
    client = res.data
    if not client:
        raise ValueError("Client non trovato o non autorizzato")

    payload   = map_nexus_client_to_windoc_payload(client)
    windoc_id = client.get("windoc_id")

    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as http:
        if windoc_id:
            logger.info("Windoc: updating client windoc_id=%s", windoc_id)
            resp = await http.put(f"{WINDDOC_API_URL}/clients/{windoc_id}", json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
        else:
            logger.info("Windoc: creating client nexus_id=%s", nexus_client_id)
            resp = await http.post(f"{WINDDOC_API_URL}/clients", json=payload, headers=headers)
            try:
                resp.raise_for_status()
                data = resp.json()
            except httpx.HTTPStatusError as exc:
                # Conflict resolution: link an existing Windoc record by VAT number
                if exc.response.status_code in (400, 409) and payload.get("partita_iva"):
                    logger.warning("Windoc create conflict — attempting VAT lookup for %s", payload["partita_iva"])
                    search_resp = await http.get(
                        f"{WINDDOC_API_URL}/clients",
                        params={"search": payload["partita_iva"]},
                        headers=headers,
                    )
                    results = search_resp.json().get("data") if search_resp.status_code == 200 else []
                    if results:
                        existing_id = results[0]["id"]
                        logger.info("Windoc: auto-linking duplicate client windoc_id=%s", existing_id)
                        put_resp = await http.put(
                            f"{WINDDOC_API_URL}/clients/{existing_id}",
                            json=payload,
                            headers=headers,
                        )
                        put_resp.raise_for_status()
                        data = put_resp.json()
                        data["id"] = existing_id
                    else:
                        raise ValueError(f"Server remoto ha rifiutato l'inserimento: {exc.response.text}")
                else:
                    raise ValueError(f"Errore di sincronizzazione Windoc: {exc.response.text}")

    new_windoc_id = str(data.get("id") or windoc_id or "")
    if new_windoc_id and new_windoc_id != str(windoc_id or ""):
        try:
            supabase.table("clients").update({"windoc_id": new_windoc_id}).eq("id", nexus_client_id).eq("company_id", company_id).execute()
        except Exception as exc:
            logger.warning("Failed to persist windoc_id for client %s: %s", nexus_client_id, exc)

    _update_last_sync(company_id)
    return data


# ── Invoices (Fatture) ────────────────────────────────────────

def map_nexus_invoice_to_windoc_payload(invoice: dict, windoc_client_id: str, lines: list) -> dict:
    """Map local Invoice to WindDoc Fatture API payload."""
    if not lines:
        logger.warning("Windoc invoice push: no lines for invoice %s", invoice.get("id"))
    return {
        "cliente_id": windoc_client_id,
        "data":       invoice.get("issue_date") or "",
        "scadenza":   invoice.get("due_date") or "",
        "righe": [
            {
                "titolo":       (r.get("description") or "Servizio")[:100],
                "quantita":     float(r.get("quantity") or 1.0),
                "prezzo_netto": float(r.get("unit_price") or 0.0),
                "iva":          int(float(r.get("vat_rate") or 22)),
            }
            for r in lines
        ],
    }


async def push_invoice_to_windoc(nexus_invoice_id: str, company_id: str) -> dict:
    """Push an invoice to WindDoc, linking it to the WindDoc client."""
    config  = await _get_windoc_config(company_id)
    headers = _get_headers(config)

    # Fetch invoice + client windoc_id — scoped to company
    inv_res = (
        supabase.table("invoices")
        .select("*, clients(windoc_id)")
        .eq("id", nexus_invoice_id)
        .eq("company_id", company_id)
        .maybe_single()
        .execute()
    )
    invoice = inv_res.data
    if not invoice:
        raise ValueError("Invoice non trovata o non autorizzata")

    windoc_client_id = (invoice.get("clients") or {}).get("windoc_id")
    if not windoc_client_id:
        raise ValueError("Il cliente non è ancora stato sincronizzato su WindDoc (windoc_id mancante).")

    if invoice.get("windoc_id"):
        raise ValueError("Idempotenza: questa fattura è già stata sincronizzata su WindDoc.")

    lines = supabase.table("invoice_lines").select("*").eq("invoice_id", nexus_invoice_id).execute().data or []
    payload = map_nexus_invoice_to_windoc_payload(invoice, windoc_client_id, lines)

    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as http:
        resp = await http.post(f"{WINDDOC_API_URL}/invoices", json=payload, headers=headers)
        try:
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise ValueError(f"Windoc invoice push failed: {exc.response.text}")
        data = resp.json()

    new_windoc_id = data.get("id")
    if new_windoc_id:
        # Optimistic lock: only persist if not already set (concurrent safety)
        try:
            supabase.table("invoices").update({"windoc_id": str(new_windoc_id)}).eq("id", nexus_invoice_id).eq("company_id", company_id).is_("windoc_id", "null").execute()
        except Exception as exc:
            logger.warning("Failed to persist windoc_id for invoice %s: %s", nexus_invoice_id, exc)
        _audit(company_id, nexus_invoice_id, "windoc_invoice_synced", {"windoc_id": new_windoc_id})

    _update_last_sync(company_id)
    return data


async def get_invoice_status(windoc_invoice_id: str, company_id: str) -> dict:
    """Check WindDoc status for an invoice by its Windoc ID."""
    config  = await _get_windoc_config(company_id)
    headers = _get_headers(config)
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as http:
        resp = await http.get(f"{WINDDOC_API_URL}/invoices/{windoc_invoice_id}", headers=headers)
        try:
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise ValueError(f"Windoc status check failed: {exc.response.text}")
        return resp.json()


async def sync_invoice_from_windoc(windoc_invoice_id: str, company_id: str) -> None:
    """
    Webhook-triggered pull: fetch latest Windoc status and mark invoice paid if confirmed.
    Safe to call multiple times (idempotent).
    """
    try:
        data = await get_invoice_status(windoc_invoice_id, company_id)
    except Exception as exc:
        logger.error("sync_invoice_from_windoc: status fetch failed windoc_id=%s: %s", windoc_invoice_id, exc)
        return

    # Map back to local Nexus invoice
    res = (
        supabase.table("invoices")
        .select("id,status")
        .eq("windoc_id", str(windoc_invoice_id))
        .eq("company_id", company_id)
        .execute()
    )
    rows = res.data or []
    if not rows:
        logger.warning("sync_invoice_from_windoc: no local invoice for windoc_id=%s", windoc_invoice_id)
        return

    invoice = rows[0]
    if invoice.get("status") == "paid":
        return  # Already paid — idempotency guard

    # WindDoc payment state detection (normalise across API variations)
    stato    = str(data.get("stato", "")).lower()
    is_paid  = (
        stato in ("saldato", "pagata", "pagato")
        or data.get("is_paid") is True
        or data.get("pagata") is True
    )

    if not is_paid:
        return

    now = datetime.now(timezone.utc).isoformat()
    try:
        supabase.table("invoices").update({"status": "paid", "paid_at": now}).eq("id", invoice["id"]).eq("company_id", company_id).execute()
    except Exception as exc:
        logger.error("sync_invoice_from_windoc: DB update failed invoice=%s: %s", invoice["id"], exc)
        return

    _audit(company_id, invoice["id"], "windoc_payment_synced",
           {"status": "paid", "sync_source": "windoc_webhook"})

    # Payment log — non-blocking
    try:
        amount = float(data.get("totale") or data.get("total") or 0.0)
        supabase.table("payment_logs").insert({
            "invoice_id": invoice["id"],
            "company_id": company_id,
            "amount":     amount,
            "paid_at":    now,
            "method":     "windoc_sync",
            "reference":  f"windoc_{windoc_invoice_id}",
            "notes":      "Pagamento riconciliato automaticamente via WindDoc Webhook.",
            "created_by": "system",
        }).execute()
    except Exception as exc:
        logger.warning("sync_invoice_from_windoc: payment_logs insert failed: %s", exc)
