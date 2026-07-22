from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.characters import rules_5e

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
IMPORT_URL = "/api/v1/admin/content/import"
RACES_URL = "/api/v1/content/races"
CLASSES_URL = "/api/v1/content/classes"
BACKGROUNDS_URL = "/api/v1/content/backgrounds"
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
                "levels": [
                    {"level": 1, "features": {}, "spell_slots": {"1": 2}},
                    {"level": 2, "features": {}, "spell_slots": {"1": 3}},
                ],
            }
        ],
        "spells": [],
        "items": [],
        "backgrounds": [{"slug": "sage", "name": "Мудрец"}],
    }


async def _register_and_login(
    client: AsyncClient,
    db_session: AsyncSession,
    email: str,
    *,
    is_admin: bool = False,
    verified: bool = True,
) -> str:
    response = await client.post(
        REGISTER_URL,
        json={"email": email, "password": PASSWORD, "display_name": "Тест"},
    )
    assert response.status_code == 201, response.text

    if is_admin or verified:
        user = await db_session.scalar(select(User).where(User.email == email))
        assert user is not None
        if is_admin:
            user.is_admin = True
        if verified:
            user.email_verified = True
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
    return {
        "race_id": next(r["id"] for r in races if r["slug"] == "elf"),
        "class_id": next(c["id"] for c in classes if c["slug"] == "wizard"),
        "background_id": next(b["id"] for b in backgrounds if b["slug"] == "sage"),
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
        "proficiencies": {"skills": ["perception"]},
    }
    payload.update(overrides)
    return payload


