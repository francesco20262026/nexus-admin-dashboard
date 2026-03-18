"""
integrations/zoho_sign.py — Zoho Sign API client
Handles sending contracts for e-signature and webhook verification.
"""
import httpx
from database import supabase


async def _get_zoho_config(company_id: str) -> dict:
    """Fetch Zoho Sign OAuth credentials from integrations table."""
    res = (
        supabase.table("integrations")
        .select("config")
        .eq("company_id", company_id)
        .eq("type", "zoho_sign")
        .eq("is_active", True)
        .single()
        .execute()
    )
    if not res.data:
        raise ValueError(f"Zoho Sign integration not configured for company {company_id}")
    return res.data["config"]  # {client_id, client_secret, refresh_token, access_token?}


async def _get_access_token(config: dict) -> str:
    """Refresh and return an OAuth2 access token for Zoho Sign."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            "https://accounts.zoho.eu/oauth/v2/token",
            data={
                "grant_type": "refresh_token",
                "client_id": config["client_id"],
                "client_secret": config["client_secret"],
                "refresh_token": config["refresh_token"],
            },
        )
        resp.raise_for_status()
        return resp.json()["access_token"]


async def send_contract_for_signature(contract: dict, company_id: str) -> str:
    """
    Send a contract document to Zoho Sign for e-signature.
    Returns the Zoho Sign request_id.

    contract dict is expected to contain:
      - id, title
      - clients: {name, email}
      - document_templates: {content}  (HTML)
    """
    config = await _get_zoho_config(company_id)
    access_token = await _get_access_token(config)

    client_info = contract.get("clients") or {}
    template_content = (contract.get("document_templates") or {}).get("content", "")

    headers = {
        "Authorization": f"Zoho-oauthtoken {access_token}",
        "Content-Type": "application/json",
    }

    # Build the Zoho Sign request payload
    payload = {
        "requests": {
            "request_name": contract["title"],
            "actions": [
                {
                    "action_type": "SIGN",
                    "recipient_name": client_info.get("name", ""),
                    "recipient_email": client_info.get("email", ""),
                    "signing_order": 0,
                }
            ],
            "notes": f"Contract ID: {contract['id']}",
        }
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://sign.zoho.eu/api/v1/requests",
            headers=headers,
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()

    return data["requests"]["request_id"]


def verify_zoho_webhook(payload: dict, request_id: str) -> bool:
    """
    Validate a Zoho Sign webhook event.
    Returns True if the event is for a recognized request.
    """
    event_request_id = payload.get("requests", {}).get("request_id")
    return event_request_id == request_id


async def handle_signed_webhook(payload: dict) -> None:
    """
    Process a Zoho Sign 'document_completed' webhook.
    Marks the corresponding contract as signed.
    """
    from datetime import datetime, timezone

    request_id = payload.get("requests", {}).get("request_id")
    if not request_id:
        return

    res = (
        supabase.table("contracts")
        .select("id,company_id")
        .eq("zoho_request_id", request_id)
        .execute()
    )
    if not res.data:
        return

    now = datetime.now(timezone.utc).isoformat()
    for contract in res.data:
        supabase.table("contracts").update({
            "status": "signed",
            "signed_at": now,
        }).eq("id", contract["id"]).execute()

        supabase.table("audit_logs").insert({
            "company_id": contract["company_id"],
            "entity_type": "contract",
            "entity_id": contract["id"],
            "action": "update",
            "new_values": {"status": "signed", "signed_at": now},
        }).execute()
