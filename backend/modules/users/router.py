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
from auth.middleware import get_current_user, CurrentUser, require_admin, require_internal
from config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["users"])


# ── Schemas ──────────────────────────────────────────────────

class InviteUserRequest(BaseModel):
    email: EmailStr
    name: str = ""
    role: str = "operator"          # 'admin' | 'operator' | 'client'
    company_id: Optional[UUID] = None
    client_id: Optional[UUID] = None
    onboarding_id: Optional[UUID] = None

class PatchUserRequest(BaseModel):
    role: Optional[str] = None      # 'admin' | 'operator'
    status: Optional[str] = None    # 'active' | 'inactive'
    name: Optional[str] = None

class AddCompanyRequest(BaseModel):
    company_id: UUID
    role: str = "operator"
    client_id: Optional[UUID] = None   # link to a specific client account


# ── Helpers ──────────────────────────────────────────────────

def _enrich_users(users_rows: list, perms_rows: list, companies_map: dict, clients_map: dict) -> list:
    """Merge users + permissions + company name into a flat list."""
    perms_by_user = {}
    for p in perms_rows:
        uid = p["user_id"]
        if uid not in perms_by_user:
            perms_by_user[uid] = []
        perms_by_user[uid].append(p)

    result = []
    for u in users_rows:
        uid = u["id"]
        user_perms = perms_by_user.get(uid, [])
        if not user_perms:
            user_perms = [{}]
            
        primary_perm = user_perms[0]
        aliases = []
        names = []
        for p in user_perms:
            comp = companies_map.get(p.get("company_id", ""), {})
            comp_name = comp.get("name", "")
            if comp_name:
                names.append(comp_name)
                # Calcola alias: ITS per IT SERVICES, DLC per DELOCA
                upper_name = comp_name.upper()
                if "IT SERVICE" in upper_name:
                    aliases.append("ITS")
                elif "DELOCA" in upper_name:
                    aliases.append("DLC")
                else:
                    aliases.append(comp_name[:3].upper())

        # Deduplicate
        aliases = list(dict.fromkeys(aliases))
        names = list(dict.fromkeys(names))

        result.append({
            "id":           uid,
            "name":         u.get("name") or "",
            "email":        u.get("email") or "",
            "lang":         u.get("lang") or "it",
            "is_active":    u.get("is_active", True),
            "created_at":   u.get("created_at"),
            "role":         primary_perm.get("role", "operator"),
            "status":       "active" if u.get("is_active", True) else "inactive",
            "company_id":   primary_perm.get("company_id"),
            "company_name": " / ".join(names) if names else "",
            "company_alias": " / ".join(aliases) if aliases else "",
            "client_id":    primary_perm.get("client_id"),
            "client_name":  clients_map.get(primary_perm.get("client_id", ""), ""),
        })
    return result


# ── Endpoints ────────────────────────────────────────────────

@router.get("")
async def list_users(user: CurrentUser = Depends(require_internal)):
    """Return all users that have permissions on the current active company (Global if Admin)."""
    if user.is_admin:
        users_res = supabase.table("users").select("*").execute()
        users_rows = users_res.data or []
        perms_res = supabase.table("user_company_permissions").select("*").execute()
        perms = perms_res.data or []
    else:
        company_id = str(user.active_company_id)
        perms_res = supabase.table("user_company_permissions").select("*").eq("company_id", user.tenant).execute()
        perms = perms_res.data or []
        user_ids = [p["user_id"] for p in perms]
        if not user_ids:
            return []
        users_res = supabase.table("users").select("*").in_("id", user_ids).execute()
        users_rows = users_res.data or []

    all_company_ids = list({p["company_id"] for p in perms if p.get("company_id")})
    companies_map: dict = {}
    if all_company_ids:
        comp_res = (
            supabase.table("companies")
            .select("id,name,slug")
            .in_("id", all_company_ids)
            .execute()
        )
        for c in (comp_res.data or []):
            companies_map[c["id"]] = c

    all_client_ids = list({p["client_id"] for p in perms if p.get("client_id")})
    clients_map: dict = {}
    if all_client_ids:
        cl_res = (
            supabase.table("clients")
            .select("id,name")
            .in_("id", all_client_ids)
            .execute()
        )
        for cl in (cl_res.data or []):
            clients_map[cl["id"]] = cl.get("name", "")

    return _enrich_users(users_rows, perms, companies_map, clients_map)