async def test_create_character_defaults_level_and_xp(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _player_setup(client, db_session, "player1@example.com")

    response = await client.post(
        CHARACTERS_URL, json=_character_payload(setup), headers=setup["headers"]
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["level"] == 1
    assert body["xp"] == 0
    assert body["hp_current"] == 8
    assert body["gold"] == 0


async def test_computed_block_is_correct_for_reference_character(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _player_setup(client, db_session, "player2@example.com")

    create_response = await client.post(
        CHARACTERS_URL,
        json=_character_payload(
            setup, proficiencies={"skills": ["perception"], "saves": ["int", "wis"]}
        ),
        headers=setup["headers"],
    )
    assert create_response.status_code == 201, create_response.text
    character_id = create_response.json()["id"]

    response = await client.get(f"{CHARACTERS_URL}/{character_id}", headers=setup["headers"])

    assert response.status_code == 200, response.text
    computed = response.json()["computed"]
    # Reference character: str16 dex14 con12 int10 wis15 cha8, level 1, proficient
    # in perception (skill) and int/wis (saves). Expected values below are
    # hand-computed against the 5e tables (ARCHITECTURE.md §3), not re-derived
    # from rules_5e, so this test would catch a bug shared between production
    # code and its own formulas.
    assert computed["prof_bonus"] == 2
    assert computed["modifiers"] == {
        "str": 3,
        "dex": 2,
        "con": 1,
        "int": 0,
        "wis": 2,
        "cha": -1,
    }
    assert computed["saving_throws"] == {
        "str": 3,  # not proficient: modifier only
        "dex": 2,  # not proficient: modifier only
        "con": 1,  # not proficient: modifier only
        "int": 2,  # proficient: modifier (0) + prof_bonus (2)
        "wis": 4,  # proficient: modifier (2) + prof_bonus (2)
        "cha": -1,  # not proficient: modifier only
    }
    assert computed["skills"]["perception"] == 4  # proficient: wis mod (2) + prof_bonus (2)
    assert computed["skills"]["stealth"] == 2  # not proficient: dex mod only
    assert computed["skills"]["athletics"] == 3  # not proficient: str mod only
    assert len(computed["skills"]) == 18
    assert computed["ac"] == 12  # 10 + dex mod (2), no ac_override
    assert computed["initiative"] == 2  # dex mod
    assert computed["passive_perception"] == 14  # 10 + wis mod (2) + prof_bonus (2)
    assert computed["xp_to_next"] == 300  # XP threshold for level 2
    assert computed["level_up_available"] is False
    assert computed["spell_slots"] == {"1": 2}


async def test_computed_ac_override_wins_over_base_formula(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _player_setup(client, db_session, "player3@example.com")

    create_response = await client.post(
        CHARACTERS_URL,
        json=_character_payload(setup, ac_override=18),
        headers=setup["headers"],
    )
    character_id = create_response.json()["id"]

    response = await client.get(f"{CHARACTERS_URL}/{character_id}", headers=setup["headers"])

    assert response.json()["computed"]["ac"] == 18


async def test_level_up_available_when_xp_threshold_reached(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _player_setup(client, db_session, "player4@example.com")
    create_response = await client.post(
        CHARACTERS_URL, json=_character_payload(setup), headers=setup["headers"]
    )
    character_id = create_response.json()["id"]

    patch_response = await client.patch(
        f"{CHARACTERS_URL}/{character_id}",
        json={"xp": rules_5e.xp_threshold(2)},
        headers=setup["headers"],
    )
    assert patch_response.status_code == 200, patch_response.text

    response = await client.get(f"{CHARACTERS_URL}/{character_id}", headers=setup["headers"])
    assert response.json()["computed"]["level_up_available"] is True


async def test_list_characters_returns_only_own(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup_a = await _player_setup(client, db_session, "playera@example.com")
    await client.post(CHARACTERS_URL, json=_character_payload(setup_a), headers=setup_a["headers"])

    token_b = await _register_and_login(client, db_session, "playerb@example.com")
    headers_b = _auth_headers(token_b)
    ids_b = await _content_ids(client, headers_b)
    await client.post(
        CHARACTERS_URL, json=_character_payload(ids_b, name="Другой"), headers=headers_b
    )

    response = await client.get(CHARACTERS_URL, headers=headers_b)

    assert response.status_code == 200, response.text
    names = {c["name"] for c in response.json()}
    assert names == {"Другой"}


async def test_get_other_users_character_is_404(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup_a = await _player_setup(client, db_session, "playerc@example.com")
    create_response = await client.post(
        CHARACTERS_URL, json=_character_payload(setup_a), headers=setup_a["headers"]
    )
    character_id = create_response.json()["id"]

    token_b = await _register_and_login(client, db_session, "playerd@example.com")
    headers_b = _auth_headers(token_b)

    response = await client.get(f"{CHARACTERS_URL}/{character_id}", headers=headers_b)

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "character_not_found"


async def test_patch_other_users_character_is_404(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup_a = await _player_setup(client, db_session, "playere@example.com")
    create_response = await client.post(
        CHARACTERS_URL, json=_character_payload(setup_a), headers=setup_a["headers"]
    )
    character_id = create_response.json()["id"]

    token_b = await _register_and_login(client, db_session, "playerf@example.com")
    headers_b = _auth_headers(token_b)

    response = await client.patch(
        f"{CHARACTERS_URL}/{character_id}", json={"xp": 100}, headers=headers_b
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "character_not_found"


async def test_delete_other_users_character_is_404(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup_a = await _player_setup(client, db_session, "playerg@example.com")
    create_response = await client.post(
        CHARACTERS_URL, json=_character_payload(setup_a), headers=setup_a["headers"]
    )
    character_id = create_response.json()["id"]

    token_b = await _register_and_login(client, db_session, "playerh@example.com")
    headers_b = _auth_headers(token_b)

    response = await client.delete(f"{CHARACTERS_URL}/{character_id}", headers=headers_b)

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "character_not_found"


async def test_patch_updates_xp_money_and_hp(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _player_setup(client, db_session, "playeri@example.com")
    create_response = await client.post(
        CHARACTERS_URL, json=_character_payload(setup), headers=setup["headers"]
    )
    character_id = create_response.json()["id"]

    response = await client.patch(
        f"{CHARACTERS_URL}/{character_id}",
        json={"xp": 250, "gold": 15, "silver": 3, "copper": 7, "hp_current": 5},
        headers=setup["headers"],
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["xp"] == 250
    assert body["gold"] == 15
    assert body["silver"] == 3
    assert body["copper"] == 7
    assert body["hp_current"] == 5


async def test_patch_level_is_rejected(client: AsyncClient, db_session: AsyncSession) -> None:
    setup = await _player_setup(client, db_session, "playerj@example.com")
    create_response = await client.post(
        CHARACTERS_URL, json=_character_payload(setup), headers=setup["headers"]
    )
    character_id = create_response.json()["id"]

    response = await client.patch(
        f"{CHARACTERS_URL}/{character_id}", json={"level": 5}, headers=setup["headers"]
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "level_direct_edit_forbidden"

    unchanged = await client.get(f"{CHARACTERS_URL}/{character_id}", headers=setup["headers"])
    assert unchanged.json()["level"] == 1


async def test_create_with_invalid_race_id_returns_400(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _player_setup(client, db_session, "playerk@example.com")

    response = await client.post(
        CHARACTERS_URL,
        json=_character_payload(setup, race_id=999999),
        headers=setup["headers"],
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_reference"


async def test_delete_character_removes_it(client: AsyncClient, db_session: AsyncSession) -> None:
    setup = await _player_setup(client, db_session, "playerl@example.com")
    create_response = await client.post(
        CHARACTERS_URL, json=_character_payload(setup), headers=setup["headers"]
    )
    character_id = create_response.json()["id"]

    delete_response = await client.delete(
        f"{CHARACTERS_URL}/{character_id}", headers=setup["headers"]
    )
    assert delete_response.status_code == 204

    get_response = await client.get(f"{CHARACTERS_URL}/{character_id}", headers=setup["headers"])
    assert get_response.status_code == 404


async def test_characters_require_authentication(client: AsyncClient) -> None:
    response = await client.get(CHARACTERS_URL)

    assert response.status_code == 401


async def test_characters_require_verified_email(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    token = await _register_and_login(
        client, db_session, "unverified@example.com", verified=False
    )

    response = await client.get(CHARACTERS_URL, headers=_auth_headers(token))

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "email_not_verified"
