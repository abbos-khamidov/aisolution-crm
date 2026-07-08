import json

import asyncpg

from app.core.config import settings

_pool: asyncpg.Pool | None = None


async def _init_connection(conn: asyncpg.Connection) -> None:
    # asyncpg does not decode jsonb/json to Python objects by default (it
    # returns the raw JSON text) — without this, every jsonb column
    # (leads.utm, events.payload, clients.contact_info) would come back as a
    # string, and callers passing dicts as query params would need to
    # pre-serialize them themselves. Registering the codec here means asyncpg
    # encodes/decodes automatically everywhere in the app.
    for typename in ("jsonb", "json"):
        await conn.set_type_codec(
            typename, schema="pg_catalog", encoder=json.dumps, decoder=json.loads
        )


async def init_pool() -> None:
    global _pool
    _pool = await asyncpg.create_pool(
        settings.database_url, min_size=1, max_size=10, init=_init_connection
    )


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("DB pool not initialized")
    return _pool
