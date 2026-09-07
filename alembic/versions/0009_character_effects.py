"""characters: character_effects (US-13 temporary buffs and debuffs)

Revision ID: 0009
Revises: 0008
Create Date: 2026-09-05 00:00:00.000000

Revision numbers 0009-0012 are reserved per task in ARCHITECTURE.md §5: four
task branches each cutting a migration from 0008 would leave Alembic with four
heads and an unresolvable merge.

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "character_effects",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("character_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("source", sa.String(length=200), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "modifiers",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "duration_kind",
            sa.String(length=20),
            nullable=False,
            server_default="until_removed",
        ),
        sa.Column("duration_amount", sa.Integer(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(["character_id"], ["characters.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        # Duration is descriptive only — nothing counts it down (AR decision 8
        # rules out real-time), the player switches an effect off by hand. The
        # constraint keeps the vocabulary closed so the UI can translate it.
        sa.CheckConstraint(
            "duration_kind IN ('rounds', 'minutes', 'hours', 'until_short_rest',"
            " 'until_long_rest', 'until_removed')",
            name="ck_character_effects_duration_kind",
        ),
        sa.CheckConstraint(
            "duration_amount IS NULL OR duration_amount > 0",
            name="ck_character_effects_duration_amount",
        ),
    )
    op.create_index(
        "ix_character_effects_character_id", "character_effects", ["character_id"], unique=False
    )
    # Every sheet read filters on (character_id, is_active).
    op.create_index(
        "ix_character_effects_character_active",
        "character_effects",
        ["character_id", "is_active"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_character_effects_character_active", table_name="character_effects")
    op.drop_index("ix_character_effects_character_id", table_name="character_effects")
    op.drop_table("character_effects")
