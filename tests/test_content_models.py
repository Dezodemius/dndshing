import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

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


async def _make_class(db_session: AsyncSession, slug: str = "fighter") -> Class:
    klass = Class(slug=slug, name="Воин", hit_die=10, primary_ability="strength")
    db_session.add(klass)
    await db_session.flush()
    return klass


async def test_race_slug_locale_unique(db_session: AsyncSession) -> None:
    db_session.add(Race(slug="elf", locale="ru", name="Эльф"))
    await db_session.flush()
    db_session.add(Race(slug="elf", locale="ru", name="Эльф-дубль"))

    with pytest.raises(IntegrityError):
        await db_session.flush()


async def test_race_same_slug_different_locale_is_allowed(db_session: AsyncSession) -> None:
    db_session.add(Race(slug="elf", locale="ru", name="Эльф"))
    db_session.add(Race(slug="elf", locale="en", name="Elf"))

    await db_session.flush()

    result = await db_session.execute(select(Race).where(Race.slug == "elf"))
    assert len(result.scalars().all()) == 2


async def test_class_slug_locale_unique(db_session: AsyncSession) -> None:
    await _make_class(db_session)
    db_session.add(Class(slug="fighter", name="Воин-дубль", hit_die=10, primary_ability="strength"))

    with pytest.raises(IntegrityError):
        await db_session.flush()


async def test_class_level_unique_per_class(db_session: AsyncSession) -> None:
    klass = await _make_class(db_session)
    db_session.add(ClassLevel(class_id=klass.id, level=1, features={"note": "первый уровень"}))
    await db_session.flush()
    db_session.add(ClassLevel(class_id=klass.id, level=1, features={"note": "дубль"}))

    with pytest.raises(IntegrityError):
        await db_session.flush()


async def test_class_level_same_level_different_class_is_allowed(db_session: AsyncSession) -> None:
    fighter = await _make_class(db_session, slug="fighter")
    wizard = await _make_class(db_session, slug="wizard")
    db_session.add(ClassLevel(class_id=fighter.id, level=1, features={}))
    db_session.add(ClassLevel(class_id=wizard.id, level=1, features={}))

    await db_session.flush()


async def test_class_level_cascades_on_class_delete(db_session: AsyncSession) -> None:
    klass = await _make_class(db_session)
    db_session.add(ClassLevel(class_id=klass.id, level=1, features={}))
    await db_session.flush()

    await db_session.delete(klass)
    await db_session.flush()

    result = await db_session.execute(select(ClassLevel).where(ClassLevel.class_id == klass.id))
    assert result.scalars().all() == []


async def test_subclass_slug_locale_unique(db_session: AsyncSession) -> None:
    klass = await _make_class(db_session)
    db_session.add(
        Subclass(class_id=klass.id, slug="champion", name="Чемпион", unlock_level=3)
    )
    await db_session.flush()
    db_session.add(
        Subclass(class_id=klass.id, slug="champion", name="Чемпион-дубль", unlock_level=3)
    )

    with pytest.raises(IntegrityError):
        await db_session.flush()


async def test_spell_slug_locale_unique(db_session: AsyncSession) -> None:
    db_session.add(
        Spell(
            slug="fireball",
            name="Огненный шар",
            level=3,
            school="evocation",
            casting_time="1 действие",
            range="150 футов",
            components="V, S, M",
            duration="мгновенная",
            description="Взрыв огня.",
        )
    )
    await db_session.flush()
    db_session.add(
        Spell(
            slug="fireball",
            name="Огненный шар-дубль",
            level=3,
            school="evocation",
            casting_time="1 действие",
            range="150 футов",
            components="V, S, M",
            duration="мгновенная",
            description="Взрыв огня.",
        )
    )

    with pytest.raises(IntegrityError):
        await db_session.flush()


async def test_spell_class_cascades_on_spell_and_class_delete(db_session: AsyncSession) -> None:
    klass = await _make_class(db_session)
    spell = Spell(
        slug="magic-missile",
        name="Волшебная стрела",
        level=1,
        school="evocation",
        casting_time="1 действие",
        range="120 футов",
        components="V, S",
        duration="мгновенная",
        description="Стрелы силовой энергии.",
    )
    db_session.add(spell)
    await db_session.flush()
    db_session.add(SpellClass(spell_id=spell.id, class_id=klass.id))
    await db_session.flush()

    await db_session.delete(spell)
    await db_session.flush()

    result = await db_session.execute(
        select(SpellClass).where(SpellClass.class_id == klass.id)
    )
    assert result.scalars().all() == []


async def test_item_slug_locale_unique(db_session: AsyncSession) -> None:
    db_session.add(
        Item(
            slug="longsword",
            name="Длинный меч",
            type="weapon",
            rarity="обычный",
            description="Простое оружие.",
        )
    )
    await db_session.flush()
    db_session.add(
        Item(
            slug="longsword",
            name="Длинный меч-дубль",
            type="weapon",
            rarity="обычный",
            description="Простое оружие.",
        )
    )

    with pytest.raises(IntegrityError):
        await db_session.flush()


async def test_race_defaults_locale_and_data(db_session: AsyncSession) -> None:
    race = Race(slug="dwarf", name="Дварф")
    db_session.add(race)
    await db_session.flush()

    assert race.locale == "ru"
    assert race.data == {}


async def test_item_defaults_price_and_weight(db_session: AsyncSession) -> None:
    item = Item(
        slug="dagger", name="Кинжал", type="weapon", rarity="обычный", description="Малое оружие."
    )
    db_session.add(item)
    await db_session.flush()

    assert item.price_g == 0
    assert item.price_s == 0
    assert item.price_c == 0
    assert item.weight == 0
    assert item.data == {}


async def test_background_slug_locale_unique(db_session: AsyncSession) -> None:
    db_session.add(Background(slug="soldier", locale="ru", name="Солдат"))
    await db_session.flush()
    db_session.add(Background(slug="soldier", locale="ru", name="Солдат-дубль"))

    with pytest.raises(IntegrityError):
        await db_session.flush()
