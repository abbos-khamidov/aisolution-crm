from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.core.deps import CurrentUser, require_founder, require_staff_role
from app.core.security import hash_password
from app.db.pool import get_pool

router = APIRouter(prefix="/users", tags=["users"])

USER_FIELDS = """
    id, name, phone, email, telegram_id, telegram_username, photo_url, quote,
    role, role_title, is_active, created_at
"""
Role = Literal["founder", "manager", "developer", "student"]


class UserIn(BaseModel):
    name: str
    email: str
    password: str | None = None
    phone: str | None = None
    telegram_id: int | None = None
    telegram_username: str | None = None
    photo_url: str | None = None
    quote: str | None = None
    role: Role
    role_title: str | None = None


class UserPatch(BaseModel):
    name: str | None = None
    email: str | None = None
    password: str | None = None
    phone: str | None = None
    telegram_id: int | None = None
    telegram_username: str | None = None
    photo_url: str | None = None
    quote: str | None = None
    role: Role | None = None
    role_title: str | None = None
    is_active: bool | None = None


class ProfilePatch(BaseModel):
    name: str | None = None
    phone: str | None = None
    telegram_username: str | None = None
    photo_url: str | None = None
    quote: str | None = None


@router.get("")
async def list_users(user: CurrentUser = Depends(require_staff_role)) -> list[dict]:
    pool = get_pool()
    rows = await pool.fetch(
        f"SELECT {USER_FIELDS} FROM users WHERE deleted_at IS NULL ORDER BY is_active DESC, name"
    )
    return [dict(r) for r in rows]


@router.get("/me")
async def get_me(user: CurrentUser = Depends(require_staff_role)) -> dict:
    pool = get_pool()
    row = await pool.fetchrow(
        f"SELECT {USER_FIELDS} FROM users WHERE id = $1 AND deleted_at IS NULL",
        user.id,
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return dict(row)


@router.patch("/me")
async def patch_me(body: ProfilePatch, user: CurrentUser = Depends(require_staff_role)) -> dict:
    pool = get_pool()
    row = await pool.fetchrow(
        f"""
        UPDATE users
        SET name = COALESCE($1, name),
            phone = COALESCE($2, phone),
            telegram_username = COALESCE($3, telegram_username),
            photo_url = COALESCE($4, photo_url),
            quote = COALESCE($5, quote)
        WHERE id = $6 AND deleted_at IS NULL
        RETURNING {USER_FIELDS}
        """,
        body.name,
        body.phone,
        body.telegram_username,
        body.photo_url,
        body.quote,
        user.id,
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return dict(row)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_user(body: UserIn, user: CurrentUser = Depends(require_founder)) -> dict:
    if body.role != "student" and not body.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password is required for team users",
        )

    pool = get_pool()
    try:
        row = await pool.fetchrow(
            f"""
            INSERT INTO users
                (name, phone, email, password_hash, telegram_id,
                 telegram_username, photo_url, quote, role, role_title)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING {USER_FIELDS}
            """,
            body.name,
            body.phone,
            body.email,
            hash_password(body.password) if body.password else None,
            body.telegram_id,
            body.telegram_username,
            body.photo_url,
            body.quote,
            body.role,
            body.role_title,
        )
    except Exception as err:
        if "users_email_key" in str(err) or "users_telegram_id_key" in str(err):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="User with this email or Telegram ID already exists",
            ) from err
        raise
    return dict(row)


@router.patch("/{user_id}")
async def patch_user(
    user_id: int, body: UserPatch, user: CurrentUser = Depends(require_founder)
) -> dict:
    pool = get_pool()
    row = await pool.fetchrow(
        f"""
        UPDATE users
        SET name = COALESCE($1, name),
            email = COALESCE($2, email),
            password_hash = COALESCE($3, password_hash),
            phone = COALESCE($4, phone),
            telegram_id = COALESCE($5, telegram_id),
            telegram_username = COALESCE($6, telegram_username),
            photo_url = COALESCE($7, photo_url),
            quote = COALESCE($8, quote),
            role = COALESCE($9, role),
            role_title = COALESCE($10, role_title),
            is_active = COALESCE($11, is_active)
        WHERE id = $12 AND deleted_at IS NULL
        RETURNING {USER_FIELDS}
        """,
        body.name,
        body.email,
        hash_password(body.password) if body.password else None,
        body.phone,
        body.telegram_id,
        body.telegram_username,
        body.photo_url,
        body.quote,
        body.role,
        body.role_title,
        body.is_active,
        user_id,
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return dict(row)
