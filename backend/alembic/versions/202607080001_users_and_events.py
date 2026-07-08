"""users and events (phase 0 foundation)

Revision ID: 202607080001
Revises:
Create Date: 2026-07-08

"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "202607080001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE users (
            id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            name            TEXT NOT NULL,
            phone           TEXT,
            email           TEXT NOT NULL,
            password_hash   TEXT,
            telegram_id     BIGINT,
            role            TEXT NOT NULL
                            CHECK (role IN ('founder', 'manager', 'developer', 'student')),
            is_active       BOOLEAN NOT NULL DEFAULT TRUE,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            deleted_at      TIMESTAMPTZ
        );
        """
    )
    op.execute(
        "CREATE UNIQUE INDEX users_email_key ON users (email) WHERE deleted_at IS NULL;"
    )
    op.execute(
        "CREATE UNIQUE INDEX users_telegram_id_key ON users (telegram_id) "
        "WHERE deleted_at IS NULL AND telegram_id IS NOT NULL;"
    )

    op.execute(
        """
        CREATE TABLE events (
            id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            entity_type     TEXT NOT NULL
                            CHECK (entity_type IN ('lead', 'project', 'task', 'file', 'finance_entry')),
            entity_id       BIGINT NOT NULL,
            actor_id        BIGINT REFERENCES users (id),
            event_type      TEXT NOT NULL,
            payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )
    op.execute("CREATE INDEX events_entity_idx ON events (entity_type, entity_id);")
    op.execute("CREATE INDEX events_actor_idx ON events (actor_id);")
    op.execute("CREATE INDEX events_created_at_idx ON events (created_at);")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS events;")
    op.execute("DROP TABLE IF EXISTS users;")
