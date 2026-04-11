"""
auth/middleware.py — JWT verification and current-user injection
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from uuid import UUID
from config import settings

bearer = HTTPBearer()


class CurrentUser:
    def __init__(self, user_id: UUID, active_company_id: UUID,
                 role: str, client_id: UUID | None, email: str,
                 onboarding_id: UUID | None = None):
        self.user_id = user_id
        self.active_company_id = active_company_id
        self.role = role
        self.client_id = client_id
        self.email = email
        self.onboarding_id = onboarding_id

    @property
    def is_admin(self) -> bool:
        return self.role in ("super_admin", "admin")

    @property
    def cid(self) -> str | None:
        """company_id for READ filters. None = super_admin sees all companies."""
        return None if self.role == "super_admin" else str(self.active_company_id)

    @property
    def tenant(self) -> str:
        """usato nel monkey patch postgrest per bypassare il controllo per super_admin"""
        return "BYPASS_RLS_SUPERADMIN" if self.role == "super_admin" else str(self.active_company_id)


def apply_cid(q, user: "CurrentUser"):
    """Conditionally apply company_id filter. Skips for super_admin."""
    if user.cid:
        return q.eq("company_id", user.cid)
    return q


def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer)
) -> CurrentUser:
    token = creds.credentials
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token expired")
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")

    return CurrentUser(
        user_id=UUID(payload["sub"]),
        active_company_id=UUID(payload["active_company_id"]),
        role=payload["role"],
        client_id=UUID(payload["client_id"]) if payload.get("client_id") else None,
        email=payload.get("email", ""),
        onboarding_id=UUID(payload["onboarding_id"]) if payload.get("onboarding_id") else None,
    )


def require_admin(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
    return user


def require_client(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if not user.client_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Client access required")
    return user


def require_internal(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if user.role == "client":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Internal access required")
    return user
