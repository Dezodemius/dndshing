from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.characters import rules_5e
from app.characters.errors import (
    CharacterNotFoundError,
    InvalidReferenceError,
    LevelDirectEditForbiddenError,
)
from app.characters.models import Character
from app.characters.schemas import (
    CharacterCreate,
    CharacterDetailRead,
    CharacterRead,
    CharacterUpdate,
    ComputedBlock,
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

    async def get_owned(self, character_id: int, user_id: int) -> Character:
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
        proficient_skills = set((character.proficiencies or {}).get("skills", []))
        proficient_saves = set((character.proficiencies or {}).get("saves", []))
        passive_perception = rules_5e.passive_perception(
            wis_score, "perception" in proficient_skills, prof_bonus
        )
        saving_throws = {
            ability: rules_5e.proficient_modifier(
                modifiers.get(ability, 0), ability in proficient_saves, prof_bonus
            )
            for ability in rules_5e.ABILITIES
        }
        skills = {
            skill: rules_5e.proficient_modifier(
                modifiers.get(ability, 0), skill in proficient_skills, prof_bonus
            )
            for skill, ability in rules_5e.SKILL_ABILITIES.items()
        }
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
            saving_throws=saving_throws,
            skills=skills,
            ac=ac,
            initiative=rules_5e.initiative(dex_score),
            passive_perception=passive_perception,
            xp_to_next=xp_to_next,
            level_up_available=level_up_available,
            spell_slots=spell_slots,
        )
