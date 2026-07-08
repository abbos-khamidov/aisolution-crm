import json
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.deps import CurrentUser, require_staff_role
from app.db.pool import get_pool

router = APIRouter(prefix="/clients", tags=["clients"])

CLIENT_FIELDS = "id, lead_id, name, company_name, contact_info, created_at"


class ClientIn(BaseModel):
    name: str
    company_name: str | None = None
    contact_info: dict[str, Any] = {}


@router.post("", status_code=201)
async def create_client(body: ClientIn, user: CurrentUser = Depends(require_staff_role)) -> dict:
    pool = get_pool()
    row = await pool.fetchrow(
        f"""
        INSERT INTO clients (name, company_name, contact_info)
        VALUES ($1, $2, $3::jsonb)
        RETURNING {CLIENT_FIELDS}
        """,
        body.name,
        body.company_name,
        json.dumps(body.contact_info),
    )
    return dict(row)


@router.get("")
async def list_clients(user: CurrentUser = Depends(require_staff_role)) -> list[dict]:
    pool = get_pool()
    rows = await pool.fetch(
        f"SELECT {CLIENT_FIELDS} FROM clients WHERE deleted_at IS NULL ORDER BY created_at DESC"
    )
    return [dict(r) for r in rows]
