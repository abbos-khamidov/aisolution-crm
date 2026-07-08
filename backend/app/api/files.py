from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, status
from pydantic import BaseModel

from app.core.deps import CurrentUser, get_current_user
from app.core.storage import upload_file
from app.db.events import record_event
from app.db.pool import get_pool

router = APIRouter(prefix="/files", tags=["files"])

FILE_FIELDS = """
    id, project_id, lead_id, uploaded_by, url, filename, status, reviewed_by,
    reviewed_at, comment, created_at
"""


class ReviewIn(BaseModel):
    comment: str | None = None


@router.post("", status_code=status.HTTP_201_CREATED)
async def upload_file_endpoint(
    file: UploadFile,
    project_id: int | None = Form(None),
    lead_id: int | None = Form(None),
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    if (project_id is None) == (lead_id is None):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Exactly one of project_id or lead_id is required",
        )

    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            if project_id is not None:
                exists = await conn.fetchval(
                    "SELECT 1 FROM projects WHERE id = $1 AND deleted_at IS NULL", project_id
                )
            else:
                exists = await conn.fetchval(
                    "SELECT 1 FROM leads WHERE id = $1 AND deleted_at IS NULL", lead_id
                )
            if not exists:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND, detail="Parent project/lead not found"
                )

            content = await file.read()
            url = upload_file(
                content, file.filename or "upload", file.content_type or "application/octet-stream"
            )

            row = await conn.fetchrow(
                f"""
                INSERT INTO files (project_id, lead_id, uploaded_by, url, filename)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING {FILE_FIELDS}
                """,
                project_id,
                lead_id,
                user.id,
                url,
                file.filename or "upload",
            )
            await record_event(conn, "file", row["id"], user.id, "created", {"url": url})

    return dict(row)


@router.get("")
async def list_files(
    status_filter: str | None = None,
    project_id: int | None = None,
    lead_id: int | None = None,
    user: CurrentUser = Depends(get_current_user),
) -> list[dict]:
    pool = get_pool()
    conditions = ["deleted_at IS NULL"]
    params: list = []

    if status_filter is not None:
        params.append(status_filter)
        conditions.append(f"status = ${len(params)}")
    if project_id is not None:
        params.append(project_id)
        conditions.append(f"project_id = ${len(params)}")
    if lead_id is not None:
        params.append(lead_id)
        conditions.append(f"lead_id = ${len(params)}")

    query = (
        f"SELECT {FILE_FIELDS} FROM files WHERE {' AND '.join(conditions)} "
        "ORDER BY created_at DESC"
    )
    rows = await pool.fetch(query, *params)
    return [dict(r) for r in rows]


async def _review(file_id: int, user: CurrentUser, new_status: str, comment: str | None) -> dict:
    if user.role != "founder":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Only founder can review files"
        )

    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            current = await conn.fetchrow(
                "SELECT id, status FROM files WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
                file_id,
            )
            if current is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

            row = await conn.fetchrow(
                f"""
                UPDATE files
                SET status = $1, reviewed_by = $2, reviewed_at = now(), comment = $3
                WHERE id = $4
                RETURNING {FILE_FIELDS}
                """,
                new_status,
                user.id,
                comment,
                file_id,
            )
            await record_event(
                conn,
                "file",
                file_id,
                user.id,
                new_status,
                {"comment": comment},
            )
    return dict(row)


@router.post("/{file_id}/approve")
async def approve_file(
    file_id: int, body: ReviewIn, user: CurrentUser = Depends(get_current_user)
) -> dict:
    return await _review(file_id, user, "approved", body.comment)


@router.post("/{file_id}/reject")
async def reject_file(
    file_id: int, body: ReviewIn, user: CurrentUser = Depends(get_current_user)
) -> dict:
    return await _review(file_id, user, "rejected", body.comment)
