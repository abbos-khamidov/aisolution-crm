"""user granular permissions

Revision ID: 202607090002
Revises: 202607090001
Create Date: 2026-07-09
"""

from alembic import op

revision = "202607090002"
down_revision = "202607090001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE users
            ADD COLUMN can_view_all_leads BOOLEAN NOT NULL DEFAULT false,
            ADD COLUMN can_view_analytics BOOLEAN NOT NULL DEFAULT false,
            ADD COLUMN can_view_finance BOOLEAN NOT NULL DEFAULT false;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE users
            DROP COLUMN IF EXISTS can_view_all_leads,
            DROP COLUMN IF EXISTS can_view_analytics,
            DROP COLUMN IF EXISTS can_view_finance;
        """
    )
