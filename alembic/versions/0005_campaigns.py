"""campaigns: campaigns, campaign_characters

Revision ID: 0005
Revises: 0004
Create Date: 2026-07-27 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "campaigns",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("dm_user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("next_session_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_session_place", sa.String(length=200), nullable=True),
        sa.Column("invite_code", sa.String(length=32), nullable=False),
        sa.ForeignKeyConstraint(["dm_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_campaigns_dm_user_id"), "campaigns", ["dm_user_id"], unique=False)
    op.create_index(
        op.f("ix_campaigns_invite_code"), "campaigns", ["invite_code"], unique=True
    )

    op.create_table(
        "campaign_characters",
        sa.Column("campaign_id", sa.Integer(), nullable=False),
        sa.Column("character_id", sa.Integer(), nullable=False),
        sa.Column(
            "joined_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["campaign_id"], ["campaigns.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["character_id"], ["characters.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("campaign_id", "character_id"),
    )
    op.create_index(
        op.f("ix_campaign_characters_character_id"),
        "campaign_characters",
        ["character_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_campaign_characters_character_id"), table_name="campaign_characters"
    )
    op.drop_table("campaign_characters")

    op.drop_index(op.f("ix_campaigns_invite_code"), table_name="campaigns")
    op.drop_index(op.f("ix_campaigns_dm_user_id"), table_name="campaigns")
    op.drop_table("campaigns")
