"""The printable sheet's own fields (US-15, DND-102).

Storage and validation only — the layout that renders them is DND-104.
"""

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.characters import rules_5e
from tests.test_character_api import (
    CHARACTERS_URL,
    _character_payload,
    _player_setup,
)


async def _create(client: AsyncClient, setup: dict) -> int:
    response = await client.post(
        CHARACTERS_URL, json=_character_payload(setup), headers=setup["headers"]
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def test_new_character_starts_with_empty_sheet_fields(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _player_setup(client, db_session, "sheet-defaults@example.com")
    character_id = await _create(client, setup)

    body = (
        await client.get(f"{CHARACTERS_URL}/{character_id}", headers=setup["headers"])
    ).json()

    assert body["player_name"] is None
    assert body["inspiration"] is False
    assert body["hit_dice_spent"] == 0
    assert body["death_save_successes"] == 0
    assert body["death_save_failures"] == 0
    assert body["attacks"] == {"items": []}
    assert body["spell_slots_spent"] == {}
    assert body["treasures"] is None


async def test_every_sheet_field_round_trips(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _player_setup(client, db_session, "sheet-roundtrip@example.com")
    character_id = await _create(client, setup)

    payload = {
        "player_name": "Егор",
        "age": 85,
        # Free text, so "74" and "1,74 м" are both fine.
        "height": "74",
        "weight": "46 кг",
        "inspiration": True,
        "hit_dice_spent": 1,
        "death_save_successes": 2,
        "death_save_failures": 1,
        "attacks": {
            "items": [{"name": "Длинный меч", "bonus": "+5", "damage": "1d8 рубящий"}],
            "note": "Ярости за бой: 3",
        },
        "spell_slots_spent": {"1": 2},
        "personality_traits": "Говорит мало",
        "ideals": "Свобода",
        "bonds": "Родители под присмотром банды",
        "flaws": "Не умеет читать",
        "goals": "Выкупить долг",
        "allies": "Банда с окраины",
        "feats": "Внимательный",
        "extra_features": "Тёмное зрение",
        "treasures": "Печатка с гербом",
    }

    response = await client.patch(
        f"{CHARACTERS_URL}/{character_id}", json=payload, headers=setup["headers"]
    )

    assert response.status_code == 200, response.text
    stored = (
        await client.get(f"{CHARACTERS_URL}/{character_id}", headers=setup["headers"])
    ).json()
    for field, value in payload.items():
        assert stored[field] == value, field


async def test_creation_does_not_accept_sheet_fields(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    # They would be silently dropped: create builds the row field by field.
    # Rejecting is the honest answer — the sheet fills them in afterwards.
    setup = await _player_setup(client, db_session, "sheet-create@example.com")

    response = await client.post(
        CHARACTERS_URL,
        json=_character_payload(setup, player_name="Егор"),
        headers=setup["headers"],
    )

    assert response.status_code == 422, response.text


async def test_partial_patch_leaves_other_sheet_fields_alone(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _player_setup(client, db_session, "sheet-partial@example.com")
    character_id = await _create(client, setup)
    await client.patch(
        f"{CHARACTERS_URL}/{character_id}",
        json={"ideals": "Свобода", "player_name": "Егор"},
        headers=setup["headers"],
    )

    await client.patch(
        f"{CHARACTERS_URL}/{character_id}",
        json={"inspiration": True},
        headers=setup["headers"],
    )

    stored = (
        await client.get(f"{CHARACTERS_URL}/{character_id}", headers=setup["headers"])
    ).json()
    assert stored["ideals"] == "Свобода"
    assert stored["player_name"] == "Егор"
    assert stored["inspiration"] is True


async def test_rollback_never_drives_an_ability_score_below_one(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    # Ability scores stay editable by PATCH — the player owns their sheet
    # (BR §4.1) — so a score can be lowered between a level-up and its
    # rollback. Subtracting the ASI blindly would then push it under the 1..30
    # range the write schema enforces, and the API would hand back a 0.
    setup = await _player_setup(client, db_session, "sheet-asi-floor@example.com")
    character_id = await _create(client, setup)
    await client.patch(
        f"{CHARACTERS_URL}/{character_id}",
        json={"xp": rules_5e.xp_threshold(2)},
        headers=setup["headers"],
    )
    await client.post(
        f"{CHARACTERS_URL}/{character_id}/level-up",
        json={"hp_method": "average", "asi": {"str": 2}},
        headers=setup["headers"],
    )
    lowered = {"str": 1, "dex": 14, "con": 12, "int": 10, "wis": 15, "cha": 8}
    await client.patch(
        f"{CHARACTERS_URL}/{character_id}",
        json={"ability_scores": lowered},
        headers=setup["headers"],
    )

    response = await client.post(
        f"{CHARACTERS_URL}/{character_id}/level-rollback", headers=setup["headers"]
    )

    assert response.status_code == 200, response.text
    assert response.json()["ability_scores"]["str"] == 1


async def test_rollback_clamps_spent_hit_dice_to_the_new_level(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    # Hit dice are one per level. Spending both at level 2 and then rolling
    # back leaves 2 spent out of 1 — the sheet would read "2 / 1".
    setup = await _player_setup(client, db_session, "sheet-hitdice@example.com")
    character_id = await _create(client, setup)
    await client.patch(
        f"{CHARACTERS_URL}/{character_id}",
        json={"xp": rules_5e.xp_threshold(2)},
        headers=setup["headers"],
    )
    await client.post(
        f"{CHARACTERS_URL}/{character_id}/level-up",
        json={"hp_method": "average"},
        headers=setup["headers"],
    )
    await client.patch(
        f"{CHARACTERS_URL}/{character_id}",
        json={"hit_dice_spent": 2},
        headers=setup["headers"],
    )

    await client.post(
        f"{CHARACTERS_URL}/{character_id}/level-rollback", headers=setup["headers"]
    )

    stored = (
        await client.get(f"{CHARACTERS_URL}/{character_id}", headers=setup["headers"])
    ).json()
    assert stored["level"] == 1
    assert stored["hit_dice_spent"] == 1


async def test_invalid_sheet_values_are_rejected(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _player_setup(client, db_session, "sheet-invalid@example.com")
    character_id = await _create(client, setup)

    for payload in (
        {"death_save_successes": 4},
        {"death_save_failures": -1},
        {"hit_dice_spent": -1},
        {"age": -5},
        # Slot levels are 1..9; cantrips have no slots.
        {"spell_slots_spent": {"0": 1}},
        {"spell_slots_spent": {"10": 1}},
        {"attacks": {"items": [{"bonus": "+5"}]}},
    ):
        response = await client.patch(
            f"{CHARACTERS_URL}/{character_id}", json=payload, headers=setup["headers"]
        )
        assert response.status_code == 422, f"{payload} -> {response.text}"


async def test_sheet_fields_of_another_users_character_are_404(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    from tests.test_character_api import _auth_headers, _register_and_login

    owner = await _player_setup(client, db_session, "sheet-owner@example.com")
    character_id = await _create(client, owner)
    intruder = _auth_headers(
        await _register_and_login(client, db_session, "sheet-intruder@example.com")
    )

    response = await client.patch(
        f"{CHARACTERS_URL}/{character_id}",
        json={"player_name": "Чужой"},
        headers=intruder,
    )

    assert response.status_code == 404, response.text
