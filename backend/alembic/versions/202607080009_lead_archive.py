"""lead archive

Revision ID: 202607080009
Revises: 202607080008
Create Date: 2026-07-08

"""
from alembic import op

revision = "202607080009"
down_revision = "202607080008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE leads ADD COLUMN archived_at TIMESTAMPTZ;")
    op.execute("CREATE INDEX leads_archived_idx ON leads (archived_at) WHERE deleted_at IS NULL;")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS leads_archived_idx;")
    op.execute("ALTER TABLE leads DROP COLUMN IF EXISTS archived_at;")
