from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.auth.security import create_access_token

IMPORT_URL = "/api/v1/admin/content/import"
RACES_URL = "/api/v1/content/races"
CLASSES_URL = "/api/v1/content/classes"
BACKGROUNDS_URL = "/api/v1/content/backgrounds"
SPELLS_URL = "/api/v1/content/spells"
CHARACTERS_URL = "/api/v1/characters"

ADMIN_EMAIL = "admin@example.com"

ABILITY_SCORES = {"str": 8, "dex": 14, "con": 12, "int": 16, "wis": 15, "cha": 10}


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
            },
            {
                "slug": "fighter",
                "name": "Воин",
                "hit_die": 10,
                "primary_ability": "strength",
                "levels": [{"level": 1, "features": {}}],
            },
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
                "description": "Три светящиеся стрелы.",
                "classes": ["wizard"],
            },
            {
                "slug": "second-wind",
                "name": "Второе дыхание",
                "level": 1,
                "school": "abjuration",
                "casting_time": "бонусное действие",
                "range": "на себя",
                "components": "V",
                "duration": "мгновенная",
                "description": "Восстановление хитов, не для волшебника.",
                "classes": ["fighter"],
            },
        ],
        "items": [],
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
    token = await _register_and_login(client, db_session, ADMIN_EMAIL, is_admin=True)
    response = await client.post(IMPORT_URL, json=_content_pack(), headers=_auth_headers(token))
    assert response.status_code == 200, response.text


async def _content_ids(client: AsyncClient, headers: dict[str, str]) -> dict[str, int]:
    races = (await client.get(RACES_URL, headers=headers)).json()
    classes = (await client.get(CLASSES_URL, headers=headers)).json()
    backgrounds = (await client.get(BACKGROUNDS_URL, headers=headers)).json()
    spells = (await client.get(SPELLS_URL, headers=headers)).json()
    return {
        "race_id": next(r["id"] for r in races if r["slug"] == "elf"),
        "class_id": next(c["id"] for c in classes if c["slug"] == "wizard"),
        "background_id": next(b["id"] for b in backgrounds if b["slug"] == "sage"),
        "magic_missile_id": next(s["id"] for s in spells if s["slug"] == "magic-missile"),
        "second_wind_id": next(s["id"] for s in spells if s["slug"] == "second-wind"),
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
        "hp_max": 6,
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


async def test_put_spells_sets_known_and_prepared(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _player_setup(client, db_session, "player1@example.com")
    character_id = await _create_character(client, setup)

    response = await client.put(
        f"{CHARACTERS_URL}/{character_id}/spells",
        json={"spells": [{"spell_id": setup["magic_missile_id"], "prepared": True}]},
        headers=setup["headers"],
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body == [{"spell_id": setup["magic_missile_id"], "prepared": True}]

    get_response = await client.get(f"{CHARACTERS_URL}/{character_id}", headers=setup["headers"])
    assert get_response.json()["spells"] == [
        {"spell_id": setup["magic_missile_id"], "prepared": True}
    ]


async def test_put_spells_replaces_previous_set(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _player_setup(client, db_session, "player2@example.com")
    character_id = await _create_character(client, setup)

    first = await client.put(
        f"{CHARACTERS_URL}/{character_id}/spells",
        json={"spells": [{"spell_id": setup["magic_missile_id"], "prepared": True}]},
        headers=setup["headers"],
    )
    assert first.status_code == 200, first.text

    second = await client.put(
        f"{CHARACTERS_URL}/{character_id}/spells",
        json={"spells": []},
        headers=setup["headers"],
    )

    assert second.status_code == 200, second.text
    assert second.json() == []

    get_response = await client.get(f"{CHARACTERS_URL}/{character_id}", headers=setup["headers"])
    assert get_response.json()["spells"] == []


async def test_spell_not_in_class_list_is_rejected(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _player_setup(client, db_session, "player3@example.com")
    character_id = await _create_character(client, setup)

    response = await client.put(
        f"{CHARACTERS_URL}/{character_id}/spells",
        json={"spells": [{"spell_id": setup["second_wind_id"], "prepared": False}]},
        headers=setup["headers"],
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "spell_not_in_class_list"


async def test_put_spells_on_other_users_character_is_404(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup_a = await _player_setup(client, db_session, "playera@example.com")
    character_id = await _create_character(client, setup_a)

    token_b = await _register_and_login(client, db_session, "playerb@example.com")
    headers_b = _auth_headers(token_b)

    response = await client.put(
        f"{CHARACTERS_URL}/{character_id}/spells",
        json={"spells": [{"spell_id": setup_a["magic_missile_id"], "prepared": True}]},
        headers=headers_b,
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "character_not_found"
