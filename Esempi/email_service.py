import os
import logging
from datetime import datetime
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from typing import List, Tuple

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


def send_email_smtp(
    to_email: str,
    subject: str,
    text_body: str,
    html_body: str,
    from_email: str = "Impiegando <service@impiegando.com>",
    reply_to: str = None
) -> bool:
    """
    Funzione generica per inviare email via SMTP (Brevo / Sendinblue)
    """
    try:
        # Config SMTP
        smtp_host = os.getenv("SMTP_HOST", "smtp-relay.brevo.com")
        smtp_port = int(os.getenv("SMTP_PORT", "587"))
        smtp_email = os.getenv("SMTP_EMAIL", "960cee001@smtp-brevo.com")
        smtp_password = os.getenv("SMTP_PASSWORD")

        if not smtp_email or not smtp_password:
            logger.error("Credenziali SMTP non configurate")
            return False

        # Crea messaggio MIMEMultipart
        msg = MIMEMultipart("alternative")
        msg["From"] = from_email
        msg["To"] = to_email
        if reply_to:
            msg["Reply-To"] = reply_to
        msg["Subject"] = subject
        msg["X-Mailer"] = "Impiegando Platform"
        msg["Organization"] = "Impiegando"

        msg.attach(MIMEText(text_body, "plain"))
        msg.attach(MIMEText(html_body, "html"))

        # Invio con log
        logger.info(f"Invio email a {to_email} tramite {smtp_host}:{smtp_port}")
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_email, smtp_password)
            server.send_message(msg)
        logger.info(f"Email inviata con successo a {to_email}")
        return True

    except Exception as e:
        logger.error(f"Errore invio email a {to_email}: {e}", exc_info=True)
        return False

def send_email_smtp_usa(
    to_email: str,
    subject: str,
    text_body: str,
    html_body: str,
    from_email: str = "Jobbir <info@jobbir.com>",
    reply_to: str = None
) -> bool:
    """
    Generic function to send emails via SMTP (Brevo / Sendinblue) - USA Version
    """
    try:
        # SMTP Config
        smtp_host = os.getenv("SMTP_HOST", "smtp-relay.brevo.com")
        smtp_port = int(os.getenv("SMTP_PORT", "587"))
        smtp_email = os.getenv("SMTP_EMAIL", "960cee001@smtp-brevo.com")
        smtp_password = os.getenv("SMTP_PASSWORD")

        if not smtp_email or not smtp_password:
            logger.error("SMTP credentials not configured")
            return False

        # Create MIMEMultipart message
        msg = MIMEMultipart("alternative")
        msg["From"] = from_email
        msg["To"] = to_email
        if reply_to:
            msg["Reply-To"] = reply_to
        msg["Subject"] = subject
        msg["X-Mailer"] = "Jobbir Platform"
        msg["Organization"] = "Jobbir"

        msg.attach(MIMEText(text_body, "plain"))
        msg.attach(MIMEText(html_body, "html"))

        # Send with log
        logger.info(f"Sending email to {to_email} via {smtp_host}:{smtp_port}")
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_email, smtp_password)
            server.send_message(msg)
        logger.info(f"Email successfully sent to {to_email}")
        return True

    except Exception as e:
        logger.error(f"Error sending email to {to_email}: {e}", exc_info=True)
        return False

