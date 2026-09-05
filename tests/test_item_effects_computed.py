"""Equipped items and active effects reaching `computed` (US-13, DND-096).

The engine's arithmetic is covered by tests/test_rules_5e_effects.py. These
tests are about the wiring: which rows become modifiers, when, and what the
sheet reports about them.
"""

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.auth.security import create_access_token
from app.characters import rules_5e
from tests.conftest import seed_content

CHARACTERS_URL = "/api/v1/characters"
ITEMS_URL = "/api/v1/content/items"

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
        "items": [
            {
                "slug": "headband-of-intellect",
                "name": "Головной убор интеллекта",
                "type": "magic",
                "rarity": "необычный",
                "description": "Интеллект носителя становится 19.",
                "data": {"effects": [{"target": "ability.int", "op": "set", "value": 19}]},
            },
            {
                "slug": "ring-of-protection",
                "name": "Кольцо защиты",
                "type": "magic",
                "rarity": "редкий",
                "description": "+1 к КД.",
                "data": {
                    "effects": [
                        {
                            "target": "ac",
                            "op": "bonus",
                            "value": 1,
                            "stack_group": "ring-of-protection",
                        }
                    ]
                },
            },
            {
                "slug": "ring-of-protection-copy",
                "name": "Второе кольцо защиты",
                "type": "magic",
                "rarity": "редкий",
                "description": "+1 к КД, не складывается.",
                "data": {
                    "effects": [
                        {
                            "target": "ac",
                            "op": "bonus",
                            "value": 1,
                            "stack_group": "ring-of-protection",
                        }
                    ]
                },
            },
            {
                "slug": "scale-mail",
                "name": "Чешуйчатый доспех",
                "type": "armor",
                "rarity": "обычный",
                "description": "14 + модификатор Ловкости (макс. 2), помеха скрытности.",
                "data": {
                    "effects": [
                        {"target": "ac", "op": "armor_base", "value": 14, "dex_cap": 2},
                        {"target": "skill.stealth", "op": "disadvantage"},
                    ]
                },
            },
            {
                "slug": "plain-rope",
                "name": "Верёвка",
                "type": "gear",
                "rarity": "обычный",
                "description": "Просто верёвка.",
            },
        ],
        "backgrounds": [{"slug": "sage", "name": "Мудрец"}],
    }


async def _register_and_login(client: AsyncClient, db_session: AsyncSession, email: str) -> str:
    user = User(email=email, display_name="Тест", email_verified=True)
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return create_access_token(user.id)


async def _setup(client: AsyncClient, db_session: AsyncSession, email: str) -> dict:
    report = await seed_content(_content_pack())
    assert report.errors == [], report.errors
    headers = {"Authorization": f"Bearer {await _register_and_login(client, db_session, email)}"}

    races = (await client.get("/api/v1/content/races", headers=headers)).json()
    classes = (await client.get("/api/v1/content/classes", headers=headers)).json()
    backgrounds = (await client.get("/api/v1/content/backgrounds", headers=headers)).json()
    items = (await client.get(ITEMS_URL, headers=headers)).json()

    created = await client.post(
        CHARACTERS_URL,
        json={
            "name": "Ари",
            "race_id": races[0]["id"],
            "class_id": classes[0]["id"],
            "background_id": backgrounds[0]["id"],
            "alignment": "chaotic-good",
            "ability_scores": ABILITY_SCORES,
            "hp_max": 8,
            "speed": 30,
            "proficiencies": {"skills": ["perception", "stealth"]},
        },
        headers=headers,
    )
    assert created.status_code == 201, created.text
    return {
        "headers": headers,
        "character_id": created.json()["id"],
        "items": {item["slug"]: item["id"] for item in items},
    }


