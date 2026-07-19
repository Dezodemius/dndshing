import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.characters.models import Character, CharacterSpell, InventoryEntry, LevelUpRecord
from app.content.models import Background, Class, Item, Race, Spell, Subclass


async def _make_user(db_session: AsyncSession) -> User:
    user = User(email="player@example.com", display_name="Игрок")
    db_session.add(user)
    await db_session.flush()
    return user


async def _make_race(db_session: AsyncSession) -> Race:
    race = Race(slug="elf", name="Эльф")
    db_session.add(race)
    await db_session.flush()
    return race


async def _make_class(db_session: AsyncSession) -> Class:
    klass = Class(slug="fighter", name="Воин", hit_die=10, primary_ability="strength")
    db_session.add(klass)
    await db_session.flush()
    return klass


async def _make_character(
    db_session: AsyncSession, user: User, race: Race, klass: Class
) -> Character:
    character = Character(
        user_id=user.id,
        name="Ари",
        race_id=race.id,
        class_id=klass.id,
        alignment="chaotic-good",
        ability_scores={"str": 16, "dex": 12, "con": 14, "int": 10, "wis": 10, "cha": 8},
        hp_max=12,
        hp_current=12,
        speed=30,
        proficiencies={},
    )
    db_session.add(character)
    await db_session.flush()
    return character


async def test_character_requires_existing_race(db_session: AsyncSession) -> None:
    user = await _make_user(db_session)
    klass = await _make_class(db_session)
    db_session.add(
        Character(
            user_id=user.id,
            name="Ари",
            race_id=999999,
            class_id=klass.id,
            alignment="chaotic-good",
            ability_scores={},
            hp_max=12,
            hp_current=12,
            speed=30,
            proficiencies={},
        )
    )

    with pytest.raises(IntegrityError):
        await db_session.flush()


async def test_character_defaults(db_session: AsyncSession) -> None:
    user = await _make_user(db_session)
    race = await _make_race(db_session)
    klass = await _make_class(db_session)
    character = await _make_character(db_session, user, race, klass)

    assert character.level == 1
    assert character.xp == 0
    assert character.hp_temp == 0
    assert character.gold == 0
    assert character.silver == 0
    assert character.copper == 0


async def test_deleting_character_cascades_to_child_tables(db_session: AsyncSession) -> None:
    user = await _make_user(db_session)
    race = await _make_race(db_session)
    klass = await _make_class(db_session)
    character = await _make_character(db_session, user, race, klass)
    spell = Spell(
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
    item = Item(
        slug="longsword", name="Длинный меч", type="weapon", rarity="обычный", description="Меч."
    )
    db_session.add_all([spell, item])
    await db_session.flush()

    db_session.add(CharacterSpell(character_id=character.id, spell_id=spell.id))
    db_session.add(InventoryEntry(character_id=character.id, item_id=item.id, quantity=1))
    db_session.add(LevelUpRecord(character_id=character.id, from_level=1, to_level=2, delta={}))
    await db_session.flush()

    await db_session.delete(character)
    await db_session.flush()

    assert (
        await db_session.execute(
            select(CharacterSpell).where(CharacterSpell.character_id == character.id)
        )
    ).scalars().all() == []
    assert (
        await db_session.execute(
            select(InventoryEntry).where(InventoryEntry.character_id == character.id)
        )
    ).scalars().all() == []
    assert (
        await db_session.execute(
            select(LevelUpRecord).where(LevelUpRecord.character_id == character.id)
        )
    ).scalars().all() == []


async def test_deleting_user_cascades_to_characters(db_session: AsyncSession) -> None:
    user = await _make_user(db_session)
    race = await _make_race(db_session)
    klass = await _make_class(db_session)
    character = await _make_character(db_session, user, race, klass)

    await db_session.delete(user)
    await db_session.flush()

    result = await db_session.execute(select(Character).where(Character.id == character.id))
    assert result.scalars().all() == []


async def test_deleting_race_in_use_is_restricted(db_session: AsyncSession) -> None:
    user = await _make_user(db_session)
    race = await _make_race(db_session)
    klass = await _make_class(db_session)
    await _make_character(db_session, user, race, klass)

    await db_session.delete(race)
    with pytest.raises(IntegrityError):
        await db_session.flush()


async def test_character_optional_subclass_and_background(db_session: AsyncSession) -> None:
    user = await _make_user(db_session)
    race = await _make_race(db_session)
    klass = await _make_class(db_session)
    subclass = Subclass(class_id=klass.id, slug="champion", name="Чемпион", unlock_level=3)
    background = Background(slug="soldier", name="Солдат")
    db_session.add_all([subclass, background])
    await db_session.flush()

    character = Character(
        user_id=user.id,
        name="Ари",
        race_id=race.id,
        class_id=klass.id,
        subclass_id=subclass.id,
        background_id=background.id,
        alignment="chaotic-good",
        ability_scores={},
        hp_max=12,
        hp_current=12,
        speed=30,
        proficiencies={},
    )
    db_session.add(character)
    await db_session.flush()

    assert character.subclass_id == subclass.id
    assert character.background_id == background.id


async def test_inventory_entry_custom_name_without_item(db_session: AsyncSession) -> None:
    user = await _make_user(db_session)
    race = await _make_race(db_session)
    klass = await _make_class(db_session)
    character = await _make_character(db_session, user, race, klass)

    entry = InventoryEntry(character_id=character.id, custom_name="Записка мастера", quantity=1)
    db_session.add(entry)
    await db_session.flush()

    assert entry.item_id is None
    assert entry.custom_name == "Записка мастера"
    assert entry.quantity == 1
    assert entry.equipped is False


async def test_deleting_item_sets_inventory_entry_item_id_null(db_session: AsyncSession) -> None:
    user = await _make_user(db_session)
    race = await _make_race(db_session)
    klass = await _make_class(db_session)
    character = await _make_character(db_session, user, race, klass)
    item = Item(
        slug="dagger", name="Кинжал", type="weapon", rarity="обычный", description="Малое оружие."
    )
    db_session.add(item)
    await db_session.flush()

    entry = InventoryEntry(character_id=character.id, item_id=item.id, quantity=1)
    db_session.add(entry)
    await db_session.flush()

    await db_session.delete(item)
    await db_session.flush()
    await db_session.refresh(entry)

    assert entry.item_id is None


async def test_character_spells_primary_key_prevents_duplicates(db_session: AsyncSession) -> None:
    user = await _make_user(db_session)
    race = await _make_race(db_session)
    klass = await _make_class(db_session)
    character = await _make_character(db_session, user, race, klass)
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

    db_session.add(CharacterSpell(character_id=character.id, spell_id=spell.id))
    await db_session.flush()
    db_session.add(CharacterSpell(character_id=character.id, spell_id=spell.id))

    with pytest.raises(IntegrityError):
        await db_session.flush()


async def test_level_up_record_defaults_delta(db_session: AsyncSession) -> None:
    user = await _make_user(db_session)
    race = await _make_race(db_session)
    klass = await _make_class(db_session)
    character = await _make_character(db_session, user, race, klass)

    record = LevelUpRecord(character_id=character.id, from_level=1, to_level=2)
    db_session.add(record)
    await db_session.flush()

    assert record.delta == {}
