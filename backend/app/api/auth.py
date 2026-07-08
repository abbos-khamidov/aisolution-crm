import datetime as dt
import secrets

import jwt
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.core.config import settings
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


class TelegramLoginStartResponse(BaseModel):
    token: str
    deep_link: str
    expires_at: dt.datetime


@router.post("/telegram/start", response_model=TelegramLoginStartResponse)
async def telegram_login_start() -> TelegramLoginStartResponse:
    """Step 1 of the student login flow (CRM_SPEC.md: deep-link + one-time
    token, not password). Frontend calls this, shows the deep_link (as a
    button/QR), then polls /auth/telegram/{token}/poll until confirmed.
    """
    token = secrets.token_urlsafe(24)
    expires_at = dt.datetime.now(dt.UTC) + dt.timedelta(
        minutes=settings.telegram_login_token_ttl_minutes
    )
    pool = get_pool()
    await pool.execute(
        "INSERT INTO login_tokens (token, expires_at) VALUES ($1, $2)", token, expires_at
    )
    deep_link = f"https://t.me/{settings.telegram_bot_username}?start={token}"
    return TelegramLoginStartResponse(token=token, deep_link=deep_link, expires_at=expires_at)


class TelegramPollResponse(BaseModel):
    status: str
    access_token: str | None = None
    refresh_token: str | None = None


@router.get("/telegram/{token}/poll", response_model=TelegramPollResponse)
async def telegram_login_poll(token: str) -> TelegramPollResponse:
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                "SELECT status, user_id, expires_at FROM login_tokens WHERE token = $1 FOR UPDATE",
                token,
            )
            if row is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown token")
            if row["status"] == "pending" and row["expires_at"] < dt.datetime.now(dt.UTC):
                raise HTTPException(status_code=status.HTTP_410_GONE, detail="Token expired")
            if row["status"] in ("pending", "rejected"):
                return TelegramPollResponse(status=row["status"])
            if row["status"] == "consumed":
                raise HTTPException(status_code=status.HTTP_410_GONE, detail="Token already used")

            # status == 'confirmed': issue tokens, single-use from here on
            user = await conn.fetchrow(
                "SELECT id, role FROM users WHERE id = $1 AND is_active AND deleted_at IS NULL",
                row["user_id"],
            )
            if user is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

            await conn.execute(
                "UPDATE login_tokens SET status = 'consumed', consumed_at = now() WHERE token = $1",
                token,
            )

    return TelegramPollResponse(
        status="confirmed",
        access_token=create_access_token(user["id"], user["role"]),
        refresh_token=create_refresh_token(user["id"], user["role"]),
    )
