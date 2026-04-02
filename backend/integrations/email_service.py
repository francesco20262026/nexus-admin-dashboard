"""
integrations/email_service.py — SMTP email sending (Brevo/Sendinblue)
"""
import os
import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from typing import List, Tuple

from database import supabase
from config import settings

logger = logging.getLogger(__name__)

# Default templates in case they are missing from the database
DEFAULT_TEMPLATES = {
    "quote_send": {
        "subject": "Preventivo #{quote_number} - {company_name}",
        "body_html": """
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #0a9669; border-bottom: 2px solid #0a9669; padding-bottom: 10px;">
                    Il tuo Preventivo #{quote_number}
                </h2>
                <p>Gentile <strong>{client_name}</strong>,</p>
                <p>Abbiamo preparato il preventivo che hai richiesto a {company_name}.</p>
                <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <strong>Servizi Inclusi:</strong>
                    {services_summary}
                    <br>
                    <strong>Dettagli Economici:</strong><br>
                    Data Emissione: {quote_date}<br>
                    Scadenza: {expiry_date}<br>
                    Importo Totale: &euro; {total_amount}
                </div>
                <p>Ti invitiamo a cliccare sul link sottostante per visionarlo in dettaglio e accettarlo digitalmente in un click, senza necessità di registrazione.</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{client_portal_url}" style="background-color: #0a9669; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; display: inline-block;">
                        👉 Apri e Valuta il Preventivo
                    </a>
                </div>
                <p>Cordiali saluti,<br><strong>Il team di {company_name}</strong></p>
            </div>
        </body>
        </html>
        """
    },
    "contract_send": {
        "subject": "Contratto in attesa di visione - {company_name}",
        "body_html": """
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #0a9669; border-bottom: 2px solid #0a9669; padding-bottom: 10px;">
                    Nuovo Contratto
                </h2>
                <p>Gentile <strong>{client_name}</strong>,</p>
                <p>Abbiamo preparato il tuo contratto.</p>
                <p>Troverai la copia in allegato, ma puoi anche visionare i dettagli comodamente dal tuo portale clienti dedicato.</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{client_portal_url}" style="background-color: #0a9669; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; display: inline-block;">
                        👉 Accedi al Portale Clienti
                    </a>
                </div>
                <p>Cordiali saluti,<br><strong>Il team di {company_name}</strong></p>
            </div>
        </body>
        </html>
        """
    },
    "client_invite": {
        "subject": "Accesso Area Clienti - {company_name}",
        "body_html": """
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #0a9669; border-bottom: 2px solid #0a9669; padding-bottom: 10px;">
                    Benvenuto nell'Area Clienti
                </h2>
                <p>Gentile <strong>{client_name}</strong>,</p>
                <p>È stato creato il tuo account per accedere all'Area Clienti e gestire preventivi, contratti e fatture.</p>
                <p>Per completare l'attivazione e impostare la tua password, clicca sul pulsante qui sotto:</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{magic_link}" style="background-color: #0a9669; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; display: inline-block;">
                        👉 Imposta Password e Accedi
                    </a>
                </div>
                <p>Il link è valido per 24 ore.</p>
                <p>A presto,<br><strong>Il team di {company_name}</strong></p>
            </div>
        </body>
        </html>
        """
    }
}


async def get_email_template(company_id: str, template_type: str, lang: str) -> dict:
    """Fetch template from DB with fallback to DEFAULT_TEMPLATES."""
    company = supabase.table("companies").select("default_lang").eq("id", company_id).maybe_single().execute().data
    company_lang = company.get("default_lang", "it") if company else "it"

    for try_lang in [lang, company_lang, "it"]:
        res = (
            supabase.table("email_templates")
            .select("*")
            .eq("company_id", company_id)
            .eq("type", template_type)
            .eq("lang", try_lang)
            .maybe_single()
            .execute()
        )
        if res.data:
            return res.data
            
    # Fallback to hardcoded template if DB has none
    default_tpl = DEFAULT_TEMPLATES.get(template_type)
    if default_tpl:
        return {
            "subject": default_tpl["subject"],
            "body_html": default_tpl["body_html"]
        }
    return None


def render_template(template: str, variables: dict) -> str:
    for key, value in variables.items():
        template = template.replace("{" + key + "}", str(value) if value is not None else "")
    return template


def send_email_smtp_core(
    to_email: str,
    subject: str,
    html_body: str,
    text_body: str = "",
    from_email: str = None,
    attachments: List[Tuple[str, str]] = None,
) -> bool:
    """
    Core SMTP sending function using Brevo configuration.
    attachments: List of (filename, filepath)
    """
    try:
        # SMTP Config
        smtp_host = settings.smtp_host
        smtp_port = settings.smtp_port
        smtp_email = settings.smtp_email
        smtp_password = settings.smtp_password

        if not smtp_email or not smtp_password:
            logger.error("SMTP credentials not configured in environment variables.")
            return False

        if not from_email:
            # Fallback to a generic sender based on the SMTP email (Brevo login)
            from_email = f"Nova CRM <{smtp_email}>"

        msg = MIMEMultipart("mixed") if attachments else MIMEMultipart("alternative")
        msg["From"] = from_email
        msg["To"] = to_email
        msg["Subject"] = subject

        # Attach body
        if attachments:
            alt = MIMEMultipart("alternative")
            if text_body:
                alt.attach(MIMEText(text_body, "plain"))
            alt.attach(MIMEText(html_body, "html"))
            msg.attach(alt)
        else:
            if text_body:
                msg.attach(MIMEText(text_body, "plain"))
            msg.attach(MIMEText(html_body, "html"))

        # Attach files
        if attachments:
            for filename, filepath in attachments:
                try:
                    with open(filepath, "rb") as f:
                        part = MIMEBase("application", "octet-stream")
                        part.set_payload(f.read())
                    encoders.encode_base64(part)
                    part.add_header("Content-Disposition", f'attachment; filename="{filename}"')
                    msg.attach(part)
                except FileNotFoundError:
                    logger.error(f"Attachment not found: {filepath}")

        # Send via smtplib
        logger.info(f"Sending SMTP email to {to_email} via {smtp_host}:{smtp_port}")
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_email, smtp_password)
            server.send_message(msg)
            
        logger.info(f"Email successfully sent to {to_email}")
        return True

    except Exception as e:
        logger.error(f"Error sending SMTP email to {to_email}: {e}", exc_info=True)
        return False


