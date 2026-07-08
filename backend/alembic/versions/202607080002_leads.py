"""leads (phase 1)

Revision ID: 202607080002
Revises: 202607080001
Create Date: 2026-07-08

"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "202607080002"
down_revision = "202607080001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE leads (
            id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            source              TEXT NOT NULL
                                CHECK (source IN
                                    ('website', 'instagram', 'telegram', 'facebook', 'referral', 'other')
                                ),
            name                TEXT NOT NULL,
            phone               TEXT,
            email               TEXT,
            message             TEXT,
            utm                 JSONB NOT NULL DEFAULT '{}'::jsonb,
            status              TEXT NOT NULL DEFAULT 'new'
                                CHECK (status IN
                                    ('new', 'contacted', 'qualified', 'proposal_sent', 'won', 'lost')
                                ),
            owner_id            BIGINT REFERENCES users (id),
            loss_reason         TEXT,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
            first_response_at  TIMESTAMPTZ,
            deleted_at          TIMESTAMPTZ,
            CONSTRAINT leads_loss_reason_required_when_lost
                CHECK (status <> 'lost' OR loss_reason IS NOT NULL)
        );
        """
    )
    op.execute("CREATE INDEX leads_status_idx ON leads (status) WHERE deleted_at IS NULL;")
    op.execute("CREATE INDEX leads_owner_idx ON leads (owner_id) WHERE deleted_at IS NULL;")
    op.execute("CREATE INDEX leads_source_idx ON leads (source) WHERE deleted_at IS NULL;")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS leads;")
