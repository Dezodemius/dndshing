import asyncio

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
IMPORT_URL = "/api/v1/admin/content/import"
ITEMS_URL = "/api/v1/content/items"
MERCHANTS_URL = "/api/v1/merchants"
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
                "levels": [{"level": 1, "features": {}}],
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
                "price_g": 15,
                "price_s": 0,
                "price_c": 0,
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


async def _content_ids(client: AsyncClient, headers: dict[str, str]) -> dict:
    items = (await client.get(ITEMS_URL, headers=headers)).json()
    return {"item_id": next(i["id"] for i in items if i["slug"] == "longsword")}


def _character_payload(**overrides: object) -> dict:
    payload = {
        "name": "Ари",
        "alignment": "chaotic-good",
        "ability_scores": ABILITY_SCORES,
        "hp_max": 8,
        "speed": 30,
        "proficiencies": {},
        "gold": 0,
        "silver": 0,
        "copper": 0,
    }
    payload.update(overrides)
    return payload


async def _player_setup(
    client: AsyncClient, db_session: AsyncSession, email: str, *, gold: int = 0
) -> dict:
    """Content pack must already be imported (see _owner_setup) — content
    reads only need a logged-in user, not an admin."""
    token = await _register_and_login(client, db_session, email)
    headers = _auth_headers(token)
    ids = await _content_ids(client, headers)

    races = (await client.get("/api/v1/content/races", headers=headers)).json()
    classes = (await client.get("/api/v1/content/classes", headers=headers)).json()
    backgrounds = (await client.get("/api/v1/content/backgrounds", headers=headers)).json()

    response = await client.post(
        CHARACTERS_URL,
        json=_character_payload(
            race_id=races[0]["id"],
            class_id=classes[0]["id"],
            background_id=backgrounds[0]["id"],
            gold=gold,
        ),
        headers=headers,
    )
    assert response.status_code == 201, response.text
    character_id = response.json()["id"]

    return {"headers": headers, "item_id": ids["item_id"], "character_id": character_id}


async def _owner_setup(client: AsyncClient, db_session: AsyncSession, email: str) -> dict:
    await _import_pack(client, db_session)
    token = await _register_and_login(client, db_session, email)
    headers = _auth_headers(token)
    ids = await _content_ids(client, headers)
    return {"headers": headers, "item_id": ids["item_id"]}


async def _create_merchant(client: AsyncClient, setup: dict, **overrides: object) -> dict:
    payload = {"name": "Лавка Барда", "description": "Всякая всячина"}
    payload.update(overrides)
    response = await client.post(MERCHANTS_URL, json=payload, headers=setup["headers"])
    assert response.status_code == 201, response.text
    return response.json()


