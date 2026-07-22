from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.characters import rules_5e
from app.characters.models import CharacterSpell

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
IMPORT_URL = "/api/v1/admin/content/import"
RACES_URL = "/api/v1/content/races"
CLASSES_URL = "/api/v1/content/classes"
BACKGROUNDS_URL = "/api/v1/content/backgrounds"
SPELLS_URL = "/api/v1/content/spells"
CHARACTERS_URL = "/api/v1/characters"

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
                    {
                        "level": 2,
                        "features": {"arcane-recovery": "Восстановление ячеек"},
                        "spell_slots": {"1": 3},
                    },
                    {"level": 3, "features": {}, "spell_slots": {"1": 4, "2": 2}},
                ],
                "subclasses": [
                    {"slug": "evocation", "name": "Эвокация", "unlock_level": 2},
                ],
            }
        ],
        "spells": [
            {
                "slug": "magic-missile",
                "name": "Волшебная стрела",
                "level": 1,
                "school": "evocation",
                "casting_time": "1 действие",
                "range": "120 футов",
                "components": "V, S",
                "duration": "мгновенная",
                "description": "Стрелы силовой энергии.",
                "classes": ["wizard"],
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
    token = await _register_and_login(client, db_session, "admin@example.com", is_admin=True)
    response = await client.post(IMPORT_URL, json=_content_pack(), headers=_auth_headers(token))
    assert response.status_code == 200, response.text


async def _content_ids(client: AsyncClient, headers: dict[str, str]) -> dict:
    races = (await client.get(RACES_URL, headers=headers)).json()
    classes = (await client.get(CLASSES_URL, headers=headers)).json()
    backgrounds = (await client.get(BACKGROUNDS_URL, headers=headers)).json()
    spells = (await client.get(SPELLS_URL, headers=headers)).json()
    wizard = next(c for c in classes if c["slug"] == "wizard")
    return {
        "race_id": next(r["id"] for r in races if r["slug"] == "elf"),
        "class_id": wizard["id"],
        "background_id": next(b["id"] for b in backgrounds if b["slug"] == "sage"),
        "subclass_id": next(s["id"] for s in wizard["subclasses"] if s["slug"] == "evocation"),
        "spell_id": next(s["id"] for s in spells if s["slug"] == "magic-missile"),
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


async def _create_character(client: AsyncClient, setup: dict) -> int:
    response = await client.post(
        CHARACTERS_URL, json=_character_payload(setup), headers=setup["headers"]
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def _give_xp_for_level(
    client: AsyncClient, setup: dict, character_id: int, level: int
) -> None:
    response = await client.patch(
        f"{CHARACTERS_URL}/{character_id}",
        json={"xp": rules_5e.xp_threshold(level)},
        headers=setup["headers"],
    )
    assert response.status_code == 200, response.text


LEVEL_UP_URL = "{characters_url}/{character_id}/level-up"


def _url(character_id: int) -> str:
    return LEVEL_UP_URL.format(characters_url=CHARACTERS_URL, character_id=character_id)


async def test_level_up_without_xp_is_not_available(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _player_setup(client, db_session, "player1@example.com")
    character_id = await _create_character(client, setup)

    response = await client.post(
        _url(character_id), json={"hp_method": "average"}, headers=setup["headers"]
    )

    assert response.status_code == 400, response.text
    assert response.json()["error"]["code"] == "level_up_not_available"


async def test_level_up_asi_and_feat_conflict(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _player_setup(client, db_session, "player2@example.com")
    character_id = await _create_character(client, setup)
    await _give_xp_for_level(client, setup, character_id, 2)

    response = await client.post(
        _url(character_id),
        json={"hp_method": "average", "asi": {"str": 1}, "feat": "Выносливость"},
        headers=setup["headers"],
    )

    assert response.status_code == 400, response.text
    assert response.json()["error"]["code"] == "asi_feat_conflict"


async def test_level_up_negative_asi_is_rejected(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _player_setup(client, db_session, "player7@example.com")
    character_id = await _create_character(client, setup)
    await _give_xp_for_level(client, setup, character_id, 2)

    response = await client.post(
        _url(character_id),
        json={"hp_method": "average", "asi": {"str": -1}},
        headers=setup["headers"],
    )

    assert response.status_code == 422, response.text


async def test_level_up_subclass_wrong_level_is_rejected(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _player_setup(client, db_session, "player3@example.com")
    character_id = await _create_character(client, setup)
    # First reach level 2 (without picking the subclass), then try to submit
    # it a level late — the subclass unlocks at 2, not 3.
    await _give_xp_for_level(client, setup, character_id, 2)
    up_response = await client.post(
        _url(character_id), json={"hp_method": "average"}, headers=setup["headers"]
    )
    assert up_response.status_code == 200, up_response.text

    await _give_xp_for_level(client, setup, character_id, 3)
    response = await client.post(
        _url(character_id),
        json={"hp_method": "average", "subclass_id": setup["subclass_id"]},
        headers=setup["headers"],
    )

    assert response.status_code == 400, response.text
    assert response.json()["error"]["code"] == "subclass_wrong_level"


async def test_level_up_rolled_hp_out_of_range_is_rejected(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _player_setup(client, db_session, "player4@example.com")
    character_id = await _create_character(client, setup)
    await _give_xp_for_level(client, setup, character_id, 2)

    response = await client.post(
        _url(character_id),
        json={"hp_method": "rolled", "hp_rolled": 999},
        headers=setup["headers"],
    )

    assert response.status_code == 400, response.text
    assert response.json()["error"]["code"] == "invalid_hp_roll"


async def test_level_up_applies_delta_and_is_reproducible(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _player_setup(client, db_session, "player5@example.com")
    character_id = await _create_character(client, setup)
    await _give_xp_for_level(client, setup, character_id, 2)

    payload = {
        "hp_method": "average",
        "asi": {"str": 1, "con": 1},
        "subclass_id": setup["subclass_id"],
        "spells_learned": [setup["spell_id"]],
    }
    response = await client.post(_url(character_id), json=payload, headers=setup["headers"])

    assert response.status_code == 200, response.text
    record = response.json()
    assert record["from_level"] == 1
    assert record["to_level"] == 2
    assert record["delta"] == {
        "hp_gained": 5,  # hit_die 6 // 2 + 1 + con_mod(1) = 5
        "hp_method": "average",
        "asi": {"str": 1, "con": 1},
        "feat": None,
        "subclass_chosen": "evocation",
        "features_unlocked": ["arcane-recovery"],
        "spells_learned": ["magic-missile"],
        "spells_forgotten": [],
    }

    character = await client.get(f"{CHARACTERS_URL}/{character_id}", headers=setup["headers"])
    body = character.json()
    assert body["level"] == 2
    assert body["hp_max"] == 13
    assert body["hp_current"] == 13
    assert body["ability_scores"]["str"] == 17
    assert body["ability_scores"]["con"] == 13
    assert body["subclass_id"] == setup["subclass_id"]

    known_spells = (
        await db_session.scalars(
            select(CharacterSpell).where(CharacterSpell.character_id == character_id)
        )
    ).all()
    assert {row.spell_id for row in known_spells} == {setup["spell_id"]}

    # Reproducible: recomputing the same inputs against rules_5e yields the
    # same hp_gained as the delta stored above.
    con_modifier = rules_5e.ability_modifier(ABILITY_SCORES["con"])
    assert rules_5e.average_hp_gain(6, con_modifier) == record["delta"]["hp_gained"]


async def test_level_up_delta_excludes_already_known_spells(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _player_setup(client, db_session, "player6@example.com")
    character_id = await _create_character(client, setup)
    await _give_xp_for_level(client, setup, character_id, 2)

    first = await client.post(
        _url(character_id),
        json={"hp_method": "average", "spells_learned": [setup["spell_id"]]},
        headers=setup["headers"],
    )
    assert first.status_code == 200, first.text
    assert first.json()["delta"]["spells_learned"] == ["magic-missile"]

    await _give_xp_for_level(client, setup, character_id, 3)
    second = await client.post(
        _url(character_id),
        json={"hp_method": "average", "spells_learned": [setup["spell_id"]]},
        headers=setup["headers"],
    )

    assert second.status_code == 200, second.text
    assert second.json()["delta"]["spells_learned"] == []

    known_spells = (
        await db_session.scalars(
            select(CharacterSpell).where(CharacterSpell.character_id == character_id)
        )
    ).all()
    assert len(known_spells) == 1


async def test_level_up_other_users_character_is_404(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup_a = await _player_setup(client, db_session, "playera@example.com")
    character_id = await _create_character(client, setup_a)
    await _give_xp_for_level(client, setup_a, character_id, 2)

    token_b = await _register_and_login(client, db_session, "playerb@example.com")
    headers_b = _auth_headers(token_b)

    response = await client.post(
        _url(character_id), json={"hp_method": "average"}, headers=headers_b
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "character_not_found"
