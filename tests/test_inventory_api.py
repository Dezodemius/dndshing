from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
IMPORT_URL = "/api/v1/admin/content/import"
RACES_URL = "/api/v1/content/races"
CLASSES_URL = "/api/v1/content/classes"
BACKGROUNDS_URL = "/api/v1/content/backgrounds"
ITEMS_URL = "/api/v1/content/items"
CHARACTERS_URL = "/api/v1/characters"

ADMIN_EMAIL = "admin@example.com"
PASSWORD = "hunter22"

ABILITY_SCORES = {"str": 16, "dex": 14, "con": 12, "int": 10, "wis": 15, "cha": 8}


def _content_pack() -> dict:
    return {
        "races": [{"slug": "elf", "name": "Эльф"}],
        "classes": [
            {
                "slug": "wizard",
                "name": "Волшебник",
                "hit_die": 6,
                "primary_ability": "intelligence",
                "levels": [{"level": 1, "features": {}, "spell_slots": {"1": 2}}],
            }
        ],
        "spells": [],
        "items": [
            {
                "slug": "longsword",
                "name": "Длинный меч",
                "type": "weapon",
                "rarity": "обычный",
                "description": "Простое оружие.",
            }
        ],
        "backgrounds": [{"slug": "sage", "name": "Мудрец"}],
    }


async def _register_and_login(
    client: AsyncClient,
    db_session: AsyncSession,
    email: str,
    *,
    is_admin: bool = False,
) -> str:
    response = await client.post(
        REGISTER_URL,
        json={"email": email, "password": PASSWORD, "display_name": "Тест"},
    )
    assert response.status_code == 201, response.text

    user = await db_session.scalar(select(User).where(User.email == email))
    assert user is not None
    user.email_verified = True
    if is_admin:
        user.is_admin = True
    await db_session.commit()

    response = await client.post(LOGIN_URL, json={"email": email, "password": PASSWORD})
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _import_pack(client: AsyncClient, db_session: AsyncSession) -> None:
    token = await _register_and_login(client, db_session, ADMIN_EMAIL, is_admin=True)
    response = await client.post(IMPORT_URL, json=_content_pack(), headers=_auth_headers(token))
    assert response.status_code == 200, response.text


async def _content_ids(client: AsyncClient, headers: dict[str, str]) -> dict[str, int]:
    races = (await client.get(RACES_URL, headers=headers)).json()
    classes = (await client.get(CLASSES_URL, headers=headers)).json()
    backgrounds = (await client.get(BACKGROUNDS_URL, headers=headers)).json()
    items = (await client.get(ITEMS_URL, headers=headers)).json()
    return {
        "race_id": next(r["id"] for r in races if r["slug"] == "elf"),
        "class_id": next(c["id"] for c in classes if c["slug"] == "wizard"),
        "background_id": next(b["id"] for b in backgrounds if b["slug"] == "sage"),
        "item_id": next(i["id"] for i in items if i["slug"] == "longsword"),
    }


async def _player_setup(client: AsyncClient, db_session: AsyncSession, email: str) -> dict:
    await _import_pack(client, db_session)
    token = await _register_and_login(client, db_session, email)
    headers = _auth_headers(token)
    ids = await _content_ids(client, headers)
    return {"headers": headers, **ids}


def _character_payload(ids: dict, **overrides: object) -> dict:
    payload = {
        "name": "Ари",
        "race_id": ids["race_id"],
        "class_id": ids["class_id"],
        "background_id": ids["background_id"],
        "alignment": "chaotic-good",
        "ability_scores": ABILITY_SCORES,
        "hp_max": 8,
        "speed": 30,
        "proficiencies": {},
    }
    payload.update(overrides)
    return payload