def send_email_smtp_with_attachments(
    to_email: str,
    subject: str,
    text_body: str,
    html_body: str,
    attachments: List[Tuple[str, str]],
    from_email: str = "Impiegando <service@impiegando.com>",
    reply_to: str = None,
    cc: str = None
) -> bool:
    """
    Invia email SMTP con allegati (PDF, ecc.)
    attachments = [(filename, filepath), ...]
    """
    try:
        smtp_host = os.getenv("SMTP_HOST", "smtp-relay.brevo.com")
        smtp_port = int(os.getenv("SMTP_PORT", "587"))
        smtp_email = os.getenv("SMTP_EMAIL", "960cee001@smtp-brevo.com")
        smtp_password = os.getenv("SMTP_PASSWORD")

        if not smtp_email or not smtp_password:
            logger.error("Credenziali SMTP non configurate")
            return False

        msg = MIMEMultipart("mixed")
        msg["From"] = from_email
        msg["To"] = to_email
        msg["Subject"] = subject
        if cc:
            msg["Cc"] = cc
        if reply_to:
            msg["Reply-To"] = reply_to

        msg["X-Mailer"] = "Impiegando Platform"
        msg["Organization"] = "Impiegando"

        alternative = MIMEMultipart("alternative")
        alternative.attach(MIMEText(text_body, "plain"))
        alternative.attach(MIMEText(html_body, "html"))
        msg.attach(alternative)

        # 📎 Allegati
        for filename, filepath in attachments:
            try:
                with open(filepath, "rb") as f:
                    part = MIMEBase("application", "pdf")
                    part.set_payload(f.read())
                encoders.encode_base64(part)
                part.add_header(
                    "Content-Disposition",
                    f'attachment; filename="{filename}"'
                )
                msg.attach(part)
            except FileNotFoundError:
                logger.error(f"Allegato non trovato: {filepath}")

        logger.info(f"Invio email con allegati a {to_email}")
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_email, smtp_password)
            server.send_message(msg)

        logger.info(f"Email inviata con successo a {to_email}")
        return True

    except Exception as e:
        logger.error(f"Errore invio email con allegati a {to_email}: {e}", exc_info=True)
        return False

def send_email_smtp_with_attachments_usa(
    to_email: str,
    subject: str,
    text_body: str,
    html_body: str,
    attachments: List[Tuple[str, str]],
    from_email: str = "Jobbir <info@jobbir.com>",
    reply_to: str = None,
    cc: str = None
) -> bool:
    """
    Send SMTP email with attachments (PDF, etc.) - USA Version
    attachments = [(filename, filepath), ...]
    """
    try:
        smtp_host = os.getenv("SMTP_HOST", "smtp-relay.brevo.com")
        smtp_port = int(os.getenv("SMTP_PORT", "587"))
        smtp_email = os.getenv("SMTP_EMAIL", "960cee001@smtp-brevo.com")
        smtp_password = os.getenv("SMTP_PASSWORD")

        if not smtp_email or not smtp_password:
            logger.error("SMTP credentials not configured")
            return False

        msg = MIMEMultipart("mixed")
        msg["From"] = from_email
        msg["To"] = to_email
        msg["Subject"] = subject
        if cc:
            msg["Cc"] = cc
        if reply_to:
            msg["Reply-To"] = reply_to

        msg["X-Mailer"] = "Jobbir Platform"
        msg["Organization"] = "Jobbir"

        alternative = MIMEMultipart("alternative")
        alternative.attach(MIMEText(text_body, "plain"))
        alternative.attach(MIMEText(html_body, "html"))
        msg.attach(alternative)

        # 📎 Attachments
        for filename, filepath in attachments:
            try:
                with open(filepath, "rb") as f:
                    part = MIMEBase("application", "pdf")
                    part.set_payload(f.read())
                encoders.encode_base64(part)
                part.add_header(
                    "Content-Disposition",
                    f'attachment; filename="{filename}"'
                )
                msg.attach(part)
            except FileNotFoundError:
                logger.error(f"Attachment not found: {filepath}")

        logger.info(f"Sending email with attachments to {to_email}")
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_email, smtp_password)
            server.send_message(msg)

        logger.info(f"Email successfully sent to {to_email}")
        return True

    except Exception as e:
        logger.error(f"Error sending email with attachments to {to_email}: {e}", exc_info=True)
        return False

