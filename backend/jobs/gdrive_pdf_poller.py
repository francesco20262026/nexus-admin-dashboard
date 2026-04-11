import os
import logging
import asyncio
from datetime import datetime
import uuid
import re

from database import supabase
from modules.invoices.router import process_pdf_job
from utils.pdf_parser import parse_wiki_pdf
from integrations.google_drive import drive_service

logger = logging.getLogger(__name__)

async def _get_companies():
    companies_res = supabase.table("companies").select("id, name").execute()
    return companies_res.data or []

def _resolve_company_id(folder_name: str, companies: list):
    target_id = companies[0]["id"] if companies else ""
    for c in companies:
        cn = c["name"].lower().replace(" ", "")
        ch = folder_name.lower().replace(" ", "")
        if ch in cn or ("itservices" in ch and "it" in cn):
            return c["id"]
    return target_id


import asyncio
_poll_invoices_running = False

async def poll_invoices_dropzone():
    global _poll_invoices_running
    if _poll_invoices_running:
        logger.info("Invoices poller already running, skipping.")
        return
    _poll_invoices_running = True
    try:
        """
        Spia la cartella: Upload / [Azienda] / Fatture in ingresso
        Estrae il fornitore via AI.
        Sposta in: Documenti_Aziendali / [Azienda] / [Fornitore] / Fatture / [Anno] / [Mesi] /
        """
        logger.info("Starting Invoices Dropzone Poller...")
        if not drive_service.service or not drive_service.root_folder_id:
            logger.warning("Google Drive API is not configured.")
            return

        upload_root_id = drive_service.get_or_create_folder("Upload", drive_service.root_folder_id)
        out_root_id = drive_service.root_folder_id
        if not upload_root_id or not out_root_id: return

        companies = await _get_companies()
        target_folders = ["IT Services", "Deloca"]

        for folder in target_folders:
            comp_upload_id = drive_service.get_or_create_folder(folder, upload_root_id)
            if not comp_upload_id: continue

            invoices_dropzone_id = drive_service.get_or_create_folder("Fatture in ingresso", comp_upload_id)
            if not invoices_dropzone_id: continue

            files = drive_service.get_files_in_folder(invoices_dropzone_id)
            logger.info(f"Fatture Poller: {len(files)} docs in {folder}/Fatture in ingresso.")
        
            target_company_id = _resolve_company_id(folder, companies)
            folder_map = {
                "IT Services": "IT SERVICES & HUMAN JOB TALENT",
                "Deloca": "DELOCA NOVA SYSTEMS"
            }
            dest_company_name = folder_map.get(folder, folder)
            out_comp_id = drive_service.get_or_create_folder(dest_company_name, out_root_id)
        
            for file in files:
                file_id = file.get("id")
                filename = file.get("name")
                parents = file.get("parents", [])
                logger.info(f"Processing invoice {filename}...")
                invoice_id = None
                try:
                    file_bytes = drive_service.download_file(file_id)
                    if not file_bytes:
                        logger.warning(f"Empty download for {filename}, skipping.")
                        continue

                    # Create Dummy CRM Row
                    storage_path = ""
                    file_uuid = uuid.uuid4().hex[:8]
                    try:
                        storage_filename = f"inbound_{file_uuid}_{filename}"
                        supabase.storage.from_("documents").upload(
                            storage_filename, file_bytes, {"content-type": "application/pdf"}
                        )
                        storage_path = supabase.storage.from_("documents").get_public_url(storage_filename)
                    except Exception as e:
                        logger.warning(f"Storage upload failed: {e}")

                    import_data = {
                        "company_id": target_company_id,
                        "direction": "inbound",
                        "number": "Elaborando PDF...",
                        "status": "draft",
                        "payment_status": "not_paid",
                        "pdf_path": storage_path
                    }
                    res = supabase.table("invoices").insert(import_data).execute()
                    if not res.data:
                        logger.warning(f"Failed to insert dummy row for {filename}, skipping.")
                        continue
                    invoice_id = res.data[0]["id"]

                    # Parse with GPT for Invoices
                    await process_pdf_job(invoice_id, file_bytes, target_company_id)
                    await asyncio.sleep(1)

                    inv_res = supabase.table("invoices").select("status, parsed_data, issue_date, notes").eq("id", invoice_id).execute()
                    supplier_name = "Fornitore Sconosciuto"
                    year = datetime.now().strftime("%Y")
                    month = datetime.now().strftime("%m")
                    status = "draft"
                
                    if inv_res.data:
                        p = inv_res.data[0].get("parsed_data") or {}
                        supplier_name = p.get("supplier_name", "Fornitore Sconosciuto")
                        status = inv_res.data[0].get("status")
                        iss_dt = inv_res.data[0].get("issue_date")
                        if iss_dt:
                            dt = datetime.fromisoformat(iss_dt)
                            year = str(dt.year)
                            month = f"{dt.month:02d}"
                
                    safe_supp = re.sub(r'[\\/*?:"<>|]', '', supplier_name).strip().replace(" ", "_") or "Sconosciuto"
                
                    # Move on Drive
                    fatture_f_id = drive_service.get_or_create_folder("Fatture", out_comp_id)
                    ingresso_f_id = drive_service.get_or_create_folder("ingresso", fatture_f_id)
                
                    notes = inv_res.data[0].get("notes") or "" if inv_res.data else ""
                
                    if status == "cancelled" and "DUPLICATA" in notes:
                        # Route to Duplicates quarantine
                        dup_f_id = drive_service.get_or_create_folder("Duplicati", ingresso_f_id)
                        drive_service.move_file(file_id, parents, dup_f_id)
                    else:
                        supp_f_id = drive_service.get_or_create_folder(safe_supp, ingresso_f_id)
                        y_id = drive_service.get_or_create_folder(year, supp_f_id)
                        m_id = drive_service.get_or_create_folder(month, y_id)
                        if m_id:
                            drive_service.move_file(file_id, parents, m_id)

                except Exception as file_exc:
                    logger.error(f"CRITICAL: Failed to process file '{filename}': {file_exc}", exc_info=True)
                    # Mark the stuck row as error state so it doesn't remain 'Elaborando PDF...'
                    if invoice_id:
                        try:
                            supabase.table("invoices").update({
                                "number": f"[ERRORE] {filename}",
                                "status": "draft",
                                "notes": f"Errore durante l'elaborazione: {str(file_exc)[:300]}"
                            }).eq("id", invoice_id).execute()
                        except Exception:
                            pass
                    continue  # Always continue to next file

            await asyncio.sleep(2)

    finally:
        _poll_invoices_running = False


