"""content: races, classes, class_levels, subclasses, spells, spell_classes, items, backgrounds

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-14 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "races",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("locale", sa.String(length=10), server_default="ru", nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column(
            "data", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug", "locale", name="uq_races_slug_locale"),
    )

    op.create_table(
        "classes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("locale", sa.String(length=10), server_default="ru", nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("hit_die", sa.Integer(), nullable=False),
        sa.Column("primary_ability", sa.String(length=50), nullable=False),
        sa.Column(
            "data", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug", "locale", name="uq_classes_slug_locale"),
    )

    op.create_table(
        "class_levels",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("class_id", sa.Integer(), nullable=False),
        sa.Column("level", sa.Integer(), nullable=False),
        sa.Column(
            "features", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False
        ),
        sa.Column("spell_slots", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.ForeignKeyConstraint(["class_id"], ["classes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("class_id", "level", name="uq_class_levels_class_id_level"),
    )
    op.create_index(op.f("ix_class_levels_class_id"), "class_levels", ["class_id"], unique=False)

    op.create_table(
        "subclasses",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("class_id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("locale", sa.String(length=10), server_default="ru", nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("unlock_level", sa.Integer(), nullable=False),
        sa.Column(
            "data", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False
        ),
        sa.ForeignKeyConstraint(["class_id"], ["classes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug", "locale", name="uq_subclasses_slug_locale"),
    )
    op.create_index(op.f("ix_subclasses_class_id"), "subclasses", ["class_id"], unique=False)

    op.create_table(
        "spells",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("locale", sa.String(length=10), server_default="ru", nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("level", sa.Integer(), nullable=False),
        sa.Column("school", sa.String(length=50), nullable=False),
        sa.Column("casting_time", sa.String(length=100), nullable=False),
        sa.Column("range", sa.String(length=100), nullable=False),
        sa.Column("components", sa.String(length=100), nullable=False),
        sa.Column("duration", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column(
            "data", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug", "locale", name="uq_spells_slug_locale"),
    )

    op.create_table(
        "spell_classes",
        sa.Column("spell_id", sa.Integer(), nullable=False),
        sa.Column("class_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["spell_id"], ["spells.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["class_id"], ["classes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("spell_id", "class_id"),
    )

    op.create_table(
        "items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("locale", sa.String(length=10), server_default="ru", nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("type", sa.String(length=50), nullable=False),
        sa.Column("rarity", sa.String(length=50), nullable=False),
        sa.Column("price_g", sa.Integer(), server_default="0", nullable=False),
        sa.Column("price_s", sa.Integer(), server_default="0", nullable=False),
        sa.Column("price_c", sa.Integer(), server_default="0", nullable=False),
        sa.Column("weight", sa.Numeric(precision=6, scale=2), server_default="0", nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column(
            "data", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug", "locale", name="uq_items_slug_locale"),
    )

    op.create_table(
        "backgrounds",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("locale", sa.String(length=10), server_default="ru", nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column(
            "data", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug", "locale", name="uq_backgrounds_slug_locale"),
    )


def downgrade() -> None:
    op.drop_table("backgrounds")
    op.drop_table("items")
    op.drop_table("spell_classes")
    op.drop_table("spells")
    op.drop_index(op.f("ix_subclasses_class_id"), table_name="subclasses")
    op.drop_table("subclasses")
    op.drop_index(op.f("ix_class_levels_class_id"), table_name="class_levels")
    op.drop_table("class_levels")
    op.drop_table("classes")
    op.drop_table("races")
