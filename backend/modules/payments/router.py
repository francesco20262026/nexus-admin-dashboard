from fastapi import APIRouter, HTTPException, status, Depends
from typing import List
from auth.middleware import require_admin, CurrentUser
from core_services.payment_matching import BankTransaction, process_bank_transaction

router = APIRouter(prefix="/payments", tags=["payments"])


@router.post("/import-transactions")
async def import_transactions(
    transactions: List[BankTransaction],
    user: CurrentUser = Depends(require_admin),
):
    """
    Import a batch of raw bank transactions (JSON-mapped from CSV/API) and
    automatically reconcile them against pending invoices using explicit references.
    """
    company_id = str(user.active_company_id)
    user_id    = str(user.user_id)

    results = {"matched": [], "unmatched": [], "ambiguous": [], "already_paid": [], "errors": []}

    for tx in transactions:
        res = process_bank_transaction(company_id=company_id, user_id=user_id, transaction=tx)
        bucket = res.status if res.status in results else "errors"
        results[bucket].append(res.model_dump())

    return {
        "message": f"Elaborate {len(transactions)} transazioni",
        "summary": {k: len(v) for k, v in results.items()},
        "results": results,
    }


@router.get("/matching-report")
async def matching_report(user: CurrentUser = Depends(require_admin)):
    """
    Return a summary log of the latest automated and manual payment matches,
    sourced from audit_logs using the action names actually written by
    payment_matching.py: 'payment_auto_confirmed' and 'payment_manual_confirmed'.
    """
    from database import supabase

    company_id = str(user.active_company_id)

    try:
        res = (
            supabase.table("audit_logs")
            .select("entity_id, created_at, user_id, action, new_values")
            .eq("company_id", company_id)
            .in_("action", ["payment_auto_confirmed", "payment_manual_confirmed"])
            .order("created_at", desc=True)
            .limit(50)
            .execute()
        )
        return {"recent_matches": res.data or []}
    except Exception as exc:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            f"Errore nel recupero del report pagamenti: {exc}",
        )
