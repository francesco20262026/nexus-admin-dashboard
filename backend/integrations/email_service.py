"""
integrations/email_service.py — SendGrid email sending
"""
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
from database import supabase
from config import settings


async def get_email_template(company_id: str, template_type: str, lang: str) -> dict:
    """Fetch template with fallback: requested lang → company default → 'it'"""
    company = supabase.table("companies").select("default_lang").eq("id", company_id).single().execute().data
    company_lang = company.get("default_lang", "it") if company else "it"

    for try_lang in [lang, company_lang, "it"]:
        res = (
            supabase.table("email_templates")
            .select("*")
            .eq("company_id", company_id)
            .eq("type", template_type)
            .eq("lang", try_lang)
            .single()
            .execute()
        )
        if res.data:
            return res.data
    return None


def render_template(template: str, variables: dict) -> str:
    for key, value in variables.items():
        template = template.replace("{" + key + "}", str(value) if value else "")
    return template


async def send_templated_email(
    to_email: str,
    template_type: str,
    company_id: str,
    lang: str,
    variables: dict,
) -> bool:
    template = await get_email_template(company_id, template_type, lang)
    if not template:
        return False

    subject = render_template(template["subject"], variables)
    body_html = render_template(template["body_html"], variables)

    # Get company SendGrid config from integrations table
    integ = (
        supabase.table("integrations")
        .select("config")
        .eq("company_id", company_id)
        .eq("type", "sendgrid")
        .eq("is_active", True)
        .single()
        .execute()
    )
    api_key = integ.data["config"].get("api_key") if integ.data else settings.sendgrid_api_key
    from_email = integ.data["config"].get("from_email", settings.from_email) if integ.data else settings.from_email

    try:
        message = Mail(from_email=from_email, to_emails=to_email,
                       subject=subject, html_content=body_html)
        sg = SendGridAPIClient(api_key)
        response = sg.send(message)
        provider_id = response.headers.get("X-Message-Id")

        supabase.table("email_logs").insert({
            "company_id": company_id,
            "to_email": to_email,
            "subject": subject,
            "template_type": template_type,
            "status": "sent",
            "provider_id": provider_id,
        }).execute()
        return True
    except Exception as e:
        supabase.table("email_logs").insert({
            "company_id": company_id,
            "to_email": to_email,
            "subject": subject,
            "template_type": template_type,
            "status": "failed",
            "error_message": str(e),
        }).execute()
        return False


async def send_reminder_email(invoice: dict, company_id: str, level: int):
    client = invoice.get("clients") or {}
    lang = client.get("lang", "it")
    variables = {
        "client_name": client.get("name", ""),
        "invoice_number": invoice.get("number", ""),
        "amount": invoice.get("total", ""),
        "due_date": invoice.get("due_date", ""),
    }
    await send_templated_email(
        to_email=client.get("email", ""),
        template_type=f"reminder_{level}",
        company_id=company_id,
        lang=lang,
        variables=variables,
    )
