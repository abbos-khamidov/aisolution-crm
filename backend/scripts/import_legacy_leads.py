import argparse
import asyncio
import datetime as dt
import json
import os
import re
from pathlib import Path
from typing import Any

import asyncpg


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    if value in ("", "-", "—"):
        return None
    return value


def _parse_local_datetime(value: str | None) -> dt.datetime | None:
    if not value:
        return None
    parsed = dt.datetime.strptime(value, "%d.%m.%Y, %H:%M:%S")
    return parsed.replace(tzinfo=dt.timezone(dt.timedelta(hours=5)))


def _parse_utc_datetime(value: str | None) -> dt.datetime | None:
    if not value:
        return None
    parsed = dt.datetime.strptime(value, "%Y-%m-%d %H:%M:%S UTC")
    return parsed.replace(tzinfo=dt.UTC)


def _split_blocks(text: str) -> list[str]:
    starts = [
        match.start()
        for match in re.finditer(
            r"(?m)^(?:📋 Новая заявка|🔥 Новый лид|New Lead)\b",
            text,
        )
    ]
    blocks = []
    for idx, start in enumerate(starts):
        end = starts[idx + 1] if idx + 1 < len(starts) else len(text)
        blocks.append(text[start:end].strip())
    return blocks


def _line_value(block: str, label: str) -> str | None:
    match = re.search(rf"(?m)^{re.escape(label)}:\s*(.+)$", block)
    return _clean(match.group(1) if match else None)


def _emoji_value(block: str, label: str) -> str | None:
    match = re.search(rf"(?m)^{re.escape(label)}\s*(.+)$", block)
    return _clean(match.group(1) if match else None)


def _message_after(block: str, label: str) -> str | None:
    marker = f"{label}\n"
    if marker not in block:
        return None
    tail = block.split(marker, 1)[1].strip()
    lines = []
    for line in tail.splitlines():
        if re.match(r"^[^\w\s]?\s*(?:🕐|👤|📬|🏢|📱|📍)", line):
            break
        lines.append(line)
    return _clean("\n".join(lines))


def parse_leads(text: str) -> list[dict[str, Any]]:
    parsed = []
    for block in _split_blocks(text):
        if block.startswith("New Lead"):
            created_at = _parse_utc_datetime(_line_value(block, "Time"))
            form = _line_value(block, "Form")
            service = _line_value(block, "Service")
            source = "website"
            origin_label = "форма сайта"
            parsed.append(
                {
                    "source": source,
                    "name": _line_value(block, "Name") or "Без имени",
                    "phone": _line_value(block, "Phone"),
                    "email": _line_value(block, "Email"),
                    "message": _line_value(block, "Message"),
                    "created_at": created_at,
                    "utm": {
                        "legacy_import": True,
                        "origin": "website_form",
                        "origin_label": origin_label,
                        "form": form,
                        "service": service,
                        "raw": block,
                    },
                }
            )
            continue

        created_at = _parse_local_datetime(_emoji_value(block, "🕐"))
        name = _emoji_value(block, "👤 Имя:")
        contact = _emoji_value(block, "📬 Контакт:") or _emoji_value(block, "📱 Телефон:")
        company = _emoji_value(block, "🏢 Компания:")
        source_note = _emoji_value(block, "📍 Источник:")
        message = _message_after(block, "💬 Сообщение:")

        is_popup = bool(source_note and "попап" in source_note.lower())
        is_callback = block.startswith("🔥 Новый лид")
        if is_popup:
            origin = "website_popup"
        elif is_callback:
            origin = "website_callback"
        else:
            origin = "website_form"
        origin_label = (
            "скролл-попап"
            if is_popup
            else "форма обратного звонка"
            if is_callback
            else "контактная форма"
        )
        parsed.append(
            {
                "source": "website",
                "name": name or contact or "Без имени",
                "phone": contact,
                "email": None,
                "message": message,
                "created_at": created_at,
                "utm": {
                    "legacy_import": True,
                    "origin": origin,
                    "origin_label": origin_label,
                    "company": company,
                    "source_note": source_note,
                    "raw": block,
                },
            }
        )
    return parsed


async def import_leads(path: Path, database_url: str) -> tuple[int, int]:
    conn = await asyncpg.connect(database_url)
    await conn.set_type_codec(
        "jsonb",
        encoder=json.dumps,
        decoder=json.loads,
        schema="pg_catalog",
    )
    inserted = 0
    skipped = 0
    try:
        for lead in parse_leads(path.read_text()):
            exists = await conn.fetchval(
                """
                SELECT 1 FROM leads
                WHERE source = $1
                  AND name = $2
                  AND COALESCE(phone, '') = COALESCE($3, '')
                  AND COALESCE(created_at::text, '') = COALESCE($4::timestamptz::text, '')
                  AND deleted_at IS NULL
                """,
                lead["source"],
                lead["name"],
                lead["phone"],
                lead["created_at"],
            )
            if exists:
                skipped += 1
                continue
            row = await conn.fetchrow(
                """
                INSERT INTO leads (source, name, phone, email, message, utm, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, now()))
                RETURNING id
                """,
                lead["source"],
                lead["name"],
                lead["phone"],
                lead["email"],
                lead["message"],
                lead["utm"],
                lead["created_at"],
            )
            await conn.execute(
                """
                INSERT INTO events
                    (entity_type, entity_id, actor_id, event_type, payload, created_at)
                VALUES ('lead', $1, NULL, 'created', $2, COALESCE($3, now()))
                """,
                row["id"],
                {"source": lead["source"], "legacy_import": True},
                lead["created_at"],
            )
            inserted += 1
    finally:
        await conn.close()
    return inserted, skipped


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("path", type=Path)
    parser.add_argument(
        "--database-url",
        default=os.getenv(
            "DATABASE_URL",
            "postgresql://aisolutioncrm:aisolutioncrm_dev_pw@localhost:5433/aisolutioncrm_dev",
        ),
    )
    args = parser.parse_args()
    inserted, skipped = asyncio.run(import_leads(args.path, args.database_url))
    print(f"inserted={inserted} skipped={skipped}")


if __name__ == "__main__":
    main()
