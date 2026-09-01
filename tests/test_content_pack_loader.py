import json
from pathlib import Path

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.content.models import Background, Class, ClassLevel, Item, Race, Spell, SpellClass
from app.content.pack_loader import (
    PackFileError,
    parse_pack,
    read_pack_file,
    sync_pack_on_startup,
    write_pack_file,
)
from tests.conftest import test_session_factory

SHIPPED_PACK_PATH = Path(__file__).resolve().parent.parent / "content" / "content-pack.json"


def _minimal_pack() -> dict:
    return {
        "races": [{"slug": "elf", "name": "Эльф", "data": {"speed": 30}}],
        "items": [
            {
                "slug": "longsword",
                "name": "Длинный меч",
                "type": "weapon",
                "rarity": "обычный",
                "description": "Простое оружие.",
            }
        ],
    }


def _write(path: Path, pack: dict) -> None:
    path.write_text(json.dumps(pack, ensure_ascii=False), encoding="utf-8")


def test_read_pack_file_returns_none_when_missing(content_pack_file: Path) -> None:
    # Свежая установка без файла — не ошибка: приложение должно подняться.
    assert read_pack_file() is None


def test_read_pack_file_parses_configured_path(content_pack_file: Path) -> None:
    _write(content_pack_file, _minimal_pack())

    pack = read_pack_file()

    assert pack is not None
    assert [race.slug for race in pack.races] == ["elf"]


def test_parse_pack_rejects_broken_json() -> None:
    with pytest.raises(PackFileError, match="Невалидный JSON"):
        parse_pack(b"{not json")


def test_parse_pack_rejects_wrong_schema() -> None:
    with pytest.raises(PackFileError, match="схеме"):
        parse_pack(json.dumps({"races": [{"name": "Без слага"}]}).encode("utf-8"))


def test_write_pack_file_creates_missing_directories(tmp_path: Path) -> None:
    target = tmp_path / "nested" / "content-pack.json"

    write_pack_file(b'{"races": []}', target)

    assert json.loads(target.read_text(encoding="utf-8")) == {"races": []}
    # Временный файл записи не должен остаться рядом с целевым.
    assert [p.name for p in target.parent.iterdir()] == [target.name]


def test_write_pack_file_replaces_previous_content(tmp_path: Path) -> None:
    target = tmp_path / "content-pack.json"
    first = json.dumps({"races": [{"slug": "elf", "name": "Эльф"}]}).encode("utf-8")
    write_pack_file(first, target)

    write_pack_file(b'{"races": []}', target)

    assert json.loads(target.read_text(encoding="utf-8")) == {"races": []}


async def test_sync_pack_on_startup_loads_file_into_db(
    content_pack_file: Path, db_session: AsyncSession
) -> None:
    _write(content_pack_file, _minimal_pack())

    report = await sync_pack_on_startup(test_session_factory)

    assert report is not None
    assert report.errors == []
    assert report.created == 2
    assert (await db_session.scalar(select(Race).where(Race.slug == "elf"))) is not None
    assert (await db_session.scalar(select(Item).where(Item.slug == "longsword"))) is not None


async def test_sync_pack_on_startup_is_idempotent(content_pack_file: Path) -> None:
    _write(content_pack_file, _minimal_pack())

    await sync_pack_on_startup(test_session_factory)
    second = await sync_pack_on_startup(test_session_factory)

    assert second is not None
    assert (second.created, second.updated) == (0, 2)


async def test_sync_pack_on_startup_survives_missing_file(content_pack_file: Path) -> None:
    # Нет файла — приложение всё равно поднимается, просто без обновления справочника.
    assert await sync_pack_on_startup(test_session_factory) is None


async def test_sync_pack_on_startup_survives_broken_file(content_pack_file: Path) -> None:
    content_pack_file.write_text("{сломанный json", encoding="utf-8")

    # Опечатка в паке не должна валить загрузку приложения.
    assert await sync_pack_on_startup(test_session_factory) is None


async def test_shipped_pack_applies_cleanly(
    content_pack_file: Path, db_session: AsyncSession
) -> None:
    # Пак из репозитория — то, чем наполняется свежая установка: он обязан
    # проходить схему и импорт без единой ошибки.
    write_pack_file(SHIPPED_PACK_PATH.read_bytes(), content_pack_file)

    report = await sync_pack_on_startup(test_session_factory)

    assert report is not None
    assert report.errors == []
    races = (await db_session.execute(select(Race))).scalars().all()
    assert {"dwarf-hill", "elf-high", "tiefling"} <= {race.slug for race in races}

    classes = (await db_session.execute(select(Class))).scalars().all()
    assert {"fighter", "wizard", "warlock"} <= {klass.slug for klass in classes}
    # Каждый класс должен приезжать с полной таблицей уровней 1–20: без неё
    # level-up на старших уровнях показал бы пустой экран.
    for klass in classes:
        levels = (
            (await db_session.execute(select(ClassLevel).where(ClassLevel.class_id == klass.id)))
            .scalars()
            .all()
        )
        assert sorted(level.level for level in levels) == list(range(1, 21)), klass.slug

    # Заклинания приезжают со связями по классам: без них /content/spells?class=
    # вернул бы пустой список даже при полном справочнике.
    fireball = await db_session.scalar(select(Spell).where(Spell.slug == "fireball"))
    assert fireball is not None
    wizard = await db_session.scalar(select(Class).where(Class.slug == "wizard"))
    assert wizard is not None
    link = await db_session.scalar(
        select(SpellClass).where(
            SpellClass.spell_id == fireball.id, SpellClass.class_id == wizard.id
        )
    )
    assert link is not None

    # Предыстории нужны мастеру создания персонажа: он показывает навыки и
    # умение предыстории прямо на карточке выбора.
    backgrounds = (await db_session.execute(select(Background))).scalars().all()
    assert {"acolyte", "soldier", "urchin"} <= {bg.slug for bg in backgrounds}
    for background in backgrounds:
        assert background.data["skill_proficiencies"], background.slug
        assert background.data["feature"]["name"], background.slug

    # Предметы — товар для торговцев: без цены позиция витрины бессмысленна,
    # а тип должен попадать в набор, который знает импорт.
    items = (await db_session.execute(select(Item))).scalars().all()
    assert {"longsword", "plate-armor", "potion-of-healing"} <= {i.slug for i in items}
    assert {i.type for i in items} <= {"weapon", "armor", "potion", "scroll", "magic", "gear"}
    free = [i.slug for i in items if (i.price_g, i.price_s, i.price_c) == (0, 0, 0)]
    assert not free, free
