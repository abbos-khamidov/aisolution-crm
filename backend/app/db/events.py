from typing import Any

import asyncpg


async def record_event(
    conn: asyncpg.Connection,
    entity_type: str,
    entity_id: int,
    actor_id: int | None,
    event_type: str,
    payload: dict[str, Any] | None = None,
) -> None:
    await conn.execute(
        """
        INSERT INTO events (entity_type, entity_id, actor_id, event_type, payload)
        VALUES ($1, $2, $3, $4, $5)
        """,
        entity_type,
        entity_id,
        actor_id,
        event_type,
        payload or {},
    )
