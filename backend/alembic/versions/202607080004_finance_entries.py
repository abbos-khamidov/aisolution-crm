"""finance_entries (phase 3)

Revision ID: 202607080004
Revises: 202607080003
Create Date: 2026-07-08

"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "202607080004"
down_revision = "202607080003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE finance_entries (
            id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            project_id      BIGINT NOT NULL REFERENCES projects (id),
            type            TEXT NOT NULL CHECK (type IN ('invoice', 'payment', 'expense')),
            amount          NUMERIC(14, 2) NOT NULL,
            currency        TEXT NOT NULL,
            status          TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'paid', 'overdue')),
            due_date        DATE,
            paid_at         TIMESTAMPTZ,
            description     TEXT,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            deleted_at      TIMESTAMPTZ,
            CONSTRAINT finance_entries_paid_requires_paid_at
                CHECK (status <> 'paid' OR paid_at IS NOT NULL)
        );
        """
    )
    op.execute(
        "CREATE INDEX finance_entries_project_idx ON finance_entries (project_id) "
        "WHERE deleted_at IS NULL;"
    )
    op.execute(
        "CREATE INDEX finance_entries_status_idx ON finance_entries (status) "
        "WHERE deleted_at IS NULL;"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS finance_entries;")
