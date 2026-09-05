"""Unit tests for the effect resolution engine (ARCHITECTURE.md §4.6).

Pure functions only — no database, no service. Rule 9 of CLAUDE.md makes these
mandatory: every resolution rule below is a D&D 5e rule, and rules_5e is the
only place allowed to hold one.
"""

import itertools

from app.characters import rules_5e
from app.characters.rules_5e import Modifier

BASE_CHARACTER = {
    "ability_scores": {"str": 16, "dex": 14, "con": 12, "int": 10, "wis": 15, "cha": 8},
    "level": 3,
    "speed": 30,
    "hp_max": 24,
    "ac_override": None,
    "proficiencies": {"skills": ["perception", "stealth"], "saves": ["str", "con"]},
}


def _value(base: int, modifiers: list[Modifier], **kwargs: object) -> int:
    return rules_5e.resolve_numeric(base, modifiers, **kwargs)[0]  # type: ignore[arg-type]


def _reason(modifier: Modifier) -> str | None:
    return rules_5e.resolve_numeric(10, [modifier])[1][0].ignored_reason


# --- bonuses ---------------------------------------------------------------


def test_bonuses_from_different_sources_sum() -> None:
    assert _value(
        10, [Modifier("ac", "bonus", 1, source_id=1), Modifier("ac", "bonus", 2, source_id=2)]
    ) == 13


def test_same_stack_group_keeps_only_the_largest() -> None:
    assert _value(
        10,
        [
            Modifier("ac", "bonus", 1, stack_group="ring-of-protection", source_id=1),
            Modifier("ac", "bonus", 3, stack_group="ring-of-protection", source_id=2),
        ],
    ) == 13


def test_suppressed_bonus_says_why() -> None:
    _, trace = rules_5e.resolve_numeric(
        10,
        [
            Modifier("ac", "bonus", 1, stack_group="ring", source_id=1),
            Modifier("ac", "bonus", 3, stack_group="ring", source_id=2),
        ],
    )
    suppressed = [entry for entry in trace if not entry.applied]
    assert [entry.ignored_reason for entry in suppressed] == ["suppressed_by_stack_group"]


def test_empty_stack_group_always_stacks() -> None:
    assert _value(
        10, [Modifier("ac", "bonus", 1, source_id=1), Modifier("ac", "bonus", 1, source_id=2)]
    ) == 12


def test_negative_bonus_is_how_a_debuff_is_written() -> None:
    # `set` cannot lower a value (see test_set_loses_to_a_higher_base), so a
    # curse that weakens the character is authored as a negative bonus.
    assert _value(16, [Modifier("ability.str", "bonus", -4)]) == 12


# --- set -------------------------------------------------------------------


def test_set_replaces_a_lower_base() -> None:
    assert _value(10, [Modifier("ability.int", "set", 19)]) == 19


def test_set_loses_to_a_higher_base() -> None:
    # RAW: a Headband of Intellect does nothing for a wizard already above 19.
    assert _value(20, [Modifier("ability.int", "set", 19)]) == 20


def test_highest_set_wins() -> None:
    assert _value(
        10,
        [
            Modifier("ability.int", "set", 19, source_id=1),
            Modifier("ability.int", "set", 17, source_id=2),
        ],
    ) == 19


def test_set_does_not_suppress_a_bonus() -> None:
    assert _value(
        10,
        [
            Modifier("ability.int", "set", 19, source_id=1),
            Modifier("ability.int", "bonus", 1, source_id=2),
        ],
    ) == 20


# --- armour ----------------------------------------------------------------
# The shipped content pack stores AC as free text ("12 + модификатор Ловкости
# (макс. 2)"), so these four cases are exactly what DND-097 has to translate.


def test_light_armour_adds_the_full_dex_modifier() -> None:
    assert _value(12, [Modifier("ac", "armor_base", 11)], dex_modifier=3) == 14


def test_medium_armour_caps_the_dex_modifier() -> None:
    assert _value(12, [Modifier("ac", "armor_base", 12, dex_cap=2)], dex_modifier=3) == 14


def test_heavy_armour_ignores_dex_through_a_zero_cap() -> None:
    assert _value(12, [Modifier("ac", "armor_base", 16, dex_cap=0)], dex_modifier=3) == 16


def test_shield_stacks_on_top_of_armour() -> None:
    assert _value(
        12,
        [
            Modifier("ac", "armor_base", 14, dex_cap=2, source_id=1),
            Modifier("ac", "bonus", 2, source_id=2),
        ],
        dex_modifier=3,
    ) == 18


def test_better_armour_wins_when_two_are_worn() -> None:
    assert _value(
        12,
        [
            Modifier("ac", "armor_base", 11, source_id=1),
            Modifier("ac", "armor_base", 16, dex_cap=0, source_id=2),
        ],
        dex_modifier=1,
    ) == 16