async def _add_item(client: AsyncClient, setup: dict, slug: str, **extra: object) -> int:
    response = await client.post(
        f"{CHARACTERS_URL}/{setup['character_id']}/inventory",
        json={"item_id": setup["items"][slug], **extra},
        headers=setup["headers"],
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def _computed(client: AsyncClient, setup: dict) -> dict:
    response = await client.get(
        f"{CHARACTERS_URL}/{setup['character_id']}", headers=setup["headers"]
    )
    assert response.status_code == 200, response.text
    return response.json()["computed"]


async def test_equipped_item_changes_computed(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _setup(client, db_session, "eq-on@example.com")
    await _add_item(client, setup, "ring-of-protection", equipped=True)

    computed = await _computed(client, setup)

    assert computed["ac"] == rules_5e.base_armor_class(ABILITY_SCORES["dex"]) + 1


async def test_unequipped_item_does_nothing(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _setup(client, db_session, "eq-off@example.com")
    await _add_item(client, setup, "ring-of-protection", equipped=False)

    computed = await _computed(client, setup)

    assert computed["ac"] == rules_5e.base_armor_class(ABILITY_SCORES["dex"])


async def test_equipping_through_patch_changes_computed(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _setup(client, db_session, "eq-patch@example.com")
    entry_id = await _add_item(client, setup, "ring-of-protection", equipped=False)
    before = await _computed(client, setup)

    await client.patch(
        f"{CHARACTERS_URL}/{setup['character_id']}/inventory/{entry_id}",
        json={"equipped": True},
        headers=setup["headers"],
    )
    after = await _computed(client, setup)

    assert after["ac"] == before["ac"] + 1


async def test_quantity_does_not_multiply_an_item_effect(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _setup(client, db_session, "eq-qty@example.com")
    await _add_item(client, setup, "ring-of-protection", equipped=True, quantity=3)

    computed = await _computed(client, setup)

    assert computed["ac"] == rules_5e.base_armor_class(ABILITY_SCORES["dex"]) + 1


async def test_custom_inventory_row_has_no_effects(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _setup(client, db_session, "eq-custom@example.com")
    await client.post(
        f"{CHARACTERS_URL}/{setup['character_id']}/inventory",
        json={"custom_name": "Кольцо от мастера на словах", "equipped": True},
        headers=setup["headers"],
    )

    computed = await _computed(client, setup)

    assert computed["ac"] == rules_5e.base_armor_class(ABILITY_SCORES["dex"])
    assert computed["active_effects"] == []


async def test_headband_changes_computed_but_not_the_column(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _setup(client, db_session, "eq-headband@example.com")
    await _add_item(client, setup, "headband-of-intellect", equipped=True)

    response = await client.get(
        f"{CHARACTERS_URL}/{setup['character_id']}", headers=setup["headers"]
    )
    body = response.json()

    assert body["computed"]["effective_ability_scores"]["int"] == 19
    assert body["computed"]["base_ability_scores"]["int"] == ABILITY_SCORES["int"]
    # The stored column is the base and must stay untouched — that invariant is
    # what makes level-up deltas reversible.
    assert body["ability_scores"]["int"] == ABILITY_SCORES["int"]


async def test_same_stack_group_does_not_stack_across_items(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _setup(client, db_session, "eq-stack@example.com")
    await _add_item(client, setup, "ring-of-protection", equipped=True)
    await _add_item(client, setup, "ring-of-protection-copy", equipped=True)

    computed = await _computed(client, setup)

    assert computed["ac"] == rules_5e.base_armor_class(ABILITY_SCORES["dex"]) + 1


async def test_armour_sets_ac_and_reports_disadvantage(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _setup(client, db_session, "eq-armour@example.com")
    await _add_item(client, setup, "scale-mail", equipped=True)

    computed = await _computed(client, setup)

    # 14 + min(dex modifier, 2) = 14 + 2
    assert computed["ac"] == 16
    assert computed["advantage"]["skill.stealth"] == "disadvantage"


async def test_active_effects_and_sources_name_their_origin(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _setup(client, db_session, "eq-sources@example.com")
    await _add_item(client, setup, "headband-of-intellect", equipped=True)

    computed = await _computed(client, setup)

    names = {effect["name"] for effect in computed["active_effects"]}
    assert "Головной убор интеллекта" in names
    sources = computed["effect_sources"]["ability.int"]
    assert sources[0]["name"] == "Головной убор интеллекта"
    assert sources[0]["applied"] is True


async def test_inactive_temporary_effect_is_not_applied(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _setup(client, db_session, "eq-inactive@example.com")
    await client.post(
        f"{CHARACTERS_URL}/{setup['character_id']}/effects",
        json={
            "name": "Выключенный баф",
            "is_active": False,
            "modifiers": [{"target": "ac", "op": "bonus", "value": 5}],
        },
        headers=setup["headers"],
    )

    computed = await _computed(client, setup)

    assert computed["ac"] == rules_5e.base_armor_class(ABILITY_SCORES["dex"])


async def test_active_temporary_effect_is_applied(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _setup(client, db_session, "eq-active@example.com")
    await client.post(
        f"{CHARACTERS_URL}/{setup['character_id']}/effects",
        json={
            "name": "Щит веры",
            "modifiers": [{"target": "ac", "op": "bonus", "value": 2}],
        },
        headers=setup["headers"],
    )

    computed = await _computed(client, setup)

    assert computed["ac"] == rules_5e.base_armor_class(ABILITY_SCORES["dex"]) + 2


async def test_character_without_effects_keeps_its_previous_numbers(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    # Backward-compatibility guard: the fields kept their names and must keep
    # their values for a character with nothing equipped and nothing active.
    setup = await _setup(client, db_session, "eq-plain@example.com")

    computed = await _computed(client, setup)

    assert computed["ac"] == rules_5e.base_armor_class(ABILITY_SCORES["dex"])
    assert computed["initiative"] == rules_5e.ability_modifier(ABILITY_SCORES["dex"])
    assert computed["passive_perception"] == rules_5e.passive_perception(
        ABILITY_SCORES["wis"], True, rules_5e.proficiency_bonus(1)
    )
    assert computed["effective_ability_scores"] == computed["base_ability_scores"]
    assert computed["advantage"] == {}
    assert computed["damage_modifiers"] == {}
    assert computed["active_effects"] == []
    assert computed["effect_sources"] == {}


async def test_level_up_hp_uses_the_base_constitution(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    # A belt that sets Constitution to 19 shows on the sheet but must not pay
    # out hit points on level-up: the delta has to stay reversible from the
    # stored columns alone.
    setup = await _setup(client, db_session, "eq-levelhp@example.com")
    await client.post(
        f"{CHARACTERS_URL}/{setup['character_id']}/effects",
        json={
            "name": "Пояс здоровья",
            "modifiers": [{"target": "ability.con", "op": "set", "value": 19}],
        },
        headers=setup["headers"],
    )
    await client.patch(
        f"{CHARACTERS_URL}/{setup['character_id']}",
        json={"xp": rules_5e.xp_threshold(2)},
        headers=setup["headers"],
    )

    before = await client.get(
        f"{CHARACTERS_URL}/{setup['character_id']}", headers=setup["headers"]
    )
    hp_before = before.json()["hp_max"]

    response = await client.post(
        f"{CHARACTERS_URL}/{setup['character_id']}/level-up",
        json={"hp_method": "average"},
        headers=setup["headers"],
    )
    assert response.status_code == 200, response.text

    after = await client.get(
        f"{CHARACTERS_URL}/{setup['character_id']}", headers=setup["headers"]
    )
    expected_gain = rules_5e.average_hp_gain(
        6, rules_5e.ability_modifier(ABILITY_SCORES["con"])
    )
    assert after.json()["hp_max"] == hp_before + expected_gain


async def test_level_up_delta_says_nothing_about_effects(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _setup(client, db_session, "eq-delta@example.com")
    await _add_item(client, setup, "headband-of-intellect", equipped=True)
    await client.patch(
        f"{CHARACTERS_URL}/{setup['character_id']}",
        json={"xp": rules_5e.xp_threshold(2)},
        headers=setup["headers"],
    )

    response = await client.post(
        f"{CHARACTERS_URL}/{setup['character_id']}/level-up",
        json={"hp_method": "average"},
        headers=setup["headers"],
    )

    delta = response.json()["delta"]
    assert not [key for key in delta if "effect" in key]


async def test_level_up_then_rollback_restores_the_base_with_effects_equipped(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _setup(client, db_session, "eq-rollback@example.com")
    await _add_item(client, setup, "headband-of-intellect", equipped=True)
    await client.patch(
        f"{CHARACTERS_URL}/{setup['character_id']}",
        json={"xp": rules_5e.xp_threshold(2)},
        headers=setup["headers"],
    )
    before = (
        await client.get(f"{CHARACTERS_URL}/{setup['character_id']}", headers=setup["headers"])
    ).json()

    await client.post(
        f"{CHARACTERS_URL}/{setup['character_id']}/level-up",
        json={"hp_method": "average", "asi": {"int": 1}},
        headers=setup["headers"],
    )
    await client.post(
        f"{CHARACTERS_URL}/{setup['character_id']}/level-rollback", headers=setup["headers"]
    )

    after = (
        await client.get(f"{CHARACTERS_URL}/{setup['character_id']}", headers=setup["headers"])
    ).json()

    assert after["ability_scores"] == before["ability_scores"]
    assert after["hp_max"] == before["hp_max"]
    assert after["level"] == before["level"]
    assert after["speed"] == before["speed"]


async def test_asi_raises_the_base_not_the_effective_score(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    setup = await _setup(client, db_session, "eq-asi@example.com")
    await _add_item(client, setup, "headband-of-intellect", equipped=True)
    await client.patch(
        f"{CHARACTERS_URL}/{setup['character_id']}",
        json={"xp": rules_5e.xp_threshold(2)},
        headers=setup["headers"],
    )

    await client.post(
        f"{CHARACTERS_URL}/{setup['character_id']}/level-up",
        json={"hp_method": "average", "asi": {"int": 1}},
        headers=setup["headers"],
    )

    body = (
        await client.get(f"{CHARACTERS_URL}/{setup['character_id']}", headers=setup["headers"])
    ).json()

    assert body["ability_scores"]["int"] == ABILITY_SCORES["int"] + 1
    # The headband still wins: 19 beats a base of 11.
    assert body["computed"]["effective_ability_scores"]["int"] == 19
