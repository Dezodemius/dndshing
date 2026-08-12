import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.auth.security import create_access_token
from app.content.models import Background, Class, ClassLevel, Item, Race, Spell, Subclass

IMPORT_URL = "/api/v1/admin/content/import"

ADMIN_EMAIL = "admin@example.com"
PLAYER_EMAIL = "player@example.com"


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


async def _register_and_login(
    client: AsyncClient,
    db_session: AsyncSession,
    email: str,
    *,
    is_admin: bool = False,
) -> str:
    # Mirrors what an OAuth login creates (AuthService._link_or_create_vk_user):
    # a User row with no password, email already verified.
    user = User(email=email, display_name="Тест", email_verified=True, is_admin=is_admin)
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return create_access_token(user.id)


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def test_import_full_pack_creates_entities(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    token = await _register_and_login(client, db_session, ADMIN_EMAIL, is_admin=True)

    response = await client.post(IMPORT_URL, json=_full_pack(), headers=_auth_headers(token))

    assert response.status_code == 200, response.text
    body = response.json()
    assert body == {"created": 5, "updated": 0, "errors": []}

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
    client: AsyncClient, db_session: AsyncSession
) -> None:
    token = await _register_and_login(client, db_session, ADMIN_EMAIL, is_admin=True)
    pack = _full_pack()

    first = await client.post(IMPORT_URL, json=pack, headers=_auth_headers(token))
    assert first.status_code == 200, first.text
    assert first.json() == {"created": 5, "updated": 0, "errors": []}

    second = await client.post(IMPORT_URL, json=pack, headers=_auth_headers(token))
    assert second.status_code == 200, second.text
    assert second.json() == {"created": 0, "updated": 5, "errors": []}

    races = (await db_session.execute(select(Race).where(Race.slug == "elf"))).scalars().all()
    assert len(races) == 1


async def test_import_with_error_rolls_back_everything(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    token = await _register_and_login(client, db_session, ADMIN_EMAIL, is_admin=True)
    pack = _full_pack()
    pack["items"][0]["type"] = "not-a-real-type"

    response = await client.post(IMPORT_URL, json=pack, headers=_auth_headers(token))

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["created"] == 0
    assert body["updated"] == 0
    assert len(body["errors"]) == 1
    assert body["errors"][0]["entity"] == "item"
    assert body["errors"][0]["slug"] == "longsword"

    assert (await db_session.scalar(select(Race).where(Race.slug == "elf"))) is None
    assert (await db_session.scalar(select(Class).where(Class.slug == "fighter"))) is None
    assert (await db_session.scalar(select(Spell).where(Spell.slug == "fireball"))) is None
    assert (await db_session.scalar(select(Background).where(Background.slug == "soldier"))) is None


async def test_import_rejects_non_admin(client: AsyncClient, db_session: AsyncSession) -> None:
    token = await _register_and_login(client, db_session, PLAYER_EMAIL, is_admin=False)

    response = await client.post(IMPORT_URL, json=_full_pack(), headers=_auth_headers(token))

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "admin_required"


async def test_import_requires_authentication(client: AsyncClient) -> None:
    response = await client.post(IMPORT_URL, json=_full_pack())

    assert response.status_code == 401


@pytest.mark.parametrize("field", ["races", "classes"])
async def test_import_rejects_duplicate_slug_within_pack(
    client: AsyncClient, db_session: AsyncSession, field: str
) -> None:
    token = await _register_and_login(client, db_session, ADMIN_EMAIL, is_admin=True)
    pack = {"races": [], "classes": [], "spells": [], "items": [], "backgrounds": []}
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

    response = await client.post(IMPORT_URL, json=pack, headers=_auth_headers(token))

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["created"] == 0
    assert body["updated"] == 0
    expected_entity = "race" if field == "races" else "class"
    assert len(body["errors"]) == 2
    assert all(e["entity"] == expected_entity for e in body["errors"])
