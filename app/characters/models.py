from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Character(Base):
    __tablename__ = "characters"
    # Repeated from migration 0010: autogenerate compares the model against the
    # database, so a constraint that exists only in a migration gets proposed
    # for deletion by whoever runs it next.
    __table_args__ = (
        CheckConstraint("hit_dice_spent >= 0", name="ck_characters_hit_dice_spent_non_negative"),
        CheckConstraint(
            "death_save_successes BETWEEN 0 AND 3",
            name="ck_characters_death_save_successes_range",
        ),
        CheckConstraint(
            "death_save_failures BETWEEN 0 AND 3",
            name="ck_characters_death_save_failures_range",
        ),
        CheckConstraint("age IS NULL OR age >= 0", name="ck_characters_age_non_negative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    race_id: Mapped[int] = mapped_column(ForeignKey("races.id"), nullable=False, index=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("classes.id"), nullable=False, index=True)
    subclass_id: Mapped[int | None] = mapped_column(
        ForeignKey("subclasses.id"), nullable=True, index=True
    )
    background_id: Mapped[int | None] = mapped_column(
        ForeignKey("backgrounds.id"), nullable=True, index=True
    )
    alignment: Mapped[str] = mapped_column(String(50), nullable=False)
    level: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    xp: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    ability_scores: Mapped[dict] = mapped_column(JSONB, nullable=False)
    hp_max: Mapped[int] = mapped_column(Integer, nullable=False)
    hp_current: Mapped[int] = mapped_column(Integer, nullable=False)
    hp_temp: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    ac_override: Mapped[int | None] = mapped_column(Integer, nullable=True)
    speed: Mapped[int] = mapped_column(Integer, nullable=False)
    proficiencies: Mapped[dict] = mapped_column(JSONB, nullable=False)
    appearance: Mapped[str | None] = mapped_column(Text, nullable=True)
    backstory: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    gold: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    silver: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    copper: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    # --- printable sheet (US-15, migration 0010) ---
    # The player's own name, kept on the sheet rather than read from the
    # account: a DM keeps a sheet for an absent player, and auth is another
    # module's territory.
    player_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Strings, not numbers: the sheet shows bare "74", players also write
    # "1,74 м" and "74 кг", and a numeric column would pick the unit for them.
    height: Mapped[str | None] = mapped_column(String(50), nullable=True)
    weight: Mapped[str | None] = mapped_column(String(50), nullable=True)
    inspiration: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    # Total hit dice is the level; the die itself is the class's. Only the
    # spent count has nowhere else to live.
    hit_dice_spent: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    death_save_successes: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=0, server_default="0"
    )
    death_save_failures: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=0, server_default="0"
    )
    # {"items": [{"name", "bonus", "damage"}], "note"}; bonus and damage are
    # strings, because the sheet is semi-manual and an attack bonus is a 5e
    # rule this project deliberately does not compute.
    attacks: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=lambda: {"items": []}, server_default='{"items": []}'
    )
    # {"1": 2, "3": 1} — spent slots only; the totals come from the class.
    spell_slots_spent: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )
    personality_traits: Mapped[str | None] = mapped_column(Text, nullable=True)
    ideals: Mapped[str | None] = mapped_column(Text, nullable=True)
    bonds: Mapped[str | None] = mapped_column(Text, nullable=True)
    flaws: Mapped[str | None] = mapped_column(Text, nullable=True)
    goals: Mapped[str | None] = mapped_column(Text, nullable=True)
    allies: Mapped[str | None] = mapped_column(Text, nullable=True)
    feats: Mapped[str | None] = mapped_column(Text, nullable=True)
    extra_features: Mapped[str | None] = mapped_column(Text, nullable=True)
    treasures: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class CharacterSpell(Base):
    __tablename__ = "character_spells"

    character_id: Mapped[int] = mapped_column(
        ForeignKey("characters.id", ondelete="CASCADE"), primary_key=True
    )
    spell_id: Mapped[int] = mapped_column(
        ForeignKey("spells.id", ondelete="CASCADE"), primary_key=True
    )
    prepared: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )


class InventoryEntry(Base):
    __tablename__ = "inventory_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    character_id: Mapped[int] = mapped_column(
        ForeignKey("characters.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_id: Mapped[int | None] = mapped_column(
        ForeignKey("items.id", ondelete="SET NULL"), nullable=True, index=True
    )
    custom_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    equipped: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )


class LevelUpRecord(Base):
    __tablename__ = "level_up_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    character_id: Mapped[int] = mapped_column(
        ForeignKey("characters.id", ondelete="CASCADE"), nullable=False, index=True
    )
    from_level: Mapped[int] = mapped_column(Integer, nullable=False)
    to_level: Mapped[int] = mapped_column(Integer, nullable=False)
    delta: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class CharacterEffect(Base):
    """A temporary buff or debuff the player manages by hand (US-13).

    Effects from equipped items live in items.data.effects and are read from
    the content module; this table is only for the ones a player types in.

    Nothing counts the duration down — AR decision 8 rules out real-time, so
    duration_kind/duration_amount are a note to the player and is_active is the
    switch. The CHECK constraints are repeated here so the model and the
    migration cannot drift; `alembic revision --autogenerate` would otherwise
    propose dropping them.
    """

    __tablename__ = "character_effects"
    __table_args__ = (
        CheckConstraint(
            "duration_kind IN ('rounds', 'minutes', 'hours', 'until_short_rest',"
            " 'until_long_rest', 'until_removed')",
            name="ck_character_effects_duration_kind",
        ),
        CheckConstraint(
            "duration_amount IS NULL OR duration_amount > 0",
            name="ck_character_effects_duration_amount",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    character_id: Mapped[int] = mapped_column(
        ForeignKey("characters.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    source: Mapped[str | None] = mapped_column(String(200), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    modifiers: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, server_default="[]"
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    duration_kind: Mapped[str] = mapped_column(
        String(20), nullable=False, default="until_removed", server_default="until_removed"
    )
    duration_amount: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
