"""Pure D&D 5e rule calculations. No I/O, no framework dependencies."""

XP_THRESHOLDS: dict[int, int] = {
    1: 0,
    2: 300,
    3: 900,
    4: 2700,
    5: 6500,
    6: 14000,
    7: 23000,
    8: 34000,
    9: 48000,
    10: 64000,
    11: 85000,
    12: 100000,
    13: 120000,
    14: 140000,
    15: 165000,
    16: 195000,
    17: 225000,
    18: 265000,
    19: 305000,
    20: 355000,
}

MAX_LEVEL = 20

ABILITIES: tuple[str, ...] = ("str", "dex", "con", "int", "wis", "cha")

SKILL_ABILITIES: dict[str, str] = {
    "acrobatics": "dex",
    "animal-handling": "wis",
    "arcana": "int",
    "athletics": "str",
    "deception": "cha",
    "history": "int",
    "insight": "wis",
    "intimidation": "cha",
    "investigation": "int",
    "medicine": "wis",
    "nature": "int",
    "perception": "wis",
    "performance": "cha",
    "persuasion": "cha",
    "religion": "int",
    "sleight-of-hand": "dex",
    "stealth": "dex",
    "survival": "wis",
}


def ability_modifier(score: int) -> int:
    return (score - 10) // 2


def proficiency_bonus(level: int) -> int:
    return 2 + (level - 1) // 4


def xp_threshold(level: int) -> int:
    return XP_THRESHOLDS[level]


def xp_to_next_level(level: int, xp: int) -> int | None:
    if level >= MAX_LEVEL:
        return None
    return max(XP_THRESHOLDS[level + 1] - xp, 0)


def initiative(dexterity_score: int) -> int:
    return ability_modifier(dexterity_score)


def passive_perception(wisdom_score: int, proficient: bool, prof_bonus: int) -> int:
    bonus = prof_bonus if proficient else 0
    return 10 + ability_modifier(wisdom_score) + bonus


def base_armor_class(dexterity_score: int) -> int:
    return 10 + ability_modifier(dexterity_score)


def proficient_modifier(ability_modifier_value: int, proficient: bool, prof_bonus: int) -> int:
    return ability_modifier_value + (prof_bonus if proficient else 0)


def average_hp_gain(hit_die: int, con_modifier: int) -> int:
    return max(hit_die // 2 + 1 + con_modifier, 1)


def rolled_hp_gain(hit_die: int, rolled: int, con_modifier: int) -> int:
    if not 1 <= rolled <= hit_die:
        raise ValueError(f"rolled value must be between 1 and {hit_die}")
    return max(rolled + con_modifier, 1)
