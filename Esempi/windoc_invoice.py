"""
WindDoc Invoice Builder — Costruisce il payload fattura dai dati dell'ordine
Questo file NON modifica nessun file esistente.
Va chiamato dopo la conferma del pagamento per generare la fattura su WindDoc.

Utilizzo:
    from windoc_invoice import generate_invoice_from_order
    result = generate_invoice_from_order(user_data, checkout_data, payment_id)
"""

import os
import json
import logging
from datetime import datetime
from windoc_service import create_invoice

logger = logging.getLogger(__name__)

IVA_NAME = "Non Imponibile : ART. 71 DPR 633/72 OPERAZIONI CON SAN MARINO/VATICANO"

INVOICED_ORDERS_DIR = "invoices"


def _ensure_log_dir():
    os.makedirs(INVOICED_ORDERS_DIR, exist_ok=True)


def _get_invoice_log_path(payment_id):
    return os.path.join(INVOICED_ORDERS_DIR, f"invoice_{payment_id}.json")


def _is_already_invoiced(payment_id):
    if not payment_id:
        return False
    path = _get_invoice_log_path(payment_id)
    return os.path.exists(path)


def _load_existing_invoice(payment_id):
    path = _get_invoice_log_path(payment_id)
    try:
        with open(path, "r") as f:
            return json.load(f)
    except Exception:
        return None


def _save_invoice_log(payment_id, invoice_result, user_data, checkout_data):
    _ensure_log_dir()
    path = _get_invoice_log_path(payment_id)
    log_data = {
        "payment_id": payment_id,
        "windoc_id": invoice_result.get("id"),
        "numero_documento": invoice_result.get("numero_documento"),
        "url": invoice_result.get("url"),
        "url_dir": invoice_result.get("url_dir"),
        "email": user_data.get("email"),
        "ragione_sociale": user_data.get("ragione_sociale"),
        "piva": user_data.get("piva"),
        "service": checkout_data.get("service"),
        "annunci": checkout_data.get("annunci"),
        "total": checkout_data.get("total"),
        "created_at": datetime.now().isoformat()
    }
    try:
        with open(path, "w") as f:
            json.dump(log_data, f, indent=2, ensure_ascii=False)
        logger.info(f"Log fattura salvato: {path}")
    except Exception as e:
        logger.error(f"Errore salvataggio log fattura: {e}")


def _build_invoice_params(user_data, checkout_data, payment_id=None):
    """
    Costruisce i parametri per la fattura WindDoc dai dati utente e ordine.
    Struttura conforme alla documentazione WindDoc API (fatture_aggiungi).
    """
    today = datetime.now().strftime("%Y-%m-%d")

    nome = user_data.get("nome", "")
    cognome = user_data.get("cognome", "")
    ragione_sociale = user_data.get("ragione_sociale", "")
    email = user_data.get("email", "")
    telefono = user_data.get("telefono", "")
    piva = user_data.get("piva", "")
    codice_fiscale = user_data.get("codice_fiscale", "")
    indirizzo = user_data.get("indirizzo", "")
    citta = user_data.get("citta", "")
    cap = user_data.get("cap", "")
    provincia = user_data.get("provincia", "")
    codice_univoco = user_data.get("codice_univoco", "")
    pec = user_data.get("pec", "")

    service = checkout_data.get("service", "")
    annunci = checkout_data.get("annunci", 1)
    total = checkout_data.get("total", 0)
    indeed = checkout_data.get("indeed", False)

    description = f"{service}"
    if indeed:
        description += " (Indeed incluso)"

    note = "Ordine e-commerce"
    if payment_id:
        note += f" - Rif. pagamento: {payment_id}"

    prodotto = [
        {
            "tipo_riga": 0,
            "nome": description,
            "quantita": int(annunci),
            "prezzo_netto": format(float(total) / int(annunci), '.2f'),
            "iva_name": IVA_NAME
        }
    ]

    params = {
        "stato_documento": 4,
        "data_documento": today,

        "contatto_nome": nome,
        "contatto_cognome": cognome,
        "contatto_ragione_sociale": ragione_sociale,
        "contatto_partita_iva": piva,
        "contatto_codice_fiscale": codice_fiscale,
        "contatto_email": email,
        "contatto_telefono": telefono,

        "contatto_indirizzo_via": indirizzo,
        "contatto_indirizzo_citta": citta,
        "contatto_indirizzo_cap": cap,
        "contatto_indirizzo_provincia": provincia,
        "contatto_indirizzo_nazione": "IT",

        "contatto_codice_destinatario": codice_univoco,
        "contatto_email_pec": pec,

        "note_documento": note,

        "prodotto": prodotto,
    }

    return params


def generate_invoice_from_order(user_data, checkout_data, payment_id=None):
    """
    Genera una fattura su WindDoc a partire dai dati dell'ordine.
    Implementa idempotenza: se il payment_id è già stato fatturato, ritorna i dati esistenti.
    Validazione B2B: richiede P.IVA e ragione sociale.

    Args:
        user_data (dict): Dati utente (nome, cognome, piva, ragione_sociale, indirizzo, etc.)
        checkout_data (dict): Dati ordine (service, annunci, total, indeed)
        payment_id (str, opzionale): ID pagamento BKN301 per idempotenza e riferimento

    Returns:
        dict: Risultato con chiavi:
            - success (bool)
            - id (str): ID documento WindDoc
            - numero_documento (str): Numero fattura
            - url (str): URL PDF fattura
            - url_dir (str): URL diretto PDF
            - already_invoiced (bool): True se fattura già esistente
            - error (str, opzionale): Messaggio errore
    """
    try:
        logger.info(f"Generazione fattura WindDoc per ordine: {checkout_data.get('service')} - {checkout_data.get('annunci')} annunci - {checkout_data.get('total')}EUR")

        if payment_id and _is_already_invoiced(payment_id):
            existing = _load_existing_invoice(payment_id)
            if existing:
                logger.info(f"Fattura già esistente per payment_id={payment_id}, salto creazione")
                return {
                    "success": True,
                    "already_invoiced": True,
                    "id": existing.get("windoc_id"),
                    "numero_documento": existing.get("numero_documento"),
                    "url": existing.get("url"),
                    "url_dir": existing.get("url_dir")
                }

        if not user_data.get("email"):
            return {"success": False, "error": "Email cliente mancante"}

        if not user_data.get("piva", "").strip():
            return {"success": False, "error": "Partita IVA obbligatoria per fatturazione B2B"}

        if not user_data.get("ragione_sociale", "").strip():
            return {"success": False, "error": "Ragione sociale obbligatoria per fatturazione B2B"}

        if not checkout_data.get("service"):
            return {"success": False, "error": "Servizio ordine mancante"}

        if not checkout_data.get("total") or float(checkout_data.get("total", 0)) <= 0:
            return {"success": False, "error": "Importo ordine non valido"}

        params = _build_invoice_params(user_data, checkout_data, payment_id)

        result = create_invoice(params)

        if result.get("success"):
            logger.info(f"Fattura WindDoc creata con successo: {result.get('numero_documento')} (ID: {result.get('id')})")
            if payment_id:
                _save_invoice_log(payment_id, result, user_data, checkout_data)
        else:
            logger.error(f"Errore creazione fattura WindDoc: {result.get('error')}")

        return result

    except Exception as e:
        logger.error(f"Eccezione durante generazione fattura WindDoc: {e}")
        return {
            "success": False,
            "error": f"Errore interno generazione fattura: {str(e)}"
        }
