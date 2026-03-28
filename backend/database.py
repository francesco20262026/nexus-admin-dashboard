from supabase import create_client, Client
from config import settings

# ── Clients ───────────────────────────────────────────────────

# Service-role client — bypasses RLS, used by ALL routers for DB operations.
supabase: Client = create_client(settings.supabase_url, settings.supabase_service_key)
supabase_service: Client = supabase  # alias

# Dedicated auth client — used ONLY for sign_in_with_password() in auth/router.py
supabase_auth: Client = create_client(settings.supabase_url, settings.supabase_service_key)


# ── Safe query helpers ────────────────────────────────────────

class _SafeResult:
    """Fallback result when supabase-py yields None from .maybe_single()."""
    data = None


def safe_single(query):
    """
    Execute a .maybe_single() query safely.

    Some versions of supabase-py return None instead of an APIResponse
    when .maybe_single() finds no rows. This wrapper always returns an
    object with `.data` (None if not found), preventing AttributeError.

    Usage:
        res = safe_single(supabase.table("foo").select("*").eq("id", x).maybe_single()
        if res.data:
            ...
    """
    try:
        res = query.execute()
        return res if res is not None else _SafeResult()
    except Exception:
        return _SafeResult()


def safe_exec(query):
    """
    Execute any query safely, returning a result with .data always defined.
    Use for .limit(1) checks or any query that might return None.
    """
    try:
        res = query.execute()
        if res is None:
            r = _SafeResult()
            r.data = []
            return r
        return res
    except Exception:
        r = _SafeResult()
        r.data = []
        return r
