"""files (phase 4)

Revision ID: 202607080005
Revises: 202607080004
Create Date: 2026-07-08

"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "202607080005"
down_revision = "202607080004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE files (
            id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            project_id      BIGINT REFERENCES projects (id),
            lead_id         BIGINT REFERENCES leads (id),
            uploaded_by     BIGINT NOT NULL REFERENCES users (id),
            url             TEXT NOT NULL,
            filename        TEXT NOT NULL,
            status          TEXT NOT NULL DEFAULT 'pending_review'
                            CHECK (status IN ('pending_review', 'approved', 'rejected')),
            reviewed_by     BIGINT REFERENCES users (id),
            reviewed_at     TIMESTAMPTZ,
            comment         TEXT,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            deleted_at      TIMESTAMPTZ,
            CONSTRAINT files_exactly_one_parent
                CHECK ((project_id IS NOT NULL)::int + (lead_id IS NOT NULL)::int = 1)
        );
        """
    )
    op.execute("CREATE INDEX files_project_idx ON files (project_id) WHERE deleted_at IS NULL;")
    op.execute("CREATE INDEX files_lead_idx ON files (lead_id) WHERE deleted_at IS NULL;")
    op.execute("CREATE INDEX files_status_idx ON files (status) WHERE deleted_at IS NULL;")

    # milestones.deliverable_file_id was created without a FK in phase 2 because
    # `files` didn't exist yet (see PROGRESS.md > Decisions & Assumptions).
    op.execute(
        """
        ALTER TABLE milestones
        ADD CONSTRAINT milestones_deliverable_file_id_fkey
        FOREIGN KEY (deliverable_file_id) REFERENCES files (id);
        """
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE milestones DROP CONSTRAINT milestones_deliverable_file_id_fkey;"
    )
    op.execute("DROP TABLE IF EXISTS files;")