def send_enterprise_contact_email(form_data: dict) -> bool:
    """
    Invia email interna per richiesta Enterprise
    """
    nome = form_data.get("nome", "")
    cognome = form_data.get("cognome", "")
    email_cliente = form_data.get("email", "")
    telefono = form_data.get("telefono", "Non specificato")
    azienda = form_data.get("azienda", "Non specificata")
    settore = form_data.get("settore", "Non specificato")
    messaggio = form_data.get("messaggio", "")
    data_richiesta = datetime.now().strftime("%d/%m/%Y alle %H:%M")

    subject = f"Nuova richiesta Impiegando - {nome} {cognome}"

    html_body = f"""
    <html>
    <body>
        <h2>Nuova richiesta informazioni</h2>
        <p><strong>Data richiesta:</strong> {data_richiesta}</p>
        <p><strong>Nome:</strong> {nome}</p>
        <p><strong>Cognome:</strong> {cognome}</p>
        <p><strong>Email:</strong> {email_cliente}</p>
        <p><strong>Telefono:</strong> {telefono}</p>
        <p><strong>Azienda:</strong> {azienda}</p>
        <p><strong>Settore:</strong> {settore}</p>
        <p><strong>Messaggio:</strong><br>{messaggio}</p>
    </body>
    </html>
    """

    text_body = f"""
Nuova richiesta informazioni

Data richiesta: {data_richiesta}
Nome: {nome}
Cognome: {cognome}
Email: {email_cliente}
Telefono: {telefono}
Azienda: {azienda}
Settore: {settore}

Messaggio:
{messaggio}
    """

    return send_email_smtp("service@impiegando.com", subject, text_body, html_body)

def send_enterprise_confirmation_email(user_email: str, user_name: str) -> bool:
    """
    Invia email di conferma al cliente
    """
    subject = "La tua richiesta a Impiegando"

    html_body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #00A5CF; border-bottom: 2px solid #00A5CF; padding-bottom: 10px;">
                La tua richiesta per Impiegando
            </h2>
            <p>Ciao <strong>{user_name}</strong>,</p>
            <p>abbiamo ricevuto la tua richiesta di informazioni.</p>
            <p style="background-color: #f0f8ff; padding: 15px; border-left: 4px solid #00A5CF;">
                📌 Un nostro responsabile dedicato ti ricontatterà a breve per fornirti tutti i dettagli.
            </p>
            <p>Grazie per l'interesse,<br><strong>Il team di Impiegando</strong></p>
            <hr style="margin: 30px 0; border: 1px solid #eee;">
            <p style="color: #666; font-size: 12px; text-align: center;">
                Questa email è stata generata automaticamente dal sito Impiegando.
            </p>
        </div>
    </body>
    </html>
    """

    text_body = f"""
Ciao {user_name},
abbiamo ricevuto la tua richiesta di informazioni.

📌 Un nostro responsabile dedicato ti ricontatterà a breve per fornirti tutti i dettagli.

Grazie per l'interesse,
Il team di Impiegando
    """

    return send_email_smtp(user_email, subject, text_body, html_body, reply_to="service@impiegando.com")

def send_password_reset_email(user_email: str, user_name: str, reset_token: str) -> bool:
    """
    Invia email per reset password
    """
    try:
        base_url = "https://www.impiegando.com"
        reset_url = f"{base_url}/reset-password?token={reset_token}"

        subject = "Reimposta la tua password 🔑"

        html_body = f"""
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #00A5CF; border-bottom: 2px solid #00A5CF; padding-bottom: 10px;">
                    Reimposta la tua password
                </h2>

                <p>Ciao <strong>{user_name}</strong>,</p>
                <p>Hai richiesto di reimpostare la tua password per il tuo account Impiegando.</p>
                <p>Clicca sul pulsante qui sotto per reimpostare la tua password:</p>

                <div style="text-align: center; margin: 30px 0;">
                    <a href="{reset_url}" style="background-color: #00A5CF; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                        Reimposta Password
                    </a>
                </div>

                <p>Se non riesci a cliccare il pulsante, copia e incolla questo link nel tuo browser:</p>
                <p style="word-break: break-all; background-color: #f5f5f5; padding: 10px; border-radius: 3px;">
                    {reset_url}
                </p>

                <p><strong>Importante:</strong> Questo link è valido per 1 ora.</p>
                <p>Se non hai richiesto tu questa reimpostazione, ignora questa email.</p>

                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                <p style="color: #666; font-size: 12px;">
                    Questo messaggio è stato inviato automaticamente da Impiegando.<br>
                    Per assistenza contatta: <a href="mailto:service@impiegando.com">service@impiegando.com</a>
                </p>
            </div>
        </body>
        </html>
        """

        text_body = f"""
