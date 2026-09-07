"""Pure D&D 5e rule calculations. No I/O, no framework dependencies."""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

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

# Content packs spell abilities out in full ("charisma"), while ability_scores
# and the computed block use the three-letter keys. The vocabulary of 5e
# ability names belongs here, next to ABILITIES, rather than in whichever
# service happens to read a pack first.
ABILITY_KEY_BY_FULL_NAME: dict[str, str] = {
    "strength": "str",
    "dexterity": "dex",
    "constitution": "con",
    "intelligence": "int",
    "wisdom": "wis",
    "charisma": "cha",
}


def ability_key(name: str) -> str | None:
    """Normalise an ability written either way to its three-letter key."""
    candidate = name.strip().lower()
    if candidate in ABILITIES:
        return candidate
    return ABILITY_KEY_BY_FULL_NAME.get(candidate)

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


def armor_class(ac_override: int | None, dexterity_score: int) -> int:
    """A hand-entered AC wins over the formula (BR §4.1: the player is the
    source of truth for their own sheet). Both the detail view's `computed`
    block and the dashboard list need this choice, so it lives here rather
    than being spelled out at each call site."""
    if ac_override is not None:
        return ac_override
    return base_armor_class(dexterity_score)


def level_up_available(level: int, xp: int) -> bool:
    if level >= MAX_LEVEL:
        return False
    return xp >= XP_THRESHOLDS[level + 1]


def proficient_modifier(ability_modifier_value: int, proficient: bool, prof_bonus: int) -> int:
    return ability_modifier_value + (prof_bonus if proficient else 0)


