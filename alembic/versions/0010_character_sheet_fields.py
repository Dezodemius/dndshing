"""characters: the printable sheet's remaining fields (US-15)

Revision ID: 0010
Revises: 0009
Create Date: 2026-09-05 00:00:00.000000

The reference sheet carries roughly twice the fields the model had. These are
the ones with nowhere to live: everything else on it is either already a
column, part of the computed block, or content looked up by id.

Every column is nullable or has a server default — the table is not empty.

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TEXT_COLUMNS = (
    # Page 1, the four boxes down the right-hand column.
    "personality_traits",
    "ideals",
    "bonds",
    "flaws",
    # Page 2.
    "goals",
    "allies",
    "feats",
    "extra_features",
    "treasures",
)


def upgrade() -> None:
    # "ИМЯ ИГРОКА" is sheet data, not account data: a DM keeps a sheet for an
    # absent player, and User.display_name belongs to another module anyway.
    op.add_column("characters", sa.Column("player_name", sa.String(length=200), nullable=True))

    # Height and weight are strings. The reference sheet shows bare "74" and
    # "46"; players write "1,74 м" and "74 кг" too, and a numeric column would
    # pick the unit for them.
    op.add_column("characters", sa.Column("age", sa.Integer(), nullable=True))
    op.add_column("characters", sa.Column("height", sa.String(length=50), nullable=True))
    op.add_column("characters", sa.Column("weight", sa.String(length=50), nullable=True))

    op.add_column(
        "characters",
        sa.Column("inspiration", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    # Total hit dice is the level and the die is the class's, so only the spent
    # count needs storing.
    op.add_column(
        "characters",
        sa.Column("hit_dice_spent", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "characters",
        sa.Column(
            "death_save_successes", sa.SmallInteger(), nullable=False, server_default="0"
        ),
    )
    op.add_column(
        "characters",
        sa.Column("death_save_failures", sa.SmallInteger(), nullable=False, server_default="0"),
    )

    # {"items": [{"name", "bonus", "damage"}], "note"}. bonus and damage are
    # strings ("+5", "1d12 рубящий"): the sheet is semi-manual (BR §4.1) and
    # an attack bonus is a 5e rule this project does not compute.
    op.add_column(
        "characters",
        sa.Column(
            "attacks",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default='{"items": []}',
        ),
    )
    # {"1": 2, "3": 1} — spent only; the totals come from the class table.
    op.add_column(
        "characters",
        sa.Column(
            "spell_slots_spent",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
    )

    for column in _TEXT_COLUMNS:
        op.add_column("characters", sa.Column(column, sa.Text(), nullable=True))

    # add_column cannot carry a CHECK, so these are separate. They are repeated
    # in Character.__table_args__ so autogenerate does not propose dropping
    # them from the next migration.
    op.create_check_constraint(
        "ck_characters_hit_dice_spent_non_negative", "characters", "hit_dice_spent >= 0"
    )
    op.create_check_constraint(
        "ck_characters_death_save_successes_range",
        "characters",
        "death_save_successes BETWEEN 0 AND 3",
    )
    op.create_check_constraint(
        "ck_characters_death_save_failures_range",
        "characters",
        "death_save_failures BETWEEN 0 AND 3",
    )
    op.create_check_constraint(
        "ck_characters_age_non_negative", "characters", "age IS NULL OR age >= 0"
    )


def downgrade() -> None:
    op.drop_constraint("ck_characters_age_non_negative", "characters", type_="check")
    op.drop_constraint("ck_characters_death_save_failures_range", "characters", type_="check")
    op.drop_constraint("ck_characters_death_save_successes_range", "characters", type_="check")
    op.drop_constraint("ck_characters_hit_dice_spent_non_negative", "characters", type_="check")

    for column in reversed(_TEXT_COLUMNS):
        op.drop_column("characters", column)

    op.drop_column("characters", "spell_slots_spent")
    op.drop_column("characters", "attacks")
    op.drop_column("characters", "death_save_failures")
    op.drop_column("characters", "death_save_successes")
    op.drop_column("characters", "hit_dice_spent")
    op.drop_column("characters", "inspiration")
    op.drop_column("characters", "weight")
    op.drop_column("characters", "height")
    op.drop_column("characters", "age")
    op.drop_column("characters", "player_name")