Ciao {user_name},

Hai richiesto di reimpostare la tua password per il tuo account Impiegando.

Clicca su questo link per reimpostare la tua password:
{reset_url}

Importante: Questo link è valido per 1 ora.

Se non hai richiesto tu questa reimpostazione, ignora questa email.

--
Team Impiegando
service@impiegando.com
        """

        return send_email_smtp(
            to_email=user_email,
            subject=subject,
            text_body=text_body,
            html_body=html_body,
            reply_to="service@impiegando.com"
        )

    except Exception as e:
        logger.error(f"Errore invio email reset password a {user_email}: {e}", exc_info=True)
        return False

from datetime import datetime

def send_admin_password_reset_notification(user_email: str, user_name: str) -> bool:
    """
    Invia notifica a service@impiegando.com quando un utente resetta la password
    """
    try:
        now_str = datetime.now().strftime("%d/%m/%Y alle %H:%M")
        subject = f"Reset password - {user_name} ({user_email})"

        html_body = f"""
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #063046; border-bottom: 2px solid #063046; padding-bottom: 10px;">
                    🔑 Reset Password Effettuato
                </h2>

                <p style="background-color: #f0f8ff; padding: 10px; border-left: 4px solid #00A5CF;">
                    <strong>Data reset:</strong> {now_str}
                </p>

                <h3 style="color: #063046; margin-top: 30px;">Dati utente:</h3>
                <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                    <tr style="background-color: #f9f9f9;">
                        <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Nome:</td>
                        <td style="padding: 8px; border: 1px solid #ddd;">{user_name}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Email:</td>
                        <td style="padding: 8px; border: 1px solid #ddd;">{user_email}</td>
                    </tr>
                </table>

                <hr style="margin: 30px 0; border: 1px solid #eee;">
                <p style="color: #666; font-size: 12px; text-align: center;">
                    Questa email è stata generata automaticamente dal sistema Impiegando.
                </p>
            </div>
        </body>
        </html>
        """

        text_body = f"""
🔑 Reset Password Effettuato

Data reset: {now_str}

Dati utente:
- Nome: {user_name}
- Email: {user_email}

---
Questa email è stata generata automaticamente dal sistema Impiegando.
        """

        return send_email_smtp(
            to_email="service@impiegando.com",
            subject=subject,
            text_body=text_body,
            html_body=html_body,
            reply_to=user_email
        )

    except Exception as e:
        logger.error(f"Errore invio notifica admin reset password per {user_email}: {e}", exc_info=True)
        return False

def send_welcome_email(user_email: str, user_name: str) -> bool:
    """
    Invia email di benvenuto dopo iscrizione completata
    """
    try:
        subject = "Benvenuto su Impiegando 🎉"

        html_body = f"""
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #00A5CF; border-bottom: 2px solid #00A5CF; padding-bottom: 10px;">
                    Benvenuto su Impiegando! 🎉
                </h2>

                <p>Ciao <strong>{user_name}</strong>,</p>
                <p>la tua registrazione su Impiegando è stata completata con successo.</p>
                <p>Ora puoi accedere al tuo account e scoprire i nostri servizi per la ricerca del personale.</p>

                <div style="text-align: center; margin: 30px 0;">
                    <a href="https://www.impiegando.com/#servizi"
                       style="background-color: #00A5CF; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; display: inline-block;">
                        👉 Scopri i nostri servizi
                    </a>
                </div>

                <p>Grazie per la fiducia,<br>
                <strong>Il team di Impiegando</strong></p>

                <hr style="margin: 30px 0; border: 1px solid #eee;">
                <p style="color: #666; font-size: 12px; text-align: center;">
                    Questa email è stata generata automaticamente dal sito Impiegando.
                </p>
            </div>
        </body>
        </html>
        """

        text_body = f"""
