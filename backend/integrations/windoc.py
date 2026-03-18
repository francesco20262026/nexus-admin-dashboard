"""
integrations/windoc.py — Windoc REST API client
Handles invoice sync and client lookup.
"""
import httpx
from database import supabase


async def _get_windoc_config(company_id: str) -> dict:
    """Fetch Windoc credentials from integrations table."""
    res = (
        supabase.table("integrations")
        .select("config")
        .eq("company_id", company_id)
        .eq("type", "windoc")
        .eq("is_active", True)
        .single()
        .execute()
    )
    if not res.data:
        raise ValueError(f"Windoc integration not configured for company {company_id}")
    return res.data["config"]  # {api_key, base_url}


async def sync_invoice_from_windoc(windoc_id: str, company_id: str) -> dict | None:
    """
    Fetch a single invoice from Windoc by its ID and upsert into local DB.
    Returns the upserted invoice dict or None if not found.
    """
    config = await _get_windoc_config(company_id)
    base_url = config.get("base_url", "https://api.windoc.it")
    api_key = config["api_key"]

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{base_url}/invoices/{windoc_id}",
            headers={"Authorization": f"Bearer {api_key}"},
        )
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        data = resp.json()

    # Map Windoc fields → our schema
    row = {
        "company_id": company_id,
        "windoc_id": windoc_id,
        "number": data.get("number"),
        "issue_date": data.get("issue_date"),
        "due_date": data.get("due_date"),
        "amount": data.get("net_amount"),
        "vat_amount": data.get("vat_amount"),
        "total": data.get("total_amount"),
        "currency": data.get("currency", "EUR"),
        "status": _map_windoc_status(data.get("status")),
    }

    # Upsert by windoc_id
    existing = (
        supabase.table("invoices")
        .select("id")
        .eq("windoc_id", windoc_id)
        .eq("company_id", company_id)
        .execute()
    ).data

    if existing:
        res = supabase.table("invoices").update(row).eq("windoc_id", windoc_id).execute()
    else:
        res = supabase.table("invoices").insert(row).execute()

    # Update last_sync_at
    supabase.table("integrations").update(
        {"last_sync_at": "now()"}
    ).eq("company_id", company_id).eq("type", "windoc").execute()

    return res.data[0] if res.data else None


def _map_windoc_status(windoc_status: str | None) -> str:
    mapping = {
        "draft": "draft",
        "sent": "sent",
        "paid": "paid",
        "overdue": "overdue",
        "voided": "cancelled",
    }
    return mapping.get((windoc_status or "").lower(), "draft")


async def lookup_windoc_client(vat_number: str, company_id: str) -> dict | None:
    """Search a client in Windoc by VAT number."""
    config = await _get_windoc_config(company_id)
    base_url = config.get("base_url", "https://api.windoc.it")
    api_key = config["api_key"]

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{base_url}/clients",
            params={"vat_number": vat_number},
            headers={"Authorization": f"Bearer {api_key}"},
        )
        if resp.status_code != 200:
            return None
        results = resp.json()
        return results[0] if results else None
