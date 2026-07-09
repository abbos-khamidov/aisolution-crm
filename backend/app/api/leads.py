import datetime as dt
from decimal import Decimal
from typing import Any, Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel

from app.core.config import settings
from app.core.deps import CurrentUser, require_sales_role
from app.db.events import record_event
from app.db.pool import get_pool

router = APIRouter(prefix="/leads", tags=["leads"])

SOURCES = ("website", "instagram", "telegram", "facebook", "referral", "other")
STATUSES = ("new", "contacted", "qualified", "proposal_sent", "won", "lost")
STATUS_LABELS = {
    "new": "Новый",
    "contacted": "Связались",
    "qualified": "Квалифицирован",
    "proposal_sent": "КП отправлено",
    "won": "Выигран",
    "lost": "Потерян",
}

LEAD_FIELDS = """
    id, source, name, company_name, phone, email, message, utm, status, owner_id, loss_reason,
    created_at, first_response_at, archived_at, proposal_file_id,
    expected_amount_min, expected_amount_mid, expected_amount_max,
    selected_package, selected_amount, currency
"""


class WebsiteLeadIn(BaseModel):
    name: str
    company_name: str | None = None
    phone: str | None = None
    email: str | None = None
    message: str | None = None
    utm: dict[str, Any] = {}


class ManualLeadIn(BaseModel):
    source: Literal["instagram", "telegram", "facebook", "referral", "other"]
    name: str
    company_name: str | None = None
    phone: str | None = None
    email: str | None = None
    message: str | None = None
    utm: dict[str, Any] = {}


class LeadPatch(BaseModel):
    name: str | None = None
    company_name: str | None = None
    phone: str | None = None
    email: str | None = None
    status: Literal["new", "contacted", "qualified", "proposal_sent", "won", "lost"] | None = None
    loss_reason: str | None = None
    message: str | None = None
    owner_id: int | None = None
    proposal_file_id: int | None = None
    expected_amount_min: Decimal | None = None
    expected_amount_mid: Decimal | None = None
    expected_amount_max: Decimal | None = None
    selected_package: Literal["min", "mid", "max", "custom"] | None = None
    selected_amount: Decimal | None = None
    currency: str | None = None


class LeadNoteIn(BaseModel):
    text: str
    mentioned_user_id: int | None = None


def _row_to_dict(row) -> dict:
    return dict(row)


async def _pick_round_robin_manager(conn) -> int | None:
    """Least-loaded + longest-idle active manager (CRM_SPEC.md section 7 —
    auto round-robin, explicitly approved by founder on 2026-07-08 as the
    "separate decision" the spec deferred). Ties broken by whoever has gone
    longest without a new lead, so it behaves like a rotation rather than
    always favoring one manager when load is equal. Returns None if there
    are no active managers — a lead is never blocked on this, it just stays
    unowned (same as the pre-round-robin behavior).
    """
    return await conn.fetchval(
        """
        SELECT u.id
        FROM users u
        LEFT JOIN leads l
            ON l.owner_id = u.id AND l.deleted_at IS NULL AND l.status NOT IN ('won', 'lost')
        WHERE u.role = 'manager' AND u.is_active AND u.deleted_at IS NULL
        GROUP BY u.id
        ORDER BY COUNT(l.id) ASC, COALESCE(MAX(l.created_at), 'epoch'::timestamptz) ASC, u.id ASC
        LIMIT 1
        """
    )


async def _notify_lead_group(lead_id: int, actor_id: int | None, reason: str) -> None:
    if not settings.telegram_notify_bot_token or not settings.project_notify_chat_id:
        return

    pool = get_pool()
    row = await pool.fetchrow(
        """
        SELECT
            l.id, l.name, l.phone, l.source, l.status,
            owner.name AS owner_name,
            actor.name AS actor_name
        FROM leads l
        LEFT JOIN users owner ON owner.id = l.owner_id
        LEFT JOIN users actor ON actor.id = $2
        WHERE l.id = $1 AND l.deleted_at IS NULL
        """,
        lead_id,
        actor_id,
    )
    if row is None:
        return

    status_label = STATUS_LABELS.get(row["status"], row["status"])
    owner_name = row["owner_name"] or "не назначен"
    actor_name = row["actor_name"] or "CRM"
    reason_label = {
        "claim": "Лид взят в работу",
        "assign": "Лид закреплён",
        "status": "Стадия лида обновлена",
        "save": "Лид сохранён",
    }.get(reason, "Лид обновлён")
    phone_line = f"\nТелефон: {row['phone']}" if row["phone"] else ""
    message = (
        f"{reason_label}\n"
        f"Лид: {row['name']} #{row['id']}{phone_line}\n"
        f"Ответственный: {owner_name}\n"
        f"Стадия: {status_label}\n"
        f"Кто обновил: {actor_name}"
    )

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                f"https://api.telegram.org/bot{settings.telegram_notify_bot_token}/sendMessage",
                json={"chat_id": settings.project_notify_chat_id, "text": message},
            )
    except httpx.HTTPError:
        return