Ciao {user_name},

la tua registrazione su Impiegando è stata completata con successo.
Ora puoi accedere al tuo account e scoprire i nostri servizi per la ricerca del personale.

👉 Scopri i nostri servizi:
https://www.impiegando.com/#servizi

Grazie per la fiducia,
Il team di Impiegando
        """

        return send_email_smtp(
            to_email=user_email,
            subject=subject,
            text_body=text_body,
            html_body=html_body,
            reply_to="service@impiegando.com"
        )

    except Exception as e:
        logger.error(
            f"Errore invio email di benvenuto a {user_email}: {e}",
            exc_info=True
        )
        return False
    
def send_purchase_confirmation_email(
    user_email: str,
    ragione_sociale: str,
    order_id: str,
    order_data: dict
) -> bool:
    """
    Invia email di conferma acquisto con contratto allegato
    """
    try:
        # Dati ordine
        order_date = datetime.now().strftime("%d/%m/%Y")
        total_amount = order_data.get("total_amount", "0.00")
        service_name = order_data.get("service_name", "Servizio Impiegando")

        # Dati di accettazione
        acceptance_timestamp = datetime.now().strftime("%d/%m/%Y %H:%M:%S")

        subject = "Conferma ordine ✅"

        html_body = f"""
        <html>
        <body style="font-family: Arial, sans-serif; line-height:1.6; color:#333;">
            <div style="max-width:600px;margin:0 auto;padding:20px;">
                <h2 style="color:#00A5CF;border-bottom:2px solid #00A5CF;">
                    Conferma ordine ✅
                </h2>

                <p>Ciao <strong>{ragione_sociale}</strong>,</p>
                <p>abbiamo ricevuto il tuo ordine e la tua accettazione delle clausole contrattuali.</p>
                <p>In allegato trovi il contratto, l'informativa privacy e la nomina del responsabile del trattamento.</p>

                <h3>📦 Riepilogo ordine</h3>
                <ul>
                    <li><strong>Numero ordine:</strong> {order_id}</li>
                    <li><strong>Data:</strong> {order_date}</li>
                    <li><strong>Totale:</strong> € {total_amount}</li>
                </ul>

                <div style="background:#f5f5f5;padding:12px;font-size:12px;">
                    <strong>🔐 Dati di accettazione</strong><br>
                    Data e ora: {acceptance_timestamp}<br>
                    Email: {user_email}
                </div>

                <p>Grazie per aver scelto Impiegando!<br>
                <strong>Il team di Impiegando</strong></p>
            </div>
        </body>
        </html>
        """

        text_body = f"""
Ciao {ragione_sociale},

abbiamo ricevuto il tuo ordine.
In allegato trovi il contratto, l'informativa privacy e la nomina del responsabile del trattamento.

Numero ordine: {order_id}
Data: {order_date}
Totale: € {total_amount}

Dati di accettazione:
- Data e ora: {acceptance_timestamp}
- Email: {user_email}

