from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.auth.security import create_access_token

IMPORT_URL = "/api/v1/admin/content/import"

RACES_URL = "/api/v1/content/races"
CLASSES_URL = "/api/v1/content/classes"
SPELLS_URL = "/api/v1/content/spells"
ITEMS_URL = "/api/v1/content/items"
BACKGROUNDS_URL = "/api/v1/content/backgrounds"

ADMIN_EMAIL = "admin@example.com"
PLAYER_EMAIL = "player@example.com"


def _full_pack() -> dict:
    return {
        "races": [{"slug": "elf", "name": "Эльф"}, {"slug": "dwarf", "name": "Дварф"}],
        "classes": [
            {
                "slug": "fighter",
                "name": "Воин",
                "hit_die": 10,
                "primary_ability": "strength",
                "levels": [
                    {"level": 1, "features": {"note": "первый уровень"}},
                    {"level": 2, "features": {"note": "второй уровень"}},
                ],
                "subclasses": [{"slug": "champion", "name": "Чемпион", "unlock_level": 3}],
            },
            {
                "slug": "wizard",
                "name": "Волшебник",
                "hit_die": 6,
                "primary_ability": "intelligence",
            },
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
                "classes": ["wizard"],
            },
            {
                "slug": "cure-wounds",
                "name": "Лечение ран",
                "level": 1,
                "school": "evocation",
                "casting_time": "1 действие",
                "range": "касание",
                "components": "V, S",
                "duration": "мгновенная",
                "description": "Лечит раны.",
                "classes": ["fighter", "wizard"],
            },
        ],
        "items": [
            {
                "slug": "longsword",
                "name": "Длинный меч",
                "type": "weapon",
                "rarity": "обычный",
                "description": "Простое оружие.",
            },
            {
                "slug": "potion-of-healing",
                "name": "Зелье лечения",
                "type": "potion",
                "rarity": "обычный",
                "description": "Лечит 2к4+2 хитов.",
            },
        ],
        "backgrounds": [{"slug": "soldier", "name": "Солдат"}],
    }


async def _register_and_login(
    client: AsyncClient,
    db_session: AsyncSession,
    email: str,
    *,
    is_admin: bool = False,
    verified: bool = True,
) -> str:
    # Mirrors what an OAuth login creates (AuthService._link_or_create_vk_user):
    # a User row with no password, is_admin/email_verified set directly.
    user = User(email=email, display_name="Тест", email_verified=verified, is_admin=is_admin)
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return create_access_token(user.id)


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _import_full_pack(client: AsyncClient, db_session: AsyncSession) -> None:
    token = await _register_and_login(client, db_session, ADMIN_EMAIL, is_admin=True)
    response = await client.post(IMPORT_URL, json=_full_pack(), headers=_auth_headers(token))
    assert response.status_code == 200, response.text


async def _player_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    token = await _register_and_login(client, db_session, PLAYER_EMAIL)
    return _auth_headers(token)


async def test_list_races(client: AsyncClient, db_session: AsyncSession) -> None:
    await _import_full_pack(client, db_session)
    headers = await _player_headers(client, db_session)

    response = await client.get(RACES_URL, headers=headers)

    assert response.status_code == 200, response.text
    slugs = {race["slug"] for race in response.json()}
    assert slugs == {"elf", "dwarf"}


async def test_list_backgrounds(client: AsyncClient, db_session: AsyncSession) -> None:
    await _import_full_pack(client, db_session)
    headers = await _player_headers(client, db_session)

    response = await client.get(BACKGROUNDS_URL, headers=headers)

    assert response.status_code == 200, response.text
    slugs = {background["slug"] for background in response.json()}
    assert slugs == {"soldier"}


