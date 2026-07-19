"""characters: characters, character_spells, inventory_entries, level_up_records

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-19 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "characters",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("race_id", sa.Integer(), nullable=False),
        sa.Column("class_id", sa.Integer(), nullable=False),
        sa.Column("subclass_id", sa.Integer(), nullable=True),
        sa.Column("background_id", sa.Integer(), nullable=True),
        sa.Column("alignment", sa.String(length=50), nullable=False),
        sa.Column("level", sa.Integer(), server_default="1", nullable=False),
        sa.Column("xp", sa.Integer(), server_default="0", nullable=False),
        sa.Column("ability_scores", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("hp_max", sa.Integer(), nullable=False),
        sa.Column("hp_current", sa.Integer(), nullable=False),
        sa.Column("hp_temp", sa.Integer(), server_default="0", nullable=False),
        sa.Column("ac_override", sa.Integer(), nullable=True),
        sa.Column("speed", sa.Integer(), nullable=False),
        sa.Column("proficiencies", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("appearance", sa.Text(), nullable=True),
        sa.Column("backstory", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("gold", sa.Integer(), server_default="0", nullable=False),
        sa.Column("silver", sa.Integer(), server_default="0", nullable=False),
        sa.Column("copper", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["race_id"], ["races.id"]),
        sa.ForeignKeyConstraint(["class_id"], ["classes.id"]),
        sa.ForeignKeyConstraint(["subclass_id"], ["subclasses.id"]),
        sa.ForeignKeyConstraint(["background_id"], ["backgrounds.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_characters_user_id"), "characters", ["user_id"], unique=False)
    op.create_index(op.f("ix_characters_race_id"), "characters", ["race_id"], unique=False)
    op.create_index(op.f("ix_characters_class_id"), "characters", ["class_id"], unique=False)
    op.create_index(
        op.f("ix_characters_subclass_id"), "characters", ["subclass_id"], unique=False
    )
    op.create_index(
        op.f("ix_characters_background_id"), "characters", ["background_id"], unique=False
    )

    op.create_table(
        "character_spells",
        sa.Column("character_id", sa.Integer(), nullable=False),
        sa.Column("spell_id", sa.Integer(), nullable=False),
        sa.Column("prepared", sa.Boolean(), server_default="false", nullable=False),
        sa.ForeignKeyConstraint(["character_id"], ["characters.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["spell_id"], ["spells.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("character_id", "spell_id"),
    )

    op.create_table(
        "inventory_entries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("character_id", sa.Integer(), nullable=False),
        sa.Column("item_id", sa.Integer(), nullable=True),
        sa.Column("custom_name", sa.String(length=200), nullable=True),
        sa.Column("quantity", sa.Integer(), server_default="1", nullable=False),
        sa.Column("equipped", sa.Boolean(), server_default="false", nullable=False),
        sa.ForeignKeyConstraint(["character_id"], ["characters.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_inventory_entries_character_id"),
        "inventory_entries",
        ["character_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_inventory_entries_item_id"), "inventory_entries", ["item_id"], unique=False
    )

    op.create_table(
        "level_up_records",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("character_id", sa.Integer(), nullable=False),
        sa.Column("from_level", sa.Integer(), nullable=False),
        sa.Column("to_level", sa.Integer(), nullable=False),
        sa.Column(
            "delta", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["character_id"], ["characters.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_level_up_records_character_id"),
        "level_up_records",
        ["character_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_level_up_records_character_id"), table_name="level_up_records")
    op.drop_table("level_up_records")

    op.drop_index(op.f("ix_inventory_entries_item_id"), table_name="inventory_entries")
    op.drop_index(op.f("ix_inventory_entries_character_id"), table_name="inventory_entries")
    op.drop_table("inventory_entries")

    op.drop_table("character_spells")

    op.drop_index(op.f("ix_characters_background_id"), table_name="characters")
    op.drop_index(op.f("ix_characters_subclass_id"), table_name="characters")
    op.drop_index(op.f("ix_characters_class_id"), table_name="characters")
    op.drop_index(op.f("ix_characters_race_id"), table_name="characters")
    op.drop_index(op.f("ix_characters_user_id"), table_name="characters")
    op.drop_table("characters")
