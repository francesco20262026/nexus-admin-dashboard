import logging
from database import supabase
from datetime import datetime

logger = logging.getLogger(__name__)

# Basic linear progression map: higher index = more advanced state
STATUS_ORDER = {
    "new": 0,
    "quote_draft": 1,
    "quote_sent": 2,
    "quote_accepted": 3,
    "contract_draft": 4,
    "contract_sent": 5,
    "contract_signed": 6,
    "proforma_draft": 7,
    "proforma_issued": 8,
    "payment_under_review": 9,
    "converted": 10,
    "cancelled": -1
}

def auto_advance_onboarding(company_id: str, user_id: str, onboarding_id: str, trigger_event: str, reason: str = ""):
    """
    Automatically advances the state of an onboarding record based on external events like 'quote_draft', 'quote_sent', 'contract_signed'.
    Only advances the state if the new implied state is further along than the current state.
    """
    try:
        # Fetch current status - use only onboarding_id (globally unique UUID, no company_id needed)
        res = supabase.table("onboarding").select("status").eq("id", onboarding_id).maybe_single().execute()
        
        # Gestione sicura del ritorno in caso di vecchie lib supabase-py che ritornano dict al posto di APIResponse
        data = getattr(res, "data", None)
        if isinstance(res, dict): data = res.get("data")
        if not data:
            return

        current_status = data.get("status", "new")
        target_status = None

        # Triggers directly correspond to the target statuses in Phase 4
        valid_targets = {"quote_draft", "quote_sent", "quote_accepted", "contract_draft", "contract_sent", "contract_signed"}
        if trigger_event in valid_targets:
            target_status = trigger_event

        if target_status:
            curr_idx = STATUS_ORDER.get(current_status, -1)
            targ_idx = STATUS_ORDER.get(target_status, -1)
            
            # Only advance if target is functionally "further" in the pipeline
            if curr_idx != -1 and targ_idx > curr_idx:
                supabase.table("onboarding").update({
                    "status": target_status,
                    "updated_at": datetime.utcnow().isoformat()
                }).eq("id", onboarding_id).execute()
                logger.info(f"Auto-advanced onboarding {onboarding_id} from {current_status} to {target_status} due to {trigger_event}")

    except Exception as e:
        logger.error(f"Error auto-advancing onboarding: {e}")


def auto_convert_onboarding_to_client(company_id: str, user_id: str, onboarding_id: str):
    try:
        res = supabase.table("onboarding").select("*").eq("id", onboarding_id).eq("company_id", company_id).maybe_single().execute()
        if not res or not res.data:
            return
        logger.info(f"Auto-converting onboarding {onboarding_id} to client")
        # In this workflow we can rely on manual conversion via the UI for now, 
        # but here we can just ensure the status is advanced.
        supabase.table("onboarding").update({"status": "contratto"}).eq("id", onboarding_id).execute()
    except Exception as e:
        logger.error(f"Error auto-converting onboarding: {e}")