async def _ensure_won_lead_finance(conn, lead_id: int, actor_id: int, amount: Decimal) -> None:
    existing = await conn.fetchval(
        """
        SELECT fe.id
        FROM finance_entries fe
        JOIN projects p ON p.id = fe.project_id
        JOIN clients c ON c.id = p.client_id
        WHERE c.lead_id = $1
          AND fe.deleted_at IS NULL
          AND fe.category = 'lead_won'
        LIMIT 1
        """,
        lead_id,
    )
    if existing is not None:
        return

    lead = await conn.fetchrow(
        "SELECT id, name, phone, email, message, owner_id, currency FROM leads WHERE id = $1",
        lead_id,
    )
    if lead is None:
        return

    client = await conn.fetchrow(
        "SELECT id FROM clients WHERE lead_id = $1 AND deleted_at IS NULL LIMIT 1",
        lead_id,
    )
    if client is None:
        client = await conn.fetchrow(
            """
            INSERT INTO clients (lead_id, name, contact_info)
            VALUES ($1, $2, $3)
            RETURNING id
            """,
            lead_id,
            lead["name"],
            {"phone": lead["phone"], "email": lead["email"]},
        )

    project = await conn.fetchrow(
        """
        SELECT id FROM projects
        WHERE client_id = $1 AND deleted_at IS NULL
        ORDER BY id ASC
        LIMIT 1
        """,
        client["id"],
    )
    if project is None:
        project = await conn.fetchrow(
            """
            INSERT INTO projects (client_id, name, description, owner_id, budget_total, currency)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
            """,
            client["id"],
            lead["name"],
            lead["message"],
            lead["owner_id"] or actor_id,
            amount,
            lead["currency"],
        )
        await conn.execute(
            """
            INSERT INTO project_members (project_id, user_id, role_on_project)
            VALUES ($1, $2, 'lead')
            ON CONFLICT (project_id, user_id) DO NOTHING
            """,
            project["id"],
            lead["owner_id"] or actor_id,
        )
        await record_event(
            conn,
            "project",
            project["id"],
            actor_id,
            "created",
            {"lead_id": lead_id, "source": "won_lead"},
        )

    finance = await conn.fetchrow(
        """
        INSERT INTO finance_entries
            (project_id, type, amount, currency, status, description, category)
        VALUES ($1, 'invoice', $2, $3, 'pending', $4, 'lead_won')
        RETURNING id
        """,
        project["id"],
        amount,
        lead["currency"],
        f"Сделка выиграна из лида #{lead_id}: {lead['name']}",
    )
    await record_event(
        conn,
        "finance_entry",
        finance["id"],
        actor_id,
        "created",
        {"project_id": project["id"], "lead_id": lead_id, "source": "lead_won"},
    )


async def _create_lead(
    source: str, body: WebsiteLeadIn | ManualLeadIn, actor_id: int | None
) -> dict:
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            owner_id = await _pick_round_robin_manager(conn)

            row = await conn.fetchrow(
                f"""
                INSERT INTO leads
                    (source, name, company_name, phone, email, message, utm, owner_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING {LEAD_FIELDS}
                """,
                source,
                body.name,
                body.company_name,
                body.phone,
                body.email,
                body.message,
                body.utm,
                owner_id,
            )
            await record_event(conn, "lead", row["id"], actor_id, "created", {"source": source})
            if owner_id is not None:
                await record_event(
                    conn,
                    "lead",
                    row["id"],
                    None,
                    "assigned",
                    {"owner_id": owner_id, "reason": "round_robin"},
                )
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
    archived: bool = False,
    user: CurrentUser = Depends(require_sales_role),
) -> list[dict]:
    pool = get_pool()
    conditions = ["deleted_at IS NULL"]
    params: list = []

    conditions.append("archived_at IS NOT NULL" if archived else "archived_at IS NULL")

    if status_filter is not None:
        params.append(status_filter)
        conditions.append(f"status = ${len(params)}")
    if source is not None:
        params.append(source)
        conditions.append(f"source = ${len(params)}")
    if owner_id is not None:
        params.append(owner_id)
        conditions.append(f"owner_id = ${len(params)}")

    if user.role != "founder" and not user.can_view_all_leads:
        # manager: unclaimed queue + own leads only (CRM_SPEC.md section 6) —
        # applied as an extra AND, so a manager can't probe other owners'
        # leads via ?owner_id= either. Founder can lift this per-account via
        # users.can_view_all_leads (team page checkbox).
        params.append(user.id)
        conditions.append(f"(owner_id IS NULL OR owner_id = ${len(params)})")

    query = (
        f"SELECT {LEAD_FIELDS} FROM leads WHERE {' AND '.join(conditions)} "
        "ORDER BY created_at DESC"
    )
    rows = await pool.fetch(query, *params)
    return [_row_to_dict(r) for r in rows]


