"""merchants: merchants, merchant_items

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
        "merchants",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("owner_user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("share_code", sa.String(length=32), nullable=False),
        sa.Column("is_open", sa.Boolean(), server_default="true", nullable=False),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("share_code", name="uq_merchants_share_code"),
    )
    op.create_index(
        op.f("ix_merchants_owner_user_id"), "merchants", ["owner_user_id"], unique=False
    )
    op.create_index(
        op.f("ix_merchants_share_code"), "merchants", ["share_code"], unique=True
    )

    op.create_table(
        "merchant_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("merchant_id", sa.Integer(), nullable=False),
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column("price_g", sa.Integer(), nullable=True),
        sa.Column("price_s", sa.Integer(), nullable=True),
        sa.Column("price_c", sa.Integer(), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["merchant_id"], ["merchants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_merchant_items_merchant_id"), "merchant_items", ["merchant_id"], unique=False
    )
    op.create_index(
        op.f("ix_merchant_items_item_id"), "merchant_items", ["item_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_merchant_items_item_id"), table_name="merchant_items")
    op.drop_index(op.f("ix_merchant_items_merchant_id"), table_name="merchant_items")
    op.drop_table("merchant_items")

    op.drop_index(op.f("ix_merchants_share_code"), table_name="merchants")
    op.drop_index(op.f("ix_merchants_owner_user_id"), table_name="merchants")
    op.drop_table("merchants")
