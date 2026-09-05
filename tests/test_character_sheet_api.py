"""GET /characters/{id}/sheet and its DM variant (US-15, DND-103).

The endpoint exists so the printable sheet does not have to download the whole
catalogue and filter class features by level in the browser — filtering by
level is a 5e rule, and rule 3 keeps those on the server.
"""

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.auth.security import create_access_token
from tests.conftest import seed_content

CHARACTERS_URL = "/api/v1/characters"
CAMPAIGNS_URL = "/api/v1/campaigns"

ABILITY_SCORES = {"str": 16, "dex": 14, "con": 12, "int": 10, "wis": 15, "cha": 8}


def _content_pack() -> dict:
    return {
        "races": [
            {
                "slug": "halfling",
                "name": "Полурослик",
                "data": {
                    "traits": [{"name": "Везучий", "description": "Перебрасывает единицы."}],
                    "languages": ["Общий", "Язык полуросликов"],
                },
            }
        ],
        "classes": [
            {
                "slug": "barbarian",
                "name": "Варвар",
                "hit_die": 12,
                "primary_ability": "strength",
                "data": {
                    "armor_proficiencies": ["Лёгкие доспехи", "Средние доспехи", "Щиты"],
                    "weapon_proficiencies": ["Простое оружие", "Воинское оружие"],
                },
                "levels": [
                    {
                        "level": 1,
                        "features": {
                            "items": [
                                {"name": "Ярость", "description": "Входит в ярость."},
                                {"name": "Защита без доспехов", "description": "КД без брони."},
                            ]
                        },
                    },
                    {
                        "level": 2,
                        "features": {
                            "items": [{"name": "Безрассудная атака", "description": "Риск."}]
                        },
                    },
                    {
                        "level": 3,
                        "features": {"items": [{"name": "Путь дикости", "description": "Путь."}]},
                    },
                ],
                "subclasses": [
                    {
                        "slug": "berserker",
                        "name": "Берсерк",
                        "unlock_level": 3,
                        "data": {"features": [{"name": "Бешенство", "description": "Ярость."}]},
                    }
                ],
            },
            {
                "slug": "wizard",
                "name": "Волшебник",
                "hit_die": 6,
                "primary_ability": "intelligence",
                "data": {"spellcasting_ability": "int"},
                "levels": [{"level": 1, "features": {}, "spell_slots": {"1": 2}}],
            },
        ],
        "spells": [
            {
                "slug": "fire-bolt",
                "name": "Огненный снаряд",
                "level": 0,
                "school": "Воплощение",
                "casting_time": "1 действие",
                "range": "36 метров",
                "components": "В, С",
                "duration": "Мгновенная",
                "classes": ["wizard"],
            }
        ],
        "items": [
            {
                "slug": "greatclub",
                "name": "Огромная дубина",
                "type": "weapon",
                "rarity": "обычный",
                "description": "Тяжёлая.",
                "weight": "4.5",
            },
            {
                "slug": "rope",
                "name": "Верёвка",
                "type": "gear",
                "rarity": "обычный",
                "description": "Пеньковая.",
            },
        ],
        "backgrounds": [
            {
                "slug": "criminal",
                "name": "Преступник",
                "data": {
                    "feature": {"name": "Преступные связи", "description": "Знает нужных людей."},
                    "tool_proficiencies": ["Воровские инструменты"],
                },
            }
        ],
    }


async def _login(client: AsyncClient, db_session: AsyncSession, email: str) -> dict[str, str]:
    user = User(email=email, display_name="Тест", email_verified=True)
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


async def _setup(
    client: AsyncClient, db_session: AsyncSession, email: str, *, class_slug: str = "barbarian"
) -> dict:
    report = await seed_content(_content_pack())
    assert report.errors == [], report.errors
    headers = await _login(client, db_session, email)

    races = (await client.get("/api/v1/content/races", headers=headers)).json()
    classes = (await client.get("/api/v1/content/classes", headers=headers)).json()
    backgrounds = (await client.get("/api/v1/content/backgrounds", headers=headers)).json()
    item_rows = (await client.get("/api/v1/content/items", headers=headers)).json()
    items = {row["slug"]: row["id"] for row in item_rows}
    klass = next(c for c in classes if c["slug"] == class_slug)

    created = await client.post(
        CHARACTERS_URL,
        json={
            "name": "Магнар",
            "race_id": races[0]["id"],
            "class_id": klass["id"],
            "background_id": backgrounds[0]["id"],
            "alignment": "chaotic-neutral",
            "ability_scores": ABILITY_SCORES,
            "hp_max": 12,
            "speed": 25,
            "proficiencies": {"skills": ["athletics"], "saves": ["str", "con"]},
        },
        headers=headers,
    )
    assert created.status_code == 201, created.text
    return {
        "headers": headers,
        "character_id": created.json()["id"],
        "class_id": klass["id"],
        "items": items,
    }


async def _sheet(client: AsyncClient, setup: dict) -> dict:
    response = await client.get(
        f"{CHARACTERS_URL}/{setup['character_id']}/sheet", headers=setup["headers"]
    )
    assert response.status_code == 200, response.text
    return response.json()


