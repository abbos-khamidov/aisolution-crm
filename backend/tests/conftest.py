import asyncpg
import httpx
import pytest_asyncio
from moto import mock_aws

import app.core.storage as storage_module
from app.core.config import settings
from app.core.security import create_access_token
from app.db.pool import _init_connection
from app.main import app, lifespan


@pytest_asyncio.fixture
async def db():
    # Must register the same jsonb/json codec the app pool uses (see
    # app/db/pool.py) — otherwise this fixture's own connection returns
    # jsonb columns (events.payload etc.) as raw strings instead of dicts,
    # which is exactly the bug that shipped for phases 1-7 (see PROGRESS.md).
    conn = await asyncpg.connect(settings.database_url)
    await _init_connection(conn)
    await conn.execute(
        "TRUNCATE leads, events, users, clients, projects, project_members, milestones, "
        "finance_entries, files, tasks, login_tokens RESTART IDENTITY CASCADE;"
    )
    try:
        yield conn
    finally:
        await conn.close()


@pytest_asyncio.fixture
async def client(db):
    async with lifespan(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac


async def make_user(
    db, name: str, email: str, role: str, telegram_id: int | None = None
) -> tuple[int, str]:
    user_id = await db.fetchval(
        "INSERT INTO users (name, email, role, telegram_id) VALUES ($1, $2, $3, $4) RETURNING id",
        name,
        email,
        role,
        telegram_id,
    )
    token = create_access_token(user_id, role)
    return user_id, token


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def s3():
    """Mocks S3-compatible storage with moto so file-upload tests don't need a
    real Hetzner Object Storage bucket (see PROGRESS.md > Decisions)."""
    with mock_aws():
        storage_module._client = None
        storage_module._get_client().create_bucket(Bucket=settings.s3_bucket)
        yield
        storage_module._client = None
