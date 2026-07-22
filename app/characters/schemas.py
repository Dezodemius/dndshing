from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

_ABILITY_KEYS = {"str", "dex", "con", "int", "wis", "cha"}


class AbilityScores(BaseModel):
    # `str`/`int` as bare field names break pydantic's annotation resolution
    # (it collects the whole class namespace before resolving hints, so a
    # field literally named `int` shadows the builtin for every field in the
    # model). Aliased Python-side names avoid that; the wire format — and the
    # dict stored in Character.ability_scores JSONB — still uses str/dex/con/
    # int/wis/cha, matching ARCHITECTURE.md §4.3.
    model_config = ConfigDict(populate_by_name=True)

    dex: int = Field(ge=1, le=30)
    con: int = Field(ge=1, le=30)
    wis: int = Field(ge=1, le=30)
    cha: int = Field(ge=1, le=30)
    strength: int = Field(ge=1, le=30, alias="str")
    intelligence: int = Field(ge=1, le=30, alias="int")


class CharacterCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    race_id: int
    class_id: int
    subclass_id: int | None = None
    background_id: int | None = None
    alignment: str = Field(min_length=1, max_length=50)
    ability_scores: AbilityScores
    hp_max: int = Field(ge=1)
    hp_current: int | None = Field(default=None, ge=0)
    hp_temp: int = Field(default=0, ge=0)
    ac_override: int | None = None
    speed: int = Field(ge=0)
    proficiencies: dict[str, Any] = Field(default_factory=dict)
    appearance: str | None = None
    backstory: str | None = None
    notes: str | None = None
    gold: int = Field(default=0, ge=0)
    silver: int = Field(default=0, ge=0)
    copper: int = Field(default=0, ge=0)


class CharacterUpdate(BaseModel):
    """Partial update. `level` is accepted only so its presence can be detected
    and rejected with `level_direct_edit_forbidden` — it is never applied."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=200)
    race_id: int | None = None
    class_id: int | None = None
    subclass_id: int | None = None
    background_id: int | None = None
    alignment: str | None = Field(default=None, min_length=1, max_length=50)
    level: int | None = None
    xp: int | None = Field(default=None, ge=0)
    ability_scores: AbilityScores | None = None
    hp_max: int | None = Field(default=None, ge=1)
    hp_current: int | None = Field(default=None, ge=0)
    hp_temp: int | None = Field(default=None, ge=0)
    ac_override: int | None = None
    speed: int | None = Field(default=None, ge=0)
    proficiencies: dict[str, Any] | None = None
    appearance: str | None = None
    backstory: str | None = None
    notes: str | None = None
    gold: int | None = Field(default=None, ge=0)
    silver: int | None = Field(default=None, ge=0)
    copper: int | None = Field(default=None, ge=0)


class CharacterRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    name: str
    race_id: int
    class_id: int
    subclass_id: int | None
    background_id: int | None
    alignment: str
    level: int
    xp: int
    ability_scores: dict[str, Any]
    hp_max: int
    hp_current: int
    hp_temp: int
    ac_override: int | None
    speed: int
    proficiencies: dict[str, Any]
    appearance: str | None
    backstory: str | None
    notes: str | None
    gold: int
    silver: int
    copper: int
    created_at: datetime
    updated_at: datetime


class ComputedBlock(BaseModel):
    prof_bonus: int
    modifiers: dict[str, int]
    saving_throws: dict[str, int]
    skills: dict[str, int]
    ac: int
    initiative: int
    passive_perception: int
    xp_to_next: int | None
    level_up_available: bool
    spell_slots: dict[str, Any]


class InventoryEntryCreate(BaseModel):
    """Exactly one of item_id/custom_name must be set — BR US-11."""

    model_config = ConfigDict(extra="forbid")

    item_id: int | None = None
    custom_name: str | None = Field(default=None, min_length=1, max_length=200)
    quantity: int = Field(default=1, ge=1)
    equipped: bool = False


class InventoryEntryUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    quantity: int | None = Field(default=None, ge=1)
    equipped: bool | None = None


class InventoryEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    character_id: int
    item_id: int | None
    custom_name: str | None
    quantity: int
    equipped: bool


class SpellSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    spell_id: int
    prepared: bool = False


class SpellsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    spells: list[SpellSelection] = Field(default_factory=list)


class CharacterSpellRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    spell_id: int
    prepared: bool


class CharacterDetailRead(CharacterRead):
    computed: ComputedBlock
    inventory: list[InventoryEntryRead]
    spells: list[CharacterSpellRead]


class LevelUpRequest(BaseModel):
    """`asi`/`feat` are mutually exclusive (5e: a level either grants an ASI or
    lets you take a feat instead, never both) — checked in the service, so the
    conflict maps to the project's `{error:{code,message}}` format instead of
    a generic validation error. `subclass_id` is only accepted on the level a
    class opens subclass choice — also enforced in the service, since it
    depends on content data. `spells_learned` are ids from the character's
    known-spell list for its class."""

    model_config = ConfigDict(extra="forbid")

    hp_method: Literal["average", "rolled"]
    hp_rolled: int | None = Field(default=None, ge=1)
    asi: dict[str, int] | None = None
    feat: str | None = Field(default=None, min_length=1, max_length=200)
    subclass_id: int | None = None
    spells_learned: list[int] = Field(default_factory=list)

    @field_validator("asi")
    @classmethod
    def _check_asi_keys(cls, value: dict[str, int] | None) -> dict[str, int] | None:
        if value is None:
            return value
        if not set(value).issubset(_ABILITY_KEYS):
            raise ValueError(f"asi keys must be a subset of {sorted(_ABILITY_KEYS)}")
        if any(increase <= 0 for increase in value.values()):
            raise ValueError("asi values must be positive")
        return value


class LevelUpRecordRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    character_id: int
    from_level: int
    to_level: int
    delta: dict[str, Any]
    created_at: datetime
