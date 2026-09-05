from collections.abc import Sequence

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.characters import rules_5e
from app.characters.errors import (
    AsiFeatConflictError,
    CharacterNotFoundError,
    CustomItemNotSellableError,
    EffectInvalidModifierError,
    EffectNotFoundError,
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
    TooManyEffectsError,
)
from app.characters.models import (
    Character,
    CharacterEffect,
    CharacterSpell,
    InventoryEntry,
    LevelUpRecord,
)
from app.characters.schemas import (
    MAX_EFFECTS_PER_CHARACTER,
    ActiveEffectRead,
    CharacterCreate,
    CharacterDetailRead,
    CharacterEffectCreate,
    CharacterEffectRead,
    CharacterEffectUpdate,
    CharacterRead,
    CharacterSpellRead,
    CharacterUpdate,
    ComputedBlock,
    EffectSourceRead,
    InventoryEntryCreate,
    InventoryEntryRead,
    InventoryEntryUpdate,
    LevelUpRecordRead,
    LevelUpRequest,
    ModifierIn,
    ResolvedModifierRead,
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


    # --- Effects (US-13) -------------------------------------------------
    # Ownership is checked on every method (rule 7). A foreign character and a
    # foreign effect both answer 404, never 403 — a 403 confirms the id exists.

    def _validate_modifiers(self, modifiers: Sequence[ModifierIn]) -> list[dict]:
        """Reject modifiers the engine could never apply, as a domain error.

        The check lives here rather than in ModifierIn so it maps through
        register_exception_handlers into {error:{code,message}}. Raised from a
        Pydantic validator it would surface as FastAPI's default 422 and the
        frontend, which translates by error code, would show "Неизвестная
        ошибка" instead of naming the broken modifier.
        """
        cleaned: list[dict] = []
        for modifier in modifiers:
            probe = rules_5e.Modifier(
                target=modifier.target,
                op=modifier.op,
                value=modifier.value,
                dex_cap=modifier.dex_cap,
                stack_group=modifier.stack_group,
            )
            reason = rules_5e.modifier_shape_error(probe)
            if reason is not None:
                raise EffectInvalidModifierError(
                    f"Модификатор «{modifier.target}/{modifier.op}» отклонён: {reason}"
                )
            cleaned.append(modifier.model_dump(exclude_none=True))
        return cleaned

    async def list_effects(self, character_id: int, user_id: int) -> list[CharacterEffectRead]:
        character = await self.get_owned(character_id, user_id)
        rows = (
            await self._db.scalars(
                select(CharacterEffect)
                .where(CharacterEffect.character_id == character.id)
                .order_by(CharacterEffect.id)
            )
        ).all()
        return [CharacterEffectRead.model_validate(row) for row in rows]

    async def create_effect(
        self, character_id: int, user_id: int, payload: CharacterEffectCreate
    ) -> CharacterEffectRead:
        character = await self.get_owned(character_id, user_id)
        modifiers = self._validate_modifiers(payload.modifiers)

        existing = await self._db.scalar(
            select(func.count())
            .select_from(CharacterEffect)
            .where(CharacterEffect.character_id == character.id)
        )
        if (existing or 0) >= MAX_EFFECTS_PER_CHARACTER:
            raise TooManyEffectsError()

        effect = CharacterEffect(
            character_id=character.id,
            name=payload.name,
            source=payload.source,
            description=payload.description,
            modifiers=modifiers,
            is_active=payload.is_active,
            duration_kind=payload.duration_kind,
            duration_amount=payload.duration_amount,
        )
        self._db.add(effect)
        await self._db.commit()
        await self._db.refresh(effect)
        return CharacterEffectRead.model_validate(effect)

    async def _get_owned_effect(
        self, character_id: int, effect_id: int, user_id: int
    ) -> CharacterEffect:
        # Two links: the character must belong to the caller, and the effect
        # must belong to that character. Checking only the second would let a
        # caller read any effect by guessing its id.
        await self.get_owned(character_id, user_id)
        effect = await self._db.get(CharacterEffect, effect_id)
        if effect is None or effect.character_id != character_id:
            raise EffectNotFoundError()
        return effect

    async def update_effect(
        self, character_id: int, effect_id: int, user_id: int, payload: CharacterEffectUpdate
    ) -> CharacterEffectRead:
        effect = await self._get_owned_effect(character_id, effect_id, user_id)
        updates = payload.model_dump(exclude_unset=True)
        if "modifiers" in updates and updates["modifiers"] is not None:
            updates["modifiers"] = self._validate_modifiers(payload.modifiers or [])

        for field, value in updates.items():
            setattr(effect, field, value)

        await self._db.commit()
        await self._db.refresh(effect)
        return CharacterEffectRead.model_validate(effect)

    async def delete_effect(self, character_id: int, effect_id: int, user_id: int) -> None:
        effect = await self._get_owned_effect(character_id, effect_id, user_id)
        await self._db.delete(effect)
        await self._db.commit()

    async def _to_detail(self, character: Character) -> CharacterDetailRead:
        inventory = (
            await self._db.scalars(
                select(InventoryEntry)
                .where(InventoryEntry.character_id == character.id)
                .order_by(InventoryEntry.id)
            )
        ).all()
        # Read once and hand it over: _compute needs the same rows to find
        # equipped items, and querying them twice per sheet read is waste.
        computed = await self._compute(character, inventory)
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

    async def _collect_modifiers(
        self, character: Character, inventory: Sequence[InventoryEntry]
    ) -> list[rules_5e.Modifier]:
        """Modifiers in play right now: equipped catalogue items plus active
        temporary effects.

        An item contributes once per inventory row — `quantity` does not
        multiply it. Two rings of protection stacked into one row of quantity 2
        is one ring on each hand at most, and 5e never adds an item's bonus
        twice for carrying spares. Custom rows (no item_id) carry no effects:
        they are free text a DM handed over verbally.
        """
        modifiers: list[rules_5e.Modifier] = []

        equipped = [
            entry for entry in inventory if entry.equipped and entry.item_id is not None
        ]
        if equipped:
            effects_by_item = await ContentQueryService(self._db).item_effects_by_ids(
                [entry.item_id for entry in equipped if entry.item_id is not None]
            )
            for entry in equipped:
                item = effects_by_item.get(entry.item_id or 0)
                if item is None:
                    continue
                for order, raw in enumerate(item.effects):
                    modifier = self._modifier_from_raw(
                        raw,
                        source_kind="item",
                        source_id=entry.id,
                        source_name=item.name,
                        order=order,
                    )
                    if modifier is not None:
                        modifiers.append(modifier)

        active_effects = (
            await self._db.scalars(
                select(CharacterEffect)
                .where(
                    CharacterEffect.character_id == character.id,
                    CharacterEffect.is_active.is_(True),
                )
                .order_by(CharacterEffect.id)
            )
        ).all()
        for effect in active_effects:
            for order, raw in enumerate(effect.modifiers or []):
                modifier = self._modifier_from_raw(
                    raw,
                    source_kind="effect",
                    source_id=effect.id,
                    source_name=effect.name,
                    order=order,
                )
                if modifier is not None:
                    modifiers.append(modifier)

        return modifiers

    @staticmethod
    def _modifier_from_raw(
        raw: object, *, source_kind: str, source_id: int, source_name: str, order: int
    ) -> rules_5e.Modifier | None:
        """Build a Modifier from stored JSON, tolerating junk.

        `items.data.effects` predates this feature and holds whatever a pack
        author wrote, so a row that is not even a dict is skipped rather than
        raising: one malformed item must not make a character's sheet
        unopenable. Modifiers that are well-typed but meaningless still get
        built — the engine reports those in its trace with a reason, which is
        how the sheet explains a bonus that did not land.
        """
        if not isinstance(raw, dict):
            return None
        target = raw.get("target")
        op = raw.get("op")
        if not isinstance(target, str) or not isinstance(op, str):
            return None
        value = raw.get("value")
        dex_cap = raw.get("dex_cap")
        stack_group = raw.get("stack_group")
        return rules_5e.Modifier(
            target=target,
            op=op,
            value=value if isinstance(value, int) else None,
            dex_cap=dex_cap if isinstance(dex_cap, int) else None,
            stack_group=stack_group if isinstance(stack_group, str) else None,
            source_kind=source_kind,
            source_id=source_id,
            source_name=source_name,
            order=order,
        )

    @staticmethod
    def _effect_views(
        trace: Sequence[rules_5e.AppliedModifier],
    ) -> tuple[list[ActiveEffectRead], dict[str, list[EffectSourceRead]]]:
        """Turn the engine's flat trace into the two shapes the sheet needs:
        grouped by source (what did this ring do?) and grouped by target (where
        did this number come from?)."""
        by_source: dict[tuple[str, int], ActiveEffectRead] = {}
        by_target: dict[str, list[EffectSourceRead]] = {}

        for entry in trace:
            modifier = entry.modifier
            key = (modifier.source_kind, modifier.source_id)
            resolved = ResolvedModifierRead(
                target=modifier.target,
                op=modifier.op,
                value=modifier.value,
                applied=entry.applied,
                ignored_reason=entry.ignored_reason,
            )
            existing = by_source.get(key)
            if existing is None:
                by_source[key] = ActiveEffectRead(
                    source_kind=modifier.source_kind,  # type: ignore[arg-type]
                    source_id=modifier.source_id,
                    name=modifier.source_name,
                    modifiers=[resolved],
                )
            else:
                existing.modifiers.append(resolved)

            by_target.setdefault(modifier.target, []).append(
                EffectSourceRead(
                    source_kind=modifier.source_kind,  # type: ignore[arg-type]
                    source_id=modifier.source_id,
                    name=modifier.source_name,
                    op=modifier.op,
                    value=modifier.value,
                    applied=entry.applied,
                    ignored_reason=entry.ignored_reason,
                )
            )

        return list(by_source.values()), by_target

    async def _compute(
        self, character: Character, inventory: Sequence[InventoryEntry]
    ) -> ComputedBlock:
        """Derived numbers, with equipped items and active effects applied.

        The arithmetic all lives in rules_5e.resolve_effects (rule 3); this
        method only gathers inputs and files the answer into the schema.

        Nothing here writes back to the character. ability_scores, hp_max and
        speed stay the base values in their columns — that is what keeps
        level-up deltas exactly reversible, and it is why an ASI raises the
        base while a ring's `set` shows up only in the effective score.
        """
        base_scores = character.ability_scores or {}
        base_modifiers = {
            ability: rules_5e.ability_modifier(score) for ability, score in base_scores.items()
        }
        prof_bonus = rules_5e.proficiency_bonus(character.level)

        modifiers = await self._collect_modifiers(character, inventory)
        resolution = rules_5e.resolve_effects(
            ability_scores=base_scores,
            level=character.level,
            speed=character.speed,
            hp_max=character.hp_max,
            ac_override=character.ac_override,
            proficiencies=character.proficiencies or {},
            modifiers=modifiers,
        )
        active_effects, effect_sources = self._effect_views(resolution.trace)

        xp_to_next = rules_5e.xp_to_next_level(character.level, character.xp)
        xp_level_floor = rules_5e.xp_threshold(character.level)
        xp_next_threshold = (
            rules_5e.xp_threshold(character.level + 1)
            if character.level < rules_5e.MAX_LEVEL
            else None
        )
        spell_slots = (
            await ContentQueryService(self._db).get_spell_slots(
                class_id=character.class_id, level=character.level
            )
            or {}
        )

        return ComputedBlock(
            prof_bonus=prof_bonus,
            # Effective values under the original names: existing consumers
            # (the sheet, the campaign roster, the wizard preview) keep reading
            # `ac` and `skills` and now get the real numbers.
            modifiers=resolution.modifiers,
            saving_throws=resolution.saving_throws,
            skills=resolution.skills,
            ac=resolution.ac,
            initiative=resolution.initiative,
            passive_perception=resolution.passive_perception,
            xp_to_next=xp_to_next,
            xp_level_floor=xp_level_floor,
            xp_next_threshold=xp_next_threshold,
            level_up_available=rules_5e.level_up_available(character.level, character.xp),
            spell_slots=spell_slots,
            base_ability_scores=dict(base_scores),
            effective_ability_scores=resolution.ability_scores,
            base_modifiers=base_modifiers,
            speed_effective=resolution.speed,
            hp_max_effective=resolution.hp_max,
            advantage=resolution.advantage,
            damage_modifiers=resolution.damage,
            active_effects=active_effects,
            effect_sources=effect_sources,
        )