def test_manual_ac_beats_armour_effects() -> None:
    # BR §4.1: the player is the source of truth for their own sheet.
    assert _value(18, [Modifier("ac", "armor_base", 11)], dex_modifier=3, base_is_manual=True) == 18


def test_manual_ac_still_takes_bonuses() -> None:
    assert _value(18, [Modifier("ac", "bonus", 2)], base_is_manual=True) == 20


def test_manual_ac_says_why_the_armour_was_ignored() -> None:
    _, trace = rules_5e.resolve_numeric(
        18, [Modifier("ac", "armor_base", 11)], base_is_manual=True
    )
    assert [entry.ignored_reason for entry in trace] == ["manual_ac_override"]


# --- malformed modifiers ---------------------------------------------------


def test_unknown_target_is_ignored_with_a_reason() -> None:
    assert _reason(Modifier("ability.luck", "bonus", 1)) == "unknown_target"


def test_valued_op_without_a_value_is_rejected() -> None:
    assert _reason(Modifier("ac", "bonus", None)) == "value_required"


def test_valueless_op_with_a_value_is_rejected() -> None:
    assert _reason(Modifier("attack", "advantage", 2)) == "value_forbidden"


def test_dex_cap_outside_armor_base_is_rejected() -> None:
    assert _reason(Modifier("ac", "bonus", 2, dex_cap=2)) == "dex_cap_requires_armor_base"


def test_armor_base_outside_ac_is_rejected() -> None:
    assert _reason(Modifier("speed", "armor_base", 40)) == "not_applicable"


def test_damage_op_on_a_numeric_target_is_rejected() -> None:
    assert _reason(Modifier("ac", "resistance")) == "not_applicable"


def test_every_reason_the_engine_emits_is_declared() -> None:
    # The frontend renders each reason from the dictionary; an undeclared one
    # would surface as a missing translation key.
    emitted = {
        _reason(Modifier("ability.luck", "bonus", 1)),
        _reason(Modifier("ac", "bonus", None)),
        _reason(Modifier("attack", "advantage", 2)),
        _reason(Modifier("ac", "bonus", 2, dex_cap=2)),
        _reason(Modifier("speed", "armor_base", 40)),
    }
    assert emitted <= rules_5e.IGNORE_REASONS


# --- clamps ----------------------------------------------------------------


def test_ability_score_is_clamped_to_one() -> None:
    assert _value(3, [Modifier("ability.str", "bonus", -10)], bounds=(1, 30)) == 1


def test_ability_score_is_clamped_to_thirty() -> None:
    assert _value(20, [Modifier("ability.str", "bonus", 30)], bounds=(1, 30)) == 30


def test_speed_is_never_negative() -> None:
    assert _value(30, [Modifier("speed", "bonus", -50)], bounds=(0, None)) == 0


def test_hp_max_is_never_below_one() -> None:
    assert _value(10, [Modifier("hp_max", "bonus", -50)], bounds=(1, None)) == 1


# --- rolls -----------------------------------------------------------------


def test_advantage_alone() -> None:
    assert rules_5e.resolve_roll_state([Modifier("attack", "advantage")]) == "advantage"


def test_disadvantage_alone() -> None:
    assert rules_5e.resolve_roll_state([Modifier("attack", "disadvantage")]) == "disadvantage"


def test_advantage_and_disadvantage_cancel() -> None:
    assert (
        rules_5e.resolve_roll_state(
            [Modifier("attack", "advantage"), Modifier("attack", "disadvantage")]
        )
        == "normal"
    )


def test_duplicate_advantage_does_not_compound() -> None:
    assert (
        rules_5e.resolve_roll_state(
            [Modifier("attack", "advantage"), Modifier("attack", "advantage")]
        )
        == "advantage"
    )


def test_two_disadvantages_still_only_cancel_one_advantage() -> None:
    # PHB: sources do not count up; any of each means they cancel.
    assert (
        rules_5e.resolve_roll_state(
            [
                Modifier("attack", "disadvantage"),
                Modifier("attack", "disadvantage"),
                Modifier("attack", "advantage"),
            ]
        )
        == "normal"
    )


# --- damage ----------------------------------------------------------------


def test_immunity_beats_resistance_and_vulnerability() -> None:
    assert (
        rules_5e.resolve_damage_state(
            [
                Modifier("damage.fire", "resistance"),
                Modifier("damage.fire", "vulnerability"),
                Modifier("damage.fire", "immunity"),
            ]
        )
        == "immunity"
    )


def test_resistance_and_vulnerability_cancel() -> None:
    assert (
        rules_5e.resolve_damage_state(
            [Modifier("damage.fire", "resistance"), Modifier("damage.fire", "vulnerability")]
        )
        is None
    )


def test_duplicate_resistance_does_not_double() -> None:
    assert (
        rules_5e.resolve_damage_state(
            [Modifier("damage.fire", "resistance"), Modifier("damage.fire", "resistance")]
        )
        == "resistance"
    )


