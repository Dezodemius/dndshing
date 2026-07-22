from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.characters import rules_5e
from app.characters.errors import (
    AsiFeatConflictError,
    CharacterNotFoundError,
    InvalidHpRollError,
    InvalidReferenceError,
    LevelDirectEditForbiddenError,
    LevelUpNotAvailableError,
    SubclassWrongLevelError,
)
from app.characters.models import Character, CharacterSpell, LevelUpRecord
from app.characters.schemas import (
    CharacterCreate,
    CharacterDetailRead,
    CharacterRead,
    CharacterUpdate,
    ComputedBlock,
    LevelUpRecordRead,
    LevelUpRequest,
)
from app.content.service import ContentQueryService


class CharacterService:
    """CRUD for the player's own characters, plus the `computed` block (AR §6).
    Ownership is checked on every method that takes a character_id — a
    character owned by another user is reported as not found (IDOR, see
    security-review skill), never as forbidden."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def list_for_user(self, user_id: int) -> list[CharacterRead]:
        rows = (
            await self._db.scalars(
                select(Character)
                .where(Character.user_id == user_id)
                .order_by(Character.created_at)
            )
        ).all()
        return [CharacterRead.model_validate(row) for row in rows]

    async def create(self, user_id: int, payload: CharacterCreate) -> CharacterDetailRead:
        character = Character(
            user_id=user_id,
            name=payload.name,
            race_id=payload.race_id,
            class_id=payload.class_id,
            subclass_id=payload.subclass_id,
            background_id=payload.background_id,
            alignment=payload.alignment,
            ability_scores=payload.ability_scores.model_dump(by_alias=True),
            hp_max=payload.hp_max,
            hp_current=payload.hp_current if payload.hp_current is not None else payload.hp_max,
            hp_temp=payload.hp_temp,
            ac_override=payload.ac_override,
            speed=payload.speed,
            proficiencies=payload.proficiencies,
            appearance=payload.appearance,
            backstory=payload.backstory,
            notes=payload.notes,
            gold=payload.gold,
            silver=payload.silver,
            copper=payload.copper,
        )
        self._db.add(character)
        try:
            await self._db.flush()
        except IntegrityError as exc:
            await self._db.rollback()
            raise InvalidReferenceError() from exc
        await self._db.commit()
        await self._db.refresh(character)
        return await self._to_detail(character)

    async def get_owned(
        self, character_id: int, user_id: int, *, for_update: bool = False
    ) -> Character:
        if for_update:
            character = await self._db.scalar(
                select(Character).where(Character.id == character_id).with_for_update()
            )
        else:
            character = await self._db.get(Character, character_id)
        if character is None or character.user_id != user_id:
            raise CharacterNotFoundError()
        return character

    async def get_detail(self, character_id: int, user_id: int) -> CharacterDetailRead:
        character = await self.get_owned(character_id, user_id)
        return await self._to_detail(character)

    async def update(
        self, character_id: int, user_id: int, payload: CharacterUpdate
    ) -> CharacterDetailRead:
        character = await self.get_owned(character_id, user_id)
        updates = payload.model_dump(exclude_unset=True, by_alias=True)
        if "level" in updates:
            raise LevelDirectEditForbiddenError()

        for field, value in updates.items():
            setattr(character, field, value)

        try:
            await self._db.flush()
        except IntegrityError as exc:
            await self._db.rollback()
            raise InvalidReferenceError() from exc
        await self._db.commit()
        await self._db.refresh(character)
        return await self._to_detail(character)

    async def delete(self, character_id: int, user_id: int) -> None:
        character = await self.get_owned(character_id, user_id)
        await self._db.delete(character)
        await self._db.commit()

    async def level_up(
        self, character_id: int, user_id: int, payload: LevelUpRequest
    ) -> LevelUpRecordRead:
        character = await self.get_owned(character_id, user_id, for_update=True)
        from_level = character.level
        to_level = from_level + 1

        if from_level >= rules_5e.MAX_LEVEL or character.xp < rules_5e.xp_threshold(to_level):
            raise LevelUpNotAvailableError()
        if payload.asi is not None and payload.feat is not None:
            raise AsiFeatConflictError()

        content = ContentQueryService(self._db)

        klass = await content.get_class_by_id(character.class_id)
        if klass is None:
            raise InvalidReferenceError()

        con_modifier = rules_5e.ability_modifier((character.ability_scores or {}).get("con", 10))
        if payload.hp_method == "average":
            hp_gained = rules_5e.average_hp_gain(klass.hit_die, con_modifier)
        else:
            if payload.hp_rolled is None:
                raise InvalidHpRollError()
            try:
                hp_gained = rules_5e.rolled_hp_gain(klass.hit_die, payload.hp_rolled, con_modifier)
            except ValueError as exc:
                raise InvalidHpRollError() from exc

        subclass_chosen: str | None = None
        if payload.subclass_id is not None:
            subclass = await content.get_subclass(payload.subclass_id)
            if subclass is None or subclass.class_id != character.class_id:
                raise InvalidReferenceError()
            if subclass.unlock_level != to_level:
                raise SubclassWrongLevelError()
            subclass_chosen = subclass.slug
            character.subclass_id = subclass.id

        class_level = await content.get_class_level(class_id=character.class_id, level=to_level)
        features_unlocked = (
            list((class_level.features or {}).keys()) if class_level is not None else []
        )

        spells = await content.get_spells_by_ids(
            payload.spells_learned, class_id=character.class_id
        )
        if {spell.id for spell in spells} != set(payload.spells_learned):
            raise InvalidReferenceError()

        already_known = set(
            (
                await self._db.scalars(
                    select(CharacterSpell.spell_id).where(
                        CharacterSpell.character_id == character.id
                    )
                )
            ).all()
        )
        newly_learned_spells = [spell for spell in spells if spell.id not in already_known]
        for spell in newly_learned_spells:
            self._db.add(CharacterSpell(character_id=character.id, spell_id=spell.id))

        if payload.asi is not None:
            ability_scores = dict(character.ability_scores or {})
            for ability, increase in payload.asi.items():
                ability_scores[ability] = ability_scores.get(ability, 10) + increase
            character.ability_scores = ability_scores

        character.level = to_level
        character.hp_max += hp_gained
        character.hp_current += hp_gained

        delta = {
            "hp_gained": hp_gained,
            "hp_method": payload.hp_method,
            "asi": payload.asi,
            "feat": payload.feat,
            "subclass_chosen": subclass_chosen,
            "features_unlocked": features_unlocked,
            "spells_learned": [spell.slug for spell in newly_learned_spells],
            "spells_forgotten": [],
        }
        record = LevelUpRecord(
            character_id=character.id, from_level=from_level, to_level=to_level, delta=delta
        )
        self._db.add(record)

        try:
            await self._db.flush()
        except IntegrityError as exc:
            await self._db.rollback()
            raise InvalidReferenceError() from exc
        await self._db.commit()
        await self._db.refresh(record)
        return LevelUpRecordRead.model_validate(record)

    async def _to_detail(self, character: Character) -> CharacterDetailRead:
        computed = await self._compute(character)
        return CharacterDetailRead(
            **CharacterRead.model_validate(character).model_dump(), computed=computed
        )

    async def _compute(self, character: Character) -> ComputedBlock:
        scores = character.ability_scores or {}
        modifiers = {ability: rules_5e.ability_modifier(score) for ability, score in scores.items()}
        prof_bonus = rules_5e.proficiency_bonus(character.level)
        dex_score = scores.get("dex", 10)
        wis_score = scores.get("wis", 10)
        ac = (
            character.ac_override
            if character.ac_override is not None
            else rules_5e.base_armor_class(dex_score)
        )
        skills = (character.proficiencies or {}).get("skills", [])
        passive_perception = rules_5e.passive_perception(
            wis_score, "perception" in skills, prof_bonus
        )
        xp_to_next = rules_5e.xp_to_next_level(character.level, character.xp)
        level_up_available = character.level < rules_5e.MAX_LEVEL and character.xp >= (
            rules_5e.xp_threshold(character.level + 1)
        )
        spell_slots = (
            await ContentQueryService(self._db).get_spell_slots(
                class_id=character.class_id, level=character.level
            )
            or {}
        )

        return ComputedBlock(
            prof_bonus=prof_bonus,
            modifiers=modifiers,
            ac=ac,
            initiative=rules_5e.initiative(dex_score),
            passive_perception=passive_perception,
            xp_to_next=xp_to_next,
            level_up_available=level_up_available,
            spell_slots=spell_slots,
        )
