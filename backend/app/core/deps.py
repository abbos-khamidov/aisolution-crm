from dataclasses import dataclass

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

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
