"""
modules/dashboard/router.py — KPI aggregates for admin and client dashboards

Every DB query is wrapped individually so a single failure returns
a safe partial/fallback response rather than crashing the whole endpoint.
"""
from collections import defaultdict
from datetime import date, timedelta
import logging

from fastapi import APIRouter, Depends

from auth.middleware import require_admin, require_client, CurrentUser
from database import supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


# ── Helpers ───────────────────────────────────────────────────

def _safe_query(label: str, query_fn):
    """
    Execute a callable that runs one Supabase query.
    Returns (data, True) on success, ([], False) on any exception.
    Logs the error without re-raising so callers get a partial response.
    """
    try:
        result = query_fn()
        return (result.data or []), True
    except Exception as exc:
        logger.error("dashboard DB error [%s]: %s", label, exc)
        return [], False


# ── Admin: KPI ────────────────────────────────────────────────

@router.get("/kpi")
async def get_kpi(user: CurrentUser = Depends(require_admin)):
    """
    Return all key metrics for the admin dashboard in a single call.
    Individual query failures return safe defaults (0 / empty) without
    crashing the endpoint.
    """
    company_id = str(user.active_company_id)
    errors: list[str] = []

    # Clients
    clients_data, ok = _safe_query(
        "clients",
        lambda: supabase.table("clients").select("status").eq("company_id", user.tenant).execute(),
    )
    if not ok:
        errors.append("clients")
    clients_by_status = {"active": 0, "suspended": 0, "prospect": 0, "total": len(clients_data)}
    for c in clients_data:
        s = c.get("status", "prospect")
        clients_by_status[s] = clients_by_status.get(s, 0) + 1

    # Invoices
    invoices_data, ok = _safe_query(
        "invoices",
        lambda: supabase.table("invoices").select("status,total").eq("company_id", user.tenant).execute(),
    )
    if not ok:
        errors.append("invoices")
    inv_summary = {
        "total_count": len(invoices_data),
        "total_amount": 0.0,
        "paid": 0.0,
        "unpaid": 0.0,
        "overdue": 0.0,
        "overdue_count": 0,
    }
    for inv in invoices_data:
        t = float(inv.get("total") or 0)
        inv_summary["total_amount"] += t
        s = inv.get("status", "")
        if s == "paid":
            inv_summary["paid"] += t
        elif s == "overdue":
            inv_summary["overdue"] += t
            inv_summary["overdue_count"] += 1
        elif s in ("draft", "sent"):
            inv_summary["unpaid"] += t

    # Active subscriptions
    subs_data, ok = _safe_query(
        "client_services",
        lambda: supabase.table("client_services")
            .select("id").eq("company_id", user.tenant).eq("status", "active").execute(),
    )
    if not ok:
        errors.append("subscriptions")
    active_subscriptions = len(subs_data)

    # Renewals due in 30 days
    today = date.today().isoformat()
    in_30 = (date.today() + timedelta(days=30)).isoformat()
    renewals_data, ok = _safe_query(
        "renewals",
        lambda: supabase.table("renewals")
            .select("id,renewal_date,status")
            .eq("company_id", user.tenant)
            .gte("renewal_date", today)
            .lte("renewal_date", in_30)
            .neq("status", "renewed")
            .execute(),
    )
    if not ok:
        errors.append("renewals")

    # Monthly revenue (current month paid invoices)
    first_of_month = date.today().replace(day=1).isoformat()
    monthly_data, ok = _safe_query(
        "monthly_revenue",
        lambda: supabase.table("invoices")
            .select("total")
            .eq("company_id", user.tenant)
            .eq("status", "paid")
            .gte("paid_at", first_of_month)
            .execute(),
    )
    if not ok:
        errors.append("monthly_revenue")
    monthly_revenue = sum(float(r.get("total") or 0) for r in monthly_data)

    response = {
        "clients":              clients_by_status,
        "invoices":             inv_summary,
        "active_subscriptions": active_subscriptions,
        "renewals_due_30d":     len(renewals_data),
        "monthly_revenue":      round(monthly_revenue, 2),
    }
    if errors:
        response["_partial"] = True
        response["_errors"]  = errors
    return response


# ── Admin: Revenue chart ──────────────────────────────────────