async def test_sheet_resolves_reference_names(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _setup(client, db_session, "sheet-names@example.com")

    content = (await _sheet(client, setup))["content"]

    assert content["race_name"] == "Полурослик"
    assert content["class_name"] == "Варвар"
    assert content["background_name"] == "Преступник"
    assert content["hit_die"] == 12


async def test_sheet_carries_the_whole_character(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    # The sheet is a superset of the detail response — the layout needs both
    # the stored columns and the computed block.
    setup = await _setup(client, db_session, "sheet-superset@example.com")

    body = await _sheet(client, setup)

    assert body["name"] == "Магнар"
    assert body["computed"]["prof_bonus"] == 2
    assert "inventory" in body and "spells" in body
    assert body["inspiration"] is False


async def test_class_features_stop_at_the_current_level(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    # A level 1 barbarian has not unlocked Reckless Attack. Filtering by level
    # is a 5e rule, so it happens here and not in the browser.
    setup = await _setup(client, db_session, "sheet-features@example.com")

    content = (await _sheet(client, setup))["content"]

    names = [feature["name"] for feature in content["class_features"]]
    assert "Ярость" in names
    assert "Защита без доспехов" in names
    assert "Безрассудная атака" not in names
    assert "Путь дикости" not in names
    assert all(feature["level"] == 1 for feature in content["class_features"])


async def test_race_traits_and_background_feature_are_resolved(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _setup(client, db_session, "sheet-traits@example.com")

    content = (await _sheet(client, setup))["content"]

    assert [trait["name"] for trait in content["race_traits"]] == ["Везучий"]
    assert content["background_feature"]["name"] == "Преступные связи"


async def test_proficiency_lists_fall_back_to_class_and_background(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _setup(client, db_session, "sheet-profs@example.com")

    content = (await _sheet(client, setup))["content"]

    assert "Щиты" in content["armor_proficiencies"]
    assert "Воинское оружие" in content["weapon_proficiencies"]
    assert "Воровские инструменты" in content["tool_proficiencies"]
    assert "Общий" in content["languages"]


async def test_sheet_carries_cards_only_for_what_the_character_has(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _setup(client, db_session, "sheet-items@example.com")
    await client.post(
        f"{CHARACTERS_URL}/{setup['character_id']}/inventory",
        json={"item_id": setup["items"]["greatclub"]},
        headers=setup["headers"],
    )
    await client.post(
        f"{CHARACTERS_URL}/{setup['character_id']}/inventory",
        json={"custom_name": "Долговая расписка"},
        headers=setup["headers"],
    )

    content = (await _sheet(client, setup))["content"]

    assert list(content["items"]) == [str(setup["items"]["greatclub"])]
    assert content["items"][str(setup["items"]["greatclub"])]["name"] == "Огромная дубина"
    # The other catalogue item is not carried, so it is not shipped.
    assert str(setup["items"]["rope"]) not in content["items"]


async def test_spellcasting_ability_is_null_for_a_non_caster(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _setup(client, db_session, "sheet-noncaster@example.com")

    content = (await _sheet(client, setup))["content"]

    assert content["spellcasting_ability"] is None
    assert content["spells"] == {}


async def test_spellcasting_ability_comes_from_the_class(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _setup(client, db_session, "sheet-caster@example.com", class_slug="wizard")

    content = (await _sheet(client, setup))["content"]

    assert content["spellcasting_ability"] == "int"


async def test_sheet_of_another_users_character_is_404(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner = await _setup(client, db_session, "sheet-owner@example.com")
    intruder = await _login(client, db_session, "sheet-intruder@example.com")

    response = await client.get(
        f"{CHARACTERS_URL}/{owner['character_id']}/sheet", headers=intruder
    )

    assert response.status_code == 404, response.text
    assert response.json()["error"]["code"] == "character_not_found"


async def test_sheet_requires_authentication(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _setup(client, db_session, "sheet-anon@example.com")

    response = await client.get(f"{CHARACTERS_URL}/{setup['character_id']}/sheet")

    assert response.status_code == 401, response.text


async def test_dm_can_read_the_sheet_of_a_joined_character(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player = await _setup(client, db_session, "sheet-player@example.com")
    dm_headers = await _login(client, db_session, "sheet-dm@example.com")
    campaign = await client.post(
        CAMPAIGNS_URL, json={"name": "Проклятие Страда"}, headers=dm_headers
    )
    campaign_id = campaign.json()["id"]
    invite = campaign.json()["invite_code"]
    joined = await client.post(
        f"{CAMPAIGNS_URL}/join",
        json={"invite_code": invite, "character_id": player["character_id"]},
        headers=player["headers"],
    )
    assert joined.status_code in (200, 201), joined.text

    response = await client.get(
        f"{CAMPAIGNS_URL}/{campaign_id}/characters/{player['character_id']}/sheet",
        headers=dm_headers,
    )

    assert response.status_code == 200, response.text
    assert response.json()["content"]["class_name"] == "Варвар"


async def test_sheet_of_a_campaign_run_by_someone_else_is_404(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    # Not 403: the security audit removed campaign_dm_access_required because a
    # 403 told any logged-in user which campaign ids exist.
    player = await _setup(client, db_session, "sheet-p2@example.com")
    dm_headers = await _login(client, db_session, "sheet-dm2@example.com")
    campaign = await client.post(CAMPAIGNS_URL, json={"name": "Чужая"}, headers=dm_headers)
    campaign_id = campaign.json()["id"]
    outsider = await _login(client, db_session, "sheet-outsider@example.com")

    response = await client.get(
        f"{CAMPAIGNS_URL}/{campaign_id}/characters/{player['character_id']}/sheet",
        headers=outsider,
    )

    assert response.status_code == 404, response.text


async def test_sheet_of_a_character_not_in_the_campaign_is_404(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player = await _setup(client, db_session, "sheet-p3@example.com")
    dm_headers = await _login(client, db_session, "sheet-dm3@example.com")
    campaign = await client.post(CAMPAIGNS_URL, json={"name": "Пустая"}, headers=dm_headers)

    response = await client.get(
        f"{CAMPAIGNS_URL}/{campaign.json()['id']}/characters/{player['character_id']}/sheet",
        headers=dm_headers,
    )

    assert response.status_code == 404, response.text
    assert response.json()["error"]["code"] == "campaign_character_not_found"
