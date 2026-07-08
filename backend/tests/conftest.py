import asyncpg
import httpx
import pytest_asyncio

from app.core.config import settings
from app.core.security import create_access_token
from app.main import app, lifespan


@pytest_asyncio.fixture
async def db():
    conn = await asyncpg.connect(settings.database_url)
    await conn.execute(
        "TRUNCATE leads, events, users, clients, projects, project_members, milestones, "
        "finance_entries RESTART IDENTITY CASCADE;"
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


async def make_user(db, name: str, email: str, role: str) -> tuple[int, str]:
    user_id = await db.fetchval(
        "INSERT INTO users (name, email, role) VALUES ($1, $2, $3) RETURNING id",
        name,
        email,
        role,
    )
    token = create_access_token(user_id, role)
    return user_id, token


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
