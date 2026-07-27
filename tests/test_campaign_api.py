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
CHARACTERS_URL = "/api/v1/characters"
CAMPAIGNS_URL = "/api/v1/campaigns"

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
    return await _second_player_setup(client, db_session, email)


async def _second_player_setup(client: AsyncClient, db_session: AsyncSession, email: str) -> dict:
    """Like `_player_setup`, but skips re-importing the content pack — call this
    for every user after the first one in a test, since the pack (and its admin
    account) only needs to exist once per test."""
    token = await _register_and_login(client, db_session, email)
    headers = _auth_headers(token)
    ids = await _content_ids(client, headers)
    return {"headers": headers, **ids}


async def _create_character(client: AsyncClient, setup: dict, name: str = "Ари") -> int:
    payload = {
        "name": name,
        "race_id": setup["race_id"],
        "class_id": setup["class_id"],
        "background_id": setup["background_id"],
        "alignment": "chaotic-good",
        "ability_scores": ABILITY_SCORES,
        "hp_max": 8,
        "speed": 30,
        "proficiencies": {"skills": ["perception"]},
    }
    response = await client.post(CHARACTERS_URL, json=payload, headers=setup["headers"])
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def _create_campaign(
    client: AsyncClient, headers: dict[str, str], **overrides: object
) -> dict:
    payload = {"name": "Проклятие Страда"}
    payload.update(overrides)
    response = await client.post(CAMPAIGNS_URL, json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


async def test_create_campaign_generates_invite_code(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    dm = await _player_setup(client, db_session, "dm1@example.com")

    campaign = await _create_campaign(client, dm["headers"], description="Готическая кампания")

    assert campaign["invite_code"]
    assert campaign["name"] == "Проклятие Страда"
    assert campaign["description"] == "Готическая кампания"


async def test_join_campaign_with_own_character_succeeds(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    dm = await _player_setup(client, db_session, "dm2@example.com")
    campaign = await _create_campaign(client, dm["headers"])

    player = await _second_player_setup(client, db_session, "player2@example.com")
    character_id = await _create_character(client, player)

    response = await client.post(
        f"{CAMPAIGNS_URL}/join",
        json={"invite_code": campaign["invite_code"], "character_id": character_id},
        headers=player["headers"],
    )

    assert response.status_code == 200, response.text

    mine = await client.get(CAMPAIGNS_URL, headers=player["headers"])
    assert mine.status_code == 200, mine.text
    assert [c["id"] for c in mine.json()["as_player"]] == [campaign["id"]]
    assert "invite_code" not in mine.json()["as_player"][0]


async def test_join_campaign_with_someone_elses_character_fails(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    dm = await _player_setup(client, db_session, "dm3@example.com")
    campaign = await _create_campaign(client, dm["headers"])

    owner = await _second_player_setup(client, db_session, "owner3@example.com")
    character_id = await _create_character(client, owner)

    intruder = await _second_player_setup(client, db_session, "intruder3@example.com")
    response = await client.post(
        f"{CAMPAIGNS_URL}/join",
        json={"invite_code": campaign["invite_code"], "character_id": character_id},
        headers=intruder["headers"],
    )

    assert response.status_code == 404, response.text
    assert response.json()["error"]["code"] == "character_not_found"


async def test_repeat_join_is_idempotent_error(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    dm = await _player_setup(client, db_session, "dm4@example.com")
    campaign = await _create_campaign(client, dm["headers"])

    player = await _second_player_setup(client, db_session, "player4@example.com")
    character_id = await _create_character(client, player)

    join_payload = {"invite_code": campaign["invite_code"], "character_id": character_id}
    first = await client.post(
        f"{CAMPAIGNS_URL}/join", json=join_payload, headers=player["headers"]
    )
    assert first.status_code == 200, first.text

    second = await client.post(
        f"{CAMPAIGNS_URL}/join", json=join_payload, headers=player["headers"]
    )
    assert second.status_code == 400, second.text
    assert second.json()["error"]["code"] == "already_joined"

    third = await client.post(
        f"{CAMPAIGNS_URL}/join", json=join_payload, headers=player["headers"]
    )
    assert third.status_code == 400, third.text
    assert third.json()["error"]["code"] == "already_joined"


async def test_join_with_invalid_invite_code_fails(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player = await _player_setup(client, db_session, "player5@example.com")
    character_id = await _create_character(client, player)

    response = await client.post(
        f"{CAMPAIGNS_URL}/join",
        json={"invite_code": "does-not-exist", "character_id": character_id},
        headers=player["headers"],
    )

    assert response.status_code == 404, response.text
    assert response.json()["error"]["code"] == "invite_code_invalid"


async def test_regenerate_invite_invalidates_old_code(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    dm = await _player_setup(client, db_session, "dm6@example.com")
    campaign = await _create_campaign(client, dm["headers"])
    old_code = campaign["invite_code"]

    regen_response = await client.post(
        f"{CAMPAIGNS_URL}/{campaign['id']}/regenerate-invite", headers=dm["headers"]
    )
    assert regen_response.status_code == 200, regen_response.text
    new_code = regen_response.json()["invite_code"]
    assert new_code != old_code

    player = await _second_player_setup(client, db_session, "player6@example.com")
    character_id = await _create_character(client, player)

    old_join = await client.post(
        f"{CAMPAIGNS_URL}/join",
        json={"invite_code": old_code, "character_id": character_id},
        headers=player["headers"],
    )
    assert old_join.status_code == 404, old_join.text
    assert old_join.json()["error"]["code"] == "invite_code_invalid"

    new_join = await client.post(
        f"{CAMPAIGNS_URL}/join",
        json={"invite_code": new_code, "character_id": character_id},
        headers=player["headers"],
    )
    assert new_join.status_code == 200, new_join.text


async def test_regenerate_invite_forbidden_for_non_dm(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    dm = await _player_setup(client, db_session, "dm7@example.com")
    campaign = await _create_campaign(client, dm["headers"])

    stranger = await _second_player_setup(client, db_session, "stranger7@example.com")
    response = await client.post(
        f"{CAMPAIGNS_URL}/{campaign['id']}/regenerate-invite", headers=stranger["headers"]
    )

    assert response.status_code == 404, response.text
    assert response.json()["error"]["code"] == "campaign_not_found"


async def test_campaign_crud_forbidden_for_non_dm(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    dm = await _player_setup(client, db_session, "dm8@example.com")
    campaign = await _create_campaign(client, dm["headers"])

    stranger = await _second_player_setup(client, db_session, "stranger8@example.com")

    get_response = await client.get(
        f"{CAMPAIGNS_URL}/{campaign['id']}", headers=stranger["headers"]
    )
    assert get_response.status_code == 404, get_response.text

    patch_response = await client.patch(
        f"{CAMPAIGNS_URL}/{campaign['id']}",
        json={"name": "Захват"},
        headers=stranger["headers"],
    )
    assert patch_response.status_code == 404, patch_response.text

    delete_response = await client.delete(
        f"{CAMPAIGNS_URL}/{campaign['id']}", headers=stranger["headers"]
    )
    assert delete_response.status_code == 404, delete_response.text


async def test_dm_can_update_and_view_campaign_detail(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    dm = await _player_setup(client, db_session, "dm9@example.com")
    campaign = await _create_campaign(client, dm["headers"])

    patch_response = await client.patch(
        f"{CAMPAIGNS_URL}/{campaign['id']}",
        json={"next_session_place": "Кафе на Пушкинской"},
        headers=dm["headers"],
    )
    assert patch_response.status_code == 200, patch_response.text
    assert patch_response.json()["next_session_place"] == "Кафе на Пушкинской"

    get_response = await client.get(f"{CAMPAIGNS_URL}/{campaign['id']}", headers=dm["headers"])
    assert get_response.status_code == 200, get_response.text
    assert get_response.json()["participants"] == []


async def test_kick_available_only_to_dm(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    dm = await _player_setup(client, db_session, "dm10@example.com")
    campaign = await _create_campaign(client, dm["headers"])

    player = await _second_player_setup(client, db_session, "player10@example.com")
    character_id = await _create_character(client, player)
    await client.post(
        f"{CAMPAIGNS_URL}/join",
        json={"invite_code": campaign["invite_code"], "character_id": character_id},
        headers=player["headers"],
    )

    stranger = await _second_player_setup(client, db_session, "stranger10@example.com")
    stranger_character_id = await _create_character(client, stranger, name="Чужак")

    forbidden = await client.delete(
        f"{CAMPAIGNS_URL}/{campaign['id']}/characters/{character_id}",
        headers=stranger["headers"],
    )
    assert forbidden.status_code == 404, forbidden.text

    forbidden_own = await client.delete(
        f"{CAMPAIGNS_URL}/{campaign['id']}/characters/{stranger_character_id}",
        headers=stranger["headers"],
    )
    assert forbidden_own.status_code == 404, forbidden_own.text

    kicked = await client.delete(
        f"{CAMPAIGNS_URL}/{campaign['id']}/characters/{character_id}",
        headers=dm["headers"],
    )
    assert kicked.status_code == 204, kicked.text

    detail = await client.get(f"{CAMPAIGNS_URL}/{campaign['id']}", headers=dm["headers"])
    assert detail.json()["participants"] == []


async def test_player_can_leave_campaign_with_own_character(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    dm = await _player_setup(client, db_session, "dm11@example.com")
    campaign = await _create_campaign(client, dm["headers"])

    player = await _second_player_setup(client, db_session, "player11@example.com")
    character_id = await _create_character(client, player)
    await client.post(
        f"{CAMPAIGNS_URL}/join",
        json={"invite_code": campaign["invite_code"], "character_id": character_id},
        headers=player["headers"],
    )

    leave_response = await client.delete(
        f"{CAMPAIGNS_URL}/{campaign['id']}/characters/{character_id}",
        headers=player["headers"],
    )
    assert leave_response.status_code == 204, leave_response.text

    detail = await client.get(f"{CAMPAIGNS_URL}/{campaign['id']}", headers=dm["headers"])
    assert detail.json()["participants"] == []


async def test_kick_unknown_membership_returns_not_found(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    dm = await _player_setup(client, db_session, "dm12@example.com")
    campaign = await _create_campaign(client, dm["headers"])

    player = await _second_player_setup(client, db_session, "player12@example.com")
    character_id = await _create_character(client, player)

    response = await client.delete(
        f"{CAMPAIGNS_URL}/{campaign['id']}/characters/{character_id}",
        headers=dm["headers"],
    )

    assert response.status_code == 404, response.text
    assert response.json()["error"]["code"] == "campaign_character_not_found"
