"""
integrations/windoc.py — Windoc API client (SYNC, JSON body)

API:  POST https://app.winddoc.com/v1/api_json.php
Body: JSON — { "method": "...", "request": { "token_key": {...}, ...params } }
Auth: token_key inside request body (NOT Authorization header)

All functions are SYNCHRONOUS — call via asyncio.to_thread() from async FastAPI routes.
"""
import logging
import requests
from datetime import datetime, timezone

from database import supabase

logger = logging.getLogger(__name__)

WINDOC_API_URL = "https://app.winddoc.com/v1/api_json.php"
HTTP_TIMEOUT   = 25


# ── Config ────────────────────────────────────────────────────

def get_windoc_config(company_id: str) -> dict:
    """Fetch active Windoc credentials from integrations table (sync)."""
    res = (
        supabase.table("integrations")
        .select("config")
        .eq("company_id", company_id)
        .eq("type", "windoc")
        .eq("is_active", True)
        .maybe_single()
        .execute()
    )
    if not res or not res.data:
        raise ValueError(f"Windoc non configurato per l'azienda {company_id}")
    return res.data["config"] or {}


# Legacy async alias
async def _get_windoc_config(company_id: str) -> dict:
    return get_windoc_config(company_id)


# ── Core HTTP call ────────────────────────────────────────────

def call_windoc(config: dict, method: str, params: dict) -> dict:
    """
    POST a method call to WindDoc using JSON body.

    Official format:
        {
          "method": "contatti_lista",
          "request": {
            "token_key": {"token": "...", "token_app": "..."},
            ...params
          }
        }
    """
    token_app = config.get("token_app", "").strip()
    token     = config.get("token", "").strip()
    if not token_app or not token:
        raise ValueError("Token Windoc mancanti dalla configurazione")

    payload = {
        "method": method,
        "request": {
            "token_key": {
                "token":     token,
                "token_app": token_app,
            },
            **params,
        }
    }

    try:
        resp = requests.post(WINDOC_API_URL, json=payload, timeout=HTTP_TIMEOUT)
        if resp.status_code >= 500 or resp.status_code == 429:
            raise ValueError(f"Windoc server error HTTP {resp.status_code}")
        try:
            data = resp.json()
        except Exception:
            raise ValueError(f"Windoc risposta non JSON: {resp.text[:200]}")
        if isinstance(data, dict) and (data.get("error") or data.get("errore")):
            msg = data.get("message") or data.get("messaggio") or str(data)
            raise ValueError(f"Windoc errore: {msg}")
        return data
    except requests.exceptions.Timeout:
        raise ValueError("Windoc timeout — server non risponde entro 25s")
    except requests.exceptions.ConnectionError as exc:
        raise ValueError(f"Impossibile raggiungere il server Windoc: {exc}")
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(f"Errore Windoc: {exc}")


def _update_last_sync(company_id: str) -> None:
    try:
        supabase.table("integrations").update({
            "last_sync_at": datetime.now(timezone.utc).isoformat(),
        }).eq("company_id", company_id).eq("type", "windoc").execute()
    except Exception as exc:
        logger.warning("windoc last_sync_at update failed %s: %s", company_id, exc)


def _audit(company_id: str, entity_id: str, action: str, new_values: dict) -> None:
    try:
        supabase.table("audit_logs").insert({
            "company_id":  company_id,
            "entity_type": "invoice",
            "entity_id":   entity_id,
            "action":      action,
            "new_values":  new_values,
        }).execute()
    except Exception as exc:
        logger.warning("audit_log write failed %s %s: %s", action, entity_id, exc)


# ── Contacts (Contatti) ───────────────────────────────────────

