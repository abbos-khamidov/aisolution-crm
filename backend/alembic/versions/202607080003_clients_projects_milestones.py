"""clients, projects, project_members, milestones (phase 2)

Revision ID: 202607080003
Revises: 202607080002
Create Date: 2026-07-08

"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "202607080003"
down_revision = "202607080002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE clients (
            id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            lead_id         BIGINT REFERENCES leads (id),
            name            TEXT NOT NULL,
            company_name    TEXT,
            contact_info    JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            deleted_at      TIMESTAMPTZ
        );
        """
    )
    op.execute("CREATE INDEX clients_lead_idx ON clients (lead_id) WHERE deleted_at IS NULL;")

    op.execute(
        """
        CREATE TABLE projects (
            id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            client_id       BIGINT NOT NULL REFERENCES clients (id),
            name            TEXT NOT NULL,
            description     TEXT,
            stage           TEXT NOT NULL DEFAULT 'discovery'
                            CHECK (stage IN (
                                'discovery', 'proposal', 'contract', 'in_progress',
                                'review', 'completed', 'paused', 'cancelled'
                            )),
            owner_id        BIGINT REFERENCES users (id),
            start_date      DATE,
            deadline        DATE,
            budget_total    NUMERIC(14, 2),
            currency        TEXT,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            deleted_at      TIMESTAMPTZ
        );
        """
    )
    op.execute("CREATE INDEX projects_client_idx ON projects (client_id) WHERE deleted_at IS NULL;")
    op.execute("CREATE INDEX projects_owner_idx ON projects (owner_id) WHERE deleted_at IS NULL;")
    op.execute("CREATE INDEX projects_stage_idx ON projects (stage) WHERE deleted_at IS NULL;")

    op.execute(
        """
        CREATE TABLE project_members (
            project_id      BIGINT NOT NULL REFERENCES projects (id),
            user_id         BIGINT NOT NULL REFERENCES users (id),
            role_on_project TEXT NOT NULL CHECK (role_on_project IN ('lead', 'contributor')),
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            deleted_at      TIMESTAMPTZ,
            PRIMARY KEY (project_id, user_id)
        );
        """
    )

    op.execute(
        """
        CREATE TABLE milestones (
            id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            project_id          BIGINT NOT NULL REFERENCES projects (id),
            title               TEXT NOT NULL,
            due_date            DATE,
            status              TEXT NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'done', 'overdue')),
            deliverable_file_id BIGINT,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
            deleted_at          TIMESTAMPTZ
        );
        """
    )
    op.execute(
        "CREATE INDEX milestones_project_idx ON milestones (project_id) WHERE deleted_at IS NULL;"
    )

    # 'milestone' added as its own entity_type: milestones are distinct enough
    # (own lifecycle: pending -> done/overdue) that folding their history under
    # entity_type='project' would make milestone-specific queries awkward.
    # This is exactly why entity_type is TEXT+CHECK, not a Postgres ENUM: the
    # constraint can be swapped in one statement without the ALTER TYPE
    # transaction restriction. See PROGRESS.md > Decisions & Assumptions.
    op.execute("ALTER TABLE events DROP CONSTRAINT events_entity_type_check;")
    op.execute(
        """
        ALTER TABLE events ADD CONSTRAINT events_entity_type_check
        CHECK (entity_type IN ('lead', 'project', 'task', 'file', 'finance_entry', 'milestone'));
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE events DROP CONSTRAINT events_entity_type_check;")
    op.execute(
        """
        ALTER TABLE events ADD CONSTRAINT events_entity_type_check
        CHECK (entity_type IN ('lead', 'project', 'task', 'file', 'finance_entry'));
        """
    )
    op.execute("DROP TABLE IF EXISTS milestones;")
    op.execute("DROP TABLE IF EXISTS project_members;")
    op.execute("DROP TABLE IF EXISTS projects;")
    op.execute("DROP TABLE IF EXISTS clients;")
