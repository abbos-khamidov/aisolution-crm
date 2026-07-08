import datetime as dt
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.core.deps import CurrentUser, get_current_user
from app.db.events import record_event
from app.db.pool import get_pool

router = APIRouter(tags=["projects"])

PROJECT_FIELDS = """
    id, client_id, name, description, stage, owner_id, start_date, deadline,
    budget_total, currency, created_at,
    CASE
        WHEN deadline IS NULL THEN 'none'
        WHEN deadline < CURRENT_DATE THEN 'red'
        WHEN deadline < CURRENT_DATE + INTERVAL '7 days' THEN 'yellow'
        ELSE 'green'
    END AS deadline_status
"""


Stage = Literal[
    "discovery",
    "proposal",
    "contract",
    "in_progress",
    "review",
    "completed",
    "paused",
    "cancelled",
]


class ProjectIn(BaseModel):
    client_id: int
    name: str
    description: str | None = None
    stage: Stage = "discovery"
    owner_id: int | None = None
    start_date: dt.date | None = None
    deadline: dt.date | None = None
    budget_total: Decimal | None = None
    currency: str | None = None


class ProjectPatch(BaseModel):
    name: str | None = None
    description: str | None = None
    stage: Stage | None = None
    owner_id: int | None = None
    start_date: dt.date | None = None
    deadline: dt.date | None = None
    budget_total: Decimal | None = None
    currency: str | None = None


class MemberIn(BaseModel):
    user_id: int
    role_on_project: Literal["lead", "contributor"]


class MilestoneIn(BaseModel):
    title: str
    due_date: dt.date | None = None


class MilestonePatch(BaseModel):
    title: str | None = None
    due_date: dt.date | None = None
    status: Literal["pending", "done", "overdue"] | None = None


async def _get_project_or_404(conn, project_id: int, for_update: bool = False):
    suffix = " FOR UPDATE" if for_update else ""
    row = await conn.fetchrow(
        f"SELECT id, owner_id, stage FROM projects "
        f"WHERE id = $1 AND deleted_at IS NULL{suffix}",
        project_id,
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return row


def _can_edit_project(user: CurrentUser, owner_id: int | None) -> bool:
    return user.role == "founder" or owner_id == user.id


@router.post("/projects", status_code=status.HTTP_201_CREATED)
async def create_project(body: ProjectIn, user: CurrentUser = Depends(get_current_user)) -> dict:
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                f"""
                INSERT INTO projects
                    (client_id, name, description, stage, owner_id, start_date,
                     deadline, budget_total, currency)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING {PROJECT_FIELDS}
                """,
                body.client_id,
                body.name,
                body.description,
                body.stage,
                body.owner_id,
                body.start_date,
                body.deadline,
                body.budget_total,
                body.currency,
            )
            await record_event(
                conn, "project", row["id"], user.id, "created", {"client_id": body.client_id}
            )
    return dict(row)


@router.get("/projects")
async def list_projects(
    stage: str | None = None,
    owner_id: int | None = None,
    client_id: int | None = None,
    user: CurrentUser = Depends(get_current_user),
) -> list[dict]:
    pool = get_pool()
    conditions = ["deleted_at IS NULL"]
    params: list = []

    if stage is not None:
        params.append(stage)
        conditions.append(f"stage = ${len(params)}")
    if owner_id is not None:
        params.append(owner_id)
        conditions.append(f"owner_id = ${len(params)}")
    if client_id is not None:
        params.append(client_id)
        conditions.append(f"client_id = ${len(params)}")

    query = (
        f"SELECT {PROJECT_FIELDS} FROM projects WHERE {' AND '.join(conditions)} "
        "ORDER BY created_at DESC"
    )
    rows = await pool.fetch(query, *params)
    return [dict(r) for r in rows]


@router.get("/projects/{project_id}")
async def get_project(project_id: int, user: CurrentUser = Depends(get_current_user)) -> dict:
    pool = get_pool()
    row = await pool.fetchrow(
        f"SELECT {PROJECT_FIELDS} FROM projects WHERE id = $1 AND deleted_at IS NULL", project_id
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return dict(row)


@router.patch("/projects/{project_id}")
async def patch_project(
    project_id: int, body: ProjectPatch, user: CurrentUser = Depends(get_current_user)
) -> dict:
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            current = await _get_project_or_404(conn, project_id, for_update=True)
            if not _can_edit_project(user, current["owner_id"]):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only the project owner or founder can modify this project",
                )

            row = await conn.fetchrow(
                f"""
                UPDATE projects
                SET name = COALESCE($1, name),
                    description = COALESCE($2, description),
                    stage = COALESCE($3, stage),
                    owner_id = COALESCE($4, owner_id),
                    start_date = COALESCE($5, start_date),
                    deadline = COALESCE($6, deadline),
                    budget_total = COALESCE($7, budget_total),
                    currency = COALESCE($8, currency)
                WHERE id = $9
                RETURNING {PROJECT_FIELDS}
                """,
                body.name,
                body.description,
                body.stage,
                body.owner_id,
                body.start_date,
                body.deadline,
                body.budget_total,
                body.currency,
                project_id,
            )

            if body.stage is not None and body.stage != current["stage"]:
                await record_event(
                    conn,
                    "project",
                    project_id,
                    user.id,
                    "status_changed",
                    {"from": current["stage"], "to": body.stage},
                )
            else:
                await record_event(conn, "project", project_id, user.id, "updated", {})

    return dict(row)


