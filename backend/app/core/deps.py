from dataclasses import dataclass

import jwt
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings
from app.core.security import decode_token
from app.db.pool import get_pool

_bearer = HTTPBearer()


@dataclass
class CurrentUser:
    id: int
    role: str


async def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
) -> CurrentUser:
    try:
        payload = decode_token(creds.credentials)
    except jwt.PyJWTError as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        ) from err

    if payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not an access token")

    user_id = int(payload["sub"])
    pool = get_pool()
    row = await pool.fetchrow(
        "SELECT id, role FROM users WHERE id = $1 AND is_active AND deleted_at IS NULL",
        user_id,
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return CurrentUser(id=row["id"], role=row["role"])


async def require_founder(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if user.role != "founder":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Founder only")
    return user


async def require_staff_role(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """Projects/finance/files are internal team surfaces. Students only get
    their own tasks (CRM_SPEC.md section 6: "student — только назначенные
    таски... веб — read-only минимальный список своих тасков").
    """
    if user.role == "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Students cannot access this resource"
        )
    return user


async def require_sales_role(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """Leads are a sales concept (CRM_SPEC.md section 6): founder sees/does
    everything, manager owns the sales pipeline. developer/student have no
    business reason to touch leads at all.
    """
    if user.role not in ("founder", "manager"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Only founder or manager can access leads"
        )
    return user


async def verify_internal_secret(x_internal_secret: str = Header(...)) -> None:
    """Auth for bot<->CRM internal endpoints. The bot is not a `users` row (it
    has no password) and never calls the JWT-protected endpoints, per
    CRM_SPEC.md's "бот только через внутренний REST API" constraint.
    """
    if x_internal_secret != settings.internal_bot_secret:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid internal secret"
        )
