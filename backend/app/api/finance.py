import datetime as dt
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.core.deps import CurrentUser, require_founder, require_staff_role
from app.db.events import record_event
from app.db.pool import get_pool
from app.db.visibility import require_project_visible

router = APIRouter(tags=["finance"])

FinanceType = Literal["invoice", "payment", "expense"]
FinanceStatus = Literal["pending", "paid", "overdue"]

FINANCE_FIELDS = """
    id, project_id, type, amount, currency, status, due_date, paid_at,
    description, created_at
"""


class FinanceEntryIn(BaseModel):
    type: FinanceType
    amount: Decimal
    currency: str
    due_date: dt.date | None = None
    description: str | None = None


class FinanceEntryPatch(BaseModel):
    status: FinanceStatus | None = None
    paid_at: dt.datetime | None = None
    amount: Decimal | None = None
    due_date: dt.date | None = None
    description: str | None = None


@router.post("/projects/{project_id}/finance-entries", status_code=status.HTTP_201_CREATED)
async def create_finance_entry(
    project_id: int, body: FinanceEntryIn, user: CurrentUser = Depends(require_staff_role)
) -> dict:
    pool = get_pool()
    await require_project_visible(pool, user, project_id)
    async with pool.acquire() as conn:
        async with conn.transaction():
            project = await conn.fetchrow(
                "SELECT id FROM projects WHERE id = $1 AND deleted_at IS NULL", project_id
            )
            if project is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
                )
            row = await conn.fetchrow(
                f"""
                INSERT INTO finance_entries
                    (project_id, type, amount, currency, due_date, description)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING {FINANCE_FIELDS}
                """,
                project_id,
                body.type,
                body.amount,
                body.currency,
                body.due_date,
                body.description,
            )
            await record_event(
                conn, "finance_entry", row["id"], user.id, "created", {"project_id": project_id}
            )
    return dict(row)


@router.get("/projects/{project_id}/finance-entries")
async def list_finance_entries(
    project_id: int, user: CurrentUser = Depends(require_staff_role)
) -> list[dict]:
    pool = get_pool()
    await require_project_visible(pool, user, project_id)
    rows = await pool.fetch(
        f"SELECT {FINANCE_FIELDS} FROM finance_entries "
        "WHERE project_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC",
        project_id,
    )
    return [dict(r) for r in rows]


@router.patch("/finance-entries/{entry_id}")
async def patch_finance_entry(
    entry_id: int, body: FinanceEntryPatch, user: CurrentUser = Depends(require_staff_role)
) -> dict:
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            current = await conn.fetchrow(
                "SELECT fe.id, fe.status, fe.paid_at, p.owner_id FROM finance_entries fe "
                "JOIN projects p ON p.id = fe.project_id "
                "WHERE fe.id = $1 AND fe.deleted_at IS NULL FOR UPDATE OF fe",
                entry_id,
            )
            if current is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND, detail="Finance entry not found"
                )
            if user.role != "founder" and current["owner_id"] != user.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only the project owner or founder can modify finance entries",
                )

            new_status = body.status if body.status is not None else current["status"]
            new_paid_at = body.paid_at if body.paid_at is not None else current["paid_at"]
            if new_status == "paid" and new_paid_at is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="paid_at is required when status is set to paid",
                )

            row = await conn.fetchrow(
                f"""
                UPDATE finance_entries
                SET status = $1,
                    paid_at = $2,
                    amount = COALESCE($3, amount),
                    due_date = COALESCE($4, due_date),
                    description = COALESCE($5, description)
                WHERE id = $6
                RETURNING {FINANCE_FIELDS}
                """,
                new_status,
                new_paid_at,
                body.amount,
                body.due_date,
                body.description,
                entry_id,
            )

            if body.status is not None and body.status != current["status"]:
                await record_event(
                    conn,
                    "finance_entry",
                    entry_id,
                    user.id,
                    "status_changed",
                    {"from": current["status"], "to": body.status},
                )
            else:
                await record_event(conn, "finance_entry", entry_id, user.id, "updated", {})

    return dict(row)


async def compute_finance_summary(pool) -> dict:
    """Shared by GET /finance/summary and the phase 7 analytics revenue view
    — CRM_SPEC.md section 5 says analytics is computed from events/aggregates,
    not a separate analytics service, so this is the one query, reused.
    """
    by_client = await pool.fetch(
        """
        SELECT
            c.id AS client_id,
            c.name AS client_name,
            COALESCE(SUM(fe.amount) FILTER (WHERE fe.type = 'invoice'), 0) AS invoiced,
            COALESCE(
                SUM(fe.amount) FILTER (WHERE fe.type = 'invoice' AND fe.status = 'paid'), 0
            ) AS paid,
            COALESCE(
                SUM(fe.amount) FILTER (
                    WHERE fe.type = 'invoice' AND fe.status <> 'paid'
                    AND fe.due_date < CURRENT_DATE
                ), 0
            ) AS overdue
        FROM clients c
        JOIN projects p ON p.client_id = c.id AND p.deleted_at IS NULL
        JOIN finance_entries fe ON fe.project_id = p.id AND fe.deleted_at IS NULL
        WHERE c.deleted_at IS NULL
        GROUP BY c.id, c.name
        ORDER BY c.name
        """
    )

    by_month = await pool.fetch(
        """
        SELECT
            to_char(date_trunc('month', fe.created_at), 'YYYY-MM') AS month,
            COALESCE(SUM(fe.amount) FILTER (WHERE fe.type = 'invoice'), 0) AS invoiced,
            COALESCE(
                SUM(fe.amount) FILTER (WHERE fe.type = 'invoice' AND fe.status = 'paid'), 0
            ) AS paid
        FROM finance_entries fe
        WHERE fe.deleted_at IS NULL
        GROUP BY 1
        ORDER BY 1
        """
    )

    return {
        "by_client": [dict(r) for r in by_client],
        "by_month": [dict(r) for r in by_month],
    }


@router.get("/finance/summary")
async def finance_summary(user: CurrentUser = Depends(require_founder)) -> dict:
    return await compute_finance_summary(get_pool())