async def _create_character(client: AsyncClient, setup: dict) -> int:
    response = await client.post(
        CHARACTERS_URL, json=_character_payload(setup), headers=setup["headers"]
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def test_add_custom_item_without_item_id(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _player_setup(client, db_session, "player1@example.com")
    character_id = await _create_character(client, setup)

    response = await client.post(
        f"{CHARACTERS_URL}/{character_id}/inventory",
        json={"custom_name": "Выдано мастером на словах"},
        headers=setup["headers"],
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["item_id"] is None
    assert body["custom_name"] == "Выдано мастером на словах"
    assert body["quantity"] == 1
    assert body["equipped"] is False


async def test_add_item_by_item_id(client: AsyncClient, db_session: AsyncSession) -> None:
    setup = await _player_setup(client, db_session, "player2@example.com")
    character_id = await _create_character(client, setup)

    response = await client.post(
        f"{CHARACTERS_URL}/{character_id}/inventory",
        json={"item_id": setup["item_id"], "quantity": 2},
        headers=setup["headers"],
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["item_id"] == setup["item_id"]
    assert body["custom_name"] is None
    assert body["quantity"] == 2


async def test_add_item_without_item_id_or_custom_name_is_rejected(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _player_setup(client, db_session, "player3@example.com")
    character_id = await _create_character(client, setup)

    response = await client.post(
        f"{CHARACTERS_URL}/{character_id}/inventory", json={}, headers=setup["headers"]
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "inventory_payload_invalid"


async def test_add_item_with_both_item_id_and_custom_name_is_rejected(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _player_setup(client, db_session, "player4@example.com")
    character_id = await _create_character(client, setup)

    response = await client.post(
        f"{CHARACTERS_URL}/{character_id}/inventory",
        json={"item_id": setup["item_id"], "custom_name": "И то и другое"},
        headers=setup["headers"],
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "inventory_payload_invalid"


async def test_add_item_with_invalid_item_id_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _player_setup(client, db_session, "player5@example.com")
    character_id = await _create_character(client, setup)

    response = await client.post(
        f"{CHARACTERS_URL}/{character_id}/inventory",
        json={"item_id": 999999},
        headers=setup["headers"],
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_reference"


async def test_patch_updates_equipped_and_quantity(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _player_setup(client, db_session, "player6@example.com")
    character_id = await _create_character(client, setup)
    add_response = await client.post(
        f"{CHARACTERS_URL}/{character_id}/inventory",
        json={"item_id": setup["item_id"], "quantity": 1},
        headers=setup["headers"],
    )
    entry_id = add_response.json()["id"]

    response = await client.patch(
        f"{CHARACTERS_URL}/{character_id}/inventory/{entry_id}",
        json={"equipped": True, "quantity": 3},
        headers=setup["headers"],
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["equipped"] is True
    assert body["quantity"] == 3


async def test_delete_inventory_entry_removes_it(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _player_setup(client, db_session, "player7@example.com")
    character_id = await _create_character(client, setup)
    add_response = await client.post(
        f"{CHARACTERS_URL}/{character_id}/inventory",
        json={"custom_name": "Верёвка"},
        headers=setup["headers"],
    )
    entry_id = add_response.json()["id"]

    delete_response = await client.delete(
        f"{CHARACTERS_URL}/{character_id}/inventory/{entry_id}", headers=setup["headers"]
    )
    assert delete_response.status_code == 204

    get_response = await client.get(f"{CHARACTERS_URL}/{character_id}", headers=setup["headers"])
    assert get_response.json()["inventory"] == []


async def test_add_item_to_other_users_character_is_404(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup_a = await _player_setup(client, db_session, "playera@example.com")
    character_id = await _create_character(client, setup_a)

    token_b = await _register_and_login(client, db_session, "playerb@example.com")
    headers_b = _auth_headers(token_b)

    response = await client.post(
        f"{CHARACTERS_URL}/{character_id}/inventory",
        json={"custom_name": "Чужое"},
        headers=headers_b,
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "character_not_found"


async def test_patch_inventory_entry_of_other_users_character_is_404(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup_a = await _player_setup(client, db_session, "playerc@example.com")
    character_id = await _create_character(client, setup_a)
    add_response = await client.post(
        f"{CHARACTERS_URL}/{character_id}/inventory",
        json={"custom_name": "Верёвка"},
        headers=setup_a["headers"],
    )
    entry_id = add_response.json()["id"]

    token_b = await _register_and_login(client, db_session, "playerd@example.com")
    headers_b = _auth_headers(token_b)

    response = await client.patch(
        f"{CHARACTERS_URL}/{character_id}/inventory/{entry_id}",
        json={"equipped": True},
        headers=headers_b,
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "character_not_found"


async def test_patch_inventory_entry_belonging_to_another_character_is_404(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _player_setup(client, db_session, "playere@example.com")
    character_a = await _create_character(client, setup)
    character_b = await _create_character(client, setup)
    add_response = await client.post(
        f"{CHARACTERS_URL}/{character_a}/inventory",
        json={"custom_name": "Принадлежит A"},
        headers=setup["headers"],
    )
    entry_id = add_response.json()["id"]

    response = await client.patch(
        f"{CHARACTERS_URL}/{character_b}/inventory/{entry_id}",
        json={"equipped": True},
        headers=setup["headers"],
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "inventory_entry_not_found"


async def test_delete_inventory_entry_of_other_users_character_is_404(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup_a = await _player_setup(client, db_session, "playerf@example.com")
    character_id = await _create_character(client, setup_a)
    add_response = await client.post(
        f"{CHARACTERS_URL}/{character_id}/inventory",
        json={"custom_name": "Верёвка"},
        headers=setup_a["headers"],
    )
    entry_id = add_response.json()["id"]

    token_b = await _register_and_login(client, db_session, "playerg@example.com")
    headers_b = _auth_headers(token_b)

    response = await client.delete(
        f"{CHARACTERS_URL}/{character_id}/inventory/{entry_id}", headers=headers_b
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "character_not_found"
