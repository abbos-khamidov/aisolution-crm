import json
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.core.deps import CurrentUser, get_current_user
from app.db.events import record_event
from app.db.pool import get_pool

router = APIRouter(prefix="/leads", tags=["leads"])

SOURCES = ("website", "instagram", "telegram", "facebook", "referral", "other")
STATUSES = ("new", "contacted", "qualified", "proposal_sent", "won", "lost")

LEAD_FIELDS = """
    id, source, name, phone, email, message, utm, status, owner_id, loss_reason,
    created_at, first_response_at
"""


class WebsiteLeadIn(BaseModel):
    name: str
    phone: str | None = None
    email: str | None = None
    message: str | None = None
    utm: dict[str, Any] = {}


class ManualLeadIn(BaseModel):
    source: Literal["instagram", "telegram", "facebook", "referral", "other"]
    name: str
    phone: str | None = None
    email: str | None = None
    message: str | None = None
    utm: dict[str, Any] = {}


class LeadPatch(BaseModel):
    status: Literal["new", "contacted", "qualified", "proposal_sent", "won", "lost"] | None = None
    loss_reason: str | None = None
    message: str | None = None


def _row_to_dict(row) -> dict:
    return dict(row)


async def _create_lead(
    source: str, body: WebsiteLeadIn | ManualLeadIn, actor_id: int | None
) -> dict:
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                f"""
                INSERT INTO leads (source, name, phone, email, message, utm)
                VALUES ($1, $2, $3, $4, $5, $6::jsonb)
                RETURNING {LEAD_FIELDS}
                """,
                source,
                body.name,
                body.phone,
                body.email,
                body.message,
                json.dumps(body.utm),
            )
            await record_event(conn, "lead", row["id"], actor_id, "created", {"source": source})
    return _row_to_dict(row)


@router.post("/webhook/website", status_code=status.HTTP_201_CREATED)
async def website_webhook(body: WebsiteLeadIn) -> dict:
    return await _create_lead("website", body, actor_id=None)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_manual_lead(
    body: ManualLeadIn, user: CurrentUser = Depends(get_current_user)
) -> dict:
    return await _create_lead(body.source, body, actor_id=user.id)


@router.get("")
async def list_leads(
    status_filter: str | None = Query(None, alias="status"),
    source: str | None = None,
    owner_id: int | None = None,
    user: CurrentUser = Depends(get_current_user),
) -> list[dict]:
    pool = get_pool()
    conditions = ["deleted_at IS NULL"]
    params: list = []

    if status_filter is not None:
        params.append(status_filter)
        conditions.append(f"status = ${len(params)}")
    if source is not None:
        params.append(source)
        conditions.append(f"source = ${len(params)}")
    if owner_id is not None:
        params.append(owner_id)
        conditions.append(f"owner_id = ${len(params)}")

    query = (
        f"SELECT {LEAD_FIELDS} FROM leads WHERE {' AND '.join(conditions)} "
        "ORDER BY created_at DESC"
    )
    rows = await pool.fetch(query, *params)
    return [_row_to_dict(r) for r in rows]


@router.post("/{lead_id}/claim")
async def claim_lead(lead_id: int, user: CurrentUser = Depends(get_current_user)) -> dict:
    pool = get_pool()
    is_founder = user.role == "founder"

    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                f"""
                UPDATE leads
                SET owner_id = $1
                WHERE id = $2 AND deleted_at IS NULL AND (owner_id IS NULL OR $3)
                RETURNING {LEAD_FIELDS}
                """,
                user.id,
                lead_id,
                is_founder,
            )
            if row is None:
                existing = await conn.fetchrow(
                    "SELECT id, owner_id FROM leads WHERE id = $1 AND deleted_at IS NULL", lead_id
                )
                if existing is None:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found"
                    )
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Lead already claimed by another owner",
                )
            await record_event(
                conn, "lead", lead_id, user.id, "assigned", {"owner_id": user.id}
            )
    return _row_to_dict(row)


@router.patch("/{lead_id}")
async def patch_lead(
    lead_id: int, body: LeadPatch, user: CurrentUser = Depends(get_current_user)
) -> dict:
    if body.status == "lost" and not body.loss_reason:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="loss_reason is required when status is set to lost",
        )

    pool = get_pool()
    is_founder = user.role == "founder"

    async with pool.acquire() as conn:
        async with conn.transaction():
            current = await conn.fetchrow(
                "SELECT id, status, owner_id, first_response_at FROM leads "
                "WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
                lead_id,
            )
            if current is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")

            if not is_founder and current["owner_id"] != user.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only the lead owner or founder can modify this lead",
                )

            new_status = body.status if body.status is not None else current["status"]
            set_first_response = (
                body.status is not None
                and current["status"] == "new"
                and body.status != "new"
                and current["first_response_at"] is None
            )

            row = await conn.fetchrow(
                f"""
                UPDATE leads
                SET status = $1,
                    loss_reason = COALESCE($2, loss_reason),
                    message = COALESCE($3, message),
                    first_response_at = CASE WHEN $4 THEN now() ELSE first_response_at END
                WHERE id = $5
                RETURNING {LEAD_FIELDS}
                """,
                new_status,
                body.loss_reason,
                body.message,
                set_first_response,
                lead_id,
            )

            if body.status is not None and body.status != current["status"]:
                await record_event(
                    conn,
                    "lead",
                    lead_id,
                    user.id,
                    "status_changed",
                    {
                        "from": current["status"],
                        "to": body.status,
                        "reason": body.loss_reason,
                    },
                )
            elif body.message is not None:
                await record_event(conn, "lead", lead_id, user.id, "note_added", {})

    return _row_to_dict(row)