@router.get("/revenue-chart")
async def revenue_chart(
    months: int = 6,
    user: CurrentUser = Depends(require_admin),
):
    """Return monthly paid revenue for the last N months (for bar chart)."""
    company_id = str(user.active_company_id)
    months     = max(1, min(months, 24))   # clamp: 1–24 months
    since      = (date.today() - timedelta(days=months * 31)).isoformat()

    rows, ok = _safe_query(
        "revenue_chart",
        lambda: supabase.table("invoices")
            .select("paid_at,total")
            .eq("company_id", user.tenant)
            .eq("status", "paid")
            .gte("paid_at", since)
            .execute(),
    )
    if not ok:
        return {"_partial": True, "_error": "Revenue data temporarily unavailable", "data": []}

    monthly: dict[str, float] = defaultdict(float)
    for r in rows:
        if r.get("paid_at"):
            month_key = r["paid_at"][:7]   # YYYY-MM
            monthly[month_key] += float(r.get("total") or 0)

    return sorted(
        [{"month": k, "revenue": round(v, 2)} for k, v in monthly.items()],
        key=lambda x: x["month"],
    )


# ── Admin: Recent activity ────────────────────────────────────

@router.get("/recent-activity")
async def recent_activity(
    limit: int = 20,
    user: CurrentUser = Depends(require_admin),
):
    """Return latest audit log entries for the activity feed."""
    limit = max(1, min(limit, 100))

    rows, ok = _safe_query(
        "recent_activity",
        lambda: supabase.table("audit_logs")
            .select("entity_type,entity_id,action,new_values,created_at,users(name,email)")
            .eq("company_id", user.tenant)
            .order("created_at", desc=True)
            .limit(limit)
            .execute(),
    )
    if not ok:
        return []
    return rows


# ── Client: Recent activity ───────────────────────────────────

@router.get("/client/recent-activity")
async def client_recent_activity(
    limit: int = 20,
    user: CurrentUser = Depends(require_client),
):
    """Return latest audit log entries for the client activity feed."""
    company_id = str(user.active_company_id)
    client_id  = str(user.client_id)
    limit      = max(1, min(limit, 100))

    # Gather all entity IDs belonging to this client — each query is independent
    inv_data, _ = _safe_query(
        "client_invoices",
        lambda: supabase.table("invoices").select("id,number,total").eq("client_id", client_id).execute(),
    )
    ctr_data, _ = _safe_query(
        "client_contracts",
        lambda: supabase.table("contracts").select("id,title").eq("client_id", client_id).execute(),
    )
    doc_data, _ = _safe_query(
        "client_documents",
        lambda: supabase.table("documents").select("id,name").eq("client_id", client_id).execute(),
    )
    ren_data, _ = _safe_query(
        "client_renewals",
        lambda: supabase.table("renewals").select("id").eq("client_id", client_id).execute(),
    )

    all_ids: list[str] = []
    entity_metadata: dict[str, dict] = {}

    for r in inv_data:
        all_ids.append(r["id"])
        entity_metadata[r["id"]] = {"number": r.get("number"), "total": r.get("total")}
    for r in ctr_data:
        all_ids.append(r["id"])
        entity_metadata[r["id"]] = {"title": r.get("title")}
    for r in doc_data:
        all_ids.append(r["id"])
        entity_metadata[r["id"]] = {"name": r.get("name")}
    for r in ren_data:
        all_ids.append(r["id"])

    if not all_ids:
        return []

    logs, ok = _safe_query(
        "client_audit_logs",
        lambda: supabase.table("audit_logs")
            .select("entity_type,entity_id,action,new_values,created_at")
            .eq("company_id", user.tenant)
            .in_("entity_id", all_ids)
            .order("created_at", desc=True)
            .limit(limit * 3)
            .execute(),
    )
    if not ok:
        return []

    client_events = []
    for log in logs:
        entity_type = log.get("entity_type")
        action      = log.get("action")
        new_vals    = log.get("new_values") or {}
        event_status = new_vals.get("status")

        is_facing = (
            (entity_type == "invoice"  and event_status in ("sent", "paid", "overdue"))
            or (entity_type == "contract" and event_status in ("sent", "signed"))
            or (entity_type == "document" and (event_status in ("sent", "signed") or action == "create"))
            or (entity_type == "renewal"  and action == "create")
        )
        if is_facing:
            log["metadata"] = entity_metadata.get(log["entity_id"], {})
            client_events.append(log)
            if len(client_events) >= limit:
                break

    return client_events
