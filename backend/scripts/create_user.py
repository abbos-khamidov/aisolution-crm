"""CLI to create/seed a user (primarily the first founder) on a fresh DB.

CRM_SPEC.md has no user-creation endpoint before phase 6 RBAC, so a fresh database
has no way to bootstrap the first login. This script is the resolution to that gap
(see PROGRESS.md > Decisions & Assumptions).

Usage:
    python -m scripts.create_user --name "Adam" --email adam@aisolution.uz \
        --password secret --role founder
"""

import argparse
import asyncio

import asyncpg

from app.core.config import settings
from app.core.security import hash_password


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", required=True)
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument(
        "--role", required=True, choices=["founder", "manager", "developer", "student"]
    )
    args = parser.parse_args()

    conn = await asyncpg.connect(settings.database_url)
    try:
        user_id = await conn.fetchval(
            """
            INSERT INTO users (name, email, password_hash, role)
            VALUES ($1, $2, $3, $4)
            RETURNING id
            """,
            args.name,
            args.email,
            hash_password(args.password),
            args.role,
        )
        print(f"Created user id={user_id} email={args.email} role={args.role}")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