Grazie per aver scelto Impiegando!
Il team di Impiegando
        """

        from contract_generator import generate_order_contract
        from privacy_nomina_generator import generate_privacy_pdf, generate_nomina_pdf

        contract_path = generate_order_contract(
            order_id=order_id,
            package_name=service_name,
            package_price=total_amount,
            user_email=user_email,
            user_name=ragione_sociale,
            acceptance_timestamp=acceptance_timestamp
        )

        privacy_path = generate_privacy_pdf(order_id)
        nomina_path = generate_nomina_pdf(order_id)

        attachments = [
            (f"contratto-ordine-{order_id}.pdf", contract_path),
            (f"informativa-privacy-ordine-{order_id}.pdf", privacy_path),
            (f"nomina-responsabile-ordine-{order_id}.pdf", nomina_path)
        ]

        return send_email_smtp_with_attachments(
            to_email=user_email,
            subject=subject,
            text_body=text_body,
            html_body=html_body,
            attachments=attachments,
            reply_to="service@impiegando.com",
            cc="service@impiegando.com"
        )

    except Exception as e:
        logger.error(
            f"Errore invio email conferma acquisto a {user_email}: {e}",
            exc_info=True
        )
        return False
    
def send_admin_purchase_notification(
    user_email: str,
    ragione_sociale: str,
    order_id: str,
    order_data: dict
) -> bool:
    """
    Invia notifica interna a service@impiegando.com per ogni nuovo ordine
    """
    try:
        order_date = datetime.now().strftime("%d/%m/%Y")
        total_amount = order_data.get("total_amount", "0.00")

        subject = f"Nuovo ordine #{order_id} - {ragione_sociale}"

        html_body = f"""
        <html>
        <body style="font-family: Arial, sans-serif; line-height:1.6; color:#333;">
            <div style="max-width:600px;margin:0 auto;padding:20px;">
                <h2 style="color:#063046;border-bottom:2px solid #063046;">
                    🛒 Nuovo ordine ricevuto
                </h2>

                <p style="background-color:#f0f8ff;padding:10px;border-left:4px solid #00A5CF;">
                    <strong>Data ordine:</strong> {order_date}
                </p>

                <h3>📦 Dettagli ordine</h3>
                <ul>
                    <li><strong>Numero ordine:</strong> {order_id}</li>
                    <li><strong>Totale:</strong> € {total_amount}</li>
                </ul>

                <h3>👤 Dati acquirente</h3>
                <ul>
                    <li><strong>Nome:</strong> {ragione_sociale}</li>
                    <li><strong>Email:</strong> {user_email}</li>
                </ul>

                <hr style="margin:30px 0;border:1px solid #eee;">
                <p style="color:#666;font-size:12px;text-align:center;">
                    Questa email è stata generata automaticamente dal sistema Impiegando.
                </p>
            </div>
        </body>
        </html>
        """

        text_body = f"""
🛒 Nuovo ordine ricevuto

Data ordine: {order_date}

📦 Dettagli ordine:
- Numero ordine: {order_id}
- Totale: € {total_amount}

👤 Dati acquirente:
- Nome: {ragione_sociale}
- Email: {user_email}

---
Questa email è stata generata automaticamente dal sistema Impiegando.
        """

        return send_email_smtp(
            to_email="service@impiegando.com",
            subject=subject,
            text_body=text_body,
            html_body=html_body,
            reply_to=user_email
        )

    except Exception as e:
        logger.error(
            f"Errore invio notifica admin ordine #{order_id}: {e}",
            exc_info=True
        )
        return False

def send_purchase_confirmation_email_usa(
    user_email: str,
    company_name: str,
    order_id: str,
    order_data: dict
) -> bool:
    """
    Send purchase confirmation email with contract attached
    """
    try:
        order_date = datetime.now().strftime("%d/%m/%Y")
        total_amount = order_data.get("total_amount", "0.00")
        service_name = order_data.get("service_name", "Jobbir Service")

        acceptance_timestamp = datetime.now().strftime("%d/%m/%Y %H:%M:%S")

        subject = "Order Confirmation ✅"

        html_body = f"""
        <html>
        <body style="font-family: Arial, sans-serif; line-height:1.6; color:#333;">
            <div style="max-width:600px;margin:0 auto;padding:20px;">
                <h2 style="color:#00A5CF;border-bottom:2px solid #00A5CF;">
                    Order Confirmation ✅
                </h2>

                <p>Hi <strong>{company_name}</strong>,</p>
                <p>We have received your order and your acceptance of the contractual terms.</p>
                <p>The contract is attached to this email.</p>

                <h3>📦 Order Summary</h3>
                <ul>
                    <li><strong>Order Number:</strong> {order_id}</li>
                    <li><strong>Date:</strong> {order_date}</li>
                    <li><strong>Total:</strong> $ {total_amount}</li>
                </ul>

                <div style="background:#f5f5f5;padding:12px;font-size:12px;">
                    <strong>🔐 Acceptance Details</strong><br>
                    Date and Time: {acceptance_timestamp}<br>
                    Email: {user_email}
                </div>

                <p>Thank you for choosing Jobbir!<br>
                <strong>The Jobbir Team</strong></p>
            </div>
        </body>
        </html>
        """

        text_body = f"""
