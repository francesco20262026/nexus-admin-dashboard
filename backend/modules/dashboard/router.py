"""
modules/dashboard/router.py — KPI aggregates for admin dashboard
"""
from fastapi import APIRouter, Depends
from datetime import date, timedelta

from auth.middleware import require_admin, CurrentUser
from database import supabase

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/kpi")
async def get_kpi(user: CurrentUser = Depends(require_admin)):
    """
    Return all key metrics for the admin dashboard in a single call:
    - clients count by status
    - invoices: total, paid, unpaid, overdue amounts
    - active subscriptions count
    - renewals due in next 30 days
    """
    company_id = str(user.active_company_id)

    # Clients
    clients_res = (
        supabase.table("clients")
        .select("status")
        .eq("company_id", company_id)
        .execute()
    ).data
    clients_by_status = {"active": 0, "suspended": 0, "prospect": 0, "total": len(clients_res)}
    for c in clients_res:
        s = c.get("status", "prospect")
        clients_by_status[s] = clients_by_status.get(s, 0) + 1

    # Invoices
    invoices_res = (
        supabase.table("invoices")
        .select("status,total")
        .eq("company_id", company_id)
        .execute()
    ).data
    inv_summary = {"total_count": len(invoices_res), "total_amount": 0.0,
                   "paid": 0.0, "unpaid": 0.0, "overdue": 0.0, "overdue_count": 0}
    for inv in invoices_res:
        t = float(inv.get("total") or 0)
        inv_summary["total_amount"] += t
        if inv["status"] == "paid":
            inv_summary["paid"] += t
        elif inv["status"] == "overdue":
            inv_summary["overdue"] += t
            inv_summary["overdue_count"] += 1
        elif inv["status"] in ("draft", "sent"):
            inv_summary["unpaid"] += t

    # Active subscriptions
    subs_res = (
        supabase.table("client_services")
        .select("id")
        .eq("company_id", company_id)
        .eq("status", "active")
        .execute()
    ).data
    active_subscriptions = len(subs_res)

    # Renewals due in 30 days
    today = date.today().isoformat()
    in_30 = (date.today() + timedelta(days=30)).isoformat()
    renewals_res = (
        supabase.table("renewals")
        .select("id,renewal_date,status")
        .eq("company_id", company_id)
        .gte("renewal_date", today)
        .lte("renewal_date", in_30)
        .neq("status", "renewed")
        .execute()
    ).data

    # Monthly revenue (current month paid invoices)
    first_of_month = date.today().replace(day=1).isoformat()
    monthly_res = (
        supabase.table("invoices")
        .select("total")
        .eq("company_id", company_id)
        .eq("status", "paid")
        .gte("paid_at", first_of_month)
        .execute()
    ).data
    monthly_revenue = sum(float(r.get("total") or 0) for r in monthly_res)

    return {
        "clients": clients_by_status,
        "invoices": inv_summary,
        "active_subscriptions": active_subscriptions,
        "renewals_due_30d": len(renewals_res),
        "monthly_revenue": round(monthly_revenue, 2),
    }


@router.get("/revenue-chart")
async def revenue_chart(
    months: int = 6,
    user: CurrentUser = Depends(require_admin),
):
    """Return monthly paid revenue for the last N months (for bar chart)."""
    from collections import defaultdict

    company_id = str(user.active_company_id)
    since = (date.today() - timedelta(days=months * 31)).isoformat()

    rows = (
        supabase.table("invoices")
        .select("paid_at,total")
        .eq("company_id", company_id)
        .eq("status", "paid")
        .gte("paid_at", since)
        .execute()
    ).data

    monthly: dict[str, float] = defaultdict(float)
    for r in rows:
        if r.get("paid_at"):
            month_key = r["paid_at"][:7]  # YYYY-MM
            monthly[month_key] += float(r.get("total") or 0)

    # Build sorted list
    result = sorted(
        [{"month": k, "revenue": round(v, 2)} for k, v in monthly.items()],
        key=lambda x: x["month"],
    )
    return result


@router.get("/recent-activity")
async def recent_activity(
    limit: int = 20,
    user: CurrentUser = Depends(require_admin),
):
    """Return latest audit log entries for the activity feed."""
    res = (
        supabase.table("audit_logs")
        .select("entity_type,entity_id,action,new_values,created_at,users(name,email)")
        .eq("company_id", str(user.active_company_id))
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return res.data
