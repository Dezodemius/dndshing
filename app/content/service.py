from collections.abc import Iterable
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.content.cache import content_cache
from app.content.models import (
    Background,
    Class,
    ClassLevel,
    Item,
    Race,
    Spell,
    SpellClass,
    Subclass,
)
from app.content.schemas import (
    BackgroundImport,
    BackgroundRead,
    ClassDetailRead,
    ClassImport,
    ClassLevelRead,
    ClassRead,
    ContentPackImport,
    ImportErrorItem,
    ImportReport,
    ItemImport,
    ItemRead,
    RaceImport,
    RaceRead,
    SpellImport,
    SpellRead,
    SubclassRead,
)

_LOCALE = "ru"
_ITEM_TYPES = {"weapon", "armor", "potion", "scroll", "magic", "quest", "gear"}


def _duplicates(values: Iterable[object]) -> set[object]:
    seen: set[object] = set()
    dupes: set[object] = set()
    for value in values:
        if value in seen:
            dupes.add(value)
        seen.add(value)
    return dupes


class ContentImportService:
    """Upserts a content pack by slug. Any domain error rolls back the whole pack
    (BR US-12: a partially broken pack is not applied at all)."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def import_pack(self, pack: ContentPackImport) -> ImportReport:
        errors: list[ImportErrorItem] = []
        created = 0
        updated = 0

        delta_created, delta_updated = await self._import_races(pack.races, errors)
        created += delta_created
        updated += delta_updated

        class_id_by_slug, delta_created, delta_updated = await self._import_classes(
            pack.classes, errors
        )
        created += delta_created
        updated += delta_updated

        delta_created, delta_updated = await self._import_spells(
            pack.spells, class_id_by_slug, errors
        )
        created += delta_created
        updated += delta_updated

        delta_created, delta_updated = await self._import_items(pack.items, errors)
        created += delta_created
        updated += delta_updated

        delta_created, delta_updated = await self._import_backgrounds(pack.backgrounds, errors)
        created += delta_created
        updated += delta_updated

        if errors:
            await self._db.rollback()
            return ImportReport(created=0, updated=0, errors=errors)

        await self._db.commit()
        content_cache.clear()
        return ImportReport(created=created, updated=updated, errors=[])

    async def _import_races(
        self, items: list[RaceImport], errors: list[ImportErrorItem]
    ) -> tuple[int, int]:
        created = updated = 0
        duplicate_slugs = _duplicates(race.slug for race in items)

        for race_import in items:
            if race_import.slug in duplicate_slugs:
                errors.append(
                    ImportErrorItem(
                        entity="race", slug=race_import.slug, message="Повторяющийся slug в паке"
                    )
                )
                continue

            existing = await self._db.scalar(
                select(Race).where(Race.slug == race_import.slug, Race.locale == _LOCALE)
            )
            if existing is not None:
                existing.name = race_import.name
                existing.data = race_import.data
                updated += 1
            else:
                self._db.add(
                    Race(
                        slug=race_import.slug,
                        locale=_LOCALE,
                        name=race_import.name,
                        data=race_import.data,
                    )
                )
                created += 1

        return created, updated

    async def _import_classes(
        self, items: list[ClassImport], errors: list[ImportErrorItem]
    ) -> tuple[dict[str, int], int, int]:
        created = updated = 0
        class_id_by_slug: dict[str, int] = {}
        duplicate_slugs = _duplicates(class_import.slug for class_import in items)

        for class_import in items:
            if class_import.slug in duplicate_slugs:
                errors.append(
                    ImportErrorItem(
                        entity="class",
                        slug=class_import.slug,
                        message="Повторяющийся slug в паке",
                    )
                )
                continue

            duplicate_levels = _duplicates(level.level for level in class_import.levels)
            if duplicate_levels:
                errors.append(
                    ImportErrorItem(
                        entity="class",
                        slug=class_import.slug,
                        message=f"Повторяющиеся уровни: {sorted(duplicate_levels)}",
                    )
                )
                continue

            duplicate_subclass_slugs = _duplicates(
                subclass.slug for subclass in class_import.subclasses
            )
            if duplicate_subclass_slugs:
                errors.append(
                    ImportErrorItem(
                        entity="class",
                        slug=class_import.slug,
                        message=(
                            f"Повторяющиеся slug подклассов: {sorted(duplicate_subclass_slugs)}"
                        ),
                    )
                )
                continue

            existing = await self._db.scalar(
                select(Class).where(Class.slug == class_import.slug, Class.locale == _LOCALE)
            )
            if existing is not None:
                existing.name = class_import.name
                existing.hit_die = class_import.hit_die
                existing.primary_ability = class_import.primary_ability
                existing.data = class_import.data
                klass = existing
                updated += 1
            else:
                klass = Class(
                    slug=class_import.slug,
                    locale=_LOCALE,
                    name=class_import.name,
                    hit_die=class_import.hit_die,
                    primary_ability=class_import.primary_ability,
                    data=class_import.data,
                )
                self._db.add(klass)
                created += 1

            await self._db.flush()
            class_id_by_slug[class_import.slug] = klass.id

            for level_import in class_import.levels:
                existing_level = await self._db.scalar(
                    select(ClassLevel).where(
                        ClassLevel.class_id == klass.id, ClassLevel.level == level_import.level
                    )
                )
                if existing_level is not None:
                    existing_level.features = level_import.features
                    existing_level.spell_slots = level_import.spell_slots
                else:
                    self._db.add(
                        ClassLevel(
                            class_id=klass.id,
                            level=level_import.level,
                            features=level_import.features,
                            spell_slots=level_import.spell_slots,
                        )
                    )

            for subclass_import in class_import.subclasses:
                existing_subclass = await self._db.scalar(
                    select(Subclass).where(
                        Subclass.slug == subclass_import.slug, Subclass.locale == _LOCALE
                    )
                )
                if existing_subclass is not None:
                    existing_subclass.class_id = klass.id
                    existing_subclass.name = subclass_import.name
                    existing_subclass.unlock_level = subclass_import.unlock_level
                    existing_subclass.data = subclass_import.data
                else:
                    self._db.add(
                        Subclass(
                            class_id=klass.id,
                            slug=subclass_import.slug,
                            locale=_LOCALE,
                            name=subclass_import.name,
                            unlock_level=subclass_import.unlock_level,
                            data=subclass_import.data,
                        )
                    )

        return class_id_by_slug, created, updated

    async def _resolve_class_id(
        self, class_slug: str, class_id_by_slug: dict[str, int]
    ) -> int | None:
        if class_slug in class_id_by_slug:
            return class_id_by_slug[class_slug]
        existing_class = await self._db.scalar(
            select(Class).where(Class.slug == class_slug, Class.locale == _LOCALE)
        )
        return existing_class.id if existing_class is not None else None

    async def _import_spells(
        self,
        items: list[SpellImport],
        class_id_by_slug: dict[str, int],
        errors: list[ImportErrorItem],
    ) -> tuple[int, int]:
        created = updated = 0
        duplicate_slugs = _duplicates(spell.slug for spell in items)

        for spell_import in items:
            if spell_import.slug in duplicate_slugs:
                errors.append(
                    ImportErrorItem(
                        entity="spell", slug=spell_import.slug, message="Повторяющийся slug в паке"
                    )
                )
                continue

            resolved_class_ids: list[int] = []
            unknown_classes: list[str] = []
            for class_slug in spell_import.classes:
                class_id = await self._resolve_class_id(class_slug, class_id_by_slug)
                if class_id is None:
                    unknown_classes.append(class_slug)
                else:
                    resolved_class_ids.append(class_id)

            if unknown_classes:
                errors.append(
                    ImportErrorItem(
                        entity="spell",
                        slug=spell_import.slug,
                        message=f"Неизвестные классы: {', '.join(unknown_classes)}",
                    )
                )
                continue

            existing = await self._db.scalar(
                select(Spell).where(Spell.slug == spell_import.slug, Spell.locale == _LOCALE)
            )
            if existing is not None:
                existing.name = spell_import.name
                existing.level = spell_import.level
                existing.school = spell_import.school
                existing.casting_time = spell_import.casting_time
                existing.range = spell_import.range
                existing.components = spell_import.components
                existing.duration = spell_import.duration
                existing.description = spell_import.description
                existing.data = spell_import.data
                spell = existing
                updated += 1
                await self._db.flush()
                await self._db.execute(delete(SpellClass).where(SpellClass.spell_id == spell.id))
            else:
                spell = Spell(
                    slug=spell_import.slug,
                    locale=_LOCALE,
                    name=spell_import.name,
                    level=spell_import.level,
                    school=spell_import.school,
                    casting_time=spell_import.casting_time,
                    range=spell_import.range,
                    components=spell_import.components,
                    duration=spell_import.duration,
                    description=spell_import.description,
                    data=spell_import.data,
                )
                self._db.add(spell)
                created += 1
                await self._db.flush()

            for class_id in resolved_class_ids:
                self._db.add(SpellClass(spell_id=spell.id, class_id=class_id))

        return created, updated

    async def _import_items(
        self, items: list[ItemImport], errors: list[ImportErrorItem]
    ) -> tuple[int, int]:
        created = updated = 0
        duplicate_slugs = _duplicates(item.slug for item in items)

        for item_import in items:
            if item_import.slug in duplicate_slugs:
                errors.append(
                    ImportErrorItem(
                        entity="item", slug=item_import.slug, message="Повторяющийся slug в паке"
                    )
                )
                continue

            if item_import.type not in _ITEM_TYPES:
                errors.append(
                    ImportErrorItem(
                        entity="item",
                        slug=item_import.slug,
                        message=f"Неизвестный тип предмета: {item_import.type}",
                    )
                )
                continue

            existing = await self._db.scalar(
                select(Item).where(Item.slug == item_import.slug, Item.locale == _LOCALE)
            )
            if existing is not None:
                existing.name = item_import.name
                existing.type = item_import.type
                existing.rarity = item_import.rarity
                existing.price_g = item_import.price_g
                existing.price_s = item_import.price_s
                existing.price_c = item_import.price_c
                existing.weight = item_import.weight
                existing.description = item_import.description
                existing.data = item_import.data
                updated += 1
            else:
                self._db.add(
                    Item(
                        slug=item_import.slug,
                        locale=_LOCALE,
                        name=item_import.name,
                        type=item_import.type,
                        rarity=item_import.rarity,
                        price_g=item_import.price_g,
                        price_s=item_import.price_s,
                        price_c=item_import.price_c,
                        weight=item_import.weight,
                        description=item_import.description,
                        data=item_import.data,
                    )
                )
                created += 1

        return created, updated

    async def _import_backgrounds(
        self, items: list[BackgroundImport], errors: list[ImportErrorItem]
    ) -> tuple[int, int]:
        created = updated = 0
        duplicate_slugs = _duplicates(background.slug for background in items)

        for background_import in items:
            if background_import.slug in duplicate_slugs:
                errors.append(
                    ImportErrorItem(
                        entity="background",
                        slug=background_import.slug,
                        message="Повторяющийся slug в паке",
                    )
                )
                continue

            existing = await self._db.scalar(
                select(Background).where(
                    Background.slug == background_import.slug, Background.locale == _LOCALE
                )
            )
            if existing is not None:
                existing.name = background_import.name
                existing.data = background_import.data
                updated += 1
            else:
                self._db.add(
                    Background(
                        slug=background_import.slug,
                        locale=_LOCALE,
                        name=background_import.name,
                        data=background_import.data,
                    )
                )
                created += 1

        return created, updated


class ContentQueryService:
    """Read-only queries for content reference tables (DND-022). Results are
    cached in-process with a short TTL; ContentImportService clears the cache
    on every successful import so a fresh pack is visible right away."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def list_races(self) -> list[RaceRead]:
        key = ("races",)
        cached = content_cache.get(key)
        if cached is not None:
            return cached

        rows = (
            await self._db.scalars(
                select(Race).where(Race.locale == _LOCALE).order_by(Race.name)
            )
        ).all()
        result = [RaceRead.model_validate(row) for row in rows]
        content_cache.set(key, result)
        return result

    async def list_classes(self) -> list[ClassDetailRead]:
        key = ("classes",)
        cached = content_cache.get(key)
        if cached is not None:
            return cached

        classes = (
            await self._db.scalars(
                select(Class).where(Class.locale == _LOCALE).order_by(Class.name)
            )
        ).all()
        result = [await self._build_class_detail(klass) for klass in classes]
        content_cache.set(key, result)
        return result

    async def get_class(self, slug: str) -> ClassDetailRead | None:
        key = ("class", slug)
        cached = content_cache.get(key)
        if cached is not None:
            return cached

        klass = await self._db.scalar(
            select(Class).where(Class.slug == slug, Class.locale == _LOCALE)
        )
        if klass is None:
            return None

        result = await self._build_class_detail(klass)
        content_cache.set(key, result)
        return result

    async def _build_class_detail(self, klass: Class) -> ClassDetailRead:
        levels = (
            await self._db.scalars(
                select(ClassLevel)
                .where(ClassLevel.class_id == klass.id)
                .order_by(ClassLevel.level)
            )
        ).all()
        subclasses = (
            await self._db.scalars(
                select(Subclass)
                .where(Subclass.class_id == klass.id, Subclass.locale == _LOCALE)
                .order_by(Subclass.unlock_level)
            )
        ).all()
        return ClassDetailRead(
            **ClassRead.model_validate(klass).model_dump(),
            levels=[ClassLevelRead.model_validate(level) for level in levels],
            subclasses=[SubclassRead.model_validate(subclass) for subclass in subclasses],
        )

    async def list_spells(
        self, *, class_slug: str | None, level: int | None
    ) -> list[SpellRead]:
        key = ("spells", class_slug, level)
        cached = content_cache.get(key)
        if cached is not None:
            return cached

        query = select(Spell).where(Spell.locale == _LOCALE)
        if class_slug is not None:
            query = (
                query.join(SpellClass, SpellClass.spell_id == Spell.id)
                .join(Class, Class.id == SpellClass.class_id)
                .where(Class.slug == class_slug, Class.locale == _LOCALE)
            )
        if level is not None:
            query = query.where(Spell.level == level)
        query = query.order_by(Spell.level, Spell.name)

        rows = (await self._db.scalars(query)).all()
        result = [SpellRead.model_validate(row) for row in rows]
        content_cache.set(key, result)
        return result

    async def list_items(self, *, item_type: str | None) -> list[ItemRead]:
        key = ("items", item_type)
        cached = content_cache.get(key)
        if cached is not None:
            return cached

        query = select(Item).where(Item.locale == _LOCALE)
        if item_type is not None:
            query = query.where(Item.type == item_type)
        query = query.order_by(Item.name)

        rows = (await self._db.scalars(query)).all()
        result = [ItemRead.model_validate(row) for row in rows]
        content_cache.set(key, result)
        return result

    async def get_class_by_id(self, class_id: int) -> ClassRead | None:
        klass = await self._db.get(Class, class_id)
        return ClassRead.model_validate(klass) if klass is not None else None

    async def get_class_level(self, *, class_id: int, level: int) -> ClassLevelRead | None:
        row = await self._db.scalar(
            select(ClassLevel).where(ClassLevel.class_id == class_id, ClassLevel.level == level)
        )
        return ClassLevelRead.model_validate(row) if row is not None else None

    async def get_subclass(self, subclass_id: int) -> SubclassRead | None:
        row = await self._db.get(Subclass, subclass_id)
        return SubclassRead.model_validate(row) if row is not None else None

    async def get_spells_by_ids(self, spell_ids: list[int]) -> list[SpellRead]:
        if not spell_ids:
            return []
        rows = (
            await self._db.scalars(select(Spell).where(Spell.id.in_(spell_ids)))
        ).all()
        return [SpellRead.model_validate(row) for row in rows]

    async def get_spell_slots(self, *, class_id: int, level: int) -> dict[str, Any] | None:
        """Spell slots for a class at a given level (AR §3: slots come from
        class_levels data; used by characters.service for the `computed` block)."""
        key = ("spell_slots", class_id, level)
        cached = content_cache.get(key)
        if cached is not None:
            return cached

        row = await self._db.scalar(
            select(ClassLevel.spell_slots).where(
                ClassLevel.class_id == class_id, ClassLevel.level == level
            )
        )
        if row is not None:
            content_cache.set(key, row)
        return row

    async def list_backgrounds(self) -> list[BackgroundRead]:
        key = ("backgrounds",)
        cached = content_cache.get(key)
        if cached is not None:
            return cached

        rows = (
            await self._db.scalars(
                select(Background).where(Background.locale == _LOCALE).order_by(Background.name)
            )
        ).all()
        result = [BackgroundRead.model_validate(row) for row in rows]
        content_cache.set(key, result)
        return result