async def test_list_classes_includes_levels_and_subclasses(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _import_full_pack(client, db_session)
    headers = await _player_headers(client, db_session)

    response = await client.get(CLASSES_URL, headers=headers)

    assert response.status_code == 200, response.text
    by_slug = {klass["slug"]: klass for klass in response.json()}
    fighter = by_slug["fighter"]
    assert [level["level"] for level in fighter["levels"]] == [1, 2]
    assert [subclass["slug"] for subclass in fighter["subclasses"]] == ["champion"]
    wizard = by_slug["wizard"]
    assert wizard["levels"] == []
    assert wizard["subclasses"] == []


async def test_get_class_by_slug(client: AsyncClient, db_session: AsyncSession) -> None:
    await _import_full_pack(client, db_session)
    headers = await _player_headers(client, db_session)

    response = await client.get(f"{CLASSES_URL}/fighter", headers=headers)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["slug"] == "fighter"
    assert [level["level"] for level in body["levels"]] == [1, 2]


async def test_get_class_by_slug_not_found(client: AsyncClient, db_session: AsyncSession) -> None:
    await _import_full_pack(client, db_session)
    headers = await _player_headers(client, db_session)

    response = await client.get(f"{CLASSES_URL}/nonexistent", headers=headers)

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "class_not_found"


async def test_list_spells_filters_by_class(client: AsyncClient, db_session: AsyncSession) -> None:
    await _import_full_pack(client, db_session)
    headers = await _player_headers(client, db_session)

    response = await client.get(SPELLS_URL, params={"class": "fighter"}, headers=headers)

    assert response.status_code == 200, response.text
    slugs = {spell["slug"] for spell in response.json()}
    assert slugs == {"cure-wounds"}


async def test_list_spells_filters_by_level(client: AsyncClient, db_session: AsyncSession) -> None:
    await _import_full_pack(client, db_session)
    headers = await _player_headers(client, db_session)

    response = await client.get(SPELLS_URL, params={"level": 3}, headers=headers)

    assert response.status_code == 200, response.text
    slugs = {spell["slug"] for spell in response.json()}
    assert slugs == {"fireball"}


async def test_list_spells_filters_by_class_and_level(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _import_full_pack(client, db_session)
    headers = await _player_headers(client, db_session)

    response = await client.get(
        SPELLS_URL, params={"class": "wizard", "level": 1}, headers=headers
    )

    assert response.status_code == 200, response.text
    slugs = {spell["slug"] for spell in response.json()}
    assert slugs == {"cure-wounds"}


async def test_list_spells_without_filters_returns_all(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _import_full_pack(client, db_session)
    headers = await _player_headers(client, db_session)

    response = await client.get(SPELLS_URL, headers=headers)

    assert response.status_code == 200, response.text
    slugs = {spell["slug"] for spell in response.json()}
    assert slugs == {"fireball", "cure-wounds"}


async def test_list_items_filters_by_type(client: AsyncClient, db_session: AsyncSession) -> None:
    await _import_full_pack(client, db_session)
    headers = await _player_headers(client, db_session)

    response = await client.get(ITEMS_URL, params={"type": "potion"}, headers=headers)

    assert response.status_code == 200, response.text
    slugs = {item["slug"] for item in response.json()}
    assert slugs == {"potion-of-healing"}


async def test_list_items_without_filter_returns_all(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _import_full_pack(client, db_session)
    headers = await _player_headers(client, db_session)

    response = await client.get(ITEMS_URL, headers=headers)

    assert response.status_code == 200, response.text
    slugs = {item["slug"] for item in response.json()}
    assert slugs == {"longsword", "potion-of-healing"}


async def test_content_read_requires_authentication(client: AsyncClient) -> None:
    response = await client.get(RACES_URL)

    assert response.status_code == 401


async def test_content_read_requires_verified_email(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    token = await _register_and_login(client, db_session, PLAYER_EMAIL, verified=False)

    response = await client.get(RACES_URL, headers=_auth_headers(token))

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "email_not_verified"


async def test_cache_serves_stale_then_fresh_after_import(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _import_full_pack(client, db_session)
    headers = await _player_headers(client, db_session)

    first = await client.get(RACES_URL, headers=headers)
    assert first.status_code == 200
    assert {race["slug"] for race in first.json()} == {"elf", "dwarf"}

    second = await client.get(RACES_URL, headers=headers)
    assert second.json() == first.json()

    token = await _register_and_login(client, db_session, "admin2@example.com", is_admin=True)
    pack = {"races": [{"slug": "gnome", "name": "Гном"}]}
    import_response = await client.post(
        IMPORT_URL,
        json={"races": pack["races"], "classes": [], "spells": [], "items": [], "backgrounds": []},
        headers=_auth_headers(token),
    )
    assert import_response.status_code == 200, import_response.text

    third = await client.get(RACES_URL, headers=headers)
    assert third.status_code == 200
    slugs = {race["slug"] for race in third.json()}
    assert slugs == {"elf", "dwarf", "gnome"}
