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
    
    # Mapper righe, oppure finta riga se mancano usando l'importo totale (caso Onboarding puro)
    lines = inv.get("invoice_lines", [])
    if lines:
        for ln in lines:
            params["prodotti"].append({
                "nome": ln.get("description", "Servizio"),
                "descrizione": "",
                "prezzo_netto": str(ln.get("unit_price", 0)),
                "quantita": str(ln.get("quantity", 1)),
                "iva": "0" if client.get("country", "").upper() == "SM" else str(int(ln.get("vat_rate") or 0)) 
            })
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

    # 4. Richiama le API
    result = await call_windoc_api("fatture_aggiungi", token, token_app, params)
    
    if result.get("error") or not result.get("success", True):
        return {"success": False, "error": result.get("message") or "Errore sconosciuto da Winddoc"}
        
    windoc_id = result.get("id")
    windoc_numero = result.get("numero_documento")
    
    if windoc_id:
        # 5. Salva referenza winddoc_id in DB
        supabase.table("invoices").update({
            "windoc_id": windoc_id,
            "windoc_number": windoc_numero
        }).eq("id", invoice_id).execute()
        
        return {
            "success": True, 
            "windoc_id": windoc_id, 
            "windoc_number": windoc_numero,
            "url": result.get("url"),
            "url_dir": result.get("url_dir")
        }
    return {"success": False, "error": "Winddoc non ha ritornato un ID valido."}
