from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict


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
