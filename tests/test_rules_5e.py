import pytest

from app.characters.rules_5e import (
    ABILITIES,
    SKILL_ABILITIES,
    ability_modifier,
    average_hp_gain,
    base_armor_class,
    initiative,
    passive_perception,
    proficiency_bonus,
    proficient_modifier,
    rolled_hp_gain,
    xp_threshold,
    xp_to_next_level,
)


@pytest.mark.parametrize(
    ("score", "modifier"),
    [
        (1, -5),
        (8, -1),
        (9, -1),
        (10, 0),
        (11, 0),
        (12, 1),
        (20, 5),
        (30, 10),
    ],
)
def test_ability_modifier(score, modifier):
    assert ability_modifier(score) == modifier


@pytest.mark.parametrize(
    ("level", "bonus"),
    [
        (1, 2),
        (4, 2),
        (5, 3),
        (8, 3),
        (9, 4),
        (12, 4),
        (13, 5),
        (16, 5),
        (17, 6),
        (20, 6),
    ],
)
def test_proficiency_bonus(level, bonus):
    assert proficiency_bonus(level) == bonus


def test_xp_threshold_level_1_is_zero():
    assert xp_threshold(1) == 0


def test_xp_threshold_level_20_matches_phb_table():
    assert xp_threshold(20) == 355000


def test_xp_threshold_matches_full_phb_table():
    expected = [
        0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
        85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000,
    ]
    assert [xp_threshold(level) for level in range(1, 21)] == expected


def test_xp_to_next_level_returns_remaining_xp():
    assert xp_to_next_level(1, 0) == 300
    assert xp_to_next_level(5, 6500) == 7500


def test_xp_to_next_level_returns_none_at_max_level():
    assert xp_to_next_level(20, 355000) is None


def test_initiative_equals_dexterity_modifier():
    assert initiative(14) == 2
    assert initiative(8) == -1


@pytest.mark.parametrize(
    ("wisdom_score", "proficient", "prof_bonus", "expected"),
    [
        (10, False, 2, 10),
        (10, True, 2, 12),
        (16, True, 3, 16),
        (1, False, 2, 5),
    ],
)
def test_passive_perception(wisdom_score, proficient, prof_bonus, expected):
    assert passive_perception(wisdom_score, proficient, prof_bonus) == expected


def test_base_armor_class_without_armor():
    assert base_armor_class(10) == 10
    assert base_armor_class(20) == 15
    assert base_armor_class(1) == 5


@pytest.mark.parametrize(
    ("hit_die", "con_modifier", "expected"),
    [
        (6, 2, 6),
        (8, 2, 7),
        (10, 0, 6),
        (12, -3, 4),
        (6, -3, 1),
    ],
)
def test_average_hp_gain(hit_die, con_modifier, expected):
    assert average_hp_gain(hit_die, con_modifier) == expected


@pytest.mark.parametrize(
    ("hit_die", "rolled", "con_modifier", "expected"),
    [
        (8, 1, 2, 3),
        (8, 8, 2, 10),
        (6, 1, -3, 1),
    ],
)
def test_rolled_hp_gain(hit_die, rolled, con_modifier, expected):
    assert rolled_hp_gain(hit_die, rolled, con_modifier) == expected


@pytest.mark.parametrize("rolled", [0, -1, 9])
def test_rolled_hp_gain_rejects_out_of_range_roll(rolled):
    with pytest.raises(ValueError):
        rolled_hp_gain(8, rolled, 0)


@pytest.mark.parametrize(
    ("ability_modifier_value", "proficient", "prof_bonus", "expected"),
    [
        (2, False, 2, 2),
        (2, True, 2, 4),
        (-1, True, 3, 2),
        (0, False, 3, 0),
    ],
)
def test_proficient_modifier(ability_modifier_value, proficient, prof_bonus, expected):
    assert proficient_modifier(ability_modifier_value, proficient, prof_bonus) == expected


def test_skill_abilities_cover_18_skills():
    assert len(SKILL_ABILITIES) == 18
    assert SKILL_ABILITIES["perception"] == "wis"
    assert SKILL_ABILITIES["athletics"] == "str"
    assert SKILL_ABILITIES["stealth"] == "dex"
    assert set(SKILL_ABILITIES.values()) <= set(ABILITIES)


def test_abilities_lists_the_six_scores():
    assert ABILITIES == ("str", "dex", "con", "int", "wis", "cha")