@router.post("/projects/{project_id}/members", status_code=status.HTTP_201_CREATED)
async def add_member(
    project_id: int, body: MemberIn, user: CurrentUser = Depends(get_current_user)
) -> dict:
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            current = await _get_project_or_404(conn, project_id)
            if not _can_edit_project(user, current["owner_id"]):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only the project owner or founder can manage members",
                )
            row = await conn.fetchrow(
                """
                INSERT INTO project_members (project_id, user_id, role_on_project)
                VALUES ($1, $2, $3)
                ON CONFLICT (project_id, user_id)
                DO UPDATE SET role_on_project = $3, deleted_at = NULL
                RETURNING project_id, user_id, role_on_project, created_at
                """,
                project_id,
                body.user_id,
                body.role_on_project,
            )
            await record_event(
                conn,
                "project",
                project_id,
                user.id,
                "member_added",
                {"user_id": body.user_id, "role_on_project": body.role_on_project},
            )
    return dict(row)


@router.get("/projects/{project_id}/members")
async def list_members(
    project_id: int, user: CurrentUser = Depends(get_current_user)
) -> list[dict]:
    pool = get_pool()
    rows = await pool.fetch(
        "SELECT project_id, user_id, role_on_project, created_at FROM project_members "
        "WHERE project_id = $1 AND deleted_at IS NULL",
        project_id,
    )
    return [dict(r) for r in rows]


@router.delete(
    "/projects/{project_id}/members/{member_user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_member(
    project_id: int, member_user_id: int, user: CurrentUser = Depends(get_current_user)
) -> None:
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            current = await _get_project_or_404(conn, project_id)
            if not _can_edit_project(user, current["owner_id"]):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only the project owner or founder can manage members",
                )
            await conn.execute(
                "UPDATE project_members SET deleted_at = now() "
                "WHERE project_id = $1 AND user_id = $2 AND deleted_at IS NULL",
                project_id,
                member_user_id,
            )
            await record_event(
                conn, "project", project_id, user.id, "member_removed", {"user_id": member_user_id}
            )


@router.post("/projects/{project_id}/milestones", status_code=status.HTTP_201_CREATED)
async def create_milestone(
    project_id: int, body: MilestoneIn, user: CurrentUser = Depends(get_current_user)
) -> dict:
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            current = await _get_project_or_404(conn, project_id)
            if not _can_edit_project(user, current["owner_id"]):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only the project owner or founder can manage milestones",
                )
            row = await conn.fetchrow(
                """
                INSERT INTO milestones (project_id, title, due_date)
                VALUES ($1, $2, $3)
                RETURNING id, project_id, title, due_date, status, deliverable_file_id, created_at
                """,
                project_id,
                body.title,
                body.due_date,
            )
            await record_event(
                conn, "milestone", row["id"], user.id, "created", {"project_id": project_id}
            )
    return dict(row)


@router.get("/projects/{project_id}/milestones")
async def list_milestones(
    project_id: int, user: CurrentUser = Depends(get_current_user)
) -> list[dict]:
    pool = get_pool()
    rows = await pool.fetch(
        "SELECT id, project_id, title, due_date, status, deliverable_file_id, created_at "
        "FROM milestones WHERE project_id = $1 AND deleted_at IS NULL ORDER BY due_date",
        project_id,
    )
    return [dict(r) for r in rows]


@router.patch("/milestones/{milestone_id}")
async def patch_milestone(
    milestone_id: int, body: MilestonePatch, user: CurrentUser = Depends(get_current_user)
) -> dict:
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            milestone = await conn.fetchrow(
                "SELECT m.id, m.status, p.owner_id FROM milestones m "
                "JOIN projects p ON p.id = m.project_id "
                "WHERE m.id = $1 AND m.deleted_at IS NULL FOR UPDATE",
                milestone_id,
            )
            if milestone is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND, detail="Milestone not found"
                )
            if not _can_edit_project(user, milestone["owner_id"]):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only the project owner or founder can modify milestones",
                )

            row = await conn.fetchrow(
                """
                UPDATE milestones
                SET title = COALESCE($1, title),
                    due_date = COALESCE($2, due_date),
                    status = COALESCE($3, status)
                WHERE id = $4
                RETURNING id, project_id, title, due_date, status, deliverable_file_id, created_at
                """,
                body.title,
                body.due_date,
                body.status,
                milestone_id,
            )

            if body.status is not None and body.status != milestone["status"]:
                await record_event(
                    conn,
                    "milestone",
                    milestone_id,
                    user.id,
                    "status_changed",
                    {"from": milestone["status"], "to": body.status},
                )
            else:
                await record_event(conn, "milestone", milestone_id, user.id, "updated", {})

    return dict(row)