def average_hp_gain(hit_die: int, con_modifier: int) -> int:
    return max(hit_die // 2 + 1 + con_modifier, 1)


def rolled_hp_gain(hit_die: int, rolled: int, con_modifier: int) -> int:
    if not 1 <= rolled <= hit_die:
        raise ValueError(f"rolled value must be between 1 and {hit_die}")
    return max(rolled + con_modifier, 1)


# --- Effects (US-13, ARCHITECTURE.md §4.6) ---------------------------------
#
# Item effects and temporary buffs reduce to one atom: a modifier. Everything
# below is pure — the service collects modifiers from equipped inventory and
# from character_effects, hands them over, and files the answer into `computed`.
# No effect is ever written back to a character column; the columns stay the
# base, which is what keeps level-up deltas reversible.

DAMAGE_TYPES: tuple[str, ...] = (
    "slashing",
    "piercing",
    "bludgeoning",
    "fire",
    "cold",
    "lightning",
    "thunder",
    "acid",
    "poison",
    "psychic",
    "necrotic",
    "radiant",
    "force",
)

# `override` is deliberately absent. An earlier draft had both it and `set`,
# but they differed only in which one won — two spellings of "replace the
# base" is a coin flip for whoever writes a content pack. `set` replaces the
# base anywhere; `armor_base` is the one AC-specific spelling, because armour
# is the only case where the replacement has to re-add a capped ability
# modifier on top.
NUMERIC_OPS: frozenset[str] = frozenset({"set", "bonus", "armor_base"})
ROLL_OPS: frozenset[str] = frozenset({"advantage", "disadvantage"})
DAMAGE_OPS: frozenset[str] = frozenset({"resistance", "immunity", "vulnerability"})
EFFECT_OPS: frozenset[str] = NUMERIC_OPS | ROLL_OPS | DAMAGE_OPS

# Ops that carry a number. The rest must not, so a pack that writes
# {"op": "advantage", "value": 2} is reported rather than half-applied.
VALUED_OPS: frozenset[str] = frozenset({"set", "bonus", "armor_base"})

_ABILITY_TARGETS = tuple(f"ability.{ability}" for ability in ABILITIES)
_SAVE_TARGETS = tuple(f"save.{ability}" for ability in ABILITIES)
_SKILL_TARGETS = tuple(f"skill.{skill}" for skill in SKILL_ABILITIES)
_DAMAGE_TARGETS = tuple(f"damage.{damage}" for damage in DAMAGE_TYPES)
_PLAIN_NUMERIC_TARGETS = ("ac", "speed", "initiative", "hp_max", "passive_perception")

# Saves, skills and initiative are both numbers and rolls: a cloak can add +1
# to stealth and a potion can grant advantage on it.
NUMERIC_TARGETS: frozenset[str] = frozenset(
    _ABILITY_TARGETS + _SAVE_TARGETS + _SKILL_TARGETS + _PLAIN_NUMERIC_TARGETS
)
ROLL_TARGETS: frozenset[str] = frozenset(
    _SAVE_TARGETS + _SKILL_TARGETS + ("attack", "death_save", "initiative")
)
DAMAGE_TARGETS: frozenset[str] = frozenset(_DAMAGE_TARGETS)
EFFECT_TARGETS: frozenset[str] = NUMERIC_TARGETS | ROLL_TARGETS | DAMAGE_TARGETS

IGNORE_REASONS: frozenset[str] = frozenset(
    {
        "unknown_target",
        "not_applicable",
        "value_required",
        "value_forbidden",
        "dex_cap_requires_armor_base",
        "overridden_by_higher_base",
        "suppressed_by_stack_group",
        "manual_ac_override",
        "cancelled_by_opposite",
        "superseded_by_immunity",
    }
)

# Lower and upper bound per target, applied after every modifier. None means
# unbounded on that side.
_AC_CLAMP: tuple[int | None, int | None] = (0, None)
_SPEED_CLAMP: tuple[int | None, int | None] = (0, None)
_HP_MAX_CLAMP: tuple[int | None, int | None] = (1, None)
_ABILITY_CLAMP: tuple[int | None, int | None] = (1, 30)


@dataclass(frozen=True, slots=True)
class Modifier:
    """One effect atom, already attributed to its source.

    source_kind/source_id/order exist for the tie-break: two modifiers with
    equal value must resolve the same way regardless of the order the service
    happened to read them in, or `computed` would flicker between requests.
    """

    target: str
    op: str
    value: int | None = None
    dex_cap: int | None = None
    stack_group: str | None = None
    source_kind: str = "item"
    source_id: int = 0
    source_name: str = ""
    order: int = 0


@dataclass(frozen=True, slots=True)
class AppliedModifier:
    modifier: Modifier
    applied: bool
    ignored_reason: str | None = None


@dataclass(frozen=True, slots=True)
class EffectResolution:
    ability_scores: dict[str, int]
    modifiers: dict[str, int]
    ac: int
    speed: int
    hp_max: int
    initiative: int
    passive_perception: int
    saving_throws: dict[str, int]
    skills: dict[str, int]
    advantage: dict[str, str]
    damage: dict[str, str]
    trace: tuple[AppliedModifier, ...]


def is_known_target(target: str) -> bool:
    return target in EFFECT_TARGETS


def modifier_sort_key(modifier: Modifier) -> tuple[str, int, int]:
    return (modifier.source_kind, modifier.source_id, modifier.order)


def modifier_shape_error(modifier: Modifier) -> str | None:
    """Why this modifier can never apply, or None if it is well formed.
    Checked once up front so a malformed entry is reported with a reason
    instead of silently doing nothing."""
    if not is_known_target(modifier.target):
        return "unknown_target"
    if modifier.op not in EFFECT_OPS:
        return "not_applicable"
    if modifier.op in VALUED_OPS and modifier.value is None:
        return "value_required"
    if modifier.op not in VALUED_OPS and modifier.value is not None:
        return "value_forbidden"
    if modifier.dex_cap is not None and modifier.op != "armor_base":
        return "dex_cap_requires_armor_base"
    if modifier.op == "armor_base" and modifier.target != "ac":
        return "not_applicable"
    if modifier.op in NUMERIC_OPS and modifier.target not in NUMERIC_TARGETS:
        return "not_applicable"
    if modifier.op in ROLL_OPS and modifier.target not in ROLL_TARGETS:
        return "not_applicable"
    if modifier.op in DAMAGE_OPS and modifier.target not in DAMAGE_TARGETS:
        return "not_applicable"
    return None


def _clamp(value: int, bounds: tuple[int | None, int | None]) -> int:
    low, high = bounds
    if low is not None:
        value = max(value, low)
    if high is not None:
        value = min(value, high)
    return value


def resolve_numeric(
    base: int,
    modifiers: Sequence[Modifier],
    *,
    dex_modifier: int = 0,
    base_is_manual: bool = False,
    bounds: tuple[int | None, int | None] = (None, None),
) -> tuple[int, list[AppliedModifier]]:
    """Resolve one numeric target.

    Order: worn armour replaces the character's own base; `set` then competes
    with whatever that produced, taking the larger; then bonuses are summed on
    top; then the result is clamped.

    Taking the largest is what makes "your Intelligence becomes 19" behave as
    written — it does nothing to a character who already has 20 — and it makes
    the whole function commutative, so the answer never depends on the order
    the service read the modifiers in. The cost is that a *lowering* effect
    cannot be expressed as `set`; it is written as a negative `bonus`.

    Bonuses survive a `set`: a headband fixing Intelligence at 19 plus a +1
    ring gives 20, not 19.
    """
    trace: list[AppliedModifier] = []
    ordered = sorted(modifiers, key=modifier_sort_key)

    armour_candidates: list[tuple[int, Modifier]] = []
    set_candidates: list[tuple[int, Modifier]] = []
    bonuses: list[Modifier] = []

    for modifier in ordered:
        reason = modifier_shape_error(modifier)
        if reason is not None:
            trace.append(AppliedModifier(modifier, False, reason))
            continue

        if modifier.op == "bonus":
            bonuses.append(modifier)
        elif modifier.op == "set":
            set_candidates.append((modifier.value or 0, modifier))
        elif modifier.op == "armor_base":
            # A negative Dexterity modifier still applies to light and medium
            # armour ("14 + Dex (max 2)" at Dex 8 is 13), so the cap is an
            # upper bound only and must not be clamped at zero. Armour that
            # ignores Dexterity entirely is written as `set`, not as a cap of
            # 0 — a cap of 0 would still let the penalty through.
            applied_dex = dex_modifier
            if modifier.dex_cap is not None:
                applied_dex = min(applied_dex, modifier.dex_cap)
            armour_candidates.append(((modifier.value or 0) + applied_dex, modifier))
        else:
            # A roll or damage op on a target that is also numeric — stealth
            # can take both a +1 and disadvantage. It is not this function's
            # business, and resolve_effects records it with the right verdict;
            # marking it "not_applicable" here would tell the player an
            # effect that IS applied was ignored.
            continue

    if base_is_manual:
        # BR §4.1: a value the player typed in wins over anything an item says.
        # Bonuses still stack on top — the manual entry replaces the
        # derivation, not the arithmetic around it.
        for _, modifier in armour_candidates + set_candidates:
            trace.append(AppliedModifier(modifier, False, "manual_ac_override"))
        value = base
    elif armour_candidates or set_candidates:
        # Worn armour *replaces* the intrinsic calculation rather than
        # competing with it: 5e gives no one the better of "10 + Dex" and
        # their armour, so hide armour on a Dexterity 20 character is AC 14,
        # not 15. `set` still competes on max (see the docstring), so a
        # "your AC is 18" effect beats worse armour but not better.
        floor = (
            max(candidate for candidate, _ in armour_candidates)
            if armour_candidates
            else base
        )
        best = max([floor, *(candidate for candidate, _ in set_candidates)])
        winner_seen = False
        for candidate, modifier in armour_candidates + set_candidates:
            if candidate == best and not winner_seen:
                winner_seen = True
                trace.append(AppliedModifier(modifier, True, None))
            else:
                trace.append(AppliedModifier(modifier, False, "overridden_by_higher_base"))
        value = best
    else:
        value = base

    # Within a stack group only the largest-magnitude bonus counts, so two
    # copies of the same ring do not stack. An empty group always stacks.
    grouped: dict[str, Modifier] = {}
    for modifier in bonuses:
        group = modifier.stack_group
        if not group:
            continue
        current = grouped.get(group)
        if current is None or abs(modifier.value or 0) > abs(current.value or 0):
            grouped[group] = modifier

    for modifier in bonuses:
        group = modifier.stack_group
        if group and grouped.get(group) is not modifier:
            trace.append(AppliedModifier(modifier, False, "suppressed_by_stack_group"))
            continue
        value += modifier.value or 0
        trace.append(AppliedModifier(modifier, True, None))

    return _clamp(value, bounds), trace


def resolve_roll_state(modifiers: Sequence[Modifier]) -> str:
    """PHB: advantage and disadvantage cancel out no matter how many of each
    are present, and duplicates never compound."""
    has_advantage = False
    has_disadvantage = False
    for modifier in modifiers:
        if modifier_shape_error(modifier) is not None:
            continue
        if modifier.op == "advantage":
            has_advantage = True
        elif modifier.op == "disadvantage":
            has_disadvantage = True
    if has_advantage == has_disadvantage:
        return "normal"
    return "advantage" if has_advantage else "disadvantage"


def resolve_damage_state(modifiers: Sequence[Modifier]) -> str | None:
    """Immunity beats everything; resistance and vulnerability cancel each
    other; duplicates do not compound (5e has no double resistance)."""
    kinds = {
        modifier.op
        for modifier in modifiers
        if modifier_shape_error(modifier) is None and modifier.op in DAMAGE_OPS
    }
    if "immunity" in kinds:
        return "immunity"
    has_resistance = "resistance" in kinds
    has_vulnerability = "vulnerability" in kinds
    if has_resistance and has_vulnerability:
        return None
    if has_resistance:
        return "resistance"
    if has_vulnerability:
        return "vulnerability"
    return None


def _by_target(modifiers: Sequence[Modifier]) -> dict[str, list[Modifier]]:
    buckets: dict[str, list[Modifier]] = {}
    for modifier in modifiers:
        buckets.setdefault(modifier.target, []).append(modifier)
    return buckets


def effective_ability_scores(
    base: Mapping[str, int], modifiers: Sequence[Modifier]
) -> tuple[dict[str, int], list[AppliedModifier]]:
    buckets = _by_target(modifiers)
    scores: dict[str, int] = {}
    trace: list[AppliedModifier] = []
    for ability in ABILITIES:
        value, applied = resolve_numeric(
            base.get(ability, 10),
            buckets.get(f"ability.{ability}", []),
            bounds=_ABILITY_CLAMP,
        )
        scores[ability] = value
        trace.extend(applied)
    return scores, trace


def resolve_effects(
    *,
    ability_scores: Mapping[str, int],
    level: int,
    speed: int,
    hp_max: int,
    ac_override: int | None,
    proficiencies: Mapping[str, Any],
    modifiers: Sequence[Modifier],
) -> EffectResolution:
    """Full `computed` recalculation with effects applied.

    Abilities resolve first: every number downstream reads the modifiers
    derived from them, so a ring that raises Dexterity has to move AC,
    initiative, the Dexterity save and every Dexterity skill with it.
    """
    trace: list[AppliedModifier] = []
    buckets = _by_target(modifiers)

    scores, ability_trace = effective_ability_scores(ability_scores, modifiers)
    trace.extend(ability_trace)
    ability_mods = {ability: ability_modifier(score) for ability, score in scores.items()}
    dex_modifier = ability_mods.get("dex", 0)
    prof_bonus = proficiency_bonus(level)

    proficient_skills = set(proficiencies.get("skills") or [])
    proficient_saves = set(proficiencies.get("saves") or [])

    ac, ac_trace = resolve_numeric(
        ac_override if ac_override is not None else base_armor_class(scores.get("dex", 10)),
        buckets.get("ac", []),
        dex_modifier=dex_modifier,
        base_is_manual=ac_override is not None,
        bounds=_AC_CLAMP,
    )
    trace.extend(ac_trace)

    resolved_speed, speed_trace = resolve_numeric(
        speed, buckets.get("speed", []), bounds=_SPEED_CLAMP
    )
    trace.extend(speed_trace)

    resolved_hp_max, hp_trace = resolve_numeric(
        hp_max, buckets.get("hp_max", []), bounds=_HP_MAX_CLAMP
    )
    trace.extend(hp_trace)

    resolved_initiative, initiative_trace = resolve_numeric(
        dex_modifier, buckets.get("initiative", [])
    )
    trace.extend(initiative_trace)

    saving_throws: dict[str, int] = {}
    for ability in ABILITIES:
        value, applied = resolve_numeric(
            proficient_modifier(
                ability_mods.get(ability, 0), ability in proficient_saves, prof_bonus
            ),
            buckets.get(f"save.{ability}", []),
        )
        saving_throws[ability] = value
        trace.extend(applied)

    skills: dict[str, int] = {}
    for skill, ability in SKILL_ABILITIES.items():
        value, applied = resolve_numeric(
            proficient_modifier(
                ability_mods.get(ability, 0), skill in proficient_skills, prof_bonus
            ),
            buckets.get(f"skill.{skill}", []),
        )
        skills[skill] = value
        trace.extend(applied)

    advantage: dict[str, str] = {}
    for target in sorted(ROLL_TARGETS):
        entries = [m for m in buckets.get(target, []) if m.op in ROLL_OPS]
        state = resolve_roll_state(entries)
        if state != "normal":
            advantage[target] = state
        # Record the verdict per modifier: whoever matches the resolved state
        # applied, the rest were cancelled by their opposite.
        for modifier in sorted(entries, key=modifier_sort_key):
            reason = modifier_shape_error(modifier)
            if reason is not None:
                trace.append(AppliedModifier(modifier, False, reason))
            elif modifier.op == state:
                trace.append(AppliedModifier(modifier, True, None))
            else:
                trace.append(AppliedModifier(modifier, False, "cancelled_by_opposite"))

    damage: dict[str, str] = {}
    for target in sorted(DAMAGE_TARGETS):
        entries = buckets.get(target, [])
        state = resolve_damage_state(entries)
        if state is not None:
            damage[target] = state
        for modifier in sorted(entries, key=modifier_sort_key):
            reason = modifier_shape_error(modifier)
            if reason is not None:
                trace.append(AppliedModifier(modifier, False, reason))
            elif modifier.op == state:
                trace.append(AppliedModifier(modifier, True, None))
            elif state == "immunity":
                trace.append(AppliedModifier(modifier, False, "superseded_by_immunity"))
            else:
                trace.append(AppliedModifier(modifier, False, "cancelled_by_opposite"))

    # Passive perception is 10 + the Perception *check* modifier, so it is
    # built from the already-resolved skill: a cloak granting +2 to Perception
    # has to move this number too. Advantage on the check is worth +5 and
    # disadvantage -5 (PHB), and only then do modifiers aimed straight at
    # passive_perception apply.
    perception_state = advantage.get("skill.perception", "normal")
    perception_shift = {"advantage": 5, "disadvantage": -5}.get(perception_state, 0)
    resolved_passive, passive_trace = resolve_numeric(
        10 + skills["perception"] + perception_shift,
        buckets.get("passive_perception", []),
    )
    trace.extend(passive_trace)

    for target, entries in buckets.items():
        if not is_known_target(target):
            trace.extend(AppliedModifier(m, False, "unknown_target") for m in entries)

    return EffectResolution(
        ability_scores=scores,
        modifiers=ability_mods,
        ac=ac,
        speed=resolved_speed,
        hp_max=resolved_hp_max,
        initiative=resolved_initiative,
        passive_perception=resolved_passive,
        saving_throws=saving_throws,
        skills=skills,
        advantage=advantage,
        damage=damage,
        trace=tuple(trace),
    )


def hit_dice_total(level: int) -> int:
    """A character has one hit die per level, so the sheet's "total" box is
    just the level. Named anyway: the sheet should read a rule, not restate
    one, and multiclassing (out of scope) would change it here."""
    return level


def spell_save_dc(prof_bonus: int, ability_modifier_value: int) -> int:
    """PHB: 8 + proficiency bonus + spellcasting ability modifier."""
    return 8 + prof_bonus + ability_modifier_value


def spell_attack_bonus(prof_bonus: int, ability_modifier_value: int) -> int:
    """PHB: proficiency bonus + spellcasting ability modifier."""
    return prof_bonus + ability_modifier_value
