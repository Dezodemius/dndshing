"""CRUD for temporary effects (US-13, DND-095).

Ownership tests are mandatory for every new endpoint (code-style, "Тесты прав
доступа обязательны"). A foreign character and a foreign effect both answer
404 rather than 403 — a 403 would confirm the id exists.
"""

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.test_character_api import (
    CHARACTERS_URL,
    _auth_headers,
    _character_payload,
    _player_setup,
    _register_and_login,
)


def _effects_url(character_id: int) -> str:
    return f"{CHARACTERS_URL}/{character_id}/effects"


async def _create_character(client: AsyncClient, setup: dict) -> int:
    response = await client.post(
        CHARACTERS_URL, json=_character_payload(setup), headers=setup["headers"]
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _effect_payload(**overrides: object) -> dict:
    payload: dict = {
        "name": "Благословение",
        "source": "Жрец партии",
        "duration_kind": "minutes",
        "duration_amount": 1,
        "modifiers": [{"target": "save.dex", "op": "bonus", "value": 1}],
    }
    payload.update(overrides)
    return payload


async def test_create_effect_returns_it(client: AsyncClient, db_session: AsyncSession) -> None:
    setup = await _player_setup(client, db_session, "eff-create@example.com")
    character_id = await _create_character(client, setup)

    response = await client.post(
        _effects_url(character_id), json=_effect_payload(), headers=setup["headers"]
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["name"] == "Благословение"
    assert body["character_id"] == character_id
    assert body["is_active"] is True
    assert body["modifiers"] == [{"target": "save.dex", "op": "bonus", "value": 1}]


async def test_list_returns_only_this_characters_effects(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _player_setup(client, db_session, "eff-list@example.com")
    first = await _create_character(client, setup)
    second = await client.post(
        CHARACTERS_URL,
        json=_character_payload(setup, name="Второй"),
        headers=setup["headers"],
    )
    second_id = second.json()["id"]

    await client.post(
        _effects_url(first), json=_effect_payload(name="Первый эффект"), headers=setup["headers"]
    )
    await client.post(
        _effects_url(second_id),
        json=_effect_payload(name="Второй эффект"),
        headers=setup["headers"],
    )

    response = await client.get(_effects_url(first), headers=setup["headers"])

    assert [effect["name"] for effect in response.json()] == ["Первый эффект"]


async def test_patch_updates_only_sent_fields(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _player_setup(client, db_session, "eff-patch@example.com")
    character_id = await _create_character(client, setup)
    created = await client.post(
        _effects_url(character_id), json=_effect_payload(), headers=setup["headers"]
    )
    effect_id = created.json()["id"]

    response = await client.patch(
        f"{_effects_url(character_id)}/{effect_id}",
        json={"is_active": False},
        headers=setup["headers"],
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["is_active"] is False
    assert body["name"] == "Благословение"
    assert body["modifiers"] == [{"target": "save.dex", "op": "bonus", "value": 1}]


async def test_delete_removes_the_effect(client: AsyncClient, db_session: AsyncSession) -> None:
    setup = await _player_setup(client, db_session, "eff-delete@example.com")
    character_id = await _create_character(client, setup)
    created = await client.post(
        _effects_url(character_id), json=_effect_payload(), headers=setup["headers"]
    )
    effect_id = created.json()["id"]

    response = await client.delete(
        f"{_effects_url(character_id)}/{effect_id}", headers=setup["headers"]
    )

    assert response.status_code == 204, response.text
    listed = await client.get(_effects_url(character_id), headers=setup["headers"])
    assert listed.json() == []


async def test_effects_of_another_users_character_are_404(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner = await _player_setup(client, db_session, "eff-owner@example.com")
    character_id = await _create_character(client, owner)
    created = await client.post(
        _effects_url(character_id), json=_effect_payload(), headers=owner["headers"]
    )
    effect_id = created.json()["id"]

    intruder_headers = _auth_headers(
        await _register_and_login(client, db_session, "eff-intruder@example.com")
    )

    listed = await client.get(_effects_url(character_id), headers=intruder_headers)
    created_by_intruder = await client.post(
        _effects_url(character_id), json=_effect_payload(), headers=intruder_headers
    )
    patched = await client.patch(
        f"{_effects_url(character_id)}/{effect_id}",
        json={"is_active": False},
        headers=intruder_headers,
    )
    deleted = await client.delete(
        f"{_effects_url(character_id)}/{effect_id}", headers=intruder_headers
    )

    for response in (listed, created_by_intruder, patched, deleted):
        assert response.status_code == 404, response.text
        assert response.json()["error"]["code"] == "character_not_found"


async def test_effect_belonging_to_another_character_is_404(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    # Both characters belong to the caller, so only the second link of the
    # ownership check can reject this.
    setup = await _player_setup(client, db_session, "eff-crossed@example.com")
    first = await _create_character(client, setup)
    second = await client.post(
        CHARACTERS_URL, json=_character_payload(setup, name="Второй"), headers=setup["headers"]
    )
    second_id = second.json()["id"]
    created = await client.post(
        _effects_url(first), json=_effect_payload(), headers=setup["headers"]
    )
    effect_id = created.json()["id"]

    response = await client.patch(
        f"{_effects_url(second_id)}/{effect_id}",
        json={"is_active": False},
        headers=setup["headers"],
    )

    assert response.status_code == 404, response.text
    assert response.json()["error"]["code"] == "effect_not_found"


async def test_unknown_target_is_a_domain_error_not_a_422(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    # The point of validating in the service: the frontend translates by
    # error.code, and FastAPI's default 422 carries no code at all.
    setup = await _player_setup(client, db_session, "eff-badtarget@example.com")
    character_id = await _create_character(client, setup)

    response = await client.post(
        _effects_url(character_id),
        json=_effect_payload(modifiers=[{"target": "ability.luck", "op": "bonus", "value": 1}]),
        headers=setup["headers"],
    )

    assert response.status_code == 400, response.text
    assert response.json()["error"]["code"] == "effect_invalid_modifier"


async def test_bonus_without_value_is_rejected(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _player_setup(client, db_session, "eff-novalue@example.com")
    character_id = await _create_character(client, setup)

    response = await client.post(
        _effects_url(character_id),
        json=_effect_payload(modifiers=[{"target": "ac", "op": "bonus"}]),
        headers=setup["headers"],
    )

    assert response.status_code == 400, response.text
    assert response.json()["error"]["code"] == "effect_invalid_modifier"


async def test_advantage_with_value_is_rejected(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _player_setup(client, db_session, "eff-advvalue@example.com")
    character_id = await _create_character(client, setup)

    response = await client.post(
        _effects_url(character_id),
        json=_effect_payload(modifiers=[{"target": "attack", "op": "advantage", "value": 2}]),
        headers=setup["headers"],
    )

    assert response.status_code == 400, response.text
    assert response.json()["error"]["code"] == "effect_invalid_modifier"


async def test_patch_with_a_bad_modifier_is_rejected(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _player_setup(client, db_session, "eff-patchbad@example.com")
    character_id = await _create_character(client, setup)
    created = await client.post(
        _effects_url(character_id), json=_effect_payload(), headers=setup["headers"]
    )
    effect_id = created.json()["id"]

    response = await client.patch(
        f"{_effects_url(character_id)}/{effect_id}",
        json={"modifiers": [{"target": "speed", "op": "armor_base", "value": 40}]},
        headers=setup["headers"],
    )

    assert response.status_code == 400, response.text
    assert response.json()["error"]["code"] == "effect_invalid_modifier"


async def test_effect_limit_is_enforced(client: AsyncClient, db_session: AsyncSession) -> None:
    from app.characters.schemas import MAX_EFFECTS_PER_CHARACTER

    setup = await _player_setup(client, db_session, "eff-limit@example.com")
    character_id = await _create_character(client, setup)

    for index in range(MAX_EFFECTS_PER_CHARACTER):
        created = await client.post(
            _effects_url(character_id),
            json=_effect_payload(name=f"Эффект {index}"),
            headers=setup["headers"],
        )
        assert created.status_code == 201, created.text

    response = await client.post(
        _effects_url(character_id),
        json=_effect_payload(name="Лишний"),
        headers=setup["headers"],
    )

    assert response.status_code == 400, response.text
    assert response.json()["error"]["code"] == "too_many_effects"


async def test_too_many_modifiers_is_rejected(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    from app.characters.schemas import MAX_MODIFIERS_PER_EFFECT

    setup = await _player_setup(client, db_session, "eff-manymods@example.com")
    character_id = await _create_character(client, setup)

    response = await client.post(
        _effects_url(character_id),
        json=_effect_payload(
            modifiers=[
                {"target": "ac", "op": "bonus", "value": 1}
                for _ in range(MAX_MODIFIERS_PER_EFFECT + 1)
            ]
        ),
        headers=setup["headers"],
    )

    assert response.status_code == 422, response.text


async def test_unknown_duration_kind_is_rejected(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _player_setup(client, db_session, "eff-baddur@example.com")
    character_id = await _create_character(client, setup)

    response = await client.post(
        _effects_url(character_id),
        json=_effect_payload(duration_kind="forever"),
        headers=setup["headers"],
    )

    assert response.status_code == 422, response.text


async def test_effects_require_authentication(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _player_setup(client, db_session, "eff-anon@example.com")
    character_id = await _create_character(client, setup)

    response = await client.get(_effects_url(character_id))

    assert response.status_code == 401, response.text


async def test_deleting_a_character_removes_its_effects(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    from sqlalchemy import func, select

    from app.characters.models import CharacterEffect

    setup = await _player_setup(client, db_session, "eff-cascade@example.com")
    character_id = await _create_character(client, setup)
    await client.post(
        _effects_url(character_id), json=_effect_payload(), headers=setup["headers"]
    )

    await client.delete(f"{CHARACTERS_URL}/{character_id}", headers=setup["headers"])

    remaining = await db_session.scalar(
        select(func.count())
        .select_from(CharacterEffect)
        .where(CharacterEffect.character_id == character_id)
    )
    assert remaining == 0
