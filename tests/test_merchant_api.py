from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.auth.security import create_access_token
from tests.conftest import seed_content

ITEMS_URL = "/api/v1/content/items"
MERCHANTS_URL = "/api/v1/merchants"


def _content_pack() -> dict:
    return {
        "races": [],
        "classes": [],
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
        "backgrounds": [],
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


async def _import_pack() -> None:
    # Контент кладётся в базу напрямую сервисом: HTTP-эндпоинта импорта нет,
    # в приложении пак приезжает из файла на старте и через браузерную админку.
    report = await seed_content(_content_pack())
    assert report.errors == [], report.errors


async def _item_id(client: AsyncClient, headers: dict[str, str]) -> int:
    items = (await client.get(ITEMS_URL, headers=headers)).json()
    return next(i["id"] for i in items if i["slug"] == "longsword")


async def _owner_setup(client: AsyncClient, db_session: AsyncSession, email: str) -> dict:
    await _import_pack()
    token = await _register_and_login(client, db_session, email)
    headers = _auth_headers(token)
    item_id = await _item_id(client, headers)
    return {"headers": headers, "item_id": item_id}


async def _create_merchant(client: AsyncClient, setup: dict, **overrides: object) -> dict:
    payload = {"name": "Лавка Барда", "description": "Всякая всячина"}
    payload.update(overrides)
    response = await client.post(MERCHANTS_URL, json=payload, headers=setup["headers"])
    assert response.status_code == 201, response.text
    return response.json()


async def test_create_merchant_defaults_open_and_gets_share_code(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _owner_setup(client, db_session, "owner1@example.com")

    body = await _create_merchant(client, setup)

    assert body["is_open"] is True
    assert body["share_code"]
    assert body["items"] == []


async def test_two_merchants_get_different_share_codes(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _owner_setup(client, db_session, "owner2@example.com")

    first = await _create_merchant(client, setup)
    second = await _create_merchant(client, setup)

    assert first["share_code"] != second["share_code"]


async def test_list_merchants_returns_only_current_owner(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup_a = await _owner_setup(client, db_session, "owner3@example.com")
    await _create_merchant(client, setup_a)

    token_b = await _register_and_login(client, db_session, "owner4@example.com")
    headers_b = _auth_headers(token_b)
    await client.post(MERCHANTS_URL, json={"name": "Другая лавка"}, headers=headers_b)

    response = await client.get(MERCHANTS_URL, headers=setup_a["headers"])

    assert response.status_code == 200
    names = [m["name"] for m in response.json()]
    assert names == ["Лавка Барда"]


async def test_patch_updates_name_description_and_is_open(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _owner_setup(client, db_session, "owner5@example.com")
    merchant = await _create_merchant(client, setup)

    response = await client.patch(
        f"{MERCHANTS_URL}/{merchant['id']}",
        json={"name": "Новое имя", "description": "Новое описание", "is_open": False},
        headers=setup["headers"],
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["name"] == "Новое имя"
    assert body["description"] == "Новое описание"
    assert body["is_open"] is False
    assert body["share_code"] == merchant["share_code"]


async def test_patch_cannot_change_share_code(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _owner_setup(client, db_session, "owner6@example.com")
    merchant = await _create_merchant(client, setup)

    response = await client.patch(
        f"{MERCHANTS_URL}/{merchant['id']}",
        json={"share_code": "hacked"},
        headers=setup["headers"],
    )

    assert response.status_code == 422


async def test_delete_merchant_removes_it(client: AsyncClient, db_session: AsyncSession) -> None:
    setup = await _owner_setup(client, db_session, "owner7@example.com")
    merchant = await _create_merchant(client, setup)

    delete_response = await client.delete(
        f"{MERCHANTS_URL}/{merchant['id']}", headers=setup["headers"]
    )
    assert delete_response.status_code == 204

    get_response = await client.get(
        f"{MERCHANTS_URL}/{merchant['id']}", headers=setup["headers"]
    )
    assert get_response.status_code == 404
    assert get_response.json()["error"]["code"] == "merchant_not_found"


async def test_add_item_to_merchant(client: AsyncClient, db_session: AsyncSession) -> None:
    setup = await _owner_setup(client, db_session, "owner8@example.com")
    merchant = await _create_merchant(client, setup)

    response = await client.post(
        f"{MERCHANTS_URL}/{merchant['id']}/items",
        json={"item_id": setup["item_id"], "price_g": 5, "quantity": 3},
        headers=setup["headers"],
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["item_id"] == setup["item_id"]
    assert body["price_g"] == 5
    assert body["price_s"] is None
    assert body["quantity"] == 3


async def test_add_item_with_null_price_and_quantity_means_card_price_and_infinite(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _owner_setup(client, db_session, "owner9@example.com")
    merchant = await _create_merchant(client, setup)

    response = await client.post(
        f"{MERCHANTS_URL}/{merchant['id']}/items",
        json={"item_id": setup["item_id"]},
        headers=setup["headers"],
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["price_g"] is None
    assert body["price_s"] is None
    assert body["price_c"] is None
    assert body["quantity"] is None


async def test_add_item_with_invalid_item_id_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _owner_setup(client, db_session, "owner10@example.com")
    merchant = await _create_merchant(client, setup)

    response = await client.post(
        f"{MERCHANTS_URL}/{merchant['id']}/items",
        json={"item_id": 999999},
        headers=setup["headers"],
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_reference"


async def test_patch_item_updates_quantity_and_can_clear_price_override(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _owner_setup(client, db_session, "owner11@example.com")
    merchant = await _create_merchant(client, setup)
    add_response = await client.post(
        f"{MERCHANTS_URL}/{merchant['id']}/items",
        json={"item_id": setup["item_id"], "price_g": 10, "quantity": 2},
        headers=setup["headers"],
    )
    item_entry_id = add_response.json()["id"]

    response = await client.patch(
        f"{MERCHANTS_URL}/{merchant['id']}/items/{item_entry_id}",
        json={"price_g": None, "quantity": 7},
        headers=setup["headers"],
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["price_g"] is None
    assert body["quantity"] == 7


async def test_delete_item_removes_it(client: AsyncClient, db_session: AsyncSession) -> None:
    setup = await _owner_setup(client, db_session, "owner12@example.com")
    merchant = await _create_merchant(client, setup)
    add_response = await client.post(
        f"{MERCHANTS_URL}/{merchant['id']}/items",
        json={"item_id": setup["item_id"]},
        headers=setup["headers"],
    )
    item_entry_id = add_response.json()["id"]

    delete_response = await client.delete(
        f"{MERCHANTS_URL}/{merchant['id']}/items/{item_entry_id}", headers=setup["headers"]
    )
    assert delete_response.status_code == 204

    get_response = await client.get(f"{MERCHANTS_URL}/{merchant['id']}", headers=setup["headers"])
    assert get_response.json()["items"] == []


async def test_get_other_users_merchant_is_404(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup_a = await _owner_setup(client, db_session, "ownera@example.com")
    merchant = await _create_merchant(client, setup_a)

    token_b = await _register_and_login(client, db_session, "ownerb@example.com")
    headers_b = _auth_headers(token_b)

    response = await client.get(f"{MERCHANTS_URL}/{merchant['id']}", headers=headers_b)

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "merchant_not_found"


async def test_patch_other_users_merchant_is_404(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup_a = await _owner_setup(client, db_session, "ownerc@example.com")
    merchant = await _create_merchant(client, setup_a)

    token_b = await _register_and_login(client, db_session, "ownerd@example.com")
    headers_b = _auth_headers(token_b)

    response = await client.patch(
        f"{MERCHANTS_URL}/{merchant['id']}",
        json={"name": "Захват"},
        headers=headers_b,
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "merchant_not_found"


async def test_delete_other_users_merchant_is_404(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup_a = await _owner_setup(client, db_session, "ownere@example.com")
    merchant = await _create_merchant(client, setup_a)

    token_b = await _register_and_login(client, db_session, "ownerf@example.com")
    headers_b = _auth_headers(token_b)

    response = await client.delete(f"{MERCHANTS_URL}/{merchant['id']}", headers=headers_b)

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "merchant_not_found"


async def test_add_item_to_other_users_merchant_is_404(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup_a = await _owner_setup(client, db_session, "ownerg@example.com")
    merchant = await _create_merchant(client, setup_a)

    token_b = await _register_and_login(client, db_session, "ownerh@example.com")
    headers_b = _auth_headers(token_b)

    response = await client.post(
        f"{MERCHANTS_URL}/{merchant['id']}/items",
        json={"item_id": setup_a["item_id"]},
        headers=headers_b,
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "merchant_not_found"


async def test_patch_item_of_other_users_merchant_is_404(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup_a = await _owner_setup(client, db_session, "owneri@example.com")
    merchant = await _create_merchant(client, setup_a)
    add_response = await client.post(
        f"{MERCHANTS_URL}/{merchant['id']}/items",
        json={"item_id": setup_a["item_id"]},
        headers=setup_a["headers"],
    )
    item_entry_id = add_response.json()["id"]

    token_b = await _register_and_login(client, db_session, "ownerj@example.com")
    headers_b = _auth_headers(token_b)

    response = await client.patch(
        f"{MERCHANTS_URL}/{merchant['id']}/items/{item_entry_id}",
        json={"quantity": 1},
        headers=headers_b,
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "merchant_not_found"


async def test_delete_item_of_other_users_merchant_is_404(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup_a = await _owner_setup(client, db_session, "ownerk@example.com")
    merchant = await _create_merchant(client, setup_a)
    add_response = await client.post(
        f"{MERCHANTS_URL}/{merchant['id']}/items",
        json={"item_id": setup_a["item_id"]},
        headers=setup_a["headers"],
    )
    item_entry_id = add_response.json()["id"]

    token_b = await _register_and_login(client, db_session, "ownerl@example.com")
    headers_b = _auth_headers(token_b)

    response = await client.delete(
        f"{MERCHANTS_URL}/{merchant['id']}/items/{item_entry_id}", headers=headers_b
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "merchant_not_found"


async def test_patch_item_belonging_to_another_merchant_is_404(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _owner_setup(client, db_session, "ownerm@example.com")
    merchant_a = await _create_merchant(client, setup, name="Лавка A")
    merchant_b = await _create_merchant(client, setup, name="Лавка B")
    add_response = await client.post(
        f"{MERCHANTS_URL}/{merchant_a['id']}/items",
        json={"item_id": setup["item_id"]},
        headers=setup["headers"],
    )
    item_entry_id = add_response.json()["id"]

    response = await client.patch(
        f"{MERCHANTS_URL}/{merchant_b['id']}/items/{item_entry_id}",
        json={"quantity": 1},
        headers=setup["headers"],
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "merchant_item_not_found"
