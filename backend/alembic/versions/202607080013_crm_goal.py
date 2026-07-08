"""crm year goal settings

Revision ID: 202607080013
Revises: 202607080012
Create Date: 2026-07-08
"""

from alembic import op


revision = "202607080013"
down_revision = "202607080012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE crm_settings (
            key         TEXT PRIMARY KEY,
            value       JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS crm_settings;")
