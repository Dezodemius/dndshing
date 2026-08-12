from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.auth.security import create_access_token
from app.characters import rules_5e
from app.characters.models import CharacterSpell

IMPORT_URL = "/api/v1/admin/content/import"
RACES_URL = "/api/v1/content/races"
CLASSES_URL = "/api/v1/content/classes"
BACKGROUNDS_URL = "/api/v1/content/backgrounds"
SPELLS_URL = "/api/v1/content/spells"
CHARACTERS_URL = "/api/v1/characters"

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
    # Mirrors what an OAuth login creates (AuthService._link_or_create_vk_user):
    # a User row with no password, email already verified.
    user = User(email=email, display_name="Тест", email_verified=True, is_admin=is_admin)
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return create_access_token(user.id)


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


def _level_up_url(character_id: int) -> str:
    return f"{CHARACTERS_URL}/{character_id}/level-up"


def _rollback_url(character_id: int) -> str:
    return f"{CHARACTERS_URL}/{character_id}/level-rollback"


def _history_url(character_id: int) -> str:
    return f"{CHARACTERS_URL}/{character_id}/level-history"


async def test_rollback_on_empty_stack_is_rejected(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _player_setup(client, db_session, "player1@example.com")
    character_id = await _create_character(client, setup)

    response = await client.post(_rollback_url(character_id), headers=setup["headers"])

    assert response.status_code == 400, response.text
    assert response.json()["error"]["code"] == "rollback_empty"


async def test_rollback_restores_exact_pre_level_up_state(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _player_setup(client, db_session, "player2@example.com")
    character_id = await _create_character(client, setup)
    await _give_xp_for_level(client, setup, character_id, 2)

    before = await client.get(f"{CHARACTERS_URL}/{character_id}", headers=setup["headers"])
    assert before.status_code == 200, before.text
    before_body = before.json()

    up_response = await client.post(
        _level_up_url(character_id),
        json={
            "hp_method": "average",
            "asi": {"str": 1, "con": 1},
            "subclass_id": setup["subclass_id"],
            "spells_learned": [setup["spell_id"]],
        },
        headers=setup["headers"],
    )
    assert up_response.status_code == 200, up_response.text

    rollback_response = await client.post(_rollback_url(character_id), headers=setup["headers"])

    assert rollback_response.status_code == 200, rollback_response.text
    after_body = rollback_response.json()
    # Full comparison, ignoring the timestamp bumped by ORM onupdate.
    before_body.pop("updated_at")
    after_body.pop("updated_at")
    assert after_body == before_body

    known_spells = (
        await db_session.scalars(
            select(CharacterSpell).where(CharacterSpell.character_id == character_id)
        )
    ).all()
    assert known_spells == []


async def test_double_rollback_is_impossible(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _player_setup(client, db_session, "player3@example.com")
    character_id = await _create_character(client, setup)
    await _give_xp_for_level(client, setup, character_id, 2)
    up_response = await client.post(
        _level_up_url(character_id), json={"hp_method": "average"}, headers=setup["headers"]
    )
    assert up_response.status_code == 200, up_response.text

    first_rollback = await client.post(_rollback_url(character_id), headers=setup["headers"])
    assert first_rollback.status_code == 200, first_rollback.text

    second_rollback = await client.post(_rollback_url(character_id), headers=setup["headers"])

    assert second_rollback.status_code == 400, second_rollback.text
    assert second_rollback.json()["error"]["code"] == "rollback_empty"


async def test_rollback_removes_only_the_top_record(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _player_setup(client, db_session, "player4@example.com")
    character_id = await _create_character(client, setup)
    await _give_xp_for_level(client, setup, character_id, 2)
    first_up = await client.post(
        _level_up_url(character_id), json={"hp_method": "average"}, headers=setup["headers"]
    )
    assert first_up.status_code == 200, first_up.text

    await _give_xp_for_level(client, setup, character_id, 3)
    second_up = await client.post(
        _level_up_url(character_id), json={"hp_method": "average"}, headers=setup["headers"]
    )
    assert second_up.status_code == 200, second_up.text

    rollback_response = await client.post(_rollback_url(character_id), headers=setup["headers"])

    assert rollback_response.status_code == 200, rollback_response.text
    assert rollback_response.json()["level"] == 2

    history = await client.get(_history_url(character_id), headers=setup["headers"])
    assert history.status_code == 200, history.text
    records = history.json()
    assert len(records) == 1
    assert records[0]["to_level"] == 2


async def test_level_history_lists_records_in_order(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _player_setup(client, db_session, "player5@example.com")
    character_id = await _create_character(client, setup)
    await _give_xp_for_level(client, setup, character_id, 2)
    await client.post(
        _level_up_url(character_id), json={"hp_method": "average"}, headers=setup["headers"]
    )
    await _give_xp_for_level(client, setup, character_id, 3)
    await client.post(
        _level_up_url(character_id), json={"hp_method": "average"}, headers=setup["headers"]
    )

    response = await client.get(_history_url(character_id), headers=setup["headers"])

    assert response.status_code == 200, response.text
    records = response.json()
    assert [(r["from_level"], r["to_level"]) for r in records] == [(1, 2), (2, 3)]


async def test_level_history_of_other_users_character_is_404(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup_a = await _player_setup(client, db_session, "playera@example.com")
    character_id = await _create_character(client, setup_a)

    token_b = await _register_and_login(client, db_session, "playerb@example.com")
    headers_b = _auth_headers(token_b)

    response = await client.get(_history_url(character_id), headers=headers_b)

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "character_not_found"


async def test_rollback_other_users_character_is_404(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup_a = await _player_setup(client, db_session, "playerc@example.com")
    character_id = await _create_character(client, setup_a)
    await _give_xp_for_level(client, setup_a, character_id, 2)
    await client.post(
        _level_up_url(character_id), json={"hp_method": "average"}, headers=setup_a["headers"]
    )

    token_b = await _register_and_login(client, db_session, "playerd@example.com")
    headers_b = _auth_headers(token_b)

    response = await client.post(_rollback_url(character_id), headers=headers_b)

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "character_not_found"
