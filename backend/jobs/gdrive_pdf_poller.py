import os
import glob
import logging
import asyncio
import shutil
from pathlib import Path
from datetime import datetime
import uuid

from config import settings
from database import supabase
from modules.invoices.router import process_pdf_job

logger = logging.getLogger(__name__)

# Base folder for GDrive sync
GDRIVE_BASE_DIR = r"G:\My Drive\_Fatture"

async def run_gdrive_pdf_poller():
    """
    Polls the root of GDRIVE_BASE_DIR for new .pdf files.
    Parses them, creates the invoice in the DB, uploads to Supabase,
    and moves the physical file to the appropriate categorized subfolder.
    """
    logger.info("Starting GDrive PDF Poller...")
    
    if not os.path.exists(GDRIVE_BASE_DIR):
        logger.warning(f"GDrive folder {GDRIVE_BASE_DIR} does not exist or is not reachable.")
        return

    # Only look at the root directory level of specific target companies (non-recursive)
    target_folders = ["ITServices", "Deloca"]
    pdf_files = []
    
    for folder in target_folders:
        folder_path = os.path.join(GDRIVE_BASE_DIR, folder)
        if not os.path.exists(folder_path):
            continue
        for file in os.listdir(folder_path):
            if file.lower().endswith(".pdf"):
                full_path = os.path.join(folder_path, file)
                if os.path.isfile(full_path):
                    pdf_files.append({"path": full_path, "company_hint": folder})

    if not pdf_files:
        logger.info("No new PDFs found in GDrive target folders.")
        return

    logger.info(f"Found {len(pdf_files)} PDF(s) to process in GDrive targets.")
    
    # Pre-fetch companies to categorize by vat_number or name
    companies_res = supabase.table("companies").select("id, name, vat_number").execute()
    companies = companies_res.data or []

    for item in pdf_files:
        file_path = item["path"]
        company_hint = item["company_hint"]
        try:
            logger.info(f"Processing {file_path}...")
            # 1. Read file bytes
            with open(file_path, "rb") as f:
                file_bytes = f.read()

            filename = os.path.basename(file_path)

            # 2. Upload to Supabase Storage
            storage_path = ""
            file_uuid = uuid.uuid4().hex[:8]
            try:
                storage_filename = f"inbound_{file_uuid}_{filename}"
                supabase.storage.from_("documents").upload(
                    storage_filename,
                    file_bytes,
                    {"content-type": "application/pdf"}
                )
                storage_path = supabase.storage.from_("documents").get_public_url(storage_filename)
            except Exception as e:
                logger.warning(f"Parse PDF poller: impossible to upload to documents bucket: {e}")

            # Note: We need a default company ID to assign the invoice BEFORE we fully parse it.
            # We'll use the first company found, and adjust it later if the parser finds a specific target company.
            default_company_id = companies[0]["id"] if companies else ""

            # 3. Create initial DB row
            import_data = {
                "company_id": default_company_id,
                "direction": "inbound",
                "number": "Elaborando PDF...",
                "status": "draft",
                "payment_status": "not_paid",
                "pdf_path": storage_path
            }
            res = supabase.table("invoices").insert(import_data).execute()
            if not res.data:
                logger.error(f"Failed to create DB row for {filename}")
                continue
                
            invoice_id = res.data[0]["id"]

            # 4. Parse the PDF synchronously (or await the async function)
            await process_pdf_job(invoice_id, file_bytes, default_company_id)
            
            # 5. Retrieve the updated invoice to see the parsed data
            inv_res = supabase.table("invoices").select("parsed_data, issue_date").eq("id", invoice_id).execute()
            if not inv_res.data:
                logger.warning(f"Could not retrieve updated invoice {invoice_id} for {filename}")
                continue

            inv_row = inv_res.data[0]
            parsed = inv_row.get("parsed_data") or {}
            
            # 6. Determine Company
            target_company_name = company_hint
            target_company_id = default_company_id
            
            # Trova ID basato sull'hint della cartella
            for c in companies:
                cn = c["name"].lower()
                ch = company_hint.lower()
                if (ch.replace(" ", "") == cn.replace(" ", "")) or \
                   ("deloca" in ch and "deloca" in cn) or \
                   ("itservices" in ch and "it services" in cn) or \
                   ("it services" in ch and "it services" in cn):
                    target_company_id = c["id"]
                    target_company_name = c["name"]
                    break

            # Se abbiamo trovato una company diversa da quella di default, aggiorniamo il record
            if target_company_id and target_company_id != default_company_id:
                supabase.table("invoices").update({"company_id": target_company_id}).eq("id", invoice_id).execute()

            # 7. Determine Year and Month from issue_date
            issue_date_str = inv_row.get("issue_date")
            if issue_date_str:
                dt = datetime.fromisoformat(issue_date_str)
                year = str(dt.year)
                month = f"{dt.month:02d}"
            else:
                year = datetime.now().strftime("%Y")
                month = datetime.now().strftime("%m")

            # 8. Determine Supplier
            supplier_name = parsed.get("supplier_name", "Fornitore_Sconosciuto")
            # pulizia nome file sicuro per windows
            import re
            safe_supplier = re.sub(r'[\\/*?:"<>|]', '', supplier_name)

            # 9. Build destination folder: G:\My Drive\_Fatture\CompanyName\Anno\Mese\Fornitore
            # Se target_company_name contiene spazi o caratteri strani, usiamo una versione pulita.
            safe_company = re.sub(r'[\\/*?:"<>|]', '', target_company_name)
            
            dest_dir = os.path.join(GDRIVE_BASE_DIR, safe_company, year, month, safe_supplier)
            os.makedirs(dest_dir, exist_ok=True)
            
            # Move the file
            dest_path = os.path.join(dest_dir, filename)
            
            # Gestione conflitti nome
            if os.path.exists(dest_path):
                name, ext = os.path.splitext(filename)
                dest_path = os.path.join(dest_dir, f"{name}_{file_uuid}{ext}")

            shutil.move(file_path, dest_path)
            logger.info(f"Successfully processed and moved {filename} to {dest_path}")
            
            # Breve pausa per evitare limit rate OCR
            await asyncio.sleep(2)
            
        except Exception as e:
            logger.error(f"Error processing GDrive file {file_path}: {e}")
