"""lead proposal and finance fields

Revision ID: 202607080012
Revises: 202607080011
Create Date: 2026-07-08
"""

from alembic import op


revision = "202607080012"
down_revision = "202607080011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE leads
        ADD COLUMN proposal_file_id BIGINT REFERENCES files (id),
        ADD COLUMN expected_amount_min NUMERIC(14, 2),
        ADD COLUMN expected_amount_mid NUMERIC(14, 2),
        ADD COLUMN expected_amount_max NUMERIC(14, 2),
        ADD COLUMN selected_package TEXT CHECK (
            selected_package IS NULL OR selected_package IN ('min', 'mid', 'max', 'custom')
        ),
        ADD COLUMN selected_amount NUMERIC(14, 2),
        ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD';
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE leads
        DROP COLUMN IF EXISTS currency,
        DROP COLUMN IF EXISTS selected_amount,
        DROP COLUMN IF EXISTS selected_package,
        DROP COLUMN IF EXISTS expected_amount_max,
        DROP COLUMN IF EXISTS expected_amount_mid,
        DROP COLUMN IF EXISTS expected_amount_min,
        DROP COLUMN IF EXISTS proposal_file_id;
        """
    )
