"""user custom role title

Revision ID: 202607080011
Revises: 202607080010
Create Date: 2026-07-08
"""

from alembic import op


revision = "202607080011"
down_revision = "202607080010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN role_title TEXT;")


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS role_title;")