# --- full resolution -------------------------------------------------------


def test_no_modifiers_reproduces_the_plain_calculation() -> None:
    resolution = rules_5e.resolve_effects(modifiers=[], **BASE_CHARACTER)  # type: ignore[arg-type]

    assert resolution.ac == rules_5e.base_armor_class(14)
    assert resolution.initiative == rules_5e.ability_modifier(14)
    assert resolution.passive_perception == rules_5e.passive_perception(
        15, True, rules_5e.proficiency_bonus(3)
    )
    assert resolution.advantage == {}
    assert resolution.damage == {}


def test_ability_effect_flows_into_everything_derived_from_it() -> None:
    resolution = rules_5e.resolve_effects(
        modifiers=[Modifier("ability.dex", "set", 20)], **BASE_CHARACTER  # type: ignore[arg-type]
    )

    assert resolution.ability_scores["dex"] == 20
    assert resolution.ac == rules_5e.base_armor_class(20)
    assert resolution.initiative == rules_5e.ability_modifier(20)
    expected_stealth = rules_5e.ability_modifier(20) + rules_5e.proficiency_bonus(3)
    assert resolution.skills["stealth"] == expected_stealth


def test_perception_bonus_reaches_passive_perception() -> None:
    # Passive perception is 10 + the Perception *check* modifier, so a bonus to
    # the skill has to move it. Computing it from the raw ability score instead
    # would silently drop this.
    plain = rules_5e.resolve_effects(modifiers=[], **BASE_CHARACTER)  # type: ignore[arg-type]
    cloaked = rules_5e.resolve_effects(
        modifiers=[Modifier("skill.perception", "bonus", 2)], **BASE_CHARACTER  # type: ignore[arg-type]
    )

    assert cloaked.passive_perception == plain.passive_perception + 2


def test_perception_advantage_is_worth_five_passive() -> None:
    plain = rules_5e.resolve_effects(modifiers=[], **BASE_CHARACTER)  # type: ignore[arg-type]
    keen = rules_5e.resolve_effects(
        modifiers=[Modifier("skill.perception", "advantage")], **BASE_CHARACTER  # type: ignore[arg-type]
    )

    assert keen.passive_perception == plain.passive_perception + 5


def test_perception_disadvantage_subtracts_five_passive() -> None:
    plain = rules_5e.resolve_effects(modifiers=[], **BASE_CHARACTER)  # type: ignore[arg-type]
    dulled = rules_5e.resolve_effects(
        modifiers=[Modifier("skill.perception", "disadvantage")], **BASE_CHARACTER  # type: ignore[arg-type]
    )

    assert dulled.passive_perception == plain.passive_perception - 5


def test_scale_mail_sets_ac_and_hampers_stealth() -> None:
    resolution = rules_5e.resolve_effects(
        modifiers=[
            Modifier("ac", "armor_base", 14, dex_cap=2),
            Modifier("skill.stealth", "disadvantage"),
        ],
        **BASE_CHARACTER,  # type: ignore[arg-type]
    )

    assert resolution.ac == 16
    assert resolution.advantage["skill.stealth"] == "disadvantage"


def test_manual_ac_wins_in_full_resolution() -> None:
    resolution = rules_5e.resolve_effects(
        modifiers=[Modifier("ac", "armor_base", 11)],
        **{**BASE_CHARACTER, "ac_override": 18},  # type: ignore[arg-type]
    )

    assert resolution.ac == 18


def test_resolution_does_not_depend_on_modifier_order() -> None:
    # The service reads item and effect rows in whatever order the database
    # returns them; `computed` must not change between two identical requests.
    modifiers = [
        Modifier("ability.int", "set", 19, source_id=1),
        Modifier("ability.int", "bonus", 1, source_id=2),
        Modifier("ac", "armor_base", 14, dex_cap=2, source_id=3),
        Modifier("ac", "bonus", 2, source_id=4),
    ]

    outcomes = {
        (
            resolution.ac,
            resolution.ability_scores["int"],
            resolution.initiative,
            resolution.passive_perception,
        )
        for order in itertools.permutations(modifiers)
        for resolution in [rules_5e.resolve_effects(modifiers=list(order), **BASE_CHARACTER)]  # type: ignore[arg-type]
    }

    assert len(outcomes) == 1


def test_trace_records_every_modifier_it_was_given() -> None:
    resolution = rules_5e.resolve_effects(
        modifiers=[
            Modifier("ability.int", "set", 19, source_id=1),
            Modifier("ability.luck", "bonus", 1, source_id=2),
        ],
        **BASE_CHARACTER,  # type: ignore[arg-type]
    )

    reasons = {entry.modifier.target: entry.ignored_reason for entry in resolution.trace}
    assert reasons["ability.int"] is None
    assert reasons["ability.luck"] == "unknown_target"
