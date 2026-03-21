"""
modules/users/router.py — Internal users management
GET  /users          — list all users for the active company (admin only)
POST /users/invite   — create Supabase auth user + users row + permissions
PATCH /users/{id}    — update role or status (admin only)
"""
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel, EmailStr
from typing import Optional
from uuid import UUID
import logging

from database import supabase
from auth.middleware import get_current_user, CurrentUser, require_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["users"])


# ── Schemas ──────────────────────────────────────────────────

class InviteUserRequest(BaseModel):
    email: EmailStr
    name: str = ""
    role: str = "operator"          # 'admin' | 'operator'
    company_id: Optional[UUID] = None

class PatchUserRequest(BaseModel):
    role: Optional[str] = None      # 'admin' | 'operator'
    status: Optional[str] = None    # 'active' | 'inactive'


# ── Helpers ──────────────────────────────────────────────────

def _enrich_users(users_rows: list, perms_rows: list, companies_map: dict) -> list:
    """Merge users + permissions + company name into a flat list."""
    perm_by_user = {}
    for p in perms_rows:
        uid = p["user_id"]
        if uid not in perm_by_user:
            perm_by_user[uid] = p

    result = []
    for u in users_rows:
        uid = u["id"]
        perm = perm_by_user.get(uid, {})
        result.append({
            "id":           uid,
            "name":         u.get("name") or "",
            "email":        u.get("email") or "",
            "lang":         u.get("lang") or "it",
            "is_active":    u.get("is_active", True),
            "created_at":   u.get("created_at"),
            "role":         perm.get("role", "operator"),
            "status":       "active" if u.get("is_active", True) else "inactive",
            "company_id":   perm.get("company_id"),
            "company_name": companies_map.get(perm.get("company_id", ""), ""),
        })
    return result


# ── Endpoints ────────────────────────────────────────────────

@router.get("")
async def list_users(user: CurrentUser = Depends(require_admin)):
    """Return all users that have permissions on the current active company."""
    company_id = str(user.active_company_id)

    # 1. Get all permissions for this company
    perms_res = (
        supabase.table("user_company_permissions")
        .select("*")
        .eq("company_id", company_id)
        .execute()
    )
    perms = perms_res.data or []
    if not perms:
        return []

    user_ids = [p["user_id"] for p in perms]

    # 2. Get user rows
    users_res = (
        supabase.table("users")
        .select("*")
        .in_("id", user_ids)
        .execute()
    )
    users_rows = users_res.data or []

    # 3. Get company names for all company IDs referenced in perms
    all_company_ids = list({p["company_id"] for p in perms if p.get("company_id")})
    companies_map: dict[str, str] = {}
    if all_company_ids:
        comp_res = (
            supabase.table("companies")
            .select("id,name")
            .in_("id", all_company_ids)
            .execute()
        )
        for c in (comp_res.data or []):
            companies_map[c["id"]] = c.get("name", "")

    return _enrich_users(users_rows, perms, companies_map)


@router.post("/invite")
async def invite_user(
    body: InviteUserRequest,
    user: CurrentUser = Depends(require_admin),
):
    """Invite a new user: create Supabase auth account + public.users row + permissions."""
    if body.role not in ("admin", "operator"):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Ruolo non valido. Valori ammessi: admin, operator",
        )

    target_company_id = str(body.company_id) if body.company_id else str(user.active_company_id)

    # 1. Create Supabase Auth user (sends invitation email)
    try:
        res = supabase.auth.admin.invite_user_by_email(body.email)
        sb_user = res.user
        if not sb_user:
            raise ValueError("Supabase returned no user")
    except Exception as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            f"Impossibile inviare l'invito via email: {exc}",
        )

    # 2. Upsert into public.users
    try:
        supabase.table("users").upsert({
            "id":    sb_user.id,
            "email": body.email,
            "name":  body.name or "",
            "lang":  "it",
        }).execute()
    except Exception as exc:
        logger.warning("invite_user: users upsert failed for %s: %s", body.email, exc)

    # 3. Create permission row
    try:
        supabase.table("user_company_permissions").insert({
            "user_id":    sb_user.id,
            "company_id": target_company_id,
            "role":       body.role,
            "client_id":  None,
            "is_default": True,
        }).execute()
    except Exception as exc:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            f"Invito creato ma errore nell'assegnazione dei permessi: {exc}",
        )

    return {"message": "Invitation sent", "email": body.email}


@router.patch("/{user_id}")
async def update_user(
    user_id: UUID,
    body: PatchUserRequest,
    current_user: CurrentUser = Depends(require_admin),
):
    """Update a user's role or active status."""
    uid = str(user_id)
    company_id = str(current_user.active_company_id)

    # Prevent self-demotion or self-deactivation
    if uid == str(current_user.user_id) and (body.status == "inactive"):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Non puoi disattivarti da solo.",
        )

    # Update role in user_company_permissions
    if body.role is not None:
        if body.role not in ("admin", "operator"):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Ruolo non valido. Valori ammessi: admin, operator",
            )
        supabase.table("user_company_permissions").update(
            {"role": body.role}
        ).eq("user_id", uid).eq("company_id", company_id).execute()

    # Update active status in public.users
    if body.status is not None:
        is_active = body.status == "active"
        supabase.table("users").update(
            {"is_active": is_active}
        ).eq("id", uid).execute()

    return {"message": "User updated"}
