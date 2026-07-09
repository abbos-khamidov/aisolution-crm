"""lead company name

Revision ID: 202607090001
Revises: 202607080013
Create Date: 2026-07-09
"""

from alembic import op

revision = "202607090001"
down_revision = "202607080013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE leads ADD COLUMN company_name TEXT;")


def downgrade() -> None:
    op.execute("ALTER TABLE leads DROP COLUMN IF EXISTS company_name;")