Hi {company_name},

We have received your order.
The contract is attached to this email.

Order Number: {order_id}
Date: {order_date}
Total: $ {total_amount}

Acceptance Details:
- Date and Time: {acceptance_timestamp}
- Email: {user_email}

Thank you for choosing Jobbir!
The Jobbir Team
        """

        from contract_generator import generate_order_contract

        contract_path = generate_order_contract(
            order_id=order_id,
            package_name=service_name,
            package_price=total_amount,
            user_email=user_email,
            user_name=company_name,
            acceptance_timestamp=acceptance_timestamp,
            language='en'
        )

        attachments = [
            (f"order-contract-{order_id}.pdf", contract_path)
        ]

        return send_email_smtp_with_attachments_usa(
            to_email=user_email,
            subject=subject,
            text_body=text_body,
            html_body=html_body,
            attachments=attachments,
            reply_to="info@jobbir.com",
            cc="info@jobbir.com"
        )

    except Exception as e:
        logger.error(
            f"Error sending purchase confirmation email to {user_email}: {e}",
            exc_info=True
        )
        return False

def send_admin_purchase_notification_usa(
    user_email: str,
    company_name: str,
    order_id: str,
    order_data: dict
) -> bool:
    """
    Send internal notification to info@jobbir.com for each new order
    """
    try:
        order_date = datetime.now().strftime("%d/%m/%Y")
        total_amount = order_data.get("total_amount", "0.00")

        subject = f"New Order #{order_id} - {company_name}"

        html_body = f"""
        <html>
        <body style="font-family: Arial, sans-serif; line-height:1.6; color:#333;">
            <div style="max-width:600px;margin:0 auto;padding:20px;">
                <h2 style="color:#063046;border-bottom:2px solid #063046;">
                    🛒 New Order Received
                </h2>

                <p style="background-color:#f0f8ff;padding:10px;border-left:4px solid #00A5CF;">
                    <strong>Order Date:</strong> {order_date}
                </p>

                <h3>📦 Order Details</h3>
                <ul>
                    <li><strong>Order Number:</strong> {order_id}</li>
                    <li><strong>Total:</strong> $ {total_amount}</li>
                </ul>

                <h3>👤 Buyer Information</h3>
                <ul>
                    <li><strong>Name:</strong> {company_name}</li>
                    <li><strong>Email:</strong> {user_email}</li>
                </ul>

                <hr style="margin:30px 0;border:1px solid #eee;">
                <p style="color:#666;font-size:12px;text-align:center;">
                    This email was automatically generated by the Jobbir system.
                </p>
            </div>
        </body>
        </html>
        """

        text_body = f"""
🛒 New Order Received

Order Date: {order_date}

📦 Order Details:
- Order Number: {order_id}
- Total: $ {total_amount}

👤 Buyer Information:
- Name: {company_name}
- Email: {user_email}

---
This email was automatically generated by the Jobbir system.
        """

        return send_email_smtp_usa(
            to_email="info@jobbir.com",
            subject=subject,
            text_body=text_body,
            html_body=html_body,
            reply_to=user_email
        )

    except Exception as e:
        logger.error(
            f"Error sending admin notification for order #{order_id}: {e}",
            exc_info=True
        )
        return False