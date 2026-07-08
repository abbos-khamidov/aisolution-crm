"""user profile fields

Revision ID: 202607080010
Revises: 202607080009
Create Date: 2026-07-08

"""
from alembic import op

revision = "202607080010"
down_revision = "202607080009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN telegram_username TEXT;")
    op.execute("ALTER TABLE users ADD COLUMN photo_url TEXT;")
    op.execute("ALTER TABLE users ADD COLUMN quote TEXT;")


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS quote;")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS photo_url;")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS telegram_username;")
