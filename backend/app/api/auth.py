import jwt
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_password,
)
from app.db.pool import get_pool

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class AccessTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest) -> TokenResponse:
    pool = get_pool()
    row = await pool.fetchrow(
        "SELECT id, role, password_hash FROM users "
        "WHERE email = $1 AND is_active AND deleted_at IS NULL",
        body.email,
    )
    if row is None or row["password_hash"] is None or not verify_password(
        body.password, row["password_hash"]
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    return TokenResponse(
        access_token=create_access_token(row["id"], row["role"]),
        refresh_token=create_refresh_token(row["id"], row["role"]),
    )


@router.post("/refresh", response_model=AccessTokenResponse)
async def refresh(body: RefreshRequest) -> AccessTokenResponse:
    try:
        payload = decode_token(body.refresh_token)
    except jwt.PyJWTError as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
        ) from err

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not a refresh token")

    pool = get_pool()
    row = await pool.fetchrow(
        "SELECT id, role FROM users WHERE id = $1 AND is_active AND deleted_at IS NULL",
        int(payload["sub"]),
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return AccessTokenResponse(access_token=create_access_token(row["id"], row["role"]))