def search_windoc_contacts_sync(search: str, company_id: str, page: int = 1) -> dict:
    """
    Search Windoc contacts (contatti_lista). Returns raw Windoc response.
    Winddoc limits pages to 10 items. This wrapper fetches 5 pages 
    to return 50 items per CRM page.
    """
    config = get_windoc_config(company_id)
    
    start_windoc_page = (page - 1) * 5 + 1
    end_windoc_page   = start_windoc_page + 4
    
    all_contacts = []
    total_pages_windoc = 1
    
    for p in range(start_windoc_page, end_windoc_page + 1):
        params: dict = {"pagina": p}
        if search:
            params["query"] = f"ragione_sociale like '%{search}%'"
            
        try:
            data = call_windoc(config, "contatti_lista", params)
        except Exception:
            if p == start_windoc_page:
                raise
            break
            
        total_pages_windoc = data.get("numero_pagine", 1)
        lista = data.get("lista") or []
        all_contacts.extend(lista)
        
        if p >= total_pages_windoc or not lista:
            break
            
    crm_total_pages = max(1, (total_pages_windoc + 4) // 5)
    
    return {
        "success": True,
        "pagina_corrente": page,
        "numero_pagine": crm_total_pages,
        "lista": all_contacts
    }


async def search_windoc_rubrica(search: str, company_id: str, page: int = 1) -> dict:
    """Async wrapper — calls search_windoc_contacts_sync via asyncio.to_thread."""
    import asyncio
    return await asyncio.to_thread(search_windoc_contacts_sync, search, company_id, page)


def map_nexus_client_to_windoc_payload(nexus_client: dict) -> dict:
    ragione_sociale = (nexus_client.get("company_name") or nexus_client.get("name") or "").strip()
    if not ragione_sociale:
        raise ValueError("Il cliente deve avere una Ragione Sociale valida.")
    return {
        "ragione_sociale":      ragione_sociale,
        "partita_iva":          nexus_client.get("vat_number") or "",
        "codice_fiscale":       nexus_client.get("tax_code") or "",
        "email":                nexus_client.get("email") or "",
        "email_pec":            nexus_client.get("pec") or "",
        "codice_destinatario":  nexus_client.get("dest_code") or "",
        "indirizzo_via":        nexus_client.get("address") or "",
        "indirizzo_citta":      nexus_client.get("city") or "",
        "indirizzo_cap":        nexus_client.get("cap") or "",
        "indirizzo_provincia":  nexus_client.get("province") or "",
        "indirizzo_nazione":    "IT",
    }


def sync_client_to_windoc(nexus_client_id: str, company_id: str) -> dict:
    """Create or update a client in WindDoc Contatti (sync)."""
    config = get_windoc_config(company_id)
    res = (
        supabase.table("clients")
        .select("*")
        .eq("id", nexus_client_id)
        .eq("company_id", company_id)
        .maybe_single()
        .execute()
    )
    client = res.data if res else None
    if not client:
        raise ValueError("Client non trovato o non autorizzato")

    payload   = map_nexus_client_to_windoc_payload(client)
    windoc_id = client.get("windoc_id")

    if windoc_id:
        payload["id_contatto"] = windoc_id
        data = call_windoc(config, "contatto_modifica", payload)
    else:
        data = call_windoc(config, "contatto_aggiungi", payload)

    new_windoc_id = str(data.get("id_contatto") or data.get("id") or windoc_id or "")
    now_iso = datetime.now(timezone.utc).isoformat()
    updates: dict = {"windoc_sync_at": now_iso}
    if new_windoc_id and new_windoc_id != str(windoc_id or ""):
        updates["windoc_id"] = new_windoc_id
    try:
        supabase.table("clients").update(updates).eq("id", nexus_client_id).eq("company_id", company_id).execute()
    except Exception as exc:
        logger.warning("Failed to persist windoc fields for client %s: %s", nexus_client_id, exc)
    _update_last_sync(company_id)
    return data


# ── Invoices ──────────────────────────────────────────────────

def push_invoice_to_windoc(nexus_invoice_id: str, company_id: str) -> dict:
    """Push invoice to WindDoc (sync)."""
    config = get_windoc_config(company_id)
    inv_res = (
        supabase.table("invoices")
        .select("*, clients(*)")
        .eq("id", nexus_invoice_id)
        .eq("company_id", company_id)
        .maybe_single()
        .execute()
    )
    invoice = inv_res.data if inv_res else None
    if not invoice:
        raise ValueError("Invoice non trovata o non autorizzata")
    if invoice.get("windoc_id"):
        raise ValueError("Idempotenza: fattura già sincronizzata su WindDoc.")

    client = invoice.get("clients") or {}
    lines  = supabase.table("invoice_lines").select("*").eq("invoice_id", nexus_invoice_id).execute().data or []

    today    = invoice.get("issue_date") or datetime.now().strftime("%Y-%m-%d")
    prodotti = [
        {
            "tipo_riga":       0,
            "nome":            (r.get("description") or "Servizio")[:100],
            "quantita":        float(r.get("quantity") or 1.0),
            "prezzo_netto":    float(r.get("unit_price") or 0.0),
            "iva_percentuale": int(float(r.get("vat_rate") or 22)),
        }
        for r in lines
    ]
    params = {
        "stato_documento":              4,
        "data_documento":               today,
        "scadenza":                     invoice.get("due_date") or today,
        "contatto_ragione_sociale":     (client.get("company_name") or client.get("name") or "").strip(),
        "contatto_partita_iva":         client.get("vat_number") or "",
        "contatto_codice_fiscale":      client.get("tax_code") or "",
        "contatto_email":               client.get("email") or "",
        "contatto_email_pec":           client.get("pec") or "",
        "contatto_codice_destinatario": client.get("dest_code") or "",
        "contatto_indirizzo_via":       client.get("address") or "",
        "contatto_indirizzo_citta":     client.get("city") or "",
        "contatto_indirizzo_cap":       client.get("cap") or "",
        "contatto_indirizzo_provincia": client.get("province") or "",
        "contatto_indirizzo_nazione":   "IT",
        "note_documento":               invoice.get("notes") or "",
        "prodotto":                     prodotti,
    }
    if client.get("windoc_id"):
        params["contatto_id"] = client["windoc_id"]

    data = call_windoc(config, "fatture_aggiungi", params)
    new_windoc_id = data.get("id")
    if new_windoc_id:
        try:
            supabase.table("invoices").update({"windoc_id": str(new_windoc_id)}).eq("id", nexus_invoice_id).eq("company_id", company_id).is_("windoc_id", "null").execute()
        except Exception as exc:
            logger.warning("Failed to persist windoc_id for invoice %s: %s", nexus_invoice_id, exc)
        _audit(company_id, nexus_invoice_id, "windoc_invoice_synced", {"windoc_id": new_windoc_id})
    _update_last_sync(company_id)
    return data


def get_invoice_status(windoc_invoice_id: str, company_id: str) -> dict:
    config = get_windoc_config(company_id)
    return call_windoc(config, "fatture_dettaglio", {"id": windoc_invoice_id})
