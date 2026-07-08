import datetime as dt
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.core.deps import CurrentUser, get_current_user, verify_internal_secret
from app.db.bot_notify import push_task_to_bot
from app.db.events import record_event
from app.db.pool import get_pool

router = APIRouter(tags=["tasks"])

TaskStatus = Literal["todo", "in_progress", "done", "blocked"]

TASK_FIELDS = """
    id, project_id, assigned_to, created_by, title, description, status,
    due_date, telegram_message_id, completed_at, created_at
"""

# Same columns, qualified with the `t` alias — needed when tasks is joined
# against another table (e.g. users) whose columns would otherwise collide
# (both tasks and users have an `id` column).
TASK_FIELDS_T = """
    t.id, t.project_id, t.assigned_to, t.created_by, t.title, t.description,
    t.status, t.due_date, t.telegram_message_id, t.completed_at, t.created_at
"""


class TaskIn(BaseModel):
    assigned_to: int
    project_id: int | None = None
    title: str
    description: str | None = None
    due_date: dt.date | None = None


class TaskPatch(BaseModel):
    title: str | None = None
    description: str | None = None
    status: TaskStatus | None = None
    due_date: dt.date | None = None


def _can_edit_task(user: CurrentUser, task) -> bool:
    return user.role == "founder" or task["assigned_to"] == user.id or task["created_by"] == user.id


@router.post("/tasks", status_code=status.HTTP_201_CREATED)
async def create_task(body: TaskIn, user: CurrentUser = Depends(get_current_user)) -> dict:
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            assignee = await conn.fetchrow(
                "SELECT id, telegram_id FROM users WHERE id = $1 AND deleted_at IS NULL",
                body.assigned_to,
            )
            if assignee is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND, detail="Assignee not found"
                )

            row = await conn.fetchrow(
                f"""
                INSERT INTO tasks
                    (project_id, assigned_to, created_by, title, description, due_date)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING {TASK_FIELDS}
                """,
                body.project_id,
                body.assigned_to,
                user.id,
                body.title,
                body.description,
                body.due_date,
            )
            await record_event(conn, "task", row["id"], user.id, "created", {})

    if assignee["telegram_id"]:
        due = body.due_date.isoformat() if body.due_date else None
        await push_task_to_bot(assignee["telegram_id"], row["id"], body.title, due)

    return dict(row)


@router.get("/tasks")
async def list_tasks(
    assigned_to: int | None = None,
    status_filter: str | None = None,
    project_id: int | None = None,
    overdue: bool = False,
    user: CurrentUser = Depends(get_current_user),
) -> list[dict]:
    pool = get_pool()
    conditions = ["deleted_at IS NULL"]
    params: list = []

    if assigned_to is not None:
        params.append(assigned_to)
        conditions.append(f"assigned_to = ${len(params)}")
    if status_filter is not None:
        params.append(status_filter)
        conditions.append(f"status = ${len(params)}")
    if project_id is not None:
        params.append(project_id)
        conditions.append(f"project_id = ${len(params)}")
    if overdue:
        conditions.append("due_date < CURRENT_DATE AND status <> 'done'")

    query = (
        f"SELECT {TASK_FIELDS} FROM tasks WHERE {' AND '.join(conditions)} "
        "ORDER BY due_date NULLS LAST"
    )
    rows = await pool.fetch(query, *params)
    return [dict(r) for r in rows]


@router.get("/tasks/overdue-dashboard")
async def overdue_dashboard(user: CurrentUser = Depends(get_current_user)) -> list[dict]:
    pool = get_pool()
    rows = await pool.fetch(
        """
        SELECT
            u.id AS assigned_to,
            u.name AS assigned_to_name,
            COUNT(*) AS overdue_count,
            array_agg(t.id ORDER BY t.due_date) AS task_ids
        FROM tasks t
        JOIN users u ON u.id = t.assigned_to
        WHERE t.deleted_at IS NULL AND t.status <> 'done' AND t.due_date < CURRENT_DATE
        GROUP BY u.id, u.name
        ORDER BY overdue_count DESC
        """
    )
    return [dict(r) for r in rows]


@router.patch("/tasks/{task_id}")
async def patch_task(
    task_id: int, body: TaskPatch, user: CurrentUser = Depends(get_current_user)
) -> dict:
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            current = await conn.fetchrow(
                f"SELECT {TASK_FIELDS} FROM tasks WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
                task_id,
            )
            if current is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
            if not _can_edit_task(user, current):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only the assignee, creator, or founder can modify this task",
                )

            completed_at = current["completed_at"]
            if body.status == "done" and current["status"] != "done":
                completed_at = dt.datetime.now(dt.UTC)
            elif body.status is not None and body.status != "done":
                completed_at = None

            row = await conn.fetchrow(
                f"""
                UPDATE tasks
                SET title = COALESCE($1, title),
                    description = COALESCE($2, description),
                    status = COALESCE($3, status),
                    due_date = COALESCE($4, due_date),
                    completed_at = $5
                WHERE id = $6
                RETURNING {TASK_FIELDS}
                """,
                body.title,
                body.description,
                body.status,
                body.due_date,
                completed_at,
                task_id,
            )

            if body.status is not None and body.status != current["status"]:
                await record_event(
                    conn,
                    "task",
                    task_id,
                    user.id,
                    "status_changed",
                    {"from": current["status"], "to": body.status},
                )
            else:
                await record_event(conn, "task", task_id, user.id, "updated", {})

    return dict(row)


# --- Internal endpoints for the aiogram bot process (shared-secret auth, no JWT) ---

internal_router = APIRouter(
    prefix="/internal/bot", tags=["bot-internal"], dependencies=[Depends(verify_internal_secret)]
)


@internal_router.get("/tasks")
async def bot_list_tasks(telegram_id: int) -> list[dict]:
    pool = get_pool()
    rows = await pool.fetch(
        f"""
        SELECT {TASK_FIELDS_T} FROM tasks t
        JOIN users u ON u.id = t.assigned_to
        WHERE u.telegram_id = $1 AND t.deleted_at IS NULL AND t.status <> 'done'
        ORDER BY t.due_date NULLS LAST
        """,
        telegram_id,
    )
    return [dict(r) for r in rows]


class BotCompleteIn(BaseModel):
    telegram_id: int


@internal_router.post("/tasks/{task_id}/complete")
async def bot_complete_task(task_id: int, body: BotCompleteIn) -> dict:
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            task = await conn.fetchrow(
                """
                SELECT t.id, t.status FROM tasks t
                JOIN users u ON u.id = t.assigned_to
                WHERE t.id = $1 AND u.telegram_id = $2 AND t.deleted_at IS NULL
                FOR UPDATE OF t
                """,
                task_id,
                body.telegram_id,
            )
            if task is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Task not found for this telegram_id",
                )

            row = await conn.fetchrow(
                f"""
                UPDATE tasks SET status = 'done', completed_at = now()
                WHERE id = $1
                RETURNING {TASK_FIELDS}
                """,
                task_id,
            )
            if task["status"] != "done":
                await record_event(
                    conn,
                    "task",
                    task_id,
                    None,
                    "status_changed",
                    {"from": task["status"], "to": "done", "via": "telegram_bot"},
                )
    return dict(row)
