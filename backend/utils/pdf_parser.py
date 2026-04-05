import re
import os
import json
import httpx
from io import BytesIO
import pypdf
import logging
import base64

logger = logging.getLogger(__name__)

async def parse_invoice_pdf(pdf_bytes: bytes) -> dict:
    """
    Estrae testo e immagini da un PDF e usa GPT-4o Vision per estrarre 
    i dati della fattura. Fallback su regex in caso di assenza API key.
    """
    text = ""
    base64_images = []
    
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        for i in range(min(3, len(doc))): # analizza al max le prime 3 pagine
            page = doc[i]
            text += page.get_text() + "\n"
            
            # render page to image
            pix = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5)) # scala 1.5x (~108dpi) per test
            img_bytes = pix.tobytes("jpeg")
            b64_str = base64.b64encode(img_bytes).decode("utf-8")
            base64_images.append(b64_str)
            
        doc.close()
    except ImportError:
        logger.warning("PyMuPDF non installato. Usando pypdf per solo testo.")
        try:
            reader = pypdf.PdfReader(BytesIO(pdf_bytes))
            for page in reader.pages:
                t = page.extract_text()
                if t: text += t + "\n"
        except Exception as exc:
            return {"error": str(exc), "success": False}
    except Exception as exc:
        logger.error(f"Errore caricamento PDF: {exc}")
        return {"error": str(exc), "success": False}
        
    if not text.strip() and not base64_images:
        return {"success": False, "error": "PDF vuoto o illeggibile."}

    data = {
        "success": True,
        "supplier_name": "",
        "vat_number": "",
        "issue_date": "",
        "total": 0.0,
        "raw_text": text[:2000]
    }

    # Se abbiamo la chiave OpenAI, proviamo a usare la AI per l'estrazione
    from dotenv import dotenv_values
    env_vars = dotenv_values(os.path.join(os.path.dirname(__file__), "..", ".env"))
    
    openai_key = env_vars.get("OPENAI_API_KEY")
    if openai_key and openai_key.startswith("sk-"):
        try:
            logger.info("Using OpenAI Vision per fattura")
            prompt = f"""
Sei un motore di parsing documentale specializzato in fatture italiane.
Analizza queste immagini (pagine della fattura).

Obiettivo:
estrarre i dati principali da una fattura e restituire SOLO un JSON valido, senza testo aggiuntivo.

Regole:
- non inventare dati
- se un valore non è presente, usa null
- se un valore è ambiguo, usa null e aggiungi una nota nel campo "warnings"
- distingui il fornitore (CHI EMETTE LA FATTURA, spesso indicato col suo logo in alto, o con Cedente/Prestatore) dal cliente (CHI RICEVE LA FATTURA, Cessionario/Committente). ATTENZIONE: Nelle fatture di acquisto, il fornitore è chi sta chiedendo i soldi a te.
- per gli importi restituisci ESCLUSIVAMENTE numeri formattati all'americana (es. 1250.50): usa SOLO IL PUNTO come separatore decimale e NON USARE separatori per le migliaia
- per le date usa letteralmente il formato DD-MM-YYYY se ricavabile con certezza (esempio 31-12-2026), altrimenti lascia null e valorizza il campo raw se presente
- se il documento non è una fattura ma una proforma, nota di credito o altro, indicalo nel campo "document_type"

Restituisci esattamente questa struttura JSON:
{{
  "document_type": null,
  "invoice_number": null,
  "invoice_date": null,
  "invoice_date_raw": null,
  "payment_due_date": null,
  "payment_due_date_raw": null,
  "currency": null,

  "supplier": {{
    "name": null,
    "vat_number": null,
    "tax_code": null,
    "address": null,
    "city": null,
    "pec": null,
    "sdi_code": null,
    "iban": null
  }},

  "customer": {{
    "name": null,
    "vat_number": null,
    "tax_code": null,
    "address": null,
    "city": null,
    "pec": null,
    "sdi_code": null
  }},

  "totals": {{
    "taxable_amount": null,
    "vat_amount": null,
    "gross_total": null,
    "net_to_pay": null
  }},

  "payment_terms": {{
    "method": null,
    "iban": null
  }},

  "items": [
    {{
      "description": null,
      "quantity": null,
      "unit_price": null,
      "vat_rate": null,
      "total_line": null
    }}
  ],

  "warnings": [],
  "confidence": null
}}
"""
            
            content_arr = [{"type": "text", "text": prompt}]
            for b64 in base64_images:
                content_arr.append({
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/jpeg;base64,{b64}",
                        "detail": "high"
                    }
                })
                
            headers = {"Authorization": f"Bearer {openai_key}", "Content-Type": "application/json"}
            payload = {
                "model": "gpt-4o",
                "messages": [{"role": "user", "content": content_arr}],
                "temperature": 0.1,
                "response_format": {"type": "json_object"}
            }
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload)
                if resp.status_code == 200:
                     ai_data = resp.json()["choices"][0]["message"]["content"]
                     parsed = json.loads(ai_data)
                     
                     supplier = parsed.get("supplier", {})
                     totals = parsed.get("totals", {})
                     
                     data["supplier_name"] = supplier.get("name") or ""
                     data["vat_number"] = supplier.get("vat_number") or ""
                     data["issue_date"] = parsed.get("invoice_date") or ""
                     data["number"] = parsed.get("invoice_number") or "Sconosciuto"
                     
                     raw_tot = str(totals.get("net_to_pay") or totals.get("gross_total") or "0.0").strip()
                     try:
                         if "," in raw_tot and "." in raw_tot:
                             if raw_tot.rfind(",") > raw_tot.rfind("."):
                                 raw_tot = raw_tot.replace(".", "").replace(",", ".")
                             else:
                                 raw_tot = raw_tot.replace(",", "")
                         elif "," in raw_tot:
                             raw_tot = raw_tot.replace(",", ".")
                         data["total"] = float(raw_tot)
                     except Exception as ex:
                         logger.warning(f"Failed to parse total {raw_tot}: {ex}")
                         data["total"] = 0.0
                     
                     # Consigliamo di restituire tutto il parsing strutturato al frontend o DB
                     data["full_data"] = parsed 
                     data["ai_parsed"] = True
                     return data
                else:
                    logger.warning(f"OpenAI error: {resp.status_code} {resp.text}. Falling back to Regex.")
        except Exception as e:
            logger.warning(f"OpenAI parsing failed: {e}. Falling back to Regex.")

    # ---------------- FALLBACK REGEX ----------------

    # Estrazione p.iva
    vat_match = re.search(r'(?i)(?:p\.?iva|p\.?i\.?|partita\s*iva)\s*:?\s*(IT)?[\s-]*(\d{11})', text)
    if vat_match:
        data["vat_number"] = vat_match.group(2)
        
    # Estrazione data fattura
    date_match = re.search(r'(?i)(?:data(?:\s*fattura)?)\s*:?\s*(\d{2}[/-]\d{2}[/-]\d{4})', text)
    if date_match:
        data["issue_date"] = date_match.group(1).replace("-", "/")
        
    # Estrazione Totale
    total_match = re.search(r'(?i)(?:totale(?:\s*fattura|\s*documento|\s*da\s*pagare)?)\s*:?\s*(?:EUR|€|euro)?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2})', text)
    if total_match:
        tot_str = total_match.group(1).replace(".", "").replace(",", ".")
        try:
            data["total"] = float(tot_str)
        except ValueError:
            pass

    # Fornitore (ipotesi euristica base)
    lines = [L.strip() for L in text.split("\n") if L.strip()]
    if lines:
        data["supplier_name"] = lines[0]
        
    return data
