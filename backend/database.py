from supabase import create_client, Client
from config import settings
from postgrest.base_request_builder import BaseFilterRequestBuilder

# ── Dynamic Tenant Bypass Patch ───────────────────────────────

original_eq = BaseFilterRequestBuilder.eq

def patched_eq(self, column, value):
    """
    Se la query cerca di filtrare per company_id usando la stringa speciale
    'BYPASS_RLS_SUPERADMIN', ignora il filtro permettendo query inter-tenant 
    per il super_admin senza rompere il chain design pattern di postgrest-py.
    """
    if column == "company_id" and value == "BYPASS_RLS_SUPERADMIN":
        return self
    return original_eq(self, column, value)

BaseFilterRequestBuilder.eq = patched_eq


# ── Clients ───────────────────────────────────────────────────

# Service-role client — bypasses RLS, used by ALL routers for DB operations.
supabase: Client = create_client(settings.supabase_url, settings.supabase_service_key)
supabase_service: Client = supabase  # alias

# Dedicated auth client — uses ANON key, required for sign_in_with_password()
supabase_auth: Client = create_client(settings.supabase_url, settings.supabase_anon_key)


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
