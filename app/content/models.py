from sqlalchemy import ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Race(Base):
    __tablename__ = "races"
    __table_args__ = (UniqueConstraint("slug", "locale", name="uq_races_slug_locale"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(100), nullable=False)
    locale: Mapped[str] = mapped_column(
        String(10), nullable=False, default="ru", server_default="ru"
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")


class Class(Base):
    __tablename__ = "classes"
    __table_args__ = (UniqueConstraint("slug", "locale", name="uq_classes_slug_locale"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(100), nullable=False)
    locale: Mapped[str] = mapped_column(
        String(10), nullable=False, default="ru", server_default="ru"
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    hit_die: Mapped[int] = mapped_column(Integer, nullable=False)
    primary_ability: Mapped[str] = mapped_column(String(50), nullable=False)
    data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")


class ClassLevel(Base):
    __tablename__ = "class_levels"
    __table_args__ = (UniqueConstraint("class_id", "level", name="uq_class_levels_class_id_level"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    class_id: Mapped[int] = mapped_column(
        ForeignKey("classes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    level: Mapped[int] = mapped_column(Integer, nullable=False)
    features: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    spell_slots: Mapped[dict | None] = mapped_column(JSONB, nullable=True)


class Subclass(Base):
    __tablename__ = "subclasses"
    __table_args__ = (UniqueConstraint("slug", "locale", name="uq_subclasses_slug_locale"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    class_id: Mapped[int] = mapped_column(
        ForeignKey("classes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    slug: Mapped[str] = mapped_column(String(100), nullable=False)
    locale: Mapped[str] = mapped_column(
        String(10), nullable=False, default="ru", server_default="ru"
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    unlock_level: Mapped[int] = mapped_column(Integer, nullable=False)
    data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")


class Spell(Base):
    __tablename__ = "spells"
    __table_args__ = (UniqueConstraint("slug", "locale", name="uq_spells_slug_locale"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(100), nullable=False)
    locale: Mapped[str] = mapped_column(
        String(10), nullable=False, default="ru", server_default="ru"
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    level: Mapped[int] = mapped_column(Integer, nullable=False)
    school: Mapped[str] = mapped_column(String(50), nullable=False)
    casting_time: Mapped[str] = mapped_column(String(100), nullable=False)
    range: Mapped[str] = mapped_column(String(100), nullable=False)
    components: Mapped[str] = mapped_column(String(100), nullable=False)
    duration: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")


class SpellClass(Base):
    __tablename__ = "spell_classes"

    spell_id: Mapped[int] = mapped_column(
        ForeignKey("spells.id", ondelete="CASCADE"), primary_key=True
    )
    class_id: Mapped[int] = mapped_column(
        ForeignKey("classes.id", ondelete="CASCADE"), primary_key=True
    )


class Item(Base):
    __tablename__ = "items"
    __table_args__ = (UniqueConstraint("slug", "locale", name="uq_items_slug_locale"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(100), nullable=False)
    locale: Mapped[str] = mapped_column(
        String(10), nullable=False, default="ru", server_default="ru"
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    rarity: Mapped[str] = mapped_column(String(50), nullable=False)
    price_g: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    price_s: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    price_c: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    weight: Mapped[float] = mapped_column(
        Numeric(6, 2), nullable=False, default=0, server_default="0"
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")


class Background(Base):
    __tablename__ = "backgrounds"
    __table_args__ = (UniqueConstraint("slug", "locale", name="uq_backgrounds_slug_locale"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(100), nullable=False)
    locale: Mapped[str] = mapped_column(
        String(10), nullable=False, default="ru", server_default="ru"
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
