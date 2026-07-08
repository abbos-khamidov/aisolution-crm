"""tasks (phase 5)

Revision ID: 202607080006
Revises: 202607080005
Create Date: 2026-07-08

"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "202607080006"
down_revision = "202607080005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE tasks (
            id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            project_id          BIGINT REFERENCES projects (id),
            assigned_to         BIGINT NOT NULL REFERENCES users (id),
            created_by          BIGINT NOT NULL REFERENCES users (id),
            title               TEXT NOT NULL,
            description         TEXT,
            status              TEXT NOT NULL DEFAULT 'todo'
                                CHECK (status IN ('todo', 'in_progress', 'done', 'blocked')),
            due_date            DATE,
            telegram_message_id BIGINT,
            completed_at        TIMESTAMPTZ,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
            deleted_at          TIMESTAMPTZ
        );
        """
    )
    op.execute(
        "CREATE INDEX tasks_assigned_to_idx ON tasks (assigned_to) WHERE deleted_at IS NULL;"
    )
    op.execute("CREATE INDEX tasks_project_idx ON tasks (project_id) WHERE deleted_at IS NULL;")
    op.execute("CREATE INDEX tasks_status_idx ON tasks (status) WHERE deleted_at IS NULL;")
    op.execute("CREATE INDEX tasks_due_date_idx ON tasks (due_date) WHERE deleted_at IS NULL;")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS tasks;")
