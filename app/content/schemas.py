from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class RaceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    locale: str
    name: str
    data: dict[str, Any]


class ClassRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    locale: str
    name: str
    hit_die: int
    primary_ability: str
    data: dict[str, Any]


class ClassLevelRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    class_id: int
    level: int
    features: dict[str, Any]
    spell_slots: dict[str, Any] | None


class SubclassRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    class_id: int
    slug: str
    locale: str
    name: str
    unlock_level: int
    data: dict[str, Any]


class SpellRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    locale: str
    name: str
    level: int
    school: str
    casting_time: str
    range: str
    components: str
    duration: str
    description: str
    data: dict[str, Any]


class ItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    locale: str
    name: str
    type: str
    rarity: str
    price_g: int
    price_s: int
    price_c: int
    weight: Decimal
    description: str
    data: dict[str, Any]


class BackgroundRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    locale: str
    name: str
    data: dict[str, Any]


# --- Content pack import (DND-021) ---
# Locale is not accepted from the pack: MVP only deals in "ru" (the column
# exists on the models as groundwork for future i18n, see ARCHITECTURE.md §4.2).


class RaceImport(BaseModel):
    slug: str
    name: str
    data: dict[str, Any] = Field(default_factory=dict)


class ClassLevelImport(BaseModel):
    level: int
    features: dict[str, Any] = Field(default_factory=dict)
    spell_slots: dict[str, Any] | None = None


class SubclassImport(BaseModel):
    slug: str
    name: str
    unlock_level: int
    data: dict[str, Any] = Field(default_factory=dict)


class ClassImport(BaseModel):
    slug: str
    name: str
    hit_die: int
    primary_ability: str
    data: dict[str, Any] = Field(default_factory=dict)
    levels: list[ClassLevelImport] = Field(default_factory=list)
    subclasses: list[SubclassImport] = Field(default_factory=list)


class SpellImport(BaseModel):
    slug: str
    name: str
    level: int
    school: str
    casting_time: str
    range: str
    components: str
    duration: str
    description: str
    data: dict[str, Any] = Field(default_factory=dict)
    classes: list[str] = Field(default_factory=list)


class ItemImport(BaseModel):
    slug: str
    name: str
    type: str
    rarity: str
    price_g: int = 0
    price_s: int = 0
    price_c: int = 0
    weight: Decimal = Decimal("0")
    description: str
    data: dict[str, Any] = Field(default_factory=dict)


class BackgroundImport(BaseModel):
    slug: str
    name: str
    data: dict[str, Any] = Field(default_factory=dict)


class ContentPackImport(BaseModel):
    races: list[RaceImport] = Field(default_factory=list)
    classes: list[ClassImport] = Field(default_factory=list)
    spells: list[SpellImport] = Field(default_factory=list)
    items: list[ItemImport] = Field(default_factory=list)
    backgrounds: list[BackgroundImport] = Field(default_factory=list)


class ImportErrorItem(BaseModel):
    entity: str
    slug: str | None = None
    message: str


class ImportReport(BaseModel):
    created: int
    updated: int
    errors: list[ImportErrorItem]
