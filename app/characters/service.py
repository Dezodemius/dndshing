from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.characters import rules_5e
from app.characters.errors import (
    AsiFeatConflictError,
    CharacterNotFoundError,
    CustomItemNotSellableError,
    InsufficientFundsError,
    InsufficientInventoryQuantityError,
    InvalidHpRollError,
    InvalidReferenceError,
    InventoryEntryNotFoundError,
    InventoryPayloadInvalidError,
    LevelDirectEditForbiddenError,
    LevelUpNotAvailableError,
    RollbackEmptyError,
    SpellNotInClassListError,
    SubclassWrongLevelError,
)
from app.characters.models import Character, CharacterSpell, InventoryEntry, LevelUpRecord
from app.characters.schemas import (
    CharacterCreate,
    CharacterDetailRead,
    CharacterListRead,
    CharacterRead,
    CharacterSpellRead,
    CharacterUpdate,
    ComputedBlock,
    InventoryEntryCreate,
    InventoryEntryRead,
    InventoryEntryUpdate,
    LevelUpRecordRead,
    LevelUpRequest,
    SpellsUpdate,
)
from app.content.service import ContentQueryService


class CharacterService:
    """CRUD for the player's own characters, plus the `computed` block (AR §6).
    Ownership is checked on every method that takes a character_id — a
    character owned by another user is reported as not found (IDOR, see
    security-review skill), never as forbidden."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def list_for_user(self, user_id: int) -> list[CharacterListRead]:
        rows = (
            await self._db.scalars(
                select(Character)
                .where(Character.user_id == user_id)
                .order_by(Character.created_at)
            )
        ).all()
        if not rows:
            return []

        content = ContentQueryService(self._db)
        race_names = await content.race_names()
        class_names = await content.class_names()
        return [self._to_list_row(row, race_names, class_names) for row in rows]

    def _to_list_row(
        self, character: Character, race_names: dict[int, str], class_names: dict[int, str]
    ) -> CharacterListRead:
        return CharacterListRead(
            id=character.id,
            name=character.name,
            race_id=character.race_id,
            class_id=character.class_id,
            subclass_id=character.subclass_id,
            race_name=race_names.get(character.race_id),
            class_name=class_names.get(character.class_id),
            level=character.level,
            xp=character.xp,
            hp_max=character.hp_max,
            hp_current=character.hp_current,
            hp_temp=character.hp_temp,
            ac=rules_5e.armor_class(
                character.ac_override, (character.ability_scores or {}).get("dex", 10)
            ),
            gold=character.gold,
            silver=character.silver,
            copper=character.copper,
            level_up_available=rules_5e.level_up_available(character.level, character.xp),
            created_at=character.created_at,
            updated_at=character.updated_at,
        )

    async def list_ids_for_user(self, user_id: int) -> list[int]:
        """Just the ids. Callers that only need to scope a query by ownership
        (campaigns) must not pay for the content lookups list_for_user does."""
        return list(
            (
                await self._db.scalars(
                    select(Character.id).where(Character.user_id == user_id)
                )
            ).all()
        )

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

    async def get_detail_by_id(self, character_id: int) -> CharacterDetailRead:
        """Full detail without an ownership check — the caller (campaigns
        service, for the DM read-only view) must already have verified access."""
        character = await self._db.get(Character, character_id)
        if character is None:
            raise CharacterNotFoundError()
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
        # Content pack shape is {"items": [{"name": ..., "description": ...}]} — the
        # delta stores feature names, so the level history stays readable on its own.
        level_features = (class_level.features if class_level is not None else None) or {}
        features_unlocked = [
            feature["name"] for feature in level_features.get("items", []) if feature.get("name")
        ]

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

    async def rollback_level(self, character_id: int, user_id: int) -> CharacterDetailRead:
        character = await self.get_owned(character_id, user_id, for_update=True)
        record = await self._db.scalar(
            select(LevelUpRecord)
            .where(LevelUpRecord.character_id == character.id)
            .order_by(LevelUpRecord.id.desc())
            .limit(1)
        )
        if record is None:
            raise RollbackEmptyError()

        delta = record.delta
        content = ContentQueryService(self._db)

        asi = delta.get("asi")
        if asi:
            ability_scores = dict(character.ability_scores or {})
            for ability, increase in asi.items():
                ability_scores[ability] = ability_scores.get(ability, 10) - increase
            character.ability_scores = ability_scores

        if delta.get("subclass_chosen"):
            character.subclass_id = None

        learned_ids = await content.get_spell_ids_by_slugs(delta.get("spells_learned") or [])
        if learned_ids:
            await self._db.execute(
                delete(CharacterSpell).where(
                    CharacterSpell.character_id == character.id,
                    CharacterSpell.spell_id.in_(learned_ids),
                )
            )

        forgotten_ids = await content.get_spell_ids_by_slugs(delta.get("spells_forgotten") or [])
        for spell_id in forgotten_ids:
            self._db.add(CharacterSpell(character_id=character.id, spell_id=spell_id))

        hp_gained = delta.get("hp_gained", 0)
        character.hp_max -= hp_gained
        # Subtracting keeps the "up then rollback restores the exact prior state"
        # invariant for damage taken *before* the level-up, but a character hurt
        # *after* it can hold less than hp_gained — the floor keeps hp_current out
        # of the negatives, which no other code path can produce.
        character.hp_current = max(character.hp_current - hp_gained, 0)
        character.level = record.from_level

        await self._db.delete(record)

        try:
            await self._db.flush()
        except IntegrityError as exc:
            await self._db.rollback()
            raise InvalidReferenceError() from exc
        await self._db.commit()
        await self._db.refresh(character)
        return await self._to_detail(character)

    async def get_level_history(
        self, character_id: int, user_id: int
    ) -> list[LevelUpRecordRead]:
        character = await self.get_owned(character_id, user_id)
        rows = (
            await self._db.scalars(
                select(LevelUpRecord)
                .where(LevelUpRecord.character_id == character.id)
                .order_by(LevelUpRecord.id)
            )
        ).all()
        return [LevelUpRecordRead.model_validate(row) for row in rows]

    async def add_inventory_item(
        self, character_id: int, user_id: int, payload: InventoryEntryCreate
    ) -> InventoryEntryRead:
        character = await self.get_owned(character_id, user_id)
        if (payload.item_id is None) == (payload.custom_name is None):
            raise InventoryPayloadInvalidError()

        entry = InventoryEntry(
            character_id=character.id,
            item_id=payload.item_id,
            custom_name=payload.custom_name,
            quantity=payload.quantity,
            equipped=payload.equipped,
        )
        self._db.add(entry)
        try:
            await self._db.flush()
        except IntegrityError as exc:
            await self._db.rollback()
            raise InvalidReferenceError() from exc
        await self._db.commit()
        await self._db.refresh(entry)
        return InventoryEntryRead.model_validate(entry)

    async def _get_owned_inventory_entry(
        self, character_id: int, entry_id: int, user_id: int
    ) -> InventoryEntry:
        await self.get_owned(character_id, user_id)
        entry = await self._db.get(InventoryEntry, entry_id)
        if entry is None or entry.character_id != character_id:
            raise InventoryEntryNotFoundError()
        return entry

    async def apply_purchase(
        self,
        character_id: int,
        user_id: int,
        *,
        item_id: int,
        quantity: int,
        gold: int,
        silver: int,
        copper: int,
    ) -> InventoryEntry:
        """Shop buy (BR §4.5): lock the character, debit the wallet by exact
        currency amounts with no auto-conversion (CLAUDE.md rule 4), and add
        the purchased item to inventory — merging into an existing entry for
        the same item_id when one exists ("создать/увеличить"). The caller
        (merchants.service.buy) already holds a `SELECT ... FOR UPDATE` on the
        merchant item and controls the commit, so this method only flushes —
        the debit, the stock decrement and the inventory write land in one
        transaction."""
        character = await self.get_owned(character_id, user_id, for_update=True)
        if character.gold < gold or character.silver < silver or character.copper < copper:
            raise InsufficientFundsError()
        character.gold -= gold
        character.silver -= silver
        character.copper -= copper

        entry = await self._db.scalar(
            select(InventoryEntry).where(
                InventoryEntry.character_id == character.id,
                InventoryEntry.item_id == item_id,
            )
        )
        if entry is not None:
            entry.quantity += quantity
        else:
            entry = InventoryEntry(character_id=character.id, item_id=item_id, quantity=quantity)
            self._db.add(entry)

        await self._db.flush()
        return entry

    async def apply_sale(
        self,
        character_id: int,
        user_id: int,
        *,
        entry_id: int,
        quantity: int,
    ) -> tuple[int, int, int, int | None]:
        """Shop sell (BR §4.5): lock the character and the inventory entry,
        require a catalog item_id (custom items are unsellable — BR §9
        glossary), credit the wallet with 50% of the item's card price per
        unit rounded down per currency (CLAUDE.md rule 4 — no auto-conversion),
        and remove the sold quantity from inventory. Sold items never restock
        the merchant (BR §6, out of MVP scope). The caller
        (merchants.service.sell) controls the commit."""
        character = await self.get_owned(character_id, user_id, for_update=True)
        entry = await self._db.scalar(
            select(InventoryEntry).where(InventoryEntry.id == entry_id).with_for_update()
        )
        if entry is None or entry.character_id != character.id:
            raise InventoryEntryNotFoundError()
        if entry.item_id is None:
            raise CustomItemNotSellableError()
        if entry.quantity < quantity:
            raise InsufficientInventoryQuantityError()

        item = await ContentQueryService(self._db).get_item_by_id(entry.item_id)
        if item is None:
            raise InvalidReferenceError()

        refund_gold = (item.price_g // 2) * quantity
        refund_silver = (item.price_s // 2) * quantity
        refund_copper = (item.price_c // 2) * quantity

        character.gold += refund_gold
        character.silver += refund_silver
        character.copper += refund_copper

        entry.quantity -= quantity
        remaining: int | None = entry.quantity
        if entry.quantity == 0:
            await self._db.delete(entry)
            remaining = None

        await self._db.flush()
        return refund_gold, refund_silver, refund_copper, remaining

    async def update_inventory_item(
        self, character_id: int, entry_id: int, user_id: int, payload: InventoryEntryUpdate
    ) -> InventoryEntryRead:
        entry = await self._get_owned_inventory_entry(character_id, entry_id, user_id)
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(entry, field, value)
        await self._db.commit()
        await self._db.refresh(entry)
        return InventoryEntryRead.model_validate(entry)

    async def delete_inventory_item(self, character_id: int, entry_id: int, user_id: int) -> None:
        entry = await self._get_owned_inventory_entry(character_id, entry_id, user_id)
        await self._db.delete(entry)
        await self._db.commit()

    async def update_spells(
        self, character_id: int, user_id: int, payload: SpellsUpdate
    ) -> list[CharacterSpellRead]:
        character = await self.get_owned(character_id, user_id)
        content = ContentQueryService(self._db)

        selections = {selection.spell_id: selection.prepared for selection in payload.spells}
        allowed_spell_ids = await content.spell_ids_on_class_list(
            spell_ids=selections.keys(), class_id=character.class_id
        )
        if not selections.keys() <= allowed_spell_ids:
            raise SpellNotInClassListError()

        await self._db.execute(
            delete(CharacterSpell).where(CharacterSpell.character_id == character.id)
        )
        for spell_id, prepared in selections.items():
            self._db.add(
                CharacterSpell(character_id=character.id, spell_id=spell_id, prepared=prepared)
            )
        await self._db.commit()

        rows = (
            await self._db.scalars(
                select(CharacterSpell)
                .where(CharacterSpell.character_id == character.id)
                .order_by(CharacterSpell.spell_id)
            )
        ).all()
        return [CharacterSpellRead.model_validate(row) for row in rows]

    async def _to_detail(self, character: Character) -> CharacterDetailRead:
        computed = await self._compute(character)
        inventory = (
            await self._db.scalars(
                select(InventoryEntry)
                .where(InventoryEntry.character_id == character.id)
                .order_by(InventoryEntry.id)
            )
        ).all()
        spells = (
            await self._db.scalars(
                select(CharacterSpell)
                .where(CharacterSpell.character_id == character.id)
                .order_by(CharacterSpell.spell_id)
            )
        ).all()
        return CharacterDetailRead(
            **CharacterRead.model_validate(character).model_dump(),
            computed=computed,
            inventory=[InventoryEntryRead.model_validate(entry) for entry in inventory],
            spells=[CharacterSpellRead.model_validate(spell) for spell in spells],
        )

    async def _compute(self, character: Character) -> ComputedBlock:
        scores = character.ability_scores or {}
        modifiers = {ability: rules_5e.ability_modifier(score) for ability, score in scores.items()}
        prof_bonus = rules_5e.proficiency_bonus(character.level)
        dex_score = scores.get("dex", 10)
        wis_score = scores.get("wis", 10)
        ac = rules_5e.armor_class(character.ac_override, dex_score)
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
        xp_level_floor = rules_5e.xp_threshold(character.level)
        xp_next_threshold = (
            rules_5e.xp_threshold(character.level + 1)
            if character.level < rules_5e.MAX_LEVEL
            else None
        )
        level_up_available = rules_5e.level_up_available(character.level, character.xp)
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
            xp_level_floor=xp_level_floor,
            xp_next_threshold=xp_next_threshold,
            level_up_available=level_up_available,
            spell_slots=spell_slots,
        )
