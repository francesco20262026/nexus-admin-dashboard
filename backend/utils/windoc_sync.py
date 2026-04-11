import logging
import httpx
from pydantic import BaseModel
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

WINDOC_API_URL = "https://app.winddoc.com/v1/api_json.php"

def _flatten_to_bracket(prefix: str, obj: Any) -> list:
    """
    Converte dizionari/liste in coppie chiave-valore 'bracket notation'.
    """
    pairs = []
    if isinstance(obj, dict):
        for key, value in obj.items():
            new_prefix = f"{prefix}[{key}]"
            pairs.extend(_flatten_to_bracket(new_prefix, value))
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            new_prefix = f"{prefix}[{i}]"
            pairs.extend(_flatten_to_bracket(new_prefix, item))
    else:
        pairs.append((prefix, str(obj)))
    return pairs

def _build_form_data(method: str, token: str, token_app: str, params: Dict[str, Any]) -> list:
    data = [("method", method)]
    data.append(("request[token_key][token]", token))
    data.append(("request[token_key][token_app]", token_app))
    data.extend(_flatten_to_bracket("request[params]", params))
    return data

async def call_windoc_api(method: str, token: str, token_app: str, params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Effettua la POST HTTP in urlencoded form.
    """
    if not token or not token_app:
        return {"error": True, "message": "Credenziali Winddoc assenti"}

    form_data = _build_form_data(method, token, token_app, params)
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.post(WINDOC_API_URL, data=form_data)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as e:
            logger.error(f"Errore Winddoc status {e.response.status_code}")
            return {"error": True, "message": f"Errore server Winddoc: {e.response.status_code}"}
        except Exception as e:
            logger.error(f"Errore di rete Winddoc: {e}")
            return {"error": True, "message": str(e)}

async def sync_invoice_to_windoc(supabase, invoice_id: str, company_id: str) -> Dict[str, Any]:
    """
    Costruisce e sincronizza la fattura dal CRM verso Winddoc.
    """
    # 1. Recupera Credenziali
    from database import safe_single
    q_integ = supabase.table("integrations").select("config").eq("company_id", company_id).eq("type", "windoc").maybe_single().execute()
    integ = q_integ.data
    if not integ or not integ.get("config"):
        return {"success": False, "error": "Integrazione Winddoc non configurata per l'azienda."}
    
    token = integ["config"].get("windoc_token")
    token_app = integ["config"].get("windoc_token_app")

    # 2. Recupera Dati Fattura Proforma inclusi Cliente e Righe
    q_inv = (
        supabase.table("invoices")
        .select("*, invoice_lines(*), clients(*)")
        .eq("id", invoice_id)
        .eq("company_id", company_id)
        .maybe_single()
        .execute()
    )
    inv = q_inv.data
    if not inv:
        return {"success": False, "error": "Fattura non trovata."}

    client = inv.get("clients", {})
    if not client:
        return {"success": False, "error": "Manca il cliente associato alla fattura."}

    # 3. Mappa dati su Winddoc Payload
    date_formatted = inv.get("issue_date", "")
    if date_formatted and "T" in date_formatted:
        date_formatted = date_formatted.split("T")[0]
        
    # Costruiamo il payload
    params = {
        "data": date_formatted,
        "scadenza_personalizzata": "1",
        "scadenze": [
            {
                "data": inv.get("due_date", date_formatted).split("T")[0],
                "importo": str(inv.get("total", 0))
            }
        ],
        "metodo_pagamento": inv.get("payment_method") or "Bonifico",
        "note": inv.get("notes") or "",
        "modello": "1", # Predefinito
        
        "contatto_tipo": "A",
        "contatto_nome": client.get("name", ""),
        "contatto_piva": client.get("vat_number", ""),
        "contatto_codice_fiscale": client.get("fiscal_code", ""),
        "contatto_indirizzo": client.get("address", ""),
        "contatto_citta": client.get("city", ""),
        "contatto_cap": client.get("zip_code", ""),
        "contatto_provincia": client.get("province", ""),
        "contatto_codice_destinatario": client.get("dest_code") or "0000000",
        "contatto_email_pec": client.get("pec", ""),
        
        "prodotti": []
    }
    
    # Gestione Abbuono Globale (sconto totale)
    abbuono = float(inv.get("abbuono", 0))
    if abbuono > 0:
        # Se c'è un abbuono e Windoc usa "sconto" come percentuale, calcoliamo la perc sull'imponibile
        imponibile_iniziale = float(inv.get("total", 0)) + abbuono # approx
        if imponibile_iniziale > 0:
            perc_sconto_globale = round((abbuono / imponibile_iniziale) * 100, 4)
            params["sconto"] = str(perc_sconto_globale)
            
    # Mapper righe, oppure finta riga se mancano usando l'importo totale (caso Onboarding puro)
    lines = inv.get("invoice_lines", [])
    if lines:
        for ln in lines:
            # Calcolo sconto riga in % se presente (il CRM salva {discount} in Euro)
            discount_euro = float(ln.get("discount", 0))
            qty = float(ln.get("quantity", 1))
            unit_price = float(ln.get("unit_price", 0))
            tot_riga_lordo = qty * unit_price
            sconto_perc = 0
            if discount_euro > 0 and tot_riga_lordo > 0:
                sconto_perc = round((discount_euro / tot_riga_lordo) * 100, 4)
                
            prod_entry = {
                "nome": ln.get("description", "Servizio"),
                "descrizione": "",
                "prezzo_netto": str(unit_price),
                "quantita": str(qty),
                "iva": "0" if client.get("country", "").upper() == "SM" else str(int(ln.get("vat_rate") or 0)) 
            }
            if sconto_perc > 0:
                prod_entry["sconto"] = str(sconto_perc)
            
            # Centro ricavo (da verificare se API lo espone come listino o categoria, 
            # solitamente si salva come "conto" o si accoda alla descrizione per tracciamento)
            rc = ln.get("revenue_center", "")
            if rc:
                prod_entry["descrizione"] = f"CR: {rc}"
                
            params["prodotti"].append(prod_entry)
    else:
        # Crea riga dal totale
        params["prodotti"].append({
            "nome": "Servizio di Registrazione (Proforma)",
            "descrizione": "Riferimento pratica: " + str(inv.get("onboarding_id", "")),
            "prezzo_netto": str(inv.get("amount", inv.get("total"))),
            "quantita": "1",
            "iva": "0"
        })

    # Regola speciale San Marino -> "Non Imponibile : ART. 71 DPR 633/72 OPERAZIONI CON SAN MARINO/VATICANO"
    for p in params["prodotti"]:
        if str(p.get("iva")) == "0":
            p["esenzione_testo"] = "Non Imponibile : ART. 71 DPR 633/72 OPERAZIONI CON SAN MARINO/VATICANO"
            p["natura"] = "N3.2" # Non imponibile - cessioni intra-comunitarie, controlla in Winddoc! Default.

    # 4. RICERCA PREVENTIVA (FAILSAFE IDEMPOTENZA)
    # Controlliamo se per caso è già stata generata ma il CRM è esploso prima di salvarsela
    marker = f"PROFORMA_ID_NEXUS:{invoice_id}"
    check_params = {"limite": "20"} 
    # WINDOC API non permette filtri per note, peschiamo le ultime 20 fatture in uscita
    check_result = await call_windoc_api("fatture_lista", token, token_app, check_params)
    
    windoc_id = None
    windoc_numero = None
    doc_url = None
    doc_url_dir = None
    already_created = False
    
    if check_result.get("success") and "data" in check_result:
        for f in check_result["data"]:
            if marker in str(f.get("note", "")):
                # Trovata! Evitiamo il duplicato in Windoc
                windoc_id = f.get("id")
                windoc_numero = f.get("numero_documento")
                doc_url = f.get("url")
                doc_url_dir = f.get("url_dir")
                already_created = True
                break

    if not already_created:
        params["note"] = f"{inv.get('notes') or ''}\n{marker}".strip()
        # 5. Richiama le API per creare Fattura effettiva in WindDoc
        result = await call_windoc_api("fatture_aggiungi", token, token_app, params)
        if result.get("error") or not result.get("success", True):
            return {"success": False, "error": result.get("message") or "Errore sconosciuto da Winddoc API fatture_aggiungi"}
        windoc_id = result.get("id")
        windoc_numero = result.get("numero_documento")
        doc_url = result.get("url")
        doc_url_dir = result.get("url_dir")
        
    if not windoc_id:
        return {"success": False, "error": "Winddoc non ha ritornato un ID valido e la fattura non è stata creata."}

    # 6. Salva e Scorpora: Aggiorna Proforma e CREA Fattura Reale Distinta
    # Prima, controlliamo se la riga "fattura" è GIA' stata creata
    q_existing = supabase.table("invoices").select("id").eq("proforma_id", invoice_id).eq("is_proforma", False).maybe_single().execute()
    if not q_existing.data:
        # 6a. CREA LA FATTURA REALE IN CRM
        import uuid
        from datetime import datetime, timezone
        
        new_fattura = {
            "id": str(uuid.uuid4()),
            "company_id": str(company_id),
            "client_id": inv.get("client_id"),
            "contract_id": inv.get("contract_id"),
            "onboarding_id": inv.get("onboarding_id"),
            "proforma_id": invoice_id,
            "direction": "outbound",
            "is_proforma": False,
            "windoc_id": windoc_id,
            "windoc_number": windoc_numero,
            "number": windoc_numero,
            "amount": inv.get("amount"),
            "vat_amount": inv.get("vat_amount"),
            "total": inv.get("total"),
            "currency": inv.get("currency", "EUR"),
            "issue_date": inv.get("issue_date") or datetime.now(timezone.utc).isoformat().split("T")[0],
            "due_date": inv.get("due_date") or datetime.now(timezone.utc).isoformat().split("T")[0],
            "status": "sincronizzata",
            "payment_status": "paid",
            "payment_method": inv.get("payment_method"),
            "payment_reference": inv.get("payment_reference"),
            "document_url": doc_url or doc_url_dir,
            "windoc_sync_status": "success",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        supabase.table("invoices").insert(new_fattura).execute()
        
    # 6b. AGGIORNA LA PROFORMA (mantenendola come entità separata)
    supabase.table("invoices").update({
        "status": "fatturata",
        "payment_status": "paid",
        "windoc_id": windoc_id,
        "windoc_number": str(windoc_numero) if windoc_numero else None
    }).eq("id", invoice_id).execute()
    
    return {
        "success": True, 
        "windoc_id": windoc_id, 
        "windoc_number": windoc_numero,
        "url": doc_url,
        "url_dir": doc_url_dir,
        "recovered_from_failsafe": already_created
    }

async def sync_purchases_from_windoc(supabase, company_id: str, mese: str = "", anno: str = "") -> Dict[str, Any]:
    """
    Recupera le fatture di acquisto da Windoc e le salva nel CRM.
    - La chiamata HTTP a Windoc è wrappata in asyncio.to_thread (requests è sync).
    - Le query supabase restano nell'event loop (supabase-py usa httpx AsyncClient).
    """
    import asyncio
    from integrations.windoc import get_windoc_config, call_windoc
    from database import safe_single

    try:
        config = get_windoc_config(company_id)
    except ValueError as e:
        return {"success": False, "error": str(e)}

    params: dict = {}
    if mese: params["mese"] = mese
    if anno: params["anno"] = anno

    try:
        result = await asyncio.to_thread(call_windoc, config, "ricevute_lista", params)

    except ValueError as e:
        return {"success": False, "error": str(e)}

    lista = result.get("lista") or []
    if not lista:
        return {"success": True, "imported": 0, "message": "Nessuna fattura/ricevuta trovata in questo periodo."}

    imported_count = 0
    errors = []

    for item in lista:
        windoc_id = str(item.get("id_invoice") or item.get("id") or "")
        numero    = item.get("numero_documento") or item.get("numero") or ""

        if not windoc_id:
            continue

        # Idempotenza: salta se già importato
        existing = safe_single(
            supabase.table("invoices").select("id")
            .eq("windoc_id", windoc_id).eq("company_id", company_id).maybe_single()
        )
        if existing and existing.data:
            continue

        supplier_name = item.get("contatto_ragione_sociale") or item.get("contatto_nome") or "Fornitore Sconosciuto"

        import_data = {
            "company_id":    company_id,
            "direction":     "inbound",
            "number":        numero,
            "issue_date":    item.get("data_documento") or None,
            "due_date":      item.get("data_scadenza") or None, # Fallback mostly not used in ricevute, but maybe present
            "total":         float(item.get("totale_documento") or item.get("totale") or 0.0),
            "status":        "paid" if str(item.get("stato")) == "1" else "sent",
            "supplier_name": supplier_name,
            "windoc_id":     windoc_id,
            "windoc_number": numero,
            "parsed_data":   item,
        }

        try:
            supabase.table("invoices").insert(import_data).execute()
            imported_count += 1
        except Exception as exc:
            logger.error(f"Failed to insert inbound invoice from Windoc: {exc}")
            errors.append(str(exc))

    return {
        "success": True,
        "imported": imported_count,
        "errors":   len(errors),
        "details":  errors,
    }