@router.get("/{user_id}")
async def get_user(
    user_id: UUID,
    current_user: CurrentUser = Depends(require_admin),
):
    """Return a user's profile + all company associations."""
    uid = str(user_id)

    user_res = (
        supabase.table("users")
        .select("id,name,email,lang,is_active,created_at")
        .eq("id", uid)
        .maybe_single()
        .execute()
    )
    if not user_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    user_data = user_res.data

    perms_res = (
        supabase.table("user_company_permissions")
        .select("company_id, role, is_default, client_id")
        .eq("user_id", uid)
        .execute()
    )
    perms = perms_res.data or []
    company_ids = [p["company_id"] for p in perms]

    companies_map: dict = {}
    if company_ids:
        comp_res = supabase.table("companies").select("id,name,slug").in_("id", company_ids).execute()
        for c in (comp_res.data or []):
            companies_map[c["id"]] = c

    # For each perm that has a client_id, fetch the client name
    client_ids = [p["client_id"] for p in perms if p.get("client_id")]
    clients_map: dict = {}
    if client_ids:
        cl_res = supabase.table("clients").select("id,name,email").in_("id", client_ids).execute()
        for cl in (cl_res.data or []):
            clients_map[cl["id"]] = cl

    user_data["companies"] = [
        {
            "company_id":    p["company_id"],
            "company_name":  companies_map.get(p["company_id"], {}).get("name", ""),
            "slug":          companies_map.get(p["company_id"], {}).get("slug", ""),
            "role":          p["role"],
            "is_default":    p["is_default"],
            "client_id":     p.get("client_id"),
            "client_name":   clients_map.get(p.get("client_id"), {}).get("name") if p.get("client_id") else None,
            "client_email":  clients_map.get(p.get("client_id"), {}).get("email") if p.get("client_id") else None,
        }
        for p in perms
    ]
    user_data["status"] = "active" if user_data.get("is_active", True) else "inactive"
    return user_data


@router.post("/{user_id}/reset-password")
async def reset_user_password(
    user_id: UUID,
    current_user: CurrentUser = Depends(require_admin),
):
    """Generate a password reset link for the user."""
    uid = str(user_id)
    # Get user email first
    user_res = supabase.table("users").select("email").eq("id", uid).maybe_single().execute()
    if not user_res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    email = user_res.data.get("email")
    try:
        from integrations.email_service import send_templated_email
        from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

        link_res = supabase.auth.admin.generate_link({
            "type": "recovery",
            "email": email,
        })
        # Supabase strips path from redirect_to — fix it manually
        raw_link = link_res.properties.action_link
        correct_redirect = f"{settings.portal_url}/client_set_password.html"
        parsed = urlparse(raw_link)
        params = parse_qs(parsed.query, keep_blank_values=True)
        params["redirect_to"] = [correct_redirect]
        action_link = urlunparse(parsed._replace(query=urlencode({k: v[0] for k, v in params.items()})))

        # Get client name if any
        client_name = ""
        user_perms = supabase.table("user_company_permissions").select("client_id").eq("user_id", uid).execute().data
        if user_perms and user_perms[0].get("client_id"):
            client_res = supabase.table("clients").select("name").eq("id", user_perms[0]["client_id"]).execute().data
            if client_res:
                client_name = client_res[0].get("name", "")

        await send_templated_email(
            company_id=str(current_user.active_company_id),
            to_email=email,
            template_type="password_reset",
            variables={"client_name": client_name or "Utente", "magic_link": action_link}
        )
        return {"message": f"Link di reset inviato a {email}"}
    except Exception as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Errore invio reset: {exc}")


