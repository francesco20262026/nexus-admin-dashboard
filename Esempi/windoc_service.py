"""
WindDoc API Service — Modulo per la generazione fatture tramite WindDoc
Endpoint: https://app.winddoc.com/v1/api_json.php
Metodo: fatture_aggiungi
Formato: application/x-www-form-urlencoded con bracket notation per parametri annidati
"""

import os
import time
import logging
import requests

logger = logging.getLogger(__name__)

WINDOC_API_URL = "https://app.winddoc.com/v1/api_json.php"
WINDOC_TOKEN = os.environ.get("WINDOC_TOKEN", "").strip()
WINDOC_TOKEN_APP = os.environ.get("WINDOC_TOKEN_APP", "").strip()

MAX_RETRIES = 3
RETRY_DELAY_SECONDS = 2


def _flatten_to_bracket(prefix, obj):
    """
    Converte un dict/list annidato in coppie chiave-valore con bracket notation.
    Es: prefix="request[params]", obj={"contatto_nome": "Mario"} 
        => [("request[params][contatto_nome]", "Mario")]
    Es: prefix="request[params][prodotto]", obj=[{"nome": "X"}]
        => [("request[params][prodotto][0][nome]", "X")]
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


def _build_form_data(method, params):
    """
    Costruisce il form data in bracket notation per WindDoc.
    """
    data = [("method", method)]
    data.append(("request[token_key][token]", WINDOC_TOKEN))
    data.append(("request[token_key][token_app]", WINDOC_TOKEN_APP))
    data.extend(_flatten_to_bracket("request[params]", params))
    return data


def _call_windoc(method, params, retries=MAX_RETRIES):
    """
    Effettua la chiamata POST all'API WindDoc in formato x-www-form-urlencoded
    con bracket notation per i parametri annidati.
    Retry su errori temporanei (429/5xx).
    """
    form_data = _build_form_data(method, params)

    for attempt in range(1, retries + 1):
        try:
            logger.info(f"WindDoc API call attempt {attempt}/{retries}")
            response = requests.post(
                WINDOC_API_URL,
                data=form_data,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=30
            )

            if response.status_code == 429 or response.status_code >= 500:
                logger.warning(f"WindDoc errore temporaneo (HTTP {response.status_code}), retry {attempt}/{retries}")
                if attempt < retries:
                    time.sleep(RETRY_DELAY_SECONDS * attempt)
                    continue
                else:
                    return {
                        "error": True,
                        "message": f"WindDoc non disponibile dopo {retries} tentativi (HTTP {response.status_code})"
                    }

            data = response.json()
            return data

        except requests.exceptions.Timeout:
            logger.warning(f"WindDoc timeout, retry {attempt}/{retries}")
            if attempt < retries:
                time.sleep(RETRY_DELAY_SECONDS * attempt)
                continue
            return {"error": True, "message": "WindDoc timeout dopo tutti i tentativi"}

        except requests.exceptions.RequestException as e:
            logger.error(f"WindDoc errore di rete: {e}")
            return {"error": True, "message": f"Errore di rete WindDoc: {str(e)}"}

        except Exception as e:
            logger.error(f"WindDoc errore inaspettato: {e}")
            return {"error": True, "message": f"Errore inaspettato WindDoc: {str(e)}"}

    return {"error": True, "message": "WindDoc: tentativi esauriti"}


def create_invoice(invoice_params):
    """
    Crea una fattura su WindDoc.

    Args:
        invoice_params (dict): Parametri della fattura (contatto_*, prodotto[], scadenza[], etc.)

    Returns:
        dict: Risultato con chiavi:
            - success (bool)
            - id (str): ID documento WindDoc
            - numero_documento (str): Numero progressivo fattura
            - url (str): URL per scaricare il PDF
            - url_dir (str): URL diretto PDF
            - error (str, opzionale): Messaggio di errore
    """
    if not WINDOC_TOKEN or not WINDOC_TOKEN_APP:
        logger.error("Token WindDoc non configurati")
        return {
            "success": False,
            "error": "Token WindDoc non configurati. Imposta WINDOC_TOKEN e WINDOC_TOKEN_APP."
        }

    logger.info("Invio fattura a WindDoc...")
    result = _call_windoc("fatture_aggiungi", invoice_params)

    if result.get("error"):
        error_msg = result.get("message", "Errore sconosciuto WindDoc")
        logger.error(f"WindDoc errore: {error_msg}")
        return {
            "success": False,
            "error": error_msg,
            "raw_response": result
        }

    invoice_id = result.get("id")
    numero = result.get("numero_documento")
    url = result.get("url", "")
    url_dir = result.get("url_dir", "")

    if not invoice_id:
        logger.warning(f"WindDoc risposta senza ID documento: {result}")
        return {
            "success": False,
            "error": "WindDoc non ha restituito un ID documento",
            "raw_response": result
        }

    logger.info(f"Fattura WindDoc creata: ID={invoice_id}, Numero={numero}")

    return {
        "success": True,
        "id": invoice_id,
        "numero_documento": numero,
        "url": url,
        "url_dir": url_dir,
        "raw_response": result
    }
