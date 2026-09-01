import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.content.models import Background, Class, ClassLevel, Item, Race, Spell, Subclass
from tests.conftest import seed_content

# Импорта по HTTP в API нет: контент приезжает из файла пака на старте
# (app/content/pack_loader.py) и через браузерную админку. Здесь проверяется
# сам импорт как сервис — плюс то, что старый эндпоинт действительно убран.
REMOVED_IMPORT_URL = "/api/v1/admin/content/import"


def _full_pack() -> dict:
    return {
        "races": [{"slug": "elf", "name": "Эльф"}],
        "classes": [
            {
                "slug": "fighter",
                "name": "Воин",
                "hit_die": 10,
                "primary_ability": "strength",
                "levels": [{"level": 1, "features": {"note": "первый уровень"}}],
                "subclasses": [{"slug": "champion", "name": "Чемпион", "unlock_level": 3}],
            }
        ],
        "spells": [
            {
                "slug": "fireball",
                "name": "Огненный шар",
                "level": 3,
                "school": "evocation",
                "casting_time": "1 действие",
                "range": "150 футов",
                "components": "V, S, M",
                "duration": "мгновенная",
                "description": "Взрыв огня.",
                "classes": ["fighter"],
            }
        ],
        "items": [
            {
                "slug": "longsword",
                "name": "Длинный меч",
                "type": "weapon",
                "rarity": "обычный",
                "description": "Простое оружие.",
            }
        ],
        "backgrounds": [{"slug": "soldier", "name": "Солдат"}],
    }


async def test_import_full_pack_creates_entities(db_session: AsyncSession) -> None:
    report = await seed_content(_full_pack())

    assert report.model_dump() == {"created": 5, "updated": 0, "errors": []}

    assert (await db_session.scalar(select(Race).where(Race.slug == "elf"))) is not None
    klass = await db_session.scalar(select(Class).where(Class.slug == "fighter"))
    assert klass is not None
    assert (
        await db_session.scalar(
            select(ClassLevel).where(ClassLevel.class_id == klass.id, ClassLevel.level == 1)
        )
    ) is not None
    subclass = await db_session.scalar(select(Subclass).where(Subclass.slug == "champion"))
    assert subclass is not None
    assert (await db_session.scalar(select(Spell).where(Spell.slug == "fireball"))) is not None
    assert (await db_session.scalar(select(Item).where(Item.slug == "longsword"))) is not None
    background = await db_session.scalar(select(Background).where(Background.slug == "soldier"))
    assert background is not None


async def test_import_same_pack_twice_reports_updated_and_no_duplicates(
    db_session: AsyncSession,
) -> None:
    pack = _full_pack()

    first = await seed_content(pack)
    assert first.model_dump() == {"created": 5, "updated": 0, "errors": []}

    second = await seed_content(pack)
    assert second.model_dump() == {"created": 0, "updated": 5, "errors": []}

    races = (await db_session.execute(select(Race).where(Race.slug == "elf"))).scalars().all()
    assert len(races) == 1


async def test_import_with_error_rolls_back_everything(db_session: AsyncSession) -> None:
    pack = _full_pack()
    pack["items"][0]["type"] = "not-a-real-type"

    report = await seed_content(pack)

    assert report.created == 0
    assert report.updated == 0
    assert len(report.errors) == 1
    assert report.errors[0].entity == "item"
    assert report.errors[0].slug == "longsword"

    assert (await db_session.scalar(select(Race).where(Race.slug == "elf"))) is None
    assert (await db_session.scalar(select(Class).where(Class.slug == "fighter"))) is None
    assert (await db_session.scalar(select(Spell).where(Spell.slug == "fireball"))) is None
    assert (await db_session.scalar(select(Background).where(Background.slug == "soldier"))) is None


@pytest.mark.parametrize("field", ["races", "classes"])
async def test_import_rejects_duplicate_slug_within_pack(field: str) -> None:
    pack: dict = {"races": [], "classes": [], "spells": [], "items": [], "backgrounds": []}
    if field == "races":
        pack["races"] = [
            {"slug": "elf", "name": "Эльф"},
            {"slug": "elf", "name": "Эльф-дубль"},
        ]
    else:
        pack["classes"] = [
            {"slug": "fighter", "name": "Воин", "hit_die": 10, "primary_ability": "strength"},
            {"slug": "fighter", "name": "Воин-дубль", "hit_die": 10, "primary_ability": "strength"},
        ]

    report = await seed_content(pack)

    assert report.created == 0
    assert report.updated == 0
    expected_entity = "race" if field == "races" else "class"
    assert len(report.errors) == 2
    assert all(error.entity == expected_entity for error in report.errors)


async def test_http_import_endpoint_is_gone(client: AsyncClient) -> None:
    # Ни один пользователь (даже админ) не должен видеть загрузку контента в API.
    response = await client.post(REMOVED_IMPORT_URL, json=_full_pack())

    assert response.status_code == 404


async def test_openapi_exposes_no_content_import(client: AsyncClient) -> None:
    schema = (await client.get("/openapi.json")).json()

    assert not [path for path in schema["paths"] if "content/import" in path]
