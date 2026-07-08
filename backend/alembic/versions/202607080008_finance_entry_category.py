"""finance_entries.category (post-MVP finance/analytics expansion)

Revision ID: 202607080008
Revises: 202607080007
Create Date: 2026-07-08

"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "202607080008"
down_revision = "202607080007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE finance_entries ADD COLUMN category TEXT;")


def downgrade() -> None:
    op.execute("ALTER TABLE finance_entries DROP COLUMN IF EXISTS category;")