@router.get("/{lead_id}")
async def get_lead(lead_id: int, user: CurrentUser = Depends(require_sales_role)) -> dict:
    pool = get_pool()
    row = await pool.fetchrow(
        f"SELECT {LEAD_FIELDS} FROM leads WHERE id = $1 AND deleted_at IS NULL",
        lead_id,
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
    if user.role != "founder" and not user.can_view_all_leads:
        if row["owner_id"] is not None and row["owner_id"] != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Lead is not visible")
    return _row_to_dict(row)


@router.get("/{lead_id}/notes")
async def list_lead_notes(
    lead_id: int, user: CurrentUser = Depends(require_sales_role)
) -> list[dict]:
    pool = get_pool()
    lead = await pool.fetchrow(
        "SELECT id, owner_id FROM leads WHERE id = $1 AND deleted_at IS NULL", lead_id
    )
    if lead is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
    if user.role != "founder" and lead["owner_id"] != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Lead is not visible")

    rows = await pool.fetch(
        """
        SELECT e.id, e.actor_id, u.name AS actor_name, e.payload, e.created_at
        FROM events e
        LEFT JOIN users u ON u.id = e.actor_id
        WHERE e.entity_type = 'lead' AND e.entity_id = $1 AND e.event_type = 'note_added'
        ORDER BY e.created_at DESC
        """,
        lead_id,
    )
    return [dict(row) for row in rows]


@router.post("/{lead_id}/notes", status_code=status.HTTP_201_CREATED)
async def add_lead_note(
    lead_id: int, body: LeadNoteIn, user: CurrentUser = Depends(require_sales_role)
) -> dict:
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Note is empty")

    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            lead = await conn.fetchrow(
                "SELECT id, owner_id FROM leads WHERE id = $1 AND deleted_at IS NULL",
                lead_id,
            )
            if lead is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
            if user.role != "founder" and lead["owner_id"] != user.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only the lead owner or founder can add notes",
                )
            if body.mentioned_user_id is not None:
                mentioned = await conn.fetchval(
                    "SELECT id FROM users WHERE id = $1 AND is_active AND deleted_at IS NULL",
                    body.mentioned_user_id,
                )
                if mentioned is None:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Mentioned user not found",
                    )
            row = await conn.fetchrow(
                """
                INSERT INTO events (entity_type, entity_id, actor_id, event_type, payload)
                VALUES ('lead', $1, $2, 'note_added', $3)
                RETURNING id, actor_id, payload, created_at
                """,
                lead_id,
                user.id,
                {"text": text, "mentioned_user_id": body.mentioned_user_id},
            )
    return dict(row)


@router.post("/{lead_id}/archive")
async def archive_lead(lead_id: int, user: CurrentUser = Depends(require_sales_role)) -> dict:
    return await _set_lead_archive(lead_id, user, archived=True)


@router.post("/{lead_id}/unarchive")
async def unarchive_lead(lead_id: int, user: CurrentUser = Depends(require_sales_role)) -> dict:
    return await _set_lead_archive(lead_id, user, archived=False)


async def _set_lead_archive(lead_id: int, user: CurrentUser, archived: bool) -> dict:
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            current = await conn.fetchrow(
                "SELECT id, owner_id, archived_at FROM leads "
                "WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
                lead_id,
            )
            if current is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
            if user.role != "founder" and current["owner_id"] != user.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only the lead owner or founder can archive this lead",
                )
            row = await conn.fetchrow(
                f"""
                UPDATE leads
                SET archived_at = CASE WHEN $1 THEN now() ELSE NULL END
                WHERE id = $2
                RETURNING {LEAD_FIELDS}
                """,
                archived,
                lead_id,
            )
            await record_event(
                conn,
                "lead",
                lead_id,
                user.id,
                "archived" if archived else "unarchived",
                {},
            )
    return dict(row)


