"""user archive

Revision ID: 202607090003
Revises: 202607090002
Create Date: 2026-07-09
"""

from alembic import op

revision = "202607090003"
down_revision = "202607090002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN archived_at TIMESTAMPTZ;")
    op.execute("ALTER TABLE events DROP CONSTRAINT events_entity_type_check;")
    op.execute(
        """
        ALTER TABLE events ADD CONSTRAINT events_entity_type_check
        CHECK (entity_type IN
            ('lead', 'project', 'task', 'file', 'finance_entry', 'milestone', 'user'));
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE events DROP CONSTRAINT events_entity_type_check;")
    op.execute(
        """
        ALTER TABLE events ADD CONSTRAINT events_entity_type_check
        CHECK (entity_type IN
            ('lead', 'project', 'task', 'file', 'finance_entry', 'milestone'));
        """
    )
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS archived_at;")
