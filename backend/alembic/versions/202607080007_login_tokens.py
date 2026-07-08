"""login_tokens for Telegram deep-link student login (phase 6)

Revision ID: 202607080007
Revises: 202607080006
Create Date: 2026-07-08

"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "202607080007"
down_revision = "202607080006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE login_tokens (
            token           TEXT PRIMARY KEY,
            status          TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'confirmed', 'consumed', 'rejected')),
            user_id         BIGINT REFERENCES users (id),
            telegram_id     BIGINT,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            expires_at      TIMESTAMPTZ NOT NULL,
            confirmed_at    TIMESTAMPTZ,
            consumed_at     TIMESTAMPTZ
        );
        """
    )
    op.execute("CREATE INDEX login_tokens_status_idx ON login_tokens (status);")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS login_tokens;")
