from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.auth.security import create_access_token
from tests.conftest import seed_content

RACES_URL = "/api/v1/content/races"
CLASSES_URL = "/api/v1/content/classes"
BACKGROUNDS_URL = "/api/v1/content/backgrounds"
CHARACTERS_URL = "/api/v1/characters"
CAMPAIGNS_URL = "/api/v1/campaigns"

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
    # Mirrors what an OAuth login creates (AuthService._link_or_create_vk_user):
    # a User row with no password, is_admin/email_verified set directly.
    user = User(email=email, display_name="Тест", email_verified=verified, is_admin=is_admin)
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
    await _import_pack()
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


async def test_update_with_explicit_null_name_is_rejected(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    dm = await _player_setup(client, db_session, "dm11@example.com")
    campaign = await _create_campaign(client, dm["headers"])

    patch_response = await client.patch(
        f"{CAMPAIGNS_URL}/{campaign['id']}",
        json={"name": None},
        headers=dm["headers"],
    )
    assert patch_response.status_code == 422, patch_response.text


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


async def test_dm_can_view_joined_character_full_sheet(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    dm = await _player_setup(client, db_session, "dm13@example.com")
    campaign = await _create_campaign(client, dm["headers"])

    player = await _second_player_setup(client, db_session, "player13@example.com")
    character_id = await _create_character(client, player)
    await client.post(
        f"{CAMPAIGNS_URL}/join",
        json={"invite_code": campaign["invite_code"], "character_id": character_id},
        headers=player["headers"],
    )

    response = await client.get(
        f"{CAMPAIGNS_URL}/{campaign['id']}/characters/{character_id}",
        headers=dm["headers"],
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["id"] == character_id
    assert "computed" in body
    assert "ac" in body["computed"]


async def test_view_character_is_not_found_for_non_dm(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """404, not 403: a 403 would confirm to any logged-in user that this
    campaign id exists, which is the enumeration leak the "чужой ресурс -> 404"
    rule closes."""
    dm = await _player_setup(client, db_session, "dm14@example.com")
    campaign = await _create_campaign(client, dm["headers"])

    player = await _second_player_setup(client, db_session, "player14@example.com")
    character_id = await _create_character(client, player)
    await client.post(
        f"{CAMPAIGNS_URL}/join",
        json={"invite_code": campaign["invite_code"], "character_id": character_id},
        headers=player["headers"],
    )

    stranger = await _second_player_setup(client, db_session, "stranger14@example.com")
    response = await client.get(
        f"{CAMPAIGNS_URL}/{campaign['id']}/characters/{character_id}",
        headers=stranger["headers"],
    )

    assert response.status_code == 404, response.text
    assert response.json()["error"]["code"] == "campaign_not_found"


async def test_view_character_outside_campaign_is_not_found(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    dm = await _player_setup(client, db_session, "dm15@example.com")
    campaign = await _create_campaign(client, dm["headers"])

    player = await _second_player_setup(client, db_session, "player15@example.com")
    character_id = await _create_character(client, player)

    response = await client.get(
        f"{CAMPAIGNS_URL}/{campaign['id']}/characters/{character_id}",
        headers=dm["headers"],
    )

    assert response.status_code == 404, response.text
    assert response.json()["error"]["code"] == "campaign_character_not_found"


async def test_view_character_unknown_campaign_is_not_found(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player = await _player_setup(client, db_session, "player16@example.com")
    character_id = await _create_character(client, player)

    response = await client.get(
        f"{CAMPAIGNS_URL}/999999/characters/{character_id}",
        headers=player["headers"],
    )

    assert response.status_code == 404, response.text
    assert response.json()["error"]["code"] == "campaign_not_found"


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


async def test_non_member_cannot_tell_an_existing_campaign_from_a_missing_one(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """A player owning the character gets the same answer for a real campaign
    they are not in and for one that does not exist. Two different codes here
    would turn this endpoint into an id-enumeration oracle."""
    dm = await _player_setup(client, db_session, "dm17@example.com")
    campaign = await _create_campaign(client, dm["headers"])

    outsider = await _second_player_setup(client, db_session, "outsider17@example.com")
    character_id = await _create_character(client, outsider)

    existing = await client.delete(
        f"{CAMPAIGNS_URL}/{campaign['id']}/characters/{character_id}",
        headers=outsider["headers"],
    )
    missing = await client.delete(
        f"{CAMPAIGNS_URL}/999999/characters/{character_id}",
        headers=outsider["headers"],
    )

    assert existing.status_code == missing.status_code == 404, existing.text
    assert existing.json() == missing.json()
    assert existing.json()["error"]["code"] == "campaign_not_found"
