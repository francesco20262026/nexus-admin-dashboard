"""
routers/jobs.py — Manual job trigger endpoints for Nexus CRM.
These endpoints allow admins to trigger scheduled jobs on-demand
(e.g., for testing in staging). Moved here from main.py.
"""
from fastapi import APIRouter, Depends
from auth.middleware import get_current_user, require_admin, CurrentUser

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.post("/trigger-payment-reminders", dependencies=[Depends(require_admin)])
async def trigger_payment_reminders(user: CurrentUser = Depends(get_current_user)):
    """Manually trigger the payment reminders job for the current admin's company."""
    from jobs.payment_reminders import run_payment_reminders
    await run_payment_reminders(company_id=str(user.active_company_id))
    return {"status": "ok", "message": "Job payment_reminders avviato per la tua azienda."}


@router.post("/trigger-renewal-alerts", dependencies=[Depends(require_admin)])
async def trigger_renewal_alerts(user: CurrentUser = Depends(get_current_user)):
    """Manually trigger the renewal alerts job for the current admin's company."""
    from jobs.renewal_alerts import run_renewal_alerts
    await run_renewal_alerts(company_id=str(user.active_company_id))
    return {"status": "ok", "message": "Job renewal_alerts avviato per la tua azienda."}