async def send_templated_email(
    to_email: str,
    template_type: str,
    company_id: str,
    lang: str,
    variables: dict,
    attachments: List[Tuple[str, str]] = None,
    client_id: str = None,
    reference_type: str = None,
    reference_id: str = None,
) -> bool:
    """
    Fetch template from DB/Fallback, render variables, and send via SMTP.
    Logs success/failure to Supabase email_logs and client_communications.
    """
    template = await get_email_template(company_id, template_type, lang)
    if not template:
        logger.warning(f"No email template found for {template_type}")
        return False

    # ── 1. Resolve company name first (needed for variables + from_email) ──
    company_name = "Il nostro team"
    try:
        company_res = supabase.table("companies").select("name").eq("id", company_id).maybe_single().execute()
        if company_res.data:
            company_name = company_res.data["name"]
    except Exception:
        pass

    # Inject company_name automatically into variables if not present
    if "company_name" not in variables:
        variables["company_name"] = company_name

    # ── 2. Render template (company_name now available) ─────────────────
    subject  = render_template(template["subject"],   variables)
    body_html = render_template(template["body_html"], variables)

    # ── 3. Resolve from_email ────────────────────────────────────────────
    # Settings default (works correctly under Windows Service)
    from_email = settings.from_email or None

    # Company level integrations override
    try:
        integ = (
            supabase.table("integrations")
            .select("config")
            .eq("company_id", company_id)
            .eq("type", "smtp")
            .eq("is_active", True)
            .maybe_single()
            .execute()
        )
        if integ.data and integ.data.get("config") and integ.data["config"].get("from_email"):
            from_email = integ.data["config"]["from_email"]
    except Exception as e:
        logger.warning(f"Could not load email integration config for company {company_id}: {e}")

    # Fallback to defaults based on company name
    if not from_email:
        from_email = settings.smtp_email or "noreply@delocanova.com"
        
    # Override generic config to prioritize verified Brevo sender domains
    c_name_upper = company_name.upper() if company_name else ""
    if "IT SERVICES" in c_name_upper or "IMPIEGANDO" in c_name_upper:
        raw_email = "service@impiegando.com"
        display_name = "IT SERVICES & HUMAN JOB TALENT SRL"
    elif "DELOCA" in c_name_upper:
        raw_email = "service@delocanova.com"
        display_name = "DELOCA NOVA SYSTEMS SRL"
    else:
        raw_email = from_email
        display_name = company_name

    # Check if the currently chosen from_email string lacks a Display Name (e.g. "email@domain.com")
    if "<" in from_email:
        # If it already has "<", it is formatted (e.g. "Name <email@a.com>")
        pass
    else:
        # No formatting, so wrap it!
        # If the from_email matches our settings.from_email, we override with our custom domain overrides
        if from_email == (settings.from_email or None) or from_email == (settings.smtp_email or None):
            from_email = f"{display_name} <{raw_email}>"
        else:
            from_email = f"{display_name} <{from_email}>"

    success = send_email_smtp_core(
        to_email=to_email,
        subject=subject,
        html_body=body_html,
        from_email=from_email,
        attachments=attachments,
    )

    # Log to email_logs
    try:
        supabase.table("email_logs").insert({
            "company_id": company_id,
            "to_email": to_email,
            "subject": subject,
            "template_type": template_type,
            "status": "sent" if success else "failed",
        }).execute()
    except Exception as e:
        logger.error(f"Failed to log email to DB: {e}")

    # Log to client_communications when client_id is known
    if client_id:
        try:
            comm_row = {
                "company_id":    company_id,
                "client_id":     client_id,
                "channel":       "email",
                "direction":     "outbound",
                "subject":       subject,
                "body_preview":  body_html[:400] if body_html else None,
                "template_type": template_type,
                "status":        "sent" if success else "failed",
            }
            if reference_type: comm_row["reference_type"] = reference_type
            if reference_id:   comm_row["reference_id"]   = reference_id
            supabase.table("client_communications").insert(comm_row).execute()
        except Exception as e:
            logger.error(f"Failed to log to client_communications: {e}")

    return success


async def send_reminder_email(invoice: dict, company_id: str, level: int, client_id: str = None):
    client = invoice.get("clients") or {}
    lang = client.get("lang", "it")
    variables = {
        "client_name": client.get("name", ""),
        "invoice_number": invoice.get("number", ""),
        "amount": invoice.get("total", ""),
        "due_date": invoice.get("due_date", ""),
        "company_name": ""
    }
    effective_client_id = client_id or invoice.get("client_id")
    await send_templated_email(
        to_email=client.get("email", ""),
        template_type=f"reminder_{level}",
        company_id=company_id,
        lang=lang,
        variables=variables,
        client_id=str(effective_client_id) if effective_client_id else None,
        reference_type="invoice",
        reference_id=str(invoice.get("id")) if invoice.get("id") else None,
    )
