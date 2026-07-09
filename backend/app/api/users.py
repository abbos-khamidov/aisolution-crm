from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel

from app.core.deps import CurrentUser, require_founder, require_staff_role
from app.core.security import hash_password
from app.db.events import record_event
from app.db.pool import get_pool

router = APIRouter(prefix="/users", tags=["users"])

USER_FIELDS = """
    id, name, phone, email, telegram_id, telegram_username, photo_url, quote,
    role, role_title, is_active, created_at, archived_at,
    can_view_all_leads, can_view_analytics, can_view_finance
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
    can_view_all_leads: bool = False
    can_view_analytics: bool = False
    can_view_finance: bool = False


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
    can_view_all_leads: bool | None = None
    can_view_analytics: bool | None = None
    can_view_finance: bool | None = None


class ProfilePatch(BaseModel):
    name: str | None = None
    phone: str | None = None
    telegram_username: str | None = None
    photo_url: str | None = None
    quote: str | None = None


@router.get("")
async def list_users(
    archived: bool = False, user: CurrentUser = Depends(require_staff_role)
) -> list[dict]:
    pool = get_pool()
    condition = "archived_at IS NOT NULL" if archived else "archived_at IS NULL"
    rows = await pool.fetch(
        f"""
        SELECT {USER_FIELDS} FROM users
        WHERE deleted_at IS NULL AND {condition}
        ORDER BY is_active DESC, name
        """
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


@router.head("/me")
async def head_me(user: CurrentUser = Depends(require_staff_role)) -> Response:
    return Response(status_code=status.HTTP_200_OK)


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
                 telegram_username, photo_url, quote, role, role_title,
                 can_view_all_leads, can_view_analytics, can_view_finance)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
            body.can_view_all_leads,
            body.can_view_analytics,
            body.can_view_finance,
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
            is_active = COALESCE($11, is_active),
            can_view_all_leads = COALESCE($12, can_view_all_leads),
            can_view_analytics = COALESCE($13, can_view_analytics),
            can_view_finance = COALESCE($14, can_view_finance)
        WHERE id = $15 AND deleted_at IS NULL
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
        body.can_view_all_leads,
        body.can_view_analytics,
        body.can_view_finance,
        user_id,
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return dict(row)


@router.post("/{user_id}/archive")
async def archive_user(
    user_id: int, user: CurrentUser = Depends(require_founder)
) -> dict:
    return await _set_user_archive(user_id, user, archived=True)


@router.post("/{user_id}/unarchive")
async def unarchive_user(
    user_id: int, user: CurrentUser = Depends(require_founder)
) -> dict:
    return await _set_user_archive(user_id, user, archived=False)


async def _set_user_archive(user_id: int, user: CurrentUser, archived: bool) -> dict:
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            current = await conn.fetchrow(
                "SELECT id, role FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
                user_id,
            )
            if current is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
            if archived and current["role"] == "founder":
                # Archiving is a founder-only action, but archiving the last
                # founder account would leave no one able to unarchive
                # anyone — not worth the edge case of tracking "last founder".
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot archive a founder account",
                )
            row = await conn.fetchrow(
                f"""
                UPDATE users
                SET archived_at = CASE WHEN $1 THEN now() ELSE NULL END,
                    is_active = CASE WHEN $1 THEN false ELSE is_active END
                WHERE id = $2
                RETURNING {USER_FIELDS}
                """,
                archived,
                user_id,
            )
            await record_event(
                conn,
                "user",
                user_id,
                user.id,
                "archived" if archived else "unarchived",
                {},
            )
    return dict(row)
