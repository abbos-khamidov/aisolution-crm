from fastapi import HTTPException, status

from app.core.deps import CurrentUser


async def get_visible_project_ids(pool_or_conn, user: CurrentUser) -> list[int] | None:
    """None means "no filter needed" (founder sees all projects). Otherwise
    the ids of projects this user owns or is a member of (CRM_SPEC.md section
    6: manager/developer see only their own/assigned projects).
    """
    if user.role == "founder":
        return None
    rows = await pool_or_conn.fetch(
        """
        SELECT id FROM projects p
        WHERE p.deleted_at IS NULL AND (
            p.owner_id = $1
            OR EXISTS (
                SELECT 1 FROM project_members pm
                WHERE pm.project_id = p.id AND pm.user_id = $1 AND pm.deleted_at IS NULL
            )
        )
        """,
        user.id,
    )
    return [r["id"] for r in rows]


async def require_project_visible(pool_or_conn, user: CurrentUser, project_id: int) -> None:
    if user.role == "founder":
        return
    visible = await pool_or_conn.fetchval(
        """
        SELECT 1 FROM projects p
        WHERE p.id = $1 AND p.deleted_at IS NULL AND (
            p.owner_id = $2
            OR EXISTS (
                SELECT 1 FROM project_members pm
                WHERE pm.project_id = p.id AND pm.user_id = $2 AND pm.deleted_at IS NULL
            )
        )
        """,
        project_id,
        user.id,
    )
    if not visible:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="You don't have access to this project"
        )