@router.post("/{user_id}/companies")
async def add_user_company(
    user_id: UUID,
    body: AddCompanyRequest,
    current_user: CurrentUser = Depends(require_admin),
):
    """Add a user to a company with a role."""
    if body.role not in ("admin", "operator"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ruolo non valido: admin o operator")
    try:
        res = supabase.table("user_company_permissions").upsert({
            "user_id":    str(user_id),
            "company_id": str(body.company_id),
            "role":       body.role,
            "is_default": False,
            "client_id":  str(body.client_id) if body.client_id else None,
        }, on_conflict="user_id,company_id").execute()
    except Exception as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc))
    return {"message": "Associazione aggiunta"}


@router.delete("/{user_id}/companies/{company_id}", status_code=204)
async def remove_user_company(
    user_id: UUID,
    company_id: UUID,
    current_user: CurrentUser = Depends(require_admin),
):
    """Remove a user's access to a company."""
    supabase.table("user_company_permissions") \
        .delete() \
        .eq("user_id", str(user_id)) \
        .eq("company_id", str(company_id)) \
        .execute()

@router.delete("/{user_id}", status_code=204)
async def delete_user(user_id: str, current_user: CurrentUser = Depends(require_admin)):
    """Hard delete a user from public.users and auth.users. Requires admin privileges."""
    try:
        # 1. Delete company permissions
        supabase.table("user_company_permissions").delete().eq("user_id", user_id).execute()
        # 2. Delete from CRM users table
        supabase.table("users").delete().eq("id", user_id).execute()
        # 3. Delete from Supabase Auth (admin API)
        try:
            supabase.auth.admin.delete_user(user_id)
        except Exception as auth_e:
            print(f"Could not delete from auth.users: {auth_e}")
            pass
    except Exception as e:
        print(f"Error during user hard delete: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete user completely")


@router.post("/invite")
async def invite_user(
    body: InviteUserRequest,
    user: CurrentUser = Depends(require_admin),
):
    """Invite a new user: create Supabase auth account + public.users row + permissions."""
    if body.role not in ("admin", "operator", "client"):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Ruolo non valido. Valori ammessi: admin, operator, client",
        )

    target_company_id = str(body.company_id) if body.company_id else str(user.active_company_id)

    # 1. Create Supabase Auth user via link generation (skips default email)
    try:
        from integrations.email_service import send_templated_email
        from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

        correct_redirect = f"{settings.portal_url}/client_set_password.html"

        link_res = supabase.auth.admin.generate_link({
            "type": "invite",
            "email": body.email,
        })
        sb_user = link_res.user
        raw_link = link_res.properties.action_link
        if not sb_user:
            raise ValueError("Supabase returned no user")

        # Supabase strips the path from redirect_to in generate_link; fix it manually
        parsed = urlparse(raw_link)
        params = parse_qs(parsed.query, keep_blank_values=True)
        params["redirect_to"] = [correct_redirect]
        new_query = urlencode({k: v[0] for k, v in params.items()})
        action_link = urlunparse(parsed._replace(query=new_query))

        client_name = body.name or "Utente"
        await send_templated_email(
            company_id=target_company_id,
            to_email=body.email,
            template_type="client_invite",
            lang="it", variables={"client_name": client_name, "magic_link": action_link}
        )
    except Exception as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            f"Impossibile creare utente e inviare invito: {exc}",
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
            "user_id":       sb_user.id,
            "company_id":    target_company_id,
            "role":          body.role,
            "client_id":     str(body.client_id) if body.client_id else None,
            "onboarding_id": str(body.onboarding_id) if body.onboarding_id else None,
            "is_default":    True,
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
        ).eq("user_id", uid).eq("company_id", current_user.tenant).execute()

    # Update active status in public.users
    if body.status is not None:
        is_active = body.status == "active"
        supabase.table("users").update(
            {"is_active": is_active}
        ).eq("id", uid).execute()

    return {"message": "User updated"}
