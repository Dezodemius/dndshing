"""The shipped pack's armour, resolved through the engine (US-13, DND-097).

Reads content/content-pack.json directly and checks the AC each armour
produces against the PHB table. Without this the effects vocabulary would be
correct in the abstract while the 336 items players actually own gave nothing.

No database and no service: the pack is a file and rules_5e is pure, so a
failure here points at the data or the engine and nowhere else.
"""

import json
from pathlib import Path

import pytest

from app.characters import rules_5e

PACK_PATH = Path(__file__).resolve().parents[1] / "content" / "content-pack.json"


def _items() -> dict[str, dict]:
    pack = json.loads(PACK_PATH.read_text(encoding="utf-8"))
    return {item["slug"]: item for item in pack["items"]}


def _modifiers(slugs: list[str], items: dict[str, dict]) -> list[rules_5e.Modifier]:
    modifiers: list[rules_5e.Modifier] = []
    for source_id, slug in enumerate(slugs):
        effects = (items[slug].get("data") or {}).get("effects") or []
        for order, effect in enumerate(effects):
            modifiers.append(
                rules_5e.Modifier(
                    target=effect["target"],
                    op=effect["op"],
                    value=effect.get("value"),
                    dex_cap=effect.get("dex_cap"),
                    stack_group=effect.get("stack_group"),
                    source_kind="item",
                    source_id=source_id,
                    source_name=slug,
                    order=order,
                )
            )
    return modifiers


def _resolve(slugs: list[str], dexterity: int) -> rules_5e.EffectResolution:
    return rules_5e.resolve_effects(
        ability_scores={"str": 10, "dex": dexterity, "con": 10, "int": 10, "wis": 10, "cha": 10},
        level=1,
        speed=30,
        hp_max=10,
        ac_override=None,
        proficiencies={},
        modifiers=_modifiers(slugs, _items()),
    )


# (slugs, dexterity score, AC from the PHB armour table)
@pytest.mark.parametrize(
    ("slugs", "dexterity", "expected_ac"),
    [
        # Light: the full Dexterity modifier applies.
        (["leather-armor"], 10, 11),
        (["leather-armor"], 18, 15),
        (["padded-armor"], 18, 15),
        (["studded-leather"], 18, 16),
        # Medium: capped at +2, which is the case a naive conversion gets wrong.
        (["hide-armor"], 18, 14),
        (["chain-shirt"], 18, 15),
        (["scale-mail"], 18, 16),
        (["breastplate"], 18, 16),
        (["half-plate"], 18, 17),
        # ...and below the cap the modifier still applies in full.
        (["half-plate"], 12, 16),
        # Heavy: Dexterity does not apply at all — in either direction, which
        # is why these are `set` and not a cap of 0.
        (["ring-mail"], 18, 14),
        (["chain-mail"], 18, 16),
        (["splint-armor"], 18, 17),
        (["plate-armor"], 18, 18),
        (["plate-armor"], 6, 18),
        (["chain-mail"], 6, 16),
        # A shield adds on top of whatever is worn, and on its own.
        (["shield"], 10, 12),
        (["plate-armor", "shield"], 18, 20),
        (["leather-armor", "shield"], 18, 17),
    ],
)
def test_armour_matches_the_phb_table(slugs: list[str], dexterity: int, expected_ac: int) -> None:
    assert _resolve(slugs, dexterity).ac == expected_ac


def test_a_second_shield_does_not_stack() -> None:
    items = _items()
    modifiers = _modifiers(["shield"], items) + [
        rules_5e.Modifier(
            target="ac", op="bonus", value=2, stack_group="shield", source_kind="item", source_id=9
        )
    ]
    resolution = rules_5e.resolve_effects(
        ability_scores={"str": 10, "dex": 10, "con": 10, "int": 10, "wis": 10, "cha": 10},
        level=1,
        speed=30,
        hp_max=10,
        ac_override=None,
        proficiencies={},
        modifiers=modifiers,
    )

    assert resolution.ac == 12


NOISY_ARMOUR = [
    "padded-armor",
    "scale-mail",
    "half-plate",
    "ring-mail",
    "chain-mail",
    "splint-armor",
    "plate-armor",
]


@pytest.mark.parametrize("slug", NOISY_ARMOUR)
def test_noisy_armour_imposes_stealth_disadvantage(slug: str) -> None:
    assert _resolve([slug], 14).advantage.get("skill.stealth") == "disadvantage"


@pytest.mark.parametrize("slug", ["leather-armor", "studded-leather", "chain-shirt", "breastplate"])
def test_quiet_armour_leaves_stealth_alone(slug: str) -> None:
    assert "skill.stealth" not in _resolve([slug], 14).advantage


def test_every_marked_up_effect_is_one_the_engine_accepts() -> None:
    # A typo in the pack would otherwise show up as an item that silently does
    # nothing, months later, on someone's sheet.
    rejected: list[tuple[str, str | None]] = []
    for slug, item in _items().items():
        for effect in (item.get("data") or {}).get("effects") or []:
            modifier = rules_5e.Modifier(
                target=effect["target"],
                op=effect["op"],
                value=effect.get("value"),
                dex_cap=effect.get("dex_cap"),
                stack_group=effect.get("stack_group"),
            )
            reason = rules_5e.modifier_shape_error(modifier)
            if reason is not None:
                rejected.append((slug, reason))

    assert rejected == []


def test_heavy_armour_is_expressed_as_a_set() -> None:
    # Not armor_base with dex_cap 0: the cap goes through min(), so a negative
    # Dexterity modifier would still reduce the AC of plate.
    for slug in ("ring-mail", "chain-mail", "splint-armor", "plate-armor"):
        ac_effect = next(
            effect
            for effect in _items()[slug]["data"]["effects"]
            if effect["target"] == "ac"
        )
        assert ac_effect["op"] == "set", slug
        assert "dex_cap" not in ac_effect, slug


def test_prose_ac_survives_alongside_the_effects() -> None:
    # The item card renders data.ac as text; effects are a parallel
    # machine-readable view, not a replacement for it.
    scale_mail = _items()["scale-mail"]["data"]

    assert scale_mail["ac"] == "14 + модификатор Ловкости (макс. 2)"
    assert scale_mail["stealth_disadvantage"] is True
    assert scale_mail["effects"][0]["dex_cap"] == 2