@router.post("/{lead_id}/claim")
async def claim_lead(lead_id: int, user: CurrentUser = Depends(require_sales_role)) -> dict:
    pool = get_pool()
    is_founder = user.role == "founder"

    async with pool.acquire() as conn:
        async with conn.transaction():
            current = await conn.fetchrow(
                "SELECT owner_id FROM leads WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
                lead_id,
            )
            if current is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")

            if current["owner_id"] == user.id:
                # Idempotent: round-robin may have already assigned this lead
                # to the same manager who's now clicking "claim" in the UI —
                # that's success, not a conflict.
                row = await conn.fetchrow(
                    f"SELECT {LEAD_FIELDS} FROM leads WHERE id = $1", lead_id
                )
                return _row_to_dict(row)

            if current["owner_id"] is not None and not is_founder:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Lead already claimed by another owner",
                )

            row = await conn.fetchrow(
                f"""
                UPDATE leads SET owner_id = $1 WHERE id = $2
                RETURNING {LEAD_FIELDS}
                """,
                user.id,
                lead_id,
            )
            await record_event(
                conn, "lead", lead_id, user.id, "assigned", {"owner_id": user.id}
            )
    await _notify_lead_group(lead_id, user.id, "claim")
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
    fields_set = body.model_fields_set
    if "name" in fields_set and not (body.name or "").strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Lead name is required")

    name = body.name.strip() if body.name is not None else None
    company_name = body.company_name.strip() or None if body.company_name is not None else None
    phone = body.phone.strip() or None if body.phone is not None else None
    email = body.email.strip() or None if body.email is not None else None
    message = body.message.strip() or None if body.message is not None else None

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
            if body.owner_id is not None and not is_founder:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only founder can reassign leads",
                )
            if body.owner_id is not None:
                assignee = await conn.fetchval(
                    "SELECT id FROM users "
                    "WHERE id = $1 AND role IN ('founder', 'manager', 'developer') "
                    "AND is_active AND deleted_at IS NULL",
                    body.owner_id,
                )
                if assignee is None:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Lead owner must be an active team member",
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
                    message = CASE WHEN $3 THEN $4 ELSE message END,
                    first_response_at = CASE WHEN $5 THEN now() ELSE first_response_at END,
                    owner_id = COALESCE($6, owner_id),
                    proposal_file_id = COALESCE($7, proposal_file_id),
                    expected_amount_min = COALESCE($8, expected_amount_min),
                    expected_amount_mid = COALESCE($9, expected_amount_mid),
                    expected_amount_max = COALESCE($10, expected_amount_max),
                    selected_package = COALESCE($11, selected_package),
                    selected_amount = COALESCE($12, selected_amount),
                    currency = COALESCE($13, currency),
                    name = CASE WHEN $14 THEN $15 ELSE name END,
                    company_name = CASE WHEN $16 THEN $17 ELSE company_name END,
                    phone = CASE WHEN $18 THEN $19 ELSE phone END,
                    email = CASE WHEN $20 THEN $21 ELSE email END
                WHERE id = $22
                RETURNING {LEAD_FIELDS}
                """,
                new_status,
                body.loss_reason,
                "message" in fields_set,
                message,
                set_first_response,
                body.owner_id,
                body.proposal_file_id,
                body.expected_amount_min,
                body.expected_amount_mid,
                body.expected_amount_max,
                body.selected_package,
                body.selected_amount,
                body.currency,
                "name" in fields_set,
                name,
                "company_name" in fields_set,
                company_name,
                "phone" in fields_set,
                phone,
                "email" in fields_set,
                email,
                lead_id,
            )

            if row["status"] == "won" and row["selected_amount"] is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="selected_amount is required when lead is won",
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
            elif {"name", "company_name", "phone", "email", "message"} & fields_set:
                await record_event(
                    conn,
                    "lead",
                    lead_id,
                    user.id,
                    "updated",
                    {
                        "fields": sorted(
                            {"name", "company_name", "phone", "email", "message"} & fields_set
                        )
                    },
                )
            if body.owner_id is not None and body.owner_id != current["owner_id"]:
                await record_event(
                    conn,
                    "lead",
                    lead_id,
                    user.id,
                    "assigned",
                    {"from": current["owner_id"], "owner_id": body.owner_id},
                )
            if row["status"] == "won":
                await _ensure_won_lead_finance(
                    conn, lead_id, user.id, Decimal(row["selected_amount"])
                )

    if body.owner_id is not None and body.owner_id != current["owner_id"]:
        await _notify_lead_group(lead_id, user.id, "assign")
    elif body.status is not None and body.status != current["status"]:
        await _notify_lead_group(lead_id, user.id, "status")

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
                "SELECT id, name, company_name, status, owner_id FROM leads "
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
                body.company_name or lead["company_name"],
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