async def poll_documents_dropzone():
    """
    Spia la cartella: Upload / [Azienda] / Documenti
    Applica parse_wiki_pdf e stabilisce la Categoria e il Mittente.
    Sposta in: Documenti_Aziendali / [Azienda] / [Fornitore] / [Categoria] /
    """
    logger.info("Starting Documents Dropzone Poller...")
    if not drive_service.service or not drive_service.root_folder_id:
        logger.warning("Google Drive API is not configured.")
        return

    upload_root_id = drive_service.get_or_create_folder("Upload", drive_service.root_folder_id)
    out_root_id = drive_service.root_folder_id
    if not upload_root_id or not out_root_id: return

    companies = await _get_companies()
    target_folders = ["IT Services", "Deloca"]

    for folder in target_folders:
        comp_upload_id = drive_service.get_or_create_folder(folder, upload_root_id)
        if not comp_upload_id: continue

        docs_dropzone_id = drive_service.get_or_create_folder("Documenti", comp_upload_id)
        if not docs_dropzone_id: continue

        # Estrai i file direttamente in "Documenti"
        base_files = drive_service.get_files_in_folder(docs_dropzone_id)
        for b in base_files:
            b["user_defined_category"] = None
        
        # Cerca sottocartelle (ad es. "Contratti_di_Lavoro", "Busta_Paga" create dall'utente)
        subfolders = drive_service.get_folders_in_folder(docs_dropzone_id)
        for sf in subfolders:
            sub_files = drive_service.get_files_in_folder(sf.get("id"))
            cat_name = sf.get("name").replace("_", " ")  # Supporta "Contratti_di_Lavoro" -> "Contratti di Lavoro"
            for f in sub_files:
                f["user_defined_category"] = cat_name
            base_files.extend(sub_files)

        files = base_files
        logger.info(f"Documenti Poller: {len(files)} docs in {folder}/Documenti e relative sottocartelle.")
        
        target_company_id = _resolve_company_id(folder, companies)
        folder_map = {
            "IT Services": "IT SERVICES & HUMAN JOB TALENT",
            "Deloca": "DELOCA NOVA SYSTEMS"
        }
        dest_company_name = folder_map.get(folder, folder)
        out_comp_id = drive_service.get_or_create_folder(dest_company_name, out_root_id)
        
        for file in files:
            file_id = file.get("id")
            filename = file.get("name")
            parents = file.get("parents", [])
            user_defined_category = file.get("user_defined_category")
            logger.info(f"Processing WIKI document {filename}...")

            file_bytes = drive_service.download_file(file_id)
            if not file_bytes: continue

            parsed_data = await parse_wiki_pdf(file_bytes)
            
            doc_type = user_defined_category if user_defined_category else parsed_data.get("category", "Altro")
            supplier_name = dest_company_name
            safe_supp = "Interno" # We keep safe_supp as Interno just so the folder logic doesn't break, wait no, safe_supp == dest_company_name is already handled! Let's check below.
            safe_supp = dest_company_name
            title = parsed_data.get("title", filename)
            category = f"{supplier_name}::{doc_type}"

            # Move on Drive
            if safe_supp.lower() == "interno" or safe_supp == dest_company_name:
                cat_f_id = drive_service.get_or_create_folder(doc_type, out_comp_id)
            else:
                supp_f_id = drive_service.get_or_create_folder(safe_supp, out_comp_id)
                cat_f_id = drive_service.get_or_create_folder(doc_type, supp_f_id)
                
            if cat_f_id:
                drive_service.move_file(file_id, parents, cat_f_id)

            dummy_url = f"https://drive.google.com/file/d/{file_id}/view"
            supabase.table("company_wiki").insert({
                "company_id": target_company_id,
                "title": title,
                "category": category,
                "url": dummy_url,
                "raw_text": parsed_data.get("raw_text", "")
            }).execute()

            await asyncio.sleep(2)