async def _add_merchant_item(
    client: AsyncClient, setup: dict, merchant_id: int, **kwargs: object
) -> dict:
    payload = {"item_id": setup["item_id"]}
    payload.update(kwargs)
    response = await client.post(
        f"{MERCHANTS_URL}/{merchant_id}/items", json=payload, headers=setup["headers"]
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_get_shop_is_visible_without_auth(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner = await _owner_setup(client, db_session, "owner1@example.com")
    merchant = await _create_merchant(client, owner)
    await _add_merchant_item(client, owner, merchant["id"], quantity=5)

    response = await client.get(f"/api/v1/shop/{merchant['share_code']}")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["name"] == "Лавка Барда"
    assert body["is_open"] is True
    assert len(body["items"]) == 1
    assert body["items"][0]["price_g"] == 15
    assert body["items"][0]["quantity"] == 5


async def test_get_shop_uses_override_price_when_set(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner = await _owner_setup(client, db_session, "owner2@example.com")
    merchant = await _create_merchant(client, owner)
    await _add_merchant_item(client, owner, merchant["id"], price_g=99)

    response = await client.get(f"/api/v1/shop/{merchant['share_code']}")

    assert response.json()["items"][0]["price_g"] == 99
    assert response.json()["items"][0]["price_s"] == 0


async def test_get_shop_unknown_share_code_is_404(client: AsyncClient) -> None:
    response = await client.get("/api/v1/shop/does-not-exist")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "merchant_not_found"


async def test_buy_deducts_wallet_and_adds_item_to_inventory(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner = await _owner_setup(client, db_session, "owner3@example.com")
    merchant = await _create_merchant(client, owner)
    merchant_item = await _add_merchant_item(client, owner, merchant["id"], quantity=3)

    player = await _player_setup(client, db_session, "player3@example.com", gold=20)

    response = await client.post(
        f"/api/v1/shop/{merchant['share_code']}/buy",
        json={
            "character_id": player["character_id"],
            "merchant_item_id": merchant_item["id"],
            "quantity": 1,
        },
        headers=player["headers"],
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["character_gold"] == 5
    assert body["merchant_item_remaining_quantity"] == 2

    character = (
        await client.get(f"{CHARACTERS_URL}/{player['character_id']}", headers=player["headers"])
    ).json()
    assert character["gold"] == 5
    assert len(character["inventory"]) == 1
    assert character["inventory"][0]["item_id"] == player["item_id"]
    assert character["inventory"][0]["quantity"] == 1


async def test_buy_same_item_twice_increases_existing_entry(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner = await _owner_setup(client, db_session, "owner4@example.com")
    merchant = await _create_merchant(client, owner)
    merchant_item = await _add_merchant_item(client, owner, merchant["id"], quantity=10)

    player = await _player_setup(client, db_session, "player4@example.com", gold=100)

    for _ in range(2):
        response = await client.post(
            f"/api/v1/shop/{merchant['share_code']}/buy",
            json={
                "character_id": player["character_id"],
                "merchant_item_id": merchant_item["id"],
                "quantity": 1,
            },
            headers=player["headers"],
        )
        assert response.status_code == 200, response.text

    character = (
        await client.get(f"{CHARACTERS_URL}/{player['character_id']}", headers=player["headers"])
    ).json()
    assert len(character["inventory"]) == 1
    assert character["inventory"][0]["quantity"] == 2


async def test_buy_with_insufficient_funds_returns_400_and_does_not_change_state(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner = await _owner_setup(client, db_session, "owner5@example.com")
    merchant = await _create_merchant(client, owner)
    merchant_item = await _add_merchant_item(client, owner, merchant["id"], quantity=5)

    player = await _player_setup(client, db_session, "player5@example.com", gold=1)

    response = await client.post(
        f"/api/v1/shop/{merchant['share_code']}/buy",
        json={
            "character_id": player["character_id"],
            "merchant_item_id": merchant_item["id"],
            "quantity": 1,
        },
        headers=player["headers"],
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "insufficient_funds"

    character = (
        await client.get(f"{CHARACTERS_URL}/{player['character_id']}", headers=player["headers"])
    ).json()
    assert character["gold"] == 1
    assert character["inventory"] == []

    shop = (await client.get(f"/api/v1/shop/{merchant['share_code']}")).json()
    assert shop["items"][0]["quantity"] == 5


async def test_buy_more_than_in_stock_returns_out_of_stock(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner = await _owner_setup(client, db_session, "owner6@example.com")
    merchant = await _create_merchant(client, owner)
    merchant_item = await _add_merchant_item(client, owner, merchant["id"], quantity=1)

    player = await _player_setup(client, db_session, "player6@example.com", gold=100)

    response = await client.post(
        f"/api/v1/shop/{merchant['share_code']}/buy",
        json={
            "character_id": player["character_id"],
            "merchant_item_id": merchant_item["id"],
            "quantity": 2,
        },
        headers=player["headers"],
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "out_of_stock"


async def test_buy_with_infinite_stock_never_runs_out(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner = await _owner_setup(client, db_session, "owner7@example.com")
    merchant = await _create_merchant(client, owner)
    merchant_item = await _add_merchant_item(client, owner, merchant["id"], quantity=None)

    player = await _player_setup(client, db_session, "player7@example.com", gold=100)

    response = await client.post(
        f"/api/v1/shop/{merchant['share_code']}/buy",
        json={
            "character_id": player["character_id"],
            "merchant_item_id": merchant_item["id"],
            "quantity": 3,
        },
        headers=player["headers"],
    )

    assert response.status_code == 200, response.text
    assert response.json()["merchant_item_remaining_quantity"] is None


async def test_buy_with_other_users_character_returns_not_your_character(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner = await _owner_setup(client, db_session, "owner8@example.com")
    merchant = await _create_merchant(client, owner)
    merchant_item = await _add_merchant_item(client, owner, merchant["id"], quantity=5)

    player_a = await _player_setup(client, db_session, "playera8@example.com", gold=100)
    token_b = await _register_and_login(client, db_session, "playerb8@example.com")

    response = await client.post(
        f"/api/v1/shop/{merchant['share_code']}/buy",
        json={
            "character_id": player_a["character_id"],
            "merchant_item_id": merchant_item["id"],
            "quantity": 1,
        },
        headers=_auth_headers(token_b),
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_your_character"


async def test_buy_in_closed_shop_returns_shop_closed(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner = await _owner_setup(client, db_session, "owner9@example.com")
    merchant = await _create_merchant(client, owner)
    merchant_item = await _add_merchant_item(client, owner, merchant["id"], quantity=5)
    await client.patch(
        f"{MERCHANTS_URL}/{merchant['id']}", json={"is_open": False}, headers=owner["headers"]
    )

    player = await _player_setup(client, db_session, "player9@example.com", gold=100)

    response = await client.post(
        f"/api/v1/shop/{merchant['share_code']}/buy",
        json={
            "character_id": player["character_id"],
            "merchant_item_id": merchant_item["id"],
            "quantity": 1,
        },
        headers=player["headers"],
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "shop_closed"


async def test_buy_without_auth_is_401(client: AsyncClient, db_session: AsyncSession) -> None:
    owner = await _owner_setup(client, db_session, "owner10@example.com")
    merchant = await _create_merchant(client, owner)
    merchant_item = await _add_merchant_item(client, owner, merchant["id"], quantity=5)

    response = await client.post(
        f"/api/v1/shop/{merchant['share_code']}/buy",
        json={"character_id": 1, "merchant_item_id": merchant_item["id"], "quantity": 1},
    )

    assert response.status_code == 401


async def test_buy_unknown_merchant_item_is_404(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner = await _owner_setup(client, db_session, "owner11@example.com")
    merchant = await _create_merchant(client, owner)

    player = await _player_setup(client, db_session, "player11@example.com", gold=100)

    response = await client.post(
        f"/api/v1/shop/{merchant['share_code']}/buy",
        json={
            "character_id": player["character_id"],
            "merchant_item_id": 999999,
            "quantity": 1,
        },
        headers=player["headers"],
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "merchant_item_not_found"


async def test_concurrent_buy_of_last_unit_only_one_succeeds(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner = await _owner_setup(client, db_session, "owner12@example.com")
    merchant = await _create_merchant(client, owner)
    merchant_item = await _add_merchant_item(client, owner, merchant["id"], quantity=1)

    player = await _player_setup(client, db_session, "player12@example.com", gold=100)

    async def _buy() -> object:
        return await client.post(
            f"/api/v1/shop/{merchant['share_code']}/buy",
            json={
                "character_id": player["character_id"],
                "merchant_item_id": merchant_item["id"],
                "quantity": 1,
            },
            headers=player["headers"],
        )

    responses = await asyncio.gather(_buy(), _buy())
    statuses = sorted(response.status_code for response in responses)

    assert statuses == [200, 400]
    failed = next(response for response in responses if response.status_code == 400)
    assert failed.json()["error"]["code"] == "out_of_stock"

    shop = (await client.get(f"/api/v1/shop/{merchant['share_code']}")).json()
    assert shop["items"][0]["quantity"] == 0
