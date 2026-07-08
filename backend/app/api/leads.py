import datetime as dt
from decimal import Decimal
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel

from app.core.config import settings
from app.core.deps import CurrentUser, require_sales_role
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
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING {LEAD_FIELDS}
                """,
                source,
                body.name,
                body.phone,
                body.email,
                body.message,
                body.utm,
            )
            await record_event(conn, "lead", row["id"], actor_id, "created", {"source": source})
    return _row_to_dict(row)


@router.post("/webhook/website", status_code=status.HTTP_201_CREATED)
async def website_webhook(body: WebsiteLeadIn) -> dict:
    return await _create_lead("website", body, actor_id=None)


# --- Instagram / Facebook (Meta) and Telegram lead-channel webhooks (phase 8) ---
#
# Each channel has its own wire format; all of them get normalized down to the
# same WebsiteLeadIn shape and go through the identical _create_lead ->
# claim/owner/status flow as a website lead (CRM_SPEC.md phase 8: "тот же
# flow claim/owner, что и для website — не создавай отдельную логику на
# канал, только разный парсинг входящего payload"). Channel-specific ids are
# kept in the `utm` jsonb, never as new columns.


def _meta_verify_challenge(request: Request) -> Response:
    """Meta (Instagram/Facebook) requires a GET handshake before it will ever
    POST webhook events to a URL: it sends hub.mode/hub.verify_token/
    hub.challenge and expects hub.challenge echoed back verbatim if the token
    matches.
    """
    params = request.query_params
    if (
        params.get("hub.mode") == "subscribe"
        and params.get("hub.verify_token") == settings.meta_webhook_verify_token
    ):
        return Response(content=params.get("hub.challenge", ""), media_type="text/plain")
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Verification failed")


@router.get("/webhook/instagram")
async def instagram_webhook_verify(request: Request) -> Response:
    return _meta_verify_challenge(request)


@router.post("/webhook/instagram", status_code=status.HTTP_201_CREATED)
async def instagram_webhook(body: dict[str, Any]) -> list[dict]:
    """Instagram Direct Message webhook (Meta Graph API messaging format):
    {"entry": [{"messaging": [{"sender": {"id": "..."}, "message": {"text": "..."}}]}]}
    DMs carry no name/email — the sender's platform-scoped id becomes the
    lead name, full raw payload preserved in utm for the sales team to trace.
    """
    created = []
    for entry in body.get("entry", []):
        for event in entry.get("messaging", []):
            sender_id = event.get("sender", {}).get("id")
            text = event.get("message", {}).get("text")
            if sender_id is None:
                continue
            lead = WebsiteLeadIn(
                name=f"Instagram user {sender_id}",
                message=text,
                utm={"platform": "instagram", "sender_id": sender_id},
            )
            created.append(await _create_lead("instagram", lead, actor_id=None))
    if not created:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No messaging events")
    return created


@router.get("/webhook/facebook")
async def facebook_webhook_verify(request: Request) -> Response:
    return _meta_verify_challenge(request)


@router.post("/webhook/facebook", status_code=status.HTTP_201_CREATED)
async def facebook_webhook(body: dict[str, Any]) -> list[dict]:
    """Meta Lead Ads ("leadgen") webhook format:
    {"entry": [{"changes": [{"field": "leadgen", "value": {
        "leadgen_id": "...", "form_id": "...",
        "field_data": [{"name": "full_name", "values": ["..."]}, ...]
    }}]}]}
    """
    created = []
    for entry in body.get("entry", []):
        for change in entry.get("changes", []):
            if change.get("field") != "leadgen":
                continue
            value = change.get("value", {})
            fields = {
                f["name"]: (f.get("values") or [None])[0] for f in value.get("field_data", [])
            }
            lead = WebsiteLeadIn(
                name=fields.get("full_name") or fields.get("first_name") or "Facebook lead",
                phone=fields.get("phone_number"),
                email=fields.get("email"),
                utm={
                    "platform": "facebook",
                    "leadgen_id": value.get("leadgen_id"),
                    "form_id": value.get("form_id"),
                },
            )
            created.append(await _create_lead("facebook", lead, actor_id=None))
    if not created:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No leadgen events")
    return created


@router.post("/webhook/telegram", status_code=status.HTTP_201_CREATED)
async def telegram_webhook(body: dict[str, Any]) -> dict:
    """Telegram Bot API update format for a public-facing sales inquiry bot
    (a *different* bot than the internal aisolutioncrm task bot in /bot —
    this one is whatever bot AI Solution links from its Telegram channel/ads):
    {"message": {"from": {"id": 123, "first_name": "...", "username": "..."}, "text": "..."}}
    """
    message = body.get("message", {})
    from_user = message.get("from", {})
    telegram_user_id = from_user.get("id")
    if telegram_user_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No message.from")

    name = (
        from_user.get("first_name")
        or from_user.get("username")
        or f"Telegram user {telegram_user_id}"
    )
    lead = WebsiteLeadIn(
        name=name,
        message=message.get("text"),
        utm={
            "platform": "telegram",
            "telegram_user_id": telegram_user_id,
            "username": from_user.get("username"),
        },
    )
    return await _create_lead("telegram", lead, actor_id=None)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_manual_lead(
    body: ManualLeadIn, user: CurrentUser = Depends(require_sales_role)
) -> dict:
    return await _create_lead(body.source, body, actor_id=user.id)


@router.get("")
async def list_leads(
    status_filter: str | None = Query(None, alias="status"),
    source: str | None = None,
    owner_id: int | None = None,
    user: CurrentUser = Depends(require_sales_role),
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

    if user.role != "founder":
        # manager: unclaimed queue + own leads only (CRM_SPEC.md section 6) —
        # applied as an extra AND, so a manager can't probe other owners'
        # leads via ?owner_id= either.
        params.append(user.id)
        conditions.append(f"(owner_id IS NULL OR owner_id = ${len(params)})")

    query = (
        f"SELECT {LEAD_FIELDS} FROM leads WHERE {' AND '.join(conditions)} "
        "ORDER BY created_at DESC"
    )
    rows = await pool.fetch(query, *params)
    return [_row_to_dict(r) for r in rows]


@router.post("/{lead_id}/claim")
async def claim_lead(lead_id: int, user: CurrentUser = Depends(require_sales_role)) -> dict:
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
    lead_id: int, body: LeadPatch, user: CurrentUser = Depends(require_sales_role)
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


class ConvertIn(BaseModel):
    company_name: str | None = None
    contact_info: dict[str, Any] = {}
    project_name: str
    description: str | None = None
    start_date: dt.date | None = None
    deadline: dt.date | None = None
    budget_total: Decimal | None = None
    currency: str | None = None


@router.post("/{lead_id}/convert", status_code=status.HTTP_201_CREATED)
async def convert_lead(
    lead_id: int, body: ConvertIn, user: CurrentUser = Depends(require_sales_role)
) -> dict:
    pool = get_pool()
    is_founder = user.role == "founder"

    async with pool.acquire() as conn:
        async with conn.transaction():
            lead = await conn.fetchrow(
                "SELECT id, name, status, owner_id FROM leads "
                "WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
                lead_id,
            )
            if lead is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
            if not is_founder and lead["owner_id"] != user.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only the lead owner or founder can convert this lead",
                )
            if lead["status"] != "won":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Lead must be status=won before it can be converted",
                )

            client = await conn.fetchrow(
                """
                INSERT INTO clients (lead_id, name, company_name, contact_info)
                VALUES ($1, $2, $3, $4)
                RETURNING id, lead_id, name, company_name, contact_info, created_at
                """,
                lead_id,
                lead["name"],
                body.company_name,
                body.contact_info,
            )

            project_owner_id = lead["owner_id"] or user.id
            project = await conn.fetchrow(
                """
                INSERT INTO projects
                    (client_id, name, description, owner_id, start_date, deadline,
                     budget_total, currency)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id, client_id, name, description, stage, owner_id, start_date,
                          deadline, budget_total, currency, created_at
                """,
                client["id"],
                body.project_name,
                body.description,
                project_owner_id,
                body.start_date,
                body.deadline,
                body.budget_total,
                body.currency,
            )

            await conn.execute(
                """
                INSERT INTO project_members (project_id, user_id, role_on_project)
                VALUES ($1, $2, 'lead')
                ON CONFLICT (project_id, user_id) DO NOTHING
                """,
                project["id"],
                project_owner_id,
            )

            await record_event(
                conn,
                "project",
                project["id"],
                user.id,
                "created",
                {"client_id": client["id"], "lead_id": lead_id},
            )
            await record_event(
                conn,
                "lead",
                lead_id,
                user.id,
                "converted",
                {"client_id": client["id"], "project_id": project["id"]},
            )

    return {"client": dict(client), "project": dict(project)}
